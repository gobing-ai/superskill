---
template: standard
schema_version: 1
name: "Supersede ADR-015 copied-on-install wording and extend ADR-022 scope"
description: ""
status: todo
type: task
profile: standard
feature_id: A
parent_wbs: null
priority: P2
tags: []
dependencies: ["0089", "0090", "0091", "0094"]
created_at: "2026-07-17T06:14:03.790Z"
updated_at: "2026-07-17T06:15:04.830Z"
---

## 0095. Supersede ADR-015 copied-on-install wording and extend ADR-022 scope

### Background
**Type:** `wayfinder:task`

**Sharp question.** Supersede ADR-015 'copied on install' ambiguity and extend/amend ADR-022 so install-staging + optional deep-import consumers are authoritative; fix 04_DESIGN and bundled_plugin drift.

**Context (from discovery).** Destination: every plugin skill-related script is delivered by install-time staging and invocable via a superskill-resolved path (portable runner contract). Locked decisions: C install-copy redesign; R2-B portable runner; R3-B native+rulesync roots; R4-B script path helper; R5-B dual contract (path standard, run optional); R6-B hooks also staged paths; R7-B 0087 first-slice + siblings.

**Done when.** The question has a written answer in this task body (with file:line evidence where research/impl), and the map feature **Decisions so far** can take one gist line.
### Requirements

<!-- R-numbered list of what must be true when this task is complete. Keep empty until requirements are known. -->

### Acceptance Criteria

<!-- Given/When/Then scenarios or a checklist derived from Requirements. Keep empty if this task has no objective AC yet. -->

### Q&A

<!-- Clarifications and decisions made during refinement. Keep empty if none. -->

### Design

<!-- Chosen approach, key tradeoffs, invariants, and impacted surfaces. Keep snippets short. -->

### Plan

<!-- Ordered implementation checklist. Fill before moving to todo/wip. -->

### Solution

<!-- Filled during implementation: file:line change map and concise rationale. -->

### Testing

<!-- Filled during verification: commands run, outcomes, coverage claim or N/A. -->

### Review

<!-- Filled during review: P1-P4 findings, residual risk, and final disposition. -->

### References

<!-- Links to features, docs, ADRs, related tasks, or external references. -->

### History
