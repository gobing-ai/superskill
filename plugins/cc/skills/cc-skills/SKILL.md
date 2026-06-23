---
name: cc-skills
description: Create, modify, evaluate, and evolve Agent skills. This skill should be used when you want to scaffold a new skill directory, validate skill structure across multiple platforms, generate platform-specific companion files, or run a governed evolution workflow with proposal history and rollback.
license: Apache-2.0
metadata:
  author: cc-agents
  version: "3.0.0"
  platforms: "claude-code,codex,antigravity,opencode,openclaw"
  openclaw:
    emoji: "🛠️"
    requires:
      bins:
        - bun
  interactions:
    - generator
    - reviewer
    - pipeline
  severity_levels:
    - error
    - warning
    - info
  pipeline_steps:
    - create
    - validate
    - evaluate
    - refine
    - evolve
---

# cc-skills: Universal Skill Creator
<!-- eval-ignore-platform -->

Create Agent skills that work across ALL platforms from a single source of truth.

## Operations
This skill accepts **5 operations**:

| Operation | Purpose | CLI |
|-----------|---------|--------|
| **add** | Scaffold a new skill | `superskill skill scaffold` |
| **validate** | Check skill structure and frontmatter | `superskill skill validate` |
| **evaluate** | Validate and score skill quality (rubric-driven two-call seam) | `superskill skill evaluate` |
| **refine** | Fix issues and improve quality | `superskill skill refine` |
| **evolve** | Propose and apply longitudinal improvements (persona-driven two-call seam) | `superskill skill evolve` |

## Workflow Design

Each operation has a **step-by-step workflow** combining CLI operations and checklists.
LLM content improvement is embedded in the normal workflow; it is not a separate `--llm-eval` command mode.

### Task-Backed Execution

When a `cc-skills` workflow is tracked in a task file under `docs/tasks/`, do not mutate the task
record with isolated `tasks update --section ...` or `tasks update --phase ...` calls when a
canonical lifecycle operation exists.

Use the predefined `cc:tasks` lifecycle operations:

- `create`
- `planning`
- `design`
- `implementation`
- `review`
- `testing`

Each operation defines the required section updates, `impl_progress` target, and `status` target.
Follow the full command bundle for the operation rather than changing only one field.

### Workflow Components

| Component | Purpose | Examples |
|-----------|---------|----------|
| **CLI operations** | Deterministic tasks | File creation, validation, companion generation |
| **Checklists** | Fuzzy verification | Imperative form, description clarity, voice |

### Workflow Flow Pattern

Each workflow follows this pattern:

1. **Step 1 → Step 2 → Step 3 → Step 4**
2. Each step specifies its handler (CLI or checklist)
3. **Branching**: If step fails, go back to X
4. **Retry**: Max 3 retries per step

**See [references/workflows.md](references/workflows.md)** for:
- Visual flow diagrams
- Step-by-step tables with handlers
- Success/failure criteria
- Mandatory checklist items
- Retry policies

### Two-Call Seam Pattern

The **evaluate** and **evolve** operations use a two-call seam pattern that separates deterministic CLI envelope emission from persona-driven LLM judgment. This is the primary workflow — the deterministic heuristic path remains as a fallback when no rubric or persona is available.

**Evaluate seam (Scorer):**
1. **Envelope-out:** `superskill skill evaluate <name> --rubric <file> --json` — emits `{ type, content_name, target, content, rubric, baseline }` as JSON. No scoring, no DB write.
2. **Scorer persona:** reads the envelope, scores each dimension against the rubric criterion, produces `{ rubric_version, dimensions: { name: { score, note } } }`.
3. **Ingest-in:** `superskill skill evaluate <name> --ingest <scores.json> --save` — validates agent-produced scores against rubric schema, persists as evaluation row (tagged `scorer: rubric`).

**Evolve seam (Author → Skeptic → Judge):**
1. **Envelope-out:** `superskill skill evolve <name> --propose-only --json` — emits `{ trends, baseline, rubric, briefs }` as JSON. Each brief carries the immutable goal anchor (frontmatter + rubric criterion + negative constraints) **verbatim** + an `anchor_hash`. No DB write, no model call.
2. **Author persona:** reads briefs, rewrites content per dimension, produces `ProposedChange[]` with real `proposed` text + `anchor_hash`.
3. **Skeptic persona:** receives the proposal + the **verbatim** goal anchor, checks for violations/omissions, produces `{ ok, violations[] }`.
4. **Judge persona (if multiple candidates):** pairwise tournament comparison, selects the winner.
5. **Ingest-in:** `superskill skill evolve <name> --ingest <proposal.json> --accept <id>` — CLI double-loop gate decides: deterministic validate-zero-errors + Δ-margin + anchor-hash match + skeptic veto. Failing any gate → proposal stays `draft`, file restored.
6. **Optional empirical gate:** `superskill skill evolve <name> --ingest <proposal.json> --accept <id> --eval-gate` additionally replays `skills/<name>/eval/cases.yaml` holdout cases and accepts only if candidate behavior strictly improves by the configured margin. Use this only for high-value, frequently-run skills with stable checkable references; it is not a default requirement for every skill.

