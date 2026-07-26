import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { TARGETS, type Target } from '../targets';
import { discoverSkills, type Skill } from './discovery';
import { emitSkillForTargets, removeSkillFromTargets, resolveSkillsToRemove } from './emit';
import { type BlobSkill, cleanupTempDir, cloneRepo, tryBlobInstall } from './fetch';
import {
    EXCLUDE_DIRS,
    EXCLUDE_FILES,
    FilesystemTransaction,
    getCanonicalSkillsDir,
    isPathSafe,
    sanitizeName,
} from './installer';
import {
    computeCanonicalSkillFolderHash,
    readGlobalLock,
    readLocalLock,
    writeGlobalLock,
    writeLocalLock,
} from './locks';
import { getOwnerRepo, parseSource } from './source-parser';
import type { ParsedSource } from './types';

interface ResolvedSource {
    parsed: ParsedSource;
    lockSource: string;
    lockSkillPath?: string;
}

/** Parse once at the operation boundary; relative local paths are resolved against the requested cwd. */
function resolveSource(source: string, cwd: string, global: boolean): ResolvedSource {
    const resolvedLocal = resolve(cwd, source);
    const initialParse = parseSource(source);
    const parsed =
        existsSync(resolvedLocal) || initialParse.type === 'local' ? parseSource(resolvedLocal) : initialParse;
    const localPath = parsed.localPath ?? parsed.url;
    return {
        parsed,
        lockSource: global && parsed.type === 'local' ? localPath : source,
        ...(parsed.subpath ? { lockSkillPath: parsed.subpath } : {}),
    };
}

function resolveLockedSource(
    sourceInfo: { source: string; ref?: string; skillPath?: string },
    skillName: string,
    cwd: string,
    global: boolean,
): ResolvedSource {
    const resolved = resolveSource(sourceInfo.source, cwd, global);
    const lockedSubpath = sourceInfo.skillPath?.replace(/(?:^|[/\\])SKILL\.md$/i, '');
    return {
        ...resolved,
        ...(sourceInfo.skillPath ? { lockSkillPath: sourceInfo.skillPath } : {}),
        parsed: {
            ...resolved.parsed,
            ref: resolved.parsed.ref ?? sourceInfo.ref,
            subpath: resolved.parsed.subpath ?? (lockedSubpath || undefined),
            skillFilter: resolved.parsed.skillFilter ?? skillName,
        },
    };
}

function lockVersionError(warning: string): string {
    return `Cannot mutate skills because the lock version is incompatible: ${warning}`;
}

/** Options for adding skills from local directory or remote source. */
export interface AddSkillsOptions {
    skills?: string[];
    targets?: Target[];
    global?: boolean;
    mode?: 'symlink' | 'copy';
    listOnly?: boolean;
    dryRun?: boolean;
    cwd?: string;
    homeDir?: string;
    env?: Record<string, string | undefined>;
    fetchFn?: typeof fetch;
    cloneRepoFn?: typeof cloneRepo;
}

/** Item representing an installed skill land output. */
export interface InstalledSkillItem {
    name: string;
    canonicalPath: string;
    targets: Target[];
    skipped?: boolean;
}

/** Result envelope returned by addSkills operation. */
export interface AddSkillsResult {
    success: boolean;
    listOnly?: boolean;
    dryRun?: boolean;
    discovered?: Array<{ name: string; description: string; path: string }>;
    installed?: InstalledSkillItem[];
    error?: string;
}

/**
 * Add skill(s) from a local directory or GitHub repository slug/URL.
 */
export async function addSkills(source: string, options: AddSkillsOptions = {}): Promise<AddSkillsResult> {
    const global = options.global ?? false;
    const cwd = options.cwd || process.cwd();
    return addResolvedSkills(source, options, resolveSource(source, cwd, global));
}

