---
template: feature-impl
schema_version: 1
name: "skills-ecosystem: agent registry, Target bridge with tier assignment, and dual lock read/writers"
description: ""
status: todo
type: task
profile: standard
feature_id: B
parent_wbs: "0097"
priority: P1
tags: ["skills-ecosystem", "interop", "locks"]
dependencies: ["0098"]
created_at: "2026-07-24T23:58:50.185Z"
updated_at: "2026-07-24T23:59:39.359Z"
---

## 0099. skills-ecosystem: agent registry, Target bridge with tier assignment, and dual lock read/writers

### Background

Implements: R1 (agents table part), R4 (tier assignment data), R5 (hash invariant — locks hash the canonical untranslated folder only). Ordering: after the parser/sanitizer child (needs sanitizeName for lock keys and dir names); runs parallel with the 'fetch + discovery' child. Locks are the byte-for-byte interop contract with `npx skills` — own review gate. Rubric: E2 D1 L1 C0 R1 = 5 → decompose (distinct review boundary: lock schema parity).

### Requirements
- R1. `agents.ts`: vendor agent-table subset for the 9 superskill Targets + tier assignment (`direct | symlink | translate`) — codex/pi/omp → direct (universal `.agents/skills`), claude/opencode/antigravity-cli/antigravity-ide → symlink, hermes/grok → translate; env overrides (CODEX_HOME, CLAUDE_CONFIG_DIR, …) and detectInstalled probes ported as data.
- R2. `locks.ts`: project `./skills-lock.json` v1 (sorted, timestamp-free, `computedHash` = SHA-256 over sorted relpath+content of the CANONICAL folder) and global `~/.agents/.skill-lock.json` v3 (or $XDG_STATE_HOME/skills; `skillFolderHash` = GitHub tree SHA; installedAt/updatedAt) read/write.
- R3. Never auto-wipe on lock-version mismatch: newer-than-understood global lock → leave untouched + warn (vendor wipe-on-bump explicitly NOT ported).
- R4. Hash invariant enforced at the API level: lock writers accept only the canonical folder path; tests prove translated copies cannot be hashed into locks.
- R5. Fixture tests validate both writers against vendor-shaped lock JSON (round-trip parse of real vendor lock samples).
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
