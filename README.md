# superskill

Multi-agent skill, command, subagent, hook, and MCP config distribution and authoring CLI — install a Claude Code plugin to any coding agent, and create/validate/evaluate/refine/evolve agent-facing content from the command line.

## Why

Coding agents (Claude Code, Codex, Pi, OpenCode, Antigravity, Hermes, …) each use different config formats for skills, slash commands, subagents, hooks, and MCP servers. Maintaining hand-synced copies across agents is error-prone and doesn't scale.

**superskill** solves this with two layers:

1. **Distribution** — `superskill install` takes a Claude Code plugin as the single source of truth and distributes it to any target agent, using [rulesync](https://www.npmjs.com/package/rulesync) as the format-conversion engine.
2. **Authoring + quality** — Five type commands (`agent`, `skill`, `command`, `hook`, `magent`) provide scaffold → validate → evaluate → refine → evolve workflows with persistent quality data.

## Supported targets

| Target | Engine | Notes |
|--------|--------|-------|
| `claude` | Direct marketplace install | Source of truth |
| `codex` | rulesync | `~/.agents/skills/` |
| `pi` | rulesync | Subagents → Pi native agent format |
| `omp` | superskill (copy) | Pi variant with custom root and binary (uses `pi` rulesync surrogate) |
| `opencode` | rulesync | `~/.agents/skills/` |
| `antigravity-cli` | rulesync | `~/.gemini/antigravity-cli/skills/` |
| `antigravity-ide` | rulesync | `~/.gemini/config/skills/` |
| `hermes` | superskill (copy) | `~/.hermes/skills/` (uses `opencode` rulesync surrogate) |

**Deprecated:** Gemini CLI, old unified Antigravity.

## Quick start

### Prerequisites

- [Bun](https://bun.sh/) ≥ 1.3.14
- [proto](https://moonrepo.dev/proto) (optional — pinned versions in `.prototools`)

```bash
# Install pinned tool versions (optional)
proto use

# Install dependencies
bun install
```

### Run the CLI (development)

```bash
# Via workspace filter
bun run dev

# Or directly
bun run apps/cli/src/index.ts --help
```

### Build a standalone binary

```bash
bun run build
# Output: dist/cli/superskill
```

## Commands

### `superskill install` — distribute a plugin to target agents

Install a Claude Code plugin's skills, commands, subagents, hooks, and MCP config to target coding agents.

```
superskill install [options] <plugin>
```

| Argument / Option | Description | Default |
|-------------------|-------------|---------|
| `<plugin>` | Plugin name to install (required) | — |
| `--marketplace <path>` | Path to `.claude-plugin/marketplace.json` or its containing directory | CWD's `.claude-plugin/` |
| `--targets <list>` | Comma-separated target agents, or `all` | all configured |
| `--no-global` | Install to project-level instead of user-level global directories | `false` |
| `--dry-run` | Preview without writing files | `false` |
| `--verbose` | Print each step and file copy | `false` |

**Examples:**

```bash
# Install a plugin to all supported targets
superskill install rd3 --targets all

# Install to specific targets only
superskill install rd3 --targets codex,pi,antigravity-cli

# Preview what would be written without touching the filesystem
superskill install rd3 --targets all --dry-run
```

---

### Type Commands — `agent`, `skill`, `command`, `hook`, `magent`

Five type commands manage agent-facing resources:

| Command | Description |
|---------|-------------|
| `superskill agent` | Manage subagent definitions |
| `superskill skill` | Manage skill definitions |
| `superskill command` | Manage slash command definitions |
| `superskill hook` | Manage hook definitions |
| `superskill magent` | Manage main-agent configurations |

Each type command supports the following five operations:

#### 1. `scaffold` — Create a new file from templates
```bash
superskill <type> scaffold <name> [options]
```
* **Options:**
  * `--description <text>`: Set description frontmatter.
  * `--target <agent>`: Target agent format.
  * `--output <dir>`: Target directory for the output file.
  * `--force`: Overwrite existing files.

#### 2. `validate` — Run schema and compliance check
```bash
superskill <type> validate <nameOrPath> [options]
```
* **Options:**
  * `--target <agent>`: Target agent to validate format compliance.
  * `--strict`: Enable optional/warning-level checks.
  * `--json`: Output findings in JSON format.

#### 3. `evaluate` — Score content against 5 quality dimensions
```bash
superskill <type> evaluate <nameOrPath> [options]
```
* **Options:**
  * `--target <agent>`: Target agent formatting rules.
  * `--save`: Save report to SQLite database.
  * `--json`: Output report in JSON format.

#### 4. `refine` — Run automated fixes and suggestions
```bash
superskill <type> refine <nameOrPath> [options]
```
* **Options:**
  * `--target <agent>`: Target agent formatting rules.
  * `--auto`: Apply automatic fixes without confirmation.
  * `--save`: Save post-remediation report to SQLite database.

#### 5. `evolve` — Apply longitudinal improvements from evaluation history
```bash
superskill <type> evolve <name> [options]
```
* **Options:**
  * `--target <agent>`: Target agent formatting rules.
  * `--from <timestamp>`: Baseline evaluation window.
  * `--proposeOnly`: Propose modifications and save as draft without applying.
  * `--accept <proposal_id>`: Accept and apply a specific draft proposal.
  * `--reject <proposal_id>`: Reject a specific draft proposal.

---

## Project structure

```
apps/
  cli/                 # Commander-based CLI (the binary)
    src/
      commands/        # CLI command registration (install, type commands)
      pipeline/        # Conversion stages (pure functions)
      content/         # Frontmatter parse/edit, name resolution
      operations/      # scaffold, validate, evaluate, refine, evolve logic
      quality/         # Dimension definitions + per-type evaluators
      store/           # SQLite via @gobing-ai/ts-db
      templates/       # Default templates shipped with npm
      targets.ts       # Target enum + mapping tables
      config.ts        # superskill.jsonc schema + loader
      marketplace.ts   # Marketplace manifest parser + resolver
      mapper.ts        # Plugin → .rulesync/ canonical layout
      rulesync.ts      # Thin wrapper around rulesync.generate()
      cli.ts           # Commander program setup
      index.ts         # Entry point
    tests/             # bun:test suites
packages/              # Shared workspace packages (Bun workspaces)
tooling/
  typescript/          # Shared tsconfig presets
docs/                  # Authoritative project documentation (00–05, 99)
vendors/               # Reference-only vendored source (do not modify)
```

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

### Code style

Enforced by [biome.json](biome.json):

- 4-space indent, 120-char line width
- Single quotes, semicolons always, trailing commas everywhere
- `interface` for object shapes, `type` for unions/intersections
- `any` is an error — narrow the type or justify with `// biome-ignore`
- Workspace imports use `@<scope>/*` aliases, never deep relative paths

### Commits

[Conventional Commits](https://www.conventionalcommits.org/) enforced by cocogitto: `feat:`, `fix:`, `docs:`, `chore:`, etc.

## Documentation

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

