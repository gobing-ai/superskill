---
name: "Phase 1 — checkable-reference behavior gate for evolve (empirical gate, no LLM judge)"
description: "Phase 1 — checkable-reference behavior gate for evolve (empirical gate, no LLM judge)"
status: Done
created_at: 2026-06-22T23:56:53.190Z
updated_at: 2026-06-22T23:56:53.190Z
folder: docs/tasks
type: task
feature-id: ""
priority: high
estimated_hours: 52
tags: ["evolve","behavior-gate","empirical","eval-cases","replay","core","cli"]
impl_progress:
  planning: completed
  design: completed
  implementation: completed
  review: completed
  testing: completed
---

## 0068. "Phase 1 — checkable-reference behavior gate for evolve (empirical gate, no LLM judge)"

### Background

Our self-evolution loop (apps/cli/src/operations/evolve.ts) gates proposals on STATIC document quality only: heuristic + rubric dimension scores on the document text (packages/core/src/quality/heuristics.ts, skill.ts). A higher heuristic score does NOT imply the agent behaves better — the gate closes the loop on FORM, not BEHAVIOR. SkillOpt (vendors/SkillOpt, MS Research, arXiv 2605.23904) demonstrates the missing piece: accept an edit only when REPLAYING held-out tasks with the candidate scores strictly higher (vendors/SkillOpt/skillopt_sleep/{gate,consolidate,replay}.py). Analysis: docs/analysis/skillopt-vs-cc-meta-agents.md. Phase 1 imports the loop-on-behavior mechanism using CHECKABLE references ONLY (exact-match + rule judge) — no LLM judge yet (that is Phase 2). This proves the replay->compare->gate plumbing on un-ambiguous cases, exactly as SkillOpt's deterministic mock backend does for CI. Our evolve already has the right seams: a pluggable 4-stage runGate (evolve.ts:383, stages deterministic|delta-margin|anchor|skeptic), backup/apply/verify/restore lifecycle, baseline->post delta with --margin, append-only eval store (apps/cli/src/store/evaluations.ts, dimensions is a flexible JSON column). The ONLY gap is the behavior signal: tasks + references + a replay harness + a behavior score persisted alongside the form score.


### Requirements

