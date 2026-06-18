---
description: Validate hook config schema and lint hook scripts
argument-hint: "<config-or-script-path> [--strict] [--json] [--target <platform>]"
allowed-tools: ["Read", "Write", "Glob", "Bash", "Skill"]
---

# Hook Validate

Wraps **cc:cc-hooks** skill.

Validate a hook config against the JSON Schema. **Evaluate only — make NO changes.** Delegates to **cc:cc-hooks** skill.

> [!NOTE]
> **Transitional command.** Phase 4 (P4-D3) deletes this command — `validate` becomes an internal gate behind evaluate/refine/evolve, with no `*-validate` slash command for any type.

## When to Use

- After editing `hooks.yaml` to catch syntax errors
- Before emitting configs to verify the abstract hook definition is valid
- As a pre-commit check for hook-related files

## Arguments

| Argument | Description | Default |
|----------|-------------|---------|
| `config-or-script-path` | Path to hooks.yaml/json or a shell script | (required) |
| `--strict` | Strict validation mode | false |
| `--json` | Output results as JSON | text |
| `--target` | Target platform | claude-code |

## Examples

```bash
# Validate a hook config
/cc:hook-validate ./hooks.yaml
# Strict validation with JSON output
/cc:hook-validate ./hooks.yaml --strict --json
```

## Implementation

Pass `$ARGUMENTS` to the underlying skill for processing.

Delegates to **cc:cc-hooks** skill:

```
Skill(skill="cc:cc-hooks", args="validate $ARGUMENTS")
```

**Direct CLI execution (all platforms):**
```bash
superskill hook validate $ARGUMENTS
```

## Platform Notes

- Claude Code: Invoke via `Skill()` delegation
- Other platforms: Run `superskill` CLI directly via Bash tool