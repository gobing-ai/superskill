---
doc: 03_ARCHITECTURE
owns: HOW — module boundaries, data flow, runtime model, invariants
authority: derived
version: 2.2.0
derived_from: [00_ADR, 01_PRD]
owner: Robin Min
updated_at: 2026-06-16
read_before: cross-module, seam, or schema work
edit_rules: 99 §6.4
sync: [T1]
---

# Architecture

## Stack

| Layer | Choice | ADR |
|-------|--------|-----|
| Runtime | Bun 1.3 | 001 |
| Language | TypeScript 5.x | 001 |
| Lint / format | Biome | 001 |
| CLI framework | Commander.js | 003 |
| Test runner | bun:test | 001 |
| Format conversion | rulesync (npm) | 005 |
| Data store (Phase 2) | bun:sqlite | — |

## Module boundaries

```
apps/cli/src/
├── commands/                     # ── Phase 1 ──
│   └── install.ts                # superskill install
│
├── targets.ts                    # Target enum, TARGET_TO_RULESYNC, TARGET_TO_AGENT_NAME
├── config.ts                     # superskill.jsonc zod schema + loader
├── marketplace.ts                # marketplace.json parser + resolvePlugin (ADR-011)
├── mapper.ts                     # Plugin → .rulesync/ canonical layout
├── rulesync.ts                   # Thin wrapper around rulesync.generate()
│
├── pipeline/                     # ── Phase 1 ──
│   ├── convert.ts                # ConversionPipeline — named stages per target
│   ├── rewrite-colons.ts         # plugin:command → plugin-command in prose
│   └── pi-subagent.ts            # Skills 2.0 → Pi native agent YAML
│
├── commands/                     # ── Phase 2 (extends above) ──
│   ├── agent.ts                  # superskill agent
│   ├── skill.ts                  # superskill skill
│   ├── command.ts                # superskill command
│   ├── hook.ts                   # superskill hook
│   └── magent.ts                 # superskill magent
│
├── operations/                   # ── Phase 2 ──
│   ├── scaffold.ts               # Template-based content generation
│   ├── validate.ts               # Structural + schema validation
│   ├── evaluate.ts               # Quality scoring engine
│   ├── refine.ts                 # Evaluate → fix pipeline
│   └── evolve.ts                 # Longitudinal improvement engine
│
├── quality/                      # ── Phase 2 ──
│   ├── dimensions.ts             # Dimension definitions per content type
│   ├── skill.ts                  # Skill-specific evaluators
│   ├── command.ts                # Command-specific evaluators
│   ├── agent.ts                  # Agent-specific evaluators
│   ├── hook.ts                   # Hook-specific evaluators
│   └── magent.ts                 # Magent-specific evaluators
│
├── store/                        # ── Phase 2 ──
│   ├── db.ts                     # SQLite open + migration
│   ├── evaluations.ts            # Evaluation CRUD
│   └── proposals.ts              # Proposal CRUD
│
└── templates/                    # ── Phase 2 (shipped with npm package) ──
    ├── skill/default.md
    ├── command/default.md
    ├── agent/default.md
    ├── hook/default.md
    └── magent/default.md
```

### Workspace packages

```
apps/cli/        # Commander CLI binary — all source above lives here
packages/utils/  # Shared utilities (add, zod re-export, logger)
```

## Data flow

### Phase 1: Distribution

```
Plugin source                    Canonical              Target output
─────────────                    ─────────              ─────────────
plugins/<name>/                  .rulesync/             ~/.agents/skills/
  skills/*.md     ──mapper──►     skills/<name>-*/       ~/.pi/agent/agents/
  commands/*.md   ──mapper──►     commands/<name>-*.md   ~/.gemini/antigravity-cli/skills/
  agents/*.md     ──mapper──►     subagents/<name>-*.md  ~/.hermes/skills/
  hooks.json      ──mapper──►     hooks.json             ...
  mcp.json        ──mapper──►     mcp.json
                        │
                  ConversionPipeline (per-target, pure stages)
                        │
                  rulesync.generate({ outputRoots, global, ... })
                        │   writes <outputRoot>/<relativeDirPath> per rulesync
                        │
                  Copy step — hermes & omp only (not in rulesync)
```

`outputRoots = global ? [os.homedir()] : [process.cwd()]` (ADR-010). For every rulesync-supported target the write is done by `generate()`; superskill copies only the two targets rulesync lacks.

**Invariant:** `.rulesync/` is the canonical intermediate representation. No feature module writes directly from plugin source to target output.

### Phase 2: Authoring + quality

```
User input                     Operations                   Data store
──────────                     ──────────                   ──────────
superskill skill scaffold      scaffold.ts ──► ./my-skill.md
superskill skill validate      validate.ts ──► findings JSON
superskill skill evaluate      evaluate.ts ──► scores ────► evaluations table
superskill skill refine        refine.ts   ──► fixed file + delta
superskill skill evolve        evolve.ts   ──► proposal ──► proposals table
                                         └──► applied changes ──► file updated
                                         └──► post-verify eval ──► evaluations table
```

**Invariant:** The evolve loop is closed — every accepted proposal triggers a verification evaluation, creating a feedback trace in the data store.

## Source of truth

Claude Code plugin format (ADR 006):

```
plugins/<name>/
├── skills/<skill>.md        # YAML frontmatter + Markdown body
├── commands/<command>.md    # YAML frontmatter (argument-hint, allowed-tools)
├── agents/<agent>.md        # YAML frontmatter (tools, skill, model)
├── hooks.json               # Hook definitions
├── mcp.json                 # MCP server definitions
└── plugin.json              # Plugin manifest
```

