---
name: Evolve operation
description: Self-evolution loop — analyze historical evaluations, propose data-backed improvements, review/apply, verify post-score delta. The key enhancement over origin Claude Code skills.
status: Planned
created_at: 2026-06-16T00:00:00.000Z
updated_at: 2026-06-16T00:00:00.000Z
folder: docs/tasks
type: task
feature-id: F013
priority: high
estimated_hours: 6
tags: ["operations","evolve","self-improvement","longitudinal"]
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0013. Evolve operation

### Background

The self-evolution loop is the unique capability that makes superskill more than a CLI wrapper — it learns from past evaluations to propose concrete, data-backed improvements. A 5-step workflow: (1) ANALYZE historical evaluations from the SQLite store, identify trends per dimension, rank by delta and lowest score; (2) PROPOSE improvements for low-scoring dimensions, generate a structured proposal file; (3) REVIEW via interactive or `--propose-only` mode; (4) APPLY accepted changes to the content file in place; (5) VERIFY by re-evaluating and showing the score delta.

Unlike validate/evaluate/refine — which work on a single snapshot — evolve is longitudinal. It reads the evaluation history for a given `(type, name)` pair, computes per-dimension trends, and generates proposals that are themselves tracked in the store (proposals table). This closes the loop: evaluate → evolve → apply → re-evaluate → evolve again.

### Requirements

**R1** — Export `evolve(type: ContentType, name: string, opts?: EvolveOptions): Promise<EvolveResult>`. The `name` is a bare content name (not a file path — evolve resolves the path via `resolveContentPath` from F007, same as other operations). Returns `{ baselineScore, postScore, delta, changesApplied, proposalPath }`.

**R2** — `EvolveOptions` type: `{ target?: Target, from?: string, proposeOnly?: boolean, acceptId?: string, rejectId?: string, adapter?: DbAdapter }`. `from` is an ISO date string filtering evaluations to those after that date. `adapter` allows test injection of an in-memory DB. Store access is via ts-db DAOs (F008, ADR-014): `const db = opts.adapter ?? await openStore()`, then `new EvaluationDao(db)` / `new ProposalDao(db)`. No `bun:sqlite` import in evolve.ts.

**R3** — `EvolveResult` type: `{ baselineScore: number, postScore: number, delta: number, changesApplied: number, proposalPath: string }`. `baselineScore` is the aggregate of the most recent pre-evolution evaluation. `postScore` is the aggregate after changes are applied and re-evaluated. `delta = postScore - baselineScore`. `changesApplied` counts how many of the proposal's changes were accepted and applied.

**R4** — **Step 1 — ANALYZE**: Query evaluations via `await evalDao.getEvaluations(type, name)`. If `opts.from` is set (an ISO date string), filter evaluations where `created_at >= Date.parse(opts.from)` — **`created_at` is an epoch-millis `number`** (ts-db `appendOnlyColumns`, see F008), so compare numerically; do not string-compare against the ISO `from`. If fewer than 2 evaluations exist after filtering → error: "No historical evaluations found for <type>/<name>. Run `superskill <type> evaluate <name> --save` first to build evaluation history." Exit with message (do not crash; return a result that the command layer maps to exit 1).

Compute trend per dimension:
- Group evaluations by dimension. For each dimension:
  - `earliest` = first evaluation's score for that dimension
  - `latest` = last evaluation's score for that dimension
  - `delta = latest - earliest`
  - `trend` = classify(delta):
    - `'improving'` if delta ≥ 0.05
    - `'declining'` if delta ≤ -0.05
    - `'flat'` if |delta| < 0.05
- Rank dimensions: lowest `latest` score first; ties broken by largest negative `delta`.

Produce a `TrendTable` — an array of `{ dimension, earliest, latest, delta, trend }` objects.

**R5** — `TrendTable` type: `Array<{ dimension: string, earliest: number, latest: number, delta: number, trend: 'improving' | 'declining' | 'flat' }>`. This is the return type of `computeTrends(evaluations: EvaluationRecord[]): TrendTable`, which is exported as a pure function for unit testing without a DB.

