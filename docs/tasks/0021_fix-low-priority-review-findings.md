---
name: fix-low-priority-review-findings
description: fix-low-priority-review-findings
status: Done
created_at: 2026-06-17T00:09:03.147Z
updated_at: 2026-06-17T00:21:30.892Z
folder: docs/tasks
type: task
feature-id: ""
priority: low
estimated_hours: 4
tags: ["low-priority","nitpick","L1-L6"]
preset: standard
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0021. fix-low-priority-review-findings

### Background

L1-L6 findings from Phase 1 & 2 review: L1: quality/magent.ts parses frontmatter twice (duplicate parseFrontmatterSafe). L2: quality/command.ts scoreSlashSyntax ignores target parameter for dialect validation. L3: validate.ts link validity checks are format-only, not actual disk resolution. L4: config.ts targets uses z.string() cast instead of z.enum(TARGETS). L5: Phase 1 deferred commands correctly absent — confirmation only. L6: evolve.ts proposalRecord.created_at uses evaluations[0].created_at instead of actual row timestamp.


### Requirements

1. L1: Remove duplicate parseFrontmatterSafe call. 2. L2: Wire target parameter into dialect validation in scoreSlashSyntax. 3. L3: Add actual disk resolution for skill:/agent:/command: references. 4. L4: Use z.enum(TARGETS) instead of z.string() cast. 5. L5: Confirm deferred commands absent — no code change. 6. L6: Fix created_at to use actual row timestamp. 7. Add tests for L2, L3, L4 (behavioral changes).


### Q&A



### Design

All changes are surgical fixes to existing code paths, no new abstractions:
- L1: Local variable to avoid duplicate computation.
- L2: Direct parameter passing through scoreSlashSyntax.
- L3: Optional referenceChecker callback injected from validate() into _validateContent() → checkLinkValidity(); keeps _validateContent testable with mock checker.
- L4: Type-level change only; z.enum(TARGETS) provides compile-time validation.
- L5: Confirmation — no design impact.
- L6: insertProposal returns Proposal instead of number; stepPropose uses returned record rather than reconstructing it manually.

### Solution

L1: Single parseFrontmatterSafe call stored in fmResult; reuse for both data and fmNote check.
L2: Added target parameter to scoreSlashSyntax; removed unused data parameter; passed from evaluateCommand.
L3: Added referenceChecker option to ValidateOptions; checkLinkValidity now resolves references to disk via resolveContentPath when checker provided.
L4: Replaced z.string() cast with z.enum(TARGETS) in configSchema.
L5: Confirmed — no code change required.
L6: Changed insertProposal to return full Proposal (via deserializeProposal) instead of just id; stepPropose uses returned row's created_at from DB.

### Plan

1. L1: Edit quality/magent.ts lines 88-91.
2. L2: Edit quality/command.ts — scoreSlashSyntax signature + call site.
3. L3: Edit validate.ts — ValidateOptions, checkLinkValidity, _validateContent, validate().
4. L4: Edit config.ts line 16.
5. L5: No code change — note only.
6. L6: Edit store/proposals.ts insertProposal return type + operations/evolve.ts stepPropose.
7. Add tests for L2 (evaluators.test.ts), L3 (validate.test.ts), L4 (config.test.ts).
8. Run typecheck + biome; fix proposals.test.ts for changed return type.
9. Transition task to Done.

### Review



### Testing



### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References


