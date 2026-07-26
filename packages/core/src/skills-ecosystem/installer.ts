import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import {
    chmod,
    lstat,
    mkdir,
    open,
    readdir,
    readlink,
    realpath,
    rename,
    rm,
    symlink,
    writeFile,
} from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { basename, dirname, join, normalize, relative, resolve, sep } from 'node:path';
import type { BlobSkill } from './fetch';

/** File names excluded when copying a skill directory into the canonical store. */
export const EXCLUDE_FILES = new Set(['metadata.json']);
/** Directory names excluded when copying a skill directory into the canonical store. */
export const EXCLUDE_DIRS = new Set(['.git', '__pycache__', '__pypackages__', 'node_modules', 'dist', 'build']);

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
    const sourceRootStats = await lstat(src);
    if (sourceRootStats.isSymbolicLink()) {
        throw new Error(`Refusing to copy symbolic link: ${src}`);
    }
    if (!sourceRootStats.isDirectory()) {
        throw new Error(`Refusing to copy non-directory source: ${src}`);
    }

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

            const sourceStats = await lstat(srcPath);
            if (sourceStats.isSymbolicLink()) {
                throw new Error(`Refusing to copy symbolic link: ${srcPath}`);
            }

            if (sourceStats.isDirectory()) {
                await copyDir(srcPath, destPath);
            } else if (sourceStats.isFile()) {
                const sourceFile = await open(srcPath, constants.O_RDONLY | constants.O_NOFOLLOW);
                try {
                    const content = await sourceFile.readFile();
                    await writeFile(destPath, content);
                    await chmod(destPath, sourceStats.mode & 0o777);
                } finally {
                    await sourceFile.close();
                }
            } else {
                throw new Error(`Refusing to copy special file: ${srcPath}`);
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

interface FilesystemMutation {
    destination: string;
    backupPath?: string;
}

function isMissingPathError(error: unknown): boolean {
    return (
        error !== null &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: unknown }).code === 'ENOENT'
    );
}

/**
 * Reversible same-parent filesystem mutations used to keep canonical and target trees
 * recoverable until their lock-file update commits.
 */
export class FilesystemTransaction {
    private readonly mutations: FilesystemMutation[] = [];
    private readonly destinations = new Set<string>();

    private async reserve(destination: string): Promise<FilesystemMutation> {
        if (this.destinations.has(destination)) {
            throw new Error(`Filesystem transaction already contains destination: ${destination}`);
        }

        let backupPath: string | undefined;
        try {
            await lstat(destination);
            backupPath = join(dirname(destination), `.superskill-backup-${randomUUID()}`);
            await rename(destination, backupPath);
        } catch (error) {
            if (!isMissingPathError(error)) {
                throw error;
            }
        }

        const mutation = { destination, ...(backupPath ? { backupPath } : {}) };
        this.destinations.add(destination);
        this.mutations.push(mutation);
        return mutation;
    }

    async replace(destination: string, populate: (path: string) => Promise<void>): Promise<void> {
        await this.reserve(destination);
        await populate(destination);
    }

    async remove(destination: string): Promise<boolean> {
        const mutation = await this.reserve(destination);
        return mutation.backupPath !== undefined;
    }

    async commit(): Promise<void> {
        for (const mutation of this.mutations) {
            if (mutation.backupPath) {
                try {
                    await rm(mutation.backupPath, { recursive: true, force: true });
                } catch {
                    // The committed destination is authoritative; an orphaned backup is cleanup-only.
                }
            }
        }
        this.mutations.length = 0;
        this.destinations.clear();
    }

    async rollback(): Promise<void> {
        const errors: string[] = [];
        for (const mutation of [...this.mutations].reverse()) {
            try {
                await rm(mutation.destination, { recursive: true, force: true });
                if (mutation.backupPath) {
                    await rename(mutation.backupPath, mutation.destination);
                }
            } catch (error) {
                errors.push(error instanceof Error ? error.message : String(error));
            }
        }
        this.mutations.length = 0;
        this.destinations.clear();
        if (errors.length > 0) {
            throw new Error(`Filesystem rollback failed: ${errors.join('; ')}`);
        }
    }
}

/**
 * Install a skill (directory path or BlobSkill) into the canonical `.agents/skills/<skillName>` location.
 */
export async function installSkillCanonical(
    source: string | BlobSkill,
    options: {
        global?: boolean;
        cwd?: string;
        homeDir?: string;
        name?: string;
        transaction?: FilesystemTransaction;
    } = {},
): Promise<CanonicalInstallResult> {
    const global = options.global ?? false;
    const cwd = options.cwd || process.cwd();
    // Directory sources default to the source basename; callers that already resolved the
    // skill's declared (frontmatter) name pass it explicitly so the canonical dir, the lock
    // key, and the emission tiers all agree on one identity.
    const rawName = options.name ?? (typeof source === 'string' ? basename(resolve(source)) : source.name);
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

    const resolvedSource = typeof source === 'string' ? resolve(source) : undefined;
    if (resolvedSource && pathsOverlap(resolvedSource, canonicalDir)) {
        return {
            success: true,
            canonicalPath: canonicalDir,
            skillName,
            skipped: true,
        };
    }

    const transaction = options.transaction ?? new FilesystemTransaction();
    const ownsTransaction = options.transaction === undefined;
    try {
        await transaction.replace(canonicalDir, async (destination) => {
            if (resolvedSource) {
                await copyDir(resolvedSource, destination);
            } else {
                await writeBlobSkill(source as BlobSkill, destination);
            }
        });
        if (ownsTransaction) {
            await transaction.commit();
        }
        return { success: true, canonicalPath: canonicalDir, skillName };
    } catch (err) {
        if (ownsTransaction) {
            try {
                await transaction.rollback();
            } catch (rollbackError) {
                const installError = err instanceof Error ? err.message : String(err);
                const rollbackMessage = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
                return {
                    success: false,
                    canonicalPath: canonicalDir,
                    skillName,
                    error: `${installError}; ${rollbackMessage}`,
                };
            }
        }
        return {
            success: false,
            canonicalPath: canonicalDir,
            skillName,
            error: err instanceof Error ? err.message : String(err),
        };
    }
}
