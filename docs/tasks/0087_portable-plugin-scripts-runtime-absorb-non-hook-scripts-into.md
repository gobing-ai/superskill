---
template: standard
schema_version: 1
name: "Portable plugin scripts runtime — absorb non-hook scripts into superskill script run dispatcher"
description: ""
status: blocked
type: task
profile: standard
feature_id: A
parent_wbs: null
priority: P2
tags: []
dependencies: ["0088", "0089"]
created_at: "2026-07-17T04:13:41.653Z"
updated_at: "2026-07-17T06:14:42.379Z"
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
R1. **`superskill script run <plugin> <script-id>` verb.** New CLI subcommand mirroring `hook run`'s shape: positional `<plugin>` and `<script-id>`, reads stdin, writes the runner's stdout to stdout, exit code from the runner. Unknown ids fail **open** (exit 0 + stderr warning naming id + installed CLI version) — deployment skew, not a policy violation. Missing positional args print registered ids + usage, exit 0.

R2. **`ScriptRunner` registry.** A typed registry in `apps/cli/src/commands/script-run.ts` (sibling to `hook-run.ts`'s `HookRunner` pattern): `{ run(input: { stdinText?: string; env: NodeJS.ProcessEnv }): ScriptRunResult }` per registered id, where `ScriptRunResult` carries `stdout: string` + `exitCode: number`. Registry is a plain map — adding a future script = one entry, no new verb.

R3. **First entry: `cc/validate-response`.** Thin adapter deep-importing `validateResponseText` from `plugins/cc/scripts/anti-hallucination/validate_response.ts` (same module family as the existing ADR-022 `ah_guard` deep import — no new exception needed; the import transitively pulls `verifyAntiHallucinationProtocol` + `logger`, which the build already bundles). The adapter MUST preserve the source script's exact contract (verified against `validate_response.ts:51-60`):
    - **Input precedence:** `RESPONSE_TEXT` env var first, else stdin (`Bun.env.RESPONSE_TEXT ?? readStdinText()`). Stdin reader honors the TTY guard (returns undefined on interactive terminal so the CLI never blocks).
    - **Empty input:** no env var + TTY/empty stdin → `{ ok: true, reason: 'No response text provided' }` → **exit 0**. Empty input passes by design; the adapter must not invent an error path for it.
    - **Output:** the result JSON line — `JSON.stringify({ ok, reason, issues? })` — byte-identical to what the source script prints via `logger.log`. This is result JSON, NOT hook-protocol decision JSON (`preToolUseDecision` etc.) and NOT free-form prose; agents may parse it.
    - **Exit codes:** `result.ok ? 0 : 1` (validation-CLI semantics, distinct from hook exit-2-block).

R4. **Skill doc correction.** `plugins/cc/skills/anti-hallucination/references/non-hook-enforcement.md` updated: every `bun plugins/cc/scripts/...` invocation replaced with `superskill script run cc validate-response`; the "Until Phase 4 lands" caveat (`:69`) removed; exit-code table kept (0/1 validation semantics, distinct from hook exit-2-block semantics).

R5. **Plugin README contract.** `plugins/cc/README.md` scripts table updated: `validate_response.ts` documented as "invoked via `superskill script run cc validate-response` on install targets; direct `bun` path is dev-repo-only".

R6. **Tests.**
    - Unit: registry resolution (known id → runner; unknown id → fail-open exit 0 + stderr warning); `cc/validate-response` adapter (RESPONSE_TEXT path, stdin path via injected reader, env-over-stdin precedence, empty-input → exit 0 + `{ok:true}` JSON, exit 0 on compliant text, exit 1 on violation, stdout byte-parity with source `JSON.stringify(result)`).
    - CLI-surface: `script run` registered on the program (satisfies the `cli-register-pattern` rule); missing args print registered ids.
    - Parity: a dev-only test invokes both `main()` (source) and the adapter over the same fixtures and asserts identical exit code + stdout bytes.
    - No regression: existing `hook run` tests untouched and green; full suite + `bun run lint` + `bun run spur-check` green.

R7. **Docs sync.** `docs/help/how_to_organize_scripts_for_plugin_development.md` Status table flipped from "lands with task 0087" to shipped with the invocation/exit-code/registry facts matching the implementation (AC6 reconciliation). CHANGELOG entry under `[Unreleased]`.

R8. **Non-goals.**
    - No copying/staging of plugin-level `scripts/` into `.rulesync/` or target dirs.
    - No per-target script emitters (pi shim / omp JS modules stay hook-only).
    - No runtime script discovery (registry is compile-time static — a plugin cannot register a script without a CLI release; that coupling is intentional per ADR-022).
    - No new scripts beyond `cc/validate-response`.
    - No changes to `ah_guard.ts` / hook-run behavior.
### Acceptance Criteria
AC1. **Uniform invocation works from an arbitrary cwd.** `printf '%s' "$TEXT" | superskill script run cc validate-response` from a directory that is NOT this repo exits 0 for compliant text and 1 for a violation — proving no repo-relative path dependency.

AC2. **Unknown ids degrade safely.** `superskill script run cc no-such-script` exits 0 with a stderr warning naming the id and CLI version (fail-open, mirroring `hook run` skew semantics).

AC3. **Full parity with the dev-path script.** For the same input, `superskill script run cc validate-response` and `bun plugins/cc/scripts/anti-hallucination/validate_response.ts` (repo checkout) produce the **same exit code AND byte-identical stdout** (the `{ok, reason, issues?}` JSON line) — no behavior or output drift between absorbed adapter and source script.

AC4. **Docs no longer teach broken invocations.** `grep -rn "bun plugins/cc/scripts" plugins/cc/skills/` returns zero hits; `non-hook-enforcement.md` shows only `superskill script run cc validate-response` invocations.

AC5. **Gates green.** `bun run lint`, `bun run test`, `bun run build`, `bun run spur-check` all pass; new adapter + registry covered by unit tests (per-file ≥90% per bunfig standard).

AC6. **Guidance doc verified.** `docs/help/how_to_organize_scripts_for_plugin_development.md`'s claims about `script run` match the shipped implementation (invocation, exit codes, registry location, Status table flipped to shipped) — the doc written before implementation (task precondition) is re-checked as part of verification, closing the doc-as-second-verification loop.

AC7. **Empty input passes cleanly.** `superskill script run cc validate-response` with no `RESPONSE_TEXT` and no piped stdin (TTY) exits 0 with `{"ok":true,"reason":"No response text provided"}` on stdout — the CLI never blocks on an interactive terminal, and empty input is a pass, not an error.
### Q&A

<!-- Clarifications and decisions made during refinement. Keep empty if none. -->

### Design
**D1. Two-class script model (the organizing principle).**

| Class | Trigger | Runtime surface | Example |
|---|---|---|---|
| Hook scripts | Host hook events (Stop, PreToolUse, …) via `hooks.json` | `superskill hook run <plugin> <hook-id>` → `HookRunner` registry in `hook-run.ts` | `cc/anti-hallucination` (ah_guard) |
| Non-hook scripts | Agent-invocable CLIs referenced by skill docs | `superskill script run <plugin> <script-id>` → `ScriptRunner` registry (this task) | `cc/validate-response` |

Both classes share one physical convention: source lives in `plugins/<plugin>/scripts/<skill-or-feature>/`, the CLI deep-imports it (ADR-022 blessed exception), `bun build --compile` bundles it. Install targets never receive script files.

**D2. Dispatcher shape (mirror `hook run`, pinned to the verified wiring pattern).**

- New module `apps/cli/src/commands/script-run.ts` exports `registerScriptRun(program: Command, readInput?: () => string)`. It creates the `program.command('script')` parent and attaches `run <plugin> <script-id>` on it — mirroring how `hook.ts:193` creates the `hook` parent and `hook.ts:246` attaches `registerHookRun(cmd)`. The injectable `readInput` mirrors `registerHookRun(cmd, readInput?)` so tests drive stdin deterministically.
- Registered in `apps/cli/src/index.ts` with the other `registerXxx(program)` calls — satisfies the re-enabled `cli-register-pattern` rule (`export function register\w+\(`).
- Dispatcher flow: resolve `${plugin}/${id}` in `SCRIPT_RUNNERS` → miss: stderr warning (id + CLI version) + exit 0 → hit: collect stdin via `readInput` (TTY-guarded, `undefined` when interactive), call `runner.run({ stdinText, env: process.env })`, write `result.stdout` to stdout, exit `result.exitCode`.
- Missing positional args → print registered ids + usage, exit 0.

**D3. `cc/validate-response` adapter (contract verified against source, not assumed).**

- Deep-import `validateResponseText` from `plugins/cc/scripts/anti-hallucination/validate_response.ts`. Transitive imports (`verifyAntiHallucinationProtocol` from `./ah_guard`, `logger`) are the same ADR-022 module family the build already bundles for `hook run` — no new build config.
- Runner logic (mirrors `validate_response.ts:56-61` exactly): `const text = env.RESPONSE_TEXT ?? stdinText; const result = validateResponseText(text); return { stdout: JSON.stringify(result), exitCode: result.ok ? 0 : 1 }`.
- Byte-compatibility decision: emit `JSON.stringify(result)` + trailing newline to match `logger.log` output shape; the AC3 parity test pins exact bytes so any drift is caught in CI, not by an agent in the field.
- The TTY guard lives in the shared stdin reader (D2), not duplicated in the adapter — `stdinText` arrives `undefined` on interactive terminals, which is exactly the source's `readStdinText()` behavior.

**D4. Rejected alternatives (with reasons).**

| Option | Why rejected |
|---|---|
| Stage `plugins/<plugin>/scripts/` into `.rulesync/` + copy to targets | Requires Bun on every target; per-target path conventions; payload duplication; breaks "skills are prose" model; agent cwd is unpredictable so relative invocation stays fragile |
| Skill-level `scripts/` per skill | Reintroduces the cc-agents duplication ADR-015 killed; plugin-level shared scripts are the convention |
| Generic script discovery from plugin manifests | Runtime discovery needs FS access to plugin dirs on targets — reintroduces every path problem; compile-time registry is the deliberate ADR-022 coupling |
| Named verb per script (`superskill validate-response`) | CLI surface growth per script; registry verb absorbs future scripts for free |

**D5. Test plan.** Registry unit tests (hit/miss/listing), adapter unit tests (both input channels, env-over-stdin precedence, empty-input pass, both exit paths, stdout bytes), CLI-surface test (command registered, missing-args listing), AC3 parity test (source `main()` vs adapter over shared fixtures — exit code + stdout bytes). Existing hook-run tests must pass untouched.

**D6. Version/skew posture.** No `minCliVersion` gate needed (unlike hooks, nothing is emitted to targets — the agent invokes the CLI directly at runtime). Skew handling is the fail-open unknown-id path only. If a target's superskill is older than the skill doc's expectation, the agent sees the warning and degrades gracefully to manual verification (the doc keeps a manual-checklist fallback section).
### Plan
1. **Implement** `apps/cli/src/commands/script-run.ts`: `ScriptRunner` interface, `ScriptRunResult`, `SCRIPT_RUNNERS` registry, dispatcher (TTY-guarded stdin via injectable `readInput`), `registerScriptRun(program)` creating the `script` parent + `run <plugin> <script-id>` subcommand. Wire into `apps/cli/src/index.ts`. (Contract already verified — see Design D2/D3; no re-derivation needed.)
2. **Add** the `cc/validate-response` registry entry: deep-import `validateResponseText`, apply `RESPONSE_TEXT ?? stdin` precedence, return `{ stdout: JSON.stringify(result), exitCode: result.ok ? 0 : 1 }`.
3. **Tests** in `apps/cli/tests/commands/script-run.test.ts` per D5 (registry, adapter, surface, AC3 source-vs-adapter parity).
4. **Docs**: rewrite invocations in `plugins/cc/skills/anti-hallucination/references/non-hook-enforcement.md`; update `plugins/cc/README.md` scripts table; CHANGELOG `[Unreleased]` entry.
5. **Verify** against `docs/help/how_to_organize_scripts_for_plugin_development.md` (AC6): flip its Status table to shipped, reconcile any drift (doc or code — whichever is wrong).
6. **Gates**: `bun run lint`, `bun run test`, `bun run build`, `bun run spur-check`; AC1 manual smoke (invoke from a non-repo cwd); AC7 manual smoke (no env, TTY stdin → exit 0 + `{ok:true}`).
7. Fill Solution (inline `file:line` citations) + Testing, run review/verify, transition to done.
### Solution
**Shipped surface — `superskill script run <plugin> <script-id>`** (`apps/cli/src/commands/script-run.ts`, 119 LOC):

- `ScriptRunner` interface (`{ run(input): ScriptRunResult }`) + `SCRIPT_RUNNERS: Record<string, ScriptRunner>` static registry — compile-time-only, one entry per shipped script (AC6 design constraint: adding a script requires a CLI release, intentional per ADR-022). Mirrors the sibling `HookRunner` pattern in `hook-run.ts:246`.
- `ccValidateResponse` adapter — deep-imports `validateResponseText` from `plugins/cc/scripts/anti-hallucination/validate_response.ts` (same module family as the existing ADR-022 `ah_guard` deep import — no new blessed exception). Honors the source contract: env-first input precedence (`Bun.env.RESPONSE_TEXT ?? readStdinText()`), TTY-guarded stdin reader (`apps/cli/src/commands/script-run.ts:91` `readStdinGuarded`), byte-identical result-JSON output, `ok ? 0 : 1` exit codes.
- `scriptRun({ plugin, scriptId, env, stdinText })` dispatcher — fail-open on unknown id (exit 0 + stderr warning naming id + `cliVersion`); missing positional args list registered ids + usage, exit 0.
- `registerScriptRun(program, readInput?)` — creates `script` parent (bare invocation lists registered ids) and `run` subcommand; `readInput` seam injectable for parity tests. Wired in `apps/cli/src/cli.ts` after `registerMagent` (correct entry — Plan said `index.ts`, actual entry is `cli.ts`; D2 pinned).

**Tests** (`apps/cli/tests/commands/script-run.test.ts`, 17 tests, 252 LOC):

- Registry resolution, unknown-id fail-open, adapter contract (env path, stdin path via injected reader, env-over-stdin precedence, empty-input → exit 0 + `{ok:true}` JSON, compliant → exit 0, violation → exit 1).
- **AC3 parity block** — invokes source `main()` and the adapter over the same fixtures, asserts identical exit code + stdout bytes. This is the acceptance-level guard against adapter drift.
- CLI-surface seams: injected `readInput`, `readStdinGuarded` TTY stub, bare `script` listing.

**Polluter fix (surgical, out-of-task but required for full-suite green).** `apps/cli/tests/commands/install-omp-helpers.test.ts:32` reassigned `process.env = { ...originalEnv }` in `afterEach`, replacing the global binding. Bun's `Bun.env` keeps pointing at the ORIGINAL env object, so every test file running after that one has a split `Bun.env`/`process.env` alias: writes via `process.env.X = ...` are invisible to `Bun.env.X`. The AC3 parity test's source-side capture (which reads `Bun.env.RESPONSE_TEXT` via `main()`) read `undefined` in the full suite but the value in isolation — the exact order-dependent pollution class. Fixed at both ends:
1. Polluter: restore env by mutation (`for key not in originalEnv: delete; Object.assign(process.env, originalEnv)`) so the alias stays intact for later files.
2. My parity test: write/delete `RESPONSE_TEXT` via `Bun.env` (what `main()` actually reads), bulletproof against any future reassignment pollution.

**Docs.** `plugins/cc/skills/anti-hallucination/references/non-hook-enforcement.md` — all `bun plugins/cc/scripts/...` → `superskill script run cc validate-response`, "Until Phase 4 lands" caveat removed (grep returns 0 stale references). `plugins/cc/README.md` scripts table row updated. `docs/help/how_to_organize_scripts_for_plugin_development.md` Status table flipped to shipped (AC6 reconciliation). CHANGELOG `[Unreleased]` entry (#0087).


**Automated — all green:**

- `bun test` full suite: **1482 pass / 0 fail** (was 1480 pass / 2 fail before the polluter fix). The script-run module itself: 17/17 tests, 100% functions, 97.87% lines.
- `bun run lint` clean (Biome + typecheck). No `as any`, no `biome-ignore` added (replaced `as any` with `as typeof process.exit`).
- `bun run build` succeeds; compiled binary at `dist/superskill`.
- `bun run spur-check` — 29 pre-check rules + 3 post-check rules (coverage-gate + tsdoc-export) green.

**Manual smoke (compiled binary, cwd `/tmp` — non-repo):**

- **AC1** — compliant text (URL + `**Confidence**: HIGH`) via stdin → exit 0, well-formed result JSON. Violation text (`API endpoint returns ... library method works reliably`) via stdin → exit 1, JSON with `issues` array. Proves no repo-relative path dependency.
- **AC2** — `superskill script run cc no-such-script < /dev/null` → exit 0 + stderr warning naming id + CLI version. Deployment-skew fail-open confirmed.
- **AC7** — `/dev/null` stdin (non-TTY, empty) → exit 0 + `{ok:true, reason:'No response text provided'}`. Empty-input pass-by-design confirmed. Bare `superskill script` (no args) → exit 0, lists registered id.

**AC traceability:** AC1 (uniform invocation from arbitrary cwd) ✓ smoke; AC2 (unknown-id fail-open) ✓ smoke + unit; AC3 (stdout/exit parity with source) ✓ parity block; AC4 (skill doc cleaned) ✓ grep=0; AC5 (README row) ✓; AC6 (guidance doc Status flipped) ✓; AC7 (TTY/empty input → exit 0) ✓ smoke + unit.
### Testing

**Shipped surface — `superskill script run <plugin> <script-id>`** (`apps/cli/src/commands/script-run.ts`, 119 LOC):

- `ScriptRunner` interface (`{ run(input): ScriptRunResult }`) + `SCRIPT_RUNNERS: Record<string, ScriptRunner>` static registry — compile-time-only, one entry per shipped script (AC6 design constraint: adding a script requires a CLI release, intentional per ADR-022). Mirrors the sibling `HookRunner` pattern in `hook-run.ts:246`.
- `ccValidateResponse` adapter — deep-imports `validateResponseText` from `plugins/cc/scripts/anti-hallucination/validate_response.ts` (same module family as the existing ADR-022 `ah_guard` deep import — no new blessed exception). Honors the source contract: env-first input precedence (`Bun.env.RESPONSE_TEXT ?? readStdinText()`), TTY-guarded stdin reader (`apps/cli/src/commands/script-run.ts:91` `readStdinGuarded`), byte-identical result-JSON output, `ok ? 0 : 1` exit codes.
- `scriptRun({ plugin, scriptId, env, stdinText })` dispatcher — fail-open on unknown id (exit 0 + stderr warning naming id + `cliVersion`); missing positional args list registered ids + usage, exit 0.
- `registerScriptRun(program, readInput?)` — creates `script` parent (bare invocation lists registered ids) and `run` subcommand; `readInput` seam injectable for parity tests. Wired in `apps/cli/src/cli.ts` after `registerMagent` (correct entry — Plan said `index.ts`, actual entry is `cli.ts`; D2 pinned).

**Tests** (`apps/cli/tests/commands/script-run.test.ts`, 17 tests, 252 LOC):

- Registry resolution, unknown-id fail-open, adapter contract (env path, stdin path via injected reader, env-over-stdin precedence, empty-input → exit 0 + `{ok:true}` JSON, compliant → exit 0, violation → exit 1).
- **AC3 parity block** — invokes source `main()` and the adapter over the same fixtures, asserts identical exit code + stdout bytes. This is the acceptance-level guard against adapter drift.
- CLI-surface seams: injected `readInput`, `readStdinGuarded` TTY stub, bare `script` listing.

**Polluter fix (surgical, out-of-task but required for full-suite green).** `apps/cli/tests/commands/install-omp-helpers.test.ts:32` reassigned `process.env = { ...originalEnv }` in `afterEach`, replacing the global binding. Bun's `Bun.env` keeps pointing at the ORIGINAL env object, so every test file running after that one has a split `Bun.env`/`process.env` alias: writes via `process.env.X = ...` are invisible to `Bun.env.X`. The AC3 parity test's source-side capture (which reads `Bun.env.RESPONSE_TEXT` via `main()`) read `undefined` in the full suite but the value in isolation — the exact order-dependent pollution class. Fixed at both ends:
1. Polluter: restore env by mutation (`for key not in originalEnv: delete; Object.assign(process.env, originalEnv)`) so the alias stays intact for later files.
2. My parity test: write/delete `RESPONSE_TEXT` via `Bun.env` (what `main()` actually reads), bulletproof against any future reassignment pollution.

**Docs.** `plugins/cc/skills/anti-hallucination/references/non-hook-enforcement.md` — all `bun plugins/cc/scripts/...` → `superskill script run cc validate-response`, "Until Phase 4 lands" caveat removed (grep returns 0 stale references). `plugins/cc/README.md` scripts table row updated. `docs/help/how_to_organize_scripts_for_plugin_development.md` Status table flipped to shipped (AC6 reconciliation). CHANGELOG `[Unreleased]` entry (#0087).


**Automated — all green:**

- `bun test` full suite: **1482 pass / 0 fail** (was 1480 pass / 2 fail before the polluter fix). The script-run module itself: 17/17 tests, 100% functions, 97.87% lines.
- `bun run lint` clean (Biome + typecheck). No `as any`, no `biome-ignore` added (replaced `as any` with `as typeof process.exit`).
- `bun run build` succeeds; compiled binary at `dist/superskill`.
- `bun run spur-check` — 29 pre-check rules + 3 post-check rules (coverage-gate + tsdoc-export) green.

**Manual smoke (compiled binary, cwd `/tmp` — non-repo):**

- **AC1** — compliant text (URL + `**Confidence**: HIGH`) via stdin → exit 0, well-formed result JSON. Violation text (`API endpoint returns ... library method works reliably`) via stdin → exit 1, JSON with `issues` array. Proves no repo-relative path dependency.
- **AC2** — `superskill script run cc no-such-script < /dev/null` → exit 0 + stderr warning naming id + CLI version. Deployment-skew fail-open confirmed.
- **AC7** — `/dev/null` stdin (non-TTY, empty) → exit 0 + `{ok:true, reason:'No response text provided'}`. Empty-input pass-by-design confirmed. Bare `superskill script` (no args) → exit 0, lists registered id.

**AC traceability:** AC1 (uniform invocation from arbitrary cwd) ✓ smoke; AC2 (unknown-id fail-open) ✓ smoke + unit; AC3 (stdout/exit parity with source) ✓ parity block; AC4 (skill doc cleaned) ✓ grep=0; AC5 (README row) ✓; AC6 (guidance doc Status flipped) ✓; AC7 (TTY/empty input → exit 0) ✓ smoke + unit.
### Review
**Findings (FSM testing → done gate):**

- **P1 (blocker):** none.
- **P2 (high):** none.
- **P3 (medium):** none.
- **P4 (low/nits):** none.

**Self-review notes:**

- **Adapter fidelity** — `ccValidateResponse` reproduces the source `main()` contract exactly: same input precedence (`Bun.env.RESPONSE_TEXT ?? readStdinText()`), same TTY guard, same result-JSON output, same exit codes (`ok ? 0 : 1`). The AC3 parity test pins byte-identical stdout + identical exit across compliant and violation fixtures, so future drift in either direction fails the suite.
- **Fail-open semantics** — unknown script id returns exit 0 + stderr warning (not exit 1). This matches `hook run`'s deployment-skew posture: a missing script is a version-skew condition, not a policy violation. Documented in R1 and verified by AC2 smoke.
- **Scope discipline** — shipped exactly one registry entry (`cc/validate-response`). No script copying, no per-target emitters, no runtime discovery, no new blessed ADR exception (reuses the existing ADR-022 deep-import family). Non-goals R8 respected.
- **Out-of-task fix justified** — the `install-omp-helpers.test.ts` `process.env` reassignment was a latent order-dependent-pollution bug that happened to surface via this task's AC3 parity test. The fix (restore by mutation) is surgical (one `afterEach`), correct (preserves the `Bun.env` alias for all later files), and independently necessary — leaving it would make the full suite fragile to file-ordering changes. Logged to learnings as a reusable bug class.
- **No regressions** — `hook run` tests untouched and green; existing 1465 tests still pass; no new lint suppressions; no `as any` (replaced with `as typeof process.exit`).

**Verdict:** PASS — ready for `done`.
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
- 2026-07-17T04:25:54.254Z backlog → todo (system)
- 2026-07-17T04:25:54.369Z todo → wip (system)
- 2026-07-17T05:05:10.507Z wip → testing (system)
- 2026-07-17T05:05:10.742Z testing → done (system)
- 2026-07-17T06:13:51.505Z done → wip (system)
- 2026-07-17T06:14:42.379Z wip → blocked (system)
