---
name: <!-- NAME -->
description: <!-- DESCRIPTION -->
argument-hint: "<task-ref> [--preset <preset>] [--stage <stage>] [--auto] $ARGUMENTS"
allowed-tools: ["Read", "Write", "Glob", "Bash", "Skill", "Task"]
target: <!-- TARGET -->
---

# <!-- NAME -->

<!-- DESCRIPTION --> — a workflow command that orchestrates a multi-stage skill pipeline with bounded iteration and verification gates.

## When to Use

- Execute a task through a multi-stage workflow (plan → implement → test → verify)
- Require bounded iteration with explicit verification before completion
- Coordinate multiple skills via `Task` delegation

## Arguments

| Argument | Description | Default |
|----------|-------------|---------|
| `<task-ref>` | Task reference (WBS number or file path) | (required) |
| `--preset <preset>` | Workflow preset: `simple`, `standard`, `complex`, `research` | standard |
| `--stage <stage>` | Execution stage: `all`, `plan-only`, `implement-only` | all |
| `--auto` | Skip confirmations where supported | false |
| `--force` | Bypass status guards (re-verify Done tasks) | false |
| `$ARGUMENTS` | Forwarded verbatim to the underlying skill | (none) |

## Examples

```bash
# Standard run
/<!-- NAME --> 0274 --preset standard

# Staged execution
/<!-- NAME --> 0274 --stage plan-only --auto
```

## Implementation

Delegates to the underlying workflow skill, forwarding `$ARGUMENTS` verbatim. Uses **Read**/**Glob** to gather context, **Write** to persist artifacts, **Bash** to run the project gate, **Skill** to invoke specialist skills, and **Task** to fan out subagents.

```
Skill(skill="<!-- NAME -->", args="$ARGUMENTS")
```

## Platform Notes

- Claude Code: invoke via `Skill()` delegation; `Task` fans out subagents natively
- Other platforms: run the underlying skill flow; subagent fan-out may be limited
