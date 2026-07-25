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

    const canonicalResult = await installSkillCanonical(source, { global, cwd, homeDir });
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
                await translateMarkdownFilesInDir(targetDir, target);
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
 * Translate markdown files in a directory using translateSlashCommands and rewriteSkillReferences.
 */
async function translateMarkdownFilesInDir(dir: string, target: Target): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
            await translateMarkdownFilesInDir(fullPath, target);
        } else if (extname(entry.name).toLowerCase() === '.md') {
            const rawContent = await readFile(fullPath, 'utf-8');
            const translatedCommands = translateSlashCommands(rawContent, target);
            const rewritten = rewriteSkillReferences(translatedCommands, '');
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
        skillName: sanitized,
        canonicalPath,
        results: removeResults,
    };
}

async function isSymlink(path: string): Promise<boolean> {
    try {
        const stats = await lstat(path);
        return stats.isSymbolicLink();
    } catch {
        return false;
    }
}
