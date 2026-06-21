---
name: Make cc command-add ready to replace rd3 command-add
description: Make cc command-add ready to replace rd3 command-add
status: Backlog
created_at: 2026-06-21T21:14:01.215Z
updated_at: 2026-06-21T21:14:01.215Z
folder: docs/tasks
type: task
feature-id: ""
priority: high
tags: ["cc-commands","add","scaffold","dogfood","migration","rd3-parity"]
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0063. Make cc command-add ready to replace rd3 command-add

### Background

Dogfood pair-run /cc:command-add vs /rd3:command-add. Slash command *-add delegates to CLI 'scaffold'. Shared-engine gaps (operations/scaffold.ts type-agnostic): AD1 scaffold-output-quality (command scaffold currently scores 0.74 PASS — the BEST of the types, but still benefits from the enriched-template + tier work), AD3 no --template (rd3 command has simple/workflow/plugin tiers), AD4 no scaffolding inputs beyond --description/--target/--output/--force, AD5 wrapper doc-drift in plugins/cc/commands/command-add.md. Commands are file-based (.md). This task tracks the COMMAND slice: the core engine fix is shared with agent-add (0062) — register --template (simple/workflow/plugin) on apps/cli/src/commands/command.ts, fix the command-add wrapper, add command-type regression. Depends on 0062.


### Requirements

Inherit 0062 decisions (AD1 enriched templates that PASS; AD3 --template tiers; AD4 scaffolding inputs). COMMAND specifics: tiers = simple/workflow/plugin (match rd3 cc-commands/templates: simple.md/workflow.md/plugin.md). Register --template on apps/cli/src/commands/command.ts, fix plugins/cc/commands/command-add.md drift + argument-hint. Confirm command scaffold->evaluate >= PASS for every tier. Gates: bun run lint, bun run test (no skips, command-type regression), bun run build, git clean. DOCS SYNC (CLAUDE.md mandate): the new --template tiers + flags touch the CLI command/flag surface — update docs/04_DESIGN.md (and docs/design/design-doc-phase2.md) in the SAME commit. Do NOT flip /command-add alias until parity confirmed AND global binary ships.


### Q&A



### Design

Per-type slice. SHARED engine + template fix lands in **task 0062** (operations/scaffold.ts + enriched
templates + --template/--skills/--tools). This task consumes it for the COMMAND type. Depends on 0062.

## Pair-run evidence
command scaffold->evaluate = 0.74 PASS today (the best of the types), but lacks tier selection
(rd3 command has simple/workflow/plugin) and the inputs. AD5 wrapper drift in command-add.md.

## Work Items
- **C1** Ship command tier templates simple/workflow/plugin (match rd3 cc-commands/templates) under
  apps/cli/src/templates/command/.
- **C2** Register --template (+ inherited --skills/--tools where relevant) on apps/cli/src/commands/command.ts.
- **C3** Fix plugins/cc/commands/command-add.md drift (real templates + flags in argument-hint).
- **C4** Command-type regression: scaffold->evaluate >= PASS for every tier; --template resolves.
  Commands are file-based (no dir).

## Acceptance
command scaffold --template workflow resolves; output PASSes evaluate; wrapper matches reality. Gates green.

## Do-not-drift
No engine changes beyond 0062 — tier templates + flag registration + wrapper + tests only.


### Solution



### Plan

1. Consume 0062 engine. 2. Ship command simple/workflow/plugin templates. 3. Register --template on
command.ts. 4. Fix command-add.md drift. 5. Command-type regression (scaffold->evaluate >= PASS per tier).
Gate: lint/test/build/git clean. Do NOT flip alias until ship.


### Review



### Testing



### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References


