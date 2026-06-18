---
name: cross-platform-hooks
description: "Cross-platform hook usage guide: event crosswalk, tool name mapping, write-once-deploy-everywhere workflow, and common pitfalls across Claude Code, Codex, OpenCode, Pi, and Gemini CLI."
see_also:
  - cc:cc-hooks
  - cc:cc-hooks/references/patterns
  - cc:cc-hooks/references/platform-limits
---

# Cross-Platform Hooks Guide

Write hooks once in the abstract format, deploy to multiple coding agents.

## Quick Start

1. Define hooks in `hooks.yaml` (abstract format)
2. Use `superskill hook validate` to check structure
3. Platform-specific config generation is handled at install time

```bash
# Validate hook config
superskill hook validate hooks.yaml
```

## Event Crosswalk

| Abstract Event | Claude Code | Codex | OpenCode | Pi (pi-hooks) | Gemini CLI |
|---------------|-------------|-------|----------|---------------|------------|
| `SessionStart` | `SessionStart` | `session_start` | `session.start` | `SessionStart` | N/A |
| `SessionEnd` | `SessionEnd` | N/A | `session.end` | `SessionEnd` | N/A |
| `PreToolUse` | `PreToolUse` | `pre_tool_use` | `tool.execute.before` | `PreToolUse` | `BeforeTool` |
| `PostToolUse` | `PostToolUse` | `post_tool_use` | `tool.execute.after` | `PostToolUse` | `AfterTool` |
| `PostToolUseFailure` | N/A | N/A | N/A | `PostToolUseFailure` | N/A |
| `UserPromptSubmit` | `UserPromptSubmit` | N/A | N/A | `UserPromptSubmit` | N/A |
| `Stop` | `Stop` | N/A | `session.idle` | `Stop` | `AfterAgent` |
| `SubagentStop` | `SubagentStop` | N/A | N/A | N/A | N/A |
| `PreCompact` | `PreCompact` | N/A | N/A | `PreCompact` | N/A |
| `PostCompact` | N/A | N/A | N/A | `PostCompact` | N/A |
| `Notification` | `Notification` | N/A | N/A | N/A | N/A |

**Rules:**
- Events not supported by a platform are silently skipped with a warning on stderr.
- `N/A` means the platform has no equivalent event.

## Tool Name Mapping

| Abstract | Claude Code | Codex | OpenCode | Pi | Gemini |
|----------|-------------|-------|----------|----|--------|
| `bash` | `Bash` | `bash` | `bash` | `bash` | `bash` |
| `read` | `Read` | `read` | `read` | `read` | `read` |
| `write` | `Write` | `write` | `write` | `write` | `write` |
| `edit` | `Edit` | `edit` | `edit` | `edit` | `edit` |
| `grep` | `Grep` | `grep` | `grep` | `grep` | `grep` |

**MCP tools:** Use `mcp__<server>__<tool>` universally. No case conversion needed.

## Environment Variables

The abstract schema uses `$PROJECT_DIR` and `$PLUGIN_ROOT` as placeholders. Emitters replace them:

| Abstract | Claude Code | Codex | Pi | Gemini |
|----------|-------------|-------|----|--------|
| `$PROJECT_DIR` | `$CLAUDE_PROJECT_DIR` | `$CODEX_PROJECT_DIR` | `$CWD` | `$GEMINI_PROJECT_DIR` |
| `$PLUGIN_ROOT` | `$CLAUDE_PLUGIN_ROOT` | `$CODEX_PLUGIN_ROOT` | `.` (relative) | `.` (relative) |

## Example: Write Once, Deploy Everywhere

### Abstract hook config (hooks.yaml)

