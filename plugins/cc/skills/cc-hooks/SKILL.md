---
name: cc-hooks
description: "Multi-agent hook system: write hooks once in abstract format, deploy to Claude Code, Codex, OpenCode, Pi (pi-hooks), and Gemini CLI. Covers command and prompt hooks, cross-platform patterns, and migration guides."
license: Apache-2.0
version: 2.0.0
created_at: 2026-03-23
updated_at: 2026-04-28
type: technique
tags: [hooks, automation, multi-agent, claude-code, codex, pi, opencode, gemini, security, validation, plugin-dev]
metadata:
  author: cc-agents
  platforms: "claude-code,codex,opencode,pi,openclaw,gemini"
  category: plugin-dev
  interactions:
    - knowledge-only
see_also:
  - cc:cc-hooks/references/patterns
  - cc:cc-hooks/references/advanced
  - cc:cc-hooks/references/migration
  - cc:cc-hooks/references/cross-platform
  - cc:cc-hooks/references/platform-limits
---

# cc:cc-hooks — Multi-Agent Hook System

Event-driven automation for Claude Code, Codex, OpenCode, Pi, and Gemini CLI. Write hooks once in abstract format, deploy to multiple coding agents.

## Overview

Hooks execute in response to specific events during a coding agent session. Use this skill when implementing hooks for security validation, quality enforcement, context loading, or workflow automation across multiple coding agents.

**Key capabilities:**
- Write hooks once in abstract format, deploy to 5+ agents
- Validate tool calls before execution (PreToolUse)
- React to tool results (PostToolUse)
- Enforce completion standards (Stop, SubagentStop)
- Load project context (SessionStart)
- Automate workflows across the development lifecycle

## Multi-Platform Support

| Tier | Agents | Strategy |
|------|--------|----------|
| **Tier 1** | Claude Code, Codex, OpenCode | Abstract schema → per-platform JSON config |
| **Tier 2** | Pi, OpenClaw | Abstract schema → `.pi/settings.json` (via `@hsingjui/pi-hooks`) |
| **Tier 3** | Gemini CLI | Abstract schema → `.gemini/settings.json` |
| **Tier 4** | Antigravity | Documentation only (no lifecycle hooks) |

### Cross-Platform Workflow

1. Define hooks in `hooks.yaml` (abstract format)
2. Each agent reads its own config file

Scaffold and validate hook configs via the global `superskill` CLI:

```bash
# Scaffold a new hook config
superskill hook scaffold my-hooks --output ./hooks

# Validate a hook config
superskill hook validate hooks/my-hooks.yaml
```

**Key portability rule:** Use `type: "command"` hooks for cross-platform portability. `type: "prompt"` hooks are Claude Code-only.

See [cross-platform.md](references/cross-platform.md) for the full event crosswalk and tool name mapping.
See [platform-limits.md](references/platform-limits.md) for what's NOT portable and why.

## Quality Operations

Hook configs support quality scoring and longitudinal evolution via the **two-call seam pattern**: the CLI emits a JSON envelope; a persona scores or rewrites offline; the CLI ingests the result. The CLI never scores or generates inline — that work belongs to the persona.

### Evaluate (Scorer Seam)

Score a hook config against a rubric in two calls.

1. **Envelope-out** — emit the hook content + rubric as JSON (no scoring, no DB write):
   ```bash
   superskill hook evaluate <nameOrPath> --rubric <file> --json
   ```
   Returns `{ type, content_name, target, content, rubric, baseline }`.
2. **Scorer persona** — read the envelope, score each dimension against its rubric criterion, emit `{ rubric_version, dimensions: { name: { score, note } } }`.
3. **Ingest-in** — validate the agent-produced scores against the rubric schema and persist as an evaluation row:
   ```bash
   superskill hook evaluate <nameOrPath> --ingest <scores.json> --save
   ```

### Evolve (Generation Seam)

Propose improvements from evaluation history in two calls.

1. **Envelope-out** — emit trends, baseline, rubric, and generation briefs as JSON (no DB write, no model call):
   ```bash
   superskill hook evolve <name> --propose-only --json
   ```
   Each brief carries the immutable goal anchor (frontmatter + rubric criterion + negative constraints) **verbatim** plus an `anchor_hash`.
2. **Author persona** — read the briefs, rewrite the hook content per dimension, emit `ProposedChange[]` with real `proposed` text + `anchor_hash`.
3. **Skeptic persona** — receive the proposal + the **verbatim** goal anchor, check for violations or omissions, emit `{ ok, violations[] }`.
4. **Judge persona** *(if multiple candidates)* — pairwise tournament comparison, select the winner.
5. **Ingest-in** — the CLI double-loop gate decides: deterministic validate-zero-errors + Δ-margin + anchor-hash match + skeptic veto. Failing any gate leaves the proposal in `draft` and restores the file:
   ```bash
   superskill hook evolve <name> --ingest <proposal.json> --accept <id>
   ```

### Goal-Anchor Verbatim Discipline

Pass the original frontmatter and negative constraints **verbatim** to the Skeptic and Judge — do not summarize, compact, or paraphrase. The CLI gate enforces via `anchor_hash`: if the anchor is stripped or altered, the hash won't match and the gate rejects the proposal. A paraphrased anchor defeats the double-loop gate; this is non-negotiable.

## Hook Events

