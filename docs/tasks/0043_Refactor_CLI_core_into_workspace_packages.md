---
name: Refactor CLI core into workspace packages
description: Refactor CLI core into workspace packages
status: Done
created_at: 2026-06-19T23:56:43.959Z
updated_at: 2026-06-20T01:06:25.772Z
folder: docs/tasks
type: task
feature-id: ""
preset: standard
impl_progress:
  planning: completed
  design: completed
  implementation: completed
  review: completed
  testing: completed
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

**Execution record**

Task 0043 is complete. The workspace now follows the intended boundary: `apps/cli` owns the Commander surface, command UX, process/output behavior, persistence, and store-backed workflows; `packages/core` owns reusable logic and no-app operation APIs.

Phase 1 extracted the stable core library:

- Created `packages/core` as `@gobing-ai/superskill-core`.
- Moved reusable content, quality, pipeline, rubrics, targets, marketplace, mapper, and rulesync modules into `packages/core/src/`.
- Updated CLI imports to use the workspace alias.
- Moved pure unit coverage into `packages/core/tests/` where appropriate.
- Added `packages/core/tests/package-boundary.test.ts` to prevent core-to-app imports and process/stdout coupling.

Phase 2 split the lower-coupling operations:

- Moved `validate`, `scaffold`, `package`, and deterministic `migrate` behavior into `packages/core/src/operations/`.
- Kept `apps/cli/src/operations/{validate,scaffold,package}.ts` as thin package re-export adapters.
- Kept `apps/cli/src/operations/migrate.ts` as the CLI/store refinement adapter while delegating deterministic merge/write behavior to `migrateSkillsDeterministic`.
- Left `evaluate`, `refine`, `evolve`, and `install` app-owned because they still combine CLI output, persistence, generation/refinement orchestration, or install UX. The evaluator engines and rubric loading they depend on are already core-owned.
- Fixed bundled scaffold template resolution after built-CLI smoke exposed the wrong production path.

Phase 3 resolved the store decision:

- `apps/cli/src/store/*` remains app-owned.
- Rationale: persisted evaluations/proposals have no second workspace consumer and are coupled to CLI-local `.superskill` data-root behavior. Extracting `packages/store` now would add an abstraction without a reuse boundary.

Documentation is synchronized:

- `docs/00_ADR.md` ADR-002 realization now records the completed core extraction and app-owned store decision.
- `docs/03_ARCHITECTURE.md` now lists core operation APIs and app-owned store-backed workflows.
- `AGENTS.md` workspace layout now describes `packages/core` as reusable domain logic plus no-app operation APIs.


### Plan

1. **Baseline** — completed
   - Verified full workspace lint/test/build before closing the task.

2. **Create package shell** — completed
   - `packages/core` exists as `@gobing-ai/superskill-core` with workspace scripts and public barrel exports.

3. **Extract leaf modules** — completed
   - Content, quality, pipeline, target, marketplace, mapper, rulesync, and rubric modules are package-owned.

4. **Update tests** — completed
   - Pure package behavior has package-level coverage.
   - CLI integration and Commander tests remain in `apps/cli/tests`.
   - Package-boundary tests enforce no app dependency from core.

5. **Split operations incrementally** — completed for the safe operation set
   - `validate`, `scaffold`, `package`, and deterministic `migrate` moved to core operation APIs.
   - App adapters preserve existing import paths and command behavior.
   - `evaluate`, `refine`, `evolve`, and `install` remain app-owned pending a real persistence/generation boundary.

6. **Store decision** — completed
   - Store remains app-owned; no `packages/store` until a second consumer or independent data-root seam exists.

7. **Documentation sync** — completed
   - ADR, architecture, AGENTS, and this task record are aligned with the implemented boundary.

8. **Final gate** — completed
   - Lint, tests, build, package boundary, and built-CLI smoke all pass.


### Review

**Verdict: PASS.** Task 0043 requirements are met with no open SECU findings.

