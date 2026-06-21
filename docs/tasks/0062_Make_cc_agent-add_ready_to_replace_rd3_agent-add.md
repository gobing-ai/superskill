---
name: Make cc agent-add ready to replace rd3 agent-add
description: Make cc agent-add ready to replace rd3 agent-add
status: Backlog
created_at: 2026-06-21T21:14:01.172Z
updated_at: 2026-06-21T21:14:01.172Z
folder: docs/tasks
type: task
feature-id: ""
priority: high
tags: ["cc-agents","add","scaffold","dogfood","migration","rd3-parity"]
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0062. Make cc agent-add ready to replace rd3 agent-add

### Background

Dogfood pair-run /cc:agent-add vs /rd3:agent-add on global superskill 0.1.8. The slash command is *-add but delegates to the CLI verb 'scaffold' (operations/scaffold.ts). FIVE gaps. AD1 [P1]: a freshly scaffolded agent FAILS the project's OWN evaluator — 'agent scaffold my-test-agent --description X' then 'agent evaluate' = AGGREGATE 0.40 FAIL Grade F (completeness 1.00 but role-clarity/tool-selection/skill-linkage near-zero because templates/agent/default.md ships an empty BODY with no role/skill scaffolding). 'Create a new agent' emits a failing artifact. (For contrast: magent scaffold = 0.31 FAIL, skill = 0.22 FAIL, command = 0.74 PASS — only command's template is adequate.) AD3 [MAJOR]: cc ships ONLY templates/agent/default.md; rd3 has tiered templates (minimal/standard/specialist) with --template <tier>; cc errors 'unknown option --template'. AD4 [MAJOR]: rd3 agent-add takes --skills/--tools to pre-populate frontmatter; cc scaffold options are only --description/--target/--output/--force (helpers.ts addScaffoldOptions). AD5 [MAJOR/doc-drift]: plugins/cc/commands/agent-add.md:2 says 'Create a new agent with scaffolding AND TEMPLATES' (plural — only default.md exists); argument-hint omits --template/--skills/--tools. Engine is type-agnostic (scaffold.ts shared by all 5 types), so AD1/AD3/AD4 land once and benefit every type.


### Requirements

DECISIONS (operator-confirmed): AD1 = enrich each type's default.md so a freshly scaffolded artifact scores PASS (>=0.7) on its OWN evaluator out of the box (real role/section/skill-linkage scaffolding, not empty placeholders). AD3 = add rd3-style --template <tier> selection (e.g. minimal/standard/specialist for agents) to the shared scaffold engine. AD4 = add --skills/--tools inputs that pre-populate frontmatter. Apply AD1/AD3/AD4 to the SHARED operations/scaffold.ts (+ substituteVars for new placeholders) and register the new flags on apps/cli/src/commands/agent.ts (addScaffoldOptions). Fix AD5 wrapper drift: align claims to real template set, add --template/--skills/--tools to argument-hint + Arguments table. Gates: bun run lint, bun run test (no skips, add regression: scaffold->evaluate >= PASS for agent; --template tiers resolve; --skills/--tools land in frontmatter), bun run build, git clean. Do NOT flip /agent-add alias until parity confirmed AND global binary carries the build.

ENGINE-PATH NOTE (verified working tree): the scaffold engine to edit is packages/core/src/operations/scaffold.ts (NOT apps/cli/src/operations/scaffold.ts — that file is a 77-byte re-export). The flat-output line is scaffold.ts:105 = join(outDir, name+'.md'); body:'' is injected at :100; substituteVars (:33) only knows NAME/DESCRIPTION/TARGET/BODY (AD4 adds SKILLS/TOOLS). Templates live under apps/cli/src/templates/<type>/default.md (resolved by resolveTemplate, :53). Note REQUIRED_FIELDS.agent=['name','description','model','tools'] (quality/types.ts) — the enriched agent template must populate model + tools to satisfy the completeness dimension.

DOCS SYNC (CLAUDE.md mandate): the new --template tiers + --skills/--tools flags touch the CLI command/flag surface — update docs/04_DESIGN.md (and docs/design/design-doc-phase2.md) in the SAME commit as the flag registration.

EXECUTION ORDER (Gap 5): run the add SET (0062+0063+0064+0065) as ONE unit on one branch/PR — land the shared scaffold engine + enriched templates and wire ALL 5 subcommands + per-type tier templates + 0065's skill-dir output P1 + all wrappers + all-type scaffold->evaluate>=PASS tests under a single gate, so the engine is proven against agent/command/magent/skill BEFORE merge. Cross-set order: run THIS Add set FIRST (it owns the skill-dir scaffold fix in 0065), THEN Refine (0057-0060), THEN Evolve (0052-0055) — the skill refine/evolve slices resolve directory-based <name>/SKILL.md, which only exists once this set has shipped. Hooks (0056/0061/0066) are independent, run anytime.


