import { existsSync } from 'node:fs';
import { lstat, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { rewriteSkillReferences } from '../pipeline/rewrite-references';
import { translateSlashCommands } from '../pipeline/slash-command';
import type { Target } from '../targets';
import { getTargetAgentConfig, type InstallTier } from './agents';
import type { BlobSkill } from './fetch';
import {
    cleanAndCreateDir,
    copyDir,
    createSymlink,
    getCanonicalSkillsDir,
    installSkillCanonical,
    pathsOverlap,
    sanitizeName,
} from './installer';

/** Options controlling per-target skill emission. */
export interface EmitOptions {
    global?: boolean;
    cwd?: string;
    homeDir?: string;
    mode?: 'symlink' | 'copy';
    env?: Record<string, string | undefined>;
    /** Declared skill name override for the canonical directory (defaults to source basename). */
    name?: string;
    /**
     * Lock-file keys consulted for lock-key-wins name resolution on removal (R4).
     * Supplied by the CLI child, which owns lock reads; a key that sanitizes to the
     * requested name wins over the folder name so the exact lock key is returned.
     */
    lockKeys?: string[];
}

/** Result for emitting a skill to a specific target agent. */
export interface EmitTargetResult {
    target: Target;
    tier: InstallTier;
    success: boolean;
    targetPath: string;
    skipped?: boolean;
    symlinkFailed?: boolean;
    error?: string;
}

/** Result summary from emitting a skill across all specified targets. */
export interface EmitResult {
    success: boolean;
    skillName: string;
    canonicalPath: string;
    results: Partial<Record<Target, EmitTargetResult>>;
    error?: string;
}

/**
 * Emit a skill across specified targets according to their installation tier.
 * - Tier 1 (`direct`): canonical copy to `.agents/skills/<name>`, no extra target path.
 * - Tier 2 (`symlink`): canonical copy + relative symlink in target's native skills dir.
 * - Tier 3 (`translate`): canonical copy + translated copy in target's native skills dir.
 */
export async function emitSkillForTargets(
    source: string | BlobSkill,
    targets: Target[],
    options: EmitOptions = {},
): Promise<EmitResult> {
    const global = options.global ?? false;
    const cwd = options.cwd || process.cwd();
    const homeDir = options.homeDir;

    const canonicalResult = await installSkillCanonical(source, { global, cwd, homeDir, name: options.name });
    if (!canonicalResult.success) {
        return {
            success: false,
            skillName: canonicalResult.skillName,
            canonicalPath: canonicalResult.canonicalPath,
            results: {},
            error: canonicalResult.error,
        };
    }

    const { canonicalPath, skillName } = canonicalResult;
    const emitResults: Partial<Record<Target, EmitTargetResult>> = {};

    for (const target of targets) {
        const config = getTargetAgentConfig(target, { homeDir, env: options.env });
        const targetBase = global ? config.globalSkillsDir : join(cwd, config.skillsDir);
        const targetDir = join(targetBase, skillName);

        if (config.tier === 'direct') {
            emitResults[target] = {
                target,
                tier: 'direct',
                success: true,
                targetPath: canonicalPath,
            };
            continue;
        }

        if (pathsOverlap(canonicalPath, targetDir)) {
            emitResults[target] = {
                target,
                tier: config.tier,
                success: true,
                targetPath: canonicalPath,
                skipped: true,
            };
            continue;
        }

        if (config.tier === 'symlink') {
            if (options.mode === 'copy') {
                try {
                    await cleanAndCreateDir(targetDir);
                    await copyDir(canonicalPath, targetDir);
                    emitResults[target] = {
                        target,
                        tier: 'symlink',
                        success: true,
                        targetPath: targetDir,
                    };
                } catch (err) {
                    emitResults[target] = {
                        target,
                        tier: 'symlink',
                        success: false,
                        targetPath: targetDir,
                        error: err instanceof Error ? err.message : String(err),
                    };
                }
            } else {
                const symlinkCreated = await createSymlink(canonicalPath, targetDir);
                if (!symlinkCreated) {
                    try {
                        await cleanAndCreateDir(targetDir);
                        await copyDir(canonicalPath, targetDir);
                        emitResults[target] = {
                            target,
                            tier: 'symlink',
                            success: true,
                            targetPath: targetDir,
                            symlinkFailed: true,
                        };
                    } catch (err) {
                        emitResults[target] = {
                            target,
                            tier: 'symlink',
                            success: false,
                            targetPath: targetDir,
                            symlinkFailed: true,
                            error: err instanceof Error ? err.message : String(err),
                        };
                    }
                } else {
                    emitResults[target] = {
                        target,
                        tier: 'symlink',
                        success: true,
                        targetPath: targetDir,
                    };
                }
            }
            continue;
        }

        if (config.tier === 'translate') {
            try {
                await cleanAndCreateDir(targetDir);
                await copyDir(canonicalPath, targetDir);
                await translateMarkdownFilesInDir(targetDir, target, skillName);
                emitResults[target] = {
                    target,
                    tier: 'translate',
                    success: true,
                    targetPath: targetDir,
                };
            } catch (err) {
                emitResults[target] = {
                    target,
                    tier: 'translate',
                    success: false,
                    targetPath: targetDir,
                    error: err instanceof Error ? err.message : String(err),
                };
            }
        }
    }

    const allSuccessful = Object.values(emitResults).every((r) => r.success);
    return {
        success: allSuccessful,
        skillName,
        canonicalPath,
        results: emitResults,
    };
}

/**
 * Translate markdown files in a directory using the install emission pipeline's primitives
 * (`translateSlashCommands` then `rewriteSkillReferences`, same order as
 * `transformMarkdownDirectory` in the install pipeline). The plugin prefix is the skill's
 * own name — the discovered skill dir is a minimal one-skill plugin input (R2); an empty
 * prefix would silently no-op the rewrite (the install pipeline's residual-refs safety net).
 */
async function translateMarkdownFilesInDir(dir: string, target: Target, pluginPrefix: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
            await translateMarkdownFilesInDir(fullPath, target, pluginPrefix);
        } else if (extname(entry.name).toLowerCase() === '.md') {
            const rawContent = await readFile(fullPath, 'utf-8');
            const translatedCommands = translateSlashCommands(rawContent, target);
            const rewritten = rewriteSkillReferences(translatedCommands, pluginPrefix);
            await writeFile(fullPath, rewritten, 'utf-8');
        }
    }
}

