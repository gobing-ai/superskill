---
description: Create a new main agent config with scaffolding
argument-hint: "[--description <text>] [--target <platform>] [--output <dir>] [--template <tier>] [--skills <list>] [--tools <list>] [--force]"
allowed-tools: ["Read", "Write", "Glob", "Bash", "Skill"]
---

# Magent Add

Wraps **cc:cc-magents** skill.

Scaffold a new main agent configuration file. Delegates to **cc:cc-magents** skill.

## When to Use

- Create a new main agent config from scratch
- Initialize a CLAUDE.md / GEMINI.md / AGENTS.md from a template

## Arguments

| Argument | Description | Default |
|----------|-------------|---------|
| `--description` | Free-text description of the config's purpose | auto-generated |
| `--target` | Target platform | claude |
| `--output` | Output directory | . |
| `--template` | Template tier (e.g. minimal / standard / specialist) | default |
| `--skills` | Comma-separated skill names to pre-populate | — |
| `--tools` | Comma-separated tool names to pre-populate | — |
| `--force` | Overwrite existing file | false |


## Examples

```bash
# Scaffold a CLAUDE.md for a Node.js project
/cc:magent-add --target claude-code
# Scaffold with a description and template tier
/cc:magent-add --description "Dev agent for API service" --template standard
```

Delegates to **cc:cc-magents** skill:

```
Skill(skill="cc:cc-magents", args="scaffold $ARGUMENTS")
```

**Direct CLI execution (all platforms):**
```bash
superskill magent scaffold $ARGUMENTS
```

## Discovery Discipline

Before scaffolding, run the grill-style discovery interview — explore sibling artifacts, the
target repo, and prior evaluations first; then one question at a time, each with a recommended
answer. Single copy: **cc:cc-skills** workflows reference § "Grill-style discovery".

## Platform Notes

- Claude Code: Invoke via `Skill()` delegation
- Other platforms: Run `superskill` CLI directly via Bash tool
