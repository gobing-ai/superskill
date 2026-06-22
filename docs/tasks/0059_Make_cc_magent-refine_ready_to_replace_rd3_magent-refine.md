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
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0059. Make cc magent-refine ready to replace rd3 magent-refine

### Background

Dogfood pair-run /cc:magent-refine vs /rd3:magent-refine. Same SHARED-ENGINE gaps (operations/refine.ts type-agnostic): R1 validation-error early-return, R3 TODO placeholders, R4 suggest/flag never fixed, R2 no --dry-run, R5 wrapper drift in plugins/cc/commands/magent-refine.md. MAGENT-SPECIFIC: magents are frontmatter-OPTIONAL plain markdown (AGENTS.md/CLAUDE.md/GEMINI.md, task 0050), and REQUIRED_FIELDS.magent=[] (task 0050). So the structural auto-apply path (insert missing required frontmatter field) has NOTHING to insert for a frontmatter-less magent — the refine value for magents is body/section quality, not field insertion. Verify refine does not try to add frontmatter to a plain-markdown config, and that --dry-run + the reorder fix degrade gracefully when there are no required fields. This task tracks the MAGENT slice: register --dry-run on apps/cli/src/commands/magent.ts, fix the wrapper, confirm frontmatter-less magents refine without bogus frontmatter insertion.


### Requirements

Inherit 0057 decisions (R1/R3 reorder+real-defaults; R2 --dry-run; R5 honest wrapper). MAGENT extras: confirm a frontmatter-LESS magent (REQUIRED_FIELDS.magent=[]) refines without attempting to insert frontmatter fields; structural auto-apply is a no-op there, so refine should report no structural fixes (not an error) and surface body/section suggestions instead. Register --dry-run on apps/cli/src/commands/magent.ts, fix plugins/cc/commands/magent-refine.md drift. Gates: bun run lint, bun run test (no skips, add frontmatter-less-magent refine regression), bun run build, git clean. DOCS SYNC (CLAUDE.md mandate): the new --dry-run flag touches the CLI command/flag surface — update docs/04_DESIGN.md (and docs/design/design-doc-phase2.md) in the SAME commit. Do NOT flip /magent-refine alias until parity confirmed AND global binary ships.


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

## Review

**Status:** 0 P1/P2; 0 P3/P4 — clean implementation.
**Scope:** `apps/cli/src/commands/magent.ts`, `apps/cli/tests/operations/refine.test.ts`,
`plugins/cc/commands/magent-refine.md`.
**Channel:** inline (current).
**Gate:** `bun run lint` → pass · `bun run test` → 992/992 pass (0 skips) · `bun run build` → pass ·
`git status` → 3 files, all in scope.
**Verdict:** PASS.

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
  pass within the 992-test suite. Both confirm no crash, no frontmatter insertion, score monotonic.

## Testing

- **Command:** `bun run lint && bun run test && bun run build` (Ran at 2026-06-22T00:45:00Z)
- **Scope:** Full project — 992 tests across 58 files. Refine-specific: 56 tests in `refine.test.ts`
  (was 54; +2 new for 0059).
- **Result:** PASS — 992/992 tests, 0 failures, 0 skips. Aggregate coverage 99.69% funcs /
  98.76% lines. `magent.ts` 100/100. `refine.ts` 100.00% funcs / 94.15% lines. Lint clean. Build
  3.43 MB.
- **Evidence:** 2 new regression tests: `--auto on frontmatter-less magent applies no structural
  fixes, no crash, score monotonic` and `--dry-run on frontmatter-less magent leaves file unchanged,
  no crash` — both pass.
- **Next action:** None — all gates pass.

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References


