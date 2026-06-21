# Phase 2 Design — Authoring + Quality Commands

## Goal

Migrate the five meta-agent skills from `cc-agents/plugins/rd3/skills/cc-agents/` into first-class CLI commands, each with create, validate, evaluate, refine, and evolve operations. The key enhancement over the origin Claude Code skills is **self-evolution** — persistent evaluation data drives longitudinal improvement proposals.

## 1. Origin mapping

Each CLI command replaces one Claude Code plugin skill:

| CLI command | Origin skill | Content type operated on |
|-------------|-------------|--------------------------|
| `superskill agent` | `cc-agents` | Subagent definitions (`.md` with YAML frontmatter) |
| `superskill skill` | `cc-skills` | Skill definitions (`SKILL.md` or `.md`) |
| `superskill command` | `cc-commands` | Slash command definitions (`.md` with YAML frontmatter) |
| `superskill hook` | `cc-hooks` | Hook definitions (`.yaml` / `.json`) |
| `superskill magent` | `cc-magents` | Main-agent config files (`AGENTS.md`, `CLAUDE.md`, etc.) |

## 2. Command surface

All five commands share the same subcommand structure:

```
superskill <type> <operation> [target] [options]

  type:      agent | skill | command | hook | magent
  operation: scaffold | validate | evaluate | refine | evolve
  target:    content name or file path
```

Each operation is described below in terms of `skill` — the other four types are structurally identical, with type-specific quality dimensions (see §3).

### 2.1 `scaffold` — generate from template

```
superskill skill scaffold <name> [options]

Options:
  --description <text>  Skill description
  --target <agent>      Generate for a specific agent (default: claude)
  --output <dir>        Write to a directory (default: cwd)
  --template <tier>     Template tier (e.g. minimal / standard / specialist)
  --skills <list>       Comma-separated skill names to pre-populate frontmatter
  --tools <list>        Comma-separated tool names to pre-populate frontmatter
  --force               Overwrite an existing file
```

Creates a new content file from a type-aware template. Templates contain the required
YAML frontmatter structure plus placeholder body sections. `--template` selects a tier
(`--template specialist` resolves `templates/<type>/specialist.md`); omitting it uses
`templates/<type>/default.md`. `--skills`/`--tools` override the template's frontmatter
defaults so the scaffolded artifact starts with the requested skill/tool list.

**Template location**: Shipped with the npm package at `templates/<type>/`. Overridable
by user templates at `~/.superskill/templates/<type>/`. If a user template exists with
the same tier name, it wins.

**What it produces** (for `skill`):
```markdown
---
name: <name>
description: <description or placeholder>
---

# <name>

<!-- TODO: skill body -->
```

### 2.2 `validate` — structural + schema check

```
superskill skill validate <name|path> [options]

Options:
  --strict              Enable all optional checks
  --target <agent>      Validate against a specific agent's format requirements
```

Validates the target file against its content-type schema:

| Check | Description |
|-------|-------------|
| Frontmatter presence | YAML frontmatter block exists and is valid |
| Required fields | `name`, `description` present; type-specific required fields |
| Field types | `allowed-tools` is an array; `model` is a valid value; etc. |
| Format compliance | Matches the target agent's expected format (e.g., Pi frontmatter structure) |
| Link validity | References to other skills/agents resolve |

**Exit codes**: `0` = valid, `1` = validation errors found, `2` = file not found / unreadable.

**Output**: structured JSON or human-readable list of findings.

```json
{
  "valid": false,
  "findings": [
    { "severity": "error", "field": "allowed-tools", "message": "must be an array, got string" },
    { "severity": "warning", "field": "description", "message": "too short (12 chars); minimum recommended: 40" }
  ]
}
```

### 2.3 `evaluate` — quality scoring

```
superskill skill evaluate <name|path> [options]

Options:
  --target <agent>      Evaluate for a specific agent's context
  --json                Output machine-readable JSON
  --save                Persist evaluation result to data store
```

Scores the content across type-specific quality dimensions. Each dimension returns a 0.0–1.0 score and a one-line explanation.

