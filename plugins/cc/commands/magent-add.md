---
description: Scaffold a main-agent config seed from verified project facts
argument-hint: "<name> [--description <text>] [--target <platform>] [--output <dir>] [--template <name>] [--tools <list>] [--force]"
allowed-tools: ["Read", "Write", "Glob", "Bash", "Skill"]
---

# Magent Add

Wraps **cc:cc-magents** skill.

Scaffold a main-agent configuration seed. Delegates to **cc:cc-magents** skill;
the invoking agent must replace generic template prose with verified project facts.

## When to Use

- Create a new main agent config from scratch
- Initialize a CLAUDE.md / GEMINI.md / AGENTS.md from a template

## Arguments

| Argument | Description | Default |
|----------|-------------|---------|
| `<name>` | Output filename stem (`CLAUDE` creates `CLAUDE.md`) | (required) |
| `--description` | Free-text description of the config's purpose | empty |
| `--target` | Target platform | claude |
| `--output` | Output directory | . |
| `--template` | Built-in magent template (currently `default`) | default |
| `--tools` | Comma-separated tool names to pre-populate | — |
| `--force` | Overwrite existing file | false |


## Examples

```bash
# Scaffold CLAUDE.md in the current directory
/cc:magent-add CLAUDE --target claude --description "Project main-agent config"
# Scaffold AGENTS.md for Codex
/cc:magent-add AGENTS --target codex --output .
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

Before scaffolding, inspect the active instruction load graph, project docs, package scripts,
sibling configs, and prior evaluations. Ask only for missing, stable facts the repository cannot
answer. After generation, delete inferred boilerplate, insert exact verified commands and
boundaries, then validate and evaluate. Follow **cc:cc-magents** workflows § "Create Workflow";
the scaffold is not a finished config.

Use `--force` only when replacement was requested and the existing file was inspected.

## Platform Notes

- Claude Code: Invoke via `Skill()` delegation
- Other platforms: Run `superskill` CLI directly via Bash tool
