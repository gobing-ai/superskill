---
name: Refactor CLI core into workspace packages
description: Refactor CLI core into workspace packages
status: WIP
created_at: 2026-06-19T23:56:43.959Z
updated_at: 2026-06-20T00:18:00.378Z
folder: docs/tasks
type: task
feature-id: ""
preset: standard
impl_progress:
  planning: completed
  design: completed
  implementation: partial
  review: partial
  testing: partial
---

## 0043. Refactor CLI core into workspace packages

### Background

Architecture drift: the design says apps/cli should own CLI surface concerns while core behavior belongs in workspace packages, but most implementation currently lives under apps/cli and packages/ is effectively empty. This task creates a controlled migration plan so future implementation can extract core modules without behavioral drift.


### Requirements

- Preserve existing CLI behavior and command surfaces while moving non-CLI domain logic out of apps/cli.
- apps/cli keeps Commander registration, option parsing, output formatting, process exit behavior, and CLI dependency wiring.
- packages/core owns reusable core logic: content, quality, pipeline, target mapping, marketplace resolution, mapper, rulesync wrapper, and pure operation functions where practical.
- Operations are split into structured core APIs plus thin CLI adapters; no broad blind move of commands/.
- Store extraction is deferred unless a second consumer or clearer reuse case exists.
- Migration must be phased, tested after each phase, and documentation kept synchronized with ADR/design docs.
- No command, flag, config key, exit code, output contract, or package boundary may drift without an explicit ADR/design update.


### Q&A

**Decision Q&A captured from discussion**

- **Q:** Is the current `apps/cli`-only implementation a problem?
  **A:** Yes, it is architecture drift from the intended workspace split, but not an emergency. The fix should be phased extraction, not a broad rewrite.

- **Q:** What belongs in `apps/cli` after migration?
  **A:** Commander command registration, option parsing, stdout/stderr formatting, process exit behavior, CLI-only dependency wiring, and command-specific UX.

- **Q:** What belongs in packages?
  **A:** Reusable domain logic with typed APIs and no Commander/process coupling: content editing, quality scoring, conversion pipeline, target mapping, plugin resolution/mapping, rulesync orchestration, and operation core logic where practical.

- **Q:** Should `store/` move immediately?
  **A:** No. Keep it in `apps/cli` initially unless another consumer needs it or the data store becomes an independent library surface. It is coupled to CLI-local `.superskill` data-root behavior.

- **Q:** Should this be done as one large refactor?
  **A:** No. Extract stable seams first, preserve behavior with tests, then split operations into core APIs plus CLI adapters.


### Design

**Target architecture**

`apps/cli` becomes a thin CLI app. It owns:

- Commander command tree and option declarations.
- Parsing strings into typed options.
- Mapping domain errors to process exit codes.
- Formatting human/JSON output for commands.
- CLI-only shell/process interactions.

`packages/core` becomes the main reusable library. It owns:

- `content/*`: frontmatter parsing/editing, identity, hashing, backup helpers where appropriate.
- `quality/*`: deterministic evaluators, rubrics, dimensions.
- `pipeline/*`: conversion stages and target-specific text transforms.
- `targets.ts`: target taxonomy and maps.
- `marketplace.ts`: marketplace manifest parsing and plugin root resolution.
- `mapper.ts`: plugin source to `.rulesync` canonical mapping.
- `rulesync.ts`: wrapper around `rulesync.generate`.
- Core operation APIs where behavior can return structured results without process coupling.

`apps/cli/src/commands/*` stays in the app. Each command should import package APIs and be limited to command surface responsibilities.

`packages/store` is deferred. The existing `store/*` should stay in `apps/cli` until either:

- a second workspace consumer needs persisted evaluations/proposals, or
- operation APIs cannot be extracted cleanly without a package-level persistence abstraction.

**Package boundary rules**

- `apps/cli` may import `@gobing-ai/superskill-core`.
- `packages/core` must not import from `apps/cli`.
- Workspace imports must use package aliases, never deep relative imports across sibling packages.
- Package APIs return structured results and throw typed/domain errors; they do not call `process.exit`.
- Package APIs should not write to stdout/stderr. They may accept optional logger/callbacks only when needed.
- CLI adapters convert structured results to user-facing text, JSON, and exit codes.

**Phased migration**

