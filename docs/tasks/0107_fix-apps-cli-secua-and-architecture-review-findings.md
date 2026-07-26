---
template: issue
schema_version: 1
name: "Fix apps CLI SECUA and architecture review findings"
description: ""
status: testing
type: issue
profile: standard
feature_id: null
parent_wbs: null
priority: P2
tags: ["bug"]
dependencies: []
created_at: "2026-07-26T07:44:06.236Z"
updated_at: "2026-07-26T08:10:55.916Z"
---

## 0107. Fix apps CLI SECUA and architecture review findings

### Background
The standalone `sp-dev-review apps --auto --focus all` audit on 2026-07-26 found ten SECUA defects and two architectural seams. The defects affect proposal ingestion, evolution/refinement integrity, hook installation, concurrent context accounting, configuration loading, and CLI input validation.

This task is intentionally separate from 0106, whose in-flight changes are limited to `packages/core/src/skills-ecosystem/` and its authoritative documentation.
### Requirements
R1. Treat agent-authored `proposal_id` as an untrusted identifier: reject unsafe path segments before any proposal file or version snapshot path is constructed.

R2. When `--ingest` and `--accept <id>` are combined, require `<id>` to exactly match the ingested proposal ID before applying any change.

R3. Validate CLI `--margin` as a finite number in the inclusive range `[0, 1]`; invalid, negative, and out-of-range values must fail before mutation and cannot bypass the delta gate.

R4. If refine cannot re-evaluate a mutated file, restore the pre-refine backup and report every reverted fix as skipped.

R5. Evolve verification must capture and link the exact newly persisted verification evaluation. Persistence or re-evaluation failure must not accept the proposal or link an older row.

R6. Hermes hook emission must reconcile plugin-owned hooks on reinstall while preserving foreign-plugin and user-authored hooks.

R7. OMP hook modules must preserve quoted and escaped command arguments instead of splitting them on raw whitespace.

R8. Indexed-context hook state must isolate concurrent sessions in the same project; one session must not overwrite or delete another session's state.

R9. Wire `superskill.jsonc` into production install defaults, parse actual JSONC comments/trailing commas, and keep explicit CLI options higher precedence than configuration.

R10. Reject invalid `--from` dates with an actionable usage error rather than silently disabling filtering.

R11 (C1). Introduce one ownership-aware hook reconciliation seam used by Pi/Hermes emitters; ownership detection must preserve commands not provably owned by the installing plugin.

R12 (C2). Introduce one proposal-application transaction seam owning identity checks, backup/apply/verify/status/snapshot invariants across ingested, stored, and interactive evolve paths.
### Acceptance Criteria
- [x] Unsafe proposal IDs cannot escape the proposal root and no out-of-root file is created.
- [x] A mismatched `--accept` ID leaves the target byte-identical and the proposal unapplied.
- [x] `--margin nope`, negative margins, and margins greater than one fail before mutation.
- [x] Refine restores the original file when post-fix evaluation throws.
- [x] Evolve never marks a proposal accepted or assigns `verify_id` when the new verification row is unavailable.
- [x] Reinstalling a Hermes plugin removes its stale hooks while preserving foreign and user hooks.
- [x] Generated OMP modules pass quoted command text as the intended argv values.
- [x] Two simultaneous context sessions maintain independent counters and stop cleanup.
- [x] Install consumes JSONC defaults; comments and trailing commas parse; explicit flags override config.
- [x] Invalid `--from` input returns an actionable error.
- [x] Pi and Hermes ownership reconciliation share one tested primitive.
- [x] All evolve apply paths use one tested transaction primitive.
### Q&A

<!-- Clarifications and triage decisions. Keep empty if none. -->

