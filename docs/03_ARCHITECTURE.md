---
doc: 03_ARCHITECTURE
owns: HOW — module boundaries, data flow, runtime model, invariants
authority: derived
version: 2.8.0
derived_from: [00_ADR, 01_PRD]
owner: Robin Min
updated_at: 2026-07-26
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
| Data store (Phase 2) | bun:sqlite (via @gobing-ai/ts-db) | 014 |

## High-Level Architecture

The superskill CLI is structured around clear separation between the CLI app (`apps/cli`) and reusable domain logic (`packages/core`). The CLI owns command handling, operation adapters, output formatting, persistence, and store-backed workflows; core owns content editing, quality scoring, conversion pipeline, target taxonomy, marketplace resolution, plugin mapping, the rulesync wrapper, and reusable operation APIs that have no app dependency. `apps/cli` imports `@gobing-ai/superskill-core`; core never depends on the app.

```mermaid
graph TD
    CLI["superskill CLI (apps/cli)"]
    CMDS["Command Handlers (commands/)"]
    OPS["Operation Adapters (operations/)"]
    STORE["Data Store & DAOs (store/)"]

    CORE["@gobing-ai/superskill-core (packages/core)"]
    CORE_OPS["Reusable Operation APIs (operations/)"]
    QUAL["Quality Evaluators (quality/)"]
    PIPE["Conversion Pipeline (pipeline/)"]
    CONTENT["Content Primitives (content/)"]
    MAPPER["Mapper & Rulesync (mapper.ts, rulesync.ts)"]
    TARGETS["Targets & Marketplace (targets.ts, marketplace.ts)"]

    CLI --> CMDS
    CMDS --> OPS
    CMDS --> STORE
    OPS --> STORE

    CMDS --> CORE
    OPS --> CORE
    STORE --> CORE
    CORE --> CORE_OPS
    CORE --> QUAL
    CORE --> PIPE
    CORE --> CONTENT
    CORE --> MAPPER
    CORE --> TARGETS
    MAPPER --> RS_PKG["rulesync (npm package)"]
    STORE --> SQLite["SQLite DB (.superskill/evaluations.db)"]
```

## Module boundaries

