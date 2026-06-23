---
name: Phase 2 — spur-agent pairwise rubric judge for behavior gate (open-ended cases)
description: Phase 2 — spur-agent pairwise rubric judge for behavior gate (open-ended cases)
status: Backlog
created_at: 2026-06-22T23:57:22.642Z
updated_at: 2026-06-22T23:57:22.642Z
folder: docs/tasks
type: task
feature-id: ""
priority: high
estimated_hours: 64
dependencies: ["0068"]
tags: ["evolve","behavior-gate","llm-judge","spur-agent","spur-workflow","pairwise","non-determinism","core","cli"]
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0069. Phase 2 — spur-agent pairwise rubric judge for behavior gate (open-ended cases)

### Background

Phase 1 (task 0068) gates evolve on BEHAVIOR using CHECKABLE references only (exact-match + rule judge) — deterministic, CI-able, zero LLM cost. But many skills are open-ended: there is no exact string or rule that defines 'the agent behaved well'. Phase 2 closes that gap by adding an LLM-as-judge for the rubric reference_kind, implemented as a spur-agent (leveraging @gobing-ai/ts-ai-runner, already a dep) orchestrated by a spur-workflow. This is the same architectural pattern we already ship: the two-call persona seam in evolve (Scorer / Author->Skeptic->Judge, evolve.ts emitGenerationEnvelope/ingestProposal) already separates deterministic CLI from LLM judgment; the anti-hallucination skill (task 0041) is the precedent for a skill whose enforcement IS a spur-workflow + spur-agent rather than deterministic code. The DECISIVE risk, called out in the analysis (docs/analysis/skillopt-vs-cc-meta-agents.md §5 point 1): an LLM judge is NON-DETERMINISTIC. If the gate is simply 'spur-agent says candidate is better' and judge noise exceeds the signal, the gate ACCEPTS NOISE and launders it as improvement — worse than no gate. SkillOpt mitigates with: checkable references where possible, contrastive/pairwise scoring, a held-out split, a fixed seed, a strict-improve threshold, and an honest 'treat sub-1.5pt deltas as noise' caveat. Phase 2 MUST do the same; the credibility-critical work is the non-determinism mitigation, not the judge invocation.


### Requirements

R1 (rubric reference_kind): Extend the Phase-1 eval-case schema (skills/<name>/eval/cases.yaml) with reference_kind: 'rubric' carrying a rubric object { criterion: string, excellent?: string, poor?: string } — mirror the anchors shape in packages/core/src/rubrics/skill.yaml. Incremental on 0068's loader; reject unknown reference_kind. R2 (pairwise judge — NOT absolute): The judge MUST score candidate-vs-baseline PAIRWISE in a SINGLE call per case (present both outputs for the same prompt, ask which better satisfies the criterion, return winner + margin), NOT two independent absolute scores. Pairwise is materially more stable than differencing two absolute scores (this is SkillOpt's contrastive-reflect insight). The judge is a spur-agent invoked via ts-ai-runner. R3 (spur-workflow orchestration): A spur-workflow drives replay -> pairwise-judge -> aggregate -> gate, with a BUDGET-CAP guard stage that stops early when max model calls / max tokens is hit and logs what was skipped (no silent truncation — fail loud, R12). Use the anti-hallucination (task 0041) spur-workflow as the template. R4 (non-determinism mitigation — credibility-critical): (a) fix seed + temperature for the judge; (b) run N replays per case and estimate variance; (c) compute a NOISE FLOOR from that variance and REJECT when the candidate-baseline delta < noise floor (do not accept within-noise wins); (d) surface the noise floor + measured delta in the report so the decision is auditable. Without (a)-(d) the gate is theater — this requirement is the load-bearing one. R5 (gate integration): The rubric path feeds the SAME 'empirical' gate stage added in 0068 — rubric cases contribute their pairwise win-rate to the held-out aggregate; the strict-improve + margin comparison is unchanged. The empirical gate stays ADDITIVE on top of the form gate. R6 (deterministic testability): A SCRIPTED judge backend (deterministic, returns a fixed verdict) so the gate's behavior — pairwise-stability test, noise-floor rejection test, budget-cap test — is CI-able with zero spend. Mirror 0068's mock-backend discipline. R7 (opt-in, default-off, cost-aware): Behavior gate with rubric cases is N_cases x N_replays x (1 generate + 1 pairwise-judge) model calls per evolve — gate it behind --eval-gate (from 0068) plus presence of rubric cases; default path unchanged. R8 (no Python dep): all logic in TS.


