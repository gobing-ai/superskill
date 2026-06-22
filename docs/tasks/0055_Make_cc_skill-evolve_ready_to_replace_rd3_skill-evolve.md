---
name: Make cc skill-evolve ready to replace rd3 skill-evolve
description: Make cc skill-evolve ready to replace rd3 skill-evolve
status: Done
created_at: 2026-06-21T20:56:07.191Z
updated_at: 2026-06-22T02:11:08.367Z
folder: docs/tasks
type: task
feature-id: ""
priority: high
tags: ["cc-skills","evolve","dogfood","migration","rd3-parity"]
impl_progress:
  planning: completed
  design: completed
  implementation: completed
  review: completed
  testing: completed
---

## 0055. Make cc skill-evolve ready to replace rd3 skill-evolve

### Background

Dogfood pair-run /cc:skill-evolve vs /rd3:skill-evolve. Same SHARED-ENGINE gaps (operations/evolve.ts type-agnostic): G1 empty proposals, G2 no --analyze, G3 no --history/--rollback, G4 wrapper drift in plugins/cc/commands/skill-evolve.md (false 'rollback via saved version history' claim; example './skills/my-skill/SKILL.md --accept p1234'). SKILL-SPECIFIC: skills are DIRECTORY-based (SKILL.md inside a dir) — resolveContentPath/resolveContentName must continue to resolve the directory form for evolve (task 0047 fixed the evaluate dir-resolution; confirm evolve inherits it). The proposal/backup/rollback paths must target SKILL.md inside the skill dir, not a sibling .md. This task tracks the SKILL slice: register flags on apps/cli/src/commands/skill.ts, fix the wrapper, confirm directory-based skill evolve produces a seeded proposal + working analyze/history/rollback against the right SKILL.md.


### Requirements

Inherit 0052 decisions (G1 heuristic-seed+ingest; G2/G3 build analyze/history/rollback in shared engine). SKILL extras: confirm evolve resolves the DIRECTORY form (skill name or skill dir → SKILL.md) for analyze/propose/apply/history/rollback, and that backup/restore + proposal files target the SKILL.md inside the skill directory. Register flags on apps/cli/src/commands/skill.ts, fix plugins/cc/commands/skill-evolve.md drift + --accept example. Gates: bun run lint, bun run test (no skips, add a directory-based skill evolve regression test), bun run build, git clean. DOCS SYNC (CLAUDE.md mandate): the new flags (--analyze/--history/--rollback/--confirm) touch the CLI command/flag surface — update docs/04_DESIGN.md (and docs/design/design-doc-phase2.md) in the SAME commit. Do NOT flip /skill-evolve alias until parity confirmed AND global binary ships.


### Q&A



### Design

Per-type slice. SHARED engine fix lands in 0052 (`operations/evolve.ts`); this task consumes it for the
SKILL type and handles the DIRECTORY-based wrinkle.

## Skill-specific risk (verified)
Skills are DIRECTORY-based: `SKILL.md` lives inside a skill dir, and `resolveContentName('.../SKILL.md')`
returns the PARENT DIR name (identity.ts:24). Task 0047 fixed evaluate's dir-resolution. Evolve must
inherit it: `--analyze/--propose/--apply/--history/--rollback` must resolve the skill (by name or dir →
SKILL.md), and backup/restore + proposal files must target the SKILL.md INSIDE the skill directory, not a
sibling `.md`. The proposal store path keys on `resolveContentName` (dir name) — confirm history/rollback
look up the right key.

## Work Items
- **S1** Register `--analyze/--history/--rollback/--confirm` on `apps/cli/src/commands/skill.ts`.
- **S2** Confirm evolve resolves the directory form end-to-end (analyze/propose/apply/history/rollback);
  backup/restore + proposal files target SKILL.md inside the dir; store key = skill (dir) name.
- **S3** Fix `plugins/cc/commands/skill-evolve.md` drift + `--accept` example.
- **S4** Regression: a directory-based skill evolves (seed/analyze/history/rollback) against the correct
  SKILL.md; rollback restores the SKILL.md byte-identical.

