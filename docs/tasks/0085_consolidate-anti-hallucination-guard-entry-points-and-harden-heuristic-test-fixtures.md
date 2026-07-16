---
schema_version: 1
name: "Consolidate anti-hallucination guard entry points (3→1) and harden heuristic test fixtures against serial residuals"
status: done
template: standard
created_at: 2026-07-15T23:30:00.000Z
updated_at: "2026-07-16T01:18:44.057Z"
priority: P2
---

## 0085. Consolidate anti-hallucination guard entry points (3→1) and harden heuristic test fixtures against serial residuals

### Background
<!-- Why this task exists: the problem, motivation, and context. Self-contained — readable without the parent. -->

A `/sp:dev-review plugins/cc --auto --focus all --fix all` run on 2026-07-15 found and fixed four defects in the anti-hallucination guard (bugs 065–068: local-code false positives, hostname:port as citation, TTY hang on `validate_response`, confidence bold-on-value). Two structural items were **deliberately deferred** for explicit design — this task owns them.

**Issue verification (2026-07-15, re-checked during refine):** both issues are **real**. Several details in the first draft of this task were wrong and are corrected below.

#### 1. Duplicate Stop orchestration (real) — not "three Stop entry points"

Two adapters implement the **same Stop contract** (exit `0` allow / `2` block + canonical Stop JSON):

| Surface | Path | Role today |
|---|---|---|
| Production hook | `apps/cli/src/commands/hook-run.ts` → `ccAntiHallucination.run()` | What `hooks.json` invokes via `superskill hook run cc anti-hallucination` |
| Direct CLI | `ah_guard.main()` + `import.meta.main` | Documented `bun ah_guard.ts` path; has its own unit suite |

Both call `resolveStopContext()` then `verifyAntiHallucinationProtocol()` then emit Stop JSON — ~15 lines of orchestration duplicated with different I/O shapes (`HookRunResult` vs `logger` + exit code). The pure engine is already single-sourced; only the adapter glue is duplicated.

`validate_response.main()` is **not** a third Stop entry. It is a distinct CLI contract (exit `0`/`1`, plain JSON, no Stop envelope) and must stay separate. The original title's "3→1" framing is therefore wrong: the goal is **one Stop-orchestration owner** (2 adapters → 1 implementation), not collapsing three surfaces into one binary.

Docs (`docs/04_DESIGN.md`, `docs/help/bundled_plugin.md`, `plugins/cc/skills/anti-hallucination/references/guard-implementation.md`) already describe `main()` as a documented direct-invocation surface and the production path as the portable `superskill hook run …` dispatcher. Stale docs that claimed `hooks.json` invoked `bun ${CLAUDE_PLUGIN_ROOT}/scripts/…/ah_guard.ts` were fixed in the review pass. **Do not delete a documented surface without updating those three docs in the same commit.**

#### 2. Heuristic residual class is a test-methodology failure (real) — residual itself already fixed

The `requiresExternalVerification` heuristic leaked residuals three times; each prior fix's verification was powerless against the next residual of the same class:

| Fix | What it stopped | What it left | Why tests missed it |
|---|---|---|---|
| **0077 R1** | Bare weak vocab (`function`/`method` alone) | Local-code + coupler ("the function returns early") still demanded citations | Negatives were **coupler-free** ("Added a helper function") — they never exercised the coupler gate the rule claimed to own |
| **0079** | Metric decimals as versions (`94.87%`) | — (exhaustive for that class) | N/A |
| **2026-07-15 review** | Local-code + coupler (`function`/`method` dropped from `WEAK_KEYWORD_PATTERN`) | `api|library|framework|sdk|package|endpoint|documentation` + coupler still fire | **Intentional** — those name external artifacts |

**Important correction to the draft R2 example:** the residual sentence `"the function returns early"` does **not** "avoid the coupler" — it *carries* the coupler (`returns`). The insufficient fixtures were the coupler-free ones. Residual-proof negatives for the local-code case were added in the review (`ah_guard.test.ts` "passes ordinary implementation talk even when it carries a capability coupler"). This task's job for R2 is to **encode the methodology as project standard** and audit fixtures so the next residual of the same class cannot be certified MET by a structurally-powerless test — not to re-fix the already-landed local-code residual, and not to silence intentional external weak keywords.

