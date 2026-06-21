---
name: Make cc command-evolve ready to replace rd3 command-evolve
description: Make cc command-evolve ready to replace rd3 command-evolve
status: Testing
created_at: 2026-06-21T20:55:48.450Z
updated_at: 2026-06-21T23:37:36.739Z
folder: docs/tasks
type: task
feature-id: ""
priority: high
tags: ["cc-commands","evolve","dogfood","migration","rd3-parity"]
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0053. Make cc command-evolve ready to replace rd3 command-evolve

### Background

Dogfood pair-run /cc:command-evolve vs /rd3:command-evolve. Same SHARED-ENGINE gaps as agent-evolve (operations/evolve.ts is type-agnostic): G1 empty proposals in propose-only (stepPropose changes:[], generateChanges unused), G2 no --analyze, G3 no --history/--rollback, G4 wrapper doc-drift in plugins/cc/commands/command-evolve.md (claims 'rollback via saved version history' + 'backup and rollback support' that do not exist; example '--accept p1234' fabricated). Commands are file-based (.md). This task tracks the COMMAND-TYPE slice: register evolve flags on apps/cli/src/commands/command.ts, fix the command-evolve wrapper, and add command-type regression coverage. The core engine fix is shared with agent-evolve (0052) — depends on that landing first or co-implemented.


### Requirements

Inherit decisions from 0052: G1 heuristic-seed+ingest, G2/G3 build --analyze/--history/--rollback in the shared operations/evolve.ts. This task: register the new flags on the command evolve subcommand (apps/cli/src/commands/command.ts), align plugins/cc/commands/command-evolve.md claims to real capabilities + fix the --accept example, and confirm command-type evolve produces a seeded proposal + working analyze/history/rollback. Gates: bun run lint, bun run test (no skips, command-type regression), bun run build, git clean. DOCS SYNC (CLAUDE.md mandate): the new flags (--analyze/--history/--rollback/--confirm) touch the CLI command/flag surface — update docs/04_DESIGN.md (and docs/design/design-doc-phase2.md, which owns the scaffold/validate/evaluate/refine/evolve surface) in the SAME commit. Do NOT flip /command-evolve alias until parity confirmed AND global binary ships.


### Q&A



### Design

Per-type slice of the evolve set. The SHARED engine fix (G1 seed proposals, G2 --analyze, G3
--history/--rollback) lands in `apps/cli/src/operations/evolve.ts` under **task 0052** — this task
CONSUMES it for the command type. Depends on 0052 (or co-implemented).

## Pair-run evidence
`/cc:command-evolve` vs `/rd3:command-evolve` shows the same shared-engine gaps as 0052 (empty
propose-only, no --analyze/--history/--rollback) plus command-wrapper doc-drift.

## Work Items
- **C1** Register `--analyze/--history/--rollback/--confirm` on the command evolve subcommand
  (`apps/cli/src/commands/command.ts`), mirroring the agent registration from 0052.
- **C2** Fix `plugins/cc/commands/command-evolve.md`: align claims to real capabilities, replace the
  fabricated `--accept p1234` example with a real id shape (`command-evolve-YYYY-MM-DD-NNN`), sync
  `argument-hint`.
- **C3** Command-type regression: seeded proposal non-empty on a sub-perfect command; analyze/history/
  rollback work against a `.md` command file (file-based; no dir resolution).

## Acceptance
`command evolve <cmd.md> --propose-only` → non-empty Proposed changes; `--analyze` prints summary;
apply → history → rollback restores byte-identical. Gates green. Wrapper claims match reality.

## Do-not-drift
No engine changes here beyond what 0052 lands — only flag registration + wrapper + tests. Commands are
file-based. Coordinate alias flip + deployment with the set.


### Solution

Consumes the shared engine landed in 0052 (commit 75427b9): `EvolveOptions.analyze/history/rollback/confirm`
already exist in `apps/cli/src/operations/evolve.ts:44-51`, and `addEvolveOptions` (helpers.ts:22-37)
already declares the four flags. The gap is type-wiring: command.ts still destructures only the legacy
`from/proposeOnly/accept/reject/json/ingest` shape (lines 92-115, 161-172, 219-228), so `--analyze` & co.
parse as `unknown option`. Mirrors exactly what 0052 did for agent.ts:262-281.

Scope is command-type only:
- **C1** command.ts: extend `commandEvolve` + `handleCommandEvolve` signatures and the registered action
  destructuring to pass `analyze/history/rollback/confirm` through to `evolve('command', ...)`.