async function addResolvedSkills(
    source: string,
    options: AddSkillsOptions,
    resolvedSource: ResolvedSource,
): Promise<AddSkillsResult> {
    const global = options.global ?? false;
    const cwd = options.cwd || process.cwd();
    const homeDir = options.homeDir;
    const env = options.env ?? process.env;
    const targetAgents = options.targets ?? [...TARGETS];
    const { parsed, lockSource, lockSkillPath } = resolvedSource;
    const isLocal = parsed.type === 'local';
    let discoveredSkills: Array<Skill | BlobSkill> = [];
    let isBlobResult = false;
    let tempDir: string | null = null;
    const globalLock = global ? await readGlobalLock(env, homeDir) : undefined;
    const localLock = global ? undefined : await readLocalLock(cwd);
    const lockWarning = globalLock?.warning ?? localLock?.warning;

    if (!options.listOnly && !options.dryRun && lockWarning) {
        return { success: false, error: lockVersionError(lockWarning) };
    }

    if (isLocal) {
        try {
            discoveredSkills = await discoverSkills(parsed.localPath ?? parsed.url, parsed.subpath, {
                includeInternal: true,
            });
        } catch (error) {
            return {
                success: false,
                error: `Failed to resolve skill source '${source}': ${
                    error instanceof Error ? error.message : String(error)
                }`,
            };
        }
    } else {
        if (parsed.type === 'well-known') {
            return {
                success: false,
                error: `Unsupported skill source '${source}': well-known providers are not available in this operation`,
            };
        }

        const ownerRepo = parsed.type === 'github' ? getOwnerRepo(parsed) : null;
        const blobRes = ownerRepo
            ? await tryBlobInstall(ownerRepo, {
                  subpath: parsed.subpath,
                  skillFilter: parsed.skillFilter,
                  ref: parsed.ref,
                  fetchFn: options.fetchFn,
                  includeInternal: true,
              })
            : null;

        if (blobRes?.skills.length) {
            discoveredSkills = blobRes.skills;
            isBlobResult = true;
        } else {
            try {
                tempDir = await (options.cloneRepoFn ?? cloneRepo)(parsed.url, parsed.ref, { timeoutMs: 30000 });
                discoveredSkills = await discoverSkills(tempDir, parsed.subpath, { includeInternal: true });
            } catch (err) {
                if (tempDir) {
                    await cleanupTempDir(tempDir);
                    tempDir = null;
                }
                return {
                    success: false,
                    error: `Failed to resolve skill source '${source}': ${err instanceof Error ? err.message : String(err)}`,
                };
            }
        }
    }

    try {
        if (parsed.skillFilter) {
            const sourceFilter = sanitizeName(parsed.skillFilter);
            discoveredSkills = discoveredSkills.filter((skill) => sanitizeName(skill.name) === sourceFilter);
        }

        if (discoveredSkills.length === 0) {
            return {
                success: false,
                error: `No skills found in source '${source}'`,
            };
        }

        if (options.skills && options.skills.length > 0) {
            const targetSlugs = new Set(options.skills.map((s) => sanitizeName(s)));
            discoveredSkills = discoveredSkills.filter((s) => targetSlugs.has(sanitizeName(s.name)));
        }

        if (options.listOnly) {
            return {
                success: true,
                listOnly: true,
                discovered: discoveredSkills.map((s) => ({
                    name: s.name,
                    description: s.description,
                    path: s.path,
                })),
            };
        }

        const installedItems: InstalledSkillItem[] = [];
        const transaction = new FilesystemTransaction();

        try {
            for (const skill of discoveredSkills) {
                const skillName = sanitizeName(skill.name);
                const skillSourceInput =
                    isBlobResult && 'repoPath' in skill
                        ? skill
                        : 'path' in skill
                          ? skill.path
                          : (parsed.localPath ?? parsed.url);

                if (options.dryRun) {
                    const canonicalBase = getCanonicalSkillsDir(global, cwd, homeDir);
                    installedItems.push({
                        name: skillName,
                        canonicalPath: resolve(canonicalBase, skillName),
                        targets: targetAgents,
                    });
                    continue;
                }

                const emitRes = await emitSkillForTargets(skillSourceInput, targetAgents, {
                    global,
                    cwd,
                    homeDir,
                    mode: options.mode,
                    env,
                    name: skillName,
                    transaction,
                });

                if (!emitRes.success) {
                    throw new Error(`Failed to emit skill '${skillName}': ${emitRes.error || 'Unknown error'}`);
                }

                const canonicalPath = emitRes.canonicalPath;
                const computedHash = await computeCanonicalSkillFolderHash(canonicalPath);

                if (global && globalLock) {
                    const now = new Date().toISOString();
                    const existing = globalLock.skills[skillName];
                    globalLock.skills[skillName] = {
                        source: lockSource,
                        sourceType: parsed.type,
                        sourceUrl: parsed.url,
                        ...(parsed.ref ? { ref: parsed.ref } : {}),
                        ...(lockSkillPath ? { skillPath: lockSkillPath } : {}),
                        skillFolderHash: computedHash,
                        installedAt: existing?.installedAt ?? now,
                        updatedAt: now,
                    };
                } else if (localLock) {
                    localLock.skills[skillName] = {
                        source: lockSource,
                        sourceUrl: parsed.url,
                        sourceType: parsed.type,
                        ...(parsed.ref ? { ref: parsed.ref } : {}),
                        ...(lockSkillPath ? { skillPath: lockSkillPath } : {}),
                        computedHash,
                    };
                }

                installedItems.push({
                    name: skillName,
                    canonicalPath,
                    targets: targetAgents,
                });
            }

            if (!options.dryRun) {
                if (global && globalLock) {
                    await writeGlobalLock(globalLock, env, homeDir);
                } else if (localLock) {
                    await writeLocalLock(localLock, cwd);
                }
            }
            await transaction.commit();

            return {
                success: true,
                dryRun: options.dryRun,
                installed: installedItems,
            };
        } catch (error) {
            try {
                await transaction.rollback();
            } catch (rollbackError) {
                return {
                    success: false,
                    error: `${error instanceof Error ? error.message : String(error)}; ${
                        rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
                    }`,
                };
            }
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    } finally {
        if (tempDir) {
            await cleanupTempDir(tempDir);
        }
    }
}

/** Item representing an installed skill entry returned by listSkills. */
export interface ListedSkillItem {
    name: string;
    source: string;
    hash: string;
    installedAt?: string;
    scope: 'global' | 'local';
}

/** Options for listing installed skills. */
export interface ListSkillsOptions {
    global?: boolean;
    cwd?: string;
    homeDir?: string;
    env?: Record<string, string | undefined>;
}

/** Result envelope returned by listSkills operation. */
export interface ListSkillsResult {
    success: boolean;
    scope: 'global' | 'local';
    skills: ListedSkillItem[];
}

/**
 * List installed skills from the lock file and canonical directory scan.
 */
export async function listSkills(options: ListSkillsOptions = {}): Promise<ListSkillsResult> {
    const global = options.global ?? false;
    const cwd = options.cwd || process.cwd();
    const env = options.env ?? process.env;
    const homeDir = options.homeDir;

    const items: ListedSkillItem[] = [];

    if (global) {
        const lock = await readGlobalLock(env, homeDir);
        for (const [name, entry] of Object.entries(lock.skills)) {
            items.push({
                name,
                source: entry.source,
                hash: entry.skillFolderHash,
                installedAt: entry.installedAt,
                scope: 'global',
            });
        }
        items.push(...(await scanCanonicalSkills(getCanonicalSkillsDir(true, cwd, homeDir), lock.skills, 'global')));
    } else {
        const lock = await readLocalLock(cwd);
        for (const [name, entry] of Object.entries(lock.skills)) {
            items.push({
                name,
                source: entry.source,
                hash: entry.computedHash,
                scope: 'local',
            });
        }
        items.push(...(await scanCanonicalSkills(getCanonicalSkillsDir(false, cwd, homeDir), lock.skills, 'local')));
    }

    return {
        success: true,
        scope: global ? 'global' : 'local',
        skills: items,
    };
}

/** Scan the canonical directory for on-disk skills absent from the lock. */
async function scanCanonicalSkills(
    canonicalDir: string,
    lockSkills: Record<string, unknown>,
    scope: 'global' | 'local',
): Promise<ListedSkillItem[]> {
    const items: ListedSkillItem[] = [];
    if (!existsSync(canonicalDir)) {
        return items;
    }
    const entries = await readdir(canonicalDir, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.isDirectory() && !(entry.name in lockSkills)) {
            const skillName = sanitizeName(entry.name);
            const folderPath = resolve(canonicalDir, skillName);
            if (isPathSafe(canonicalDir, folderPath)) {
                try {
                    const hash = await computeCanonicalSkillFolderHash(folderPath);
                    items.push({
                        name: skillName,
                        source: 'disk-scan',
                        hash,
                        scope,
                    });
                } catch {
                    // Ignore corrupted folder scan errors
                }
            }
        }
    }
    return items;
}