**Recorded in** `.wolf/cerebrum.md` (2026-07-15) and `.wolf/buglog.json` (bug-065→068).
### Requirements
- [x] R1. **One Stop-orchestration owner.** Extract a single exported function in `plugins/cc/scripts/anti-hallucination/ah_guard.ts` that owns the full Stop contract end-to-end: `resolveStopContext(argumentsEnv, stdinText)` → allow/block decision → canonical Stop JSON + exit code `0|2` (and optional stderr reason on block). Recommended name/shape: `runStopGuard(argumentsEnv: string | undefined, stdinText: string): { output: string; exitCode: 0 | 2; stderr?: string }`. Then:

  - `main(stdinText?)` becomes a thin CLI adapter: call `runStopGuard(Bun.env.ARGUMENTS, stdinText)`, write `output` via `logger`, write `stderr` via `logger.error` when present, return `exitCode`.
  - `ccAntiHallucination.run(env, stdinText)` becomes a thin HookRunner adapter: call `runStopGuard(env.ARGUMENTS, stdinText)` and map to `HookRunResult` (`{ output, exitCode, stderr? }`).
  - **Do not** re-implement the branch table in either adapter. **Do not** delete either entry surface unless docs are updated in the same commit to remove it (recommended: keep both adapters; they have different consumers).
  - **Keep** `validate_response.main()` separate (exit `0|1`, no Stop envelope). It already delegates to `verifyAntiHallucinationProtocol` only.
  - Sync the three doc surfaces in the **same commit** if any wording still describes two independent Stop implementations: `docs/04_DESIGN.md`, `docs/help/bundled_plugin.md`, `plugins/cc/skills/anti-hallucination/references/guard-implementation.md`.
  - Production path `superskill hook run cc anti-hallucination` must keep identical observable behavior (exit codes, stdout JSON shape, stderr reason on block, fail-open on empty/invalid/`stop_hook_active`).

- [x] R2. **Encode the heuristic-gate negative-fixture rule (project standard + audit).** For any heuristic/regex gate (compound triggers especially): every negative fixture that claims to prove "this rule does not fire on shape X" must **carry the trigger halves it is defending against** and still not fire. A negative that avoids the trigger is a different sentence — it cannot certify the rule.

  Concrete deliverables:
  1. Add a short bullet under `AGENTS.md` → `## Testing` (the project owner of testing conventions) stating the rule above, with the anti-hallucination residual as the worked example: coupler-free `"Added a helper function"` is a baseline bare-vocab regression; residual-proof is `"The function returns early…"` (weak-name + coupler, still false after dropping `function`/`method` from the weak set).
  2. Optionally append a one-line lesson to `docs/99_PROJECT_CONSTITUTION.md` § lessons pointing at the AGENTS.md bullet (constitution owns process lessons, not the testing standard itself).
  3. Audit `plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts` `requiresExternalVerification` negatives: each test name/comment must honestly match what the fixture exercises (baseline vs residual-proof). Keep intentional external positives (`api`/`package`/`endpoint` + coupler → true). No further vocabulary surgery in this task unless the audit finds a *false* residual (local-code still firing) — that would be a separate defect.
  4. **Out of scope for this task:** a new `spur rule` that auto-lints "insufficient negatives" across the repo. That needs a durable pattern language and is not justified by one pilot file; defer unless a second residual class appears after the AGENTS.md rule lands.

