---
name: hook-patterns
description: "10+ proven hook patterns for multi-agent support: security validation, test enforcement, context loading, notifications, MCP monitoring, build verification, permission confirmation, and code quality checks. Includes cross-platform examples."
see_also:
  - cc:cc-hooks
  - cc:cc-hooks/references/advanced
  - cc:cc-hooks/references/migration
  - cc:cc-hooks/references/cross-platform
  - cc:cc-hooks/references/platform-limits
---

# Hook Patterns

Proven patterns for implementing Claude Code hooks for typical use cases.

## Pattern 1: Security Validation

Block dangerous file writes using prompt-based hooks:

```json
{
  "PreToolUse": [
    {
      "matcher": "Write|Edit",
      "hooks": [
        {
          "type": "prompt",
          "prompt": "File path: $TOOL_INPUT.file_path. Verify: 1) Not in /etc or system directories 2) Not .env or credentials 3) Path doesn't contain '..' traversal. Return 'approve' or 'deny'."
        }
      ]
    }
  ]
}
```

**Use for:** Preventing writes to sensitive files or system directories.

## Pattern 2: Test Enforcement

Ensure tests run before stopping:

```json
{
  "Stop": [
    {
      "matcher": "*",
      "hooks": [
        {
          "type": "prompt",
          "prompt": "Review transcript. If code was modified (Write/Edit tools used), verify tests were executed. If no tests were run, block with reason 'Tests must be run after code changes'."
        }
      ]
    }
  ]
}
```

**Use for:** Enforcing quality standards and preventing incomplete work.

## Pattern 3: Context Loading

Load project-specific context at session start:

```json
{
  "SessionStart": [
    {
      "matcher": "*",
      "hooks": [
        {
          "type": "command",
          "command": "bash ${CLAUDE_PLUGIN_ROOT}/hooks/load-context.sh"
        }
      ]
    }
  ]
}
```

**Example script (load-context.sh):**
```bash
#!/bin/bash
cd "$CLAUDE_PROJECT_DIR" || exit 1

# Detect project type
if [ -f "package.json" ]; then
  echo "Node.js project detected"
  echo "export PROJECT_TYPE=nodejs" >> "$CLAUDE_ENV_FILE"
elif [ -f "Cargo.toml" ]; then
  echo "Rust project detected"
  echo "export PROJECT_TYPE=rust" >> "$CLAUDE_ENV_FILE"
fi
```

**Use for:** Automatically detecting and configuring project-specific settings.

