---
description: Evaluate and fix agent issues in one step
argument-hint: "<agent-path> [--auto] [--save] [--dry-run] [--target <platform>]"
allowed-tools: ["Read", "Write", "Glob", "Bash", "Skill"]
---

# Agent Refine

Wraps **cc:cc-agents** skill.

Run evaluation, apply deterministic structural fixes (missing fields, type coercion, whitespace), then re-evaluate — all in one step. Delegates to **cc:cc-agents** skill.

## When to Use

- Improve agent quality after scaffolding
- Fix agent issues without running evaluate separately

## Arguments

| Argument | Description | Default |
|----------|-------------|---------|
| `agent-path` | Path to the agent .md file | (required) |
| `--auto` | Skip interactive prompts (auto-apply fixes) | false |
| `--save` | Persist the evaluation to the evaluation store | false |
| `--dry-run` | Preview classified fixes and projected delta without writing | false |
| `--target` | Target platform | claude-code |

## Examples

```bash
# Refine an agent (evaluate + structural fixes + re-evaluate)
/cc:agent-refine ./agents/my-agent.md
# Auto-refine without prompts
/cc:agent-refine ./agents/my-agent.md --auto --save
# Preview fixes without writing
/cc:agent-refine ./agents/my-agent.md --dry-run
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