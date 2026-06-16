---
name: SQLite data store
description: Persistent SQLite store for evaluation records and evolution proposals via @gobing-ai/ts-db facade — the self-evolution data foundation.
status: Planned
created_at: 2026-06-16T00:00:00.000Z
updated_at: 2026-06-16T00:00:00.000Z
folder: docs/tasks
type: task
feature-id: F008
priority: high
estimated_hours: 5
tags: ["foundation","sqlite","store","ts-db"]
impl_progress:
    planning: pending
    design: pending
    implementation: pending
    review: pending
    testing: pending
---

## 0008. SQLite data store

### Background

The `evaluate --save` and `evolve` operations require persistent storage for longitudinal quality tracking — evaluation scores recorded over time, and evolution proposals tracked through draft→accepted→rejected lifecycle. This is the self-evolution data foundation.

Per ADR-014, data access goes through the `@gobing-ai/ts-db` facade — never raw `bun:sqlite` or hand-written DDL. Tables are authored once via `defineTable` (single source of truth for table shape + zod schemas + generated DDL). `store/evaluations.ts` and `store/proposals.ts` are thin `EntityDao` subclasses.

The database lives at `<dataRoot>/.superskill/evaluations.db` where `dataRoot` is resolved by `content/paths.ts` (F007): `<cwd>/.superskill/` when it exists, else `~/.superskill/`. `--project`/`projectRoot` forces project-local.

Dependencies: `@gobing-ai/ts-db`, `drizzle-orm`, `drizzle-zod`, `zod` — all already resolved transitively; declaring them directly makes the dependence explicit.

Design references: design doc §4 (data store schema), §10 (storage conventions), F007 `content/paths.ts` (ADR-013).

### Requirements

- [ ] **R1** — `store/schema.ts`: Author both tables via `defineTable` from `@gobing-ai/ts-db/schema`. `evaluations` is append-only (`appendOnlyColumns`); `proposals` is mutable (`standardColumns`). Export derived `.table`, `.insertSchema`, `.selectSchema` for each. No hand-written DDL or SQL.
- [ ] **R2** — `evaluations` table per design §4: `id` (PK autoincrement), `content_type` (TEXT NOT NULL), `content_name` (TEXT NOT NULL), `target_agent` (TEXT NOT NULL), `operation` (TEXT NOT NULL), `aggregate` (REAL NOT NULL), `dimensions` (TEXT NOT NULL — JSON serialized), `file_hash` (TEXT nullable), `created_at` (appendOnlyColumns — no `updated_at`).
- [ ] **R3** — `proposals` table per design §4: `id` (PK autoincrement), `content_type` (TEXT NOT NULL), `content_name` (TEXT NOT NULL), `baseline_id` (INTEGER nullable), `proposal_json` (TEXT NOT NULL — JSON serialized), `status` (TEXT NOT NULL DEFAULT 'draft'), `applied_at` (TEXT nullable), `verify_id` (INTEGER nullable), `created_at`, `updated_at` (standardColumns).
- [ ] **R4** — `store/db.ts`: `openStore(opts?)` **awaits** `createDbAdapter({ driver: 'bun-sqlite', url: getDBPath(opts) })` (the factory is `async` — returns `Promise<DbAdapter>`), then creates our two tables by running the generated DDL through the adapter's `exec(sql)` DDL method: `await adapter.exec(evaluations.createTableSql)` and `await adapter.exec(proposals.createTableSql)`. Idempotent — `createTableSql` is `CREATE TABLE IF NOT EXISTS`. Returns `Promise<DbAdapter>`. Path resolution delegates to F007's `getDBPath`.
  - **Do NOT use `applyMigrations` for our tables.** `applyMigrations(adapter, opts)` is ts-db's own file-based/embedded migrator — with no `drizzle/` folder it applies ts-db's *built-in* embedded migrations (queue_jobs, inbox_messages), not ours, and it accepts no inline-migration array. Our schema is created via the `DbAdapter.exec(sql)` DDL method using each `DefinedTable.createTableSql`.
