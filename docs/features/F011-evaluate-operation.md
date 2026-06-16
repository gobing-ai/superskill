---
feature_id: F011
title: Evaluate operation
phase: 2
status: planned
depends_on: [F007, F008, F009]
deliverables:
  - apps/cli/src/operations/evaluate.ts
created: 2026-06-16
---

# F011 — Evaluate operation

## What

Quality scoring across type-specific dimensions per design doc §2.3 and §3. Each dimension returns a 0.0–1.0 score plus a one-line note. Computes an aggregate score as the weighted average of all dimensions. Supports `--json` for machine-readable output, `--save` to persist to the SQLite evaluation store (F008), and `--target` for agent-specific evaluation.

## Why

The measurement engine. `evaluate` drives refine decisions (which dimensions to fix) and provides the data points for `evolve`'s longitudinal trend analysis. Without a scoring baseline, refine is guesswork and evolve has no history to analyze.

## Change

### `operations/evaluate.ts`

- Export `evaluate(type: ContentType, path: string, opts?: EvaluateOptions): Promise<EvaluationResult>`
  - `EvaluateOptions`: `{ target?: Target, json?: boolean, save?: boolean }`
  - `--target` dispatches to agent-specific evaluator variants from F009
  - `--json` outputs raw JSON; otherwise human-readable table
  - `--save` persists via the F008 `EvaluationDao` (ts-db, ADR-014) — `await new EvaluationDao(await openStore()).insertEvaluation(…)`
- Export `EvaluationResult`: `{ content: string, type: ContentType, target: Target, aggregate: number, dimensions: Record<string, DimensionScore> }`
- Export `DimensionScore`: `{ score: number, note: string }`
- Dispatches to type-specific evaluator functions from F009:
  - `quality/skill.ts` → skill dimensions: completeness, clarity, trigger-accuracy, anti-hallucination, conciseness
  - `quality/command.ts` → command dimensions: completeness, clarity, argument-hints, tool-references, slash-syntax
  - `quality/agent.ts` → agent dimensions: completeness, role-clarity, tool-selection, skill-linkage, model-fit
  - `quality/hook.ts` → hook dimensions: correctness, event-coverage, safety, pattern-match-quality
  - `quality/magent.ts` → magent dimensions: completeness, platform-coverage, conciseness, tone-consistency, safety
- Aggregate score: weighted average of all dimension scores (default equal weights; F009 may define per-type weight overrides)
- Score range: 0.0 (worst) to 1.0 (best)
- `target` resolution: `opts.target ?? 'claude'` — the result and any persisted row always carry a concrete agent, never empty/undefined (ADR-013).
- `content` field: `resolveContentName(path)` (F007).
- When `--save`: opens the store via `await openStore()` (F008, ts-db — ADR-014) and calls `await new EvaluationDao(adapter).insertEvaluation(…)` with `operation: 'evaluate'` (passed explicitly — the store never defaults it), `file_hash: hashContent(path)` (F007), `target_agent: resolvedTarget`, and the dimension breakdown as JSON. No `bun:sqlite` import in `evaluate.ts`.
- Human-readable output: table with dimension name, score bar, and note — written via `process.stdout.write` (not `console.log`) so test spies capture it.
- JSON output matches design doc §2.3 schema: `{ content, type, target, aggregate, dimensions }`

## Acceptance

```
# JSON output with persistence
superskill skill evaluate my-skill --json --save
# → JSON with content/type/target/aggregate/dimensions → exit 0
# → Row inserted in evaluations table (verify via store query)

# Agent evaluation for specific target
superskill agent evaluate my-agent --target codex
# → Scores agent against codex-specific dimensions → exit 0

# Human-readable table (no --json)
superskill skill evaluate my-skill
# → Formatted table:
#   completeness    0.85  Missing error-handling guidance
#   clarity         0.90  Well-structured sections
#   trigger-accuracy 0.75  Trigger phrases overlap with rd3-code-review
#   anti-hallucination 0.80  References external APIs without verification step
#   conciseness     0.80  Some redundant examples in §3
#   ─────────────────────
#   AGGREGATE       0.82

# Evaluate with save produces a row
superskill skill evaluate my-skill --save
# → exit 0
# → select * from evaluations where content_type='skill' and content_name='my-skill' returns 1 row
```
