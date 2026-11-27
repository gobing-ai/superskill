/**
 * dsh MCP loader patch (feature B811, task 1470; ADR-036 install-only target).
 *
 * dsh configures MCP in the profile patch layer, not in a project file: the headless profile's
 * `cordis.patch.yml` is a top-level YAML array of loader entries, and an MCP server is one
 * `@deepseek-ai/dsh-mcp-client` entry whose `config.serverName` names it (dsh-mcp-client 0.2.2-rc.1
 * README). Spur only READS that patch (`agent-mcp-readiness.ts`); writing it is this target's job,
 * because the install boundary says Superskill owns installs.
 *
 * Two invariants make the write safe to repeat:
 *
 * - **Ownership is `(name, config.serverName)`.** An owned item is replaced in place; every foreign
 *   loader, and every other server name, keeps its content and its position.
 * - **No secret value is ever written.** Each `envVars` name becomes `!!js process.env.<NAME>`, so the
 *   loader forwards the operator's own value at load time. That reference is required, not cosmetic:
 *   dsh-mcp-client scrubs ambient names matching `/KEY|PASSWORD|SECRET|TOKEN/i`, so a plain name would
 *   never reach `spur mcp`.
 *
 * The YAML is edited through `parseDocument` (never `parse`/`stringify` on a plain object) so operator
 * comments and unrelated formatting survive the merge.
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Document, isMap, isSeq, parseDocument, Scalar, type YAMLMap, type YAMLSeq } from 'yaml';
import type { PostInstallAction, PostInstallResult, TransactionalWrite } from './post-install';

/** The dsh loader package name (dsh-mcp-client README, minimal configuration). */
export const DSH_MCP_LOADER = '@deepseek-ai/dsh-mcp-client';

/** One MCP server to publish into the dsh loader patch. */
export interface DshMcpServer {
    /** `serverName` inside dsh: the `mcpServers` key of the plugin's `mcp.json`. */
    name: string;
    /** Stdio command; absent for an `http` server. */
    command?: string;
    args?: readonly string[];
    /** Streamable HTTP endpoint, for a server declared by URL instead of a command. */
    url?: string;
    /** Environment variable NAMES forwarded as `!!js process.env.<NAME>` references. */
    envVars?: readonly string[];
}

/**
 * Translate a plugin `mcp.json` (`{ mcpServers: { <name>: { command, args, envVars } | { url } } }`)
 * into the servers this target publishes. An entry with neither a command nor a URL is refused
 * loudly: silently dropping a declared server would leave the operator with a half-wired dsh.
 */
export function dshServersFromMcpJson(json: unknown): DshMcpServer[] {
    const servers: DshMcpServer[] = [];
    if (json === null || typeof json !== 'object') return servers;
    const declared = (json as { mcpServers?: unknown }).mcpServers;
    if (declared === null || typeof declared !== 'object') return servers;
    for (const [name, raw] of Object.entries(declared as Record<string, unknown>)) {
        if (raw === null || typeof raw !== 'object') continue;
        const entry = raw as { command?: unknown; args?: unknown; url?: unknown; envVars?: unknown };
        const envVars = Array.isArray(entry.envVars)
            ? entry.envVars.filter((value): value is string => typeof value === 'string')
            : [];
        const args = Array.isArray(entry.args)
            ? entry.args.filter((value): value is string => typeof value === 'string')
            : [];
        if (typeof entry.command === 'string' && entry.command !== '') {
            servers.push({ name, command: entry.command, args, envVars });
            continue;
        }
        if (typeof entry.url === 'string' && entry.url !== '') {
            servers.push({ name, url: entry.url, envVars });
            continue;
        }
        throw new Error(`mcp.json server '${name}' declares neither a command nor a url — cannot publish it to dsh`);
    }
    return servers;
}

/** Absolute path of the headless profile's loader patch under one HOME. */
export function dshPatchPath(home: string): string {
    return join(home, '.dsh', 'profiles', 'headless', 'cordis.patch.yml');
}

/** The planned patch: the file's new content, the servers it names, and whether it moved. */
export interface DshMcpPatchPlan {
    content: string;
    servers: string[];
    diff: string[];
    /** False when an identical reinstall produced byte-identical content (nothing to write). */
    changed: boolean;
}

/** One owned entry: the loader name plus the server name is the merge key. */
function isOwnedLoader(entry: unknown, serverName: string): entry is YAMLMap {
    if (!isMap(entry)) return false;
    if (entry.get('name') !== DSH_MCP_LOADER) return false;
    const config = entry.get('config', true);
    return isMap(config) && config.get('serverName') === serverName;
}

