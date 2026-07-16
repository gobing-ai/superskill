import { existsSync, statSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { cwd } from 'node:process';
import type { ContentType } from './types';

/** Options for path resolution. */
export interface ResolvePathOptions {
    /** Base directory to search from (default: `process.cwd()`). */
    baseDir?: string;
}

/**
 * Derive the canonical content name from a file path.
 *
 * - `SKILL.md` → parent directory name
 * - All other `.md` files → filename without `.md` extension
 * - Files without `.md` extension → basename only
 *
 * @param path  File path to resolve.
 * @returns     Canonical content name.
 */
export function resolveContentName(path: string): string {
    const name = basename(path);
    if (name === 'SKILL.md') {
        return basename(dirname(path));
    }
    // Multi-file magent package: …/magents/<pkg>/AGENTS.md or CLAUDE.md → package name
    if (
        (name === 'AGENTS.md' || name === 'CLAUDE.md') &&
        (existsSync(join(dirname(path), 'IDENTITY.md')) ||
            existsSync(join(dirname(path), 'SOUL.md')) ||
            existsSync(join(dirname(path), 'USER.md')))
    ) {
        return basename(dirname(path));
    }
    const ext = extname(name);
    if (ext === '.md') {
        return name.slice(0, -3);
    }
    return name;
}

/**
 * Convert a content name and type to a file path.
 *
 * Resolution order:
 * 1. If `name` is already a path to an existing file, return it unchanged.
 * 2. Look in `baseDir` (default: `cwd()`).
 * 3. For commands/agents/hooks/magents: also look in type-specific locations under baseDir.
 *
 * @param type  Content type.
 * @param name  Content name or existing file path.
 * @param opts  Resolution options.
 * @returns     Resolved absolute file path, or `null` if not found.
 */
/** Prefer AGENTS.md then CLAUDE.md inside a multi-file magent package directory. */
function resolveMagentPackageEntry(dir: string): string | null {
    for (const entry of ['AGENTS.md', 'CLAUDE.md'] as const) {
        const p = join(dir, entry);
        if (existsSync(p) && statSync(p).isFile()) return p;
    }
    return null;
}

export function resolveContentPath(type: ContentType, name: string, opts?: ResolvePathOptions): string | null {
    // If name is already a path to an existing file or package directory, resolve it.
    if (name.includes('/') || name.includes('\\')) {
        if (existsSync(name)) {
            const st = statSync(name);
            if (st.isDirectory()) {
                const skillMd = join(name, 'SKILL.md');
                if (existsSync(skillMd)) return skillMd;
                // Multi-file magent package directory (magents/<pkg>/ or absolute path).
                const magentEntry = resolveMagentPackageEntry(name);
                if (magentEntry) return magentEntry;
            } else {
                return name;
            }
        }
    }
    const base = opts?.baseDir ?? cwd();

    // Bare name that already has an extension and exists in cwd (e.g. AGENTS.md, CLAUDE.md)
    const asIs = join(base, name);
    if (existsSync(asIs) && statSync(asIs).isFile()) return asIs;

    // Skills are directory-based: resolve <base>/<name>/SKILL.md, then
    // <base>/skills/<name>/SKILL.md (dir-form inside the type subdir), before flat .md
    if (type === 'skill') {
        const skillDirForm = join(base, name, 'SKILL.md');
        if (existsSync(skillDirForm)) return skillDirForm;
        const skillSubdirDirForm = join(base, 'skills', name, 'SKILL.md');
        if (existsSync(skillSubdirDirForm)) return skillSubdirDirForm;
    }

    // Magents are often multi-file packages under magents/<name>/{AGENTS,CLAUDE}.md
    if (type === 'magent') {
        const pkgDir = join(base, 'magents', name);
        if (existsSync(pkgDir) && statSync(pkgDir).isDirectory()) {
            const entry = resolveMagentPackageEntry(pkgDir);
            if (entry) return entry;
        }
    }

    // Direct match: baseDir/<name>.md
    const direct = join(base, `${name}.md`);
    if (existsSync(direct)) return direct;
    // Type-specific subdirectories (flat .md)
    const subdirs: Record<ContentType, string> = {
        skill: 'skills',
        command: 'commands',
        agent: 'agents',
        hook: 'hooks',
        magent: 'magents',
    };
    const subdir = subdirs[type];
    if (subdir) {
        const typed = join(base, subdir, `${name}.md`);
        if (existsSync(typed)) return typed;
    }

    return null;
}
/**
 * Reject a value that could escape the output directory when used as a path segment.
 * A safe segment is non-empty, not `.` or `..`, and contains no `/`, `\`, or NUL.
 */
export function assertSafePathSegment(value: string, label: string): void {
    if (
        !value ||
        value === '.' ||
        value === '..' ||
        value.includes('/') ||
        value.includes('\\') ||
        value.includes('\0')
    ) {
        throw new Error(`Invalid ${label} '${value}': must be a single path segment`);
    }
}
