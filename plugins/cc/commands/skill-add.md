---
description: Create a new skill with scaffolding and templates
argument-hint: "<skill-name> [--description <text>] [--target <platform>] [--output <dir>] [--force]"
allowed-tools: ["Read", "Write", "Glob", "Bash", "Skill"]
---

# Skill Add

Wraps **cc:cc-skills** skill.

Scaffold a new skill directory with SKILL.md and templates. Delegates to **cc:cc-skills** skill.

## When to Use

- Create a new skill from scratch
- Initialize a skill with proper structure and frontmatter

## Arguments

| Argument | Description | Default |
|----------|-------------|---------|
| `skill-name` | Name of the skill (hyphen-case) | (required) |
| `--description` | Free-text description of the skill's purpose | auto-generated |
| `--target` | Target platform | claude-code |
| `--output` | Output directory | ./skills |
| `--force` | Overwrite existing file | false |

## Examples

```bash
# Scaffold a new skill
/cc:skill-add my-skill
# Scaffold with a description
/cc:skill-add my-skill --description "Wraps the foo API"
```

## Implementation

Pass `$ARGUMENTS` to the underlying skill for processing.

Delegates to **cc:cc-skills** skill:

```
Skill(skill="cc:cc-skills", args="scaffold $ARGUMENTS")
```

**Direct CLI execution (all platforms):**
```bash
superskill skill scaffold $ARGUMENTS
```

## Platform Notes

- Claude Code: Invoke via `Skill()` delegation
- Other platforms: Run `superskill` CLI directly via Bash tool