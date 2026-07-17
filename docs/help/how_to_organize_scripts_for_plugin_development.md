# How to organize scripts for plugin development

Guidance for plugin authors on where executable logic lives in a superskill plugin and how it reaches install targets. The short version: **script source lives under `plugins/<plugin>/scripts/<feature>/`; install delivers it to every target; skills invoke it through a superskill-resolved path (standard) or, optionally, through the `superskill` binary registry when no filesystem path is wanted.**

## The two contracts

Every script ships under exactly one **contract**, chosen per script:

| Contract | How it ships to targets | How skills invoke it | When to choose |
|---|---|---|---|
| **Standard — staged path** | `superskill install` copies `scripts/<feature>/` into each target's scripts root (or lands the whole tree via the host plugin install for native targets). | `$(superskill script path <plugin> <rel>)` then the portable runner (`node`, `bun`, `sh` — see Entrypoint Contract). | Default. Script must be runnable from a real path on the target host. |
| **Optional — binary registry** | CLI deep-imports the module at build time and `bun build --compile` bundles it into `superskill`; nothing is staged to disk. | `superskill script run <plugin> <id>` (non-hook) or `superskill hook run <plugin> <id>` (hook). | Pure engines with no FS needs; you accept that a fix requires a CLI release. |

Within each contract, a script is still either a **hook script** (triggered by host hook events declared in `hooks.json`) or a **non-hook script** (triggered by an agent or host workflow, referenced from skill docs). Hook vs non-hook decides trigger source and exit-code semantics; staged path vs registry decides shipping + invocation.

## Physical layout (unchanged — ADR-015)

- Plugin-level only: `plugins/<plugin>/scripts/<feature>/` — shared across the plugin's skills, deduped. Source for both contracts lives here.
- Skill folders are prose-only: `skills/<name>/` holds `SKILL.md`, references, agent metadata — **no executable `scripts/`**. Per-skill executables are forbidden (ADR-015 anti-pattern).
- Repo-root `scripts/` (when present) is build/release tooling only — never part of a plugin payload, never installed.

## How install delivers scripts

`superskill install` runs the mapper (`packages/core/src/mapper.ts:240-245`), which copies `plugins/<plugin>/scripts/` into `.rulesync/scripts/<plugin>/` preserving tree shape. The install command then dispatches per target class:

- **Native targets** (`claude`, `omp`, `grok`) — each installs via its own plugin CLI (`claude plugin install`, `omp plugin install`, `grok plugin install`) and receives the full plugin tree **including `scripts/`**. No shared-root staging is performed for native-only installs (`apps/cli/src/commands/install.ts:450`).
- **Rulesync + hermes targets** (`codex`, `pi`, `opencode`, `antigravity-cli`, `antigravity-ide`, `hermes`) — `stagePluginScripts` writes the staged tree to `~/.agents/scripts/<plugin>/` (global) or `<project>/.agents/scripts/<plugin>/` (project mode) once per install, regardless of how many targets are present (`apps/cli/src/commands/install.ts:921-946`). Re-install replaces only the `<plugin>/` subdir — sibling plugins are never touched.

Only **portable runtimes** are useful on targets: Node `.js`/`.mjs` and POSIX `.sh` (see Entrypoint Contract). A TypeScript-only entrypoint under `scripts/` is fine in-repo but MUST have a runnable twin (or be compiled) to be useful after staging — staged files are run as-is.

## Standard contract — staged path + `script path`

### Resolve the staged entrypoint

`superskill script path <plugin> <rel>` resolves a staged entrypoint by search order (`apps/cli/src/commands/script-path.ts:65-107`):

1. **Project agents root:** `<project>/.agents/scripts/<plugin>/<rel>`
2. **Global agents root:** `~/.agents/scripts/<plugin>/<rel>`

First existing **regular file** wins; directories never satisfy resolution. Flags `--project` and `--global` narrow the search to one root.

Exit codes:

| Outcome | Exit | Notes |
|---|---|---|
| Found | `0` | Prints the absolute path (or JSON with `--json`). |
| Not found | `2` | **Fail-closed.** A missing staged script is a deployment/setup error, not a graceful-degradation case (`script-path.ts:148-158`). |
| Invalid args | `1` | Unknown flag, missing plugin/rel, or `rel` with `..` / absolute / Windows-drive segments (`isUnsafeRel`, `script-path.ts:57-63`). |