Phase 1 extracts leaf/core modules with minimal behavior risk:

- Create `packages/core`.
- Move `content/*`, `quality/*`, `pipeline/*`, `targets.ts`, `marketplace.ts`, `mapper.ts`, and `rulesync.ts`.
- Update imports in `apps/cli`.
- Move corresponding tests or keep CLI integration tests in place while adding package tests.

Phase 2 splits operations:

- For each operation, create a core API that returns structured data.
- Keep command-specific rendering and process behavior in `apps/cli/src/commands`.
- Start with lower-coupling operations: `validate`, `evaluate`, `scaffold`, `package`, `migrate`.
- Treat `install`, `refine`, and `evolve` as later/harder extractions because they combine I/O, persistence, and command UX.

Phase 3 evaluates persistence:

- Decide whether `store/*` remains app-owned or becomes `packages/store`.
- If extracted, define a package-level data-root/config seam first.
- Do not move store just to satisfy symmetry.

Phase 4 closes drift:

- Update `docs/00_ADR.md` if any package-boundary decision changes.
- Update `docs/03_ARCHITECTURE.md` and `docs/04_DESIGN.md` with the new workspace graph and public package surfaces.
- Ensure `README.md` and package manifests match the shipped binary/library layout.

**Anti-drift constraints**

- Command names, flags, defaults, exit codes, and output contracts must remain unchanged unless explicitly documented.
- `superskill --version` must continue to match `apps/cli/package.json`.
- `superskill install` behavior must remain identical for supported targets.
- `.rulesync/` intermediate behavior must not change accidentally; dry-run semantics need a separate product decision if changed.
- No new package manager, runtime, linter, formatter, or CLI framework.
- No package extraction that introduces circular imports or app-to-package-to-app dependencies.


### Solution

**Intended implementation approach**

Create `packages/core` as the first extraction target and move stable, reusable modules before touching operation flows. The first implementation PR/task should be a no-behavior-change move:

- Add `packages/core/package.json`, `tsconfig.json`, and `src/index.ts`.
- Move selected modules from `apps/cli/src` to `packages/core/src`.
- Export only intentional public APIs from `packages/core/src/index.ts`.
- Update `apps/cli` imports to use `@gobing-ai/superskill-core`.
- Move or duplicate tests so package behavior is covered at the package level, while CLI smoke/integration tests remain in `apps/cli/tests`.

After Phase 1, split operation modules incrementally. For each operation:

- Define a core function signature with typed input and structured output.
- Move behavior into `packages/core`.
- Leave the command file as the adapter.
- Preserve existing tests, then add package-level tests for the new API.

Do not move `commands/*` into packages. Do not extract `store/*` until Phase 3 decision criteria are met.

**Phase 1 execution record (2026-06-19)**

Phase 1 — the no-behavior-change move — is complete. Scope delivered this run:

- Created `packages/core` (`@gobing-ai/superskill-core`): `package.json` (`main: src/index.ts`, typecheck + test scripts, deps `yaml`/`zod`/`rulesync`/`@gobing-ai/ts-ai-runner`), `tsconfig.json` extending the shared base preset, `src/index.ts` barrel.
- Moved to `packages/core/src/` via `git mv` (history preserved): `content/*` (backup, edit, frontmatter, hash, identity, paths, types), `quality/*` (agent, command, dimensions, hook, magent, rubric, skill), `rubrics/*` (5 YAML files), `pipeline/*` (convert, frontmatter, pi-subagent, rewrite-colons, slash-command), `targets.ts`, `marketplace.ts`, `mapper.ts`, `rulesync.ts`.
- Deduplicated `ContentType`: `quality/dimensions.ts` now imports the canonical type from `content/types.ts` (type-only change; removes a pre-existing duplicate definition so the barrel has no ambiguous re-export).
- Updated 12 `apps/cli` source files to import from `@gobing-ai/superskill-core` (config, commands/helpers, commands/hook, commands/install, operations/{evaluate,evolve,migrate,package,refine,scaffold,validate}, store/db). `store/db.ts` continues to re-export `getDBPath` from core for its existing consumers.
- Updated the CLI build script: rubrics now copy from `../../packages/core/src/rubrics` into `apps/cli/rubrics/` (the bundle inlines core source, so `loadRubric` resolves rubrics at `import.meta.dir/../rubrics` in both dev and built-CLI modes).
- Moved pure unit tests to `packages/core/tests/` (content, quality, pipeline, targets, marketplace, mapper, rulesync); copied the `plugin-min` fixture into `packages/core/tests/fixtures/` so the core mapper test is self-contained. CLI integration/Commander tests stayed in `apps/cli/tests`; their moved-module imports switched to the package alias.
- Added `packages/core/tests/package-boundary.test.ts` enforcing: no core import from `apps/cli` (relative or alias), no `process.exit`/stdout/stderr/console writes in core.

