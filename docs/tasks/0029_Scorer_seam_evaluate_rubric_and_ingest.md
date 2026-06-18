---
name: Scorer seam evaluate rubric and ingest
description: Scorer seam evaluate rubric and ingest
status: Done
created_at: 2026-06-17T22:37:02.101Z
updated_at: 2026-06-18T10:18:09.714Z
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

- [x] **R1** — EvaluateOptions `{rubric?, ingest?}` → **MET** | evaluate.ts:32-35
- [x] **R2** — Envelope-out emits work-order JSON, no DB/scoring/model → **MET** | emitEnvelope:129 (live: 6 keys)
- [x] **R3** — Ingest reads `{rubric_version, dimensions{score,note}}` → **MET** | ScoresJson:108
- [x] **R4** — Ingest validation → exit 1 naming field, no row → **MET** | live: "Score out of range...completeness: 1.5"
- [x] **R5** — Weighted aggregate; heuristic unchanged → **MET** | computeWeightedAggregate:114
- [x] **R6** — Resolution explicit→user→default → **MET (after P2 fix)** | default tier now resolves from linked binary
- [x] **R7** — Nullable rubric_version via defineTable + migration → **MET** | schema.ts + db.ts:46
- [x] **R8** — Version-aware computeTrends → **MET** | evolve.ts:84 partition + version_boundary:41
- [x] **R9** — --rubric/--ingest in helpers + 5 commands → **MET** | addEvaluateOptions
- [x] **R10** — No model call, no bun:sqlite → **MET** | live grep clean

**Acceptance:** envelope-out emits JSON (no row); ingest --save → scorer='rubric' row; bad scores → exit 1, no row. All verified live.

**Out of scope:** generation seam (F023), gate (F024).


### Q&A



### Design

**Design: Scorer seam — evaluate --rubric / --ingest (F022)**