```
packages/core/src/                # ── Reusable domain logic (@gobing-ai/superskill-core) ──
├── content/                      # ── Common content-IO primitives ──
│   ├── backup.ts                 # .bak copy/restore helpers
│   ├── edit.ts                   # Apply structured text & frontmatter modifications
│   ├── frontmatter.ts            # Comment-preserving YAML frontmatter parser (ADR-012)
│   ├── hash.ts                   # Content hashing helper
│   ├── hook-events.ts            # Claude hook-event taxonomy + canonical mapping
│   ├── identity.ts               # Content name/path identity resolver (ADR-013)
│   ├── paths.ts                  # Data-root / DB / proposals path resolution
│   └── types.ts                  # ContentType canonical definition
│
├── quality/                      # ── Quality evaluation heuristics ──
│   ├── agent.ts                  # Subagent quality evaluation heuristics
│   ├── command.ts                # Slash command quality evaluation heuristics
│   ├── dimensions.ts             # Shared type-specific dimension registries
│   ├── hook.ts                   # Hook quality evaluation heuristics
│   ├── magent.ts                 # Main agent quality evaluation heuristics (harness-aware scoring signals via template + cc-magents)
│   ├── rubric.ts                 # Rubric loader & validator (feature G32)
│   └── skill.ts                  # Skill quality evaluation heuristics
│
├── rubrics/                      # ── Built-in rubric YAML data ──
│   ├── agent.yaml
│   ├── command.yaml
│   ├── hook.yaml
│   ├── magent.yaml
│   └── skill.yaml
│
├── templates/                    # ── Built-in scaffold templates, bundled as text imports ──
│   └── magent/default.md         # Harness-aware main-agent template (spur + superskill first; Platform Padding)
│
├── pipeline/                     # ── Conversion transformations (pure stage functions) ──
│   ├── adapt-command.ts          # Adapt Claude command .md → Skills 2.0 skill entry
│   ├── adapt-subagent.ts         # Adapt Claude subagent .md -> skill entry / Pi native agent / Codex native agent TOML
│   ├── frontmatter-walk.ts       # Shared frontmatter-block walker for the adapt-* stages
│   ├── pi-tools.ts               # Claude → Pi tool-name normalization + skill-ref extraction
│   ├── rewrite-references.ts     # Rewrite scoped plugin:name colon references
│   └── slash-command.ts          # Slash-dialect translation mappings
│
├── operations/                   # ── Reusable operation APIs with no app dependency ──
│   ├── migrate.ts                # Deterministic skill merge/migration core
│   ├── package.ts                # Package content for distribution
│   ├── scaffold.ts               # Scaffold content files from templates
│   └── validate.ts               # Syntax and layout verification engine
│
├── targets.ts                    # Target mapping registries and conversions
├── marketplace.ts                # Local plugin/marketplace manifest resolution (ADR-011)
├── mapper.ts                     # Mappings from plugin structure to rulesync canonical
├── rulesync.ts                   # Rulesync invocation wrapper (ADR-010)
└── index.ts                      # Public API barrel (structured results, typed errors; no process/stdout)

apps/cli/src/                     # ── CLI app (@gobing-ai/superskill) ──
├── commands/                     # ── Command CLI entry handlers ──
│   ├── agent.ts                  # superskill agent subcommands
│   ├── command.ts                # superskill command subcommands
│   ├── helpers.ts                # common options, target resolution, and operation runners
│   ├── hook.ts                   # superskill hook subcommands
│   ├── install.ts                # superskill install command
│   ├── magent.ts                 # superskill magent subcommands
│   └── skill.ts                  # superskill skill subcommands
│
├── operations/                   # ── CLI adapters and store-backed workflows ──
│   ├── evaluate.ts               # App-owned scoring workflow: CLI envelope output + store persistence
│   ├── evolve.ts                 # Self-evolution loop using historical evaluations
│   ├── migrate.ts                # CLI migration adapter; delegates deterministic merge to core
│   ├── package.ts                # Thin re-export adapter over core package API
│   ├── refine.ts                 # Evaluate-and-fix automation pipeline
│   ├── scaffold.ts               # Thin re-export adapter over core scaffold API
│   └── validate.ts               # Thin re-export adapter over core validate API
│
├── store/                        # ── Persistence database layer (app-owned; ADR-014) ──
│   ├── db.ts                     # Database connection initialization and migrations (re-exports getDBPath from core)
│   ├── evaluations.ts            # Append-only evaluations record DAO
│   ├── proposals.ts              # Evolution proposal lifecycle DAO
│   └── schema.ts                 # Database table schema definition
│
├── config.ts                     # Configuration schema definition
├── hooks.ts                      # Hook emission (hermes/pi-style)
├── cli.ts                        # Program registration entrypoint
└── index.ts                      # Executable entrypoint
```

**Package boundary rules:** `apps/cli` imports `@gobing-ai/superskill-core`; `packages/core` never imports from `apps/cli`, never calls `process.exit`, and never writes to stdout/stderr. Cross-package access uses the `@gobing-ai/superskill-core` alias only — no deep relative imports across sibling packages. `store/` remains app-owned because persisted evaluations/proposals still have no second consumer and require the CLI-local data-root/store seam.

### Workspace packages

