---
template: feature-impl
schema_version: 1
name: "skills-ecosystem: npx skills interop round-trip verification and docs sync"
description: ""
status: todo
type: task
profile: standard
feature_id: B
parent_wbs: "0097"
priority: P1
tags: ["skills-ecosystem", "interop", "docs"]
dependencies: ["0102"]
created_at: "2026-07-24T23:58:50.217Z"
updated_at: "2026-07-25T00:00:04.688Z"
---

## 0103. skills-ecosystem: npx skills interop round-trip verification and docs sync

### Background
Implements: R5 verification, AC scenario 'Round-trip interop with npx skills', and the docs surface (AC9 of parent). Ordering: last — after the CLI verbs child. Distinct review boundary: interop evidence plus ADR/docs lens rather than code. Rubric: E2 D1 L1 C1 R1 = 6 → decompose (docs/ADR review is a different lens than code).
### Requirements
- R1. Round-trip proof: a skill installed by `superskill skill add` is listed and removed by `npx skills list`/`npx skills remove` (same canonical path, lock keys, sanitizeName output), and vice versa — recorded fixtures if live npx is unavailable in CI.
- R2. `docs/04_DESIGN.md` documents the four verbs + flags + three-tier emission model in the same commit (surface owner doc).
- R3. `docs/00_ADR.md` gains a dated entry covering: port-vs-depend, lock-schema parity, noun-group verb placement, three-tier emission reusing the install pipeline, hash invariant.
- R4. `docs/05_FEATURES.md` status update; `.spur/context/anatomy.md` updated for the new module files.
- R5. `bun run spur-check` green (lint + pre-check rules + tests + post-check rules).
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
