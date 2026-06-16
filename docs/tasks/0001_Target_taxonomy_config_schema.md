---
name: Target taxonomy + config schema
description: Target taxonomy + config schema
status: Todo
created_at: 2026-06-16T05:43:00.903Z
updated_at: 2026-06-16T05:43:44.437Z
folder: docs/tasks
type: task
feature-id: F001
priority: high
estimated_hours: 2
tags: ["foundation","types","config"]
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0001. Target taxonomy + config schema

### Background

Every other module depends on knowing what agents exist, how they map to rulesync targets, and where their directories live. Foundation type for the entire codebase.


### Requirements


TARGETS enum covers 8 agents; TARGET_TO_RULESYNC maps non-Claude targets to rulesync ToolTarget; TARGET_TO_AGENT_NAME bridges every Target to ts-ai-runner AgentName for slash translation (omp→pi; antigravity/hermes→default dialect — the sets are disjoint, ADR-009 amendment). No getSkillPath for rulesync-supported targets (rulesync owns paths via outputRoots, ADR-010); only hermes/omp may need a path helper. zod schema validates superskill.jsonc; loadConfig handles missing file gracefully.


### Q&A



### Design


`targets.ts` exports: `TARGETS` (8), `Target`, `TARGET_TO_RULESYNC` (non-Claude → rulesync `ToolTarget`), and **`TARGET_TO_AGENT_NAME: Record<Target, AgentName>`** bridging to `@gobing-ai/ts-ai-runner`'s `AgentName` for slash translation. The two enums are **disjoint** on `antigravity-cli`/`antigravity-ide`/`hermes`/`omp` (verified ts-ai-runner@0.3.19: `AgentName = claude|codex|gemini|pi|opencode|antigravity|openclaw`). Mapping: `omp→pi`; antigravity/hermes → any non-claude/codex/pi name (falls to `translateSlashCommand` default `/plugin-command`). ADR-009 amendment.

**No superskill path table** for rulesync-supported targets — rulesync resolves paths from `outputRoots` (ADR-010). Drop `getSkillPath` for them; only `hermes`/`omp` may need a path helper.

`config.ts`: zod schema `{ version:1, plugins:[{name,path}], targets:Target[], features:string[] }`; `loadConfig()` reads/validates `superskill.jsonc`, missing file → defaults.


### Solution



### Plan



### Review



### Testing



### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References