- [x] R3. **Regression guard after R1 (no mythical e2e.sh).** There is no checked-in `e2e.sh` probe — use the existing unit + hook-run contract tests plus an explicit dual-path agreement check. After R1:

  1. Full gate green: `bun run lint && bun run test && bun run spur-check` (no skipped tests, no new suppressions).
  2. Existing suites stay green: `ah_guard.test.ts` (including `describe('main')`), `validate_response.test.ts`, `apps/cli/tests/commands/hook-run.test.ts` `describe('hook run — cc/anti-hallucination …')`.
  3. Dual-path agreement: for each of the following payloads, `main()` exit code and `superskill hook run cc anti-hallucination` exit code must match (same allow/block decision):
     - short/internal coding talk → `0`
     - local-code + coupler (`"The function returns early when the list is empty."`, ≥50 chars if needed) → `0`
     - uncited external claim with version → `2`
     - cited external claim with confidence → `0`
     - metrics-dense verdict (`94.87%` / `file:line` / `pass`/`fail`) → `0`
     - `stop_hook_active: true` → `0`
     - empty / invalid payload → `0`
  4. `validate_response` exit `0|1` contract unchanged (not part of the Stop consolidation).
### Acceptance Criteria

**Scenario: R1 — single Stop owner, both adapters thin**

- Given `runStopGuard` (or equivalent) is the only place that branches on `allowReason` / missing content / protocol result for the Stop path
- When `main()` and `ccAntiHallucination.run()` are inspected
- Then neither re-implements that branch table; both only adapt I/O (CLI logger/exit vs `HookRunResult`), and `validate_response.main()` remains a separate exit-`0|1` CLI

**Scenario: R1 — production Stop contract unchanged**

- Given the payloads already covered by `apps/cli/tests/commands/hook-run.test.ts` (allow short message, block uncited external, fail-open empty/invalid, omp stdin, transcript_path, `stop_hook_active`, unreadable transcript)
- When `superskill hook run cc anti-hallucination` runs after consolidation
- Then exit codes, stdout Stop JSON shape, and stderr-on-block behavior match pre-change expectations (existing tests stay green)

**Scenario: R1 — dual-path agreement**

- Given each dual-path payload listed in R3 (internal, local+coupler, uncited external, cited external, metrics, stop_hook_active, empty/invalid)
- When run through both `main()` and `hook run cc anti-hallucination`
- Then both surfaces return the same exit code (`0` or `2`) for that payload

**Scenario: R2 — testing standard documents residual-proof negatives**

- Given `AGENTS.md` `## Testing` after this task
- When an agent authors a new heuristic/regex negative fixture
- Then the standard states that the fixture must carry the trigger it claims to neutralize (worked example: coupler-free vs residual-proof for the 0077/review residual class)

**Scenario: R2 — fixture audit honesty**

- Given `ah_guard.test.ts` `requiresExternalVerification` describe blocks
- When the audit completes
- Then baseline (coupler-free) and residual-proof (coupler-carrying local talk) negatives are distinguishable by name/comment, residual-proof cases still assert `false`, and intentional external weak+coupler positives still assert `true`

**Scenario: R3 — full gate green**

- Given R1 + R2 code/doc edits
- When `bun run lint`, `bun run test`, and `bun run spur-check` run
- Then all pass with no skipped tests and no new biome/eslint-style suppressions; `validate_response` exit contract still `0|1`

### Q&A

_None yet._
### Design
**Goal.** Collapse duplicated Stop **orchestration** into one function without changing the production hook contract, without collapsing the distinct `validate_response` CLI, and without leaving the residual-proof testing lesson only in chat history.

**R1 — recommended shape (picked; not "either direction").**

Do this (extract shared owner, keep both adapters):

```ts
// plugins/cc/scripts/anti-hallucination/ah_guard.ts
export interface StopGuardResult {
    output: string;       // buildStopOutput(...) JSON
    exitCode: 0 | 2;
    stderr?: string;      // block reason only
}

export function runStopGuard(
    argumentsEnv: string | undefined,
    stdinText: string,
): StopGuardResult {
    const resolved = resolveStopContext(argumentsEnv, stdinText);
    if (resolved.allowReason) {
        return { output: buildStopOutput({ ok: true, reason: resolved.allowReason }), exitCode: 0 };
    }
    if (resolved.content === undefined) {
        return { output: buildStopOutput({ ok: true, reason: 'No content to verify' }), exitCode: 0 };
    }
    const result = verifyAntiHallucinationProtocol(resolved.content);
    if (result.ok) {
        return { output: buildStopOutput(result), exitCode: 0 };
    }
    return { output: buildStopOutput(result), exitCode: 2, stderr: result.reason };
}
```

