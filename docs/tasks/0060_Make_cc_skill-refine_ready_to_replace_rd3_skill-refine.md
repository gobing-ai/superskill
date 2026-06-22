---
name: Make cc skill-refine ready to replace rd3 skill-refine
description: Make cc skill-refine ready to replace rd3 skill-refine
status: Done
created_at: 2026-06-21T21:05:49.535Z
updated_at: 2026-06-22T03:24:50.117Z
folder: docs/tasks
type: task
feature-id: ""
priority: high
tags: ["cc-skills","refine","dogfood","migration","rd3-parity"]
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0060. Make cc skill-refine ready to replace rd3 skill-refine

### Background

Dogfood pair-run /cc:skill-refine vs /rd3:skill-refine. Same SHARED-ENGINE gaps (operations/refine.ts type-agnostic): R1 validation-error early-return, R3 TODO placeholders, R4 suggest/flag never fixed, R2 no --dry-run, R5 wrapper drift in plugins/cc/commands/skill-refine.md. SKILL-SPECIFIC: skills are DIRECTORY-based (SKILL.md inside a dir; task 0047 fixed evaluate dir-resolution). refine.ts:315 resolveContentPath + :380 backupFile + :395 write-back must target the SKILL.md INSIDE the skill directory, not a sibling .md; backup/restore on quit must restore the right SKILL.md. This task tracks the SKILL slice: register --dry-run on apps/cli/src/commands/skill.ts, fix the wrapper, confirm directory-based skill refine resolves + edits + backs up the correct SKILL.md.


### Requirements

Inherit 0057 decisions (R1/R3 reorder+real-defaults; R2 --dry-run; R5 honest wrapper). SKILL extras: confirm refine resolves the DIRECTORY form (skill name or dir -> SKILL.md) for validate/evaluate/fix/backup/restore, and that --dry-run + the reorder fix operate on the correct SKILL.md inside the skill dir. Register --dry-run on apps/cli/src/commands/skill.ts, fix plugins/cc/commands/skill-refine.md drift. Gates: bun run lint, bun run test (no skips, add directory-based skill refine regression), bun run build, git clean. DOCS SYNC (CLAUDE.md mandate): the new --dry-run flag touches the CLI command/flag surface — update docs/04_DESIGN.md (and docs/design/design-doc-phase2.md) in the SAME commit. Do NOT flip /skill-refine alias until parity confirmed AND global binary ships.


### Q&A



### Design

Per-type slice. SHARED engine fix lands in 0057; this task consumes it for the SKILL type and handles the
DIRECTORY-based wrinkle.

## Skill-specific (verified)
Skills are DIRECTORY-based: SKILL.md inside a skill dir; resolveContentName returns the parent dir name
(identity.ts:24). Task 0047 fixed evaluate dir-resolution. refine must inherit it: refine.ts:315
resolveContentPath + :380 backupFile + :395/:398 write-back + the quit-restore must all target the
SKILL.md INSIDE the dir, not a sibling .md.

## Work Items
- **S1** Register --dry-run on `apps/cli/src/commands/skill.ts`.
- **S2** Confirm refine resolves the DIRECTORY form (skill name or dir -> SKILL.md) for
  validate/evaluate/fix/backup/restore; --dry-run + reorder operate on the correct SKILL.md.
- **S3** Fix `plugins/cc/commands/skill-refine.md` drift.
- **S4** Regression: directory-based skill refine edits + backs up the right SKILL.md; quit restores it
  byte-identical; --dry-run writes nothing.

## Acceptance
skill refine <skill-name> resolves dir -> SKILL.md, fixes/previews against the right file. Gates green.

## Do-not-drift
Directory-based skills. No engine rewrite beyond 0057 + dir-resolution confirmation.


### Solution

- S1: Register `--dry-run` option on `apps/cli/src/commands/skill.ts` refine subcommand
- S2: Confirm directory-form resolution: `skill refine <name>` resolves to `SKILL.md` inside skill dir for validate/evaluate/fix/backup/restore; `--dry-run` + reorder operate on correct `SKILL.md`
- S3: Fix `plugins/cc/commands/skill-refine.md` wrapper drift after engine changes from 0057
- S4: Regression test: directory-based skill refine edits + backs up right `SKILL.md`; quit restores byte-identical; `--dry-run` writes nothing

### Plan

1. Consume 0057 engine. 2. Register --dry-run on skill.ts. 3. Confirm dir-form resolution +
SKILL.md-targeted fix/backup/restore. 4. Fix wrapper. 5. Directory-based skill refine regression.
Gate: lint/test/build/git clean. Do NOT flip alias until ship.


### Review

**Date:** 2026-06-22
**Status:** 0 findings
**Scope:** `apps/cli/src/commands/skill.ts`, `plugins/cc/commands/skill-refine.md`, `apps/cli/tests/operations/refine.test.ts`, `docs/tasks/0060_*.md`
**Mode:** verify
**Channel:** inline
**Gate:** `bun run lint && bun run test && bun run build` → PASS
**Verdict:** PASS

#### Requirements Traceability

| Req | Status | Evidence |
|-----|--------|----------|
| S1: Register `--dry-run` on skill.ts CLI | ✅ MET | `skill.ts:250-256` — `addDryRunOption` wired; `dryRun` flows through `handleSkillRefine`→`skillRefine`→`refine()` |
| S2: Directory-form resolution confirmed | ✅ MET | `identity.ts:52-54` handles dir→`SKILL.md`; backup/restore target resolved path |
| S3: Fix wrapper drift | ✅ MET | `skill-refine.md:3,25,35-36` — `--dry-run` in argument-hint, table, example |
| S4: Regression test | ✅ MET | `refine.test.ts:618-674` — 3 directory-based skill tests (resolve, dry-run, backup) |
| Gates green | ✅ MET | lint clean, 1003 tests pass, build success |
| Alias not flipped | ✅ MET | `/skill-refine` alias unchanged |

#### SECU Summary

No P1/P2/P3/P4 findings. Mechanical CLI wiring + doc + test changes only. No security, efficiency, correctness, or usability concerns.


### Testing

- Command: `bun run test` (full suite + refine regression)
- Scope: `apps/cli/tests/operations/refine.test.ts` — directory-based skill refine regression (3 new tests); all existing refine tests re-ran
- Result: 1003 pass, 0 fail. Coverage: 99.69% funcs, 98.76% lines
- Evidence: `refine — directory-based skill` describe block at line 618 in refine.test.ts; CLI `--dry-run` wired through `skill.ts`
- Next action: none — all gates green


### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References


