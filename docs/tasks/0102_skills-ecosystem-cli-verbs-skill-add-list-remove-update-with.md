---
template: feature-impl
schema_version: 1
name: "skills-ecosystem: CLI verbs skill add/list/remove/update with lock writes and dry-run"
description: ""
status: todo
type: task
profile: standard
feature_id: B
parent_wbs: "0097"
priority: P1
tags: ["skills-ecosystem", "cli"]
dependencies: ["0101"]
created_at: "2026-07-24T23:58:50.210Z"
updated_at: "2026-07-24T23:59:39.759Z"
---

## 0102. skills-ecosystem: CLI verbs skill add/list/remove/update with lock writes and dry-run

### Background

Implements: R3 (the four verbs). Ordering: after the installer/emission child. Non-interactive by design (AI-first CLI) — no @clack/prompts port; `--json` envelopes; stdout via process.stdout.write for spy-based assertions. Rubric: E2 D1 L1 C1 R1 = 6 → decompose (distinct surface: Commander wiring + output contract).

### Requirements
- R1. `superskill skill add <source> [--skill <name...>] [--agent <targets...>] [-g|--global] [--copy] [-y|--yes] [--list] [--dry-run] [--json]`: resolve → fetch → discover → install → emit per target → write BOTH locks. Project scope default (parity with `npx skills add`); `-g` for user-level.
- R2. `superskill skill list [-g] [--json]` reads both locks + on-disk scan; `superskill skill remove <name...> [-g] [-y]` uses lock-key-wins resolution and sweeps all tiers; `superskill skill update [name...] [-g] [-y]` is hash-based on the canonical copy (no-op when tree SHA equals stored skillFolderHash; reinstall + re-emit all tiers when different).
- R3. Verbs register in the existing `skill` group in apps/cli/src/commands/skill.ts; `superskill install` untouched.
- R4. Tests: Commander-level tests with injected dependencies (no live network/HOME writes); stdout asserted via process.stdout.write spy; --dry-run proves zero writes.
### Acceptance Criteria

<!-- Copy or derive real scenarios from the linked feature. Do not leave placeholder AC here. -->

### Q&A

<!-- Clarifications and decisions made during refinement. Keep empty if none. -->

### Design

<!-- Chosen implementation approach, key tradeoffs, invariants, and impacted surfaces. -->

### Plan

<!-- Ordered implementation checklist. Fill before moving to todo/wip. -->

### Solution

<!-- Filled during implementation: file:line change map and concise rationale. -->

### Testing

<!-- Filled during verification: commands run, outcomes, coverage claim or N/A. -->

### Review

<!-- Filled during review: P1-P4 findings, residual risk, and final disposition. -->

### References

B

<!-- Links to the parent feature, design docs, related tasks, or external references. -->

### History
