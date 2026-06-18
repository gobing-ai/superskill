---
name: hook-advanced-techniques
description: "Advanced hook techniques for multi-agent support: multi-stage validation, conditional execution, hook chaining, dynamic configuration, cross-event workflows, external system integration, rate limiting, audit logging, secret detection, and platform-specific patterns for Pi, Gemini, and Codex."
see_also:
  - cc:cc-hooks
  - cc:cc-hooks/references/patterns
  - cc:cc-hooks/references/migration
  - cc:cc-hooks/references/cross-platform
  - cc:cc-hooks/references/platform-limits
---

# Advanced Hook Techniques

Advanced hook patterns and techniques for sophisticated automation workflows.

## Multi-Stage Validation

Combine command and prompt hooks for layered validation:

```json
{
  "PreToolUse": [
    {
      "matcher": "Bash",
      "hooks": [
        {"type": "command", "command": "bash ${CLAUDE_PLUGIN_ROOT}/hooks/quick-check.sh", "timeout": 5},
        {"type": "prompt", "prompt": "Deep analysis of bash command: $TOOL_INPUT", "timeout": 15}
      ]
    }
  ]
}
```

**Use case:** Fast deterministic checks followed by intelligent analysis

**Example quick-check.sh:**
```bash
#!/bin/bash
input=$(cat)
command=$(echo "$input" | jq -r '.tool_input.command')

if [[ "$command" =~ ^(ls|pwd|echo|date|whoami)$ ]]; then
  exit 0
fi

exit 0
```

The command hook quickly approves obviously safe commands, while the prompt hook analyzes everything else.

## Conditional Hook Execution

Execute hooks based on environment or context:

```bash
#!/bin/bash
if [ -z "$CI" ]; then
  echo '{"continue": true}'
  exit 0
fi

input=$(cat)
# ... validation code in CI ...
```

**Use cases:**
- Different behavior in CI vs local development
- Project-specific validation
- User-specific rules

## Hook Chaining via State

Share state between hooks using temporary files:

```bash
# Hook 1: Analyze and save state
input=$(cat)
command=$(echo "$input" | jq -r '.tool_input.command')
risk_level=$(calculate_risk "$command")
echo "$risk_level" > /tmp/hook-state-$$
exit 0
```

```bash
# Hook 2: Use saved state
risk_level=$(cat /tmp/hook-state-$$ 2>/dev/null || echo "unknown")

if [ "$risk_level" = "high" ]; then
  echo "High risk operation detected" >&2
  exit 2
fi
```

**Important:** This only works for sequential hook events (e.g., PreToolUse then PostToolUse), not parallel hooks.

## Dynamic Hook Configuration

Modify hook behavior based on project configuration:

```bash
#!/bin/bash
cd "$CLAUDE_PROJECT_DIR" || exit 1

if [ -f ".claude-hooks-config.json" ]; then
  strict_mode=$(jq -r '.strict_mode' .claude-hooks-config.json)

  if [ "$strict_mode" = "true" ]; then
    # Apply strict validation
  fi
fi
```

**Example config:**
```json
{
  "strict_mode": true,
  "allowed_commands": ["ls", "pwd", "grep"],
  "forbidden_paths": ["/etc", "/sys"]
}
```

## Context-Aware Prompt Hooks

Use transcript and session context for intelligent decisions:

```json
{
  "Stop": [
    {
      "matcher": "*",
      "hooks": [
        {
          "type": "prompt",
          "prompt": "Review the full transcript at $TRANSCRIPT_PATH. Check: 1) Were tests run after code changes? 2) Did the build succeed? 3) Were all user questions answered? 4) Is there any unfinished work? Return 'approve' only if everything is complete."
        }
      ]
    }
  ]
}
```

The LLM can read the transcript file and make context-aware decisions.

## Performance Optimization

### Caching Validation Results

```bash
#!/bin/bash
input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path')
cache_key=$(echo -n "$file_path" | md5sum | cut -d' ' -f1)
cache_file="/tmp/hook-cache-$cache_key"

if [ -f "$cache_file" ]; then
  cache_age=$(($(date +%s) - $(stat -f%m "$cache_file" 2>/dev/null || stat -c%Y "$cache_file")))
  if [ "$cache_age" -lt 300 ]; then
    cat "$cache_file"
    exit 0
  fi
fi

result='{"decision": "approve"}'
echo "$result" > "$cache_file"
echo "$result"
```

### Parallel Execution

Since hooks run in parallel, design them to be independent:

