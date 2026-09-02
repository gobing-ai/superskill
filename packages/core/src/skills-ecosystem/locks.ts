import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, relative } from 'node:path';

/** Default filename for project-scoped local skills lock files. */
export const LOCAL_LOCK_FILE_NAME = 'skills-lock.json';

/** Supported schema version for local skills lock files (v1). */
export const LOCAL_LOCK_VERSION = 1;

/** Default filename for user-scoped global skills lock files. */
export const GLOBAL_LOCK_FILE_NAME = '.skill-lock.json';

/** Supported schema version for global skills lock files (v3). */
export const GLOBAL_LOCK_VERSION = 3;

/**
 * Single skill entry in the local (project) lock file (v1).
 */
export interface LocalSkillLockEntry {
    source: string;
    sourceUrl?: string;
    ref?: string;
    sourceType: string;
    skillPath?: string;
    computedHash: string;
    subagents?: string[];
}

/**
 * Structure of project-scoped ./skills-lock.json (v1).
 */
export interface LocalSkillLockFile {
    version: number;
    skills: Record<string, LocalSkillLockEntry>;
    warning?: string;
}

/**
 * Single skill entry in global ~/.agents/.skill-lock.json (v3).
 */
export interface GlobalSkillLockEntry {
    source: string;
    sourceType: string;
    sourceUrl: string;
    ref?: string;
    skillPath?: string;
    skillFolderHash: string;
    installedAt: string;
    updatedAt: string;
    pluginName?: string;
}

/**
 * Structure of global ~/.agents/.skill-lock.json (v3).
 */
export interface GlobalSkillLockFile {
    version: number;
    skills: Record<string, GlobalSkillLockEntry>;
    dismissed?: Record<string, boolean>;
    lastSelectedAgents?: string[];
    warning?: string;
}

/**
 * Alias for vendor compatibility representing a global skill lock entry.
 */
export type SkillLockEntry = GlobalSkillLockEntry;

/**
 * Alias for vendor compatibility representing a global skill lock file.
 */
export type SkillLockFile = GlobalSkillLockFile;

/**
 * Path to project local skills lock file.
 */
export function getLocalLockPath(cwd?: string): string {
    return join(cwd || process.cwd(), LOCAL_LOCK_FILE_NAME);
}

/**
 * Path to global skills lock file ($XDG_STATE_HOME/skills/.skill-lock.json or ~/.agents/.skill-lock.json).
 */
export function getGlobalLockPath(env?: Record<string, string | undefined>, homeDir?: string): string {
    const environ = env ?? process.env;
    const xdgStateHome = environ.XDG_STATE_HOME?.trim();
    if (xdgStateHome) {
        return join(xdgStateHome, 'skills', GLOBAL_LOCK_FILE_NAME);
    }
    return join(homeDir ?? homedir(), '.agents', GLOBAL_LOCK_FILE_NAME);
}

/** Alias function for vendor compatibility pointing to getGlobalLockPath. */
export const getSkillLockPath = getGlobalLockPath;

/**
 * Validate that a directory path points to a canonical skill folder and NOT a translated target directory.
 */
export function isCanonicalSkillPath(path: string): boolean {
    const normalized = path.split('\\').join('/');
    const translatedSegmentPatterns = [
        '/.hermes/skills/',
        '/.hermes/skills',
        '/.hermes/',
        '/.grok/skills/',
        '/.grok/skills',
        '/.grok/',
        '/translated/',
    ];
    for (const pattern of translatedSegmentPatterns) {
        if (normalized.includes(pattern)) {
            return false;
        }
    }
    return true;
}

/**
 * Compute a deterministic SHA-256 over path/content pairs with unambiguous length framing.
 */
export function computeStructuredContentHash(
    entries: ReadonlyArray<{ path: string; contents: string | Uint8Array }>,
): string {
    const hash = createHash('sha256');
    const framedEntries = entries
        .map((entry) => ({
            pathBytes: Buffer.from(entry.path, 'utf-8'),
            contentBytes: typeof entry.contents === 'string' ? Buffer.from(entry.contents, 'utf-8') : entry.contents,
        }))
        .sort((a, b) => Buffer.compare(a.pathBytes, b.pathBytes));

    for (const { pathBytes, contentBytes } of framedEntries) {
        const pathLength = Buffer.allocUnsafe(8);
        const contentLength = Buffer.allocUnsafe(8);
        pathLength.writeBigUInt64BE(BigInt(pathBytes.byteLength));
        contentLength.writeBigUInt64BE(BigInt(contentBytes.byteLength));
        hash.update(pathLength);
        hash.update(pathBytes);
        hash.update(contentLength);
        hash.update(contentBytes);
    }
    return hash.digest('hex');
}