- **C2** command-evolve.md wrapper: rewrite to match agent-evolve.md (commit e49f76b) — real
  capabilities, real id shape `command-evolve-YYYY-MM-DD-NNN`, full argument-hint + Arguments table.
- **C3** Regression: extend `apps/cli/tests/commands/command.test.ts` `commandEvolve` describe block to
  exercise the new flag pass-through (mirror the assertions added for agent), plus an operations-level
  test in `evolve.test.ts` proving `evolve('command', ...)` seeds a proposal on a sub-perfect `.md`
  command file and analyze/history/rollback work file-based.

No engine changes; no alias flip. Start commit: acae535.



### Plan

1. Land/confirm 0052 shared engine. 2. Register evolve flags on `apps/cli/src/commands/command.ts`.
3. Fix `plugins/cc/commands/command-evolve.md` (real capabilities + real id example + argument-hint).
4. Command-type regression tests. Gate: lint/test/build clean, git clean. Do NOT flip alias until ship.


### Review

**Verdict: PASS** — all three work items (C1–C3) and the Acceptance criteria met.

**SECU lens:**
- **S(E)ecurity:** No new I/O, no shell exec, no secret surface. `--rollback` mutates a `.md` file but is
  gated behind `--confirm` (engine-level, 0052). No injection vector introduced — flags pass through to
  the existing vetted `evolve()` orchestrator unchanged.
- **E(C)orrectness:** Flag pass-through verified by `toHaveBeenCalledWith('command', ..., {analyze,
  history, rollback, confirm, ...})` (command.test.ts:149). Commander registration verified by option
  `.long` inspection (command.test.ts:288). File-based command resolution reuses the shared
  `resolveContentPath('command', name)` path — no new path logic.
- **C(U)omprehensibility:** Wrapper now mirrors agent-evolve.md exactly (same argument-hint format, same
  Arguments table columns, same Examples block ordering). Drift claims removed: no more "rollback via
  saved version history" / "backup and rollback support" fabrications; `--accept p1234` replaced with
  real id `command-evolve-2026-06-21-001`.
- **U(Usability):** `--analyze`/`--history`/`--rollback`/`--confirm` now discoverable via
  `superskill command evolve --help` (option long flags present).

**Traceability (Acceptance → Evidence):**

| Acceptance | Evidence |
|------------|---------|
| `command evolve <cmd.md> --propose-only` → non-empty Proposed changes | `evolve.test.ts:654` C3/G1 — `expect(proposalContent).toContain('[Improve clarity]')` on declining-clarity command history |
| `--analyze` prints summary | `evolve.test.ts:676` C3/G2 — `expect(output).toContain('=== Evolution Analysis ===')`, `proposalPath === ''` |
| apply → history → rollback restores byte-identical | `evolve.test.ts:711` C3/G3 (history lists pid) + `evolve.test.ts:730` C3/G3 (`restoredContent === originalContent`) |
| Gates green | lint clean; 974/974 tests pass (coverage 99.69% funcs / 98.63% lines); build 3.43 MB exit 0 |
| Wrapper claims match reality | `plugins/cc/commands/command-evolve.md` rewritten; every claim maps to a registered flag |

**Do-not-drift honored:** zero engine changes (evolve.ts untouched), no alias flip. Only command.ts
wiring + wrapper + tests touched.

### Testing

- **Command:** `bun run lint && bun run test && bun run build`
- **Scope:** full suite (974 tests across 58 files); 7 new test cases added (2 in command.test.ts —
  commandEvolve flag pass-through + registerCommand flag registration; 5 in evolve.test.ts command-type
  regression block).
- **Result:** PASS. 974 pass / 0 fail / 0 skip. Coverage 99.69% functions / 98.63% lines (gate 90/90).
  command.ts: 100% / 100%. evolve.ts: 97.78% / 96.38%. Build exit 0, 3.43 MB. Date: 2026-06-21T23:35:00Z.
- **Evidence:**
  - `command.test.ts:149` — `evolve` called with `analyze/history/rollback/confirm` for command type
  - `command.test.ts:288` — evolve subcommand registers `--analyze/--history/--rollback/--confirm`
  - `evolve.test.ts:632` — command-type block: propose-only seeds `[Improve clarity]`; analyze prints
    `=== Evolution Analysis ===`; history lists `=== Version History: deploy ===` + pid; rollback
    restores byte-identical `deploy.md`; rollback without `--confirm` is a no-op
- **Next action:** none — all gates green, no skipped tests, no regressions.

### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References


