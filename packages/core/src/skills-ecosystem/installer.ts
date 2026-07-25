import {
    chmod,
    lstat,
    mkdir,
    readdir,
    readFile,
    readlink,
    realpath,
    rm,
    stat,
    symlink,
    writeFile,
} from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { basename, dirname, join, normalize, relative, resolve, sep } from 'node:path';
import type { BlobSkill } from './fetch';

const EXCLUDE_FILES = new Set(['metadata.json']);
const EXCLUDE_DIRS = new Set(['.git', '__pycache__', '__pypackages__', 'node_modules', 'dist', 'build']);

/**
 * Sanitize a skill or directory name to prevent path traversal attacks
 * and ensure it follows kebab-case naming convention.
 */
export function sanitizeName(name: string): string {
    const sanitized = name
        .toLowerCase()
        .replace(/[^a-z0-9._]+/g, '-')
        .replace(/^[.-]+|[.-]+$/g, '');

    return sanitized.substring(0, 255) || 'unnamed-skill';
}

/**
 * Validate that targetPath remains strictly within basePath (prevents path traversal).
 */
export function isPathSafe(basePath: string, targetPath: string): boolean {
    const normalizedBase = normalize(resolve(basePath));
    const normalizedTarget = normalize(resolve(targetPath));

    return normalizedTarget.startsWith(normalizedBase + sep) || normalizedTarget === normalizedBase;
}

/**
 * Check if two paths overlap (one is inside the other or equal).
 */
export function pathsOverlap(pathA: string, pathB: string): boolean {
    return isPathSafe(pathA, pathB) || isPathSafe(pathB, pathA);
}

/**
 * Get the canonical skills directory path (`.agents/skills`).
 */
export function getCanonicalSkillsDir(global: boolean, cwd?: string, homeDir?: string): string {
    const baseDir = global ? (homeDir ?? homedir()) : cwd || process.cwd();
    return join(baseDir, '.agents', 'skills');
}

/**
 * Clean and recreate a directory.
 */
export async function cleanAndCreateDir(dir: string): Promise<void> {
    try {
        await rm(dir, { recursive: true, force: true });
    } catch {
        // Ignore cleanup error
    }
    await mkdir(dir, { recursive: true });
}

/**
 * Resolve parent directory symlinks using realpath to prevent broken relative symlinks.
 */
async function resolveParentSymlinks(targetPath: string): Promise<string> {
    const resolved = resolve(targetPath);
    const dir = dirname(resolved);
    const base = basename(resolved);
    try {
        const realDir = await realpath(dir);
        return join(realDir, base);
    } catch {
        return resolved;
    }
}

/**
 * Create a relative symlink from linkPath pointing to targetDir.
 * Returns true on success, false if fallback to copy is needed.
 */
export async function createSymlink(targetDir: string, linkPath: string): Promise<boolean> {
    try {
        const resolvedTarget = resolve(targetDir);
        const resolvedLinkPath = resolve(linkPath);

        const [realTarget, realLinkPath] = await Promise.all([
            realpath(resolvedTarget).catch(() => resolvedTarget),
            realpath(resolvedLinkPath).catch(() => resolvedLinkPath),
        ]);

        if (realTarget === realLinkPath) {
            return true;
        }

        const realTargetParents = await resolveParentSymlinks(targetDir);
        const realLinkParents = await resolveParentSymlinks(linkPath);
        if (realTargetParents === realLinkParents) {
            return true;
        }

        try {
            const stats = await lstat(linkPath);
            if (stats.isSymbolicLink()) {
                const existingTarget = await readlink(linkPath);
                if (resolve(dirname(linkPath), existingTarget) === resolvedTarget) {
                    return true;
                }
                await rm(linkPath, { force: true });
            } else {
                await rm(linkPath, { recursive: true, force: true });
            }
        } catch (err: unknown) {
            if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'ELOOP') {
                await rm(linkPath, { force: true }).catch(() => {});
            }
        }

        const linkDir = dirname(linkPath);
        await mkdir(linkDir, { recursive: true });

        const realLinkDir = await resolveParentSymlinks(linkDir);
        const relativePath = relative(realLinkDir, resolvedTarget);
        const symlinkType = platform() === 'win32' ? 'junction' : undefined;
        const symlinkTarget = symlinkType === 'junction' ? resolvedTarget : relativePath;

        await symlink(symlinkTarget, linkPath, symlinkType);
        return true;
    } catch {
        return false;
    }
}

