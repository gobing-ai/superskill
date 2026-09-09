/**
 * Grok Bot install target (task 0128 / ADR-036).
 *
 * `grok-bot` is install-only: it publishes a flat skill catalog into Grok Bot's
 * Sand data root (`workflows/<id>/SKILL.md`) and joins no execution dialect,
 * rulesync transform, or default target expansion. Materialization is either
 * `bridge` (canonical copy under `<sandRoot>/.superskill/grok-bot/skills/` plus
 * a thin pointer workflow) or `full` (everything under `workflows/<id>/`).
 * Ownership is marker-based (`.superskill-origin.json`): a directory prefix
 * never grants ownership, and foreign or malformed markers fail replacement
 * instead of being overwritten.
 */

import { createHash } from 'node:crypto';
import {
    accessSync,
    existsSync,
    constants as fsConstants,
    lstatSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    realpathSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { FrontmatterError, parseFrontmatter } from '../content/frontmatter';
import { assertSafePathSegment } from '../content/identity';
import { FilesystemTransaction } from '../skills-ecosystem/installer';
import { type InstallSnapshot, snapshotFiles } from './install-manifest.js';

/** Bot materialization mode: bridge (canonical + thin pointer) or full (in place). */
export type GrokBotMaterialize = 'bridge' | 'full';

/** Target id constant — kept in sync with `INSTALL_TARGETS` in targets.ts. */
export const GROK_BOT_TARGET = 'grok-bot';

/** Marker file written into every superskill-owned workflow directory. */
export const BOT_ORIGIN_MARKER = '.superskill-origin.json';

/** Env var consulted first when resolving Grok Bot's Sand data root. */
export const BOT_SAND_DATA_ENV = 'SAND_DATA';

/** Schema version of the per-workflow ownership marker. */
export const BOT_MARKER_SCHEMA_VERSION = 1;

/** Preflight failure: the target path is unmarked, foreign-owned, or malformed; install refuses to overwrite. */
export class GrokBotPreflightError extends Error {}

/** Source locator recorded in markers and manifests. */
export interface GrokBotSource {
    channel: 'bundled' | 'marketplace';
    locator: string;
}

/** Per-workflow ownership marker (`.superskill-origin.json`) gating overwrite decisions. */
export interface GrokBotOriginMarker {
    schemaVersion: 1;
    target: 'grok-bot';
    plugin: string;
    source: GrokBotSource;
    mode: GrokBotMaterialize;
    /** Absolute canonical SKILL.md path (bridge) or null (full materialization). */
    canonicalPath: string | null;
    superskillVersion: string;
    installedAt: string;
    /** Basename → SHA-256 over the owned skill files (marker excluded). */
    hashes: Record<string, string>;
}

/** Result of resolving the Sand data root for this host. */
export interface SandRootResolution {
    dataRoot: string;
    workflowsDir: string;
    source: 'env' | 'sand-data' | 'agent-data';
    /** True when `dataRoot` is missing but its nearest existing ancestor is writable. */
    creatable: boolean;
}

/** Inputs for resolving Grok Bot's Sand data root. */
export interface ResolveSandRootOptions {
    /** `SAND_DATA` value; empty/undefined falls through to home-alias detection. */
    sandData?: string;
    homeDir: string;
    /**
     * When true (install path), an explicitly-configured missing root may be
     * created and is reported via `creatable`; false (doctor default detection)
     * never creates anything.
     */
    createMissing?: boolean;
}

function isRemoteLookingPath(value: string): 'url' | 'ssh' | null {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return 'url';
    // scp-style `user@host:path` — a colon appears before any slash.
    const slash = value.indexOf('/');
    const colon = value.indexOf(':');
    if (colon !== -1 && (slash === -1 || colon < slash)) return 'ssh';
    return null;
}

function nearestExistingAncestor(dir: string): string {
    let current = resolve(dir);
    for (;;) {
        const parent = resolve(current, '..');
        if (parent === current) return current;
        if (existsSync(current)) return current;
        current = parent;
    }
}

function assertRealDir(path: string, label: string): string {
    // Resolve host-global symlinks (e.g. /home/box/sand-data → /mnt/volume) so
    // markers and receipts reference one stable location per root.
    let real: string;
    try {
        real = realpathSync(path);
    } catch (error) {
        // Dangling symlink: the link exists but its target is missing.
        throw new GrokBotPreflightError(`${label} '${path}' is a broken symlink: ${String(error)}`);
    }
    if (!statSync(real).isDirectory()) {
        throw new GrokBotPreflightError(`${label} '${path}' is not a directory`);
    }
    return real;
}

function assertCreatable(dir: string): void {
    const ancestor = nearestExistingAncestor(dir);
    try {
        accessSync(ancestor, fsConstants.W_OK | fsConstants.X_OK);
    } catch {
        throw new GrokBotPreflightError(
            `Sand root '${dir}' does not exist and its nearest existing ancestor '${ancestor}' is not writable`,
        );
    }
}

function isDanglingLink(path: string): boolean {
    try {
        return lstatSync(path).isSymbolicLink() && !existsSync(path);
    } catch {
        return false;
    }
}

/**
 * Resolve the Sand data root (R2). `SAND_DATA` wins when set and non-blank; a
 * set-but-blank value is a supplied invalid value and fails instead of falling
 * back. Home-alias fallbacks are accepted only when they already exist —
 * detection never creates `<home>/sand-data` or `<home>/agent-data`.
 */
export function resolveSandRoot(options: ResolveSandRootOptions): SandRootResolution {
    const createMissing = options.createMissing ?? false;
    const raw = options.sandData;
    if (raw !== undefined && raw.trim().length === 0) {
        throw new GrokBotPreflightError(
            `${BOT_SAND_DATA_ENV} is set but blank — set it to an absolute host-accessible path`,
        );
    }
    if (raw !== undefined && raw.trim().length > 0) {
        const value = raw.trim();
        const remote = isRemoteLookingPath(value);
        if (remote === 'url') {
            throw new GrokBotPreflightError(
                `${BOT_SAND_DATA_ENV} '${value}' is a URL — superskill must run on the Grok Bot host or ` +
                    `${BOT_SAND_DATA_ENV} must name an absolute host-accessible path`,
            );
        }
        if (remote === 'ssh') {
            throw new GrokBotPreflightError(
                `${BOT_SAND_DATA_ENV} '${value}' looks like a remote host locator — superskill must run on the ` +
                    `Grok Bot host or ${BOT_SAND_DATA_ENV} must name an absolute host-accessible path`,
            );
        }
        if (!isAbsolute(value)) {
            throw new GrokBotPreflightError(
                `${BOT_SAND_DATA_ENV} must be an absolute host path, got '${value}' — run on the Grok Bot host ` +
                    `or set ${BOT_SAND_DATA_ENV} to an explicit host-accessible absolute path`,
            );
        }
        if (!existsSync(value)) {
            if (!createMissing) {
                throw new GrokBotPreflightError(`${BOT_SAND_DATA_ENV} '${value}' does not exist`);
            }
            assertCreatable(value);
            return {
                dataRoot: resolve(value),
                workflowsDir: join(resolve(value), 'workflows'),
                source: 'env',
                creatable: true,
            };
        }
        const real = assertRealDir(value, `${BOT_SAND_DATA_ENV} path`);
        return { dataRoot: real, workflowsDir: join(real, 'workflows'), source: 'env', creatable: false };
    }

    const sandData = join(options.homeDir, 'sand-data');
    if (isDanglingLink(sandData)) {
        throw new GrokBotPreflightError(`sand-data root '${sandData}' is a broken symlink — repair or remove it`);
    }
    if (existsSync(sandData)) {
        const real = assertRealDir(sandData, 'sand-data root');
        return { dataRoot: real, workflowsDir: join(real, 'workflows'), source: 'sand-data', creatable: false };
    }
    const agentData = join(options.homeDir, 'agent-data');
    if (existsSync(agentData)) {
        const real = assertRealDir(agentData, 'agent-data root');
        const hasWorkflows = existsSync(join(real, 'workflows'));
        const hasManaged = existsSync(join(real, 'managed-skills'));
        if (hasWorkflows || hasManaged) {
            return { dataRoot: real, workflowsDir: join(real, 'workflows'), source: 'agent-data', creatable: false };
        }
    }
    throw new GrokBotPreflightError(
        `Unable to resolve a Grok Bot Sand data root (no ${BOT_SAND_DATA_ENV}, ` +
            `no existing '${sandData}', and no qualifying '${agentData}') — ` +
            `run on the Grok Bot host or set ${BOT_SAND_DATA_ENV} to an explicit host-accessible absolute path`,
    );
}

/** Bot installs are host-global only; `--no-global` + an explicit Bot target fails preflight. */
export function assertBotHostGlobal(global: boolean): void {
    if (!global) {
        throw new GrokBotPreflightError(
            "Target 'grok-bot' installs to the Sand data root on the Bot host and is host-global only — " +
                'drop --no-global for this target',
        );
    }
}

/** SHA-256 hex over file bytes. */
export function sha256File(path: string): string {
    return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function sha256Text(text: string): string {
    return createHash('sha256').update(text, 'utf-8').digest('hex');
}

/** One flat-catalog skill discovered in a plugin's staged skills/ root. */
export interface BotSkillEntry {
    /** Flat catalog id (directory name under the staging skills/ root). */
    id: string;
    description: string;
    /** Adapted SKILL.md content (dialect-applied, marker-free). */
    skillMd: string;
    /** Support files relative to the skill dir (SKILL.md excluded). */
    files: Map<string, string>;
}

/** Rewrite Bot-foreign invocation prefixes: `/skill:<id>` → `/<id>`. */
export function applyGrokBotDialect(content: string): string {
    return content.replace(/(^|[\s`(])\/skill:([A-Za-z0-9][A-Za-z0-9._-]*)/g, (_match, lead, id) => `${lead}/${id}`);
}

/**
 * Validate one staged skill directory for the Bot catalog (R4): SKILL.md must
 * exist with frontmatter whose `name` equals the directory id and whose
 * `description` is a nonempty string after trimming.
 */
export function parseBotSkillEntry(skillDir: string): BotSkillEntry {
    const id = basename(skillDir);
    assertSafePathSegment(id, 'workflow id');
    const skillMdPath = join(skillDir, 'SKILL.md');
    if (!existsSync(skillMdPath)) {
        throw new GrokBotPreflightError(`Skill '${id}' is missing SKILL.md`);
    }
    const raw = readFileSync(skillMdPath, 'utf-8');
    let data: Record<string, unknown>;
    try {
        const parsed = parseFrontmatter(raw);
        data = parsed.data;
    } catch (error) {
        if (error instanceof FrontmatterError) {
            throw new GrokBotPreflightError(`Skill '${id}' has invalid frontmatter: ${error.message}`);
        }
        throw error;
    }
    const name = typeof data.name === 'string' ? data.name.trim() : '';
    if (name !== id) {
        throw new GrokBotPreflightError(`Skill '${id}' frontmatter name '${name}' does not match directory id '${id}'`);
    }
    const description = typeof data.description === 'string' ? data.description.trim() : '';
    if (description.length === 0) {
        throw new GrokBotPreflightError(`Skill '${id}' has an empty description — the Bot catalog requires one`);
    }
    const files = new Map<string, string>();
    for (const rel of listRegularFilesRel(skillDir)) {
        if (rel === 'SKILL.md') continue;
        files.set(rel, readFileSync(join(skillDir, rel), 'utf-8'));
    }
    return { id, description, skillMd: applyGrokBotDialect(raw), files };
}

function listRegularFilesRel(root: string): string[] {
    const out: string[] = [];
    const walk = (dir: string, prefix: string): void => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            if (entry.isSymbolicLink()) continue;
            if (entry.isDirectory()) {
                walk(join(dir, entry.name), `${prefix}${entry.name}/`);
            } else if (entry.isFile()) {
                out.push(`${prefix}${entry.name}`);
            }
        }
    };
    walk(root, '');
    return out.sort();
}

/** Collect + validate every staged skill before any write (fail before mutating). */
export function collectBotSkillEntries(stagingSkillsDir: string): BotSkillEntry[] {
    if (!existsSync(stagingSkillsDir)) return [];
    const entries: BotSkillEntry[] = [];
    for (const name of readdirSync(stagingSkillsDir, { withFileTypes: true })) {
        if (!name.isDirectory() || name.isSymbolicLink()) continue;
        entries.push(parseBotSkillEntry(join(stagingSkillsDir, name.name)));
    }
    entries.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return entries;
}

/** Stable canonical location for one workflow id (bridge mode). */
export function botCanonicalSkillDir(dataRoot: string, id: string): string {
    return join(resolve(dataRoot), '.superskill', GROK_BOT_TARGET, 'skills', id);
}

function hashEntry(entry: BotSkillEntry): Record<string, string> {
    const hashes: Record<string, string> = { 'SKILL.md': sha256Text(entry.skillMd) };
    for (const [rel, content] of entry.files) hashes[rel] = sha256Text(content);
    return hashes;
}

function buildMarker(args: {
    plugin: string;
    source: GrokBotSource;
    mode: GrokBotMaterialize;
    canonicalPath: string | null;
    superskillVersion: string;
    nowIso: string;
    entry: BotSkillEntry;
}): string {
    const marker: GrokBotOriginMarker = {
        schemaVersion: BOT_MARKER_SCHEMA_VERSION,
        target: GROK_BOT_TARGET,
        plugin: args.plugin,
        source: args.source,
        mode: args.mode,
        canonicalPath: args.canonicalPath,
        superskillVersion: args.superskillVersion,
        installedAt: args.nowIso,
        hashes: hashEntry(args.entry),
    };
    return `${JSON.stringify(marker, null, 2)}\n`;
}

/**
 * Read + validate an existing ownership marker. Returns null when absent.
 * Throws {@link GrokBotPreflightError} when present but malformed (R4: fail,
 * never overwrite) or owned by a foreign target/plugin.
 */
export function readOriginMarker(
    workflowDir: string,
    plugin: string,
    options?: { anyPlugin?: boolean },
): GrokBotOriginMarker | null {
    const markerPath = join(workflowDir, BOT_ORIGIN_MARKER);
    if (!existsSync(markerPath)) return null;
    let parsed: unknown;
    try {
        parsed = JSON.parse(readFileSync(markerPath, 'utf-8'));
    } catch (error) {
        throw new GrokBotPreflightError(
            `Workflow '${basename(workflowDir)}' has a malformed ${BOT_ORIGIN_MARKER}: ${String(error)} — ` +
                'remove it manually if it is no longer wanted; superskill will not overwrite it',
        );
    }
    const rec = parsed as Partial<GrokBotOriginMarker> | null;
    if (
        !rec ||
        rec.schemaVersion !== BOT_MARKER_SCHEMA_VERSION ||
        rec.target !== GROK_BOT_TARGET ||
        typeof rec.plugin !== 'string' ||
        rec.plugin.length === 0 ||
        !rec.source ||
        typeof rec.source !== 'object' ||
        (rec.source.channel !== 'bundled' && rec.source.channel !== 'marketplace') ||
        typeof rec.source.locator !== 'string' ||
        (rec.mode !== 'bridge' && rec.mode !== 'full') ||
        typeof rec.installedAt !== 'string' ||
        typeof rec.hashes !== 'object' ||
        rec.hashes === null
    ) {
        throw new GrokBotPreflightError(
            `Workflow '${basename(workflowDir)}' has an unsupported ${BOT_ORIGIN_MARKER} shape — ` +
                'remove it manually if it is no longer wanted; superskill will not overwrite it',
        );
    }
    if (options?.anyPlugin !== true && rec.plugin !== plugin) {
        throw new GrokBotPreflightError(
            `Workflow '${basename(workflowDir)}' is owned by plugin '${rec.plugin}', not '${plugin}' — ` +
                'superskill will not replace another plugin’s workflow',
        );
    }
    return rec as GrokBotOriginMarker;
}

/** True when every marker hash matches current file bytes (marker excluded). */
export function markerHashesCurrent(marker: GrokBotOriginMarker, dir: string): boolean {
    for (const [rel, expected] of Object.entries(marker.hashes)) {
        const abs = join(dir, rel);
        if (!existsSync(abs) || sha256File(abs) !== expected) return false;
    }
    // Extra untracked files also count as drift for doctor; replacement ignores them.
    for (const rel of listRegularFilesRel(dir)) {
        if (rel === BOT_ORIGIN_MARKER) continue;
        if (!(rel in marker.hashes)) return false;
    }
    return true;
}

/** Materialized install plan for the grok-bot target (paths + per-skill actions). */
export interface GrokBotPlan {
    dataRoot: string;
    workflowsDir: string;
    /** Directories superskill will fully own (replace or create). */
    owned: Array<{ id: string; kind: 'create' | 'replace' }>;
    /** Prune candidates when --prune is set: obsolete, marker-gated. */
    pruneCandidates: Array<{ id: string; kind: 'canonical' | 'workflow' }>;
    skippedForeign: string[];
}

/**
 * R6 conflict gate: locally edited managed files or extra unowned files that a
 * replace/prune would destroy are a clear conflict — never silently overwrite
 * or delete them (no force/adopt flag in v1). Bridge mode hashes cover the
 * canonical tree (the pointer SKILL.md is derived), so the pointer dir is only
 * checked for unowned extras.
 */
function assertOwnedUndrifted(marker: GrokBotOriginMarker, workflowDir: string): void {
    const id = basename(workflowDir);
    if (marker.mode === 'bridge') {
        const canonicalDir = marker.canonicalPath ? resolve(marker.canonicalPath, '..') : null;
        if (canonicalDir && existsSync(canonicalDir) && !markerHashesCurrent(marker, canonicalDir)) {
            throw new GrokBotPreflightError(
                `Workflow '${id}' canonical files were locally modified — refusing to overwrite or prune; ` +
                    'restore the original content or remove the workflow manually',
            );
        }
        // Pointer dir = derived SKILL.md stub + the same owned resource files as
        // canonical + the marker. Gate edited/missing resources and unowned
        // extras. ponytail: the pointer stub itself is fully derived from the
        // canonical entry, so its local edits are not conflict-gated in v1 —
        // reinstall regenerates it; the meaningful content lives in canonical.
        for (const rel of listRegularFilesRel(workflowDir)) {
            if (rel === 'SKILL.md' || rel === BOT_ORIGIN_MARKER) continue;
            const expected = marker.hashes[rel];
            if (expected === undefined || sha256File(join(workflowDir, rel)) !== expected) {
                throw new GrokBotPreflightError(
                    `Workflow '${id}' has unowned or locally modified files (${rel}) — refusing to overwrite or prune`,
                );
            }
        }
    } else if (!markerHashesCurrent(marker, workflowDir)) {
        throw new GrokBotPreflightError(
            `Workflow '${id}' was locally modified — refusing to overwrite or prune; ` +
                'restore the original content or remove the workflow manually',
        );
    }
}

/**
 * Validate install inputs against the live Sand tree and plan writes (R4/R5).
 * Throws before any mutation when any existing workflow is foreign or has a
 * malformed marker.
 */
export function planGrokBotInstall(args: {
    entries: readonly BotSkillEntry[];
    resolution: SandRootResolution;
    plugin: string;
    source: GrokBotSource;
    prune: boolean;
    /** Target mode for this install — drives mode-switch cleanup (R6). */
    materialize: GrokBotMaterialize;
}): GrokBotPlan {
    const { resolution } = args;
    const owned: GrokBotPlan['owned'] = [];
    const pruneCandidates: GrokBotPlan['pruneCandidates'] = [];
    const skippedForeign: string[] = [];
    for (const entry of args.entries) {
        const workflowDir = join(resolution.workflowsDir, entry.id);
        let kind: 'create' | 'replace' = 'create';
        if (existsSync(workflowDir)) {
            const marker = readOriginMarker(workflowDir, args.plugin); // throws on foreign/malformed
            if (marker === null) {
                throw new GrokBotPreflightError(
                    `Workflow '${entry.id}' already exists without a ${BOT_ORIGIN_MARKER} marker — ` +
                        'superskill will not overwrite unmarked content; remove or mark it first',
                );
            }
            assertOwnedUndrifted(marker, workflowDir);
            kind = 'replace';
            // Explicit mode switch bridge→full: the private canonical tree is now
            // obsolete (R6). full→bridge needs no cleanup — the pointer replaces
            // the whole workflow dir and the canonical is (re)written fresh.
            if (marker.mode === 'bridge' && args.materialize === 'full' && marker.canonicalPath) {
                pruneCandidates.push({ id: entry.id, kind: 'canonical' });
            }
        }
        owned.push({ id: entry.id, kind });
    }
    if (args.prune && existsSync(resolution.workflowsDir)) {
        const currentIds = new Set(args.entries.map((entry) => entry.id));
        for (const dirent of readdirSync(resolution.workflowsDir, { withFileTypes: true })) {
            if (!dirent.isDirectory() || dirent.isSymbolicLink()) continue;
            if (currentIds.has(dirent.name)) continue;
            let marker: GrokBotOriginMarker | null;
            try {
                marker = readOriginMarker(join(resolution.workflowsDir, dirent.name), args.plugin);
            } catch (error) {
                if (error instanceof GrokBotPreflightError) {
                    skippedForeign.push(dirent.name);
                    continue;
                }
                throw error;
            }
            if (marker === null || marker.plugin !== args.plugin) {
                skippedForeign.push(dirent.name);
                continue;
            }
            assertOwnedUndrifted(marker, join(resolution.workflowsDir, dirent.name));
            pruneCandidates.push({ id: dirent.name, kind: 'workflow' });
            if (marker.canonicalPath) pruneCandidates.push({ id: dirent.name, kind: 'canonical' });
        }
    }
    return {
        dataRoot: resolution.dataRoot,
        workflowsDir: resolution.workflowsDir,
        owned,
        pruneCandidates,
        skippedForeign,
    };
}

/** Thin Bot-side pointer SKILL.md for bridge mode. */
export function renderBridgePointer(entry: BotSkillEntry, canonicalSkillDir: string, pointerDir: string): string {
    const relPointer = relative(pointerDir, resolve(canonicalSkillDir, 'SKILL.md'));
    return [
        '---',
        `name: ${entry.id}`,
        'description: >-',
        ...entry.description
            .split(/\r?\n/)
            .map((line) => `  ${line.trim()}`)
            .filter((line) => line.length > 1),
        `canonical: ${relPointer}`,
        '---',
        '',
        `This workflow is managed by superskill (bridge mode). The full skill lives at:`,
        '',
        `\`${relPointer}\``,
        '',
        'Edit the canonical copy; reinstalling its plugin republishes this pointer.',
        '',
    ].join('\n');
}

function writeTree(dir: string, entry: BotSkillEntry, skillMd: string, extraMarker: string): void {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'SKILL.md'), skillMd, 'utf-8');
    for (const [rel, content] of entry.files) {
        const abs = join(dir, rel);
        mkdirSync(resolve(abs, '..'), { recursive: true });
        writeFileSync(abs, content, 'utf-8');
    }
    writeFileSync(join(dir, BOT_ORIGIN_MARKER), extraMarker, 'utf-8');
}

/** Outcome of writing the grok-bot catalog (bridge/full materialization). */
export interface EmitGrokBotResult {
    /** Ids written under workflows/. */
    published: string[];
    /** Ids removed by --prune. */
    pruned: string[];
    skippedForeign: string[];
    installedSnapshot: InstallSnapshot;
}

/**
 * Transactional emission of the Bot catalog (R4/R6). Callers must have
 * validated everything via {@link planGrokBotInstall}. All workflow/canonical
 * writes and prunes go through {@link FilesystemTransaction}; any write or
 * `finalize` (receipt) failure rolls every touched destination back to its
 * prior state, and rollback failures are reported in the thrown error.
 * `finalize` runs after catalog writes and before commit so a receipt failure
 * still restores prior Bot output.
 */
export async function emitGrokBotInstall(args: {
    entries: readonly BotSkillEntry[];
    resolution: SandRootResolution;
    plugin: string;
    source: GrokBotSource;
    materialize: GrokBotMaterialize;
    superskillVersion: string;
    nowIso: string;
    prune: boolean;
    pruneCandidates: readonly { id: string; kind: 'canonical' | 'workflow' }[];
    /** Optional receipt writer — runs inside the rollback scope (R6). */
    finalize?: (installed: InstallSnapshot) => void;
}): Promise<EmitGrokBotResult> {
    const { resolution } = args;
    const transaction = new FilesystemTransaction();
    const published: string[] = [];
    const pruned: string[] = [];
    try {
        for (const entry of args.entries) {
            const workflowDir = join(resolution.workflowsDir, entry.id);
            if (args.materialize === 'bridge') {
                const canonicalDir = botCanonicalSkillDir(resolution.dataRoot, entry.id);
                const marker = buildMarker({
                    plugin: args.plugin,
                    source: args.source,
                    mode: 'bridge',
                    canonicalPath: join(canonicalDir, 'SKILL.md'),
                    superskillVersion: args.superskillVersion,
                    nowIso: args.nowIso,
                    entry,
                });
                // Canonical before its bridge pointer, inside one rollback group.
                await transaction.replace(canonicalDir, async (dir) => {
                    writeTree(dir, entry, entry.skillMd, marker);
                });
                await transaction.replace(workflowDir, async (dir) => {
                    writeTree(dir, entry, renderBridgePointer(entry, canonicalDir, workflowDir), marker);
                });
            } else {
                const marker = buildMarker({
                    plugin: args.plugin,
                    source: args.source,
                    mode: 'full',
                    canonicalPath: null,
                    superskillVersion: args.superskillVersion,
                    nowIso: args.nowIso,
                    entry,
                });
                await transaction.replace(workflowDir, async (dir) => {
                    writeTree(dir, entry, entry.skillMd, marker);
                });
            }
            published.push(entry.id);
        }
        if (args.prune) {
            for (const candidate of args.pruneCandidates) {
                const dir =
                    candidate.kind === 'workflow'
                        ? join(resolution.workflowsDir, candidate.id)
                        : botCanonicalSkillDir(resolution.dataRoot, candidate.id);
                await transaction.remove(dir);
                if (candidate.kind === 'workflow') pruned.push(candidate.id);
            }
        }
        // Receipt snapshot over every file superskill owns for this plugin install.
        const ownedFiles: string[] = [];
        for (const entry of args.entries) {
            ownedFiles.push(
                join(resolution.workflowsDir, entry.id, 'SKILL.md'),
                join(resolution.workflowsDir, entry.id, BOT_ORIGIN_MARKER),
            );
            for (const rel of entry.files.keys()) ownedFiles.push(join(resolution.workflowsDir, entry.id, rel));
            if (args.materialize === 'bridge') {
                const canonicalDir = botCanonicalSkillDir(resolution.dataRoot, entry.id);
                ownedFiles.push(join(canonicalDir, 'SKILL.md'), join(canonicalDir, BOT_ORIGIN_MARKER));
                for (const rel of entry.files.keys()) ownedFiles.push(join(canonicalDir, rel));
            }
        }
        // snapshotFiles wants a common root: use the data root and absolute paths.
        const installed = snapshotFiles(
            resolution.dataRoot,
            ownedFiles.map((abs) => resolve(abs)),
        );
        args.finalize?.(installed);
        await transaction.commit();
        return { published, pruned, skippedForeign: [], installedSnapshot: installed };
    } catch (error) {
        try {
            await transaction.rollback();
        } catch (rollbackError) {
            throw new GrokBotPreflightError(
                `grok-bot emission failed (${error instanceof Error ? error.message : String(error)}) ` +
                    `and rollback reported errors: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
            );
        }
        throw error;
    }
}

/** One read-only health problem found in the published grok-bot catalog. */
export interface GrokBotDoctorIssue {
    code:
        | 'root-unresolved'
        | 'root-invalid'
        | 'frontmatter'
        | 'marker-missing'
        | 'marker-malformed'
        | 'canonical-missing'
        | 'owned-drift';
    path: string;
    message: string;
}

/** Read-only health report for the grok-bot install target (doctor command). */
export interface GrokBotDoctorReport {
    target: 'grok-bot';
    available: boolean;
    dataRoot: string | null;
    workflowsDir: string | null;
    source: SandRootResolution['source'] | null;
    creatable: boolean;
    issues: GrokBotDoctorIssue[];
}

/**
 * Read-only Bot readiness inspection (R6). Never mutates the Sand tree.
 * `available` is true when the root resolved and every workflow directory is
 * valid (frontmatter, marker, canonical resource, owned-file drift).
 */
export function inspectGrokBotTarget(options: { sandData?: string; homeDir: string }): GrokBotDoctorReport {
    const issues: GrokBotDoctorIssue[] = [];
    let resolution: SandRootResolution | null = null;
    try {
        resolution = resolveSandRoot({ sandData: options.sandData, homeDir: options.homeDir });
    } catch (error) {
        issues.push({
            code: 'root-unresolved',
            path: options.sandData?.trim() || join(options.homeDir, 'sand-data'),
            message: error instanceof Error ? error.message : String(error),
        });
        return {
            target: GROK_BOT_TARGET,
            available: false,
            dataRoot: null,
            workflowsDir: null,
            source: null,
            creatable: false,
            issues,
        };
    }
    let available = true;
    if (!existsSync(resolution.workflowsDir)) {
        // Missing workflows/ on an existing root is fine (first install creates it).
        return { ...resolution, target: GROK_BOT_TARGET, available, issues };
    }
    for (const dirent of readdirSync(resolution.workflowsDir, { withFileTypes: true })) {
        if (!dirent.isDirectory() || dirent.isSymbolicLink()) continue;
        const id = dirent.name;
        const dir = join(resolution.workflowsDir, id);
        try {
            parseBotSkillEntry(dir);
        } catch (error) {
            available = false;
            issues.push({
                code: 'frontmatter',
                path: dir,
                message: error instanceof Error ? error.message : String(error),
            });
            continue;
        }
        let marker: GrokBotOriginMarker | null;
        try {
            marker = readOriginMarker(dir, '*', { anyPlugin: true });
        } catch (error) {
            available = false;
            issues.push({
                code: 'marker-malformed',
                path: dir,
                message: error instanceof Error ? error.message : String(error),
            });
            continue;
        }
        if (marker === null) {
            available = false;
            issues.push({
                code: 'marker-missing',
                path: dir,
                message: `No ${BOT_ORIGIN_MARKER} — superskill cannot manage or prune this workflow`,
            });
            continue;
        }
        if (marker.mode === 'bridge') {
            const canonical = marker.canonicalPath;
            if (!canonical || !existsSync(canonical)) {
                available = false;
                issues.push({
                    code: 'canonical-missing',
                    path: dir,
                    message: `Bridge pointer targets missing canonical skill: ${canonical ?? '<unset>'}`,
                });
                continue;
            }
            if (!markerHashesCurrent(marker, resolve(canonical, '..'))) {
                issues.push({
                    code: 'owned-drift',
                    path: canonical,
                    message: 'Canonical skill files drifted from the ownership marker hashes',
                });
            }
        } else if (!markerHashesCurrent(marker, dir)) {
            issues.push({
                code: 'owned-drift',
                path: dir,
                message: 'Workflow files drifted from the ownership marker hashes',
            });
        }
    }
    return { ...resolution, target: GROK_BOT_TARGET, available, issues };
}