**Example output** (`--json`):
```json
{
  "content": "rd3-tdd-workflow",
  "type": "skill",
  "target": "claude",
  "aggregate": 0.82,
  "dimensions": {
    "completeness": { "score": 0.85, "note": "Missing error-handling guidance" },
    "clarity": { "score": 0.90, "note": "Well-structured sections" },
    "trigger-accuracy": { "score": 0.75, "note": "Trigger phrases overlap with rd3-code-review" },
    "anti-hallucination": { "score": 0.80, "note": "References external APIs without verification step" },
    "conciseness": { "score": 0.80, "note": "Some redundant examples in §3" }
  }
}
```

**`--save`** writes the result to the evaluation data store for longitudinal tracking.

### 2.4 `refine` — evaluate then fix

```
superskill skill refine <name|path> [options]

Options:
  --target <agent>      Refine for a specific agent
  --auto                Apply low-risk fixes automatically (default: interactive)
  --save                Persist the evaluation to the evaluation store
  --dry-run             Preview classified fixes and projected delta without writing
```

Runs `evaluate` on the content, then applies fixes for each finding:

| Fix strategy | When applied |
|-------------|-------------|
| Auto-apply | Structural fixes (add missing frontmatter field, normalize array syntax, fix indentation) |
| Suggest | Content improvements (rewrite ambiguous descriptions, de-duplicate trigger phrases) |
| Flag | Requires human judgment (architecture-level changes, scope decisions) |

In `--auto` mode, only auto-apply fixes are made. In interactive mode (default), the user reviews each suggestion before it's applied. Structural auto-apply fixes (missing required fields) run BEFORE any validation-error early-return: a missing-`description` file is fixed in one step rather than refused. Missing-field defaults are schema-aware and content-derived (`model`→`inherit`, `tools`→`[]`, `description` humanized from `name`), never `TODO`/`default` placeholders — refine is monotonic-or-neutral (post-score ≥ pre-score; if a fix would lower the score, the backup is restored).

`--dry-run` classifies findings and projects the score delta in-memory (no write, no backup); combine with `--auto` to preview the auto-apply set.

After refinements, re-evaluates and shows the score delta.

### 2.5 `evolve` — longitudinal improvement

```
superskill skill evolve <name> [options]

Options:
  --target <agent>      Evolve for a specific agent
  --from <date>         Analyze evaluations since date (default: all history)
  --propose-only        Generate proposal without applying
  --accept <id>         Accept a specific proposal by ID
  --reject <id>         Reject a specific proposal
  --analyze             Print analysis summary (trends, score, data sources) without writing a proposal
  --history             List applied proposal versions from the store
  --rollback <id>       Restore a prior version by proposal_id (requires --confirm)
  --confirm             Confirm a destructive operation (required for --rollback)
  --ingest <file>       Agent-authored proposal JSON (ingest-in mode)
  --json                Output machine-readable JSON (envelope-out with --propose-only)
  --margin <n>          Δ-margin gate threshold for accept (default 0.05)
```

The self-evolution loop:

```
┌──────────────────────────────────────────────────────┐
│  1. ANALYZE historical evaluations for <name>        │
│     └─ Read from SQLite data store                   │
│     └─ Identify trends: improving / declining / flat  │
│     └─ Rank dimensions by delta and lowest score      │
│                                                      │
│  2. PROPOSE improvements                             │
│     └─ For each low-scoring dimension, draft a change │
│     └─ Changes are structured: location, old, new     │
│     └─ Generate a proposal file (proposals/<id>.md)   │
│                                                      │
│  3. REVIEW (interactive or --propose-only)            │
│     └─ User reviews each proposed change              │
│     └─ Accept / edit / reject per change              │
│                                                      │
│  4. APPLY accepted changes                            │
│     └─ Edit the content file in place                 │
│     └─ Record the proposal as accepted/rejected       │
│                                                      │
│  5. VERIFY                                           │
│     └─ Run evaluate on the changed content            │
│     └─ Show score delta from pre-evolution baseline   │
│     └─ Save the post-evolution evaluation             │
└──────────────────────────────────────────────────────┘
```

