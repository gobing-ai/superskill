---
name: Phase 2 tests
description: Comprehensive unit + integration tests for all Phase 2 modules — store, scaffold, validate, evaluate, refine, evolve, and CLI commands. Coverage ≥90% line and function.
status: Done
created_at: 2026-06-16T00:00:00.000Z
updated_at: 2026-06-16T23:35:50.000Z
folder: docs/tasks
type: task
feature-id: F015
priority: high
estimated_hours: 5
tags: ["testing","quality","coverage","verification"]
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0015. Phase 2 tests

### Background

Phase 2 has significant complexity: 5 content types, 5 operations each, a persistent SQLite store, template-based scaffolding, quality evaluation heuristics, auto-refinement, and a self-evolution engine. Without thorough tests, a bad evolve proposal could corrupt content files, a validation false-negative could ship broken configs, and scoring drift could go unnoticed. This task writes comprehensive unit and integration tests for every Phase 2 module.

Tests use `bun:test` with `describe`/`it`/`expect`. The in-memory SQLite adapter (`:memory:`) isolates store tests from the filesystem. Temporary directories (`os.tmpdir()`) isolate file-output tests. No test file uses `.skip`, `.todo`, or commented-out tests — every test runs on every `bun run test` invocation. The aggregate coverage across all Phase 2 source files must reach ≥90% line and ≥90% function (matching `bunfig.toml` thresholds).

### Requirements

**R1** — **`store.test.ts`** — Store DAO tests using in-memory SQLite (ts-db `bun-sqlite` adapter with `:memory:`). All DAO calls are `await`ed. Never import `bun:sqlite` directly.

Tests:
1. **Store creation and migration**: `await openStore({ url: ':memory:' })` creates both `evaluations` and `proposals` tables by running each `createTableSql` through the adapter's DDL method — **not** `applyMigrations` (see F008 R4). A second `openStore` on the same `:memory:` URL is idempotent (`CREATE TABLE IF NOT EXISTS` → no duplicate-table error).
2. **`EvaluationDao.insertEvaluation`**: Returns a numeric `id`. Stores all fields including JSON `dimensions`. Rejects a malformed record (e.g. missing `content_type` — derived zod `insertSchema` should throw).
3. **`EvaluationDao.getEvaluations`**: Returns rows ordered by `created_at` DESC. Returns empty array `[]` when no matches exist for the given `(content_type, content_name)`.
4. **`EvaluationDao.getLatestEvaluation`**: Returns the most recent row by `created_at`. Returns `null` when no matches exist.
5. **`EvaluationDao.getEvaluations` — date filtering**: When `opts.from` is provided, returns only rows with `created_at >= opts.from`.
6. **`ProposalDao.insertProposal`**: Returns a numeric `id`. Defaults `status` to `'draft'`. Stores `proposal_json` as a string.
7. **`ProposalDao.getProposals`**: Returns rows for the given `(content_type, content_name)`. Empty array when no matches.
8. **`ProposalDao.getPendingProposals`**: Returns only rows where `status = 'draft'`.
9. **`ProposalDao.updateProposalStatus`**: Updates `status` to `'accepted'` / `'rejected'`. Sets `applied_at` when provided. Sets `verify_id` when provided. Bumps `updated_at`.
10. **Edge case — nonexistent content**: `getEvaluations` for a type/name with no evaluations returns `[]`.
11. **Edge case — nonexistent proposal update**: `updateProposalStatus` on a nonexistent `id` throws or returns `null` (verify behavior matches the DAO contract).
12. **Concurrent inserts**: Inserting two evaluations for the same content produces two distinct rows with sequential (or increasing) `id` values.

**R2** — **`scaffold.test.ts`** — Template-based file generation tests. Use a temp directory (via `os.tmpdir()`) for output, cleaned up in `afterEach`.

