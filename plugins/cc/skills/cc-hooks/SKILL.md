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

Hooks execute in response to specific events during a coding agent session. Use this skill when
implementing hooks for security validation, quality enforcement, context loading, or workflow
automation across multiple coding agents: author once in the canonical `hooks.json`
(`HookDefinitionSchema`), deploy to 5+ agents.

## Canonical Schema (HookDefinitionSchema)

Hooks are authored as a rulesync-canonical `hooks.json` in the `.rulesync/` directory of a plugin. The schema is defined in `vendors/rulesync/src/types/hooks.ts:26` as `HookDefinitionSchema`:

```jsonc
{
  "hooks": {
    "<HookEvent>": [
      {
        "type": "command",            // "command" | "prompt" | "http"
        "command": "superskill hook run <plugin> <hook-id>", // portable PATH command (see below)
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
4. **Portable command resolution — no `${CLAUDE_PLUGIN_ROOT}` for cross-platform hooks.** A hook `command` must resolve on every target it deploys to. Use a **PATH command** (`superskill hook run <plugin> <hook-id>` — see [§Portable runtime hooks](#portable-runtime-hooks-via-superskill-hook-run)) or a **dot-relative** `.rulesync/hooks/<script>` path that rulesync copies and prefixes per target. Do **not** use `${CLAUDE_PLUGIN_ROOT}/<script>`: it is a Claude Code-only variable that the installer does **not** rewrite for codex/opencode/antigravity/pi/omp/hermes, and the referenced script file is not copied to those targets — the generated hook silently fails there. No shell interpolation at author time; the CLI writes command bytes verbatim and never `eval`s them.

## Hook Types

### Command Hooks (cross-platform, recommended for portability)

```json
{
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
```

**Use for:** fast deterministic validations, filesystem operations, external tool integrations, performance-critical checks. **Portable** across all targets that support the event — provided the `command` is a PATH command or a copied dot-relative script (see [§Portable runtime hooks](#portable-runtime-hooks-via-superskill-hook-run) and Safety Invariant #4). A `${CLAUDE_PLUGIN_ROOT}/<script>` command is portable on Claude Code **only**.

## Portable runtime hooks via `superskill hook run`

For any command hook with non-trivial logic — a guard that parses the tool payload, shells to another
CLI, or makes a decision — register a **runtime runner** in the hook registry (superskill-side), then
invoke it as a stable PATH command:

```json
{
  "preToolUse": [
    { "type": "command", "command": "superskill hook run sp task-write-guard", "matcher": "Write|Edit", "timeout": 10 }
  ]
}
```

Why this is the portable standard:

- **One command, every target.** `superskill hook run <plugin> <hook-id>` is on `PATH` wherever the
  CLI is installed. The generated hook config is byte-identical across codex, opencode,
  antigravity, pi, omp, hermes, and Claude — no per-target script copy, no `${CLAUDE_PLUGIN_ROOT}`.
- **The runner owns the logic.** The dispatcher reads stdin + env, resolves the runner from the
  registry (`apps/cli/src/commands/hook-run.ts`), and emits Claude canonical hook JSON (PreToolUse
  permission decision / Stop `allowStop`). Agents that can't parse that shape fail open.
- **Plugin scripts stay as the runner's implementation**, not the hook entry point. Example: the cc
  anti-hallucination `Stop` hook calls `superskill hook run cc anti-hallucination`; the runner imports
  the verification functions from `plugins/cc/scripts/anti-hallucination/ah_guard.ts`.
- **Unknown hook ids are a config error**, not a runtime payload — the dispatcher exits non-zero with
  the list of known hooks (it does not fail open on a typo'd id).

Reserve raw `.rulesync/hooks/<script>` commands for trivial, self-contained shell scripts that rulesync
copies verbatim; reach for `superskill hook run` whenever the hook needs real logic or a dependency.

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

### Author (no scaffold — hooks are hand-authored)

Hooks are authored by hand as entries in `hooks.json` (event → matcher → command → timeout).
There is no `scaffold` operation (task 0066 decision B) — the markdown scaffold emitted the
wrong artifact type for JSON config. Create or merge entries directly in your `hooks.json`,
then validate.

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

### Evaluate and Evolve (two-call seam)

Both run through the two-call seam — envelope-out, persona judgment, ingest-in. The seam
mechanics, personas, and vocabulary are owned by **cc:cc-skills** (evaluation-framework reference +
glossary); only the hook-specific facts live here:

```bash
superskill hook evaluate <nameOrPath> --rubric <file> --json     # envelope-out
superskill hook evaluate <nameOrPath> --ingest <scores.json> --save
superskill hook evolve <name> --propose-only --json              # envelope-out
superskill hook evolve <name> --ingest <proposal.json> --accept <id>
```

- Hook dimensions: `correctness`, `event-coverage`, `safety`, `pattern-match-quality`
  (`packages/core/src/quality/hook.ts:226`).
- The `safety` dimension must penalize hooks that omit `failClosed` on destructive events, or that
  embed untrusted/templated command strings without a `safeString` boundary.
- Goal anchors pass to the Skeptic/Judge **verbatim** — a paraphrased anchor defeats the
  `anchor_hash` gate.

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

Curated, ready-to-paste patterns live in **[patterns.md](references/patterns.md)** — security
validation (Pattern 1), test enforcement (Pattern 2), context loading (Pattern 3, with the
`${CLAUDE_PLUGIN_ROOT}` portability warning), notification logging, MCP monitoring, build
verification, permission confirmation, quality checks, flag-file activation, config-driven hooks,
and `failClosed` on destructive events (Pattern 11).

## Hook Output Format

The JSON shapes a hook writes to stdout (standard, `preToolUse` permission decision,
`stop`/`subagentStop` `allowStop`) are documented in
**[advanced.md § Hook Output Format](references/advanced.md#hook-output-format)**.

## See Also

- **[patterns.md](references/patterns.md)** — Curated hook patterns (security, context, test enforcement)
- **[advanced.md](references/advanced.md)** — Chained hooks, conditional matchers, async patterns
- **[cross-platform.md](references/cross-platform.md)** — Event crosswalk, tool-name mapping, `failClosed` matrix
- **[platform-limits.md](references/platform-limits.md)** — What's NOT portable and why
- **[migration.md](references/migration.md)** — Migrating legacy hook configs to the canonical `HookDefinitionSchema`
- **Canonical schema:** `vendors/rulesync/src/types/hooks.ts:26,49` (`HookDefinitionSchema`, `HookEvent`)
- **Hook dimensions:** `packages/core/src/quality/hook.ts:226` (`correctness`, `event-coverage`, `safety`, `pattern-match-quality`)
