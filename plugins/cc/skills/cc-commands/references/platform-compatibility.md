# Cross-Platform Command Compatibility

How slash commands map across agent platforms.

## Platform Command Formats

| Platform | Command Format | File Type | Location |
|----------|---------------|-----------|----------|
| Claude Code | Markdown with YAML frontmatter | `.md` | `commands/` or `<plugin>/commands/` |
| Claude Code Skills 2.0 | SKILL.md with `disable-model-invocation: true` | `.md` in dir | `skills/<name>/SKILL.md` |
| Codex | `agents/openai.yaml` with policy | `.yaml` | `agents/` |
| Gemini CLI | TOML file with prompt | `.toml` | `.gemini/commands/` |
| OpenClaw | SKILL.md with `command-dispatch` | `.md` in dir | `skills/` |
| OpenCode | Markdown or JSON config | `.md` or `.json` | `.opencode/commands/` |
| Antigravity | @mention syntax (no formal commands) | `.md` in dir | `skills/` (as skill) |

## Feature Portability Matrix

| Feature | Claude | Skills 2.0 | Codex | Gemini | OpenClaw | OpenCode | Antigravity |
|---------|--------|-----------|-------|--------|----------|----------|-------------|
| Description | Y | Y | Y | Y | Y | Y | Y |
| Arguments ($1, $2) | Y | N | N | {{args}} | N | $ARGUMENTS | N |
| Tool restriction | Y | N | Y | N | N | Y | N |
| Model selection | Y | N | Y | N | N | Y | N |
| Disable invocation | Y | Y | Y | N | N | N | N |
| Task() pseudocode | Y | N | N | N | N | N | N |
| Skill() delegation | Y | Y | N | N | Y | N | N |
| !`cmd` execution | Y | Y | N | !{cmd} | N | N | N |
| $ARGUMENTS | Y | N | N | {{args}} | N | $ARGUMENTS | N |
| CLAUDE_PLUGIN_ROOT | Y | Y | N | N | N | N | N |

## Adaptation Strategies

### Claude Code -> Gemini CLI TOML

**Input:** `commands/my-command.md`
**Output:** `.gemini/commands/my-command.toml`

Transformations:
- `$ARGUMENTS` / `$N` -> `{{args}}` (Gemini arg syntax)
- `!`cmd`` -> `!{cmd}` (Gemini shell execution)
- `description` -> TOML `description` field
- Body -> TOML `prompt` field (multiline string)
- `Task()`, `Skill()`, `AskUserQuestion()` -> stripped with warning (non-portable)

```toml
description = "Review code for security issues"
prompt = """
Review the code for security issues.

Check for:
1. SQL injection
2. XSS vulnerabilities
3. Hardcoded credentials
"""
```

### Claude Code -> Codex

**Input:** `commands/my-command.md`
**Output:** `skills/my-command/SKILL.md` + `agents/openai.yaml`

Transformations:
- Frontmatter fields mapped to SKILL.md frontmatter
- `disable-model-invocation: true` -> `policy.allow_implicit_invocation: false`
- `allowed-tools` -> `policy.allowed_tools`
- Body converted to skill instructions
- `Task()` / `Skill()` -> natural language equivalents

### Claude Code -> OpenClaw

**Input:** `commands/my-command.md`
**Output:** `skills/my-command/SKILL.md` with `command-dispatch`

Transformations:
- Add `command-dispatch: true` to frontmatter
- Add `command-tool: <tool>` if command uses specific tool
- `$ARGUMENTS` -> input provided in chat
- Body adapted to OpenClaw instruction style

### Claude Code -> OpenCode

**Input:** `commands/my-command.md`
**Output:** `.opencode/commands/my-command.md`

Transformations:
- Minimal changes (similar Markdown format)
- `$1`, `$2` -> `$ARGUMENTS` pattern
- Remove Claude-specific features (Task, Skill)

### Claude Code -> Antigravity

**Input:** `commands/my-command.md`
**Output:** `skills/my-command/SKILL.md` (mention-triggered)

Transformations:
- Convert to skill format (Antigravity has no formal command system)
- All pseudocode converted to natural language
- Triggered by @mention, not /slash

## Non-Portable Features

These Claude Code features cannot be directly translated:

| Feature | Impact | Mitigation |
|---------|--------|------------|
| `Task()` | Agent spawning is Claude-specific | Convert to "delegate to specialist" instructions |
| `Skill()` | Skill invocation syntax varies | Convert to natural language instruction |
| `AskUserQuestion()` | Interactive prompting varies | Convert to "ask the user about..." |
| `SlashCommand()` | Command chaining is Claude-specific | Convert to sequential instructions |
| `CLAUDE_PLUGIN_ROOT` | Plugin path resolution is Claude-specific | Use relative paths or document requirement |
| `context: fork` | Parallel reasoning is Claude-specific | Remove or note as optimization |

## Platform-Specific Notes

### Claude Code
- Native format, no adaptation needed
- Full feature support including Task(), Skill(), $ARGUMENTS
- Commands in `commands/` or `<plugin>/commands/` directories

### Gemini CLI
- TOML-based command format in `.gemini/commands/`
- Argument syntax: `{{args}}` instead of `$ARGUMENTS`
- Shell execution: `!{cmd}` instead of `!`cmd``
- No subagent delegation support

### Codex
- Uses `agents/openai.yaml` for agent configuration
- Commands are implemented as skills with restricted invocation
- UI chip display for registered commands

### OpenClaw
- Commands are skills with `command-dispatch: true`
- `/skill-name [input]` invocation syntax
- Optional `command-tool` for tool-specific commands

### OpenCode
- Commands in `.opencode/commands/<name>.md` or JSON config
- Similar Markdown format to Claude Code
- Limited pseudocode support

### Antigravity
- No formal command system
- Commands implemented as skills triggered by @mention
- Natural language only (no pseudocode constructs)
