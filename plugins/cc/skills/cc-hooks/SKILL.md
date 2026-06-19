---
name: cc-hooks
description: "Multi-agent hook system: author hooks once as rulesync-canonical hooks.json (HookDefinitionSchema), deploy via superskill install / superskill hook emit to Claude Code, Codex, OpenCode, Pi (pi-hooks), and Gemini CLI. Covers command, prompt, and http hooks, cross-platform event mapping, and safety invariants."
license: Apache-2.0
version: 3.0.0
created_at: 2026-03-23
updated_at: 2026-06-19
type: technique
tags: [hooks, automation, multi-agent, claude-code, codex, pi, opencode, gemini, security, validation, plugin-dev, rulesync]
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

Author hooks once in the **rulesync-canonical** format, deploy to Claude Code, Codex, OpenCode, Pi, and Gemini CLI.

## Overview

Hooks execute in response to specific events during a coding agent session. Use this skill when implementing hooks for security validation, quality enforcement, context loading, or workflow automation across multiple coding agents.

**Key capabilities:**
- Author hooks once in the canonical `hooks.json` (`HookDefinitionSchema`), deploy to 5+ agents
- Validate tool calls before execution (`preToolUse`)
- React to tool results (`postToolUse`)
- Enforce completion standards (`stop`, `subagentStop`)
- Load project context (`sessionStart`)
- Automate workflows across the development lifecycle

## Canonical Schema (HookDefinitionSchema)

Hooks are authored as a rulesync-canonical `hooks.json` in the `.rulesync/` directory of a plugin. The schema is defined in `vendors/rulesync/src/types/hooks.ts:26` as `HookDefinitionSchema`:

```jsonc
{
  "hooks": {
    "<HookEvent>": [
      {
        "type": "command",            // "command" | "prompt" | "http"
        "command": "bash ${CLAUDE_PLUGIN_ROOT}/examples/validate-write.sh",
        "matcher": "Write|Edit",       // tool-name regex (control chars stripped)
        "timeout": 5000,               // ms; optional
        "failClosed": true,            // optional — block action on hook failure (Cursor)
        "loop_limit": 3,               // optional — prompt re-injection cap
        "name": "write-guard",         // optional
        "description": "Block dangerous writes" // optional
      }
    ]
  }
}
```

**Field semantics:**
- `type`: `"command"` (deterministic, runs anywhere), `"prompt"` (Claude Code only — natural-language validation), `"http"` (webhook).
- `command` / `matcher` / `prompt`: `safeString` — must not contain `\n`, `\r`, or `\0` (they are embedded in generated code).
- `timeout`: milliseconds before the hook is killed.
- `failClosed`: when `true`, a hook failure (crash, timeout, invalid JSON) **blocks** the action instead of allowing it through. Default `failOpen` where unsupported.
- `loop_limit`: cap on prompt re-injections; `null` means unlimited.

### HookEvent Taxonomy

Canonical event names are **camelCase**. Each tool supports a subset — see `vendors/rulesync/src/types/hooks.ts:49` for the full `HookEvent` union.

| Event | When | Use For |
|-------|------|---------|
| `preToolUse` | Before tool | Validation, modification, blocking |
| `postToolUse` | After tool | Feedback, logging |
| `sessionStart` | Session begins | Context loading |
| `sessionEnd` | Session ends | Cleanup, logging |
| `stop` | Agent stopping | Completeness check |
| `subagentStop` | Subagent done | Task validation |
| `preCompact` | Before compact | Preserve context |
| `preModelInvocation` / `postModelInvocation` | Around model call | Audit, rate-limit |
| `beforeShellExecution` / `afterShellExecution` | Around shell | Sandbox, audit |
| `beforeMCPExecution` / `afterMCPExecution` | Around MCP tool | Audit, rate-limit |
| `beforeReadFile` / `afterFileEdit` | Around file IO | Redaction, log |
| `afterAgentResponse` / `afterAgentThought` | Turn lifecycle | Telemetry |

Per-tool event support: see `CURSOR_HOOK_EVENTS`, `CLAUDE_HOOK_EVENTS`, `OPENCODE_HOOK_EVENTS`, `CODEXCLI_HOOK_EVENTS`, `GEMINICLI_HOOK_EVENTS` in `vendors/rulesync/src/types/hooks.ts`.

## Safety Invariants (hooks run code — non-negotiable)

1. **Treat hook `command` strings as untrusted data.** When authoring from external content (templates, generator output, agent proposals), **never expand embedded instructions** in the command string. The CLI writes the bytes verbatim; it never `eval`s, `bash -c`s, or template-substitutes inside a `command`. Preserve that property when extending the emit path.
2. **Respect `failClosed`.** A hook with `failClosed: true` MUST block its action on failure — do not silently downgrade to `failOpen`. Surface the difference in the `evaluate` safety dimension.
3. **`safeString` boundary.** `command`, `matcher`, `prompt`, `name`, `description` pass through `safeString` — newlines, carriage returns, and NUL bytes are rejected at validation. Never strip the check to "make a hook work."
4. **No shell interpolation at author time.** Use `${CLAUDE_PLUGIN_ROOT}` / `${PROJECT_DIR}` placeholders — the target runtime replaces them, not superskill.