| Event | When | Use For |
|-------|------|---------|
| PreToolUse | Before tool | Validation, modification, blocking |
| PostToolUse | After tool | Feedback, logging |
| UserPromptSubmit | User input | Context injection, validation |
| Stop | Agent stopping | Completeness check |
| SubagentStop | Subagent done | Task validation |
| SessionStart | Session begins | Context loading |
| SessionEnd | Session ends | Cleanup, logging |
| PreCompact | Before compact | Preserve context |
| Notification | User notified | Logging, reactions |

## Hook Types

### Prompt-Based Hooks (Recommended)

Use for context-aware validation and complex logic:

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

**Benefits:**
- Natural language reasoning
- Better edge case handling
- No bash scripting required
- More flexible validation

### Command Hooks

Use for deterministic checks and external tools:

```json
{
  "PreToolUse": [
    {
      "matcher": "Bash",
      "hooks": [
        {
          "type": "command",
          "command": "bash ${CLAUDE_PLUGIN_ROOT}/examples/validate-bash.sh"
        }
      ]
    }
  ]
}
```

**Use for:**
- Fast deterministic validations
- File system operations
- External tool integrations
- Performance-critical checks

## Hook Configuration

### Plugin Hooks (hooks/hooks.json)

```json
{
  "description": "Validation hooks for code quality",
  "hooks": {
    "PreToolUse": [...],
    "Stop": [...],
    "SessionStart": [...]
  }
}
```

### User Settings (.claude/settings.json)

```json
{
  "PreToolUse": [...],
  "Stop": [...],
  "SessionStart": [...]
}
```

### Matchers

```json
"matcher": "Write"           // Exact match
"matcher": "Write|Edit"      // Multiple tools
"matcher": "*"               // Wildcard (all tools)
"matcher": "mcp__.*__delete.*"  // Regex patterns
```

## Common Patterns

### Security Validation

Block dangerous file writes:

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

### Test Enforcement

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

### Context Loading

Load project-specific context at session start:

```json
{
  "SessionStart": [
    {
      "matcher": "*",
      "hooks": [
        {
          "type": "command",
          "command": "bash ${CLAUDE_PLUGIN_ROOT}/examples/load-context.sh"
        }
      ]
    }
  ]
}
```

## Hook Output Format

### Standard Output

```json
{
  "continue": true,
  "suppressOutput": false,
  "systemMessage": "Message for Claude"
}
```

### PreToolUse Output

```json
{
  "hookSpecificOutput": {
    "permissionDecision": "allow|deny|ask",
    "updatedInput": {"field": "modified_value"}
  },
  "systemMessage": "Explanation for Claude"
}
```

### Stop/SubagentStop Output

```json
{
  "decision": "approve|block",
  "reason": "Explanation",
  "systemMessage": "Additional context"
}
```

### Exit Codes

- `0` - Success (continue)
- `2` - Blocking deny (stderr fed back to Claude)
- Other - Non-blocking error

## Environment Variables

- `$CLAUDE_PROJECT_DIR` - Project root path
- `$CLAUDE_PLUGIN_ROOT` - Plugin directory (use for portable paths)
- `$CLAUDE_ENV_FILE` - SessionStart only: persist env vars
- `$CLAUDE_CODE_REMOTE` - Set if running in remote context

**Always use ${CLAUDE_PLUGIN_ROOT} in hook commands for portability.**

## Hook Input Format

All hooks receive JSON via stdin:

```json
{
  "session_id": "abc123",
  "transcript_path": "/path/to/transcript.txt",
  "cwd": "/current/working/dir",
  "permission_mode": "ask|allow",
  "hook_event_name": "PreToolUse"
}
```

**Event-specific fields:**
- **PreToolUse/PostToolUse:** `tool_name`, `tool_input`, `tool_result`
- **UserPromptSubmit:** `user_prompt`
- **Stop/SubagentStop:** `reason`

Access fields using `$TOOL_INPUT`, `$TOOL_RESULT`, `$USER_PROMPT`, etc.

## Security Best Practices

### Input Validation

```bash
#!/bin/bash
set -euo pipefail

input=$(cat)
tool_name=$(echo "$input" | jq -r '.tool_name')

if [[ ! "$tool_name" =~ ^[a-zA-Z0-9_]+$ ]]; then
  echo '{"decision": "deny", "reason": "Invalid tool name"}' >&2
  exit 2
fi
```

### Path Safety

```bash
file_path=$(echo "$input" | jq -r '.tool_input.file_path')

if [[ "$file_path" == *".."* ]]; then
  echo '{"decision": "deny", "reason": "Path traversal detected"}' >&2
  exit 2
fi
```

### Quote All Variables

```bash
# GOOD: Quoted
echo "$file_path"
cd "$CLAUDE_PROJECT_DIR"

# BAD: Unquoted (injection risk)
echo $file_path
cd $CLAUDE_PROJECT_DIR
```

## Lifecycle

**Hooks load at session start.** Changes require restarting Claude Code (`exit` then `claude`).

**Cannot hot-swap hooks:**
- Editing `hooks/hooks.json` won't affect current session
- Adding new hook scripts won't be recognized
- Must restart Claude Code for changes to take effect

## Debugging

Enable debug mode:

```bash
claude --debug
```

Test command hooks directly:

```bash
echo '{"tool_name": "Write", "tool_input": {"file_path": "/test"}}' | \
  bash ${CLAUDE_PLUGIN_ROOT}/examples/validate-bash.sh

echo "Exit code: $?"
```

## Additional References

- **`references/patterns.md`** — 10+ proven hook patterns
- **`references/advanced.md`** — Advanced techniques and workflows
- **`references/migration.md`** — Migrating from basic to prompt-based hooks
