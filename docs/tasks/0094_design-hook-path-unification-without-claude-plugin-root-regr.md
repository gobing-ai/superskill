---
template: brainstorm
schema_version: 1
name: "Design hook-path unification without CLAUDE_PLUGIN_ROOT regression"
description: ""
status: todo
type: brainstorm
profile: standard
feature_id: A
parent_wbs: null
priority: P2
tags: []
dependencies: ["0088", "0089"]
created_at: "2026-07-17T06:14:02.191Z"
updated_at: "2026-07-17T06:15:03.576Z"
---

## 0094. Design hook-path unification without CLAUDE_PLUGIN_ROOT regression

### Background
**Type:** `wayfinder:grilling`

**Sharp question.** How can hooks.json invoke staged script paths on every target without reintroducing CLAUDE_PLUGIN_ROOT and without regressing minCliVersion/emitter portability (R6-B unify)?

**Context (from discovery).** Destination: every plugin skill-related script is delivered by install-time staging and invocable via a superskill-resolved path (portable runner contract). Locked decisions: C install-copy redesign; R2-B portable runner; R3-B native+rulesync roots; R4-B script path helper; R5-B dual contract (path standard, run optional); R6-B hooks also staged paths; R7-B 0087 first-slice + siblings.

**Done when.** The question has a written answer in this task body (with file:line evidence where research/impl), and the map feature **Decisions so far** can take one gist line.
### Requirements

<!-- Constraints the eventual direction must satisfy, if known. -->

### Acceptance Criteria

<!-- Decision criteria or success checks for the brainstorm output. Keep empty if not applicable. -->

### Q&A

<!-- Questions, answers, assumptions, and decision notes from the brainstorm. -->

### Design

<!-- Candidate approaches, tradeoffs, and selected direction. -->

### Plan

<!-- Follow-up steps or task/feature creation plan once the idea is ready to execute. -->

### Solution

<!-- Final synthesized recommendation or output from the brainstorm. -->

### Testing

<!-- Validation performed for claims, links, or feasibility. Use N/A when not applicable. -->

### Review

<!-- Risks, open concerns, and follow-up review notes. -->

### References

<!-- Links to docs, examples, related tasks/features, or external references. -->

### History