### Goal-Anchor Verbatim Discipline

Persona prompts MUST pass the original instructions + negative constraints **verbatim** to Skeptic/Judge. No compaction, no summarization, no paraphrasing of the goal anchor. The CLI gate (F024) enforces via `anchor_hash` — if the agent strips or alters the anchor, the hash won't match and the gate rejects. Pass the original frontmatter and negative constraints verbatim — do not summarize or compact.

## Quick Start

```sh
# Add: Initialize a new skill
superskill skill scaffold my-skill --output ./skills

# Add with a description
superskill skill scaffold my-skill --output ./skills --description "Skill description"

# Evaluate: envelope-out → Scorer → ingest-in
superskill skill evaluate ./skills/my-skill --rubric <file> --json
# ... Scorer persona scores offline ...
superskill skill evaluate ./skills/my-skill --ingest <scores.json> --save

# Refine: Apply deterministic fixes (fuzzy checks via invoking agent checklist)
superskill skill refine ./skills/my-skill --auto --save

# Evolve: envelope-out → Author → Skeptic → Judge → ingest-in
superskill skill evolve my-skill --propose-only --json
# ... Author rewrites, Skeptic refutes, Judge selects ...
superskill skill evolve my-skill --ingest <proposal.json> --accept <id>
```

## Core Principles

### Single Source of Truth

ONE SKILL.md file contains all core logic. Platform companions (like `agents/openai.yaml`) are additive, not alternative versions.

### Universal Compatibility

Skills work across 30+ agents that support the agentskills.io format. The base format (`name` + `description` in YAML frontmatter) is portable everywhere.

### Progressive Disclosure

Skills use 3-tier loading:
1. **Metadata** - name + description (~100 tokens, always loaded)
2. **SKILL.md body** - Instructions (<500 lines, loaded on trigger)
3. **References** - Detailed docs (loaded on demand)

### Fat Skills, Thin Wrappers

All coding agents support agent skills now, but slash commands and subagents are not universally supported. So we **MUST** follow these principles:

- **Skills** = core logic, workflows, domain knowledge (source of truth)
- **Commands** = ~50 line wrappers invoking skills for humans
- **Agents** = ~100 line wrappers invoking skills for AI workflows

### Circular Reference Rule
Skills MUST NOT reference their associated agents or commands. This includes:

- ❌ Bad: `See also: my-agent, /plugin:my-command`
- ❌ Bad: Commands Reference section listing `/cc:skill-*` commands
- ✅ Good: `This skill provides workflows for X.`

If you need command examples, reference generic patterns without specific command names (e.g., "Use Task() to delegate to specialist agents" instead of "/cc:skill-add").

## Skill Types

| Type | Use When | Structure |
|------|----------|-----------|
| **Technique** | Follow concrete steps | Steps, code, mistakes |
| **Pattern** | Think about problems | Principles, when/when-not |
| **Reference** | Look up APIs/docs | Tables, searchable |

Choose based on content:
- Has steps? -> Technique
- Mental model? -> Pattern
- Lookup data? -> Reference

See [references/skill-patterns.md](references/skill-patterns.md) for advanced workflow patterns.

## Interaction Patterns (ADK)

ADK interaction patterns describe **runtime behavior**, not content structure.

Use them alongside skill types:
- **Type** answers: what does the skill contain?
- **Interaction pattern** answers: how should the skill behave?

Supported patterns:
- **Tool Wrapper**: load references or conventions on demand
- **Generator**: fill templates into structured output
- **Reviewer**: apply a rubric or checklist and return findings
- **Inversion**: ask questions before acting
- **Pipeline**: enforce ordered stages with gates

These patterns compose. A skill can combine them, such as:
- `["inversion", "generator"]` for requirement interview then document generation
- `["pipeline", "reviewer"]` for staged execution with a final audit

Add them in frontmatter under `metadata.interactions` when they materially describe the skill's behavior.

See [references/skill-patterns-adk.md](references/skill-patterns-adk.md) for the decision tree, composition guidance, and mapping to cc workflow heuristics.

## Directory Structure

```
skill-name/
├── SKILL.md                    # SINGLE SOURCE OF TRUTH (required)
│   ├── YAML frontmatter (name, description required)
│   └── Markdown instructions
│
├── agents/
│   └── openai.yaml             # Codex UI metadata (auto-generated)
│
├── extensions/                 # Optional executable helpers
├── references/                 # Documentation
└── assets/                     # Output files (templates, images)
```

## Platform Adapters

