---
name: align-agent-completeness-scoring
description: align-agent-completeness-scoring
status: Done
created_at: 2026-06-17T00:09:03.131Z
updated_at: 2026-06-17T00:20:08.532Z
folder: docs/tasks
type: task
feature-id: ""
priority: high
estimated_hours: 3
tags: ["quality","agent","completeness","H2","high"]
preset: standard
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0020. align-agent-completeness-scoring

### Background

H2 finding: quality/agent.ts scoreCompleteness penalizes missing agentType (factor 0.3), but validate.ts's FIELD_TYPES.agent doesn't include agentType (it uses tools, model, platforms). REQUIRED_FIELDS.agent is [name, description, model]. The scaffold emits agentType: task so freshly-scaffolded agents pass, but real-world Claude Code subagents (which use name/description/tools/model) are unfairly capped at ~0.65. platforms is in validate schema but unused by evaluator; agentType is the reverse. Three modules disagree on what an agent is — violates R6.


### Requirements

1. Pick one field set for agent definition. agentType isn't a standard Claude Code subagent field — drop it from evaluator and template. 2. Score tools and model instead for completeness. 3. Align FIELD_TYPES.agent (validate.ts), REQUIRED_FIELDS.agent (dimensions.ts), and scoreCompleteness (quality/agent.ts). 4. Add regression test verifying consistent scoring across modules.


### Q&A



### Design

### Decision

The canonical agent field set is `[name, description, model, tools]`. `agentType` is not a standard Claude Code subagent field — it was a superskill invention. `platforms` remains an optional metadata field in `FIELD_TYPES` but is not scored for completeness.

### Alignment

| Module | Before | After |
|--------|--------|-------|
| `REQUIRED_FIELDS.agent` (dimensions.ts) | `[name, description, model]` | `[name, description, model, tools]` |
| `scoreCompleteness` (agent.ts) | base × avg(toolsFactor, agentTypeFactor) | `scorePresence(fieldsPresent, REQUIRED_FIELDS.agent)` |
| `FIELD_TYPES.agent` (validate.ts) | includes `tools` already | unchanged (was already correct) |
| template (default.md) | emitted `agentType: task` | removed, only `tools: []` remains |


### Solution

### Changes

1. **`apps/cli/src/quality/dimensions.ts:62`** — Added `tools` to `REQUIRED_FIELDS.agent` (`['name', 'description', 'model', 'tools']`).

2. **`apps/cli/src/quality/agent.ts:14-22`** — Simplified `scoreCompleteness` to delegate entirely to `scorePresence(fieldsPresent, REQUIRED_FIELDS.agent)`. Removed `agentType` factor, `toolsFactor` multiplier, and the manual `missing` array — all derived from `REQUIRED_FIELDS` now.

3. **`apps/cli/src/templates/agent/default.md:6`** — Removed `agentType: task` line. Template now emits only `name`, `description`, `tools`, `model`.

4. **`apps/cli/tests/quality/evaluators.test.ts`** — Removed `agentType: subagent` from `AGENT_GOOD` sample. Added regression test verifying `scoreCompleteness` output matches `scorePresence(Object.keys(data), REQUIRED_FIELDS.agent)`.

5. **`apps/cli/tests/quality/dimensions.test.ts`** — Added `REQUIRED_FIELDS` test verifying agent requires `['name', 'description', 'model', 'tools']`.

6. **`apps/cli/tests/operations/validate.test.ts`** — Updated all agent `fm()` calls to include `tools`. Added `reports missing tools for agent` test. Removed stale pi-target-without-tools test (tools now always required).

7. **`apps/cli/tests/operations/scaffold.test.ts`** — Changed assertion from `agentType: task` to `tools:` presence check.

### Rationale

Instead of keeping a separate multiplier system, we moved `tools` into `REQUIRED_FIELDS` so all three modules — `REQUIRED_FIELDS`, `FIELD_TYPES`, and `scoreCompleteness` — use the same canonical field set. This eliminates the inconsistency where validate didn't require `tools` but the evaluator heavily penalized its absence. The `scorePresence` function computes the fraction of required fields present, so missing `tools` reduces completeness by 0.25 (1/4) instead of the old 0.7× multiplier — a clean, predictable scoring model.


### Plan

1. Read and reconcile the three modules' agent field definitions
2. Add `tools` to `REQUIRED_FIELDS.agent` in dimensions.ts
3. Simplify `scoreCompleteness` in agent.ts to use `scorePresence` directly
4. Remove `agentType` from scaffold template
5. Update all affected tests: evaluators, dimensions, validate, scaffold
6. Run typecheck + biome
7. Run specific test files; fix any fallout
8. Backfill task sections; transition to Done


### Review



### Testing

### Test Results

```
bun test apps/cli/tests/quality/evaluators.test.ts \
        apps/cli/tests/quality/dimensions.test.ts \
        apps/cli/tests/operations/validate.test.ts \
        apps/cli/tests/operations/scaffold.test.ts

146 pass, 0 fail across 4 files
```

### New/Updated Tests

- **evaluators.test.ts**: Regression test verifying `scoreCompleteness` output matches `scorePresence(Object.keys(data), REQUIRED_FIELDS.agent)` — no agentType reference.
- **dimensions.test.ts**: `REQUIRED_FIELDS.agent` equals `['name', 'description', 'model', 'tools']`.
- **validate.test.ts**: `reports missing tools for agent` — validates tools is now required.
- **scaffold.test.ts**: Template no longer emits `agentType: task`; asserts `tools:` is present.


### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References


