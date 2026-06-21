---
name: Make cc magent-add ready to replace rd3 magent-add
description: Make cc magent-add ready to replace rd3 magent-add
status: Backlog
created_at: 2026-06-21T21:14:21.069Z
updated_at: 2026-06-21T21:14:21.069Z
folder: docs/tasks
type: task
feature-id: ""
priority: high
tags: ["cc-magents","add","scaffold","dogfood","migration","rd3-parity"]
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0064. Make cc magent-add ready to replace rd3 magent-add

### Background

Dogfood pair-run /cc:magent-add vs /rd3:magent-add. Slash command *-add delegates to CLI 'scaffold'. Shared-engine gaps (operations/scaffold.ts type-agnostic): AD1 — magent scaffold currently produces a 0.31 FAIL artifact (templates/magent/default.md too thin); AD3 no --template, AD4 no scaffolding inputs, AD5 wrapper drift in plugins/cc/commands/magent-add.md. MAGENT-SPECIFIC: magents are frontmatter-OPTIONAL plain-markdown main-agent configs (AGENTS.md/CLAUDE.md/GEMINI.md, task 0050) and REQUIRED_FIELDS.magent=[] (0050). The enriched template must score PASS on the magent evaluator whose dims are completeness(governance sections)/platform-coverage/conciseness/tone-consistency/safety (task 0050) — i.e. ship real governance sections (Project/Commands/Verification/Conventions/Safety/Docs) + platform mentions + safety markers, NOT a frontmatter-heavy stub. This task tracks the MAGENT slice: enrich templates/magent/default.md to PASS the 0050 magent dims, register --template, fix the wrapper. Depends on 0062.


### Requirements

Inherit 0062 decisions (AD1 enriched-to-PASS templates; AD3 --template tiers; AD4 inputs). MAGENT specifics: the enriched magent template must score PASS (>=0.7) on the task-0050 magent evaluator (governance sections + body platform mentions + safety markers, frontmatter-OPTIONAL — do not require frontmatter). Register --template on apps/cli/src/commands/magent.ts, fix plugins/cc/commands/magent-add.md drift. Gates: bun run lint, bun run test (no skips, regression: magent scaffold->evaluate >= PASS), bun run build, git clean. DOCS SYNC (CLAUDE.md mandate): the new --template tiers + flags touch the CLI command/flag surface — update docs/04_DESIGN.md (and docs/design/design-doc-phase2.md) in the SAME commit. Do NOT flip /magent-add alias until parity confirmed AND global binary ships.


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



### Plan

1. Consume 0062 engine. 2. Enrich magent template (governance sections + platforms + safety) to PASS the
0050 dims. 3. Register --template on magent.ts. 4. Fix wrapper. 5. magent scaffold->evaluate >= PASS
regression. Gate: lint/test/build/git clean. Do NOT flip alias until ship.


### Review



### Testing



### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References


