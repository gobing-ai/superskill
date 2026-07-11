---
name: <!-- NAME -->
description: <!-- DESCRIPTION -->
argument-hint: "<name> [--flag <value>] $ARGUMENTS"
allowed-tools: ["Read", "Write", "Glob", "Bash"]
target: <!-- TARGET -->
---

# <!-- NAME -->

<!-- DESCRIPTION --> — a simple slash command that wraps a single skill operation and forwards arguments.

## When to Use

- Run the wrapped operation end-to-end with one invocation
- Pass through user arguments without multi-stage orchestration

## Arguments

| Argument | Description | Default |
|----------|-------------|---------|
| `<name>` | Primary operand (required) | (required) |
| `--flag <value>` | Optional modifier | (none) |
| `$ARGUMENTS` | Forwarded verbatim to the underlying skill | (none) |

## Examples

```bash
# Simple invocation with the primary operand
/<!-- NAME --> my-target

# With an optional flag
/<!-- NAME --> my-target --flag value
```

## Implementation

Delegates to the underlying skill, forwarding `$ARGUMENTS` verbatim. Uses **Read** for context, **Write** for output, **Glob** for file location, and **Bash** for verification.

```
Skill(skill="<!-- NAME -->", args="$ARGUMENTS")
```

## Platform Notes

- Claude Code: invoke via `Skill()` delegation
- Other platforms: run the underlying skill flow directly
