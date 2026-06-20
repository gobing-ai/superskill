import { cpSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { cwd } from 'node:process';
import { resolveContentPath } from '@gobing-ai/superskill-core';

/** Options for the package operation. */
export interface PackageOptions {
    /** Output directory (default: cwd). */
    output?: string;
    /** Include companion configs (metadata.openclaw, agents/). */
    includeCompanions?: boolean;
}

/** Result from packaging a skill. */
interface SkillDir {
    /** Absolute path to the skill directory. */
    dir: string;
    /** Name of the skill directory. */
    name: string;
}

/**
 * Resolve a skill name to its directory.
 *
 * Uses `resolveContentPath` from content/identity.ts (F007) — the canonical
 * content-IO path resolver, not bespoke resolution.
 */
function resolveSkillDir(name: string): SkillDir {
    const skillPath = resolveContentPath('skill', name);
    if (!skillPath) {
        throw Object.assign(new Error(`Skill not found: ${name}`), { code: 'ENOENT' });
    }
    // If the resolved path is a directory, it IS the skill directory.
    // Otherwise (a .md file), the skill directory is its parent.
    const dir = statSync(skillPath).isDirectory() ? skillPath : dirname(skillPath);
    return { dir, name: basename(dir) };
}

/**
 * Recursively copy a directory if it exists. No-op on missing source.
 */
function copyDirIfExists(src: string, dest: string): void {
    if (existsSync(src)) {
        cpSync(src, dest, { recursive: true });
    }
}

/**
 * Copy a single file if it exists. No-op on missing source.
 */
function copyFileIfExists(src: string, dest: string): void {
    if (existsSync(src)) {
        cpSync(src, dest);
    }
}

/** Companion files/dirs to include when --include-companions is set. */
const COMPANION_ENTRIES = ['metadata.openclaw', 'agents'] as const;

/**
 * Package a skill for distribution.
 *
 * Resolves the skill via content-IO (`resolveContentPath`), then bundles
 * SKILL.md + `references/` into `--output`. With `--include-companions`,
 * also includes `metadata.openclaw` and `agents/`.
 *
 * @param name  Skill name or path.
 * @param opts  Packaging options.
 * @returns     Absolute path to the output bundle directory.
 */
export async function packageSkill(name: string, opts: PackageOptions = {}): Promise<string> {
    const { dir: skillDir, name: skillName } = resolveSkillDir(name);
    const outputDir = join(opts.output ?? cwd(), skillName);

    mkdirSync(outputDir, { recursive: true });

    // Core: SKILL.md + references/
    copyFileIfExists(join(skillDir, 'SKILL.md'), join(outputDir, 'SKILL.md'));
    copyDirIfExists(join(skillDir, 'references'), join(outputDir, 'references'));

    // Companion configs (only when --include-companions)
    if (opts.includeCompanions) {
        for (const entry of COMPANION_ENTRIES) {
            const src = join(skillDir, entry);
            const dest = join(outputDir, entry);
            if (existsSync(src)) {
                cpSync(src, dest, { recursive: true });
            }
        }
    }

    return outputDir;
}
