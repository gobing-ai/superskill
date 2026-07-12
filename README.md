# superskill

Multi-agent skill, command, subagent, hook, and MCP config distribution and authoring CLI. Install a Claude Code plugin to any coding agent, and create / validate / evaluate / refine / evolve agent-facing content from the command line.

## Install

```bash
npm i -g @gobing-ai/superskill

# or go with bun
bun add -g @gobing-ai/superskill
```

From source (contributors):

```bash
proto use          # install pinned tool versions (Bun, etc.)
bun install
bun run build
cd apps/cli && bun link
```

Requires [Bun](https://bun.sh/) ≥ 1.3.14. See [Installation guide](docs/help/installation.md) for details and troubleshooting.

## Quick start

```bash
# Distribute a plugin cc in current repo to every supported target
superskill install cc --targets all

# Author a skill: scaffold → validate → evaluate → refine
superskill skill scaffold my-skill --description "Deploy a Cloudflare Worker"
superskill skill validate my-skill
superskill skill evaluate my-skill --save
superskill skill refine my-skill --auto

# Package a skill for distribution, or merge skills
superskill skill package my-skill
superskill skill migrate ./source-skill-1 ./source-skill-2 ./dest-skill

# Emit a hook to a single target agent
superskill hook emit my-hook --target pi
```

Full walkthrough: [Quick start guide](docs/help/quick_start.md).

## Supported agents

| Agent | Skills | Commands | Subagents | Hooks |
|-------|:------:|:--------:|:---------:|:-----:|
| Claude Code | ✓ | ✓ | ✓ | ✓ |
| Grok Build | ✓ | ✓ | ✓ | ✓ |
| Codex | ✓ | ✓ | ✓ | — |
| Pi | ✓ | ✓ | ✓ | — |
| omp | ✓ | ✓ | ✓ | — |
| OpenCode | ✓ | ✓ | ✓ | — |
| Antigravity IDE | ✓ | ✓ | — | — |
| Antigravity CLI | ✓ | — | — | — |
| Hermes | ✓ | ✓ | — | ✓ |
| OpenClaw | ✓ | — | — | — |

Grok installs the **native Claude-format plugin** (`--targets grok`): slash form is `/plugin:command` (e.g. `/sp:dev-idea`). Adapted skills under `~/.agents` (from Codex/Pi installs) may still appear as `/plugin-command` in Grok — prefer the colon form for plugin commands.

See [entity locations](docs/help/entity_locations.md) for the exact install directories per agent.

> Agents that don't natively support some entity types still get them. `superskill install` adapts commands and subagents as Skills 2.0 skill directories for targets that lack them — so every agent receives the full plugin surface, regardless of native feature set.

## Commands

| Command | What it does | Docs |
|---------|-------------|------|
| `install` | Distribute a plugin's skills, commands, subagents, hooks, MCP to target agents | [cmd_install.md](docs/help/cmd_install.md) |
| `agent` | Manage subagent definitions (scaffold / validate / evaluate / refine / evolve) | [cmd_agent.md](docs/help/cmd_agent.md) |
| `skill` | Manage skill definitions (+ `package`, `migrate`) | [cmd_skill.md](docs/help/cmd_skill.md) |
| `command` | Manage slash command definitions | [cmd_command.md](docs/help/cmd_command.md) |
| `hook` | Manage hook definitions (+ `emit`) | [cmd_hook.md](docs/help/cmd_hook.md) |
| `magent` | Manage main-agent configurations | [cmd_magent.md](docs/help/cmd_magent.md) |

The five type commands share a common lifecycle: **scaffold → validate → evaluate → refine → evolve**, with type-specific quality dimensions and rubrics.

## Further reading

| Topic | Document |
|-------|----------|
| Full help index | [docs/help/index.md](docs/help/index.md) |
| Quality system (rubrics, scoring, evolve gate) | [docs/help/quality_system.md](docs/help/quality_system.md) |
| Entity locations per target agent | [docs/help/entity_locations.md](docs/help/entity_locations.md) |
| Bundled `cc` plugin | [docs/help/bundled_plugin.md](docs/help/bundled_plugin.md) |
| Development guide (stack, build, tests) | [docs/help/development.md](docs/help/development.md) |
| Architecture decisions (authoritative) | [docs/00_ADR.md](docs/00_ADR.md) |
| Product scope | [docs/01_PRD.md](docs/01_PRD.md) |
| CLI surface reference | [docs/04_DESIGN.md](docs/04_DESIGN.md) |

## License

[Apache 2.0](LICENSE)
