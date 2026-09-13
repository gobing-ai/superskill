---
schema_version: 1
name: Stay-current docs describe skill coverage
status: todo
template: feature-impl
created_at: 2026-09-13T18:04:14.442Z
updated_at: "2026-09-13T18:41:49.929Z"
feature_id: F8
priority: P2
tags:
  - docs
  - update

dependencies: ["0137"]
---

## 0138. Stay-current docs describe skill coverage

### Background

User-facing doc close-out. The ADR-035 amendment (docs/00_ADR.md, dated 2026-09-13) and the 04_DESIGN.md rows already landed or land in tasks 0133-0137's same commits; this task owns docs/help2/installation.md § Stay current (currently lines 84-88: three bullets describing update --check, update [plugin], skill update) and a final audit that every doc claim matches shipped behavior. Rubric: E1 D1 L1 C1 R1 = 5 → single doc task. Implements: F8 R19.

### Requirements

- [ ] R1. help2 Stay current describes the shipped surface. docs/help2/installation.md § Stay current covers: update checking both plugins and lock-tracked skills, skill rows in the output, --check --json for scripts, the exit codes 0/1/2, and skill update --check as the skill-scoped read-only variant. Wording matches the behavior shipped in 0133-0137 — no claims about notifications or push-style updates (ADR-035 defers those).
- [ ] R2. The doc set is audited against the merged code. Re-read the ADR-035 amendment, docs/04_DESIGN.md update/skill rows, and docs/design/skill-update-notification.md § Unified update; confirm every command, flag, exit code, and output example they cite exists in the shipped CLI (verify by running --help and --check against a fixture); fix drift in the same commit or file it as a follow-up note in this task.
- [ ] R3. Leave regression evidence. A docs lint/check consistent with repo practice runs clean; the audit outcome (what was verified, command by command) is recorded in the task record.

### Acceptance Criteria

```gherkin
Scenario: R19 — Update surface docs describe skill coverage
  Given the feature's update and skill verb changes are merged
  When a reader opens docs/00_ADR.md, docs/04_DESIGN.md, and docs/help2/installation.md
  Then ADR-035 carries a dated amendment covering lock-tracked skills, and the 04 update surface and help2 "Stay current" section describe skill rows, --json, and skill update --check
```

### Q&A

<!-- CLOSED decisions from refinement: what was chosen and why, what was deferred and on what
     condition. Not a parking lot for open questions — an unanswered question here means the task
     is not ready to hand off. Keep empty if none. -->

### Design

**Out of scope for this task:** anything not named in Requirements below — no speculative abstractions, no drive-by refactors (project rule).



Docs-only task; no code surface. The help2 edit follows the section's existing bullet style (imperative one-liners with the command in backticks). The audit is a manual checklist executed against the built CLI, recorded as evidence in the task's Notes.

### Plan

1. Edit docs/help2/installation.md § Stay current. 2. Run the audit per R2 with the built CLI. 3. Record evidence; bun run lint. The pre-batch-create quiz gate was auto-skipped under --auto; sizing recorded via rubric line in Background.

### Solution

<!-- Filled during implementation: file:line change map and concise rationale. -->

### Testing

<!-- Filled during verification: commands run, outcomes, coverage claim or N/A. -->

### Review

<!-- Filled during review: P1-P4 findings, residual risk, and final disposition. -->

### References

<!-- Links to the parent feature, design docs, related tasks, or external references. -->

### History
