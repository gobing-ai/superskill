# Command Frontmatter Reference

Complete reference for YAML frontmatter fields in slash commands across platforms.

## Valid Fields (5 Total)

**Only these 5 fields are valid in Claude Code slash command frontmatter:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `description` | String | No | Brief description shown in /help (max ~60 chars) |
| `allowed-tools` | String/Array | No | Restrict available tools for this command |
| `model` | String | No | Claude model: `sonnet`, `opus`, or `haiku` |
| `argument-hint` | String | No | Document expected arguments for autocomplete |
| `disable-model-invocation` | Boolean | No | Prevent programmatic invocation via SlashCommand |

## Invalid Fields (MUST be rejected)

Any of these fields in command frontmatter is an **error**, not a warning:

| Invalid Field | Why Invalid | Correct Alternative |
|---------------|-------------|---------------------|
| `name` | Filename is the name | Use filename convention |
| `skills` | Not valid for commands | Document in body |
| `subagents` | Not valid for commands | Use Task() in body |
| `version` | Not valid for commands | N/A |
| `agent` | Not valid for commands | N/A |
| `context` | Not valid for commands | N/A |
| `user-invocable` | Not valid for commands | N/A |
| `triggers` | Not valid for commands | Use description |
| `license` | Not valid for commands | N/A |
| `metadata` | Not valid for commands | N/A |
| `examples` | Not valid for commands | Document in body |
| `arguments` | Not valid for commands | Use `argument-hint` |
| `tools` | Not valid for commands | Use `allowed-tools` |

## Field Specifications

### description

- **Max length:** ~60 characters (recommended for /help display)
- **Format:** Start with a verb (Review, Deploy, Generate)
- **Anti-patterns:** "This command...", overly generic, too long
- **Good:** "Review code for security issues"
- **Bad:** "This command reviews code" (unnecessary prefix)

### allowed-tools

Accepts string, comma-separated string, or YAML array:

```yaml
# Single tool
allowed-tools: Read

# Comma-separated
allowed-tools: Read, Write, Edit

# Array format
allowed-tools:
  - Read
  - Write
  - Bash(git:*)

# Bash with command filter (recommended)
allowed-tools: Bash(git:*), Read
```

### model

Valid values: `sonnet` (balanced), `opus` (complex), `haiku` (fast).

| Model | Use For |
|-------|---------|
| `haiku` | Simple formulaic tasks, fast execution |
| `sonnet` | Standard commands (default if omitted) |
| `opus` | Complex analysis, architectural decisions |

### argument-hint

Documents expected arguments for users and autocomplete:

```yaml
argument-hint: [file-path]
argument-hint: [source] [target]
argument-hint: [issue-number] [--verbose]
```

**Consistency rule:** If body uses `$1`, `$2`, `$ARGUMENTS`, the command should have `argument-hint`.

### disable-model-invocation

When `true`, only users can invoke the command (not the SlashCommand tool).

Use for: destructive operations, manual approval workflows, interactive wizards.

## Cross-Platform Frontmatter Mapping

| Claude Code Field | Gemini CLI TOML | Codex openai.yaml | OpenCode JSON |
|-------------------|-----------------|-------------------|---------------|
| `description` | `description = "..."` | `agent.description` | `description` |
| `allowed-tools` | N/A | `policy.allowed_tools` | `tools` |
| `model` | N/A | `model` | `model` |
| `argument-hint` | Encoded in `prompt` | N/A | `arguments` |
| `disable-model-invocation` | N/A | `policy.allow_implicit_invocation: false` | N/A |

## Examples

### Minimal Command (no frontmatter)

```markdown
Review this code for common issues and suggest improvements.
```

### Standard Command

```yaml
---
description: Review Git changes
allowed-tools: Bash(git:*), Read
---
```

### Complex Command

```yaml
---
description: Deploy application to environment
argument-hint: [app-name] [environment] [version]
allowed-tools: Bash(kubectl:*), Bash(helm:*), Read
model: sonnet
---
```

### Manual-Only Command

```yaml
---
description: Approve production deployment
argument-hint: [deployment-id]
disable-model-invocation: true
allowed-tools: Bash(gh:*)
---
```
