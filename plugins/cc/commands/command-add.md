---
description: Create a new slash command with scaffolding and templates
argument-hint: "<command-name> [--description <text>] [--target <platform>] [--output <dir>] [--template <tier>] [--skills <list>] [--tools <list>] [--force]"
allowed-tools: ["Read", "Write", "Glob", "Bash", "Skill"]
---

# Command Add

Wraps **cc:cc-commands** skill.

Scaffold a new slash command file from a tiered template. Delegates to **cc:cc-commands** skill.

## When to Use

- Create a new slash command from scratch
- Initialize a command with proper frontmatter, argument-hint, and allowed-tools
- Pick a template tier (simple / workflow / plugin) matching the command's shape

## Arguments

| Argument | Description | Default |
|----------|-------------|---------|
| `command-name` | Name of the command (hyphen-case) | (required) |
| `--description` | Free-text description of the command's purpose | auto-generated |
| `--target` | Target platform | claude |
| `--output` | Output directory | ./commands |
| `--template` | Template tier: `simple`, `workflow`, or `plugin` | default |
| `--skills` | Comma-separated skill names to pre-populate frontmatter | (none) |
| `--tools` | Comma-separated tool names to pre-populate frontmatter | (tier default) |
| `--force` | Overwrite existing file | false |

## Template Tiers

- **simple** — argument-hint + allowed-tools + skill-delegation body; for single-operation wrappers
- **workflow** — richer toolset (Task/Skill) + multi-stage arguments; for orchestrated pipeline commands
- **plugin** — plugin-scoped arguments + direct CLI execution path; for commands acting on an installed plugin

A freshly scaffolded command PASSes the project's own evaluator (`superskill command evaluate`) out of the box.

## Examples

```bash
# Scaffold a default command (most common)
/cc:command-add my-command
# Scaffold with a description of its purpose
/cc:command-add deploy --description "Deploy the service"
# Scaffold a workflow-style command with explicit tools
/cc:command-add run-task --template workflow --tools Read,Write,Bash,Task
# Scaffold a plugin-scoped command
/cc:command-add install-plugin --template plugin
```

## Implementation

Pass `$ARGUMENTS` to the underlying skill for processing.

Delegates to **cc:cc-commands** skill:

```
Skill(skill="cc:cc-commands", args="scaffold $ARGUMENTS")
```

**Direct CLI execution (all platforms):**
```bash
superskill command scaffold $ARGUMENTS
```

## Platform Notes

- Claude Code: Invoke via `Skill()` delegation
- Other platforms: Run `superskill` CLI directly via Bash tool
