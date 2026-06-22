---
name: Make cc skill-add ready to replace rd3 skill-add
description: Make cc skill-add ready to replace rd3 skill-add
status: Testing
created_at: 2026-06-21T21:14:21.112Z
updated_at: 2026-06-22T03:48:17.186Z
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

**Verdict: in-progress**

Implementing the SKILL slice of the add set (0062-0066). Shared engine (resolveTemplate tiers, mergeFrontmatterList, ScaffoldOptions) already landed in 0062. This task owns:

1. **S1 [P1]**: Type-aware output path — skill type writes `<name>/SKILL.md` (mkdir + write inside), other types keep flat `<name>.md`. Changes in `scaffold.ts` + `resolveContentPath` in `identity.ts` (bare-name directory-form resolution).
2. **S2**: Enrich `skill/default.md` so scaffold→evaluate ≥ PASS (trigger phrases, imperative voice, verification language, body length 500-15000).
3. **S3**: Ship `technique.md` / `pattern.md` / `reference.md` tiers mirroring rd3 cc-skills taxonomy. Register `--template` / `--skills` / `--tools` forwarding on `skill.ts` (same gap pattern as 0062 agent / 0063 command).
4. **S4**: Fix `plugins/cc/commands/skill-add.md` drift — add new flags to argument-hint + table, add template-tiers section.
5. **S5**: Regression: scaffold creates `<name>/SKILL.md` AND scaffold→evaluate ≥ 0.7 for every skill tier.

Do-not-drift: skills are directory-based (`<name>/SKILL.md`). Only skill type changes output structure; others keep flat `.md`.


### Plan

1. Consume 0062 engine. 2. [P1] Type-aware output: skill -> <name>/SKILL.md (mkdir dir + write inside);
others keep <name>.md. 3. Enrich skill template + ship technique/pattern/reference tiers. 4. Register
--template on skill.ts. 5. Fix skill-add.md drift. 6. Regression: dir-form + scaffold->evaluate >= PASS.
Gate: lint/test/build/git clean. Do NOT flip alias until ship.


### Review

**Verdict: PASS**

_2026-06-22_

### Requirements traceability

| Work item | Status | Evidence |
|-----------|--------|----------|
| S1 [P1]: skill type writes `<name>/SKILL.md` | ✅ | `scaffold.ts:194-199` type-aware output; `identity.ts:66-70` bare-name dir-form resolution |
| S2: enrich skill default template → evaluate PASS | ✅ | `default.md` rewritten; smoke test 0.94 PASS Grade A |
| S3: ship technique/pattern/reference tiers + register --template | ✅ | 3 new template files; `skill.ts:32-34,42-44` forwards template/skills/tools |
| S4: fix skill-add.md drift | ✅ | `plugins/cc/commands/skill-add.md` updated with flags, tiers, examples |
| S5: regression (dir form + evaluate PASS) | ✅ | 7 new tests, 28/28 pass; smoke tests all tiers PASS |

### SECU review

- **S (Security)**: No new external input surfaces. `name` already validated. `mkdirSync({recursive:true})` safe. No path traversal risk.
- **E (Error handling)**: Exists check throws clear path-aware error. Unknown tier throws clear error. `resolveContentPath` returns null when not found.
- **C (Correctness)**: Type-aware output only changes skill type; other types verified unchanged via smoke test. Directory-form resolution takes precedence over flat `.md` for skills (correct: scaffolded skills should resolve as directories). `--force` works with dir form. `resolveContentName` already handles `SKILL.md` → parent dir (pre-existing, unchanged).
- **U (Usability)**: All tiers PASS evaluate out of the box. Doc consistent with command-add.md format (0063). `resolveContentPath` backward-compatible: legacy flat `skills/<name>.md` still found (dir form checked first, flat form falls through).

### Do-not-drift compliance

Skills are directory-based (`<name>/SKILL.md`). Only skill type changes output structure; agent/command/hook/magent keep flat `.md`. Verified by smoke test.

### Gates

- `bun run lint` (biome + typecheck): PASS
- `bun run test`: 1009 pass, 0 fail
- `bun run build`: PASS
- `git status`: 8 modified + 3 new files, all intentional


### Testing

**Verdict: PASS** — _2026-06-22T03:48:00Z_

### Unit tests (28/28 pass, 0 fail)

Updated `packages/core/tests/operations/scaffold.test.ts`:
- `creates a skill directory with SKILL.md and substituted variables` — verifies `<name>/SKILL.md` output form (was flat `<name>.md`)
- `throws when file exists without force` — updated for directory form (mkdir + SKILL.md)
- `overwrites when force is true` — updated for directory form
- `resolves a named skill template tier (--template technique)` — new: verifies tier resolution + directory output
- `resolves the pattern skill template tier (--template pattern)` — new
- `resolves the reference skill template tier (--template reference)` — new
- `errors clearly on an unknown skill template tier` — new
- `passes its own evaluator for every skill tier (scaffold→evaluate ≥ 0.7)` — new: default=0.94, technique=0.96, pattern=0.95, reference=0.89 (all PASS)
- `resolveContentPath finds skill directory form after scaffold` — new: verifies bare-name resolution finds `<name>/SKILL.md`

### CLI test (1/1 pass)

`apps/cli/tests/commands/skill.test.ts` — registration smoke test, unchanged.

### Full suite

`bun run test`: 1009 pass, 0 fail across 58 files. Coverage: scaffold.ts 100% funcs / 98.17% lines (pre-existing unreachable throw), identity.ts 100% / 100%, skill.ts 100% / 100%.

### End-to-end smoke test (manual)

```
superskill skill scaffold my-test-skill --description "..." --output /tmp/x
  → Created: /tmp/x/my-test-skill/SKILL.md   ✓ directory form

superskill skill evaluate my-test-skill   (from /tmp/x)
  → AGGREGATE 0.94  Verdict: PASS  Grade: A   ✓

superskill skill scaffold t-tech --template technique --tools Read,Write,Bash --skills cc-router
  → frontmatter: tools: [Read, Write, Bash], skills: [cc-router]   ✓
  → evaluate: 0.96 PASS Grade A   ✓

superskill skill validate my-test-skill   (bare name, dir form)
  → Valid   ✓

superskill agent scaffold flat-agent --output /tmp/x
  → flat-agent.md   ✓ (other types unchanged, flat .md)
```

### Regression confirmed

- S1: skill scaffold creates `<name>/SKILL.md` (dir form); agent/command still flat `.md` ✓
- S2: default.md enriched → scaffold→evaluate 0.94 PASS ✓
- S3: technique/pattern/reference tiers all PASS (0.96/0.95/0.89) ✓
- S5: `resolveContentPath` bare-name resolution finds directory form ✓


### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References


