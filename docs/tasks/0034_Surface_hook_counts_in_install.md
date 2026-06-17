---
name: Surface hook counts in install
description: Surface hook counts in install
status: Backlog
created_at: 2026-06-17T22:43:20.823Z
updated_at: 2026-06-17T22:43:20.823Z
folder: docs/tasks
type: task
feature-id: F027
priority: high
estimated_hours: 2
tags: ["phase5","install","hooks","reporting"]
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0034. Surface hook counts in install

### Background

Make superskill install REPORT the hook configs it already emits. Hooks already generate for the 4 rulesync-hook-supported targets — runRulesync forwards 'hooks' to generate() (rulesync.ts:60, install.ts:151). The reporting path drops the count: InstallResultCounts (install.ts:72) has no hooksCount field and the aggregation loop (install.ts:159-161) sums only skills/commands/subagents. CORRECTED FINDING (design §0): the earlier 'rulesync.ts:51 hardcodes hooksCount:0, hooks mapped but not emitted' was a MISREAD — line 51 is the no-target early-return, not a stub. The genuine defect is reporting, not emission. Add the field, accumulate result.hooksCount, print it. Plus a validation checklist: confirm rulesync HookEvent maps to each ✅ target's native events; confirm pinned rulesync accepts hooks in generate({features}). Design: design-doc-phase5.md §0, §1.1, §2.1. Owning feature: F027.


### Requirements

- [ ] **R1** — `InstallResultCounts` (`install.ts:72`) gains `hooksCount: number`, initialized 0 (`install.ts:144`).
- [ ] **R2** — The rulesync aggregation loop (`install.ts:159–161`) accumulates `resultCounts.hooksCount += result.hooksCount` alongside skills/commands/subagents. (`result.hooksCount` is already returned by `runRulesync` → `generate()`.)
- [ ] **R3** — Hooks appear in the verbose summary line (`install.ts:165`) and the non-verbose result — install reports the **real** count (was silently 0).
- [ ] **R4** — **No `rulesync.ts` change** for the ✅ targets: `git diff --name-only apps/cli/src/rulesync.ts` is empty. (Its `generate()` already emits + returns `hooksCount`/`hooksPaths`.)
- [ ] **R5** — Validation checklist recorded (design §1.1): event-name fidelity spot-check for codex/opencode/antigravity-cli/antigravity-ide against `vendors/rulesync/src/types/hooks.ts` `*_HOOK_EVENTS`; rulesync API accepts `hooks` in `generate({ features })`. (Findings recorded; **no** redesign.)
- [ ] **R6** — Surgical: `install.ts` only; one field + one accumulation + one print. No refactor of the result-counts plumbing or rulesync loop (R3).

**Acceptance:**
```bash
superskill install <plugin> --targets codex --verbose   # → "Hooks: N" with N > 0
rg "hooksCount" apps/cli/src/commands/install.ts         # → field + accumulation + print
git diff --name-only apps/cli/src/rulesync.ts            # → empty
```

**Out of scope:** Pi/omp/hermes uncovered-target emission (F028); the `hook emit` verb (F029).


### Q&A



### Design



### Solution

install.ts: add hooksCount:number to InstallResultCounts (line 72), init 0 (line 144), accumulate in loop (159-161), print in verbose summary (165) + result. result.hooksCount already returned by runRulesync->generate(). Record the §1.1 validation checklist findings in a fixture/note; the test for this ships in this task (see ### Testing). Pi/omp/hermes uncovered targets are F028, not here.


### Plan



### Review



### Testing

Tests ship **in this task** (design rule: each task owns its tests — no separate pure-test task).

- [ ] `tests/commands/install-hooks.test.ts` (the hook-count half):
  - Install a hooks-bearing plugin + a ✅ target (codex/opencode/antigravity-cli/ide) → `InstallResultCounts.hooksCount > 0` and the verbose summary prints it (was silently 0).
  - Per-target fixture: hook config written to the expected native location for each ✅ target (design §6 exit #1).
  - `rulesync.ts` made no format-specific change (counts come from `generate()`).
- [ ] Validation-checklist assertion (§1.1): a fixture documents event-name fidelity for the ✅ targets.
- [ ] Coverage for the install hook-count branch contributes to the ≥90% gate.
- [ ] No test skipped / `.skip`'d (R12).

`tests/fixtures/phase5/` hooks-bearing sample plugin + per-target expected outputs. (Pi/omp/hermes assertions live in 0035.)


### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References

- Design: [design-doc-phase5.md](../design/design-doc-phase5.md) §0 (correction), §1.1, §2.1
- Feature: [F027](../features/F027-install-hook-counts.md)
- Code: apps/cli/src/commands/install.ts:72,144,159-165; rulesync.ts:60 (already emits)
- Vendor: vendors/rulesync/src/types/hooks.ts (*_HOOK_EVENTS)

