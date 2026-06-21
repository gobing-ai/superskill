---
name: Make cc skill-add ready to replace rd3 skill-add
description: Make cc skill-add ready to replace rd3 skill-add
status: Backlog
created_at: 2026-06-21T21:14:21.112Z
updated_at: 2026-06-21T21:14:21.112Z
folder: docs/tasks
type: task
feature-id: ""
priority: high
tags: ["cc-skills","add","scaffold","dogfood","migration","rd3-parity","dir-structure"]
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0065. Make cc skill-add ready to replace rd3 skill-add

### Background

Dogfood pair-run /cc:skill-add vs /rd3:skill-add. Slash command *-add delegates to CLI 'scaffold'. SKILL-SPECIFIC P1 BUG (verified): 'skill scaffold my-test-skill' writes a FLAT my-test-skill.md (scaffold.ts:105 joins outDir + name + '.md'), but skills are DIRECTORY-based — the rest of the system (evaluate/refine, tasks 0047/0060) expects <name>/SKILL.md inside a dir. So skill scaffold output is the WRONG on-disk structure: 'skill evaluate my-test-skill.md' then mis-reads it (0.22 FAIL). Plus the shared-engine gaps: AD1 thin template (0.22 FAIL), AD3 no --template (rd3 skill has technique/pattern/reference tiers), AD4 no inputs, AD5 wrapper drift in plugins/cc/commands/skill-add.md. This task tracks the SKILL slice and OWNS the directory-structure fix: skill scaffold must create <name>/SKILL.md so scaffold->evaluate->refine all resolve the same artifact. Depends on 0062 for the shared template/flag work.


### Requirements

Inherit 0062 decisions (AD1 enriched-to-PASS templates; AD3 --template tiers technique/pattern/reference; AD4 inputs). SKILL P1: fix scaffold so the skill type writes <name>/SKILL.md INSIDE a directory (not a flat <name>.md), so the directory form resolves for evaluate/refine/evolve (tasks 0047/0060). Confirm scaffold->evaluate >= PASS reading the SKILL.md in the dir. Register --template on apps/cli/src/commands/skill.ts, fix plugins/cc/commands/skill-add.md drift. Gates: bun run lint, bun run test (no skips, regression: skill scaffold creates <name>/SKILL.md AND scaffold->evaluate >= PASS), bun run build, git clean. DOCS SYNC (CLAUDE.md mandate): the new --template tiers + flags + the skill-dir output-structure change touch the CLI command/flag/schema surface — update docs/04_DESIGN.md (and docs/design/design-doc-phase2.md) in the SAME commit. Do NOT flip /skill-add alias until parity confirmed AND global binary ships.


### Q&A



### Design

Per-type slice. SHARED fix lands in 0062; this task consumes it for the SKILL type AND owns the
directory-structure P1 bug. Depends on 0062.

## Skill P1 bug (verified)
`skill scaffold my-test-skill` writes a FLAT `my-test-skill.md` (scaffold.ts:105 = join(outDir, name+'.md')).
But skills are DIRECTORY-based: the rest of the system (evaluate/refine/evolve — tasks 0047/0060) expects
`<name>/SKILL.md` inside a directory. Result: `skill evaluate my-test-skill.md` mis-reads it -> 0.22 FAIL.
The skill scaffolder writes the wrong on-disk structure for the type.

## Work Items
- **S1 [P1]** Make the skill type write `<name>/SKILL.md` (mkdir `<output>/<name>/`, write SKILL.md inside),
  not a flat `<name>.md`. Keep other types writing `<name>.md`. Type-aware output path in scaffold.ts.
- **S2** Enrich the skill template (technique tier etc.) so scaffold->evaluate >= PASS reading the SKILL.md
  in the dir (skill dims, task 0047).
- **S3** Ship skill tiers technique/pattern/reference (match rd3 cc-skills/templates); register --template
  on apps/cli/src/commands/skill.ts.
- **S4** Fix plugins/cc/commands/skill-add.md drift.
- **S5** Regression: skill scaffold creates `<name>/SKILL.md` (dir form) AND scaffold->evaluate >= PASS.

## Acceptance
skill scaffold x -> creates x/SKILL.md; skill evaluate x (dir) PASS; --template tiers resolve. Gates green.

## Do-not-drift
Skills are directory-based — SKILL.md inside a dir. Only the skill type changes output structure; others
keep flat .md. Coordinate alias/deployment.


### Solution



### Plan

1. Consume 0062 engine. 2. [P1] Type-aware output: skill -> <name>/SKILL.md (mkdir dir + write inside);
others keep <name>.md. 3. Enrich skill template + ship technique/pattern/reference tiers. 4. Register
--template on skill.ts. 5. Fix skill-add.md drift. 6. Regression: dir-form + scaffold->evaluate >= PASS.
Gate: lint/test/build/git clean. Do NOT flip alias until ship.


### Review



### Testing



### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References


