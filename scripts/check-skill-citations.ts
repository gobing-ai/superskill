#!/usr/bin/env bun

/**
 * Citation-resolution guard for plugin skill bodies.
 *
 * Catches the two documentation-drift defect classes the deterministic quality
 * heuristics provably miss (they score content only, never the filesystem):
 *
 *   1. Dead code citations — a `path/to/file.ts:LINE` or repo-relative source
 *      path referenced in a SKILL.md that no longer exists, or whose line is
 *      out of range. (The cc-hooks `dimensions.ts:54` defect.)
 *   2. Rubric dimension drift — a skill that documents a rubric while claiming a
 *      dimension count that disagrees with the rubric YAML it points at. (The
 *      cc-commands / cc-agents "10 dimensions" defects.)
 *
 * Lives outside `packages/core` on purpose: the core quality evaluators are pure
 * functions over content (architecture invariant 5). Citation resolution needs
 * filesystem access, so it runs here and is wired into `spur-check` as an
 * `exit-code` rule.
 *
 * Usage:
 *   bun scripts/check-skill-citations.ts                 check all plugin skills
 *   bun scripts/check-skill-citations.ts <glob-root>     check a specific glob
 *
 * Exit code: 0 when clean, 1 when any citation is dead or any dimension claim
 * drifts. Findings are printed to stdout.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Glob } from 'bun';

const ROOT = resolve(import.meta.dirname, '..');
const SKILL_GLOB = process.argv[2] ?? 'plugins/*/skills/*/SKILL.md';

/** A single drift/dead-citation finding, tied to the file that produced it. */
export interface Finding {
    file: string;
    message: string;
}

/** Filesystem seam — injected so the checker is unit-testable without fixtures. */
export interface FileResolver {
    /** True when a repo-relative path exists. */
    exists(relPath: string): boolean;
    /** Line count of a repo-relative file; callers guard with `exists` first. */
    lineCount(relPath: string): number;
}

/**
 * Repo-relative source-path prefixes worth resolving. Citations under these
 * roots name real code; everything else (e.g. `examples/validate.sh`,
 * `agents/my-agent.md`) is illustrative placeholder text inside fenced blocks.
 */
const RESOLVABLE_PREFIXES = ['packages/', 'apps/', 'vendors/', 'plugins/', 'tooling/', 'scripts/', 'docs/'];

/** Match a code citation: `path.ext` optionally suffixed with `:line`. */
const CITATION_RE = /\b([a-zA-Z0-9_./-]+\.(?:ts|tsx|js|mjs|yaml|yml|json|sh))(?::(\d+))?\b/g;

/** Match a dimension-count claim, e.g. "5 dimensions", "10 rubric dimensions". */
const DIMENSION_CLAIM_RE = /\b(\d+)\s+(?:rubric\s+)?dimensions\b/gi;

/** Map a plugin-skill directory name to the rubric type it documents. */
const SKILL_TO_RUBRIC: Record<string, string> = {
    'cc-skills': 'skill',
    'cc-commands': 'command',
    'cc-agents': 'agent',
    'cc-hooks': 'hook',
    'cc-magents': 'magent',
};

/** Resolve every code citation in a skill body; collect dead ones. */
export function checkCitations(file: string, body: string, fs: FileResolver): Finding[] {
    const findings: Finding[] = [];
    for (const match of body.matchAll(CITATION_RE)) {
        const [, path, lineStr] = match;
        if (!RESOLVABLE_PREFIXES.some((p) => path.startsWith(p))) continue;

        if (!fs.exists(path)) {
            findings.push({ file, message: `dead citation: ${path} (file does not exist)` });
            continue;
        }
        if (lineStr) {
            const total = fs.lineCount(path);
            const line = Number(lineStr);
            if (line > total) {
                findings.push({ file, message: `dead citation: ${path}:${line} (file has ${total} lines)` });
            }
        }
    }
    return findings;
}

/**
 * Assert any dimension-count claim in the body matches the rubric the skill
 * documents. `rubricCount` returns the rubric's dimension count, or <= 0 when
 * the skill documents no rubric (skip).
 */
export function checkDimensionDrift(
    file: string,
    body: string,
    skillName: string,
    rubricCount: (rubricType: string) => number,
): Finding[] {
    const rubricType = SKILL_TO_RUBRIC[skillName];
    if (!rubricType) return [];
    const expected = rubricCount(rubricType);
    if (expected <= 0) return [];

    const findings: Finding[] = [];
    for (const match of body.matchAll(DIMENSION_CLAIM_RE)) {
        const claimed = Number(match[1]);
        if (claimed !== expected) {
            findings.push({
                file,
                message: `dimension drift: claims "${match[0]}" but ${rubricType}.yaml defines ${expected}`,
            });
        }
    }
    return findings;
}

/** Count `- name:` dimension entries in a rubric YAML body. */
export function countRubricDimensions(rubricYaml: string): number {
    const matches = rubricYaml.match(/^\s*-\s*name:/gm);
    return matches ? matches.length : 0;
}

/** Real filesystem resolver rooted at the repo root. */
function repoResolver(root: string): FileResolver {
    return {
        exists: (rel) => existsSync(resolve(root, rel)),
        lineCount: (rel) => readFileSync(resolve(root, rel), 'utf8').split('\n').length,
    };
}

/** Read a rubric's dimension count from disk; -1 when the rubric is absent. */
function diskRubricCount(root: string, rubricType: string): number {
    const path = resolve(root, `packages/core/src/rubrics/${rubricType}.yaml`);
    if (!existsSync(path)) return -1;
    return countRubricDimensions(readFileSync(path, 'utf8'));
}

function main(): void {
    const fs = repoResolver(ROOT);
    const findings: Finding[] = [];
    const glob = new Glob(SKILL_GLOB);

    for (const rel of glob.scanSync({ cwd: ROOT })) {
        if (rel.includes('node_modules') || rel.includes('/vendors/')) continue;
        const body = readFileSync(resolve(ROOT, rel), 'utf8');
        const skillName = rel.split('/').at(-2) ?? '';
        findings.push(...checkCitations(rel, body, fs));
        findings.push(...checkDimensionDrift(rel, body, skillName, (t) => diskRubricCount(ROOT, t)));
    }

    if (findings.length === 0) {
        console.log(`OK: skill citations resolve and dimension claims match rubrics (${SKILL_GLOB})`);
        return;
    }
    for (const f of findings) {
        console.log(`${f.file}: ${f.message}`);
    }
    console.log(`\n${findings.length} citation/drift finding(s).`);
    process.exit(1);
}

if (import.meta.main) {
    main();
}