| Platform | Extensions | Companion Files | Validates |
|----------|------------|-----------------|-----------|
| **Claude Code** | Inline command syntax, argument placeholders, forked context mode, hooks | None (native) | Frontmatter, structure, syntax compatibility |
| **Codex** | `agents/openai.yaml` (UI metadata) | agents/openai.yaml | openai.yaml format, agent metadata |
| **OpenClaw** | Frontmatter `openclaw` metadata (emoji, requires) | None (embedded) | frontmatter `openclaw` metadata, emoji, requirements |
| **OpenCode** | Config-level `permission.skill` | None (hints only) | Permission hints, configuration |
| **Antigravity** | Gemini CLI compatible | None (validates) | Gemini CLI compatibility |

## Detailed Workflows

For complete workflow definitions with certainty/uncertainty split and checklists:

**See [references/workflows.md](references/workflows.md)**

## Advanced

### Custom Templates

Create custom templates in `assets/templates/` with the following structure:

```
assets/templates/
├── my-template/
│   ├── SKILL.md.template
│   └── config.json
```

## Platform Notes

### Claude Code
- Use Claude inline command execution syntax for live shell commands
- Use Claude argument placeholders to reference command-line arguments from the user
- Use Claude forked context mode for parallel reasoning in separate context
- Use Claude `hooks:` frontmatter for pre/post tool execution automation
- **Note**: These features are Claude-specific and not available on other platforms

### Codex / OpenClaw / OpenCode / Antigravity
- Run commands via Bash tool: use standard shell commands
- Arguments are provided directly in chat, not via Claude argument placeholders
- Platform companions (`openai.yaml`, OpenClaw metadata) are auto-generated

## Best Practices

Follow these best practices to create effective, maintainable skills. See [references/best-practices.md](references/best-practices.md) for the complete guide.

### Core Principles

- **Concise is Key**: Challenge each piece of information - does Claude really need this?
- **Set Degrees of Freedom**: Match specificity to task fragility (High/Medium/Low)
- **Test with Target Models**: Works differently on Haiku vs Sonnet vs Opus
- **CLI vs LLM**: Use `superskill skill` for deterministic lifecycle operations, LLM guidance for fuzzy issues (see workflows.md)

<!-- Full best practices moved to references/best-practices.md -->

## Evaluation Dimensions

Skills are scored across **5 dimensions** — completeness, clarity, trigger-accuracy, anti-hallucination, and conciseness — using rubric-weighted heuristics (see `superskill skill evaluate`). The canonical rubric at `packages/core/src/rubrics/skill.yaml` owns each dimension's weight and criterion; read it there. Do not restate weights here — they drift.

Verdict: **PASS** (≥0.70) / **FAIL** (<0.70). Grade: A (≥0.90) / B (0.75–0.89) / C (0.60–0.749) / D (0.45–0.599) / F (<0.45).

The rubric scoring seam: heuristic dimension scores (deterministic) → rubric weights → aggregate + verdict. For LLM-scored enrichment: envelope-out → Scorer → ingest-in path. See [references/evaluation-framework.md](references/evaluation-framework.md) for the two-call seam, rubric resolution tiers, and persistent evaluation history.

### Source-Grounding Discipline (anti-drift)

A skill that documents code MUST point to the source, not restate it — restated facts drift
out of sync silently and the content heuristics cannot detect the rot. When authoring or
refining any skill body:

- **Cite, do not copy.** Reference the owning file (`packages/core/src/rubrics/<type>.yaml`,
  a `path.ts:line`, or a named symbol) instead of inlining its dimension counts, weights,
  field lists, or type shapes. The cited file is the single source of truth.
- **Every citation must resolve.** A `path:line` must name a real file with the line in range;
  a cited symbol must exist in the cited source. Verify before writing — a dead citation
  actively misleads.
- **Dimension counts come from the rubric.** State "scored across the dimensions in
  `<type>.yaml`," not a hardcoded number — the count changes when the rubric changes.

A CI gate (`skill-citations-resolve`, in the post-check preset) fails the build on dead
citations and on dimension claims that disagree with the rubric a skill documents.

## Additional Resources

- **Workflows**: [references/workflows.md](references/workflows.md) - Detailed operation workflows
- **Security Guidelines**: [references/security.md](references/security.md) - Security checklist and patterns
- **Best Practices Guide**: [references/best-practices.md](references/best-practices.md)
- **Platform Adapters Guide**: [adapters/README.md](adapters/README.md)
- **Evaluation Framework**: [references/evaluation-framework.md](references/evaluation-framework.md)
- **Platform Compatibility**: [references/platform-compatibility.md](references/platform-compatibility.md)
- **Skill Categories**: [references/skill-categories.md](references/skill-categories.md) - 9 business-purpose categories (what to build)
- **Skill Patterns**: [references/skill-patterns.md](references/skill-patterns.md) - Six proven patterns for complex skills
- **Troubleshooting**: [references/troubleshooting.md](references/troubleshooting.md) - Common issues and fixes
- **Output Patterns**: [references/output-patterns.md](references/output-patterns.md) - Output formatting guidance
- **Quick Reference**: [references/quick-reference.md](references/quick-reference.md) - CLI commands and checklists
- **Skill Creation**: [references/skill-creation.md](references/skill-creation.md) - Step-by-step creation guide