## Plugin resolution

`superskill install <plugin>` locates the plugin root via a Claude Code marketplace manifest (ADR-011). Resolution order, first match wins:

1. `--marketplace <path>` — explicit path to a `.claude-plugin/marketplace.json` (or its containing dir).
2. `.claude-plugin/marketplace.json` in CWD.
3. Fallback: the `plugins/<name>/` directory scan (legacy convention).

**Manifest shape** (verified against Claude Code docs + `cc-agents/.claude-plugin/marketplace.json`):

```jsonc
{
  "name": "cc-agents",
  "owner": { "name": "…", "email": "…" },
  "metadata": { "pluginRoot": "./plugins" },   // optional; prefixes relative sources
  "plugins": [ { "name": "rd3", "source": "./plugins/rd3", "version": "…" } ]
}
```

**Resolution rule (invariant 7):** match `<plugin>` against `plugins[].name`; the plugin root is `source` (prefixed by `metadata.pluginRoot` if `source` is bare) resolved relative to the **marketplace root** — the directory containing `.claude-plugin/`, *not* `.claude-plugin/` itself. Phase 1 accepts only **string relative-path** `source` values (must start `./`); object sources (`github`, `url`, `git-subdir`, `npm`) are rejected with "remote sources not yet supported" (deferred, 01).

## Conversion rules

Carried from cc-agents/scripts. Pipeline stages are pure functions per invariant 5.

| Stage | Applies to | Effect |
|-------|-----------|--------|
| `rewriteColonRefs` | all prose | `plugin:command` → `plugin-command` |
| `translateSlashCommand` | commands | `/plugin:cmd` → per-agent dialect (delegates to `@gobing-ai/ts-ai-runner`); superskill `Target` is bridged to `AgentName` via `TARGET_TO_AGENT_NAME` (ADR-009 amendment) |
| `normalizeFrontmatter` | commands, subagents | Inject `name:`, normalize `allowed-tools:` |
| `convertToPiSubagent` | Pi subagents | Skills 2.0 → Pi native agent YAML |

`translateSlashCommand` accepts a ts-ai-runner `AgentName`, not a superskill `Target`; the two sets are disjoint on `antigravity-cli`/`antigravity-ide`/`hermes`/`omp`. `TARGET_TO_AGENT_NAME` (in `config.ts`/`targets.ts`) bridges them: `omp→pi`, the antigravity/hermes targets fall to the function's `default` branch (`/plugin-command`).

## Target taxonomy

superskill maps each `Target` to a rulesync `ToolTarget` (`TARGET_TO_RULESYNC`) and to a ts-ai-runner `AgentName` for slash-dialect translation (`TARGET_TO_AGENT_NAME`, ADR-009 amendment). **superskill does not own per-target install paths** — rulesync resolves them from `<outputRoot>/<relativeDirPath>` (ADR-010). The global skill paths below are rulesync's resolved output *given* `outputRoot = ~`; they are documented for reference, not reimplemented in superskill.

| Target | rulesync target | AgentName (slash) | Global skill path (rulesync-resolved, `outputRoot=~`) | Note |
|--------|----------------|-------------------|-------------------------------------------------------|------|
| `claude` | — | `claude` | plugin marketplace | Not rulesync — direct `claude plugin install` |
| `codex` | `codexcli` | `codex` | `~/.agents/skills/` (under `$CODEX_HOME`) | |
| `pi` | `pi` | `pi` | `~/.pi/agent/skills/` | subagents → Pi native agent format |
| `omp` | — | `pi` | `~/.omp/agent/skills/` | Pi variant — copied by superskill, not rulesync |
| `opencode` | `opencode` | `opencode` | `~/.agents/skills/` | |
| `antigravity-cli` | `antigravity-cli` | default (`/plugin-command`) | `~/.gemini/antigravity-cli/skills/` | |
| `antigravity-ide` | `antigravity-ide` | default (`/plugin-command`) | `~/.gemini/config/skills/` | |
| `hermes` | — | default (`/plugin-command`) | `~/.hermes/skills/` | Custom — copied by superskill, not rulesync |

**Deprecated:** `gemini` (Gemini CLI), `antigravity` (old unified target).

**Output root (ADR-010).** rulesync writes to `<outputRoot>/<relativeDirPath>` and never resolves `~`. `runRulesync` sets `outputRoots: [os.homedir()]` for `--global`, `[process.cwd()]` otherwise; rulesync's `global` flag only swaps the relative subdir (e.g. Pi `.pi/skills` → `.pi/agent/skills`). The `hermes` and `omp` targets are absent from rulesync's `ToolTarget` set, so superskill copies their generated content to the paths above after `generate()`.

## Invariants

1. **Single plugin per install.** `superskill install <plugin>` installs exactly one plugin at a time.
2. **Idempotent output.** Running install twice with unchanged input produces identical output files.
3. **No silent data loss.** If a target path is unwritable, the command fails before touching any target.
4. **rulesync owns format knowledge.** superskill never hardcodes a target's file format — it delegates to `rulesync.generate()`.
5. **Pipeline stages are pure functions.** `(content: string, target: Target, options?: ConvertOptions) => string` — no side effects, no filesystem access.
6. **Closed evolve loop.** Every accepted evolution proposal triggers a verification evaluation — every change has a measured outcome.
7. **Marketplace-relative resolution.** A relative plugin `source` resolves against the marketplace root (the dir containing `.claude-plugin/`), never against `.claude-plugin/` or CWD. A `source` escaping the marketplace root (`../`) or using an object form is rejected, not silently resolved.
