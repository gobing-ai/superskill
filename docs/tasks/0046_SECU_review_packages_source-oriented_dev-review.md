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

## Resolution — 2026-06-20 (all items fixed)

All SECU findings and architecture candidates from this review are resolved on `main`.

| Item | Severity | Status | Commit |
|------|----------|--------|--------|
| SECU #1 — dedupeLines content corruption | P2 | ✅ fixed | dedupeLines scoped to headings; content preserved |
| SECU #2 — backtick token miscounted as tool ref | P3 | ✅ fixed | structured tool: refs full weight, backtick capped |
| SECU #3 — clarity scored inconsistently (skill vs command) | P3 | ✅ fixed | unified scoreClarityFromDensities |
| SECU #4 — vague/imperative keyword lists duplicated | P3 | ✅ fixed | extracted shared constants |
| SECU #5 — computeAggregate unweighted, undocumented | P3 | ✅ fixed | doc-comment added |
| SECU #6 — `..`-substring over-rejection in marketplace | P4 | ✅ fixed | path-segment regex + regression test |
| Arch C1 — ConversionPipeline phantom seam | major | ✅ fixed | deleted convert.ts, aligned docs/03 |
| Arch C2 — duplicated frontmatter walker | major | ✅ fixed | extracted walkFrontmatter |
| Arch C3 — evaluate<Type> dispatch duplicated | major | ✅ fixed | added core evaluate(type,...) verb |
| Arch C4 — dead normalizeFrontmatter + stale parity test | minor | ✅ fixed | reworked parity test, deleted dead fn |
| Arch C5 — dimensions.ts mixes registry + toolkit | minor | ✅ fixed | split into types.ts + heuristics.ts |

**Bonus finding (bug-081, P2):** C4's parity rework exposed a latent production bug — the mapper stripped the slash-command colon before the per-target slash translator ran, so codex/pi dialect translation silently no-op'd in real installs. Fixed: rewriteSkillReferences now leaves slash-command lines for the translator; integration assertion tightened to require the `$` prefix.

Gate after all fixes: lint + typecheck + build clean; 843 tests pass / 0 fail; coverage 99.71% func / 98.65% line.


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