**R6** — **Step 2 — PROPOSE**: For each dimension in the trend table that is either:
- `trend: 'declining'` (any score), OR
- `trend: 'flat'` AND `latest < 0.7` (flat and below the improvement threshold)

Generate a `ProposedChange`:
```typescript
interface ProposedChange {
    dimension: string;
    location: string;       // description of where in the content the change goes
    current: string;        // the current text or value
    proposed: string;       // the proposed replacement
    reason: string;         // why this change is recommended
}
```

`location` should reference a specific frontmatter field (like `frontmatter.skill:`) or a body section heading. `current` and `proposed` are exact text strings for the text-based `applyChange` (F007 `content/edit.ts`).

Generate `ProposalRecord`:
```typescript
interface ProposalRecord {
    content_type: ContentType;
    content_name: string;
    baseline_id: number;        // ID of the most recent evaluation used as baseline
    proposal_json: string;      // JSON stringified — changes array + trend analysis
    status: 'draft' | 'accepted' | 'rejected';
    created_at: string;         // ISO timestamp
}
```

Insert via `await proposalDao.insertProposal(record)` — returns the numeric id.

Generate proposal file at `<proposalsDir>/<type>/<name>/YYYY-MM-DD-<id>.md` where:
- `<proposalsDir>` = `getProposalsDir()` (F007 `content/paths.ts`) — resolves to `<data-root>/.superskill/proposals/`
- `<type>` = the content type segment (always included, per ADR-013)
- `<name>` = `resolveContentName` result (F007)
- `<id>` = `proposal_id` format: `<type>-evolve-<YYYY-MM-DD>-<NNN>` where NNN is zero-padded sequence number
- Sequence number: count existing proposals for this `(content_type, content_name)` in the store + 1

Proposal file format (design doc §2.5):
```markdown
---
proposal_id: <type>-evolve-YYYY-MM-DD-NNN
content: <content_name>
type: <content_type>
baseline_score: <score>
baseline_date: <ISO date of baseline evaluation>
from_evaluations: <count of evaluations analyzed>
---

# Evolution Proposal: <content_name>

## Trend analysis

| Dimension | Baseline | Current | Trend |
|-----------|----------|---------|-------|
| <dim>     | <earliest> | <latest> | <↑ improving / ↓ declining / → flat> |

## Proposed changes

### 1. Fix declining <dimension> (score: <earliest> → <latest>)
**Location:** <change.location>
**Current:** <change.current>
**Proposed:** <change.proposed>
**Reason:** <change.reason>
```

Write the proposal file via `Bun.write()` (or `writeFileSync` from `node:fs`). Create parent directories if needed (`mkdirSync` with `recursive: true`).

**R7** — `generateProposalId(type, name, existingIds: number[]): string` — exported helper. Formats as `<type>-evolve-<YYYY-MM-DD>-<NNN>` where NNN = max(existingIds) + 1, zero-padded to 3 digits.

**R8** — **Step 3 — REVIEW**: Three modes controlled by `opts`:
- **`--propose-only`** (`opts.proposeOnly === true`): Write the proposal file only. Do not apply any changes. Proposal status remains `'draft'` in the store. Return with `changesApplied: 0` and `postScore: baselineScore` (no delta).
- **`--accept <id>`** (`opts.acceptId`): Load the proposal by `proposal_id` from the store via `await proposalDao.getProposals(type, name)` filtered by `proposal_id`. Mark all changes in `proposal_json.changes` as accepted. Jump to Step 4 (APPLY).
- **`--reject <id>`** (`opts.rejectId`): Load the proposal by `proposal_id`. Call `await proposalDao.updateProposalStatus(id, 'rejected')`. No content changes. Return immediately.
- **Interactive mode** (default — none of the above flags set): Display the trend table. For each proposed change, show:
  ```
  Change 1/2: <dimension> (score: <earliest> → <latest>)
  Location: <location>
  Current:  <current>
  Proposed: <proposed>
  Reason:   <reason>

  (a)ccept / (r)eject / (e)dit / (q)uit
  ```
  Read user input via `process.stdin` with `bun:readline` (or `node:readline`). On `a` → mark accepted. On `r` → mark rejected. On `e` → prompt for new proposed text, then mark accepted with edited text. On `q` → save accepted changes so far (if any), reject remaining, proceed to apply.