/** Result for removing a skill from a specific target agent. */
export interface RemoveTargetResult {
    target: Target;
    success: boolean;
    path: string;
    removed: boolean;
    error?: string;
}

/** Result summary from removing a skill across all specified targets. */
export interface RemoveResult {
    success: boolean;
    skillName: string;
    canonicalPath: string;
    results: Partial<Record<Target, RemoveTargetResult>>;
}

/**
 * Removal primitive sweeping all three tiers (canonical + symlinks + translated copies).
 */
export async function removeSkillFromTargets(
    skillName: string,
    targets: Target[],
    options: EmitOptions = {},
): Promise<RemoveResult> {
    const global = options.global ?? false;
    const cwd = options.cwd || process.cwd();
    const homeDir = options.homeDir;

    const sanitized = sanitizeName(skillName);
    const canonicalBase = getCanonicalSkillsDir(global, cwd, homeDir);
    const canonicalPath = join(canonicalBase, sanitized);

    // R4 lock-key-wins name resolution (vendor remove.ts resolveSkillsToRemove): lock-file
    // keys keep the original name, which may contain characters sanitizeName() rewrites
    // ('ce:review' → folder 'ce-review'). Folder identity is resolved first, then any lock
    // key sanitizing to the same folder name wins, so the caller can remove the lock entry
    // by its exact key while the disk sweep below re-sanitizes to the right folder.
    const identity =
        resolveSkillsToRemove([skillName], [skillName, ...(options.lockKeys ?? [])], options.lockKeys ?? [])[0] ??
        skillName;

    if (existsSync(canonicalPath)) {
        await rm(canonicalPath, { recursive: true, force: true }).catch(() => {});
    }

    const removeResults: Partial<Record<Target, RemoveTargetResult>> = {};

    for (const target of targets) {
        const config = getTargetAgentConfig(target, { homeDir, env: options.env });
        const targetBase = global ? config.globalSkillsDir : join(cwd, config.skillsDir);
        const targetDir = join(targetBase, sanitized);

        if (config.tier === 'direct') {
            removeResults[target] = {
                target,
                success: true,
                path: canonicalPath,
                removed: true,
            };
            continue;
        }

        let wasRemoved = false;
        try {
            if (existsSync(targetDir) || (await isSymlink(targetDir))) {
                await rm(targetDir, { recursive: true, force: true });
                wasRemoved = true;
            }
            removeResults[target] = {
                target,
                success: true,
                path: targetDir,
                removed: wasRemoved,
            };
        } catch (err) {
            removeResults[target] = {
                target,
                success: false,
                path: targetDir,
                removed: false,
                error: err instanceof Error ? err.message : String(err),
            };
        }
    }

    const allSuccessful = Object.values(removeResults).every((r) => r.success);
    return {
        success: allSuccessful,
        skillName: identity,
        canonicalPath,
        results: removeResults,
    };
}

/**
 * Resolve requested skill names to canonical identities, preferring lock keys over folder
 * names (vendor-verbatim port of vercel-labs/skills `remove.ts` `resolveSkillsToRemove`).
 * Lock-file keys carry the exact key needed for lock removal; matching purely on folder
 * names misses name-mismatched skills (e.g. lock key `ce:review` → folder `ce-review`).
 */
export function resolveSkillsToRemove(requested: string[], folderNames: string[], lockKeys: string[] = []): string[] {
    const identityBySanitized = new Map<string, string>();
    for (const folder of folderNames) {
        identityBySanitized.set(sanitizeName(folder), folder);
    }
    // Lock keys win: they carry the exact key needed for lock removal.
    for (const key of lockKeys) {
        identityBySanitized.set(sanitizeName(key), key);
    }

    const matched = new Set<string>();
    for (const name of requested) {
        const hit = identityBySanitized.get(sanitizeName(name));
        if (hit) matched.add(hit);
    }
    return Array.from(matched);
}

async function isSymlink(path: string): Promise<boolean> {
    try {
        const stats = await lstat(path);
        return stats.isSymbolicLink();
    } catch {
        return false;
    }
}
