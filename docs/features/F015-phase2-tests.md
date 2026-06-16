---
feature_id: F015
title: Phase 2 tests
phase: 2
status: planned
depends_on: [F007, F008, F009, F010, F011, F012, F013, F014]
deliverables:
  - apps/cli/tests/content.test.ts
  - apps/cli/tests/scaffold.test.ts
  - apps/cli/tests/validate.test.ts
  - apps/cli/tests/evaluate.test.ts
  - apps/cli/tests/refine.test.ts
  - apps/cli/tests/evolve.test.ts
  - apps/cli/tests/store.test.ts
  - apps/cli/tests/commands.test.ts
created: 2026-06-16
---

# F015 — Phase 2 tests

## What

Comprehensive tests for all Phase 2 functionality. Unit tests for each operation and store module. Integration tests for CLI commands (spy on `process.stdout.write` per project convention). Coverage target: ≥90% line and function in aggregate across all Phase 2 source files.

## Why

The verification gate. Phase 2 has significant complexity (5 types × 5 operations + store + templates); tests are essential for correctness and regression prevention. Without thorough tests, the self-evolution engine has no safety net — a bad evolve proposal could corrupt content files.

## Change

### `content.test.ts` (F007 foundation)

- **`parseFrontmatter`:** well-formed file → `{ data, body, raw }`; `data` is the parsed object, `body` excludes the frontmatter. Malformed YAML → throws `FrontmatterError`. No frontmatter block → throws (callers convert to a finding).
- **`applyFrontmatterChange`:** editing one key preserves comments and other keys' order on re-serialize (round-trip via `yaml`).
- **`resolveContentName`:** `/a/b/my-skill.md` → `my-skill`; `/a/b/SKILL.md` → `b`; bare `my-skill` → `my-skill`.
- **`resolveContentPath`:** existing path returned unchanged; bare name resolves into cwd.
- **`hashContent`:** stable SHA-256 for identical bytes; differs after a one-byte change.
- **`applyChange`:** `kind: 'frontmatter'` updates the field; `kind: 'text'` replaces the nearest match of `current` with `proposed`.
- **`getDataRoot` precedence:** with `<cwd>/.superskill/` present → cwd; absent → homedir; `projectRoot` given → that root. Use a tmpdir to toggle the `.superskill/` directory; never touch the real `~/.superskill/`.

### `store.test.ts`

Exercises the ts-db DAOs (F008, ADR-014) — never `bun:sqlite` directly. All DAO calls are `await`ed.

- **Store creation and migration:** `await openStore({ url: ':memory:' })` creates both tables via `applyMigrations`; a second open is idempotent (no duplicate-table error).
- **`EvaluationDao.insertEvaluation`:** returns a numeric id; stores all fields including JSON `dimensions`; boundary validation rejects a malformed record (derived zod `insertSchema`).
- **`getEvaluations`:** rows ordered by `created_at` DESC, empty array when no matches.
- **`getLatestEvaluation`:** most recent row, `null` when no matches.
- **`ProposalDao.insertProposal`:** returns a numeric id, defaults status to `'draft'`.
- **`getProposals`:** rows for given content type/name.
- **`getPendingProposals`:** only `status = 'draft'` rows.
- **`updateProposalStatus`:** updates status to `'accepted'`/`'rejected'`, sets `applied_at` / `verify_id` when provided, bumps `updated_at`.
- Uses the ts-db `bun-sqlite` adapter with `:memory:` for isolation — no filesystem dependencies, no real `~/.superskill/`.

### `scaffold.test.ts`

- **Template resolution order:** user template (`~/.superskill/templates/<type>/default.md`) wins over built-in.
- **Variable substitution:** `<!-- NAME -->`, `<!-- DESCRIPTION -->`, `<!-- TARGET -->` replaced with provided values.
- **File output:** scaffolded file exists at expected path with expected content.
- **Default description:** when `--description` omitted, placeholder is used.
- **Error on missing template:** when neither user nor built-in template exists for a type, throws with clear message.
- **Output directory:** respects `--output` option (defaults to cwd).

### `validate.test.ts`

- **Valid file passes:** well-formed content with all required frontmatter fields → `valid: true`, no error findings.
- **Missing frontmatter:** file with no YAML frontmatter → `valid: false`, finding for frontmatter absence.
- **Wrong types:** `allowed-tools` as string instead of array → `valid: false`, type-mismatch finding.
- **Missing required fields:** `name` or `description` absent from frontmatter → `valid: false`.
- **`--strict` enables extra checks:** description length warning, optional field format checks.
- **File not found:** exit code 2, message includes the missing path.
- **Unreadable file:** exit code 2, message identifies the permission issue.
- **Link validity:** references to non-existent skills/agents flagged as warnings (not errors).

