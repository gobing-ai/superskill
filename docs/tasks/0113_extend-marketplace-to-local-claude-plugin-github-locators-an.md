---
template: feature-impl
schema_version: 1
name: "Extend --marketplace to local/.claude-plugin/GitHub locators and ship bundled plugins via npm"
description: ""
status: done
type: task
profile: standard
feature_id: F3
parent_wbs: null
priority: P2
tags: []
dependencies: []
ac_numbering: task-local
created_at: "2026-08-09T21:50:38.891Z"
updated_at: "2026-08-10T03:48:35.292Z"
---

## 0113. Extend --marketplace to local/.claude-plugin/GitHub locators and ship bundled plugins via npm

### Background
`superskill install <plugin>` today can only resolve a plugin from a **local** marketplace manifest. End users who want the bundled `cc` plugin must either git-clone the superskill repo (or `bun link`) and run from the checkout, or pass a brittle `--marketplace <path>/.claude-plugin`. The user's intuitive forms all fail:

- `superskill install https://github.com/gobing-ai/superskill/tree/main/plugins/cc`
- `superskill install ~/.bun/install/global/node_modules/superskill/plugins/cc`
- `superskill install gobing-ai/superskill`

Three root causes (verified 2026-08-09):

1. **`<plugin>` is a name, not a locator.** Every form above fails `assertSafePathSegment` (rejects `/`, `\`, `.`, `..`, NUL) at the top of `resolvePluginRoot()` (`apps/cli/src/commands/install.ts:1157`). The guard is load-bearing: `<plugin>` flows into cache keys (`~/.claude/plugins/cache/<marketplace>/`), `plugin@marketplace` OMP addressing, and the Grok install target. It must **not** be weakened.

2. **`--marketplace` only accepts a local path with an exact layout.** `resolvePlugin()` (`packages/core/src/marketplace.ts:55-159`) probes `<path>/marketplace.json` (or the path itself if it ends in `marketplace.json`). It never probes `<path>/.claude-plugin/marketplace.json`, despite the `--marketplace` help text promising "the file or its containing directory". So pointing at a repo/package root — the standard Claude Code layout — misses.

3. **The npm tarball does not ship plugin content, and the CLI cannot find its own install root.** The published package is `@gobing-ai/superskill` (`apps/cli/package.json`), whose `files` array is `["dist/", "rubrics/", "README.md"]` — `plugins/cc`, `.claude-plugin/marketplace.json`, and `magents/` are absent. Additionally the CLI has **no runtime self-location** (zero `import.meta.dir`/`__dirname` usage in `apps/cli/src`), so even if shipped, the plugin would be unreachable from an unrelated CWD.

**Important investigation correction:** the global install at `~/.bun/install/global/node_modules/superskill` is a **symlink to the local repo** (`bun link`), not a registry install. Prior "it works from the global npm install" tests ran against local source via that symlink. Any distribution test must exercise the real published tarball, not the symlink, or it passes for the wrong reason.

Goal: `bun add -g @gobing-ai/superskill`, then from **any** directory, `superskill install cc --magent team-stark-children` works with no clone, no checkout, no extra flags. `--marketplace` is the single escape hatch for any other marketplace (local dir, GitHub URL, GitHub shorthand `owner/repo`).

Prior working document: `docs/plans/2026-08-09-marketplace-locator-and-npm-distribution.md` (this task's source material).
### Requirements
- R1. `--marketplace <X>` resolves via a uniform three-way probe in `resolvePlugin()` and `listResolvablePlugins()` (`packages/core/src/marketplace.ts`): direct file (`<X>` ends in `marketplace.json`) → `<X>/marketplace.json` → `<X>/.claude-plugin/marketplace.json`; error only after all three, naming every probed path. **`marketplaceRoot` MUST be derived per matched branch**, not by the current fixed `resolve(manifestPath, '..', '..')` (`packages/core/src/marketplace.ts:138`) — that expression assumes the manifest sits in `<root>/.claude-plugin/`, so for the *already-shipping* `<X>/marketplace.json` branch it yields the **parent of `<X>`**, one level too high. Pre-existing latent bug; the new probe makes it reachable far more often. Rule: `marketplaceRoot = dirname(manifestPath)`, raised one level only when that dirname is literally named `.claude-plugin`. This is load-bearing beyond `source` resolution — `apps/cli/src/commands/install.ts:578` reads `join(resolution.marketplaceRoot, 'magents')` for the authoring-SSOT magents, so a wrong root silently drops `--magent` instead of erroring.
- R2. `--marketplace <X>` accepts a GitHub repo URL (`https://github.com/owner/repo`, optional `/tree/<ref>` / `/tree/<ref>/<subpath>`) and shorthand `owner/repo`, resolving the marketplace manifest remotely. **Disambiguation is local-first and explicit:** if `<X>` resolves to an existing local path it is local; only a non-existent `<X>` matching `^[\w.-]+/[\w.-]+$` is treated as GitHub shorthand; any `https://`/`git@` form is always remote. Without this rule `--marketplace foo/bar` is ambiguous with a relative directory. Document the rule in `--marketplace` help.
- R3. Reuse/enhance the existing skills-ecosystem GitHub fetch/auth layer (`parseGitHubRepoUrl:137`, `getGitHubToken:111`, `ghAuthTokenFromCli:122`, `fetchRepoTree:317`, `cloneRepo:569`, `isGitHubHttpsCloneUrl:174` in `packages/core/src/skills-ecosystem/fetch.ts`) as a shared primitive used by both `install` and `skill add`. Do NOT build a parallel GitHub client.
- R4. Remote plugin content is materialized into a local cache, and `marketplaceRoot` resolves to that cache dir so the existing `resolve(marketplaceRoot, source)` + plugin-content check run unchanged. **The cache key derives from the locator (`<owner>/<repo>/<ref>`), which is known before any network call — never from `manifest.name`**, which is only known *after* the fetch (the earlier `~/.cache/superskill/marketplaces/<marketplaceName>/` draft is a chicken-and-egg and has no slot for the agreed per-version key). Path: `~/.cache/superskill/marketplaces/<owner>/<repo>/<ref>/`. Every locator-derived segment passes `assertSafePathSegment` **before** any `mkdir`/write — the existing marketplace-name assert in `resolvePluginRoot` runs downstream of the cache write and cannot protect it. Path-escape guards (`..`, absolute `source`/`pluginRoot`) remain enforced against the materialized tree.
- R5. The published tarball ships `plugins/`, `.claude-plugin/marketplace.json`, and `magents/` **at the package root**. Adding them to the `files` array alone does **not** work: all three live at the **monorepo root**, while the published package is `apps/cli/`, and npm packs only paths under the package directory — bare `files` entries would pack nothing and the failure is silent (measured; see References). Use the pattern this repo already established for exactly this problem: `build:bundle` does `rm -rf rubrics && cp -r ../../packages/core/src/rubrics rubrics`, `prepublishOnly` does `cp ../../README.md README.md`, and both copies are gitignored (`.gitignore:156,158`) while listed in `files`. So: (a) extend `build:bundle`/`prepublishOnly` with the same copy for `../../plugins`, `../../.claude-plugin`, `../../magents`; (b) add the three copy destinations to `.gitignore`; (c) list them in `files`. **Marketplace-root invariant:** the copied `.claude-plugin/marketplace.json`, `plugins/`, and `magents/` all sit at the package root, so both `source: ./plugins/<name>` and `join(marketplaceRoot, 'magents')` resolve — one root satisfies BOTH Claude Code (`claude plugin marketplace add <pkg-root>`) and superskill self-location. The copies are build artifacts: never hand-edit `apps/cli/{plugins,.claude-plugin,magents}`, and `bun run bump-ver` must run before the copy so the packed manifest version is not stale (repo manifest is currently `0.3.11` vs package `0.3.12`).
- R6. The CLI resolves its own installed package root at runtime and probes it for `.claude-plugin/marketplace.json` then `plugins/<name>`, so `bun add -g @gobing-ai/superskill && superskill install cc` works from any directory with zero clone and zero flags. **Mechanism (measured, see References — do not re-spike):** in `build:bundle` output (`dist/index.js`, `--target bun`) `import.meta.dir` is populated with the real `dist/` path and is **already symlink-resolved**, so `resolve(import.meta.dir, '..')` = package root even when invoked through the `~/.bun/bin/<name>` symlink that `bun add -g` creates. `process.argv[1]` is likewise already real-path'd under bun; `realpathSync` on it is therefore defensive only (keep it — it costs nothing and protects a future node-hosted bin), **not** the load-bearing part. **The load-bearing guard is the `--compile` case:** `bun run build` produces `dist/superskill` via `bun build --compile`, where `import.meta.dir` is the virtual `/$bunfs/root` and `argv[1]` is `/$bunfs/root/<bin>` — neither exists on disk, and `realpathSync` on them throws ENOENT. Self-location MUST detect a non-existent/virtual root (guard on `/$bunfs` prefix or a plain `existsSync` check) and **fall through silently** to the CWD probe rather than throwing. In the dev repo the probe also legitimately finds nothing (`resolve(import.meta.dir, '..')` = `apps/cli`, whose `plugins/`/`.claude-plugin/`/`magents/` copies exist only after `build:bundle`); same silent fall-through. Do **not** walk parent directories to reach the monorepo root — that would make dev and published behavior diverge.
- R7. `--marketplace-source` (`apps/cli/src/commands/install.ts:74`) is deprecated: print a one-line warning to stderr, keep current behavior, document removal. No new option is added. The existing coverage at `apps/cli/tests/commands/install.test.ts:461` must be updated to assert the warning rather than be broken by it.
- R8. Docs updated in the same commit as surface: `docs/00_ADR.md` (new ADR entry superseding the "remote sources deferred" / `--marketplace-source` wording), `docs/01_PRD.md:104`, `docs/02_ROADMAP.md:117`, `docs/03_ARCHITECTURE.md`, `docs/04_DESIGN.md:23`, `docs/05_FEATURES.md`, `docs/help/cmd_install.md`, `docs/help/bundled_plugin.md` (it documents the bundled-plugin install path and currently assumes a repo checkout).
- R9. Remote resolution has a stated network contract: warm cache resolves with **no** network call; cold cache while offline fails with an actionable error naming both the fetch URI and the cache path; private repos authenticate via the existing `getGitHubToken` chain; public repos need no token. Never auto-refresh a cache entry a prior offline run depends on.
### Acceptance Criteria
- AC1: All three probe branches resolve — `<dir>/.claude-plugin/marketplace.json`, `<dir>/marketplace.json` at root, and a direct `<path>/marketplace.json` file; all three missing → one error listing every probed path. **Plus the root-derivation regression:** for the `<X>/marketplace.json` branch, `marketplaceRoot === <X>` (not `dirname(<X>)`), asserted directly, with a companion case proving `source: ./plugins/<n>` and `<X>/magents/` both resolve under `<X>`.
- AC2: `--marketplace https://github.com/gobing-ai/superskill` and `--marketplace gobing-ai/superskill` both resolve the `cc` plugin (dry-run passes, plugin root materialized in cache) from an unrelated CWD. A `--marketplace <existing-local-dir-with-a-slash>` still resolves locally (local-first disambiguation, R2).
- AC3: `npm pack` (or `prepublishOnly` + `npm pack`) in `apps/cli` produces a tarball whose file list contains `plugins/cc/**`, `.claude-plugin/marketplace.json`, and `magents/team-stark-children/**`. **Verified by extracting the packed tarball into a temp dir** — never by inspecting the repo tree and never through the `bun link` symlink, which is exactly what misled the original investigation. `claude plugin marketplace add <extracted-pkg-root>` accepts the extracted root as a marketplace.
- AC4: From the AC3 extracted tarball, running `<tmp>/package/dist/index.js install cc --magent team-stark-children --dry-run` with CWD set to a **separate empty directory** resolves the bundled plugin and stages the `team-stark-children` magent — no `--marketplace`, no clone, no network, no publish. This is the CI-able proxy for "a real registry install"; a live `bun add -g @gobing-ai/superskill` run is a manual post-release smoke, not a merge gate (it cannot be one — it requires publishing first).
- AC5: `skill add` test suite stays green (shared fetch layer — no regression).
- AC6: `<plugin>` remains a bare segment (`assertSafePathSegment` unchanged); path-escape guards run against materialized remote trees (`..`/absolute `source`/`pluginRoot` rejected in the remote path); every locator-derived cache path segment is asserted **before** the first `mkdir`.
- AC7: Passing `--marketplace-source github` prints a deprecation warning to stderr and preserves current behavior; `apps/cli/tests/commands/install.test.ts:461` asserts the warning; help/docs state the removal plan.
- AC8: Docs (ADR/PRD/ROADMAP/ARCH/DESIGN/FEATURES/cmd_install/bundled_plugin) updated in the same commit as the surface change.
- AC9: Warm cache resolves offline with zero network calls; cold cache offline errors naming the fetch URI and the cache path.
- AC10: Self-location degrades safely where it cannot apply — the `bun run build` `--compile` binary (`import.meta.dir` = virtual `/$bunfs/root`) and a dev-repo source run (`apps/cli`, no copied `plugins/`) both **fall through silently** to the CWD probe with no throw and no ENOENT from `realpathSync`. Covered by a unit test that feeds a virtual/non-existent root into the self-location helper.
### Q&A
**Closed decisions (agreed 2026-08-09):**

- **Extend `--marketplace`, no new option.** Do NOT add `--marketplace-source` (already exists) or a new `--source` flag. `--marketplace` becomes a marketplace locator accepting local dir, local `.claude-plugin/marketplace.json`, GitHub URL, or GitHub shorthand. GitHub is reached via `--marketplace`, never via `<plugin>`.
- **GitHub is the only remote transport this round.** The existing fetch infra is GitHub-only; GitLab/other hosts are deferred behind the same interface later.
- **Reuse skills-ecosystem fetch, do NOT port `parseSource` into `install`.** `install` stays marketplace-shaped; it reuses only the fetch/auth/tree primitives. `skill add`'s full `parseSource` (source-parser.ts) is not shared into `install`.
- **Do NOT weaken `assertSafePathSegment`.** `<plugin>` remains a bare name (cache keys, OMP `plugin@marketplace` addressing, Grok target depend on it).
- **Cache location & key — superseded by R4 during review (2026-08-09).** The original decision read `~/.cache/superskill/marketplaces/<marketplaceName>/`, keyed on the manifest `name` with a per-version key from the manifest `version`. That is unimplementable as stated: both `name` and `version` come from a manifest you cannot read until after the fetch that needs the cache path. **R4 supersedes it:** key on the locator `<owner>/<repo>/<ref>`, which is known before any network call — the `<ref>` segment already provides per-version identity, so no separate manifest-version key is needed. A `--refresh` escape remains optional, not required.
- **`--marketplace-source github` deprecation.** Warn on stderr, keep behavior, plan removal in a later release (T6). Do not silently drop it.

**Deferred (explicitly out of scope):**

- Arbitrary third-party per-plugin URLs (URL directly to `plugins/cc`, non-marketplace repos). `--marketplace` points at a marketplace; `<plugin>` selects from its manifest.
- GitLab / generic remote hosts.
- Auto-update of remote marketplaces (beyond the per-`<ref>` cache key).
### Design
**Approach.** Introduce marketplace **locator** resolution returning `{ manifest, marketplaceRoot }`, where `marketplaceRoot` is a local dir for local inputs and a cache dir for remote inputs. Everything downstream (`resolve(marketplaceRoot, source)`, the plugin-content check, `join(marketplaceRoot, 'magents')`) is unchanged once `marketplaceRoot` is known.

**Local probe + root derivation (T1).** Probe order in `resolvePlugin`/`listResolvablePlugins`: direct file → `<X>/marketplace.json` → `<X>/.claude-plugin/marketplace.json`; actionable "not found" only after all three. The probe is the easy half; **the correctness core is `marketplaceRoot`**. Today `packages/core/src/marketplace.ts:138` hardcodes `resolve(manifestPath, '..', '..')`, valid only for the `.claude-plugin/` layout — the existing `<X>/marketplace.json` branch already computes the *parent* of `<X>` (measured: `/repo/marketplace.json` → `/`), so a manifest at a directory root resolves `./plugins/cc` and `magents/` **outside** that directory. Replace with a per-branch derivation: `marketplaceRoot = dirname(manifestPath)`, raised one level only when `basename(dirname(manifestPath)) === '.claude-plugin'`. That single rule covers all three branches including a direct-file path whose parent is or is not `.claude-plugin`.

**Distribution (T4) — the fatal detail.** `plugins/`, `.claude-plugin/`, and `magents/` live at the **monorepo root**; the published package is `apps/cli/`. npm packs only paths under the package directory, so adding those names to `files` packs **nothing** and fails silently (measured — see References). The repo already solved this: `apps/cli/rubrics/` and `apps/cli/README.md` are build-time copies (`build:bundle`: `rm -rf rubrics && cp -r ../../packages/core/src/rubrics rubrics`; `prepublishOnly`: `cp ../../README.md README.md`), gitignored at `.gitignore:156,158`, and listed in `files`. Extend that same step for the three dirs, gitignore the copies, list them in `files`. Marketplace-root invariant: all three land at the package root next to `dist/`, so `source: ./plugins/<name>` and `join(marketplaceRoot, 'magents')` both resolve, and one root serves Claude Code (`claude plugin marketplace add <pkg-root>`) and superskill alike. `check-publish-manifest` only scans dep specifiers — no interaction. Sizes: `plugins/` 1.0M, `magents/` 44K — no packaging concern.

**Self-location (T5).** Resolution order in `resolvePluginRoot` (`apps/cli/src/commands/install.ts`):
1. `--marketplace` (extended)
2. `superskill.jsonc` ConfigPluginPath (unchanged)
3. CWD `.claude-plugin/marketplace.json` (unchanged)
4. **installed package root** `.claude-plugin/marketplace.json` then `plugins/<name>` (NEW)
5. `plugins/<name>` relative to CWD (unchanged, last resort)

Step 4 feeds the package root into the T1 probe, so **T5 depends on T1** — without the two-level probe the package root's `.claude-plugin/marketplace.json` is invisible. **The `import.meta.dir` spike is already resolved (measured, see References): no spike needed.** In `build:bundle` output (`--target bun`) `import.meta.dir` holds the real `dist/` path and is already symlink-resolved, so `resolve(import.meta.dir, '..')` = package root even when invoked via the `~/.bun/bin/<name>` symlink `bun add -g` creates; `process.argv[1]` is also already real-path'd by bun, making `realpathSync` defensive rather than load-bearing. **The guard that matters** is the `--compile` binary (`bun run build` → `dist/superskill`), where `import.meta.dir` is the virtual `/$bunfs/root` and `argv[1]` is `/$bunfs/root/<bin>` — neither exists on disk and `realpathSync` throws ENOENT on them. Step 4 must therefore treat a virtual or non-existent root as "not found" and fall through silently. The dev repo hits the same silent path (`resolve(import.meta.dir,'..')` = `apps/cli`, whose copies exist only post-build) and is served by step 3. Do not walk up to the monorepo root.

**Shared fetch layer (T2).** Extract one helper, e.g. `materializeRepoSubdir(repo, ref, subdir, destDir): Promise<void>`, in `packages/core/src/skills-ecosystem/`, on the existing `getGitHubToken`/`fetchRepoTree`/`cloneRepo`. Used by both `install` and, where applicable, `skill add`. Choose tree + per-file blob fetch vs shallow sparse clone per `fetchRepoTree` capabilities.

**Remote resolution (T3).** Detect GitHub via `parseGitHubRepoUrl`/`isGitHubHttpsCloneUrl`, **local-first**: an existing local path wins; only a non-existent `^[\w.-]+/[\w.-]+$` is shorthand. Fetch the manifest (apply the T1 probe to the fetched tree), materialize the plugin `source` into `~/.cache/superskill/marketplaces/<owner>/<repo>/<ref>/`, set `marketplaceRoot` = that cache root. Key on the **locator**, not `manifest.name` — the name is unknown until after the fetch, and `<ref>` already carries per-version identity. `assertSafePathSegment` every segment before the first `mkdir`; the existing marketplace-name assert in `resolvePluginRoot` runs downstream of the cache write and cannot guard it. Escape guards still run against the materialized tree.

**Invariants preserved:** single plugin per install; idempotent output; no silent data loss; pipeline stages pure; `<plugin>` stays a bare segment; path-escape guards enforced on materialized trees.
### Plan
Ordered checklist. T1 first (it is a prerequisite of T5, not merely "small"); then T4+T5 (zero-clone with the bundled plugin, no network); then T2+T3 (GitHub remote); then T6; T7 throughout, in the same commits as surface.

- [x] **T1 — Local `--marketplace` probe + `marketplaceRoot` derivation.** `packages/core/src/marketplace.ts` `resolvePlugin()` + `listResolvablePlugins()`: probe direct-file → `<X>/marketplace.json` → `<X>/.claude-plugin/marketplace.json`. Replace the hardcoded `resolve(manifestPath, '..', '..')` (line 138) with `dirname(manifestPath)`, raised one level only when that dirname is `.claude-plugin`. Tests in `packages/core/tests/marketplace.test.ts` + `apps/cli/tests/commands/install.test.ts`: one fixture per branch, plus a direct assertion that the root-level-`marketplace.json` branch yields `marketplaceRoot === <X>` and that `<X>/magents/` is found there (regression on the latent bug — that branch currently has zero coverage).
- [x] **T4 — Ship bundled plugin content + manifest + magents.** Extend `build:bundle`/`prepublishOnly` in `apps/cli/package.json` to copy `../../plugins`, `../../.claude-plugin`, `../../magents` into the package (mirroring the existing `rubrics`/`README.md` copies), gitignore the three destinations, and add them to `files`. `npm pack` then **extract the tarball to a temp dir** and assert `plugins/cc/**`, `.claude-plugin/marketplace.json`, `magents/team-stark-children/**` are present. Run `bun run bump-ver` before packing so the copied manifest version is not stale (repo `0.3.11` vs package `0.3.12`). **New publish-surface gate:** `magents/` and `plugins/` become *published* content the moment this task lands — anything in them ships to every user. Before the first publish, review `magents/**` for repo-foreign content. A live example was found during review on 2026-08-09: `magents/team-stark-children/AGENTS.md` carries an uncommitted "System Design Best Practices" block describing a **trading system** (`Replay → Shadow → Canary → Live`, wallet management, order book handling) that has nothing to do with superskill. Resolve that (revert or keep deliberately) before T4 ships, and add the content review to the release checklist.
- [x] **T5 — CLI runtime self-location.** *(depends on T1.)* Add the installed-package-root step to `resolvePluginRoot` between the CWD probe and the CWD `plugins/<name>` fallback. **No spike required — `import.meta.dir` behavior is already measured (References).** Use `resolve(import.meta.dir, '..')`; keep `realpathSync(process.argv[1])` as a defensive fallback. Implement the virtual/non-existent-root guard so the `--compile` binary (`/$bunfs/root`) and dev-repo runs fall through silently instead of throwing ENOENT. Test by running the extracted tarball's `dist/index.js` from an empty unrelated CWD (offline, no publish), plus a unit test feeding a virtual root to the helper.
- [x] **T2 — Common GitHub fetch layer.** Extract `materializeRepoSubdir` (or equivalent) in `packages/core/src/skills-ecosystem/` on the existing auth/tree primitives; used by both `install` and `skill add`. Tests with a mocked GitHub tree; `skill add` suite stays green.
- [x] **T3 — Remote marketplace + cache resolution.** GitHub locators (URL/shorthand, local-first disambiguation): fetch manifest, materialize `source` into `~/.cache/superskill/marketplaces/<owner>/<repo>/<ref>/`, set `marketplaceRoot` = cache. Assert every path segment before `mkdir`; escape guards preserved on the materialized tree. Tests: URL, shorthand, `/tree/<ref>/.claude-plugin`, existing-local-dir-with-slash stays local, offline warm cache (zero network) and offline cold cache (error names URI + cache path).
- [x] **T6 — Deprecate `--marketplace-source github`.** One-line stderr warning, behavior unchanged; update `apps/cli/tests/commands/install.test.ts:461` to assert the warning; update `docs/help/cmd_install.md`; state the removal plan.
- [x] **T7 — Docs sync.** New ADR entry in `docs/00_ADR.md` (supersede "remote sources deferred" + `--marketplace-source` wording); `docs/01_PRD.md:104`, `docs/02_ROADMAP.md:117`, `docs/03_ARCHITECTURE.md` (locator + cache + self-location), `docs/04_DESIGN.md:23` (`--marketplace` surface, disambiguation rule, cache path, deprecation), `docs/05_FEATURES.md`, `docs/help/cmd_install.md` (rewrite `--marketplace` help + zero-clone runbook), `docs/help/bundled_plugin.md` (drop the repo-checkout assumption).
- [x] **Verification gate.** `bun run lint`, `bun run test`, `bun run build`, `bun run spur-check` all green; `git status` intentional only.
### Solution
| File | Range | What / Why |
| --- | --- | --- |
| `packages/core/src/marketplace.ts` | 55-102 | T1: `findMarketplaceManifest` three-way probe (direct file → `<X>/marketplace.json` → `<X>/.claude-plugin/marketplace.json`) + `deriveMarketplaceRoot` per-branch root derivation; fixes latent root-level-manifest bug (`resolve(manifestPath,'..','..')` yielded parent of `<X>`) |
| `packages/core/src/skills-ecosystem/fetch.ts` | 512-566 | T2: `materializeRepoSubdir` shared fetch primitive (Trees API + per-file raw fetches) on the existing auth/tree layer, used by both install and skill add |
| `apps/cli/src/commands/install.ts` | 180-270 | T3: `parseRemoteMarketplaceLocator`, `isRemoteMarketplaceLocator` (local-first disambiguation), `marketplaceCacheRoot`, `resolveRemoteMarketplace` (warm-cache offline / cold-cache actionable error / segment asserts before mkdir) |
| `apps/cli/src/commands/install.ts` | 1257-1285 | T5: `resolveInstalledPackageRoot` self-location (import.meta.dir + defensive realpath), virtual `/$bunfs` fall-through |
| `apps/cli/src/commands/install.ts` | 1347-1373 | T5: installed-package-root step in `resolvePluginRoot` probing `.claude-plugin/marketplace.json` then `plugins/<name>` |
| `apps/cli/src/commands/install.ts` | 293-299 | T6/R7: `--marketplace-source` deprecation warning via `echoError` (stderr), behavior unchanged |
| `apps/cli/package.json` | files + build:bundle | T4: ship `plugins/`, `.claude-plugin/`, `magents/` at package root; build:bundle copies them from monorepo root and prunes copied `tests/` (not distribution content; prevents repo test-discovery failure) |
| `.gitignore` | 159-161 | T4: ignore `apps/cli/{plugins,.claude-plugin,magents}` build copies |
| `apps/cli/tests/commands/install.test.ts` | — | T1/T3/T6 tests: probe branches, locator parsing, local-first disambiguation, warm/cold cache contract, `--marketplace-source` warning |
| `packages/core/tests/marketplace.test.ts` | — | T1 tests: each probe branch + `marketplaceRoot === <X>` regression for root-level manifest |
| `packages/core/tests/skills-ecosystem/fetch.test.ts` | — | T2 `materializeRepoSubdir` tests (materialize, tree-fetch failure, empty-subdir) |
| `docs/00_ADR.md` `docs/01_PRD.md` `docs/02_ROADMAP.md` `docs/03_ARCHITECTURE.md` `docs/04_DESIGN.md` `docs/05_FEATURES.md` `docs/help/cmd_install.md` `docs/help/bundled_plugin.md` | — | T7: docs sync (ADR supersede remote-deferred + `--marketplace-source` wording; locator/cache/self-location; zero-clone runbook; drop repo-checkout assumption) |
| `apps/cli/package.json` | scripts | **Re-audit fix:** staging moved `prepublishOnly` → **`prepack`**. npm runs `prepublishOnly` only on `npm publish`, so `npm pack` packed stale (or absent, silently) gitignored copies — which is what let the version drift below go unnoticed. `prepublishOnly` now holds the publish gate alone |
| `scripts/builder.ts` | 340-357, 384-400 | **Re-audit fix:** `findMarketplaceVersionDrift` + wiring into `check-publish-manifest`; a marketplace/plugin version that lags the package now fails the publish loudly instead of shipping silently |
| `.claude-plugin/marketplace.json` `plugins/cc/plugin.json` | version | **Re-audit fix:** synced `0.3.11` → `0.3.12` (data half of `bump-ver`; commit/tag left to the operator) |
| `apps/cli/tests/commands/install.test.ts` | 969-1023 | **Re-audit fix:** AC2 end-to-end — both locator forms → cold-cache materialize → `resolvePluginRoot` yields a cache-local plugin root |
| `scripts/tests/builder.test.ts` | 648-670 | **Re-audit fix:** `findMarketplaceVersionDrift` unit coverage (drift flagged / in-sync passes / absent manifest) |
| `docs/help/release.md` `docs/help/index.md` | — | **T4 completion:** the release checklist T4 required. Publish-surface content review (personal data, repo-foreign content, credentials) as step 1; documents the `prepack`/`prepublishOnly` split and mandates `npm publish --dry-run` over `npm pack` for artifact verification |
| `packages/core/src/skills-ecosystem/fetch.ts` | 512-530 | **R3 documented deviation (CHANGED, not NOT-DONE).** T2's contract is "used by both `install` and, *where applicable*, `skill add`". Applicability was evaluated and rejected for `skill add`: `materializeRepoSubdir` materializes via `res.text()`, so it is text-only and GitHub-only — substituting it for `cloneRepo` would UTF-8-mangle binary skill assets, drop non-GitHub git sources, and lose git-credential auth for private repos. `skill add` keeps `tryBlobInstall` (selective SKILL.md discovery → in-memory `BlobSkill`s) + `cloneRepo` (full-fidelity fallback). R3's binding constraint — one shared auth/tree layer, no parallel GitHub client — holds: both consumers route through `fetch.ts` (`getGitHubToken`, `fetchRepoTree`, `parseGitHubRepoUrl`). Boundary recorded in the helper's TSDoc |
### Testing
**Re-audit 2026-08-09 (`/sp:dev-verify 0113 --force --focus all --fix all`), second pass.** Independent
re-run of every gate; prior evidence was not trusted. First pass returned PARTIAL on two measured
distribution defects and two open residuals. All four are now closed — **Verdict: PASS**. One
operator decision remains open before an actual publish (see Pre-publish blocker); it is a release
gate, not an unmet requirement.

**Gate commands run this turn (2026-08-09):**
- `bun run lint` — biome 216 files clean; typecheck both workspaces exit 0.
- `bun run test` — **2008 pass / 0 fail** (2003 at entry; +5 tests added by this audit).
- `bun run build` — exit 0 (bundle + `--compile`).
- `bun run spur-check` — coverage-gate, skill-citations-resolve, every-export-has-tsdoc green.
- AC3: `npm pack` → extract → **129 files**, `plugins/cc/**` 112, `plugins/**/tests` **0** dirs,
  `.claude-plugin/marketplace.json` present, `magents/team-stark-children/**` 8, all three manifests `0.3.12`.
- AC4: extracted `dist/index.js install cc --magent team-stark-children --dry-run --verbose` from a
  **separate empty CWD** → `Plugin root: <extract>/package/plugins/cc`, magents staged to 9 targets,
  **exit 0**, no network. Control: bogus plugin → exit 1, so exit 0 is discriminating.
- Publish path: `npm publish --dry-run` → `prepublishOnly` (guard: "marketplace versions in sync")
  then `prepack` (staging), 129 files at `0.3.12`. Guard proven to *fire*: re-drifting the manifest to
  `0.3.11` made publish **exit 1** with the actionable message and produce no tarball; restored after.

**Defects found and fixed by this audit**
1. **Stale manifest shipped (R5).** Packed tarball advertised plugin `0.3.11` against package `0.3.12`.
   `bump-ver` takes an explicit version and creates a git commit + tag, so it cannot be wired into a
   build. Fixed by syncing both manifests to `0.3.12` (data half only) and adding
   `findMarketplaceVersionDrift` (`scripts/builder.ts:340`) to `check-publish-manifest`, so drift now
   fails the publish loudly.
2. **`npm pack` packed stale content (R5/AC3) — root cause of #1 going unnoticed.** Staging lived in
   `prepublishOnly`, which npm runs on `npm publish` **only**. `npm pack` therefore packed whatever
   gitignored copies sat in `apps/cli/` (measured 23 min stale) and packs *nothing*, silently, when
   they are absent. AC3's stated method was certifying the staging dir rather than the repo. Staging
   moved to **`prepack`** (runs for both). Note the CI release path is `npm publish`
   (`.github/workflows/publish.yml:46`), so published *content* was always fresh — the user-facing
   defect was #1's version drift; #2 is what hid it.
3. **AC2 had no end-to-end coverage.** Parsing, disambiguation and cache contract were covered, but
   nothing exercised AC2's actual claim; its cited backup evidence pointed at AC4, which is the local
   bundled path and never touches remote resolution. Added `apps/cli/tests/commands/install.test.ts:969-1023`.
4. **T4's release checklist did not exist.** Created `docs/help/release.md` (indexed from
   `docs/help/index.md`) with the publish-surface content review as step 1.