**Proposal format** (`<data-root>/.superskill/proposals/<content-type>/<name>/YYYY-MM-DD-<seq>.md`, where `<data-root>` is resolved by §10):
```markdown
---
proposal_id: agent-evolve-2026-06-16-001
content: rd3-super-coder
type: agent
baseline_score: 0.72
baseline_date: 2026-06-10
from_evaluations: 5
---

# Evolution Proposal: rd3-super-coder

## Trend analysis

| Dimension | Baseline | Current | Trend |
|-----------|----------|---------|-------|
| role-clarity | 0.65 | 0.85 | ↑ improving |
| tool-selection | 0.70 | 0.68 | → flat |
| skill-linkage | 0.60 | 0.55 | ↓ declining |
| completeness | 0.80 | 0.82 | → flat |
| model-fit | 0.85 | 0.88 | ↑ improving |

## Proposed changes

### 1. Fix declining skill-linkage (score: 0.60 → 0.55)
**Location:** frontmatter `skill:` field
**Current:** `skill: rd3-code-review`
**Proposed:** `skill: rd3-code-review-common`
**Reason:** The referenced skill was renamed in the plugin; evaluations after the rename show the stale reference.

### 2. Improve tool-selection (score: 0.70 → 0.68)
...
```

## 3. Quality dimensions by content type

### Skill dimensions

| Dimension | What it measures |
|-----------|-----------------|
| `completeness` | Are all required sections present? Is the skill self-contained? |
| `clarity` | Are instructions unambiguous? Can an agent follow them without interpretation? |
| `trigger-accuracy` | Do trigger phrases uniquely identify this skill? Any overlaps with sibling skills? |
| `anti-hallucination` | Does the skill instruct verification-before-generation? Are external references cited? |
| `conciseness` | Is every sentence load-bearing? Are there filler phrases? |

### Command dimensions

| Dimension | What it measures |
|-----------|-----------------|
| `completeness` | Required frontmatter fields present? Body covers the full workflow? |
| `clarity` | Instructions unambiguous for agents? |
| `argument-hints` | Are argument hints present and correctly typed? |
| `tool-references` | Are referenced tools available? Any undefined tools? |
| `slash-syntax` | Is slash-command dialect correct for each target agent? |

### Subagent dimensions

| Dimension | What it measures |
|-----------|-----------------|
| `completeness` | Required fields (name, description, tools, model)? System prompt coherent? |
| `role-clarity` | Does the agent's role statement produce the right persona? |
| `tool-selection` | Are selected tools sufficient? Any unnecessary tools? |
| `skill-linkage` | Do referenced skills resolve? Are skill references up to date? |
| `model-fit` | Is the model choice appropriate for the agent's task complexity? |

### Hook dimensions

| Dimension | What it measures |
|-----------|-----------------|
| `correctness` | Valid hook event types? Correct JSON/YAML structure? |
| `event-coverage` | Are all relevant events handled? Any gaps? |
| `safety` | Are destructive operations gated? Is approval policy explicit? |
| `pattern-match-quality` | Are match patterns specific enough? Any overly broad matchers? |

### Magent dimensions

| Dimension | What it measures |
|-----------|-----------------|
| `completeness` | All four config sections present (IDENTITY, SOUL, AGENTS, USER)? |
| `platform-coverage` | Does the config cover all target platforms? Per-platform overrides present where needed? |
| `conciseness` | Is content token-efficient? Any redundant sections? |
| `tone-consistency` | Does the tone contract match across sections? |
| `safety` | Are safety boundaries explicit? Critical sections properly marked? |

## 4. Data store

SQLite database at `~/.superskill/evaluations.db` (or `<project>/.superskill/evaluations.db` for project-local). **Accessed exclusively through `@gobing-ai/ts-db` (ADR-014)** — `createDbAdapter({ driver: 'bun-sqlite' })` + `applyMigrations`, with tables authored via `defineTable` and CRUD via `EntityDao` subclasses. No superskill code touches `bun:sqlite` directly or writes raw DDL/SQL.

### Schema