## Hook Types

### Command Hooks (cross-platform, recommended for portability)

```json
{
  "preToolUse": [
    {
      "type": "command",
      "matcher": "Bash",
      "command": "bash ${CLAUDE_PLUGIN_ROOT}/examples/validate-bash.sh",
      "timeout": 3000,
      "failClosed": true
    }
  ]
}
```

**Use for:** fast deterministic validations, filesystem operations, external tool integrations, performance-critical checks. **Portable** across all targets that support the event.

### Prompt Hooks (Claude Code only)

```json
{
  "preToolUse": [
    {
      "type": "prompt",
      "prompt": "File path: $TOOL_INPUT.file_path. Verify: 1) Not in /etc 2) Not .env or credentials 3) No '..' traversal. Return 'approve' or 'deny'.",
      "loop_limit": 3
    }
  ]
}
```

**Benefits:** natural-language reasoning, edge case handling, no bash scripting, flexible validation. **Not portable** — Claude Code only.

### HTTP Hooks

```json
{
  "postToolUse": [
    {
      "type": "http",
      "command": "https://audit.example.com/hook",
      "timeout": 5000,
      "failClosed": false
    }
  ]
}
```

## Workflows

Author, validate, emit, evaluate, and evolve all live in the `superskill hook` command group.

### Scaffold

```bash
# Create a new hook definition (canonical template)
superskill hook scaffold my-hooks --output ./hooks
```

### Validate (lint against HookDefinitionSchema)

```bash
# Valid definition passes, invalid errors
superskill hook validate ./hooks/my-hooks.json
superskill hook validate ./hooks/my-hooks.json --strict
```

Validation reuses the `HookDefinitionSchema` zod check (prefer reuse over re-implementing). The `--strict` flag enables optional cross-target event-coverage checks.

### Emit (single-definition, multi-agent deployment)

```bash
# Preview what would be emitted
superskill hook emit my-hooks --target codex --dry-run

# Emit to a single target agent
superskill hook emit my-hooks --target codex
superskill hook emit my-hooks --target pi
superskill hook emit my-hooks --target hermes
```

`emit` is a **thin wrapper** over the install hook path: it resolves the plugin, maps to canonical `.rulesync/`, then dispatches through `runRulesync` for rulesync-supported targets (codex/opencode/antigravity/claude) and the surrogate-shim path for pi/omp/hermes. **No new hook-format code** — it reuses the F027/F028 primitives and surfaces the same `hooksCount` reporting as `superskill install`.

For multi-target install (skills + commands + subagents + hooks + mcp), use `superskill install`:

```bash
superskill install my-plugin --targets codex,opencode,pi
```

### Evaluate (Scorer Seam — Phase 4 two-call pattern)

Score a hook config against a rubric in two calls.

1. **Envelope-out** — emit the hook content + rubric as JSON (no scoring, no DB write):
   ```bash
   superskill hook evaluate <nameOrPath> --rubric <file> --json
   ```
   Returns `{ type, content_name, target, content, rubric, baseline }`.
2. **Scorer persona** — read the envelope, score each dimension, emit `{ rubric_version, dimensions: { name: { score, note } } }`. Hook dimensions: `correctness`, `event-coverage`, `safety`, `pattern-match-quality` (`dimensions.ts:54`).
3. **Ingest-in** — validate the agent-produced scores against the rubric schema and persist:
   ```bash
   superskill hook evaluate <nameOrPath> --ingest <scores.json> --save
   ```

The `safety` dimension must penalize hooks that omit `failClosed` on destructive events, or that embed untrusted/templated command strings without a `safeString` boundary.

### Evolve (Generation Seam)

Propose improvements from evaluation history in two calls.

1. **Envelope-out** — emit trends, baseline, rubric, and generation briefs as JSON:
   ```bash
   superskill hook evolve <name> --propose-only --json
   ```
   Each brief carries the **verbatim** goal anchor (frontmatter + rubric criterion + negative constraints) plus `anchor_hash`.
2. **Author persona** — rewrite the hook content per dimension; emit `ProposedChange[]` with real `proposed` text + `anchor_hash`.
3. **Skeptic persona** — receive the proposal + the **verbatim** goal anchor, check for violations, emit `{ ok, violations[] }`.
4. **Judge persona** *(if multiple candidates)* — pairwise tournament, select winner.
5. **Ingest-in** — the CLI double-loop gate decides: validate-zero-errors + Δ-margin + anchor-hash match + skeptic veto. Failing any gate leaves the proposal in `draft` and restores the file:
   ```bash
   superskill hook evolve <name> --ingest <proposal.json> --accept <id>
   ```