/**
 * Compute SHA-256 content hash of all files in a CANONICAL skill directory.
 * Enforces the hash invariant: throws if provided a translated skill path.
 * Optional exclusion sets mirror copyDir semantics so a source directory can be
 * hashed comparably to the canonical copy produced from it (update no-op check).
 */
export async function computeCanonicalSkillFolderHash(
    canonicalSkillDir: string,
    opts?: { excludeFiles?: ReadonlySet<string>; excludeDirs?: ReadonlySet<string> },
): Promise<string> {
    if (!isCanonicalSkillPath(canonicalSkillDir)) {
        throw new Error(
            `Lock operations accept only canonical skill folder paths; received translated path: ${canonicalSkillDir}`,
        );
    }

    const files: Array<{ relativePath: string; content: Buffer }> = [];
    await collectFiles(canonicalSkillDir, canonicalSkillDir, files, opts);

    return computeStructuredContentHash(files.map((file) => ({ path: file.relativePath, contents: file.content })));
}

/** Alias for computeCanonicalSkillFolderHash for vendor compatibility. */
export const computeSkillFolderHash = computeCanonicalSkillFolderHash;

async function collectFiles(
    baseDir: string,
    currentDir: string,
    results: Array<{ relativePath: string; content: Buffer }>,
    opts?: { excludeFiles?: ReadonlySet<string>; excludeDirs?: ReadonlySet<string> },
): Promise<void> {
    const entries = await readdir(currentDir, { withFileTypes: true });

    await Promise.all(
        entries.map(async (entry) => {
            const fullPath = join(currentDir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === '.git' || entry.name === 'node_modules' || opts?.excludeDirs?.has(entry.name))
                    return;
                await collectFiles(baseDir, fullPath, results, opts);
            } else if (entry.isFile()) {
                if (opts?.excludeFiles?.has(entry.name)) return;
                const content = await readFile(fullPath);
                const relativePath = relative(baseDir, fullPath).split('\\').join('/');
                results.push({ relativePath, content });
            }
        }),
    );
}

/**
 * Compute SHA-256 hash of UTF-8 text or raw file bytes.
 *
 * @param content String (hashed as UTF-8) or on-disk bytes.
 * @returns 64-character lowercase hex digest.
 */
export function computeContentHash(content: string | Uint8Array): string {
    const hash = createHash('sha256');
    if (typeof content === 'string') {
        hash.update(content, 'utf-8');
    } else {
        hash.update(content);
    }
    return hash.digest('hex');
}

/**
 * R3 on-disk guard for the raw writers: a caller-constructed lock object must not
 * clobber an on-disk lock whose version differs from the one this build understands
 * (newer OR older) — migration is an explicit act, never a silent overwrite. A
 * missing or unparseable file is safe to (re)create.
 */
async function assertOnDiskVersionMatches(
    lockPath: string,
    supported: number,
    kind: 'local' | 'global',
): Promise<void> {
    try {
        const disk = JSON.parse(await readFile(lockPath, 'utf-8')) as { version?: unknown };
        if (typeof disk.version === 'number' && disk.version !== supported) {
            throw new Error(
                `Cannot write ${kind} lock: on-disk lock version (${disk.version}) differs from supported version (${supported}). Lock preserved untouched; migrate explicitly.`,
            );
        }
    } catch (error) {
        if (error instanceof Error && error.message.startsWith('Cannot write')) throw error;
        // Missing or corrupt file: writing a fresh lock is the recovery path.
    }
}

async function writeLockAtomically(lockPath: string, content: string): Promise<void> {
    await mkdir(dirname(lockPath), { recursive: true });
    const temporaryPath = join(dirname(lockPath), `.superskill-lock-${randomUUID()}`);
    try {
        await writeFile(temporaryPath, content, 'utf-8');
        await rename(temporaryPath, lockPath);
    } finally {
        await rm(temporaryPath, { force: true }).catch(() => {});
    }
}

