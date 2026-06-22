---
name: Make cc command-add ready to replace rd3 command-add
description: Make cc command-add ready to replace rd3 command-add
status: Done
created_at: 2026-06-21T21:14:01.215Z
updated_at: 2026-06-22T00:12:03.617Z
folder: docs/tasks
type: task
feature-id: ""
priority: high
tags: ["cc-commands","add","scaffold","dogfood","migration","rd3-parity"]
impl_progress:
  planning: done
  design: done
  implementation: done
  review: done
  testing: done
---

## 0063. Make cc command-add ready to replace rd3 command-add

### Background

Dogfood pair-run /cc:command-add vs /rd3:command-add. Slash command *-add delegates to CLI 'scaffold'. Shared-engine gaps (operations/scaffold.ts type-agnostic): AD1 scaffold-output-quality (command scaffold currently scores 0.74 PASS — the BEST of the types, but still benefits from the enriched-template + tier work), AD3 no --template (rd3 command has simple/workflow/plugin tiers), AD4 no scaffolding inputs beyond --description/--target/--output/--force, AD5 wrapper doc-drift in plugins/cc/commands/command-add.md. Commands are file-based (.md). This task tracks the COMMAND slice: the core engine fix is shared with agent-add (0062) — register --template (simple/workflow/plugin) on apps/cli/src/commands/command.ts, fix the command-add wrapper, add command-type regression. Depends on 0062.


### Requirements

- [x] **C1** Ship command tier templates simple/workflow/plugin → **MET** | Evidence: `apps/cli/src/templates/command/{default,simple,workflow,plugin}.md` present; built-CLI scaffold→evaluate = PASS Grade B for every tier
- [x] **C2** Register `--template` (+ `--skills`/`--tools`) on `command.ts` → **MET** | Evidence: `apps/cli/src/commands/command.ts:203-218` action destructures + forwards template/skills/tools; signatures widened `:24-46`, `:134-145`; live smoke confirms `--tools`/`--skills` land in frontmatter (`allowed-tools` + `tools` + `skills` arrays)
- [x] **C3** Fix `plugins/cc/commands/command-add.md` drift → **MET** | Evidence: `command-add.md:3` argument-hint includes `--template/--skills/--tools`; Template Tiers list (`:34-36`) + Arguments table (`:27`) aligned to shipped templates
- [x] **C4** Command-type regression: scaffold→evaluate ≥ PASS per tier → **MET** | Evidence: `packages/core/tests/operations/scaffold.test.ts:267,280,290` (workflow resolves, unknown-tier errors, every-tier ≥0.7); 21/21 in file, 981/981 suite; `--template bogus` errors clearly


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

Provisional approach (will be updated with actual execution record during implementation).

**Shared engine consumed from 0062** (`packages/core/src/operations/scaffold.ts`): `ScaffoldOptions.template/skills/tools`, `resolveTemplate(type, tier)`, and `mergeFrontmatterList` are already type-agnostic — no engine changes required for this task.

**Command templates** (`apps/cli/src/templates/command/`):
- Enriched `default.md` so a freshly scaffolded command PASSes its own evaluator (real `argument-hint` + `allowed-tools` + body that references tools). Default tier scores 0.86 PASS Grade B.
- Shipped `simple.md` / `workflow.md` / `plugin.md` tiers mirroring the rd3 cc-commands tier taxonomy. All PASS (0.86 / 0.88 / 0.86 respectively).

