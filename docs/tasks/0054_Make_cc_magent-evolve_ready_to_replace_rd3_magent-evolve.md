---
name: Make cc magent-evolve ready to replace rd3 magent-evolve
description: Make cc magent-evolve ready to replace rd3 magent-evolve
status: Backlog
created_at: 2026-06-21T20:56:07.146Z
updated_at: 2026-06-21T20:56:07.146Z
folder: docs/tasks
type: task
feature-id: ""
priority: high
tags: ["cc-magents","evolve","dogfood","migration","rd3-parity"]
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0054. Make cc magent-evolve ready to replace rd3 magent-evolve

### Background

Dogfood pair-run /cc:magent-evolve vs /rd3:magent-evolve. Same SHARED-ENGINE gaps (operations/evolve.ts type-agnostic): G1 empty proposals, G2 no --analyze, G3 no --history/--rollback, G4 wrapper drift in plugins/cc/commands/magent-evolve.md (false 'rollback via saved version history' claim; example './CLAUDE.md --accept p1234'). MAGENT-SPECIFIC: magents are frontmatter-OPTIONAL plain-markdown (AGENTS.md/CLAUDE.md/GEMINI.md) per task 0050. evolve.ts:381 reads frontmatter.description for negative-constraint extraction + the generation anchor; a frontmatter-less magent yields an empty description, so seeded proposals + the anchor hash must degrade gracefully (no crash, no false 'description' change on a config that has none). Verify the F024 anchor gate + computeBaselineAnchorHash behave on a no-frontmatter config. This task tracks the MAGENT slice: register flags on apps/cli/src/commands/magent.ts, fix the wrapper, and confirm frontmatter-less magents evolve without error.


### Requirements

Inherit 0052 decisions (G1 heuristic-seed+ingest; G2/G3 build analyze/history/rollback in shared engine). MAGENT extras: ensure seeded change generation + anchor hashing handle a frontmatter-LESS magent (empty/absent description) without crashing or proposing a bogus frontmatter.description edit; if the only proposable target is the body, seed body-section changes instead. Register flags on apps/cli/src/commands/magent.ts, fix plugins/cc/commands/magent-evolve.md drift + --accept example. Gates: bun run lint, bun run test (no skips, add a frontmatter-less-magent evolve regression test), bun run build, git clean. DOCS SYNC (CLAUDE.md mandate): the new flags (--analyze/--history/--rollback/--confirm) touch the CLI command/flag surface — update docs/04_DESIGN.md (and docs/design/design-doc-phase2.md) in the SAME commit. Do NOT flip /magent-evolve alias until parity confirmed AND global binary ships.


### Q&A



### Design

Per-type slice. SHARED engine fix lands in 0052 (`operations/evolve.ts`); this task consumes it for the
MAGENT type and handles the frontmatter-OPTIONAL wrinkle.

## Magent-specific risk (verified)
`evolve.ts:381` reads `frontmatter.description` for negative-constraint extraction + the F024 generation
anchor (`computeBaselineAnchorHash`, `extractNegativeConstraints`). Magents are frontmatter-OPTIONAL
plain markdown (AGENTS.md/CLAUDE.md/GEMINI.md — task 0050). A frontmatter-less config yields an empty
description → seeded changes must NOT propose a bogus `frontmatter.description` edit on a config that has
no frontmatter, and the anchor hash must compute without crashing.

## Work Items
- **M1** Register `--analyze/--history/--rollback/--confirm` on `apps/cli/src/commands/magent.ts`.
- **M2** Guard the seed + anchor path for frontmatter-less magents: if no description/frontmatter, seed
  body-section changes (or skip description edits) rather than proposing an edit to a non-existent field;
  verify `computeBaselineAnchorHash` + the anchor gate handle empty frontmatter gracefully.
- **M3** Fix `plugins/cc/commands/magent-evolve.md` drift + `--accept` example.
- **M4** Regression: a frontmatter-less magent evolves (seed/analyze/history/rollback) without error and
  proposes no bogus frontmatter.description change.

## Acceptance
`magent evolve AGENTS.md --propose-only` → non-empty, sensible changes (body-targeted if no frontmatter);
no crash; analyze/history/rollback work. Gates green.

## Do-not-drift
Frontmatter-OPTIONAL magents. No engine rewrite beyond 0052 + the frontmatter-less guard. Reuse F024.


### Solution



### Plan

1. Consume 0052 engine. 2. Register flags on `magent.ts`. 3. Add frontmatter-less guard to seed + anchor
path (no bogus frontmatter.description edit; anchor hash safe on empty fm). 4. Fix wrapper. 5. Frontmatter-
less evolve regression test. Gate: lint/test/build/git clean. Do NOT flip alias until ship.


### Review



### Testing



### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References


