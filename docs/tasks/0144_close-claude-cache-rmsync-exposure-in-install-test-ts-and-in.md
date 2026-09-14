---
schema_version: 1
name: Close claude-cache rmSync exposure in install.test.ts and install-prune.test.ts (class remainder of 0142)
status: done
template: issue
created_at: 2026-09-14T17:49:10.317Z
updated_at: "2026-09-14T18:07:20.221Z"
feature_id: F

---

## 0144. Close claude-cache rmSync exposure in install.test.ts and install-prune.test.ts (class remainder of 0142)

### Background

Task 0142 closed the claude-cache `rmSync` exposure in `install-manifest.test.ts` and recorded a non-goal claim that no other test file was exposed. That claim was wrong (written without a full enumeration) and is corrected in 0142's Requirements.

Full enumeration this run (every `executeInstall` call across `apps/cli/tests`): the non-dryRun claude dispatch rmSyncs `<home>/.claude/plugins/cache/<marketplace>` (`apps/cli/src/commands/install.ts:754`), and two more files dispatch it with no `HOME_DIR` override:

- `apps/cli/tests/commands/install.test.ts` — three cases: `calls runClaudeInstall with marketplace metadata for non-dry-run claude target` (marketplace `test-marketplace`), `passes gobing-ai slug to runClaudeInstall when --marketplace-source github` (marketplace **`superskill`** — the real cache key, the same exposure class 0142 fixed), and `spawns claude marketplace add and install when using default runClaudeInstall` (marketplace `test-mkp`).
- `apps/cli/tests/commands/install-prune.test.ts` — `--prune does not touch native plugin-tree dests (claude)` (`['claude']`, `dryRun: false`, no `HOME_DIR` anywhere in the file).

`install.integration.test.ts` was checked and is NOT exposed: its claude dispatches are dry-run (`0081 AC4`) or non-claude targets (`codex`, `hermes`); the `dryRun: false` scanner hits were window-overlap false positives. `install-hooks.test.ts` (claude only dry-run), `install-min-cli-version-behavior.test.ts`, `install-grok-bot.test.ts`, `install-pi-extension-bundle.test.ts` (no claude target), and `update.test.ts` (no install dispatch) are likewise not exposed.

### Requirements

