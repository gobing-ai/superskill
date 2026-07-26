---
template: issue
schema_version: 1
name: "Fix apps CLI SECUA and architecture review findings"
description: ""
status: done
type: issue
profile: standard
feature_id: null
parent_wbs: null
priority: P2
tags: ["bug"]
dependencies: []
created_at: "2026-07-26T07:44:06.236Z"
updated_at: "2026-07-26T20:28:55.711Z"
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
- `apps/cli/src/operations/evolve.ts:744`, `apps/cli/src/operations/evaluate.ts:76`, and
  `apps/cli/src/operations/refine.ts:536`: validate proposal/date/margin inputs, return exact inserted
  evaluation IDs, and route all evolve accept paths through a rollback transaction; refine restores
  its backup when post-fix evaluation fails.
- `apps/cli/src/hooks.ts:253`: centralize owner-aware event reconciliation and apply it to Pi and
  Hermes, including empty desired hook sets.
- `apps/cli/src/command-argv.ts:8` and `apps/cli/src/commands/hook-run.ts:214`: share a quote-aware
  non-shell argv parser and isolate context state in identity-hashed session files.
- `apps/cli/src/config.ts:115`, `apps/cli/src/commands/install.ts:77`, and
  `packages/core/src/mapper.ts:35`: parse JSONC comments/trailing commas, apply config
  plugin/target/feature defaults with CLI precedence, filter mapper classes, and fail native targets
  before mutation when partial features cannot be honored.
- Forced verification repaired the shared transaction at `apps/cli/src/operations/evolve.ts:1364`:
  only draft proposals may enter, existing rollback snapshots cannot be overwritten, and every
  failure restores content, removes partial snapshots, and clears acceptance linkage.
- `apps/cli/src/store/proposals.ts:24` supports explicitly clearing `applied_at` and `verify_id`;
  regressions at `apps/cli/tests/operations/evolve.test.ts:481`,
  `apps/cli/tests/operations/evolve.test.ts:499`, and
  `apps/cli/tests/store/proposals.test.ts:80` lock the status/snapshot rollback invariants.
- `docs/03_ARCHITECTURE.md:592` records the repaired proposal transaction lifecycle.
- Synchronized ADR, architecture, surface, roadmap, design, help, indexed anatomy, buglog, and
  do-not-repeat context for the original remediation.
### Testing
Forced verification completed 2026-07-26T20:26:46Z.

**Requirement Traceability**

| Req | Status | Evidence |
|---|---|---|
| R1 | MET | `apps/cli/src/operations/evolve.ts:744`; traversal regression `apps/cli/tests/operations/evolve-ingest.test.ts:285`. |
| R2 | MET | Identity equality gate `apps/cli/src/operations/evolve.ts:748`; byte-identical/no-persistence regression `apps/cli/tests/operations/evolve-ingest.test.ts:266`. |
| R3 | MET | CLI parser `apps/cli/src/commands/helpers.ts:6` and operation boundary `apps/cli/src/operations/evolve.ts:1482`; regressions `apps/cli/tests/commands/helpers.test.ts:46` and `apps/cli/tests/operations/evolve.test.ts:427`. |
| R4 | MET | Restore-and-reclassify path `apps/cli/src/operations/refine.ts:536`; executable rollback regression `apps/cli/tests/operations/refine.test.ts:460`. |
| R5 | MET | Exact inserted identity is returned at `apps/cli/src/operations/evaluate.ts:135` and required at `apps/cli/src/operations/evolve.ts:1146`; missing-row rollback regression `apps/cli/tests/operations/evolve-ingest.test.ts:296`. |
| R6 | MET | Hermes owner pruning uses `apps/cli/src/hooks.ts:411`; stale/foreign/user preservation regressions `apps/cli/tests/hooks.test.ts:806` and `:847`. |
| R7 | MET | Quote-aware parser `apps/cli/src/command-argv.ts:8` is consumed by OMP at `apps/cli/src/omp-hooks.ts:103`; argv regression `apps/cli/tests/command-argv.test.ts:5`. |
| R8 | MET | Identity-hashed state `apps/cli/src/commands/hook-run.ts:214`; interleaved-session regression `apps/cli/tests/commands/hook-run.test.ts:502`. |
| R9 | MET | JSONC loader `apps/cli/src/config.ts:115` and install precedence `apps/cli/src/commands/install.ts:77`; regressions `apps/cli/tests/config.test.ts:82` and `apps/cli/tests/commands/install.test.ts:139`. |
| R10 | MET | Actionable boundary error `apps/cli/src/operations/evolve.ts:1486`; regression `apps/cli/tests/operations/evolve.test.ts:423`. |
| R11 | MET | Shared primitive `apps/cli/src/hooks.ts:253`, consumed by Pi at `:314` and Hermes at `:421`; executable ownership regressions `apps/cli/tests/hooks.test.ts:470` and `:806`. |
| R12 | MET | All three accept paths call `apps/cli/src/operations/evolve.ts:1364`; full status/content/snapshot rollback and re-acceptance regressions `apps/cli/tests/operations/evolve.test.ts:481` and `:499`. |

