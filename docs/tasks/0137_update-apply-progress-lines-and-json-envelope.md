---
schema_version: 1
name: Update apply progress lines and JSON envelope
status: done
template: feature-impl
created_at: 2026-09-13T18:04:14.442Z
updated_at: "2026-09-13T22:31:37.241Z"
feature_id: F8
priority: P2
tags:
  - update
  - cli
  - ux

dependencies: ["0135", "0136"]
---

## 0137. Update apply progress lines and JSON envelope

### Background

Closing UX gap: applying updates is silent until done. Adds per-item progress and a final count on the apply path, plus the JSON-mode guarantee. Depends on 0134 (skill apply rows to report) and 0135 (summary formatter to reuse). Rubric: E1 D1 L1 C1 R1 = 5 → kept small and single (one apply path, one formatter). Implements: F8 R13, R16; 04_DESIGN.md update surface (apply output).

### Requirements

- [x] R1. Apply mode reports per-item progress. Before each plugin reinstall and each skill reinstall, the CLI prints `Updating <name>…`; after all items, a final line `Updated <n> of <m>.` counts successes against attempted items (stale plugins + stale skills). Failed items are named on the final line or their own line, and the existing failure exit code 1 is preserved.
- [x] R2. The progress lines never corrupt JSON mode. In --check --json mode no progress or human lines are emitted (stdout stays the single envelope from 0134 R4); the npm remedy line is excluded from JSON stdout as well. A test asserts stdout parses as one JSON document with no other writes.
- [x] R3. Leave focused regression evidence. CLI tests cover: two stale items produce two progress lines and `Updated 2 of 2.`; a mixed plugin+skill apply reports both kinds; the JSON-mode stdout purity assertion. bun run lint, bun run test, bun run build pass. docs/04_DESIGN.md update surface notes the apply output lines in the same commit.

### Acceptance Criteria

```gherkin
Scenario: R13 — Applying updates reports progress and a final result
  Given plugin kk and skill last30days are stale
  When the operator runs `superskill update`
  Then the output prints one progress line for kk and one for last30days, followed by a final line counting 2 updated

Scenario: R16 — Update emits a machine-readable result with --json
  Given plugin kk is stale and skill last30days is up to date
  When the operator runs `superskill update --check --json`
  Then stdout is one JSON document whose rows carry kind, name, and status for kk and last30days, and the exit code equals the text-mode exit code
```

### Q&A

<!-- CLOSED decisions from refinement: what was chosen and why, what was deferred and on what
     condition. Not a parking lot for open questions — an unanswered question here means the task
     is not ready to hand off. Keep empty if none. -->

### Design

**Out of scope for this task:** anything not named in Requirements below — no speculative abstractions, no drive-by refactors (project rule).



Progress lines are plain echo() writes bracketing each existing installImpl/updateSkills call site — no new channels, no logger. The `Updated n of m` count derives from the apply results already returned by the install/update calls; no new state. JSON purity is enforced by emitting the envelope from a single code path that the progress echoes cannot reach (check-mode early return).

### Plan

1. apps/cli/src/commands/update.ts: wrap the plugin and skill apply loops with progress echoes and the final count; guard them out of --check --json mode. 2. Tests per R3. 3. docs/04_DESIGN.md sync. 4. bun run lint && bun run test && bun run build. The pre-batch-create quiz gate was auto-skipped under --auto; sizing recorded via rubric line in Background.

### Solution

Change-map (auto-generated — implement step did not record a Solution).
Each entry cites the first changed line per file (`file:line`).

| Change (`file:line`) |
|----------------------|
| `apps/cli/src/commands/update.ts:137` |
| `apps/cli/src/commands/update.ts:347` |
| `apps/cli/src/commands/update.ts:370` |
| `apps/cli/src/commands/update.ts:383` |
| `apps/cli/src/commands/update.ts:390` |
| `apps/cli/src/commands/update.ts:405` |
| `apps/cli/src/commands/update.ts:417` |
| `apps/cli/tests/commands/update.test.ts:1267` |

### Testing

**Pipeline verify results**

- Verdict: PASS (from verdict artifact)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| R1 | MET | update.ts:371,390,418 (progress + final count), :411 (failed skill named own line), :421,:127-128 (exit 1 preserved); tests update.test.ts:1300,1330,1354 |
| R2 | MET | update.ts:330-332 (single envelope write), :345-346 (progress/remedy/count guarded behind !options.check); purity test update.test.ts:1392 (JSON.parse of full stdout, no Updating/Updated/npm remedy, empty stderr) |
| R3 | MET | tests update.test.ts:1300,1354,1392; .spur/run/0137-test-gate.log (lint clean, 2355 pass/0 fail, 33 pre + 3 post rules, digest = 0137-proofdigest.txt); .spur/run/0137-build.log (exit 0); docs/04_DESIGN.md:121 |

| Acceptance Criteria | Status | Evidence Type | Evidence |
|---------------------|--------|---------------|----------|
| R13 — Applying updates reports progress and a final result | MET | test | update.test.ts:1300-1328 — exactly one Updating kk… and one Updating last30days…, output ends Updated 2 of 2. |
| R16 — Update emits a machine-readable result with --json | MET | test | update.test.ts:1392-1446 — stdout parses as one JSON document; kk and last30days rows each carry kind/name/status; text-mode rerun asserts textCode === code |
- Coverage: N/A (verdict-based; verify pipeline does not measure code coverage)

### Review

<!-- spur:record-review -->

**SECU findings** (pipeline verify step — verdict: PASS)

| Priority | Dimension | Location | Finding |
|----------|-----------|----------|----------|
| P4 | spur task check | — | task check passed |
| P4 | evidence-rule-pass | — | All behavior-bearing AC rows have executable evidence or are explicitly non-behavioral. |
| P4 | proof-input-digest | — | sha256:3f08e71497216089f74669d18a0f87ddeac9dfc30f5dff3210c803c77eb00136 |

### References

<!-- Links to the parent feature, design docs, related tasks, or external references. -->

### History

- 2026-09-13T22:01:10.605Z todo → wip (system)
- 2026-09-13T22:31:36.153Z wip → testing (system)
- 2026-09-13T22:31:37.241Z testing → done (system)