/** Options for removing installed skills. */
export interface RemoveSkillsOptions {
    global?: boolean;
    cwd?: string;
    homeDir?: string;
    targets?: Target[];
    env?: Record<string, string | undefined>;
}

/** Result envelope returned by removeSkills operation. */
export interface RemoveSkillsResult {
    success: boolean;
    removed: string[];
    error?: string;
}

/**
 * Remove specified skill(s) across all targets and lock files.
 */
export async function removeSkills(names: string[], options: RemoveSkillsOptions = {}): Promise<RemoveSkillsResult> {
    const global = options.global ?? false;
    const cwd = options.cwd || process.cwd();
    const homeDir = options.homeDir;
    const env = options.env ?? process.env;
    const targets = options.targets ?? [...TARGETS];

    const globalLock = global ? await readGlobalLock(env, homeDir) : undefined;
    const localLock = global ? undefined : await readLocalLock(cwd);
    const lock = globalLock ?? localLock;
    if (!lock) {
        return { success: false, removed: [], error: 'Failed to load skill lock' };
    }
    if (lock.warning) {
        return { success: false, removed: [], error: lockVersionError(lock.warning) };
    }

    const lockKeys = Object.keys(lock.skills);
    const identities = names.map((rawName) => {
        const matched = resolveSkillsToRemove([rawName], [rawName, ...lockKeys], lockKeys)[0];
        return matched ?? sanitizeName(rawName);
    });
    const transaction = new FilesystemTransaction();
    const removedList: string[] = [];

    try {
        for (const identity of [...new Set(identities)]) {
            const removeResult = await removeSkillFromTargets(identity, targets, {
                global,
                cwd,
                homeDir,
                env,
                lockKeys,
                transaction,
            });
            if (!removeResult.success) {
                throw new Error(
                    `Failed to remove skill '${identity}': ${removeResult.error ?? 'filesystem mutation failed'}`,
                );
            }

            delete lock.skills[removeResult.skillName];
            removedList.push(removeResult.skillName);
        }

        if (global && globalLock) {
            await writeGlobalLock(globalLock, env, homeDir);
        } else if (localLock) {
            await writeLocalLock(localLock, cwd);
        }
        await transaction.commit();
    } catch (error) {
        try {
            await transaction.rollback();
        } catch (rollbackError) {
            return {
                success: false,
                removed: [],
                error: `${error instanceof Error ? error.message : String(error)}; ${
                    rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
                }`,
            };
        }
        return {
            success: false,
            removed: [],
            error: error instanceof Error ? error.message : String(error),
        };
    }

    return {
        success: true,
        removed: removedList,
    };
}