| Check | Result | Evidence |
|-------|--------|----------|
| CLI behavior preserved | PASS | Built CLI `--version` still returns `0.1.3`; `--help` lists the existing command tree. |
| CLI surface stays in app | PASS | Commander command files remain under `apps/cli/src/commands/*`; command UX/output/process mapping remains app-owned. |
| Core logic moved to packages | PASS | `packages/core/src/` owns content, quality, pipeline, target, marketplace, mapper, rulesync, rubrics, and operation APIs for validate/scaffold/package/migrate. |
| Operation boundary | PASS | App operation files are thin adapters where safe; store-backed/generation-heavy workflows stay app-owned instead of forcing a premature persistence abstraction. |
| Store decision | PASS | `apps/cli/src/store/*` remains app-owned with documented rationale: no second consumer and CLI-local data-root coupling. |
| Package boundary | PASS | `packages/core/tests/package-boundary.test.ts` enforces no core import from app and no `process.exit`/stdout/stderr/console writes in core. |
| Docs synchronized | PASS | ADR-002, architecture module map, AGENTS workspace layout, and this task record reflect the implemented boundary. |
| Anti-drift constraints | PASS | No command/flag/default/exit-code/output-contract changes. No runtime/package-manager/linter/framework changes. |

**Fix found during verification:** built `skill scaffold` initially failed because the bundled core module resolved templates at `apps/templates/...` instead of `apps/cli/templates/...`. `packages/core/src/operations/scaffold.ts` now resolves production templates from `apps/cli/dist` to `apps/cli/templates`, and the built smoke passes.

**Residual risk:** `evaluate`, `refine`, `evolve`, and `install` are intentionally not fully package-owned. Moving them cleanly requires a separate persistence/generation API design, not a blind file move.


### Testing

**Final verification evidence (2026-06-20)**

| Command | Result |
|---------|--------|
| `bun run lint` | PASS — Biome checked 126 files; typecheck passed for `@gobing-ai/superskill-core` and `@gobing-ai/superskill`. |
| `bun run test` | PASS — 748 pass / 0 fail / 1827 expect() calls / 54 files; coverage 99.61% funcs / 98.47% lines. |
| `bun run build` | PASS — bundled 765 modules, `apps/cli/dist/index.js` 3.41 MB. |
| `bun apps/cli/dist/index.js --version` | PASS — `0.1.3`. |
| `bun apps/cli/dist/index.js --help` | PASS — existing command tree present. |
| `bun apps/cli/dist/index.js skill scaffold core-smoke --output /private/tmp/superskill-scaffold-smoke.U5HAqG --force` | PASS — created `/private/tmp/superskill-scaffold-smoke.U5HAqG/core-smoke.md`. |

Focused checks also passed before the final full gate:

- Operation adapter/core coverage: `validate`, `scaffold`, `package`, and `migrate` tests pass through package-level and app-adapter coverage.
- Boundary coverage: `packages/core/tests/package-boundary.test.ts` passes.

Failures fixed during this completion pass:

- `git mv` was blocked by sandbox `.git/index.lock` permissions; files were moved/copied in the workspace and left for normal git staging outside the sandbox.
- A focused subset test run had 82 pass / 0 fail but returned non-zero because project coverage thresholds are global and the subset did not cover enough files. Full `bun run test` passes.
- Built `skill scaffold` initially failed with `ENOENT` for `apps/templates/skill/default.md`; production template resolution is fixed and the same built smoke now passes.


### Artifacts
| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |
| package | `packages/core/` | task-runner / Codex | 2026-06-20 |
| source | `packages/core/src/{content,quality,pipeline,rubrics}` + `targets.ts`, `marketplace.ts`, `mapper.ts`, `rulesync.ts` | task-runner | 2026-06-19 |
| source | `packages/core/src/operations/{validate,scaffold,package,migrate}.ts` | Codex | 2026-06-20 |
| adapter | `apps/cli/src/operations/{validate,scaffold,package}.ts` | Codex | 2026-06-20 |
| adapter | `apps/cli/src/operations/migrate.ts` | Codex | 2026-06-20 |
| tests | `packages/core/tests/` and `apps/cli/tests/operations/*` | task-runner / Codex | 2026-06-20 |
| docs | `docs/00_ADR.md` | Codex | 2026-06-20 |
| docs | `docs/03_ARCHITECTURE.md` | Codex | 2026-06-20 |
| docs | `AGENTS.md` | Codex | 2026-06-20 |


### References

- `docs/00_ADR.md` — ADR-002 workspace layout and realized package boundary.
- `docs/03_ARCHITECTURE.md` — module boundary map and package/app ownership.
- `docs/04_DESIGN.md` — CLI command surface reference; unchanged because no command/flag/config/schema surface changed.
- `AGENTS.md` — workspace conventions, verification gate, package import rules.
- `packages/core/src/` — reusable package implementation.
- `apps/cli/src/` — CLI command surface, adapters, persistence, and store-backed workflows.

