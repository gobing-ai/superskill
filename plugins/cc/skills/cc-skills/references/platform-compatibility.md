# Platform Compatibility Guide

This document describes platform-specific features and compatibility requirements.

## Platform Support Matrix

| Platform | Base Format | Extensions | Companion Files | Discovery Paths |
|----------|-------------|------------|-----------------|-----------------|
| **Claude Code** | agentskills.io | `!`cmd``, `$ARGUMENTS`, `context: fork`, `hooks:` | None | `.claude/skills/` |
| **Codex** | agentskills.io | `agents/openai.yaml` | agents/openai.yaml | `.codex/skills/`, `.agents/skills/` |
| **Antigravity** | agentskills.io | Gemini CLI compatible | None | `.gemini/skills/`, `.agents/skills/` |
| **OpenCode** | agentskills.io | Config-level `permission.skill` | None | `.opencode/skills/`, `.agents/skills/` |
| **OpenClaw** | agentskills.io | `metadata.openclaw` JSON | None | `~/.agents/skills/`, `<workspace>/.agents/skills/`, `<workspace>/skills/`, `~/.openclaw/skills/` |
| **Pi** | agentskills.io | Pi-native compatible | None | `.pi/agent/skills/`, `.agents/skills/` |

## Format Compatibility

### Universal Format (All Platforms)

```yaml
---
name: skill-name
description: What it does + when to use it
---

# Skill instructions
```

### Claude Code Extensions

```yaml
---
name: skill-name
description: When to use it
context: fork              # Optional: Fork context for tools
hooks:                   # Optional: Pre/post execution
  pre: validate.sh
  post: cleanup.sh
---

# Use !`cmd` for live data
# Use $ARGUMENTS for command parameters
```

### Codex Extensions

```yaml
---
name: skill-name
description: When to use it
# No additional frontmatter fields allowed (strict validation)
---

# Platform notes in body:
# Run commands via Bash tool
```

Plus `agents/openai.yaml`:
```yaml
name: skill-name
interface:
  display_name: "Skill Name"
  short_description: "Short description"
  default_prompt: "Use skill-name to help me..."
```

### OpenClaw Extensions

```yaml
---
name: skill-name
description: When to use it
metadata:
  openclaw:           # OpenClaw reads this
    emoji: "..."
    requires:
      bins: ["node", "git"]
---
```

## Feature Compatibility

### Command Execution

| Feature | Claude Code | Codex | OpenClaw | OpenCode | Antigravity |
|--------|-------------|-------|----------|----------|-------------|
| `!`cmd`` syntax | Native | Bash | Bash | Bash | Bash |
| `$ARGUMENTS` | Native | Chat | Chat | Chat | Chat |
| `context: fork` | Supported | Ignored | Ignored | Ignored | Ignored |
| `hooks:` | Supported | Ignored | Ignored | Ignored | Ignored |

### Resource Handling

| Resource | Claude Code | Codex | OpenClaw | OpenCode | Antigravity |
|----------|-------------|-------|----------|----------|-------------|
| `extensions/` | Execute/Read | Execute/Read | Execute/Read | Execute/Read | Execute/Read |
| `references/` | Load on demand | Load on demand | Load on demand | Load on demand | Load on demand |
| `assets/` | Use in output | Use in output | Use in output | Use in output | Use in output |
| `agents/` | Ignored | Read openai.yaml | Ignored | Ignored | Ignored |

## Migration Patterns

### rd2 to cc Migration

| rd2 Feature | cc Handling |
|-------------|-------------|
| `!`cmd`` syntax | Keep for Claude, add Platform Notes section |
| `$ARGUMENTS` | Keep for Claude, document as Claude-only |
| `context: fork` | Keep (ignored by other platforms) |
| `hooks:` | Keep or move to comments |
| Missing `name:` | Add explicit `name:` from directory name |
| Python scripts | Keep (platform-agnostic) |

### Platform Notes Template

Add to SKILL.md body:

```markdown
## Platform Notes

### Claude Code
Use `!`cmd` for live data. Use `$ARGUMENTS` for command parameters.

### Codex / OpenClaw / OpenCode / Antigravity
Run commands via Bash tool. Arguments provided in chat.
```

## Validation Rules

### Claude Code
- Allows unknown frontmatter fields
- Validates `hooks:` format
- Checks `context:` values

### Codex
- Strict frontmatter (no unknown fields)
- Requires `agents/openai.yaml` for UI
- Validates YAML format strictly

### OpenClaw
- Validates `metadata.openclaw` structure
- Checks `requires.bins` array
- Validates emoji format

### OpenCode
- Config-level permission hints
- Validates skill invocation patterns
- Checks permission configurations

### Antigravity
- Gemini CLI compatible
- Standard format validation
- No platform-specific extensions

## Best Practices for Cross-Platform Skills

1. **Start with universal format**: Use only `name` and `description` in frontmatter
2. **Document platform features**: Add Platform Notes section for Claude-specific features
3. **Generate companions**: Use scaffold to generate `agents/openai.yaml` for Codex
4. **Test on multiple platforms**: Validate with `--platform all`
5. **Keep scripts platform-agnostic**: Use TypeScript/Bash, not platform-specific syntax
