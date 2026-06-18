---
description: Create a new agent with scaffolding and templates
argument-hint: "<agent-name> [--description <text>] [--target <platform>] [--output <dir>] [--force]"
allowed-tools: ["Read", "Write", "Glob", "Bash", "Skill"]
---

# Agent Add

Wraps **cc:cc-agents** skill.

Scaffold a new subagent file from a tiered template. Delegates to **cc:cc-agents** skill.

## When to Use

- Create a new agent from scratch
- Initialize an agent with proper structure

## Arguments

| Argument | Description | Default |
|----------|-------------|---------|
| `agent-name` | Name of the agent (hyphen-case) | (required) |
| `--description` | Free-text description of the agent's purpose | auto-generated |
| `--target` | Target platform | claude-code |
| `--output` | Output directory | ./agents |
| `--force` | Overwrite existing file | false |

## Examples

```bash
# Scaffold a standard agent (most common)
/cc:agent-add my-coder
# Scaffold with a description of its purpose
/cc:agent-add expert-foo --description "Thin wrapper for cc-foo skill"
```

## Implementation

Pass `$ARGUMENTS` to the underlying skill for processing.

Delegates to **cc:cc-agents** skill:

```
Skill(skill="cc:cc-agents", args="scaffold $ARGUMENTS")
```

**Direct CLI execution (all platforms):**
```bash
superskill agent scaffold $ARGUMENTS
```

## Platform Notes

- Claude Code: Invoke via `Skill()` delegation
- Other platforms: Run `superskill` CLI directly via Bash tool