---
description: Create a new agent with scaffolding and templates
argument-hint: "<agent-name> [--description <text>] [--target <platform>] [--output <dir>] [--template <tier>] [--skills <list>] [--tools <list>] [--force]"
allowed-tools: ["Read", "Write", "Glob", "Bash", "Skill"]
---

# Agent Add

Wraps **cc:cc-agents** skill.

Scaffold a new subagent file from a tiered template. Delegates to **cc:cc-agents** skill.

## When to Use

- Create a new agent from scratch
- Initialize an agent with proper structure
- Pick a template tier (minimal / standard / specialist) matching the agent's scope

## Arguments

| Argument | Description | Default |
|----------|-------------|---------|
| `agent-name` | Name of the agent (hyphen-case) | (required) |
| `--description` | Free-text description of the agent's purpose | auto-generated |
| `--target` | Target platform | claude-code |
| `--output` | Output directory | ./agents |
| `--template` | Template tier: `minimal`, `standard`, or `specialist` | standard |
| `--skills` | Comma-separated skill names to pre-populate frontmatter | (none) |
| `--tools` | Comma-separated tool names to pre-populate frontmatter | (tier default) |
| `--force` | Overwrite existing file | false |

## Template Tiers

- **minimal** — compact persona + tools + skill link; for thin wrappers
- **standard** — role, tools, skill integration, workflow sections; the common default
- **specialist** — senior-persona, richer toolset, boundaries; for high-autonomy specialists

A freshly scaffolded agent PASSes the project's own evaluator (`superskill agent evaluate`) out of the box.

## Examples

```bash
# Scaffold a standard agent (most common)
/cc:agent-add my-coder
# Scaffold with a description of its purpose
/cc:agent-add expert-foo --description "Thin wrapper for cc-foo skill"
# Scaffold a high-autonomy specialist with explicit tools
/cc:agent-add sec-reviewer --template specialist --tools Read,Grep,Bash,Edit
# Scaffold a minimal wrapper linked to a skill
/cc:agent-add router --template minimal --skills cc-router
```

## Discovery Discipline

Before scaffolding, run the grill-style discovery interview — explore sibling artifacts, the
target repo, and prior evaluations first; then one question at a time, each with a recommended
answer. Single copy: **cc:cc-skills** workflows reference § "Grill-style discovery".

## Implementation

Pass `$ARGUMENTS` to the underlying skill for processing.

Delegates to **cc:cc-agents** skill:

```
Skill(skill="cc:cc-agents", args="scaffold $ARGUMENTS")
```

**Direct CLI execution (all platforms):**
```bash
superskill agent scaffold $ARGUMENTS
```

## Platform Notes

- Claude Code: Invoke via `Skill()` delegation
- Other platforms: Run `superskill` CLI directly via Bash tool
