---
name: cc-commands
description: Create, validate, evaluate, refine, and evolve slash commands across platforms. Use for scaffolding new commands, validating structure, evaluating quality, refining based on feedback, planning longitudinal improvements, or generating cross-platform equivalents.
license: Apache-2.0
metadata:
  author: superskill
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
---

# cc-commands: Universal Command Creator

Create and manage slash commands that work across multiple agent platforms.

## Overview

This skill provides a complete pipeline for slash command development
(`evolve` is a separate longitudinal loop with snapshot-backed accept/reject):

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
- Evaluating command quality across 5 rubric dimensions
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

Write instructions FOR Claude, not messages TO the user: imperative form ("Review the code").

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

The template placeholder table (`{{COMMAND_TITLE}}`, `{{DESCRIPTION}}`, `{{ARGUMENT_HINT}}`, ...)
lives in [references/command-examples.md](references/command-examples.md#template-placeholders).

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

The `evaluate` and `evolve` operations run the **two-call seam** — envelope-out, persona judgment
(Scorer for evaluate; Author → Skeptic → Judge for evolve), ingest-in through the double-loop
gate. The deterministic heuristic path remains as a fallback. Seam mechanics, personas, and
vocabulary are owned by **cc:cc-skills** (evaluation-framework reference + glossary); the Quick
Start above shows the command-noun invocations. Goal anchors pass to Skeptic/Judge **verbatim** —
the `anchor_hash` gate rejects paraphrased anchors.

## Evaluation Dimensions

Commands are scored across **5 rubric dimensions**. The canonical rubric at
`packages/core/src/rubrics/command.yaml` owns each dimension's weight and criterion — read it there;
do not restate weights here, they drift.

| Dimension | What It Checks |
|-----------|----------------|
| `completeness` | Required `description` present; `argument-hint` and `allowed-tools` declared |
| `clarity` | Description states what the command does and when to use it |
| `argument-hints` | `argument-hint` names positional args and flags, consistent with the body |
| `tool-references` | Tool references match exposed CLI verbs; no orphaned or undocumented refs |
| `slash-syntax` | Syntax follows platform convention, consistent across sibling commands |

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

## Do's and Don'ts

The Core Principles above are the rulebook (imperative form, strict frontmatter, wrapped-skill
declaration, argument tables with defaults). Three additions not stated there:

- Keep descriptions under 60 characters, starting with a verb (Create, Generate, Review, ...)
- Keep commands under 150 lines — use progressive disclosure
- Never skip validation before publishing

## Additional Resources

- **Command Examples:** [references/command-examples.md](references/command-examples.md)
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
Loop the CLI over a directory to process multiple commands (e.g.
`for f in commands/*.md; do superskill command validate "$f"; done`).

## Platform Notes

Claude Code is the primary format (`.md` in `commands/`, full `$ARGUMENTS` / `Task()` / `Skill()` /
`` !`cmd` `` / `CLAUDE_PLUGIN_ROOT` support). Other platforms do NOT natively support that syntax —
validate against each target with `--target`:

| Platform | Syntax Limitation |
|----------|-------------------|
| Codex | `` !`cmd` `` syntax not supported - use `agents/openai.yaml` |
| Gemini CLI | `$ARGUMENTS` not supported - use TOML triggers |
| OpenClaw | `Task()`/`Skill()` not supported - use command-dispatch |
| OpenCode | Claude-specific syntax not supported |
| Antigravity | Mention-triggered only, not slash commands |

When a command uses Claude-only syntax, document it as such in the command. Full matrix and
per-platform guidance: [references/platform-compatibility.md](references/platform-compatibility.md).
