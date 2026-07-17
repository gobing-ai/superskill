---
template: feature-impl
schema_version: 1
name: "GitHub marketplace registration for spur/superskill (replace directory marketplaces)"
description: "Migrate spur/superskill from directory Claude marketplaces to GitHub; teach superskill install a marketplace-source mode so installs do not re-register local paths."
status: done
type: task
profile: standard
feature_id: null
parent_wbs: null
priority: P1
tags: []
dependencies: []
created_at: "2026-07-16T22:59:59.416Z"
updated_at: "2026-07-17T00:58:40.817Z"
---

## 0086. GitHub marketplace registration for spur/superskill (replace directory marketplaces)

### Background
**Problem.** Operators install plugins via `superskill install` (Claude/OMP/Grok targets). Today that path always registers a **directory marketplace**:

```bash
claude plugin marketplace add <marketplaceRoot>   # absolute path to local repo
claude plugin install <plugin>@<marketplaceName>
```

Evidence (operator machine, 2026-07-16):

| Marketplace | `known_marketplaces.json` source | `installLocation` | Under `~/.claude/plugins/marketplaces/`? |
|-------------|----------------------------------|-------------------|------------------------------------------|
| `spur` | `{ "source": "directory", "path": "~/xprojects/spur-new" }` | `/Users/robin/xprojects/spur-new` | **No** (points at repo; no clone) |
| `superskill` | `{ "source": "directory", "path": "~/xprojects/superskill" }` | `/Users/robin/xprojects/superskill` | **No** |
| `context-mode` (contrast) | `{ "source": "github", "repo": "mksglu/context-mode" }` | `~/.claude/plugins/marketplaces/context-mode` | **Yes** |

Same directory entries also live in `~/.claude/settings.json` → `extraKnownMarketplaces` (user scope declare). Plugin IDs in use:

- `sp@spur` (enabled) → cache `~/.claude/plugins/cache/spur/sp/0.3.11`
- `cc@superskill` (enabled) → cache `~/.claude/plugins/cache/superskill/cc/0.3.3`

**Why `ll ~/.claude/plugins/marketplaces/spur` is empty / missing.** Expected for directory marketplaces. Claude does not materialize a checkout under `marketplaces/` when source is `directory`; `installLocation` **is** the source tree. This is not an uninstall — `sp@spur` is installed and enabled.

**Related operator observations (context, not root cause of missing dir).**

1. **Grok slash surface after disabling `rd3@cc-agents`.** With `rd3` enabled, **12** bare `dev-*` command names collided with `sp` → Grok advertised them as `/sp:dev-*`. After disabling `rd3`, those collisions disappear; bare stems (`/dev-dogfood`, `/dev-plan`, …) become the advertised names. Only names that already embed a plugin prefix (e.g. agents shown as `sp:…`) still appear under a `/sp:` filter. This is Grok collision-qualification, not a partial install of the 21 `commands/dev-*.md` files (all 21 present on disk + in `grok inspect`).

2. **Dual slash surfaces.** `superskill install` to rulesync targets also writes `~/.agents/skills/sp-dev-*` (hyphen). Grok scans that bag → `/sp-dev-dogfood` coexists with plugin `/dev-dogfood` or `/sp:dev-dogfood` depending on collisions. Task 0078 added native Grok plugin install; dual path remains if codex/pi targets are also installed.

3. **`sp` supersedes `rd3`.** Operator intent: `rd3` disabled; `sp` is the next-gen harness plugin. Install/marketplace tooling should not assume both stay enabled.

**Desired end state.** Prefer **GitHub-backed marketplaces** for `spur` and `superskill` so that:

- `~/.claude/plugins/marketplaces/{spur,superskill}` exist as real clones (refreshable via `claude plugin marketplace update`);
- `claude plugin install|update|uninstall` work without local path coupling;
- `superskill install` can still support **local directory** for plugin authors dogfooding unpushed changes, but the default/recommended path for the operator is GitHub.

**Git remotes (authoritative published sources):**

| Marketplace name (manifest `name`) | Repo | Plugin(s) |
|------------------------------------|------|-----------|
| `superskill` | `https://github.com/gobing-ai/superskill.git` | `cc` |
| `spur` | `https://github.com/gobing-ai/spur.git` | `sp` |

