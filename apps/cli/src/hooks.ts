import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Canonical hook event names (camelCase) that map to Pi lifecycle events.
 *
 * Pi extensions subscribe via `pi.on(eventName, handler)`. The `@vahor/pi-hooks`
 * package exposes a declarative `.pi/hooks.json` that accepts snake_case event
 * names corresponding to Pi's lifecycle events.
 *
 * Source: https://pi.dev/packages/@vahor/pi-hooks (v0.0.11, 2026-05-23)
 *         https://pt-act-pi-mono.mintlify.app/api/coding-agent/hooks
 */
export const CANONICAL_HOOK_EVENTS: Partial<Record<string, string>> = {
    sessionStart: 'session_start',
    sessionEnd: 'session_shutdown',
    preToolUse: 'tool_call',
    postToolUse: 'tool_result',
    stop: 'agent_end',
    preCompact: 'session_before_compact',
};

/** Canonical event names that map to the `hooks/pre/` directory (vs `hooks/post/`). */
export const CANONICAL_PRE_TOOL_EVENTS: Record<string, true> = {
    preToolUse: true,
    sessionStart: true,
    preCompact: true,
};

/** OMP events whose handler can return `{ block: true, reason }` to prevent execution. */
export const BLOCKABLE_OMP_EVENTS: Record<string, true> = {
    tool_call: true,
};

/** One flattened hook entry emitted by {@link flattenCanonicalHookEntries}. */
export interface FlattenedCanonicalHookEntry {
    /** Matcher string (`*` when absent). Preserved for downstream regex synthesis. */
    matcher: string;
    type?: string;
    command?: string;
    timeout?: number;
}

/**
 * Walk canonical hook definitions and yield a flat stream, resolving the two on-disk
 * shapes (matcher-wrapped `hooks[]` vs flat `type/command`). This is the single source
 * of truth for nested-vs-flat handling used by Pi conversion, OMP conversion, and
 * Hermes merge deduplication.
 */
export function* flattenCanonicalHookEntries(
    definitions: CanonicalHookDefinition[],
): Generator<FlattenedCanonicalHookEntry> {
    for (const def of definitions) {
        const matcher = def.matcher ?? '*';
        const entries = Array.isArray(def.hooks) && def.hooks.length > 0 ? def.hooks : [def];
        for (const entry of entries) {
            yield { matcher, type: entry.type, command: entry.command, timeout: entry.timeout };
        }
    }
}

interface CanonicalHookEntry {
    type?: string;
    command?: string;
    timeout?: number;
    [k: string]: unknown;
}
interface CanonicalHookDefinition {
    matcher?: string;
    hooks?: CanonicalHookEntry[];
    type?: string;
    command?: string;
    timeout?: number;
    [k: string]: unknown;
}

interface CanonicalHooksConfig {
    version?: number;
    /**
     * Floor CLI version for these hooks. `superskill install` compares this against the installed
     * CLI version and, if the CLI is older, warns and skips hook emission entirely (skills/commands
     * still install) rather than emitting hooks that call a `superskill hook run <id>` the old CLI
     * treats as unknown. Semver-ish: missing/invalid = no floor; prerelease tags compared as-is.
     */
    minCliVersion?: string;
    hooks?: Record<string, CanonicalHookDefinition[]>;
}

type PiHookEntry = string | { command: string; timeout?: number };

/**
 * Convert rulesync-canonical hooks to `@vahor/pi-hooks` format.
 *
 * Canonical format: camelCase event names with `{ type, command, matcher }` entries.
 * `@vahor/pi-hooks` format: snake_case event names with string commands or
 * `{ command, timeout }` objects.
 *
 * Limitation: `@vahor/pi-hooks` fires `tool_call`/`tool_result` for all tools without
 * matcher filtering. Matchers are dropped; full matcher enforcement requires
 * `@hsingjui/pi-hooks` or a superskill-shipped extension (design §1.2, rung b).
 */
export function convertCanonicalToPiHooks(config: CanonicalHooksConfig): Record<string, PiHookEntry[]> {
    const piHooks: Record<string, PiHookEntry[]> = {};
    for (const [rawEvent, definitions] of Object.entries(config.hooks ?? {})) {
        const canonicalEvent = rawEvent.charAt(0).toLowerCase() + rawEvent.slice(1);
        const targetEvent = CANONICAL_HOOK_EVENTS[canonicalEvent];
        if (!targetEvent) continue;
        for (const { type, command, timeout } of flattenCanonicalHookEntries(definitions)) {
            if ((type && type !== 'command') || !command) continue;
            const entry: PiHookEntry = timeout ? { command, timeout } : command;
            if (!piHooks[targetEvent]) piHooks[targetEvent] = [];
            piHooks[targetEvent].push(entry);
        }
    }
    return piHooks;
}