**R9** — **Step 4 — APPLY**: For each accepted change, call `applyChange` from `content/edit.ts` (F007) — the **same** mutation primitive that refine (F012) uses:
- Frontmatter changes: `{ kind: 'frontmatter', key: resolvedKey, value: newValue }` — `resolvedKey` is extracted from `change.location` (e.g. `"frontmatter.skill:"` → key `"skill"`)
- Body changes: `{ kind: 'text', current: change.current, proposed: change.proposed }` — `applyChange` (F007) locates the first exact occurrence of `current` and replaces it with `proposed`. **`applyChange` does no fuzzy matching** (0007 R5: it throws when `current` is not found). So evolve must guard: before calling `applyChange`, check `content.includes(change.current)`; if absent, record the change as skipped (manual-intervention-needed, log a warning) and continue — do **not** rely on `applyChange` to fuzzy-match. Generating exact `current` strings is the proposer's responsibility (Step 2).

Read the content file once (via `Bun.file(path).text()`), apply all accepted changes sequentially to the string, then write back with `Bun.write(path, modifiedContent)`. The `applyChange` function takes `(content: string, change: Change) => string` — apply them in order: `acceptedChanges.reduce((content, change) => applyChange(content, change), originalContent)`.

After applying, call `await proposalDao.updateProposalStatus(proposalId, 'accepted', { appliedAt: new Date().toISOString() })`.

**R10** — **Step 5 — VERIFY**: Run `evaluate(type, name, { target, adapter: db })` (F011) to get the post-evolution `QualityReport`. Compute `delta = postScore - baselineScore`. Display prominently via `process.stdout.write`:
```
Score: <baselineScore> → <postScore> (<sign><delta>, <sign><percentage>%)
```
Save the post-evolution evaluation via `await evalDao.insertEvaluation({ ...evalRecord, operation: 'evolve', file_hash: hashContent(resolvedPath), target_agent: resolvedTarget ?? 'claude' })`. Link back to the proposal: `await proposalDao.updateProposalStatus(proposalId, 'accepted', { verifyId: newEvalId })`.

Return `{ baselineScore, postScore, delta, changesApplied, proposalPath }`.

**R11** — **Error handling**:
- No historical evaluations found → error: "No historical evaluations found for <type>/<name>. Run `superskill <type> evaluate <name> --save` first to build evaluation history." Return a result the command layer maps to exit 1. Do NOT throw.
- Content file not found → exit 2 (same convention as validate). `resolveContentPath` returns a path; check existence before reading.
- Store unavailable (DB error on `openStore`) → error: "Could not open the evaluation store at <dbPath>. Run `superskill init` to initialize it, or check file permissions." Exit 1.
- Empty content body after applying changes → warning but continue (evaluate will catch it).
- Proposal ID collision → increment sequence number (defense in depth — the sequence is derived from store count, so collisions should not occur).

**R12** — **Content type coverage**: Works for all 5 content types: `skill`, `command`, `agent`, `hook`, `magent`. The type is passed to `evaluate()` for re-scoring and to `resolveContentPath` for file resolution. Dimension names come from the evaluation records, not hard-coded per type.