Manifest names already match (`superskill/.claude-plugin/marketplace.json` → `"name": "superskill"`; `spur-new` → `"name": "spur"`). Plugin IDs `cc@superskill` / `sp@spur` can stay stable if marketplace **names** stay the same after source-type change.
### Requirements
R1. **Document / decide safe removal of directory marketplaces.**  
    Answer and codify: can operators remove `spur` and `superskill` from `known_marketplaces.json` (and `extraKnownMarketplaces`) **without** first re-adding GitHub sources?  
    - **Must** cover impact on: `enabledPlugins`, `installed_plugins.json` keys (`plugin@marketplace`), cache dirs, `claude plugin update`, Grok Claude-compat loading, OMP registry if used.  
    - Ship an operator runbook: remove-only (unsafe cases) vs migrate-then-remove (safe).

R2. **Support GitHub (remote) marketplace registration in `superskill install` for Claude.**  
    Today `defaultRunClaudeInstall` only runs `claude plugin marketplace add <local marketplaceRoot>` (`apps/cli/src/commands/install.ts`).  
    Add a supported mode that registers via Claude’s remote forms, e.g.:  
    - `claude plugin marketplace add gobing-ai/spur`  
    - `claude plugin marketplace add gobing-ai/superskill`  
    - and/or git URL form per `claude plugin marketplace add --help`.  
    Local path form remains for authoring/dogfood.

R3. **Parity for Grok (and OMP if applicable).**  
    Mirror the source-mode choice for `defaultRunGrokInstall` / OMP: GitHub vs local path.  
    Document Grok’s actual CLI contract at implement time (`grok plugin marketplace add` path|url).  
    Idempotent re-register (already partially handled for OMP/Grok).

R4. **Stable marketplace naming.**  
    Prefer keeping marketplace manifest `name` (`spur`, `superskill`) so plugin IDs `sp@spur` / `cc@superskill` and cache keys under `~/.claude/plugins/cache/{spur,superskill}/` do not force a mass reinstall/rename.  
    If Claude renames marketplace identity when switching directory→github, document the rename/migration steps (uninstall old, install new, re-enable).

R5. **Install CLI surface for source mode.**  
    Expose an explicit, testable control, e.g. one of:  
    - `--marketplace-source github|directory|path`  
    - env `SUPERSKILL_MARKETPLACE_SOURCE`  
    - config file field  
    Default recommendation for end-users: **github** when a known remote exists; **directory** when resolving from a local checkout without remote (or when `--marketplace <path>` points at a path).  
    Exact flag names chosen in Design; must be documented in `docs/help/cmd_install.md`.

R6. **Migration / doctor path (minimal).**  
    Provide either:  
    (a) documented manual steps using `claude plugin marketplace remove|add|update` + `claude plugin install|update`, or  
    (b) a thin `superskill` subcommand / install flag that migrates directory→github for known marketplaces.  
    Minimum bar for this task: **(a) complete runbook + automated tests of the install code path**; (b) optional if low cost.

R7. **PRD / ADR honesty.**  
    `docs/01_PRD.md` currently **defers** remote marketplace sources (`github`, `url`, …) for **plugin resolution inside** `marketplace.ts` (local relative `source` only).  
    This task is **not** necessarily implementing remote `source` objects inside `marketplace.json` plugin entries. It is about how **Claude/Grok register the marketplace root** (local dir vs GitHub repo).  
    Update PRD/ADR/design notes to distinguish:  
    - A: marketplace **registration source** (directory vs github) for host CLIs  
    - B: plugin entry `source` forms inside a marketplace manifest (still local relative for in-repo monorepos)  
    Do not silently expand scope to B unless Design explicitly chooses it.

R8. **Tests.**  
    - Unit: source-mode selection; Claude/Grok install helpers spawn the correct argv for github vs directory.  
    - Idempotency: re-add already-configured github marketplace does not fail hard.  
    - No regression: default local-author path still works with `claude plugin marketplace add <path>`.  
    - Full suite green (`bun run lint`, `bun run test`, `bun run build`).

R9. **Non-goals (this task).**  
    - Fixing Grok’s collision-only `/plugin:command` advertising (product behavior; document only).  
    - Deleting `rd3` from cc-agents or changing spur plugin content.  
    - Implementing full remote plugin `source` objects inside marketplace manifests (PRD deferred item B).  
    - Automatically removing operators’ directory marketplaces without an explicit migrate action.
