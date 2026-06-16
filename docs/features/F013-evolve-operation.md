---
feature_id: F013
title: Evolve operation
phase: 2
status: planned
depends_on: [F007, F008, F011]
deliverables:
  - apps/cli/src/operations/evolve.ts
created: 2026-06-16
---

# F013 — Evolve operation

## What

Self-evolution loop — the key enhancement over origin Claude Code skills. 5-step workflow: (1) ANALYZE historical evaluations from the SQLite store — read evaluations for `(content_type, content_name)` ordered by date, identify trends (improving/declining/flat), rank dimensions by delta and lowest score; (2) PROPOSE improvements — for each low-scoring dimension, draft a change with location/old/new, generate proposal file at `proposals/<type>/<name>/YYYY-MM-DD-<id>.md`; (3) REVIEW — interactive (default) or `--propose-only` (generates proposal without applying); (4) APPLY accepted changes — edit content file in place, record proposal status; (5) VERIFY — run evaluate on changed content, show score delta from baseline, save post-evolution evaluation linking back via `verify_id`. Supports `--from <date>` to filter evaluations, `--accept`/`--reject <id>` for specific proposals.

## Why

This is the unique capability that makes superskill more than a CLI wrapper — it learns from past evaluations to propose concrete, data-backed improvements. Without evolve, the quality commands are just scorecards; with it, they're a continuous improvement engine.

## Change

### `operations/evolve.ts`

Export `evolve(type, name, opts?)` function:

- `type`: `'skill' | 'command' | 'agent' | 'hook' | 'magent'`
- `name`: content name (resolves to file path)
- `opts`: `{ target?: Target, from?: string, proposeOnly?: boolean, acceptId?: string, rejectId?: string, adapter?: DbAdapter }`
- Store access is via ts-db DAOs (F008, ADR-014): `const adapter = opts.adapter ?? await openStore()`, then `new EvaluationDao(adapter)` / `new ProposalDao(adapter)`. No `bun:sqlite` import in `evolve.ts`. All store calls are `await`ed.

**Step 1 — ANALYZE:**

- Read evaluations from `await evalDao.getEvaluations(type, name)` (ordered by `created_at`).
- Compute trend per dimension: simple delta (latest score - earliest score) classified as improving (↑ ≥ 0.05), declining (↓ ≤ -0.05), flat (→ within ±0.05).
- Rank dimensions: lowest current score first, ties broken by largest negative delta.
- Produce a `TrendTable`: `{ dimension, earliest, latest, delta, trend }[]`.

**Step 2 — PROPOSE:**

- For each declining or flat-and-low (< 0.7) dimension, draft a structured change:
  ```ts
  { dimension: string, location: string, current: string, proposed: string, reason: string }
  ```
- Generate proposal JSON with `proposal_id`, `content`, `type`, `baseline_score`, `baseline_date`, `from_evaluations`, `trend_analysis`, and `changes[]`.
- Write proposal file at `<getProposalsDir()>/<type>/<name>/YYYY-MM-DD-<seq>.md` (F007 owns `getProposalsDir`; the path **always** includes the `<type>/` segment — ADR-013). `<name>` is `resolveContentName` (F007). YAML frontmatter + markdown body (trend table + proposed-changes sections per design doc §2.5).
- Insert proposal row via `await proposalDao.insertProposal(record)`.

**Step 3 — REVIEW:**

- `--propose-only` mode: write proposal file and exit (status remains `'draft'`).
- `--accept <id>`: load proposal by id, mark all changes as accepted, jump to step 4.
- `--reject <id>`: load proposal by id, update status to `'rejected'`, exit.
- Interactive mode (default): display each proposed change with line/old/new/reason, prompt for accept/reject/edit per change.

**Step 4 — APPLY:**

- For each accepted change, edit the content file in place through `applyChange` from `content/edit.ts` (F007) — the **same** primitive refine (F012) uses. Frontmatter changes use `{ kind: 'frontmatter', key, value }`; body changes use `{ kind: 'text', current, proposed }` (locate nearest match, replace). `evolve.ts` contains no bespoke edit logic.
- Call `await proposalDao.updateProposalStatus(id, 'accepted', { appliedAt: new Date().toISOString() })`.

**Step 5 — VERIFY:**

- Run `evaluate(type, name, { target })` to get post-evolution score.
- Compute delta: `postScore - baselineScore`.
- Display score delta prominently via `process.stdout.write`.
- Save evaluation via `await evalDao.insertEvaluation({ ...postEval, operation: 'evolve', file_hash: hashContent(path), target_agent: resolvedTarget })` — `operation` passed explicitly, `file_hash` from `hashContent` (F007), `target_agent` defaulting to `'claude'`.
- Link back: `await proposalDao.updateProposalStatus(id, 'accepted', { verifyId: newEvalId })`.
- Return `{ baselineScore, postScore, delta, changesApplied, proposalPath }`.

**Error handling:**

- No historical evaluations found → error with guidance to run `evaluate --save` first.
- Content file not found → exit 2 (same convention as validate).
- Store unavailable → error with guidance on DB initialization.

**Helper exports:**

- `computeTrends(evaluations: Evaluation[]): TrendTable` — reusable trend analysis.
- `generateChanges(report: QualityReport, trends: TrendTable): ProposedChange[]` — generates changes from quality report + trend data.

## Acceptance

```
# Full loop with 5 historical evaluations
superskill skill evolve my-skill
# 1. Analyzes 5 historical evaluations
# 2. Trend table: trigger-accuracy ↓ declining (0.75→0.68)
# 3. Proposes 2 changes (1 auto, 1 suggested)
# 4. User accepts both
# 5. Content updated in place
# 6. Post-evolution score: 0.82 → 0.89
# → exit 0

# Propose-only
superskill skill evolve my-skill --propose-only
# → Generates <data-root>/.superskill/proposals/skill/my-skill/2026-06-16-001.md
# → No changes applied → exit 0

# Accept specific proposal
superskill skill evolve my-skill --accept skill-evolve-2026-06-16-001
# → Applies accepted proposal → re-evaluates → exit 0
```
