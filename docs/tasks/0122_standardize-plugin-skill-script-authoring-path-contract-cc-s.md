---
schema_version: 1
name: "Standardize plugin-skill script authoring (path contract, cc-skills, validate layout gate)"
status: done
template: feature-impl
created_at: 2026-08-25T07:07:21.700Z
updated_at: "2026-08-25T19:02:19.243Z"
feature_id: H1
---

## 0122. Standardize plugin-skill script authoring (path contract, cc-skills, validate layout gate)

### Background
Docs already describe the dual contract (ADR-023): plugin-level `plugins/<plugin>/scripts/<feature>/`,
standard invocation `node "$(superskill script path …)"`, optional first-party `script run` /
`hook run`. Three gaps keep that from being the actual authoring path:

1. `docs/help/how_to_organize_scripts_for_plugin_development.md` still tells authors to *prefer*
   `script run` for engines like `cc/validate-response`, which contradicts ADR-023 and the
   anti-hallucination structure test (path-first).
2. `plugins/cc/skills/cc-skills` (the meta skill for create / evaluate / refine) mentions the
   dual contract but does not walk those operations through a script authoring recipe, mixes
   `scripts/<skill>/` with `scripts/<feature>/`, and still says "Add skill-specific scripts" after
   scaffold. `scripts-and-install.md` shows `script run` first and calls the `.mjs` twin secondary.
3. `scripts-and-install.md` claims `superskill skill validate` / `evaluate` flag per-skill
   `scripts/` directories. They do not — `packages/core/src/operations/validate.ts` never inspects
   the skill folder layout.

This task makes the documented standard contract the one authors follow, and makes validate
enforce the layout rule the docs already state. It does **not** add a class SDK or extend
`ScriptRunner` (0121 Q1/Q2 already closed that).
### Requirements
- [x] R1. Rewrite the plugin-scripts help guide so the standard contract is the default authoring path: authoring recipe, no class-SDK, no "prefer `script run`" for `cc/validate-response`, consistent `scripts/<feature>/` naming, convert output is `.mjs`.
- [x] R2. Teach `cc-skills` create / validate / evaluate / refine the same recipe: SKILL.md cites `scripts/<feature>/` and the dual contract; `scripts-and-install.md` is path-first and honest about which CLI owns which gate; `skill-creation.md` and `workflows.md` walk the executable steps; glossary / troubleshooting / best-practices / quick-reference stop teaching skill-folder or Python-as-entrypoint scripts.
- [x] R3. `superskill skill validate` errors when a **plugin** skill (`plugins/<plugin>/skills/<name>/SKILL.md`) contains a `scripts/` or `extensions/` directory. Standalone skills (not under that path) are not flagged — agentskills.io still allows skill-local `scripts/`.
- [x] R4. Record the layout finding on `skill validate` in `docs/04_DESIGN.md` (same-commit surface sync). Do not add argv/async/external registration to `ScriptRunner`.
### Acceptance Criteria
```gherkin
Feature: Standard plugin-skill script authoring

  Scenario: R1 — help guide is standard-first
    Given docs/help/how_to_organize_scripts_for_plugin_development.md
    When an author reads how to ship a skill executable
    Then the standard form is node "$(superskill script path …)" with a portable .js/.mjs/.sh entrypoint
    And there is an authoring recipe (layout → convert → path invocation → tests beside the engine)
    And the guide states ScriptRunner is not a plugin-author class SDK
    And it does not tell authors to prefer script run for cc/validate-response

  Scenario: R2 — cc-skills walks create/evaluate/refine through the recipe
    Given plugins/cc/skills/cc-skills
    When an agent creates, validates, evaluates, or refines a plugin skill that needs an executable
    Then SKILL.md and scripts-and-install.md teach plugins/<plugin>/scripts/<feature>/ and path-first invocation
    And skill-creation.md does not instruct adding scripts inside the skill folder
    And workflows.md includes script-contract checks on create, validate, evaluate, and refine
    And best-practices / glossary / troubleshooting / quick-reference agree with that contract

  Scenario: R3 — validate errors on plugin-skill scripts/ and extensions/
    Given a SKILL.md at plugins/<plugin>/skills/<name>/SKILL.md
    And that skill folder contains a scripts/ or extensions/ directory
    When superskill skill validate runs
    Then it reports an error finding on field _layout
    And valid is false

  Scenario: R3 residual-proof — standalone skill-local scripts/ is allowed
    Given a SKILL.md that is not under plugins/*/skills/
    And that skill folder contains a scripts/ directory
    When superskill skill validate runs
    Then it does not emit a _layout finding for scripts/

  Scenario: R4 — no ScriptRunner expansion
    Given apps/cli/src/commands/script-run.ts
    When this task ships
    Then ScriptRunner remains argv-less, synchronous, and first-party-only
```
### Q&A
**Q1 — Add a PluginScript class for authors to implement?** No. Task 0121 already closed this
(argv/async and external registration). H1 Out forbids runtime discovery of third-party scripts
without install. `ScriptRunner` stays a CLI-internal adapter. This task documents that.