### Invoke from a skill doc

```bash
# Validation/utility CLI: capture the path, run with a portable runtime
node "$(superskill script path cc anti-hallucination/validate_response.js)"
# stdin or RESPONSE_TEXT → JSON result on stdout; exit 0 pass / 1 violation

# Shell twin example
"$(superskill script path myplugin myfeat/run.sh)"
```

- Use command substitution `$(superskill script path …)` — never hardcode cache/repo/install paths; a skill doc that hardcodes any path is a bug.
- Resolve at runtime, not at author time. The path depends on the user's install mode (project vs global) and target class.
- Path traversal is rejected server-side (`isUnsafeRel`), so `<rel>` MUST be a plain relative path under the plugin's scripts tree (e.g. `anti-hallucination/validate_response.js`, not `../sibling` or `/etc/passwd`).

### Entrypoint Contract (portable runtimes)

Staged entrypoints MUST be runnable on a target host without Bun:

| Runtime | Extension | Notes |
|---|---|---|
| Node | `.js`, `.mjs` | Plain JS; no TypeScript source. CommonJS or ESM as the host Node supports. |
| POSIX shell | `.sh` | Portable `sh`; no Bash-isms. |

Exit-code classes by role:

| Role | Pass | Violation | Block (hook only) |
|---|---|---|---|
| Validation CLI | `0` | `1` | — |
| Hook script | `0` | — | `2` |

- **Forbidden invocation forms** in skill docs and `hooks.json`:
  - `bun plugins/<plugin>/scripts/foo.ts` — repo-relative source path; cwd ≠ plugin root on any install.
  - `${CLAUDE_PLUGIN_ROOT}/scripts/foo.ts` — variable exists only inside Claude Code; retired for hooks in v0.3.3.
  - Any hard-coded absolute path (cache dir, repo clone, `~/.agents/scripts/...` literal).
- **Canonical doc form:** `$(superskill script path <plugin> <rel>)` plus the runtime the entrypoint requires.

## Optional contract — binary registry

When a script is a pure engine (no FS state, deterministic from input) and you accept that a fix requires a CLI release, register it instead of staging it:

### Non-hook: `script run`

```bash
printf '%s' "$FINAL_ANSWER" | superskill script run cc validate-response
```

- Input contract per id (convention: env var first, e.g. `RESPONSE_TEXT`; else stdin).
- Exit codes are **validation-CLI semantics** (0 pass / 1 violation), never hook block semantics.
- Unknown `<plugin>/<script-id>` **fails open** (exit 0 + stderr warning naming the id and CLI version) — version skew is a deployment issue, not a policy violation (`apps/cli/src/commands/script-run.ts:66-85`).
- Register a `ScriptRunner` in `apps/cli/src/commands/script-run.ts` mapping `<plugin>/<id>` → runner.

### Hook: `hook run` (current hook form)

```json
{ "type": "command", "command": "superskill hook run cc anti-hallucination", "timeout": 10 }
```

- Portable PATH form; install translates to each host's native hook format.
- `minCliVersion` in `hooks.json` gates emission: an older CLI skips hook emission with a warning while skills/commands still install.
- Register a `HookRunner` in `apps/cli/src/commands/hook-run.ts`.

**Hooks stay on `hook run` for now.** Hook-path unification (migrating hooks off the binary registry onto staged paths) is feature A work item R6-B and is **not done**; do not stage a hook via `script path` until that design lands.

## Decision tree

```text
Is it triggered by a host hook event (Stop/PreToolUse/…)?
  YES → hook script
        → register HookRunner in hook-run.ts
        → hooks.json uses `superskill hook run <plugin> <id>`
        (staged hook paths are R6-B, not yet shipped)
  NO  → Is it invoked by an agent/host workflow (referenced from skill docs)?
    YES → Does the script need a real file on the target (portable runner, FS, args)?
      YES → STANDARD contract
            → author a portable entrypoint (.js/.mjs/.sh) under scripts/<feature>/
            → skill doc uses `$(superskill script path <plugin> <rel>)` + runtime
            → install stages it automatically
      NO  → OPTIONAL contract
            → register ScriptRunner in script-run.ts
            → skill doc uses `superskill script run <plugin> <id>`
    NO  → Is it repo build/release tooling (version bumps, publish checks)?
      YES → repo-root scripts/ (NOT plugin scripts — never installed)
      NO  → Does it need to exist? Prose guidance in the skill may be enough.
```