- [apps/cli/](file:///Users/robin/xprojects/superskill/apps/cli): Commander CLI binary — command registration, option parsing, output formatting, exit-code mapping, operation adapters, and the persistence layer.
- [packages/core/](file:///Users/robin/xprojects/superskill/packages/core): Reusable domain logic — content editing, quality scoring, conversion pipeline, target taxonomy, marketplace resolution, plugin mapping, rulesync wrapper, and no-app operation APIs. Consumed by the CLI via `@gobing-ai/superskill-core`.
## Data flow

### Phase 1: Distribution

```
CLI flags + superskill.jsonc
          │
          ▼
Plugin source                    Canonical              Target output
─────────────                    ─────────              ─────────────
plugins/<name>/                  .rulesync/             ~/.agents/skills/
  skills/*.md     ──mapper──►     skills/<name>-*/       ~/.pi/agent/agents/
  commands/*.md   ──mapper──►     commands/<name>-*.md   ~/.gemini/antigravity-cli/skills/
  agents/*.md     ──mapper──►     subagents/<name>-*.md  ~/.hermes/skills/
  hooks.json      ──mapper──►     hooks.json             ...
  mcp.json        ──mapper──►     mcp.json
                        │
                  Per-target stage chain (pure functions, applied in order):
                  translateSlashCommands ─► rewriteSkillReferences
                  (frontmatter adaptation already applied by the mapper)
                        │
                  rulesync.generate({ outputRoots, global, ... })
                        │   writes <outputRoot>/<relativeDirPath> per rulesync
                        │
                  Copy step — hermes & omp only (not in rulesync)
```

`outputRoots = global ? [os.homedir()] : [process.cwd()]` (ADR-010). For every rulesync-supported target, the write is done by `generate()`; superskill copies only the two targets rulesync lacks (`hermes` and `omp`).

The install action loads `superskill.jsonc` before resolving the plugin. Explicit
`--marketplace`/`--targets` values win over configured defaults; a configured plugin path is used
before ambient marketplace discovery when `--marketplace` is absent. The configured `features`
filter is applied by the mapper, so excluded artifact classes never enter `.rulesync/`. Native
targets whose installers cannot honor a partial feature set fail before mutation instead of
silently installing the full plugin.

> [!IMPORTANT]
> **Invariant:** `.rulesync/` is the canonical intermediate representation. No feature module writes directly from plugin source to target output.

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

> [!IMPORTANT]
> **Invariant:** The evolve loop is closed — every accepted proposal triggers a verification evaluation, creating a feedback trace in the data store.

## Database Schema & ER Diagram

The database runs on SQLite and is accessed through drizzle-orm using the `@gobing-ai/ts-db` wrapper. It contains two tables tracking evaluations and proposal lifecycles:

```mermaid
erDiagram
    evaluations {
        int id PK
        string content_type
        string content_name
        string target_agent
        string operation
        real aggregate
        string dimensions
        string file_hash
        int created_at
        int updated_at
    }
    proposals {
        int id PK
        string content_type
        string content_name
        int baseline_id FK
        string proposal_json
        string status
        string applied_at
        int verify_id FK
        int created_at
        int updated_at
    }
    proposals }o--|| evaluations : "baseline_id (references id)"
    proposals }o--|| evaluations : "verify_id (references id)"
```

### Table Specifications

1. **`evaluations`** (DAO: [EvaluationDao](file:///Users/robin/xprojects/superskill/apps/cli/src/store/evaluations.ts)): Stores append-only metrics generated by evaluations, auto-refinements, or post-evolution verifications.
2. **`proposals`** (DAO: [ProposalDao](file:///Users/robin/xprojects/superskill/apps/cli/src/store/proposals.ts)): Manages the mutable lifecycle (`draft` → `accepted` | `rejected`) of self-evolution proposals.

## Source of truth

Claude Code plugin format (ADR-006):

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

`superskill install <plugin>` resolves the plugin root from explicit CLI input, validated config, or
a Claude Code marketplace manifest (ADR-011). Resolution order, first match wins:

1. `--marketplace <path>` — explicit path to a `.claude-plugin/marketplace.json` (or its containing dir).
2. Matching `plugins[].path` in project-local `superskill.jsonc`.
3. `.claude-plugin/marketplace.json` in CWD.
4. Fallback: the `plugins/<name>/` directory scan (legacy convention).

**Manifest shape** (verified against Claude Code docs + `cc-agents/.claude-plugin/marketplace.json`):

```json
{
  "name": "cc-agents",
  "owner": { "name": "…", "email": "…" },
  "metadata": { "pluginRoot": "./plugins" },
  "plugins": [ { "name": "rd3", "source": "./plugins/rd3", "version": "…" } ]
}
```

> [!IMPORTANT]
> **Resolution rule (invariant 7):** match `<plugin>` against `plugins[].name`; the plugin root is `source` (prefixed by `metadata.pluginRoot` if `source` is bare) resolved relative to the **marketplace root** — the directory containing `.claude-plugin/`, *not* `.claude-plugin/` itself. Phase 1 accepts only **string relative-path** `source` values (must start `./`); object sources (`github`, `url`, `git-subdir`, `npm`) are rejected.

## Conversion rules

Carried from cc-agents/scripts. Pipeline stages are pure functions per invariant 5.

| Stage | Applies to | Effect |
|-------|-----------|--------|
| `rewriteColonRefs` | all prose | `plugin:command` → `plugin-command` |
| `translateSlashCommand` | commands | `/plugin:cmd` → per-agent dialect (delegates to `@gobing-ai/ts-ai-runner`); superskill `Target` is bridged to `AgentName` via `TARGET_TO_AGENT_NAME` (ADR-009 amendment) |
| `normalizeFrontmatter` | commands, subagents | Inject `name:`, normalize `allowed-tools:` |
| `adaptSubagentToPi` | Pi subagents | Skills 2.0 → Pi native agent YAML (skill refs filtered to existing skills) |
| `adaptSubagentToCodex` | Codex subagents | Skills 2.0 -> Codex native agent TOML (model-tier -> model/model_reasoning_effort via `CODEX_MODEL_TIERS`, skill refs rewritten, pinned key order) |

`translateSlashCommand` accepts a ts-ai-runner `AgentName`, not a superskill `Target`; the two sets are disjoint on `antigravity-cli`/`antigravity-ide`/`hermes`/`omp`. `TARGET_TO_AGENT_NAME` (in [targets.ts](file:///Users/robin/xprojects/superskill/packages/core/src/targets.ts), consumed by [config.ts](file:///Users/robin/xprojects/superskill/apps/cli/src/config.ts)) bridges them: `omp→pi`, the antigravity/hermes targets fall to the function's `default` branch (`/plugin-command`).

## Target taxonomy

superskill maps each `Target` to a rulesync `ToolTarget` (`TARGET_TO_RULESYNC`) and to a ts-ai-runner `AgentName` for slash-dialect translation (`TARGET_TO_AGENT_NAME`, ADR-009 amendment). **superskill does not own per-target install paths** — rulesync resolves them from `<outputRoot>/<relativeDirPath>` (ADR-010). The global skill paths below are rulesync's resolved output *given* `outputRoot = ~`; they are documented for reference, not reimplemented in superskill.

| Target | rulesync target | AgentName (slash) | Global skill path | Note |
|--------|----------------|-------------------|------------------|------|
| `codex` | `codexcli` | `codex` | `~/.agents/skills/` | Dual-emit - subagents -> Codex native agent TOML at `~/.codex/agents/` (ADR-033) |
| `pi` | `codexcli` | `pi` | `~/.agents/skills/` | Unified — subagents → Pi native agent format |
| `omp` | — | `pi` | `~/.agents/skills/` | Native — reads shared ~/.agents/skills/ |
| `opencode` | `opencode` | `opencode` | `~/.config/opencode/skills/` | |
| `antigravity-cli` | `antigravity-cli` | `antigravity-cli` | `~/.gemini/antigravity-cli/skills/` | Native — agy reads this dir |
| `antigravity-ide` | `antigravity-ide` | default (`/plugin-command`) | `~/.gemini/config/skills/` | Native — IDE reads this dir |
| `hermes` | — | default (`/plugin-command`) | `~/.hermes/skills/` | Copied by superskill |

**Output root (ADR-010).** rulesync writes to `<outputRoot>/<relativeDirPath>` and never resolves `~`. `runRulesync` sets `outputRoots: [os.homedir()]` for `--global`, `[process.cwd()]` otherwise; rulesync's `global` flag only swaps the relative subdir. Only `hermes` is absent from rulesync's `ToolTarget` set — superskill copies opencode-generated skills to `~/.hermes/skills/`. OMP reads from the shared `~/.agents/skills/` directory natively (ADR-010 amendment 2026-06-23).

## CLI Commands Surface

The following represents all commands exposed by the `superskill` CLI:

```bash
# Distribution & Sync
superskill install <plugin> [--marketplace <path>] [--targets <list>] [--no-global] [--dry-run] [--verbose]

# Resource-specific Operations (type is one of: agent, skill, command, hook, magent)
superskill <type> scaffold <name> [--description <text>] [--target <agent>] [--output <dir>] [--force]
superskill <type> validate <nameOrPath> [--target <agent>] [--strict] [--json]
superskill <type> evaluate <nameOrPath> [--target <agent>] [--json] [--save]
superskill <type> refine <nameOrPath> [--target <agent>] [--auto] [--save]
superskill <type> evolve <name> [--target <agent>] [--from <date>] [--propose-only] [--accept <id>] [--reject <id>]
```

## Command Sequence Diagrams & Briefings

---

### 1. `superskill install <plugin>`

#### Briefing
Resolves the plugin root from the workspace directory or an optional marketplace manifest. Maps source files into canonical `.rulesync/` layouts, applies targeted markdown conversions (colon rewriting, slash-dialect translations, frontmatter normalizations, and Pi agent configurations), executes `rulesync` for supported target agents, and copy-dispatches output files for targets that rulesync does not support natively (e.g. Claude local installer, Hermes, and OMP).

#### Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant CLI as Command Handler (install.ts)
    participant Marketplace as Marketplace Resolver (marketplace.ts)
    participant Mapper as Mapper (mapper.ts)
    participant Pipe as Per-target stage chain (install.ts)
    participant Rulesync as Rulesync Wrapper (rulesync.ts)
    participant Upstream as Target Agents / Local Paths

    User->>CLI: superskill install <plugin>
    CLI->>Marketplace: resolvePlugin(plugin)
    Marketplace-->>CLI: pluginRoot path
    CLI->>Mapper: mapPluginToRulesync(pluginRoot)
    Note over Mapper: Adapts commands/subagents into skill entries<br/>(frontmatter injection) before writing .rulesync/
    Mapper-->>CLI: Mapped .rulesync/ files
    loop Each Target
        CLI->>Pipe: transformRulesyncMarkdown(root, target)
        Note over Pipe: translateSlashCommands → rewriteSkillReferences<br/>(pure stage functions, applied in order)
        Pipe-->>CLI: Transformed files in target directories
    end
    CLI->>Rulesync: runRulesync(targets)
    Rulesync->>Upstream: Write files to output roots
    alt Claude Code installation
        CLI->>Upstream: ProcessExecutor.run "claude plugin install" (ts-runtime, ADR-032)
    else Hermes / OMP installation
        CLI->>Upstream: copyDirectory to ~/.hermes or ~/.omp
    end
    CLI-->>User: Success with installed file counts
```

---

### 2. `superskill <type> scaffold <name>`

#### Briefing
Loads built-in templates embedded from `packages/core/src/templates/` or user overrides from `~/.superskill/templates/<type>/`, substitutes template variables (`<!-- NAME -->`, `<!-- DESCRIPTION -->`, `<!-- TARGET -->`, `<!-- BODY -->`), and writes the initial structured draft to disk. Overwriting existing files is disabled unless `--force` is provided.

#### Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant CLI as Command Handler (skill.ts/etc.)
    participant Scaffold as scaffold() (scaffold.ts)
    participant FS as File System

    User->>CLI: superskill <type> scaffold <name> --description "..." --target "..."
    CLI->>Scaffold: scaffold(type, name, options)
    Scaffold->>Scaffold: resolveTemplate(type)
    Note over Scaffold: Checks user override ~/.superskill/templates/<type>/default.md<br/>falls back to core-owned template text embedded by Bun
    Scaffold->>Scaffold: substituteVars(template, vars)
    Note over Scaffold: Substitutes <!-- NAME -->, <!-- DESCRIPTION -->, <!-- TARGET -->, <!-- BODY -->
    Scaffold->>FS: writeFileSync([outDir]/[name].md)
    FS-->>Scaffold: File written successfully
    Scaffold-->>CLI: Absolute path of created file
    CLI-->>User: Print "Created: [filePath]"
```

---

### 3. `superskill <type> validate <nameOrPath>`

#### Briefing
Performs multi-category syntax and configuration checks on a definition file. Parses the frontmatter safely to review required fields, data types, and target platform conventions (e.g., Pi singular `tool:` naming or Codex command naming). Verifies all internal reference links (`skill:`, `agent:`, `command:`) point to valid files on disk. Strict mode checks additional recommendations, such as character limits and deprecated fields.

#### Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant CLI as Command Handler (skill.ts/etc.)
    participant Validate as validate() (validate.ts)
    participant Frontmatter as Frontmatter Parser (frontmatter.ts)
    participant FS as File System

    User->>CLI: superskill <type> validate <nameOrPath> --strict --target "..."
    CLI->>Validate: validate(type, nameOrPath, options)
    Validate->>FS: resolveContentPath & read file
    FS-->>Validate: file contents
    Validate->>Frontmatter: parseFrontmatter(contents)
    Frontmatter-->>Validate: parsed YAML data + body text
    Validate->>Validate: Run check suite
    Note over Validate: Categories: 1. File Access, 2. Frontmatter syntax,<br/>3. Required fields, 4. Field types, 5. Target compliance,<br/>6. Reference link validity, 7. Strict styling rules
    Validate-->>CLI: ValidationResult (valid flag & findings)
    CLI-->>User: Print findings and return exit code (0, 1, or 2)
```

---

### 4. `superskill <type> evaluate <nameOrPath>`

#### Briefing
Analyzes resource quality across a type-specific registry of dimensions (e.g., completeness, clarity, trigger accuracy). Outputs a breakdown of scores (from 0.0 to 1.0) along with detailed notes suggesting areas of improvement, together with a consolidated aggregate score. If `--save` is active, it hashes the file content and records the results under the `.superskill/evaluations.db` database.

#### Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant CLI as Command Handler (skill.ts/etc.)
    participant Evaluate as evaluate() (evaluate.ts)
    participant Evaluator as Type Evaluator (quality/*)
    participant DB as SQLite DB (store/*)
    participant FS as File System

    User->>CLI: superskill <type> evaluate <nameOrPath> --save --target "..."
    CLI->>Evaluate: evaluate(type, nameOrPath, options)
    Evaluate->>FS: resolveContentPath & read file
    FS-->>Evaluate: file contents
    Evaluate->>Evaluator: evaluate[Type](content, target)
    Evaluator-->>Evaluate: QualityReport (dimensions & aggregate)
    alt Save is true
        Evaluate->>Evaluate: hashContent(filePath)
        Evaluate->>DB: insertEvaluation(record)
        DB-->>Evaluate: record persisted
    end
    Evaluate-->>CLI: QualityReport
    CLI-->>User: Print formatted evaluation report table
```

---

### 5. `superskill <type> refine <nameOrPath>`

#### Briefing
Implements a validator-evaluator repair loop. Identifies issues via the validation engine and assigns fix strategies (`auto-apply`, `suggest`, or `flag`). Backs up the target file, applies low-risk syntax changes (e.g., correcting frontmatter array nesting or generating missing keys), prompts the user interactively to approve suggestions, and updates the file on disk. A post-verify evaluation is then triggered to calculate and display the quality score improvement delta.

#### Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant CLI as Command Handler (skill.ts/etc.)
    participant Refine as refine() (refine.ts)
    participant Validate as validate() (validate.ts)
    participant Evaluate as evaluate() (evaluate.ts)
    participant Edit as Edit Helper (edit.ts)
    participant FS as File System

    User->>CLI: superskill <type> refine <nameOrPath> --auto --save
    CLI->>Refine: refine(type, nameOrPath, options)
    Refine->>Validate: validate(type, path)
    Validate-->>Refine: ValidationResult
    Note over Refine: If invalid with errors, abort refine
    Refine->>Evaluate: evaluate(type, path)
    Evaluate-->>Refine: Baseline QualityReport
    Refine->>FS: Backup file to [path].bak
    loop Interactive Fix loop (unless --auto is set)
        Refine->>User: Prompt to apply/reject/skip/quit for each finding
        User-->>Refine: Choice (accept / reject / skip / quit)
        alt User accepts
            Refine->>Edit: generateAutoChange & applyChange(content, change)
            Edit-->>Refine: Updated content
        else User quits
            Refine->>FS: Restore from backup file
            Refine-->>User: Terminate refining workflow
        end
    end
    Refine->>FS: writeFileSync(path, updatedContent)
    Refine->>Evaluate: evaluate(type, path)
    Evaluate-->>Refine: Post-refinement QualityReport
    alt Save is true
        Refine->>Evaluate: evaluate(type, path, {save: true, operation: 'refine'})
    end
    Refine-->>CLI: RefineResult (pre/post scores, delta, fixes)
    CLI-->>User: Print score delta and applied fixes
```

---

### 6. `superskill <type> evolve <name>`

#### Briefing
Executes the self-evolution lifecycle. Gathers the historical evaluations of a specific resource to analyze multi-run score trends. If any quality metrics are declining or remain flat below threshold levels, it compiles structural recommendations, writes a markdown proposal draft, and logs it under the proposals store. Through interactive review (or direct `--accept`/`--reject`), the changes are applied to the file, and a verification evaluation is run to ensure performance has improved.

#### Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant CLI as Command Handler (skill.ts/etc.)
    participant Evolve as evolve() (evolve.ts)
    participant DB as SQLite DB (store/*)
    participant Evaluate as evaluate() (evaluate.ts)
    participant Edit as Edit Helper (edit.ts)
    participant FS as File System

    User->>CLI: superskill <type> evolve <name>
    CLI->>Evolve: evolve(type, name, options)
    
    %% Accept/Reject sub-flows
    alt Accept proposal flag (--accept <id>)
        Evolve->>DB: getProposals(type, name)
        DB-->>Evolve: proposals list
        Evolve->>Evolve: find proposal
        Evolve->>FS: Read original file
        FS-->>Evolve: file contents
        Evolve->>Edit: applyChange(content, proposal changes)
        Edit-->>Evolve: Updated content
        Evolve->>FS: Write updated file (transaction candidate)
        Evolve->>Evaluate: evaluate(type, path, {save: true, requireSave: true})
        Evaluate-->>Evolve: Post-evolution report + exact evaluationId
        Evolve->>DB: updateProposalStatus(id, 'accepted', {verify_id: evaluationId})
        Evolve-->>CLI: EvolveResult
    else Reject proposal flag (--reject <id>)
        Evolve->>DB: updateProposalStatus(id, 'rejected')
        Evolve-->>CLI: EvolveResult
    else Standard flow / --propose-only
        Evolve->>DB: getEvaluations(type, name)
        DB-->>Evolve: evaluations history
        Evolve->>Evolve: computeTrends(evaluations)
        Evolve->>Evaluate: evaluate(type, path)
        Evaluate-->>Evolve: Baseline QualityReport
        Evolve->>Evolve: generateChanges(report, trends)
        Evolve->>DB: insertProposal(draft status)
        Evolve->>FS: Write proposal markdown to .superskill/proposals/...
        alt proposeOnly is true
            Evolve-->>CLI: EvolveResult (stop here)
        else Interactive review
            loop Each proposed change
                Evolve->>User: Display trend + change details. Prompt accept/reject/edit/quit
                User-->>Evolve: Choice
                alt Accept or Edit
                    Evolve->>Evolve: Add to accepted changes list
                end
            end
            Evolve->>FS: Read original file
            FS-->>Evolve: file contents
            Evolve->>Edit: applyChange(content, accepted changes)
            Edit-->>Evolve: Updated content
            Evolve->>FS: Write updated file (transaction candidate)
            Evolve->>Evaluate: evaluate(type, path, {save: true, requireSave: true})
            Evaluate-->>Evolve: Post-evolution report + exact evaluationId
            Evolve->>DB: updateProposalStatus(id, 'accepted', {verify_id: evaluationId})
            Evolve-->>CLI: EvolveResult
        end
    end
    CLI-->>User: Output evolution summary & score delta
```

All accept paths use the same proposal transaction. The transaction retains the original file and
keeps the proposal `draft` until apply, build/form/behavior gates, persisted verification, and exact
`verify_id` linkage all succeed. Any thrown step restores the file, removes a partial version
snapshot, and resets the proposal to an unlinked draft (`applied_at` and `verify_id` are cleared).
Only draft proposals may enter the transaction, so re-acceptance cannot overwrite an existing
rollback snapshot. Ingested proposal IDs and CLI proposal IDs are validated as safe path segments,
and ingest acceptance must name the proposal contained in the payload.

---

## Skills-ecosystem operation boundary

`operations.ts` resolves a source once through `parseSource` (ADR-029). Local paths are anchored to
the operation's `cwd`; the resulting `ParsedSource` supplies repository URL, ref, subpath, skill
filter, and source type to both the GitHub blob fast path and clone fallback. Global local locks
persist that anchored absolute path, so later updates do not depend on the caller's directory.

Add/remove treat canonical paths, target paths, and the scoped lock as one logical transaction
(ADR-030). A version-compatible lock is loaded before mutation. Existing filesystem entries move
to same-parent backups; new copies, symlinks, translations, and removals remain reversible until
the lock is atomically replaced from a same-parent temporary file. Failure rolls paths back in
reverse order; success discards backups. Source copies reject symlinks and special files, and
regular files are opened with `O_NOFOLLOW`.

Canonical and blob-snapshot hashes share the ADR-031 encoding: sorted path/content pairs, each
field prefixed by its unsigned 64-bit byte length. This preserves deterministic SHA-256 identity
without concatenation ambiguity.

## Invariants

1. **Single plugin per install.** `superskill install <plugin>` installs exactly one plugin at a time.
2. **Idempotent output.** Running install twice with unchanged input produces identical output files.
3. **No silent data loss.** If a target path is unwritable, the command fails before touching any target.
4. **rulesync owns format knowledge.** superskill never hardcodes a target's file format — it delegates to `rulesync.generate()`.
5. **Pipeline stages are pure functions.** Each transform is a pure `(content: string, …) => string` function (e.g. `translateSlashCommands(content, target)`, `rewriteSkillReferences(content, pluginPrefix)`) — no side effects, no filesystem access. install.ts composes them in order per target.
6. **Transactional closed evolve loop.** A proposal becomes `accepted` only after its candidate
   passes every gate, the verification evaluation is persisted, and that exact inserted evaluation
   ID is linked as `verify_id`; failure restores the file and leaves the proposal `draft`.
7. **Marketplace-relative resolution.** A relative plugin `source` resolves against the marketplace root (the dir containing `.claude-plugin/`), never against `.claude-plugin/` or CWD. A `source` escaping the marketplace root (`../`) or using an object form is rejected, not silently resolved.
8. **Owned hook reconciliation.** Pi and Hermes remove stale entries owned by the plugin across all
   events before adding the desired set. User hooks and hooks owned by other plugins are preserved;
   reinstalling unchanged input is byte-idempotent, including the zero-hook case.
9. **Scoped hook sessions.** Context hook state is stored in `.session-<identity-hash>.json`, keyed
   from payload `session_id` or `transcript_path`. A payload without identity may use the sole active
   session for compatibility; multiple candidates are ambiguous and fail open.
10. **Config precedence is explicit.** CLI marketplace and target flags override JSONC defaults;
    configured plugin paths precede ambient discovery. Feature filters are applied during mapping,
    and native installers reject unsupported partial filters before mutation.
