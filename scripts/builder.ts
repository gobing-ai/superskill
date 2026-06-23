#!/usr/bin/env bun

/**
 * Build/release helper for the superskill CLI.
 *
 * Usage:
 *   bun scripts/builder.ts bump-ver <version>            bump, commit, tag locally
 *   bun scripts/builder.ts bump-ver <version> --push     bump + push commit + tag
 *   bun scripts/builder.ts drop-tags <version>           delete local tag for version
 *   bun scripts/builder.ts drop-tags <version> --remote  delete local + remote tag
 *   bun scripts/builder.ts postbuild <outfile>           prepend bun shebang to a bundle
 *   bun scripts/builder.ts check-skill-citations [glob]  resolve skill citations + drift
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { $, Glob } from 'bun';

const ROOT = resolve(import.meta.dirname, '..');
const PKG_PATH = resolve(ROOT, 'apps/cli/package.json');
const PKG_NAME = '@gobing-ai/superskill';
type ShellRunner = typeof $;

const logger = {
    info: (msg: string) => console.log(msg),
    warn: (msg: string) => console.warn(msg),
    error: (msg: string) => console.error(msg),
};

function fail(msg: string): never {
    logger.error(msg);
    process.exit(1);
}
/** Validates a semver string; returns null when valid, error message when invalid. */
export function validateVersion(ver: string): string | null {
    if (!/^\d+\.\d+\.\d+(-.+)?$/.test(ver)) {
        return `Invalid version: ${ver}. Use semver (e.g. 0.1.0, 0.2.0-beta.1).`;
    }
    return null;
}

/** Compute the git tag name for a version. */
export function computeTag(ver: string): string {
    return `${PKG_NAME}-v${ver}`;
}

export interface BumpResult {
    /** Updated marketplace JSON string (null if marketplace absent). */
    marketplace: string | null;
    /** Relative paths modified (e.g. "plugins/cc/plugin.json"). */
    paths: string[];
}

/**
 * Pure: given marketplace JSON text and a version, update all plugin
 * entry versions and their plugin.json manifests. Returns the updated marketplace
 * text and the set of relative paths modified. Does no I/O.
 */
export function bumpMarketplaceManifests(marketplaceText: string | null, ver: string): BumpResult {
    const paths: string[] = [];
    if (marketplaceText === null) return { marketplace: null, paths };

    const marketplace = JSON.parse(marketplaceText);
    const plugins: Array<{ name: string; version: string; source: string }> = marketplace.plugins ?? [];
    let mpUpdated = false;
    for (const entry of plugins) {
        if (entry.version !== ver) {
            entry.version = ver;
            mpUpdated = true;
            paths.push(`${entry.source}/plugin.json`);
        }
    }
    const mpText = `${JSON.stringify(marketplace, null, 4)}\n`;

    return { marketplace: mpUpdated ? mpText : marketplaceText, paths };
}

