---
template: feature-impl
schema_version: 1
name: "skills-ecosystem: fetch (GitHub Trees/Blob fast path + hardened git clone) and SKILL.md discovery"
description: ""
status: todo
type: task
profile: standard
feature_id: B
parent_wbs: "0097"
priority: P1
tags: ["skills-ecosystem", "fetch", "discovery"]
dependencies: ["0098"]
created_at: "2026-07-24T23:58:50.192Z"
updated_at: "2026-07-24T23:59:39.505Z"
---

## 0100. skills-ecosystem: fetch (GitHub Trees/Blob fast path + hardened git clone) and SKILL.md discovery

### Background

Implements: R1 (discovery part), R2 (fetch + transport hardening), R6 (git transport security). Ordering: after the parser/sanitizer child (consumes ParsedSource); runs parallel with the 'agent registry + locks' child. Rubric: E2 D1 L1 C1 R1 = 6 → decompose (network/git seams need mockable boundaries + own review).

### Requirements
- R1. `fetch.ts`: GitHub Trees/Blob API fast path (clone-free install + tree-SHA folder hash for the global lock) with `git clone --depth 1 [--branch ref]` fallback into mkdtemp; no persistent repo cache. Transport hardening ported: GIT_ALLOW_PROTOCOL=https:http:ssh:git:file, reject `ext::`, GIT_TERMINAL_PROMPT=0, LFS smudge off, 300s timeout, https→gh→ssh auth fallback. GitHub token resolution: GITHUB_TOKEN/GH_TOKEN env first, lazy `gh auth token` only after rate-limit.
- R2. `discovery.ts`: SKILL.md scan — searchPath itself, priority dirs (root, skills/, skills/.curated|/.experimental|/.system/, 26 agent dirs, plugin manifests), container-dir catalog layout one extra level, depth-5 recursive fallback skipping node_modules/.git/dist/build/__pycache__; metadata.internal hidden unless INSTALL_INTERNAL_SKILLS=1; isSubpathSafe enforced.
- R3. HTTP and git seams are dependency-injectable for tests (no live network in unit tests).
- R4. Tests: discovery fixtures mirror vendor skill-matching/root-level-disk-install cases; git-transport negatives are residual-proof.
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
