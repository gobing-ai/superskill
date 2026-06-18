---
description: Check agent quality score and identify weaknesses
argument-hint: "<agent-path> [--json] [--save] [--target <platform>]"
allowed-tools: ["Read", "Write", "Glob", "Bash", "Skill"]
---

# Agent Evaluate

Wraps **cc:cc-agents** skill.

Score agent quality across 10 dimensions. **Evaluate only — make NO changes.** Delegates to **cc:cc-agents** skill.

## When to Use

- Check current score without making changes
- Compare scores before and after refinement
- Verify agent readiness for publishing

## Arguments

| Argument | Description | Default |
|----------|-------------|---------|
| `agent-path` | Path to the agent .md file | (required) |
| `--json` | Output results as JSON | text |
| `--save` | Save evaluation results to file | false |
| `--target` | Target platform | claude-code |

## Examples

```bash
# Full evaluation
/cc:agent-evaluate ./agents/my-agent.md
# Save results as JSON
/cc:agent-evaluate ./agents/my-agent.md --json --save
```

## Implementation

Pass `$ARGUMENTS` to the underlying skill for processing.

Delegates to **cc:cc-agents** skill:

```
Skill(skill="cc:cc-agents", args="evaluate $ARGUMENTS")
```

**Direct CLI execution (all platforms):**
```bash
superskill agent evaluate $ARGUMENTS
```

## Platform Notes

- Claude Code: Invoke via `Skill()` delegation
- Other platforms: Run `superskill` CLI directly via Bash tool