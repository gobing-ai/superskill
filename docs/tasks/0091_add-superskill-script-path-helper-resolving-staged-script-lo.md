---
template: feature-impl
schema_version: 1
name: "Add superskill script path helper resolving staged script locations"
description: ""
status: todo
type: task
profile: standard
feature_id: A
parent_wbs: null
priority: P2
tags: []
dependencies: ["0090"]
created_at: "2026-07-17T06:13:58.016Z"
updated_at: "2026-07-17T06:14:59.329Z"
---

## 0091. Add superskill script path helper resolving staged script locations

### Background
**Type:** `wayfinder:task`

**Sharp question.** What is the superskill script path <plugin> <rel-or-id> CLI contract (resolution order, --json shape, exit codes, global vs project root) so skill docs never hardcode cache paths?

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
