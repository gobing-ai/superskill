---
name: Evaluate operation
description: Quality scoring across type-specific dimensions — dispatches to quality evaluators, computes aggregate, supports JSON output and SQLite persistence
status: Planned
created_at: 2026-06-16T00:00:00.000Z
updated_at: 2026-06-16T00:00:00.000Z
folder: docs/tasks
type: task
feature-id: F011
priority: high
estimated_hours: 4
tags: ["operations","quality","evaluation","scoring"]
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0011. Evaluate operation

### Background

The evaluate operation is the measurement engine of the Phase 2 quality pipeline. It scores content across type-specific quality dimensions (5 dimensions each, except hook which has 4), producing a `QualityReport` with per-dimension 0.0–1.0 scores, one-line explanatory notes, and a weighted aggregate. This drives refine decisions (which dimensions to fix) and provides the data points for evolve's longitudinal trend analysis (F013).

Evaluate dispatches to type-specific evaluator functions from F009 (`quality/skill.ts`, `quality/command.ts`, `quality/agent.ts`, `quality/hook.ts`, `quality/magent.ts`). Each evaluator takes the raw file content string and a target agent identifier, returning a `QualityReport`. The operation supports `--json` for machine-readable output, `--save` to persist results to the SQLite evaluation store (F008), and `--target` for agent-specific evaluation context.

Unlike validate, evaluate is **never called with exit code ≠ 0 for low scores** — a score of 0.0 is a valid evaluation result. Only file-not-found conditions produce exit code 2 (mapped by F014).

### Requirements

**R1** — Export `evaluate(type: ContentType, nameOrPath: string, opts?: EvaluateOptions): Promise<EvaluationResult>`. Returns a structured result with content identity, type, target agent, aggregate score, and per-dimension scores with notes.

**R2** — `EvaluateOptions` type: `{ target?: Target, json?: boolean, save?: boolean, operation?: string, adapter?: DbAdapter }`. `target` defaults to `'claude'` (ADR-013 — `target_agent` is never null). `json` selects output format. `save` triggers persistence. `operation` allows F012 (refine) to override the operation string stored in the evaluations table (defaults to `'evaluate'`; refine passes `'refine'`). `adapter` lets a caller inject an already-open store (F013 evolve passes its in-memory `DbAdapter` so the verify-step `--save` writes to the same DB; tests pass a `:memory:` adapter). When `adapter` is absent and `save` is set, `evaluate` opens its own store via `await openStore()`.

**R3** — `EvaluationResult` type alias for `QualityReport` (from `quality/dimensions.ts`, F009): `{ content: string, type: ContentType, target: Target, aggregate: number, dimensions: Record<string, DimensionScore> }`.

**R4** — `DimensionScore` type (from F009): `{ score: number, note: string }`. `score` is 0.0–1.0. `note` is a one-line explanation of the score.

**R5** — **Type dispatch**: resolves the correct evaluator function based on `type`. The mapping is:
- `'skill'` → `evaluateSkill(content, target)` from `quality/skill.ts`
- `'command'` → `evaluateCommand(content, target)` from `quality/command.ts`
- `'agent'` → `evaluateAgent(content, target)` from `quality/agent.ts`
- `'hook'` → `evaluateHook(content, target)` from `quality/hook.ts`
- `'magent'` → `evaluateMagent(content, target)` from `quality/magent.ts`

Each evaluator returns a `QualityReport`. The `content` field in the report is set by the evaluator using `resolveContentName(path)` (F007) when a file path is available, or the caller-supplied name.

**R6** — **Aggregate score**: the weighted average of all dimension scores. Default equal weighting: `aggregate = sum(scores) / N` where N is the number of dimensions for the type (5 for skill, command, agent, magent; 4 for hook). Weight overrides may be defined per-type in F009 — if a weight map exists, use it; otherwise equal weights. Score range: 0.0 (worst) to 1.0 (best).

**R7** — **`--json` output**: when set, `JSON.stringify(report)` is written to `process.stdout.write`. The JSON schema matches design doc §2.3: `{ content, type, target, aggregate, dimensions: { "<dimName>": { score, note } } }`.

**R8** — **Human-readable output** (default, no `--json`): a formatted table with columns [Dimension, Score, Note]. Score is displayed as a 0.00 decimal or percentage (consistent choice — decimal is simpler). After all dimension rows, a separator line and `AGGREGATE` row:

```
  completeness         0.85  Missing error-handling guidance
  clarity              0.90  Well-structured sections
  trigger-accuracy     0.75  Trigger phrases overlap with rd3-code-review
  anti-hallucination   0.80  References external APIs without verification step
  conciseness          0.80  Some redundant examples in §3
  ─────────────────────────────────────
  AGGREGATE            0.82
```

Output is written via `process.stdout.write` (not `console.log`) for test spy compatibility (matches Phase 1 convention).

