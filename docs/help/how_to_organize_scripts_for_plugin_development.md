# How to organize scripts for plugin development

Guidance for plugin authors on where executable logic lives in a superskill plugin and how it reaches non-Claude install targets. The short version: **script source lives in the plugin; script *execution* always goes through the `superskill` binary.** Install targets never receive script files.

## The two-class model

Every file under `plugins/<plugin>/scripts/` is exactly one of two classes:

| Class | Triggered by | Runtime surface on every target | Registry |
|---|---|---|---|
| **Hook script** | Host hook events (`Stop`, `PreToolUse`, …) declared in `hooks.json` | `superskill hook run <plugin> <hook-id>` | `HookRunner` map in `apps/cli/src/commands/hook-run.ts` |
| **Non-hook script** | An agent or host workflow invoking a CLI (referenced from skill docs) | `superskill script run <plugin> <script-id>` | `ScriptRunner` map in `apps/cli/src/commands/script-run.ts` |

There is no third class. If a script is not reachable through one of these two dispatchers, it does not exist as far as install targets are concerned.

## Why scripts are never copied to targets

`superskill install` stages skills, commands, subagents, magents, hooks, and MCP config into `.rulesync/` for per-target emission. Plugin-level `scripts/` is deliberately **not** staged:

- Skill folders are prose-only (ADR-015) — executable logic is plugin-level, shared, and deduped.
- Target agents have no Bun/TS runtime guarantee; a copied `.ts` file is not runnable in the general case.
- Agent working directories are unpredictable, so any relative invocation path (`bun scripts/foo.ts`) is fragile even when the file exists.

Instead, the CLI **deep-imports** plugin script modules at build time (ADR-022 blessed exception: `apps/cli` is a second compile-time consumer of plugin-owned code) and `bun build --compile` bundles them into the `superskill` binary. The behavior travels with the binary; the files stay home.

## Class 1 — hook scripts

**Contract.** `hooks.json` commands use the portable PATH form only:

```json
{ "type": "command", "command": "superskill hook run cc anti-hallucination", "timeout": 10 }
```

- Never `${CLAUDE_PLUGIN_ROOT}` — that variable exists only inside Claude Code and breaks on every other target (retired in v0.3.3).
- The install pipeline translates the same command into each host's native hook format: pi shim (`@vahor/pi-hooks`), hermes canonical copy, omp generated JS modules (`spawnSync('superskill', …)`), codex/opencode/antigravity via the rulesync hooks pass, grok native Claude-format consumption, cursor-native `hooks-cursor.json`.
- `minCliVersion` in `hooks.json` gates emission: an older CLI skips hook emission with a warning while skills/commands still install.
- Unknown `<plugin>/<hook-id>` **fails open** (exit 0 + stderr warning naming the id and CLI version) — version skew is a deployment issue, not a policy violation.

**Authoring.** Add the script under `plugins/<plugin>/scripts/<skill-or-feature>/`, export a pure runner, register a thin `HookRunner` adapter in `hook-run.ts`, add tests under the script's `tests/` dir.

## Class 2 — non-hook scripts

**Contract.** Skill docs invoke non-hook scripts through the script dispatcher (`cc/validate-response` is the first registered member of this class):

```bash
printf '%s' "$FINAL_ANSWER" | superskill script run cc validate-response
```

- Input contract is defined per script id (convention: env var first — e.g. `RESPONSE_TEXT` — else stdin).
- Exit codes are **validation-CLI semantics** (0 = pass, 1 = violation), not hook block semantics (exit 2). Never wire a non-hook script into `hooks.json`.
- Unknown `<plugin>/<script-id>` fails open exactly like `hook run` (exit 0 + stderr warning) — an agent on an older CLI degrades to manual verification instead of hard-failing its workflow.
- No `minCliVersion` gate: nothing is emitted to targets; the agent invokes the CLI directly at runtime.

**Authoring.** Same physical layout as hook scripts (`plugins/<plugin>/scripts/<skill-or-feature>/`). Export the pure logic, register a thin adapter in `script-run.ts` mapping id → runner. Update the referencing skill docs in the same change — a script whose docs still show a `bun <path>` invocation is a bug (see anti-patterns).

## Decision tree for script authors

```text
Is it triggered by a host hook event (Stop/PreToolUse/…)?
  YES → hook script → HookRunner in hook-run.ts + hooks.json entry
  NO  → Is it invoked by an agent/host workflow (referenced from skill docs)?
    YES → non-hook script → ScriptRunner in script-run.ts + skill doc uses `superskill script run`
    NO  → Is it repo build/release tooling (version bumps, publish checks)?
      YES → repo-root scripts/ (NOT plugin scripts — never installed, never in plugin payload)
      NO  → Does it need to exist? Prose guidance in the skill may be enough.
```

## Anti-patterns

| Anti-pattern | Why it's wrong | Do instead |
|---|---|---|
| `bun plugins/cc/scripts/foo.ts` in a skill doc | Repo-relative source path — broken on Claude installs (cwd ≠ plugin root) and missing entirely on non-Claude targets | `superskill script run <plugin> <id>` |
| `${CLAUDE_PLUGIN_ROOT}/scripts/foo.ts` in hooks.json | Variable only exists in Claude Code | `superskill hook run <plugin> <id>` |
| Per-skill `skills/<name>/scripts/` executables | Duplication across skills (ADR-015 killed this); skill folders are prose-only | Plugin-level `scripts/<feature>/` shared by all skills |
| Copying scripts into `.rulesync/` or target dirs | No Bun/TS runtime guarantee on targets; unpredictable cwd; payload duplication | Compile-time absorption into the CLI binary |
| Wiring a validation CLI into `hooks.json` | Hosts treat exit 1 as a non-blocking error, not a block signal | Keep exit-0/1 CLIs under `script run`; hook adapters use exit 2 |
| Runtime script discovery from plugin manifests | Needs FS access to plugin dirs on targets — reintroduces every path problem | Compile-time static registry (intentional ADR-022 coupling) |

## Testing and coverage

- Plugin-level `plugins/<plugin>/scripts/**/tests/` **are** counted in the repo coverage gate (`bunfig.toml` ignores only `plugins/cc/skills/**/scripts` and `plugins/cc/skills/**/tests` — the skill-level paths).
- Registry adapters get unit tests for both dispatch paths (known id → runner; unknown id → fail-open) plus per-script contract tests (each input channel, each exit code, input-channel precedence).
- A script fix ships with a CLI release — that version coupling is the deliberate ADR-022 tradeoff for target portability.

## Status

| Surface | State |
|---|---|
| `superskill hook run` + `HookRunner` registry | Shipped (v0.2.19+); `cc/anti-hallucination` registered |
| `superskill script run` + `ScriptRunner` registry | Shipped (task 0087); `cc/validate-response` registered. Dispatcher at `apps/cli/src/commands/script-run.ts`; exit 0/1 validation semantics; unknown ids fail open with a stderr warning |