### Q&A



### Design

Pair-run maturity assessment + fix plan for `/cc:agent-add` → `/rd3:agent-add`. Verified 2026-06-21
against global superskill **0.1.8** + the working tree. **Lead task of the add set (0062–0066)** —
carries the SHARED, type-agnostic engine fix in `packages/core/src/operations/scaffold.ts` + the
enriched templates that 0063/0064/0065 inherit. The `*-add` slash commands delegate to the CLI verb
`scaffold`.

---

## Pair-run evidence (executed both)

**cc** — scaffold then immediately evaluate the output:
```
agent scaffold my-test-agent --description X → Created my-test-agent.md
agent evaluate my-test-agent.md            → completeness 1.00, AGGREGATE 0.40, Verdict FAIL Grade F
```
The default template gives `completeness 1.00` but everything else (role-clarity, tool-selection,
skill-linkage) near-zero — `templates/agent/default.md` ships an empty `<!-- BODY -->` with no role or
skill scaffolding. **`agent-add` emits an artifact that fails the project's own evaluator.**

Per-type scaffold→evaluate (verified): agent **0.40 FAIL** · magent **0.31 FAIL** · skill **0.22 FAIL** ·
command **0.74 PASS** (only command's template is adequate today).

`agent scaffold x --template minimal` → `error: unknown option '--template'`.

**rd3** (`skills/cc-agents/scripts/scaffold.ts`):
- `--template <tier>` (minimal / standard / specialist; default standard) — 3 shipped templates.
- wrapper `agent-add.md` takes `[description] [--path] [--template] [--skills <list>] [--tools <list>]`.

**Read:** cc add produces a failing artifact, ships one thin template per type, and lacks tier/skills/tools
inputs. Not a like-for-like replacement.

---

## Root causes (verified against source)

### AD1 [P1] — scaffolded artifact fails its own evaluator
`packages/core/src/operations/scaffold.ts:96` substitutes `body: ''` (empty) into the template, and
`apps/cli/src/templates/<type>/default.md` carry minimal structure. The result scores below the 0.7 PASS
bar for agent/magent/skill. "Create a new agent" should yield a PASSing starting point, not a Grade F.

### AD3 [MAJOR] — single template, no tier selection
`resolveTemplate` (`scaffold.ts:53`) loads only `<type>/default.md` (user override or built-in). No tier
concept. rd3 has minimal/standard/specialist.

### AD4 [MAJOR] — no `--skills` / `--tools` inputs
`ScaffoldOptions` (`scaffold.ts:8`) = `description/target/output/force`; `substituteVars` knows only
NAME/DESCRIPTION/TARGET/BODY. rd3 pre-populates frontmatter from `--skills`/`--tools`.

### AD5 [MAJOR/doc-drift] — wrapper claims templates that don't exist
`plugins/cc/commands/agent-add.md:2` "Create a new agent with scaffolding **and templates**" (plural —
only `default.md` exists); `argument-hint` omits `--template/--skills/--tools`.

---

## Architecture context

| | rd3 | cc |
|--|-----|-----|
| Engine | per-skill `skills/cc-agents/scripts/scaffold.ts` | shared `packages/core/src/operations/scaffold.ts` |
| Templates | tiered per type (minimal/standard/specialist; simple/workflow/plugin; technique/pattern/reference) | one `default.md` per type |
| Inputs | `--template --skills --tools --path` | `--description --target --output --force` |
| Output quality | tier-appropriate | agent/magent/skill FAIL their own evaluator |

Canonical files:
- Engine: `packages/core/src/operations/scaffold.ts` (`scaffold`, `resolveTemplate`, `substituteVars`)
- Templates: `apps/cli/src/templates/<type>/default.md` (+ new tier files)
- CLI options: `apps/cli/src/commands/helpers.ts` (`addScaffoldOptions`), `apps/cli/src/commands/agent.ts`
- Wrapper: `plugins/cc/commands/agent-add.md`

---

## Work Items

### A1 [P1] — Enrich templates so scaffold→evaluate ≥ PASS (AD1)
**Files:** `apps/cli/src/templates/agent/*.md`.
**Fix:** rewrite the agent template body to include a real Role section, a Skill Integration block
(`skill:` references for skill-linkage), and a tools list — so a freshly scaffolded agent scores ≥ 0.7 on
its own evaluator (the task-0048 agent dims: completeness/role-clarity/tool-selection/skill-linkage/
model-fit). The body must be a usable starting scaffold, not empty.
**Acceptance:** `agent scaffold x --description "..."` → `agent evaluate x.md` is PASS (≥ 0.7), not FAIL.

### A2 [MAJOR] — Add `--template <tier>` selection (AD3)
**Files:** `scaffold.ts` (`resolveTemplate` takes a tier; resolution `<type>/<tier>.md`),
`apps/cli/src/commands/agent.ts` / `helpers.ts`.
**Fix:** ship `minimal.md` / `standard.md` / `specialist.md` for agents; `--template` selects (default
`standard`/`default`). Keep `default.md` as the fallback tier so existing behavior is preserved.
**Acceptance:** `agent scaffold x --template specialist` resolves the specialist template; unknown tier →
clear error.

### A3 [MAJOR] — Add `--skills` / `--tools` inputs (AD4)
**Files:** `scaffold.ts` (`ScaffoldOptions` + new placeholders, e.g. `<!-- SKILLS -->`, `<!-- TOOLS -->`),
`helpers.ts`, `apps/cli/src/commands/agent.ts`.
**Fix:** `--skills a,b` / `--tools Read,Write` pre-populate the frontmatter `skills:`/`tools:` arrays.
**Acceptance:** `agent scaffold x --tools Read,Write,Bash` → the file's `tools:` lists those three.

### A4 [MAJOR] — Fix wrapper drift (AD5)
**File:** `plugins/cc/commands/agent-add.md`.
**Fix:** describe the real template set; add `--template/--skills/--tools` to `argument-hint` + Arguments.
**Acceptance:** wrapper claims match the shipped templates + flags.

### A5 [MINOR] — Regression tests
scaffold→evaluate ≥ PASS for agent (every tier); `--template` resolves the right file; `--skills/--tools`
land in frontmatter; unknown tier errors clearly.

---

## Policy decisions (operator-confirmed)
- **AD1:** enrich templates so a scaffolded artifact PASSes its own evaluator out of the box.
- **AD3:** add `--template` tiers.
- **AD4:** add `--skills`/`--tools` inputs.
- **Shared engine:** A1/A2/A3 land in `operations/scaffold.ts` + templates ONCE; 0063/0064/0065 add their
  type's tier templates, register flags, fix wrappers, add tests. **0065 also owns the skill-dir fix.**
- **Deployment:** do NOT flip the `/agent-add` alias until parity confirmed AND the global binary ships.

## Do-not-drift guardrails
- A scaffolded artifact must PASS its own evaluator — templates are the contract; add a regression that
  enforces scaffold→evaluate ≥ 0.7 for every type+tier.
- Keep `default.md` as a working fallback tier (no breaking change to the no-`--template` path).
- Engine stays type-agnostic; per-type richness lives in the template files, not in `scaffold.ts` branches.
- Do NOT claim a template tier the repo doesn't ship.


### Solution



### Plan

Lead task of the add set. Carries the shared engine + template fix; 0063-0065 inherit it (0065 also owns
the skill-dir fix). Confirmed: AD1 enrich-to-PASS templates; AD3 --template tiers; AD4 --skills/--tools.

### Phase 1 — Shared engine + agent templates
1. **A1 (AD1):** rewrite agent templates so scaffold->evaluate >= 0.7 (real Role + Skill Integration +
   tools). Add a regression asserting PASS.
2. **A2 (AD3):** `resolveTemplate(type, tier)` resolves `<type>/<tier>.md`; ship agent minimal/standard/
   specialist; default tier = standard/default fallback (no breaking change).
3. **A3 (AD4):** ScaffoldOptions + substituteVars gain SKILLS/TOOLS placeholders; --skills/--tools
   pre-populate frontmatter.

### Phase 2 — Agent surface
4. Register --template/--skills/--tools on `apps/cli/src/commands/agent.ts` + helpers.ts addScaffoldOptions.
5. **A4 (AD5):** fix `plugins/cc/commands/agent-add.md` — real templates + flags in argument-hint/table.

### Phase 3 — Tests
6. **A5:** scaffold->evaluate >= PASS per tier; --template resolves; --skills/--tools land; unknown tier errors.

### Verification gate
- lint/test/build clean; git clean. Functional: `agent scaffold x --description ...` -> evaluate PASS;
  --template specialist resolves; --tools Read,Write,Bash lands in frontmatter.
- Atomic commits: `feat(scaffold): enrich agent templates to pass evaluator`,
  `feat(scaffold): add --template tiers + --skills/--tools`, `fix(cc-commands): align agent-add wrapper`.

### Do-not-drift
Scaffolded artifact must PASS its own evaluator (regression-enforced). default.md stays a working fallback.
Engine type-agnostic; richness in templates. Coordinate alias/deployment with 0063-0065.


### Review



### Testing



### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References


