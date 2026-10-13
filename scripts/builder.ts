#!/usr/bin/env bun

/**
 * Build/release helper for the superskill CLI.
 *
 * Usage:
 *   bun scripts/builder.ts postbuild <outfile>           prepend bun shebang to a bundle
 *   bun scripts/builder.ts check-skill-citations [glob]  resolve skill/agent citations + vendor boundary + drift
 *   bun scripts/builder.ts check-sourced-claims <kind> [glob]  uncited version/API claims in markdown (kind: version|api)
 *   bun scripts/builder.ts check-publish-manifest [pkg]  fail on catalog:/workspace: deps
 *   bun scripts/builder.ts resolve-publish-deps [pkg]    expand catalog: → root catalog version
 *   bun scripts/builder.ts restore-publish-deps [pkg]    restore manifest from resolve backup
 */

import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { $, Glob } from 'bun';

const ROOT = resolve(import.meta.dirname, '..');
// Wired to the disabled bump-ver/drop-tags cases below — drop the underscore when re-enabled.
const _PKG_PATH = resolve(ROOT, 'apps/cli/package.json');
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

// /** Pure: given package.json text and a version, return the updated JSON string. */
// export function bumpPackageVersion(jsonText: string, ver: string): { updated: string; oldVer: string } {
//     const pkg = JSON.parse(jsonText) as { version: string };
//     const oldVer = pkg.version;
//     pkg.version = ver;
//     return { updated: `${JSON.stringify(pkg, null, 4)}\n`, oldVer };
// }
// export async function bumpVersion(ver: string, shouldPush: boolean, shell: ShellRunner = $) {
//     const err = validateVersion(ver);
//     if (err) fail(err);

//     const pathsToAdd: string[] = [];
//     // 1. apps/cli/package.json
//     const { updated: pkgUpdated, oldVer } = bumpPackageVersion(readFileSync(PKG_PATH, 'utf-8'), ver);
//     writeFileSync(PKG_PATH, pkgUpdated);
//     pathsToAdd.push(PKG_PATH);
//     logger.info(`Bumped ${PKG_NAME}: ${oldVer} → ${ver}`);

//     const marketplacePath = resolve(ROOT, '.claude-plugin/marketplace.json');
//     const mpText = existsSync(marketplacePath) ? readFileSync(marketplacePath, 'utf-8') : null;
//     const { marketplace: updated, paths: mpPaths } = bumpMarketplaceManifests(mpText, ver);

//     if (updated !== null && updated !== mpText) {
//         writeFileSync(marketplacePath, updated);
//         pathsToAdd.push(marketplacePath);
//         logger.info(`Bumped marketplace plugins to ${ver}`);
//     }

//     for (const rel of mpPaths) {
//         const pluginJsonPath = resolve(ROOT, rel);
//         if (existsSync(pluginJsonPath)) {
//             const pluginJson = JSON.parse(readFileSync(pluginJsonPath, 'utf-8'));
//             if (pluginJson.version !== ver) {
//                 pluginJson.version = ver;
//                 writeFileSync(pluginJsonPath, `${JSON.stringify(pluginJson, null, 4)}\n`);
//                 pathsToAdd.push(pluginJsonPath);
//                 logger.info(`Bumped ${rel} to ${ver}`);
//             }
//         } else {
//             logger.warn(`  ⚠ plugin.json not found at ${pluginJsonPath} — skipping`);
//         }
//     }

//     const tag = computeTag(ver);

//     await shell`git add ${pathsToAdd}`;
//     await shell`git commit -m ${`chore: release ${PKG_NAME} v${ver}`}`;
//     await shell`git tag -a ${tag} -m ${`${PKG_NAME} v${ver}`}`;

//     logger.info(`\nTag: ${tag}`);

//     if (shouldPush) {
//         logger.info('Pushing commit and tag…');
//         await shell`git push origin main`;
//         await shell`git push origin ${tag}`;
//         logger.info('Pushed main and tag. Publish workflow will trigger on the tag push.');
//         return;
//     }

//     logger.info('Publish workflow will trigger on tag push. To push now:');
//     logger.info(`  git push origin main && git push origin ${tag}`);
// }

// export async function dropTags(ver: string, isRemote: boolean, shell: ShellRunner = $) {
//     const tag = computeTag(ver);
//     logger.info(`Dropping local tag: ${tag}`);
//     await shell`git tag -d ${tag}`.nothrow();

