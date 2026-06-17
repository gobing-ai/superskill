---
feature_id: F022
title: Scorer seam (evaluate --rubric / --ingest)
phase: 4
status: planned
depends_on: [F021]
deliverables:
  - apps/cli/src/operations/evaluate.ts
  - apps/cli/src/store/schema.ts (rubric_version stamping)
  - apps/cli/src/commands/helpers.ts (--rubric / --ingest options)
created: 2026-06-17
---

# F022 — Scorer seam (non-deterministic evaluation)

## What

Add a **scorer mode** to `evaluate` that produces the *same* `QualityReport` shape as the heuristic
path, but sourced from an LLM-judged rubric scoring done by the agent (design §2.1). The CLI
contributes two deterministic halves: an **envelope-out** (`--rubric … --json`) that hands the agent
everything it needs to score, and an **ingest-in** (`--ingest <scores.json> --save`) that validates
the agent's scores against the rubric schema and persists them.

## Why

Today `EVALUATORS` (`evaluate.ts:34`) is pure deterministic heuristics — keyword/regex counts, no
semantic judgment. The scorer seam lets a Scorer persona judge quality against a versioned rubric
while keeping the CLI provider-agnostic and replayable from fixtures. The envelope-not-direct-call
design keeps determinism, lets the rubric version travel with the score, and makes the agent step
testable (design §2.1 rationale).

## Change

### Two modes (design §2.1)

| Mode | Who runs it | Output |
|------|-------------|--------|
| `heuristic` (default, exists) | CLI | deterministic `QualityReport` |
| `rubric` (new) | agent/Spur Scorer persona → CLI ingests | LLM-judged `QualityReport` against a versioned rubric |

### CLI contribution — `operations/evaluate.ts`

Extend `EvaluateOptions` (currently `{ target?, json?, save? }`) with `{ rubric?: string, ingest?: string }`.

**Envelope-out** — `superskill <type> evaluate <name> --rubric <file> --json`:
- Loads the rubric via `loadRubric(type, { path: rubricFile })` (F021).
- Emits a single JSON envelope: `{ type, content_name, target, content: <file body+frontmatter>,
  rubric: <full rubric def incl. version>, baseline: <heuristic QualityReport> }`.
- This is a **work order** for the Scorer persona — no scoring happens in the CLI. Writes via
  `process.stdout.write`.

**Ingest-in** — `superskill <type> evaluate <name> --ingest <scores.json> --save`:
- Reads the agent-produced score set: `{ rubric_version, dimensions: { <name>: { score, note } }, … }`.
- **Validates** against the rubric schema: every dimension present, scores in [0,1], `rubric_version`
  matches the loaded rubric's `version`. Reject (exit 1) with a clear message on mismatch — never
  persist an unvalidated score.
- Computes the **weighted** aggregate (rubric weights from F021); heuristic mode stays equal-weighted.
- Persists an `evaluation` row tagged `operation: 'evaluate'` with a **`scorer: 'rubric'` marker** and
  the `rubric_version` stamped (see store change below).

### Store change — `store/schema.ts` + `store/evaluations.ts`

- Stamp the rubric `version` onto each rubric-scored `evaluation` row via a **new nullable
  `rubric_version` column** (decision locked 2026-06-17), added through the ts-db `defineTable`
  single-source-of-truth (ADR-014) — never raw `ALTER TABLE`. Heuristic rows leave it null; rubric
  rows carry the loaded rubric's `version`. Column is chosen over JSON-embedding for queryable
  version-aware trends (F024). Requires a ts-db migration registered in `store/db.ts`.
- Add a `scorer` marker (`'heuristic' | 'rubric'`) so the two aggregation methods are distinguishable.
- **Version-aware trends:** `computeTrends` (used by evolve, F013) must only compare scores from the
  **same** `rubric_version`, or flag a version boundary — a rubric change must not look like a quality
  regression (invariant #4). Adjust the trend query/logic accordingly.

### `commands/helpers.ts`

- Add `--rubric <file>` and `--ingest <file>` to the evaluate option group (`addCommonOptions` or a
  new `addEvaluateOptions`). These are mutually informative: `--rubric --json` = envelope; `--ingest
  --save` = persist. Document the two-call workflow in the command help.

### Invariants honored

- **CLI is deterministic** (design §8 #1): no model call; the LLM scoring happens in the agent, fed
  back as `--ingest` JSON.
- **One report shape** (#2): heuristic and rubric both produce `QualityReport`; downstream
  (trends/proposals/verify) is mode-agnostic.

## Acceptance

```bash
# Envelope-out
superskill agent evaluate my-agent --rubric ./agent.yaml --json
# → JSON envelope: { type, content_name, content, rubric (with version), baseline } → exit 0
# → NO score computed by the CLI; no model call

# Ingest-in (replay a recorded Scorer output)
superskill agent evaluate my-agent --ingest ./fixtures/scores.json --save
# → validates against rubric, weighted aggregate, row persisted with scorer='rubric', rubric_version=1
# → exit 0

# Ingest rejects a malformed score set
superskill agent evaluate my-agent --ingest ./bad-scores.json --save
# → exit 1, message names the offending dimension / version mismatch; NO row inserted

# Trends respect rubric version
# → computeTrends does not compare a version-1 score against a version-2 score (no false regression)
```
