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
```

Creates a new skill file from a template. Templates are content-type-aware and contain the required YAML frontmatter structure plus placeholder body sections.

**Template location**: Shipped with the npm package at `templates/<type>/`. Overridable by user templates at `~/.superskill/templates/<type>/`. If a user template exists with the same name, it wins.

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
  --save                Persist evaluation result
```

Runs `evaluate` on the content, then applies fixes for each finding:

| Fix strategy | When applied |
|-------------|-------------|
| Auto-apply | Structural fixes (add missing frontmatter field, normalize array syntax, fix indentation) |
| Suggest | Content improvements (rewrite ambiguous descriptions, de-duplicate trigger phrases) |
| Flag | Requires human judgment (architecture-level changes, scope decisions) |

In `--auto` mode, only auto-apply fixes are made. In interactive mode (default), the user reviews each suggestion before it's applied.

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

**Proposal format** (`proposals/<content-type>/<name>/YYYY-MM-DD-<id>.md`):
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

SQLite database at `~/.superskill/evaluations.db` (or `<project>/.superskill/evaluations.db` for project-local).

### Schema

```sql
-- Evaluation records
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

### Usage patterns

- `evaluate --save` inserts a row into `evaluations`
- `evolve` queries `evaluations` for the given `(content_type, content_name)` ordered by `created_at`
- `evolve` writes a `proposals` row on proposal generation; updates status on accept/reject
- Post-evolution `evaluate --save` links back to the proposal via `verify_id`

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
├── commands/
│   ├── install.ts                # Phase 1 — install command
│   ├── list.ts                   # Phase 1 — list command
│   ├── doctor.ts                 # Phase 1 — doctor command
│   ├── init.ts                   # Phase 1 — init command
│   │
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
├── store/
│   ├── db.ts                     # SQLite open + migration
│   ├── evaluations.ts            # Evaluation CRUD
│   └── proposals.ts              # Proposal CRUD
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
  // (Phase 1 deps carried forward)
  // No additional external deps — bun:sqlite is built-in
}
```

No new external packages. `bun:sqlite` is built into Bun. Template files ship with the npm package (configured via `package.json` `"files"` array). Quality dimension evaluation can be heuristic-based initially; ML-augmented scoring is deferred.

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
