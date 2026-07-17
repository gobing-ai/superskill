---
template: feature-impl
schema_version: 1
name: "Migrate non-hook validate-response docs to path-based invocation"
description: ""
status: todo
type: task
profile: standard
feature_id: A
parent_wbs: null
priority: P2
tags: []
dependencies: ["0089", "0091"]
created_at: "2026-07-17T06:14:00.910Z"
updated_at: "2026-07-17T06:15:02.267Z"
---

## 0093. Migrate non-hook validate-response docs to path-based invocation

### Background
**Type:** `wayfinder:task`

**Sharp question.** Migrate anti-hallucination non-hook docs/README from script run-only (or dual) to path-based invocation of the staged validate_response entrypoint, preserving optional script run.

**Context (from discovery).** Destination: every plugin skill-related script is delivered by install-time staging and invocable via a superskill-resolved path (portable runner contract). Locked decisions: C install-copy redesign; R2-B portable runner; R3-B native+rulesync roots; R4-B script path helper; R5-B dual contract (path standard, run optional); R6-B hooks also staged paths; R7-B 0087 first-slice + siblings.

**Done when.** The question has a written answer in this task body (with file:line evidence where research/impl), and the map feature **Decisions so far** can take one gist line.
### Requirements

<!-- R-numbered list derived from the linked feature or refined task scope. -->

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

A

<!-- Links to the parent feature, design docs, related tasks, or external references. -->

### History
