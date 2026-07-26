---
description: Check skill quality score and identify weaknesses
argument-hint: "<nameOrPath> [--history] [--json] [--target <platform>] [--save] [--rubric <file>] [--ingest <file>]"
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
| `<nameOrPath>` | Skill name or path to its directory | (required) |
| `--history` | Show prior evaluation rows from the store | false |
| `--json` | Output machine-readable JSON; with `--rubric`, emit a scoring work order | false |
| `--target` | Target platform | claude |
| `--save` | Persist the evaluation to the evaluation store (enables evolve trend analysis) | false |
| `--rubric <file>` | Rubric path for envelope-out scoring | built-in |
| `--ingest <file>` | Agent-scored result JSON to validate and persist | - |

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