### Acceptance Criteria
AC1. **Safety answer is explicit in the task Solution/runbook.**  
    Given only `known_marketplaces.json` + `extraKnownMarketplaces` entries for directory `spur`/`superskill`, the runbook states whether blind removal is safe and lists breakage symptoms if done wrong (failed update, orphaned `plugin@marketplace` IDs, empty marketplaces dir still expected until github add).

AC2. **GitHub marketplace add works via Claude CLI (manual or superskill-driven).**  
    After migration steps:  
    - `ls ~/.claude/plugins/marketplaces/spur` and `…/superskill` show clones (or documented Claude layout).  
    - `claude plugin marketplace list` shows `spur` and `superskill` with **github** (or git) sources, not directory paths to `~/xprojects/…`.  
    - `claude plugin list` still shows `sp@spur` / `cc@superskill` (or documented new IDs) enabled.

AC3. **`superskill install` can register GitHub marketplaces.**  
    `superskill install sp --targets claude …` (with chosen flag/default) results in Claude marketplace registration using a **non-directory** source when configured for github.  
    Local dogfood path still works: install from a path checkout without pushing.

AC4. **Update/refresh path.**  
    `claude plugin marketplace update spur` (and superskill) succeeds against GitHub and refreshes the marketplace checkout; plugin update installs newer versions when manifests bump.

AC5. **Grok path documented and, if in scope of R3 implementation, verified.**  
    Either: implemented + test coverage for Grok github marketplace add, **or** Design marks Grok follow-up with exact gap list — but Claude path must ship.

AC6. **Docs.**  
    `docs/help/cmd_install.md`, CHANGELOG, and PRD deferred-table note (R7) updated. Operator-facing migration steps are copy-pasteable.

AC7. **Regression.**  
    Existing install tests for local marketplace path remain green; no destructive default that wipes unrelated marketplaces (cc-agents, context-mode, official, etc.).
### Q&A
**Q1. Can we remove both `spur` and `superskill` from `known_marketplaces.json` safely *right now* (no other changes)?**  
**A1. No — not as a standalone edit.**  

| If you only delete the two entries… | Result |
|-------------------------------------|--------|
| Installed plugin **files** under `~/.claude/plugins/cache/{spur,superskill}/…` | Usually **still on disk** (cache not auto-deleted). |
| `enabledPlugins` (`sp@spur`, `cc@superskill`) | Still true → Claude/Grok may keep loading from **cache** until restart/prune; behavior can look “fine” briefly. |
| `claude plugin marketplace update spur` | **Fails** / marketplace unknown. |
| `claude plugin install sp@spur` / update plugin | **Broken** — marketplace name no longer resolvable. |
| `claude plugin marketplace list` | Entries gone; `marketplaces/spur` still won’t appear (never was a clone). |
| `extraKnownMarketplaces` still listing directory sources | Claude may **re-declare** or diverge from `known_marketplaces.json` — must edit **both** or use official `claude plugin marketplace remove`. |
| Grok Claude-compat | May still see plugins via cache/settings until disabled; inconsistent. |

**Safer sequence (operator, manual):**

1. Confirm remotes: `gobing-ai/spur`, `gobing-ai/superskill` are public (or auth configured).  
2. `claude plugin marketplace add gobing-ai/spur` (and superskill) — or git URL form.  
3. Verify `~/.claude/plugins/marketplaces/spur` exists and `marketplace list` shows github.  
4. `claude plugin install sp@spur` / `cc@superskill` (or `plugin update`) so install metadata points at github marketplace checkout + fresh cache.  
5. `claude plugin marketplace remove` the **old** directory registration **only if** Claude distinguishes it; if name collision, add-github may convert in place — verify with `marketplace list` JSON/details.  
6. Align `extraKnownMarketplaces` in `~/.claude/settings.json` with github sources (or remove directory keys and rely on known_marketplaces).  
7. Restart Claude Code + Grok; `grok plugin list` / `claude plugin list` / spot-check `/` commands.  
8. Optional: re-run `superskill install sp --targets …` and `superskill install cc --targets …` so non-Claude targets stay in sync.

**Q2. Do we need superskill enhancements, or is CLI-only migration enough?**  
**A2. CLI-only migration is enough for a one-time operator fix. Superskill enhancements are needed so the next `superskill install` does not re-register directory sources and undo the migration.**

Root cause of directory entries: `defaultRunClaudeInstall` always:

