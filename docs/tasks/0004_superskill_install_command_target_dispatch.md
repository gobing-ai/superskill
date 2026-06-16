---
name: superskill install command + target dispatch
description: superskill install command + target dispatch
status: Backlog
created_at: 2026-06-16T05:43:22.692Z
updated_at: 2026-06-16T05:43:22.692Z
folder: docs/tasks
type: task
feature-id: F004
priority: high
estimated_hours: 3
dependencies: ["0001","0002","0003","0006"]
tags: ["install","command","dispatch","claude-code"]
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0004. superskill install command + target dispatch

### Background

The primary deliverable of Phase 1. Wires mapper→pipeline→rulesync→target dispatch into a single Commander subcommand. Replaces setup-all.sh and four delegate bash scripts.


### Requirements


superskill install <plugin> --marketplace <path> --targets <list> --global --dry-run --verbose. Register `install` in cli.ts and remove the scaffold `add` command. Resolve plugin via resolvePlugin (F006/ADR-011): --marketplace → CWD .claude-plugin/marketplace.json → plugins/<name>/ fallback; validate plugin.json; reject remote (github/url/npm) sources and ../-escapes with distinct exit-1 messages; "not found" lists resolvable plugins (not hardcoded rd3, wt). Flow: resolve (F006) → mapper (F002) → pipeline (F003) → runRulesync with outputRoots set (F003/ADR-010) → dispatch only targets rulesync can't write: claude (`claude plugin install <name>@local --path <pluginRoot>`), hermes (~/.hermes/skills/), omp (~/.omp/agent/skills/). rulesync owns every supported target's path. --dry-run previews; idempotent; errors → exit 1.


### Q&A



### Design


Register `install` in `cli.ts` and **remove the scaffold `add` demo command**. Flow: resolve plugin → `mapPluginToRulesync` (F002) → ConversionPipeline (F003) → `runRulesync` with `outputRoots` set (F003/ADR-010) → dispatch only the targets rulesync can't write.

**rulesync owns paths (ADR-010).** With `outputRoots=[~]` for `--global`, `generate()` writes every supported target to its resolved path (Pi → `~/.pi/agent/skills`, Codex → `~/.agents/skills` under `$CODEX_HOME`, antigravity-cli → `~/.gemini/antigravity-cli/skills`, antigravity-ide → `~/.gemini/config/skills`). superskill does **not** reimplement these paths. The "not found" error lists resolvable plugins (config + `plugins/*`), not a hardcoded `rd3, wt`.

**superskill-owned dispatch** (only these): `claude` → `claude plugin install <name>@local --path plugins/<name>`; `hermes` → `~/.hermes/skills/`; `omp` → `~/.omp/agent/skills/` (copy generated Pi output).


### Solution



### Plan



### Review



### Testing



### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References


