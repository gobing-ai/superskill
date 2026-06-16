---
name: Plugin to rulesync mapper
description: Plugin to rulesync mapper
status: Done
created_at: 2026-06-16T05:43:07.021Z
updated_at: 2026-06-16T06:54:06.640Z
folder: docs/tasks
type: task
feature-id: F002
priority: high
estimated_hours: 2
tags: ["mapper","canonical","plugin"]
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0002. Plugin to rulesync mapper

### Background

rulesync expects content in .rulesync/ layout. The plugin source uses a different structure. This mapper is the bridge — no other module talks to the plugin directory directly.


### Requirements

- [x] **R1**: `mapPluginToRulesync` copies skills to `.rulesync/skills/<plugin>-<name>/SKILL.md`, commands to `.rulesync/commands/<plugin>-<name>.md`, agents to `.rulesync/subagents/<plugin>-<name>.md`, deep-merges `hooks.json` and `mcp.json`, preserves plugin prefix, handles missing optional directories, returns `MapResult` counts, and is tested against the hermetic `apps/cli/tests/fixtures/plugin-min/` fixture. → **MET** | Evidence: `apps/cli/src/mapper.ts:27 mapPluginToRulesync()`, `apps/cli/src/mapper.ts:89 deepMergeJsonFile()`, `apps/cli/src/mapper.ts:107 deepMerge()`, `apps/cli/tests/mapper.test.ts:15`, `apps/cli/tests/mapper.test.ts:67`, `apps/cli/tests/mapper.test.ts:115`, `apps/cli/tests/fixtures/plugin-min/plugin.json`


### Q&A



### Design


Maps the **hermetic fixture** `apps/cli/tests/fixtures/plugin-min/` (create it here: `plugin.json`, `skills/{a,b}.md`, `commands/run.md`, `agents/coder.md`) — no real corpus dependency (decision 2026-06-16). `mapPluginToRulesync(path, name, out)` → `.rulesync/skills/<name>-<skill>/SKILL.md`, `.rulesync/commands/<name>-<cmd>.md`, `.rulesync/subagents/<name>-<agent>.md`, deep-merged `hooks.json`/`mcp.json`. Returns `MapResult` counts. Handles missing optional dirs.


### Solution

- Created test fixture at `apps/cli/tests/fixtures/plugin-min/` (`plugin.json`, 2 skills, 1 command, 1 agent).
- Added `apps/cli/src/mapper.ts` with `mapPluginToRulesync()`.
- Maps plugin skills to `.rulesync/skills/<prefix>-<name>/SKILL.md`, commands to `.rulesync/commands/<prefix>-<name>.md`, and agents to `.rulesync/subagents/<prefix>-<name>.md`.
- Deep-merges plugin `hooks.json` and `mcp.json` into existing `.rulesync/hooks.json` and `.rulesync/mcp.json`.
- Handles missing optional directories and returns `MapResult` counts.


### Plan

1. Create hermetic test fixture `apps/cli/tests/fixtures/plugin-min/`.
2. Create `apps/cli/src/mapper.ts` with `mapPluginToRulesync`.
3. Create `apps/cli/tests/mapper.test.ts`.
4. Add regression coverage for deep-merging existing `hooks.json` and `mcp.json`.
5. Run lint, tests, and build.


### Review

**Review date:** 2026-06-16
**Status:** 0 open findings
**Scope:** `apps/cli/src/mapper.ts`, `apps/cli/tests/mapper.test.ts`, `apps/cli/tests/fixtures/plugin-min/`
**Mode:** verify
**Channel:** current
**Gate:** `bun run lint` → pass; `bun run test` → pass; `bun run build` → pass

#### P1 — Blockers
| # | Title | Dimension | Location | Recommendation |
|---|-------|-----------|----------|----------------|

#### P2 — Warnings
| # | Title | Dimension | Location | Recommendation |
|---|-------|-----------|----------|----------------|
| 1 | FIXED: `hooks.json` and `mcp.json` were overwritten instead of deep-merged | Correctness | `apps/cli/src/mapper.ts:72` | Added recursive JSON object merge and regression coverage for existing `.rulesync` config files. |

#### P3 — Info
| # | Title | Dimension | Location | Recommendation |
|---|-------|-----------|----------|----------------|

#### P4 — Suggestions
| # | Title | Dimension | Location | Recommendation |
|---|-------|-----------|----------|----------------|

**Fix-pass 2026-06-16:** 1 fixed, 0 failed, 0 skipped.


### Testing



### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References

