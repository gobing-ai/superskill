---
description: Create a new slash command with scaffolding
argument-hint: "<command-name> [--description <text>] [--target <platform>] [--output <dir>] [--force]"
allowed-tools: ["Read", "Write", "Glob", "Bash", "Skill"]
---

# Command Add

Wraps **cc:cc-commands** skill.

Scaffold a new slash command file. Delegates to **cc:cc-commands** skill.

## When to Use

- Create a new slash command from scratch
- Initialize a command with proper frontmatter and body

## Arguments

| Argument | Description | Default |
|----------|-------------|---------|
| `command-name` | Name of the command (hyphen-case) | (required) |
| `--description` | Free-text description of the command's purpose | auto-generated |
| `--target` | Target platform | claude-code |
| `--output` | Output directory | ./commands |
| `--force` | Overwrite existing file | false |

## Examples

```bash
# Scaffold a new command
/cc:command-add my-command
# Scaffold with a description
/cc:command-add my-command --description "Does the thing"
```

## Implementation

Pass `$ARGUMENTS` to the underlying skill for processing.

Delegates to **cc:cc-commands** skill:

```
Skill(skill="cc:cc-commands", args="scaffold $ARGUMENTS")
```

**Direct CLI execution (all platforms):**
```bash
superskill command scaffold $ARGUMENTS
```

## Platform Notes

- Claude Code: Invoke via `Skill()` delegation
- Other platforms: Run `superskill` CLI directly via Bash tool