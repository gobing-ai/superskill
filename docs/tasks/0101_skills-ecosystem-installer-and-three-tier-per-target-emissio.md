---
template: feature-impl
schema_version: 1
name: "skills-ecosystem: installer and three-tier per-target emission reusing the install pipeline"
description: ""
status: done
type: task
profile: standard
feature_id: B
parent_wbs: "0097"
priority: P1
tags: ["skills-ecosystem", "emission", "high-risk"]
dependencies: ["0099", "0100"]
created_at: "2026-07-24T23:58:50.199Z"
updated_at: "2026-07-25T09:08:00.000Z"
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

- `packages/core/src/skills-ecosystem/installer.ts`: Implemented `sanitizeName`, `isPathSafe`, `pathsOverlap`, `getCanonicalSkillsDir`, `cleanAndCreateDir`, `createSymlink` (with parent symlink resolution via `realpath` and win32 `junction` support), `copyDir`, `writeBlobSkill`, and `installSkillCanonical`.
- `packages/core/src/skills-ecosystem/emit.ts`: Implemented `emitSkillForTargets` and `removeSkillFromTargets` supporting Tier 1 (`direct`), Tier 2 (`symlink`), and Tier 3 (`translate` via `translateSlashCommands` and `rewriteSkillReferences`).
- `packages/core/src/index.ts`: Re-exported `installer` and `emit` modules with TSDoc documentation.

### Testing

- Added unit test suites in `packages/core/tests/skills-ecosystem/installer.test.ts` (10 unit tests) and `packages/core/tests/skills-ecosystem/emit.test.ts` (7 unit tests).
- Tested tier coverage matrix `{codex→direct, claude→symlink, hermes→translate}`, BlobSkills, copy-mode fallbacks, overlapping project-mode targets, path traversal security negatives (`isPathSafe`), and removal primitive across all 3 tiers.
- Passed `bun run autofix && bun run spur-check` cleanly (1836 tests passing across 95 files, coverage gate & TSDoc export rules green).

### Review

| Priority | Finding | Severity | Disposition |
|---|---|---|---|
| P1 | None | Pass | Verified |
| P2 | None | Pass | Verified |
| P3 | None | Pass | Verified |
| P4 | None | Pass | Verified |

### References

B

<!-- Links to the parent feature, design docs, related tasks, or external references. -->

### History
