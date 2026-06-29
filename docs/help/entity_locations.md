# Entity locations

Each coding agent stores skills, slash commands, subagents, and hooks in different directories. This page is the single source of truth for where `superskill install` writes each entity type per target — verified against each agent's source code (`vendors/`).

## Entity locations — global (user-level, `~`)

| Agent | Skills | Slash Commands | Subagents | Hooks |
|-------|--------|---------------|-----------|-------|
| **Claude Code** | `~/.claude/plugins/<name>/skills/` | `~/.claude/plugins/<name>/commands/` | `~/.claude/plugins/<name>/agents/` | `~/.claude/plugins/<name>/hooks/hooks.json` |
| **Codex** | `~/.agents/skills/` | `~/.codex/prompts/` | `~/.codex/agents/` | — |
| **Pi** | `~/.pi/agent/skills/` ¹ | `~/.pi/agent/prompts/` | `~/.pi/agent/agents/` ² | extensions ³ |
| **omp** | `~/.omp/agent/skills/` | `~/.omp/agent/commands/` | `~/.omp/agent/agents/` ² | extensions ³ |
| **OpenCode** | `~/.opencode/skills/` | `~/.config/opencode/commands/` | `~/.config/opencode/agents/` | — |
| **Antigravity IDE** | `~/.gemini/config/skills/` | `~/.gemini/antigravity/global_workflows/` | — | `~/.gemini/config/hooks.json` |
| **Antigravity CLI** | `~/.gemini/antigravity-cli/skills/` | — | — | `.agents/hooks.json` (project) |
| **Hermes** | `~/.hermes/skills/` | config.yaml ⁴ | — ⁵ | `~/.hermes/hooks/<name>/HOOK.yaml` |
| **OpenClaw** | `~/.openclaw/plugin-skills/` | — ⁶ | — ⁷ | webhooks ⁸ |

## Entity locations — project-level (relative to workspace root)

| Agent | Skills | Slash Commands | Subagents | Hooks |
|-------|--------|---------------|-----------|-------|
| **Claude Code** | `.claude/skills/` | `.claude/commands/` | `.claude/agents/` | `.claude/hooks/hooks.json` |
| **Codex** | `.agents/skills/` | `.codex/prompts/` | `.codex/agents/` | — |
| **Pi** | `.pi/skills/` | `.pi/prompts/` | `.pi/agents/` ² | `.pi/extensions/` |
| **omp** | `.omp/skills/` | `.omp/commands/` | `.omp/agents/` ² | `.omp/hooks/` / `.omp/extensions/` |
| **OpenCode** | `.opencode/skills/` | `.opencode/commands/` | `.opencode/agents/` | — |
| **Antigravity IDE** | `.agents/skills/` | `.agents/workflows/` | — | `.agents/hooks.json` |
| **Antigravity CLI** | `.agents/skills/` | — | — | `.agents/hooks.json` |
| **Hermes** | `.hermes/skills/` | config.yaml ⁴ | — ⁵ | `.hermes/hooks/<name>/` |
| **OpenClaw** | `skills/` | — ⁶ | — ⁷ | webhooks ⁸ |

## Notes

¹ Pi also reads `~/.agents/skills/` (Codex interop). omp reads from multiple agent directories (Claude Code, Codex, Gemini, OpenCode, etc.).

² Subagents require an extension to be loaded (not built-in). Pi: `subagent` example extension. omp: `omp agents unpack` command.

³ Pi and omp replaced legacy hooks with an **Extensions** system (TypeScript event handlers at `~/.pi/agent/extensions/` / `~/.omp/agent/extensions/`). Legacy hook dirs: `.omp/hooks/pre|post/*.ts`.

⁴ Hermes slash commands: built-in `CommandDef` entries OR user-defined `quick_commands:` in `~/.hermes/config.yaml`. Skills auto-register as `/<skill-name>` — best path.

⁵ Hermes spawns subagents dynamically via `delegate_task` tool; no persistent subagent directory.

⁶ OpenClaw auto-discovers slash commands from skill directories as `/<skill-name>`. No separate commands directory.

⁷ OpenClaw agents are configured in YAML (`agents.list`), not as files in a directory.

⁸ OpenClaw hooks are inbound HTTP webhooks (`hooks.path`, `hooks.transformsDir`) — not coding-agent event hooks. No hook file installation needed.

## How superskill installs

| Agent | Engine | Notes |
|-------|--------|-------|
| **Claude Code** | `claude plugin marketplace add` + `claude plugin install` | Native plugin system — handles all entity types automatically |
| **Codex** | rulesync | `codex` → `codexcli` |
| **Pi** | rulesync + superskill shim | Subagents adapted as Skills 2.0 skill directories; Pi native agents written directly to `~/.pi/agent/agents/` |
| **omp** | rulesync + superskill shim | `omp` → `pi` surrogate for rulesync, then copy to `~/.omp/`; omp also reads from other agent dirs |
| **OpenCode** | rulesync | `opencode` → `opencode` |
| **Antigravity IDE** | rulesync (two-pass) | Skills via `TARGET_TO_RULESYNC` → `codexcli` (shared `~/.agents/skills/`); hooks via `TARGET_TO_RULESYNC_HOOKS` → `antigravity-ide` (native `~/.gemini/config/hooks.json`) |
| **Antigravity CLI** | rulesync (two-pass) | Skills → `codexcli` (shared `~/.agents/skills/`); hooks → `antigravity-cli` (native `.agents/hooks.json` project). commands/subagents not supported by rulesync for this target |
| **Hermes** | rulesync + superskill shim | `hermes` → `opencode` surrogate for rulesync, then copy to `~/.hermes/`; hooks format is HOOK.yaml not hooks.json |
| **OpenClaw** | implicit (via `~/.agents/skills/`) | Reads skills from `~/.agents/skills/` (shared root with codex/opencode in global mode). No dedicated dispatch needed. |

Since ts-ai-runner 0.3.21, `omp`, `hermes`, and `antigravity-cli` are canonical `AgentName` values — slash-command dialect translation maps 1:1. Only `antigravity-ide` still bridges through `opencode`.

## Known gaps

| Gap | Status |
|-----|--------|
| **antigravity-cli** commands/subagents | Rulesync doesn't support `antigravity-cli` for commands/subagents (only `antigravity` project-level). |
| **Hermes hooks format** | Superskill writes `hooks.json`; Hermes expects `~/.hermes/hooks/<name>/HOOK.yaml` + `handler.py`. |
| **Hermes commands** | No `commands/` directory. Install commands as skills for slash-command auto-discovery. |
| **Pi/omp hooks → extensions** | Legacy pi-hooks shim should migrate to the Extensions format. |
| **OpenClaw agents/hooks** | OpenClaw reads skills from `~/.agents/skills/` (implicitly covered). Dedicated agent YAML config and webhook-based hooks are not managed by superskill. |
