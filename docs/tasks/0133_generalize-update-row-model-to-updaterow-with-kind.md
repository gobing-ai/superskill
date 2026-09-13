---
schema_version: 1
name: Generalize update row model to UpdateRow with kind
status: done
template: feature-impl
created_at: 2026-09-13T18:04:14.436Z
updated_at: "2026-09-13T19:45:01.926Z"
feature_id: F8
priority: P2
tags:
  - update
  - prefactor

---

## 0133. Generalize update row model to UpdateRow with kind

### Background

Prefactor that unblocks every other F8 task: rename PluginUpdateStatus/PluginUpdateResult to UpdateRow with kind:'plugin'|name, add the 'unchecked' status member and staleTargets/versionMismatch/reason/locator-only-data fields, and retarget the two consumers (packages/core/src/operations/update.ts, apps/cli/src/commands/update.ts) and both suites (apps/cli/tests/commands/update.test.ts 25 tests, packages/core/tests/operations/update.test.ts 7 tests — verified 2026-09-13 via `rg -c '^\s*(it|test)\('`, correcting the batch-file count of 11) with zero behavior change. Cohesion: every F8 task edits these two files; establishing the shared row model first avoids triple-churn. The historical reference is docs/tasks/0124 (rename is mechanical). Rubric: E1 D2 L1 C1 R1 = 6 → decomposed out as its own prefactor task (force: cohesion-first for the shared files). Implements: F8 R20 data model (UpdateRow 'unchecked' member, fields only).

### Requirements

- [x] R1. Rename the update row types to the unified model. In packages/core/src/operations/update.ts, replace PluginUpdateStatus with UpdateRowStatus ('stale' | 'current' | 'unchecked' | 'legacy' | 'unavailable') and PluginUpdateResult with UpdateRow { kind: 'plugin' | 'skill'; name: string; status; channel?; target?; installedVersion?; upstreamVersion?; changedPaths?; staleTargets?: string[]; versionMismatch?: { marketplace: string; pluginJson: string }; locator?; reason?: string }. Old names are deleted, not aliased (design D3). All plugin row construction sites set kind: 'plugin'; text output stays byte-identical to today except that an unavailable row whose reason is set prints the reason in place of the placeholder (asserted by R4; today the placeholder is printed unconditionally).
- [x] R2. Carry pre-merge target identity so partial staleness is nameable later. Plugin rows built before mergePluginUpdateRows keep their per-target target field; mergePluginUpdateRows gains (only) the staleTargets derivation: when merged status is 'stale', staleTargets is the list of contributing stale target names, and merged rows otherwise keep rank and ordering semantics (stale 3 > unavailable 2 > current 1 > legacy 0) exactly as today. No text output may consume staleTargets in this task.
- [x] R3. Retarget all consumers and tests to the new names. Update packages/core/src/operations/update.ts, apps/cli/src/commands/update.ts, packages/core/tests/operations/update.test.ts, and apps/cli/tests/commands/update.test.ts to the UpdateRow vocabulary. No assertions change except R4's. docs/04_DESIGN.md's update section is adjusted in the same commit to reference the UpdateRow shape (same-commit surface sync).
- [x] R4. Leave focused regression evidence. bun run lint, bun run test, and bun run build pass. One new or adjusted test asserts: an unavailable plugin row with reason set prints `(<locator>): <reason>`, and a stale merged row carries staleTargets while its text output is unchanged from today. All other existing update tests pass unmodified except the rename.

### Acceptance Criteria

```gherkin
Scenario: R1 — The unified update row model replaces plugin rows
  Given the update core and CLI import the row types from packages/core/src/operations/update.ts
  When the rename lands
  Then no PluginUpdateStatus or PluginUpdateResult identifier remains in source or tests, every constructed plugin row sets kind: 'plugin', and bun run lint passes

Scenario: R2 — Merged stale rows expose their stale targets
  Given a plugin stale on target claude and current on target codex
  When mergePluginUpdateRows merges its per-target rows
  Then the merged row has status stale and staleTargets ['claude'], and rank/ordering semantics match the previous implementation

Scenario: R3 — Consumers and tests compile against the new names
  Given the retargeted source and test files
  When bun run test runs
  Then both update suites pass with no renamed-name leftovers and no snapshot or assertion drift beyond the R4 reason-printing case

Scenario: R4 — An unavailable row with a reason prints it
  Given an UpdateRow { kind: 'plugin', name: 'kk', status: 'unavailable', locator: '/tmp/gone-marketplace', reason: 'locator path missing' }
  When the text formatter renders it
  Then the row contains '(/tmp/gone-marketplace): locator path missing'
```