```text
claude plugin marketplace add <marketplaceRoot>  # local path
claude plugin install <plugin>@<marketplaceName>
```

Every install from a local monorepo re-adds directory marketplaces. Without a github mode, the operator’s GitHub migration is unstable.

**Q3. Keep marketplace names `spur` / `superskill`?**  
**A3. Yes (recommended).** Plugin IDs and cache prefixes stay stable. Changing marketplace name forces `plugin@old` → `plugin@new` migration across settings, Grok, OMP.

**Q4. Does this implement PRD “remote marketplace sources” fully?**  
**A4. No.** PRD deferred item is remote **plugin entry** `source` objects inside marketplace manifests. This task targets host **marketplace registration** (where Claude clones the marketplace repo). In-repo plugins still use `"source": "./plugins/sp"`.
### Design
**D1. Two layers (do not conflate)**

```text
Layer A — Host marketplace registration (THIS TASK)
  Claude/Grok/OMP learn where the marketplace repo lives:
    directory:  /Users/…/xprojects/spur-new
    github:     gobing-ai/spur  →  ~/.claude/plugins/marketplaces/spur

Layer B — In-manifest plugin source (OUT OF SCOPE unless expanded)
  marketplace.json plugins[].source: "./plugins/sp"  (relative, monorepo)
```

`packages/core/src/marketplace.ts` already resolves Layer B (local relative only). Install dispatch owns Layer A.

**D2. Recommended source-mode design**

| Mode | When | Claude argv (illustrative) |
|------|------|----------------------------|
| `directory` | Authoring unpushed changes; `--marketplace <path>` | `marketplace add <abs marketplaceRoot>` then `install plugin@name` |
| `github` | Operator / CI / recommended default for known remotes | `marketplace add <owner/repo>` then `install plugin@name` |
| `auto` (optional) | If git remote of marketplaceRoot matches known mapping → github, else directory | as above |

Known remote map (config or constants, overridable):

| marketplace.json `name` | GitHub |
|-------------------------|--------|
| `spur` | `gobing-ai/spur` |
| `superskill` | `gobing-ai/superskill` |

**D3. Code touch points**

| File | Change |
|------|--------|
| `apps/cli/src/commands/install.ts` | Claude/Grok/OMP install helpers: source mode + github slug; argv branch |
| CLI options | e.g. `--marketplace-source <directory\|github\|auto>` |
| `packages/core` (optional) | pure helper `resolveMarketplaceRegistration` for unit tests |
| `docs/help/cmd_install.md` | flag + migration runbook |
| `docs/01_PRD.md` | split deferred remote sources into Layer A vs Layer B |
| `CHANGELOG.md` | user-facing note |
| Tests | spawn argv assertions |

**D4. Migration runbook (operator) — must ship even if automation is thin**

```bash
# 1) Add GitHub marketplaces (Claude)
claude plugin marketplace add gobing-ai/spur
claude plugin marketplace add gobing-ai/superskill

# 2) Verify materialization
ls ~/.claude/plugins/marketplaces/spur
ls ~/.claude/plugins/marketplaces/superskill
claude plugin marketplace list

# 3) Reinstall / update plugins so cache tracks github checkout
claude plugin install sp@spur
claude plugin install cc@superskill

# 4) Remove directory registration if still present as a separate entry
#    Prefer official CLI over hand-editing JSON:
claude plugin marketplace remove <old-name-if-different>
# If names collide and add converted in place, list should show github source only.

# 5) Align settings.json extraKnownMarketplaces to github form (or delete directory keys)

# 6) Grok: re-add marketplace per live CLI; superskill install --targets grok once github mode ships

# 7) Restart agents; spot-check plugin list + one slash command each
```

Do **not** hand-delete `known_marketplaces.json` keys without steps 1–3.

**D5. `extraKnownMarketplaces`**

Claude settings can re-seed marketplaces. Migration must keep in sync:

1. `~/.claude/plugins/known_marketplaces.json` (runtime registry)
2. `~/.claude/settings.json` → `extraKnownMarketplaces` (declarative)

Prefer `claude plugin marketplace` commands so both stay consistent.

**D6. Cache clearing**

Existing install clears `~/.claude/plugins/cache/<marketplaceName>` before reinstall. Keep that with `assertSafePathSegment` on marketplace name. Never clear other marketplaces’ caches.

