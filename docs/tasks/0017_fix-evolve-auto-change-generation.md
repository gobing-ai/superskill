---
name: fix-evolve-auto-change-generation
description: fix-evolve-auto-change-generation
status: Done
created_at: 2026-06-17T00:09:03.102Z
updated_at: 2026-06-17T00:12:51.321Z
folder: docs/tasks
type: task
feature-id: ""
priority: high
estimated_hours: 6
tags: ["evolve","auto-change","C1","critical"]
preset: complex
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0017. fix-evolve-auto-change-generation

### Background

C1 finding: evolve.ts generateChanges emits dimension: locations with Score: N.NN current values, but stepApply only handles frontmatter.\<key> and literal text body matches. The generator and applier have never been tested end-to-end — the existing test injects hand-crafted proposal JSON bypassing generateChanges. Every auto-generated change is a silent no-op.


### Requirements

1. Resolve design question: what should auto-proposals actually mutate? Dimensions are heuristic scores, not file locations — proposals likely should target concrete frontmatter fields. 2. Make generateChanges emit changes that stepApply can actually apply (frontmatter.\<key> or real body text). 3. Add regression test that exercises the full generateChanges → stepApply pipeline end-to-end (not hand-crafted JSON injection). 4. Verify 'Content updated in place' Phase 2 acceptance criterion is met.


### Q&A



### Design

- **Decision**: Auto-proposals target `frontmatter.description` (a universal field across all content types). Dimensions are heuristic scores that measure description quality — `description` is the natural mutation target.
- **generateChanges**: Emits `location: 'frontmatter.description'` with a meaningful `proposed` text derived from the dimension note.
- **stepApply**: For `key === 'description'`, prepends the suggestion to the existing value instead of replacing it, preserving user-written content.
- **Files changed**: `apps/cli/src/operations/evolve.ts` (generateChanges, stepApply, import), `apps/cli/tests/operations/evolve.test.ts` (tests).

### Solution

#### Changes

1. **generateChanges** (line 118-142): Changed `location` from `dimension:${trend.dimension}` to `frontmatter.description`. Changed `proposed` from generic score text to `[Improve <dimension>]: <note>` format. `current` now carries dimension score info (unused by frontmatter edits but visible in proposal files).
2. **stepApply** (line 383-431): Added description-prepend logic — when `key === 'description'`, parses frontmatter to get existing value, prepends suggestion with `\n\n` separator. Other frontmatter keys replace as before.
3. **Import**: Added `parseFrontmatter` import from `../content/frontmatter`.

#### Tests

- Updated existing `generateChanges` tests (location/proposed format)
- Added: "emits frontmatter.description location with meaningful proposed text"
- Added: "emits frontmatter.description even when no dimension note"
- Added: "applies auto-generated changes to content (generateChanges → stepApply end-to-end)" — verifies C1 fix by exercising full pipeline with real generated changes

### Plan

- [x] Analyze generateChanges / stepApply mismatch
- [x] Design: auto-proposals target frontmatter.description, prepend not replace
- [x] Implement generateChanges fix
- [x] Implement stepApply prepend logic + parseFrontmatter import
- [x] Update generateChanges tests for new format
- [x] Add end-to-end regression test (generateChanges → stepApply)
- [x] Verify: 34 tests pass, typecheck clean, lint clean

### Testing

- Command: `bun test apps/cli/tests/operations/evolve.test.ts`
- Scope: All evolve tests including new C1-specific tests
- Result: 34 pass / 0 fail
- Evidence: End-to-end test confirms auto-generated changes now apply to content (description modified, original preserved)

### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References


