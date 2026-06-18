---
description: Evaluate and fix agent issues in one step
argument-hint: "<agent-path> [--auto] [--save] [--target <platform>]"
allowed-tools: ["Read", "Write", "Glob", "Bash", "Skill"]
---

# Agent Refine

Wraps **cc:cc-agents** skill.

Run evaluation, apply deterministic fixes, then perform LLM content improvement — all in one step. Delegates to **cc:cc-agents** skill.

## When to Use

- Improve agent quality after scaffolding
- Fix agent issues without running evaluate separately

## Arguments

| Argument | Description | Default |
|----------|-------------|---------|
| `agent-path` | Path to the agent .md file | (required) |
| `--auto` | Skip interactive prompts (auto-apply fixes) | false |
| `--save` | Save evaluation results to file | false |
| `--target` | Target platform | claude-code |

## Examples

```bash
# Refine an agent (evaluate + fix + content improvement)
/cc:agent-refine ./agents/my-agent.md
# Auto-refine without prompts
/cc:agent-refine ./agents/my-agent.md --auto --save
```

## Implementation

Pass `$ARGUMENTS` to the underlying skill for processing.

Delegates to **cc:cc-agents** skill:

```
Skill(skill="cc:cc-agents", args="refine $ARGUMENTS")
```

**Direct CLI execution (all platforms):**
```bash
superskill agent refine $ARGUMENTS
```

## Platform Notes

- Claude Code: Invoke via `Skill()` delegation
- Other platforms: Run `superskill` CLI directly via Bash tool