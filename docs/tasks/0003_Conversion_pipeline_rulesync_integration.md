---
name: Conversion pipeline + rulesync integration
description: Conversion pipeline + rulesync integration
status: Todo
created_at: 2026-06-16T05:43:14.543Z
updated_at: 2026-06-16T06:54:12.048Z
folder: docs/tasks
type: task
feature-id: F003
priority: high
estimated_hours: 4
dependencies: ["0001"]
tags: ["pipeline","conversion","rulesync","pi"]
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0003. Conversion pipeline + rulesync integration

### Background

The bash scripts do per-agent transformations by hand with regex. rulesync handles heavy format conversion, but cc-agents-specific transforms must still run. The pipeline is the home for those — pure functions, per-target registration, no side effects.


### Requirements


ConversionPipeline with named per-target stages (pure fns). rewriteColonRefs: rd3:foo→rd3-foo in prose. translateSlashCommand via @gobing-ai/ts-ai-runner using TARGET_TO_AGENT_NAME[target] (sets are disjoint on the 4 new targets — ADR-009 amendment). normalizeFrontmatter: inject name field. convertToPiSubagent: Skills 2.0 YAML→Pi native agent YAML (tools→CSV, model:inherit removed, skill: remapped). runRulesync calls generate() from the rulesync npm package (not CLI) with outputRoots=[global?os.homedir():process.cwd()] — MANDATORY (ADR-010). Add dependency @gobing-ai/ts-ai-runner@^0.3.19 (not yet present, not workspace:*). For supported targets generate() writes directly; only hermes/omp are copied by superskill.


### Q&A



### Design


**ADR-010 — `outputRoots` is mandatory.** rulesync writes to `<outputRoot>/<relativeDirPath>` and never resolves `~`; the `global` flag only swaps the relative subdir. `runRulesync` must set `outputRoots: [global ? os.homedir() : process.cwd()]`. Omitting it sends "global" installs to cwd. Verified rulesync@8.28.1: `Config.getOutputRoots()` defaults to `process.cwd()`; zero `os.homedir()` in src; `PiSkill` global → `.pi/agent/skills`, `AntigravitySharedSkill` global → `.gemini/<subdir>/skills`.

**Add dependency**: `@gobing-ai/ts-ai-runner@^0.3.19` to `apps/cli/package.json` (NOT yet present; NOT `workspace:*` — it's a sibling repo consumed via registry/`bun link`). `rulesync@^8.28.1` already present.

`translateSlashCommand` takes an `AgentName`, not a `Target` — pass `TARGET_TO_AGENT_NAME[target]` (F001). Slash rules verified: Codex `$plugin-command`, Pi `/skill:plugin-command`, others `/plugin-command`.

For rulesync-supported targets, `generate()` does the write — no copy step. Only `hermes`/`omp` (absent from `ToolTarget`) are copied afterward.


### Solution



### Plan



### Review



### Testing



### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References