/**
 * Read the canonical `hooks.json` from the given `.rulesync` directory.
 * Returns `null` when the file is absent or unparseable.
 *
 * @param rulesyncDir - Path to the `.rulesync` directory (the one containing `hooks.json`)
 */
export function readCanonicalHooks(rulesyncDir: string): CanonicalHooksConfig | null {
    const hooksPath = join(rulesyncDir, 'hooks.json');
    if (!existsSync(hooksPath)) return null;
    try {
        return JSON.parse(readFileSync(hooksPath, 'utf-8')) as CanonicalHooksConfig;
    } catch {
        return null;
    }
}

/** Options controlling how {@link emitPiStyleHooks} and {@link emitHermesHooks} write hooks. */
export interface EmitHooksOptions {
    dryRun: boolean;
    global: boolean;
}

/** Outcome of an emit operation — what was written (or would be, in dry-run). */
export interface EmitHooksResult {
    target: string;
    emitted: boolean;
    count: number;
    message: string;
    /** Path where hooks were written (or would be in dry-run). */
    path?: string;
}

/**
 * Merge new Pi-style hooks into an existing hooks.json.
 *
 * Installing multiple plugins must accumulate hooks per event, not overwrite.
 * Entries are deduplicated by command string so re-installing the same plugin
 * is idempotent (no duplicate entries). Existing entries are preserved; new
 * entries with a novel command are appended to each event array.
 *
 * Returns the merged `{ event: PiHookEntry[] }` map ready to write back.
 */
function mergePiHooks(hooksPath: string, newHooks: Record<string, PiHookEntry[]>): Record<string, PiHookEntry[]> {
    let existing: Record<string, PiHookEntry[]> = {};
    if (existsSync(hooksPath)) {
        try {
            const raw = JSON.parse(readFileSync(hooksPath, 'utf-8'));
            if (raw && typeof raw.hooks === 'object' && raw.hooks !== null) {
                existing = raw.hooks as Record<string, PiHookEntry[]>;
            }
        } catch {
            // Corrupt or unparseable hooks.json — start fresh rather than crash.
            existing = {};
        }
    }

    const commandOf = (entry: PiHookEntry): string => (typeof entry === 'string' ? entry : entry.command);

    const merged: Record<string, PiHookEntry[]> = {};
    const allEvents = new Set([...Object.keys(existing), ...Object.keys(newHooks)]);
    for (const event of allEvents) {
        const ex = existing[event] ?? [];
        const nx = newHooks[event] ?? [];
        const seen = new Set<string>();
        const acc: PiHookEntry[] = [];
        for (const entry of [...ex, ...nx]) {
            const cmd = commandOf(entry);
            if (seen.has(cmd)) continue;
            seen.add(cmd);
            acc.push(entry);
        }
        if (acc.length > 0) merged[event] = acc;
    }
    return merged;
}

/**
 * Emit hooks for Pi or omp (both use the `@vahor/pi-hooks` format).
 *
 * Rung (b): superskill emits the config; `@vahor/pi-hooks` (installed by the user)
 * is the shim that reads it. The install output documents this dependency.
 *
 * @param rulesyncDir - Path to the `.rulesync` directory (containing `hooks.json`)
 * @param outputRoot - The output root (project dir or homedir)
 * @param targetDir  - The target's config directory (`.pi` or `.omp`)
 * @param targetName - Human-readable target name for messages
 */