**Per-Requirement Traceability**

| Req | Status | Evidence |
| --- | --- | --- |
| R1 | MET | `packages/core/src/marketplace.ts:62-83` probe, `:51-54` per-branch root, second call site `:206`; tests `packages/core/tests/marketplace.test.ts:163,181,201` |
| R2 | MET | `apps/cli/src/commands/install.ts:195-219`; tests `apps/cli/tests/commands/install.test.ts:863-909` |
| R3 | MET | Binding constraint (one shared auth/tree layer, no parallel GitHub client) holds: `install` → `getGitHubToken`/`parseGitHubRepoUrl`/`materializeRepoSubdir`→`fetchRepoTree`; `skill add` → `tryBlobInstall`→`fetchRepoTree` + `cloneRepo`, all in `packages/core/src/skills-ecosystem/fetch.ts`. T2's "*where applicable*" clause evaluated for `skill add` and rejected with cause — `materializeRepoSubdir` writes `res.text()` (text-only, GitHub-only), so substituting it for `cloneRepo` would UTF-8-mangle binary skill assets, drop non-GitHub git sources, and lose git-credential auth. Documented deviation recorded in `### Solution` + TSDoc `packages/core/src/skills-ecosystem/fetch.ts:512-530` |
| R4 | MET | `apps/cli/src/commands/install.ts:243-246` segments asserted before `mkdir`; locator-derived key |
| R5 | MET | `apps/cli/package.json` files + `build:bundle` + **`prepack`**; `.gitignore:159-161`; fresh tarball `0.3.12` throughout; drift guard `scripts/builder.ts:340` proven to fire |
| R6 | MET | `apps/cli/src/commands/install.ts:1266-1288`; proven live by the AC4 tarball run |
| R7 | MET | `apps/cli/src/commands/install.ts:296-301`; test `apps/cli/tests/commands/install.test.ts:466-511` |
| R8 | MET | 8 docs modified in-change; `docs/help/release.md` added by this audit |
| R9 | MET | `apps/cli/src/commands/install.ts:249-269`; tests `apps/cli/tests/commands/install.test.ts:920-958` |