## Acceptance
`skill evolve <skill-name> --propose-only` resolves the dir → SKILL.md, writes non-empty changes;
analyze/history/rollback operate on the right SKILL.md. Gates green.

## Do-not-drift
Directory-based skills. No engine rewrite beyond 0052 + dir-resolution confirmation. Reuse F024.


### Solution

Per-type slice. SHARED engine fix landed in 0052 (`operations/evolve.ts`); this task consumes it for the SKILL type and handles the DIRECTORY-based wrinkle. Register `--analyze/--history/--rollback/--confirm` flags on `skillEvolve` + `handleSkillEvolve`, fix `skill-evolve.md` wrapper drift, add dir-based skill evolve regression test.


### Plan

1. Consume 0052 engine. 2. Register flags on `skill.ts`. 3. Confirm dir-form resolution + SKILL.md-targeted
backup/proposal/rollback + correct store key. 4. Fix wrapper. 5. Directory-based skill evolve regression
test. Gate: lint/test/build/git clean. Do NOT flip alias until ship.


### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References



### Review

## Re-verify — 2026-06-21 (--force, inline)

**Status:** 0 findings
**Scope (0055-owned):** `apps/cli/src/commands/skill.ts`, `apps/cli/src/commands/helpers.ts` (addEvolveOptions), `plugins/cc/commands/skill-evolve.md`, `apps/cli/tests/operations/evolve.test.ts`, `docs/design/design-doc-phase2.md §2.5`
**Mode:** verify (Phase 7 SECU + Phase 8 traceability), --force bypassed terminal-status guard
**Channel:** inline (current)
**Gate:** `bun run lint` → pass · `bun run test` → 1000/1000 pass (0 skips) · `bun run build` → exit 0 · `git status` → only unrelated 0060 task file

**Verdict:** PASS

### Phase 7 — SECU
No findings. Scope is option-registration + delegation glue (no secrets, no `any`, no empty catch, no injection surface). Engine logic lives in 0052 (`operations/evolve.ts`) — out of this slice's scope.

### Phase 8 — Requirements traceability (all MET)
- **S1** Register `--analyze/--history/--rollback/--confirm` → MET · `helpers.ts:33-36` (addEvolveOptions), wired through `skill.ts:96-127,161-179`.
- **S2** Dir-form resolution + SKILL.md-targeted backup/proposal/rollback → MET · `packages/core/src/content/identity.ts:22-53` resolves both `SKILL.md`→parent-dir-name and bare dir→`<dir>/SKILL.md`; verified by tests below.
- **S3** Wrapper drift fixed → MET · `skill-evolve.md` — no stale "saved version history" claim, no `--accept p1234` example; correct `--rollback <id> --confirm` flow documented.
- **S4** Directory-based regression → MET · `evolve.test.ts:932-1081` (8 tests): propose-only seeds heuristic changes, bare-dir resolution, --analyze, --history, **--rollback restores byte-identical inner SKILL.md**, --rollback-without-confirm no-op.

### Docs sync
`docs/design/design-doc-phase2.md §2.5` documents all four flags; `docs/04_DESIGN.md:17,23` links to it as authoritative surface — CLAUDE.md same-commit mandate satisfied.

**No fix pass:** verdict PASS → `--fix all` is a no-op (acts only on PARTIAL/FAIL). Task remains `Done`.


### Requirements traceability

All work items MET with code + test evidence:

- **S1** — Register `--analyze/--history/--rollback/--confirm` on skill.ts: **MET**
- **S2** — Dir-form resolution confirmed: **MET**
- **S3** — Wrapper drift fixed: **MET**
- **S4** — Regression tests: **MET** · 6 new tests in `evolve.test.ts`

### Testing

**Command:** `bun run lint && bun run test && bun run build`
**Scope:** Full project — 1000 tests across 58 files, coverage gate (90/90)
**Result:** PASS — 1000/1000 pass, 0 failures, 0 skips
**Next action:** None — all gates pass.