```json
{
  "PreToolUse": [
    {
      "matcher": "Write",
      "hooks": [
        {"type": "command", "command": "bash check-size.sh", "timeout": 2},
        {"type": "command", "command": "bash check-path.sh", "timeout": 2},
        {"type": "prompt", "prompt": "Check content safety", "timeout": 10}
      ]
    }
  ]
}
```

All three hooks run simultaneously, reducing total latency.

## Cross-Event Workflows

Coordinate hooks across different events:

**SessionStart - Set up tracking:**
```bash
echo "0" > /tmp/test-count-$$
echo "0" > /tmp/build-count-$$
```

**PostToolUse - Track events:**
```bash
input=$(cat)
tool_name=$(echo "$input" | jq -r '.tool_name')

if [ "$tool_name" = "Bash" ]; then
  command=$(echo "$input" | jq -r '.tool_result')
  if [[ "$command" == *"test"* ]]; then
    count=$(cat /tmp/test-count-$$ 2>/dev/null || echo "0")
    echo $((count + 1)) > /tmp/test-count-$$
  fi
fi
```

**Stop - Verify based on tracking:**
```bash
test_count=$(cat /tmp/test-count-$$ 2>/dev/null || echo "0")

if [ "$test_count" -eq 0 ]; then
  echo '{"decision": "block", "reason": "No tests were run"}' >&2
  exit 2
fi
```

## Integration with External Systems

### Slack Notifications

```bash
#!/bin/bash
input=$(cat)
tool_name=$(echo "$input" | jq -r '.tool_name')
decision="blocked"

curl -X POST "$SLACK_WEBHOOK" \
  -H 'Content-Type: application/json' \
  -d "{\"text\": \"Hook ${decision} ${tool_name} operation\"}" \
  2>/dev/null

echo '{"decision": "deny"}' >&2
exit 2
```

### Database Logging

```bash
#!/bin/bash
input=$(cat)
psql "$DATABASE_URL" -c "INSERT INTO hook_logs (event, data) VALUES ('PreToolUse', '$input')" 2>/dev/null
exit 0
```

### Metrics Collection

```bash
#!/bin/bash
input=$(cat)
tool_name=$(echo "$input" | jq -r '.tool_name')
echo "hook.pretooluse.${tool_name}:1|c" | nc -u -w1 statsd.local 8125
exit 0
```

## Security Patterns

### Rate Limiting

```bash
#!/bin/bash
input=$(cat)
command=$(echo "$input" | jq -r '.tool_input.command')
rate_file="/tmp/hook-rate-$$"
current_minute=$(date +%Y%m%d%H%M)

if [ -f "$rate_file" ]; then
  last_minute=$(head -1 "$rate_file")
  count=$(tail -1 "$rate_file")

  if [ "$current_minute" = "$last_minute" ]; then
    if [ "$count" -gt 10 ]; then
      echo '{"decision": "deny", "reason": "Rate limit exceeded"}' >&2
      exit 2
    fi
    count=$((count + 1))
  else
    count=1
  fi
else
  count=1
fi

echo "$current_minute" > "$rate_file"
echo "$count" >> "$rate_file"
exit 0
```

### Audit Logging

```bash
#!/bin/bash
input=$(cat)
tool_name=$(echo "$input" | jq -r '.tool_name')
timestamp=$(date -Iseconds)
echo "$timestamp | $USER | $tool_name | $input" >> ~/.claude/audit.log
exit 0
```

### Secret Detection

```bash
#!/bin/bash
input=$(cat)
content=$(echo "$input" | jq -r '.tool_input.content')

if echo "$content" | grep -qE "(api[_-]?key|password|secret|token).{0,20}['\"]?[A-Za-z0-9]{20,}"; then
  echo '{"decision": "deny", "reason": "Potential secret detected in content"}' >&2
  exit 2
fi
exit 0
```

## Testing Advanced Hooks

### Unit Testing Hook Scripts

```bash
#!/bin/bash

result=$(echo '{"tool_input": {"command": "ls"}}' | bash validate-bash.sh)
if [ $? -eq 0 ]; then
  echo "Test 1 passed"
fi

result=$(echo '{"tool_input": {"command": "rm -rf /"}}' | bash validate-bash.sh)
if [ $? -eq 2 ]; then
  echo "Test 2 passed"
fi
```

### Integration Testing

```bash
#!/bin/bash
export CLAUDE_PROJECT_DIR="/tmp/test-project"
export CLAUDE_PLUGIN_ROOT="$(pwd)"
mkdir -p "$CLAUDE_PROJECT_DIR"

echo '{}' | bash hooks/session-start.sh
if [ -f "/tmp/session-initialized" ]; then
  echo "SessionStart hook works"
fi

rm -rf "$CLAUDE_PROJECT_DIR"
```

