---
description: Score hook quality across 4 dimensions (safety, correctness, event-coverage, pattern-match)
argument-hint: "<nameOrPath> [--json] [--target <platform>] [--save] [--rubric <file>] [--ingest <file>]"
allowed-tools: ["Read", "Write", "Glob", "Bash", "Skill"]
---

# Hook Evaluate

Wraps **cc:cc-hooks** skill.

Score hook quality across 4 dimensions. Evaluates `hooks.json` directly — scans for dangerous command patterns, checks event coverage, matcher specificity, and portability. **Evaluate only — make NO changes.** Delegates to **cc:cc-hooks** skill.

## When to Use

- Scan hooks for dangerous command patterns before deployment
- Check event coverage breadth
- Verify matcher specificity and timeout presence

## Arguments

| Argument | Description | Default |
|----------|-------------|---------|
| `<nameOrPath>` | Hook name or path to hooks.json | (required) |
| `--json` | Output machine-readable JSON; with `--rubric`, emit a scoring work order | false |
| `--target` | Target platform | claude |
| `--save` | Persist the evaluation to the evaluation store (enables evolve trend analysis) | false |
| `--rubric <file>` | Rubric path for envelope-out scoring | built-in |
| `--ingest <file>` | Agent-scored result JSON to validate and persist | - |

## Examples

```bash
# Evaluate the hooks config
/cc:hook-evaluate ./hooks/hooks.json
# Save results for trend analysis
/cc:hook-evaluate ./hooks/hooks.json --save
```

## Implementation

Pass `$ARGUMENTS` to the underlying skill for processing.

Delegates to **cc:cc-hooks** skill:

```
Skill(skill="cc:cc-hooks", args="evaluate $ARGUMENTS")
```

**Direct CLI execution (all platforms):**
```bash
superskill hook evaluate $ARGUMENTS
```

## Platform Notes

- Claude Code: Invoke via `Skill()` delegation
- Other platforms: Run `superskill` CLI directly via Bash tool