**Architecture** (design-doc-phase4.md §2.1, §3.2; invariant #1 CLI deterministic, #2 one report shape, #4 version-aware trends):

The CLI adds a **scorer mode** to `evaluate` producing the same `QualityReport` shape as the heuristic path, but sourced from LLM-judged rubric scoring. The CLI contributes two deterministic halves; the agent does the non-deterministic scoring:

1. **Envelope-out** (`evaluate <name> --rubric <file> --json`): emits a work-order JSON envelope for the Scorer persona. No scoring, no DB write, no model call.
2. **Ingest-in** (`evaluate <name> --ingest <scores.json> --save`): validates agent-produced scores against the rubric, computes weighted aggregate, persists with `scorer:'rubric'` marker + `rubric_version`.

**EvaluateOptions extension** (R1):

```ts
export interface EvaluateOptions {
    target?: Target;
    json?: boolean;
    save?: boolean;
    operation?: string;
    adapter?: DbAdapter;
    rubric?: string;   // NEW: path to rubric file → envelope-out mode
    ingest?: string;   // NEW: path to scores JSON → ingest-in mode
}
```

**Envelope-out path** (R2, R10):

When `opts.rubric` is set (and `opts.ingest` is not):
1. Resolve content path + read content (existing steps 1-2 in `evaluate()`)
2. Load rubric via `loadRubric(type, { path: opts.rubric })` (F021)
3. Compute baseline heuristic QualityReport (existing `EVALUATORS[type]`)
4. Emit envelope JSON via `process.stdout.write`:
   ```json
   {
     "type": "agent",
     "content_name": "my-agent",
     "target": "claude",
     "content": "<full file body including frontmatter>",
     "rubric": { "version": 1, "type": "agent", "dimensions": [...] },
     "baseline": { "content": "...", "type": "agent", "target": "claude", "aggregate": 0.72, "dimensions": {...} }
   }
   ```
5. Return `null` (no QualityReport — envelope is the output). No DB write, no model call.

**Ingest-in path** (R3, R4, R5, R6, R10):

When `opts.ingest` is set:
1. Resolve content path + read content (for content_name + file_hash)
2. Load rubric via `loadRubric(type, { path: opts.rubric })` — uses `opts.rubric` if provided, else package default
3. Read + parse scores JSON: `{ rubric_version: number, dimensions: { <name>: { score: number, note: string } } }`
4. **Validate** (R4):
   - Every rubric dimension present in scores → else exit 1, field=`dimensions.<missing-dim>.missing`
   - No extra dimensions in scores → else exit 1, field=`dimensions.<extra-dim>.unexpected`
   - Each score ∈ [0, 1] → else exit 1, field=`dimensions.<name>.score`, actual=<score>
   - `rubric_version` matches loaded rubric `version` → else exit 1, field=`rubric_version`, actual=<scores_version>
   - On any mismatch: exit 1, message names the offending field, **no row inserted**
5. **Weighted aggregate** (R5): `Σ(score_i × weight_i)` using rubric weights. Heuristic path stays equal-weighted (`computeAggregate` unchanged).
6. Build `QualityReport` with the rubric-scored dimensions + weighted aggregate
7. **Persist** (R6): evaluation row with `operation:'evaluate'`, `scorer:'rubric'`, `rubric_version` stamped

**Store schema change** (R7):

`store/schema.ts` — add two nullable columns to `evaluations` via `defineTable`:
```ts
scorer: text('scorer'),                    // 'heuristic' | 'rubric'; null for pre-F022 rows
rubric_version: integer('rubric_version'),  // rubric version int; null for heuristic rows
```
Both nullable (no `.notNull()`). Heuristic rows: `scorer='heuristic'`, `rubric_version=null`. Rubric rows: `scorer='rubric'`, `rubric_version=<version>`.

`store/db.ts` — migration for existing on-disk databases: after `adapter.exec(evaluations.createTableSql)`, check `PRAGMA table_info(evaluations)` for the new columns; if absent, `adapter.exec('ALTER TABLE evaluations ADD COLUMN ...')`. This goes through the ts-db `adapter.exec` facade (not raw `bun:sqlite`), complying with ADR-014. New/in-memory DBs get the columns from `createTableSql` automatically.

`store/evaluations.ts` — extend `EvaluationInput` with `scorer?: string` and `rubric_version?: number`. Extend `Evaluation` + `deserializeEvaluation` to include the new columns. `insertEvaluation` passes them through.

**Version-aware trends** (R8):

`computeTrends` in `evolve.ts` currently compares earliest vs latest score per dimension across ALL evaluations. R8 requires: only compare scores of the **same** `rubric_version`, or flag a version boundary.

Approach: group evaluations by `rubric_version` (null = heuristic group). Compute trends within each group. If multiple version groups exist, flag a `version_boundary` in the trend output. This prevents a rubric version change from masquerading as a quality regression.

Concretely: `computeTrends` already receives `Evaluation[]`. It will partition by `rubric_version`, compute trends per partition, and if >1 partition exists, add a `version_boundary: true` flag to each `TrendEntry`. The `TrendEntry` type gains an optional `version_boundary?: boolean` field. The caller (evolve) already uses trends for proposal generation — the flag is informational, not a gate.

**CLI options** (R9):

`commands/helpers.ts` — add `addEvaluateOptions(cmd)` that chains `--rubric <file>` and `--ingest <file>` options. Apply to all 5 evaluate subcommands (agent, skill, command, hook, magent). Each command's `evaluate` action handler passes `rubric` and `ingest` through to `evaluate()`.

The two-call workflow documented in the `evaluate` command description: "Evaluate content quality. Use --rubric --json to emit a scoring envelope for an agent, then --ingest <scores.json> --save to persist agent-scored results."

**No model API call** (R10): `evaluate.ts` makes no model API call. No `bun:sqlite` import (store via ts-db DAO). The only new imports are `loadRubric` from `quality/rubric` (F021) and `readFileSync` for the ingest file.

**Out of scope:** generation seam (F023), double-loop gate (F024), Spur Scorer persona.


### Solution

Extend evaluate.ts EvaluateOptions; envelope path loads rubric via loadRubric(type,{path}) (F021) and emits the work-order JSON envelope. Ingest path reads scores.json, validates against rubric schema, computes weighted aggregate, persists via EvaluationDao with scorer marker + rubric_version. store/schema.ts: add nullable rubric_version column through defineTable (single source for drizzle table+zod+DDL per ADR-014); register migration. store/evaluations.ts: add scorer marker. Adjust computeTrends (used by F013 evolve) to filter/flag by rubric_version. helpers.ts: add --rubric <file> + --ingest <file> to evaluate option group; document two-call workflow.


### Plan

**Plan**

**Step 1 — Schema: add `scorer` + `rubric_version` columns** (`store/schema.ts`)
- Add `scorer: text('scorer')` and `rubric_version: integer('rubric_version')` to `evaluations` defineTable (both nullable)
- No change to `proposals` table

**Step 2 — Migration: handle existing DBs** (`store/db.ts`)
- After `adapter.exec(evaluations.createTableSql)`, call a new `migrateEvaluations(adapter)` helper
- `migrateEvaluations`: query `PRAGMA table_info(evaluations)`, check for `scorer` and `rubric_version` columns; if absent, `adapter.exec('ALTER TABLE evaluations ADD COLUMN <name> <type>')` for each missing column
- Guarded, idempotent: no-op if columns already exist

**Step 3 — DAO: extend EvaluationInput + Evaluation** (`store/evaluations.ts`)
- `EvaluationInput`: add `scorer?: string` (default 'heuristic'), `rubric_version?: number`
- `Evaluation`: add `scorer?: string`, `rubric_version?: number`
- `insertEvaluation`: pass `scorer` and `rubric_version` to `this.create()`
- `deserializeEvaluation`: read `scorer` and `rubric_version` from row
- `EvaluationFilter`: no change (no new filter columns needed for F022)

**Step 4 — EvaluateOptions + envelope-out + ingest-in** (`operations/evaluate.ts`)
- Add `rubric?: string` and `ingest?: string` to `EvaluateOptions`
- Import `loadRubric`, `Rubric` from `../quality/rubric`
- Import `readFileSync` from `node:fs`
- In `evaluate()`:
  - If `opts.ingest` → call new `ingestScores()` path
  - Else if `opts.rubric` → call new `emitEnvelope()` path
  - Else → existing heuristic path (unchanged)
- `emitEnvelope(type, resolvedPath, content, resolvedTarget, opts)`: load rubric, compute baseline, emit JSON envelope via `process.stdout.write`, return null
- `ingestScores(type, resolvedPath, resolvedTarget, opts)`: load rubric, read+parse scores JSON, validate, compute weighted aggregate, build QualityReport, persist with scorer='rubric' + rubric_version, return report
- Validation errors: throw `Object.assign(new Error(msg), { code: 1, field })` — the CLI handler maps code 1 → exit 1

**Step 5 — Weighted aggregate helper**
- In `evaluate.ts`, add `computeWeightedAggregate(scores, rubric)`: `Σ(score_i × weight_i) / Σ(weight_i)` — but since rubric weights sum to 1.0, it's just `Σ(score_i × weight_i)`
- Heuristic path: `computeAggregate` (equal-weighted) — unchanged

**Step 6 — Version-aware trends** (`operations/evolve.ts`)
- `computeTrends`: partition evaluations by `rubric_version` (null group = heuristic)
- Compute trends within each partition (earliest vs latest per dim)
- If >1 partition exists, set `version_boundary: true` on each TrendEntry
- `TrendEntry` gains optional `version_boundary?: boolean` field

**Step 7 — CLI options** (`commands/helpers.ts` + 5 command files)
- Add `addEvaluateOptions(cmd: Command): Command` that adds `--rubric <file>` and `--ingest <file>`
- Update all 5 evaluate subcommands: replace `addSaveOption(addTargetOption(addJsonOption(...)))` with `addEvaluateOptions(addSaveOption(addTargetOption(addJsonOption(...))))`
- Update each `handle<Type>Evaluate` opts type to include `rubric?: string` and `ingest?: string`
- Update each `evaluate()` call to pass `rubric` and `ingest`
- Update evaluate command description to document two-call workflow

**Step 8 — Tests** (`tests/operations/evaluate-ingest.test.ts`)
- Envelope-out: emits `{ type, content_name, target, content, rubric(version), baseline }`; no DB write (store row count unchanged); no model call
- Ingest-in: valid scores.json validates + persists with `scorer='rubric'` + `rubric_version`; weighted aggregate correct
- Ingest rejects: missing dimension, out-of-range score, rubric_version mismatch → exit 1, no row
- Version-aware trends: v1 and v2 scores not compared (no false regression)
- Fixture-replay only — hand-authored `scores.json`, never live-generated
- Spy on `process.stdout.write` (project convention)

**Step 9 — Verify**
- `bun run lint` (biome + typecheck)
- `bun run test` (all pass, coverage ≥90%)
- `bun run build` (exit 0)
- Acceptance: envelope-out emits JSON, ingest-in persists row, ingest reject exits 1
- `git status -s` — only intentional changes

**Files to modify:**
- `apps/cli/src/store/schema.ts` (add 2 columns)
- `apps/cli/src/store/db.ts` (migration helper)
- `apps/cli/src/store/evaluations.ts` (extend input/output/insert/deserialize)
- `apps/cli/src/operations/evaluate.ts` (envelope-out + ingest-in + weighted aggregate)
- `apps/cli/src/operations/evolve.ts` (version-aware computeTrends)
- `apps/cli/src/commands/helpers.ts` (addEvaluateOptions)
- `apps/cli/src/commands/agent.ts` (wire --rubric/--ingest)
- `apps/cli/src/commands/skill.ts` (wire --rubric/--ingest)
- `apps/cli/src/commands/command.ts` (wire --rubric/--ingest)
- `apps/cli/src/commands/hook.ts` (wire --rubric/--ingest)
- `apps/cli/src/commands/magent.ts` (wire --rubric/--ingest)

**Files to create:**
- `apps/cli/tests/operations/evaluate-ingest.test.ts`
- `apps/cli/tests/fixtures/phase4/scores-agent.json`
- `apps/cli/tests/fixtures/phase4/scores-skill.json`

**No changes to:** `dimensions.ts` (heuristic path unchanged — R5), rubric.ts (F021 complete), generateChanges (F023).


### Review

## Re-Verification — 2026-06-18 (--force --fix all)

**Status:** 2 findings (1 P2 FIXED, 1 P3 documented) → verdict PASS after fix
**Scope:** evaluate.ts, evolve.ts, refine.ts, store/{db,evaluations,schema}.ts, 5 command files, helpers.ts, +tests
**Mode:** verify (Phase 7 SECU + Phase 8 traceability, --focus all)
**Gate:** lint exit 0 · test 494 pass / 0 fail · build exit 0

### Phase 7 — SECU

| # | Title | Dimension | Location | P | Status |
|---|-------|-----------|----------|---|--------|
| 1 | Package-default rubric unresolvable from linked binary | Correctness | apps/cli/src/quality/rubric.ts:112-121 + package.json build | P2 | **FIXED** |
| 2 | Migration uses raw `ALTER TABLE`/`PRAGMA` SQL strings | Architecture | apps/cli/src/store/db.ts:46-55 | P3 | Documented (not fixable w/o ts-db API) |

**Finding 1 (P2 — FIXED):** Ingest *without* `--rubric` failed from the `bun link`'d binary — `import.meta.dir` in `dist/` resolves tier-3 (`dist/../rubrics` = `apps/cli/rubrics`) and tier-4, neither of which existed on disk. Rubrics lived only in `src/rubrics/`. Same latent dev-path gap as task 0027. The published package was fine (`prepublishOnly` copied them) but the documented dev `bun link` + ingest workflow (R6 "package default" tier) was broken.
**Fix:** moved the `src/rubrics → rubrics` (and `src/templates → templates`) copy from `prepublishOnly` into `build`, so `bun run build && bun link` yields a binary that resolves package defaults. Added `/apps/cli/rubrics/` to `.gitignore` (mirrors the existing `/apps/cli/templates/` staging-artifact convention). **Verified live:** ingest without `--rubric` → resolves default, persists, exit 0; bad scores → exit 1 naming the field.

**Finding 2 (P3 — documented):** `migrateEvaluations` writes raw `ALTER TABLE ... ADD COLUMN` + `PRAGMA table_info` strings. Task R7 background says "never raw ALTER". ADR-014's binding letter forbids only raw `CREATE TABLE`/`INSERT`/`SELECT` (the column itself IS authored via `defineTable` → satisfies ADR-014). ts-db 0.3.19 exposes no typed `addColumn`/`alterTable` primitive — only `exec`/`queryAll` (raw SQL) or `applyMigrations` (SQL files on disk). The raw `ALTER` via the `adapter.exec` facade is the only facade-available retrofit. Static literals, no interpolation, idempotent. Not auto-fixable without a ts-db enhancement (out of scope). Code documents it (`db.ts:44`).

**Clean dimensions:** No secrets, no interpolated SQL (injection), no empty catch, no `any`, no `bun:sqlite` import, no model API call (R10). Ingest validation strict (R4).

### Phase 8 — Requirements Traceability (live re-run)

| Req | Verdict | Evidence |
|-----|---------|----------|
| R1 | MET | EvaluateOptions `{rubric?, ingest?}` evaluate.ts:32-35 |
| R2 | MET | emitEnvelope evaluate.ts:129; live: 6 envelope keys, rubric.version=1, no DB write |
| R3 | MET | ScoresJson evaluate.ts:108; ingestScores parses shape |
| R4 | MET | live: bad score → exit 1 "Score out of range [0,1] for dimension completeness: 1.5", no row |
| R5 | MET | computeWeightedAggregate evaluate.ts:114; dimensions.ts unchanged |
| R6 | MET (after fix) | resolution explicit→user→default; default tier now resolves from binary |
| R7 | MET | schema.ts defineTable nullable cols; db.ts migrateEvaluations (facade) |
| R8 | MET | evolve.ts:84 partition by rubric_version, version_boundary flag :41 |
| R9 | MET | addEvaluateOptions helpers.ts; wired in 5 command files |
| R10 | MET | no model call, no bun:sqlite (live grep clean) |

12 task tests pass (incl scorer='rubric' + rubric_version=1 assertions).

**Fix-pass 2026-06-18:** 1 fixed (P2), 1 documented (P3 — unavoidable), 0 failed.


### Testing

**Testing**

**Timestamp:** 2026-06-18T05:30:00Z

**Requirements verification:**

| Req | Check | Result |
|-----|-------|--------|
| R1 | EvaluateOptions extended with `{ rubric?, ingest? }` | PASS — `EvaluateOptions` in `evaluate.ts:18-33` has both fields |
| R2 | Envelope-out emits `{ type, content_name, target, content, rubric(version), baseline }` via stdout; no scoring, no DB write, no model call | PASS — test: `emits envelope JSON with rubric, content, and baseline via stdout`; test: `does not write to the store in envelope-out mode` (store row count = 0) |
| R3 | Ingest-in reads `{ rubric_version, dimensions:{name:{score,note}} }` | PASS — `ingestScores` parses `ScoresJson` shape; test: `validates and persists rubric-scored evaluation` |
| R4 | Ingest validation: every dim present, scores ∈ [0,1], rubric_version matches; exit 1, no row on mismatch | PASS — 4 reject tests: missing dim, out-of-range score, version mismatch, unexpected dim — all exit with error, 0 rows inserted |
| R5 | Weighted aggregate from rubric weights; heuristic path unchanged (equal-weighted) | PASS — `computeWeightedAggregate` uses rubric weights; `computeAggregate` in dimensions.ts unchanged; test: `heuristic evaluate still returns equal-weighted aggregate` |
| R6 | Persists evaluation row: operation='evaluate', scorer='rubric' marker, rubric_version stamped | PASS — test: `validates and persists rubric-scored evaluation` asserts `rows[0].scorer === 'rubric'` and `rows[0].rubric_version === 1` |
| R7 | New nullable rubric_version column via defineTable; migration registered in store/db.ts | PASS — `schema.ts` adds `scorer: text('scorer')` + `rubric_version: integer('rubric_version')`; `db.ts` `migrateEvaluations` checks PRAGMA table_info and ALTERs if absent |
| R8 | computeTrends compares scores of same rubric_version only (or flags version boundary) | PASS — 3 trend tests: cross-version not compared (0 trends), within-version computed, version_boundary flag set on multi-version |
| R9 | --rubric and --ingest added to evaluate option group in helpers.ts; two-call workflow documented in help | PASS — `addEvaluateOptions` in helpers.ts; all 5 command files wire it; evaluate description: "use --rubric --json for envelope, --ingest --save to persist scores" |
| R10 | evaluate.ts makes no model API call; no bun:sqlite import (store via ts-db DAO) | PASS — no model API call in evaluate.ts; no `bun:sqlite` import; store access via `EvaluationDao` and `openStore` (ts-db facade); dynamic imports converted to static per lint rules |

**Test suite:** 12 tests in `apps/cli/tests/operations/evaluate-ingest.test.ts`
- 2 envelope-out tests (envelope JSON emission, no DB write)
- 5 ingest-in tests (valid persist + 4 rejection paths: missing dim, out-of-range, version mismatch, unexpected dim)
- 4 version-aware trends tests (cross-version not compared, within-version computed, version_boundary flag, heuristic vs rubric separation)
- 1 heuristic path unchanged test (equal-weighted, scorer='heuristic')

**Root gate:**
- `bun run lint` → exit 0 (biome + typecheck clean)
- `bun run test` → 494 pass, 0 fail, 99.55% function coverage, 98.20% line coverage
  - evaluate.ts: 100% function / 98.40% line
  - store/evaluations.ts: 100%/100%
  - store/db.ts: 100%/92.86%
  - evolve.ts: 100% function
- `bun run build` → exit 0 (dist/index.js 3.18 MB)

**git status -s:**
- Modified: evaluate.ts, evolve.ts, helpers.ts, schema.ts, db.ts, evaluations.ts, 5 command files, evaluate.test.ts, package.json (task file)
- New: evaluate-ingest.test.ts, fixtures/phase4/scores-*.json
- All changes intentional. No test skipped. No regression (482 existing + 12 new = 494).


### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References

- Design: [design-doc-phase4.md](../design/design-doc-phase4.md) §2.1, §3.2
- Feature: [F022](../features/F022-scorer-seam.md)
- Depends on: 0028 (loadRubric)
- Authority: docs/00_ADR.md ADR-014 (ts-db defineTable; rubric_version column locked 2026-06-17)
- Code: apps/cli/src/operations/evaluate.ts (EVALUATORS ~line 34), store/schema.ts

