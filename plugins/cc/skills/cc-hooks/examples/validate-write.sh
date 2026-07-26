#!/bin/bash
# Example PreToolUse hook for validating Write/Edit operations
# This script demonstrates file write validation patterns

set -euo pipefail

# Read input from stdin
input=$(cat)

# Extract file path and content
file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty')

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

# Validate path exists
if [ -z "$file_path" ]; then
  exit 0
fi

# Check for path traversal segments without rejecting benign names such as `release..notes`.
normalized_path=${file_path//\\//}
if [[ "/$normalized_path/" == *"/../"* ]]; then
  emit_decision "deny" "Path traversal detected in: $file_path"
fi

# Check for system directories
case "$normalized_path" in
  /bin/* | /boot/* | /dev/* | /etc/* | /proc/* | /sbin/* | /sys/* | /usr/*)
    emit_decision "deny" "Cannot write to system directory: $file_path"
    ;;
esac

# Check for sensitive files
lower_path=$(printf '%s' "$normalized_path" | tr '[:upper:]' '[:lower:]')
case "$lower_path" in
  .env | .env.* | */.env | */.env.* | */.ssh | */.ssh/* | *.pem | *secret* | *credential*)
    emit_decision "ask" "Writing to potentially sensitive file: $file_path"
    ;;
esac

# Approve the operation
exit 0
