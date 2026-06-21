# superskill

Multi-agent skill, command, subagent, hook, and MCP config distribution and authoring CLI — install a Claude Code plugin to any coding agent, and create/validate/evaluate/refine/evolve agent-facing content from the command line.

## Why

Coding agents (Claude Code, Codex, Pi, OpenCode, Antigravity, Hermes, omp) each use different config formats for skills, slash commands, subagents, hooks, and MCP servers. Maintaining hand-synced copies across agents is error-prone and doesn't scale.

**superskill** solves this with two layers:

1. **Distribution** — `superskill install` takes a Claude Code plugin as the single source of truth and distributes it to any target agent, using [rulesync](https://www.npmjs.com/package/rulesync) as the format-conversion engine.
2. **Authoring + quality** — Five type commands (`agent`, `skill`, `command`, `hook`, `magent`) provide scaffold → validate → evaluate → refine → evolve workflows with persistent quality data in SQLite.

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

# Package a skill for distribution, or merge skills
superskill skill package my-skill
superskill skill migrate ./source-skill-1 ./source-skill-2 ./dest-skill

# Emit a hook to a single target agent
superskill hook emit my-hook --target pi
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

### Operation lifecycle

```
scaffold → validate → evaluate → refine → evolve
                ↑                       │
                └─── longitudinal ───────┘
```

| Operation | Purpose | Quality gate |
|-----------|---------|-------------|
| `scaffold` | Create new entity from template | Structure validation |
| `validate` | Check structure and frontmatter | Pre-check spur rules |
| `evaluate` | Score quality across dimensions | Rubric-weighted scoring (Scorer persona) |
| `refine` | Apply low-risk fixes automatically | Fix classification (auto-apply / suggest / flag) |
| `evolve` | Propose longitudinal improvements | Double-loop gate (Author → Skeptic → Judge) |

Extra operations by type:

| Type | Extra operation | What it does |
|------|----------------|-------------|
| `skill` | `package` | Bundle a skill + companion files into a distributable archive |
| `skill` | `migrate` | Merge one or more source skills into a destination skill |
| `hook` | `emit` | Emit a hook definition to a single target agent |

## Quality system

### Rubric-driven evaluation

`evaluate` scores entities across type-specific quality dimensions using YAML rubrics. Ships with 5 package-default rubrics (`agent`, `skill`, `command`, `hook`, `magent`) — load custom ones with `--rubric <path>`.

```bash
# Heuristic evaluation (built-in checks)
superskill skill evaluate my-skill --save

# Rubric evaluation — emit scoring brief for an external model
superskill skill evaluate my-skill --rubric --json > scoring-brief.json

# Ingest scored result and persist
superskill skill evaluate my-skill --ingest scored-result.json --save
```

### Two-call seam (Scorer / Author / Skeptic / Judge)

The CLI never scores or generates inline. Quality operations drive four personas via a two-call seam — the CLI emits envelopes, personas process offline, the CLI ingests results.

| Persona | Role | Input | Output |
|---------|------|-------|--------|
| **Scorer** | Rubric judge | Envelope from `evaluate --rubric --json` | `{ rubric_version, dimensions: { score, note } }` |
| **Author** | Rewriter | Envelope from `evolve --propose-only --json` | `ProposedChange[]` with `anchor_hash` |
| **Skeptic** | Refuter | Proposal + verbatim goal anchor | `{ ok, violations[] }` |
| **Judge** | Tournament selector | Multiple candidate proposals | Winning proposal ID |

### Double-loop gate for `evolve`

`evolve --ingest <file>` applies authored proposals through a four-gate quality control:

1. **Deterministic validate** — 0 errors required
2. **Δ-margin** — score must improve by ≥ `--margin` (default 0.05)
3. **Anchor hash** — goal anchor unchanged (hash-gated)
4. **Skeptic review** — regressive merges rejected and restored

Version-aware trends partition by `rubric_version`, preventing false regression signals when rubrics are updated.

## Proper Location for Coding Agents

Each coding agent stores skills, slash commands, subagents, and hooks in different directories. This table is the single source of truth for where `superskill install` writes each entity type per target — verified against each agent's source code (`vendors/`).

### Entity locations by agent (global / user-level)

| Agent | Skills | Slash Commands | Subagents | Hooks |
|-------|--------|---------------|-----------|-------|
| **Claude Code** | `~/.claude/plugins/<name>/skills/` | `~/.claude/plugins/<name>/commands/` | `~/.claude/plugins/<name>/agents/` | `~/.claude/plugins/<name>/hooks/hooks.json` |
| **Codex** | `~/.agents/skills/` | `~/.codex/prompts/` | `~/.codex/agents/` | — |
| **Pi** | `~/.pi/agent/skills/` | `~/.pi/agent/prompts/` | `~/.pi/agent/agents/`¹ | extensions² |
| **omp** | `~/.omp/agent/skills/` | `~/.omp/agent/commands/` | `~/.omp/agent/agents/`¹ | extensions² / `.omp/hooks/pre\|post/*.ts` |
| **OpenCode** | `~/.opencode/skills/` | `~/.config/opencode/commands/` | `~/.config/opencode/agents/` | — |
| **Antigravity IDE** | `~/.gemini/config/skills/` | `~/.gemini/antigravity/global_workflows/` | — | — |
| **Antigravity CLI** | `~/.gemini/antigravity-cli/skills/` | — | — | — |
| **Hermes** | `~/.hermes/skills/` | config.yaml³ | —⁴ | `~/.hermes/hooks/<name>/HOOK.yaml` + `handler.py` |
| **OpenClaw** | `skills/` (project-level) | —⁵ | —⁵ | — |

¹ Subagents require an extension to be loaded (not built-in). Pi: `subagent` example extension reads `~/.pi/agent/agents/*.md`. omp: `omp agents unpack` writes to `~/.omp/agent/agents/`.

² Pi and omp replaced their legacy hook systems with an **Extensions** system (TypeScript event handlers at `~/.pi/agent/extensions/` / `~/.omp/agent/extensions/`). `superskill` currently emits a pi-hooks-format shim; migrating to extensions format is on the roadmap.

³ Hermes defines slash commands inline in `~/.hermes/config.yaml` (`quick_commands:` block) or as hardcoded `CommandDef` entries in source. Skills registered at `~/.hermes/skills/` are auto-discovered as `/<skill-name>` slash commands — installing commands as skills is the recommended path.

⁴ Hermes spawns subagents dynamically at runtime via `delegate_task`; there is no persistent subagent directory.

⁵ OpenClaw reads skills from a flat `skills/` directory at project root. Commands and subagents are installed as skill directories (same as other agents that lack dedicated command/subagent dirs). Currently dropped from superskill's `TARGETS` — tracked for re-add.

### How superskill installs

| Agent | Engine | Notes |
|-------|--------|-------|
| **Claude Code** | `claude plugin marketplace add` + `claude plugin install` | Native plugin system — handles all entity types automatically |
| **Codex** | rulesync | `codex` → `codexcli` |
| **Pi** | rulesync + superskill shim | Subagents via direct write to `~/.pi/agent/agents/` (rulesync doesn't support Pi subagents) |
| **omp** | rulesync + superskill shim | `omp` → `pi` surrogate for rulesync, then copy skills to `~/.omp/agent/skills/`; omp natively reads from other agent directories |
| **OpenCode** | rulesync | `opencode` → `opencode` |
| **Antigravity IDE** | rulesync | `antigravity-ide` → `antigravity-ide` |
| **Antigravity CLI** | rulesync | `antigravity-cli` → `antigravity-cli`; commands/subagents not supported by rulesync for this target |
| **Hermes** | rulesync + superskill shim | `hermes` → `opencode` surrogate for rulesync, then copy to `~/.hermes/`; hooks currently emit `hooks.json` (wrong format — Hermes uses `HOOK.yaml`) |

Since ts-ai-runner 0.3.21, `omp`, `hermes`, and `antigravity-cli` are canonical `AgentName` values — slash-command dialect translation maps 1:1. Only `antigravity-ide` still bridges through `opencode`.

### Known gaps

| Gap | Status |
|-----|--------|
| **Pi subagents** not installed | Rulesync's SubagentsProcessor excludes `pi`. Fix: direct write to `~/.pi/agent/agents/` in install dispatch (tracked in task 0044). |
| **antigravity-cli** commands/subagents | Rulesync doesn't support `antigravity-cli` for commands/subagents (only `antigravity` project-level). |
| **Hermes hooks format** | Superskill writes `hooks.json`; Hermes expects `~/.hermes/hooks/<name>/HOOK.yaml` + `handler.py`. |
| **Hermes commands** | No `commands/` directory. Install commands as skills for slash-command auto-discovery. |
| **Pi/omp hooks → extensions** | Legacy pi-hooks shim should migrate to the Extensions format. |
| **OpenClaw** | Missing from `TARGETS` entirely. Old `cc-agents/scripts/` supported it via direct `skills/` directory copy. |
| **Claude Code install** | Code fix committed (`13dcf78`) but binary not yet rebuilt/published. |
## Bundled `cc` plugin

superskill ships with a Claude Code plugin at [`plugins/cc/`](plugins/cc/) (marketplace name: `cc`, version `0.1.1`) that demonstrates the full authoring lifecycle and provides the meta-agent skills the expert personas reference:

| Entity | Count | Purpose |
|--------|-------|---------|
| **skills** | 6 | `anti-hallucination`, `cc-agents`, `cc-commands`, `cc-hooks`, `cc-magents`, `cc-skills` — domain knowledge for each entity type |
| **commands** | 16 | 4 operations × 4 entity types — thin slash-command wrappers that delegate to skills |
| **agents** | 5 | `expert-agent`, `expert-command`, `expert-hook`, `expert-magent`, `expert-skill` — specialist subagents that route to skills |
| **hooks** | 1 | `Stop` hook running the anti-hallucination guard |
| **scripts** | 3 | `ah_guard.ts`, `validate_response.ts`, `logger.ts` — deterministic enforcement for the anti-hallucination protocol |

The plugin follows a three-tier delegation pattern: **Commands/Agents → Skills → `superskill` CLI**. See [`plugins/cc/README.md`](plugins/cc/README.md) for the full entity design and relationship diagram.

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
| Constraint rules | Spur (`spur rule run`) |
| Git hooks | Lefthook |
| Conventional commits | cocogitto (`cog`) |
| Tool versions | proto (`.prototools`) |

### Workspace layout

```
apps/cli/          # Commander-based CLI entry (the binary); imports @gobing-ai/superskill-core
packages/core/     # reusable domain logic and no-app operation APIs
tooling/typescript/ # shared tsconfig presets
plugins/cc/        # bundled Claude Code plugin
```

### Commands

```bash
bun run lint       # biome check + typecheck
bun run format     # biome check --write (autofix)
bun run autofix    # format then typecheck
bun run test       # bun test with coverage
bun run build      # compile to standalone binary
bun run dev        # watch mode
bun run check      # lint + test (CI gate)
bun run spur-check # lint + pre-check rules + test + post-check rules
```

### Verification gate

All must pass before a change is considered done:

1. `bun run lint` — Biome and typecheck clean.
2. `bun run test` — all tests pass, no `.skip` or commented-out tests. Coverage ≥ 90% lines + functions.
3. `bun run build` — standalone binary compiles.
4. `git status` — only intentional changes.
5. `bun run spur-check` — pre-check rules (22) + post-check rules (coverage-gate + tsdoc-export) all green.

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
