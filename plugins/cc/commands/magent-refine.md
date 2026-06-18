---
description: Evaluate and fix magent config issues in one step
argument-hint: "<config-path> [--auto] [--save] [--target <platform>]"
allowed-tools: ["Read", "Write", "Glob", "Bash", "Skill"]
---

# Magent Refine

Wraps **cc:cc-magents** skill.

Run evaluation, apply deterministic fixes, then perform LLM content improvement — all in one step. Delegates to **cc:cc-magents** skill.

## When to Use

- Improve config quality after scaffolding
- Fix config issues without running evaluate separately

## Arguments

| Argument | Description | Default |
|----------|-------------|---------|
| `config-path` | Path to the config .md file | (required) |
| `--auto` | Skip interactive prompts (auto-apply fixes) | false |
| `--save` | Save evaluation results to file | false |
| `--target` | Target platform | claude-code |

## Examples

```bash
# Refine a config
/cc:magent-refine ./CLAUDE.md
# Auto-refine without prompts
/cc:magent-refine ./CLAUDE.md --auto --save
```

## Implementation

Pass `$ARGUMENTS` to the underlying skill for processing.

Delegates to **cc:cc-magents** skill:

```
Skill(skill="cc:cc-magents", args="refine $ARGUMENTS")
```

**Direct CLI execution (all platforms):**
```bash
superskill magent refine $ARGUMENTS
```

## Platform Notes

- Claude Code: Invoke via `Skill()` delegation
- Other platforms: Run `superskill` CLI directly via Bash tool