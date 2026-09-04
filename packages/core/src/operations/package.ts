import { cpSync, existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { cwd } from 'node:process';
import { resolveContentName, resolveContentPath } from '../content/identity';
import { pathsNestOrEqual } from '../content/paths';

/** Options for the package operation. */
export interface PackageOptions {
    /** Output directory (default: cwd). */
    output?: string;
    /** Include companion configs (metadata.openclaw, agents/). */
    includeCompanions?: boolean;
}

/**
 * Resolved packaging source (R8/F8): identity of the primary entry plus how to treat
 * the surrounding directory. `directoryForm` is true only when the source is the
 * canonical directory form (…/SKILL.md or a directory path); a bare flat `skill.md`
 * is packaged alone — no companions, no references, no implicit parent bundle.
 */
interface ResolvedSkillEntry {
    /** Directory anchoring companions/references (parent of the entry file). */
    dir: string;
    /** Bundle/skill identity — output directory name. */
    name: string;
    /** Primary entry file; becomes `<output>/SKILL.md`. Copy is required, not best-effort. */
    entryPath: string;
    /** True when the source is the canonical directory form. */
    directoryForm: boolean;
}

/**
 * Resolve a skill name to its packaging source.
 *
 * Uses `resolveContentPath` from content/identity.ts (F007) — the canonical
 * content-IO path resolver, not bespoke resolution.
 */
function resolveSkillEntry(name: string): ResolvedSkillEntry {
    const skillPath = resolveContentPath('skill', name);
    if (!skillPath) {
        throw Object.assign(new Error(`Skill not found: ${name}`), { code: 'ENOENT' });
    }
    // If the resolved path is a directory, it IS the skill directory (defensive;
    // resolveContentPath returns files for every documented match shape).
    if (statSync(skillPath).isDirectory()) {
        return {
            dir: skillPath,
            name: basename(skillPath),
            entryPath: join(skillPath, 'SKILL.md'),
            directoryForm: true,
        };
    }
    if (basename(skillPath) === 'SKILL.md') {
        // Canonical directory form: companions/references come from the parent dir.
        return {
            dir: dirname(skillPath),
            name: basename(dirname(skillPath)),
            entryPath: skillPath,
            directoryForm: true,
        };
    }
    // Flat form (R8): a bare `skill.md` outside a canonical directory. The file is the
    // whole bundle; its parent directory name is NOT the skill identity.
    return { dir: dirname(skillPath), name: resolveContentName(skillPath), entryPath: skillPath, directoryForm: false };
}

/**
 * Recursively copy a directory if it exists. No-op on missing source.
 */
function copyDirIfExists(src: string, dest: string): void {
    if (existsSync(src)) {
        cpSync(src, dest, { recursive: true });
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
    const entry = resolveSkillEntry(name);

    // Required primary entry (R8/F8): fail before any output cleanup — a missing or
    // non-regular entry must never silently package an empty bundle, and must never
    // delete a previous good output first.
    let entryStat: { isFile: () => boolean };
    try {
        entryStat = statSync(entry.entryPath);
    } catch (error) {
        throw Object.assign(
            new Error(
                `Cannot package skill '${name}': primary entry '${entry.entryPath}' is missing (${error instanceof Error ? error.message : String(error)}).`,
            ),
            { code: 'ENOENT' },
        );
    }
    if (!entryStat.isFile()) {
        throw new Error(`Cannot package skill '${name}': primary entry '${entry.entryPath}' is not a regular file.`);
    }

    const skillName = entry.name;
    const skillDir = entry.dir;
    const outputDir = join(opts.output ?? cwd(), skillName);

    // The clean step below recursively deletes outputDir. If outputDir overlaps
    // the source skill directory (equal, ancestor, or descendant), that delete
    // destroys the source before anything is copied — refuse instead.
    const resolvedOut = resolve(outputDir);
    const resolvedSrc = resolve(skillDir);
    if (pathsNestOrEqual(resolvedOut, resolvedSrc)) {
        throw new Error(
            `Refusing to package '${skillName}': output directory '${resolvedOut}' overlaps the source ` +
                `skill directory '${resolvedSrc}' — cleaning it would delete the source. ` +
                `Pass an --output outside the skill directory.`,
        );
    }

    // Clean existing output to prevent stale companion files from prior packaging.
    if (existsSync(outputDir)) {
        rmSync(outputDir, { recursive: true, force: true });
    }
    mkdirSync(outputDir, { recursive: true });

    // Core: the primary entry copy is required (R8) — never best-effort.
    cpSync(entry.entryPath, join(outputDir, 'SKILL.md'));
    if (entry.directoryForm) {
        copyDirIfExists(join(skillDir, 'references'), join(outputDir, 'references'));

        // Companion configs (only when --include-companions; directory form only —
        // a flat skill.md has no canonical companions).
        if (opts.includeCompanions) {
            for (const companion of COMPANION_ENTRIES) {
                const src = join(skillDir, companion);
                const dest = join(outputDir, companion);
                if (existsSync(src)) {
                    cpSync(src, dest, { recursive: true });
                }
            }
        }
    }

    // Postcondition (R8): a successful package always contains a regular SKILL.md.
    if (!existsSync(join(outputDir, 'SKILL.md'))) {
        throw new Error(`Packaging invariant violated for '${name}': output bundle ${outputDir} has no SKILL.md.`);
    }

    return outputDir;
}
