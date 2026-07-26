#!/bin/bash
# Example PreToolUse hook for validating Write/Edit operations
# This script demonstrates file write validation patterns

set -euo pipefail

# Read input from stdin
input=$(cat)

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

# Missing or malformed hook input must not silently approve a write.
if ! file_path=$(printf '%s' "$input" | jq -er '.tool_input.file_path | select(type == "string")' 2>/dev/null) ||
  [ -z "$file_path" ]; then
  emit_decision "ask" "Missing or invalid write path"
fi

# Normalize separators and harmless lexical aliases without touching the filesystem.
slash_path=${file_path//\\//}
network_path=false
if [[ "$slash_path" == //* ]]; then
  network_path=true
fi
if [[ "/$slash_path/" == *"/../"* ]]; then
  emit_decision "deny" "Path traversal detected in: $file_path"
fi
normalized_path=$(jq -rn --arg path "$slash_path" '
  $path
  | (startswith("/")) as $absolute
  | split("/")
  | map(select(. != "" and . != "."))
  | join("/")
  | if $absolute then "/" + . else . end
')
lower_path=$(printf '%s' "$normalized_path" | tr '[:upper:]' '[:lower:]')
if [ -z "$normalized_path" ]; then
  emit_decision "ask" "Write path resolves to no file"
fi

# Check for system directories
case "$lower_path" in
  / | /bin | /bin/* | /boot | /boot/* | /dev | /dev/* | /etc | /etc/* | /library | /library/* | /private/etc \
    | /private/etc/* | /proc | /proc/* | /sbin | /sbin/* | /system | /system/* | /usr | /usr/*)
    emit_decision "deny" "Cannot write to system directory: $file_path"
    ;;
  [a-z]:/windows | [a-z]:/windows/* | [a-z]:/program\ files | [a-z]:/program\ files/* | [a-z]:/programdata \
    | [a-z]:/programdata/*)
    emit_decision "deny" "Cannot write to Windows system directory: $file_path"
    ;;
esac

if [ "$network_path" = true ]; then
  emit_decision "ask" "Network or double-slash write path requires approval: $file_path"
fi

case "$lower_path" in
  /private/var | /private/var/* | /var | /var/*)
    emit_decision "ask" "Writing under system-managed variable data requires approval: $file_path"
    ;;
  [a-z]: | [a-z]:/)
    emit_decision "ask" "Writing to a drive root requires approval: $file_path"
    ;;
esac

# Existing symlink components can redirect an apparently safe path into a protected location.
probe_path=$normalized_path
while [ "$probe_path" != "." ] && [ "$probe_path" != "/" ] && [ -n "$probe_path" ]; do
  if [ -L "$probe_path" ]; then
    emit_decision "ask" "Write path crosses a symbolic link: $file_path"
  fi
  parent_path=$(dirname -- "$probe_path")
  if [ "$parent_path" = "$probe_path" ]; then
    break
  fi
  probe_path=$parent_path
done

# Check for sensitive files
case "$lower_path" in
  .env | .env.* | */.env | */.env.* | */.ssh | */.ssh/* | *.pem | *secret* | *credential*)
    emit_decision "ask" "Writing to potentially sensitive file: $file_path"
    ;;
esac

# Approve the operation
exit 0
