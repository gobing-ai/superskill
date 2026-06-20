import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { stringify } from 'yaml';
import { type ParsedFrontmatter, parseFrontmatter } from '../content/frontmatter';
import { resolveContentName, resolveContentPath } from '../content/identity';

/** Result of the deterministic migrate core. */
export interface DeterministicMigrateResult {
    /** Path to the merged skill file. */
    dest: string;
}

/**
 * Resolve and read skill sources, returning parsed frontmatter + body for each.
 *
 * Uses the canonical content path resolver. Throws an ENOENT-tagged error if any
 * source cannot be resolved.
 */
export function loadSkillSources(sources: string[]): ParsedFrontmatter[] {
    const parsed: ParsedFrontmatter[] = [];
    for (const source of sources) {
        const path = resolveContentPath('skill', source);
        if (!path || !existsSync(path)) {
            throw Object.assign(new Error(`Skill not found: ${source}`), { code: 'ENOENT' });
        }
        const content = readFileSync(path, 'utf-8');
        parsed.push(parseFrontmatter(content));
    }
    return parsed;
}

/** Deduplicate an array of primitives, preserving first-occurrence order. */
export function dedupeArray(values: unknown[]): unknown[] {
    const seen = new Set<unknown>();
    const result: unknown[] = [];
    for (const value of values) {
        if (!seen.has(value)) {
            seen.add(value);
            result.push(value);
        }
    }
    return result;
}

/**
 * Merge frontmatter from multiple parsed sources.
 *
 * Conflict policy:
 * - `name` -> destination-derived canonical name.
 * - Array values -> union with dedup, preserving first-source order.
 * - Scalar conflicts -> first source wins.
 * - All keys from all sources appear in the output.
 */
export function mergeSkillFrontmatter(sources: ParsedFrontmatter[], destName: string): Record<string, unknown> {
    const merged: Record<string, unknown> = {};
    for (const { data } of sources) {
        for (const [key, value] of Object.entries(data)) {
            if (!(key in merged)) {
                merged[key] = value;
            } else {
                const existing = merged[key];
                if (Array.isArray(existing) && Array.isArray(value)) {
                    merged[key] = dedupeArray([...existing, ...value]);
                }
            }
        }
    }
    merged.name = destName;
    return merged;
}

/**
 * Merge bodies from multiple parsed sources.
 *
 * Bodies are concatenated in source order, separated by a blank line. Exact
 * duplicate lines are collapsed to their first occurrence.
 */
export function mergeSkillBodies(sources: ParsedFrontmatter[]): string {
    const bodies = sources.map((source) => source.body.replace(/^\n+/, '').replace(/\n+$/, ''));
    const concatenated = bodies.join('\n\n');
    return dedupeLines(concatenated);
}

/** Collapse exact-duplicate lines and consecutive blank lines. */
export function dedupeLines(text: string): string {
    const seen = new Set<string>();
    const out: string[] = [];
    let prevBlank = false;
    for (const line of text.split('\n')) {
        if (line === '') {
            if (!prevBlank) out.push('');
            prevBlank = true;
            continue;
        }
        prevBlank = false;
        if (!seen.has(line)) {
            seen.add(line);
            out.push(line);
        }
    }
    while (out.length > 0 && out[out.length - 1] === '') out.pop();
    return out.join('\n');
}

/** Serialize merged frontmatter + body into a skill markdown file. */
export function serializeSkill(frontmatter: Record<string, unknown>, body: string): string {
    const yamlStr = stringify(frontmatter);
    return `---\n${yamlStr}---\n\n${body}\n`;
}

/**
 * Deterministically merge skill sources into a destination file.
 *
 * This core API performs no CLI output and no refinement/evolve work.
 */
export function migrateSkillsDeterministic(sources: string[], dest: string): DeterministicMigrateResult {
    if (sources.length === 0) {
        throw Object.assign(new Error('migrate requires at least one source skill'), { code: 1 });
    }

    const parsed = loadSkillSources(sources);
    const destName = resolveContentName(dest);
    const mergedFrontmatter = mergeSkillFrontmatter(parsed, destName);
    const mergedBody = mergeSkillBodies(parsed);
    const mergedContent = serializeSkill(mergedFrontmatter, mergedBody);

    const destDir = dirname(dest);
    if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
    writeFileSync(dest, mergedContent);

    return { dest };
}