export function emitPiStyleHooks(
    rulesyncDir: string,
    outputRoot: string,
    targetDir: string,
    targetName: string,
    options: EmitHooksOptions,
): EmitHooksResult {
    const config = readCanonicalHooks(rulesyncDir);
    if (!config?.hooks) {
        return {
            target: targetName,
            emitted: false,
            count: 0,
            message: `${targetName}: no hooks in plugin`,
        };
    }

    const piHooks = convertCanonicalToPiHooks(config);
    const hookCount = Object.values(piHooks).reduce((sum, cmds) => sum + cmds.length, 0);

    if (hookCount === 0) {
        return {
            target: targetName,
            emitted: false,
            count: 0,
            message: `${targetName}: no mappable hooks (events not supported by Pi lifecycle)`,
        };
    }

    // Project: <outputRoot>/<targetDir>/hooks.json
    // Global:  <outputRoot>/<targetDir>/agent/hooks.json (matches Pi's layout)
    const hooksDir = options.global ? join(outputRoot, targetDir, 'agent') : join(outputRoot, targetDir);
    const hooksPath = join(hooksDir, 'hooks.json');

    if (!options.dryRun) {
        mkdirSync(hooksDir, { recursive: true });
        const merged = mergePiHooks(hooksPath, piHooks);
        writeFileSync(hooksPath, `${JSON.stringify({ hooks: merged }, null, 2)}\n`);
    }

    return {
        target: targetName,
        emitted: true,
        count: hookCount,
        path: hooksPath,
        message: `${targetName}: ${hookCount} hook(s) emitted (rung b — @vahor/pi-hooks config; install with: pi install npm:@vahor/pi-hooks)`,
    };
}

/**
 * Merge new canonical hooks into an existing `.hermes/hooks.json`.
 *
 * Same problem as {@link mergePiHooks}: installing sp after cc must not drop
 * cc's hooks. Canonical entries are deduplicated by the (matcher, command)
 * pair so re-installing the same plugin is idempotent.
 */
function mergeCanonicalHooks(hooksPath: string, newConfig: CanonicalHooksConfig): CanonicalHooksConfig {
    let existingHooks: Record<string, CanonicalHookDefinition[]> = {};
    if (existsSync(hooksPath)) {
        try {
            const raw = JSON.parse(readFileSync(hooksPath, 'utf-8'));
            if (raw && typeof raw.hooks === 'object' && raw.hooks !== null) {
                existingHooks = raw.hooks as Record<string, CanonicalHookDefinition[]>;
            }
        } catch {
            existingHooks = {};
        }
    }

    const signatureOf = (def: CanonicalHookDefinition): string => {
        const entries = [...flattenCanonicalHookEntries([def])].map(
            ({ type, command, timeout }) => `${type ?? ''}:${command ?? ''}:${timeout ?? ''}`,
        );
        return `${def.matcher ?? '*'}|${entries.sort().join('||')}`;
    };

    const merged: CanonicalHooksConfig['hooks'] = {};
    const allEvents = new Set([...Object.keys(existingHooks), ...Object.keys(newConfig.hooks ?? {})]);
    for (const event of allEvents) {
        const ex = existingHooks[event] ?? [];
        const nx = newConfig.hooks?.[event] ?? [];
        const seen = new Set<string>();
        const acc: CanonicalHookDefinition[] = [];
        for (const def of [...ex, ...nx]) {
            const sig = signatureOf(def);
            if (seen.has(sig)) continue;
            seen.add(sig);
            acc.push(def);
        }
        if (acc.length > 0) merged[event] = acc;
    }
    return { hooks: merged };
}

/**
 * Emit hooks for hermes by merging into the canonical hooks.json.
 *
 * Rung (c): copy-step (now merge-step). Hermes uses opencode as a surrogate;
 * the canonical hooks.json is merged into `.hermes/hooks.json` (project) or
 * `~/.hermes/hooks.json` (global) so multiple plugins accumulate rather than
 * overwrite.
 */
export function emitHermesHooks(rulesyncDir: string, outputRoot: string, options: EmitHooksOptions): EmitHooksResult {
    const config = readCanonicalHooks(rulesyncDir);
    if (!config?.hooks) {
        return {
            target: 'hermes',
            emitted: false,
            count: 0,
            message: 'hermes: no hooks in plugin',
        };
    }

    const hookCount = Object.values(config.hooks).reduce((sum, defs) => sum + defs.length, 0);
    if (hookCount === 0) {
        return {
            target: 'hermes',
            emitted: false,
            count: 0,
            message: 'hermes: no hooks to install',
        };
    }

    const hooksDir = join(outputRoot, '.hermes');
    const hooksPath = join(hooksDir, 'hooks.json');

    if (!options.dryRun) {
        mkdirSync(hooksDir, { recursive: true });
        const merged = mergeCanonicalHooks(hooksPath, config);
        writeFileSync(hooksPath, `${JSON.stringify(merged, null, 2)}\n`);
    }

    return {
        target: 'hermes',
        emitted: true,
        count: hookCount,
        path: hooksPath,
        message: `hermes: ${hookCount} hook(s) merged (rung c — copy-step)`,
    };
}

export type { CanonicalHookDefinition, CanonicalHooksConfig, PiHookEntry };
