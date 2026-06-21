---
description: Score command quality across 10 dimensions
argument-hint: "<command-path> [--save] [--target <platform>]"
allowed-tools: ["Read", "Write", "Glob", "Bash", "Skill"]
---

# Command Evaluate

Wraps **cc:cc-commands** skill.

Score slash command quality across 10 dimensions. **Evaluate only — make NO changes.** Delegates to **cc:cc-commands** skill.

## When to Use

- Check current score without making changes
- Compare scores before and after refinement

## Arguments

| Argument | Description | Default |
|----------|-------------|---------|
| `command-path` | Path to the command .md file | (required) |
| `--save` | Persist the evaluation to the evaluation store (enables evolve trend analysis) | false |
| `--target` | Target platform | claude-code |

## Examples

```bash
# Evaluate a command
/cc:command-evaluate ./commands/my-command.md
# Save results to the evaluation store
/cc:command-evaluate ./commands/my-command.md --save

## Implementation

Pass `$ARGUMENTS` to the underlying skill for processing.

Delegates to **cc:cc-commands** skill:

```
Skill(skill="cc:cc-commands", args="evaluate $ARGUMENTS")
```

**Direct CLI execution (all platforms):**
```bash
superskill command evaluate $ARGUMENTS
```

## Platform Notes

- Claude Code: Invoke via `Skill()` delegation
- Other platforms: Run `superskill` CLI directly via Bash tool