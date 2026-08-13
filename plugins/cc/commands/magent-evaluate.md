---
description: Score main agent config across 5 quality dimensions
argument-hint: "<nameOrPath> [--json] [--target <platform>] [--save] [--rubric <file>] [--ingest <file>]"
allowed-tools: ["Read", "Write", "Glob", "Bash", "Skill"]
---

# Magent Evaluate

Wraps **cc:cc-magents** skill.

Score main agent config quality across 5 dimensions. **Evaluate only — make NO changes.** Delegates to **cc:cc-magents** skill.

## When to Use

- Check current score without making changes
- Compare scores before and after refinement

## Arguments

| Argument | Description | Default |
|----------|-------------|---------|
| `<nameOrPath>` | Configuration name or path to its .md file | (required) |
| `--json` | Output machine-readable JSON; with `--rubric`, emit a scoring work order | false |
| `--target` | Target platform | claude |
| `--save` | Persist the evaluation to the evaluation store (enables evolve trend analysis) | false |
| `--rubric <file>` | Rubric path for envelope-out scoring | built-in |
| `--ingest <file>` | Agent-scored result JSON to validate and persist | - |

## Examples

```bash
# Evaluate a config
/cc:magent-evaluate ./CLAUDE.md
# Save results to the evaluation store
/cc:magent-evaluate ./CLAUDE.md --save
```

## Implementation

Pass `$ARGUMENTS` to the underlying skill for processing.

Delegates to **cc:cc-magents** skill:

```
Skill(skill="cc:cc-magents", args="evaluate $ARGUMENTS")
```

**Direct CLI execution (all platforms):**
```bash
superskill magent evaluate $ARGUMENTS
```

## Platform Notes

- Claude Code: Invoke via `Skill()` delegation
- Other platforms: Run `superskill` CLI directly via Bash tool