Tests:
1. **Basic scaffold — name only**: `scaffold('skill', 'test-skill')` creates `test-skill.md` in cwd containing the name placeholder replaced with `test-skill`.
2. **Scaffold with description**: `scaffold('skill', 'test-skill', { description: 'Does X' })` fills the `<!-- DESCRIPTION -->` placeholder with `'Does X'`.
3. **Template resolution — user template wins**: Create a mock user template at `~/.superskill/templates/skill/default.md` (or a path resolvable in tests). Scaffold picks the user template over the built-in one. Verify the output matches the user template content.
4. **Template resolution — built-in fallback**: When no user template exists, the built-in `templates/skill/default.md` is used.
5. **Output directory respected**: `scaffold('skill', 'test-skill', { output: '/tmp/test-out' })` writes to `/tmp/test-out/test-skill.md`. (The option is `output`, not `outputDir` — see F007.)
6. **Error on existing file**: Scaffolding where the output path already exists throws or returns an error. Error message mentions `--force` as the workaround.
7. **Force flag overwrites**: `scaffold('skill', 'test-skill', { force: true })` succeeds even when the file exists, replacing it.
8. **Template not found**: Scaffolding a type with no template (neither user nor built-in) throws with a clear error message including the type name.
9. **Variable substitution — TARGET**: When `--target` is provided, the `<!-- TARGET -->` placeholder is replaced with the target name.
10. **All 5 content types scaffold successfully**: Loop over `['skill', 'command', 'agent', 'hook', 'magent']` and verify each creates a file.

**R3** — **`validate.test.ts`** — Structural validation tests. Uses test fixture files.

Test fixture files needed in `apps/cli/tests/fixtures/phase2/`:
- `valid-skill.md` — correct YAML frontmatter with `name`, `description`, valid types
- `missing-frontmatter.md` — no `---` delimiters
- `wrong-types.md` — e.g. `allowed-tools: "not-an-array"` (should be array)
- `missing-fields.md` — missing `name` or `description`
- `broken-yaml.md` — malformed YAML (unclosed quote, bad indentation)
- `empty.md` — zero bytes
- `valid-agent.md` — correct agent frontmatter with `name`, `description`, `model`, `tools`
- `valid-command.md` — correct command frontmatter
- `valid-hook.md` — correct hook frontmatter with `name`, `description`, `event`
- `valid-magent.md` — correct magent frontmatter with `name`, `description`, `platforms`

Tests:
1. **Valid file passes**: `validate('skill', 'valid-skill.md')` → `{ valid: true, findings: [] }`. No error findings.
2. **Missing frontmatter**: `validate('skill', 'missing-frontmatter.md')` → `{ valid: false }`, at least one finding about missing frontmatter on `field: 'frontmatter'`.
3. **Wrong types**: `validate('skill', 'wrong-types.md')` → `{ valid: false }`, at least one finding about type mismatch (e.g. `allowed-tools` expected array, got string).
4. **Missing required fields**: `validate('skill', 'missing-fields.md')` → `{ valid: false }`, finding about missing `name` or `description`.
5. **`--strict` enables extra checks**: `validate('skill', 'valid-skill.md', { strict: true })` on a file with a short description (e.g. 12 chars) → includes a `warning` finding about description length.
6. **File not found**: `validate('skill', 'nonexistent.md')` → returns sentinel with `field: '_file'`, `valid: false`. Not a thrown error — handled by result.
7. **`--json` output format**: `formatValidationResult(result, true)` produces valid JSON that parses back to an object with `valid` and `findings` keys.
8. **Valid file for each content type**: Loop over all 5 types and their valid fixtures — each passes with `valid: true`.
9. **Unknown type rejected**: Passing an invalid `ContentType` string is caught at the type level (TypeScript) — runtime should throw or return an error finding.
10. **Directory path**: Passing a directory path instead of a file returns file-not-found sentinel (or appropriate error finding).
11. **Empty file**: `validate('skill', 'empty.md')` → finding about no frontmatter.
12. **Malformed YAML**: `validate('skill', 'broken-yaml.md')` → finding about YAML parse error, `field: 'frontmatter'`.

**R4** — **`evaluate.test.ts`** — Quality scoring tests. Uses the same fixture files as validate.