- [ ] **R5** — `store/evaluations.ts`: `EvaluationDao extends EntityDao<…>` with `insertEvaluation(record)`, `getEvaluations(contentType, contentName)`, `getLatestEvaluation(contentType, contentName)`. All `async`. Validates via derived zod `insertSchema` at the boundary.
- [ ] **R6** — `store/evaluations.ts`: `EvaluationInput` type with `{ content_type, content_name, target_agent, operation: 'evaluate' | 'refine' | 'evolve', aggregate: number, dimensions: Record<string, { score: number, note: string }>, file_hash?: string }`. `target_agent` non-null (callers default to `'claude'` when `--target` omitted). `operation` always supplied by caller — never defaulted.
- [ ] **R7** — `store/evaluations.ts`: `dimensions` serialized as JSON on write (DAO maps the text column), parsed on read. Same for `proposal_json` in proposals.
- [ ] **R8** — `store/evaluations.ts`: `getEvaluations(contentType, contentName)` queries via predicate `{ where: and(eq content_type, eq content_name), orderBy: [{ col: created_at, dir: 'desc' }] }`. Returns `Evaluation[]`.
- [ ] **R9** — `store/evaluations.ts`: `getLatestEvaluation(contentType, contentName)` same predicate, `limit: 1`. Returns `Evaluation | null`.
- [ ] **R10** — `store/proposals.ts`: `ProposalDao extends EntityDao<…>` with `insertProposal(record)`, `updateProposalStatus(id, status, opts?)`, `getProposals(contentType, contentName)`, `getPendingProposals()`.
- [ ] **R11** — `store/proposals.ts`: `ProposalInput` type with `{ content_type, content_name, baseline_id?: number, proposal_json: object }`. `Proposal` extends with `{ id, status, applied_at, verify_id, created_at, updated_at }`.
- [ ] **R12** — `store/proposals.ts`: `insertProposal` sets `status: 'draft'` implicitly. `updateProposalStatus` updates `status` + optional `applied_at` + optional `verify_id`.
- [ ] **R13** — `store/proposals.ts`: `getPendingProposals()` returns proposals where `status = 'draft'`, all content types. `getProposals` filters by `content_type` and `content_name`.
- [ ] **R14** — DB path: delegates to F007's `getDBPath`. `<cwd>/.superskill/evaluations.db` when `<cwd>/.superskill/` directory exists; else `~/.superskill/evaluations.db`. `projectRoot` forces project-local path. Tests pass `{ projectRoot }` (tmpdir) or `url: ':memory:'` for isolation.
- [ ] **R15** — No `bun:sqlite` import anywhere in `store/`. No hand-authored DDL strings. Table creation runs `DefinedTable.createTableSql` (generated by `defineTable`) through `adapter.exec(sql)` — **not** `applyMigrations` (which targets ts-db's own embedded tables; see R4).
- [ ] **R16** — Add deps to `apps/cli/package.json`: `@gobing-ai/ts-db`, `drizzle-orm`, `drizzle-zod`, `zod`. All already resolved transitively (ADR-014).

### Q&A

Q: Why ts-db instead of raw bun:sqlite?
A: ADR-007 mandates preferring `@gobing-ai/ts-*` over raw/external data access. Using the ts-db facade provides typed DAOs, predicate query spec (no SQL strings), migration tracking, and D1 portability. Hand-writing DDL would forfeit boundary validation and migration management the facade already supplies (ADR-014). `bun:sqlite` remains an internal detail of ts-db's `bun-sqlite` adapter.

Q: Why `evaluations` is append-only but `proposals` is mutable?
A: Evaluation scores are a historical log — each `evaluate --save` creates a new row; the old score is never updated. Proposals transition through `draft → accepted|rejected` lifecycle — the same row gets status updates. Using `appendOnlyColumns` (created_at only, no updated_at) for evaluations and `standardColumns` (created_at + updated_at) for proposals reflects this.

Q: Why does `insertEvaluation` take `operation` as a parameter instead of defaulting it?
A: Different callers write different operation values: `evaluate` → `'evaluate'`, `refine` → `'refine'`, evolve verify → `'evolve'`. The store is a passive data layer — it doesn't know which caller it's serving. The caller provides the correct value.

Q: Why `target_agent` is NOT NULL?
A: Per ADR-013: `target_agent` is never null; callers default to `'claude'` when `--target` is omitted. Making the column NOT NULL enforces this at the schema level.

Q: How are `dimensions` and `proposal_json` stored?
A: Both are JSON-serialized text columns. ts-db's text mapping means the DAO writes/reads the serialized string. The application layer does `JSON.stringify` on write and `JSON.parse` on read. The DAO interface types the column as the parsed object, not the raw string.

Q: Why does `getPendingProposals` return all content types?
A: For the `evolve --accept` and `evolve --reject` commands that operate on proposal IDs directly. The `evolve` subcommand for a specific content type will call `getProposals(type, name)` with the filters.

### Design

**Schema** (logical reference only — actual shape derived from `defineTable` + the column spreads):

> **Implementer note.** The `created_at`/`updated_at` columns come from ts-db's `appendOnlyColumns` / `standardColumns` spreads — they are **`integer` epoch-millis timestamps** with a `$defaultFn`, **not** TEXT `datetime('now')`. So `Evaluation.created_at` / `Proposal.created_at` / `updated_at` are `number`, not `string`. Adjust the TS types below accordingly (the `string` annotations on `created_at`/`updated_at` are wrong — change to `number`). Order `getEvaluations` by the actual `created_at` integer column. The `id` PK uses drizzle's `integer('id').primaryKey({ autoIncrement: true })` — declare it in the `defineTable` column map, do not rely on the raw `AUTOINCREMENT` DDL shown below.

```sql
-- Evaluations (append-only — created_at only, no updated_at)
CREATE TABLE evaluations (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    content_type  TEXT NOT NULL,
    content_name  TEXT NOT NULL,
    target_agent  TEXT NOT NULL,
    operation     TEXT NOT NULL,
    aggregate     REAL NOT NULL,
    dimensions    TEXT NOT NULL,
    file_hash     TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Proposals (mutable — standardColumns: created_at + updated_at)
CREATE TABLE proposals (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    content_type  TEXT NOT NULL,
    content_name  TEXT NOT NULL,
    baseline_id   INTEGER,
    proposal_json TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'draft',
    applied_at    TEXT,
    verify_id     INTEGER,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Code layout**:

| File | Exports |
|------|---------|
| `store/schema.ts` | `evaluations` (defineTable output), `proposals` (defineTable output), derived `.table`, `.insertSchema`, `.selectSchema` |
| `store/db.ts` | `openStore(opts?) → Promise<DbAdapter>`, re-exports `getDBPath` from F007 |
| `store/evaluations.ts` | `EvaluationDao` class, `EvaluationInput` type, `Evaluation` type |
| `store/proposals.ts` | `ProposalDao` class, `ProposalInput` type, `Proposal` type |

**Store barrel**: `apps/cli/src/store/index.ts` re-exports `openStore`, `getDBPath`, `EvaluationDao`, `ProposalDao`, and all types.

**`openStore` implementation sketch**:
```typescript
import { createDbAdapter, type DbAdapter } from '@gobing-ai/ts-db';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { getDBPath } from '../content/paths';
import { evaluations, proposals } from './schema';

export async function openStore(opts?: { projectRoot?: string }): Promise<DbAdapter> {
    const url = getDBPath(opts);
    if (url !== ':memory:') {
        await mkdir(dirname(url), { recursive: true });   // ensure <root>/.superskill/ exists
    }
    const adapter = await createDbAdapter({ driver: 'bun-sqlite', url });  // async factory — must await
    // Our tables are created via the adapter's DDL method, NOT applyMigrations
    // (applyMigrations targets ts-db's own embedded tables, not ours — see R4).
    // createTableSql is generated by defineTable and is CREATE TABLE IF NOT EXISTS → idempotent.
    await adapter.exec(evaluations.createTableSql);
    await adapter.exec(proposals.createTableSql);
    return adapter;
}
```

**`EvaluationDao` definition + usage**:

The DAO subclass hardcodes its table, primary key, and collection name in `super(...)` so callers construct it with **just the adapter** (`new EvaluationDao(adapter)`). The `EntityDao` base constructor is `(adapter, table, primaryKey, collectionName, options?)` where `primaryKey` is the PK **column reference** (e.g. `evaluations.table.id`), not the string `'id'`, and `collectionName` is required.

```typescript
import { EntityDao } from '@gobing-ai/ts-db';
import type { DbAdapter } from '@gobing-ai/ts-db';
import { evaluations } from './schema';

export class EvaluationDao extends EntityDao<typeof evaluations.table, typeof evaluations.table.id> {
    constructor(adapter: DbAdapter) {
        super(adapter, evaluations.table, evaluations.table.id, 'evaluations', {
            insertSchema: evaluations.insertSchema,
        });
    }

    async insertEvaluation(record: EvaluationInput): Promise<number> {
        const row = await this.create({ ...record, dimensions: JSON.stringify(record.dimensions) });
        return row.id;
    }
    // getEvaluations / getLatestEvaluation use this.list({ where, orderBy, limit }) and JSON.parse(dimensions)
}

// caller:
const adapter = await openStore({ projectRoot: tmpDir });
const dao = new EvaluationDao(adapter);
await dao.insertEvaluation({
    content_type: 'skill', content_name: 'rd3-tdd-workflow', target_agent: 'claude',
    operation: 'evaluate', aggregate: 0.82,
    dimensions: { completeness: { score: 0.85, note: '…' } },
});
```

**Edge cases**:
- `openStore` called twice → second call is idempotent (migrations are tracked).
- `openStore` with `url: ':memory:'` → in-memory DB, no filesystem path needed.
- `insertEvaluation` with `dimensions` that are too large → JSON column, SQLite text limit applies (≈1GB).
- `getLatestEvaluation` when no records → returns `null`.
- `updateProposalStatus` with non-existent id → ts-db update returns 0 affected rows; caller checks.
- `getPendingProposals` when none → returns empty array.
- DB path when `~/.superskill/` doesn't exist → `mkdir` with `{ recursive: true }` creates it.
- DB path when `<cwd>/.superskill/` exists as a file, not directory → `mkdir` throws EEXIST; caller handles.

### Solution

**New files** (4):

| Path | Purpose |
|------|---------|
| `apps/cli/src/store/schema.ts` | defineTable for evaluations + proposals (SSOT: table + zod + DDL) |
| `apps/cli/src/store/db.ts` | openStore, re-export getDBPath |
| `apps/cli/src/store/evaluations.ts` | EvaluationDao (EntityDao subclass), EvaluationInput, Evaluation types |
| `apps/cli/src/store/proposals.ts` | ProposalDao (EntityDao subclass), ProposalInput, Proposal types |

**Optional** (1):
- `apps/cli/src/store/index.ts` — barrel re-export for convenience: `openStore`, `getDBPath`, `EvaluationDao`, `ProposalDao`, and all type exports.

**Modified files** (1):
- `apps/cli/package.json` — add `@gobing-ai/ts-db`, `drizzle-orm`, `drizzle-zod`, `zod` to dependencies.

**Key types**:
```typescript
// store/evaluations.ts
interface EvaluationInput {
    content_type: 'skill' | 'command' | 'agent' | 'hook' | 'magent';
    content_name: string;
    target_agent: string;
    operation: 'evaluate' | 'refine' | 'evolve';
    aggregate: number;
    dimensions: Record<string, { score: number; note: string }>;
    file_hash?: string;
}
interface Evaluation extends EvaluationInput {
    id: number;
    created_at: number;  // epoch millis (ts-db appendOnlyColumns), not an ISO string
}

// store/proposals.ts
interface ProposalInput {
    content_type: string;
    content_name: string;
    baseline_id?: number;
    proposal_json: object;
}
interface Proposal extends ProposalInput {
    id: number;
    status: 'draft' | 'accepted' | 'rejected';
    applied_at: string | null;
    verify_id: number | null;
    created_at: number;  // epoch millis (ts-db standardColumns)
    updated_at: number;  // epoch millis (ts-db standardColumns)
}
```

**Test isolation**: Tests pass `{ projectRoot }` pointing to a temp directory or `url: ':memory:'` to a `createDbAdapter` override. No test touches the real `~/.superskill/` filesystem. The store module exports a `resetStore(adapter)` helper for test cleanup (drops all rows, keeps schema).

### Plan

1. Add `@gobing-ai/ts-db`, `drizzle-orm`, `drizzle-zod`, `zod` to `apps/cli/package.json` dependencies.
2. Create `apps/cli/src/store/schema.ts` — defineTable for evaluations (appendOnlyColumns) and proposals (standardColumns); export .table, .insertSchema, .selectSchema.
3. Create `apps/cli/src/store/db.ts` — openStore: `await createDbAdapter(...)` then `adapter.exec(evaluations.createTableSql)` + `adapter.exec(proposals.createTableSql)` (NOT applyMigrations); re-export getDBPath from F007's content/paths.
4. Create `apps/cli/src/store/evaluations.ts` — EvaluationDao, EvaluationInput, Evaluation types, insertEvaluation, getEvaluations, getLatestEvaluation.
5. Create `apps/cli/src/store/proposals.ts` — ProposalDao, ProposalInput, Proposal types, insertProposal, updateProposalStatus, getProposals, getPendingProposals.
6. Create `apps/cli/src/store/index.ts` — barrel re-exports.
7. Run `bun run lint` and verify typecheck passes.
8. Verify ts-db types resolve correctly against installed versions.

### Review



### Testing



### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References

- Design doc: `docs/design/design-doc-phase2.md` §4 (data store), §10 (storage conventions)
- Feature file: `docs/features/F008-sqlite-store.md`
- ADR-007: prefer @gobing-ai/ts-* over raw/external data access
- ADR-013: data root resolution rule (consumed from F007)
- ADR-014: ts-db facade mandate — no bun:sqlite anywhere in store/
- F007 `content/paths.ts`: getDBPath, getDataRoot

### P1 — Blockers
| # | Title | Dimension | Location | Recommendation |
|---|-------|-----------|----------|----------------|

### P2 — Warnings
| # | Title | Dimension | Location | Recommendation |
|---|-------|-----------|----------|----------------|

### P3 — Info
| # | Title | Dimension | Location | Recommendation |
|---|-------|-----------|----------|----------------|

### P4 — Suggestions
| # | Title | Dimension | Location | Recommendation |
|---|-------|-----------|----------|----------------|
