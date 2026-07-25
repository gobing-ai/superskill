---
template: feature-impl
schema_version: 1
name: "skills-ecosystem: installer and three-tier per-target emission reusing the install pipeline"
description: ""
status: todo
type: task
profile: standard
feature_id: B
parent_wbs: "0097"
priority: P1
tags: ["skills-ecosystem", "emission", "high-risk"]
dependencies: ["0099", "0100"]
created_at: "2026-07-24T23:58:50.199Z"
updated_at: "2026-07-25T00:00:19.387Z"
---

## 0101. skills-ecosystem: installer and three-tier per-target emission reusing the install pipeline

### Background
Implements: R1 (installer part), R4 (three-tier emission), R6 (isPathSafe/pathsOverlap on all write targets). Ordering: after BOTH the 'agent registry + locks' and 'fetch + discovery' children. Highest-risk child (writes to $HOME, symlinks, translation) — own review boundary. Operator decision recorded in the parent task's Background: canonical-only installs silently no-op for agents that don't read .agents/skills, so emission follows superskill install's per-target model. Rubric: E3 D1 L2 C1 R2 = 9 → decompose (force: R=high). Rejected alternative: authoring new transform logic — tier 3 MUST reuse the existing install emission pipeline (no second translation convention).
### Requirements
- R1. `installer.ts`: canonical copy to `<cwd|~>/.agents/skills/<sanitizeName(name)>`; relative symlinks (junction on win32); symlink failure → fallback copy; isPathSafe on every write target; pathsOverlap refusal (never install onto/inside the source dir).
- R2. `emit.ts`: tier dispatch per target from agents.ts data — tier 1 direct (canonical only), tier 2 symlink from the agent's native skills dir, tier 3 translated copy via the EXISTING install emission pipeline (prepareTargetRulesyncInput / transformRulesyncMarkdown / rewriteSkillReferences from packages/core) treating the discovered skill dir as a minimal one-skill plugin input.
- R3. Translation is minimal by design: no transform where a symlink suffices; if a target needs a transform the install pipeline lacks, fail loudly (flag the gap) rather than papering over.
- R4. Removal primitive sweeps all three tiers (canonical + symlinks + translated copies) with lock-key-wins name resolution — consumed by the CLI child.
- R5. Tests: tier coverage matrix {codex→direct, claude→symlink, hermes→translate} in a sandbox HOME; residual-proof negatives for traversal/absolute-escape across all three tiers' write targets.
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