Adapters (thin only):

| Adapter | File | Responsibility after R1 |
|---|---|---|
| `main(stdinText?)` | `ah_guard.ts` | `runStopGuard(Bun.env.ARGUMENTS, stdinText)` → logger + return code |
| `ccAntiHallucination.run` | `hook-run.ts` | `runStopGuard(env.ARGUMENTS, stdinText)` → `HookRunResult` |
| `validate_response.main` | `validate_response.ts` | **unchanged** — still `verifyAntiHallucinationProtocol` only, exit `0|1` |

Why not "merge main into hook-run only" / "delete main":

- `main()` is documented and unit-tested; deleting it is an API-surface change that requires three docs to drop the surface.
- `ccAntiHallucination` cannot call `main()` cleanly: `main` binds `Bun.env.ARGUMENTS` and performs logger side effects; the HookRunner needs injected `env` and structured return values.
- Elevating `main` as the single impl without extracting a pure result object would keep the side-effect problem.

Why not promote the engine to a workspace package: ADR-022 already blesses the deep-import seam from `hook-run.ts` into `plugins/cc/scripts/`; this task does not reopen that decision.

**R2 — where the rule lives.**

| Artifact | Owns | Action |
|---|---|---|
| `AGENTS.md` `## Testing` | Testing conventions (project entry doc) | Add 2–4 bullets: residual-proof negative rule + anti-hallucination worked example |
| `docs/99_PROJECT_CONSTITUTION.md` lessons | Process lessons only | Optional one-liner pointer; do **not** restate the full testing standard here |
| `ah_guard.test.ts` | Fixture honesty | Comments/names only unless audit finds a real false residual |
| New `spur rule` | Automated lint | **Deferred** — not in this task |

Normative text for AGENTS.md: For heuristic/regex gates with compound triggers (keyword ∧ coupler, cue-gated version, etc.), a negative fixture must include every trigger half the production rule could fire on for the scenario under test, and still assert "does not fire." Fixtures that omit a half only lock the "bare half alone" baseline — label them as such; never use them alone to certify "compound residual is gone."

**R3 — regression surface (concrete; replaces nonexistent `e2e.sh`).**

Primary automation is already present:

- Unit: `plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts` (`main`, `requiresExternalVerification`, protocol)
- Hook: `apps/cli/tests/commands/hook-run.test.ts` (`hook run — cc/anti-hallucination …`)

Add only what R1 needs for dual-path agreement if existing tests do not already cover both surfaces on the same payload set (prefer extending the existing suites over inventing a shell script).

**Out of scope.**

- Changing `WEAK_KEYWORD_PATTERN` / `CLAIM_COUPLER_PATTERN` vocabulary (unless audit proves a new false residual)
- Changing `validate_response` exit contract
- Reopening ADR-022 (package promotion)
- Auto-lint spur rule for insufficient negatives
- Renaming the task file slug (`3→1` in the historical title is imprecise; framing in Background/Requirements is authoritative)
### Plan

1. **Confirm red baseline (characterization).** Run the existing anti-hallucination unit + hook-run suites; note pass counts. Optionally snapshot exit codes for the R3 dual-path payload list via `main()` and `bun apps/cli/src/index.ts hook run cc anti-hallucination` so post-R1 comparison is evidence-backed.

2. **R1 — extract `runStopGuard`.** In `ah_guard.ts`, add `StopGuardResult` + `runStopGuard` with the branch table currently duplicated in `main` and `ccAntiHallucination`. Rewrite `main` as a thin adapter. Rewrite `ccAntiHallucination.run` to call `runStopGuard` (import the new export; keep the ADR-022 deep-import path).