/** Options for updating installed skills. */
export interface UpdateSkillsOptions {
    global?: boolean;
    cwd?: string;
    homeDir?: string;
    fetchFn?: typeof fetch;
    env?: Record<string, string | undefined>;
    cloneRepoFn?: typeof cloneRepo;
}

/** Item representing update outcome for an installed skill. */
export interface UpdatedSkillItem {
    name: string;
    updated: boolean;
    oldHash?: string;
    newHash?: string;
    reason?: string;
}

/** Result envelope returned by updateSkills operation. */
export interface UpdateSkillsResult {
    success: boolean;
    updated: UpdatedSkillItem[];
    error?: string;
}

/**
 * Update specified (or all) skills based on content/tree hash changes.
 */
export async function updateSkills(names?: string[], options: UpdateSkillsOptions = {}): Promise<UpdateSkillsResult> {
    const global = options.global ?? false;
    const cwd = options.cwd || process.cwd();
    const env = options.env ?? process.env;

    const lock = global ? await readGlobalLock(env, options.homeDir) : await readLocalLock(cwd);
    if (lock.warning) {
        return { success: false, updated: [], error: lockVersionError(lock.warning) };
    }

    const skillNames: string[] = [];
    if (names && names.length > 0) {
        const lockKeys = Object.keys(lock.skills);
        for (const name of names) {
            skillNames.push(resolveSkillsToRemove([name], lockKeys, lockKeys)[0] ?? sanitizeName(name));
        }
    } else {
        skillNames.push(...Object.keys(lock.skills));
    }

    const results: UpdatedSkillItem[] = [];
    let hadFailure = false;

    for (const name of skillNames) {
        const sourceInfo = lock.skills[name];
        if (!sourceInfo) {
            results.push({ name, updated: false, reason: 'Not found in lock file' });
            hadFailure = true;
            continue;
        }

        const source = sourceInfo.source;
        const oldHash = 'skillFolderHash' in sourceInfo ? sourceInfo.skillFolderHash : sourceInfo.computedHash;
        const resolvedSource = resolveLockedSource(sourceInfo, name, cwd, global);

        // No-op contract: when the source content hash still equals the stored hash, skip the
        // reinstall + re-emit entirely. Any hashing failure falls through to a full reinstall,
        // so an undecidable source never produces a false no-op.
        const sourceHash = await computeSourceSkillHash(resolvedSource.parsed, name, {
            fetchFn: options.fetchFn,
        });
        if (sourceHash !== undefined && sourceHash === oldHash) {
            results.push({ name, updated: false, oldHash, newHash: oldHash, reason: 'Already up to date' });
            continue;
        }

        const addRes = await addResolvedSkills(
            source,
            {
                skills: [name],
                global,
                cwd,
                homeDir: options.homeDir,
                env,
                fetchFn: options.fetchFn,
                cloneRepoFn: options.cloneRepoFn,
            },
            resolvedSource,
        );

        if (!addRes.success || !addRes.installed || addRes.installed.length === 0) {
            results.push({ name, updated: false, reason: addRes.error || 'Failed to update from source' });
            hadFailure = true;
            continue;
        }

        const installedPath = addRes.installed?.[0]?.canonicalPath;
        if (!installedPath) {
            results.push({ name, updated: false, reason: 'Failed to find installed path' });
            hadFailure = true;
            continue;
        }

        const newHash = await computeCanonicalSkillFolderHash(installedPath);
        const updated = oldHash !== newHash;

        results.push({
            name,
            updated,
            oldHash,
            newHash,
            reason: updated ? 'Updated to new version' : 'Already up to date',
        });
    }

    return {
        success: !hadFailure,
        updated: results,
        ...(hadFailure
            ? {
                  error: `Failed to update ${results
                      .filter((item) => !item.updated && item.reason !== 'Already up to date')
                      .map((item) => `${item.name}: ${item.reason ?? 'unknown failure'}`)
                      .join('; ')}`,
              }
            : {}),
    };
}

