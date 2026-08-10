---
doc: plan
title: "Marketplace locator (local + GitHub) and npm distribution of bundled plugins"
date: 2026-08-09
status: draft
scope: `apps/cli`, `packages/core`, `apps/cli/package.json` (npm publish surface)
audience: implementation / decomposition
---

# Marketplace locator (local + GitHub) & npm distribution of bundled plugins

> ⚠️ **PARTIALLY SUPERSEDED — read task 0113 first.** This document is the original working
> draft. A review on 2026-08-09 found several of its instructions wrong; the corrections live in
> `docs/tasks/0113_extend-marketplace-to-local-claude-plugin-github-locators-an.md`, which is
> **authoritative wherever the two disagree**. The corrected points are marked `CORRECTED` inline
> below. Summary of what changed:
>
> 1. **§T4 was fatally wrong** — adding `plugins/`/`.claude-plugin/`/`magents/` to the `files`
>    array packs **nothing** (they live at the monorepo root, the package is `apps/cli/`, and npm
>    packs only paths under the package dir — silently). A build-time copy step is required.
> 2. **§T3's cache path was unimplementable** — keying on `<marketplaceName>` needs a manifest you
>    cannot read until after the fetch. Key on the locator `<owner>/<repo>/<ref>` instead.
> 3. **§T1 omitted the actual bug** — `marketplaceRoot` derivation (`marketplace.ts:138`) is wrong
>    for the non-`.claude-plugin` branch, and that branch has zero test coverage.
> 4. **§7's `import.meta.dir` risk is resolved** — measured; it works in `--target bun` output.
>    The real hazard is the `--compile` binary's virtual `/$bunfs/root`.
> 5. **§6 AC 1 was not verifiable pre-merge** — replaced with an offline `npm pack` + extract proxy.

## 1. Context / problem

The `superskill install <plugin>` command today can only resolve a plugin from a **local**
marketplace manifest. End users who want to install the bundled `cc` plugin face two
frustrating paths:

1. `cd <superskill-source-checkout> && superskill install cc` — requires a `git clone` of the
   repo (or a `bun link`), which is exactly what we want to eliminate.
2. From any other directory, pass a brittle `--marketplace <path>/.claude-plugin` and hope the
   `<path>` has the right layout — a leaky, undocumented detail.

None of the user's intuitive commands work:

- `superskill install https://github.com/gobing-ai/superskill/tree/main/plugins/cc`
- `superskill install ~/.bun/install/global/node_modules/superskill/plugins/cc`
- `superskill install gobing-ai/superskill`

