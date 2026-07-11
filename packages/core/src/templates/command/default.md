---
name: <!-- NAME -->
description: <!-- DESCRIPTION -->
argument-hint: "<name> [--flags <value>] $ARGUMENTS"
allowed-tools: ["Read", "Write", "Glob", "Bash"]
target: <!-- TARGET -->
---

# <!-- NAME -->

<!-- DESCRIPTION -->.

## When to Use

- Invoke this command when the task above applies
- Pass arguments via `$ARGUMENTS` for the underlying skill to process

## Arguments

| Argument | Description | Default |
|----------|-------------|---------|
| `$ARGUMENTS` | Forwarded verbatim to the underlying skill | (none) |

## Examples

```bash
# Standard invocation
/<!-- NAME --> [args]
```

## Implementation

Delegates to the underlying skill, forwarding `$ARGUMENTS` verbatim. Uses **Read** to gather context, **Write** to persist output, **Glob** to locate files, and **Bash** to run verification commands.

## Platform Notes

- Claude Code: invoke via `Skill()` delegation
- Other platforms: run the equivalent skill flow directly
