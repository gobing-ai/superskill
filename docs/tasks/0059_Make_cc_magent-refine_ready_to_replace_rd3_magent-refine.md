---
name: Make cc magent-refine ready to replace rd3 magent-refine
description: Make cc magent-refine ready to replace rd3 magent-refine
status: Backlog
created_at: 2026-06-21T21:05:49.494Z
updated_at: 2026-06-21T21:05:49.494Z
folder: docs/tasks
type: task
feature-id: ""
priority: high
tags: ["cc-magents","refine","dogfood","migration","rd3-parity"]
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0059. Make cc magent-refine ready to replace rd3 magent-refine

### Background

Dogfood pair-run /cc:magent-refine vs /rd3:magent-refine. Same SHARED-ENGINE gaps (operations/refine.ts type-agnostic): R1 validation-error early-return, R3 TODO placeholders, R4 suggest/flag never fixed, R2 no --dry-run, R5 wrapper drift in plugins/cc/commands/magent-refine.md. MAGENT-SPECIFIC: magents are frontmatter-OPTIONAL plain markdown (AGENTS.md/CLAUDE.md/GEMINI.md, task 0050), and REQUIRED_FIELDS.magent=[] (task 0050). So the structural auto-apply path (insert missing required frontmatter field) has NOTHING to insert for a frontmatter-less magent — the refine value for magents is body/section quality, not field insertion. Verify refine does not try to add frontmatter to a plain-markdown config, and that --dry-run + the reorder fix degrade gracefully when there are no required fields. This task tracks the MAGENT slice: register --dry-run on apps/cli/src/commands/magent.ts, fix the wrapper, confirm frontmatter-less magents refine without bogus frontmatter insertion.


### Requirements

Inherit 0057 decisions (R1/R3 reorder+real-defaults; R2 --dry-run; R5 honest wrapper). MAGENT extras: confirm a frontmatter-LESS magent (REQUIRED_FIELDS.magent=[]) refines without attempting to insert frontmatter fields; structural auto-apply is a no-op there, so refine should report no structural fixes (not an error) and surface body/section suggestions instead. Register --dry-run on apps/cli/src/commands/magent.ts, fix plugins/cc/commands/magent-refine.md drift. Gates: bun run lint, bun run test (no skips, add frontmatter-less-magent refine regression), bun run build, git clean. DOCS SYNC (CLAUDE.md mandate): the new --dry-run flag touches the CLI command/flag surface — update docs/04_DESIGN.md (and docs/design/design-doc-phase2.md) in the SAME commit. Do NOT flip /magent-refine alias until parity confirmed AND global binary ships.


### Q&A



### Design

Per-type slice. SHARED engine fix lands in 0057; this task consumes it for the MAGENT type and handles
the frontmatter-OPTIONAL wrinkle.

## Magent-specific (verified)
Magents are frontmatter-OPTIONAL plain markdown (AGENTS.md/CLAUDE.md, task 0050) and REQUIRED_FIELDS.magent
= [] (task 0050). The structural auto-apply path (`generateAutoChange` inserts missing required frontmatter
fields) has NOTHING to insert for a frontmatter-less magent. Refine value for magents is body/section
quality, not field insertion. Risk: the 0057 reorder must not try to add frontmatter to a plain-markdown
config, and must report 'no structural fixes' (not an error) when REQUIRED_FIELDS is empty.

## Work Items
- **M1** Register --dry-run on `apps/cli/src/commands/magent.ts`.
- **M2** Confirm a frontmatter-LESS magent refines with no bogus frontmatter insertion; structural
  auto-apply is a clean no-op; body/section suggestions still surface.
- **M3** Fix `plugins/cc/commands/magent-refine.md` drift.
- **M4** Regression: frontmatter-less magent refine — no error, no frontmatter added, score not lowered.

## Acceptance
magent refine AGENTS.md → no bogus frontmatter, no error exit, --dry-run previews. Gates green.

## Do-not-drift
Frontmatter-OPTIONAL magents. No engine rewrite beyond 0057 + the empty-required-fields guard.


### Solution



### Plan

1. Consume 0057 engine. 2. Register --dry-run on magent.ts. 3. Guard empty-REQUIRED_FIELDS path (no
frontmatter insertion on plain-markdown magent). 4. Fix wrapper. 5. Frontmatter-less refine regression.
Gate: lint/test/build/git clean. Do NOT flip alias until ship.


### Review



### Testing



### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References


