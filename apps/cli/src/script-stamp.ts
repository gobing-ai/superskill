import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { assertSafePathSegment, listRegularFilesUnder, snapshotFiles } from '@gobing-ai/superskill-core';

/**
 * Shared-script-root stamp (task 0149).
 *
 * Rulesync/Hermes-class installs stage plugin scripts to `<scopeRoot>/.agents/scripts/<plugin>/`.
 * Install writes one schema-v1 stamp beside that tree so a consumer of the shared root has a local
 * version identity and a per-file integrity baseline, without reading a per-target receipt under
 * `.superskill/manifests/`.
 *
 * Deliberately distinct from `InstallManifestV1` (packages/core/src/operations/install-manifest.ts):
 * that record is per target and carries an upstream snapshot; the stamp is one shared-root receipt
 * with no target. Both reuse the same SHA-256 snapshot primitives, so hashes agree by construction.
 */

/** Reserved stamp filename at the root of a plugin script directory (R4). */
export const SCRIPT_STAMP_FILENAME = '.superskill-stamp.json';

/** Metadata projection of a stamp — what `script path --json` exposes. */
export interface ScriptStampMetadata {
    upstreamVersion: string;
    resolvedRef?: string;
    installedAt: string;
}

/** Schema version 1 stamp written beside a staged plugin script tree. */
export interface ScriptStampV1 {
    schemaVersion: 1;
    plugin: string;
    upstreamVersion: string;
    marketplaceLocator?: string;
    resolvedRef?: string;
    superskillVersion: string;
    installedAt: string;
    /** Slash-normalized script path → lowercase SHA-256 hex of the staged bytes. Never includes the stamp. */
    files: Record<string, string>;
}

/** Stamp body a writer supplies; `schemaVersion` is owned by the writer. */
export type ScriptStampBody = Omit<ScriptStampV1, 'schemaVersion'>;

/**
 * Read outcome. `missing` and `invalid` stay distinguishable so `script verify` can report
 * "never staged" separately from "baseline unusable"; `script path` collapses both to `null`.
 */
export type ScriptStampRead = { status: 'ok'; stamp: ScriptStampV1 } | { status: 'missing' } | { status: 'invalid' };

/** Sorted drift report between a stamp baseline and the current file map. */
export interface ScriptStampDiff {
    added: string[];
    removed: string[];
    changed: string[];
}

const SHA256_HEX = /^[0-9a-f]{64}$/;

/** Absolute path of the stamp for a plugin script root (`<scopeRoot>/.agents/scripts/<plugin>`). */
export function scriptStampPath(scriptRoot: string): string {
    return join(scriptRoot, SCRIPT_STAMP_FILENAME);
}

/**
 * True when `rel` names the reserved root stamp, including `./`-prefixed and Windows-separator
 * spellings. Nested files with the same basename are ordinary scripts — only the root is reserved.
 */
export function isReservedStampRel(rel: string): boolean {
    const normalized = rel.replace(/\\/g, '/').replace(/^(\.\/)+/, '');
    return normalized === SCRIPT_STAMP_FILENAME;
}

/**
 * Atomically write the stamp (sibling temp file + rename) after sorting the file map for stable
 * on-disk output. Path-segment and schema validation run before any write.
 *
 * @param scriptRoot Plugin script root the stamp belongs to.
 * @param body Stamp body; `files` must never contain the stamp itself.
 * @returns Absolute path written.
 */
export function writeScriptStamp(scriptRoot: string, body: ScriptStampBody): string {
    assertSafePathSegment(body.plugin, 'plugin name');
    const stamp: ScriptStampV1 = {
        schemaVersion: 1,
        plugin: body.plugin,
        upstreamVersion: body.upstreamVersion,
        ...(body.marketplaceLocator !== undefined ? { marketplaceLocator: body.marketplaceLocator } : {}),
        ...(body.resolvedRef !== undefined ? { resolvedRef: body.resolvedRef } : {}),
        superskillVersion: body.superskillVersion,
        installedAt: body.installedAt,
        files: sortFileMap(body.files),
    };
    const validated = validateScriptStamp(stamp, body.plugin);
    if (!validated) {
        throw new Error(`Refusing to write an invalid script stamp under: ${scriptRoot}`);
    }
    const dest = scriptStampPath(scriptRoot);
    const dir = dirname(dest);
    const temporaryPath = join(dir, `.superskill-stamp-${randomUUID()}.tmp`);
    try {
        writeFileSync(temporaryPath, `${JSON.stringify(validated, null, 2)}\n`, 'utf-8');
        renameSync(temporaryPath, dest);
    } finally {
        if (existsSync(temporaryPath)) {
            rmSync(temporaryPath, { force: true });
        }
    }
    return dest;
}

/**
 * Read and validate the stamp for one plugin script root.
 *
 * Missing, unreadable, malformed, unsupported-schema, and wrong-plugin stamps never throw — they
 * are reported as `missing` / `invalid` so a caller can choose between `null` metadata
 * (`script path`) and a fail-closed diagnostic (`script verify`).
 *
 * @param scriptRoot Plugin script root holding the stamp.
 * @param plugin Plugin identity the stamp must declare.
 */