/** Pure: given package.json text and a version, return the updated JSON string. */
export function bumpPackageVersion(jsonText: string, ver: string): { updated: string; oldVer: string } {
    const pkg = JSON.parse(jsonText) as { version: string };
    const oldVer = pkg.version;
    pkg.version = ver;
    return { updated: `${JSON.stringify(pkg, null, 4)}\n`, oldVer };
}
export async function bumpVersion(ver: string, shouldPush: boolean, shell: ShellRunner = $) {
    const err = validateVersion(ver);
    if (err) fail(err);

    const pathsToAdd: string[] = [];
    // 1. apps/cli/package.json
    const { updated: pkgUpdated, oldVer } = bumpPackageVersion(readFileSync(PKG_PATH, 'utf-8'), ver);
    writeFileSync(PKG_PATH, pkgUpdated);
    pathsToAdd.push(PKG_PATH);
    logger.info(`Bumped ${PKG_NAME}: ${oldVer} → ${ver}`);

    const marketplacePath = resolve(ROOT, '.claude-plugin/marketplace.json');
    const mpText = existsSync(marketplacePath) ? readFileSync(marketplacePath, 'utf-8') : null;
    const { marketplace: updated, paths: mpPaths } = bumpMarketplaceManifests(mpText, ver);

    if (updated !== null && updated !== mpText) {
        writeFileSync(marketplacePath, updated);
        pathsToAdd.push(marketplacePath);
        logger.info(`Bumped marketplace plugins to ${ver}`);
    }

    for (const rel of mpPaths) {
        const pluginJsonPath = resolve(ROOT, rel);
        if (existsSync(pluginJsonPath)) {
            const pluginJson = JSON.parse(readFileSync(pluginJsonPath, 'utf-8'));
            if (pluginJson.version !== ver) {
                pluginJson.version = ver;
                writeFileSync(pluginJsonPath, `${JSON.stringify(pluginJson, null, 4)}\n`);
                pathsToAdd.push(pluginJsonPath);
                logger.info(`Bumped ${rel} to ${ver}`);
            }
        } else {
            logger.warn(`  ⚠ plugin.json not found at ${pluginJsonPath} — skipping`);
        }
    }

    const tag = computeTag(ver);

    await shell`git add ${pathsToAdd}`;
    await shell`git commit -m ${`chore: release ${PKG_NAME} v${ver}`}`;
    await shell`git tag -a ${tag} -m ${`${PKG_NAME} v${ver}`}`;

    logger.info(`\nTag: ${tag}`);

    if (shouldPush) {
        logger.info('Pushing commit and tag…');
        await shell`git push origin main`;
        await shell`git push origin ${tag}`;
        logger.info('Pushed main and tag. Publish workflow will trigger on the tag push.');
        return;
    }

    logger.info('Publish workflow will trigger on tag push. To push now:');
    logger.info(`  git push origin main && git push origin ${tag}`);
}

export async function dropTags(ver: string, isRemote: boolean, shell: ShellRunner = $) {
    const tag = computeTag(ver);
    logger.info(`Dropping local tag: ${tag}`);
    await shell`git tag -d ${tag}`.nothrow();

    if (isRemote) {
        logger.info(`Dropping remote tag: ${tag}`);
        await shell`git push origin :refs/tags/${tag}`.nothrow();
    }
}

// ── Skill citation-resolution guard ─────────────────────────────────────────────
//
// Catches two documentation-drift defect classes the pure content heuristics
// cannot see (they score content, never the filesystem):
//   1. Dead code citations — a `path.ts:LINE` or repo-relative source path in a
//      SKILL.md that no longer exists, or whose line is out of range.
//   2. Rubric dimension drift — a skill that documents a rubric while claiming a
//      dimension count that disagrees with the rubric YAML it points at.
// Lives here (not in packages/core) so the core quality evaluators stay pure
// functions over content (architecture invariant 5). Wired into spur-check as an
// exit-code rule.

/** A single drift/dead-citation finding, tied to the file that produced it. */
export interface Finding {
    file: string;
    message: string;
}

/** Filesystem seam — injected so the checkers are unit-testable without fixtures. */
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

function isResolvablePath(path: string): boolean {
    return RESOLVABLE_PREFIXES.some((p) => path.startsWith(p));
}