### Q&A

<!-- CLOSED decisions from refinement: what was chosen and why, what was deferred and on what
     condition. Not a parking lot for open questions — an unanswered question here means the task
     is not ready to hand off. Keep empty if none. -->

### Design

**Out of scope for this task:** anything not named in Requirements below — no speculative abstractions, no drive-by refactors (project rule).



Design D3 (row model), D6 (fields only, no new consumers yet). Rename is a pure mechanical refactor: PluginUpdateStatus → UpdateRowStatus; PluginUpdateResult → UpdateRow with kind/name replacing plugin. 'unchecked' is added to the union now so later tasks only add rows, not types. staleTargets derivation lives in mergePluginUpdateRows next to the rank logic it reads. The one deliberate behavior seed: formatUpdateRow (apps/cli/src/commands/update.ts:383-395) prints reason for unavailable rows when present — today no caller sets reason, so observable output is unchanged until task 0136 wires resolveMarketplaceUpstream reasons in.

### Plan

1. Edit packages/core/src/operations/update.ts: rename types, add fields/members, kind:'plugin' at each row construction, staleTargets derivation in mergePluginUpdateRows. 2. Edit apps/cli/src/commands/update.ts: rename references; add reason-printing branch to formatUpdateRow. 3. Rename in both test files; add the R4 assertions. 4. Sync docs/04_DESIGN.md update section (UpdateRow shape). 5. Run bun run lint && bun run test && bun run build. The pre-batch-create quiz gate was auto-skipped under --auto (profile=auto); sizing decision recorded via rubric line in Background.

### Solution

Change-map (auto-generated — implement step did not record a Solution).
Each entry cites the first changed line per file (`file:line`).

| Change (`file:line`) |
|----------------------|
| `apps/cli/src/commands/update.ts:13` |
| `apps/cli/src/commands/update.ts:131` |
| `apps/cli/src/commands/update.ts:145` |
| `apps/cli/src/commands/update.ts:153` |
| `apps/cli/src/commands/update.ts:157` |
| `apps/cli/src/commands/update.ts:161` |
| `apps/cli/src/commands/update.ts:169` |
| `apps/cli/src/commands/update.ts:187` |
| `apps/cli/src/commands/update.ts:205` |
| `apps/cli/src/commands/update.ts:21` |
| `apps/cli/src/commands/update.ts:391` |
| `apps/cli/src/commands/update.ts:398` |
| `apps/cli/src/commands/update.ts:401` |
| `apps/cli/src/commands/update.ts:406` |
| `apps/cli/src/commands/update.ts:410` |
| `apps/cli/src/commands/update.ts:415` |
| `apps/cli/src/commands/update.ts:417` |
| `apps/cli/tests/commands/update.test.ts:14` |
| `apps/cli/tests/commands/update.test.ts:617` |
| `apps/cli/tests/commands/update.test.ts:98` |
| `packages/core/src/operations/update.ts:102` |
| `packages/core/src/operations/update.ts:111` |
| `packages/core/src/operations/update.ts:12` |
| `packages/core/src/operations/update.ts:121` |
| `packages/core/src/operations/update.ts:127` |
| `packages/core/src/operations/update.ts:129` |
| `packages/core/src/operations/update.ts:135` |
| `packages/core/src/operations/update.ts:139` |
| `packages/core/src/operations/update.ts:142` |
| `packages/core/src/operations/update.ts:149` |
| `packages/core/src/operations/update.ts:155` |
| `packages/core/src/operations/update.ts:168` |
| `packages/core/src/operations/update.ts:17` |
| `packages/core/src/operations/update.ts:170` |
| `packages/core/src/operations/update.ts:187` |
| `packages/core/src/operations/update.ts:199` |
| `packages/core/src/operations/update.ts:22` |
| `packages/core/src/operations/update.ts:28` |
| `packages/core/src/operations/update.ts:3` |
| `packages/core/src/operations/update.ts:6` |
| `packages/core/src/operations/update.ts:67` |
| `packages/core/src/operations/update.ts:71` |
| `packages/core/src/operations/update.ts:82` |
| `packages/core/src/operations/update.ts:99` |
| `packages/core/tests/operations/update.test.ts:100` |
| `packages/core/tests/operations/update.test.ts:122` |
| `packages/core/tests/operations/update.test.ts:128` |
| `packages/core/tests/operations/update.test.ts:133` |
| `packages/core/tests/operations/update.test.ts:139` |
| `packages/core/tests/operations/update.test.ts:64` |
| `packages/core/tests/operations/update.test.ts:69` |
| `packages/core/tests/operations/update.test.ts:78` |
| `packages/core/tests/operations/update.test.ts:85` |

