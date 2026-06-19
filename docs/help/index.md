# superskill — Help

**superskill** is a CLI for distributing and authoring agent-facing content (skills, slash commands, subagents, hooks, main-agent configs) across multiple coding-agent platforms from a single Claude Code plugin source of truth.

## What it does

Two layers:

1. **Distribution** — `superskill install` takes a Claude Code plugin and distributes its skills, commands, subagents, hooks, and MCP config to any supported target agent (Claude Code, Codex, Pi, omp, OpenCode, Antigravity, Hermes).
2. **Authoring + quality** — Five type commands (`agent`, `skill`, `command`, `hook`, `magent`) provide scaffold → validate → evaluate → refine → evolve workflows with persistent quality history in SQLite.

## Documentation map

| Document | Covers |
|----------|--------|
| [Installation](installation.md) | Prerequisites, install methods, binary on PATH |
| [Quick start](quick_start.md) | Get a plugin installed + author your first skill in 5 minutes |
| [`install` command](cmd_install.md) | Distribute a plugin to target agents |
| [`agent` command](cmd_agent.md) | Manage subagent definitions |
| [`skill` command](cmd_skill.md) | Manage skill definitions (includes `package`, `migrate`) |
| [`command` command](cmd_command.md) | Manage slash command definitions |
| [`hook` command](cmd_hook.md) | Manage hook definitions (includes `emit`) |
| [`magent` command](cmd_magent.md) | Manage main-agent configurations |

## Command overview

```
superskill
├── install <plugin>          # distribute a plugin to target agents
├── agent <op> <name>         # subagent definitions
├── skill <op> <name>         # skill definitions
├── command <op> <name>       # slash command definitions
├── hook <op> <name>          # hook definitions
└── magent <op> <name>        # main-agent configs
```

The five type commands (`agent`, `skill`, `command`, `hook`, `magent`) share a common five-operation lifecycle:

```mermaid
flowchart LR
    S[scaffold] --> V[validate]
    V --> E[evaluate]
    E --> R[refine]
    R --> EV[evolve]
    EV -.->|longitudinal| E
```

- **scaffold** — create a new file from a type-specific template
- **validate** — structural + schema + format-compliance checks
- **evaluate** — score across type-specific quality dimensions (heuristic or rubric)
- **refine** — auto-fix low-risk findings, suggest the rest
- **evolve** — propose longitudinal improvements from evaluation history through a double-loop gate

Each operation is detailed in its command page, including usage, options, implementation architecture, and sequence diagrams.

## Supported targets

| Target | Engine | Output location |
|--------|--------|-----------------|
| `claude` | Direct `claude plugin install` | Claude Code marketplace |
| `codex` | rulesync | `~/.agents/skills/` |
| `pi` | rulesync + superskill hooks | Pi native format |
| `omp` | superskill copy (via `pi` surrogate) | `~/.omp/agent/skills/` |
| `opencode` | rulesync | `~/.agents/skills/` |
| `antigravity-cli` | rulesync | `~/.gemini/antigravity-cli/skills/` |
| `antigravity-ide` | rulesync | `~/.gemini/config/skills/` |
| `hermes` | superscript copy (via `opencode` surrogate) | `~/.hermes/skills/` |

## Further reading

The authoritative project docs live in [`docs/`](../):

- [`00_ADR.md`](../00_ADR.md) — architecture decisions (binding)
- [`01_PRD.md`](../01_PRD.md) — product scope
- [`03_ARCHITECTURE.md`](../03_ARCHITECTURE.md) — module boundaries and data flow
- [`04_DESIGN.md`](../04_DESIGN.md) — CLI surface, flags, schemas