**Q2 — Should evaluate also flag the directory?** No. `evaluateSkill` has no path. Putting a
filesystem walk into the scorer would couple scoring to install layout. Validate is the
structural gate; evaluate/refine checklists cover invocation-form prose.

**Q3 — Flag forbidden invocation strings in SKILL.md bodies?** No. cc-skills itself names those
anti-patterns. A body scan would fail the meta-skill. Invocation-form hygiene stays a checklist
item plus the existing anti-hallucination structure test.

**Q4 — Auto-hoist or delete skill-folder scripts/ in refine --auto?** No. Destructive and
outside refine's current deterministic-fix set. Validate errors; the agent hoists by hand.
### Design
**Layout gate lives in `validate()`, not `evaluateSkill()`.** `evaluateSkill(content, target)` is
content-only; it has no filesystem. The docs' claim that evaluate flags `scripts/` was false —
validate owns the directory check because it already resolves `SKILL.md` and has `baseDir`.
Evaluate / refine keep an LLM checklist for *invocation forms* (`bun plugins/…`,
`${CLAUDE_PLUGIN_ROOT}`) so the meta-skill that *documents* those anti-patterns is not failed by
a body-text scan.

**Plugin vs standalone.** `isPluginSkillPath` matches
`(?:^|/)plugins/[^/]+/skills/[^/]+/SKILL.md$` after normalizing separators. Only then
`scripts/` and `extensions/` directories (not files) become `_layout` errors. `cc-hooks/examples/`
is not `scripts/` or `extensions/` and stays allowed as teaching fixtures.

**Docs SSOT.** Help guide = plugin-author contract. `scripts-and-install.md` = cc-skills copy of
that contract (cite the help guide; do not fork rules). SKILL.md stays short and points at the
reference. No new ADR: this implements ADR-015/023 and 0121 Q1/Q2.

**Out.** Class SDK; `ScriptRunner` argv/async/external registration; auto-delete of skill-folder
scripts on refine; hook-path unification (H1 R6-B).
### Plan
- [x] Add `isPluginSkillPath` + `checkPluginSkillLayout` in `packages/core/src/operations/validate.ts`; call from `validate()` for `type === 'skill'`; recompute `valid`.
- [x] Tests in `packages/core/tests/operations/validate.test.ts`: plugin `scripts/` error, plugin `extensions/` error, standalone `scripts/` residual-proof negative, plugin skill without those dirs clean.
- [x] Rewrite help guide (authoring recipe, no class SDK, drop prefer-registry, `<feature>`, `.mjs`).
- [x] Update cc-skills: SKILL.md, scripts-and-install.md, skill-creation.md, workflows.md, best-practices.md, glossary.md, troubleshooting.md, quick-reference.md; light note on skill-patterns.md composable library.
- [x] Structure test: cc-skills `scripts-and-install.md` is path-first (standard before optional; no `bun plugins/` recipe).
- [x] Same-commit `docs/04_DESIGN.md` plugin-scripts paragraph: `<feature>` + validate `_layout` finding.
- [x] Fill Solution + Testing; run `bun test` on the touched files then `bun run lint`.
### Solution
Standard-contract authoring is now the default: plugin-level engines, path invocation, no class SDK. `skill validate` enforces the layout rule.

| File | What / why |
| --- | --- |
| `packages/core/src/operations/validate.ts:170` | `validate()` — after body-link checks, plugin skills run the layout gate and recompute `valid`. |
| `packages/core/src/operations/validate.ts:600` | `isPluginSkillPath` — `plugins/<plugin>/skills/<name>/SKILL.md` only. |
| `packages/core/src/operations/validate.ts:608` | `checkPluginSkillLayout` — error `_layout` on `scripts/` or `extensions/` dirs; standalone skills no-op. |
| `plugins/cc/skills/cc-skills/SKILL.md:221` | Dual-contract section: path-first recipe, no PluginScript class. |
| `apps/cli/src/commands/script-run.ts:47` | `ScriptRunner` unchanged — argv-less, synchronous, first-party-only (R4). |

