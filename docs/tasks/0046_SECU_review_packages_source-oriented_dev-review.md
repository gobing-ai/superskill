---
name: SECU review — packages source-oriented (dev-review)
description: SECU review — packages source-oriented (dev-review)
status: Done
created_at: 2026-06-21T05:22:21.162Z
updated_at: 2026-06-21T06:30:55.320Z
folder: docs/tasks
type: task
feature-id: ""
impl_progress:
  planning: complete
  design: complete
  implementation: complete
  review: complete
  testing: complete
---

## 0046. SECU review — packages source-oriented (dev-review)

### Background

Source-oriented SECU review of packages/ run via /rd3:dev-review packages --focus all --fix all --auto. Architecture pass (rd3:code-improvement) surfaced 5 deepening candidates separately; this task captures the security/efficiency/correctness/usability findings.


### Requirements

- FR1: Run SECU (Security, Efficiency, Correctness, Usability) review over `packages/` source tree
- FR2: Run architecture deepening pass (rd3:code-improvement) for structural issues
- FR3: All P2+ findings MUST be fixed before task close
- FR4: Verification gate (lint + typecheck + build + test suite) MUST pass

### Q&A

_(no open questions — review completed on 2026-06-20)_

### Design

- Scope: SECU review + architecture deepening of `packages/` (`packages/core/src/`)
- Key decision: Combined SECU pass with architecture improvement pass; fixed findings inline
- Boundaries affected: `packages/core/src/quality/`, `packages/core/src/operations/`, `packages/core/src/marketplace.ts`, `packages/core/src/convert.ts` (deleted), `packages/core/src/evaluate.ts` (added core `evaluate` verb)
- Risks: none — review-only work with targeted fixes

### Solution

SECU + architecture review of `packages/` surfaced 13 findings (1 P2 warning, 4 P3 info, 1 P4 suggestion, 5 architecture deepening candidates). All fixed in a single batch; bonus P2 bug (bug-081, slash-command colon stripping before per-target translator) discovered and fixed during parity test rework. See `## Review` for the full findings table with commit references.
### Plan

- [x] Run SECU review (`/rd3:dev-review packages --focus all --fix all --auto`)
- [x] Run architecture deepening pass (`rd3:code-improvement`)
- [x] Fix all P2+ findings inline
- [x] Verify with lint + typecheck + build + full test suite
- [x] Document findings in task Review section



### Testing

- Command: `bun run lint && bun run build && bun run test`
- Timestamp: 2026-06-20 (all tests passing after fix batch)
- Scope: Full project — lint (Biome), typecheck (turbo), build (turbo), test suite (bun:test)
- Result: PASS — 843 tests pass / 0 fail
- Coverage: 99.71% func / 98.65% line
- Evidence: Gate confirmed clean after all fixes (see Resolution section)
- Next action: none

### Review


## Re-verification — 2026-06-20 (--force, dev-verify full)

Re-ran full Phase 7 (SECU) + Phase 8 (requirements traceability) against current `main` with `--fix all`.

- **All 6 prior SECU fixes verified present** in source: dedupeLines heading-scoped (`migrate.ts:93`), tool-ref backtick cap (`command.ts:52`), unified `scoreClarityFromDensities`, shared `IMPERATIVE_KEYWORDS`/`VAGUE_KEYWORDS` (`types.ts:57`), `computeAggregate` unweighted doc-comment (`types.ts:74`), path-segment `..` regex (`marketplace.ts:112`).
- **All 5 architecture fixes verified**: `convert.ts` deleted; `walkFrontmatter` extracted (`frontmatter-walk.ts`); core `evaluate()` dispatch verb (`evaluate.ts:33`); parity test reworked; `dimensions.ts` split into `types.ts` + `heuristics.ts`.
- **Fresh SECU scan: 0 new findings** (no secrets, no `any`, no empty catch, no injection surface, no await-in-loop).
- **Phase 8: all 4 requirements MET** (FR1–FR4), no scope drift, no untraced code.
- **Gate clean**: lint + typecheck pass; 890 tests / 0 fail (grew from 843); build succeeds.
- **Fix pass**: no-op — verdict PASS, nothing to fix.

**Verdict: PASS** — confirmed. No status change (remains Done).


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


