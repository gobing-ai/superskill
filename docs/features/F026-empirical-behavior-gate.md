---
id: F026
title: Empirical behavior gate (evolve --eval-gate)
status: done
phase: 4
updated_at: 2026-06-23
depends_on: [F024]
code:
  - packages/core/src/quality/eval-cases.ts
  - packages/core/src/quality/replay.ts
  - apps/cli/src/operations/replay-runner.ts
  - apps/cli/src/operations/pairwise-judge.ts
  - apps/cli/src/operations/noise-floor.ts
  - apps/cli/src/operations/evolve.ts
---

# F026 — Empirical Behavior Gate

`superskill agent|command|magent|skill evolve --eval-gate` adds an opt-in behavior gate after the form Δ-margin gate. When `skills/<name>/eval/cases.yaml` exists, held-out cases are replayed against baseline and candidate skill text; the proposal is accepted only when candidate behavior strictly improves.

Eval cases support `reference_kind: exact`, `rule`, and `rubric`. Exact/rule references are deterministic. Rubric references replay both outputs, run one pairwise candidate-vs-baseline judge call for the measured case, estimate a signed-margin noise floor from N judge replays, and treat within-noise wins as no improvement. Budget caps fail loud and restore the candidate file.

The gate is default-off and skip-when-absent: without `--eval-gate`, without `cases.yaml`, or without rubric cases, no judge backend is constructed.
