---
template: standard
schema_version: 1
name: "Portable plugin scripts runtime — absorb non-hook scripts into superskill script run dispatcher"
description: ""
status: backlog
type: task
profile: standard
feature_id: F4
parent_wbs: null
priority: P2
tags: []
dependencies: []
created_at: "2026-07-17T04:13:41.653Z"
updated_at: "2026-07-17T04:16:35.835Z"
---

## 0087. Portable plugin scripts runtime — absorb non-hook scripts into superskill script run dispatcher

### Background
**Problem.** `plugins/<plugin>/scripts/` has two script classes, and only one has a portable runtime story.

- **Hook scripts (solved).** `plugins/cc/scripts/anti-hallucination/ah_guard.ts` + `logger.ts` run on every target because `apps/cli/src/commands/hook-run.ts:6` deep-imports the engine (ADR-022), `bun build --compile` bundles it into the `superskill` binary, and every target's emitted hook calls `superskill hook run cc anti-hallucination` (PATH-resolved, no `${CLAUDE_PLUGIN_ROOT}`).
- **Non-hook scripts (broken).** `plugins/cc/scripts/anti-hallucination/validate_response.ts` is a standalone validation CLI (`main(): number`, exit 0/1, `validateResponseText()` pure export). The skill doc `plugins/cc/skills/anti-hallucination/references/non-hook-enforcement.md` tells agents to run `bun plugins/cc/scripts/anti-hallucination/validate_response.ts` — a **source-repo-relative path**.

**Why the current invocation is broken on install targets:**

| Environment | State | Why it fails |
|---|---|---|
| This repo (dev) | Works | cwd is the repo; path resolves |
| Claude Code install | Broken | plugin lands at `~/.claude/plugins/cache/superskill/cc/<ver>/`; cwd is never the plugin root, and `plugins/cc/scripts/...` is a repo path, not an installed path |
| Non-Claude targets (codex/pi/opencode/grok/omp/hermes/antigravity/cursor) | Broken harder | `mapPluginToRulesync` never stages plugin-level `scripts/` (only skill-level support subdirs, `mapper.ts:153-158`) — the file does not exist on the target |
| All targets | Runtime assumption | even if copied, `bun <file>.ts` requires Bun on the target machine; agents may run under Node-only or sandboxed environments |

The skill doc itself concedes the gap: "Until Phase 4 lands, use `validate_response.ts` directly…" (`non-hook-enforcement.md:69`). Phase 4 never landed; this task is Phase 4.

**Desired end state.** Every script under `plugins/<plugin>/scripts/` — hook or non-hook — is invocable on every supported target through one uniform surface: the `superskill` binary on PATH. No script *file paths* in skill docs, no `${CLAUDE_PLUGIN_ROOT}`, no Bun-runtime requirement on targets. The mechanism is a symmetric dispatcher registry mirroring `hook run`:

```bash
superskill hook   run cc anti-hallucination   # hook class (exists)
superskill script run cc validate-response    # non-hook class (this task adds)
```

**Scope discipline.** Only one non-hook script exists today (`validate_response.ts`). The registry is designed to absorb future scripts without CLI surface growth, but this task ships exactly one registry entry. Do not build script copying, per-target emitters, or a general plugin-script packaging system (see rejected alternatives in Design).
### Requirements
R1. **`superskill script run <plugin> <script-id>` verb.** New CLI subcommand mirroring `hook run`'s shape: positional `<plugin>` and `<script-id>`, reads stdin, writes JSON to stdout, exit code from the runner. Unknown ids fail **open** (exit 0 + stderr warning naming id + installed CLI version) — deployment skew, not a policy violation. A `--help`-style listing of registered ids on missing args.

