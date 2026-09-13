---
schema_version: 1
name: Update apply progress lines and JSON envelope
status: todo
template: feature-impl
created_at: 2026-09-13T18:04:14.442Z
updated_at: "2026-09-13T18:41:49.508Z"
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

- [ ] R1. Apply mode reports per-item progress. Before each plugin reinstall and each skill reinstall, the CLI prints `Updating <name>…`; after all items, a final line `Updated <n> of <m>.` counts successes against attempted items (stale plugins + stale skills). Failed items are named on the final line or their own line, and the existing failure exit code 1 is preserved.
- [ ] R2. The progress lines never corrupt JSON mode. In --check --json mode no progress or human lines are emitted (stdout stays the single envelope from 0134 R4); the npm remedy line is excluded from JSON stdout as well. A test asserts stdout parses as one JSON document with no other writes.
- [ ] R3. Leave focused regression evidence. CLI tests cover: two stale items produce two progress lines and `Updated 2 of 2.`; a mixed plugin+skill apply reports both kinds; the JSON-mode stdout purity assertion. bun run lint, bun run test, bun run build pass. docs/04_DESIGN.md update surface notes the apply output lines in the same commit.

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

<!-- Filled during implementation: file:line change map and concise rationale. -->

### Testing

<!-- Filled during verification: commands run, outcomes, coverage claim or N/A. -->

### Review

<!-- Filled during review: P1-P4 findings, residual risk, and final disposition. -->

### References

<!-- Links to the parent feature, design docs, related tasks, or external references. -->

### History
