---
name: cc-commands
description: Create, validate, evaluate, refine, and evolve slash commands across platforms. Use for scaffolding new commands, validating structure, evaluating quality, refining based on feedback, planning longitudinal improvements, or generating cross-platform equivalents.
license: Apache-2.0
metadata:
  author: cc-agents
  version: "3.0.0"
  platforms: "claude-code,codex,gemini,openclaw,opencode,antigravity"
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

# cc-commands: Universal Command Creator

Create and manage slash commands that work across multiple agent platforms.

## Overview

This skill provides a complete pipeline for slash command development:
- **Scaffold** new commands from templates
- **Validate** structure and frontmatter
- **Evaluate** quality across 10 dimensions
- **Refine** based on evaluation feedback

| Operation | Purpose | CLI |
|-----------|---------|--------|
| **scaffold** | Create new command from template | `superskill command scaffold` |
| **validate** | Check structure and frontmatter | `superskill command validate` |
| **evaluate** | Score quality via two-call seam (envelope-out → Scorer → ingest-in) | `superskill command evaluate` |
| **refine** | Fix issues and improve quality | `superskill command refine` |
| **evolve** | Propose/accept longitudinal improvements via two-call seam (envelope-out → Author → Skeptic → Judge → ingest-in) | `superskill command evolve` |

## When to Use

Use for:
- Creating a new slash command from scratch
- Validating command structure and frontmatter
- Evaluating command quality across 10 dimensions
- Refining commands based on evaluation feedback
- Planning longitudinal improvement proposals

## Quick Start

```bash
# Scaffold a new command
superskill command scaffold my-command --output ./commands

# Validate command structure
superskill command validate ./commands/my-command.md

# Evaluate: envelope-out → Scorer → ingest-in
superskill command evaluate ./commands/my-command.md --rubric <file> --json
# ... Scorer persona scores offline ...
superskill command evaluate ./commands/my-command.md --ingest <scores.json> --save

# Refine command based on evaluation
superskill command refine ./commands/my-command.md --auto --save

# Evolve: envelope-out → Author → Skeptic → Judge → ingest-in
superskill command evolve my-command --propose-only --json
# ... Author rewrites, Skeptic refutes, Judge selects ...
superskill command evolve my-command --ingest <proposal.json> --accept <id>
```

## Core Principles

### Fat Skills, Thin Wrappers

All coding agents support agent skills now, but slash commands and subagents are not universally supported. So we **MUST** follow these principles:

- **Skills** = core logic, workflows, domain knowledge (source of truth)
- **Commands** = ~50-150 line wrappers invoking skills for humans
- **Subagents** = ~100 line wrappers invoking skills for AI workflows

**Circular Reference Rule**: Commands MUST NOT reference their associated agents or skills by name. This includes:

- ❌ Bad: `Use the super-coder agent` or `See also: my-skill`
- ❌ Bad: Commands Reference section listing `/cc:command-*` commands
- ✅ Good: `Delegate to a coding agent` or `Use Skill() for domain workflows`

Reference generic patterns without specific command names (e.g., "Use Task() to delegate to specialist agents" instead of "/cc:skill-add").

### Strict Frontmatter

Commands have exactly 5 valid frontmatter fields: `description`, `allowed-tools`, `model`, `argument-hint`, `disable-model-invocation`. Any other field is an error.

### Argument Hint Best Practices

The `argument-hint` field provides the user interface for invoking commands. **Always show valid options** instead of generic placeholders:

| Instead of | Use |
|------------|-----|
| `--target <name>` | `--target all\|claude\|codex\|gemini\|openclaw\|opencode\|antigravity` |
| `--output <dir>` | `--output ./commands\|./plugins/cc/commands` |

This helps users know available options without consulting documentation.

### Imperative Form

Write instructions FOR Claude, not messages TO the user. Use imperative form ("Review the code") not second-person ("Avoid second-person phrasing").

### Wrapped Skill Declaration

At the beginning of each command, **explicitly declare** the skill being wrapped:

```markdown
# Command Name

Wraps **cc:cc-skills** skill.

<description>
```

This ensures users know which underlying skill handles the operation.

### Arguments Table with Defaults

When documenting arguments, **always include a Default column**:

```markdown
## Arguments

| Argument | Description | Default |
|----------|-------------|---------|
| `skill-path` | Path to the skill | (required) |
| `--target` | Target platform | claude |
| `--json` | JSON output | false |
```

This helps users understand which arguments are optional and their default behavior.

## Command Types

