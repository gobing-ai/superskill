---
name: Migrate anti-hallucination skill from Spur and re-develop its launchers as a spur workflow + spur agent solution
description: Migrate anti-hallucination skill from Spur and re-develop its launchers as a spur workflow + spur agent solution
status: Backlog
created_at: 2026-06-18T06:47:35.813Z
updated_at: 2026-06-18T06:47:35.813Z
folder: docs/tasks
type: task
feature-id: ""
priority: high
tags: ["migration","anti-hallucination","workflow","dogfood","cross-repo"]
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
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



### Review



### Testing



### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References


