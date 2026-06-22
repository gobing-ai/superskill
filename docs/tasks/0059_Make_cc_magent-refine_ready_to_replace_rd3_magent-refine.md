---
name: Make cc magent-refine ready to replace rd3 magent-refine
description: Make cc magent-refine ready to replace rd3 magent-refine
status: Done
created_at: 2026-06-21T21:05:49.494Z
updated_at: 2026-06-22T00:45:01.434Z
folder: docs/tasks
type: task
feature-id: ""
priority: high
tags: ["cc-magents","refine","dogfood","migration","rd3-parity"]
impl_progress:
  planning: completed
  design: completed
  implementation: completed
  review: completed
  testing: completed
---

## 0059. Make cc magent-refine ready to replace rd3 magent-refine

### Background

Dogfood pair-run /cc:magent-refine vs /rd3:magent-refine. Same SHARED-ENGINE gaps (operations/refine.ts type-agnostic): R1 validation-error early-return, R3 TODO placeholders, R4 suggest/flag never fixed, R2 no --dry-run, R5 wrapper drift in plugins/cc/commands/magent-refine.md. MAGENT-SPECIFIC: magents are frontmatter-OPTIONAL plain markdown (AGENTS.md/CLAUDE.md/GEMINI.md, task 0050), and REQUIRED_FIELDS.magent=[] (task 0050). So the structural auto-apply path (insert missing required frontmatter field) has NOTHING to insert for a frontmatter-less magent — the refine value for magents is body/section quality, not field insertion. Verify refine does not try to add frontmatter to a plain-markdown config, and that --dry-run + the reorder fix degrade gracefully when there are no required fields. This task tracks the MAGENT slice: register --dry-run on apps/cli/src/commands/magent.ts, fix the wrapper, confirm frontmatter-less magents refine without bogus frontmatter insertion.


### Requirements

- [x] **R1**: Inherit 0057 shared-engine decisions: validation-error reorder, real defaults, `--dry-run`, honest wrapper behavior. → **MET** | Evidence: `apps/cli/src/operations/refine.ts` applies fixes before remaining validation-error abort; `apps/cli/src/commands/magent.ts` forwards `dryRun`; `plugins/cc/commands/magent-refine.md` documents the wrapper.
- [x] **R2**: Confirm a frontmatter-less magent (`REQUIRED_FIELDS.magent = []`) refines without inserting bogus frontmatter; structural auto-apply is a no-op and body/section suggestions remain available. → **MET** | Evidence: `packages/core/src/quality/types.ts` has `magent: []`; `packages/core/src/operations/validate.ts` treats missing magent frontmatter as valid; `apps/cli/tests/operations/refine.test.ts` covers auto and dry-run frontmatter-less magents.
- [x] **R3**: Register `--dry-run` on `apps/cli/src/commands/magent.ts`. → **MET** | Evidence: `magentRefine`, `handleMagentRefine`, and `registerMagent` all include `dryRun`; full command-module tests and full suite pass.
- [x] **R4**: Fix `plugins/cc/commands/magent-refine.md` drift. → **MET** | Evidence: wrapper argument hint, arguments table, examples, and frontmatter-optional note include `--dry-run`.
- [x] **R5**: Gates: `bun run lint`, `bun run test`, `bun run build`, no skips, regression coverage, git clean except unrelated in-progress task 0064 edits. → **MET** | Evidence: re-run at 2026-06-22T01:39Z and final rerun after concurrent edits; lint/typecheck pass, 993/993 tests pass, build pass.
- [x] **R6**: Docs sync for command/flag surface: update `docs/04_DESIGN.md` and `docs/design/design-doc-phase2.md`; do not flip `/magent-refine` alias. → **MET** | Evidence: `docs/design/design-doc-phase2.md` records `--dry-run`; verification fix added the concrete Phase 2 refine flag surface to `docs/04_DESIGN.md`; no alias flip found.


### Q&A



### Design

Per-type slice. SHARED engine fix lands in 0057; this task consumes it for the MAGENT type and handles
the frontmatter-OPTIONAL wrinkle.

## Magent-specific (verified)
Magents are frontmatter-OPTIONAL plain markdown (AGENTS.md/CLAUDE.md, task 0050) and REQUIRED_FIELDS.magent
= [] (task 0050). The structural auto-apply path (`generateAutoChange` inserts missing required frontmatter
fields) has NOTHING to insert for a frontmatter-less magent. Refine value for magents is body/section
quality, not field insertion. Risk: the 0057 reorder must not try to add frontmatter to a plain-markdown
config, and must report 'no structural fixes' (not an error) when REQUIRED_FIELDS is empty.

## Work Items
- **M1** Register --dry-run on `apps/cli/src/commands/magent.ts`.
- **M2** Confirm a frontmatter-LESS magent refines with no bogus frontmatter insertion; structural
  auto-apply is a clean no-op; body/section suggestions still surface.
- **M3** Fix `plugins/cc/commands/magent-refine.md` drift.
- **M4** Regression: frontmatter-less magent refine — no error, no frontmatter added, score not lowered.

## Acceptance
magent refine AGENTS.md → no bogus frontmatter, no error exit, --dry-run previews. Gates green.