| Type | Template | Use When |
|------|----------|----------|
| **Simple** | `simple.md` | Direct instructions, no delegation |
| **Workflow** | `workflow.md` | Multi-step with Task()/Skill() pseudocode |
| **Plugin** | `plugin.md` | Uses CLAUDE_PLUGIN_ROOT for portable plugin paths |

### Template Placeholders

When using templates, replace these placeholders:

| Placeholder | Description |
|--------------|-------------|
| `{{COMMAND_TITLE}}` | Title of the command (e.g., "Skill Add") |
| `{{DESCRIPTION}}` | Short description (under 60 chars, start with verb) |
| `{{ARGUMENT_HINT}}` | CLI argument hint showing all options |
| `{{TARGET_SKILL}}` | Skill being wrapped (e.g., "cc:cc-skills") |
| `{{PLUGIN_NAME}}` | Plugin name (e.g., "cc") |
| `{{PLUGIN_PATH}}` | Plugin path (e.g., "cc/skills/cc-skills") |
| `{{SKILL_DIR}}` | Skill directory name |
| `{{HANDLER_NAME}}` | Handler filename |
| `{{ARG_NAME}}` | Argument name |
| `{{FLAG_NAME}}` | Flag name |
| `{{RELATED_COMMAND_1}}` | Related command name |
| `{{RELATED_COMMAND_2}}` | Another related command |

## Pipeline Architecture

```
scaffold -> validate -> evaluate -> refine

`evolve` is a separate longitudinal loop for proposal-driven maintenance with snapshot-backed accept/reject.
```

Each operation is invoked via `superskill command <op>` and can be triggered from CLI or slash commands.

## Workflows

Each operation has a **step-by-step workflow** combining deterministic checks and checklists.
LLM content improvement is embedded in the normal workflow for every operation; it is not a separate CLI mode.

| Component | Purpose | Examples |
|-----------|---------|----------|
| **`superskill command`** | Deterministic tasks | File creation, validation, scoring |
| **Checklists** | Fuzzy verification | Imperative form, description clarity, voice |

**See [references/workflows.md](references/workflows.md)** for:
- Visual flow diagrams
- Step-by-step tables with handlers
- Success/failure criteria
- Mandatory checklist items
- Retry policies

### Two-Call Seam Pattern (Evaluate & Evolve)

The `evaluate` and `evolve` operations use a **two-call seam pattern** that separates the CLI envelope from offline persona-driven work. The deterministic heuristic path remains as a fallback, but the seam pattern is the primary mode.

**Evaluate (Scorer seam):**
1. **Envelope-out:** `superskill command evaluate <name> --rubric <file> --json` — emits `{ type, content_name, target, content, rubric, baseline }` as JSON. No scoring, no DB write.
2. **Scorer persona:** reads the envelope, scores each dimension against the rubric criterion, produces `{ rubric_version, dimensions: { name: { score, note } } }`.
3. **Ingest-in:** `superskill command evaluate <name> --ingest <scores.json> --save` — validates agent-produced scores against rubric schema, persists as evaluation row.

**Evolve (Generation seam):**
1. **Envelope-out:** `superskill command evolve <name> --propose-only --json` — emits `{ trends, baseline, rubric, briefs }` as JSON. Each brief carries the immutable goal anchor (frontmatter + rubric criterion + negative constraints) **verbatim** + an `anchor_hash`. No DB write, no model call.
2. **Author persona:** reads briefs, rewrites the content per dimension, produces `ProposedChange[]` with real `proposed` text + `anchor_hash`.
3. **Skeptic persona:** receives the proposal + the **verbatim** goal anchor, checks for violations/omissions, produces `{ ok, violations[] }`.
4. **Judge persona (if multiple candidates):** pairwise tournament comparison, selects the winner.
5. **Ingest-in:** `superskill command evolve <name> --ingest <proposal.json> --accept <id>` — CLI double-loop gate (F024) decides: deterministic validate-zero-errors + Δ-margin + anchor-hash match + skeptic veto. Failing any gate → proposal stays `draft`, file restored.

**Goal-anchor verbatim discipline:** Pass the original frontmatter and negative constraints verbatim to Skeptic and Judge — do not summarize. The CLI gate enforces via `anchor_hash`.

## Evaluation Dimensions (10)

Organized into 5 categories (MECE-compliant):

