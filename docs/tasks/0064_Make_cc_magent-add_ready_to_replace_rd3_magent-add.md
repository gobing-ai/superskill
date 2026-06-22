---
name: Make cc magent-add ready to replace rd3 magent-add
description: Make cc magent-add ready to replace rd3 magent-add
status: Done
created_at: 2026-06-21T21:14:21.069Z
updated_at: 2026-06-22T01:43:55.594Z
folder: docs/tasks
type: task
feature-id: ""
priority: high
tags: ["cc-magents","add","scaffold","dogfood","migration","rd3-parity"]
impl_progress:
  planning: completed
  design: completed
  implementation: completed
  review: completed
  testing: completed
---

## 0064. Make cc magent-add ready to replace rd3 magent-add

### Background

Dogfood pair-run /cc:magent-add vs /rd3:magent-add. Slash command *-add delegates to CLI 'scaffold'. Shared-engine gaps (operations/scaffold.ts type-agnostic): AD1 — magent scaffold currently produces a 0.31 FAIL artifact (templates/magent/default.md too thin); AD3 no --template, AD4 no scaffolding inputs, AD5 wrapper drift in plugins/cc/commands/magent-add.md. MAGENT-SPECIFIC: magents are frontmatter-OPTIONAL plain-markdown main-agent configs (AGENTS.md/CLAUDE.md/GEMINI.md, task 0050) and REQUIRED_FIELDS.magent=[] (0050). The enriched template must score PASS on the magent evaluator whose dims are completeness(governance sections)/platform-coverage/conciseness/tone-consistency/safety (task 0050) — i.e. ship real governance sections (Project/Commands/Verification/Conventions/Safety/Docs) + platform mentions + safety markers, NOT a frontmatter-heavy stub. This task tracks the MAGENT slice: enrich templates/magent/default.md to PASS the 0050 magent dims, register --template, fix the wrapper. Depends on 0062.


### Requirements

- [x] **R1**: Inherit 0062 scaffold decisions: enriched-to-PASS templates, `--template` tiers, and `--skills`/`--tools` scaffold inputs. → **MET** | Evidence: `packages/core/src/operations/scaffold.ts` already supports `template`, `skills`, and `tools`; `apps/cli/src/commands/magent.ts` forwards those options for magents.
- [x] **R2**: Enriched magent template scores PASS (>= 0.70) on the task-0050 magent evaluator without requiring frontmatter-heavy design. → **MET** | Evidence: `apps/cli/src/templates/magent/default.md` contains governance sections, platform mentions, safety markers, and directive tone; `packages/core/tests/operations/scaffold.test.ts` asserts scaffolded magent aggregate >= 0.70.
- [x] **R3**: Register `--template` on `apps/cli/src/commands/magent.ts` and preserve scaffold inputs. → **MET** | Evidence: `addScaffoldOptions(...)` is used by `registerMagent`; `magentScaffold` passes `template`, `skills`, and `tools` to `scaffold('magent', ...)`; command-module regression asserts direct and parsed CLI forwarding.
- [x] **R4**: Fix `plugins/cc/commands/magent-add.md` wrapper drift. → **MET** | Evidence: wrapper argument hint and Arguments table cover `--description`, `--target`, `--output`, `--template`, `--skills`, `--tools`, and `--force`; default target corrected to canonical `claude`.
- [x] **R5**: Gates: `bun run lint`, `bun run test`, `bun run build`, no skips, regression coverage. → **MET** | Evidence: re-run at 2026-06-22T01:50Z; lint/typecheck pass, 994/994 tests pass, build pass.
- [x] **R6**: Docs sync for command/flag surface: update `docs/04_DESIGN.md` and `docs/design/design-doc-phase2.md`; do not flip `/magent-add` alias. → **MET** | Evidence: `docs/design/design-doc-phase2.md` already records scaffold `--template`/`--skills`/`--tools`; verification fix added the concrete shared scaffold flag surface to `docs/04_DESIGN.md`; no alias flip found.


### Q&A



### Design

Per-type slice. SHARED fix lands in 0062; this task consumes it for the MAGENT type. magent scaffold today
= 0.31 FAIL (templates/magent/default.md too thin). Depends on 0062.

## Magent-specific (verified, task 0050)
The magent evaluator scores completeness(governance sections: Project/Commands/Verification/Conventions/
Safety/Docs) / platform-coverage / conciseness / tone-consistency / safety, and magents are
frontmatter-OPTIONAL (REQUIRED_FIELDS.magent=[]). So the enriched magent template must ship REAL governance
sections + body platform mentions (claude-code/codex/gemini) + safety markers ([CRITICAL]/NEVER/security)
to score >= 0.7 — NOT a frontmatter-heavy stub.

