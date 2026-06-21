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
export function resolveContentPath(type: ContentType, name: string, opts?: ResolvePathOptions): string | null {
    // If name is already a path to an existing file, return it unchanged.
    if (name.includes('/') || name.includes('\\')) {
        if (existsSync(name)) {
            const st = statSync(name);
            if (st.isDirectory()) {
                const skillMd = join(name, 'SKILL.md');
                if (existsSync(skillMd)) return skillMd;
            } else {
                return name;
            }
        }
    }
    const base = opts?.baseDir ?? cwd();

    // Bare name that already has an extension and exists in cwd (e.g. AGENTS.md, CLAUDE.md)
    const asIs = join(base, name);
    if (existsSync(asIs) && statSync(asIs).isFile()) return asIs;

    // Direct match: baseDir/<name>.md
    const direct = join(base, `${name}.md`);
    if (existsSync(direct)) return direct;
    // Type-specific subdirectories
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