//     if (isRemote) {
//         logger.info(`Dropping remote tag: ${tag}`);
//         await shell`git push origin :refs/tags/${tag}`.nothrow();
//     }
// }

// ── Skill citation-resolution guard ─────────────────────────────────────────────
//
// Catches three documentation-drift defect classes the pure content heuristics
// cannot see (they score content, never the filesystem):
//   1. Dead code citations — a `path.ts:LINE` or repo-relative source path in a
//      checked plugin document that no longer exists, or whose line is out of range.
//   2. Rubric dimension drift — a skill that documents a rubric while claiming a
//      dimension count that disagrees with the rubric YAML it points at.
//   3. Vendor boundary — a reference into the gitignored, never-shipped `vendors/`
//      tree, rejected without a filesystem probe so the verdict cannot depend on
//      whether the local reference checkout happens to exist.
// Lives here (not in packages/core) so the core quality evaluators stay pure
// functions over content (architecture invariant 5). Wired into spur-check as an
// exit-code rule.

/** A single drift/dead-citation finding, tied to the file that produced it. */
export interface Finding {
    file: string;
    message: string;
    /** 1-based line, when the check is line-scoped. */
    line?: number;
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
 * The gitignored `vendors/` tree is deliberately absent — `VENDOR_REF_RE` reports
 * those references as boundary violations rather than resolving them.
 */
const RESOLVABLE_PREFIXES = ['packages/', 'apps/', 'plugins/', 'tooling/', 'scripts/', 'docs/'];

/**
 * Match a reference into the gitignored `vendors/` reference-only tree (ADR-004) — including
 * directory mentions with no file extension. Never shipped, so never citable from plugin content.
 *
 * The leading lookbehind is a word/path boundary, not `\b`: `\b` also sits between `-` and `v`,
 * which made a hyphen-adjacent lookalike (`multi-vendors/registry.ts`) a hard error. A mid-path
 * segment (`plugins/foo/vendors/x.ts`) still matches — it is preceded by `/`.
 */
const VENDOR_REF_RE = /(?<![\w.-])vendors\/[\w./-]*/g;

/** Non-global twin of `VENDOR_REF_RE` for a stateless `.test()` on one citation path. */
const VENDOR_SEGMENT_RE = /(?<![\w.-])vendors\//;

/** Match a code citation: `path.ext` optionally suffixed with `:line`. */
const CITATION_RE = /\b([a-zA-Z0-9_./-]+\.(?:ts|tsx|js|mjs|yaml|yml|json|sh))(?::(\d+))?\b/g;

/** Match a dimension-count claim, e.g. "5 dimensions", "10 rubric dimensions". */
const DIMENSION_CLAIM_RE = /\b(\d+)\s+(?:rubric\s+)?dimensions\b/gi;

/**
 * Match a semver x.y.z token. The lookarounds keep IPs (`127.0.0.1`) and longer dotted numerics
 * (`1.2.3.4`) out — neither is a version claim.
 */
const SEMVER_TOKEN_RE = /(?<![\d.])\d+\.\d+\.\d+(?!\.\d)/;

/**
 * A citation anchor, in the forms `sp-source-driven-development` accepts: an http(s) URL, a repo
 * path with a line (`docs/00_ADR.md:5`, `package.json:42`, `.prototools:1`), or the pinned
 * `pkg@version` form (optionally ranged, `rulesync@^8.28.1`).
 *
 * The path arm needs a real filename shape — a leading-dot config file (`.prototools`) or a
 * dot-separated extension — so a bare `10:30` clock time can never pass as a citation.
 */
const CITATION_ANCHOR_RE =
    /https?:\/\/|(?:[\w.-]+\/)*(?:\.[A-Za-z][\w-]*|[\w-]+(?:\.[\w-]+)+):\d+|[\w@/-]+@[\^~><=]*\d+\.\d+/;

/** Match a time- or version-anchored external API claim, e.g. "deprecated since 1.2". */
const ANCHORED_CLAIM_RE = /\b(?:deprecated (?:since|in|as of)|introduced in|added in|available since|stable since)\b/;

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

/** Resolve every code citation in a skill body; collect dead ones and vendor-boundary violations. */
export function checkCitations(file: string, body: string, fs: FileResolver): Finding[] {
    const findings: Finding[] = [];
    // Boundary first, and without consulting `fs`: the verdict must be identical on a machine
    // that happens to carry the gitignored reference tree and on a clean checkout.
    for (const match of body.matchAll(VENDOR_REF_RE)) {
        findings.push({
            file,
            message: `vendor boundary: ${match[0]} is reference-only (gitignored, not shipped); cite a shipped path or absorb the content`,
        });
    }
    for (const match of body.matchAll(CITATION_RE)) {
        const [, path, lineStr] = match;
        // A shipped-root path with a mid-path `vendors/` segment was already reported above;
        // resolving it too would add a duplicate, machine-dependent `dead citation`.
        if (isResolvablePath(path) && !VENDOR_SEGMENT_RE.test(path)) {
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
 * Every version this repo has released, read from its own `superskill-v<semver>` tags.
 *
 * WHY: a version in this set is an own-history reference whose source is the git tag itself — not
 * an external API/library claim, which is the class this check exists to catch. Both historical tag
 * prefixes are accepted (`@gobing-ai/superskill-v0.3.11` and the older `superskill-v0.3.29`).
 */
export function releaseVersions(): Set<string> {
    const out = new Set<string>();
    const result = Bun.spawnSync({ cmd: ['git', 'tag', '-l'], stdout: 'pipe' });
    for (const tag of new TextDecoder().decode(result.stdout).split('\n')) {
        const m = tag.trim().match(/-v(\d+\.\d+\.\d+)$/);
        if (m?.[1]) out.add(m[1]);
    }
    return out;
}

/** A scoped package reference to something that is not this project. */
const FOREIGN_SCOPE_RE = /@(?!gobing-ai\/superskill)[a-z0-9-]+\/[a-z0-9-]+/i;

/**
 * True when every semver token on the line names one of this repo's own releases, and the line does
 * not also name a foreign scoped package.
 *
 * WHY the foreign-scope guard: an external library version can coincide with one of this repo's own
 * release numbers (`@gobing-ai/ts-ai-runner` 0.3.19 → 0.3.21 are both superskill tags). Without the
 * guard, an external claim would be exempted as own-history — a false negative. KNOWN RESIDUAL: an
 * *unscoped* external name whose version coincides with an own release number is still exempt; no
 * line-local signal distinguishes it, so it is disclosed rather than pretended away.
 */
function isOwnReleaseLine(line: string, release: Set<string>): boolean {
    if (FOREIGN_SCOPE_RE.test(line)) return false;
    const tokens = line.match(new RegExp(SEMVER_TOKEN_RE.source, 'g')) ?? [];
    return tokens.length > 0 && tokens.every((t) => release.has(t));
}

/** Claim classes scanned by `cited-version-strings` and `cited-api-claims`. */
export type ClaimKind = 'version' | 'api';

/** True when a line opens or closes a fenced code block. */
function isFenceDelimiter(line: string): boolean {
    const t = line.trimStart();
    return t.startsWith('```') || t.startsWith('~~~');
}

/**
 * Classify each line as non-assertion surface (`true`) or in-scope (`false`).
 *
 * WHY this exists: a per-line regex cannot see block state, so the previous scan fired on the two
 * shapes a claim check must never flag — a YAML frontmatter block (whose `version:` field the doc
 * contract mandates, so no citation could ever satisfy it) and fenced code (a `package.json`
 * excerpt or command example legitimately carries bare versions). Both were the bulk of the false
 * positives this replaced.
 */
export function claimScanMask(lines: string[]): boolean[] {
    const masked = lines.map(() => false);
    let inFrontmatter = lines[0]?.trim() === '---';
    let inFence = false;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? '';
        if (inFrontmatter) {
            masked[i] = true;
            if (i > 0 && line.trim() === '---') inFrontmatter = false;
            continue;
        }
        if (isFenceDelimiter(line)) {
            masked[i] = true;
            inFence = !inFence;
            continue;
        }
        masked[i] = inFence;
    }
    return masked;
}

/**
 * Find uncited claims in one document body. `kind` selects the class: `version` fires on a semver
 * token, `api` on a time/version-anchored API claim phrase. A line is a finding only when it
 * carries a claim and no citation anchor.
 */
export function findUncitedClaims(
    file: string,
    body: string,
    kind: ClaimKind,
    release: Set<string> = releaseVersions(),
): Finding[] {
    const lines = body.split('\n');
    const masked = claimScanMask(lines);
    const trigger = kind === 'version' ? SEMVER_TOKEN_RE : ANCHORED_CLAIM_RE;
    const findings: Finding[] = [];
    lines.forEach((line, i) => {
        if (masked[i] === true || isOwnReleaseLine(line, release)) return;
        if (!trigger.test(line) || CITATION_ANCHOR_RE.test(line)) return;
        findings.push({
            file,
            line: i + 1,
            message:
                kind === 'version'
                    ? 'uncited version claim: add a source anchor (URL, `path:line`, or `pkg@version`), or drop the version if it is not load-bearing'
                    : 'uncited API claim: add a source anchor (URL, `path:line`, or `pkg@version`) for the anchored claim',
        });
    });
    return findings;
}

/**
 * Scan markdown for uncited version/API claims and fail the process when any are found, so the rule
 * gates spur-check. Defaults to the docs corpus plus shipped plugin skill/agent content; historical
 * task archives are skipped because retro-citing closed records is make-work.
 */
export function checkSourcedClaims(kind: ClaimKind, globs?: string[]) {
    const patterns = globs?.length
        ? globs
        : ['docs/**/*.md', 'plugins/**/SKILL.md', 'plugins/*/agents/*.md', 'plugins/**/skills/**/references/**/*.md'];
    const findings: Finding[] = [];
    const release = releaseVersions();
    for (const glob of patterns) {
        // An explicit existing file is scanned literally: glob engines skip dot-directories, so a
        // caller naming `.spur/rules/fixtures/...` would otherwise match nothing and silently pass.
        const rels = existsSync(resolve(ROOT, glob)) ? [glob] : [...new Glob(glob).scanSync({ cwd: ROOT })];
        for (const rel of rels) {
            if (rel.includes('node_modules') || rel.includes('/vendors/') || rel.startsWith('docs/tasks')) continue;
            findings.push(...findUncitedClaims(rel, readFileSync(resolve(ROOT, rel), 'utf8'), kind, release));
        }
    }
    if (findings.length === 0) {
        logger.info(`OK: no uncited ${kind} claims (${patterns.join(', ')})`);
        return;
    }
    for (const f of findings) logger.info(`${f.file}:${f.line}: ${f.message}`);
    fail(`\n${findings.length} uncited-claim finding(s).`);
}

/**
 * Scan every plugin skill/agent document matched by `skillGlobs`, resolving code citations,
 * rejecting vendor-tree references and checking rubric dimension claims. Prints findings and fails
 * the process when any are found (so it gates spur-check via the exit-code rule).
 */
export function checkSkillCitations(skillGlobs: string | string[]) {
    const globs = Array.isArray(skillGlobs) ? skillGlobs : [skillGlobs];
    const fs: FileResolver = {
        exists: fsExists,
        lineCount: fsLineCount,
    };
    const findings: Finding[] = [];

    for (const glob of globs) {
        for (const rel of new Glob(glob).scanSync({ cwd: ROOT })) {
            if (!rel.includes('node_modules') && !rel.includes('/vendors/')) {
                const body = readFileSync(resolve(ROOT, rel), 'utf8');
                // Agent documents yield 'agents' here, which SKILL_TO_RUBRIC does not map → drift is a no-op.
                const skillName = rel.split('/').at(-2) ?? '';
                findings.push(...checkCitations(rel, body, fs));
                findings.push(...checkDimensionDrift(rel, body, skillName, diskRubricCount));
            }
        }
    }

    if (findings.length === 0) {
        logger.info(`OK: skill citations resolve and dimension claims match rubrics (${globs.join(', ')})`);
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

/**
 * Find workspace-only dependency specifiers (`catalog:`, `workspace:`) in a manifest's runtime
 * dependency fields. npm publishes package.json verbatim — it knows nothing about Bun workspace
 * catalogs — so a literal `catalog:` in the published package makes it uninstallable for consumers
 * (`error: @gobing-ai/ts-utils@catalog: failed to resolve`; shipped live in 0.2.14–0.2.16, task
 * 0074).
 *
 * `workspace:` deps are ALWAYS offenders — workspace packages are not resolvable from npm.
 *
 * `catalog:` deps are offenders ONLY when:
 *   - no `catalog` arg is supplied (legacy callers), or
 *   - the dep name is missing from the supplied root `workspaces.catalog`.
 *
 * When the dep name IS in the root catalog, it is NOT flagged: `resolve-publish-deps` expands it
 * to a concrete semver range at publish time, so the manifest that npm reads is publishable while
 * the source manifest stays as a single-source-of-truth `catalog:` reference.
 *
 * devDependencies are exempt: they never install for consumers of a published package.
 */
export function findUnpublishableSpecifiers(manifestText: string, catalog?: Record<string, string>): string[] {
    const manifest = JSON.parse(manifestText) as Record<string, unknown>;
    const offenders: string[] = [];
    for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
        const deps = manifest[field];
        if (!deps || typeof deps !== 'object') continue;
        for (const [name, spec] of Object.entries(deps as Record<string, unknown>)) {
            if (typeof spec !== 'string') continue;
            if (spec.startsWith('workspace:')) {
                offenders.push(`${field}.${name}: "${spec}"`);
            } else if (spec === 'catalog:') {
                if (catalog === undefined) {
                    offenders.push(`${field}.${name}: "${spec}"`);
                } else if (!catalog[name]) {
                    offenders.push(`${field}.${name}: "${spec}" (no entry in root workspaces.catalog)`);
                }
            }
        }
    }
    return offenders;
}

/**
 * Resolve `catalog:` deps in a published workspace's manifest to concrete semver ranges from the
 * root `workspaces.catalog`. Backs up the original manifest to `<path>.bak` so a paired
 * `restore-publish-deps` call (typically wired into `postpublish`) can put it back. Mirrors the
 * resolver in `spur-new/scripts/commands/publish.ts`; together with `restore-publish-deps` it lets
 * the published package stay the single source of truth (root catalog) without breaking npm.
 *
 * `workspace:` deps are NOT touched here — they're either bundled into the artifact at build time
 * (so they must be STRIPPED, not version-resolved) or replaced via the app's bundling step.
 */
export function resolvePublishDeps(
    manifestText: string,
    catalog: Record<string, string>,
): {
    resolved: string;
    changed: number;
    missing: string[];
} {
    const manifest = JSON.parse(manifestText) as Record<string, unknown>;
    const missing: string[] = [];
    let changed = 0;
    for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies'] as const) {
        const deps = manifest[field] as Record<string, string> | undefined;
        if (!deps) continue;
        for (const [name, spec] of Object.entries(deps)) {
            if (spec === 'catalog:') {
                if (!catalog[name]) {
                    missing.push(`${field}.${name}`);
                } else {
                    deps[name] = catalog[name];
                    changed++;
                }
            }
        }
    }
    return { resolved: `${JSON.stringify(manifest, null, 4)}\n`, changed, missing };
}

/**
 * Find marketplace plugin entries whose version has drifted from the published package version.
 * `bump-ver` writes a single version to both `apps/cli/package.json` and every plugin entry, so any
 * difference at publish time means the packed `.claude-plugin/marketplace.json` advertises a stale
 * plugin version to Claude Code. This shipped silently because the manifest is a build-time copy:
 * task 0113 measured `0.3.11` in the packed tarball against package `0.3.12` (R5).
 */
export function findMarketplaceVersionDrift(marketplaceText: string | null, pkgVersion: string): string[] {
    if (marketplaceText === null) return [];
    const marketplace = JSON.parse(marketplaceText) as { plugins?: Array<{ name?: string; version?: string }> };
    const drift: string[] = [];
    for (const entry of marketplace.plugins ?? []) {
        if (entry.version !== pkgVersion) {
            drift.push(`plugin "${entry.name}": ${entry.version} (package is ${pkgVersion})`);
        }
    }
    return drift;
}

function isNonFlag(arg: string): boolean {
    return !arg.startsWith('--');
}

export async function runBuilderCommand(argv: string[], _shell: ShellRunner = $) {
    const [command, ...args] = argv;
    const version = args.find(isNonFlag);
    const _shouldPush = args.includes('--push');
    const _isRemote = args.includes('--remote');

    switch (command) {
        // case 'bump-ver':
        // case 'bump-version': {
        //     if (!version) fail('Usage: bun scripts/builder.ts bump-ver <version> [--push]');
        //     await bumpVersion(version, shouldPush, shell);
        //     break;
        // }
        // case 'drop-tags': {
        //     if (!version) fail('Usage: bun scripts/builder.ts drop-tags <version> [--remote]');
        //     await dropTags(version, isRemote, shell);
        //     break;
        // }
        case 'postbuild': {
            if (!version) fail('Usage: bun scripts/builder.ts postbuild <outfile>');
            await postbuild(version);
            break;
        }
        case 'check-skill-citations': {
            checkSkillCitations(version ?? ['plugins/*/skills/*/SKILL.md', 'plugins/*/agents/*.md']);
            break;
        }
        case 'check-sourced-claims': {
            const [kind, ...globs] = args;
            if (kind !== 'version' && kind !== 'api') {
                fail('Usage: bun scripts/builder.ts check-sourced-claims <version|api> [glob...]');
            }
            checkSourcedClaims(kind, globs);
            break;
        }
        case 'check-publish-manifest': {
            const manifestPath = version ?? 'apps/cli/package.json';
            const manifestText = readFileSync(resolve(ROOT, manifestPath), 'utf-8');
            const rootText = readFileSync(resolve(ROOT, 'package.json'), 'utf-8');
            const rootCatalog = (JSON.parse(rootText) as { workspaces?: { catalog?: Record<string, string> } })
                .workspaces?.catalog;
            const offenders = findUnpublishableSpecifiers(manifestText, rootCatalog);
            if (offenders.length > 0) {
                fail(
                    `${manifestPath} contains workspace-only specifiers npm cannot publish:\n  ${offenders.join('\n  ')}\n` +
                        'Pin concrete versions in the published workspace, add a `workspaces.catalog` entry, or strip `workspace:` deps before publishing.',
                );
            }
            const pkgVersion = (JSON.parse(manifestText) as { version?: string }).version ?? '';
            const marketplacePath = resolve(ROOT, '.claude-plugin/marketplace.json');
            const drift = findMarketplaceVersionDrift(
                existsSync(marketplacePath) ? readFileSync(marketplacePath, 'utf-8') : null,
                pkgVersion,
            );
            if (drift.length > 0) {
                fail(
                    `.claude-plugin/marketplace.json is stale — the packed manifest would advertise a wrong plugin version:\n  ${drift.join('\n  ')}\n` +
                        `Run \`spur builder bump-ver ${pkgVersion}\` to sync the marketplace and plugin.json manifests before publishing.`,
                );
            }
            logger.info(`${manifestPath}: publishable — no workspace-only specifiers, marketplace versions in sync.`);
            break;
        }
        case 'resolve-publish-deps': {
            const manifestPath = version ?? 'apps/cli/package.json';
            const absPath = resolve(ROOT, manifestPath);
            const backupPath = `${absPath}.bak`;
            const rootText = readFileSync(resolve(ROOT, 'package.json'), 'utf-8');
            const catalog =
                (JSON.parse(rootText) as { workspaces?: { catalog?: Record<string, string> } }).workspaces?.catalog ??
                {};
            const original = readFileSync(absPath, 'utf-8');
            const { resolved, changed, missing } = resolvePublishDeps(original, catalog);
            if (missing.length > 0) {
                fail(`${manifestPath}: catalog: deps missing root entries: ${missing.join(', ')}`);
            }
            if (changed === 0) {
                logger.info(`${manifestPath}: no catalog: specifiers to resolve.`);
                break;
            }
            writeFileSync(backupPath, original);
            writeFileSync(absPath, resolved);
            logger.info(`${manifestPath}: resolved ${changed} catalog: specifier(s); backup at ${backupPath}.`);
            break;
        }
        case 'restore-publish-deps': {
            const manifestPath = version ?? 'apps/cli/package.json';
            const absPath = resolve(ROOT, manifestPath);
            const backupPath = `${absPath}.bak`;
            if (!existsSync(backupPath)) {
                logger.warn(`${backupPath} not found; nothing to restore.`);
                break;
            }
            writeFileSync(absPath, readFileSync(backupPath, 'utf-8'));
            unlinkSync(backupPath);
            logger.info(`${manifestPath}: restored from backup; backup removed.`);
            break;
        }
        default:
            fail(
                `Unknown command: ${command}\n` +
                    'Usage: bun scripts/builder.ts <postbuild|check-skill-citations|check-sourced-claims|check-publish-manifest|resolve-publish-deps|restore-publish-deps> [args]',
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