**Acceptance Criteria Verification**

| AC | Status | Evidence Type | Evidence |
|---|---|---|---|
| AC1 Unsafe proposal IDs cannot escape | MET | test | `apps/cli/tests/operations/evolve-ingest.test.ts:285` |
| AC2 Mismatched accept is non-mutating | MET | test | `apps/cli/tests/operations/evolve-ingest.test.ts:266` |
| AC3 Invalid margins fail before mutation | MET | test | `apps/cli/tests/commands/helpers.test.ts:46`; `apps/cli/tests/operations/evolve.test.ts:427` |
| AC4 Refine restores after evaluation failure | MET | test | `apps/cli/tests/operations/refine.test.ts:460` |
| AC5 Verification failure leaves an unlinked draft | MET | test | `apps/cli/tests/operations/evolve-ingest.test.ts:296`; `apps/cli/tests/operations/evolve.test.ts:499` |
| AC6 Hermes reinstall prunes only owned stale hooks | MET | test | `apps/cli/tests/hooks.test.ts:806`; `:847` |
| AC7 OMP preserves quoted argv | MET | test | `apps/cli/tests/command-argv.test.ts:5`; `apps/cli/tests/omp-hooks.test.ts` |
| AC8 Concurrent sessions stay independent | MET | test | `apps/cli/tests/commands/hook-run.test.ts:502` |
| AC9 JSONC defaults and CLI precedence work | MET | test | `apps/cli/tests/config.test.ts:82`; `apps/cli/tests/commands/install.test.ts:139` and `:170` |
| AC10 Invalid from-date is actionable | MET | test | `apps/cli/tests/operations/evolve.test.ts:423` |
| AC11 Pi and Hermes share a tested reconciler | MET | test | `apps/cli/tests/hooks.test.ts:470` and `:806` execute both adapters over `apps/cli/src/hooks.ts:253`. |
| AC12 All apply paths use a tested transaction | MET | test | Call-site audit at `apps/cli/src/operations/evolve.ts:778`, `:1654`, and `:1695`; transaction regressions `apps/cli/tests/operations/evolve.test.ts:481` and `:499`. |

**Design Conformance**

| Check | Status | Evidence |
|---|---|---|
| design-conformance | PASS | All seven Design claims are DONE. Boundary parsing, exact evaluation identity, shared hook ownership, quote-aware argv, session isolation, JSONC precedence, and one proposal transaction match the implementation. |
| scope-creep | PASS | The fix pass is confined to R12/C2 transaction invariants, its DAO contract, regressions, and the authoritative architecture text. |
| SECUA | PASS | One P2 correctness/architecture finding was repaired; no residual blocker, major, minor, or advisory finding remains. |

**Fresh Gates**

- `bun run lint` — PASS; Biome checked 214 files and both workspaces typechecked.
- Focused regression command — 102 assertions passed, 0 failed; its process exit was nonzero only
  because partial-suite coverage cannot satisfy the repository-wide aggregate threshold.
- `bun run spur-check` — PASS; 31 enabled pre-check rules, 1,920 tests across 100 files, 0 failures,
  98.90% line coverage, 99.65% function coverage, and all 3 post-check rules passed.
- `bun run build` — PASS; hook script conversion and standalone CLI bundle/compile succeeded.
- `spur task check 0107 --strict-core --json` — PASS; the remaining L4 missing-feature warning is
  non-core and intentional for this standalone review-remediation task.
- Coverage: 98.90% lines / 99.65% functions in the full repository run.
- Fix-pass artifact disclosure: `.spur/run/0107-verdict.json:1` is rewritten after this evidence is
  finalized; no other persistent `.spur/run/**` deliverable is changed.
### Review
Forced SECUA re-audit — 2026-07-26.

| Priority | Dimension | Evidence | Finding | Resolution |
|---|---|---|---|---|
| P2 | Correctness / Architecture | `apps/cli/src/operations/evolve.ts:1364` | Snapshot-persistence failure after verification linkage reset only the proposal status, leaving `applied_at`/`verify_id` and a possible partial snapshot; re-acceptance could overwrite the rollback snapshot. | Fixed in the shared transaction seam: accept only drafts, refuse snapshot collisions, clean partial snapshots, clear linkage fields, and attempt every rollback leg. Covered by `apps/cli/tests/operations/evolve.test.ts:481` and `:499`. |

No residual P1, P2, P3, or P4 findings remain after the bounded `--fix all` pass. Security, efficiency,
correctness, usability, and architecture were reviewed against R1–R12 and the seven Design claims.
### References
- Review scope: `apps/`
- Related package review remediation: task 0106 (separate ownership; do not modify its package changes)
- Binding architecture: `docs/00_ADR.md`
- CLI/config surface: `docs/04_DESIGN.md`
### History
- 2026-07-26T07:44:57.431Z backlog → todo (system)
- 2026-07-26T07:44:58.696Z todo → wip (system)
- 2026-07-26T08:09:47.851Z wip → testing (system)
- 2026-07-26T20:28:55.711Z testing → done (system)
