---
description: Check skill quality score and identify weaknesses
argument-hint: "<skill-dir> [--save] [--target <platform>]"
allowed-tools: ["Read", "Write", "Glob", "Bash", "Skill"]
---

# Skill Evaluate

Wraps **cc:cc-skills** skill.

Score skill quality across multiple dimensions. **Evaluate only — make NO changes.** Delegates to **cc:cc-skills** skill.

## When to Use

- Check current score without making changes
- Compare scores before and after refinement

## Arguments

| Argument | Description | Default |
|----------|-------------|---------|
| `skill-dir` | Path to the skill directory | (required) |
| `--save` | Persist the evaluation to the evaluation store (enables evolve trend analysis) | false |
| `--target` | Target platform | claude-code |

## Examples

```bash
# Evaluate a skill
/cc:skill-evaluate ./skills/my-skill
# Save results for trend analysis
/cc:skill-evaluate ./skills/my-skill --save
```

## Implementation

Pass `$ARGUMENTS` to the underlying skill for processing.

Delegates to **cc:cc-skills** skill:

```
Skill(skill="cc:cc-skills", args="evaluate $ARGUMENTS")
```

**Direct CLI execution (all platforms):**
```bash
superskill skill evaluate $ARGUMENTS
```

## Platform Notes

- Claude Code: Invoke via `Skill()` delegation
- Other platforms: Run `superskill` CLI directly via Bash tool