R1 (eval-case artifact): A new per-skill artifact at skills/<name>/eval/cases.yaml. Format MUST be YAML (NOT JSONL) to align with packages/core/src/rubrics/<type>.yaml — yaml@^2.9.0 is already a dependency in both workspaces; reuse the loadRubric resolution+Zod pattern (packages/core/src/quality/rubric.ts). Schema: { version: 1, cases: [{ id: string, split: 'train'|'holdout', prompt: string, reference_kind: 'exact'|'rule', reference: <string for exact | rule-judge object>, tags?: string[] }] }. Zod-validate on load; surface a structured error (which file, which case id, which field) on malformed input. R2 (replay harness): Run the CANDIDATE skill text against each case prompt via @gobing-ai/ts-ai-runner (already a dep), collect the output text, score it against the reference: exact -> normalized exact/substring match; rule -> deterministic rule judge (port the shape of vendors/SkillOpt/skillopt_sleep/judges.py score_rule_judge: ops like contains/regex/equals/tool_called). Aggregate hard score over a split. MUST be deterministic and MUST have a MOCK backend so the gate is CI-able with zero token spend (mirror SkillOpt's mock discipline). R3 (empirical gate stage): Add a 5th OPTIONAL stage 'empirical' to runGate. It runs ONLY when an eval set exists for the content; when absent it is SKIPPED (mirror the anchor-gate skip pattern at evolve.ts:406 — absent input => stage skipped). When present: replay holdout split with candidate vs baseline, require candidate_hard > baseline_hard AND (candidate_hard - baseline_hard) >= margin (strict-improve, mirror evaluate_gate in vendors/SkillOpt/skillopt_sleep/gate.py). The empirical gate is ADDITIVE — the existing delta-margin (form) gate STAYS ACTIVE, so a change must be BOTH well-formed AND behavior-improving when an eval set is present. R4 (score persistence): Persist the behavior score alongside the form score via EvaluationDao.insertEvaluation. NO schema migration — reuse the dimensions JSON column to carry { empirical: { hard, holdout_n, train_n } }; keep operation='evolve'. R5 (CLI wiring): Add an --eval-gate flag on evolve subcommands; thread through EvolveOptions; surface the empirical baseline->candidate hard score in the report and the rejection reason when the gate blocks. R6 (opt-in, zero default cost): With NO eval set and/or NO --eval-gate, behavior is byte-identical to today: no model calls, no new persistence, no gate change. R7 (scope guard): Per SkillOpt honest-scope caveat — this is for high-value, frequently-run skills where recurrence + a checkable signal exist; it is NOT a default for every evolve. Document this. R8 (no Python dep): Re-implement the ~15-line strict-improve gate and the rule judge in TS; do NOT take a dependency on vendors/SkillOpt.


### Q&A



### Design

**Architecture context (read before touching anything).**

The evolve engine (`apps/cli/src/operations/evolve.ts`) gates a proposal through `runGate` (`:383`), a
sequential, named-failure gate with four stages today: `deterministic` (validate zero errors) →
`delta-margin` (form Δ ≥ margin) → `anchor` (anchor_hash match) → `skeptic` (no veto). Each stage is
**skip-when-absent**: e.g. the anchor stage runs only when `ingestedAnchorHash` is supplied
(`:406`). This task adds a fifth stage, `empirical`, following the identical skip-when-absent
convention. The eval store (`apps/cli/src/store/evaluations.ts`) is append-only; `dimensions` is a
free-form JSON column, so a behavior score fits WITHOUT a schema migration.

**The five components (each independently testable):**

1. `packages/core/src/quality/eval-cases.ts` (NEW, pure)
   - Zod schema for `cases.yaml`: `{ version: 1, cases: EvalCase[] }` where
     `EvalCase = { id: string; split: 'train'|'holdout'; prompt: string; reference_kind: 'exact'|'rule'; reference: string | RuleJudge; tags?: string[] }`.
   - `RuleJudge = { checks: { op: 'contains'|'regex'|'equals'|'not_contains'; arg: string }[] }` —
     port the SHAPE (not the code) of `vendors/SkillOpt/skillopt_sleep/judges.py` `score_rule_judge`.
   - `loadEvalCases(name: string): EvalCaseSet | null` — resolution order mirrors `loadRubric`
     (`packages/core/src/quality/rubric.ts:88`): explicit path → `skills/<name>/eval/cases.yaml` →
     null when absent. Parse via `yaml` (`^2.9.0`, already a dep) → Zod-validate. On malformed input,
     throw a structured error naming file + case `id` + field. Returning `null` (not throwing) when
     the file is ABSENT is what makes the gate skip-when-absent.

2. `packages/core/src/quality/replay.ts` (NEW, pure)
   - `scoreExact(output: string, reference: string): number` — normalized (trim, case-fold,
     collapse whitespace) exact OR substring match → `1.0 | 0.0`.
   - `scoreRule(output: string, judge: RuleJudge, toolsCalled?: string[]): number` — all checks must
     pass for `1.0`; deterministic. `tool_called` op consults `toolsCalled`.
   - `aggregateHard(scores: number[]): number` — mean over a split; empty → `0.0`.
   - No I/O, no model calls — 100% unit-testable.

3. `apps/cli/src/operations/replay-runner.ts` (NEW)
   - `replayCase(backend, skill: string, case: EvalCase): { hard: number; output: string }` — run the
     CANDIDATE skill text against `case.prompt` via `@gobing-ai/ts-ai-runner`, score via `replay.ts`.
   - `replaySplit(backend, skill, cases, split): { hard: number; n: number }`.
   - `MockReplayBackend` — deterministic, returns a scripted output keyed by case `id`; selected when
     no API target is configured. This is what makes the gate CI-able at zero token cost (mirrors
     `vendors/SkillOpt/skillopt_sleep` mock discipline). The real backend is a thin ts-ai-runner shim.

4. `apps/cli/src/operations/evolve.ts` (EDIT)
   - Extend `GateResult.failedGate` union (`:370`) with `'empirical'`.
   - Extend `GateInput` with optional `evalGate?: { name: string; candidateSkillPath: string; baselineSkillText: string; margin: number }`.
   - Insert the empirical branch in `runGate` AFTER `delta-margin`, BEFORE `anchor`. Pseudocode:
     `if (!input.evalGate) return /* skip */; const cases = loadEvalCases(name); if (!cases) return /* skip */;`
     `const base = replaySplit(backend, baselineSkillText, cases, 'holdout');`
     `const cand = replaySplit(backend, candidateSkillText, cases, 'holdout');`
     `if (!(cand.hard > base.hard && cand.hard - base.hard >= margin)) return { ok:false, failedGate:'empirical', reason:... };`
   - The empirical gate is ADDITIVE: the existing `delta-margin` (form) stage is UNTOUCHED, so a
     change must pass BOTH when an eval set exists.
   - Thread `evalGate` context through `GateContext` (`:882`) and `stepVerify` (`:891`) the same way
     `ingestedAnchorHash`/`skeptic` are threaded today.

5. CLI wiring (EDIT `EvolveOptions` + `apps/cli/src/commands/helpers.ts`)
   - Add `evalGate?: boolean` to `EvolveOptions` (`evolve.ts:28`).
   - Register `--eval-gate` on the shared `addEvolveOptions` helper (registers on agent/command/magent/
     skill evolve; hook is analyze-only and already excluded). Each content-type action handler must
     destructure + forward `evalGate` (same gap pattern noted for 0062/0063/0065 — the helper declares
     the flag generically, each handler must widen its forward).
   - Surface in the report: empirical `baseline.hard → candidate.hard` and, on block, the rejection
     reason naming the empirical gate.

**Persistence (R4).** In `stepVerify`, when the empirical gate ran, write
`dimensions.empirical = { hard, holdout_n, train_n }` into the evaluation row via
`EvaluationDao.insertEvaluation` with `operation: 'evolve'`. No migration: `dimensions` is JSON.

**Default-path invariant (R6).** With no `--eval-gate` AND/OR no `cases.yaml`: the empirical branch
returns skip BEFORE any backend construction or model call. Behavior is byte-identical to today —
asserted by a regression test (see Testing).

**Scope note (R7).** Document in `cc-skills/SKILL.md` and the new DESIGN entry that the empirical gate
is for high-value, frequently-run skills where recurrence + a checkable signal exist — SkillOpt's
honest-scope caveat (`docs/sleep/README.md` §d) applies verbatim; it is not a default for every evolve.

**No Python dependency (R8).** The strict-improve comparison (~15 lines) and the rule judge are
re-implemented in TS. `vendors/SkillOpt` is reference-only.


### Solution

Additive, opt-in, default-off. Touch points: (1) NEW packages/core/src/quality/eval-cases.ts — Zod schema + loadEvalCases(name) mirroring loadRubric resolution; (2) NEW packages/core/src/quality/replay.ts — pure rule-judge + exact-match scorers (deterministic, unit-testable); (3) NEW apps/cli/src/operations/replay-runner.ts — ts-ai-runner invocation + mock backend, returns { hard, n } per split; (4) EDIT apps/cli/src/operations/evolve.ts — extend GateResult.failedGate union with 'empirical', add the empirical branch to runGate (after delta-margin, before anchor), thread eval-gate context through stepVerify/GateContext; (5) EDIT EvolveOptions + commands/helpers.ts evolve flag helper to register --eval-gate; (6) EDIT apps/cli/src/store usage — write { empirical: {...} } into dimensions JSON. Default path unchanged: the empirical branch early-returns ok:true when no eval set or flag absent. Mock backend selected when no API target configured, so the deterministic test (improve passes / regression blocked / no-eval-set skips) runs in CI with zero spend. PRE-WORK SPIKE (R2 de-risk): confirm ts-ai-runner can 'run skill text vs prompt -> output' against a backend before committing the 2-day replay-harness estimate; if it cannot, add ~2 days for backend-routing.


### Plan

Ordered, each step ends green (lint + test + 90/90 coverage). Conventional commits, atomic per step.

**Step 0 — SPIKE (timebox 0.5d, gates the whole estimate).** Confirm `@gobing-ai/ts-ai-runner` can
run "skill text vs prompt → output text" against a backend (and that a no-op/mock target is possible).
Write a throwaway script under a scratch dir, run one invocation, record the API shape. If ts-ai-runner
CANNOT do this, STOP and add ~2d for backend-routing before continuing; flag to operator. Output: a
2-line note in the task Q&A section recording the exact call signature found.

**Step 1 — eval-case artifact (R1).** Add `packages/core/src/quality/eval-cases.ts`: Zod schema +
`loadEvalCases`. Export from `packages/core/src/index.ts`. Add a fixture `cases.yaml` under the test
tree. Unit tests: valid load, malformed (bad reference_kind / missing field) → structured error naming
case id, absent file → `null`. Commit: `feat(core): add eval-case YAML schema + loader`.

**Step 2 — pure scorers (R2 part 1).** Add `packages/core/src/quality/replay.ts`: `scoreExact`,
`scoreRule`, `aggregateHard`. Export. Unit tests: exact match/mismatch/whitespace-normalization; each
rule op (contains/regex/equals/not_contains/tool_called); empty-split → 0.0. Commit:
`feat(core): add deterministic exact + rule scorers for behavior replay`.

**Step 3 — replay runner + mock backend (R2 part 2).** Add `apps/cli/src/operations/replay-runner.ts`:
`MockReplayBackend` (scripted outputs by case id), real ts-ai-runner shim, `replayCase`/`replaySplit`.
Tests use the mock only. Commit: `feat(cli): add replay runner with CI-able mock backend`.

**Step 4 — empirical gate stage (R3).** Edit `evolve.ts`: extend `failedGate` union, `GateInput`,
`GateContext`; insert the empirical branch after delta-margin / before anchor; thread context through
`stepVerify`. Tests at this step assert gate logic with a stubbed replaySplit (improve → ok, regress →
block, no-eval-set → skip). Commit: `feat(cli): add opt-in empirical behavior gate to evolve`.

**Step 5 — persistence (R4).** Write `dimensions.empirical = { hard, holdout_n, train_n }` in
stepVerify when the empirical gate ran. Test: evaluation row carries the empirical sub-object. Commit:
`feat(cli): persist behavior score alongside form score on evolve`.

**Step 6 — CLI flag + report wiring (R5).** Register `--eval-gate` on `addEvolveOptions`; widen each
content-type handler's destructure/forward (agent/command/magent/skill — NOT hook). Surface empirical
baseline→candidate + rejection reason in the report. Tests: flag parsed + forwarded; report shows the
empirical line. Commit: `feat(cli): wire --eval-gate flag through evolve handlers`.

**Step 7 — default-path regression + scope docs (R6, R7).** Regression test: evolve with no flag / no
cases.yaml makes ZERO backend calls and produces byte-identical behavior to baseline (spy on backend
constructor — assert not called). Add scope note to `cc-skills/SKILL.md`. Commit:
`test(cli): assert evolve default path unchanged without eval gate`.

**Step 8 — DOCS SYNC (mandatory, same-commit per doc map).** Add ADR entry to `docs/00_ADR.md`
(decision: behavior gate is opt-in/additive; YAML eval cases co-located, separate from rubrics; no
Python dep). Scope note in `docs/01_PRD.md`. Flag/artifact shapes in `docs/04_DESIGN.md`. Feature-status
row in `docs/05_FEATURES.md`. Commit: `docs: record empirical behavior gate (ADR + design + scope)`.

**Files created:** `packages/core/src/quality/{eval-cases,replay}.ts`,
`apps/cli/src/operations/replay-runner.ts`, fixtures + tests.
**Files edited:** `apps/cli/src/operations/evolve.ts`, `apps/cli/src/commands/helpers.ts`, the 4
content-type command handlers, `packages/core/src/index.ts`, `plugins/cc/skills/cc-skills/SKILL.md`,
the four doc-map docs.


### Review

_2026-06-23T15:58:00-07:00_

**Verdict: PASS**

**Scope reviewed:** task 0068 implementation and docs sync for the opt-in empirical behavior gate:
`packages/core/src/quality/eval-cases.ts`, `packages/core/src/quality/replay.ts`,
`apps/cli/src/operations/replay-runner.ts`, `apps/cli/src/operations/evolve.ts`,
`apps/cli/src/commands/{agent,command,magent,skill}.ts`, `apps/cli/src/commands/helpers.ts`,
`apps/cli/src/store/evaluations.ts`, task-owned tests, and docs.

**Findings fixed during verification:**

| # | Title | Dimension | Location | Resolution |
|---|-------|-----------|----------|------------|
| 1 | `--eval-gate` flag was declared but not forwarded by evolve wrappers | Correctness | `apps/cli/src/commands/{agent,command,magent,skill}.ts` | Forwarded `evalGate` from all four wrappers into `evolve()`; hook remains analyze-only. |
| 2 | Empirical gate had no operation-boundary improve/regression coverage | Correctness | `apps/cli/tests/operations/evolve.test.ts` | Added accept-pass and regression-block tests with a deterministic injected replay backend. |
| 3 | Eval-case schema accepted versions beyond `version: 1` and did not name known case ids in errors | Correctness | `packages/core/src/quality/eval-cases.ts` | Tightened schema to `z.literal(1)` and improved malformed-case errors to include the case id when present. |
| 4 | Empirical behavior score persistence did not carry the hard/holdout/train fields required by R4 | Correctness | `apps/cli/src/store/evaluations.ts`, `apps/cli/src/operations/evolve.ts` | Widened dimension JSON typing and persisted `hard`, `holdout_n`, and `train_n` alongside score/note. |
| 5 | R5/R7 documentation surface was incomplete | Usability | `docs/04_DESIGN.md`, `plugins/cc/skills/cc-skills/SKILL.md` | Added `--eval-gate` artifact shape/scope note and the cc-skills empirical-gate usage note. |
| 6 | Production empirical gate defaulted to an empty mock backend | Correctness | `apps/cli/src/operations/evolve.ts`, `apps/cli/src/operations/replay-runner.ts` | Added `createReplayBackend()` so production `--eval-gate` uses `TsAiRunnerBackend(TARGET_TO_AGENT_NAME[target])`; deterministic tests still inject a mock backend. Backend construction still happens only after `cases.yaml` exists. |

**Requirements traceability:**

| Req | Verdict | Evidence |
|---|---|---|
| R1 eval-case artifact | MET | `packages/core/src/quality/eval-cases.ts`; `packages/core/tests/quality/eval-cases.test.ts` covers valid load, absent-file skip, bad kind/type, missing field with case id, duplicate ids, invalid op, explicit path, and exact `version: 1`. |
| R2 replay harness | MET | `packages/core/src/quality/replay.ts`; `apps/cli/src/operations/replay-runner.ts`; tests cover exact/rule scorers, split aggregation, mock backend, ts-ai-runner DI seam, and production backend factory defaulting. |
| R3 empirical gate stage | MET | `apps/cli/src/operations/evolve.ts`; operation tests cover improve pass, behavior regression block, skip-when-absent, restore-to-backup, and proposal draft status on rejection. |
| R4 score persistence | MET | `apps/cli/src/store/evaluations.ts`; `apps/cli/tests/operations/evolve.test.ts` asserts `dimensions.empirical.score`, `hard`, `holdout_n`, and `train_n`. |
| R5 CLI wiring/reporting | MET | `apps/cli/src/commands/helpers.ts`, four evolve wrappers, and `apps/cli/src/operations/evolve.ts`; flag is forwarded and empirical pass/rejection is surfaced. |
| R6 opt-in zero default cost | MET | Default-path regression covers no `--eval-gate`; skip-when-absent covers `--eval-gate` with no `cases.yaml`. |
| R7 scope guard | MET | `docs/04_DESIGN.md` and `plugins/cc/skills/cc-skills/SKILL.md` document high-value/checkable-reference scope and non-default usage. |
| R8 no Python dependency | MET | Strict-improve gate and rule judge are implemented in TypeScript; no runtime dependency on `vendors/SkillOpt`. |



### Testing

_2026-06-23T15:58:00-07:00_

**Gate evidence: PASS**

| Command | Result |
|---|---|
| `bun run lint` | PASS — Biome clean; typecheck clean across apps/packages. |
| `bun run test` | PASS — 1140 tests, 0 failures, coverage 99.70% funcs / 98.76% lines. |
| `bun run build` | PASS — CLI bundle built successfully at `apps/cli/dist/index.js`. |
| `bun run spur-check` | PASS — lint, 20 pre-check rules, full tests, coverage gate, skill citation resolution, and TSDoc export rule all green. |

**Targeted verification also run:** `bun test packages/core/tests/quality/eval-cases.test.ts packages/core/tests/quality/replay.test.ts apps/cli/tests/operations/replay-runner.test.ts apps/cli/tests/operations/evolve.test.ts` passed all 128 tests; the narrow invocation exited non-zero only because project-wide coverage thresholds are enforced even for partial test subsets. Full `bun run test` and `bun run spur-check` passed.

**Strategy.** Every behavior assertion runs against the deterministic `MockReplayBackend` — ZERO token
spend, CI-safe (mirrors SkillOpt's mock-backend discipline). Tests encode WHY, not just WHAT (R8): the
load-bearing test is "a behavior REGRESSION is blocked," because a gate that accepts regressions is the
exact failure this task exists to prevent.

**Unit — `eval-cases.test.ts`:**
- valid `cases.yaml` loads with correct shape + split partition.
- malformed reference_kind → structured error naming the offending case id + field.
- missing required field (prompt/reference) → structured error.
- absent file → returns `null` (this is what drives skip-when-absent — assert explicitly).

**Unit — `replay.test.ts`:**
- `scoreExact`: exact match → 1.0; mismatch → 0.0; whitespace/case variation still matches.
- `scoreRule`: each op (contains, regex, equals, not_contains, tool_called) pass + fail paths; a
  multi-check judge requires ALL to pass.
- `aggregateHard`: mean correctness; empty split → 0.0.

**Unit — `replay-runner.test.ts`:**
- `MockReplayBackend` returns scripted output per case id; `replaySplit` aggregates only the requested
  split (train cases excluded from a holdout call).

**Integration — `evolve.empirical-gate.test.ts` (the core of the task):**
- IMPROVE PASSES: candidate skill scores higher on holdout than baseline by ≥ margin → empirical gate
  ok, proposal accepted, `dimensions.empirical` persisted.
- REGRESSION BLOCKED: candidate scores LOWER on holdout → empirical gate fails with
  `failedGate:'empirical'`, file restored byte-identical from backup, proposal stays draft. (WHY: this
  is the behavior the form gate cannot catch.)
- WITHIN-MARGIN BLOCKED: candidate improves but by < margin → blocked (strict-improve discipline).
- ADDITIVE: a candidate that improves BEHAVIOR but FAILS the form delta-margin gate is still blocked
  (proves the empirical gate is layered on, not replacing, the form gate).
- SKIP-WHEN-ABSENT: `--eval-gate` set but no `cases.yaml` → empirical stage skipped, evolve proceeds on
  the form gate alone.

**Regression — `evolve.default-path.test.ts` (R6 invariant):**
- evolve WITHOUT `--eval-gate` and WITHOUT `cases.yaml`: spy on the replay-backend constructor; assert
  it is NEVER called and the post-evolve evaluation row carries NO `empirical` key. Behavior must be
  byte-identical to pre-task evolve.

**Coverage gate.** Per-file 90/90 (bunfig.toml is per-file, not just aggregate — cerebrum 2026-06-20).
New pure modules (`eval-cases.ts`, `replay.ts`) are fully unit-covered; the runner's real-backend shim
(hard to cover without spend) is isolated so the mock path carries coverage — if the shim drops below
90%, extract the un-coverable ts-ai-runner call to a one-line boundary function.

**Manual gate before Done:** `bun run lint && bun run test && bun run build && bun run spur-check` all
green; `git status` shows only intentional changes.


### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References
