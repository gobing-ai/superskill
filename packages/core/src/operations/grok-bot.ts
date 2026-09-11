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
import type { PostInstallAction, TransactionalWrite } from './post-install.js';
import { runPostInstallActions } from './post-install.js';

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

/** Sand-internal trees that are never a valid data root (R6 protected-tree containment). */
const PROTECTED_ROOT_BASENAMES = new Set(['managed-skills', 'plugins', 'plugin-skills']);

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
    if (PROTECTED_ROOT_BASENAMES.has(basename(real))) {
        throw new GrokBotPreflightError(
            `${label} '${path}' resolves into the protected Sand tree '${basename(real)}' — ` +
                `set ${BOT_SAND_DATA_ENV} to the Sand data root itself`,
        );
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
            if (PROTECTED_ROOT_BASENAMES.has(basename(resolve(value)))) {
                throw new GrokBotPreflightError(
                    `${BOT_SAND_DATA_ENV} '${value}' resolves into the protected Sand tree '${basename(resolve(value))}' — ` +
                        `set ${BOT_SAND_DATA_ENV} to the Sand data root itself`,
                );
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

/**
 * Deterministic handoff directory for slash-registration preparation
 * (task 0130). Preparation only: the CLI never claims successful
 * registration (host visibility is unverifiable from here).
 */
function botRealpath(p: string): string {
    try {
        return realpathSync(p);
    } catch {
        // Root not materialized yet (dry-run preview): keep the resolved form.
        return resolve(p);
    }
}

/** Handoff file where install/update stages one plugin's slash-registration request (R7/R8): consumed by the host agent, never by this CLI. */
export function botRegisterHandoffPath(dataRoot: string, plugin: string): string {
    assertSafePathSegment(plugin, 'grok-bot plugin id');
    return join(botRealpath(dataRoot), '.superskill', GROK_BOT_TARGET, 'register', `${plugin}.json`);
}

/** Directory holding all registration handoffs under the resolved Bot data root. */
export function botRegisterHandoffDir(dataRoot: string): string {
    return join(botRealpath(dataRoot), '.superskill', GROK_BOT_TARGET, 'register');
}

/** One skill record inside a registration handoff. */
export interface BotRegisterSkillRecord {
    id: string;
    name: string;
    description: string;
    mode: GrokBotMaterialize;
    /** Absolute SKILL.md the host should treat as the recipe (canonical for bridge, workflow for full). */
    recipePath: string;
    /**
     * Executable content: bridge instructions that read the canonical recipe,
     * or the full real SKILL.md content (never a pointer back to the workflow
     * file a preserving host write would overwrite).
     */
    body: string;
    /** Original frontmatter metadata for a preserving host write. */
    frontmatter: Record<string, unknown>;
    /** Support files beside the recipe: relative path → content. */
    resources: Record<string, string>;
}

/** Versioned handoff document written to `botRegisterHandoffPath`. */
export interface BotRegisterHandoff {
    schemaVersion: 1;
    target: 'grok-bot';
    plugin: string;
    dataRoot: string;
    source: GrokBotSource;
    materialize: GrokBotMaterialize;
    skills: BotRegisterSkillRecord[];
}

/**
 * Installed id of the shipped recovery skill (source dir
 * `plugins/cc/skills/grok-bot-register/` → prefixed installed id `cc-grok-bot-register`).
 * The installed ID is canonical across handoffs, workflows and recovery selection (task 0132).
 */
export const BOT_RECOVERY_SKILL_ID = 'cc-grok-bot-register';

/** Path of the installed recovery skill recipe inside the Bot catalog. */
export function botRecoveryWorkflowSkillPath(dataRoot: string): string {
    return join(botRealpath(dataRoot), 'workflows', BOT_RECOVERY_SKILL_ID, 'SKILL.md');
}

/**
 * First-run bootstrap guidance (task 0132 R3/R10): after commit, tell the operator how
 * to get the handoffs consumed without a working slash picker. When the recovery skill
 * is part of this install's committed selection, point at its resolved workflow recipe;
 * otherwise give a self-contained consume-this-handoff prompt plus an optional explicit
 * cc install instruction. Never claims registration success and never implicitly installs cc.
 */
export function botBootstrapMessages(args: {
    dataRoot: string;
    plugin: string;
    entries: readonly BotSkillEntry[];
}): string[] {
    const handoffPath = botRegisterHandoffPath(args.dataRoot, args.plugin);
    if (args.entries.some((entry) => entry.id === BOT_RECOVERY_SKILL_ID)) {
        return [
            `First use (empty slash picker is expected): ask any Grok Bot on this Sand root to`,
            `read and follow ${JSON.stringify(botRecoveryWorkflowSkillPath(args.dataRoot))} with --plugin ${args.plugin}.`,
            `Consume only ${JSON.stringify(handoffPath)}; report registration pending if no verified host method is available.`,
            `If the Bot's Read tool denies the hidden canonical file under .superskill (bridge installs),`,
            `use the Bot's authorized Shell tool to read that exact path instead.`,
        ];
    }
    return [
        `First use (empty slash picker is expected): ask any Grok Bot on this Sand root to`,
        `read only the registration handoff ${JSON.stringify(handoffPath)} for plugin ${args.plugin}.`,
        `Validate schemaVersion=1, target=grok-bot, plugin/source, matching resolved dataRoot and modes,`,
        `nonempty id/name/description/body, safe single-segment ids, frontmatter objects and resources string maps.`,
        `Resolve recipe/resource paths within this Sand root; reject symlink escapes, stale content,`,
        `foreign ownership markers or hashes, and conflicting duplicate ids before any write.`,
        `Using only a verified host schema with confirmed registry ownership and preserving upsert behavior,`,
        `register each listed skill id at most once in stable order with its exact name, description, body,`,
        `frontmatter and resources. Preserve full recipes; never replace them with a self-pointer.`,
        `For bridge recipes, use the Bot's authorized Shell tool if Read denies the exact canonical path;`,
        `keep arguments unchanged and resources beside that recipe. Ignore unrelated shared skills.`,
        `Never delete/recreate or reset ownership hashes. Continue independent failures; report each id as`,
        `acknowledged, failed, conflict, skipped or pending. Without a verified method, leave registration pending.`,
        `Enablement is pending/unknown; picker visibility and invocation remain unverified until observed.`,
        `To consume handoffs with the bundled recovery skill instead, install the cc plugin explicitly:`,
        `superskill install cc --targets grok-bot (no implicit dependency install happens here).`,
    ];
}

/** Shared slash-registration caveat: handoff preparation ≠ registration. */
export const BOT_SLASH_CAVEAT =
    'Slash registration is NOT automatic: have the host agent consume the handoff with a verified ' +
    'host method (one registration attempt per id, never delete-and-recreate). ' +
    'Filesystem install does not fill chat `/`; picker visibility and enablement stay unverified until observed.';

function bridgeRecordBody(recipePath: string): string {
    return (
        `When this skill is invoked, read and follow the canonical skill file at:\n${recipePath}\n\n` +
        'If the Bot Read tool denies that path (protected .superskill store), use the authorized Shell ' +
        'tool to read the exact same absolute path. Do not rewrite the recipe onto ~/.agents/skills.\n\n' +
        'Pass any user arguments through unchanged, and resolve any resources referenced by that ' +
        'skill from the directory containing it.'
    );
}

/**
 * Build the deterministic registration handoff for one committed install
 * batch (this batch's entries only — never retained obsolete workflows).
 * Throws on content that could not round-trip a preserving host write.
 */
export function buildBotRegisterHandoff(args: {
    plugin: string;
    entries: readonly BotSkillEntry[];
    source: GrokBotSource;
    materialize: GrokBotMaterialize;
    dataRoot: string;
}): BotRegisterHandoff {
    // Normalize once so reinstall handoffs stay byte-identical across root materialization.
    const dataRoot = botRealpath(args.dataRoot);
    const workflowsDir = join(dataRoot, 'workflows');
    const skills = args.entries.map((entry) => {
        const parsed = parseFrontmatter(entry.skillMd);
        const workflowSkillPath = join(workflowsDir, entry.id, 'SKILL.md');
        const isBridge = args.materialize === 'bridge';
        const recipePath = isBridge ? join(botCanonicalSkillDir(dataRoot, entry.id), 'SKILL.md') : workflowSkillPath;
        // Full bodies are applied in place: pointing back at the overwritten file would destroy the recipe.
        // Check the unresolved form too: on a symlinked Sand root (e.g. /tmp → /private/tmp) a body
        // citing the non-canonicalized absolute path is equally destructive.
        const unresolvedWorkflowSkillPath = join(resolve(args.dataRoot), 'workflows', entry.id, 'SKILL.md');
        if (
            !isBridge &&
            (entry.skillMd.includes(workflowSkillPath) || entry.skillMd.includes(unresolvedWorkflowSkillPath))
        ) {
            throw new GrokBotPreflightError(
                `grok-bot handoff record '${entry.id}' self-references its replacement target ${workflowSkillPath}`,
            );
        }
        return {
            id: entry.id,
            name: entry.id,
            description: entry.description,
            mode: args.materialize,
            recipePath,
            body: isBridge ? bridgeRecordBody(recipePath) : entry.skillMd,
            frontmatter: parsed.data,
            resources: Object.fromEntries(entry.files),
        };
    });
    return {
        schemaVersion: 1,
        target: GROK_BOT_TARGET,
        plugin: args.plugin,
        dataRoot,
        source: args.source,
        materialize: args.materialize,
        skills,
    };
}

/** Deterministic serialization: stable key order, 2-space indent, trailing newline. */
export function serializeBotRegisterHandoff(handoff: BotRegisterHandoff): string {
    return `${JSON.stringify(handoff, null, 2)}\n`;
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
 * or delete them (no force/adopt flag in v1).
 *
 * Bridge mode: the recipe lives under the private canonical tree. The workflow
 * `SKILL.md` is a disposable pointer; host registry upserts routinely rewrite it
 * (different body/absolute paths) while leaving `canonical:` intact. That is
 * expected — only canonical drift or extra unowned workflow files block replace/prune.
 * Full mode: any hash mismatch on the workflow tree still blocks.
 */
function assertOwnedUndrifted(marker: GrokBotOriginMarker, workflowDir: string): void {
    const id = basename(workflowDir);
    if (marker.mode === 'bridge') {
        const canonicalDir = marker.canonicalPath ? resolve(marker.canonicalPath, '..') : null;
        if (!canonicalDir || !existsSync(canonicalDir) || !markerHashesCurrent(marker, canonicalDir)) {
            throw new GrokBotPreflightError(
                `Workflow '${id}' canonical files are missing or locally modified — refusing to overwrite or prune; ` +
                    'restore the original content or remove the workflow manually',
            );
        }
        if (!bridgeWorkflowTreeAcceptable(marker, canonicalDir, workflowDir)) {
            throw new GrokBotPreflightError(
                `Workflow '${id}' has missing, unowned or locally modified files — refusing to overwrite or prune`,
            );
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
        `This workflow is managed by superskill (bridge mode). When invoked, read and follow the canonical skill at:`,
        '',
        `\`${relPointer}\``,
        '',
        'Pass any user arguments through unchanged, and resolve any resources referenced by that skill from the directory containing it.',
        'Edit only the canonical copy; reinstalling its plugin republishes this pointer.',
        '',
    ].join('\n');
}

function bridgeWorkflowCurrent(marker: GrokBotOriginMarker, canonicalDir: string, workflowDir: string): boolean {
    try {
        const pointer = renderBridgePointer(
            parseBotSkillEntry(canonicalDir),
            realpathSync(canonicalDir),
            realpathSync(workflowDir),
        );
        return markerHashesCurrent(
            { ...marker, hashes: { ...marker.hashes, 'SKILL.md': sha256Text(pointer) } },
            workflowDir,
        );
    } catch {
        return false;
    }
}

function samePath(a: string, b: string): boolean {
    try {
        return realpathSync(a) === realpathSync(b);
    } catch {
        return resolve(a) === resolve(b);
    }
}

/**
 * Bridge workflow acceptability for doctor/reinstall (task 0132 follow-up).
 * Accepts either the exact superskill-rendered pointer OR a host-rewritten
 * SKILL.md that still targets the same canonical recipe and introduces no
 * unowned extra files. Canonical hash integrity is checked separately.
 */
export function bridgeWorkflowTreeAcceptable(
    marker: GrokBotOriginMarker,
    canonicalDir: string,
    workflowDir: string,
): boolean {
    if (bridgeWorkflowCurrent(marker, canonicalDir, workflowDir)) return true;
    const skillPath = join(workflowDir, 'SKILL.md');
    if (!existsSync(skillPath)) return false;
    const expectedCanonical = resolve(canonicalDir, 'SKILL.md');
    for (const rel of listRegularFilesRel(workflowDir)) {
        if (rel === BOT_ORIGIN_MARKER || rel === 'SKILL.md') continue;
        if (!(rel in marker.hashes)) return false;
        const abs = join(workflowDir, rel);
        if (!existsSync(abs) || sha256File(abs) !== marker.hashes[rel]) return false;
    }
    let text: string;
    try {
        text = readFileSync(skillPath, 'utf-8');
    } catch {
        return false;
    }
    try {
        const parsed = parseFrontmatter(text);
        const canonField = parsed.data.canonical;
        if (typeof canonField === 'string' && canonField.trim().length > 0) {
            return samePath(resolve(workflowDir, canonField.trim()), expectedCanonical);
        }
    } catch {
        // fall through to absolute-path heuristics
    }
    try {
        if (text.includes(realpathSync(expectedCanonical))) return true;
    } catch {
        /* ignore */
    }
    return text.includes(resolve(expectedCanonical));
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
    /** Post-install action outcome (task 0130); empty when no actions ran. */
    postInstall: { writtenFiles: string[]; messages: string[] };
}

/**
 * Transactional emission of the Bot catalog (R4/R6). Callers must have
 * validated everything via {@link planGrokBotInstall}. All workflow/canonical
 * writes and prunes go through {@link FilesystemTransaction}; any write or
 * `finalize` (receipt) failure rolls every touched destination back to its
 * prior state, and rollback failures are reported in the thrown error.
 * `finalize` runs after catalog writes and before commit so a receipt failure
 * still restores prior Bot output. Registered post-install actions (task 0130)
 * run after catalog/prune writes and before the receipt snapshot, inside the
 * same rollback boundary, through their transaction-scoped writer.
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
    /**
     * Post-install hook: receives a transaction-scoped writer bound to this
     * emission's rollback boundary and returns the actions to run (R9).
     */
    postActions?: (write: TransactionalWrite) => {
        actions: readonly PostInstallAction[];
        stagingRoot: string;
    };
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
        // Post-install actions: once, in registration order, before the receipt (R9).
        const postInstall = { writtenFiles: [] as string[], messages: [] as string[] };
        if (args.postActions) {
            const writeTransactional: TransactionalWrite = async (absPath, content) => {
                await transaction.replace(absPath, async (destination) => {
                    mkdirSync(resolve(destination, '..'), { recursive: true });
                    writeFileSync(destination, content, 'utf-8');
                });
            };
            const plan = args.postActions(writeTransactional);
            const results = await runPostInstallActions(
                {
                    target: GROK_BOT_TARGET,
                    plugin: args.plugin,
                    installRoot: resolution.dataRoot,
                    stagingRoot: plan.stagingRoot,
                    dryRun: false,
                },
                plan.actions,
            );
            for (const result of results) {
                postInstall.writtenFiles.push(...result.writtenFiles);
                postInstall.messages.push(...result.messages);
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
        return { published, pruned, skippedForeign: [], installedSnapshot: installed, postInstall };
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
    /**
     * Slash-registration status (task 0130): always `unknown` — filesystem
     * health is not proof of registration, and the CLI has no verified way
     * to query the host. Carries the handoff location and next steps.
     */
    slashRegistry: GrokBotDoctorSlashRegistry;
}

/**
 * Doctor's view of slash-command registration (R6). `status` is always
 * `unknown`: healthy on-disk files do not prove host visibility, and the CLI
 * has no verified way to query the host, so doctor surfaces the handoff
 * location and next steps instead of a verdict.
 */
export interface GrokBotDoctorSlashRegistry {
    status: 'unknown';
    /** Where install/update prepares registration handoffs; null if no root resolved. */
    handoffDir: string | null;
    guidance: string[];
}

/** Doctor guidance lines for slash registration: why the CLI cannot verify it and how to register safely. */
export const BOT_DOCTOR_SLASH_GUIDANCE = [
    'Healthy on-disk files do not prove slash visibility; the CLI cannot verify host registration, so slash-registry status stays unknown.',
    'Install/update prepares a handoff at <dataRoot>/.superskill/grok-bot/register/<plugin>.json — have the host agent consume it with a verified registration method (one attempt per id, never delete-and-recreate).',
    'First use: ask any Grok Bot on this Sand root to read and follow <dataRoot>/workflows/cc-grok-bot-register/SKILL.md (when the bundled recovery skill is installed it consumes all handoffs); otherwise ask it to read and follow the handoff file directly.',
    'Bridge recipes live under the hidden .superskill tree: if the Bot Read tool denies them, use the Bot authorized Shell tool to read the exact same path. Do not rewrite recipes onto ~/.agents/skills.',
    'A host write acknowledgement does not prove enablement, picker visibility or invocation; those remain pending/unknown or unverified until observed.',
    'Bridge workflow pointers may be rewritten by host registry upserts; that alone is not owned-drift when the canonical recipe hashes still match.',
];

function botDoctorSlashRegistry(dataRoot: string | null): GrokBotDoctorSlashRegistry {
    return {
        status: 'unknown',
        handoffDir: dataRoot === null ? null : botRegisterHandoffDir(dataRoot),
        guidance:
            dataRoot === null
                ? [
                      'Set SAND_DATA to an existing absolute Sand root on the Bot host, then reinstall the selected plugin. Host registration, enablement, picker visibility and invocation remain unverified.',
                  ]
                : BOT_DOCTOR_SLASH_GUIDANCE,
    };
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
            slashRegistry: botDoctorSlashRegistry(null),
        };
    }
    let available = true;
    if (!existsSync(resolution.workflowsDir)) {
        // Missing workflows/ on an existing root is fine (first install creates it).
        return {
            ...resolution,
            target: GROK_BOT_TARGET,
            available,
            issues,
            slashRegistry: botDoctorSlashRegistry(resolution.dataRoot),
        };
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
            if (!bridgeWorkflowTreeAcceptable(marker, resolve(canonical, '..'), dir)) {
                issues.push({
                    code: 'owned-drift',
                    path: dir,
                    message:
                        'Bridge workflow has unowned extras or no longer targets its canonical skill ' +
                        '(host-rewritten pointers that keep canonical: are OK)',
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
    return {
        ...resolution,
        target: GROK_BOT_TARGET,
        available,
        issues,
        slashRegistry: botDoctorSlashRegistry(resolution.dataRoot),
    };
}
