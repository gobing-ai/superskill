# superskill

Multi-agent skill, command, subagent, magent, hook, and MCP config distribution and authoring CLI. Install a Claude Code plugin to any coding agent, and create / validate / evaluate / refine / evolve agent-facing content from the command line.

## Install

```bash
npm i -g @gobing-ai/superskill

# or go with bun
bun add -g @gobing-ai/superskill
```

No clone, no checkout, no extra flags. The published package bundles the `cc`
plugin and the `team-stark-children` main-agent config, and the CLI locates them
at runtime, so install works from any directory:

```bash
superskill install cc --magent team-stark-children
```

That distributes `cc` (skills, commands, subagents, hooks, rules) to every
configured target and emits the `team-stark-children` magent. Want only the
plugin, or only specific agents? `superskill install cc` (no `--magent`) and
`superskill install cc --targets codex,pi` work too. See
[cmd_install.md](docs/help/cmd_install.md) for the full surface, including
installing from a GitHub marketplace (`--marketplace gobing-ai/superskill`).
For native Claude Code marketplace installation (`claude plugin install cc@superskill`), see the [Native cc Marketplace Pilot](docs/help/native_cc_marketplace_pilot.md).

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
# Install the bundled cc plugin to every supported target
superskill install cc --targets all

# Install cc plus the team-stark-children main-agent config
superskill install cc --magent team-stark-children

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
| ------- | :------: | :--------: | :---------: | :-----: |
| Claude Code | ✓ | ✓ | ✓ | ✓ |
| Grok | ✓ | ✓ | ✓ | ✓ |
| Codex | ✓ | ✓ | ✓ | ✓ |
| Pi | ✓ | ✓ | ✓ | ✓ |
| omp | ✓ | ✓ | ✓ | ✓ |
| OpenCode | ✓ | ✓ | ✓ | ✓ |
| Antigravity IDE | ✓ | ✓ | — | ✓ |
| Antigravity CLI | ✓ | ✓ | — | ✓ |
| Hermes | ✓ | ✓ | — | ✓ |
| Grok Bot (opt-in) ⁶ | ✓ | — | — | — |

Both Antigravity targets get skills, commands, and hooks from rulesync
(`codexcli`/`antigravity-cli`/`antigravity-ide` adapters); subagents are not part of the
rulesync→antigravity map, so they don't ship there. `omp`, Grok, and Claude Code
install plugins natively (no rulesync pass); the remaining targets route through
rulesync's per-target generators. Hermes copies skills/commands from OpenCode's
rulesync output and adds a canonical `hooks.json` copy at `~/.hermes/hooks.json`.

Pi loads extensions natively from a plugin's `plugin.json` `extensions.pi` array (v0.3.12+),
installing them to `.pi/agent/plugins/<plugin>/` with generated `package.json` and
`settings.json` registration — no `@vahor/pi-hooks` dependency required. Plugins without
`extensions.pi` fall back to the `@vahor/pi-hooks` hook-emit path.

Grok loads the Claude-format plugin natively — slash form is `/plugin:command`
(e.g. `/cc:skill-add`). Codex/Pi-installed skills under `~/.agents/` may also
appear in Grok as `/plugin-command` (hyphen form) when Grok discovers the shared
skills root; prefer the colon form for plugin commands.

⁶ **Grok Bot** (Grok chat on its own VPS/Sand host) is an opt-in, install-only target
(`--targets grok-bot`, excluded from `all`; ADR-036). It publishes the flat skill catalog to the
Sand `workflows/` directory (bridge by default: thin pointers to a private canonical copy under
`<sandRoot>/.superskill/grok-bot/skills/`; `--materialize full` for everything under `workflows/`).
Slash form is `/plugin-skill-name`; commands/subagents install as skills/playbooks, hooks/MCP are
not installed. Every install/update also prepares a deterministic registration handoff at
`<sandRoot>/.superskill/grok-bot/register/<plugin>.json` (task 0130) — slash registration is
NOT automatic: have the host agent consume the handoff with a verified host method, then enable
the plugin per Bot under Settings > Plugins > Yours. First use with an empty slash picker: ask a
Bot to read and follow `<sandRoot>/workflows/cc-grok-bot-register/SKILL.md` (bundled cc recovery
skill, task 0132) — or, when cc is absent, the handoff file directly; bridge's hidden `.superskill`
recipes may need the Bot's authorized Shell tool if Read denies them. Run `superskill doctor --targets grok-bot`
for a filesystem health check (it reports slash-registry status as unknown with next steps).

See [entity locations](docs/help/entity_locations.md) for the exact install directories per agent.

> Agents that don't natively support some entity types still get them. `superskill install` adapts commands and subagents as Skills 2.0 skill directories for targets that lack them — so every agent receives the full plugin surface, regardless of native feature set.

## Commands

| Command | What it does | Docs |
| --------- | ------------- | ------ |
| `install` | Distribute a plugin's skills, commands, subagents, magents, hooks, and MCP config to target agents | [cmd_install.md](docs/help/cmd_install.md) |
| `agent` | Manage subagent definitions (scaffold / validate / evaluate / refine / evolve) | [cmd_agent.md](docs/help/cmd_agent.md) |
| `skill` | Manage skill definitions (lifecycle + `package`, `migrate`) | [cmd_skill.md](docs/help/cmd_skill.md) |
| `command` | Manage slash command definitions | [cmd_command.md](docs/help/cmd_command.md) |
| `hook` | Manage hook definitions (+ `emit`, `run`) | [cmd_hook.md](docs/help/cmd_hook.md) |
| `magent` | Manage main-agent configurations | [cmd_magent.md](docs/help/cmd_magent.md) |
| `script` | Run / resolve / build portable twins for plugin scripts (`run`, `path`, `convert`) | [how to organize](docs/help/how_to_organize_scripts_for_plugin_development.md) |
| `doctor` | Read-only health check for the `grok-bot` Sand target (`--targets grok-bot [--json]`) | [entity locations](docs/help/entity_locations.md) |

The five type commands share a common lifecycle: **scaffold → validate → evaluate → refine → evolve**, with type-specific quality dimensions and rubrics.

## Further reading

| Topic | Document |
| ------- | ---------- |
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
