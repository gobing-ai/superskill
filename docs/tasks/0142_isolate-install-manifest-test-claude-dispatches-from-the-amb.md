---
schema_version: 1
name: Isolate install-manifest test claude dispatches from the ambient HOME (suite deletes real ~/.claude cache)
status: done
template: issue
created_at: 2026-09-14T17:32:40.143Z
updated_at: "2026-09-14T18:07:19.542Z"
feature_id: F

---

## 0142. Isolate install-manifest test claude dispatches from the ambient HOME (suite deletes real ~/.claude cache)

### Background

Recorded as an out-of-scope finding in task 0140's Review and carried as an explicit non-goal in task 0141 ("the claude dispatch's `rmSync` … — carried separately"); no task tracked it until now.

The claude dispatch in `apps/cli/src/commands/install.ts:754` runs `if (existsSync(cacheDir)) rmSync(cacheDir, { recursive: true, force: true })` where `cacheDir = join(resolveHomeDir(), '.claude', 'plugins', 'cache', <marketplace>)` and `resolveHomeDir()` is `process.env.HOME_DIR ?? homedir()`. It runs whenever the install is not a dry run — intentional production cache-refresh before reinstall.

The inherited test case `writes a claude provenance manifest from in-scope native dests` (`apps/cli/tests/commands/install-manifest.test.ts`) dispatches `target: 'claude'` with `dryRun: false` and **no `HOME_DIR` override**, and the file had no file-level home isolation — so every suite run executed that `rmSync` against the developer's real `~/.claude/plugins/cache/superskill` (the test marketplace name matches this repo's own `.claude-plugin/marketplace.json`). 0140's cycle-2 isolation fixed only the case it touched; the class stayed open for the inherited case and any future case that forgets the override.

### Requirements

- [x] R1. No case in `apps/cli/tests/commands/install-manifest.test.ts` can reach the ambient home: every case runs with `process.env.HOME_DIR` pointing at a fresh per-case temp home created before the case and removed after it.
- [x] R2. Cases that set their own `HOME_DIR` keep their behavior: their override wins for their duration; the file-level default is re-created for the next case and removed in teardown.
- [x] R3. Production behavior is unchanged: the claude dispatch cache-refresh `rmSync` stays exactly as-is — this task closes the test-side exposure only.
- [x] R4. No regression: every case in the file passes with no assertion changes, and `bun run lint` is green.

**Out of scope / non-goals**

