---
name: Make cc command-refine ready to replace rd3 command-refine
description: Make cc command-refine ready to replace rd3 command-refine
status: Backlog
created_at: 2026-06-21T21:05:31.647Z
updated_at: 2026-06-21T21:05:31.647Z
folder: docs/tasks
type: task
feature-id: ""
priority: high
tags: ["cc-commands","refine","dogfood","migration","rd3-parity"]
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0058. Make cc command-refine ready to replace rd3 command-refine

### Background

Dogfood pair-run /cc:command-refine vs /rd3:command-refine. Same SHARED-ENGINE gaps as agent-refine (operations/refine.ts type-agnostic): R1 validation-error early-return makes auto-apply dead code, R3 TODO placeholders degrade score, R4 suggest/flag dims never fixed, R2 no --dry-run, R5 wrapper doc-drift in plugins/cc/commands/command-refine.md (false 'LLM content improvement' claim + 'to file' --save). Commands are file-based (.md). This task tracks the COMMAND slice: the core engine fix is shared with agent-refine (0057) — register --dry-run on apps/cli/src/commands/command.ts, fix the command-refine wrapper, add command-type regression. Depends on 0057.


### Requirements

Inherit 0057 decisions (R1/R3 reorder + real defaults; R2 --dry-run; R5 honest wrapper). This task: register --dry-run on the command refine subcommand (apps/cli/src/commands/command.ts), fix plugins/cc/commands/command-refine.md drift, confirm a command with a structural error gets a real fix (not TODO) and --dry-run previews without writing. Gates: bun run lint, bun run test (no skips, command-type regression), bun run build, git clean. DOCS SYNC (CLAUDE.md mandate): the new --dry-run flag touches the CLI command/flag surface — update docs/04_DESIGN.md (and docs/design/design-doc-phase2.md) in the SAME commit. Do NOT flip /command-refine alias until parity confirmed AND global binary ships.


### Q&A



### Design

Per-type slice. SHARED engine fix (R1 reorder+real-defaults, R2 --dry-run) lands in **task 0057**
(`apps/cli/src/operations/refine.ts`); this task CONSUMES it for the command type. Depends on 0057.

## Pair-run evidence
`/cc:command-refine` vs `/rd3:command-refine`: same shared-engine gaps (early-return dead auto-apply,
TODO placeholders, no --dry-run, suggest/flag never fixed) + command-wrapper doc-drift.

## Work Items
- **C1** Register `--dry-run` on the command refine subcommand (`apps/cli/src/commands/command.ts`).
- **C2** Fix `plugins/cc/commands/command-refine.md`: drop false 'LLM content improvement' claim,
  correct --save to 'evaluation store', add --dry-run to argument-hint.
- **C3** Command-type regression: a command with a structural error gets a real fix (not TODO), refine
  never lowers score, --dry-run writes nothing. Commands are file-based (no dir resolution).

## Acceptance
command refine on a broken command → real fix, no 'fix validation errors' dead-end; --dry-run previews
without writing; wrapper claims match reality. Gates green.

## Do-not-drift
No engine changes beyond 0057 — flag registration + wrapper + tests only. Coordinate alias/deployment.


### Solution



### Plan

1. Consume 0057 engine. 2. Register --dry-run on command.ts. 3. Fix command-refine.md drift. 4. Command-type
regression (real fix not TODO, --dry-run no write, score monotonic). Gate: lint/test/build/git clean. Do
NOT flip alias until ship.


### Review



### Testing



### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References


