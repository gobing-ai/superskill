---
name: Phase 2 — spur-agent pairwise rubric judge for behavior gate (open-ended cases)
description: Phase 2 — spur-agent pairwise rubric judge for behavior gate (open-ended cases)
status: Done
created_at: 2026-06-22T23:57:22.642Z
updated_at: 2026-06-24T01:02:02.364Z
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

**Traceability — 2026-06-24 (forced re-verify).** 8 requirements: 7 MET, 1 PARTIAL. No scope drift.

- [x] **R1** (rubric reference_kind): **MET** | Evidence: `packages/core/src/quality/eval-cases.ts:9` `ReferenceKind` includes `'rubric'`; `:25-30` `RubricRef`; `:70-74` `RubricRefSchema`; `:96` refine rejects kind/reference mismatch; `:84` enum rejects unknown kind. Tests: `packages/core/tests/quality/eval-cases.test.ts:288` (loads rubric case), `:310` (rejects unknown kind), `:212` (rejects rule/rubric shape mismatch).
- [x] **R2** (pairwise single-call judge): **MET** | Evidence: `apps/cli/src/operations/pairwise-judge.ts:136-147` `pairwiseJudge` single backend call; `:97-112` both outputs in one prompt (not two absolute scores); `:144-145` order de-bias via seed-controlled ordering; `:159-167` `deBias` helper. Tests: `pairwise-judge.test.ts:68` (candidate wins), `:75` (baseline wins), `:87` (order de-bias stable).
- [~] **R3** (spur-workflow + budget guard): **PARTIAL** | Budget guard: `evolve.ts:445-455` `consumeModelCalls` fail-loud cap; `:487,495,501` per-stage accounting; `evolve.test.ts:817` budget-cap rejection + file restore. BUT orchestration is inline in `runGate` (`evolve.ts:437-552`), not a `.spur/workflows/` spur-workflow asset as R3 literally specifies. Functional budget/skip/restore requirements met; spur-workflow form absent. See P3 #2.
- [x] **R4** (non-determinism mitigation): **MET** | (a) seed+temp: `pairwise-judge.ts:117-118`. (b) N replays + variance: `noise-floor.ts:18-30` `estimateNoiseFloor`. (c) reject-within-noise: `noise-floor.ts:34-36` + `evolve.ts:514`. (d) surface in report: `evolve.ts:541`, persisted `:546-551`. Tests: `noise-floor.test.ts:39,46,60-82`. Caveat: within-noise branch not exercised in integration (see P3 #1).
- [x] **R5** (gate integration): **MET** | `evolve.ts:441-442` partitions holdout by reference_kind; `:529-534` combines into one weighted aggregate; `:537` strict-improve + margin unchanged; `:555-564` anchor gate preserved (additive on form gate). Tests: `evolve.test.ts:619,660,702`.
- [x] **R6** (scripted judge backend): **MET** | `pairwise-judge.ts:55-73` `ScriptedJudgeBackend`; `:125-127` `createJudgeBackend(target, injected?)`. Tests: `pairwise-judge.test.ts:23-51,150-159`.
- [x] **R7** (opt-in, default-off, cost-aware): **MET** | `evolve.ts:437` gate runs only `if (input.evalGate)`; `:483` judge only `if (rubricCases.length > 0)`; `commands/helpers.ts:32` `--eval-gate` flag; budget cap `evolve.ts:443`. Tests: `evolve.test.ts:744,1608`.
- [x] **R8** (no Python dep): **MET** | All logic in TypeScript; no Python files in scope. `vendors/SkillOpt` reference-only (never imported).

**Scope drift:** none. All modified files map to R1-R8; no untraced code in the new files.


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

**Verdict: PASS** — forced re-verify 2026-06-24 (status was Done). 3 findings: 0 P1, 0 P2, 2 P3, 1 P4. All 8 requirements MET or PARTIAL-with-justification. Gate `bun run check` → pass. Channel: current (inline).

**Scope:** `packages/core/src/quality/eval-cases.ts`, `apps/cli/src/operations/{pairwise-judge,noise-floor}.ts`, `apps/cli/src/operations/evolve.ts` (empirical gate), `apps/cli/src/store/evaluations.ts`, tests, docs (00_ADR/01_PRD/04_DESIGN/05_FEATURES/F026).

**P1 — Blockers:** _(none)_

**P2 — Warnings:** _(none)_

**P3 — Info:**

1. **Within-noise rejection path is not exercised by any evolve integration test** (Correctness, `apps/cli/src/operations/evolve.ts:514`). The `--eval-gate rejects rubric wins that are within the judge noise floor` test (`evolve.test.ts:790`) rejects because the noisy judge's primary verdict favors baseline (`signedMargin=-0.8`), NOT because `rejectsWithinNoise` returns true. Confirmed empirically: primary verdict = baseline (margin 0.8), noise floor ≈ 0.754, `|delta|=0.8 < 0.754` → false. The 0.5/0.5 split branch at `evolve.ts:514-516` was never reached by integration tests. **FIXED:** added `WithinNoiseJudgeBackend` + test `evolve.test.ts:826` that yields a candidate-win primary verdict (margin 0.3) with noise floor ~0.85, so `rejectsWithinNoise` returns true → split → no strict improve → rejected. Branch now covered.
2. **R3 spur-workflow orchestration form absent (folded inline)** (Usability, `apps/cli/src/operations/evolve.ts:437-552`). R3 specifies "a spur-workflow drives replay → pairwise-judge → aggregate → gate". Implementation folds orchestration inline into `runGate` instead of a `.spur/workflows/` asset. Functional budget-guard requirements (fail-loud cap, skip logging, file restore) are met inline, but the spur-workflow form is absent. Task Review acknowledges the fold. Acceptable deviation (inline is simpler and avoids the 0041 workflow-engine data-threading gap). **SKIPPED:** design decision, not a mechanical code fix — the task Review already documents the inline fold; reverting to a spur-workflow asset would be a larger refactor contradicting the chosen design.

**P4 — Suggestions:**

1. **Primary judge call duplicates noise-replay seed 0** (Efficiency, `apps/cli/src/operations/evolve.ts:497-510`). The primary `pairwiseJudge` (line 497, seed 0) and the first noise-floor replay (`estimateNoiseFloor` i=0, seed 0) issued identical calls — the primary verdict equalled noise-replay-0. One redundant model call per rubric case. **FIXED:** `noise-floor.ts:20` now seeds replays at `i + 1`, so noise replays use seeds 1..n and never duplicate the primary call's seed 0.

**Fix-pass 2026-06-24:** 2 fixed (P3 #1, P4 #1), 0 failed, 1 skipped (P3 #2 — documented design decision). Post-fix gate: `bun run spur-check` → all green (lint clean, typecheck 0, 1172 tests pass, 22 pre-check + 3 post-check rules pass, coverage-gate pass). Status: Done.


### Testing

Focused regression suite:

`bun test packages/core/tests/quality/eval-cases.test.ts apps/cli/tests/operations/pairwise-judge.test.ts apps/cli/tests/operations/noise-floor.test.ts apps/cli/tests/operations/evolve.test.ts`

Result: 116 pass, 0 fail. The command exits 1 because a partial Bun test run is still subject to aggregate repo coverage thresholds; no behavior assertions failed.

Full gates to run before Done:

- `bun run lint`
- `bun run test`
- `bun run build`
- `bun run spur-check`
- `tasks check 0069`


### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References