/** Build one loader entry node from the server declaration, `!!js` references included. */
function loaderEntry(server: DshMcpServer): YAMLMap {
    const envVars = server.envVars ?? [];
    const transport = server.url === undefined ? 'stdio' : 'streamable-http';
    const lines = [
        `- name: ${JSON.stringify(DSH_MCP_LOADER)}`,
        '  config:',
        `    serverName: ${JSON.stringify(server.name)}`,
        `    transport: ${transport}`,
        ...(server.url === undefined
            ? [
                  `    command: ${JSON.stringify(server.command ?? '')}`,
                  `    args: [${(server.args ?? []).map((arg) => JSON.stringify(arg)).join(', ')}]`,
              ]
            : [`    url: ${JSON.stringify(server.url)}`]),
    ];
    if (envVars.length > 0) lines.push('    env: {}');
    const parsed = parseDocument(`${lines.join('\n')}\n`);
    if (parsed.errors.length > 0) {
        throw new Error(`dsh loader entry for '${server.name}' could not be built: ${parsed.errors[0]?.message ?? ''}`);
    }
    const entry = (parsed.contents as YAMLSeq).items[0] as YAMLMap;
    const config = entry.get('config', true);
    if (envVars.length > 0 && isMap(config)) {
        const env = config.get('env', true);
        if (isMap(env)) {
            env.flow = false;
            for (const name of envVars) {
                if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
                    throw new Error(`dsh loader entry for '${server.name}' has an invalid environment variable name`);
                }
                const reference = new Scalar(`process.env.${name}`);
                reference.tag = '!!js';
                env.set(name, reference);
            }
        }
    }
    return entry;
}

/** Structural equality of two loader entries, via each node's own YAML text. */
function sameEntry(left: unknown, right: unknown): boolean {
    return String(left) === String(right);
}

/**
 * Merge the servers into the existing patch text.
 *
 * `existing: null` means the file does not exist yet. Any other text must parse, and its root must be
 * a sequence: a patch this function cannot understand is an error, never a file to overwrite.
 */
export function planDshMcpPatch(input: {
    existing: string | null;
    servers: readonly DshMcpServer[];
    /** Reported in messages only; the caller owns the real path. */
    path?: string;
}): DshMcpPatchPlan {
    const where = input.path ?? 'cordis.patch.yml';
    const doc = parseDocument(input.existing ?? '');
    const error = doc.errors[0];
    if (error !== undefined) {
        const line = error.linePos?.[0]?.line;
        const location = line === undefined ? '' : ` at line ${line}`;
        throw new Error(
            `${where} is not readable YAML (${error.code}${location}) — fix it or delete it, then reinstall`,
        );
    }
    let entries: YAMLSeq;
    if (doc.contents === null) {
        entries = doc.createNode([]) as YAMLSeq;
        doc.contents = entries as never;
    } else if (isSeq(doc.contents)) {
        entries = doc.contents;
    } else {
        throw new Error(`${where} must be a top-level YAML array of loader entries — refusing to rewrite it`);
    }

    const servers: string[] = [];
    const diff: string[] = [];
    for (const server of input.servers) {
        servers.push(server.name);
        const desired = loaderEntry(server);
        const index = entries.items.findIndex((entry) => isOwnedLoader(entry, server.name));
        if (index !== -1 && sameEntry(entries.items[index], desired)) continue;
        if (index === -1) entries.items.push(desired);
        else {
            entries.items[index] = desired;
            // Existing entries may contain literal credentials. Only show the replacement.
            diff.push(`- ${DSH_MCP_LOADER} serverName ${server.name} (existing entry omitted)`);
        }
        diff.push(
            ...new Document([desired])
                .toString()
                .trimEnd()
                .split('\n')
                .map((line) => `+ ${line}`),
        );
    }

    const content = diff.length === 0 ? (input.existing ?? '') : String(doc);
    return { content, servers, diff, changed: diff.length > 0 };
}

/** Everything the action needs: where HOME is, what to publish, and the transaction writer. */
export interface DshMcpPatchActionArgs {
    /** The operator's HOME (dsh reads `~/.dsh`, so the patch follows it, not the install root). */
    home: string;
    servers: readonly DshMcpServer[];
    /** Transaction-scoped writer, so the patch shares the install's rollback boundary. */
    writeTransactional: TransactionalWrite;
}

/** The post-install action: preview names the file and the diff; apply writes through the transaction. */
export function createDshMcpPatchAction(args: DshMcpPatchActionArgs): PostInstallAction {
    const path = dshPatchPath(args.home);
    const plan = (): DshMcpPatchPlan => {
        const existing = existsSync(path) ? readFileSync(path, 'utf8') : null;
        return planDshMcpPatch({ existing, servers: args.servers, path });
    };
    return {
        id: 'dsh-mcp-patch',
        preview(): PostInstallResult {
            const planned = plan();
            const lines = [
                `dsh (dry-run): ${planned.changed ? 'write' : 'unchanged'} ${path}`,
                ...planned.servers.map((server) => `dsh (dry-run): ${DSH_MCP_LOADER} serverName ${server}`),
            ];
            lines.push(...planned.diff);
            return { writtenFiles: [], messages: lines };
        },
        async apply(): Promise<PostInstallResult> {
            const planned = plan();
            if (planned.changed) {
                // R2: the headless profile directory may not exist yet on a fresh dsh host.
                mkdirSync(dirname(path), { recursive: true });
                await args.writeTransactional(path, planned.content);
            }
            return {
                writtenFiles: planned.changed ? [path] : [],
                messages: [
                    planned.changed ? `dsh: wrote ${path}` : `dsh: ${path} already up to date`,
                    ...planned.servers.map((server) => `dsh: ${DSH_MCP_LOADER} serverName ${server}`),
                ],
            };
        },
    };
}