/**
 * Best-effort content hash of a skill's current source, comparable to the hash stored at
 * install time. Returns undefined when the source cannot be hashed without installing — the
 * caller then falls back to a full reinstall (never a false no-op).
 */
async function computeSourceSkillHash(
    parsed: ParsedSource,
    skillName: string,
    opts: { fetchFn?: typeof fetch },
): Promise<string | undefined> {
    if (parsed.type === 'local') {
        try {
            const discovered = await discoverSkills(parsed.localPath ?? parsed.url, parsed.subpath, {
                includeInternal: true,
            });
            const match = discovered.find((s) => sanitizeName(s.name) === sanitizeName(skillName));
            if (!match) {
                return undefined;
            }
            // Hash with copyDir's exclusion sets so the source hash is comparable to the
            // canonical-copy hash recorded by addSkills.
            return await computeCanonicalSkillFolderHash(match.path, {
                excludeFiles: EXCLUDE_FILES,
                excludeDirs: EXCLUDE_DIRS,
            });
        } catch {
            return undefined;
        }
    }

    try {
        if (parsed.type !== 'github') {
            return undefined;
        }
        const ownerRepo = getOwnerRepo(parsed);
        if (!ownerRepo) {
            return undefined;
        }
        const blobRes = await tryBlobInstall(ownerRepo, {
            fetchFn: opts.fetchFn,
            includeInternal: true,
            subpath: parsed.subpath,
            ref: parsed.ref,
            skillFilter: parsed.skillFilter ?? skillName,
        });
        const match = blobRes?.skills.find((s) => sanitizeName(s.name) === sanitizeName(skillName));
        return match?.snapshotHash;
    } catch {
        return undefined;
    }
}