**R9** — **`--save` persistence**: opens the SQLite store via `await openStore()` from F008's `store/db.ts`, then calls `await new EvaluationDao(adapter).insertEvaluation({ ... })`. The row values:
- `content_type`: the `type` parameter
- `content_name`: `resolveContentName(resolvedPath)` from F007's `content/identity.ts` (the canonical content name — directory-stripped, extension-stripped; ADR-013)
- `target_agent`: resolved target (never null; defaults to `'claude'` per ADR-013)
- `operation`: `opts.operation ?? 'evaluate'` — the store never defaults this; the caller always passes it explicitly
- `aggregate`: `report.aggregate` (0.0–1.0)
- `dimensions`: `JSON.stringify(report.dimensions)` — the full dimension map as a JSON string
- `file_hash`: `hashContent(resolvedPath)` from F007's `content/hash.ts` (SHA-256 hex of file bytes)
- `created_at`: set by the store (append-only column)

On DB error (connection failure, constraint violation), log the error to stderr via `process.stderr.write` but do NOT fail the evaluation — the evaluation result is still valid and should be returned/displayed. The `--save` failure is reported but does not change the exit code.

**R10** — **file_hash computation**: use `hashContent(filePath)` from `content/hash.ts` (F007). Implementation uses `Bun.CryptoHasher` with SHA-256 (or `node:crypto.createHash('sha256')` as fallback). The hash is computed on the raw file bytes at evaluation time and stored with `--save`. This enables evolve (F013) to detect content changes between evaluations.

**R11** — **File path resolution**: same logic as validate — `resolveContentPath(type, nameOrPath, opts?)` from `content/identity.ts` (F007). Bare name → `cwd/<name>.md`. Explicit path → as-is. If the resolved path does not exist, return early with an error (the F014 command layer maps this to exit 2).

**R12** — **Target resolution**: `const resolvedTarget = opts?.target ?? 'claude'`. The result and any persisted row always carry a concrete agent string, never `undefined` or `null` (ADR-013).

**R13** — **Content type coverage**: works for all 5 content types via dispatch to the appropriate F009 evaluator. Each evaluator handles its type's dimension set independently.

**R14** — **Exit code behavior** (mapped by F014): 0 on successful evaluation (even if scores are low — evaluation failure ≠ quality failure). 2 only for file not found or unreadable.

**R15** — **Output formatter**: export `formatEvaluationReport(report: QualityReport, json?: boolean): string`. Separated so the CLI layer (F014) and refine (F012) can reuse formatting without re-implementing.

### Q&A



### Design

**Module location**: `apps/cli/src/operations/evaluate.ts`.

**Imports**:
- `ContentType`, `QualityReport`, `DimensionScore` from `quality/dimensions.ts` (F009)
- `evaluateSkill` from `quality/skill.ts` (F009)
- `evaluateCommand` from `quality/command.ts` (F009)
- `evaluateAgent` from `quality/agent.ts` (F009)
- `evaluateHook` from `quality/hook.ts` (F009)
- `evaluateMagent` from `quality/magent.ts` (F009)
- `resolveContentPath`, `resolveContentName` from `content/identity.ts` (F007)
- `hashContent` from `content/hash.ts` (F007)
- `openStore`, `EvaluationDao` from `store/` (F008) — only imported when `--save` is set; dynamic import acceptable if store is not always needed
- `DbAdapter` type from `@gobing-ai/ts-db` — for the `opts.adapter` injection type
- `Target` from `targets.ts`

**Core function signature**:

```typescript
import type { ContentType, QualityReport, DimensionScore } from '../quality/dimensions';
import type { Target } from '../targets';

export interface EvaluateOptions {
    target?: Target;
    json?: boolean;
    save?: boolean;
    operation?: string;  // defaults to 'evaluate'; refine passes 'refine'
}

export type EvaluationResult = QualityReport;

export async function evaluate(
    type: ContentType,
    nameOrPath: string,
    opts?: EvaluateOptions,
): Promise<EvaluationResult>;
```

**Evaluator dispatch map**:

```typescript
import { evaluateSkill } from '../quality/skill';
import { evaluateCommand } from '../quality/command';
import { evaluateAgent } from '../quality/agent';
import { evaluateHook } from '../quality/hook';
import { evaluateMagent } from '../quality/magent';

const EVALUATORS: Record<ContentType, (content: string, target: string) => QualityReport> = {
    skill: evaluateSkill,
    command: evaluateCommand,
    agent: evaluateAgent,
    hook: evaluateHook,
    magent: evaluateMagent,
};
```

**Internal flow**:

1. Resolve path: `const resolvedPath = resolveContentPath(type, nameOrPath, opts)`. If file does not exist, throw a typed error or return early — caller (F014) maps to exit 2.

2. Read content: `const content = await Bun.file(resolvedPath).text()`. If reading fails (directory, permission), throw/return error.

3. Resolve target: `const resolvedTarget = opts?.target ?? 'claude'`.

4. Dispatch: `const evaluator = EVALUATORS[type]; const report = evaluator(content, resolvedTarget)`.

5. Override `report.content` if not already set: `report.content = resolveContentName(resolvedPath)` (ensure the canonical name is used).