Tests:
1. **Each dimension in range**: Every dimension score in the returned `QualityReport` is between 0.0 and 1.0 inclusive.
2. **Aggregate = mean of dimensions**: `report.aggregate` equals the arithmetic mean of all dimension scores (within floating tolerance, e.g. ±0.01).
3. **`--json` output format**: `JSON.stringify(report)` produces valid JSON with keys: `content`, `type`, `target`, `aggregate`, `dimensions`.
4. **`--save` writes to store**: After evaluate with `{ save: true }`, query the evaluation store and verify a row with `content_name` matching the fixture and `operation: 'evaluate'` exists.
5. **Empty content**: A file with only frontmatter (no body) scores near 0 on completeness and conciseness dimensions.
6. **All 5 content types evaluated**: `evaluate('skill', ...)`, `evaluate('agent', ...)`, `evaluate('command', ...)`, `evaluate('hook', ...)`, `evaluate('magent', ...)` each return a report with the correct type and type-specific dimensions.
7. **Target affects scoring**: `evaluate('skill', 'valid-skill.md', { target: 'pi' })` vs `{ target: 'claude' }` may produce different dimension scores (due to target-specific format checks). Verify that `target` is forwarded to the quality evaluator.
8. **Missing file**: Returns an error result (file not found). No crash.
9. **Score reproducibility**: Evaluating the same file twice with the same options produces the same `aggregate` score (modulo floating-point — scores should be deterministic).
10. **Dimension notes are meaningful**: Each dimension in the report has a non-empty `note` string.
11. **Edge case — single evaluation**: `evaluate` does not require prior evaluations (it's a point-in-time assessment).
12. **Edge case — `--save` with missing store**: When the store path is unavailable, an appropriate error is thrown (test by providing a path to a non-writable location).

**R5** — **`refine.test.ts`** — Auto-fix tests. Uses fixture files with known issues.

Tests:
1. **Auto mode fixes structural issues**: On a file missing `description` in frontmatter, `refine('skill', 'broken-skill.md', { auto: true })` adds the missing field with a placeholder value.
2. **Score delta computed and non-negative**: Post-refine score ≥ pre-refine score. Delta = postScore - preScore.
3. **Backup file created**: After refine, a `.bak` file exists alongside the original (e.g. `broken-skill.md.bak`).
4. **`--save` persists evaluations**: After refine with `{ save: true }`, two evaluation rows exist in the store with `operation: 'refine'` (pre and post).
5. **Already-valid skill**: Refining an already-valid skill produces no changes. Score delta = 0. No unnecessary backup.
6. **Interactive mode flag recognized**: `refine('skill', 'broken-skill.md')` without `--auto` enters interactive mode. Test that the `auto` flag is correctly parsed (interactive hard to test via stdin — test option parsing).
7. **Backup not created when no changes**: When refining a valid skill with no fixes, no backup file is created.
8. **Conciseness note for long content**: A file with excessively long body content receives a conciseness warning note in the refined evaluation.
9. **File-not-found**: `refine('skill', 'nonexistent.md')` throws or returns an appropriate error.
10. **Flag-only changes**: Content-level suggestions (requiring human judgment) are flagged in the report output, not auto-applied in `--auto` mode.

**R6** — **`evolve.test.ts`** — Evolution engine tests. Uses mock evaluation data in an in-memory store.

Tests:
1. **Trend analysis — declining dimension**: Insert 5 mock evaluations where one dimension consistently declines (e.g. 0.80, 0.75, 0.72, 0.68, 0.65). `computeTrends(evaluations)` returns a trend entry with `trend: 'declining'` and `delta ≤ -0.05`.
2. **Trend analysis — improving dimension**: Insert evaluations with an improving dimension (e.g. 0.60, 0.70, 0.80, 0.85, 0.90). Returns `trend: 'improving'` with `delta ≥ 0.05`.
3. **Trend analysis — flat dimension**: Insert evaluations with constant scores (e.g. 0.75, 0.75, 0.75). Returns `trend: 'flat'` with `delta` near 0.
4. **`generateChanges` for declining dimension**: On a quality report with a declining + low dimension, generates at least one `ProposedChange` with all four fields (`dimension`, `location`, `current`, `proposed`, `reason`) populated.
5. **`--propose-only` writes proposal file**: `evolve('skill', 'test-skill', { proposeOnly: true, adapter: inMemoryDb })` writes a `.md` file to `proposals/skill/test-skill/YYYY-MM-DD-<id>.md` with valid YAML frontmatter containing `proposal_id`, `content`, `type`, `baseline_score`, `baseline_date`, `from_evaluations`.
6. **Proposal ID format**: The `proposal_id` YAML field matches the pattern `<type>-evolve-<YYYY-MM-DD>-<NNN>` where NNN is zero-padded (e.g. `skill-evolve-2026-06-16-001`).
7. **Proposal file trend table**: The proposal markdown body contains a `## Trend analysis` section with a table showing dimension, baseline, current, and trend columns.
8. **Proposal file change sections**: The proposal body contains numbered change sections (`### 1. Fix declining ...`) with `**Location:**`, `**Current:**`, `**Proposed:**`, `**Reason:**` fields.
9. **`--accept` applies changes**: After creating a proposal, `evolve('skill', 'test-skill', { acceptId: '<proposal_id>', adapter: inMemoryDb })` modifies the content file, updates the proposal status to `'accepted'`, and returns a positive `changesApplied` count.
10. **`--reject` updates status only**: `evolve('skill', 'test-skill', { rejectId: '<proposal_id>', adapter: inMemoryDb })` marks the proposal `'rejected'` without modifying the content file.
11. **No historical evaluations**: `evolve('skill', 'test-skill', { adapter: inMemoryDb })` with an empty evaluations table throws (or returns an error) with a message mentioning `evaluate --save`.
12. **Post-evolution verify**: After accepting a proposal, the returned `EvolveResult` has `postScore` set to the re-evaluation score and `delta = postScore - baselineScore`.
13. **`generateProposalId`**: `generateProposalId('skill', 'my-skill', [])` returns `'skill-evolve-<today>-001'`. With existing proposals having ids 001 and 002, returns `003`.
14. **Edge case — single evaluation**: `computeTrends` with one evaluation returns an empty `TrendTable` (no trend computable). The evolve orchestrator should detect this and generate changes based on the single evaluation's lowest dimensions.
15. **Edge case — all equal scores**: Five evaluations with identical scores produce all-flat trends. Changes are generated for flat-and-low (< 0.7) dimensions only.

**R7** — **`commands.test.ts`** — CLI integration tests.

Tests:
1. **`--help` shows operations**: Running `superskill agent --help` captures stdout and verifies it contains the strings `scaffold`, `validate`, `evaluate`, `refine`, `evolve`.
2. **Same for all 5 types**: `superskill skill --help`, `superskill command --help`, `superskill hook --help`, `superskill magent --help` each contain all 5 operation names.
3. **Operation-level `--help`**: `superskill agent scaffold --help` shows `--description`, `--target`, `--output` options.
4. **Scaffold → validate → evaluate integration flow**: Scaffold a skill to a temp directory, validate it passes, evaluate it produces a valid score.
5. **`--json` flag on evaluate**: `superskill skill evaluate <path> --json` writes valid JSON to stdout.
6. **Unknown subcommand**: `superskill skill nonexistent` exits non-zero with help suggestion.
7. **Exit code 0 for success**: Valid operations exit 0.
8. **Exit code 1 for validation error**: Validating a broken file exits 1.
9. **Exit code 2 for missing file**: Validating a nonexistent file exits 2.
10. **`resolveTarget` default**: Omitting `--target` defaults to `'claude'` — verify by checking a persisted evaluation row's `target_agent` after `evaluate --save`.

**R8** — **Test conventions** (all test files):
- Use `bun:test` runner: `import { describe, expect, it, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test'`
- Spy on `process.stdout.write` for CLI output assertions (Phase 2 code writes through it, never `console.log`)
- No mocks for internal modules; real file I/O for integration paths
- In-memory SQLite (`:memory:`) for store tests — no filesystem side effects
- Temp directories (`os.tmpdir()`) for file-output tests — cleaned up in `afterEach`
- Data-root isolation: any test triggering `--save`/evolve passes an explicit `adapter` or `projectRoot` (a tmpdir) so `getDataRoot` never resolves to the real `~/.superskill/`
- No `.skip`, `.todo`, or commented-out tests
- Test files in `apps/cli/tests/` alongside existing test files

**R9** — **Test fixture directory**: `apps/cli/tests/fixtures/phase2/` containing at minimum:
- `valid-skill.md` — well-formed skill with `name`, `description`, `allowed-tools: [read, write]`
- `missing-frontmatter.md` — plain markdown with no `---` delimiters
- `wrong-types.md` — skill with `allowed-tools: "not-an-array"` and `model: "invalid"`
- `missing-fields.md` — skill with only a `name` field, no `description`
- `broken-yaml.md` — YAML with an unclosed quote or bad indentation
- `empty.md` — zero-byte file
- `valid-agent.md` — well-formed agent with `name`, `description`, `model: default`, `tools: [read, write]`
- `valid-command.md` — well-formed command with `name`, `description`, `arguments: [file]`
- `valid-hook.md` — well-formed hook with `name`, `description`, `event: PreToolUse`
- `valid-magent.md` — well-formed magent with `name`, `description`, `platforms: [claude]`
- `broken-skill.md` — skill missing `description` field (for refine tests)
- `long-body.md` — skill with an excessively long body (1000+ words) for conciseness testing

**R10** — **Coverage targets**: Aggregate across all Phase 2 source files: ≥90% line coverage, ≥90% function coverage. The Phase 2 source dirs — `content/`, `store/`, `quality/`, `operations/`, `commands/`, and updated `cli.ts` — fall under the root `bunfig.toml` coverage scope. Template `.md` files are data, not executable lines — they do not count toward coverage.

**R11** — All tests pass with `bun run test` (which runs `NODE_ENV=test bun test --reporter=dots` per `apps/cli/package.json` scripts).

### Q&A


### Design

**Test file locations** (all under `apps/cli/tests/`):
```
apps/cli/tests/
├── store.test.ts        — ~12 tests (store DAOs)
├── scaffold.test.ts     — ~10 tests (template generation)
├── validate.test.ts     — ~12 tests (structural validation)
├── evaluate.test.ts     — ~12 tests (quality scoring)
├── refine.test.ts       — ~10 tests (auto-fix pipeline)
├── evolve.test.ts       — ~15 tests (evolution engine — most complex)
├── commands.test.ts     — ~10 tests (CLI integration)
└── fixtures/
    └── phase2/
        ├── valid-skill.md
        ├── missing-frontmatter.md
        ├── wrong-types.md
        ├── missing-fields.md
        ├── broken-yaml.md
        ├── empty.md
        ├── valid-agent.md
        ├── valid-command.md
        ├── valid-hook.md
        ├── valid-magent.md
        ├── broken-skill.md
        └── long-body.md
```

**In-memory DB pattern** (for store.test.ts and evolve.test.ts):
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { openStore, EvaluationDao, ProposalDao } from '../src/store/index';
import type { DbAdapter } from '@gobing-ai/ts-db';

let db: DbAdapter;
let evalDao: EvaluationDao;
let proposalDao: ProposalDao;

beforeAll(async () => {
    db = await openStore({ url: ':memory:' });
    evalDao = new EvaluationDao(db);
    proposalDao = new ProposalDao(db);
});

afterAll(async () => {
    // :memory: DB closes when the last connection drops; nothing to clean up
});
```

**Temp directory pattern** (for scaffold.test.ts and commands.test.ts):
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tempDir: string;

beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'superskill-test-'));
});

afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
});
```

**Mock evaluation data** (for evolve.test.ts — insert via DAO in `beforeEach`):
```typescript
const mockEvaluations = [
    {
        content_type: 'skill',
        content_name: 'test-skill',
        target_agent: 'claude',
        operation: 'evaluate',
        aggregate: 0.72,
        dimensions: JSON.stringify({
            completeness: { score: 0.85, note: 'Good' },
            clarity: { score: 0.90, note: 'Clear' },
            'trigger-accuracy': { score: 0.75, note: 'Overlap' },
            'anti-hallucination': { score: 0.80, note: 'Missing verify' },
            conciseness: { score: 0.30, note: 'Very verbose' },
        }),
        created_at: '2026-06-01T00:00:00.000Z',
    },
    // ... 4 more with decreasing 'trigger-accuracy' scores: 0.70, 0.65, 0.60, 0.55
    // and increasing 'clarity' scores: 0.88, 0.90, 0.92, 0.94
    // and flat 'anti-hallucination': 0.80 each time
];
```

**CLI output spy pattern** (for commands.test.ts) — use `spyOn(process.stdout, 'write')`, the Phase 1 convention (see `tests/commands/install.test.ts`). Do **not** `mock.module('process', …)`: `process` is a Node/Bun builtin, not a resolvable module specifier, so `mock.module` won't intercept `process.stdout.write`.
```typescript
import { describe, it, expect, afterEach, spyOn } from 'bun:test';

let stdoutSpy: ReturnType<typeof spyOn>;
const captured = (): string =>
    stdoutSpy.mock.calls.map((c) => String(c[0])).join('');

afterEach(() => {
    stdoutSpy?.mockRestore();
});

it('agent --help lists operations', () => {
    stdoutSpy = spyOn(process.stdout, 'write').mockImplementation(() => true);
    // …run the command…
    expect(captured()).toContain('scaffold');
});
```

**Asserting `process.exit` codes** (for the exit-code tests): the command handlers call `process.exit(n)` via `runOperation`. In tests, spy on it to capture the code instead of killing the test process:
```typescript
const exitSpy = spyOn(process, 'exit').mockImplementation(((c?: number) => {
    throw new Error(`__exit__:${c ?? 0}`);  // unwind instead of terminating
}) as never);
// then assert the thrown "__exit__:2" for a missing-file validate, etc.
```

**Coverage verification**: After all tests pass, `bun run test` output must show line ≥90% and function ≥90% in the aggregate coverage summary. Individual files may dip below but the aggregate must meet the threshold.

### Solution

- `apps/cli/tests/fixtures/phase2/` — test fixture files for all 5 content types (12 files)
- `apps/cli/tests/store.test.ts` — ~12 tests for store DAOs (create, insert, query, filter, update)
- `apps/cli/tests/scaffold.test.ts` — ~10 tests for template generation
- `apps/cli/tests/validate.test.ts` — ~12 tests for structural validation across all types
- `apps/cli/tests/evaluate.test.ts` — ~12 tests for quality scoring
- `apps/cli/tests/refine.test.ts` — ~10 tests for auto-fix pipeline
- `apps/cli/tests/evolve.test.ts` — ~15 tests for evolution engine (trend analysis, proposal generation, apply, verify)
- `apps/cli/tests/commands.test.ts` — ~10 tests for CLI integration
- All tests pass with `bun run test` and meet coverage thresholds

### Plan

1. Create `apps/cli/tests/fixtures/phase2/` directory with all 12 test fixture files
2. Create `apps/cli/tests/store.test.ts` — store DAO tests with in-memory SQLite
3. Create `apps/cli/tests/scaffold.test.ts` — template generation tests with temp directories
4. Create `apps/cli/tests/validate.test.ts` — validation tests using phase2 fixtures
5. Create `apps/cli/tests/evaluate.test.ts` — quality scoring tests using phase2 fixtures
6. Create `apps/cli/tests/refine.test.ts` — auto-fix tests with broken fixtures
7. Create `apps/cli/tests/evolve.test.ts` — evolution tests with mock evaluation data
8. Create `apps/cli/tests/commands.test.ts` — CLI integration tests with stdout spies
9. Run `bun run test` and verify ≥90% line and function coverage
10. Verify no skipped, commented-out, or `.todo` tests
11. Run `bun run build` and verify no regressions


### Requirements Traceability — 2026-06-16

**Verdict:** PASS after fix-pass.

- **R1 (store):** MET — `apps/cli/tests/store/db.test.ts`, `apps/cli/tests/store/evaluations.test.ts`, and `apps/cli/tests/store/proposals.test.ts` cover in-memory DDL, inserts, JSON serialization, ordering, empty results, malformed evaluation input, `created_at` lower-bound filtering, nonexistent proposal updates, `updated_at` bumps, and concurrent evaluation inserts.
- **R2 (scaffold):** MET — `apps/cli/tests/operations/scaffold.test.ts` covers template resolution, placeholders, output directories, overwrite guards, force behavior, missing templates, target substitution, and all 5 content types.
- **R3 (validate):** MET — `apps/cli/tests/operations/validate.test.ts` covers valid fixtures, missing frontmatter, wrong types, missing fields, strict warnings, file-not-found sentinels, JSON formatting, unknown types, directories, empty files, and malformed YAML.
- **R4 (evaluate):** MET — `apps/cli/tests/operations/evaluate.test.ts` covers score ranges, aggregate math, JSON shape, save-to-store behavior, empty content, all 5 content types, target forwarding, missing files, reproducibility, notes, single evaluations, and unavailable store paths.
- **R5 (refine):** MET — `apps/cli/tests/operations/refine.test.ts` covers auto structural fixes, score deltas, backups, save behavior, already-valid no-op behavior, interactive flag parsing, long-content conciseness notes, missing files, and human-judgment-only suggestions.
- **R6 (evolve):** MET — `apps/cli/tests/operations/evolve.test.ts` covers trend analysis, change generation, proposal files, proposal IDs, accept/reject flows, no-history errors, post-evolution scoring, single-evaluation fallback, flat-score behavior, and deterministic historical timestamps.
- **R7 (commands):** MET — command integration tests cover operation registration, help output, option parsing, scaffold/validate/evaluate flow, JSON evaluate output, unknown subcommands, exit-code behavior, and default target persistence.
- **R8 (conventions):** MET — tests use `bun:test`, stdout spies for CLI output, in-memory SQLite for store paths, temp directories for file-output paths, explicit adapter/project-root isolation, and no focused/skipped/todo tests.
- **R9 (fixtures):** MET — `apps/cli/tests/fixtures/phase2/` contains all required fixtures; `long-body.md` is 1155 words.
- **R10 (coverage):** MET — aggregate coverage is 99.74% functions and 98.25% lines.
- **R11 (green):** MET — `bun run autofix && bun run spur-check` exits 0 with 443 pass, 0 fail across 37 files.

### Review — 2026-06-16

**Verdict:** PASS. No active SECU findings after fix-pass.

**Fixed findings:**

| Finding | Axis | Evidence | Fix |
| --- | --- | --- | --- |
| Evolve proposal test depended on equal-timestamp history ordering and could generate no changes. | Correctness | `apps/cli/tests/operations/evolve.test.ts` | Seeded historical evaluations with deterministic `created_at` values. |
| R1 store traceability missed malformed evaluation input, date filtering, nonexistent proposal updates, `updated_at` bumps, and concurrent inserts. | Correctness | `apps/cli/src/store/evaluations.ts`, `apps/cli/src/store/proposals.ts`, `apps/cli/tests/store/evaluations.test.ts`, `apps/cli/tests/store/proposals.test.ts` | Added DAO behavior/tests for the missing cases. |
| R9 long-body fixture was below the documented 1000+ word threshold. | Correctness | `apps/cli/tests/fixtures/phase2/long-body.md` | Expanded fixture to 1155 words. |

**SECU review:**

- **Security:** PASS — no secrets, env files, or unsafe command execution introduced. Test SQL updates interpolate numeric constants only.
- **Efficiency:** PASS — added tests remain in-memory/local and do not add network or persistent filesystem dependencies.
- **Correctness:** PASS — the reported output leak run no longer appears; dot reporter output is clean under the full gate.
- **Usability:** PASS — task evidence now matches the actual gate result and fixture size.

### Testing

- **Command:** `bun run autofix && bun run spur-check`
- **Executed:** 2026-06-16
- **Result:** EXIT_CODE=0; 443 pass, 0 fail across 37 files
- **Coverage:** 99.74% funcs, 98.25% lines


### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References

- `docs/features/F015-phase2-tests.md` — feature spec
- `docs/design/design-doc-phase2.md` §4 — data store schema (for store tests)
- `docs/design/design-doc-phase2.md` §5 — template system (for scaffold tests)
- `docs/design/design-doc-phase2.md` §2.2 — validate operation (for validate tests)
- `docs/design/design-doc-phase2.md` §2.3 — evaluate operation (for evaluate tests)
- `docs/design/design-doc-phase2.md` §2.4 — refine operation (for refine tests)
- `docs/design/design-doc-phase2.md` §2.5 — evolve operation (for evolve tests)
- `docs/design/design-doc-phase2.md` §3 — quality dimensions by content type
- `docs/design/design-doc-phase2.md` §6 — code layout (all source paths)
- `docs/design/design-doc-phase2.md` §9 — shared foundation (content/*, store/* contracts)
- `docs/design/design-doc-phase2.md` §10 — ADR-013 storage conventions (content_name, target_agent default)
- `apps/cli/tests/targets.test.ts` — existing test conventions (bun:test, describe/it/expect)
- `apps/cli/tests/config.test.ts` — existing test conventions with temp dirs
- `bunfig.toml` — coverage thresholds (lines ≥ 0.9, functions ≥ 0.9)
- `docs/features/F008-sqlite-store.md` — store DAO interfaces (EvaluationDao, ProposalDao)
- `docs/features/F007-template-scaffold.md` — scaffold operation + content utilities
- `docs/features/F010-validate-operation.md` — validate operation API
- `docs/features/F011-evaluate-operation.md` — evaluate operation API
- `docs/features/F012-refine-operation.md` — refine operation API
- `docs/features/F013-evolve-operation.md` — evolve operation API
- `docs/features/F014-type-commands.md` — CLI command surface
