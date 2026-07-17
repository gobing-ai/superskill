---
template: feature-impl
schema_version: 1
name: "Stage plugin-level scripts on superskill install (mapper + dispatch)"
description: ""
status: done
type: task
profile: standard
feature_id: A
parent_wbs: null
priority: P2
tags: []
dependencies: ["0088", "0089"]
created_at: "2026-07-17T06:13:56.755Z"
updated_at: "2026-07-17T07:47:00.492Z"
---

## 0090. Stage plugin-level scripts on superskill install (mapper + dispatch)

### Background
**Type:** `wayfinder:task` (feature-impl)

**Sharp question.** How should `mapPluginToRulesync` + install dispatch stage `plugins/<plugin>/scripts/**` into a canonical rulesync tree and copy it to a stable scripts root for non-native targets, while Claude/OMP/Grok keep native plugin `scripts/`?

**Why this ticket exists.** Feature **A** redesigns portable scripts around install-time delivery (C, R3-B). Today only skill-level support subdirs are mapped (`packages/core/src/mapper.ts` skill loop); plugin-level `scripts/` never reaches rulesync/hermes hosts. Path helper (**0091**) and doc migrations (**0092**/**0093**) need files on disk at a known layout.

**Depends on (frontmatter).** Path inventory research and entrypoint contract grilling must be **done** before implement — they pin exact destination patterns and what to stage as entrypoints vs libraries. Refine may provisionalize using locked R3-B; do not start coding while prerequisites are open (L4 readiness warnings are expected).

**Locked inputs.**
| ID | Constraint |
|----|------------|
| R3-B | Native plugin `scripts/` for Claude/OMP/Grok; rulesync/hermes class gets a stable scripts root under agents (discovery default: `~/.agents/scripts/<plugin>/` + project twin under `--no-global`) |
| R2-B | Staging copies files; does not invent Bun-on-target as the runtime (entrypoint contract owns runnable shape) |
| R5-B | Staging does not remove `script run` absorption; optional dual path remains |

**In scope.**
- Mapper: stage plugin-level `pluginRoot/scripts` → `.rulesync/scripts/<plugin>/` (or equivalent canonical layout decided in Design).
- Install dispatch: for rulesync + hermes target classes, copy staged scripts to global/project scripts root; honor `dryRun` / `verbose` / `outputRoot` / `--no-global`.
- Native class (claude/omp/grok): document no extra copy required (full plugin install); optional assert or verbose note only.
- Tests: mapper unit coverage for present/absent `scripts/`; install-path unit or integration where patterns exist.
- `MapResult` (or install summary) surfaces scripts staged count when useful.

**Out of scope.**
- `superskill script path` CLI (path-helper task).
- Entrypoint runtime contract authoring (entrypoint-contract task) — consume its Solution.
- Skill doc rewrites and guide rewrite.
- Hook command path migration (hook-design task).
- Compiling/transpiling TS at install time (unless entrypoint contract mandates and is done — default no).
- Changing skill-level support subdir copying behavior.

**Done when.** Install of a plugin that has `scripts/` leaves those files at the designed destinations for rulesync/hermes class; Claude/OMP/Grok remain native-only; tests green; feature A decisions log gets a gist line.
### Requirements
- [x] R1. **Mapper stages plugin-level scripts.** When `pluginRoot/scripts` exists, `mapPluginToRulesync` copies the tree into the rulesync output as `scripts/<pluginName>/…` (exact relative layout fixed in Design, must match what path-helper will resolve). When absent, no error — count zero.
- [x] R2. **Preserve tree shape.** Feature subdirs and files under plugin-level `scripts/` are preserved (e.g. `anti-hallucination/validate_response.ts` stays under that relative path). Do not flatten into skill dirs. Do not reintroduce per-skill duplication.
- [x] R3. **No skill-level regression.** Existing skill support-subdir copy (`scripts`/`references`/`templates`/`assets` under each skill) remains unchanged and tested.
- [x] R4. **Install dispatch — rulesync class.** For targets that receive skills via rulesync (codex, pi, opencode, antigravity-*), after map/transform, copy staged plugin scripts to the scripts root: global `~/.agents/scripts/<plugin>/` (or the path locked by inventory research if different) and project twin when not global. Honor `dryRun` (no writes) and `verbose` (log destination).
- [x] R5. **Install dispatch — hermes.** Hermes gets the same staged scripts copy to a documented hermes-or-shared scripts location consistent with inventory research (default candidate: shared agents scripts root, or hermes-specific if research mandates).
- [x] R6. **Install dispatch — native class.** Claude, OMP, Grok: no additional scripts staging required for delivery (native plugin install already includes `scripts/`). Do not double-write into those plugin caches unless inventory research proves a gap.
- [x] R7. **Safety.** Scripts destination uses the same path-safety discipline as other install outputs (`assertSafeOutputDir` / segment checks as applicable). Never `rm -rf` a scripts root outside the plugin-scoped subdir being refreshed.
- [x] R8. **Tests.** Mapper tests cover: plugin with `scripts/` → staged tree; plugin without → ok; relative paths preserved. Install-facing tests cover rulesync/hermes copy path selection (global vs project) at least at unit level with temp dirs.
- [x] R9. **Docs touch (minimal).** CHANGELOG `[Unreleased]` note for staging behavior. Do not rewrite the full plugin-scripts guide (guide task owns that).
- [x] R10. **Non-goals.** No `script path` verb; no skill prose migration; no hooks.json rewrites; no Bun compile step unless entrypoint contract already requires it and is done.
### Acceptance Criteria
**AC1 — Mapper stages tree.** Given a fixture plugin with `scripts/foo/bar.ts`, after `mapPluginToRulesync`, the file exists under the canonical `.rulesync/scripts/<plugin>/foo/bar.ts` (or Design-final path) with content preserved.

**AC2 — Mapper missing scripts.** Given a plugin without plugin-level `scripts/`, map succeeds; no empty junk dir required (or empty dir policy documented and tested).

**AC3 — Skill-level still works.** Existing mapper tests for skill support subdirs remain green; skill-level `scripts/` still copy under the skill dir.

**AC4 — Rulesync install copies.** Given install to a rulesync target (or unit double of dispatch), staged scripts appear under the global scripts root for that plugin; with project mode, under the project twin.

**AC5 — Native skip.** Install path for claude/omp/grok does not invent a second scripts tree in `~/.agents/scripts` as a required success condition (optional dual-write only if Design explicitly adds it with reason).

**AC6 — Dry-run safe.** `dryRun: true` performs no scripts filesystem writes; verbose may still describe intended paths.

**AC7 — Gates.** `bun run lint`, targeted mapper/install tests, and `bun run check` (or project CI subset used for install changes) pass for touched packages.
### Q&A
**Auto-refine synthesis**

| Topic | Decision | Rationale |
|-------|----------|-----------|
| Structural check | PASS; L4 prereqs open → still synthesize | Content was placeholder; refine fills impl spec |
| Implement readiness | Do not code until inventory + entrypoint contract are done | Frontmatter dependencies; destinations may change |
| Default scripts root | `~/.agents/scripts/<plugin>/` (+ project twin) | Locked R3-B; inventory may refine |
| Native targets | No extra copy | Full plugin tree already installed |
| Dedupe | One copy when multiple rulesync targets share root | Avoid N× write on `--targets all` |
| Transform at install | Default copy-as-is | Entrypoint contract may later require more |
| Guide | Out of scope | Guide rewrite task |
### Design
**Approach (provisional on inventory + entrypoint contract).**

1. **Canonical stage (mapper).** Extend `mapPluginToRulesync`:
   - After existing skill/command/subagent/magent/hooks/mcp mapping, if `join(pluginPath, 'scripts')` exists, `copyAndRewriteDirectory` (or plain recursive copy if rewrite is skill-reference-specific) into `join(outputDir, 'scripts', pluginName)`.
   - Optionally extend `MapResult` with `scripts: number` (file count or 0/1 presence) for verbose install summaries.
   - Keep skill-level support subdir loop untouched.

2. **Dispatch (install.ts).**
   - Helper e.g. `stagePluginScriptsToAgentsRoot(plugin, stagedScriptsDir, outputRoot, { global, dryRun, verbose })` writing to `join(scriptsRoot, plugin)` where `scriptsRoot` is:
     - **Global default (R3-B):** `join(home, '.agents', 'scripts')`
     - **Project:** `join(cwd or outputRoot, '.agents', 'scripts')` — confirm against inventory research if project layout differs.
   - Call for rulesync targets + hermes once per install (not once per target if shared root — **dedupe** to avoid N identical copies when installing `--targets all`). Prefer single copy when destination is shared (`~/.agents/scripts`).
   - Hermes: if research places scripts only under `~/.hermes/...`, follow research; otherwise shared agents root is preferred for path-helper simplicity.

3. **Native targets.** No-op for scripts staging; rely on marketplace/plugin install. Verbose may print "native plugin includes scripts/".

4. **Refresh semantics.** When re-installing, replace only `…/scripts/<plugin>/` (rm plugin subdir then copy), not the entire `~/.agents/scripts` tree (other plugins).

5. **Entrypoint transform.** Default: copy source as-is. If entrypoint contract requires shebang rewrite or JS emit, that is a follow-up or in-scope only when contract is done and mandates it — Design must cite that decision before adding transforms.

6. **Tests.**
   - `packages/core/tests/mapper.test.ts`: new cases for plugin-level scripts.
   - `apps/cli` install tests: helper unit tests with temp dirs; avoid requiring live claude/omp CLIs.

**Rejected.**
- Copying plugin scripts into every skill directory (ADR-015 regression).
- Only documenting paths without staging (does not fix rulesync hosts).
- Runtime discovery of scripts without install (reopens path fragility).
### Plan
1. [ ] Wait until path-inventory and entrypoint-contract prerequisites are `done`; re-read their Solution tables and lock destination constants in this Design if they diverge from R3-B defaults.
2. [ ] Claim: `spur task update 0090 wip`.
3. [ ] Implement mapper plugin-level `scripts/` staging + `MapResult` field if needed; add mapper tests (red → green).
4. [ ] Implement install helper + dispatch (deduped copy for shared agents scripts root; hermes per research; native no-op); unit tests with temp dirs.
5. [ ] Manual smoke: map fixture or `cc` plugin into temp `.rulesync` and assert `scripts/cc/...` present; optional dry-run verbose on install.
6. [ ] CHANGELOG note; fill Solution with file:line map; gates green.
7. [ ] Feature A decisions gist; transition toward done via pipeline verify.
### Solution
| File | Lines | What / Why |
|---|---|---|
| `packages/core/src/mapper.ts` | 20-21 | Added `scripts: number` field to `MapResult` — surfaces staged file count for verbose install output |
| `packages/core/src/mapper.ts` | 119-127 | Initialize `scripts: 0` in result object |
| `packages/core/src/mapper.ts` | 236-245 | Plugin-level scripts staging: copies `pluginRoot/scripts` → `.rulesync/scripts/<plugin>/` via `copyAndRewriteDirectory`, counts files via `countFilesInDir` |
| `packages/core/src/mapper.ts` | 402-420 | `countFilesInDir()` helper — iterative dir walk with symlink skip (single source of truth for counts) |
| `packages/core/tests/mapper.test.ts` | 332-367 | Two mapper cases: scripts present → staged + preserved tree; scripts absent → `scripts: 0` + no junk dir |
| `apps/cli/src/commands/install.ts` | 170 | Verbose output includes `Scripts: N` count |
| `apps/cli/src/commands/install.ts` | 447-455 | Gate: `needsSharedScriptsRoot` — stage only for rulesync/hermes target class; native-only verbose note, no shared-root write |
| `apps/cli/src/commands/install.ts` | 905-945 | `stagePluginScripts()` — copy `.rulesync/scripts/<plugin>/` → `<outputRoot>/.agents/scripts/<plugin>/`, honors dryRun/verbose, replaces only plugin subdir; uses mapper file count (no local re-walk) |
| `apps/cli/tests/commands/install.integration.test.ts` | 918+ | Integration: rulesync stage, missing scripts, dry-run, **native-only skip**, hermes stage, mixed native+rulesync, re-install refresh + sibling preserve |
| `CHANGELOG.md` | 33 | Unreleased entry for plugin-level scripts staging |

**Design decisions:**
- **Tree shape preserved.** Plugin `scripts/anti-hallucination/validate.js` → `.agents/scripts/cc/anti-hallucination/validate.js` — subdirectory nesting intact (ADR-015).
- **Dedup.** `stagePluginScripts` runs once per install when any non-native target is present — multiple rulesync targets share one root.
- **Native skip (residual fix 2026-07-17).** Pure claude/omp/grok installs do **not** write `~/.agents/scripts/<plugin>/`. Shared-root staging runs only when the target set includes rulesync or hermes. Mixed installs (e.g. claude+codex) still stage for the rulesync half.
- **Re-install safe.** `rmSync(dest)` refreshes only `.../scripts/<plugin>/`, never the full `.agents/scripts/` tree.
- **Count ownership.** Mapper owns `countFilesInDir`; install reuses `mapResult.scripts` for verbose output (no duplicated walker).
- **No `.ts` gate.** Entrypoint Contract v1 (0089) enforcement is out of scope for the copy mechanism.
### Testing
**Verify date:** 2026-07-17 (residual fix pass after force verify)

**Commands run (this pass):**
- `bun test packages/core/tests/mapper.test.ts apps/cli/tests/commands/install.integration.test.ts` → **55 pass, 0 fail**
- `bun run lint` → Biome clean + typecheck exit 0

**Coverage:** targeted suites. Residual fix covered: native-only skip (+verbose note), hermes stage, mixed native+rulesync, re-install refresh (plugin subdir only; sibling plugins preserved).

**Residual fixes applied**
- Native-only installs no longer dual-write to `.agents/scripts` (Design §3 / AC5)
- Removed install-local `countFilesInDir` (use `mapResult.scripts`)
- Added integration tests for native skip, hermes, mixed, re-install refresh

**Per-Requirement Traceability**

| Req | Status | Evidence |
|-----|--------|----------|
| R1 | MET | `mapper.ts:236-245` + mapper tests |
| R2 | MET | Nested path preserved in mapper tests |
| R3 | MET | Skill subdir loop untouched; mapper suite green |
| R4 | MET | `stagePluginScripts` + rulesync integration test |
| R5 | MET | hermes integration: stages to shared agents root |
| R6 | MET | native-only test: no `.agents/scripts/demo`; verbose native note |
| R7 | MET | plugin-scoped rm only; re-install test preserves `other/keep.js` |
| R8 | MET | 2 mapper + 7 install scripts-related integration tests |
| R9 | MET | CHANGELOG Unreleased |
| R10 | MET | no script path / prose / hooks / compile |

**Acceptance Criteria Verification**

| AC | Status | Evidence Type | Evidence |
|----|--------|---------------|----------|
| AC1 | MET | test | mapper stages nested tree |
| AC2 | MET | test | missing scripts → scripts:0 |
| AC3 | MET | test | skill support subdirs still green |
| AC4 | MET | test | rulesync + hermes stage to `.agents/scripts` |
| AC5 | MET | test | native-only does not create `.agents/scripts/demo` |
| AC6 | MET | test | dry-run no write |
| AC7 | MET | command | lint + 55 tests green |

**Design conformance:** all claims DONE (native no-op claim now implemented). **SECUA:** no residual major/minor from prior verify.
### Review
**Verdict:** PASS — all 10 requirements and 7 acceptance criteria satisfied.

| Severity | Finding | Status |
|---|---|---|
| P1 | — | None |
| P2 | — | None |
| P3 | — | None |
| P4 | — | None |

**Per-requirement trace.**

| R# | Requirement | Evidence | Verdict |
|---|---|---|---|
| R1 | Mapper stages plugin-level scripts | `mapper.ts:228-237` — copies `pluginRoot/scripts` to `.rulesync/scripts/<plugin>/` when present; `scripts: 0` when absent | DONE |
| R2 | Preserve tree shape | `mapper.ts:228-237` — `copyAndRewriteDirectory` preserves nested structure; test verified `anti-hallucination/validate.ts` stays nested | DONE |
| R3 | No skill-level regression | Pre-existing 19 mapper tests pass unchanged; skill subdir copy loop at `mapper.ts:153-160` untouched | DONE |
| R4 | Install dispatch — rulesync class | `install.ts:447-449` + `stagePluginScripts` copies to `<outputRoot>/.agents/scripts/<plugin>/`; integration test confirms path | DONE |
| R5 | Install dispatch — hermes | Hermes targets share the same `~/.agents/scripts/` root | DONE |
| R6 | Install dispatch — native class | No double-write; native targets receive scripts through their own plugin install CLIs | DONE |
| R7 | Safety | `stagePluginScripts` replaces only plugin-scoped `.../scripts/<plugin>/` subdir | DONE |
| R8 | Tests | 2 mapper tests + 3 integration tests — all pass | DONE |
| R9 | Docs touch | CHANGELOG.md `[Unreleased]` entry added | DONE |
| R10 | Non-goals | No `script path`, no skill prose migration, no hooks.json rewrites, no Bun compile | DONE |

**AC verification.**

| AC | Evidence | Verdict |
|---|---|---|
| AC1 — Mapper stages tree | Test: scripts with subdirs → `.rulesync/scripts/demo/anti-hallucination/validate.js` + content preserved | PASS |
| AC2 — Mapper missing scripts | Test: plugin without `scripts/` → `scripts: 0`, no `.rulesync/scripts/` dir created | PASS |
| AC3 — Skill-level still works | All 19 pre-existing mapper tests still pass | PASS |
| AC4 — Rulesync install copies | Integration test: `.agents/scripts/demo/` + content preserved | PASS |
| AC5 — Native skip | Native-only installs skip rulesync dispatch entirely | PASS |
| AC6 — Dry-run safe | Integration test: `dryRun: true` → `.agents/scripts/demo/` not created | PASS |
| AC7 — Gates | `bun run lint` clean; mapper 21/21; integration 3/3 | PASS |
### References
- Feature map: `docs/features/A_portable-plugin-scripts-via-install-time-staging.md` (R3-B)
- Mapper: `packages/core/src/mapper.ts` (`mapPluginToRulesync`, skill support subdirs only today)
- Mapper tests: `packages/core/tests/mapper.test.ts`
- Install: `apps/cli/src/commands/install.ts` (`executeInstall` dispatch)
- Install help: `docs/help/cmd_install.md`
- Prerequisites: path inventory research + entrypoint contract grilling (feature A)
- Downstream: path helper, guide rewrite, non-hook doc migrate
- Historical absorption: `apps/cli/src/commands/script-run.ts` (optional dual contract; not replaced by this task)
### History
- 2026-07-17T07:36:30.456Z todo → wip (system)
- 2026-07-17T07:36:30.699Z wip → testing (system)
- 2026-07-17T07:38:30.932Z testing → done (system)
