---
name: Plugin to rulesync mapper
description: Plugin to rulesync mapper
status: Todo
created_at: 2026-06-16T05:43:07.021Z
updated_at: 2026-06-16T06:44:44.337Z
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


mapPluginToRulesync copies skills→.rulesync/skills/<plugin>-<name>/SKILL.md, commands→.rulesync/commands/<plugin>-<name>.md, agents→.rulesync/subagents/<plugin>-<name>.md, hooks.json→.rulesync/hooks.json (deep merge), mcp.json→.rulesync/mcp.json (deep merge); plugin prefix preserved; handles missing optional dirs; returns MapResult with counts. Create and test against the hermetic fixture apps/cli/tests/fixtures/plugin-min/ (plugin.json, skills/{a,b}.md, commands/run.md, agents/coder.md) — no real corpus dependency.


### Q&A



### Design


Maps the **hermetic fixture** `apps/cli/tests/fixtures/plugin-min/` (create it here: `plugin.json`, `skills/{a,b}.md`, `commands/run.md`, `agents/coder.md`) — no real corpus dependency (decision 2026-06-16). `mapPluginToRulesync(path, name, out)` → `.rulesync/skills/<name>-<skill>/SKILL.md`, `.rulesync/commands/<name>-<cmd>.md`, `.rulesync/subagents/<name>-<agent>.md`, deep-merged `hooks.json`/`mcp.json`. Returns `MapResult` counts. Handles missing optional dirs.


### Solution



### Plan



### Review



### Testing



### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References


