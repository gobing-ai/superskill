---
description: Evaluate and fix command issues in one step
argument-hint: "<command-path> [--auto] [--save] [--dry-run] [--target <platform>]"
allowed-tools: ["Read", "Write", "Glob", "Bash", "Skill"]
---

# Command Refine

Wraps **cc:cc-commands** skill.

Run evaluation, apply deterministic structural fixes (missing fields, type coercion, whitespace), then re-evaluate — all in one step. Delegates to **cc:cc-commands** skill.

## When to Use

- Improve command quality after scaffolding
- Fix command issues without running evaluate separately

## Arguments

| Argument | Description | Default |
|----------|-------------|---------|
| `command-path` | Path to the command .md file | (required) |
| `--auto` | Skip interactive prompts (auto-apply fixes) | false |
| `--save` | Persist the evaluation to the evaluation store | false |
| `--dry-run` | Preview classified fixes and projected delta without writing | false |
| `--target` | Target platform | claude-code |

## Examples

```bash
# Refine a command (evaluate + structural fixes + re-evaluate)
/cc:command-refine ./commands/my-command.md
# Auto-refine without prompts
/cc:command-refine ./commands/my-command.md --auto --save
# Preview fixes without writing
/cc:command-refine ./commands/my-command.md --dry-run
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