### Testing

**Pipeline verify results**

- Verdict: PASS (from verdict artifact)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| R1 | MET | packages/core/src/operations/update.ts:4 (UpdateRowStatus union incl. 'unchecked'), :7-25 (UpdateRow full spec shape); old names deleted, zero hits in src/tests; kind:'plugin' at update.ts:71,81,103,108 + apps/cli/src/commands/update.ts:159,173,185,200; byte-identical no-reason output update.test.ts:110-113; lint green .spur/run/0133-test-gate.log |
| R2 | MET | target preserved pre-merge (update.ts:13-14; CLI target: manifest.target at :167,185,200,204); staleTargets derivation update.ts:133-147,178-183; rank 3/2/1/0 at update.ts:130-137; formatUpdateRow (:383-405) never reads staleTargets |
| R3 | MET | Four named files retargeted; zero old identifiers (grep); docs/04_DESIGN.md:114,116 synced; both suites 2319 pass / 0 fail .spur/run/0133-test-gate.log |
| R4 | MET | lint: .spur/run/0133-test-gate.log; test: 2319/0 in same log; build: .spur/run/0133-build.log exit 0 (851 modules); reason print update.test.ts:99-108; staleTargets core :87-105 + unchanged text CLI :617-639 |

| Acceptance Criteria | Status | Evidence Type | Evidence |
|---------------------|--------|---------------|----------|
| R1 — The unified update row model replaces plugin rows | MET | test | grep zero hits src/tests; kind:'plugin' at update.ts:71,81,103,108 + CLI :159,173,185,200; lint green .spur/run/0133-test-gate.log |
| R2 — Merged stale rows expose their stale targets | MET | test | packages/core/tests/operations/update.test.ts:87-105; rank table update.ts:130-137 |
| R3 — Consumers and tests compile against the new names | MET | test | .spur/run/0133-test-gate.log 2319 pass / 0 fail; grep no old names |
| R4 — An unavailable row with a reason prints it | MET | test | apps/cli/tests/commands/update.test.ts:99-108 exact AC row; formatter branch apps/cli/src/commands/update.ts:390-392 |
- Coverage: N/A (verdict-based; verify pipeline does not measure code coverage)

### Review

<!-- spur:record-review -->

**SECU findings** (pipeline verify step — verdict: PASS)

| Priority | Dimension | Location | Finding |
|----------|-----------|----------|----------|
| P4 | spur task check | — | task check passed |
| P4 | evidence-rule-pass | — | All behavior-bearing AC rows have executable evidence or are explicitly non-behavioral. |
| P4 | proof-input-digest | — | sha256:3a037e615aa69737f9438b43641cad2fc19100fb0d9343cd8fdff034697b8a1b |

### References

<!-- Links to the parent feature, design docs, related tasks, or external references. -->

### History

- 2026-09-13T19:17:39.509Z todo → wip (system)
- 2026-09-13T19:42:45.290Z wip → testing (system)
- 2026-09-13T19:45:01.926Z testing → done (system)