**Phases 2–3 remain (not delivered this run).** Operation splitting (Plan step 5: extract core APIs for validate/evaluate/scaffold/package/migrate, defer install/refine/evolve) and the store extraction decision (Plan step 6) are explicitly future work per the Solution's "After Phase 1" and "Phase 3" framing. The task stays non-terminal until those phases land.


### Plan

1. **Baseline**
   - Run `bun run lint`, `bun run test`, and `bun run build`.
   - Capture current command smoke checks: `superskill --help`, `superskill --version`, and representative `install --dry-run`.

2. **Create package shell**
   - Add `packages/core`.
   - Configure package name as the project-scope alias.
   - Add package build/typecheck/test scripts consistent with existing workspace conventions.

3. **Extract leaf modules**
   - Move `content/*`, `quality/*`, `pipeline/*`, `targets.ts`, `marketplace.ts`, `mapper.ts`, `rulesync.ts`.
   - Update imports in `apps/cli`.
   - Export stable APIs from `packages/core/src/index.ts`.
   - Run focused tests after each cluster move.

4. **Update tests**
   - Move pure unit tests beside package code where appropriate.
   - Keep CLI integration and Commander tests in `apps/cli/tests`.
   - Add import-boundary tests if useful: `packages/core` must not import from `apps/cli`.

5. **Split operations incrementally**
   - Start with `validate`, `evaluate`, `scaffold`, `package`, `migrate`.
   - For each: extract core API, keep CLI adapter, run focused tests.
   - Defer `install`, `refine`, `evolve` until the extraction pattern is proven.

6. **Store decision**
   - Review whether `store/*` has a second consumer or independent package value.
   - If yes, create `packages/store` with an explicit data-root seam.
   - If no, document why it remains app-owned.

7. **Documentation sync**
   - Update `docs/03_ARCHITECTURE.md` module boundary map.
   - Update `docs/04_DESIGN.md` package/API surface if command/config/schema shapes change.
   - Add or amend ADR only if a binding decision changes.

8. **Final gate**
   - `bun run lint`
   - `bun run test`
   - `bun run build`
   - Built binary smoke checks.
   - `git status` only intentional changes.


### Review

**Verdict: PASS (Phase 1 — no-behavior-change extraction).** SECU + traceability assessment of the Phase 1 deliverable:

