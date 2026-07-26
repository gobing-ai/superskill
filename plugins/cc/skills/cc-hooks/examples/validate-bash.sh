#!/bin/bash
# Example PreToolUse hook for validating Bash commands
# This script demonstrates bash command validation patterns

set -euo pipefail

# Read input from stdin
input=$(cat)

# Extract command
command=$(echo "$input" | jq -r '.tool_input.command // empty')

emit_decision() {
  local decision=$1
  local reason=$2
  jq -cn \
    --arg decision "$decision" \
    --arg reason "$reason" \
    '{
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: $decision,
        permissionDecisionReason: $reason
      }
    }'
  exit 0
}

# Validate command exists
if [ -z "$command" ]; then
  exit 0
fi

# Check for destructive operations
if [[ "$command" == *"rm -rf"* ]] ||
  [[ "$command" == *"rm -fr"* ]] ||
  [[ "$command" == *"rm --recursive --force"* ]] ||
  [[ "$command" == *"rm --force --recursive"* ]]; then
  emit_decision "deny" "Dangerous recursive forced removal detected"
fi

# Check for other dangerous commands
if [[ "$command" == *"dd if="* ]] || [[ "$command" == *"mkfs"* ]] || [[ "$command" == *"> /dev/"* ]]; then
  emit_decision "deny" "Dangerous system operation detected"
fi

# Check for privilege escalation
privileged_pattern='(^|[[:space:];|&])(sudo|su)([[:space:]]|$)'
if [[ "$command" =~ $privileged_pattern ]]; then
  emit_decision "ask" "Command requires elevated privileges"
fi

# Only a deliberately narrow grammar can pass without review. Shell substitutions,
# redirections, chaining, quoting, and unknown executables all route to human approval.
safe_pattern='^(pwd|date|whoami)[[:space:]]*$|^(ls|echo)([[:space:]]+[-[:alnum:]_./]+)*[[:space:]]*$'
if [[ "$command" =~ $safe_pattern ]]; then
  exit 0
fi

emit_decision "ask" "Command is outside the example hook's narrow allowlist"
