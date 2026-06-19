---
name: Migrate anti-hallucination skill from Spur and re-develop its launchers as a spur workflow + spur agent solution
description: Migrate anti-hallucination skill from Spur and re-develop its launchers as a spur workflow + spur agent solution
status: Testing
created_at: 2026-06-18T06:47:35.813Z
updated_at: 2026-06-19T22:36:42.869Z
folder: docs/tasks
type: task
feature-id: ""
priority: high
tags: ["migration","anti-hallucination","workflow","dogfood","cross-repo"]
impl_progress:
  planning: complete
  design: complete
  implementation: complete
  review: complete
  testing: complete
---

## 0041. Migrate anti-hallucination skill from Spur and re-develop its launchers as a spur workflow + spur agent solution

### Background

## Background

`anti-hallucination` is an agent skill that enforces a **zero-trust, verification-before-generation
protocol** on LLM answers: factual claims about APIs/libraries/versions must carry source
citations, an explicit confidence level (HIGH/MEDIUM/LOW), and evidence of verification-tool usage;
hedging without evidence is blocked. It currently lives in the **Spur** repo at
`plugins/sp/skills/anti-hallucination/` and ships nine `.ts` scripts inside the skill folder.

### Why it is moving to superskill

The protocol governs **how any agent should respond** — it is epistemic discipline, not a
software-development workflow. That is squarely superskill's charter (the home for agentic assets:
skills, commands, subagents, hooks). Keeping it in Spur only made sense while `cc-agents` was the
single source repo. With the split, it is misfiled in Spur (a dev-workflow harness) and belongs in
superskill. Decided 2026-06-17 with the operator.

### Current shape in Spur (what migrates)

Engine + adapters, dependency graph:

```
ah_guard.ts            (engine: pure pattern-based response verifier; ~296 LOC, zero deps)
   ▲  verifyAntiHallucinationProtocol(text) -> { ok, reason, issues[] }
   │
validate_response.ts   (thin wrapper: empty-text guard + stdin/$RESPONSE_TEXT reader)
   ▲  validateResponseText()
   ├──────────────────────────────┐
run_with_validation.ts      acpx_agent_wrapper.ts   (spawn `acpx --format quiet <agent> exec`)
(generic: spawn ANY cmd,         ▲ runFixedAgentMain(config)
 validate stdout/stderr)         │
                  run_codex_… run_openclaw_… run_opencode_… run_pi_…  (4 × ~17 LOC configs)
logger.ts              (duplicated; a copy also exists in daily-summary — the cc-agents anti-pattern)
```

- **Engine:** `ah_guard.ts` (pure), `validate_response.ts`, `logger.ts`.
- **Cross-agent launchers (~390 LOC of glue):** `run_with_validation.ts`, `acpx_agent_wrapper.ts`,
  and the 4 per-agent `run_*_with_validation.ts` variants (identical but a 3-field config object).
- **Claude Code Stop-hook:** `ah_guard.ts main()` reads a Stop-hook context from `$ARGUMENTS`,
  verifies the last assistant message, exits 0 (allow stop) / 1 (deny stop).
- **Prose:** `SKILL.md` (v3.0.0) + 5 `references/*.md` + `agents/openai.yaml` + `metadata.openclaw`.
- **Tests:** 5 files (`ah_guard`, `validate_response`, `run_with_validation`, `acpx_agent_wrapper`,
  `fixed_wrappers`) — 95%+ coverage.

### Two governing decisions from the design discussion

1. **Re-develop the cross-agent launchers as a `spur workflow` + `spur agent` solution.** The 6
   launcher scripts are a micro-workflow (run agent → capture answer → validate → pass/deny/retry).
   Spur's workflow engine already ships `agent.run` and `rule.check` actions; this collapses the 6
   per-agent variants into ONE workflow YAML parameterized by an agent var, deleting the boilerplate
   and the hand-rolled `acpx` reimplementation. This is also a deliberate dogfooding exercise for the
   `@gobing-ai/ts-dual-workflow-engine` (and its ts-libs upstream): if the requirement pushes the
   engine, we push the engine.