/**
 * Read project local skill lock file.
 * Preserves newer lock files untouched with a warning flag (R3).
 */
export async function readLocalLock(cwd?: string): Promise<LocalSkillLockFile> {
    const lockPath = getLocalLockPath(cwd);
    try {
        const content = await readFile(lockPath, 'utf-8');
        const parsed = JSON.parse(content) as LocalSkillLockFile;

        if (typeof parsed.version !== 'number' || !parsed.skills) {
            return { version: LOCAL_LOCK_VERSION, skills: {} };
        }

        if (parsed.version > LOCAL_LOCK_VERSION) {
            return {
                ...parsed,
                warning: `Local skill lock version (${parsed.version}) is newer than supported version (${LOCAL_LOCK_VERSION}). Lock preserved untouched.`,
            };
        }

        if (parsed.version < LOCAL_LOCK_VERSION) {
            // R3: never auto-wipe on version mismatch — the vendor's wipe-on-bump is
            // explicitly NOT ported. Preserve the older lock and flag it; writers
            // refuse warned locks, so migration is always an explicit caller act.
            return {
                ...parsed,
                warning: `Local skill lock version (${parsed.version}) is older than current version (${LOCAL_LOCK_VERSION}). Lock preserved untouched; migrate explicitly.`,
            };
        }

        return parsed;
    } catch {
        return { version: LOCAL_LOCK_VERSION, skills: {} };
    }
}

/**
 * Write project local skill lock file.
 * Refuses to overwrite newer lock versions, warned (mismatched) locks, and any
 * on-disk lock whose version differs from the supported one (R3).
 */
export async function writeLocalLock(lock: LocalSkillLockFile, cwd?: string): Promise<void> {
    if (lock.warning) {
        throw new Error(`Cannot write local lock: ${lock.warning}`);
    }
    if (lock.version !== LOCAL_LOCK_VERSION) {
        throw new Error(
            `Cannot write local lock: lock version (${lock.version}) differs from supported version (${LOCAL_LOCK_VERSION}).`,
        );
    }

    const lockPath = getLocalLockPath(cwd);
    await assertOnDiskVersionMatches(lockPath, LOCAL_LOCK_VERSION, 'local');
    const sortedSkills: Record<string, LocalSkillLockEntry> = {};
    for (const key of Object.keys(lock.skills).sort()) {
        const item = lock.skills[key];
        if (item) {
            sortedSkills[key] = item;
        }
    }

    const output: LocalSkillLockFile = {
        version: LOCAL_LOCK_VERSION,
        skills: sortedSkills,
    };

    await writeLockAtomically(lockPath, `${JSON.stringify(output, null, 2)}\n`);
}

/**
 * Add or update a skill in the local skill lock file.
 */
export async function addSkillToLocalLock(
    skillName: string,
    entry: LocalSkillLockEntry,
    opts?: { canonicalSkillDir?: string; cwd?: string },
): Promise<void> {
    let hash = entry.computedHash;
    if (opts?.canonicalSkillDir) {
        hash = await computeCanonicalSkillFolderHash(opts.canonicalSkillDir);
    } else if (!hash) {
        throw new Error('LocalSkillLockEntry requires computedHash or canonicalSkillDir');
    }

    const lock = await readLocalLock(opts?.cwd);
    lock.skills[skillName] = {
        ...entry,
        computedHash: hash,
    };
    await writeLocalLock(lock, opts?.cwd);
}

/**
 * Remove a skill from the local skill lock file.
 */
export async function removeSkillFromLocalLock(skillName: string, cwd?: string): Promise<boolean> {
    const lock = await readLocalLock(cwd);
    if (!(skillName in lock.skills)) {
        return false;
    }
    delete lock.skills[skillName];
    await writeLocalLock(lock, cwd);
    return true;
}

/**
 * Read global skill lock file.
 * Preserves newer lock files untouched with a warning flag (R3).
 */