- [x] R1. No case in `apps/cli/tests/commands/install.test.ts` can reach the ambient home: every case runs with `process.env.HOME_DIR` pointing at a fresh per-case temp home, removed after the case.
- [x] R2. Same for `apps/cli/tests/commands/install-prune.test.ts`.
- [x] R3. Existing per-case / inner-describe `HOME_DIR` handling (e.g. `install.test.ts`'s isolated describe in the 1100s, per-case save/restores) composes with the file-level default: overrides win for their duration, teardown restores the ambient value once.
- [x] R4. Production behavior unchanged (the cache-refresh `rmSync` stays); every case in both files passes with no assertion changes, and `bun run lint` is green.

**Out of scope / non-goals**

- `install.integration.test.ts` and the other files enumerated as not exposed (see Background) — no change needed, verified this run.
- Changing the production `rmSync` (deliberate cache-refresh; any rethink is a separate design task).

### Acceptance Criteria

- **AC1 (automated — R1, R3)** — `install.test.ts` gains an unconditional file-level `beforeEach` assigning a fresh temp `HOME_DIR` and an `afterEach` branch removing it; the full file passes, including the three formerly exposed marketplace cases and the inner isolated describe.
- **AC2 (automated — R2, R3)** — same hook pair in `install-prune.test.ts`; the full file passes, including the formerly exposed native-dests case.
- **AC3 (no regression — R4)** — `bun test apps/cli/tests/commands/install.test.ts apps/cli/tests/commands/install-prune.test.ts` passes with no edited assertions; production diff-free; `bun run lint` green with no skipped tests.

### Q&A

<!-- Clarifications and triage decisions. Keep empty if none. -->

### Design

The 0142 pattern applied to the two exposed files — nothing else:

1. Each file gains `const savedHomeDir = process.env.HOME_DIR;` and `let fileLevelHome: string | undefined;` beside its existing `tempDir` slot.
2. File-level `beforeEach`: fresh `mkdtempSync` home assigned to `process.env.HOME_DIR` (distinct tmp prefixes per file: `superskill-install-test-home-`, `superskill-prune-test-home-`).
3. The existing top-level `afterEach` gains the ambient-restore lines and the `fileLevelHome` removal, keeping its current `chdir`/`tempDir`/spy teardown order.

Both files already import `mkdtempSync`, `rmSync`, `tmpdir`, `join`, `beforeEach`, `afterEach` — no import changes.

Anti-patterns / do-not: touch `apps/cli/src`; rewrite per-case overrides (they compose); share one temp home across cases; add the hook to files enumerated as not exposed (integration/hooks/others — no hazard, no change).

### Plan

<!-- Ordered debugging/fix checklist. Fill before moving to todo/wip. -->

### Root Cause

<!-- Verified underlying cause with file:line evidence. Fill once reproduced/isolated. -->

### Solution

All changes in the two test files; production untouched (R4).

`apps/cli/tests/commands/install.test.ts`:
- `apps/cli/tests/commands/install.test.ts:32-34` — `savedHomeDir` capture + `fileLevelHome` slot beside `tempDir`.
- `apps/cli/tests/commands/install.test.ts:56-64` — file-level `beforeEach` (fresh temp home per case).
- `apps/cli/tests/commands/install.test.ts:66-79` — top-level `afterEach` gains ambient restore + `fileLevelHome` removal alongside the existing `chdir`/`tempDir` teardown.

`apps/cli/tests/commands/install-prune.test.ts`:
- `apps/cli/tests/commands/install-prune.test.ts:8-10` — `savedHomeDir` capture + `fileLevelHome` slot.
- `apps/cli/tests/commands/install-prune.test.ts:62-70` — file-level `beforeEach`.
- `apps/cli/tests/commands/install-prune.test.ts:72-86` — top-level `afterEach` gains ambient restore + `fileLevelHome` removal after the existing spy/`chdir`/`tempDir` teardown.

Composition (R3): the inner isolated describe's own `savedHomeDir` (`apps/cli/tests/commands/install.test.ts:1122`) still captures/restores the ambient value; per-case `process.env.HOME_DIR = home` assignments override the file-level default for their duration.

### Testing

**Pipeline verify results**

- Verdict: PASS (from verdict artifact)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| R1 | MET | `apps/cli/tests/commands/install.test.ts:32-34` (savedHomeDir + slot), `:56-64` (unconditional `beforeEach` fresh temp home), `:66-79` (top-level `afterEach` ambient restore + removal) — re-read this run. All 63 cases in the file pass with the isolation active, including the three formerly exposed marketplace cases. |
| R2 | MET | `apps/cli/tests/commands/install-prune.test.ts:62-70` (unconditional `beforeEach` fresh temp home) and `apps/cli/tests/commands/install-prune.test.ts:72-86` (top-level `afterEach` ambient restore + removal), with the `savedHomeDir` slot at `apps/cli/tests/commands/install-prune.test.ts:8-10` — re-read this run. All 11 cases pass, including the formerly exposed native-dests case. |
| R3 | MET | Composition proven by the green run: the inner isolated describe's own save/restore (`apps/cli/tests/commands/install.test.ts:1122`) and per-case `HOME_DIR` assignments override the file-level default for their duration; 74 pass / 0 fail across both files with zero assertion edits. |
| R4 | MET | This task's footprint: the two test files + corpus only (`git status --porcelain`); `apps/cli/src/commands/install.ts` untouched; `bunx biome check` on both files clean (this run); full `bun run lint` clean this session. |

| Acceptance Criteria | Status | Evidence Type | Evidence |
|---------------------|--------|---------------|----------|
| AC1 (install.test.ts isolated, full file green) | MET | test | Hook pair at `apps/cli/tests/commands/install.test.ts:56-79` (re-read); file passed this run including `calls runClaudeInstall with marketplace metadata for non-dry-run claude target`, `passes gobing-ai slug to runClaudeInstall when --marketplace-source github`, and `spawns claude marketplace add and install when using default runClaudeInstall`. |
| AC2 (install-prune.test.ts isolated, full file green) | MET | test | Hook pair at `apps/cli/tests/commands/install-prune.test.ts:62-86` (re-read); file passed this run including `--prune does not touch native plugin-tree dests (claude)`. |
| AC3 (no regression) | MET | command | This run: 74 pass / 0 fail across both files, no edited assertions; biome clean both files; production diff-free. |
- Coverage: N/A (verdict-based; verify pipeline does not measure code coverage)

### Review

<!-- spur:record-review -->

**SECU findings** (pipeline verify step — verdict: PASS)

| Priority | Dimension | Location | Finding |
|----------|-----------|----------|----------|
| P4 | spur task check | — | task check passed |
| P4 | task-check | — | `spur task check 0144 --strict-core` → PASS (this run, after record). |
| P4 | scope-creep | — | Diff is exactly the Design's three additions per file; the named anti-patterns (touching `apps/cli/src`, rewriting per-case overrides, shared cross-case home, hooking non-exposed files) are absent — `install.integration.test.ts` verified not exposed and unchanged. |
| P4 | design-conformance | — | 3/3 design claims DONE at the re-read anchors; no deviations. |
| P4 | Priority | — | Location |
| P4 | P4 | — | `apps/cli/tests/commands/install.test.ts:56-64` |
| P4 | P4 | — | `apps/cli/tests/commands/install.test.ts:66-79` |
| P4 | P4 | — | both files |
| P4 | P4 | — | — |
| P4 | evidence-rule-pass | — | All behavior-bearing AC rows have executable evidence or are explicitly non-behavioral. |

### References

<!-- Links to failing logs, related issues, tasks, docs, or external references. -->

### History

- 2026-09-14T17:50:29.551Z todo → wip (system)
- 2026-09-14T17:50:59.911Z wip → testing (system)
- 2026-09-14T17:51:06.361Z testing → done (system)