2. **Scripts placement:** executable logic a skill invokes at the user's install site lives in a
   **plugin-level `plugins/<plugin>/scripts/`** (shared across the plugin's skills, copied on
   install, deduped — NOT per-skill `scripts/`, which reintroduces the `cc-agents` duplication; NOT
   `packages/*`, which is not part of the plugin install payload). The guard engine is **single-
   sourced in superskill** and consumed by Spur (the Spur-side task tracks that dependency).


### Requirements

## Requirements

### R1 — Relocate the skill into superskill, prose-only
- **R1.1** `plugins/cc/skills/anti-hallucination/` holds ONLY prose: `SKILL.md`, `references/*.md`,
  `agents/openai.yaml`, `metadata.openclaw`. **No `.ts` runtime under the skill folder.**
- **R1.2** All 5 `references/*.md` and the `SKILL.md` body migrate intact; update every path that
  points at `scripts/…` to the new homes (see R2/R3).
- **R1.3** Remove the skill (and its scripts/tests) from Spur in the **same change set** — `git mv`
  semantics across repos; Spur's `plugins/sp/skills/anti-hallucination/` ceases to exist.

### R2 — Guard engine becomes shared, single-sourced executable logic
- **R2.1** `ah_guard.ts` (pure `verifyAntiHallucinationProtocol`), `validate_response.ts`, and a
  SINGLE shared `logger.ts` move to **`plugins/cc/scripts/anti-hallucination/`** (plugin-level
  shared scripts dir, copied on install). De-duplicate `logger.ts` (one copy, not per-skill).
- **R2.2** The engine stays pure and dependency-free so it is importable by (a) the Claude Stop-hook
  and (b) the Spur workflow validate step, without dragging platform code.
- **R2.3** The 5 test files move with the engine and keep running in superskill's gate
  (`bun run test`, ≥90% line/function aggregate per `bunfig.toml`). No test skipped to go green.