## Anti-patterns

| Anti-pattern | Why it's wrong | Do instead |
|---|---|---|
| `bun plugins/<plugin>/scripts/foo.ts` in a skill doc | Repo-relative source path; cwd ≠ plugin root on any install, file absent on non-Claude targets | Standard: `node "$(superskill script path <plugin> <rel>)"` · Optional: `superskill script run <plugin> <id>` |
| `${CLAUDE_PLUGIN_ROOT}/scripts/foo.ts` in `hooks.json` | Variable exists only inside Claude Code; retired for hooks in v0.3.3 | `superskill hook run <plugin> <id>` |
| Hard-coded absolute path (`~/.agents/scripts/...`, cache dir, repo clone) | Install mode and target class decide the real path | `$(superskill script path <plugin> <rel>)` |
| Per-skill `skills/<name>/scripts/` executables | Duplication across skills (ADR-015); skill folders are prose-only | Plugin-level `scripts/<feature>/` shared by all skills |
| Wiring a validation CLI (exit 0/1) into `hooks.json` | Hosts treat exit 1 as non-blocking error, not a block signal | Keep exit-0/1 CLIs as non-hook scripts (standard or optional); hook adapters use exit 2 |
| Assuming Bun is on the target host | Targets have no Bun/TS runtime guarantee; a `.ts` file staged as-is is not runnable | Ship a `.js`/`.mjs`/`.sh` portable entrypoint (Entrypoint Contract) |
| Ad-hoc manual copy of scripts into target dirs | Bypasses staging dedup and re-install safety; drifts from source | Let `superskill install` stage; never copy by hand |

> **Note on "copying scripts":** install-time staging to `~/.agents/scripts/<plugin>/` (rulesync/hermes) and native plugin tree delivery (Claude/OMP/Grok) is the **intended** mechanism. What remains wrong is *ad-hoc* copying and *repo-relative* invocation — staging is the fix, not the anti-pattern.

## Testing and coverage

- Plugin-level `plugins/<plugin>/scripts/**/tests/` **are** counted in the repo coverage gate (`bunfig.toml` ignores only `plugins/cc/skills/**/scripts` and `plugins/cc/skills/**/tests` — the skill-level paths).
- **Standard contract** — test the entrypoint as a portable script (run it under `node`/`sh` in tests; assert stdout + exit code per role). Path resolution itself is covered by `apps/cli/tests/commands/script-path.test.ts`.
- **Optional contract** — registry adapters get unit tests for both dispatch paths (known id → runner; unknown id → fail-open) plus per-script contract tests (each input channel, each exit code, input-channel precedence).
- **Optional-contract scripts only** are coupled to a CLI release — that version coupling is the deliberate ADR-022 tradeoff. Standard-contract scripts fix with a re-install (no CLI release).

## Status

| Surface | State |
|---|---|
| Plugin-level `scripts/<feature>/` layout + prose-only skills (ADR-015) | Shipped |
| `superskill install` staging of plugin scripts → `~/.agents/scripts/<plugin>/` (rulesync + hermes); native tree for Claude/OMP/Grok | Shipped (task 0090) |
| `superskill script path <plugin> <rel>` — fail-closed path resolution (exit 0 found / 2 not-found / 1 invalid) | Shipped (task 0091) |
| Entrypoint Contract v1 (Node `.js`/`.mjs`, POSIX `.sh`; exit-code classes) | Defined (task 0089) |
| `superskill script run <plugin> <id>` + `ScriptRunner` registry (optional contract, non-hook) | Shipped (task 0087); `cc/validate-response` registered |
| `superskill hook run <plugin> <id>` + `HookRunner` registry (current hook form) | Shipped (v0.2.19+); `cc/anti-hallucination` registered |
| Hook-path unification (hooks on staged paths instead of `hook run`) | **Planned** (feature A, R6-B) — keep using `hook run` until it lands |
