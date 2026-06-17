---
name: Scorer seam evaluate rubric and ingest
description: Scorer seam evaluate rubric and ingest
status: Backlog
created_at: 2026-06-17T22:37:02.101Z
updated_at: 2026-06-17T22:37:02.101Z
folder: docs/tasks
type: task
feature-id: F022
priority: high
estimated_hours: 6
dependencies: ["0028"]
tags: ["phase4","scorer","evaluate","seam","store"]
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0029. Scorer seam evaluate rubric and ingest

### Background

Add a scorer mode to evaluate producing the SAME QualityReport shape as the heuristic path, sourced from LLM-judged rubric scoring done by the agent (design §2.1). The CLI contributes two deterministic halves: envelope-out (--rubric --json) hands the agent everything to score; ingest-in (--ingest <scores.json> --save) validates against the rubric schema and persists. Today EVALUATORS (evaluate.ts:34) is pure heuristics — no semantic judgment. The envelope-not-direct-call design keeps determinism, lets the rubric version travel with the score, and makes the agent step replayable from fixtures. DECISION LOCKED 2026-06-17: rubric version stamped via a NEW nullable rubric_version COLUMN via ts-db defineTable (ADR-014), not JSON-embedded, not raw ALTER. CLI never calls a model (invariant #1). Design: design-doc-phase4.md §2.1, §3.2. Owning feature: F022.


### Requirements

- [ ] **R1** — `EvaluateOptions` extended with `{ rubric?: string, ingest?: string }`.
- [ ] **R2** — Envelope-out (`evaluate <name> --rubric <file> --json`): emits `{ type, content_name, target, content, rubric (incl. version), baseline (heuristic QualityReport) }` via `process.stdout.write`. **No scoring, no DB write, no model call.**
- [ ] **R3** — Ingest-in (`evaluate <name> --ingest <scores.json> --save`): reads `{ rubric_version, dimensions:{name:{score,note}} }`.
- [ ] **R4** — Ingest **validation**: every rubric dimension present, scores ∈ [0,1], `rubric_version` matches loaded rubric `version`. On mismatch → exit 1, message names the offending field, **no row inserted**.
- [ ] **R5** — Weighted aggregate from rubric weights (F021); heuristic path unchanged (equal-weighted).
- [ ] **R6** — Persists `evaluation` row: `operation:'evaluate'`, **`scorer:'rubric'` marker**, `rubric_version` stamped.
- [ ] **R7** — New **nullable `rubric_version` column** added to the evaluations table via ts-db `defineTable` (ADR-014 — never raw `ALTER`); migration registered in `store/db.ts`. Heuristic rows leave it null.
- [ ] **R8** — `computeTrends` (used by F013 evolve) compares scores of the **same** `rubric_version` only (or flags a version boundary) — no false regression (invariant #4).
- [ ] **R9** — `--rubric <file>` and `--ingest <file>` added to the evaluate option group in `commands/helpers.ts`; two-call workflow documented in help.
- [ ] **R10** — `evaluate.ts` makes **no** model API call; no `bun:sqlite` import (store via ts-db DAO).

**Acceptance:**
```bash
superskill agent evaluate my-agent --rubric ./agent.yaml --json   # → envelope JSON, store row count unchanged
superskill agent evaluate my-agent --ingest ./scores.json --save  # → row w/ scorer='rubric', rubric_version=1
superskill agent evaluate my-agent --ingest ./bad-scores.json --save  # → exit 1, no row
```

**Out of scope:** generation seam (F023), the gate (F024).


### Q&A



### Design



### Solution

Extend evaluate.ts EvaluateOptions; envelope path loads rubric via loadRubric(type,{path}) (F021) and emits the work-order JSON envelope. Ingest path reads scores.json, validates against rubric schema, computes weighted aggregate, persists via EvaluationDao with scorer marker + rubric_version. store/schema.ts: add nullable rubric_version column through defineTable (single source for drizzle table+zod+DDL per ADR-014); register migration. store/evaluations.ts: add scorer marker. Adjust computeTrends (used by F013 evolve) to filter/flag by rubric_version. helpers.ts: add --rubric <file> + --ingest <file> to evaluate option group; document two-call workflow.


### Plan



### Review



### Testing

Tests ship **in this task** (design rule: each task owns its tests — no separate pure-test task).

- [ ] `tests/operations/evaluate-ingest.test.ts`:
  - Envelope-out (`evaluate --rubric --json`) emits `{ type, content_name, content, rubric(version), baseline }`; **no DB write, no model call** (assert store row count unchanged).
  - Ingest-in: a recorded `scores.json` fixture validates + persists with `scorer='rubric'` + `rubric_version`; weighted aggregate correct.
  - Ingest rejects: malformed score set (missing dimension / out-of-range / `rubric_version` mismatch) → exit 1, **no row** inserted.
  - Version-aware trends: a v1 and v2 score are not compared (no false regression).
- [ ] Fixture-replay only — `scores.json` hand-authored, never live-generated in the test run.
- [ ] Coverage for the evaluate seam branches + the `rubric_version` column path contributes to the ≥90% gate.
- [ ] No test skipped / `.skip`'d (R12).

Spy on `process.stdout.write` (project convention). `tests/fixtures/phase4/scores-<type>.json`.


### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References

- Design: [design-doc-phase4.md](../design/design-doc-phase4.md) §2.1, §3.2
- Feature: [F022](../features/F022-scorer-seam.md)
- Depends on: 0028 (loadRubric)
- Authority: docs/00_ADR.md ADR-014 (ts-db defineTable; rubric_version column locked 2026-06-17)
- Code: apps/cli/src/operations/evaluate.ts (EVALUATORS ~line 34), store/schema.ts

