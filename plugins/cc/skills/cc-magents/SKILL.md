---
name: cc-magents
description: "Create, validate, evaluate, refine, and evolve main agent customization files across coding-agent platforms using a capability-aware model."
license: Apache-2.0
metadata:
  author: cc-agents
  version: "5.0.0"
  platforms: "agents-md,codex,claude-code,gemini-cli,opencode,cursor,copilot,windsurf,cline,zed,amp,aider,openclaw,antigravity,pi"
---

# cc-magents

`cc-magents` manages **main agent customization**, not subagents. It handles
files such as `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.cursor/rules/*.mdc`,
`.github/copilot-instructions.md`, `.windsurf/rules/*.md`,
`.clinerules/*.md`, `.rules`, `.aider.conf.yml`, `opencode.json`, and
OpenClaw workspace files.

## When to Use

Use this skill when the task involves main-agent configuration files:

- Trigger phrases: "create AGENTS.md", "add CLAUDE.md", "evaluate this agent config",
  "refine AGENTS.md", "validate .cursor/rules", "score my main agent file"
- File patterns: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.cursorrules`,
  `.cursor/rules/*.mdc`, `.github/copilot-instructions.md`, `.windsurf/rules/*.md`,
  `.clinerules/*.md`, `.rules`, `.aider.conf.yml`, `opencode.json`
- Operations: synthesize, validate, evaluate, refine, or evolve main-agent
  configurations across coding-agent platforms

Do NOT use for subagent definitions (use `cc:cc-agents`), slash commands
(`cc:cc-commands`), skills (`cc:cc-skills`), or hooks (`cc:cc-hooks`).

## Core Principle

Main-agent support is capability-based. Each platform declares:

- native files and locations
- discovery and precedence
- import/modularity support
- rule activation and scoping
- known limits
- supported operations
- source confidence and verification evidence

## Operations

| Operation | Command | Purpose |
| --- | --- | --- |
| add / synthesize | `superskill magent scaffold <name>` | Create new platform-native config from a template |
| validate | `superskill magent validate <nameOrPath>` | Validate document and registry structure |
| evaluate | `superskill magent evaluate <nameOrPath>` | Score quality across capability-aware dimensions |
| refine | `superskill magent refine <nameOrPath>` | Recommend native splits, scoping, safety, and evidence improvements |
| evolve | `superskill magent evolve <name>` | Propose registry and fixture improvements |

## Quick Start

```bash
# Create a new platform-native config from a template
superskill magent scaffold general-agent --output AGENTS.md

# Score quality and persist the result
superskill magent evaluate AGENTS.md --save

# Preview and apply refinements non-interactively
superskill magent refine AGENTS.md --auto --save

# Propose registry/fixture improvements
superskill magent evolve AGENTS.md --propose-only
```

JSON output is supported on every command via `--json` for automation.

## Workflows

| Workflow | Steps | Handler |
| --- | --- | --- |
| **Add** | template selection -> scaffold -> validate -> evaluate | `superskill magent scaffold` -> `superskill magent validate` -> `superskill magent evaluate` |
| **Validate** | parse -> registry check -> structural lint | `superskill magent validate` |
| **Evaluate** | capability-aware scoring across dimensions | `superskill magent evaluate` |
| **Refine** | auto-suggest -> review -> persist | `superskill magent refine --auto --save` |
| **Evolve** | longitudinal analysis -> proposal -> accept | `superskill magent evolve --propose-only` -> `superskill magent evolve --accept <id>` |

Branching:
- IF validate fails -> stop and surface registry/parse errors
- IF evaluate score below threshold -> route to `refine`

See [references/workflows.md](references/workflows.md) for full step tables and
[references/platform-compatibility.md](references/platform-compatibility.md) for the platform capability matrix.

## Source Material

The current platform research source is `docs/main_agents.md`, verified on
2026-04-30. Provisional platforms such as Antigravity and Pi must remain marked
as low confidence until official docs or reproducible product tests exist.

## Additional Resources

- [references/workflows.md](references/workflows.md) - Detailed operation workflows
- [references/platform-compatibility.md](references/platform-compatibility.md) - Per-platform capability matrix
