---
template: feature-impl
schema_version: 1
name: "skills-ecosystem: installer and three-tier per-target emission reusing the install pipeline"
description: ""
status: done
type: task
profile: standard
feature_id: F2
parent_wbs: "0097"
priority: P1
tags: [skills-ecosystem,emission,high-risk]
dependencies: ["0099","0100"]
created_at: 2026-07-24T23:58:50.199Z
updated_at: 2026-08-01T00:24:29.583Z
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
- `packages/core/src/skills-ecosystem/installer.ts:27` — `sanitizeName`, `isPathSafe` `:40`, `pathsOverlap` `:50`, `getCanonicalSkillsDir` `:57` (`<cwd|~>/.agents/skills`), `cleanAndCreateDir` `:65`, `createSymlink` `:86` (parent realpath resolution `:75`, win32 `junction` `:127-129`, `false` → copy fallback), `copyDir` `:137` (per-entry `isPathSafe` `:150`), `writeBlobSkill` `:186`, `installSkillCanonical` `:212` (canonical write guarded `:222`, overlap refusal `:231`).
- `packages/core/src/skills-ecosystem/emit.ts:56` — `emitSkillForTargets`: tier dispatch from `agents.ts` data — direct `:91-98` (canonical only), symlink `:105-153` (relative symlink + copy fallback + copy mode), translate `:155-176` (copy + `translateMarkdownFilesInDir` `:203`).
- `emit.ts:203` — tier-3 translation re-drives the install emission pipeline's own primitives in the same order (`translateSlashCommands` → `rewriteSkillReferences`, cf. `transformMarkdownDirectory` at `apps/cli/src/commands/install.ts:1108-1110`) — the boundary-legal reuse of the pipeline named in R2 (whose `prepareTargetRulesyncInput`/`transformRulesyncMarkdown` live in apps/cli and are not importable from core). The plugin prefix is the skill's own name; an empty prefix silently no-ops the rewrite (`rewrite-references.ts:10`). *(Repaired by the 2026-07-25 verify `--fix all` pass: the first draft passed `''`.)*
- `emit.ts:236` — `removeSkillFromTargets`: sweeps canonical + symlink + translated copies per target; lock-key-wins name resolution via `resolveSkillsToRemove` `:319` (vendor-verbatim port of `vendors/skills/src/remove.ts:41-57`) with the `lockKeys` option `:31` — the exact lock key is returned (`:307`) for the CLI child's lock removal while the disk sweep re-sanitizes. *(Added by the same fix pass.)*
- `packages/core/src/index.ts:55` — re-exports `installer` and `emit` modules.
- `packages/core/tests/skills-ecosystem/installer.test.ts:20` — 10 tests: sanitize/boundary/overlap units, canonical install (dir + BlobSkill), overlap skip, residual-proof traversal negatives (`:117`, `:133`), symlink fallbacks.
- `packages/core/tests/skills-ecosystem/emit.test.ts:11` — 10 tests: tier matrix {codex→direct, claude→symlink, hermes→translate} in sandbox HOME, BlobSkill emission, copy mode, failure paths, removal across tiers, residual-proof traversal negative `:197`, prefix-threading regression `:215`, lock-key-wins regressions `:240,:250`.
### Testing
**Per-Requirement Traceability** (verify run 2026-07-25; `--fix all` applied — pre-fix verdict PARTIAL with 2 gaps; every `file:line` re-read this run)

| Req | Status | Evidence |
| --- | --- | --- |
| R1 installer: canonical copy, relative symlinks, fallbacks, path safety | MET | `installer.ts:27` `sanitizeName`; `:40` `isPathSafe`; `:50` `pathsOverlap`; `:57` `getCanonicalSkillsDir` (`<cwd|~>/.agents/skills`); `:86-134` `createSymlink` (realpath parents `:75`, win32 junction `:127-129`, false→copy fallback wired at `emit.ts:122-145`); per-entry `isPathSafe` in `copyDir` `:150` and `writeBlobSkill` `:190`; canonical write guarded `:222`; overlap refusal `:231` |
| R2 emit: three-tier dispatch via existing pipeline | MET (after fix) | `emit.ts:56-190` dispatch — direct `:91-98`, symlink `:105-153` (+copy mode), translate `:155-176`. Translation uses the install pipeline's own primitives in the same order (`translateSlashCommands` → `rewriteSkillReferences`, cf. `apps/cli/src/commands/install.ts:1108-1110`). **Fix-pass:** prefix threaded (`emit.ts:168,203-211`) — the original passed `''`, a silent no-op that bypassed the pipeline's residual-refs safety net; regression `emit.test.ts:215` |
| R3 minimal translation, fail-loud on missing transform | MET | No transform beyond the pipeline's own; both translate-tier targets (hermes, grok) are covered by `TARGET_TO_AGENT_NAME` → ts-ai-runner (`pipeline/slash-command.ts:8-15`), so no gap exists to flag today. Absence of a future-gap detector noted advisory in Review |
| R4 removal sweeps all tiers, lock-key-wins | MET (after fix) | `emit.ts:236-310` sweeps canonical + symlink + translated dirs per target. **Fix-pass:** `resolveSkillsToRemove` ported vendor-verbatim (`emit.ts:319-335`, from `vendors/skills/src/remove.ts:41-57`) + `lockKeys` option (`:31`) — exact lock key returned (`:307`) while the sweep re-sanitizes; regressions `emit.test.ts:240,:250` |
| R5 tier matrix + residual-proof negatives | MET | `emit.test.ts:11` matrix {codex→direct, claude→symlink, hermes→translate} in sandbox HOME; `:197` traversal residual-proof across tiers; `installer.test.ts:117` (BlobSkill escape) + `:133` (copyDir traversal) residual-proof negatives; suites 10/10 and 10/10 standalone |