## Work Items
- **M1** Enrich apps/cli/src/templates/magent/* so scaffold->evaluate >= PASS on the 0050 magent dims
  (governance sections + platforms + safety, frontmatter-optional).
- **M2** Register --template on apps/cli/src/commands/magent.ts (tiers as appropriate).
- **M3** Fix plugins/cc/commands/magent-add.md drift.
- **M4** Regression: magent scaffold->evaluate >= PASS.

## Acceptance
magent scaffold -> evaluate PASS (was 0.31 FAIL); wrapper matches reality. Gates green.

## Do-not-drift
Frontmatter-OPTIONAL magents — enrich the BODY (governance/platforms/safety), don't require frontmatter.


### Solution

Enrich `apps/cli/src/templates/magent/default.md` with full governance sections (Project, Commands, Verification, Conventions, Safety, Docs), platform mentions in prose, tone/style markers, and safety keywords so scaffold→evaluate scores >= PASS (0.70+). Forward `--template`, `--skills`, `--tools` through the magent scaffold command to the shared engine. Fix wrapper drift in `plugins/cc/commands/magent-add.md` to cover all CLI flags. Existing tests updated; regression: `magent scaffold` then `evaluate --json` must return aggregate >= 0.70.


### Plan

1. Consume 0062 engine. 2. Enrich magent template (governance sections + platforms + safety) to PASS the
0050 dims. 3. Register --template on magent.ts. 4. Fix wrapper. 5. magent scaffold->evaluate >= PASS
regression. Gate: lint/test/build/git clean. Do NOT flip alias until ship.


### Review

**Verdict: PASS** — forced re-verification for task 0064 on 2026-06-22T01:50Z with `--auto --fix all --force`.

**Scope:** `apps/cli/src/templates/magent/default.md`, `apps/cli/src/commands/magent.ts`, `plugins/cc/commands/magent-add.md`, `packages/core/tests/operations/scaffold.test.ts`, `apps/cli/tests/commands/content-command-modules.test.ts`, `docs/04_DESIGN.md`, `docs/design/design-doc-phase2.md`.

**SECU findings:** 0 P1/P2/P3/P4 after fix pass.

| # | Title | Dimension | Location | Resolution |
|---|-------|-----------|----------|------------|
| 1 | `04_DESIGN` did not record the concrete shared scaffold flag surface required by task 0064 docs sync | Correctness | `docs/04_DESIGN.md` | Fixed by adding shared scaffold flags (`--description`, `--target`, `--output`, `--template`, `--skills`, `--tools`, `--force`) to the Phase 2 command-surface table and bumping metadata to 2.2.0. |
| 2 | `magent-add` wrapper documented the default target as `claude-code`, but the CLI default token is `claude` | Correctness | `plugins/cc/commands/magent-add.md` | Fixed wrapper default to `claude`, matching `addScaffoldOptions` / `resolveTarget`. |
| 3 | No focused test proved magent scaffold forwarded `--template`, `--skills`, and `--tools` through the command module | Correctness | `apps/cli/tests/commands/content-command-modules.test.ts` | Added a regression for direct `magentScaffold` and parsed `magent scaffold` option forwarding. |

**Requirements traceability:** all requirements MET after fix pass. No scope drift found. `/magent-add` alias remains unflipped.

**Gate:** `bun run lint` → pass; `bun run test` → pass (994/994, 0 skips); `bun run build` → pass.

**Fix-pass:** 3 fixed, 0 failed, 0 skipped.


### Testing

- **Command:** `bun run lint` (2026-06-22T01:50Z)
- **Result:** PASS — Biome checked 138 files; workspace typecheck passed for `@gobing-ai/superskill-core` and `@gobing-ai/superskill`.
- **Command:** `bun run test` (2026-06-22T01:50Z)
- **Result:** PASS — 994/994 tests, 0 failures, 0 skips, 2473 assertions across 58 files. Coverage: 99.69% funcs / 98.76% lines aggregate.
- **Command:** `bun run build` (2026-06-22T01:50Z)
- **Result:** PASS — bundled CLI entrypoint `index.js` at 3.43 MB.
- **Regression evidence:** `packages/core/tests/operations/scaffold.test.ts` asserts magent scaffold governance sections and aggregate >= 0.70; `apps/cli/tests/commands/content-command-modules.test.ts` asserts magent scaffold option forwarding for `--template`, `--skills`, and `--tools`.
- **Worktree:** intentional task 0064 changes plus unrelated in-progress `0055` / `skill-evolve` edits present in `apps/cli/src/commands/skill.ts`, `docs/tasks/0055_Make_cc_skill-evolve_ready_to_replace_rd3_skill-evolve.md`, and `plugins/cc/commands/skill-evolve.md`.


### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References

