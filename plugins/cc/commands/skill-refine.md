---
description: Evaluate and fix skill issues in one step
argument-hint: "<skill-path> [--auto] [--save] [--target <platform>]"
allowed-tools: ["Read", "Write", "Glob", "Bash", "Skill"]
---

# Skill Refine

Wraps **cc:cc-skills** skill.

Run evaluation, apply deterministic fixes, then perform LLM content improvement — all in one step. Delegates to **cc:cc-skills** skill.

## When to Use

- Improve skill quality after scaffolding
- Fix skill issues without running evaluate separately

## Arguments

| Argument | Description | Default |
|----------|-------------|---------|
| `skill-path` | Path to the SKILL.md file | (required) |
| `--auto` | Skip interactive prompts (auto-apply fixes) | false |
| `--save` | Save evaluation results to file | false |
| `--target` | Target platform | claude-code |

## Examples

```bash
# Refine a skill
/cc:skill-refine ./skills/my-skill/SKILL.md
# Auto-refine without prompts
/cc:skill-refine ./skills/my-skill/SKILL.md --auto --save
```

## Implementation

Pass `$ARGUMENTS` to the underlying skill for processing.

Delegates to **cc:cc-skills** skill:

```
Skill(skill="cc:cc-skills", args="refine $ARGUMENTS")
```

**Direct CLI execution (all platforms):**
```bash
superskill skill refine $ARGUMENTS
```

## Platform Notes

- Claude Code: Invoke via `Skill()` delegation
- Other platforms: Run `superskill` CLI directly via Bash tool