The SQL below is the **logical** schema for reference; the actual tables are derived from `defineTable` definitions in `store/schema.ts` (single source of truth — drizzle table + zod schemas + generated DDL). `evaluations` uses `appendOnlyColumns` (created_at only); `proposals` uses `standardColumns` (created_at + updated_at, since status transitions mutate the row).

```sql
-- Evaluation records (logical view; generated by defineTable, not hand-written)
CREATE TABLE evaluations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  content_type  TEXT NOT NULL,        -- 'skill' | 'command' | 'agent' | 'hook' | 'magent'
  content_name  TEXT NOT NULL,        -- e.g. 'rd3-tdd-workflow'
  target_agent  TEXT NOT NULL,        -- 'claude' | 'codex' | 'pi' | …
  operation     TEXT NOT NULL,        -- 'evaluate' | 'refine' | 'evolve'
  aggregate     REAL NOT NULL,        -- 0.0–1.0
  dimensions    TEXT NOT NULL,        -- JSON: {"dim1": {"score": 0.8, "note": "…"}, …}
  file_hash    TEXT,                 -- SHA-256 of content at evaluation time
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_eval_content ON evaluations(content_type, content_name);
CREATE INDEX idx_eval_date ON evaluations(created_at);

-- Evolution proposals
CREATE TABLE proposals (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  content_type  TEXT NOT NULL,
  content_name  TEXT NOT NULL,
  baseline_id   INTEGER REFERENCES evaluations(id),
  proposal_json TEXT NOT NULL,        -- Full proposal as JSON (changes, reasoning)
  status        TEXT NOT NULL DEFAULT 'draft',  -- 'draft' | 'accepted' | 'rejected'
  applied_at    TEXT,
  verify_id     INTEGER REFERENCES evaluations(id),  -- post-apply evaluation
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_proposal_content ON proposals(content_type, content_name);
```

### Usage patterns (all via ts-db DAOs, `await`ed)

- `evaluate --save` → `EvaluationDao.insertEvaluation(...)`
- `evolve` → `EvaluationDao.getEvaluations(type, name)` (ordered by `created_at` via the predicate query spec)
- `evolve` → `ProposalDao.insertProposal(...)` on generation; `updateProposalStatus(...)` on accept/reject
- Post-evolution verify → `EvaluationDao.insertEvaluation({ operation: 'evolve', ... })`, then `ProposalDao.updateProposalStatus(id, 'accepted', { verifyId })`

## 5. Template system

Templates live at two levels:

| Level | Path | Purpose |
|-------|------|---------|
| Built-in | `<npm-package>/templates/<type>/` | Shipped defaults, cannot be edited in place |
| User | `~/.superskill/templates/<type>/` | Overrides; created by `scaffold --save-template` |

Template files are Markdown with `<!-- VARIABLE -->` placeholders:

```markdown
---
name: <!-- NAME -->
description: <!-- DESCRIPTION -->
---

# <!-- NAME -->

<!-- BODY -->
```

**`scaffold` resolution order**: user template with matching name → built-in template with matching name → built-in `default.md`.

## 6. Code layout