### R3 — Claude Code Stop-hook re-homed (still an install-copied hook, not a skill script)
- **R3.1** The Stop-hook entry (`ah_guard.ts main()` reading `$ARGUMENTS`) ships under
  `plugins/cc/hooks/` (or the plugin's hook config), importing the engine from
  `plugins/cc/scripts/anti-hallucination/`. The hook stays a thin adapter; the rules live in the
  engine.
- **R3.2** Hook wiring registered in the `cc` plugin so it fires on install for Claude Code users.

### R4 — Cross-agent enforcement re-developed as `spur workflow` + `spur agent`
- **R4.1** Delete all 6 launcher scripts (`run_with_validation.ts`, `acpx_agent_wrapper.ts`, 4 ×
  `run_*_with_validation.ts`). Their behavior is replaced by a Spur workflow.
- **R4.2** Author an `anti-hallucination` workflow YAML (transition-flow) that: runs the target agent
  via `agent.run` (agent-agnostic, `--agent <var>`), validates the captured answer via a
  `response.validate` step (engine from R2), and branches: ok → return; fail → retry or deny.
- **R4.3** The workflow is parameterized by an agent variable so ONE flow covers
  codex/openclaw/opencode/pi (and any future agent `spur agent` supports) — no per-agent files.
- **R4.4** `SKILL.md` "Platforms Without Hooks" section rewrites the wrapper guidance to point at
  `spur workflow run anti-hallucination.yaml --vars '{"agent":"codex"}'` instead of `scripts/…`.
- **R4.5** Any Spur-side capability this needs (capturing the agent answer text out of `agent.run`,
  a `response.validate` action, or an engine push into `ts-dual-workflow-engine`/ts-libs) is tracked
  in the **Spur-side companion task** (see Dependencies). This task consumes those outputs; it does
  not implement them.

### R5 — Single-source ownership; Spur consumes
- **R5.1** superskill OWNS the guard engine. If Spur (or its workflow) needs the engine, it imports
  the superskill-published artifact at a pinned version — the guard logic is NOT duplicated into the
  `sp` plugin.
- **R5.2** Establish/confirm the consumption seam (published `@scope` package or equivalent) so both
  the superskill hook and the Spur workflow reference one source of truth.

### R6 — Docs & governance
- **R6.1** superskill `docs/00_ADR.md`: add a dated ADR entry — "anti-hallucination migrated from
  Spur; guard engine single-sourced here; skill folders are prose-only; install-time executable
  logic lives in `plugins/<plugin>/scripts/`."
- **R6.2** superskill `docs/04_DESIGN.md` / `05_FEATURES.md`: record the skill + hook + scripts-dir
  surface in the same change set.
- **R6.3** Spur side: a superseding note that anti-hallucination left Spur (handled in the Spur-side
  task's doc updates).

### Acceptance gate
- superskill `bun run lint` + `bun run test` + `bun run build` green; no skipped tests.
- No `.ts` under any `plugins/cc/skills/*/`.
- `logger.ts` exists once (no per-skill copies).
- The `anti-hallucination` workflow reaches its terminal state in a dry-run for at least one agent.


### Q&A



### Design

**Scope: Phases 1–2 + partial Phase 5 (governance for landed work). Phases 3–4 blocked.**

### Phase 4 blocker (data-threading gap)

Spur companion task 0087 is `Done` and delivered both primitives:
- `AgentService.runCapture()` → `{ exitCode, answer }`; `agent.run` action surfaces `data.answer` when `capture: true`.
- `response.validate` action exists (`packages/app/src/workflow/actions/response-validate.ts`), DI-registered in `builtins.ts`, 9 unit tests passing.

**Gap:** the engine's `resolveTemplateString` (ts-libs `variables.ts:52-72`) only resolves `${vars.*}`/`${env.*}`/`${builtins}` — NOT `{{ steps.* }}` Mustache. `agent.run` capture sets `data.answer` (readable by the next GUARD via `lastActionResult`) but only sets `__agentSession` in `setVars` — so the answer never reaches the next ACTION's template context. The spike fixture `anti-hallucination-spike.yaml` uses `text: "{{ steps.generate.answer }}"` which resolves as a literal string. No executable test runs the spike to terminal (only schema validation).

**Three unblock options (all Spur-side or engine-side, NOT superskill):**
- (a) `agent.run` capture path also `setVars` the answer → validate reads `${vars.answer}` (smallest)
- (b) engine extension for `steps.*` templating or expose `lastActionResult` to actions
- (c) restructure validate as a guard (guards CAN see `lastActionResult.data.answer`)

Per R4.5, superskill consumes Spur outputs; it does not implement them. Phase 4 stays blocked until the Spur side closes this gap. Phases 1–2 land independently (task Risk Notes confirm).

### Phase 3 (delete from Spur) sequencing

Phase 3 deletes `plugins/sp/skills/anti-hallucination/` from Spur. This is safe ONLY after Phase 4 delivers the workflow replacement. Deleting before Phase 4 creates a window with no cross-agent enforcement. Treated as blocked by Phase 4.

### Target layout (Phases 1–2)

```
plugins/cc/
  skills/anti-hallucination/        # PROSE ONLY (R1.1)
    SKILL.md                         # v3.0.0, paths updated to scripts/
    references/*.md                  # 5 files, paths updated
    agents/openai.yaml
    metadata.openclaw
  scripts/anti-hallucination/        # ENGINE (R2.1) — plugin-level shared scripts
    ah_guard.ts                      # pure engine + main() Stop-hook entry
    validate_response.ts             # thin wrapper
    logger.ts                        # single shared copy (dedup'd)
    tests/                           # 5 test files (R2.3), imports fixed to ../
      ah_guard.test.ts
      validate_response.test.ts
      logger.test.ts (if exists)
  hooks/
    hooks.json                       # Stop-hook registration (R3.1/R3.2)
```

**No `.ts` under `skills/anti-hallucination/`** (R1.1). Engine is single-sourced in `scripts/anti-hallucination/` (R2.1, R5.1).

### Stop-hook wiring (R3)

`plugins/cc/hooks/hooks.json` registers a `Stop` command hook pointing at the engine (Claude Code
nested matcher-group format; `timeout` is in seconds):
```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "bun ${CLAUDE_PLUGIN_ROOT}/scripts/anti-hallucination/ah_guard.ts",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```
`ah_guard.ts main()` already reads `$ARGUMENTS` and exits 0/1. No separate hook-entry file needed — `main()` is already a thin adapter (R3.1 "or the plugin's hook config" branch). `${CLAUDE_PLUGIN_ROOT}` resolves to `plugins/cc/` at install time.

### Test config alignment

`bunfig.toml` line 17 ignores `plugins/cc/skills/**/scripts` and `plugins/cc/skills/**/tests` from coverage. The engine moves to `plugins/cc/scripts/anti-hallucination/` (plugin-level, NOT under `skills/`), so its tests ARE counted in the gate — satisfying R2.3. The engine is pure and well-tested (95%+ in Spur); aggregate 90/90 threshold holds.

### Launcher scripts (Phase 4 — NOT migrated)

The 6 launcher scripts (`run_with_validation.ts`, `acpx_agent_wrapper.ts`, 4× `run_*_with_validation.ts`) and their 3 test files are NOT migrated in Phases 1–2. They are deleted in Phase 4 when the workflow replaces them. Migrating them now would create dead code that's immediately deleted.

### Single-source seam (Phase 5 — deferred)

R5.2 "establish/confirm the consumption seam" depends on Phase 4. The engine is single-sourced in superskill now; the Spur-side import path is established when Phase 4 unblocks.


### Solution

## Solution

Phased migration. Phases 1–3 are pure relocation/dedup (low risk, no behavior change); Phase 4 is
the re-development onto `spur workflow` + `spur agent` and depends on the Spur-side companion task.

### Phase 1 — Land the engine + prose in superskill (no behavior change)
1. Create `plugins/cc/skills/anti-hallucination/` with `SKILL.md` + `references/*.md` +
   `agents/openai.yaml` + `metadata.openclaw` (prose only).
2. Create `plugins/cc/scripts/anti-hallucination/` with `ah_guard.ts`, `validate_response.ts`, and a
   single shared `logger.ts`. Move the 5 test files; fix imports to the new relative paths.
3. Gate: `bun run lint && bun run test` green in superskill.

### Phase 2 — Re-home the Claude Stop-hook
4. Move the hook entry to `plugins/cc/hooks/` (thin `main()` importing the engine from
   `../scripts/anti-hallucination/ah_guard`). Register it in the `cc` plugin hook config.
5. Smoke: feed a sample `$ARGUMENTS` payload → exit 0/1 verdict matches pre-migration behavior.

### Phase 3 — De-duplicate + delete from Spur
6. Confirm `logger.ts` exists once (this engine + daily-summary's copy reconciled per that skill's
   own migration). Delete `plugins/sp/skills/anti-hallucination/` (skill + scripts + tests) from Spur.
7. Spur-side doc supersede handled in the companion task.

### Phase 4 — Re-develop cross-agent enforcement as `spur workflow` + `spur agent`
8. **Gated on the Spur-side task** delivering: (a) `agent.run` (or `AgentService.run`) surfacing the
   agent's answer text in `ActionResult.data`, and (b) a `response.validate` workflow action that
   runs the guard engine over that text. Push `ts-dual-workflow-engine`/ts-libs if needed.
9. Author `anti-hallucination.yaml` (transition-flow):
   `generate` →(agent.run, --agent {{agent}})→ `validate` →(response.validate)→
   ok→`done` · fail→`generate` (bounded retry) → exhausted→`denied`.
10. Delete the 6 launcher scripts. Rewrite `SKILL.md` "Platforms Without Hooks" to invoke the
    workflow: `spur workflow run anti-hallucination.yaml --vars '{"agent":"codex"}'`.
11. Dry-run the workflow to terminal for ≥1 agent; add an action unit test + workflow dry-run test.

### Phase 5 — Single-source seam + governance
12. Confirm the engine is consumed by both the superskill hook and the Spur workflow from ONE source
    (published `@scope` package or the agreed seam). No duplicated guard logic in `sp`.
13. ADR + `04_DESIGN.md`/`05_FEATURES.md` updates (R6) in the same change set.

### Risk notes
- **Answer-capture is the crux.** `AgentService.run` today returns an exit code and writes straight
  to output; threading the answer text into the next workflow step is the one non-trivial Spur
  change (tracked Spur-side). Phases 1–3 do NOT depend on it and can land independently.
- **Stop-hook is not a workflow.** It must stay a synchronous hook (can't spin a workflow run inside
  a Stop gate). Hence the engine is shared by both the hook and the workflow — single source, two
  adapters.
- **Cross-repo cadence:** Phase 4 waits on the Spur-side task; Phases 1–3 unblock immediately.


### Plan

### Executable now (Phases 1–2 + partial 5)

1. **Phase 1 — Engine + prose relocation**
   - Create `plugins/cc/scripts/anti-hallucination/` with `ah_guard.ts`, `validate_response.ts`, `logger.ts` (verbatim from Spur, imports already relative `./`).
   - Create `plugins/cc/scripts/anti-hallucination/tests/` with the 3 engine test files (`ah_guard.test.ts`, `validate_response.test.ts`; `logger` has no dedicated test file — covered transitively). Fix imports: `../scripts/ah_guard` → `../ah_guard`, `../scripts/logger` → `../logger`.
   - Create `plugins/cc/skills/anti-hallucination/` with `SKILL.md`, `references/*.md` (5 files), `agents/openai.yaml`, `metadata.openclaw`. Update all `plugins/sp/skills/anti-hallucination/scripts/…` paths → `plugins/cc/scripts/anti-hallucination/…` (or `${CLAUDE_PLUGIN_ROOT}/scripts/anti-hallucination/…` for hook-facing paths).
   - Do NOT migrate `README.md` (references launcher scripts that aren't migrating yet).
   - Gate: `bun run lint && bun run test` green; engine tests counted in coverage.

2. **Phase 2 — Stop-hook re-home**
   - Update `plugins/cc/hooks/hooks.json`: register `stop` command hook → `bun ${CLAUDE_PLUGIN_ROOT}/scripts/anti-hallucination/ah_guard.ts`.
   - Smoke: `ARGUMENTS='{"messages":[{"role":"assistant","content":"Done"}]}' bun plugins/cc/scripts/anti-hallucination/ah_guard.ts` → exit 0. Non-compliant payload → exit 1.

3. **Phase 5 (partial) — Governance**
   - `docs/00_ADR.md`: add ADR-015 — anti-hallucination migrated from Spur; engine single-sourced in `plugins/cc/scripts/`; skill folders prose-only; install-time executable logic in `plugins/<plugin>/scripts/`.
   - `docs/04_DESIGN.md` / `docs/05_FEATURES.md`: record the skill + hook + scripts-dir surface for Phases 1–2. Mark Phase 3–4 as blocked.

4. **Verification gate**
   - `bun run lint` (biome + typecheck) clean.
   - `bun run test` green; no skipped tests; engine coverage counted.
   - `bun run build` succeeds.
   - `git status` shows only intentional changes.

### Blocked (documented, not executed)

5. **Phase 4 — Spur workflow re-development**: blocked on data-threading gap (see Design). Requires Spur-side fix: `agent.run` capture path must `setVars` the answer, OR engine supports `steps.*` templating, OR validate restructured as guard. Spur task 0087 acceptance claim ("spike reaches terminal") is unverified by executable test.

6. **Phase 3 — Delete from Spur**: blocked by Phase 4. Deleting before the workflow replacement exists creates an enforcement gap.

7. **Phase 5 (full) — Single-source seam**: blocked by Phase 4. Spur-side import path established when workflow unblocks.

### Decomposition decision

No subtask decomposition needed. Phases 1–2 are a single cohesive relocation; Phases 3–4 are blocked and tracked as deferred in the task file, not split into children.


### Review

**Verdict: PARTIAL** — Phases 1–2 complete and verified; Phases 3–4 blocked on Spur-side data-threading gap; Phase 5-full blocked by Phase 4.

### Requirements traceability

| Req | Status | Evidence |
|-----|--------|----------|
| R1.1 prose-only skill folder | ✅ PASS | `find plugins/cc/skills/anti-hallucination -name '*.ts'` → empty |
| R1.2 paths updated | ✅ PASS | All `plugins/sp/...` → `plugins/cc/...`; 5 references + SKILL.md updated |
| R1.3 remove from Spur | ⏸ BLOCKED | Phase 3 — depends on Phase 4 (enforcement gap) |
| R2.1 engine in plugin scripts/ | ✅ PASS | `plugins/cc/scripts/anti-hallucination/{ah_guard,validate_response,logger}.ts` |
| R2.2 engine pure, dep-free | ✅ PASS | Only import: `./logger`; no platform code |
| R2.3 tests in superskill gate | ✅ PASS | 724 pass, 0 fail; engine coverage counted (98.35% aggregate) |
| R3.1 Stop-hook re-homed | ✅ PASS | `plugins/cc/hooks/hooks.json` → `bun ${CLAUDE_PLUGIN_ROOT}/scripts/anti-hallucination/ah_guard.ts` |
| R3.2 hook registered in cc | ✅ PASS | `hooks.json` Stop event wired (nested matcher-group format) |
| R4 spur workflow | ⏸ BLOCKED | Phase 4 — Spur data-threading gap (ADR-015) |
| R5.1 single-source engine | ✅ PASS | Engine single-sourced in superskill `plugins/cc/scripts/` |
| R5.2 consumption seam | ⏸ BLOCKED | Phase 5-full — depends on Phase 4 |
| R6.1 ADR entry | ✅ PASS | ADR-015 added (`docs/00_ADR.md:190`) |
| R6.2 DESIGN/FEATURES | ✅ PASS | Both updated with surface + status |
| R6.3 Spur doc supersede | ⏸ BLOCKED | Companion task (Spur side) |

### SECU review

- **Security**: Stop-hook command uses `${CLAUDE_PLUGIN_ROOT}` (Claude runtime var, not user-controlled). Engine reads `$ARGUMENTS` (Claude hook payload), `JSON.parse` wrapped in try/catch. No `eval`, no exec/shell, no dynamic code execution. Regex-only pattern matching (red-flag patterns use `.match()`, safe with `g` flag). No issues.
- **Errors**: Engine fails open (exit 0) on empty/invalid context — correct for a Stop-hook (a crash must not block the user). Edge cases covered by tests + smoke run.
- **Correctness**: Engine verbatim from Spur (well-tested, 95%+); only import paths changed. Tests pass. Smoke test confirms exit 0/1 verdicts match pre-migration behavior.
- **Understanding**: `main()` is a thin adapter; engine functions pure and documented.

### Verification gate

- `bun run lint` (biome + typecheck): ✅ clean (117 files)
- `bun run test`: ✅ 724 pass, 0 fail, 99.55% funcs / 98.35% lines
- `bun run build`: ✅ bundled successfully
- Stop-hook smoke test: ✅ exit 0 (compliant/short/empty/invalid-JSON), exit 1 (non-compliant API claim)

### Blocker (Phase 4)

Spur companion task 0087 (Done) delivered `agent.run` capture + `response.validate`, but the engine's template resolver only supports `${vars.*}`/`${env.*}`/`${builtins}` — not `{{ steps.* }}` Mustache. The captured answer (`data.answer`) is unreachable by the validate action. No executable test runs the spike to terminal. Per R4.5, superskill consumes Spur outputs; it does not implement them. Three unblock options identified (see Design); all Spur-side or engine-side.

---

## Re-verification — 2026-06-19 (dev-verify --force --fix all)

Re-audit of a `Testing`-status task with uncommitted Phase 1–2 work on disk. `--force` bypassed the status guard. Phase 7 SECU + Phase 8 traceability re-run inline against on-disk state.

- **Phase 7 SECU** — clean. No eval/exec/shell (the two `${...}` hits in `ah_guard.ts` are message-building template literals, not commands), no `any`, no `biome-ignore`. Engine is pure + fail-open.
- **Phase 8 traceability** — all Phase-1/2/5-partial requirements MET against real artifacts; all BLOCKED requirements correctly attributed to the Spur data-threading gap (R4.5 scopes that out of this task). Layout verified: zero `.ts` under `skills/anti-hallucination/` (R1.1); engine + 2 tests under plugin-level `scripts/anti-hallucination/` (R2.1); `logger.ts` exists exactly once (dedup'd).
- **Gates** — lint clean (117 files); 724 pass / 0 fail; build succeeds; engine coverage 100% funcs (ah_guard/logger/validate_response). Smoke test: all 4 sampled verdicts (short→0, non-compliant→1, empty→0, invalid-JSON→0) match documented behavior.

**Findings (2, both P3 doc-accuracy — FIXED under `--fix all`):**
1. `logger.ts` JSDoc had stale provenance ("moved verbatim from rd3… run in the sp plugin") — corrected to "migrated verbatim from Spur (task 0041)… run in the cc plugin".
2. Design-section Stop-hook snippet used a flat `"stop"` shape with `"timeout": 10000` — corrected to the actual Claude Code nested matcher-group format with `"timeout": 10` (seconds). The shipped `hooks.json` was already correct; only the illustrative doc snippet drifted.

Both mechanical, no behavior change; gates re-confirmed green after.

**Re-verification verdict: PARTIAL** (unchanged — correct for the deliberate phase scoping). Two P3 doc findings fixed; no blocking findings on the landed work. **Phase 4 remains Spur-blocked.** Status stays `Testing` until the Spur gap closes and Phases 3–5 complete (do NOT transition to Done — the PARTIAL verdict and Phase-4 block are real).


### Requirements traceability

| Req | Status | Evidence |
|-----|--------|----------|
| R1.1 prose-only skill folder | ✅ PASS | `find plugins/cc/skills/anti-hallucination -name '*.ts'` → empty |
| R1.2 paths updated | ✅ PASS | All `plugins/sp/...` → `plugins/cc/...`; 5 references + SKILL.md updated |
| R1.3 remove from Spur | ⏸ BLOCKED | Phase 3 — depends on Phase 4 (enforcement gap) |
| R2.1 engine in plugin scripts/ | ✅ PASS | `plugins/cc/scripts/anti-hallucination/{ah_guard,validate_response,logger}.ts` |
| R2.2 engine pure, dep-free | ✅ PASS | Only import: `./logger`; no platform code |
| R2.3 tests in superskill gate | ✅ PASS | 724 pass, 0 fail; engine coverage counted (98.35% aggregate) |
| R3.1 Stop-hook re-homed | ✅ PASS | `plugins/cc/hooks/hooks.json` → `bun ${CLAUDE_PLUGIN_ROOT}/scripts/anti-hallucination/ah_guard.ts` |
| R3.2 hook registered in cc | ✅ PASS | `hooks.json` Stop event wired |
| R4 spur workflow | ⏸ BLOCKED | Phase 4 — Spur data-threading gap (ADR-015) |
| R5.1 single-source engine | ✅ PASS | Engine single-sourced in superskill `plugins/cc/scripts/` |
| R5.2 consumption seam | ⏸ BLOCKED | Phase 5-full — depends on Phase 4 |
| R6.1 ADR entry | ✅ PASS | ADR-015 added |
| R6.2 DESIGN/FEATURES | ✅ PASS | Both updated with surface + status |
| R6.3 Spur doc supersede | ⏸ BLOCKED | Companion task (Spur side) |

### SECU review

- **Security**: Stop-hook command uses `${CLAUDE_PLUGIN_ROOT}` (Claude runtime var, not user-controlled). Engine reads `$ARGUMENTS` (Claude hook payload). No `eval`, no dynamic code execution, no shell interpolation. Regex-only pattern matching. No issues.
- **Errors**: Engine fails open (exit 0) on empty/invalid context — correct for a Stop-hook (crash shouldn't block). Edge cases covered by tests.
- **Correctness**: Engine is verbatim from Spur (well-tested, 95%+); only import paths changed. Tests pass. No behavior change.
- **Understanding**: Code well-commented; `main()` is thin adapter; engine functions are pure and documented.

### Verification gate

- `bun run lint` (biome + typecheck): ✅ clean
- `bun run test`: ✅ 724 pass, 0 fail, 99.55% funcs / 98.35% lines
- `bun run build`: ✅ bundled successfully
- Stop-hook smoke test: ✅ exit 0 (compliant/short), exit 1 (non-compliant API claim)
- `git status`: only intentional changes

### Blocker (Phase 4)

Spur companion task 0087 (Done) delivered `agent.run` capture + `response.validate`, but the engine's template resolver only supports `${vars.*}`/`${env.*}`/`${builtins}` — not `{{ steps.* }}` Mustache. The captured answer (`data.answer`) is unreachable by the validate action (actions only see `vars`; `agent.run` only sets `__agentSession` in setVars, not the answer). No executable test runs the spike to terminal. Three unblock options identified (see Design section); all require Spur-side or engine-side work.

---

**Re-verification — 2026-06-19 16:10 PDT (`rd3-dev-verify 0041 --auto --fix all --force`): PARTIAL.**
No new findings. Forced re-audit confirmed the prior result against the current clean workspace:
Phase 1–2/partial-5 artifacts remain correct, Phase 4 remains blocked on the Spur data-threading
gap, and no fix pass was needed. Gates re-run clean: `bun run lint` (117 files + typecheck),
`bun run test` (724 pass, 0 fail, 99.55% funcs / 98.35% lines), `bun run build` (758 modules),
and Stop-hook smoke checks (no context → 0, non-compliant API claim → 1, compliant cited claim → 0).
`git status` was clean before recording this verification note.


### Testing

**Test run: 2026-06-19**

### Engine tests (migrated from Spur)

| File | Tests | Status |
|------|-------|--------|
| `plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts` | 30+ (extract, patterns, verify, main) | ✅ pass |
| `plugins/cc/scripts/anti-hallucination/tests/validate_response.test.ts` | 8 (validate, stdin, main) | ✅ pass |

Import paths fixed: `../scripts/ah_guard` → `../ah_guard`, `../scripts/logger` → `../logger`, `../scripts/validate_response` → `../validate_response`.

### Coverage (aggregate)

| Metric | Threshold | Actual |
|--------|-----------|--------|
| Functions | 90% | 99.55% |
| Lines | 90% | 98.35% |

Engine-specific: `ah_guard.ts` 100% funcs / 98.79% lines; `logger.ts` 100/100; `validate_response.ts` 100% funcs / 95.24% lines.

### Stop-hook smoke test

| Payload | Expected | Actual |
|---------|----------|--------|
| Short message (`"Done"`) | exit 0 | exit 0 ✅ |
| Non-compliant API claim (no citation, "I think") | exit 1 | exit 1 ✅ |
| Compliant API claim (citation + confidence + tool) | exit 0 | exit 0 ✅ |
| Empty context (`{}`) | exit 0 | exit 0 ✅ |
| Invalid JSON | exit 0 (fail-open) | exit 0 ✅ |

### Full gate

- `bun run lint`: ✅ biome check + typecheck clean
- `bun run test`: ✅ 724 pass, 0 fail, 0 skipped
- `bun run build`: ✅ bundled 758 modules

### Not tested (blocked)

- Spur workflow dry-run (Phase 4 blocked — no workflow YAML authored yet)
- Cross-agent launcher behavior (launchers not migrated; replaced by workflow in Phase 4)


### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References


## Completion Blockers

Post-flight gate failed at 2026-06-19T22:35. Task not transitioned to `Done`.

- **Check:** verification-verdict-pass
  - **Reason:** Review verdict is PARTIAL, not PASS
  - **Evidence:** Phases 3–4 blocked on Spur-side data-threading gap (ADR-015). Phases 1–2 complete and verified.
  - **Remediation:** Unblock Phase 4 by closing the Spur data-threading gap (agent.run capture must setVars the answer, OR engine supports steps.* templating, OR validate restructured as guard). Then complete Phases 3–5 and re-verify.

- **Check:** code-changes-exist
  - **Reason:** git diff is empty — changes are uncommitted/untracked
  - **Evidence:** `git status` shows ` M docs/00_ADR.md`, ` M docs/04_DESIGN.md`, ` M docs/05_FEATURES.md`, ` M plugins/cc/hooks/hooks.json`, `?? plugins/cc/scripts/`, `?? plugins/cc/skills/anti-hallucination/`. The git probe (`git diff <start>..HEAD`) only sees committed changes.
  - **Remediation:** Commit the Phase 1–2 changes. The changes are real on disk (verified by `git status` and the passing test gate).
