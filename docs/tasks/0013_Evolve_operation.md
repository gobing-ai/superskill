---
schema_version: 1
name: Evolve operation
description: Self-evolution loop — analyze historical evaluations, propose data-backed improvements, review/apply, verify post-score delta. The key enhancement over origin Claude Code skills.
status: done
type: task
priority: P1
tags: [operations,evolve,self-improvement,longitudinal]
created_at: 2026-06-16T00:00:00.000Z
updated_at: "2026-08-01T02:23:35.937Z"
feature_id: G26
---

## 0013. Evolve operation

### Background

The self-evolution loop is the unique capability that makes superskill more than a CLI wrapper — it learns from past evaluations to propose concrete, data-backed improvements. A 5-step workflow: (1) ANALYZE historical evaluations from the SQLite store, identify trends per dimension, rank by delta and lowest score; (2) PROPOSE improvements for low-scoring dimensions, generate a structured proposal file; (3) REVIEW via interactive or `--propose-only` mode; (4) APPLY accepted changes to the content file in place; (5) VERIFY by re-evaluating and showing the score delta.

Unlike validate/evaluate/refine — which work on a single snapshot — evolve is longitudinal. It reads the evaluation history for a given `(type, name)` pair, computes per-dimension trends, and generates proposals that are themselves tracked in the store (proposals table). This closes the loop: evaluate → evolve → apply → re-evaluate → evolve again.

### Requirements
**R1** — Export `evolve(type: ContentType, name: string, opts?: EvolveOptions): Promise<EvolveResult>`. The `name` is a bare content name (not a file path — evolve resolves the path via `resolveContentPath` from G21, same as other operations). Returns `{ baselineScore, postScore, delta, changesApplied, proposalPath }`.

**R2** — `EvolveOptions` type: `{ target?: Target, from?: string, proposeOnly?: boolean, acceptId?: string, rejectId?: string, adapter?: DbAdapter }`. `from` is an ISO date string filtering evaluations to those after that date. `adapter` allows test injection of an in-memory DB. Store access is via ts-db DAOs (F4, ADR-014): `const db = opts.adapter ?? await openStore()`, then `new EvaluationDao(db)` / `new ProposalDao(db)`. No `bun:sqlite` import in evolve.ts.

**R3** — `EvolveResult` type: `{ baselineScore: number, postScore: number, delta: number, changesApplied: number, proposalPath: string }`. `baselineScore` is the aggregate of the most recent pre-evolution evaluation. `postScore` is the aggregate after changes are applied and re-evaluated. `delta = postScore - baselineScore`. `changesApplied` counts how many of the proposal's changes were accepted and applied.

**R4** — **Step 1 — ANALYZE**: Query evaluations via `await evalDao.getEvaluations(type, name)`. If `opts.from` is set (an ISO date string), filter evaluations where `created_at >= Date.parse(opts.from)` — **`created_at` is an epoch-millis `number`** (ts-db `appendOnlyColumns`, see F4), so compare numerically; do not string-compare against the ISO `from`. If fewer than 2 evaluations exist after filtering → error: "No historical evaluations found for <type>/<name>. Run `superskill <type> evaluate <name> --save` first to build evaluation history." Exit with message (do not crash; return a result that the command layer maps to exit 1).

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

`location` should reference a specific frontmatter field (like `frontmatter.skill:`) or a body section heading. `current` and `proposed` are exact text strings for the text-based `applyChange` (G21 `content/edit.ts`).

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
- `<proposalsDir>` = `getProposalsDir()` (G21 `content/paths.ts`) — resolves to `<data-root>/.superskill/proposals/`
- `<type>` = the content type segment (always included, per ADR-013)
- `<name>` = `resolveContentName` result (G21)
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

**Verdict:** PASS

#### Re-verification — 2026-06-16 (`/rd3:dev-verify 0013 --force --fix all`)

**Verdict:** PASS (after fix pass — initial verdict **FAIL**: 2× P2 functional bugs + a third hidden by the untested orchestrator).

- Gate: `bun run lint` clean (Biome + typecheck, 74 files). `bun test evolve.test.ts` → 26 pass / 0 fail; evolve.ts 96.15% funcs / 90.39% lines (was 42.86% / 16.51%). Full suite: 392 pass / 0 fail across 29 files.
- Root cause: the **entire orchestration layer was untested** (only the 3 pure functions had tests). That masked three real bugs. SECU otherwise clean: parameterized DAOs, no injection/secrets, `applyChange` for all mutations, guarded `JSON.parse`.

**Bugs found & fixed (initial P2/FAIL → resolved):**
| # | Title | Dimension | Location | Fix |
|---|-------|-----------|----------|-----|
| 1 | R9: `updateProposalStatus(Number(proposalId))` where `proposalId` is the string `<type>-evolve-…` → always `NaN`; proposal status never marked accepted | Correctness | evolve.ts `stepApply` | Thread the numeric DB id from `stepPropose` (`proposalDbId`) into `stepApply`. |
| 2 | R10: `stepVerify` re-evaluated for display only — no `save:true`, no `operation:'evolve'` persisted, no `verify_id` link back to the proposal | Correctness | evolve.ts `stepVerify` | Call `evaluate(..., {save:true, operation:'evolve', adapter:db})`, then link `verify_id` via `getLatestEvaluation`. |
| 3 | R8: `--accept <id>` / `--reject <id>` still ran `stepPropose` (creating a *new* proposal) and applied/verified against that new id, so the *named* proposal was never marked accepted/rejected | Correctness | evolve.ts core | Short-circuit accept/reject **before** PROPOSE; apply & verify against the target proposal's own id. |

