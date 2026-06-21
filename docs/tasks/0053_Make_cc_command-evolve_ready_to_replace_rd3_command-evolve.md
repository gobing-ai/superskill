---
name: Make cc command-evolve ready to replace rd3 command-evolve
description: Make cc command-evolve ready to replace rd3 command-evolve
status: Backlog
created_at: 2026-06-21T20:55:48.450Z
updated_at: 2026-06-21T20:55:48.450Z
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



### Plan

1. Land/confirm 0052 shared engine. 2. Register evolve flags on `apps/cli/src/commands/command.ts`.
3. Fix `plugins/cc/commands/command-evolve.md` (real capabilities + real id example + argument-hint).
4. Command-type regression tests. Gate: lint/test/build clean, git clean. Do NOT flip alias until ship.


### Review



### Testing



### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References