Help guide, `scripts-and-install.md`, skill-creation, workflows, best-practices, glossary, troubleshooting, quick-reference, `docs/04_DESIGN.md` 2.9.1, `validate.test.ts`, and `structure.test.ts` were updated in the same change. Test and underscore paths are omitted from this table (L4 snake_case subject rule).
### Testing
**Pipeline verify results**

- Verdict: PASS (from verdict artifact)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| R1 | MET | Authoring recipe in the plugin-scripts help guide |
| R2 | MET | `plugins/cc/skills/cc-skills/SKILL.md:221` |
| R3 | MET | `packages/core/src/operations/validate.ts:170` |
| R4 | MET | `apps/cli/src/commands/script-run.ts:47` |

| Acceptance Criteria | Status | Evidence Type | Evidence |
|---------------------|--------|---------------|----------|
| R1 — help guide is standard-first | MET | command | `rg Authoring recipe docs/help/how_to_organize_scripts_for_plugin_development.md` exit 0 |
| R2 — cc-skills walks create/evaluate/refine through the recipe | MET | command | `rg Plugin-skill executable contract plugins/cc/skills/cc-skills/references/workflows.md` exit 0 |
| R3 — validate errors on plugin-skill scripts/ and extensions/ | MET | test | `packages/core/tests/operations/validate.test.ts:628` |
| R3 residual-proof — standalone skill-local scripts/ is allowed | MET | test | `packages/core/tests/operations/validate.test.ts:666` |
| R4 — no ScriptRunner expansion | MET | command | `git diff -- apps/cli/src/commands/script-run.ts` |
- Coverage: N/A (verdict-based; verify pipeline does not measure code coverage)
### Review
**Verdict: PASS**

Three-dimensional review (functional + SECUA + architecture). Coordinator merge of
`sp:super-reviewer` fragment (`01a039b7-de4c-7b42-b8da-df1d03f6d9da`) plus host join
validation. No P1/P2.

| # | Finding | Dim | Location | P | Disposition |
| --- | --- | --- | --- | --- | --- |
| 1 | `isPluginSkillPath` is separator-only; odd `..` spellings on a *file* argument can skip `_layout`. Directory CLI paths are safe (`join()` collapses). | C | `packages/core/src/operations/validate.ts:600` | P3 | Accept residual (Design is separator-only). |
| 2 | Composable-library example still shows `from helpers import` next to the path-first callout. | U | `plugins/cc/skills/cc-skills/references/skill-patterns.md:333` | P3 | Optional follow-up rewrite. |
| 3 | DESIGN invocation standard still uses `<file>.js`; convert + cc-skills teach `.mjs`. | U | `docs/04_DESIGN.md:124` | P4 | Optional polish. |
| 4 | `docs/help/bundled_plugin.md` still says `scripts/<skill>/` (out of 0122 file list). | U | `docs/help/bundled_plugin.md:51` | P4 | Follow-up doc sync. |
| 5 | skill-creation Step 5 lists `_layout` under evaluate (parenthetical names validate). | U | `plugins/cc/skills/cc-skills/references/skill-creation.md:242` | P4 | Accept; evaluate remains content-only. |

R1–R4 MET. Class SDK was not added. `ScriptRunner` diff is empty. `cc-hooks/examples/` is not a banned dir.

**Residual:** matcher is path-shape not inode identity; help guide has no structure lock (only `scripts-and-install.md`).
### References
- Feature: [H1 Portable plugin scripts](../features/H1_portable-plugin-scripts-via-install-time-staging.md)
- ADR-015 / ADR-023 / ADR-024: `docs/00_ADR.md`
- Help guide: `docs/help/how_to_organize_scripts_for_plugin_development.md`
- Prior task: [0121](0121_harden-script-convert-against-bun-globals-and-document-the-s.md) (ScriptRunner stays minimal)
- Canonical engine: `plugins/cc/scripts/anti-hallucination/`
### History
- 2026-08-25T07:08:12.642Z todo → wip (system)
- 2026-08-25T16:25:47.789Z wip → testing (system)
- 2026-08-25T16:25:56.362Z testing → done (system)