```
apps/cli/src/
├── cli.ts                        # Commander entry: registers all subcommands
│
├── content/                      # Phase 2 shared foundation (see §9) — owned by F007
│   ├── frontmatter.ts            # parseFrontmatter / applyFrontmatterChange (yaml, round-trip)
│   ├── identity.ts               # resolveContentName, resolveContentPath
│   ├── hash.ts                   # hashContent (SHA-256)
│   ├── edit.ts                   # applyChange — single mutation primitive (refine + evolve)
│   └── paths.ts                  # getDataRoot, getDBPath, getProposalsDir
│
├── commands/
│   ├── install.ts                # Phase 1 — install command
│   ├── list.ts                   # Phase 1 — list command
│   ├── doctor.ts                 # Phase 1 — doctor command
│   ├── init.ts                   # Phase 1 — init command
│   │
│   ├── helpers.ts                # Phase 2 — shared opts + exit-code mapping + resolveTarget (F014)
│   ├── agent.ts                  # Phase 2 — superskill agent
│   ├── skill.ts                  # Phase 2 — superskill skill
│   ├── command.ts                # Phase 2 — superskill command
│   ├── hook.ts                   # Phase 2 — superskill hook
│   └── magent.ts                 # Phase 2 — superskill magent
│
├── operations/
│   ├── scaffold.ts               # Template-based content generation
│   ├── validate.ts               # Structural + schema validation
│   ├── evaluate.ts               # Quality scoring engine
│   ├── refine.ts                 # Evaluate → fix pipeline
│   └── evolve.ts                 # Longitudinal improvement engine
│
├── quality/
│   ├── dimensions.ts             # Dimension definitions per content type
│   ├── skill.ts                  # Skill-specific evaluators
│   ├── command.ts                # Command-specific evaluators
│   ├── agent.ts                  # Agent-specific evaluators
│   ├── hook.ts                   # Hook-specific evaluators
│   └── magent.ts                 # Magent-specific evaluators
│
├── store/                        # ts-db facade only — no bun:sqlite (ADR-014)
│   ├── schema.ts                 # defineTable: evaluations + proposals (SSOT: table+zod+DDL)
│   ├── db.ts                     # createDbAdapter(bun-sqlite) + applyMigrations
│   ├── evaluations.ts            # EvaluationDao (EntityDao subclass)
│   └── proposals.ts              # ProposalDao (EntityDao subclass)
│
└── templates/
    ├── skill/
    │   └── default.md
    ├── command/
    │   └── default.md
    ├── agent/
    │   └── default.md
    ├── hook/
    │   └── default.md
    └── magent/
        └── default.md
```

## 7. Dependencies to add

```jsonc
// apps/cli/package.json dependencies to add in Phase 2:
{
  "dependencies": {
    // (Phase 1 deps carried forward)
    "yaml": "^2.9.0",            // round-tripping frontmatter parse/edit — ADR-012
    "@gobing-ai/ts-db": "^0.3.19", // data-access facade for the store — ADR-014
    "drizzle-orm": "^0.45.0",     // ts-db required peer
    "drizzle-zod": "^0.5.0",      // ts-db optional peer (defineTable DDL + validation)
    "zod": "^3.23.0"              // ts-db optional peer (boundary validation)
  }
}
```

Two foundations are declared:

- **`yaml`** (`^2.9.0`) — Phase 1's `pipeline/frontmatter.ts` is a regex injector that cannot read frontmatter as a typed object; `validate` needs field-type checks and `refine`/`evolve` need parse → mutate → serialize with comment preservation (`parseDocument`). ADR-012.
- **`@gobing-ai/ts-db`** + its peers — the store uses the ts-db facade (typed DAOs, predicate query spec, migrations), **not** `bun:sqlite` directly, per ADR-007/ADR-014. `bun:sqlite` remains an internal detail of ts-db's `bun-sqlite` adapter.

All of these (`yaml@2.9.0`, `@gobing-ai/ts-db@0.3.19`, `drizzle-orm@0.45.2`, `zod@3.25.76`) are **already resolved in the tree transitively**, so declaring them directly adds no new package — it only makes the dependence explicit. The earlier "no new external packages / `bun:sqlite` is built-in" claim was wrong for Phase 2 and is superseded by ADR-012 and ADR-014.

Template files ship with the npm package (add `templates/` to `package.json` `"files"`). Quality dimension evaluation is heuristic-based initially; ML-augmented scoring is deferred.

## 8. Acceptance criteria

```
# scaffold
superskill skill scaffold my-skill --description "Does X"
# → writes ./my-skill.md with valid frontmatter and placeholder body
# → exit 0

# validate (passing)
superskill skill validate my-skill
# → "Valid" → exit 0

# validate (failing)
superskill skill validate broken-skill
# → Lists errors → exit 1

# evaluate
superskill skill evaluate my-skill --json --save
# → JSON with dimension scores → exit 0
# → Row inserted in evaluations table

# refine (auto)
superskill skill refine my-skill --auto --save
# → Applies structural fixes → re-evaluates → shows delta → exit 0
# refine (dry-run preview)
superskill skill refine my-skill --dry-run
# → Lists classified fixes + projected delta → writes nothing → exit 0

# evolve (full loop)
superskill skill evolve my-skill
# 1. Analyzes 5 historical evaluations
# 2. Proposes 2 changes (1 auto, 1 suggested)
# 3. User accepts both
# 4. Content updated in place
# 5. Post-evolution score: 0.82 → 0.89
# → exit 0

# evolve (propose-only)
superskill skill evolve my-skill --propose-only
# → Generates proposal file → exit 0 (no changes applied)
```