**Acceptance Criteria Verification**

| AC | Status | Evidence Type | Evidence |
| --- | --- | --- | --- |
| AC1 | MET | test | `packages/core/tests/marketplace.test.ts:181-199` root-derivation regression + `magents/` sibling; `:201-208` error names every probed path |
| AC2 | MET | test | `apps/cli/tests/commands/install.test.ts:969-1023` — both locator forms → cache → cache-local plugin root |
| AC3 | MET | command | `npm pack` + extraction: 129 files, all three trees, 0 test dirs, versions consistent |
| AC4 | MET | command | extracted-tarball dry-run from empty CWD → plugin root resolved, 9 magent targets, exit 0; bogus-plugin control exit 1 |
| AC5 | MET | test | full suite 2008 pass / 0 fail. Scope note: `skill add` deliberately does not consume `materializeRepoSubdir` (R3), so this asserts the shared auth/tree layer is unregressed, not that the new helper is exercised |
| AC6 | MET | test | `apps/cli/tests/commands/install.test.ts:960-968` segment asserts pre-`mkdir`; `:777-829` escape guards |
| AC7 | MET | test | `apps/cli/tests/commands/install.test.ts:509-510` asserts the stderr deprecation string |
| AC8 [docs-only] | MET | static-ref | 8 docs in-change + `docs/help/release.md`, `docs/help/index.md` |
| AC9 | MET | test | `apps/cli/tests/commands/install.test.ts:920-937` warm cache with throwing `fetchFn`; `:939-958` cold error names repo + cache path |
| AC10 | MET | test | `apps/cli/tests/commands/install.test.ts:847-860` virtual `/$bunfs` + non-existent roots → null, no throw |

