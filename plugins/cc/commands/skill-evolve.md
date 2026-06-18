---
description: Analyze skill evolution signals and draft proposals
argument-hint: "<skill-name> [--from <version>] [--propose-only] [--accept <id>] [--reject <id>] [--target <platform>]"
allowed-tools: ["Read", "Write", "Glob", "Bash", "Skill"]
---

# Skill Evolve

Wraps **cc:cc-skills** skill.

Analyze skill quality over time, persist refine-backed proposals, apply deterministic proposals, and rollback via saved version history. Delegates to **cc:cc-skills** skill.

## When to Use

- Generate proposals after evaluation drift or repeated review feedback
- Apply low-risk fixes through deterministic refine flow with backup and rollback support

## Arguments

| Argument | Description | Default |
|----------|-------------|---------|
| `skill-name` | Name of the skill | (required) |
| `--from` | Analyze from a specific version | latest |
| `--propose-only` | Draft proposals without applying | false |
| `--accept <id>` | Apply a saved proposal | - |
| `--reject <id>` | Reject a saved proposal | - |
| `--target` | Target platform | claude-code |

## Examples

```bash
# Generate persisted proposals
/cc:skill-evolve ./skills/my-skill/SKILL.md --propose-only
# Apply a proposal
/cc:skill-evolve ./skills/my-skill/SKILL.md --accept p1234
```

## Implementation

Pass `$ARGUMENTS` to the underlying skill for processing.

Delegates to **cc:cc-skills** skill:

```
Skill(skill="cc:cc-skills", args="evolve $ARGUMENTS")
```

**Direct CLI execution (all platforms):**
```bash
superskill skill evolve $ARGUMENTS
```

## Platform Notes

- Claude Code: Invoke via `Skill()` delegation
- Other platforms: Run `superskill` CLI directly via Bash tool