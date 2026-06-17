---
name: fix-proposal-id-matching
description: fix-proposal-id-matching
status: Done
created_at: 2026-06-17T00:09:03.113Z
updated_at: 2026-06-17T00:15:58.961Z
folder: docs/tasks
type: task
feature-id: ""
priority: high
estimated_hours: 3
tags: ["evolve","proposal-id","H1","high"]
preset: standard
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0018. fix-proposal-id-matching

### Background

H1 finding: --accept \<id> / --reject \<id> match on String(p.id) — the SQLite integer autoincrement PK rowid. But the design and proposal file use proposal_id: agent-evolve-YYYY-MM-DD-NNN. Users see the proposal_id string in the .md file and run --accept agent-evolve-..., which silently finds nothing. The proposal_id isn't persisted to a column. UX-breaking inconsistency for the headline Phase 2 feature.


### Requirements

1. Persist proposal_id (add to proposal_json or a dedicated column in the proposals table). 2. Match accept/reject against proposal_id string, not rowid integer. 3. Add regression test that exercises accept/reject with a real proposal_id. 4. Verify CLI output surfaces the correct ID for user reference.


### Q&A



### Design

- **Decision**: Persist `proposal_id` in `proposal_json` (not a new DB column) — minimal schema change, avoids migration.
- **stepPropose**: Add `proposal_id` field to `proposalJson` object before inserting.
- **Accept/reject matching**: Parse `proposal_json.proposal_id` from stored proposals and match against the CLI-provided ID.
- **Files changed**: `apps/cli/src/operations/evolve.ts` (stepPropose, accept path, reject path), `apps/cli/tests/operations/evolve.test.ts` (5 tests updated).

### Solution

1. **stepPropose** (line 226): Added `proposal_id: proposalId` to `proposalJson` object.
2. **Reject path** (line 534-537): Changed from `String(p.id)` matching to `proposal_json.proposal_id` string matching.
3. **Accept path** (line 549-551): Same proposal_id matching.
4. **Tests**: Updated 5 tests to extract `proposal_id` from `proposal_json` instead of using DB `rowid`.

### Plan

- [x] Analyze proposal_id vs rowid mismatch
- [x] Add proposal_id to proposal_json in stepPropose
- [x] Update accept path to match proposal_json.proposal_id
- [x] Update reject path to match proposal_json.proposal_id
- [x] Update tests to use proposal_id strings
- [x] Verify: 34 tests pass, typecheck clean, lint clean

### Testing

- Command: `bun test apps/cli/tests/operations/evolve.test.ts`
- Scope: All evolve tests with updated proposal_id matching
- Result: 34 pass / 0 fail
- Evidence: Accept/reject tests now use `proposal_id` string extracted from `proposal_json`

### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References