| Check | Result | Evidence |
|-------|--------|----------|
| Behavior preservation | PASS | `superskill --version` → `0.1.3`; `--help` command tree identical to baseline (install, agent, skill, command, hook, magent). Bundle built from inlined core source. |
| Lint + typecheck | PASS | `bun run lint` clean — biome + `tsc --noEmit` across `@gobing-ai/superskill-core` and `@gobing-ai/superskill`. |
| Tests | PASS | 729 pass / 0 fail (baseline was 726; +3 from new boundary tests + closing-gate now scans core quality). No skipped tests. |
| Coverage | PASS | 99.57% functions / 98.35% lines aggregate (threshold: 90%/90%). Moved modules retain equivalent or better coverage. |
| Build | PASS | `bun run build` → `dist/index.js` 3.40 MB, 761 modules, exit 0. |
| Install pipeline | PASS | 39 install/integration tests pass (marketplace→mapper→pipeline→rulesync→dispatch end-to-end through the extracted core). |
| Package boundary | PASS | `packages/core/tests/package-boundary.test.ts` asserts no core→app imports, no `process.exit`/stdout/stderr/console in core. No deep relative imports from CLI into core (all use `@gobing-ai/superskill-core`). |
| Anti-drift constraints | PASS | No command/flag/exit-code/output-contract change. No new runtime/pm/linter/formatter/framework. No circular imports. `.rulesync/` intermediate behavior unchanged. |
| Git hygiene | PASS | `git mv` preserved rename history (46 renames). Change set is intentional (M/A/R only); untracked items are new package files + test-generated `.opencode/.pi/.rulesync` artifacts under `apps/cli/` (pre-existing test-output pattern, root-anchored gitignore doesn't cover `apps/cli/` subdir). |

**Scoped note.** This verdict covers Phase 1 only. Phases 2–3 (operation splitting, store decision) remain; the task is non-terminal until they land. Transitioning to `Done` now would misrepresent the full refactor as complete.


### Testing

**Required verification**

- `bun run lint` passes after every extraction phase.
- `bun run test` passes with no skipped tests.
- `bun run build` succeeds across all workspaces.
- Built CLI smoke checks:
  - `bun apps/cli/dist/index.js --version`
  - `bun apps/cli/dist/index.js --help`
  - representative `install --dry-run` fixture path
- Package-boundary check:
  - no `packages/core` imports from `apps/cli`
  - no deep relative imports from `apps/cli` into `packages/core`
  - workspace alias imports are used for cross-package access

**Regression coverage expectations**

- Existing behavior tests should pass unchanged unless a test only asserted old file paths.
- Any moved pure module keeps equivalent or better unit coverage.
- Command adapter tests should assert command names, flags, defaults, output, and exit-code behavior.
- Install/mapping tests must continue covering path-safety and marketplace source validation.

**Phase 1 testing evidence (2026-06-19)**

- Command: `bun run lint && bun run test && bun run build` (+ targeted `bun test tests/commands/install*.test.ts`).
- Scope: full workspace — `@gobing-ai/superskill-core` (typecheck + 13 moved test files + boundary test) and `@gobing-ai/superskill` (all CLI integration/operation/command tests).
- Result: PASS. `bun run lint` clean (biome + typecheck both workspaces). `bun run test` → 729 pass / 0 fail / 1787 expect() calls / 53 files. `bun run build` → exit 0, `dist/index.js` 3.40 MB. Install suite → 39 pass / 0 fail.
- Coverage: 99.57% functions / 98.35% lines aggregate (≥ 90%/90% threshold). Moved modules retain 90–100% line coverage.
- Smoke: `bun apps/cli/dist/index.js --version` → `0.1.3`; `--help` → identical command tree to baseline.
- Boundary: `packages/core/tests/package-boundary.test.ts` (3 assertions) passes — no core→app imports, no process/stdout/console coupling in core.
- Fixes applied during test: `evaluate-ingest.test.ts` rubric path updated to `packages/core/src/rubrics/agent.yaml`; `phase4-closing-gate.test.ts` quality-dir scan repointed to `../../../packages/core/src/quality`.
- Next action: none for Phase 1. Phases 2–3 (operation splitting, store decision) are follow-up work.


### Artifacts
| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |
| package | `packages/core/` (package.json, tsconfig.json, src/index.ts) | task-runner (Phase 1) | 2026-06-19 |
| source (moved) | `packages/core/src/{content,quality,pipeline,rubrics}` + `targets/marketplace/mapper/rulesync.ts` | task-runner (Phase 1) | 2026-06-19 |
| tests (moved) | `packages/core/tests/{content,quality,pipeline}` + `targets/marketplace/mapper/rulesync.test.ts` + `fixtures/plugin-min` | task-runner (Phase 1) | 2026-06-19 |
| test (new) | `packages/core/tests/package-boundary.test.ts` | task-runner (Phase 1) | 2026-06-19 |
| docs | `docs/03_ARCHITECTURE.md` (v2.4.0 — module boundaries, mermaid, workspace packages) | task-runner (Phase 1) | 2026-06-19 |
| docs | `docs/00_ADR.md` (ADR-002 realization note) | task-runner (Phase 1) | 2026-06-19 |
| docs | `AGENTS.md` (workspace layout block) | task-runner (Phase 1) | 2026-06-19 |

### References

- `docs/00_ADR.md` — ADR-002 workspace layout, ADR-003 Commander, ADR-010 rulesync output ownership, ADR-014 store access layer.
- `docs/03_ARCHITECTURE.md` — current module boundaries and data flow.
- `docs/04_DESIGN.md` — CLI/package surface reference.
- `AGENTS.md` — workspace conventions, verification gate, package import rules.
- `apps/cli/src/` — current implementation source.
- `packages/` — target workspace package location.