| # | Category | Dimension | What It Checks |
|---|---------|-----------|----------------|
| 1 | Metadata | Frontmatter Quality | Valid YAML, only allowed fields |
| 2 | Metadata | Description Effectiveness | Under 60 chars, starts with verb |
| 3 | Metadata | Naming Convention | noun-verb (grouped) or verb-noun (simple) |
| 4 | Content | Content Quality | Imperative form, writes FOR Claude |
| 5 | Content | Structure & Brevity | Under 150 lines, progressive disclosure |
| 6 | Architecture | Delegation Architecture | Proper Skill()/Task() usage |
| 7 | Architecture | Argument Design | argument-hint consistency with body |
| 8 | Security | Security | Tool restrictions, dangerous patterns |
| 9 | Security | Circular Reference Prevention | No /cc:command-* refs or Commands Reference |
| 10 | Platform | Cross-Platform Portability | Non-portable features documented |

Two weight profiles: `with-pseudocode` and `without-pseudocode`.

## Platform Adapters

| Platform | Input | Output |
|----------|-------|--------|
| Claude Code | Validation only | (native format) |
| Codex | `command.md` | SKILL.md + `agents/openai.yaml` |
| Gemini CLI | `command.md` | `.toml` file |
| OpenClaw | `command.md` | SKILL.md with `command-dispatch` |
| OpenCode | `command.md` | `.opencode/commands/<name>.md` |
| Antigravity | `command.md` | SKILL.md (mention-triggered) |

## Naming Convention

- **Grouped commands:** noun-verb pattern (e.g., `task-create`, `skill-evaluate`)
- **Simple commands:** verb-noun pattern (e.g., `review-code`)
- **Always:** Full namespace (`plugin-name:command-name`)

## Examples

See [references/command-examples.md](references/command-examples.md) for detailed examples.

## Do's and Don'ts

### Do
- Use imperative form: "Review the code" not "Second-person phrasing"
- Keep descriptions under 60 characters
- Start descriptions with a verb (Create, Generate, Review, etc.)
- Use proper namespace: `plugin-name:command-name`
- Choose the right template: simple, workflow, or plugin

### Don't
- Avoid second-person voice - write FOR Claude, not TO user
- Include non-allowed frontmatter fields (only: description, allowed-tools, model, argument-hint, disable-model-invocation)
- Create commands over 150 lines - use progressive disclosure
- Use hardcoded paths - use `CLAUDE_PLUGIN_ROOT` for portability
- Skip validation before publishing commands

## Additional Resources

- **Frontmatter Reference:** [references/frontmatter-reference.md](references/frontmatter-reference.md)
- **Evaluation Framework:** [references/evaluation-framework.md](references/evaluation-framework.md)
- **Platform Compatibility:** [references/platform-compatibility.md](references/platform-compatibility.md)
- **Troubleshooting:** [references/troubleshooting.md](references/troubleshooting.md)
- **Evolution Protocol:** [references/evolution-protocol.md](references/evolution-protocol.md)

## Advanced

### Platform-Specific Validation
Target specific platforms during validation and evaluation via `--target`:
```bash
superskill command validate ./commands/my-command.md --target claude
superskill command evaluate ./commands/my-command.md --target codex --save
```

### Batch Operations
Process multiple commands:
```bash
# Validate all commands in directory
for f in commands/*.md; do
  superskill command validate "$f"
done
```

## Alternatives and Comparisons

| vs | Difference |
|----|------------|
| rd2 Commands | cc uses YAML frontmatter, supports multi-platform adaptation |
| Codex Skills | cc targets Codex via `--target codex` |
| Gemini CLI | cc targets Gemini TOML via `--target gemini`, triggers via `/` not `!` |

## Platform Notes

### Claude Code (Primary)
- Native format: `.md` files in `commands/` directory
- Full support for `$ARGUMENTS`, `Task()`, `Skill()`, `!`cmd``
- `CLAUDE_PLUGIN_ROOT` available for plugin commands

### Other Platforms
These platforms do NOT natively support Claude Code syntax. Validate against each target with `--target`:

| Platform | Syntax Limitation |
|----------|-------------------|
| Codex | `!`cmd\$ syntax not supported - use `agents/openai.yaml` |
| Gemini CLI | `$ARGUMENTS` not supported - use TOML triggers |
| OpenClaw | `Task()`/`Skill()` not supported - use command-dispatch |
| OpenCode | Claude-specific syntax not supported |
| Antigravity | Mention-triggered only, not slash commands |

**Limitation:** When creating commands with `$ARGUMENTS`, `Task()`, `Skill()`, or `!`cmd`` syntax, document these as Claude-only features in the command. See [references/platform-compatibility.md](references/platform-compatibility.md) for platform-specific guidance.

See [references/platform-compatibility.md](references/platform-compatibility.md) for full matrix.