6. If `opts?.save`:
   - Compute file hash: `const fileHash = hashContent(resolvedPath)`
   - Reuse or open store: `const store = opts.adapter ?? await openStore()` (inject from F013 evolve / tests; otherwise open per F008)
   - Create DAO: `const dao = new EvaluationDao(store)` (1-arg constructor — the DAO hardcodes its table/PK/name; see F008)
   - Insert: `await dao.insertEvaluation({ content_type: type, content_name: resolveContentName(resolvedPath), target_agent: resolvedTarget, operation: opts.operation ?? 'evaluate', aggregate: report.aggregate, dimensions: report.dimensions, file_hash: fileHash })` — pass `dimensions` as the object; the DAO `JSON.stringify`s it on write (F008 R7). Do **not** double-stringify here.
   - Wrap in try/catch: on DB error, write to stderr: `process.stderr.write(`Warning: failed to save evaluation: ${err.message}\n`)` — do not re-throw

7. Return `report`.

**Human-readable output formatter**:

```typescript
export function formatEvaluationReport(report: QualityReport, json?: boolean): string {
    if (json) {
        return JSON.stringify(report);
    }

    const lines: string[] = [];
    const dimNames = Object.keys(report.dimensions);
    const maxNameLen = Math.max(...dimNames.map(n => n.length), 'AGGREGATE'.length);

    for (const name of dimNames) {
        const dim = report.dimensions[name];
        const score = dim.score.toFixed(2);
        const padded = name.padEnd(maxNameLen);
        lines.push(`  ${padded}  ${score}  ${dim.note}`);
    }

    lines.push(`  ${'─'.repeat(maxNameLen)}─────────────────────────────`);
    lines.push(`  ${'AGGREGATE'.padEnd(maxNameLen)}  ${report.aggregate.toFixed(2)}`);

    return lines.join('\n');
}
```

The `formatEvaluationReport` function is tested in a separate test file (`tests/operations/evaluate.test.ts`) against a known `QualityReport` fixture — verifying both JSON and human-readable output shapes.

**Edge cases**:
- **Empty content** (file with no body after frontmatter): evaluators handle this gracefully — completeness scores will be low (0.0–0.2) but evaluation does not crash.
- **Missing frontmatter**: evaluators call `parseFrontmatter` which throws `FrontmatterError` — caught by the evaluator, yields low scores with explanatory notes (e.g. `completeness: { score: 0.0, note: 'No frontmatter found' }`). The evaluator never throws.
- **Very large files** (>1MB): `Bun.file().text()` reads the whole file. For now, accept this; if memory pressure becomes an issue, add a size guard later (not in v1).
- **Binary content**: evaluators parse frontmatter; binary content may cause `parseFrontmatter` to fail or produce garbage field values — low scores result but no crash.
- **`--save` without a store**: if `openStore()` fails (e.g. no write permission for `~/.superskill/`), catch the error, report to stderr, continue without saving.

### Solution

- `apps/cli/src/operations/evaluate.ts` — exports `evaluate()`, `formatEvaluationReport()`, and `EvaluateOptions` type
- Dispatches to F009 type-specific evaluators via a simple `Record<ContentType, EvaluatorFn>` map
- File path resolution via F007 `content/identity.ts`
- File hashing via F007 `content/hash.ts`
- Store persistence via F008 `EvaluationDao` when `--save` is set
- Operation string `'evaluate'` is passed explicitly (never defaulted by the store)
- All output via `process.stdout.write` (not `console.log`)
- DB failures during `--save` are reported to stderr but do not fail the evaluation

### Plan

1. Create `apps/cli/src/operations/evaluate.ts` with the full `evaluate()` function
2. Implement evaluator dispatch map (`EVALUATORS` record mapping `ContentType` to evaluator functions)
3. Implement file path resolution and content reading with error handling
4. Implement `--json` output path (JSON.stringify the QualityReport)
5. Implement human-readable table output formatter (`formatEvaluationReport`)
6. Implement `--save` integration: open store → create EvaluationDao → insertEvaluation with error resilience
7. Implement `file_hash` computation via `hashContent` from F007
8. Handle edge cases: empty content, missing frontmatter (evaluators handle this), large files, store write failures
9. Export `formatEvaluationReport` as a reusable helper
10. Run `bun run lint` and verify typecheck passes


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

- `docs/features/F011-evaluate-operation.md` — feature spec
- `docs/design/design-doc-phase2.md` §2.3 — evaluate operation design
- `docs/design/design-doc-phase2.md` §3 — quality dimensions by content type
- `docs/design/design-doc-phase2.md` §4 — data store schema (evaluations table)
- `docs/design/design-doc-phase2.md` §9 — shared foundation (F007 content/* modules)
- `docs/design/design-doc-phase2.md` §10 — storage + identity conventions (ADR-013)
- `docs/features/F009-quality-dimensions.md` — QualityReport, DimensionScore, evaluator functions
- `docs/features/F008-sqlite-store.md` — openStore, EvaluationDao
- `docs/features/F007-template-scaffold.md` — resolveContentPath, resolveContentName, hashContent
- `apps/cli/src/targets.ts` — Target type