3. **R1 — tests.** Keep `describe('main')` green. Prefer adding a focused unit block for `runStopGuard` that pins allow/block/fail-open once (adapters stay thin). Extend hook-run or ah_guard tests only if dual-path agreement is not already implied by existing coverage.

4. **R1 — docs sync (same commit if wording drifts).** Grep the three surfaces for claims that Stop orchestration lives in two independent implementations; point both adapters at `runStopGuard` if described. Do not reintroduce `bun ${CLAUDE_PLUGIN_ROOT}/scripts/…/ah_guard.ts` as the hooks.json command.

5. **R2 — AGENTS.md.** Add residual-proof negative-fixture bullets under `## Testing` with the 0077/review worked example (coupler-free baseline vs coupler-carrying residual-proof). Optional constitution lesson pointer.

6. **R2 — fixture audit.** Walk `requiresExternalVerification` negatives in `ah_guard.test.ts`; fix names/comments so baseline vs residual-proof is explicit. Do not weaken intentional external positives.

7. **R3 — gate.** `bun run lint && bun run test && bun run spur-check`. Dual-path agreement on the R3 payload list. Confirm `validate_response` still exits `0|1` and was not folded into Stop.

8. **Record.** Paste dual-path results and gate output into Testing when the pipeline records results.

### Solution
R1 — single Stop-orchestration owner; R2 — residual-proof negative-fixture standard + audit; R3 — gate green. No docs edits needed (the three doc surfaces already describe one engine + two I/O adapters, not two independent Stop implementations).

