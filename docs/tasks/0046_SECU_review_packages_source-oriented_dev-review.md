---
name: SECU review — packages source-oriented (dev-review)
description: SECU review — packages source-oriented (dev-review)
status: Backlog
created_at: 2026-06-21T05:22:21.162Z
updated_at: 2026-06-21T05:22:21.162Z
folder: docs/tasks
type: task
feature-id: ""
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0046. SECU review — packages source-oriented (dev-review)

### Background

Source-oriented SECU review of packages/ run via /rd3:dev-review packages --focus all --fix all --auto. Architecture pass (rd3:code-improvement) surfaced 5 deepening candidates separately; this task captures the security/efficiency/correctness/usability findings.


### Requirements



### Q&A



### Design



### Solution



### Plan



### Review

## Follow-up — deferred architecture item (2026-06-20)

**Candidate 4 (deferred): `normalizeFrontmatter` is production-dead but test-load-bearing.**

`packages/core/src/pipeline/frontmatter.ts` `normalizeFrontmatter` has no production caller — the live install path (`apps/cli/src/commands/install.ts` `transformMarkdownDirectory`) runs only `translateSlashCommands → rewriteSkillReferences`; frontmatter injection is done by the mapper's `adaptCommandToSkill` / `adaptSubagentToSkill`. The function is kept alive by `packages/core/tests/pipeline/adapt-parity.test.ts`, which *simulates* the install wiring with `normalizeFrontmatter` (a different function than production uses) and `frontmatter.test.ts`.

The parity test's wiring comment (adapt-parity.test.ts:18-21) is stale — it claims `commands: normalizeFrontmatter → …` but production uses `adaptCommandToSkill`.

**Scoped fix (its own task):**
1. Rewrite `applyCommandPipeline`/`applySubagentPipeline` in `adapt-parity.test.ts` to simulate via the real mapper functions (`adaptCommandToSkill`, `adaptSubagentToSkill`).
2. Update the stale wiring comment.
3. Delete `normalizeFrontmatter`, its barrel export (`index.ts`), and `frontmatter.test.ts`.
4. Run full suite to confirm parity still holds.

Deferred from the 2026-06-20 review pass to keep the ConversionPipeline removal surgical (R3) — it touches the parity contract, not a trivial dead-export delete.

**Other architecture candidates (surveyed, not actioned):**
- C2 (major): duplicated frontmatter walker across `adapt-command.ts` / `adapt-subagent.ts`.
- C3 (major): `evaluate<Type>` dispatch duplicated 5×; no single `evaluate(type, …)` verb in core.
- C5 (minor): `dimensions.ts` mixes registry + heuristic toolkit.


### P1 — Blockers
_(none)_

### P2 — Warnings
| # | Title | Dimension | Location | Recommendation |
|---|-------|-----------|----------|----------------|
| 1 | Global line-dedup corrupts merged skill bodies | Correctness | packages/core/src/operations/migrate.ts:85 dedupeLines | dedupeLines drops every repeated NON-blank line across the whole merged body. Merging two skills that share a heading (## Examples), a list item, or a code fence silently deletes later occurrences, corrupting structure. Restrict dedup to consecutive-blank collapsing; do not dedup non-blank content lines (or dedup at block granularity). |

### P3 — Info
| # | Title | Dimension | Location | Recommendation |
|---|-------|-----------|----------|----------------|
| 2 | Backtick token counted as tool reference inflates score | Correctness | packages/core/src/quality/command.ts:71 scoreToolReferences | Regex matches any inline-code token (`json`, `true`), not just tool names; score saturates to 1.0 on prose with >=2 inline-code spans. Tighten to known tool names or tool(s): frontmatter. |
| 3 | clarity scored inconsistently between command and skill | Usability | packages/core/src/quality/command.ts:33 vs quality/skill.ts:80 | Command uses clamp(imperative - vague) (floors at 0); skill uses clamp((imperative - vague)/2 + 0.5) (baseline 0.5). Same dimension, divergent scales — aggregates not comparable across types. Share one formula. |
| 4 | Vague-term list duplicated as inline literals | Usability | packages/core/src/quality/skill.ts:79,83; command.ts:32,36 | The list ['maybe','perhaps','might','could be','probably'] is repeated 4x across two files. Extract a shared constant so density score and note cannot drift. |
| 5 | Rubric weights silently ignored on heuristic path | Correctness | packages/core/src/quality/dimensions.ts:70 computeAggregate vs quality/rubric.ts:17 | Rubric per-dimension weights (validated sum 1.0) apply only on --ingest path; default heuristic aggregate is equal-weighted mean. Intentional per docs/03 but undocumented in code. Add doc-comment on computeAggregate noting it is unweighted by design. |

### P4 — Suggestions
| # | Title | Dimension | Location | Recommendation |
|---|-------|-----------|----------|----------------|
| 6 | ..-substring check over-rejects legitimate paths | Usability | packages/core/src/marketplace.ts:111 | source.includes('..') rejects any source containing .. as a substring (e.g. ./a..b/plugin), not only ../ traversal. Real safety is resolve() + existsSync(plugin.json). Match the actual traversal pattern /(^|\/)\.\.(\/|$)/. Low impact. |

### Notes (verified clean)
- No hardcoded secrets, no any, no empty catch, no command/SQL/XSS injection surface.
- mapper.ts assertSafePathSegment guards plugin name (traversal + null-byte); deepMerge replaces arrays (correct).
- marketplace.ts rejects remote + object-form sources per invariant 7.
- normalizePiToolList O(n^2) dedup is on tool-count (<=~15) — not a hot path.
- Sync fs throughout core is a CLI domain layer by design.


### Testing



### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References