R2. **`ScriptRunner` registry.** A typed registry in `apps/cli/src/commands/` (sibling to `hook-run.ts`'s `HookRunner` pattern): `{ run(input): ScriptRunResult }` per registered id, where `ScriptRunResult` carries stdout text + exit code. Registry is a plain map — adding a future script = one entry, no new verb.

R3. **First entry: `cc/validate-response`.** Thin adapter deep-importing `validateResponseText` from `plugins/cc/scripts/anti-hallucination/validate_response.ts` (ADR-022 blessed-exception pattern — same file family as the existing `ah_guard` deep import). Input contract identical to today's script: `RESPONSE_TEXT` env var OR stdin; exit 0 = protocol followed, exit 1 = violation; human-readable result on stdout (NOT hook-protocol JSON — this is a validation CLI, not a hook adapter).

R4. **Skill doc correction.** `plugins/cc/skills/anti-hallucination/references/non-hook-enforcement.md` updated: every `bun plugins/cc/scripts/...` invocation replaced with `superskill script run cc validate-response`; the "Until Phase 4 lands" caveat removed; exit-code table kept (0/1 validation semantics, distinct from hook exit-2-block semantics).

R5. **Plugin README contract.** `plugins/cc/README.md` scripts table updated: `validate_response.ts` documented as "invoked via `superskill script run cc validate-response` on install targets; direct `bun` path is dev-repo-only".

R6. **Tests.**
    - Unit: registry resolution (known id → runner; unknown id → fail-open exit 0 + stderr warning); `cc/validate-response` adapter (RESPONSE_TEXT path, stdin path, exit 0 on compliant text, exit 1 on violation, precedence when both channels present).
    - CLI-surface: `script run` appears in program commands; missing args print registered ids.
    - No regression: existing `hook run` tests untouched and green; full suite + `bun run lint` + `bun run spur-check` green.

R7. **Docs sync.** `docs/help/cmd_install.md` or a new short section in the scripts guidance doc (`docs/help/how_to_organize_scripts_for_plugin_development.md`) records the two-class model (hook → `hook run`; non-hook → `script run`) so the next script author lands in the right place. CHANGELOG entry under `[Unreleased]`.

R8. **Non-goals.**
    - No copying/staging of plugin-level `scripts/` into `.rulesync/` or target dirs.
    - No per-target script emitters (pi shim / omp JS modules stay hook-only).
    - No runtime script discovery (registry is compile-time static — a plugin cannot register a script without a CLI release; that coupling is intentional per ADR-022).
    - No new scripts beyond `cc/validate-response`.
    - No changes to `ah_guard.ts` / hook-run behavior.
### Acceptance Criteria
AC1. **Uniform invocation works from an arbitrary cwd.** `printf '%s' "$TEXT" | superskill script run cc validate-response` from a directory that is NOT this repo exits 0 for compliant text and 1 for a violation — proving no repo-relative path dependency.

AC2. **Unknown ids degrade safely.** `superskill script run cc no-such-script` exits 0 with a stderr warning naming the id and CLI version (fail-open, mirroring `hook run` skew semantics).

AC3. **Parity with the dev-path script.** For the same input, `superskill script run cc validate-response` and `bun plugins/cc/scripts/anti-hallucination/validate_response.ts` (repo checkout) produce the same exit code — no behavior drift between absorbed adapter and source script.

AC4. **Docs no longer teach broken invocations.** `grep -rn "bun plugins/cc/scripts" plugins/cc/skills/` returns zero hits; `non-hook-enforcement.md` shows only `superskill script run cc validate-response` invocations.

AC5. **Gates green.** `bun run lint`, `bun run test`, `bun run build`, `bun run spur-check` all pass; new adapter + registry covered by unit tests (per-file ≥90% per bunfig standard).

AC6. **Guidance doc verified.** `docs/help/how_to_organize_scripts_for_plugin_development.md`'s claims about `script run` match the shipped implementation (invocation, exit codes, registry location) — the doc written before implementation (task precondition) is re-checked as part of verification, closing the doc-as-second-verification loop.
### Q&A

<!-- Clarifications and decisions made during refinement. Keep empty if none. -->

### Design
**D1. Two-class script model (the organizing principle).**

| Class | Trigger | Runtime surface | Example |
|---|---|---|---|
| Hook scripts | Host hook events (Stop, PreToolUse, …) via `hooks.json` | `superskill hook run <plugin> <hook-id>` → `HookRunner` registry in `hook-run.ts` | `cc/anti-hallucination` (ah_guard) |
| Non-hook scripts | Agent-invocable CLIs referenced by skill docs | `superskill script run <plugin> <script-id>` → `ScriptRunner` registry (this task) | `cc/validate-response` |

Both classes share one physical convention: source lives in `plugins/<plugin>/scripts/<skill-or-feature>/`, the CLI deep-imports it (ADR-022 blessed exception), `bun build --compile` bundles it. Install targets never receive script files.

**D2. Dispatcher shape (mirror `hook run`).**

- `apps/cli/src/commands/script-run.ts` — new module. Exports `ScriptRunner` interface, `SCRIPT_RUNNERS: Record<string, ScriptRunner>`, `runScriptDispatcher(plugin, id, io): Promise<number>`, and `registerScriptRun(cmd)` for Commander wiring (project convention: `registerXxx(program)` per re-enabled cli-register-pattern rule — use `registerScriptRun(program)`).
- Dispatcher flow: resolve `${plugin}/${id}` in registry → miss: stderr warning + exit 0 (fail-open, R1) → hit: collect stdin (unless empty TTY), call runner with `{ stdinText, env }`, write `result.stdout` to stdout, exit `result.exitCode`.
- Missing positional args → print registered ids + usage, exit 0 (R1 listing requirement).

**D3. `cc/validate-response` adapter.**

- Deep-import `validateResponseText` from `plugins/cc/scripts/anti-hallucination/validate_response.ts`.
- Input precedence matches the source script's `main()`: `RESPONSE_TEXT` env var first, else stdin.
- Output: the validation verdict line(s) the source prints today (keep byte-compatible where practical so docs/agents parsing it don't break); exit 0/1 per `ValidationResult`.
- Do NOT reuse hook-protocol JSON (`preToolUseDecision` etc.) — this is a validation CLI; hook exit-2-block semantics are explicitly out of scope (`non-hook-enforcement.md` already warns against wiring it into hooks.json).

**D4. Rejected alternatives (with reasons).**

| Option | Why rejected |
|---|---|
| Stage `plugins/<plugin>/scripts/` into `.rulesync/` + copy to targets | Requires Bun on every target; per-target path conventions; payload duplication; breaks "skills are prose" model; agent cwd is unpredictable so relative invocation stays fragile |
| Skill-level `scripts/` per skill | Reintroduces the cc-agents duplication ADR-015 killed; plugin-level shared scripts are the convention |
| Generic script discovery from plugin manifests | Runtime discovery needs FS access to plugin dirs on targets — reintroduces every path problem; compile-time registry is the deliberate ADR-022 coupling |
| Named verb per script (`superskill validate-response`) | CLI surface growth per script; registry verb absorbs future scripts for free |

**D5. Test plan.** Registry unit tests (hit/miss/listing), adapter unit tests (both input channels, both exit paths, precedence), CLI-surface test (command registered, `--help` lists ids), parity test vs source script (AC3) as a dev-only test invoking both and comparing exit codes. Existing hook-run tests must pass untouched.

**D6. Version/skew posture.** No `minCliVersion` gate needed (unlike hooks, nothing is emitted to targets — the agent invokes the CLI directly at runtime). Skew handling is the fail-open unknown-id path only. If a target's superskill is older than the skill doc's expectation, the agent sees the warning and degrades gracefully to manual verification (the doc keeps a manual-checklist fallback section).
### Plan
1. **Read** `apps/cli/src/commands/hook-run.ts` (registry + dispatcher + fail-open shape to mirror) and `plugins/cc/scripts/anti-hallucination/validate_response.ts` (exact `main()` I/O contract to preserve).
2. **Implement** `apps/cli/src/commands/script-run.ts`: `ScriptRunner` interface, `SCRIPT_RUNNERS` registry, dispatcher, `registerScriptRun`; wire into `apps/cli/src/index.ts`.
3. **Add** the `cc/validate-response` adapter entry (deep import + input precedence + exit-code mapping).
4. **Tests** in `apps/cli/tests/commands/script-run.test.ts` per D5 (registry, adapter, surface, AC3 parity).
5. **Docs**: rewrite invocations in `plugins/cc/skills/anti-hallucination/references/non-hook-enforcement.md`; update `plugins/cc/README.md` scripts table; CHANGELOG `[Unreleased]` entry.
6. **Verify** against `docs/help/how_to_organize_scripts_for_plugin_development.md` (AC6 doc-as-second-verification): reconcile any claim that drifted from the shipped behavior, in the doc or the code — whichever is wrong.
7. **Gates**: `bun run lint`, `bun run test`, `bun run build`, `bun run spur-check`; AC1 manual smoke (invoke from a non-repo cwd).
8. Fill Solution (inline `file:line` citations) + Testing, run review/verify, transition to done.
### Solution

<!-- Filled during implementation: file:line change map and concise rationale. -->

### Testing

<!-- Filled during verification: commands run, outcomes, coverage claim or N/A. -->

### Review

<!-- Filled during review: P1-P4 findings, residual risk, and final disposition. -->

### References
**Code (this repo)**

- `apps/cli/src/commands/hook-run.ts:6` — ADR-022 deep import of `ah_guard`; `HookRunner` registry + dispatcher + fail-open unknown-id semantics (the pattern to mirror)
- `plugins/cc/scripts/anti-hallucination/validate_response.ts:27` — `validateResponseText(text)` pure export; `:51` `main(): number` CLI contract (RESPONSE_TEXT | stdin → exit 0/1)
- `packages/core/src/mapper.ts:153-158` — mapper stages only skill-level support subdirs; plugin-level `scripts/` never reaches targets (why the broken doc path exists)
- `apps/cli/package.json:33` — `bun build --compile` bundles deep imports into the binary
- `plugins/cc/README.md:148` — current `validate_response.ts` contract note ("NOT a hook adapter")

**Skill docs to change**

- `plugins/cc/skills/anti-hallucination/references/non-hook-enforcement.md` — all `bun plugins/cc/scripts/...` invocations; `:69` "Until Phase 4 lands" caveat

**Decisions / process**

- `docs/00_ADR.md` — ADR-015 (plugin-level scripts convention), ADR-022 (blessed deep-import exception)
- `docs/help/how_to_organize_scripts_for_plugin_development.md` — guidance doc authored alongside this task; serves as the second design verification (AC6)
- Task 0085 learnings — two Stop adapters + one validation CLI taxonomy; heuristic-fixture methodology
### History