## 9. Shared foundation (F007)

Five operations and five quality evaluators all read frontmatter, derive a content name, hash files, and (for refine/evolve) mutate content. Implementing those primitives per-operation would produce divergent parsers across features built in parallel. They live in `apps/cli/src/content/`, owned by F007, and are consumed by F009–F013.

| Module | Export | Contract |
|--------|--------|----------|
| `content/frontmatter.ts` | `parseFrontmatter(content: string): { data: Record<string, unknown>, body: string, raw: string }` | Splits the `---`-delimited block; `data` is the parsed object (`yaml.parse`), `body` is everything after, `raw` is the original frontmatter text. Throws `FrontmatterError` on malformed YAML (callers convert to a validation finding). |
| `content/frontmatter.ts` | `applyFrontmatterChange(content: string, mutate: (doc: yaml.Document) => void): string` | Round-trips via `yaml.parseDocument` so comments and key order survive. |
| `content/identity.ts` | `resolveContentName(path: string): string` | Strips directory and `.md`; `SKILL.md` → parent dir name. The canonical `content_name` for store rows, queries, and proposal paths. |
| `content/identity.ts` | `resolveContentPath(type: ContentType, name: string, opts: { target?: Target }): string` | Name → file path. Looks in cwd, then target-specific locations. If `name` is already a path to an existing file, returns it unchanged. |
| `content/hash.ts` | `hashContent(filePath: string): string` | SHA-256 hex of the file bytes (`Bun.CryptoHasher` / `node:crypto`). The single source of `file_hash`. |
| `content/edit.ts` | `applyChange(content: string, change: Change): string` | The **one** mutation primitive used by both refine and evolve. `Change` is `{ kind: 'frontmatter', key, value }` (round-trip edit) or `{ kind: 'text', current, proposed }` (locate + replace nearest match). |
| `content/paths.ts` | `getDataRoot(opts?: { projectRoot?: string }): string` | Returns `<projectRoot>` when given; else `<cwd>` if `<cwd>/.superskill/` exists; else `homedir()`. The single store/proposals location rule (ADR-013). |
| `content/paths.ts` | `getDBPath(opts?)`, `getProposalsDir(opts?)` | Derived from `getDataRoot`: `<root>/.superskill/evaluations.db`, `<root>/.superskill/proposals/`. |

**Output convention:** all Phase 2 commands write user output through `process.stdout.write` (directly or via the `echo` helper already used in Phase 1), never `console.log`, so `process.stdout.write` spies in tests capture every line (matches the Phase 1 testing convention).

## 10. Storage + identity conventions (ADR-013)

- **Data root** (`getDataRoot`): `<cwd>/.superskill/` if it exists, else `~/.superskill/`. `--project` / `projectRoot` forces project-local.
- **`content_name`**: always `resolveContentName(path)` — directory-stripped, extension-stripped. `evaluate --save` and `evolve` MUST use the identical string or the longitudinal join returns nothing.
- **`target_agent`**: never null; defaults to `'claude'` when `--target` is omitted. The store column stays `NOT NULL`.
- **`file_hash`**: `hashContent()` (SHA-256), set on every persisted evaluation.
- **`operation`**: a parameter of `insertEvaluation` — `evaluate` writes `'evaluate'`, `refine` writes `'refine'`, the evolve verify step writes `'evolve'`. Not hard-coded in `evaluate`.
- **Proposal path**: `<data-root>/.superskill/proposals/<type>/<name>/YYYY-MM-DD-<seq>.md` (always includes the `<type>/` segment).