### Goal-Anchor Verbatim Discipline

Pass the original frontmatter and negative constraints **verbatim** to the Skeptic and Judge — do not summarize, compact, or paraphrase. The CLI gate enforces via `anchor_hash`: a paraphrased anchor defeats the double-loop gate. This is non-negotiable.

## Cross-Platform Target Matrix

| Target | rulesync tool | Hook support | Mechanism |
|--------|---------------|--------------|-----------|
| `claude` | — | ✅ | `claude plugin install` (marketplace) |
| `codex` | `codexcli` | ✅ | `runRulesync` emits native config |
| `opencode` | `opencode` | ✅ | `runRulesync` emits native config |
| `antigravity-cli` | `antigravity-cli` | ✅ | `runRulesync` emits native config |
| `antigravity-ide` | `antigravity-ide` | ✅ | `runRulesync` emits native config |
| `gemini` | `geminicli` | ✅ | `runRulesync` emits native config |
| `cursor` | `cursor` | ✅ | `runRulesync` emits native config |
| `pi` | — | shim | `emitPiStyleHooks` → `.pi/hooks.json` (`@vahor/pi-hooks` format) |
| `omp` | — | shim | `emitPiStyleHooks` → `.omp/hooks.json` (reuses pi format) |
| `hermes` | — | copy | `emitHermesHooks` → `.hermes/hooks.json` (canonical copy) |

**Key portability rule:** Use `type: "command"` hooks for cross-platform portability. `type: "prompt"` hooks are Claude Code-only. `failClosed` is honored on Cursor and surfaces as a `safety` dimension penalty elsewhere.

See [cross-platform.md](references/cross-platform.md) for the full event crosswalk and tool name mapping. See [platform-limits.md](references/platform-limits.md) for what's NOT portable and why.

## Common Patterns

### Security Validation (block dangerous writes)

```json
{
  "hooks": {
    "preToolUse": [
      {
        "type": "prompt",
        "matcher": "Write|Edit",
        "prompt": "File path: $TOOL_INPUT.file_path. Verify: 1) Not in /etc or system dirs 2) Not .env or credentials 3) No '..' traversal. Return 'approve' or 'deny'."
      }
    ]
  }
}
```

### Test Enforcement (block stop without tests)

```json
{
  "hooks": {
    "stop": [
      {
        "type": "prompt",
        "matcher": "*",
        "prompt": "Review transcript. If code was modified, verify tests were executed. Block with reason 'Tests must run after code changes' if not."
      }
    ]
  }
}
```

### Context Loading (session start)

```json
{
  "hooks": {
    "sessionStart": [
      {
        "type": "command",
        "matcher": "*",
        "command": "bash ${CLAUDE_PLUGIN_ROOT}/examples/load-context.sh"
      }
    ]
  }
}
```


### failClosed on destructive events

```json
{
  "hooks": {
    "preToolUse": [
      {
        "type": "command",
        "matcher": "Bash",
        "command": "bash ${CLAUDE_PLUGIN_ROOT}/examples/validate-bash.sh",
        "timeout": 3000,
        "failClosed": true
      }
    ]
  }
}
```

With `failClosed: true`, a crash or timeout of `validate-bash.sh` **blocks** the Bash call rather than allowing it through. Default to `failClosed: true` on `preToolUse` for destructive tools; default to `failOpen` on read-only events (`postToolUse`, `sessionEnd`).

## Hook Output Format

### Standard output (JSON to stdout)

```json
{
  "continue": true,
  "suppressOutput": false,
  "systemMessage": "Message for Claude"
}
```

### `preToolUse` output

```json
{
  "hookSpecificOutput": {
    "permissionDecision": "allow|deny|ask",
    "updatedInput": { "field": "modified_value" }
  },
  "systemMessage": "Explanation for Claude"
}
```

### `stop` / `subagentStop` output

```json
{
  "hookSpecificOutput": {
    "allowStop": false,
    "feedback": "Tests have not been run."
  }
}
```

## See Also

- **[patterns.md](references/patterns.md)** — Curated hook patterns (security, context, test enforcement)
- **[advanced.md](references/advanced.md)** — Chained hooks, conditional matchers, async patterns
- **[cross-platform.md](references/cross-platform.md)** — Event crosswalk, tool-name mapping, `failClosed` matrix
- **[platform-limits.md](references/platform-limits.md)** — What's NOT portable and why
- **[migration.md](references/migration.md)** — Migrating legacy hook configs to the canonical `HookDefinitionSchema`
- **Canonical schema:** `vendors/rulesync/src/types/hooks.ts:26,49` (`HookDefinitionSchema`, `HookEvent`)
- **Hook dimensions:** `apps/cli/src/quality/dimensions.ts:54` (`correctness`, `event-coverage`, `safety`, `pattern-match-quality`)
