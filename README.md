# superskill

Multi-agent skill, command, subagent, hook, and MCP config distribution and authoring CLI — install a Claude Code plugin to any coding agent, and create/validate/evaluate/refine/evolve agent-facing content from the command line.

## Why

Coding agents (Claude Code, Codex, Pi, OpenCode, Antigravity, Hermes, …) each use different config formats for skills, slash commands, subagents, hooks, and MCP servers. Maintaining hand-synced copies across agents is error-prone and doesn't scale.

**superskill** solves this with two layers:

1. **Distribution** — `superskill install` takes a Claude Code plugin as the single source of truth and distributes it to any target agent, using [rulesync](https://www.npmjs.com/package/rulesync) as the format-conversion engine.
2. **Authoring + quality** — Five type commands (`agent`, `skill`, `command`, `hook`, `magent`) provide scaffold → validate → evaluate → refine → evolve workflows with persistent quality data in SQLite.

## Install

```bash
npm i -g @gobing-ai/superskill
```

From source (contributors):

```bash
bun install
bun run build
cd apps/cli && bun link
```

Requires [Bun](https://bun.sh/) ≥ 1.3.14. See [`docs/help/installation.md`](docs/help/installation.md) for details and troubleshooting.

## Quick start

```bash
# Distribute a plugin to every supported target
superskill install my-plugin --targets all

# Author a skill: scaffold → validate → evaluate → refine
superskill skill scaffold my-skill --description "Deploy a Cloudflare Worker"
superskill skill validate my-skill
superskill skill evaluate my-skill --save
superskill skill refine my-skill --auto
```

Full walkthrough: [`docs/help/quick_start.md`](docs/help/quick_start.md).

## Commands

| Command | What it does | Docs |
|---------|--------------|------|
| `install` | Distribute a plugin's skills, commands, subagents, hooks, MCP to target agents | [`cmd_install.md`](docs/help/cmd_install.md) |
| `agent` | Manage subagent definitions (scaffold/validate/evaluate/refine/evolve) | [`cmd_agent.md`](docs/help/cmd_agent.md) |
| `skill` | Manage skill definitions (+ `package`, `migrate`) | [`cmd_skill.md`](docs/help/cmd_skill.md) |
| `command` | Manage slash command definitions | [`cmd_command.md`](docs/help/cmd_command.md) |
| `hook` | Manage hook definitions (+ `emit`) | [`cmd_hook.md`](docs/help/cmd_hook.md) |
| `magent` | Manage main-agent configurations | [`cmd_magent.md`](docs/help/cmd_magent.md) |

The five type commands share a common five-operation lifecycle (scaffold → validate → evaluate → refine → evolve) with type-specific quality dimensions and rubrics. Each command doc includes usage, architecture diagrams, sequence diagrams, and source-file references.

**Help docs index:** [`docs/help/index.md`](docs/help/index.md)

## Supported targets

| Target | Engine | Output location |
|--------|--------|-----------------|
| `claude` | Direct `claude plugin install` | Claude Code marketplace |
| `codex` | rulesync | `~/.agents/skills/` |
| `pi` | rulesync + superskill hook shim | Pi native format |
| `omp` | superskill copy (via `pi` surrogate) | `~/.omp/agent/skills/` |
| `opencode` | rulesync | `~/.agents/skills/` |
| `antigravity-cli` | rulesync | `~/.gemini/antigravity-cli/skills/` |
| `antigravity-ide` | rulesync | `~/.gemini/config/skills/` |
| `hermes` | superskill copy (via `opencode` surrogate) | `~/.hermes/skills/` |

## Development

### Stack

| Concern | Tool |
|---------|------|
| Runtime / package manager | Bun 1.3.14 |
| Language | TypeScript 5.x |
| CLI framework | Commander.js |
| Lint + format | Biome 2.4.16 |
| Test runner | `bun:test` |
| Format conversion | rulesync (npm) |
| Quality store | SQLite via `@gobing-ai/ts-db` |
| Git hooks | Lefthook |
| Conventional commits | cocogitto (`cog`) |
| Tool versions | proto (`.prototools`) |

### Commands

```bash
bun run lint       # biome check + typecheck
bun run format     # biome check --write (autofix)
bun run autofix    # format then typecheck
bun run test       # bun test with coverage
bun run build      # compile to standalone binary
bun run dev        # watch mode
bun run check      # lint + test (CI gate)
```

### Verification gate

All must pass before a change is considered done:

1. `bun run lint` — Biome and typecheck clean.
2. `bun run test` — all tests pass, no `.skip` or commented-out tests. Coverage ≥ 90% lines + functions.
3. `bun run build` — standalone binary compiles.
4. `git status` — only intentional changes.
5. `bun run autofix && bun run spur-check` - comprehensive check

### Code style

Enforced by [biome.json](biome.json): 4-space indent, 120-char width, single quotes, semicolons, trailing commas. `interface` for object shapes, `type` for unions. `any` is an error. Workspace imports use `@<scope>/*` aliases.

### Commits

[Conventional Commits](https://www.conventionalcommits.org/) enforced by cocogitto: `feat:`, `fix:`, `docs:`, `chore:`, etc.

## Documentation

**Help docs** (usage + implementation diagrams): [`docs/help/`](docs/help/index.md)

**Authoritative project docs:**

| Doc | Covers |
|-----|--------|
| [00_ADR](docs/00_ADR.md) | Architecture decisions (authoritative) |
| [01_PRD](docs/01_PRD.md) | Product scope (authoritative) |
| [02_ROADMAP](docs/02_ROADMAP.md) | Phase sequencing |
| [03_ARCHITECTURE](docs/03_ARCHITECTURE.md) | Module boundaries, data flow, invariants |
| [04_DESIGN](docs/04_DESIGN.md) | CLI surface — commands, flags, schemas |
| [05_FEATURES](docs/05_FEATURES.md) | Feature status tracker |
| [99_PROJECT_CONSTITUTION](docs/99_PROJECT_CONSTITUTION.md) | Process rules for maintaining docs |

## License

[Apache 2.0](LICENSE)