export function readScriptStamp(scriptRoot: string, plugin: string): ScriptStampRead {
    const path = scriptStampPath(scriptRoot);
    if (!existsSync(path)) return { status: 'missing' };
    let parsed: unknown;
    try {
        parsed = JSON.parse(readFileSync(path, 'utf-8')) as unknown;
    } catch {
        return { status: 'invalid' };
    }
    const stamp = validateScriptStamp(parsed, plugin);
    return stamp ? { status: 'ok', stamp } : { status: 'invalid' };
}

/** Project a validated stamp down to the three fields `script path --json` publishes. */
export function stampMetadata(stamp: ScriptStampV1): ScriptStampMetadata {
    return {
        upstreamVersion: stamp.upstreamVersion,
        ...(stamp.resolvedRef !== undefined ? { resolvedRef: stamp.resolvedRef } : {}),
        installedAt: stamp.installedAt,
    };
}

/**
 * Snapshot the regular files of a plugin script root, excluding the root stamp and the paths
 * `snapshotFiles` already excludes (`.superskill/`, `.superskill-manifest.json`). The underlying
 * walker also skips `.git`, `node_modules`, `.rulesync`, and `.targets` directories
 * (`DEFAULT_SKIP_DIR_NAMES`, packages/core/src/operations/install-manifest.ts:17) — shared with
 * the per-target receipt inventory, so those trees are outside the integrity baseline by design.
 *
 * Install writes the stamp from this map and `script verify` recomputes it, so "clean" can never
 * mean two different inventories.
 */
export function snapshotScriptRootFiles(scriptRoot: string): Record<string, string> {
    const root = resolve(scriptRoot);
    if (!existsSync(root)) return {};
    const stamp = join(root, SCRIPT_STAMP_FILENAME);
    const files = listRegularFilesUnder(root).filter((abs) => resolve(abs) !== stamp);
    if (files.length === 0) return {};
    return snapshotFiles(root, files).files;
}

/** Compare a stamp baseline against a current snapshot; every list is sorted for stable output. */
export function diffScriptFiles(
    baseline: Readonly<Record<string, string>>,
    current: Readonly<Record<string, string>>,
): ScriptStampDiff {
    return {
        added: Object.keys(current)
            .filter((rel) => !Object.hasOwn(baseline, rel))
            .sort(),
        removed: Object.keys(baseline)
            .filter((rel) => !Object.hasOwn(current, rel))
            .sort(),
        changed: Object.keys(current)
            .filter((rel) => Object.hasOwn(baseline, rel) && baseline[rel] !== current[rel])
            .sort(),
    };
}

/** True when a diff reports no difference on any axis. */
export function isCleanDiff(diff: ScriptStampDiff): boolean {
    return diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0;
}

function validateScriptStamp(value: unknown, plugin: string): ScriptStampV1 | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const rec = value as Record<string, unknown>;
    if (rec.schemaVersion !== 1) return null;
    const declaredPlugin = requiredString(rec, 'plugin');
    if (declaredPlugin === null || declaredPlugin !== plugin) return null;
    try {
        assertSafePathSegment(declaredPlugin, 'plugin name');
    } catch {
        return null;
    }
    const upstreamVersion = requiredString(rec, 'upstreamVersion');
    const installedAt = requiredString(rec, 'installedAt');
    const superskillVersion = requiredString(rec, 'superskillVersion');
    if (upstreamVersion === null || installedAt === null || superskillVersion === null) return null;
    const marketplaceLocator = optionalString(rec, 'marketplaceLocator');
    const resolvedRef = optionalString(rec, 'resolvedRef');
    if (marketplaceLocator === null || resolvedRef === null) return null;
    const files = validateFileMap(rec.files);
    if (files === null) return null;
    return {
        schemaVersion: 1,
        plugin: declaredPlugin,
        upstreamVersion,
        ...(marketplaceLocator !== undefined ? { marketplaceLocator } : {}),
        ...(resolvedRef !== undefined ? { resolvedRef } : {}),
        superskillVersion,
        installedAt,
        files,
    };
}

function validateFileMap(value: unknown): Record<string, string> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const files: Record<string, string> = {};
    for (const [key, hash] of Object.entries(value as Record<string, unknown>)) {
        if (!isSlashRelPath(key) || key === SCRIPT_STAMP_FILENAME) return null;
        if (typeof hash !== 'string' || !SHA256_HEX.test(hash)) return null;
        files[key] = hash;
    }
    return files;
}

/** Slash-normalized, in-root relative path: no separators at the edges, no `.`/`..` segments. */
function isSlashRelPath(key: string): boolean {
    if (!key || key.includes('\\') || key.includes('\0') || key.startsWith('/') || /^[A-Za-z]:\//.test(key)) {
        return false;
    }
    return key.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

/** Byte-order sort so the on-disk map is stable regardless of the caller's insertion order. */
function sortFileMap(files: Record<string, string>): Record<string, string> {
    return Object.fromEntries(
        Object.entries(files).sort(([a], [b]) => Buffer.compare(Buffer.from(a, 'utf-8'), Buffer.from(b, 'utf-8'))),
    );
}

/** Non-empty string, `undefined` when absent, `null` when present but malformed. */
function requiredString(rec: Record<string, unknown>, key: string): string | null {
    const value = rec[key];
    return typeof value === 'string' && value.length > 0 ? value : null;
}

function optionalString(rec: Record<string, unknown>, key: string): string | undefined | null {
    const value = rec[key];
    if (value === undefined) return undefined;
    return typeof value === 'string' && value.length > 0 ? value : null;
}