- Changing or gating the production `rmSync` (deliberate cache-refresh semantics; any rethink is a separate design task).
- Per-case rewrites of the cases that already isolate their own home (0140's cycle-2 work stays).
- HOME_DIR isolation for other test files. The original claim that no other file was exposed was wrong (written without a full enumeration): `install.test.ts` (three cases, one keyed `superskill`) and `install-prune.test.ts` (one case) dispatch non-dryRun claude installs with no `HOME_DIR` override. Corrected 2026-09-14; the class remainder is owned by task 0144. `install.integration.test.ts` was checked and is NOT exposed (its claude dispatches are dry-run or per-case-isolated).

### Acceptance Criteria

- **AC1 (automated — R1, R3)** — The file gains an unconditional `beforeEach` that assigns `process.env.HOME_DIR` to a fresh `mkdtempSync` home and an `afterEach` branch that removes it; production `install.ts` is untouched by the diff.
- **AC2 (automated — R1)** — `bun test apps/cli/tests/commands/install-manifest.test.ts` passes with the isolation active, including the inherited hazard case, which now executes the dispatch with `HOME_DIR` set to a temp home (the mechanism that kept the real cache out of reach).
- **AC3 (no regression — R2, R4)** — `bun test apps/cli/tests/commands/install-manifest.test.ts packages/core/tests/operations/install-manifest.test.ts` passes with no edited assertions, and `bun run lint` is green with no skipped tests.

### Q&A

<!-- Clarifications and triage decisions. Keep empty if none. -->

### Design

File-level home isolation in `apps/cli/tests/commands/install-manifest.test.ts` only:

1. `beforeEach`: `fileLevelHome = mkdtempSync(join(tmpdir(), 'superskill-manifest-home-')); process.env.HOME_DIR = fileLevelHome` — unconditional, so no case can inherit the ambient home.
2. `afterEach`: existing restore (mock/fetch/HOME_DIR/cwd/tempDir) gains a branch removing `fileLevelHome` and resetting the variable.
3. Import `beforeEach` from `bun:test`. No other change.

Anti-patterns / do-not: touch `apps/cli/src/commands/install.ts`; rewrite per-case `HOME_DIR` overrides (they simply overwrite the default); share one temp home across cases (per-case freshness keeps cases order-independent).

### Plan

<!-- Ordered debugging/fix checklist. Fill before moving to todo/wip. -->

### Root Cause

<!-- Verified underlying cause with file:line evidence. Fill once reproduced/isolated. -->

### Solution

All changes in `apps/cli/tests/commands/install-manifest.test.ts`; production untouched (R3).

- `apps/cli/tests/commands/install-manifest.test.ts:1` — import `beforeEach` from `bun:test`.
- `apps/cli/tests/commands/install-manifest.test.ts:26` — `let fileLevelHome: string | undefined;` alongside the existing `tempDir` slot.
- `apps/cli/tests/commands/install-manifest.test.ts:88-95` — file-level `beforeEach`: fresh `mkdtempSync` home assigned to `process.env.HOME_DIR` before every case, closing the ambient-home path for any dispatch that skips its own override (the inherited hazard case included).
- `apps/cli/tests/commands/install-manifest.test.ts:107-110` — `afterEach` branch removes `fileLevelHome` and resets the variable, next to the existing `tempDir` teardown.

Cases that set `process.env.HOME_DIR` themselves (e.g. `apps/cli/tests/commands/install-manifest.test.ts:453`, `apps/cli/tests/commands/install-manifest.test.ts:497`, `apps/cli/tests/commands/install-manifest.test.ts:540`, `apps/cli/tests/commands/install-manifest.test.ts:735`) overwrite the default for their own duration; their own save/restore and the file-level teardown compose without interference (R2).

### Testing

**Pipeline verify results**

- Verdict: PASS (from verdict artifact)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| R1 | MET | `apps/cli/tests/commands/install-manifest.test.ts:92-95` — unconditional `beforeEach` assigns `process.env.HOME_DIR` to a fresh `mkdtempSync` home before every case (re-read this run); `apps/cli/tests/commands/install-manifest.test.ts:107-110` — `afterEach` removes it. No case can inherit the ambient home, so the `apps/cli/src/commands/install.ts:754` cache-refresh `rmSync` can only ever touch a temp home. Mechanism verified this run: 23 pass / 0 fail with the isolation active, including the inherited hazard case. |
| R2 | MET | Per-case overrides — re-read at current lines: `apps/cli/tests/commands/install-manifest.test.ts:453`, `apps/cli/tests/commands/install-manifest.test.ts:497`, `apps/cli/tests/commands/install-manifest.test.ts:540`, `apps/cli/tests/commands/install-manifest.test.ts:735` (plus `:369`, `:592`, `:637`, `:675`, `:708`) — overwrite the file-level default for their own duration; the next case gets a fresh default. All 23 tests pass unedited in substance — no assertion changed. |
| R3 | MET | This task's working-tree footprint: only `apps/cli/tests/commands/install-manifest.test.ts` + its corpus file (`git status --porcelain`; every other modified path belongs to 0139/0140/0141/0143's own recorded work). `apps/cli/src/commands/install.ts` byte-identical for this task. |
| R4 | MET | `bun test apps/cli/tests/commands/install-manifest.test.ts` → 23 pass / 0 fail this run; `bun run lint` → clean this session (biome 235 files + both typechecks); no `.skip`/`.todo`/`.only` added. |

| Acceptance Criteria | Status | Evidence Type | Evidence |
|---------------------|--------|---------------|----------|
| AC1 (isolation hooks present, production untouched) | MET | test | `beforeEach` at `apps/cli/tests/commands/install-manifest.test.ts:92-95` + `afterEach` removal at `:107-110` (re-read); diff scope limited to the test file + corpus (command: `git status --porcelain`). |
| AC2 (hazard case runs isolated) | MET | test | Suite passed this run (23/0) with the inherited case `writes a claude provenance manifest from in-scope native dests` executing under a file-level temp `HOME_DIR` — the dispatch's cache-refresh `rmSync` resolves under the temp home, never the ambient one. |
| AC3 (no regression) | MET | command | This run: suite 23 pass / 0 fail with no edited assertions; `bun run lint` clean this session. |
- Coverage: N/A (verdict-based; verify pipeline does not measure code coverage)

### Review

<!-- spur:record-review -->

**SECU findings** (pipeline verify step — verdict: PASS)

| Priority | Dimension | Location | Finding |
|----------|-----------|----------|----------|
| P4 | spur task check | — | task check passed |
| P4 | task-check | — | `spur task check 0142 --strict-core` → PASS (this run). |
| P4 | scope-creep | — | Diff is exactly the Design's three changes (import, `beforeEach`, `afterEach` branch) in one test file; the named anti-patterns (touching `install.ts`, rewriting per-case overrides, a shared cross-case home) remain absent. |
| P4 | design-conformance | — | 3/3 design claims DONE at the re-read anchors; no deviations. |
| P4 | Priority | — | Location |
| P4 | P4 | — | `apps/cli/tests/commands/install-manifest.test.ts:92-110` |
| P4 | P4 | — | `apps/cli/tests/commands/install-manifest.test.ts:92-95` |
| P4 | P4 | — | `apps/cli/tests/commands/install-manifest.test.ts:92-110` |
| P4 | P4 | — | — |
| P4 | evidence-rule-pass | — | All behavior-bearing AC rows have executable evidence or are explicitly non-behavioral. |

### References

<!-- Links to failing logs, related issues, tasks, docs, or external references. -->

### History

- 2026-09-14T17:34:11.057Z todo → wip (system)
- 2026-09-14T17:34:37.425Z wip → testing (system)
- 2026-09-14T17:34:47.436Z testing → done (system)