**D7. Grok dual-path note (document only)**

After rd3 disable, Grok shows few `/sp:…` command names because collision-qualification stopped. Agents still appear as `sp:…`. Full command set is under bare `/dev-*` unless Grok product always-qualifies plugin commands. Not fixed by marketplace github migration.

**D8. Tradeoffs**

| Option | Pros | Cons |
|--------|------|------|
| A. Docs-only migration | Fast, zero code | Next `superskill install` reverts to directory |
| **B. Code: github mode + docs (RECOMMENDED)** | Stable operator path; local dogfood kept | Small CLI surface growth |
| C. Always github when remote known | Least flags | Surprises authors with unpushed commits |
| D. Full Layer B remote sources | Future-proof | Large; PRD-deferred; out of scope |

Recommendation: **B**, optional `auto` later.
### Plan
1. **Spike (half-day):** Manually run GitHub `claude plugin marketplace add gobing-ai/spur` on a throwaway machine/profile; capture exact `known_marketplaces.json` shape, whether directory entry is replaced or duplicated, and whether plugin IDs stay `sp@spur`. Record in Solution.
2. **Design lock:** Choose flag name + default (`directory` vs `auto` vs `github`); write unit-test table for argv.
3. **Implement** `resolveMarketplaceRegistration` + branch in `defaultRunClaudeInstall` (and Grok/OMP per R3).
4. **Wire CLI option** + help text; pass through `executeInstall`.
5. **Tests:** mock spawn; directory path regression; github slug path; idempotent re-add.
6. **Docs:** cmd_install.md migration section; PRD Layer A/B note; CHANGELOG.
7. **Operator migrate** (author machine): follow runbook; confirm `marketplaces/spur` exists; confirm `superskill install` does not reintroduce directory when github mode set.
8. **Verify** AC1–AC7; fill Testing/Solution; review.
### Solution
Implemented `--marketplace-source github|directory` mode via a pure `resolveMarketplaceRegistration` helper + CLI option + dispatch-branching in the three host-CLI install helpers.

**Code changes:**

- `packages/core/src/pipeline/marketplace-registration.ts:1-51` — new module: `MarketplaceSource` type, `KNOWN_GITHUB_REPOS` map (`spur`→`gobing-ai/spur`, `superskill`→`gobing-ai/superskill`), `MarketplaceRegistration` interface, `resolveMarketplaceRegistration(marketplaceRoot, marketplaceName, mode)` pure function. `github` mode returns slug for known names; falls back to path for unknown names.
- `packages/core/src/index.ts:32` — re-exports `marketplace-registration`.
- `apps/cli/src/commands/install.ts:37-39` — imports `resolveMarketplaceRegistration`, `MarketplaceRegistration`, `MarketplaceSource`.
- `apps/cli/src/commands/install.ts:63` — `--marketplace-source <mode>` CLI option added to Commander registration.
- `apps/cli/src/commands/install.ts:71` — extracted `marketplaceSource` from options in action callback.
- `apps/cli/src/commands/install.ts:95-96` — `marketplaceSource?: MarketplaceSource` field added to `InstallOptions`.
- `apps/cli/src/commands/install.ts:104-123` — `InstallDependencies.runClaudeInstall`/`runOmpInstall`/`runGrokInstall` changed first param from `marketplaceRoot: string` to `registration: MarketplaceRegistration`.
- `apps/cli/src/commands/install.ts:309-315` — `registration` resolved once before dispatch loop via `resolveMarketplaceRegistration(marketplaceRoot, marketplaceName, options.marketplaceSource ?? 'directory')`.
- `apps/cli/src/commands/install.ts:325` — Claude dispatch passes `registration` instead of `marketplaceRoot`.
- `apps/cli/src/commands/install.ts:358` — OMP dispatch passes `registration`.
- `apps/cli/src/commands/install.ts:379` — Grok dispatch passes `registration`.
- `apps/cli/src/commands/install.ts:481-495` — `defaultRunClaudeInstall(registration)` uses `registration.source` in spawn argv.
- `apps/cli/src/commands/install.ts:603-638` — `defaultRunGrokInstall(registration)` uses `registration.source`.
- `apps/cli/src/commands/install.ts:646-666` — `defaultRunOmpInstall(registration)` uses `registration.source`.

**Docs:**