**Command surface** (`apps/cli/src/commands/command.ts`):
- Registered `--template`/`--skills`/`--tools` on the `command scaffold` action handler (the `addScaffoldOptions` helper already declared the flags, but the action handler wasn't destructuring/forwarding them — same gap pattern as agent in 0062).
- `commandScaffold` and `handleCommandScaffold` signatures widened to accept the new opts.

**Wrapper** (`plugins/cc/commands/command-add.md`):
- Aligned `argument-hint` + Arguments table + added Template Tiers list. Wrapper self-evaluates at 0.88 PASS.

**Tests** (`packages/core/tests/operations/scaffold.test.ts`):
- `--template workflow` resolves the workflow template (asserts `Task` + orchestration body).
- Unknown command tier errors clearly.
- scaffold→evaluate ≥ 0.7 (PASS) for every command tier (default/simple/workflow/plugin).
- Updated the brittle pre-existing command test (was asserting ` ```text ` fence language; now asserts the slash-syntax block + completeness signals without fence-language coupling).

**Do-not-drift:** engine stays type-agnostic (no `scaffold.ts` changes). Per-type richness lives in templates. Alias not flipped — deployment deferred until global binary ships (matches 0062 policy).


### Plan

1. Consume 0062 engine. 2. Ship command simple/workflow/plugin templates. 3. Register --template on
command.ts. 4. Fix command-add.md drift. 5. Command-type regression (scaffold->evaluate >= PASS per tier).
Gate: lint/test/build/git clean. Do NOT flip alias until ship.


### Review

_Re-verified 2026-06-21 (`--force --fix all`, status guard bypassed)_

**Status:** 0 findings · **Scope:** `apps/cli/src/commands/command.ts`, `apps/cli/src/templates/command/{default,simple,workflow,plugin}.md`, `plugins/cc/commands/command-add.md`, `packages/core/tests/operations/scaffold.test.ts` · **Mode:** verify (Phase 7 SECU + Phase 8 traceability) · **Channel:** inline (current) · **Gate:** `bun run lint` clean · `bun run test` 981/981 · `bun run build` success

**P1 — Blockers:** _None._
**P2 — Warnings:** _None._
**P3 — Info:** _None._
**P4 — Suggestions:** _None._

**Phase 7 (SECU):** Clean across all four dimensions. `command.ts` SECU scan: no hardcoded secrets, no dynamic eval / child_process, no empty catch, zero `any`, no await-in-loop / N+1. The `--template/--skills/--tools` addition is pure pass-through opt-forwarding (`command.ts:30-43`, `:134-143`, `:203-218`) into the `scaffold()` engine already audited in 0062 — no new code paths, no new I/O or network surface. Templates are static markdown (no executable content).

**Phase 8 (Traceability):** all four work items MET with live evidence (see Requirements section).

**Verdict: PASS** — re-confirms the prior verdict. No findings to fix (`--fix all` no-op). Gates green; built-CLI smoke reproduces every acceptance claim.


### Testing

**Testing**

- **Command:** `bun run lint && bun run test && bun run build` (full project gate) + functional smoke against the freshly built CLI bundle (`bun apps/cli/dist/index.js command scaffold|evaluate`)
- **Scope:** command tier templates (default/simple/workflow/plugin) scaffold→evaluate; command command wiring (`--template`/`--skills`/`--tools` forwarding); wrapper accuracy (`plugins/cc/commands/command-add.md` self-evaluate)
- **Result: PASS** — 981/981 tests, lint+typecheck clean, build success. Functional: every command tier scaffold→evaluate ≥ 0.86 PASS Grade B (default 0.86, simple 0.86, workflow 0.88, plugin 0.86); `--template workflow --tools Read,Write,Bash,Task,Skill,Grep --skills cc-router,cc-reviewer` → correct frontmatter arrays; `--template bogus` → clear error. Wrapper self-evaluates at 0.88 PASS. Run: 2026-06-22T00:12:00Z.
- **Evidence:**
  - 3 new regression tests in `packages/core/tests/operations/scaffold.test.ts` (21 total in that file, 981 in suite, all pass); 1 brittle pre-existing test loosened to assert intent
  - `apps/cli/src/commands/command.ts` coverage 100% funcs / 100% lines
  - Built-CLI smoke: `scaffold smoke-built-${tier}` → evaluate = PASS Grade B for every tier
- **Next action:** none — all gates clean; ready for verification + `done` transition


### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References