- Tests added: in-memory-adapter orchestrator suite (propose-only, accept→R9+R10 assertions, reject, not-found, file-missing, no-history) + injectable-readline `interactiveReview` suite (accept/reject/edit/quit) — matching the `_createRl` seam refine (F012) uses. 16 → 26 tests.
- Post-fix Phase 8: **14/14 MET**, no unmet, no partial, no scope drift.

- **R1–R3 (API):** `evolve()`, `EvolveOptions`, `EvolveResult`, `TrendEntry`, `ProposedChange` — all exported. `computeTrends`, `generateChanges`, `generateProposalId` exported as pure functions.
- **R4 (ANALYZE):** `stepAnalyze` queries evaluations via `EvaluationDao.getEvaluations`, filters by `opts.from` (epoch-millis comparison), computes trends via `computeTrends`. Throws with `code: 1` when no evaluations found.
- **R5 (TrendTable):** `computeTrends(evaluations)` — ascending sort by `created_at`, per-dimension earliest/latest/delta/trend. Declining first, flat second, improving last; lowest latest first within group. Handles single eval, missing dimensions.
- **R6 (PROPOSE):** `generateChanges` — proposes for declining OR flat-below-0.7 dimensions. `stepPropose` writes proposal file to `<proposalsDir>/<type>/<name>/<date>-<id>.md`.
- **R7 (Proposal ID):** `generateProposalId` — `<type>-evolve-<date>-<NNN>`, NNN = existing count + 1, zero-padded.
- **R8 (REVIEW):** `--propose-only`, `--accept <id>`, `--reject <id>`, interactive mode with trend display and accept/reject/edit/quit per change.
- **R9 (APPLY):** `stepApply` — reads content, applies accepted changes via `applyChange` (F007), guards `content.includes(change.current)` before text changes.
- **R10 (VERIFY):** `stepVerify` — re-evaluates via `evaluate()` (F011), displays score delta with percentage.
- **R11–R14 (Edge cases):** No evaluations → error with guidance. Single evaluation → warn + proceed. File not found → exit 2. Store unavailable → error. Content read failure → warn. Proposal ID collision → sequence increment.

### Testing

- **Command:** `bun run test`
- **Executed:** 2026-06-16 (re-verified)
- **Scope:** 26 tests — computeTrends (8), generateChanges (6), generateProposalId (2), orchestrator integration via in-memory adapter (6: propose-only, accept, reject, not-found, file-missing, no-history), interactiveReview via injectable readline (4: accept/reject/edit/quit)
- **Result:** 26 pass, 0 fail in evolve.test.ts; 392 pass, 0 fail across 29 files (full suite)
- **Coverage:** evolve.ts 96.15% funcs, 90.39% lines (meets the ≥90% target); 99.57% funcs / 97.80% lines aggregate. Remaining uncovered lines are defensive error branches.
- **Evidence:** `apps/cli/tests/operations/evolve.test.ts`
- **Next action:** None — all gates pass.

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


### History

- Migrated from legacy format (2026-08-01)
### Design

**Module location**: `apps/cli/src/operations/evolve.ts`.

**Imports**:
- `ContentType`, `QualityReport` from `quality/dimensions.ts` (G22)
- `Target` from `targets.ts`
- `evaluate` from `operations/evaluate.ts` (G24)
- `resolveContentPath`, `resolveContentName` from `content/identity.ts` (G21)
- `hashContent` from `content/hash.ts` (G21)
- `applyChange`, `Change` from `content/edit.ts` (G21)
- `getProposalsDir` from `content/paths.ts` (G21)
- `openStore`, `EvaluationDao`, `ProposalDao`, and the `Evaluation` + `Proposal` types from `store/` (F4). **Note:** F4 names these types `Evaluation` and `Proposal` (not `EvaluationRecord`/`ProposalRecord`). Use those names consistently — replace every `EvaluationRecord`/`ProposalRecord` reference in this task with `Evaluation`/`Proposal`.
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

    // `getEvaluations` returns DESC (newest first, F4). Sort ASC here so "earliest"
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
- Imports store DAOs from `store/evaluations` and `store/proposals` (F4); `evaluate` from `operations/evaluate` (G24); content utilities from `content/` (G21)
- Modular design: each step is a separate internal function for testability
- Trend analysis: pure function (`EvaluationRecord[] → TrendEntry[]`), testable without DB
- Change generation: pure function (`QualityReport + TrendEntry[] → ProposedChange[]`), testable without DB
- The `evolve()` orchestrator wires steps together with DB and file I/O
- Proposal file writing uses `mkdirSync({ recursive: true })` + `writeFileSync`
- Interactive review uses `node:readline`
- Post-evolution verify calls evaluate, saves result, links back via `verifyId`