### `evaluate.test.ts`

- **Each dimension returns 0.0–1.0:** verify all dimensions in the report are within range.
- **Aggregate computed correctly:** mean of all dimension scores, matches manual calculation.
- **`--json` output format:** valid JSON with all expected fields (`content`, `type`, `target`, `aggregate`, `dimensions`).
- **`--save` writes to store:** evaluation row exists in DB after evaluate with `--save`.
- **Empty content:** near-zero scores with explanatory notes (not NaN or error).
- **Perfect content:** scores approaching 1.0 (may not be exactly 1.0 with heuristic scoring).
- **Content-type switching:** `evaluate('skill', ...)` uses skill dimensions; `evaluate('agent', ...)` uses agent dimensions.

### `refine.test.ts`

- **Auto mode fixes structural issues:** missing frontmatter field added, array syntax normalized.
- **Score delta computed:** post-refine score ≥ pre-refine score.
- **Interactive mode parsing:** `--auto` flag correctly toggles auto vs interactive (testable via option parsing).
- **`--save` persists both pre- and post-refine evaluations.**
- **Flag-only changes:** content-level suggestions (rewording) are flagged, not auto-applied in `--auto` mode.

### `evolve.test.ts`

- **Trend analysis from mock evaluations:** 5 evaluations with declining dimension → trend table shows ↓ with correct delta.
- **Trend analysis with improving scores:** dimension improving over time → trend table shows ↑.
- **Proposal generation:** declining dimension produces at least one `ProposedChange` with `location`/`current`/`proposed`/`reason`.
- **`--propose-only` writes file:** proposal `.md` file exists at `proposals/<type>/<name>/YYYY-MM-DD-<id>.md` with valid YAML frontmatter.
- **`--accept` applies change:** content file modified, proposal status updated to `'accepted'`.
- **`--reject` updates status:** proposal marked `'rejected'`, no content changes.
- **No historical evaluations:** error message guides user to run `evaluate --save` first.
- **Post-evolution verify:** score delta displayed, evaluation saved with `operation: 'evolve'`, `verify_id` linked.

### `commands.test.ts`

- **Each command registers:** `superskill agent --help` output includes `scaffold`, `validate`, `evaluate`, `refine`, `evolve`.
- **Same for skill, command, hook, magent:** each `--help` shows the 5 operations.
- **Scaffold → validate → evaluate integration flow:** scaffold a skill, validate it passes, evaluate it produces a score.
- **`--json` flag on evaluate:** stdout contains valid JSON.
- **`--help` output correct:** subcommand descriptions mention the content type.
- **Unknown subcommand:** exits non-zero with help suggestion.
- **Exit-code mapping (helpers.ts):** validate with errors → exit 1; validate of a missing file → exit 2; scaffold over an existing file without `--force` → exit 1, with `--force` → exit 0.
- **`resolveTarget` default:** omitting `--target` yields `'claude'` in the persisted row (assert via a store query after `evaluate --save`).

### Test conventions (per project)

- In-memory SQLite (`:memory:`) for store tests — no filesystem side effects.
- Temp directories (`os.tmpdir()`) for file-output tests — cleaned up in `afterEach`.
- **Data-root isolation:** any test that triggers `--save`/evolve passes an explicit `projectRoot` (a tmpdir) so `getDataRoot` never resolves to the real `~/.superskill/`. Never write to the user's home during tests.
- `bun:test` runner with `describe`/`it`/`expect`.
- Spy on `process.stdout.write` for CLI output assertions (Phase 2 code writes through it, never `console.log`).
- No mocks for internal modules; real file I/O for integration paths.
- No `.skip`, `.todo`, or commented-out tests.

### Coverage scope

- The new Phase 2 source dirs — `content/`, `store/`, `quality/`, `operations/`, `commands/`, and `cli.ts` — are all under the `bunfig.toml` coverage scope (root `coverageThreshold = { lines = 0.9, functions = 0.9 }`). Adding ~16 source files below threshold fails `bun run test`; budget per-file tests accordingly. Template `.md` files are data, not executable lines — they do not count toward coverage.

## Acceptance

```
bun run test
# → All Phase 2 tests pass
# → Coverage ≥ 90% line, ≥ 90% function
# → No .skip or commented-out tests
```