### Design
1. Validate boundary inputs once: safe proposal IDs, bounded finite margins, and ISO-like dates are parsed before state mutation.
2. Change `evaluate(..., { save: true })` to return the inserted evaluation identity with the report, so evolve never infers verification provenance from a later “latest row” query.
3. Add an ownership-aware canonical hook reconciler that prunes only exact `superskill hook run <plugin> ...` ownership matches. Adapt Pi and Hermes representations through that seam.
4. Replace OMP's whitespace split with the existing quote-aware command tokenizer, generalized into a shared utility without invoking a shell.
5. Key context state by the host session identifier when available, with a generated collision-resistant fallback; keep a small active-session index so post/stop hooks resolve the correct file.
6. Parse JSONC locally without adding a runtime/tool dependency, then apply config defaults at the install command boundary. Explicit CLI values win.
7. Centralize evolve mutation into `applyProposalTransaction`, parameterized by proposal source metadata but enforcing one identity/backup/verification/status lifecycle.
### Plan
1. Add boundary parsers and regression tests for proposal IDs, accept identity, margins, and dates.
2. Make evaluation persistence provenance explicit and repair refine/evolve rollback behavior.
3. Deepen hook reconciliation and OMP argv parsing; add upgrade regressions.
4. Isolate concurrent context session files and add interleaving tests.
5. Wire and harden JSONC configuration with precedence tests and synchronize authoritative command/config docs.
6. Run lint, full tests, build, git-status audit, and `spur-check`; record requirement and AC evidence.
### Root Cause
The reviewed paths accepted typed-but-unvalidated external values, inferred transactional success from ambient “latest” state, and implemented target-specific reconciliation independently. Those three patterns produced the ten surface defects: unsafe path construction, permissive numeric/date parsing, mutation without rollback, stale verification linkage, stale Hermes hooks, lossy OMP argv generation, shared session state, and an orphaned config loader.
### Solution
- `apps/cli/src/operations/evolve.ts:1361`, `apps/cli/src/operations/evaluate.ts:75`, and
  `apps/cli/src/operations/refine.ts:536`: validate proposal/date/margin inputs, return exact inserted
  evaluation IDs, and route all evolve accept paths through a rollback transaction; refine also
  restores its backup when post-fix evaluation fails.
- `apps/cli/src/hooks.ts:253`: centralize owner-aware event reconciliation and apply it to Pi and
  Hermes, including empty desired hook sets.
- `apps/cli/src/command-argv.ts:8` and `apps/cli/src/commands/hook-run.ts:201`: share a quote-aware
  non-shell argv parser and isolate context state in identity-hashed session files.
- `apps/cli/src/config.ts:31`, `apps/cli/src/commands/install.ts:110`, and
  `packages/core/src/mapper.ts:39`: parse JSONC comments/trailing commas, apply config
  plugin/target/feature defaults with CLI precedence, filter mapper classes, and fail native targets
  before mutation when partial features cannot be honored.
- Synchronized ADR, architecture, surface, roadmap, design, help, indexed anatomy, buglog, and
  do-not-repeat context.
### Testing
Verified 2026-07-26T08:10:16Z:

- `bun run lint` — PASS; Biome checked 213 files and both workspaces typechecked.
- `bun run test` — PASS; 1,895 tests across 99 files, 0 failures, 98.91% line and 99.64% function
  coverage.
- `bun run build` — PASS; scripts converted and standalone CLI bundled/compiled.
- `bun run test-pre-check` — PASS as part of `bun run spur-check`; all 31 enabled pre-check rules.
- `bun run test-post-check` — PASS; coverage, citation resolution, and exported-TSDoc rules.

Regression tests cover unsafe/mismatched proposal IDs, invalid margins/dates, exact verification
provenance and rollback, refine rollback, Hermes ownership cleanup, OMP quoting, concurrent context
sessions, JSONC parsing/config precedence, mapper feature filtering, and native-target rejection.
### Review
PASS — all R1–R12 and all twelve acceptance criteria are implemented with executable regression
coverage. No P1–P4 findings remain in the task-owned apps/core-mapper diff.

Residual behavior is intentional: an identity-free context payload reuses state only when exactly
one active session exists; ambiguous payloads fail open. Native host installers still operate on
whole plugins, so a configured partial feature set is rejected before any mutation.

The first `spur-check` run found one missing TSDoc comment on exported `InstallOptions`; the comment
was added, then lint/typecheck and all post-check rules passed.
### References
- Review scope: `apps/`
- Related package review remediation: task 0106 (separate ownership; do not modify its package changes)
- Binding architecture: `docs/00_ADR.md`
- CLI/config surface: `docs/04_DESIGN.md`
### History
- 2026-07-26T07:44:57.431Z backlog → todo (system)
- 2026-07-26T07:44:58.696Z todo → wip (system)
- 2026-07-26T08:09:47.851Z wip → testing (system)
