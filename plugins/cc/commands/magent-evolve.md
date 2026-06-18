---
description: Analyze magent evolution signals and draft proposals
argument-hint: "<config-name> [--from <version>] [--propose-only] [--accept <id>] [--reject <id>] [--target <platform>]"
allowed-tools: ["Read", "Write", "Glob", "Bash", "Skill"]
---

# Magent Evolve

Wraps **cc:cc-magents** skill.

Analyze main agent config quality over time, persist refine-backed proposals, apply deterministic proposals, and rollback via saved version history. Delegates to **cc:cc-magents** skill.

## When to Use

- Generate proposals after evaluation drift or repeated review feedback
- Apply low-risk fixes through deterministic refine flow with backup and rollback support

## Arguments

| Argument | Description | Default |
|----------|-------------|---------|
| `config-name` | Name of the config | (required) |
| `--from` | Analyze from a specific version | latest |
| `--propose-only` | Draft proposals without applying | false |
| `--accept <id>` | Apply a saved proposal | - |
| `--reject <id>` | Reject a saved proposal | - |
| `--target` | Target platform | claude-code |

## Examples

```bash
# Generate persisted proposals
/cc:magent-evolve ./CLAUDE.md --propose-only
# Apply a proposal
/cc:magent-evolve ./CLAUDE.md --accept p1234
```

## Implementation

Pass `$ARGUMENTS` to the underlying skill for processing.

Delegates to **cc:cc-magents** skill:

```
Skill(skill="cc:cc-magents", args="evolve $ARGUMENTS")
```

**Direct CLI execution (all platforms):**
```bash
superskill magent evolve $ARGUMENTS
```

## Platform Notes

- Claude Code: Invoke via `Skill()` delegation
- Other platforms: Run `superskill` CLI directly via Bash tool