Coverage: N/A as a single percentage — change spans CLI + core + build tooling; `scripts/builder.ts`
line 100.00 / func 98.10 after the new guard; behavioral branches carry direct unit coverage per the tables.

**Pre-publish blocker — operator decision, not an unmet requirement**

Executing T4's publish-surface review (now step 1 of `docs/help/release.md`) against the actual
tarball found **personal data in the published surface**:
`magents/team-stark-children/USER.md` ships legal name, personal email, LinkedIn URL, home city, and
career history to anyone running `bun add -g @gobing-ai/superskill`. It is written as a *private*
operator profile. No requirement or AC forbids it — R5 mandates shipping `magents/`, and the file is
intact and correct — so the per-task verdict is unaffected. But T4's own wording ("resolve that —
revert or keep deliberately — before T4 ships") makes this a decision the operator must record before
the first publish. **Nothing has been published; all tarballs built during this audit were local.**
The separate trading-system content T4 flagged in `AGENTS.md` is already gone and the tarball ships
the cleaned file.

**Feature-level shippable (F3): PASS** (re-checked 2026-08-10). The blocking scenario "Codex agent
discovery and model-key honoring are live-verified and routed." is now verified by task **0112**
(`done`), and `spur feature check F3 --json` returns `pass: true` with zero findings. 0112's evidence
was independently re-verified rather than accepted: its R2 discovery smoke was re-run from a fresh
scratch `CODEX_HOME`, producing a new child rollout with `thread_source: subagent`,
`agent_role: zz_probe_agent`, `cli_version: 0.147.0` and `PONG`; R3's precedence claim was confirmed
verbatim at the primary source ("If a custom agent file sets `model` or `model_reasoning_effort`, the
value in the file takes precedence"); R5's effort values match the source list exactly. Scratch home
removed (symlink first), real `~/.codex` unmutated.

**Gitignored fix-pass writes (disclosure):** `.spur/run/0113-verdict.json` written this run
(verdict artifact, Step 11). No other `.spur/run/**` mutation.
### Review
| Priority | Dimension | Location | Finding |
| --- | --- | --- | --- |
| P1 | — | — | None |
| P2 | — | — | None |
| P3 | Usability | `apps/cli/src/commands/install.ts:293-299` | `--marketplace-source` deprecation is warn-only; removal deferred to a later release (T6) as specified — no behavior change, no action needed this task |
| P4 | Verification | remote GitHub | Cold-cache GitHub resolution relies on the real network/auth path; validated via mocked fetch in CI. A live `bun add -g @gobing-ai/superskill` + `install cc` is the post-release smoke per AC4's stated scope (cannot be a merge gate — needs publish first) |

Residual risk: none blocking. Verdict: PASS (all 10 ACs verified: unit + build + tarball extraction + offline self-location install).
### References
- Parent scope: `apps/cli`, `packages/core`, `apps/cli/package.json` (npm publish surface).
- Prior working document (source material): `docs/plans/2026-08-09-marketplace-locator-and-npm-distribution.md` — **partially superseded by this task; see the banner at its head. Where they disagree, this task wins.**
- Related docs: `docs/00_ADR.md` (remote in-manifest `source` deferred; `--marketplace-source` wording), `docs/01_PRD.md:104`, `docs/02_ROADMAP.md:117`, feature `F006-marketplace-resolver` (`docs/05_FEATURES.md`), `docs/help/cmd_install.md`, `docs/help/bundled_plugin.md`.
- Reusable infra: `packages/core/src/skills-ecosystem/fetch.ts` (`parseGitHubRepoUrl:137`, `getGitHubToken:111`, `ghAuthTokenFromCli:122`, `fetchRepoTree:317`, `cloneRepo:569`, `tryBlobInstall:369`, `isGitHubHttpsCloneUrl:174`).

**Executed evidence (2026-08-09) — measured, do not re-derive or re-spike:**

- **npm `files` cannot reach outside the package dir, and fails silently.** Isolated scratch package with `files: ["dist/", "../outside/plugins/", "plugins/", ".claude-plugin/"]`; `npm pack --dry-run` packed exactly `dist/index.js`, `.claude-plugin/marketplace.json`, `package.json` — 3 files. The `../outside/plugins/` entry contributed **nothing, with no warning**; the non-existent `plugins/` entry likewise. This is why R5 requires a build-time copy step rather than bare `files` entries.
- **Dot-directories DO pack when listed in `files`.** Same run included `.claude-plugin/marketplace.json`. No `.npmignore` workaround needed for the `.claude-plugin/` copy.
- **`marketplaceRoot` arithmetic, run against `marketplace.ts:138` (`resolve(manifestPath,'..','..')`):**
  `/repo/.claude-plugin/marketplace.json` → `/repo` (correct)
  `/repo/marketplace.json` → `/` (wrong — parent of `<X>`, i.e. filesystem root for a top-level dir)
- **The broken branch is entirely untested.** Every case in `packages/core/tests/marketplace.test.ts` constructs the manifest as `join(claudePluginDir, 'marketplace.json')` — the `.claude-plugin/` layout only. The `<X>/marketplace.json` root-level branch (`marketplace.ts:63`) has zero coverage, which is why the defect survived. T1 must add coverage for it, not only for the new `.claude-plugin` probe.
- **`import.meta.dir` in `bun build --target bun` output (the published `dist/index.js` shape): WORKS and is symlink-resolved.** Built a scratch bundle, ran it from an unrelated CWD both directly and through a `bin/`-style symlink; `import.meta.dir` returned the real `dist/` path in both cases. `process.argv[1]` was **also** already real-path'd by bun in both cases — so `realpathSync(argv[1])` is defensive, not required (an earlier draft of R6 overstated this).
- **`bun build --compile` output is the actual hazard.** Same entry compiled to a standalone binary (the shape `bun run build` produces at `dist/superskill`) reported `import.meta.dir = /$bunfs/root`, `import.meta.url = file:///$bunfs/root/mybin`, `argv[1] = /$bunfs/root/mybin`. These are virtual paths that do not exist on disk; `realpathSync` on them throws ENOENT. R6's fall-through guard exists for exactly this — self-location must skip a virtual/non-existent root silently, never throw.
- **`bun add -g` bin layout confirmed:** `~/.bun/bin/<name>` is a relative symlink into the installed package's real entry file (e.g. `omp -> ../../node_modules/@oh-my-pi/pi-coding-agent/dist/cli.js`). Also confirms the Background note — `~/.bun/install/global/node_modules/superskill -> /Users/robin/xprojects/superskill` is the `bun link` symlink to this repo, not a registry install.
### History
- 2026-08-09T22:10:01.320Z backlog → todo (system)
- 2026-08-09T23:14:36.707Z todo → wip (system)
- 2026-08-09T23:14:36.967Z wip → testing (system)
- 2026-08-09T23:21:50.588Z testing → done (system)
