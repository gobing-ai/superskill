---
name: <!-- NAME -->
description: <!-- DESCRIPTION -->
argument-hint: "<plugin> [--target <platform>] [--output <dir>] $ARGUMENTS"
allowed-tools: ["Read", "Write", "Glob", "Bash"]
target: <!-- TARGET -->
---

# <!-- NAME -->

<!-- DESCRIPTION --> — a plugin command that operates on an installed plugin's payload (skills, commands, subagents, hooks) and forwards arguments to the plugin's skill.

## When to Use

- Act on a specific installed plugin's content
- Delegate to a plugin-owned skill with `$ARGUMENTS` pass-through

## Arguments

| Argument | Description | Default |
|----------|-------------|---------|
| `<plugin>` | Plugin name (required) | (required) |
| `--target <platform>` | Target agent platform | claude |
| `--output <dir>` | Output directory | ./commands |
| `$ARGUMENTS` | Forwarded verbatim to the underlying skill | (none) |

## Examples

```bash
# Act on a plugin
/<!-- NAME --> my-plugin

# With explicit target
/<!-- NAME --> my-plugin --target codex
```

## Implementation

Delegates to the underlying plugin skill, forwarding `$ARGUMENTS` verbatim. Uses **Read** to inspect plugin contents, **Write** to emit output, **Glob** to locate plugin files, and **Bash** to run plugin scripts.

```
Skill(skill="<!-- NAME -->", args="$ARGUMENTS")
```

**Direct CLI execution (all platforms):**
```bash
superskill <!-- NAME --> $ARGUMENTS
```

## Platform Notes

- Claude Code: invoke via `Skill()` delegation
- Other platforms: run `superskill` CLI directly via Bash tool