```yaml
version: "1.0"
hooks:
  SessionStart:
    - matcher: "*"
      hooks:
        - type: command
          command: "bash $PLUGIN_ROOT/hooks/load-context.sh"
          timeout: 10

  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "bash $PLUGIN_ROOT/hooks/validate-bash.sh"
          timeout: 5

    - matcher: "Write|Edit"
      hooks:
        - type: command
          command: "bash $PLUGIN_ROOT/hooks/validate-write.sh"
          timeout: 5
        - type: prompt
          prompt: "File: $TOOL_INPUT.file_path. Check safety. Return approve/deny."
          timeout: 15

  Stop:
    - matcher: "*"
      hooks:
        - type: command
          command: "bash $PLUGIN_ROOT/hooks/check-tests.sh"
          timeout: 30
```

### Generated: Claude Code (.claude/settings.json)

```json
{
  "hooks": {
    "SessionStart": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "bash $CLAUDE_PLUGIN_ROOT/hooks/load-context.sh", "timeout": 10 }] }],
    "PreToolUse": [
      { "matcher": "Bash", "hooks": [{ "type": "command", "command": "bash $CLAUDE_PLUGIN_ROOT/hooks/validate-bash.sh", "timeout": 5 }] },
      { "matcher": "Write|Edit", "hooks": [
        { "type": "command", "command": "bash $CLAUDE_PLUGIN_ROOT/hooks/validate-write.sh", "timeout": 5 },
        { "type": "prompt", "prompt": "File: $TOOL_INPUT.file_path. Check safety. Return approve/deny.", "timeout": 15 }
      ]}
    ],
    "Stop": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "bash $CLAUDE_PLUGIN_ROOT/hooks/check-tests.sh", "timeout": 30 }] }]
  }
}
```

### Generated: Pi (.pi/settings.json)

```json
{
  "hooks": {
    "SessionStart": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "bash ./hooks/load-context.sh", "timeout": 10 }] }],
    "PreToolUse": [
      { "matcher": "Bash", "hooks": [{ "type": "command", "command": "bash ./hooks/validate-bash.sh", "timeout": 5 }] },
      { "matcher": "Write|Edit", "hooks": [{ "type": "command", "command": "bash ./hooks/validate-write.sh", "timeout": 5 }] }
    ],
    "Stop": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "bash ./hooks/check-tests.sh", "timeout": 30 }] }]
  }
}
```

**Note:** The `type: "prompt"` hook is skipped on Pi with a warning. Only `type: "command"` hooks are portable.

### Generated: Gemini CLI (.gemini/settings.json)

```json
{
  "hooks": {
    "BeforeTool": [
      { "matcher": "Bash", "hooks": [{ "type": "command", "command": "bash ./hooks/validate-bash.sh", "timeout": 5 }] },
      { "matcher": "Write|Edit", "hooks": [{ "type": "command", "command": "bash ./hooks/validate-write.sh", "timeout": 5 }] }
    ],
    "AfterAgent": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "bash ./hooks/check-tests.sh", "timeout": 30 }] }]
  }
}
```

**Note:** `SessionStart` is not supported on Gemini and is silently skipped.

## Common Pitfalls

### 1. Using `type: "prompt"` hooks everywhere

Prompt hooks are Claude Code-only. If you need cross-platform portability, use `type: "command"` hooks that invoke an LLM CLI:

```yaml
# Not portable:
- type: prompt
  prompt: "Validate this command"

# Portable alternative:
- type: command
  command: "claude -p 'Validate this command: $TOOL_INPUT' --max-tokens 100"
  timeout: 30
```

### 2. Hardcoding platform-specific env vars

Never use `$CLAUDE_PROJECT_DIR` in abstract hooks. Use `$PROJECT_DIR` — the emitter replaces it.

### 3. Expecting all events on all platforms

Check the event crosswalk before designing hooks. `PostToolUseFailure` only exists on Pi. `Notification` only exists on Claude Code.

### 4. Case-sensitive matchers

Claude Code matchers use PascalCase (`Bash`, `Write`). Pi uses lowercase (`bash`, `write`). The abstract format accepts either — emitters translate automatically.

### 5. Forgetting to install pi-hooks

Pi requires the `@hsingjui/pi-hooks` extension:
```bash
pi install npm:@hsingjui/pi-hooks
```

Without it, `.pi/settings.json` hooks are ignored.
