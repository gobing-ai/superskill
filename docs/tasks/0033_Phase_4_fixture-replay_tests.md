---
name: Phase 4 fixture-replay tests
description: Phase 4 fixture-replay tests
status: Canceled
created_at: 2026-06-17T22:37:59.336Z
updated_at: 2026-06-17T23:18:07.603Z
folder: docs/tasks
type: task
feature-id: F025
priority: high
estimated_hours: 6
dependencies: ["0028","0029","0030","0031","0032"]
tags: ["phase4","tests","fixtures","coverage"]
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0033. Phase 4 fixture-replay tests

### Background

Fixture-driven tests for the non-deterministic layer: record representative agent outputs (Scorer scores, Author proposals, Skeptic verdicts) as JSON fixtures, then REPLAY them through the CLI ingest paths so the seams and gate are fully tested WITHOUT any live model call (design §5.1, §7 exit #6). Maintain >=90% line/function coverage. The whole Phase 4 design rests on the CLI being deterministic and provider-agnostic (invariant #1); fixture-replay proves it — if the CLI's ingest/gate logic is fully exercised from recorded JSON, the CLI genuinely makes no model call. Design: design-doc-phase4.md §5.1, §7. Owning feature: F026.


### Requirements

- [ ] **R1** — `tests/quality/rubric.test.ts` (F021): resolution order (explicit→user→default); validation errors (unknown dim / weights ≠ 1.0 / missing version → `RubricError`); all 5 defaults load + names match `DIMENSION_REGISTRY`.
- [ ] **R2** — `tests/operations/evaluate-ingest.test.ts` (F022): envelope-out emits the work order + **no DB write, no model call** (store row count unchanged); ingest validates + persists `scorer='rubric'` + `rubric_version`; malformed score set → exit 1, no row; version-aware trends (v1 vs v2 not compared).
- [ ] **R3** — `tests/operations/evolve-ingest.test.ts` (F023): briefs carry the **verbatim** anchor (original frontmatter + negative constraints unchanged); ingest applies real `proposed` text via `applyChange`; **no `[Improve` placeholder** in any output.
- [ ] **R4** — `tests/operations/gate.test.ts` (F024): regressive → restore (content byte-identical) + proposal `draft`; validate-fail → restore; anchor-tampered (`anchor_hash` mismatch) → restore; skeptic-veto (`{ok:false}`) → restore; good → applied + `verify_id` linked + post-eval row.
- [ ] **R5** — Fixtures in `tests/fixtures/phase4/`: `scores-<type>.json`, `proposal-good/regressive/invalid/anchor-tampered.json`, `skeptic-veto.json` — hand-authored, **never** live-generated in the test run.
- [ ] **R6** — Coverage gate maintained: **line ≥ 90% and function ≥ 90%** aggregate (`bunfig.toml`); rubric loader, evaluate/evolve seam branches, gate branches all covered.
- [ ] **R7** — **No model/provider/network call** reachable from the tested paths (`operations/`, `quality/`) — all intelligence enters as fixture JSON (invariant #1).
- [ ] **R8** — No test skipped, `.skip`'d, or commented out to go green (R12 / project gate).

**Acceptance:**
```bash
bun run test                          # → all pass, none skipped
bun run test 2>&1 | rg "%|coverage"   # → line ≥ 90%, function ≥ 90%
rg -i "anthropic|openai|fetch\(|http" apps/cli/src/operations/ apps/cli/src/quality/  # → none
```

**Dependency note:** gates on 0028–0032. Runs last in Phase 4.


### Q&A



### Design



### Solution

Use bun:test, tests next to code (apps/cli/tests/). Fixtures in tests/fixtures/phase4/: scores-<type>.json, proposal-good/regressive/invalid/anchor-tampered.json, skeptic-veto.json — realistic, hand-authored. Assert envelope path leaves store row count unchanged + makes no model call. Assert gate-fail paths leave content byte-identical to pre-apply + proposal stays draft. Assert evolve never emits the old TODO placeholder. Cover quality/rubric.ts, evaluate/evolve seam branches, gate branches. Spy on process.stdout.write for CLI output (project convention). Verify no anthropic/openai/fetch/http reachable from operations/ + quality/.


### Plan



### Review



### Testing



### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References


