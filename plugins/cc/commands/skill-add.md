---
description: Create a new skill with scaffolding and templates
argument-hint: "<skill-name> [--description <text>] [--target <platform>] [--output <dir>] [--template <tier>] [--skills <list>] [--tools <list>] [--force]"
allowed-tools: ["Read", "Write", "Glob", "Bash", "Skill"]
---

# Skill Add

Wraps **cc:cc-skills** skill.

Scaffold a new skill directory with `SKILL.md` from a tiered template. Delegates to **cc:cc-skills** skill.

## When to Use

- Create a new skill from scratch
- Initialize a skill with proper directory structure and frontmatter
- Pick a template tier (technique / pattern / reference) matching the skill's shape

## Arguments

| Argument | Description | Default |
|----------|-------------|---------|
| `skill-name` | Name of the skill (hyphen-case) | (required) |
| `--description` | Free-text description of the skill's purpose | auto-generated |
| `--target` | Target platform | claude |
| `--output` | Output directory | ./skills |
| `--template` | Template tier: `technique`, `pattern`, or `reference` | default |
| `--skills` | Comma-separated skill names to pre-populate frontmatter | (none) |
| `--tools` | Comma-separated tool names to pre-populate frontmatter | (tier default) |
| `--force` | Overwrite existing file | false |

## Template Tiers

- **technique** — step-by-step workflows with concrete instructions and verification gates; for procedural skills
- **pattern** — decision frameworks with trade-off analysis and core principles; for design-decision skills
- **reference** — lookup tables and documentation; for factual/API-reference skills

A freshly scaffolded skill PASSes the project's own evaluator (`superskill skill evaluate`) out of the box.

## Examples

```bash
# Scaffold a default skill (most common)
/cc:skill-add my-skill
# Scaffold with a description of its purpose
/cc:skill-add my-skill --description "Wraps the foo API"
# Scaffold a technique-tier skill with explicit tools
/cc:skill-add deploy-skill --template technique --tools Read,Write,Bash
# Scaffold a reference-tier skill
/cc:skill-add api-ref --template reference
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