## Common Pitfalls

### Assuming Hook Order

Hooks run in parallel — don't rely on execution order for sharing state between parallel hooks.

### Long-Running Hooks

Set appropriate timeouts. Long-running hooks will block the workflow.

### Uncaught Exceptions

```bash
# BAD: Script crashes on unexpected input
file_path=$(echo "$input" | jq -r '.tool_input.file_path')
cat "$file_path"  # Fails if file doesn't exist

# GOOD: Handles errors gracefully
if [ ! -f "$file_path" ]; then
  echo '{"continue": true, "systemMessage": "File not found, skipping check"}'
  exit 0
fi
```

## Best Practices

1. **Keep hooks independent** — Don't rely on execution order
2. **Use timeouts** — Set appropriate limits for each hook type
3. **Handle errors gracefully** — Provide clear error messages
4. **Test thoroughly** — Cover edge cases and failure modes
5. **Monitor performance** — Track hook execution time
6. **Version configuration** — Use version control for hook configs
7. **Provide escape hatches** — Allow users to bypass hooks when needed

---

## Platform-Specific Advanced Patterns

### Pi: `if` Conditions for Granular Control

Pi's `@hsingjui/pi-hooks` supports `if` conditions on individual hooks. This enables tool-specific filtering without complex bash logic:

```json
{
  "PreToolUse": [
    {
      "matcher": "bash",
      "hooks": [
        {
          "if": "Bash(git push*)",
          "type": "command",
          "command": "echo 'BLOCKED: git push requires manual approval' >&2 && exit 2",
          "timeout": 5
        },
        {
          "if": "Bash(rm *)",
          "type": "command",
          "command": "echo 'WARNING: rm command detected' >&2",
          "timeout": 5
        }
      ]
    }
  ]
}
```

**`if` syntax:** `ToolName(pattern)` where `*` is a wildcard.

**Supported tool fields for matching:**
- `bash`: matches against `tool_input.command`
- `read`, `write`, `edit`: matches against `tool_input.path` or `tool_input.file_path`
- Other tools: matches against JSON string of `tool_input`

### Pi: Stop Continuation

Pi can prevent the agent from stopping (similar to Claude Code's Stop hook blocking):

```json
{
  "Stop": [
    {
      "hooks": [
        {
          "type": "command",
          "command": "bash ./hooks/check-tests.sh",
          "timeout": 30
        }
      ]
    }
  ]
}
```

When the hook exits with code 0 and outputs `{"decision": "block"}` in JSON, Pi injects the reason as a hidden message and triggers another agent turn.

### Gemini: Synchronous Stdin/Stdout Protocol

Gemini hooks must read JSON from stdin and write JSON to stdout:

```bash
#!/bin/bash
# Gemini-compatible hook
input=$(cat)
tool_name=$(echo "$input" | jq -r '.tool_name // empty')

if [[ "$tool_name" == "bash" ]]; then
  command=$(echo "$input" | jq -r '.tool_input.command // empty')
  if [[ "$command" == *"rm -rf"* ]]; then
    echo '{"decision": "deny", "reason": "Dangerous command blocked"}'
    exit 0
  fi
fi

echo '{"decision": "allow"}'
exit 0
```

**Critical:** Non-JSON output to stdout causes a parsing failure in Gemini.

### Codex: Concurrent Hook Execution

Codex runs multiple matching hooks for the same event in parallel without blocking each other. Design hooks to be idempotent and thread-safe:

```json
{
  "pre_tool_use": [
    {
      "matcher": "bash",
      "hooks": [
        {"type": "command", "command": "validate-security.sh"},
        {"type": "command", "command": "check-permissions.sh"},
        {"type": "command", "command": "audit-log.sh"}
      ]
    }
  ]
}
```

All three hooks run concurrently. If any exits with code 2, the tool call is blocked.

### Cross-Platform: Command Hook That Calls LLM

When you need prompt-like behavior on non-Claude platforms, use a command hook that invokes an LLM CLI:

```yaml
# Abstract format
version: "1.0"
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: |
            input=$(cat)
            cmd=$(echo "$input" | jq -r '.tool_input.command // empty')
            result=$(claude -p "Is this command safe? $cmd. Answer SAFE or UNSAFE." --max-tokens 50)
            if echo "$result" | grep -q UNSAFE; then
              echo '{"permissionDecision": "deny", "permissionDecisionReason": "LLM flagged as unsafe"}'
              exit 0
            fi
            exit 0
          timeout: 30
```

**Trade-off:** Adds 2-5s latency per hook invocation. Use sparingly, only for high-risk operations.