> ⚠️ This example uses `${CLAUDE_PLUGIN_ROOT}`, which resolves on **Claude Code only**. For a
> cross-platform session-start hook, register a runner and call
> `superskill hook run <plugin> <hook-id>` instead (SKILL.md Safety Invariant #4). The
> `examples/*.sh` files in the cc-hooks skill are Claude-only references.

## Pattern 4: Notification Logging

Log all notifications for audit or analysis:

```json
{
  "Notification": [
    {
      "matcher": "*",
      "hooks": [
        {
          "type": "command",
          "command": "bash ${CLAUDE_PLUGIN_ROOT}/hooks/log-notification.sh"
        }
      ]
    }
  ]
}
```

**Use for:** Tracking user notifications or integration with external logging systems.

## Pattern 5: MCP Tool Monitoring

Monitor and validate MCP tool usage:

```json
{
  "PreToolUse": [
    {
      "matcher": "mcp__.*__delete.*",
      "hooks": [
        {
          "type": "prompt",
          "prompt": "Deletion operation detected. Verify: Is this deletion intentional? Can it be undone? Are there backups? Return 'approve' only if safe."
        }
      ]
    }
  ]
}
```

**Use for:** Protecting against destructive MCP operations.

## Pattern 6: Build Verification

Ensure project builds after code changes:

```json
{
  "Stop": [
    {
      "matcher": "*",
      "hooks": [
        {
          "type": "prompt",
          "prompt": "Check if code was modified. If Write/Edit tools were used, verify the project was built (npm run build, cargo build, etc). If not built, block and request build."
        }
      ]
    }
  ]
}
```

**Use for:** Catching build errors before committing or stopping work.

## Pattern 7: Permission Confirmation

Ask user before dangerous operations:

```json
{
  "PreToolUse": [
    {
      "matcher": "Bash",
      "hooks": [
        {
          "type": "prompt",
          "prompt": "Command: $TOOL_INPUT.command. If command contains 'rm', 'delete', 'drop', or other destructive operations, return 'ask' to confirm with user. Otherwise 'approve'."
        }
      ]
    }
  ]
}
```

**Use for:** User confirmation on potentially destructive commands.

## Pattern 8: Code Quality Checks

Run linters or formatters on file edits:

```json
{
  "PostToolUse": [
    {
      "matcher": "Write|Edit",
      "hooks": [
        {
          "type": "command",
          "command": "bash ${CLAUDE_PLUGIN_ROOT}/hooks/check-quality.sh"
        }
      ]
    }
  ]
}
```

**Example script (check-quality.sh):**
```bash
#!/bin/bash
input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path')

# Run linter if applicable
if [[ "$file_path" == *.js ]] || [[ "$file_path" == *.ts ]]; then
  npx eslint "$file_path" 2>&1 || true
fi
```

**Use for:** Automatic code quality enforcement.

## Pattern 9: Temporarily Active Hooks

Create hooks that only run when explicitly enabled via flag files:

```bash
#!/bin/bash
FLAG_FILE="$CLAUDE_PROJECT_DIR/.enable-security-scan"

if [ ! -f "$FLAG_FILE" ]; then
  exit 0
fi

input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path')
security-scanner "$file_path"
```

**Activation:**
```bash
touch .enable-security-scan  # Enable
rm .enable-security-scan     # Disable
```

**Use for:**
- Temporary debugging hooks
- Feature flags for development
- Project-specific validation that's opt-in
- Performance-intensive checks only when needed

## Pattern 10: Configuration-Driven Hooks

Use JSON configuration to control hook behavior:

```bash
#!/bin/bash
CONFIG_FILE="$CLAUDE_PROJECT_DIR/.claude/my-plugin.local.json"

if [ -f "$CONFIG_FILE" ]; then
  strict_mode=$(jq -r '.strictMode // false' "$CONFIG_FILE")
  max_file_size=$(jq -r '.maxFileSize // 1000000' "$CONFIG_FILE")
else
  strict_mode=false
  max_file_size=1000000
fi

if [ "$strict_mode" != "true" ]; then
  exit 0
fi

input=$(cat)
file_size=$(echo "$input" | jq -r '.tool_input.content | length')

if [ "$file_size" -gt "$max_file_size" ]; then
  echo '{"decision": "deny", "reason": "File exceeds configured size limit"}' >&2
  exit 2
fi
```

**Configuration file:**
```json
{
  "strictMode": true,
  "maxFileSize": 500000,
  "allowedPaths": ["/tmp", "/home/user/projects"]
}
```

**Use for:**
- User-configurable hook behavior
- Per-project settings
- Team-specific rules
- Dynamic validation criteria

## Pattern Combinations

Combine multiple patterns for comprehensive protection:

```json
{
  "PreToolUse": [
    {"matcher": "Write|Edit", "hooks": [{"type": "prompt", "prompt": "Validate file write safety"}]},
    {"matcher": "Bash", "hooks": [{"type": "prompt", "prompt": "Validate bash command safety"}]}
  ],
  "Stop": [
    {"matcher": "*", "hooks": [{"type": "prompt", "prompt": "Verify tests run and build succeeded"}]}
  ],
  "SessionStart": [
    {"matcher": "*", "hooks": [{"type": "command", "command": "bash ${CLAUDE_PLUGIN_ROOT}/hooks/load-context.sh"}]}
  ]
}
```

This provides multi-layered protection and automation.

---

## Cross-Platform Pattern Examples

The patterns above are shown in Claude Code format. Below are the same patterns in **abstract format** that can be deployed to all platforms.

### Cross-Platform: Security Validation (Abstract)

```yaml
# hooks.yaml — Abstract format
version: "1.0"
hooks:
  PreToolUse:
    - matcher: "Write|Edit"
      hooks:
        - type: command
          command: "bash $PLUGIN_ROOT/hooks/validate-write.sh"
          timeout: 5
```

**Result:**
- Claude Code: `$CLAUDE_PLUGIN_ROOT/hooks/validate-write.sh`
- Pi: `./hooks/validate-write.sh`
- Codex: `$CODEX_PLUGIN_ROOT/hooks/validate-write.sh`
- Gemini: `./hooks/validate-write.sh`

### Cross-Platform: Test Enforcement (Abstract)

```yaml
version: "1.0"
hooks:
  Stop:
    - matcher: "*"
      hooks:
        - type: command
          command: "bash $PLUGIN_ROOT/hooks/check-tests.sh"
          timeout: 30
```

**Platform notes:**
- Claude Code, Pi: Stop hook prevents agent from stopping if tests haven't run
- Codex: Skipped (no Stop event)
- Gemini: Mapped to `AfterAgent`

### Cross-Platform: Context Loading (Abstract)

```yaml
version: "1.0"
hooks:
  SessionStart:
    - matcher: "*"
      hooks:
        - type: command
          command: "bash $PLUGIN_ROOT/hooks/load-context.sh"
          timeout: 10
```

**Platform notes:**
- Claude Code, Pi: Runs on session start
- Codex: Mapped to `session_start`
- Gemini: Skipped (no SessionStart event)

### Cross-Platform: Bash Safety with Pi `if` Condition

```yaml
version: "1.0"
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "bash $PLUGIN_ROOT/hooks/validate-bash.sh"
          timeout: 5
        - type: command
          command: "echo 'git push blocked' >&2 && exit 2"
          if: "Bash(git push*)"
          timeout: 5
```

**Platform notes:**
- Pi: `if` condition activates the git-push-specific block
- Other platforms: `if` field is ignored; both hooks run for all Bash commands
- The `matcher: "Bash"` is translated to lowercase for Pi, PascalCase for Claude Code

## Pattern 11: failClosed on Destructive Events

```json
{
  "hooks": {
    "preToolUse": [
      {
        "type": "command",
        "matcher": "Bash",
        "command": "superskill hook run myplugin bash-guard",
        "timeout": 3000,
        "failClosed": true
      }
    ]
  }
}
```

With `failClosed: true`, a crash or timeout of the guard **blocks** the Bash call rather than
allowing it through. Default to `failClosed: true` on `preToolUse` for destructive tools; default
to `failOpen` on read-only events (`postToolUse`, `sessionEnd`). Prefer the portable PATH command
form (`superskill hook run`) over `${CLAUDE_PLUGIN_ROOT}` script paths (see Pattern 3's warning).
