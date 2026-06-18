---
description: Create a new main agent config with scaffolding
argument-hint: "[--description <text>] [--target <platform>] [--output <dir>] [--force]"
allowed-tools: ["Read", "Write", "Glob", "Bash", "Skill"]
---

# Magent Add

Wraps **cc:cc-magents** skill.

Scaffold a new main agent configuration file. Delegates to **cc:cc-magents** skill.

## When to Use

- Create a new main agent config from scratch
- Initialize a CLAUDE.md / GEMINI.md / AGENTS.md from a template

## Arguments

| Argument | Description | Default |
|----------|-------------|---------|
| `--description` | Free-text description of the config's purpose | auto-generated |
| `--target` | Target platform | claude-code |
| `--output` | Output directory | . |
| `--force` | Overwrite existing file | false |

## Examples

```bash
# Scaffold a CLAUDE.md for a Node.js project
/cc:magent-add --target claude-code
# Scaffold with a description
/cc:magent-add --description "Dev agent for API service"
```

## Implementation

Pass `$ARGUMENTS` to the underlying skill for processing.

Delegates to **cc:cc-magents** skill:

```
Skill(skill="cc:cc-magents", args="scaffold $ARGUMENTS")
```

**Direct CLI execution (all platforms):**
```bash
superskill magent scaffold $ARGUMENTS
```

## Platform Notes

- Claude Code: Invoke via `Skill()` delegation
- Other platforms: Run `superskill` CLI directly via Bash tool