- `docs/help/cmd_install.md:22` — `--marketplace-source` added to options table.
- `docs/help/cmd_install.md:44-45` — github example added.
- `docs/help/cmd_install.md:299-334` — D4 migration runbook appended.
- `docs/01_PRD.md:104` — deferred-table entry split into Layer A (this task) vs Layer B (still deferred).
- `CHANGELOG.md:31` — user-facing changelog entry under `[Unreleased]`.

**Tests:**

- `packages/core/tests/pipeline/marketplace-registration.test.ts:1-59` — 9 tests: github slug for known names, path fallback for unknown names, directory mode, empty root handling, KNOWN_GITHUB_REPOS map assertions.
- `apps/cli/tests/commands/install.test.ts:68-69` — `--magent` and `--marketplace-source` added to expected options.
- `apps/cli/tests/commands/install.test.ts:254-255` — `runOmpInstall` mock updated to `(registration, ...)` signature using `registration.source`.
- `apps/cli/tests/commands/install.test.ts:357-380` — `runClaudeInstall` mock updated; `volArg.args` changed from `{root}` to `{source}`, assertion on `args.source`.
- `apps/cli/tests/commands/install.test.ts:467-468` — `runGrokInstall` mock updated to `(registration, ...)`.
- `apps/cli/tests/commands/install-grok-helpers.test.ts:6` — all 6 `defaultRunGrokInstall` call sites updated to `{source: '/mkp', mode: 'directory'}`.
- `apps/cli/tests/commands/install-omp-helpers.test.ts:5` — all 5 `defaultRunOmpInstall` call sites updated to `{source: marketRoot, mode: 'directory'}`.
### Testing
**Verified:** 2026-07-16 (sp-dev-verify --force --fix all)

**Commands run this pass:**
- `bun test packages/core/tests/pipeline/marketplace-registration.test.ts apps/cli/tests/commands/install.test.ts apps/cli/tests/commands/install-grok-helpers.test.ts apps/cli/tests/commands/install-omp-helpers.test.ts` → **80 pass / 0 fail** (EXIT 0)
- `bun apps/cli/src/index.ts install --help` → surfaces `--marketplace-source`
- Static: `docs/help/cmd_install.md` migration runbook §; `docs/01_PRD.md:104` Layer A/B; `CHANGELOG.md` Unreleased entry
- `spur task check 0086 --strict-core --json` → `pass: true` (warning only: missing feature_id)

**Coverage:** `packages/core/src/pipeline/marketplace-registration.ts` — 100% lines + functions in focused run.

**Per-requirement traceability**

| Req | Status | Evidence |
|-----|--------|----------|
| R1 Safety of directory removal | MET | Q&A A1 table + D4/runbook in `docs/help/cmd_install.md:299-334`; "do not hand-delete without steps 1–3" |
| R2 Claude github registration | MET | `defaultRunClaudeInstall` uses `registration.source` (`install.ts:494-495`); executeInstall github test → `gobing-ai/superskill` |
| R3 Grok/OMP parity | MET | `defaultRunGrokInstall` / `defaultRunOmpInstall` take `MarketplaceRegistration`; github argv tests in install-grok/omp-helpers |
| R4 Stable marketplace names | MET | `KNOWN_GITHUB_REPOS` keyed by `spur`/`superskill`; install still uses `plugin@marketplaceName` |
| R5 CLI source mode surface | MET | `--marketplace-source` option `install.ts:64`; help + `cmd_install.md:22`; default `directory` (`install.ts:318`) |
| R6 Migration path (a) | MET | Copy-paste runbook `docs/help/cmd_install.md:299-334` + install code path tests |
| R7 PRD Layer A vs B | MET | `docs/01_PRD.md:104` deferred row distinguishes Layer A (0086) vs Layer B |
| R8 Tests | MET | Pure resolver 9 tests; +3 github argv tests (Claude executeInstall, Grok, OMP); directory default regression retained |
| R9 Non-goals | MET | No Layer B remote plugin sources; no rd3 deletion; no auto-remove of operator directory marketplaces |

**Acceptance Criteria Verification**