## Do-not-drift
Frontmatter-OPTIONAL magents. No engine rewrite beyond 0057 + the empty-required-fields guard.


### Solution

Consumes the 0057 shared-engine fix (R1 validation-error reorder, R2 --dry-run, R3 real-defaults).
M1 adds `--dry-run` to the magent refine subcommand (mirrors agent.ts/command.ts from 0057). M2
confirms the frontmatter-less path is safe by source analysis — `REQUIRED_FIELDS.magent = []` means
no structural findings to auto-apply, and `generateAutoChange` returns `null` for all
dimension-level findings (catches parse errors in try/catch). The engine naturally handles
frontmatter-OPTIONAL magents without crash or bogus frontmatter insertion. M3 fixes wrapper drift.
M4 adds regression coverage.

### Plan

1. M1: add `--dry-run` to magent refine (4 sites in `magent.ts`); verify `magent refine --help`.
2. M2: confirm frontmatter-less safety by source analysis (no code change needed).
3. M3: fix `plugins/cc/commands/magent-refine.md` wrapper drift.
4. M4: add `describe('refine — magent type, frontmatter-less (0059)')` in `refine.test.ts`
   (2 tests: auto no-crash/no-insertion, dry-run unchanged).
5. Gate: `bun run lint && bun run test && bun run build`; `git status` clean. Do NOT flip alias.

### Review

**Verdict: PASS** — forced re-verification for task 0059 on 2026-06-22T01:39Z with `--auto --fix all --force`.

**Scope:** `apps/cli/src/commands/magent.ts`, `apps/cli/tests/operations/refine.test.ts`, `plugins/cc/commands/magent-refine.md`, `docs/design/design-doc-phase2.md`, `docs/04_DESIGN.md`.

**SECU findings:** 0 P1/P2/P3/P4 after fix pass.

| # | Title | Dimension | Location | Resolution |
|---|-------|-----------|----------|------------|
| 1 | `04_DESIGN` did not record the concrete `refine --dry-run` surface despite the task's docs-sync requirement | Correctness | `docs/04_DESIGN.md` | Fixed by adding a Phase 2 command-surface table with shared refine flags and a `--dry-run` note; bumped metadata to 2.1.0 / 2026-06-22. |

**Requirements traceability:** all requirements MET after the documentation fix. No scope drift found. `/magent-refine` alias remains unflipped.

**Gate:** `bun run lint` → pass; `bun run test` → pass (993/993, 0 skips); `bun run build` → pass.

**Fix-pass:** 1 fixed, 0 failed, 0 skipped.


### Work-item traceability
- **M1 (--dry-run)** — MET. `magentRefine` (magent.ts:80), `handleMagentRefine` (magent.ts:160),
  and `registerMagent` refine action opts all carry `dryRun`. `addDryRunOption` imported and
  wrapped on the refine subcommand. `magent refine --help` lists `--dry-run`.
  Smoke-confirmed via `magent refine AGENTS.md --dry-run`.
- **M2 (frontmatter-less guard)** — CONFIRMED. Source analysis verified the refine path is safe:
  `REQUIRED_FIELDS.magent = []` → no "Missing required field" findings → `generateAutoChange`
  case 1 naturally skipped. Dimension-level findings (completeness, etc.) map to `auto-apply`
  strategy but `generateAutoChange` returns `null` (no matching message pattern).
  `parseFrontmatter` calls in cases 2-4 are try/catch-wrapped. No crash, no bogus frontmatter
  insertion on frontmatter-less magents.
- **M3 (wrapper drift)** — MET. `plugins/cc/commands/magent-refine.md` updated: `--dry-run` in
  argument-hint, description mentions preview, Arguments table includes `--dry-run` row, examples
  include `--dry-run`, frontmatter-OPTIONAL note added.
- **M4 (regression)** — MET. 2 new refine tests (auto-on-frontmatter-less, dry-run-unchanged)
  pass within the 993-test suite. Both confirm no crash, no frontmatter insertion, score monotonic.

### Testing

- **Command:** `bun run lint` (2026-06-22T01:39Z)
- **Result:** PASS — Biome checked 138 files; workspace typecheck passed for `@gobing-ai/superskill-core` and `@gobing-ai/superskill`.
- **Command:** `bun run test` (2026-06-22T01:39Z)
- **Result:** PASS — 993/993 tests, 0 failures, 0 skips, 2470 assertions across 58 files. Coverage: 99.69% funcs / 98.76% lines aggregate.
- **Command:** `bun run build` (2026-06-22T01:39Z)
- **Result:** PASS — bundled CLI entrypoint `index.js` at 3.43 MB.
- **Regression evidence:** `apps/cli/tests/operations/refine.test.ts` includes frontmatter-less magent auto and dry-run cases; `apps/cli/src/commands/magent.ts` keeps `magent.ts` at 100/100 coverage.
- **Worktree:** intentional 0059 changes plus unrelated in-progress 0064 edits present in `apps/cli/src/commands/magent.ts`, `apps/cli/src/templates/magent/default.md`, `packages/core/tests/operations/scaffold.test.ts`, and `docs/tasks/0064_Make_cc_magent-add_ready_to_replace_rd3_magent-add.md`.


### References