| File:Lines | What / Why |
|---|---|
| `plugins/cc/scripts/anti-hallucination/ah_guard.ts:397-432` | **R1 core.** Added exported `StopGuardResult` interface + `runStopGuard(argumentsEnv, stdinText)` — the single owner of the Stop branch table (resolveStopContext → allow on loop guard/unreadable → allow on no content → verifyAntiHallucinationProtocol → allow/block). Both adapters now call this; the branch table is no longer duplicated. |
| `plugins/cc/scripts/anti-hallucination/ah_guard.ts:441-445` | **R1 adapter.** Rewrote `main(stdinText?)` as a thin CLI adapter: `runStopGuard(Bun.env.ARGUMENTS, stdinText)` → `logger.log(output)` + `logger.error(stderr)` on block → return `exitCode`. No branch logic remains in `main`. `import.meta.main` block unchanged (still calls `main`). |
| `apps/cli/src/commands/hook-run.ts:6` | **R1 import.** Replaced the multi-symbol deep-import with `import { runStopGuard }` (ADR-022 seam kept); `buildStopOutput`/`resolveStopContext`/`verifyAntiHallucinationProtocol` no longer referenced here, removed to satisfy no-unused-imports. |
| `apps/cli/src/commands/hook-run.ts:130-145` | **R1 adapter.** Rewrote `ccAntiHallucination.run` as a thin HookRunner adapter: `runStopGuard(env.ARGUMENTS, stdinText)` → map `{ output, exitCode, stderr }` to `HookRunResult`. Branch table removed; comment points at `runStopGuard` as the single owner. |
| `AGENTS.md:111-113` | **R2 standard.** Added 3 bullets under `## Testing`: residual-proof negative-fixture rule (a negative must carry every trigger half it claims to neutralize), worked example (coupler-free `"Added a helper function"` baseline vs `"The function returns early…"` residual-proof for the keyword∧coupler gate), and honest-labeling requirement (baseline vs residual-proof by name/comment). |
| `docs/99_PROJECT_CONSTITUTION.md:420` | **R2 lesson pointer.** Appended one-line lesson under §8 `Lessons for AGENTS.md` pointing at the new testing standard (non-redundant — points, doesn't restate). |
| `plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts:182-201` | **R2 audit.** Renamed/labeled the two `requiresExternalVerification` negatives: coupler-free case now `baseline: passes ordinary implementation talk that uses bare vocabulary with no coupler` (BASELINE comment); coupler-carrying local-code case now `residual-proof: passes local-code talk that carries a capability coupler (keyword + coupler, still false)` (RESIDUAL-PROOF comment). Both still assert `false`; intentional external positives (`api`/`library`/`endpoint` + coupler → `true`) untouched. |

**Out of scope confirmed unchanged:** `validate_response.main()` stays a separate exit-`0|1` CLI delegating only to `verifyAntiHallucinationProtocol`. `WEAK_KEYWORD_PATTERN` / `CLAIM_COUPLER_PATTERN` vocabulary untouched (audit found no false residual). ADR-022 deep-import seam untouched. No new `spur rule` (deferred per task).

**R3 gate results:**
- `bun run lint` — clean (Biome 170 files + typecheck for both workspaces), no new `biome-ignore` suppressions.
- `bun run test` — 1444 pass / 0 fail / 3608 expect() calls; no `.skip`'d or commented-out tests. `ah_guard.ts` function coverage 95.59% (≥90% gate).
- `bun run spur-check` — pre-check 28 rules passed (no violations); post-check 3 rules passed (coverage-gate + skill-citations-resolve + tsdoc-export, the last confirming the new `runStopGuard`/`StopGuardResult` exports carry TSDoc).
- Dual-path agreement: all 8 R3 payloads (internal, local+coupler, uncited external, cited external, metrics, stop_hook_active, empty, invalid) — `main()` exit === `runStopGuard` exit; `ccAntiHallucination.run` passes the code through verbatim, so all three surfaces agree.
### Testing

**Re-verification (standalone `/sp:dev-verify --force --auto --focus all --fix all`)** — 2026-07-16, fresh evidence this turn (not inherited from prior PASS prose).

**Per-requirement traceability**

| Req | Status | Evidence |
|-----|--------|----------|
| R1 — single Stop-orchestration owner (`runStopGuard`); thin `main` + `ccAntiHallucination` adapters; `validate_response` stays exit 0\|1 | **MET** | static-ref + test + command: `ah_guard.ts:416-429` owns branch table; `main` `ah_guard.ts:441-445` only logs/returns; `hook-run.ts:140-145` only maps `StopGuardResult`→`HookRunResult`; `validate_response.ts:51-57` still `return result.ok ? 0 : 1`. Grep: adapters do not call `resolveStopContext` / `verifyAntiHallucinationProtocol` / `buildStopOutput` in executable code. `bun test` ah_guard + validate_response + hook-run → **103 pass / 0 fail**. |
| R2 — residual-proof negative-fixture rule in AGENTS.md + fixture audit | **MET** | static-ref: `AGENTS.md:111-113` (rule + worked example + honest labeling); constitution pointer `docs/99_PROJECT_CONSTITUTION.md:420`; fixtures `ah_guard.test.ts:182-201` named `baseline:` / `residual-proof:` with BASELINE/RESIDUAL-PROOF comments; external positives `ah_guard.test.ts:204-214` still `true`. |
| R3 — regression / dual-path / full gate | **MET** | command: dual-path script 8/8 OK (`main` === `runStopGuard` for internal, local+coupler, uncited→2, cited, metrics, stop_hook_active, empty, invalid). E2E `bun apps/cli/src/index.ts hook run cc anti-hallucination`: allow exit 0 bare Stop JSON; block exit 2 + decision block; stop_hook_active exit 0. `bun run lint` clean (170 files + typecheck both workspaces). Focused suite 103 pass / 0 fail; `ah_guard.ts` 100% funcs / 95.59% lines. No `.skip`/`xfail` in scope. |

**Acceptance Criteria Verification**

| AC | Status | Evidence Type | Evidence |
|----|--------|---------------|----------|
| R1 — single Stop owner, both adapters thin | MET | static-ref | `runStopGuard` only branch owner (`ah_guard.ts:416-429`); adapters `ah_guard.ts:441-445`, `hook-run.ts:140-145`; validate separate `validate_response.ts:51-57` |
| R1 — production Stop contract unchanged | MET | test + command | `hook-run.test.ts` describe cc/anti-hallucination (allow/block/fail-open/omp/transcript/stop_hook_active/unreadable) green within 103-pass run; live hook run allow exit 0 / block exit 2 |
| R1 — dual-path agreement | MET | command | `/tmp/0085-dual-path-verify.ts` → ALL DUAL-PATH OK (8/8) |
| R2 — testing standard documents residual-proof negatives | MET | static-ref | `AGENTS.md:111-113` |
| R2 — fixture audit honesty | MET | static-ref + test | `ah_guard.test.ts:182-214` labels + asserts; suite green |
| R3 — full gate green | MET | command | `bun run lint` exit 0; focused tests 103 pass; no skips; validate still 0\|1 |

**Design conformance**

| Claim | Status | Evidence |
|-------|--------|----------|
| Extract `StopGuardResult` + `runStopGuard` as designed | DONE | `ah_guard.ts:398-429` matches Design code shape |
| Thin adapters keep both surfaces | DONE | `main` + `ccAntiHallucination` only translate I/O |
| `validate_response` unchanged / out of scope | DONE | exit 0\|1 only; no Stop envelope |
| R2 lives in AGENTS.md (+ optional constitution pointer); no spur rule | DONE | AGENTS.md + constitution lesson; no new `.spur/rules` for negatives |
| R3 uses existing suites + dual-path (no e2e.sh) | DONE | dual-path script + hook-run tests |

**Coverage:** runtime path exercised; `ah_guard.ts` 95.59% lines / 100% funcs (import.meta.main TTY block uncovered by design).

**SECUA (focus=all, this pass)** — no blocker/major findings.

| Dim | Finding | Severity |
|-----|---------|----------|
| S | Payload parse remains fail-open; no new secret/injection surface | — |
| E | Single orchestration owner; no redundant branch evaluation | — |
| C | Dual-path 8/8 + hook E2E allow/block/stop_hook_active match contract | — |
| U | TSDoc on `runStopGuard`/`StopGuardResult`; adapters clearly documented | — |
| A | Branch table at correct depth; ADR-022 deep-import preserved (`hook-run` → plugin scripts) | — |

**Fix pass (`--fix all`):** not required — zero UNMET/PARTIAL requirements, zero major findings.

### Review

**Verdict: PASS** — all three requirements (R1–R3) verified with evidence; all gates green.

|Priority|Finding|Status|Evidence|
|---|---|---|---|
|P1|R1 — single Stop-orchestration owner. `runStopGuard` is the only function that branches on `allowReason` / missing content / protocol result for the Stop path. Both adapters are thin I/O translators with zero branch logic.|DONE|`plugins/cc/scripts/anti-hallucination/ah_guard.ts:416-429` (`runStopGuard` body); `ah_guard.ts:441-446` (`main` — calls `runStopGuard`, only `logger.log`/`logger.error`/return); `apps/cli/src/commands/hook-run.ts:140-145` (`ccAntiHallucination.run` — calls `runStopGuard`, only maps to `HookRunResult`). Grep confirms `allowReason` appears only in `resolveStopContext` (engine) + `runStopGuard`; no branch symbols (`verifyAntiHallucinationProtocol`/`resolveStopContext`/`buildStopOutput`) in executable adapter code, only in comments.|
|P1|R1 — `validate_response.main()` remains a separate exit-`0|1` CLI, unchanged, delegating only to `verifyAntiHallucinationProtocol`. Not folded into the Stop path.|DONE|`plugins/cc/scripts/anti-hallucination/validate_response.ts:51-58` (`return result.ok ? 0 : 1`); `validate_response.ts:16,32` (imports + calls `verifyAntiHallucinationProtocol` only). `validate_response.test.ts` 10/10 pass.|
|P1|R1 — production Stop contract unchanged. The `describe('hook run — cc/anti-hallucination …')` suite stays green (allow short message, block uncited external, fail-open empty/invalid, omp stdin, transcript_path, stop_hook_active, unreadable transcript).|DONE|`bun test apps/cli/tests/commands/hook-run.test.ts` → 24 pass / 0 fail / 81 expect() calls. Tests at `apps/cli/tests/commands/hook-run.test.ts:167-286` cover all listed payloads.|
|P1|R1 — dual-path agreement. For all 8 R3 payloads, `main()` exit code === `runStopGuard` exit code === expected code (0 or 2).|DONE|`/tmp/0085-dual-path.ts` — 8/8 OK: short/internal=0, local+coupler=0, uncited external=2, cited external=0, metrics=0, stop_hook_active=0, empty=0, invalid=0. Agreement is by construction: `main` delegates to `runStopGuard` without re-branching; `ccAntiHallucination.run` passes the code through verbatim.|
|P2|R2 — testing standard documents residual-proof negatives. `AGENTS.md` `## Testing` carries 3 bullets: the rule (negative must carry every trigger half), the worked example (coupler-free `"Added a helper function"` baseline vs `"The function returns early…"` residual-proof), and honest-labeling requirement.|DONE|`AGENTS.md:111-113`. Constitution lesson pointer (non-redundant, points to AGENTS.md) at `docs/99_PROJECT_CONSTITUTION.md:420`.|
|P2|R2 — fixture audit honesty. `requiresExternalVerification` negatives are distinguishable by name + comment: baseline (coupler-free, `BASELINE` comment) vs residual-proof (compound-carrying, `RESIDUAL-PROOF` comment). Residual-proof cases assert `false`; intentional external weak+coupler positives (`api`/`library`/`endpoint`) assert `true`. No vocabulary surgery (audit found no false residual).|DONE|`plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts:182-201` (baseline + residual-proof negatives); `ah_guard.test.ts:204-214` (intentional external positives → `true`). `ah_guard.test.ts` 69/69 pass.|
|P3|R3 — full gate green: `bun run lint` (Biome 170 files + typecheck both workspaces) clean, no new `biome-ignore` suppressions introduced by this task.|DONE|`bun run lint` → "Checked 170 files in 77ms. No fixes applied." + both workspaces typecheck exit 0. Pre-existing `biome-ignore` in `hook-run.test.ts:23,28` are the stdout/stderr capture shims (unchanged by this task).|
|P3|R3 — full gate green: `bun run test` — 1444 pass / 0 fail / 3608 expect() calls; no `.skip`/`xfail`/`todo`/commented-out tests. `ah_guard.ts` coverage 95.59% (≥90% gate).|DONE|`bun run test` → "1444 pass / 0 fail". Skip-scan (grep for `\.skip|xfail|todo\(|skip\(`) returned empty. Coverage table shows `ah_guard.ts` 95.59% lines.|
|P3|R3 — full gate green: `bun run spur-check` — pre-check 28 rules passed (no violations); post-check 3 rules passed (coverage-gate + skill-citations-resolve + tsdoc-export, the last confirming `runStopGuard`/`StopGuardResult` exports carry TSDoc).|DONE|`bun run spur-check` → "All 28 rules passed" (pre-check) + "All 3 rules passed" (post-check). `every-export-has-tsdoc` rule confirms TSDoc on the new exports.|
|P3|R3 — `validate_response` exit contract still `0|1`, unchanged by this task.|DONE|`validate_response.ts:57` (`return result.ok ? 0 : 1`). Not part of the Stop consolidation; exit `2` never appears in `validate_response.ts`.|

**Summary:** R1 (single Stop owner + thin adapters + dual-path agreement), R2 (residual-proof negative-fixture standard + fixture audit), and R3 (full gate green) are all satisfied. No blocking findings. The implementation matches the Design section's recommended `runStopGuard` shape verbatim. Both documented entry surfaces (`main` direct CLI, `ccAntiHallucination` production hook) are preserved as thin adapters per the task's explicit "keep both adapters" guidance; `validate_response` remains a distinct exit-`0|1` CLI.

### History

- 2026-07-16T00:42:42.302Z backlog → todo (system)
- 2026-07-16T00:47:22.181Z todo → wip (system)
- 2026-07-16T01:01:08.794Z wip → testing (system)
- 2026-07-16T01:09:58.559Z testing → done (system)