/**
 * Recursively copy directory contents with path security checks.
 */
export async function copyDir(src: string, dest: string): Promise<void> {
    await mkdir(dest, { recursive: true });
    const entries = await readdir(src, { withFileTypes: true });

    await Promise.all(
        entries.map(async (entry) => {
            if (EXCLUDE_FILES.has(entry.name) || (entry.isDirectory() && EXCLUDE_DIRS.has(entry.name))) {
                return;
            }

            const srcPath = join(src, entry.name);
            const destPath = join(dest, entry.name);

            if (!isPathSafe(dest, destPath)) {
                throw new Error(`Path traversal detected during copy: ${entry.name}`);
            }

            if (entry.isDirectory()) {
                await copyDir(srcPath, destPath);
            } else {
                const content = await readFile(srcPath);
                await writeFile(destPath, content);
                try {
                    const sourceStats = await stat(srcPath);
                    await chmod(destPath, sourceStats.mode & 0o777);
                } catch {
                    // Ignore chmod failure on unsupported filesystems
                }
            }
        }),
    );
}

/**
 * Write a BlobSkill snapshot (in-memory files array) to a destination directory.
 */
export async function writeBlobSkill(skill: BlobSkill, destDir: string): Promise<void> {
    await mkdir(destDir, { recursive: true });
    for (const file of skill.files) {
        const targetPath = join(destDir, file.path);
        if (!isPathSafe(destDir, targetPath)) {
            throw new Error(`Invalid file path in BlobSkill: ${file.path}`);
        }
        await mkdir(dirname(targetPath), { recursive: true });
        await writeFile(targetPath, file.contents, 'utf-8');
    }
}

/** Result of installing a skill to the canonical location. */
export interface CanonicalInstallResult {
    success: boolean;
    canonicalPath: string;
    skillName: string;
    skipped?: boolean;
    error?: string;
}

/**
 * Install a skill (directory path or BlobSkill) into the canonical `.agents/skills/<skillName>` location.
 */
export async function installSkillCanonical(
    source: string | BlobSkill,
    options: { global?: boolean; cwd?: string; homeDir?: string } = {},
): Promise<CanonicalInstallResult> {
    const global = options.global ?? false;
    const cwd = options.cwd || process.cwd();
    const rawName = typeof source === 'string' ? basename(resolve(source)) : source.name;
    const skillName = sanitizeName(rawName);

    const canonicalBase = getCanonicalSkillsDir(global, cwd, options.homeDir);
    const canonicalDir = join(canonicalBase, skillName);

    if (!isPathSafe(canonicalBase, canonicalDir)) {
        return {
            success: false,
            canonicalPath: canonicalDir,
            skillName,
            error: `Invalid skill name '${rawName}': path traversal detected`,
        };
    }

    if (typeof source === 'string') {
        const resolvedSource = resolve(source);
        if (pathsOverlap(resolvedSource, canonicalDir)) {
            return {
                success: true,
                canonicalPath: canonicalDir,
                skillName,
                skipped: true,
            };
        }
        try {
            await cleanAndCreateDir(canonicalDir);
            await copyDir(resolvedSource, canonicalDir);
            return { success: true, canonicalPath: canonicalDir, skillName };
        } catch (err) {
            return {
                success: false,
                canonicalPath: canonicalDir,
                skillName,
                error: err instanceof Error ? err.message : String(err),
            };
        }
    } else {
        try {
            await cleanAndCreateDir(canonicalDir);
            await writeBlobSkill(source, canonicalDir);
            return { success: true, canonicalPath: canonicalDir, skillName };
        } catch (err) {
            return {
                success: false,
                canonicalPath: canonicalDir,
                skillName,
                error: err instanceof Error ? err.message : String(err),
            };
        }
    }
}
