import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { TARGETS, type Target } from '../targets';
import { discoverSkills, type Skill } from './discovery';
import { emitSkillForTargets, removeSkillFromTargets } from './emit';
import { type BlobSkill, cleanupTempDir, cloneRepo, parseGitHubRepoUrl, tryBlobInstall } from './fetch';
import { EXCLUDE_DIRS, EXCLUDE_FILES, getCanonicalSkillsDir, isPathSafe, sanitizeName } from './installer';
import {
    addSkillToGlobalLock,
    addSkillToLocalLock,
    computeCanonicalSkillFolderHash,
    readGlobalLock,
    readLocalLock,
    removeSkillFromGlobalLock,
    removeSkillFromLocalLock,
} from './locks';

/** Derive the owner/repo slug and clone URL from a GitHub source string. */
function deriveRepoInfo(source: string): { ownerRepo: string; repoInfoUrl: string } {
    const repoInfo = parseGitHubRepoUrl(source);
    const ownerRepo = repoInfo ? repoInfo.slug : source.replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '');
    const repoInfoUrl = repoInfo ? repoInfo.sshUrl : `https://github.com/${ownerRepo}.git`;
    return { ownerRepo, repoInfoUrl };
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
    const homeDir = options.homeDir;
    const env = options.env ?? process.env;
    const targetAgents = options.targets ?? [...TARGETS];

    const resolvedLocal = resolve(cwd, source);
    const isLocal = existsSync(resolvedLocal);
    let discoveredSkills: Array<Skill | BlobSkill> = [];
    let isBlobResult = false;
    let tempDir: string | null = null;
    // Local sources record themselves as sourceUrl; only remote sources derive a clone URL.
    const { ownerRepo, repoInfoUrl } = isLocal ? { ownerRepo: source, repoInfoUrl: source } : deriveRepoInfo(source);

    if (isLocal) {
        discoveredSkills = await discoverSkills(resolvedLocal, undefined, { includeInternal: true });
    } else {
        const blobRes = await tryBlobInstall(ownerRepo, {
            fetchFn: options.fetchFn,
            includeInternal: true,
        });

        if (blobRes && blobRes.skills.length > 0) {
            discoveredSkills = blobRes.skills;
            isBlobResult = true;
        } else {
            try {
                tempDir = await cloneRepo(repoInfoUrl, undefined, { timeoutMs: 30000 });
                discoveredSkills = await discoverSkills(tempDir, undefined, { includeInternal: true });
            } catch (err) {
                return {
                    success: false,
                    error: `Failed to resolve skill source '${source}': ${err instanceof Error ? err.message : String(err)}`,
                };
            }
        }
    }

    try {
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

        for (const skill of discoveredSkills) {
            const skillName = sanitizeName(skill.name);
            const skillSourceInput =
                isBlobResult && 'repoPath' in skill ? skill : 'path' in skill ? skill.path : resolvedLocal;

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
            });

            if (!emitRes.success) {
                return {
                    success: false,
                    error: `Failed to emit skill '${skillName}': ${emitRes.error || 'Unknown error'}`,
                };
            }

            const canonicalPath = emitRes.canonicalPath;
            const computedHash = await computeCanonicalSkillFolderHash(canonicalPath);

            if (global) {
                await addSkillToGlobalLock(
                    skillName,
                    {
                        source,
                        sourceType: isBlobResult ? 'github' : 'local',
                        sourceUrl: repoInfoUrl,
                        skillFolderHash: computedHash,
                    },
                    { env, homeDir },
                );
            } else {
                await addSkillToLocalLock(
                    skillName,
                    {
                        source,
                        sourceUrl: repoInfoUrl,
                        sourceType: isBlobResult ? 'github' : 'local',
                        computedHash,
                    },
                    { cwd },
                );
            }

            installedItems.push({
                name: skillName,
                canonicalPath,
                targets: targetAgents,
            });
        }

        return {
            success: true,
            dryRun: options.dryRun,
            installed: installedItems,
        };
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

    const removedList: string[] = [];

    for (const rawName of names) {
        const skillName = sanitizeName(rawName);
        await removeSkillFromTargets(skillName, targets, { global, cwd, homeDir, env });

        if (global) {
            await removeSkillFromGlobalLock(skillName, env, homeDir);
        } else {
            await removeSkillFromLocalLock(skillName, cwd);
        }
        removedList.push(skillName);
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
}

/**
 * Update specified (or all) skills based on content/tree hash changes.
 */
export async function updateSkills(names?: string[], options: UpdateSkillsOptions = {}): Promise<UpdateSkillsResult> {
    const global = options.global ?? false;
    const cwd = options.cwd || process.cwd();
    const env = options.env ?? process.env;

    const lock = global ? await readGlobalLock(env, options.homeDir) : await readLocalLock(cwd);

    const skillNames: string[] = [];
    if (names && names.length > 0) {
        skillNames.push(...names.map((n) => sanitizeName(n)));
    } else {
        skillNames.push(...Object.keys(lock.skills));
    }

    const results: UpdatedSkillItem[] = [];

    for (const name of skillNames) {
        const sourceInfo = lock.skills[name];
        if (!sourceInfo) {
            results.push({ name, updated: false, reason: 'Not found in lock file' });
            continue;
        }

        const source = sourceInfo.source;
        const oldHash = 'skillFolderHash' in sourceInfo ? sourceInfo.skillFolderHash : sourceInfo.computedHash;

        // No-op contract: when the source content hash still equals the stored hash, skip the
        // reinstall + re-emit entirely. Any hashing failure falls through to a full reinstall,
        // so an undecidable source never produces a false no-op.
        const sourceHash = await computeSourceSkillHash(source, name, { cwd, fetchFn: options.fetchFn });
        if (sourceHash !== undefined && sourceHash === oldHash) {
            results.push({ name, updated: false, oldHash, newHash: oldHash, reason: 'Already up to date' });
            continue;
        }

        const addRes = await addSkills(source, {
            skills: [name],
            global,
            cwd,
            homeDir: options.homeDir,
            env,
            fetchFn: options.fetchFn,
        });

        if (!addRes.success || !addRes.installed || addRes.installed.length === 0) {
            results.push({ name, updated: false, reason: addRes.error || 'Failed to update from source' });
            continue;
        }

        const installedPath = addRes.installed?.[0]?.canonicalPath;
        if (!installedPath) {
            results.push({ name, updated: false, reason: 'Failed to find installed path' });
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
        success: true,
        updated: results,
    };
}

/**
 * Best-effort content hash of a skill's current source, comparable to the hash stored at
 * install time. Returns undefined when the source cannot be hashed without installing — the
 * caller then falls back to a full reinstall (never a false no-op).
 */
async function computeSourceSkillHash(
    source: string,
    skillName: string,
    opts: { cwd: string; fetchFn?: typeof fetch },
): Promise<string | undefined> {
    const resolvedLocal = resolve(opts.cwd, source);
    if (existsSync(resolvedLocal)) {
        try {
            const discovered = await discoverSkills(resolvedLocal, undefined, { includeInternal: true });
            const match = discovered.find((s) => sanitizeName(s.name) === skillName);
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
        const { ownerRepo } = deriveRepoInfo(source);
        const blobRes = await tryBlobInstall(ownerRepo, {
            fetchFn: opts.fetchFn,
            includeInternal: true,
            skillFilter: skillName,
        });
        const match = blobRes?.skills.find((s) => sanitizeName(s.name) === skillName);
        return match?.snapshotHash;
    } catch {
        return undefined;
    }
}