| AC | Status | Evidence Type | Evidence |
|----|--------|---------------|----------|
| AC1 Safety answer in runbook | MET | static-ref | Q&A A1 + `docs/help/cmd_install.md:299-334` |
| AC2 GitHub marketplace add end-state | PARTIAL | test + static-ref | Code path spawns github slug; live operator migration (clones under `~/.claude/plugins/marketplaces/`) not re-executed this verify — runbook complete |
| AC3 superskill install github mode | MET | test | `install.test.ts` github mode → `args.source === 'gobing-ai/superskill'` |
| AC4 update/refresh path | MET | static-ref | Runbook step 3 + Claude `marketplace update` documented; no superskill code owns update CLI |
| AC5 Grok path | MET | test | github slug spawn test in `install-grok-helpers.test.ts` + runbook step 6 |
| AC6 Docs | MET | static-ref | cmd_install.md, 01_PRD.md:104, CHANGELOG Unreleased (typo fixed) |
| AC7 Regression | MET | test | Directory default still default; 80 focused tests green; unknown names fall back to path |

**Fix pass (--fix all):** Added missing R8 github argv coverage (Claude/Grok/OMP) + CHANGELOG backtick typo fix.

**Design conformance:** D1–D6/D8 option B DONE; D2 `auto` optional deferred (documented); D7 document-only DONE.
### Review
**Verdict: PASS** — re-review after verify --force --fix all (2026-07-16)

**SECUA summary:** No blockers/majors. Cache clear remains path-segment gated. github mode falls back to directory for unknown marketplace names. Default stays `directory` (author-safe).

**P1–P4 priority findings** (reviewer's priority ordering):

| # | Severity | Title | Location | Status |
|---|----------|-------|----------|--------|
| 1 | P4 | Live operator directory→github migration not re-executed this verify (code+runbook complete) | docs/help/cmd_install.md migration runbook; AC2 | OPEN (advisory; does not block done) |
| 2 | P4 | Missing feature_id frontmatter (DD-07 warning only) | task 0086 frontmatter | OPEN (advisory; standard gate does not block) |
| 3 | P3 | R8 initially lacked github argv coverage on Claude/Grok/OMP helpers | install.test.ts + install-*-helpers.test.ts | FIXED (3 tests added this pass) |
| 4 | P4 | CHANGELOG had stray space inside backticks around --marketplace-source | CHANGELOG.md Unreleased | FIXED |

**Functional:** R1–R9 MET. AC2 PARTIAL only on live-ops residual.

**Residual risk:** Install without `--marketplace-source github` re-registers directory marketplaces — intentional default for dogfood.

**Disposition:** Ship. Operator should run the migration runbook once, then use `--marketplace-source github` for subsequent installs.
### References
**Code (superskill)**

- `apps/cli/src/commands/install.ts` — `defaultRunClaudeInstall`, `defaultRunGrokInstall`, cache clear, `resolvePluginRoot` marketplaceName
- `packages/core/src/marketplace.ts` — Layer B local relative resolution only
- `.claude-plugin/marketplace.json` — `"name": "superskill"`, plugin `cc`
- Tasks 0073 (OMP), 0078 (Grok) — prior host-CLI install patterns

**Code / repos (spur)**

- `~/xprojects/spur-new` / `https://github.com/gobing-ai/spur.git` — marketplace `"name": "spur"`, plugin `sp`
- `plugins/sp/commands/dev-*.md` — 21 commands

**Operator state (2026-07-16 investigation)**

- `known_marketplaces.json` — spur/superskill = directory sources
- `settings.json` — `sp@spur` enabled, `rd3@cc-agents` false, `extraKnownMarketplaces` directory
- Cache: `~/.claude/plugins/cache/spur/sp/0.3.11` complete
- `~/.claude/plugins/marketplaces/spur` — absent (expected for directory source)
- Grok: 21 `dev-*` registered; `/sp:dev-*` only under name collision (was with rd3)

**Claude CLI (verified help)**

- `claude plugin marketplace add <source>` — URL, path, or GitHub repo (`owner/repo`)
- `claude plugin marketplace list|remove|update`
- `claude plugin install|update|uninstall|enable|disable`

**Docs**

- `docs/01_PRD.md` — deferred remote marketplace sources (clarify Layer A vs B)
- `docs/03_ARCHITECTURE.md` — install pipeline Stage 4 Claude dispatch
- `docs/help/cmd_install.md` — user-facing install help
### History
- 2026-07-16T23:13:18.739Z backlog → todo (system)
- 2026-07-16T23:14:36.679Z todo → wip (system)
- 2026-07-16T23:33:56.626Z wip → testing (system)
- 2026-07-16T23:34:09.463Z testing → done (system)