### Review

**Verdict:** PASS

#### Re-verification — 2026-06-16 (`/rd3:dev-verify 0013 --force --fix all`)

**Verdict:** PASS (after fix pass — initial verdict **FAIL**: 2× P2 functional bugs + a third hidden by the untested orchestrator).

- Gate: `bun run lint` clean (Biome + typecheck, 74 files). `bun test evolve.test.ts` → 26 pass / 0 fail; evolve.ts 96.15% funcs / 90.39% lines (was 42.86% / 16.51%). Full suite: 392 pass / 0 fail across 29 files.
- Root cause: the **entire orchestration layer was untested** (only the 3 pure functions had tests). That masked three real bugs. SECU otherwise clean: parameterized DAOs, no injection/secrets, `applyChange` for all mutations, guarded `JSON.parse`.

**Bugs found & fixed (initial P2/FAIL → resolved):**
| # | Title | Dimension | Location | Fix |
|---|-------|-----------|----------|-----|
| 1 | R9: `updateProposalStatus(Number(proposalId))` where `proposalId` is the string `<type>-evolve-…` → always `NaN`; proposal status never marked accepted | Correctness | evolve.ts `stepApply` | Thread the numeric DB id from `stepPropose` (`proposalDbId`) into `stepApply`. |
| 2 | R10: `stepVerify` re-evaluated for display only — no `save:true`, no `operation:'evolve'` persisted, no `verify_id` link back to the proposal | Correctness | evolve.ts `stepVerify` | Call `evaluate(..., {save:true, operation:'evolve', adapter:db})`, then link `verify_id` via `getLatestEvaluation`. |
| 3 | R8: `--accept <id>` / `--reject <id>` still ran `stepPropose` (creating a *new* proposal) and applied/verified against that new id, so the *named* proposal was never marked accepted/rejected | Correctness | evolve.ts core | Short-circuit accept/reject **before** PROPOSE; apply & verify against the target proposal's own id. |

- Tests added: in-memory-adapter orchestrator suite (propose-only, accept→R9+R10 assertions, reject, not-found, file-missing, no-history) + injectable-readline `interactiveReview` suite (accept/reject/edit/quit) — matching the `_createRl` seam refine (G25) uses. 16 → 26 tests.
- Post-fix Phase 8: **14/14 MET**, no unmet, no partial, no scope drift.

- **R1–R3 (API):** `evolve()`, `EvolveOptions`, `EvolveResult`, `TrendEntry`, `ProposedChange` — all exported. `computeTrends`, `generateChanges`, `generateProposalId` exported as pure functions.
- **R4 (ANALYZE):** `stepAnalyze` queries evaluations via `EvaluationDao.getEvaluations`, filters by `opts.from` (epoch-millis comparison), computes trends via `computeTrends`. Throws with `code: 1` when no evaluations found.
- **R5 (TrendTable):** `computeTrends(evaluations)` — ascending sort by `created_at`, per-dimension earliest/latest/delta/trend. Declining first, flat second, improving last; lowest latest first within group. Handles single eval, missing dimensions.
- **R6 (PROPOSE):** `generateChanges` — proposes for declining OR flat-below-0.7 dimensions. `stepPropose` writes proposal file to `<proposalsDir>/<type>/<name>/<date>-<id>.md`.
- **R7 (Proposal ID):** `generateProposalId` — `<type>-evolve-<date>-<NNN>`, NNN = existing count + 1, zero-padded.
- **R8 (REVIEW):** `--propose-only`, `--accept <id>`, `--reject <id>`, interactive mode with trend display and accept/reject/edit/quit per change.
- **R9 (APPLY):** `stepApply` — reads content, applies accepted changes via `applyChange` (G21), guards `content.includes(change.current)` before text changes.
- **R10 (VERIFY):** `stepVerify` — re-evaluates via `evaluate()` (G24), displays score delta with percentage.
- **R11–R14 (Edge cases):** No evaluations → error with guidance. Single evaluation → warn + proceed. File not found → exit 2. Store unavailable → error. Content read failure → warn. Proposal ID collision → sequence increment.

### References

- `docs/features/G26_evolve-operation.md` — feature spec
- `docs/design/design-doc-phase2.md` §2.5 — evolve operation design (5-step workflow)
- `docs/design/design-doc-phase2.md` §4 — data store (evaluations + proposals schema)
- `docs/design/design-doc-phase2.md` §6 — code layout (operations/evolve.ts)
- `docs/design/design-doc-phase2.md` §8 — acceptance criteria
- `docs/design/design-doc-phase2.md` §9 — shared foundation (G21 content/*, store/*)
- `docs/features/G24_evaluate-operation.md` — evaluate operation (called in step 5)
- `docs/features/F4_sqlite-data-store.md` — store DAOs (EvaluationDao, ProposalDao)
- `docs/features/G21_template-content-io-foundation-scaffold-operation.md` — content utilities (resolveContentPath, resolveContentName, hashContent, applyChange)
- `docs/features/G25_refine-operation.md` — refine operation (shares applyChange primitive)