**Root cause 1 — the `<plugin>` argument is a name, not a locator.** Every form above fails
`assertSafePathSegment` (rejects `/`, `\`, `.`, `..`, NUL) at the top of `resolvePluginRoot()`
(`apps/cli/src/commands/install.ts:1157`). The guard is load-bearing: `<plugin>` flows into
cache keys (`~/.claude/plugins/cache/<marketplace>/`), `plugin@marketplace` OMP addressing,
and the Grok install target. We will **not** weaken it.

**Root cause 2 — `--marketplace` only accepts a local path, and only with the exact layout.**
`resolvePlugin()` (`packages/core/src/marketplace.ts:55-159`) probes `<path>/marketplace.json`
(or the path itself if it ends in `marketplace.json`). It never probes
`<path>/.claude-plugin/marketplace.json`, despite the `--marketplace` help text promising "the
file or its containing directory". So pointing `--marketplace` at a repo/package root — the
standard Claude Code layout — misses.

**Root cause 3 — the npm tarball does not ship the plugin content.** The published package is
`@gobing-ai/superskill` (`apps/cli/package.json`), whose `files` array is
`["dist/", "rubrics/", "README.md"]`. `plugins/cc`, `.claude-plugin/marketplace.json`, and
`magents/` are **absent** from the tarball. So even the working `--marketplace` local path does
not exist for a real `bun add -g` install.

> ⚠️ **Important correction from investigation:** the global install at
> `~/.bun/install/global/node_modules/superskill` is a **symlink** to the local repo
> (`bun link`), not a registry install. Prior "it works" tests ran against local source via
> that symlink. A real registry install ships only `dist/` + `rubrics/` + `README.md`, and the
> CLI has **no runtime self-location** (no `import.meta.dir`/`__dirname` usage) to find its own
> package root — so shipped plugin content would be unreachable even if added to `files`.

## 2. Goal & non-goals

### Goal

`bun add -g @gobing-ai/superskill`, then from **any** directory:

```bash
superskill install cc --magent team-stark-children
```

works with **no clone, no source checkout, no extra flags**. The plugin content ships in the
npm tarball; the CLI locates it relative to its own install root; and `--marketplace` is the
single escape hatch for pointing at any other marketplace (local dir, GitHub URL, or GitHub
shorthand `owner/repo`).

### Non-goals

- **No new option.** Do not add `--marketplace-source` or a `--source` flag. `--marketplace`
  is extended to accept GitHub locators. `--marketplace-source github` is deprecated then
  removed (T6).
- **No weakening of `assertSafePathSegment`.** `<plugin>` stays a bare segment; it never
  accepts URLs/paths. Remote marketplace selection happens via `--marketplace`, not `<plugin>`.
- **No arbitrary third-party plugin URLs** (e.g. a URL pointing straight at
  `plugins/cc`). `--marketplace` points at a *marketplace* (repo root or `.claude-plugin`),
  and `<plugin>` selects from its manifest. GitLab/other hosts are out of scope; GitHub is the
  only remote transport this round (the existing fetch infra is GitHub-only anyway).
- **Do NOT port `skill add`'s full `parseSource` into `install`.** Reuse the *fetch/auth*
  primitives as a shared layer, but keep the plugin-install pipeline marketplace-shaped.

## 3. Agreed design decisions

1. **Extend `--marketplace <X>` to be a marketplace locator**, resolving to *one*
   `.claude-plugin/marketplace.json`. Uniform two-level probe for every input kind.
2. **GitHub is a transport, not a special case.** Reuse the existing skills-ecosystem
   fetch/auth infra; do not build a parallel GitHub client.
3. **Ship the plugin in the npm tarball** and give the CLI runtime self-location so it can
   find its own bundled plugin without flags.

## 4. Current-state evidence (verified 2026-08-09)

| Area | File:line | Fact |
|---|---|---|
| Published package identity | `apps/cli/package.json` | `name: @gobing-ai/superskill`, `version: 0.3.12`, `bin: {superskill: dist/index.js}` |
| Published `files` | `apps/cli/package.json` | `["dist/", "rubrics/", "README.md"]` — **no `plugins/`, `.claude-plugin/`, `magents/`** |
| Root package not publishable | `package.json` | `private: true`, no `version`, no `files`, no `bin`; root is workspace shell only |
| `--marketplace` local probe | `packages/core/src/marketplace.ts:55-74` | only `<path>/marketplace.json` or the path itself; never `.claude-plugin/marketplace.json` |
| Remote `source` rejected | `packages/core/src/marketplace.ts:99-113` | non-`./` `source` throws "Remote sources not yet supported" (Phase 1) |
| Path-escape guard | `packages/core/src/marketplace.ts:115-132` | rejects `..` and absolute `pluginRoot` |
| `marketplaceRoot` derivation | `packages/core/src/marketplace.ts:136` | `resolve(manifestPath, '..', '..')` — assumes manifest at `<root>/.claude-plugin/` |
| `<plugin>` segment guard | `apps/cli/src/commands/install.ts:1157` | `assertSafePathSegment`; rejects URL/path/slug |
| `install` does NOT import skills-ecosystem | `apps/cli/src/commands/install.ts` (grep) | no `skills-ecosystem` / `parseSource` / `fetchMarketplace` imports |
| Reusable fetch infra | `packages/core/src/skills-ecosystem/fetch.ts` | `parseGitHubRepoUrl` (137), `getGitHubToken` (111), `ghAuthTokenFromCli` (122), `fetchRepoTree` (317), `cloneRepo` (569), `tryBlobInstall` (369), `isGitHubHttpsCloneUrl` (174) |
| Global install is a symlink | `~/.bun/install/global/node_modules/superskill` | `lrwxrwxrwx ... superskill -> /Users/robin/xprojects/superskill` (bun link, not registry) |
| No CLI self-location | `apps/cli/src/index.ts`, `commands/install.ts` | zero `import.meta.dir` / `__dirname` usage |
| `cc` manifest source | `.claude-plugin/marketplace.json` | `{ name: "cc", source: "./plugins/cc" }` |
| `skill add` fetch already exists | `packages/core/src/skills-ecosystem/` (13 files) | full source-parser + github-host + fetch/clone/lock/auth stack |

## 5. Work breakdown (decompose later; keep section granularity)

### T1 — Local `--marketplace` two-level probe (bug fix, ships first)

**Target:** `packages/core/src/marketplace.ts` `resolvePlugin()` + `listResolvablePlugins()`.

**Change:** the `if (marketplacePath)` branch currently does:
- if ends in `marketplace.json` → use it
- else → `join(marketplacePath, 'marketplace.json')`

Add a third fallback: `join(marketplacePath, '.claude-plugin', 'marketplace.json')`. Probe
order: direct-file (if the value ends in `marketplace.json`) → `<X>/marketplace.json` →
`<X>/.claude-plugin/marketplace.json`. Throw the actionable "not found" only after all three.

**Why it's safe:** reconciles the documented `--marketplace` contract ("the file or its
containing directory") with the standard Claude Code layout. ~3 lines, no behavior change to
existing working inputs.

> ⚠️ **CORRECTED — see task 0113 R1/T1.** "~3 lines, no behavior change" understates it. The probe
> is the easy half; the correctness core is `marketplaceRoot`, hardcoded at `marketplace.ts:138` as
> `resolve(manifestPath, '..', '..')` — valid only for the `.claude-plugin/` layout. For the
> *already-shipping* `<X>/marketplace.json` branch it returns the **parent of `<X>`** (measured:
> `/repo/marketplace.json` → `/`), so `./plugins/cc` and `magents/` resolve outside `<X>`. That is
> a real behavior change to an existing input shape, and the branch has **zero** test coverage
> today (every case in `packages/core/tests/marketplace.test.ts` uses the `.claude-plugin/` layout).
> Fix: `marketplaceRoot = dirname(manifestPath)`, raised one level only when that dirname is
> `.claude-plugin`. Note the blast radius includes `install.ts:578`'s `join(marketplaceRoot,
> 'magents')` — a wrong root silently drops `--magent`.

**Acceptance:**
- `--marketplace <dir-with-.claude-plugin/marketplace.json>` resolves.
- `--marketplace <path/.../marketplace.json>` (direct file) still resolves.
- `--marketplace <dir-with-marketplace.json-at-root>` still resolves.
- Missing all three → clear error listing the paths probed.

**Tests:** extend `packages/core/tests/marketplace.test.ts` (and any `install.test.ts` cases)
with a fixture dir laid out as `<root>/.claude-plugin/marketplace.json`.

### T2 — Common fetch layer for GitHub (reuse/enhance skills-ecosystem)

**Target:** `packages/core/src/skills-ecosystem/fetch.ts` (enhance), new shared helper.

**Goal:** expose a marketplace-shaped fetch primitive both `skill add` and `install` can use,
without duplicating auth/token/repo-tree logic.

**What's already reusable (do NOT rewrite):** `parseGitHubRepoUrl` (HTTPS/SSH/shorthand +
`/tree/<ref>/<subpath>`), `getGitHubToken` (env-first `GITHUB_TOKEN`/`GH_TOKEN` + `gh auth
token` fallback, lazy creds), `fetchRepoTree` (Trees API), `cloneRepo`.

**Gap:** the current `tryBlobInstall` fetches *individual skill files* keyed by a `SKILL.md`
glob. `install` needs a *whole plugin subdirectory* materialized. Decide per
`fetchRepoTree` capabilities whether to:
- (a) reuse `fetchRepoTree` + fetch each file in the plugin path (blob-per-file), or
- (b) `cloneRepo` a shallow sparse checkout of `plugins/<name>` into a cache dir.

Either way, extract a **single** helper, e.g.
`materializeRepoSubdir(repo, ref, subdir, destDir): Promise<void>` in `skills-ecosystem/`,
used by both `install` (marketplace + plugin root) and, where applicable, `skill add`.

**Acceptance:** no regression in `skill add` (its test suite stays green); the new helper is
covered by its own tests with a mocked GitHub tree.

### T3 — Remote marketplace + plugin-root resolution into a cache

**Target:** new module in `packages/core` (suggest `packages/core/src/marketplace-remote.ts`
or extend `marketplace.ts`); `apps/cli/src/commands/install.ts` `resolvePluginRoot()`.

**Change:** introduce a `MarketplaceLocator` resolution that returns
`{ manifest, marketplaceRoot }` where `marketplaceRoot` is the local dir for local inputs and
a **cache dir** for remote inputs:

```
local  : marketplaceRoot = the resolved local marketplace dir (as today)
remote : marketplaceRoot = ~/.cache/superskill/marketplaces/<owner>/<repo>/<ref>/
```

> ⚠️ **CORRECTED — see task 0113 R4.** The original path keyed on `<marketplaceName>`, which is
> read from the manifest you cannot fetch until you already have the cache path — a chicken-and-egg.
> Key on the **locator** (`<owner>/<repo>/<ref>`), known before any network call; `<ref>` already
> supplies per-version identity. Every segment must pass `assertSafePathSegment` **before** the
> first `mkdir`.

Steps for remote:
1. Detect GitHub: URL (`https://github.com/owner/repo`, `.../tree/<ref>`), or shorthand
   `owner/repo`. Use `parseGitHubRepoUrl` / `isGitHubHttpsCloneUrl` from T2.
2. Fetch the marketplace manifest: `owner/repo/.claude-plugin/marketplace.json` (or
   `<X>/marketplace.json` per the T1 two-level probe, applied to the fetched repo tree).
3. Resolve `source` (e.g. `./plugins/cc`) against the **cache** root, not CWD: materialize
   `plugins/cc` into the cache via the T2 helper, then let the existing
   `resolvePlugin`-style `resolve(marketplaceRoot, source)` + content check run unchanged.
4. Cache key by `owner/repo` (+ ref). Define invalidation (TTL or `--refresh`); document
   offline behavior (use cache if present, else error with the fetch URI). Never auto-update
   a cache that a prior offline run depends on.

**Security (preserve):** the `..`/absolute `pluginRoot` escape guards must still run against
the materialized tree. Never fetch a `source` that escapes the fetched marketplace root.

**Acceptance:**
- `--marketplace https://github.com/gobing-ai/superskill` installs `cc` (dry-run) with the
  plugin root materialized in cache.
- `--marketplace gobing-ai/superskill` (shorthand) does the same.
- `--marketplace https://github.com/gobing-ai/superskill/tree/main/.claude-plugin` works.
- Remote `source` objects (non-`./`) still error clearly (Phase 1 unchanged), but a relative
  `source` from a fetched manifest works.
- `..`/absolute sources still rejected even in the remote path.
- Offline with warm cache succeeds; offline with cold cache errors with the URI.

### T4 — Ship bundled plugin content in the npm tarball

**Target:** `apps/cli/package.json` `files`; `prepublishOnly`/`build:bundle` correctness.

> ⚠️ **CORRECTED — this section was fatally wrong. See task 0113 R5/T4.** Adding these names to
> `files` packs **nothing**: `plugins/`, `.claude-plugin/`, and `magents/` live at the **monorepo
> root**, the published package is `apps/cli/`, and npm packs only paths under the package
> directory — with no warning. Measured with `npm pack --dry-run` on a scratch package: a
> `"../outside/plugins/"` entry contributed zero files. The `files` edit below is **necessary but
> not sufficient**; it must be paired with a build-time copy step (the repo already does exactly
> this for `apps/cli/rubrics/` and `apps/cli/README.md`, gitignored at `.gitignore:156,158`).

**Change:** extend `build:bundle`/`prepublishOnly` to copy `../../plugins`, `../../.claude-plugin`,
`../../magents` into the package, gitignore those three destinations, **and** add to `files`:
```json
"files": [
  "dist/",
  "rubrics/",
  "plugins/",
  ".claude-plugin/",
  "magents/",
  "README.md"
]
```

**Verify (the real risk):**
- `build:bundle` copies `packages/core/src/rubrics` → `rubrics` and emits `dist/index.js`;
  confirm it does not delete or strip `plugins/`, `.claude-plugin/`, `magents/` in a clean
  prepublish run.
- `check-publish-manifest` (`scripts/builder.ts`) fails on `catalog:`/`workspace:` deps —
  confirm the new top-level dirs introduce no such specifiers.
- `npm pack --dry-run` lists `plugins/cc/**`, `.claude-plugin/marketplace.json`,
  `magents/**` in the tarball.
- Reconcile with the global-install story: a real `bun add -g @gobing-ai/superskill` (not the
  bun-link symlink) must contain `plugins/cc`.

**Acceptance:** tarball ships plugin content; a fresh install of the published package (in a
throwaway dir, not the repo symlink) contains `plugins/cc` and `.claude-plugin/marketplace.json`.

### T5 — CLI runtime self-location (find its own installed package root)

**Target:** `apps/cli/src/commands/install.ts` `resolvePluginRoot()`.

**Change:** add a resolution path (after CWD marketplace scan, before/alongside the
`plugins/<name>` scan): resolve the running bundle's package root and probe it for
`.claude-plugin/marketplace.json` and `plugins/<name>`. For the npm-published `dist/index.js`
(bun `--target bun`, run via `bin`), `import.meta.dir` = the installed `dist/` dir, so
`resolve(import.meta.dir, '..')` = package root. Prefer `import.meta.dir` over `process.cwd()`.

Order of resolution in `resolvePluginRoot` (final):
1. `--marketplace` (extended, T1+T3)
2. `superskill.jsonc` ConfigPluginPath (unchanged)
3. CWD `.claude-plugin/marketplace.json` (unchanged)
4. **installed package root** `.claude-plugin/marketplace.json` then `plugins/<name>` (NEW)
5. `plugins/<name>` relative to CWD (unchanged, last-resort)

**Acceptance:** after `bun add -g @gobing-ai/superskill` + `bun link` for dev, or a real
install, `superskill install cc` from **any** directory resolves the bundled plugin with no
flags. Dry-run proves the root before any writes.

### T6 — Deprecate `--marketplace-source github`

**Target:** `apps/cli/src/commands/install.ts` option + `docs/help/cmd_install.md`.

**Change:** `--marketplace-source` becomes redundant once `--marketplace <github-locator>`
works. Phase: print a one-line `DeprecationWarning: use --marketplace <owner/repo> instead` to
stderr, keep current behavior, then remove in a later release. Update `docs/help/cmd_install.md`
and the F3/ADR docs that mention it. Do **not** silently drop it.

### T7 — Docs sync (constitution §6) + tests

**Doc-sync (same commit as surface):**
- `docs/00_ADR.md` — new ADR entry: `--marketplace` becomes a locator (local dir | `.claude-plugin` | GitHub URL | shorthand); GitHub fetch via shared skills-ecosystem layer; npm tarball ships plugin content; supersede any prior "remote sources deferred" / `--marketplace-source` wording.
- `docs/01_PRD.md` — update the deferred "remote in-manifest plugin `source`" line and the distribution line (`npm publish is the distribution channel` → note tarball now ships plugins/).
- `docs/02_ROADMAP.md` — move the deferred remote-source item into an active phase.
- `docs/03_ARCHITECTURE.md` — marketplace resolution sequence + cache + self-location.
- `docs/04_DESIGN.md` — `--marketplace` surface: accepted input shapes, cache path, `--marketplace-source` deprecation.
- `docs/05_FEATURES.md` — feature status for the marketplace resolver / install.
- `docs/help/cmd_install.md` — rewrite `--marketplace` help; document the zero-clone path.

**Tests to add/update:**
- `packages/core/tests/marketplace.test.ts` — two-level probe (T1); remote resolution + cache + escape guards (T3).
- `packages/core/tests/skills-ecosystem/fetch.test.ts` — new `materializeRepoSubdir` (T2).
- `apps/cli/tests/commands/install.test.ts` — self-location resolution (T5); deprecation warning (T6).
- `apps/cli/tests/commands/install.test.ts` — real-tarball smoke (T4) marked appropriately (may need network/registry — keep behind a fixture).

## 6. Acceptance criteria (end-to-end)

1. **Zero-clone install works:** `bun add -g @gobing-ai/superskill` then, from any empty dir,
   `superskill install cc --magent team-stark-children --dry-run` resolves the bundled plugin
   from the installed package (T4+T5). No `--marketplace`, no clone.
   > ⚠️ **CORRECTED — see task 0113 AC3/AC4.** As written this is not verifiable before merge: it
   > requires publishing first. The merge gate is an offline proxy — `npm pack` in `apps/cli`,
   > extract the tarball to a temp dir, run `<tmp>/package/dist/index.js install cc --dry-run` with
   > CWD set to a separate empty dir. A live `bun add -g` run is a manual post-release smoke. It
   > must never be checked through the `bun link` symlink at
   > `~/.bun/install/global/node_modules/superskill -> <this repo>`, which is what misled the
   > original investigation.
2. **`--marketplace` accepts all agreed shapes** (local dir, local
   `.<claude-plugin>/marketplace.json`, GitHub URL, GitHub shorthand) and installs `cc`
   (T1+T3).
3. **No new option added**; `--marketplace-source` warns and is planned for removal (T6).
4. **Shared fetch layer** serves both `install` and `skill add`; `skill add` suite stays green
   (T2).
5. **Security invariants preserved:** `<plugin>` still a bare segment; path-escape guards run
   against materialized remote trees.
6. **Docs** updated in the same commit as surface (T7); ADR supersedes prior deferral wording.

## 7. Risks / open questions

- ~~**`import.meta.dir` in the compiled bundle.**~~ **RESOLVED (measured 2026-08-09) — no spike
  needed; see task 0113 R6.** In `build:bundle` output (`--target bun`) `import.meta.dir` holds the
  real `dist/` path and is already symlink-resolved, so it works through the `~/.bun/bin/<name>`
  symlink; `process.argv[1]` is also already real-path'd by bun, making `realpathSync` defensive
  rather than load-bearing. The **actual** hazard is the `--compile` binary (`bun run build` →
  `dist/superskill`): `import.meta.dir` = virtual `/$bunfs/root`, `argv[1]` = `/$bunfs/root/<bin>`,
  neither on disk, and `realpathSync` throws ENOENT. Self-location must detect a virtual /
  non-existent root and fall through silently.
- **Cache size / invalidation.** Materializing `plugins/cc` (~dozens of files) is small, but a
  generic cache needs a TTL and a `--refresh` escape. Don't gold-plate: a per-version cache key
  (from the manifest `version`) may be enough.
- **Auth for private GitHub repos** — reuse `getGitHubToken`; public repos need no token.
  Rate limits: public raw/tree fetches are cheap; `cloneRepo` only when tree fetch is
  insufficient.
- **Registry install vs `bun link`.** Tests must exercise a *real* published tarball, not the
  repo symlink, or they silently pass for the wrong reason (this very investigation was
  misled by the symlink).
- **`spur task` is currently broken** (SQLite `history_message` missing in the spur-new
  harness) — task corpus authoring via CLI is unavailable; this plan doc stands in until the
  harness recovers or the work is decomposed manually.

## 8. Suggested implementation order

1. **T1** (small, safe, ships alone) — unblocks the `--marketplace <pkg-root>` local path.
2. **T4 + T5** (tarball + self-location) — makes zero-clone work with the *bundled* plugin
   first (no network needed), giving the highest-value end-user win earliest.
3. **T2 + T3** (shared fetch + remote resolution) — GitHub URL/shorthand support.
4. **T6** (deprecate `--marketplace-source`).
5. **T7** (docs + tests) throughout, in the same commits as the surface changes.