/** Resolve every code citation in a skill body; collect dead ones. */
export function checkCitations(file: string, body: string, fs: FileResolver): Finding[] {
    const findings: Finding[] = [];
    for (const match of body.matchAll(CITATION_RE)) {
        const [, path, lineStr] = match;
        if (isResolvablePath(path)) {
            if (!fs.exists(path)) {
                findings.push({ file, message: `dead citation: ${path} (file does not exist)` });
            } else if (lineStr) {
                const total = fs.lineCount(path);
                const line = Number(lineStr);
                if (line > total) {
                    findings.push({ file, message: `dead citation: ${path}:${line} (file has ${total} lines)` });
                }
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

/** Read a rubric's dimension count from disk; -1 when the rubric is absent. */
export function diskRubricCount(rubricType: string): number {
    const path = resolve(ROOT, `packages/core/src/rubrics/${rubricType}.yaml`);
    if (!existsSync(path)) return -1;
    return countRubricDimensions(readFileSync(path, 'utf8'));
}

function fsExists(rel: string): boolean {
    return existsSync(resolve(ROOT, rel));
}

export function fsLineCount(rel: string): number {
    return readFileSync(resolve(ROOT, rel), 'utf8').split('\n').length;
}

/**
 * Scan every plugin SKILL.md matched by `skillGlob`, resolving code citations
 * and checking rubric dimension claims. Prints findings and fails the process
 * when any are found (so it gates spur-check via the exit-code rule).
 */
export function checkSkillCitations(skillGlob: string) {
    const fs: FileResolver = {
        exists: fsExists,
        lineCount: fsLineCount,
    };
    const findings: Finding[] = [];

    for (const rel of new Glob(skillGlob).scanSync({ cwd: ROOT })) {
        if (!rel.includes('node_modules') && !rel.includes('/vendors/')) {
            const body = readFileSync(resolve(ROOT, rel), 'utf8');
            const skillName = rel.split('/').at(-2) ?? '';
            findings.push(...checkCitations(rel, body, fs));
            findings.push(...checkDimensionDrift(rel, body, skillName, diskRubricCount));
        }
    }

    if (findings.length === 0) {
        logger.info(`OK: skill citations resolve and dimension claims match rubrics (${skillGlob})`);
        return;
    }
    for (const f of findings) {
        logger.info(`${f.file}: ${f.message}`);
    }
    fail(`\n${findings.length} citation/drift finding(s).`);
}

/**
 * Ensure a bundle starts with a `#!/usr/bin/env bun` shebang so the bin entry
 * is directly executable. Idempotent: `bun build --target bun` already emits
 * the shebang, so only prepend when missing (otherwise a duplicate shebang on
 * line 2 causes a syntax error at runtime).
 */
export async function postbuild(outfile: string) {
    const content = await Bun.file(outfile).text();
    if (content.startsWith('#!/usr/bin/env bun\n')) return;
    await Bun.write(outfile, `#!/usr/bin/env bun\n${content}`);
}

function isNonFlag(arg: string): boolean {
    return !arg.startsWith('--');
}

export async function runBuilderCommand(argv: string[], shell: ShellRunner = $) {
    const [command, ...args] = argv;
    const version = args.find(isNonFlag);
    const shouldPush = args.includes('--push');
    const isRemote = args.includes('--remote');

    switch (command) {
        case 'bump-ver':
        case 'bump-version': {
            if (!version) fail('Usage: bun scripts/builder.ts bump-ver <version> [--push]');
            await bumpVersion(version, shouldPush, shell);
            break;
        }
        case 'drop-tags': {
            if (!version) fail('Usage: bun scripts/builder.ts drop-tags <version> [--remote]');
            await dropTags(version, isRemote, shell);
            break;
        }
        case 'postbuild': {
            if (!version) fail('Usage: bun scripts/builder.ts postbuild <outfile>');
            await postbuild(version);
            break;
        }
        case 'check-skill-citations': {
            checkSkillCitations(version ?? 'plugins/*/skills/*/SKILL.md');
            break;
        }
        default:
            fail(
                `Unknown command: ${command}\n` +
                    'Usage: bun scripts/builder.ts <bump-ver|drop-tags|postbuild|check-skill-citations> [args]',
            );
    }
}

export function handleMainError(err: unknown): never {
    fail(err instanceof Error ? err.message : String(err));
}

export async function main() {
    await runBuilderCommand(process.argv.slice(2));
}

if (import.meta.main) {
    main().catch(handleMainError);
}
