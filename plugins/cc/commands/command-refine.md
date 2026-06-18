---
description: Evaluate and fix command issues in one step
argument-hint: "<command-path> [--auto] [--save] [--target <platform>]"
allowed-tools: ["Read", "Write", "Glob", "Bash", "Skill"]
---

# Command Refine

Wraps **cc:cc-commands** skill.

Run evaluation, apply deterministic fixes, then perform LLM content improvement — all in one step. Delegates to **cc:cc-commands** skill.

## When to Use

- Improve command quality after scaffolding
- Fix command issues without running evaluate separately

## Arguments

| Argument | Description | Default |
|----------|-------------|---------|
| `command-path` | Path to the command .md file | (required) |
| `--auto` | Skip interactive prompts (auto-apply fixes) | false |
| `--save` | Save evaluation results to file | false |
| `--target` | Target platform | claude-code |

## Examples

```bash
# Refine a command
/cc:command-refine ./commands/my-command.md
# Auto-refine without prompts
/cc:command-refine ./commands/my-command.md --auto --save
```

## Implementation

Pass `$ARGUMENTS` to the underlying skill for processing.

Delegates to **cc:cc-commands** skill:

```
Skill(skill="cc:cc-commands", args="refine $ARGUMENTS")
```

**Direct CLI execution (all platforms):**
```bash
superskill command refine $ARGUMENTS
```

## Platform Notes

- Claude Code: Invoke via `Skill()` delegation
- Other platforms: Run `superskill` CLI directly via Bash tool