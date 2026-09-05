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
 * Only ENOENT means a lock is absent. Every other read failure is surfaced so callers
 * cannot replace operator state after misclassifying an unreadable path as a fresh lock.
 */
function isLockAbsenceCode(error: unknown): boolean {
    const code = (error as NodeJS.ErrnoException)?.code;
    return code === 'ENOENT';
}

/**
 * R3 on-disk guard for the raw writers: a caller-constructed lock object must not
 * clobber an on-disk lock whose version differs from the one this build understands
 * (newer OR older) — migration is an explicit act, never a silent overwrite. Only an
 * absent lock (see {@link isLockAbsenceCode}) is safe to (re)create: a corrupt or
 * unreadable on-disk lock blocks the write so original bytes are never replaced by a
 * fresh object (R4).
 */
async function assertOnDiskVersionMatches(
    lockPath: string,
    supported: number,
    kind: 'local' | 'global',
): Promise<void> {
    let content: string;
    try {
        content = await readFile(lockPath, 'utf-8');
    } catch (error) {
        if (isLockAbsenceCode(error)) return;
        throw new Error(
            `Cannot write ${kind} lock: on-disk lock at ${lockPath} is unreadable (${error instanceof Error ? error.message : String(error)}). Lock preserved untouched; repair or remove the file explicitly.`,
        );
    }
    let disk: unknown;
    try {
        disk = JSON.parse(content);
    } catch (error) {
        throw new Error(
            `Cannot write ${kind} lock: on-disk lock at ${lockPath} is corrupt (JSON parse error: ${error instanceof Error ? error.message : String(error)}). Lock preserved untouched; repair or remove the file explicitly.`,
        );
    }
    if (!disk || typeof disk !== 'object' || Array.isArray(disk)) {
        throw new Error(
            `Cannot write ${kind} lock: on-disk lock at ${lockPath} has an invalid top-level shape. Lock preserved untouched; repair or remove the file explicitly.`,
        );
    }
    const record = disk as { version?: unknown; skills?: unknown };
    if (typeof record.version !== 'number') {
        throw new Error(
            `Cannot write ${kind} lock: on-disk lock at ${lockPath} has an invalid version shape (${JSON.stringify(record.version)}). Lock preserved untouched; repair or remove the file explicitly.`,
        );
    }
    if (!record.skills || typeof record.skills !== 'object' || Array.isArray(record.skills)) {
        throw new Error(
            `Cannot write ${kind} lock: on-disk lock at ${lockPath} has an invalid skills shape. Lock preserved untouched; repair or remove the file explicitly.`,
        );
    }
    if (record.version !== supported) {
        throw new Error(
            `Cannot write ${kind} lock: on-disk lock version (${record.version}) differs from supported version (${supported}). Lock preserved untouched; migrate explicitly.`,
        );
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

// ── Per-scope mutation guard (R3/F3) ─────────────────────────────────────────
// Atomic rename prevents torn lock writes but not stale read-modify-write snapshots:
// two concurrent mutators both read the same base and one install silently vanishes
// from the lock. Mutating operations therefore hold one exclusive guard per lock path
// across the authoritative read, filesystem mutation, lock write, and transaction
// commit/rollback. The guard is an atomic same-parent mkdir, so it works across
// separate CLI processes; a same-process Promise.all of mutators serializes on it.

const MUTATION_GUARD_SUFFIX = '.mutation-lock';
const MUTATION_GUARD_MAX_WAIT_MS = 10_000;
const MUTATION_GUARD_RETRY_MS = 50;

/** Named contention error: the guard stayed held for the whole bounded wait. */
export class SkillMutationContentionError extends Error {
    constructor(lockPath: string) {
        super(
            `Skill lock contention: another process holds the mutation guard for '${lockPath}' ` +
                `(waited ${MUTATION_GUARD_MAX_WAIT_MS}ms). Retry the operation once the holder exits.`,
        );
        this.name = 'SkillMutationContentionError';
    }
}

function mutationGuardPath(lockPath: string): string {
    return `${lockPath}${MUTATION_GUARD_SUFFIX}`;
}

/** Best-effort dead-owner probe from the guard's owner metadata (PID + timestamp). */
async function mutationGuardOwnerIsDead(guardDir: string): Promise<boolean> {
    try {
        const raw = await readFile(join(guardDir, 'owner'), 'utf-8');
        const owner = JSON.parse(raw) as { pid?: unknown };
        if (typeof owner.pid !== 'number') return false;
        try {
            process.kill(owner.pid, 0);
            return false; // signal 0 delivered — owner alive
        } catch (error) {
            return (error as NodeJS.ErrnoException)?.code === 'ESRCH';
        }
    } catch {
        return false; // no readable metadata — treat as live (conservative)
    }
}

/**
 * Run `fn` while holding the exclusive per-lock mutation guard (R3). Acquisition is an
 * atomic exclusive-create `mkdir`; the wait is bounded at 10 seconds; a dead owner
 * (per PID metadata) permits one atomic rename-steal takeover. Release always happens
 * in `finally`, including on rollback paths.
 */
export async function withSkillMutationGuard<T>(lockPath: string, fn: () => Promise<T>): Promise<T> {
    const guardDir = mutationGuardPath(lockPath);
    await mkdir(dirname(guardDir), { recursive: true });
    const deadline = Date.now() + MUTATION_GUARD_MAX_WAIT_MS;
    let staleRecovered = false;
    let acquired = false;
    while (Date.now() < deadline) {
        try {
            await mkdir(guardDir); // no recursive: EEXIST is the held signal
            acquired = true;
            break;
        } catch (error) {
            if ((error as NodeJS.ErrnoException)?.code !== 'EEXIST') throw error;
            if (!staleRecovered && (await mutationGuardOwnerIsDead(guardDir))) {
                // Atomic steal: rename first so a competing waiter can never delete a
                // freshly (re)acquired guard. One takeover attempt per waiter.
                const stolen = `${guardDir}.stale-${randomUUID()}`;
                try {
                    await rename(guardDir, stolen);
                    staleRecovered = true;
                    await rm(stolen, { recursive: true, force: true }).catch(() => {});
                } catch {
                    // Another waiter won the steal (or the holder released) — keep retrying.
                }
                continue;
            }
            await new Promise((resolveSleep) => setTimeout(resolveSleep, MUTATION_GUARD_RETRY_MS));
        }
    }
    if (!acquired) throw new SkillMutationContentionError(lockPath);
    try {
        await writeFile(
            join(guardDir, 'owner'),
            `${JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() })}\n`,
            'utf-8',
        ).catch(() => {});
        return await fn();
    } finally {
        await rm(guardDir, { recursive: true, force: true }).catch(() => {});
    }
}

// ── Prototype-safe skill-key records (R5/F5) ─────────────────────────────────
// Sanitized identities are untrusted data; `__proto__` is a legal sanitizeName output.
// Plain object literals hand those keys to the inherited setter, silently orphaning the
// installation. Every accepted skills map is normalized into a null-prototype record so
// reads, writes, deletes, `in`, Object.keys, and JSON round-trips treat every identity
// as an own data key — without changing sanitizeName's vendor-compatible output.

function emptySkillRecord<T>(): Record<string, T> {
    return Object.create(null) as Record<string, T>;
}

/** Fresh local lock for a project with no prior state (null-prototype records, R5). */
function emptyLocalLock(): LocalSkillLockFile {
    return {
        version: LOCAL_LOCK_VERSION,
        skills: emptySkillRecord<LocalSkillLockEntry>(),
    };
}

/** Fresh global lock for a machine with no prior state (null-prototype records, R5). */
function emptyGlobalLock(): GlobalSkillLockFile {
    return {
        version: GLOBAL_LOCK_VERSION,
        skills: emptySkillRecord<GlobalSkillLockEntry>(),
        dismissed: emptySkillRecord<boolean>(),
    };
}

function toOwnKeyRecord<T>(skills: unknown): Record<string, T> {
    const record = emptySkillRecord<T>();
    if (skills && typeof skills === 'object' && !Array.isArray(skills)) {
        for (const [key, value] of Object.entries(skills as Record<string, T>)) {
            record[key] = value;
        }
    }
    return record;
}

/**
 * Read project local skill lock file.
 * Preserves newer/older lock files untouched with a warning flag (R3). Only an absent
 * lock (ENOENT) synthesizes the canonical empty state; any other unreadable/invalid file (R4/F4)
 * yields a warning-bearing lock with empty skills so downstream writers refuse to act
 * and the original bytes stay untouched.
 */
export async function readLocalLock(cwd?: string): Promise<LocalSkillLockFile> {
    const lockPath = getLocalLockPath(cwd);
    let content: string;
    try {
        content = await readFile(lockPath, 'utf-8');
    } catch (error) {
        if (isLockAbsenceCode(error)) return emptyLocalLock();
        return corruptLocalLock(lockPath, `read error: ${error instanceof Error ? error.message : String(error)}`);
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(content);
    } catch (error) {
        return corruptLocalLock(
            lockPath,
            `JSON parse error: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return corruptLocalLock(lockPath, 'top-level shape is not a JSON object');
    }
    const record = parsed as { version?: unknown; skills?: unknown };
    if (
        typeof record.version !== 'number' ||
        !record.skills ||
        typeof record.skills !== 'object' ||
        Array.isArray(record.skills)
    ) {
        return corruptLocalLock(lockPath, 'invalid version/skills shape');
    }
    const skills = toOwnKeyRecord<LocalSkillLockEntry>(record.skills);
    if (record.version > LOCAL_LOCK_VERSION) {
        return {
            ...(parsed as LocalSkillLockFile),
            skills,
            warning: `Local skill lock version (${record.version}) is newer than supported version (${LOCAL_LOCK_VERSION}). Lock preserved untouched.`,
        };
    }
    if (record.version < LOCAL_LOCK_VERSION) {
        // R3: never auto-wipe on version mismatch — the vendor's wipe-on-bump is
        // explicitly NOT ported. Preserve the older lock and flag it; writers
        // refuse warned locks, so migration is always an explicit caller act.
        return {
            ...(parsed as LocalSkillLockFile),
            skills,
            warning: `Local skill lock version (${record.version}) is older than current version (${LOCAL_LOCK_VERSION}). Lock preserved untouched; migrate explicitly.`,
        };
    }
    return { ...(parsed as LocalSkillLockFile), skills };
}

/** Corrupt/unreadable local lock: skills empty (nothing readable), warning present (R4). */
function corruptLocalLock(lockPath: string, reason: string): LocalSkillLockFile {
    return {
        version: LOCAL_LOCK_VERSION,
        skills: emptySkillRecord<LocalSkillLockEntry>(),
        warning: `Local skill lock at ${lockPath} is unreadable/corrupt (${reason}). Lock preserved untouched; repair or remove the file explicitly.`,
    };
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
    const sortedSkills = emptySkillRecord<LocalSkillLockEntry>();
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
 * Preserves newer/older lock files untouched with a warning flag (R3). Only an absent
 * lock (ENOENT) synthesizes the canonical empty state; any other unreadable/invalid file (R4/F4)
 * yields a warning-bearing lock with empty skills so downstream writers refuse to act
 * and the original bytes stay untouched.
 */
export async function readGlobalLock(
    env?: Record<string, string | undefined>,
    homeDir?: string,
): Promise<GlobalSkillLockFile> {
    const lockPath = getGlobalLockPath(env, homeDir);
    let content: string;
    try {
        content = await readFile(lockPath, 'utf-8');
    } catch (error) {
        if (isLockAbsenceCode(error)) return emptyGlobalLock();
        return corruptGlobalLock(lockPath, `read error: ${error instanceof Error ? error.message : String(error)}`);
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(content);
    } catch (error) {
        return corruptGlobalLock(
            lockPath,
            `JSON parse error: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return corruptGlobalLock(lockPath, 'top-level shape is not a JSON object');
    }
    const record = parsed as { version?: unknown; skills?: unknown; dismissed?: unknown };
    if (
        typeof record.version !== 'number' ||
        !record.skills ||
        typeof record.skills !== 'object' ||
        Array.isArray(record.skills)
    ) {
        return corruptGlobalLock(lockPath, 'invalid version/skills shape');
    }
    const skills = toOwnKeyRecord<GlobalSkillLockEntry>(record.skills);
    const dismissed = toOwnKeyRecord<boolean>(record.dismissed);
    if (record.version > GLOBAL_LOCK_VERSION) {
        return {
            ...(parsed as GlobalSkillLockFile),
            skills,
            dismissed,
            warning: `Global skill lock version (${record.version}) is newer than supported version (${GLOBAL_LOCK_VERSION}). Lock preserved untouched.`,
        };
    }
    if (record.version < GLOBAL_LOCK_VERSION) {
        // R3: vendor wipe-on-bump explicitly NOT ported — preserve + warn.
        return {
            ...(parsed as GlobalSkillLockFile),
            skills,
            dismissed,
            warning: `Global skill lock version (${record.version}) is older than current version (${GLOBAL_LOCK_VERSION}). Lock preserved untouched; migrate explicitly.`,
        };
    }
    return { ...(parsed as GlobalSkillLockFile), skills, dismissed };
}

/** Corrupt/unreadable global lock: skills/dismissed empty (nothing readable), warning present (R4). */
function corruptGlobalLock(lockPath: string, reason: string): GlobalSkillLockFile {
    return {
        version: GLOBAL_LOCK_VERSION,
        skills: emptySkillRecord<GlobalSkillLockEntry>(),
        dismissed: emptySkillRecord<boolean>(),
        warning: `Global skill lock at ${lockPath} is unreadable/corrupt (${reason}). Lock preserved untouched; repair or remove the file explicitly.`,
    };
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

    const sortedSkills = emptySkillRecord<GlobalSkillLockEntry>();
    for (const key of Object.keys(lock.skills).sort()) {
        const item = lock.skills[key];
        if (item) {
            sortedSkills[key] = item;
        }
    }

    const sortedDismissed = emptySkillRecord<boolean>();
    for (const key of Object.keys(lock.dismissed ?? {}).sort()) {
        const dismissedFlag = lock.dismissed?.[key];
        if (dismissedFlag !== undefined) {
            sortedDismissed[key] = dismissedFlag;
        }
    }

    const output: GlobalSkillLockFile = {
        version: GLOBAL_LOCK_VERSION,
        skills: sortedSkills,
        dismissed: sortedDismissed,
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
