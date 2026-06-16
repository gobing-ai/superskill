---
doc: 03_ARCHITECTURE
owns: HOW — module boundaries, data flow, runtime model, invariants
authority: derived
version: 2.0.0
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
├── config.ts                     # superskill.jsonc zod schema + loader
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
                  rulesync.generate()
                        │
                 ConversionPipeline
                        │
                 Copy to target dirs
```

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

## Conversion rules

Carried from cc-agents/scripts. Pipeline stages are pure functions per invariant 5.

| Stage | Applies to | Effect |
|-------|-----------|--------|
| `rewriteColonRefs` | all prose | `plugin:command` → `plugin-command` |
| `translateSlashCommand` | commands | `/plugin:cmd` → per-agent dialect (delegates to `@gobing-ai/ts-ai-runner`) |
| `normalizeFrontmatter` | commands, subagents | Inject `name:`, normalize `allowed-tools:` |
| `convertToPiSubagent` | Pi subagents | Skills 2.0 → Pi native agent YAML |

## Target taxonomy

| Target | rulesync target | Global skill path | Note |
|--------|----------------|-------------------|------|
| `claude` | — | plugin marketplace | Not rulesync — direct `claude plugin install` |
| `codex` | `codexcli` | `~/.agents/skills/` | Shared agents dir for global installs |
| `pi` | `pi` | `~/.agents/skills/` | Shared agents dir; subagents → `~/.pi/agent/agents/` |
| `omp` | — | `~/.omp/agent/skills/` | Pi variant — same format, different paths |
| `opencode` | `opencode` | `~/.agents/skills/` | Shared agents dir for global installs |
| `antigravity-cli` | `antigravity-cli` | `~/.gemini/antigravity-cli/skills/` | |
| `antigravity-ide` | `antigravity-ide` | `~/.gemini/config/skills/` | |
| `hermes` | — | `~/.hermes/skills/` | Custom — not in rulesync yet |

**Deprecated:** `gemini` (Gemini CLI), `antigravity` (old unified target).

## Invariants

1. **Single plugin per install.** `superskill install <plugin>` installs exactly one plugin at a time.
2. **Idempotent output.** Running install twice with unchanged input produces identical output files.
3. **No silent data loss.** If a target path is unwritable, the command fails before touching any target.
4. **rulesync owns format knowledge.** superskill never hardcodes a target's file format — it delegates to `rulesync.generate()`.
5. **Pipeline stages are pure functions.** `(content: string, target: Target, options?: ConvertOptions) => string` — no side effects, no filesystem access.
6. **Closed evolve loop.** Every accepted evolution proposal triggers a verification evaluation — every change has a measured outcome.