**R13** — **Pure helper functions** (exported for unit testing — testable without DB or filesystem):
- `computeTrends(evaluations: EvaluationRecord[]): TrendTable` — pure: evaluations array → trend table. Evaluations must be sorted by `created_at` ascending (caller's responsibility).
- `generateChanges(report: QualityReport, trends: TrendTable): ProposedChange[]` — pure: quality report + trend table → proposed changes array. Uses the dimension notes from the latest evaluation's report as hints for change generation.
- `applyChange(content: string, change: Change): string` — re-exported from `content/edit.ts` (F007) — but evolve imports it, does not re-implement it.

**R14** — **Trend edge cases**:
- Single evaluation → no trend can be computed (no delta). Skip trend analysis entirely, emit message: "Only one evaluation found — need at least two for trend analysis. Running evaluation-based proposal instead." Generate changes based solely on the current evaluation's lowest-scoring dimensions (< 0.7).
- Two evaluations with same scores → all trends `'flat'` with `delta: 0`. Still propose changes for flat-and-low dimensions (< 0.7).
- Evaluation with missing dimension → skip that dimension in trend computation (the dimension may not exist in all evaluations if the quality schema evolved).

### Q&A


### Design

**Module location**: `apps/cli/src/operations/evolve.ts`.

**Imports**:
- `ContentType`, `QualityReport` from `quality/dimensions.ts` (F009)
- `Target` from `targets.ts`
- `evaluate` from `operations/evaluate.ts` (F011)
- `resolveContentPath`, `resolveContentName` from `content/identity.ts` (F007)
- `hashContent` from `content/hash.ts` (F007)
- `applyChange`, `Change` from `content/edit.ts` (F007)
- `getProposalsDir` from `content/paths.ts` (F007)
- `openStore`, `EvaluationDao`, `ProposalDao`, and the `Evaluation` + `Proposal` types from `store/` (F008). **Note:** F008 names these types `Evaluation` and `Proposal` (not `EvaluationRecord`/`ProposalRecord`). Use those names consistently — replace every `EvaluationRecord`/`ProposalRecord` reference in this task with `Evaluation`/`Proposal`.
- `DbAdapter` from `@gobing-ai/ts-db`
- `yaml` (`^2.9.0`, ADR-012) — for reading/writing proposal frontmatter
- `node:fs` (`existsSync`, `mkdirSync`, `writeFileSync`, `readFileSync`)
- `node:path` (`join`, `dirname`)

**Core function signature**:
```typescript
import type { ContentType, QualityReport } from '../quality/dimensions';
import type { Target } from '../targets';
import type { DbAdapter } from '@gobing-ai/ts-db';

export interface EvolveOptions {
    target?: Target;
    from?: string;
    proposeOnly?: boolean;
    acceptId?: string;
    rejectId?: string;
    adapter?: DbAdapter;
}

export interface TrendEntry {
    dimension: string;
    earliest: number;
    latest: number;
    delta: number;
    trend: 'improving' | 'declining' | 'flat';
}

export interface ProposedChange {
    dimension: string;
    location: string;
    current: string;
    proposed: string;
    reason: string;
}

export interface EvolveResult {
    baselineScore: number;
    postScore: number;
    delta: number;
    changesApplied: number;
    proposalPath: string;
}

export function computeTrends(evaluations: EvaluationRecord[]): TrendEntry[];
export function generateChanges(report: QualityReport, trends: TrendEntry[]): ProposedChange[];
export function generateProposalId(type: ContentType, name: string, existingProposals: ProposalRecord[]): string;
export async function evolve(
    type: ContentType,
    name: string,
    opts?: EvolveOptions,
): Promise<EvolveResult>;
```

**Architecture**: The `evolve()` orchestrator wires steps together with DB and file I/O. Each step is a separate internal function for testability:
- `stepAnalyze(db, type, name, from?)` → `{ evaluations, trends, baselineScore, baselineDate }`
- `stepPropose(report, trends, type, name, db)` → `{ proposalId, proposalPath, changes }`
- `stepReview(changes, opts)` → `{ acceptedChanges, rejectedChanges }`
- `stepApply(acceptedChanges, filePath, proposalId, db)` → `number` (changes applied count)
- `stepVerify(type, name, filePath, baselineScore, opts, db)` → `{ postScore, delta }`

**Proposal path construction**:
```typescript
import { getProposalsDir } from '../content/paths';
import { resolveContentName } from '../content/identity';

const proposalsRoot = getProposalsDir(opts);
const contentName = resolveContentName(name);
const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
const proposalId = generateProposalId(type, contentName, existingProposals);
const proposalPath = join(proposalsRoot, type, contentName, `${today}-${proposalId}.md`);
```

**Trend computation detail**:
```typescript
export function computeTrends(evaluations: EvaluationRecord[]): TrendEntry[] {
    if (evaluations.length < 2) return [];

    // `getEvaluations` returns DESC (newest first, F008). Sort ASC here so "earliest"
    // is genuinely the oldest. `created_at` is an epoch-millis number — compare numerically.
    // NOTE: `eval` is a reserved identifier in strict mode (all ESM/TS) — use `record`.
    const ordered = [...evaluations].sort((a, b) => a.created_at - b.created_at);

    const dims = new Map<string, { earliest: number; earliestDate: number; latest: number; latestDate: number }>();
    for (const record of ordered) {
        const parsed = JSON.parse(record.dimensions) as Record<string, { score: number; note: string }>;
        for (const [dim, { score }] of Object.entries(parsed)) {
            const existing = dims.get(dim);
            if (!existing) {
                dims.set(dim, { earliest: score, earliestDate: record.created_at, latest: score, latestDate: record.created_at });
            } else if (record.created_at > existing.latestDate) {
                existing.latest = score;
                existing.latestDate = record.created_at;
            }
            // earliest stays as the first seen (now genuinely oldest after ASC sort)
        }
    }

    const trends: TrendEntry[] = [];
    for (const [dimension, { earliest, latest }] of dims) {
        const delta = earliest === latest ? 0 : latest - earliest; // avoid floating errors on identical
        const trend = delta >= 0.05 ? 'improving' : delta <= -0.05 ? 'declining' : 'flat';
        trends.push({ dimension, earliest, latest, delta, trend });
    }

    // Sort: declining first, then flat+low, then improving
    trends.sort((a, b) => {
        const rank = (t: TrendEntry) => (t.trend === 'declining' ? 0 : t.trend === 'flat' ? 1 : 2);
        const r = rank(a) - rank(b);
        if (r !== 0) return r;
        return a.latest - b.latest; // lower score first within same trend
    });

    return trends;
}
```

**Change generation logic**:
```typescript
export function generateChanges(report: QualityReport, trends: TrendEntry[]): ProposedChange[] {
    const changes: ProposedChange[] = [];
    const dimMap = new Map(Object.entries(report.dimensions));

    for (const trend of trends) {
        if (trend.trend === 'declining' || (trend.trend === 'flat' && trend.latest < 0.7)) {
            const dimData = dimMap.get(trend.dimension);
            const note = dimData?.note ?? '';
            changes.push({
                dimension: trend.dimension,
                location: `dimension: ${trend.dimension}`,
                current: `Score: ${trend.latest.toFixed(2)}`,
                proposed: `Improve ${trend.dimension} from ${trend.latest.toFixed(2)} toward 1.0`,
                reason: note
                    ? `Latest evaluation note: "${note}". Trend: ${trend.trend} (Δ${trend.delta >= 0 ? '+' : ''}${trend.delta.toFixed(2)}).`
                    : `Trend: ${trend.trend} (Δ${trend.delta >= 0 ? '+' : ''}${trend.delta.toFixed(2)}). Score below threshold.`,
            });
        }
    }

    return changes;
}
```

**Interactive review implementation**:
- Use `readline.createInterface({ input: process.stdin, output: process.stdout })`.
- Display trend table first (formatted as ASCII table).
- For each change, prompt: `(a)ccept / (r)eject / (e)dit / (q)uit`.
- `a` → push to accepted array.
- `r` → push to rejected array.
- `e` → prompt `New proposed text:` → read line → update `change.proposed` → push to accepted.
- `q` → reject remaining unprompted changes; proceed to apply with what's accepted so far.
- Wrap in a promise that resolves when all changes are processed or user quits.

**Post-evolution evaluate call**:
```typescript
import { evaluate } from './evaluate';
const postReport = await evaluate(type, resolvedName, { target: opts?.target, adapter: db });
const postScore = postReport.aggregate;
```

### Solution

- `apps/cli/src/operations/evolve.ts` — exports `evolve()`, `computeTrends()`, `generateChanges()`, `generateProposalId()`, and types `EvolveOptions`, `EvolveResult`, `TrendEntry`, `ProposedChange`
- Imports store DAOs from `store/evaluations` and `store/proposals` (F008); `evaluate` from `operations/evaluate` (F011); content utilities from `content/` (F007)
- Modular design: each step is a separate internal function for testability
- Trend analysis: pure function (`EvaluationRecord[] → TrendEntry[]`), testable without DB
- Change generation: pure function (`QualityReport + TrendEntry[] → ProposedChange[]`), testable without DB
- The `evolve()` orchestrator wires steps together with DB and file I/O
- Proposal file writing uses `mkdirSync({ recursive: true })` + `writeFileSync`
- Interactive review uses `node:readline`
- Post-evolution verify calls evaluate, saves result, links back via `verifyId`

### Plan

1. Create `apps/cli/src/operations/evolve.ts` with `evolve()` orchestrator
2. Implement `computeTrends()` — trend analysis from evaluation history (pure function)
3. Implement `generateChanges()` — change proposal generation from quality report + trends (pure function)
4. Implement `generateProposalId()` and proposal file writing with `mkdir -p` equivalent
5. Implement Step 1 — ANALYZE: query evaluations, compute trends, handle missing data
6. Implement Step 2 — PROPOSE: generate changes, create proposal record, write proposal file
7. Implement Step 3 — REVIEW: `--propose-only` mode (write and exit)
8. Implement Step 3 — REVIEW continued: `--accept`/`--reject` by ID modes
9. Implement Step 3 — REVIEW continued: interactive mode with `readline` (accept/reject/edit/quit)
10. Implement Step 4 — APPLY: read content, apply accepted changes via `applyChange` from `content/edit.ts`, write back
11. Implement Step 5 — VERIFY: run evaluate, compute delta, display prominently, save post-evolution evaluation
12. Handle error cases: no evaluations, missing content file, store unavailable, single evaluation, empty changes
13. Run `bun run lint` and verify typecheck passes


### Review



### P1 — Blockers
| # | Title | Dimension | Location | Recommendation |
|---|-------|-----------|----------|----------------|
| _none_ | | | | |

### P2 — Warnings
| # | Title | Dimension | Location | Recommendation |
|---|-------|-----------|----------|----------------|
| _none_ | | | | |

### P3 — Info
| # | Title | Dimension | Location | Recommendation |
|---|-------|-----------|----------|----------------|
| _none_ | | | | |

### P4 — Suggestions
| # | Title | Dimension | Location | Recommendation |
|---|-------|-----------|----------|----------------|
| _none_ | | | | |


### Testing



### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References

- `docs/features/F013-evolve-operation.md` — feature spec
- `docs/design/design-doc-phase2.md` §2.5 — evolve operation design (5-step workflow)
- `docs/design/design-doc-phase2.md` §4 — data store (evaluations + proposals schema)
- `docs/design/design-doc-phase2.md` §6 — code layout (operations/evolve.ts)
- `docs/design/design-doc-phase2.md` §8 — acceptance criteria
- `docs/design/design-doc-phase2.md` §9 — shared foundation (F007 content/*, store/*)
- `docs/features/F011-evaluate-operation.md` — evaluate operation (called in step 5)
- `docs/features/F008-sqlite-store.md` — store DAOs (EvaluationDao, ProposalDao)
- `docs/features/F007-template-scaffold.md` — content utilities (resolveContentPath, resolveContentName, hashContent, applyChange)
- `docs/features/F012-refine-operation.md` — refine operation (shares applyChange primitive)