export async function readGlobalLock(
    env?: Record<string, string | undefined>,
    homeDir?: string,
): Promise<GlobalSkillLockFile> {
    const lockPath = getGlobalLockPath(env, homeDir);
    try {
        const content = await readFile(lockPath, 'utf-8');
        const parsed = JSON.parse(content) as GlobalSkillLockFile;

        if (typeof parsed.version !== 'number' || !parsed.skills) {
            return { version: GLOBAL_LOCK_VERSION, skills: {}, dismissed: {} };
        }

        if (parsed.version > GLOBAL_LOCK_VERSION) {
            return {
                ...parsed,
                warning: `Global skill lock version (${parsed.version}) is newer than supported version (${GLOBAL_LOCK_VERSION}). Lock preserved untouched.`,
            };
        }

        if (parsed.version < GLOBAL_LOCK_VERSION) {
            // R3: vendor wipe-on-bump explicitly NOT ported — preserve + warn.
            return {
                ...parsed,
                warning: `Global skill lock version (${parsed.version}) is older than current version (${GLOBAL_LOCK_VERSION}). Lock preserved untouched; migrate explicitly.`,
            };
        }

        return parsed;
    } catch {
        return { version: GLOBAL_LOCK_VERSION, skills: {}, dismissed: {} };
    }
}

/** Alias for readGlobalLock for vendor compatibility. */
export const readSkillLock = readGlobalLock;

/**
 * Write global skill lock file.
 * Refuses to overwrite newer lock versions, warned (mismatched) locks, and any
 * on-disk lock whose version differs from the supported one (R3).
 */
export async function writeGlobalLock(
    lock: GlobalSkillLockFile,
    env?: Record<string, string | undefined>,
    homeDir?: string,
): Promise<void> {
    if (lock.warning) {
        throw new Error(`Cannot write global lock: ${lock.warning}`);
    }
    if (lock.version !== GLOBAL_LOCK_VERSION) {
        throw new Error(
            `Cannot write global lock: lock version (${lock.version}) differs from supported version (${GLOBAL_LOCK_VERSION}).`,
        );
    }

    const lockPath = getGlobalLockPath(env, homeDir);
    await assertOnDiskVersionMatches(lockPath, GLOBAL_LOCK_VERSION, 'global');

    const sortedSkills: Record<string, GlobalSkillLockEntry> = {};
    for (const key of Object.keys(lock.skills).sort()) {
        const item = lock.skills[key];
        if (item) {
            sortedSkills[key] = item;
        }
    }

    const output: GlobalSkillLockFile = {
        version: GLOBAL_LOCK_VERSION,
        skills: sortedSkills,
        ...(lock.dismissed ? { dismissed: lock.dismissed } : {}),
        ...(lock.lastSelectedAgents ? { lastSelectedAgents: lock.lastSelectedAgents } : {}),
    };

    await writeLockAtomically(lockPath, `${JSON.stringify(output, null, 2)}\n`);
}

/** Alias for writeGlobalLock for vendor compatibility. */
export const writeSkillLock = writeGlobalLock;

/**
 * Add or update a skill in the global skill lock file.
 */
export async function addSkillToGlobalLock(
    skillName: string,
    entry: Omit<GlobalSkillLockEntry, 'installedAt' | 'updatedAt'>,
    opts?: { canonicalSkillDir?: string; env?: Record<string, string | undefined>; homeDir?: string },
): Promise<void> {
    if (opts?.canonicalSkillDir && !isCanonicalSkillPath(opts.canonicalSkillDir)) {
        throw new Error(
            `Lock operations accept only canonical skill folder paths; received translated path: ${opts.canonicalSkillDir}`,
        );
    }

    const lock = await readGlobalLock(opts?.env, opts?.homeDir);
    const now = new Date().toISOString();
    const existing = lock.skills[skillName];

    lock.skills[skillName] = {
        ...entry,
        installedAt: existing?.installedAt ?? now,
        updatedAt: now,
    };

    await writeGlobalLock(lock, opts?.env, opts?.homeDir);
}

/** Alias for addSkillToGlobalLock for vendor compatibility. */
export const addSkillToLock = addSkillToGlobalLock;

/**
 * Remove a skill from the global skill lock file.
 */
export async function removeSkillFromGlobalLock(
    skillName: string,
    env?: Record<string, string | undefined>,
    homeDir?: string,
): Promise<boolean> {
    const lock = await readGlobalLock(env, homeDir);
    if (!(skillName in lock.skills)) {
        return false;
    }
    delete lock.skills[skillName];
    await writeGlobalLock(lock, env, homeDir);
    return true;
}

/** Alias for removeSkillFromGlobalLock for vendor compatibility. */
export const removeSkillFromLock = removeSkillFromGlobalLock;
