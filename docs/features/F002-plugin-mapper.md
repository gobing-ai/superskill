---
feature_id: F002
title: Plugin → .rulesync/ mapper
phase: 1
status: planned
depends_on: []
deliverables:
  - apps/cli/src/mapper.ts
  - apps/cli/tests/mapper.test.ts
created: 2026-06-16
---

# F002 — Plugin → .rulesync/ mapper

## What

Map a Claude Code plugin directory (`plugins/<name>/`) into the `.rulesync/` canonical intermediate representation that `rulesync.generate()` consumes.

## Why

rulesync expects content in `.rulesync/{skills,commands,subagents,hooks,mcp}` layout. The plugin source uses a different structure (`skills/*.md`, `commands/*.md`, `agents/*.md`, `hooks.json`, `mcp.json`). This mapper is the bridge.

## Change

### `mapper.ts`

- `mapPluginToRulesync(pluginPath: string, pluginName: string, outputDir: string): Promise<MapResult>`
- For each feature type:
  - `skills/*.md` → `.rulesync/skills/<plugin>-<name>/SKILL.md` (each skill gets its own directory)
  - `commands/*.md` → `.rulesync/commands/<plugin>-<name>.md`
  - `agents/*.md` → `.rulesync/subagents/<plugin>-<name>.md`
  - `hooks.json` → `.rulesync/hooks.json` (deep merge if multiple plugins)
  - `mcp.json` → `.rulesync/mcp.json` (deep merge if multiple plugins)
- Plugin prefix (`rd3-`, `wt-`) is prepended to the canonical name
- Handles missing optional directories (e.g., no `agents/`, no `hooks.json`)
- Returns `MapResult` with counts per feature type

### Tests

- `mapper.test.ts`: maps the hermetic fixture `apps/cli/tests/fixtures/plugin-min/` → `.rulesync/`, verifies file count and naming, handles missing optional dirs, handles empty directories. No dependency on a real plugin corpus (decision 2026-06-16).

### Test fixture (create as part of this feature)

```
apps/cli/tests/fixtures/plugin-min/
├── plugin.json
├── skills/{a,b}.md          # 2 skills
├── commands/run.md          # 1 command
└── agents/coder.md          # 1 subagent
```

## Acceptance

```
# Given the plugin-min fixture (2 skills, 1 command, 1 subagent), plugin name "demo"
mapPluginToRulesync('apps/cli/tests/fixtures/plugin-min', 'demo', '.rulesync')
# → .rulesync/skills/demo-a/SKILL.md
# → .rulesync/skills/demo-b/SKILL.md
# → .rulesync/commands/demo-run.md
# → .rulesync/subagents/demo-coder.md
# → returns { skills: 2, commands: 1, subagents: 1, hooks: 0, mcp: 0 }
```
