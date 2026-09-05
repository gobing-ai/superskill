---
description: Score command quality across 10 dimensions
argument-hint: "<nameOrPath> [--json] [--target <platform>] [--save] [--rubric <file>] [--ingest <file>] [--base-path <dir>]"
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
| ---------- | ------------- | --------- |
| `<nameOrPath>` | Command name or path to its .md file | (required) |
| `--json` | Output machine-readable JSON; with `--rubric`, emit a scoring work order | false |
| `--target` | Target platform | claude |
| `--save` | Persist the evaluation to the evaluation store (enables evolve trend analysis) | false |
| `--rubric <file>` | Rubric path for envelope-out scoring | built-in |
| `--ingest <file>` | Agent-scored result JSON to validate and persist | - |
| `--base-path <dir>` | Directory relative markdown links resolve against | the file's own directory |

## Examples

```bash
# Evaluate a command
/cc:command-evaluate ./commands/my-command.md
# Save results to the evaluation store
/cc:command-evaluate ./commands/my-command.md --save
```

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
