---
description: Score main agent config across 6 quality dimensions
argument-hint: "<config-path> [--json] [--save] [--target <platform>]"
allowed-tools: ["Read", "Write", "Glob", "Bash", "Skill"]
---

# Magent Evaluate

Wraps **cc:cc-magents** skill.

Score main agent config quality across 6 dimensions. **Evaluate only — make NO changes.** Delegates to **cc:cc-magents** skill.

## When to Use

- Check current score without making changes
- Compare scores before and after refinement

## Arguments

| Argument | Description | Default |
|----------|-------------|---------|
| `config-path` | Path to the config .md file | (required) |
| `--json` | Output results as JSON | text |
| `--save` | Save evaluation results to file | false |
| `--target` | Target platform | claude-code |

## Examples

```bash
# Evaluate a config
/cc:magent-evaluate ./CLAUDE.md
# Save results as JSON
/cc:magent-evaluate ./CLAUDE.md --json --save
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