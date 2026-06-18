---
description: Analyze agent evolution signals and draft proposals
argument-hint: "<agent-name> [--from <version>] [--propose-only] [--accept <id>] [--reject <id>] [--target <platform>]"
allowed-tools: ["Read", "Write", "Glob", "Bash", "Skill"]
---

# Agent Evolve

Wraps **cc:cc-agents** skill.

Analyze agent quality over time, persist refine-backed proposals, apply deterministic proposals, and rollback via saved version history. Delegates to **cc:cc-agents** skill.

## When to Use

- Generate proposals after evaluation drift or repeated review feedback
- Apply low-risk fixes through deterministic refine flow with backup and rollback support
- Track applied changes over time

## Arguments

| Argument | Description | Default |
|----------|-------------|---------|
| `agent-name` | Name of the agent | (required) |
| `--from` | Analyze from a specific version | latest |
| `--propose-only` | Draft proposals without applying | false |
| `--accept <id>` | Apply a saved proposal | - |
| `--reject <id>` | Reject a saved proposal | - |
| `--target` | Target platform | claude-code |

## Examples

```bash
# Generate persisted proposals
/cc:agent-evolve ./agents/my-agent.md --propose-only
# Apply a proposal
/cc:agent-evolve ./agents/my-agent.md --accept p1234
```

## Implementation

Pass `$ARGUMENTS` to the underlying skill for processing.

Delegates to **cc:cc-agents** skill:

```
Skill(skill="cc:cc-agents", args="evolve $ARGUMENTS")
```

**Direct CLI execution (all platforms):**
```bash
superskill agent evolve $ARGUMENTS
```

## Platform Notes

- Claude Code: Invoke via `Skill()` delegation
- Other platforms: Run `superskill` CLI directly via Bash tool