**Acceptance Criteria Verification** — the task's AC section is a bare placeholder comment (never filled; 4th consecutive skills-ecosystem sibling). Requirements carried the traceability load; flagged in Review.

**Defects found and repaired by this verify run (`--fix all`).** Verdict before fix: PARTIAL.

1. **R2 empty-prefix no-op (major).** `rewriteSkillReferences(translated, '')` returns content unchanged by contract (`rewrite-references.ts:10`), so tier-3 output skipped the pipeline's residual-refs rewrite. Fixed: skill name threaded as the plugin prefix; regression proves `my-skill:helper` → `my-skill-helper` in hermes output.
2. **R4 lock-key-wins missing (major).** The removal primitive only sanitized the requested name; a colon-style lock key (`ce:review` → folder `ce-review`) was unresolvable, contrary to the vendor's `resolveSkillsToRemove`. Fixed: vendor-verbatim port + `lockKeys` option; the result carries the exact key for the CLI child's lock removal.
3. Fix-pass touched (disclosure, all tracked files): `packages/core/src/skills-ecosystem/emit.ts:28-34,168,199-211,251-259,307,311-335`; `packages/core/tests/skills-ecosystem/emit.test.ts:215-272` (3 new tests).

**Deviation documented (R2).** The requirement named `prepareTargetRulesyncInput`/`transformRulesyncMarkdown` "from packages/core" — those live in `apps/cli/src/commands/install.ts:1045,1087` (the latter private) and are not importable from core. emit.ts re-drives the SAME two packages/core primitives those functions apply (`translateSlashCommands` + `rewriteSkillReferences`, same order), which is the only boundary-legal reuse path and satisfies the task's "no second translation convention" rule.

**Gate evidence (this run).** `bun run spur-check` EXIT=0: Biome clean, pre-check 31/31, **1839 pass / 0 fail**, post-check 3/3; `bun run build` EXIT=0. emit suite 10/10, installer suite 10/10 standalone.

Coverage: `emit.ts` 91.67% functions / 96.82% lines; `installer.ts` 90.48% / 92.45%; suite aggregate 99.60% functions / 98.90% lines (gate >=90%).
### Review
**Review Findings** (review pass 2026-07-25, SECUA all dimensions, committed 0101 surface: `installer.ts`, `emit.ts`, 2 test files — note: shipped inside commit 0c85e27 which carries a "task 0100" message)

| Priority | Dimension | Location | Finding | Disposition |
| --- | --- | --- | --- | --- |
| P1 | Security | — | None remaining — `isPathSafe` on canonical/copy/blob writes, `pathsOverlap` refusal, realpath'd relative symlinks, temp-free in-place translation; traversal negatives residual-proof | Clean |
| P2 | Correctness | `emit.ts:202` (was) | `rewriteSkillReferences(..., '')` is a contractual no-op — tier-3 output skipped the pipeline's residual-refs rewrite | **Fixed this run** (`emit.ts:168,203-211`; test `emit.test.ts:215`) |
| P2 | Correctness | `emit.ts` removal (was) | Lock-key-wins name resolution absent; colon-style lock keys (`ce:review`) unresolvable | **Fixed this run** (`emit.ts:319-335`; tests `:240,:250`) |
| P3 | Efficiency | — | None — per-target dispatch is linear; copies skip excluded dirs; no redundant canonical work | Clean |
| P4 | Correctness | `emit.ts` translate tier | No future-gap detector for R3's "fail loudly if the pipeline lacks a transform" — both current translate targets are covered by ts-ai-runner, so the condition cannot fire today | Advisory / Accepted (flag on adding a 3rd translate target) |
| P4 | Architecture | `emit.ts:66,251` | `cleanAndCreateDir` rm -rf has no `isPathSafe` guard of its own; safety rests on sanitized names + registry-owned base dirs | Advisory / Accepted (inputs safe by construction; R1's checked writes are the load-bearing ones) |
| P4 | Process | git history | 0101's implementation shipped inside commit 0c85e27 whose message says "task 0100" — history hygiene, content verified correct | Advisory / Noted (no action; rewriting pushed history is worse) |
| P4 | Process | task file `### Acceptance Criteria` | Bare placeholder, 4th consecutive sibling — the template invites skipping AC derivation | Advisory / Escalated as pattern (template-level fix candidate) |

No remaining blocker or major findings after the fix pass. Functional traceability: R1–R5 MET
(see `## Testing`, verdict artifact `.spur/run/0101-verdict.json` → PASS). The original `### Review`
table ("None/Pass/Verified" rows) was hollow — replaced with this findings table.
### References

B

<!-- Links to the parent feature, design docs, related tasks, or external references. -->

### History