### Q&A



### Design

**Architecture context (read before touching anything).**

Phase 2 EXTENDS the `empirical` gate stage that Phase 1 (task 0068) added to `runGate`
(`apps/cli/src/operations/evolve.ts`). It does NOT add a new gate stage — it adds a new
`reference_kind: 'rubric'` whose held-out score is produced by an LLM judge (a spur-agent), then folds
that score into the SAME empirical aggregate Phase 1 compares strict-improve + margin. The credibility
of the whole thing rests on R4 (non-determinism mitigation): an LLM judge with noise larger than the
signal makes "candidate > baseline" meaningless. Pairwise + noise-floor is what makes the gate real
rather than theater.

**The five components:**

1. `packages/core/src/quality/eval-cases.ts` (EDIT — incremental on 0068)
   - Add `reference_kind: 'rubric'` with `reference: RubricRef` where
     `RubricRef = { criterion: string; excellent?: string; poor?: string }` — mirror the `anchors`
     shape in `packages/core/src/rubrics/skill.yaml`. Zod union over the three reference kinds; reject
     unknown kinds with a structured error.

2. `apps/cli/src/operations/pairwise-judge.ts` (NEW — the spur-agent)
   - `pairwiseJudge(backend, case, candidateOutput, baselineOutput): { winner: 'candidate'|'baseline'|'tie'; margin: number }`.
   - SINGLE call per case (R2): present BOTH outputs for the same prompt + the rubric criterion, ask
     which better satisfies it, return winner + a 0..1 confidence margin. NOT two independent absolute
     scores — pairwise is materially more stable (SkillOpt's contrastive-reflect insight). Order of
     (candidate, baseline) in the prompt MUST be randomized per call and de-biased (run both orders or
     swap-and-average) so position bias doesn't leak in.
   - Fixed seed + temperature (R4a). Invoked via `@gobing-ai/ts-ai-runner` as a spur-agent.
   - A `ScriptedJudgeBackend` (deterministic verdict by case id) for tests (R6).

3. spur-workflow (NEW — orchestration, R3)
   - Stages: `replay-candidate → replay-baseline → pairwise-judge(per rubric case) → aggregate →
     budget-guard → gate`. Model the workflow on the anti-hallucination skill (task 0041) spur-workflow
     + spur-agent precedent.
   - BUDGET-GUARD stage: cap `max_model_calls` / `max_tokens`; on hit, STOP early and record what was
     skipped in the report (fail loud, no silent truncation — R12 / R3).

4. `apps/cli/src/operations/noise-floor.ts` (NEW — pure, the credibility core, R4)
   - `estimateNoiseFloor(judge, case, candidateOutput, baselineOutput, n): number` — run the pairwise
     judge N times, measure verdict variance, return a noise floor (e.g. the std-dev of the win-margin
     across replays, or the disagreement rate mapped to a margin).
   - `rejectsWithinNoise(measuredDelta: number, noiseFloor: number): boolean` — true when
     `|measuredDelta| < noiseFloor`. The gate REJECTS within-noise wins (R4c). Pure → unit-testable
     with the scripted judge.

5. `apps/cli/src/operations/evolve.ts` (EDIT — fold rubric into the empirical aggregate, R5)
   - In the empirical branch, partition holdout cases by reference_kind: exact/rule scored
     deterministically (Phase 1), rubric scored by pairwise win-rate (candidate wins / total rubric
     cases). Combine into one held-out aggregate.
   - Enforce the noise floor: compute the noise floor for the rubric contribution; if the
     candidate-baseline delta on the rubric portion is within noise, treat it as NO improvement (do not
     let noise tip the strict-improve comparison). Surface noise floor + measured delta in the report
     so the decision is auditable (R4d).
   - Strict-improve + margin comparison itself is UNCHANGED from Phase 1.

**Non-determinism mitigation summary (R4 — the load-bearing requirement).**
(a) fixed seed + temperature on the judge; (b) randomized/de-biased pair ordering; (c) N-replay
variance → noise floor → reject-within-noise; (d) report the noise floor + delta. WITHOUT all four the
gate accepts noise and launders it as improvement — strictly worse than no gate. Do NOT cut R4 to save
time.

**Opt-in / cost (R7).** Rubric cases cost `N_cases × N_replays × (1 generate + 1 pairwise-judge)` model
calls per evolve. Gated behind `--eval-gate` (from 0068) PLUS presence of rubric cases. No rubric
cases → no judge calls. Default path unchanged.

**No Python dependency (R8).** All logic in TS; `vendors/SkillOpt` is reference-only.


### Solution

Builds on 0068's empirical gate seam; adds the stochastic judge + the safeguards that make it trustworthy. Touch points: (1) EDIT packages/core/src/quality/eval-cases.ts — add 'rubric' reference_kind + Zod sub-schema; (2) NEW apps/cli/src/operations/pairwise-judge.ts — spur-agent invocation (ts-ai-runner), single-call pairwise verdict {winner, margin}, fixed seed/temp; (3) NEW spur-workflow (mirroring anti-hallucination task 0041) — replay -> pairwise-judge -> aggregate -> budget-guard -> gate; (4) NEW apps/cli/src/operations/noise-floor.ts — N-replay variance estimate + reject-within-noise predicate (pure, unit-testable); (5) EDIT the empirical gate branch in evolve.ts runGate to incorporate rubric pairwise win-rate into the held-out aggregate + enforce the noise floor; (6) NEW scripted judge backend for tests. The hard part is statistics not code: ~2 days is the judge invocation, ~3 days is making 'candidate > baseline' MEAN something against judge noise (R4). Do NOT cut R4 to save time — a gate that accepts noise is worse than no gate.


### Plan

Ordered, each step ends green. Depends on task 0068 being merged (the empirical gate stage + replay
runner + eval-case loader must exist). Conventional commits, atomic per step.

**Step 0 — SPIKE (timebox 0.5d).** Confirm `@gobing-ai/ts-ai-runner` supports a spur-agent invocation
with a fixed seed/temperature and a structured (JSON) response, and that the anti-hallucination (task
0041) spur-workflow pattern is reusable here. Record the call signature + the workflow-engine entry
point in the task Q&A. If seed/temperature control is NOT exposed, R4a is at risk — flag to operator
before continuing (the gate's credibility depends on it).

**Step 1 — rubric reference_kind (R1).** Edit `packages/core/src/quality/eval-cases.ts`: add the
`rubric` kind + `RubricRef` Zod sub-schema as a discriminated union. Extend fixtures. Tests: rubric
case loads; unknown kind rejected. Commit: `feat(core): add rubric reference kind to eval cases`.

**Step 2 — pairwise judge + scripted backend (R2, R6).** Add
`apps/cli/src/operations/pairwise-judge.ts`: `pairwiseJudge` (single call, randomized/de-biased order,
fixed seed/temp) + `ScriptedJudgeBackend`. Tests use the scripted backend only. Assert order-debiasing
(swapping inputs does not flip the winner for a clear case). Commit:
`feat(cli): add pairwise rubric judge spur-agent`.

**Step 3 — noise floor (R4, the credibility core).** Add `apps/cli/src/operations/noise-floor.ts`:
`estimateNoiseFloor` + `rejectsWithinNoise` (pure). Tests with the scripted judge: a stable judge → low
floor; a flip-flopping judge → high floor that rejects a small delta. Commit:
`feat(cli): add judge noise-floor estimation + reject-within-noise`.

**Step 4 — spur-workflow orchestration (R3).** Build the replay → pairwise-judge → aggregate →
budget-guard → gate workflow (template: anti-hallucination task 0041). Budget-guard stops early + logs
skipped. Tests: workflow reaches terminal; budget cap triggers early-stop with a recorded skip count
(no silent truncation). Commit: `feat(cli): orchestrate behavior judge via spur-workflow`.

**Step 5 — fold rubric into empirical gate (R5).** Edit `evolve.ts`: partition holdout by
reference_kind, score rubric portion by pairwise win-rate, combine into one aggregate, enforce the
noise floor, surface floor + delta in the report. Tests: a within-noise rubric win does NOT tip
strict-improve; a clear rubric win does. Commit: `feat(cli): fold rubric judge into empirical gate`.

**Step 6 — opt-in + cost guard (R7).** No rubric cases → zero judge calls (spy on judge constructor).
Report shows model-call/token count. Commit: `test(cli): assert no judge calls without rubric cases`.

**Step 7 — DOCS SYNC (mandatory).** Update ADR (rubric judge is pairwise + noise-floored; cost model).
DESIGN for the judge/workflow + new flags surfaced. FEATURES status row. PRD scope note (cost caveat).
Commit: `docs: record pairwise rubric behavior judge (ADR + design + cost)`.

**Files created:** `apps/cli/src/operations/{pairwise-judge,noise-floor}.ts`, the spur-workflow asset,
scripted-judge fixtures + tests.
**Files edited:** `packages/core/src/quality/eval-cases.ts`, `apps/cli/src/operations/evolve.ts`, the
four doc-map docs.


### Review



### Testing

**Strategy.** Testing a STOCHASTIC judge DETERMINISTICALLY is the hard part. Every test uses the
`ScriptedJudgeBackend` (fixed verdict by case id) — ZERO token spend, CI-safe. The load-bearing tests
are the noise-floor ones: they prove the gate does NOT accept a within-noise win, which is the exact
failure mode (accepting judge noise as improvement) this phase exists to prevent. Tests encode WHY (R8):
a judge that flip-flops must NOT be allowed to tip the gate.

**Unit — `eval-cases.test.ts` (extends 0068):**
- rubric case loads with `{ criterion, excellent?, poor? }`.
- unknown reference_kind → structured error.

**Unit — `pairwise-judge.test.ts`:**
- clear-winner case: candidate output strictly better per criterion → winner 'candidate'.
- ORDER DE-BIAS: swapping (candidate, baseline) positions does NOT flip the winner for a clear case
  (proves position bias is controlled — R2).
- tie case → winner 'tie', margin ~0.

**Unit — `noise-floor.test.ts` (the credibility core):**
- STABLE judge (always same verdict) → low noise floor.
- FLIP-FLOPPING judge (verdict varies across N replays) → high noise floor.
- `rejectsWithinNoise(smallDelta, highFloor)` → true; `rejectsWithinNoise(largeDelta, lowFloor)` →
  false. (WHY: a small win under a noisy judge is indistinguishable from noise and must be rejected.)

**Integration — `evolve.rubric-gate.test.ts`:**
- CLEAR RUBRIC WIN PASSES: candidate wins the rubric holdout convincingly (delta > noise floor) →
  empirical gate ok, proposal accepted.
- WITHIN-NOISE WIN BLOCKED: candidate wins by a margin < noise floor → treated as no improvement,
  strict-improve not satisfied, gate blocks, file restored. (The single most important test.)
- MIXED CASES: exact/rule cases (deterministic) + rubric cases (judged) combine into one held-out
  aggregate; the combined strict-improve comparison drives the decision.
- ADDITIVE: a rubric-improving candidate that fails the form delta-margin gate is still blocked.

**Workflow — `behavior-judge-workflow.test.ts`:**
- workflow reaches its terminal state on a happy path.
- BUDGET CAP: with a low max-calls cap, the workflow stops early and records a non-zero skipped count in
  the report (no silent truncation — R12).

**Cost guard — `evolve.no-rubric.test.ts`:**
- evolve with eval-gate but ONLY exact/rule cases (no rubric): spy on the judge constructor; assert it
  is NEVER called. No judge cost when no rubric cases exist (R7).

**Coverage gate.** Per-file 90/90. Pure modules (`noise-floor.ts`, judge scoring helpers) fully
unit-covered. The real ts-ai-runner judge call is isolated to a one-line boundary so the scripted-judge
path carries coverage without spend.

**Manual gate before Done:** `bun run lint && bun run test && bun run build && bun run spur-check`
green; `git status` clean of unintended changes. If the spur-workflow has its own dry-run, run it to a
terminal state as part of verification (the 0041 precedent shows workflows can stall short of done).


### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References


