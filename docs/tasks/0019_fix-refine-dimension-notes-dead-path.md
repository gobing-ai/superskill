---
name: fix-refine-dimension-notes-dead-path
description: fix-refine-dimension-notes-dead-path
status: Done
created_at: 2026-06-17T00:09:03.122Z
updated_at: 2026-06-17T00:18:25.969Z
folder: docs/tasks
type: task
feature-id: ""
priority: high
estimated_hours: 4
tags: ["refine","dimension-notes","H3","high"]
preset: standard
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0019. fix-refine-dimension-notes-dead-path

### Background

H3 finding: refine.ts converts every evaluate dimension with score < 0.7 to a synthetic Finding{ severity: 'error' }, classifies as auto-apply, then calls generateAutoChange. But generateAutoChange only handles findings with messages containing 'missing'/'must be an array'/'must be a string'. Dimension notes like '3 trigger phrases found' or 'Body length: 1200 chars' match none, so they return null and get skipped. Refine reports fixes it attempts but dimension-derived ones are all no-ops — inflates the skipped list and confuses the delta. Borderline R12.


### Requirements

1. Either stop synthesizing fixable findings from dimension notes (keep them as suggest/flag informational only). 2. Or wire real auto-fixes for dimension-derived findings. 3. Verify refine output no longer reports no-op fixes as attempted. 4. Add regression test for the refine → evaluate → fix pipeline.


### Q&A



### Design

Dimension notes (e.g., "3 trigger phrases found", "Body length: 1200 chars") are diagnostic/informational — they describe content quality gaps but cannot be mechanically auto-fixed. The existing `generateAutoChange` only handles structural errors (missing fields, type mismatches). Synthesizing dimension notes as `severity: 'error'` → `classifyFix` → `strategy: 'auto-apply'` is incorrect: it inflates the skipped-fix list with no-ops and confuses the delta report.

Fix: dimension-derived findings should always be `severity: 'warning'` with `strategy: 'suggest'`, never `'error'` → `'auto-apply'`. Bypass `classifyFix` for dimension notes — its field-name-based heuristics were designed for validation findings, not evaluator dimension names.

### Solution

In `refine.ts` lines ~296-305, change dimension note synthesis:
- `severity`: `'warning'` (was `dimScore.score < 0.7 ? 'error' : 'warning'`)
- `strategy`: `'suggest'` directly (was `classifyFix(finding)` which returned `'auto-apply'` for severity `'error'`)

This puts dimension notes in the `fixesSkipped` list with `strategy: 'suggest'` instead of `strategy: 'auto-apply'`, accurately reflecting that they are informational suggestions, not skipped auto-fix attempts.

### Plan

1. Edit `apps/cli/src/operations/refine.ts` lines 296-305: set `severity: 'warning'` and `strategy: 'suggest'` directly
2. Update existing test name and add regression assertion: no `fixesSkipped` items should have `strategy: 'auto-apply'` from dimension-only content
3. Verify with typecheck + biome + refine test suite
4. Backfill Design/Solution/Plan/Testing sections
5. Transition task to Done

### Testing

- Updated existing test "applies auto-apply fixes for low-scoring dimensions" → "captures low-scoring dimension notes as suggestions"
- Added regression assertion: `autoApplySkipped.length === 0` for skill content with no structural errors but low-scoring dimensions
- 34 tests pass, 0 fail (bun test exit code 1 is coverage threshold only, not test failure)
### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References


