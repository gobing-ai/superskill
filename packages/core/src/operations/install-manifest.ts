import { randomUUID } from 'node:crypto';
import {
    existsSync,
    lstatSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    renameSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { assertSafePathSegment } from '../content/identity';
import { computeContentHash, computeStructuredContentHash } from '../skills-ecosystem/locks';

/** Directory names skipped when walking an upstream plugin source tree. */
const DEFAULT_SKIP_DIR_NAMES = new Set(['.git', 'node_modules', '.rulesync', '.targets']);

/** Install channel recorded in a provenance manifest. */
export type InstallChannel = 'bundled' | 'marketplace';

/** Per-file SHA-256 map plus ADR-031 canonical hash over the same snapshot. */
export interface InstallSnapshot {
    /** Slash-normalized relative path → SHA-256 hex of the file bytes. */
    files: Record<string, string>;
    /** Length-framed canonical hash over the sorted path/content set. */
    canonicalHash: string;
}

/** Source metadata install already resolved — consumed by the update verb (task 0124). */
export interface InstallSourceMetadata {
    plugin: string;
    channel: InstallChannel;
    upstreamVersion: string;
    marketplaceLocator?: string;
    /** Git tree SHA from remote materialization, when known. */
    resolvedRef?: string;
}

/** Schema version 1 provenance manifest written per target + plugin. */
export interface InstallManifestV1 {
    schemaVersion: 1;
    plugin: string;
    target: string;
    channel: InstallChannel;
    upstreamVersion: string;
    marketplaceLocator?: string;
    resolvedRef?: string;
    installedAt: string;
    superskillVersion: string;
    installed: InstallSnapshot;
    upstream: InstallSnapshot;
    /** grok-bot only (task 0128): how the Bot catalog was materialized. */
    grokBot?: { materialize: 'bridge' | 'full' };
}

/**
 * Derive the collision-safe manifest path for one plugin/target under a scope root.
 *
 * @param scopeRoot Explicit `outputRoot`, otherwise user home (global) or cwd (project).
 * @param target Target agent id (single path segment).
 * @param plugin Plugin id (single path segment).
 * @returns Absolute path to `.superskill-manifest.json`.
 */
export function installManifestPath(scopeRoot: string, target: string, plugin: string): string {
    assertSafePathSegment(target, 'target name');
    assertSafePathSegment(plugin, 'plugin name');
    return join(resolve(scopeRoot), '.superskill', 'manifests', target, plugin, '.superskill-manifest.json');
}

/**
 * Recursively list regular files under `root`, skipping configured directory names
 * and any symlink / special file. Paths are absolute.
 *
 * @param root Directory to walk.
 * @param options.skipDirNames Extra directory names to skip (merged with `.git` / `node_modules`).
 * @returns Absolute paths of regular files, UTF-8-byte-sorted by slash-normalized relative path.
 */
export function listRegularFilesUnder(root: string, options: { skipDirNames?: ReadonlySet<string> } = {}): string[] {
    const resolvedRoot = resolve(root);
    if (!existsSync(resolvedRoot) || !lstatSync(resolvedRoot).isDirectory()) {
        return [];
    }
    const skip = new Set([...DEFAULT_SKIP_DIR_NAMES, ...(options.skipDirNames ?? [])]);
    const collected: string[] = [];
    walkRegularFiles(resolvedRoot, resolvedRoot, skip, collected);
    return sortByUtf8Rel(resolvedRoot, collected);
}

/**
 * Snapshot regular files as slash-normalized relative paths under `root`.
 * Rejects paths outside `root`. Skips symlinks and special files. Directories
 * are expanded to their regular-file descendants. The manifest file itself is
 * excluded when it appears in the inventory.
 *
 * @param root Scope or source root the relative paths are computed against.
 * @param files Absolute or root-relative paths owned by this install.
 * @returns Per-file SHA-256 map plus canonical hash.
 */
export function snapshotFiles(root: string, files: readonly string[]): InstallSnapshot {
    const resolvedRoot = resolve(root);
    const unique = new Map<string, string>();
    const manifestRelPrefix = '.superskill/';
    for (const file of files) {
        const abs = isAbsolute(file) ? resolve(file) : resolve(resolvedRoot, file);
        expandIntoMap(resolvedRoot, abs, unique, manifestRelPrefix);
    }
    const sortedRels = [...unique.keys()].sort((a, b) =>
        Buffer.compare(Buffer.from(a, 'utf-8'), Buffer.from(b, 'utf-8')),
    );
    const filesMap: Record<string, string> = {};
    const entries: Array<{ path: string; contents: Uint8Array }> = [];
    for (const rel of sortedRels) {
        const abs = unique.get(rel);
        if (!abs) continue;
        const bytes = readFileSync(abs);
        filesMap[rel] = computeContentHash(bytes);
        entries.push({ path: rel, contents: bytes });
    }
    return {
        files: filesMap,
        canonicalHash: computeStructuredContentHash(entries),
    };
}

/**
 * Read and validate a schema-v1 install manifest.
 *
 * @param path Absolute or relative path to `.superskill-manifest.json`.
 * @returns Parsed manifest.
 * @throws When the file is missing, not JSON, or fails schema validation.
 */
export function readInstallManifest(path: string): InstallManifestV1 {
    if (!existsSync(path)) {
        throw new Error(`Install manifest not found: ${path}`);
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(readFileSync(path, 'utf-8')) as unknown;
    } catch (err) {
        throw new Error(
            `Install manifest is not valid JSON: ${path}: ${err instanceof Error ? err.message : String(err)}`,
        );
    }
    return validateInstallManifest(parsed, path);
}

/**
 * Atomically replace the plugin/target manifest. Writes a sibling temp file then
 * renames it over the destination — the previous file is never unlinked first.
 *
 * @param scopeRoot Scope root the registry lives under.
 * @param target Target agent id.
 * @param plugin Plugin id.
 * @param manifest Schema-v1 body (plugin/target must match the path segments).
 * @returns Absolute path written.
 */
export function writeInstallManifest(
    scopeRoot: string,
    target: string,
    plugin: string,
    manifest: InstallManifestV1,
): string {
    if (manifest.plugin !== plugin) {
        throw new Error(`Install manifest plugin '${manifest.plugin}' does not match path segment '${plugin}'`);
    }
    if (manifest.target !== target) {
        throw new Error(`Install manifest target '${manifest.target}' does not match path segment '${target}'`);
    }
    validateInstallManifest(manifest, 'in-memory');
    const dest = installManifestPath(scopeRoot, target, plugin);
    const dir = dirname(dest);
    mkdirSync(dir, { recursive: true });
    const payload = `${JSON.stringify(manifest, null, 2)}\n`;
    const temporaryPath = join(dir, `.superskill-manifest-${randomUUID()}.tmp`);
    try {
        writeFileSync(temporaryPath, payload, 'utf-8');
        renameSync(temporaryPath, dest);
    } finally {
        if (existsSync(temporaryPath)) {
            rmSync(temporaryPath, { force: true });
        }
    }
    return dest;
}

function expandIntoMap(
    resolvedRoot: string,
    abs: string,
    unique: Map<string, string>,
    manifestRelPrefix: string,
): void {
    if (!existsSync(abs)) {
        throw new Error(`Install snapshot missing file: ${abs}`);
    }
    const st = lstatSync(abs);
    if (st.isSymbolicLink()) {
        return;
    }
    if (st.isDirectory()) {
        const nested: string[] = [];
        walkRegularFiles(abs, abs, DEFAULT_SKIP_DIR_NAMES, nested);
        for (const child of nested) {
            expandIntoMap(resolvedRoot, child, unique, manifestRelPrefix);
        }
        return;
    }
    if (!st.isFile()) {
        return;
    }
    const rel = toSlashRel(resolvedRoot, abs);
    if (rel.startsWith(manifestRelPrefix) || rel.endsWith('/.superskill-manifest.json')) {
        return;
    }
    unique.set(rel, abs);
}

function walkRegularFiles(baseDir: string, currentDir: string, skipDirNames: ReadonlySet<string>, acc: string[]): void {
    for (const entry of readdirSync(currentDir)) {
        const fullPath = join(currentDir, entry);
        const st = lstatSync(fullPath);
        if (st.isSymbolicLink()) continue;
        if (st.isDirectory()) {
            if (skipDirNames.has(entry)) continue;
            walkRegularFiles(baseDir, fullPath, skipDirNames, acc);
            continue;
        }
        if (st.isFile()) acc.push(fullPath);
    }
}

function toSlashRel(root: string, abs: string): string {
    const rel = relative(root, abs);
    if (rel.startsWith('..') || rel === '') {
        throw new Error(`Install snapshot path escapes scope root: ${abs}`);
    }
    if (rel.includes('\0')) {
        throw new Error(`Install snapshot path contains a NUL: ${abs}`);
    }
    return rel.split(sep).join('/');
}

function sortByUtf8Rel(root: string, files: string[]): string[] {
    return [...files].sort((a, b) =>
        Buffer.compare(Buffer.from(toSlashRel(root, a), 'utf-8'), Buffer.from(toSlashRel(root, b), 'utf-8')),
    );
}

function validateInstallManifest(value: unknown, label: string): InstallManifestV1 {
    if (!value || typeof value !== 'object') {
        throw new Error(`Install manifest is not an object: ${label}`);
    }
    const rec = value as Record<string, unknown>;
    if (rec.schemaVersion !== 1) {
        throw new Error(`Install manifest schemaVersion must be 1: ${label}`);
    }
    const plugin = requiredString(rec, 'plugin', label);
    const target = requiredString(rec, 'target', label);
    assertManifestPathSegment(plugin, 'plugin', label);
    assertManifestPathSegment(target, 'target', label);
    const channel = rec.channel;
    if (channel !== 'bundled' && channel !== 'marketplace') {
        throw new Error(`Install manifest channel must be bundled or marketplace: ${label}`);
    }
    const upstreamVersion = requiredString(rec, 'upstreamVersion', label);
    const installedAt = requiredString(rec, 'installedAt', label);
    const superskillVersion = requiredString(rec, 'superskillVersion', label);
    const marketplaceLocator =
        rec.marketplaceLocator === undefined ? undefined : requiredString(rec, 'marketplaceLocator', label);
    const resolvedRef = rec.resolvedRef === undefined ? undefined : requiredString(rec, 'resolvedRef', label);
    let grokBot: InstallManifestV1['grokBot'];
    if (rec.grokBot !== undefined) {
        const g = rec.grokBot as Record<string, unknown> | null;
        if (!g || typeof g !== 'object' || (g.materialize !== 'bridge' && g.materialize !== 'full')) {
            throw new Error(`Install manifest grokBot.materialize must be bridge or full: ${label}`);
        }
        grokBot = { materialize: g.materialize };
    }
    return {
        schemaVersion: 1,
        plugin,
        target,
        channel,
        upstreamVersion,
        ...(marketplaceLocator !== undefined ? { marketplaceLocator } : {}),
        ...(resolvedRef !== undefined ? { resolvedRef } : {}),
        installedAt,
        superskillVersion,
        installed: validateSnapshot(rec.installed, `${label} installed`),
        upstream: validateSnapshot(rec.upstream, `${label} upstream`),
        ...(grokBot !== undefined ? { grokBot } : {}),
    };
}

function validateSnapshot(value: unknown, label: string): InstallSnapshot {
    if (!value || typeof value !== 'object') {
        throw new Error(`Install snapshot is not an object: ${label}`);
    }
    const rec = value as Record<string, unknown>;
    const canonicalHash = requiredString(rec, 'canonicalHash', label);
    if (!/^[0-9a-f]{64}$/.test(canonicalHash)) {
        throw new Error(`Install snapshot canonicalHash must be 64 hex chars: ${label}`);
    }
    if (!rec.files || typeof rec.files !== 'object' || Array.isArray(rec.files)) {
        throw new Error(`Install snapshot files must be an object: ${label}`);
    }
    const files: Record<string, string> = {};
    for (const [key, hash] of Object.entries(rec.files as Record<string, unknown>)) {
        const segments = key.split('/');
        if (
            !key ||
            key.includes('\\') ||
            key.includes('\0') ||
            key.startsWith('/') ||
            /^[A-Za-z]:\//.test(key) ||
            segments.some((segment) => segment === '' || segment === '.' || segment === '..')
        ) {
            throw new Error(`Install snapshot path is not slash-normalized and in-root: ${key}`);
        }
        if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash)) {
            throw new Error(`Install snapshot file hash must be 64 hex chars: ${label} ${key}`);
        }
        files[key] = hash;
    }
    return { files, canonicalHash };
}

function assertManifestPathSegment(value: string, field: 'plugin' | 'target', label: string): void {
    try {
        assertSafePathSegment(value, `${field} name`);
    } catch {
        throw new Error(`Install manifest ${field} must be a single path segment: ${label}`);
    }
}

function requiredString(rec: Record<string, unknown>, key: string, label: string): string {
    const value = rec[key];
    if (typeof value !== 'string' || value.length === 0) {
        throw new Error(`Install manifest ${key} must be a non-empty string: ${label}`);
    }
    return value;
}
