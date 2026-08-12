---
template: standard
schema_version: 1
name: Portable plugin scripts runtime — absorb non-hook scripts into superskill script run dispatcher
description: ""
status: done
type: task
profile: standard
feature_id: H1
parent_wbs: null
priority: P2
tags: []
dependencies: ["0088","0089"]
created_at: 2026-07-17T04:13:41.653Z
updated_at: "2026-08-12T15:54:04.143Z"
---

## 0087. Portable plugin scripts runtime — absorb non-hook scripts into superskill script run dispatcher

### Background
**Current closure problem.** This WBS originally shipped the optional in-binary
`superskill script run cc validate-response` adapter. Its retained Solution, Testing, and Review
sections describe that completed first slice. H1 was then reopened around the broader install-staging
contract, so those as-built sections are historical evidence, not the specification for this pass.

The dependency work is complete:

- 0088 established the native-vs-rulesync delivery split; 0089 froze Entrypoint Contract v1.
- 0090 and 0091 shipped plugin-level script staging plus fail-closed `superskill script path` resolution.
- 0092–0095 shipped the guide, consumer migration, hook decision, and ADR-023/ADR-024 synchronization.
- The current tree also ships `superskill script convert`, `bun run build:scripts`, and the committed
  Node-runnable `plugins/cc/scripts/anti-hallucination/validate_response.mjs` twin.

The remaining defect is contract drift in anti-hallucination consumer documentation. ADR-023,
`docs/04_DESIGN.md`, and H1 define staged `script path` invocation as the standard for non-hook callers
and `script run` as optional. `plugins/cc/skills/anti-hallucination/SKILL.md`,
`references/non-hook-enforcement.md`, `references/guard-implementation.md`, and `plugins/cc/README.md`
currently reverse that ordering for `validate-response` by calling the registry primary/preferred.

This refinement turns 0087 into the H1 closure task: repair that documented contract, preserve the
already-shipped runtime, add one regression check for the ordering, and verify all four H1 scenarios.
The original task title remains for WBS/history continuity because `spur task update` does not expose a
title mutation.
### Requirements
- [x] R1. **Preserve shipped runtime behavior.** Do not change `script run`, `script path`, `script convert`,
  install staging, hook emitters, validator semantics, or exit codes unless a named verification command
  proves current behavior violates H1.
- [x] R2. **Restore the authoritative invocation order.** In anti-hallucination consumer docs, present
  `node "$(superskill script path cc anti-hallucination/validate_response.mjs)"` as the standard/primary
  non-hook form and `superskill script run cc validate-response` as the optional registry form, matching
  ADR-023, `docs/04_DESIGN.md`, and H1.
- [x] R3. **Remove contradictory prose.** Eliminate claims that the registry is preferred, that the staged
  twin is merely secondary, or that install targets still lack a portable validator. Keep the separate Spur
  Phase 4 workflow marked pending; that cross-repo orchestration gap is not part of H1.
- [x] R4. **Lock the documentation contract.** Extend `plugins/cc/tests/structure.test.ts` with one focused
  regression check proving the non-hook guide labels staged-path invocation as standard and registry
  invocation as optional, and contains no repo-relative `bun plugins/cc/scripts` recipe.
- [x] R5. **Verify the existing delivery chain.** Run the focused structure, script-path, script-convert,
  portable-twin, mapper, and install-staging tests; run `spur feature check H1 --json` and clear all four
  uncovered-feature-scenario findings through this task's exact AC titles.
- [x] R6. **Synchronize user-facing prose only where drift exists.** Reconcile the anti-hallucination
  `SKILL.md`, `non-hook-enforcement.md`, `guard-implementation.md`, plugin README, and CHANGELOG entry.
  Do not edit authoritative numbered docs when they already state the correct contract.
- [x] R7. **Non-goals.** No new command, registry, converter, package, dependency, hook-path rewrite,
  workspace boundary, or general third-party script discovery.
### Acceptance Criteria
- [x] Scenario: Install stages plugin-level scripts for rulesync-class targets.
  - Given the existing mapper and install-staging implementation
  - When the focused mapper and install integration tests run
  - Then plugin scripts land under the shared agents scripts root for rulesync/Hermes targets while native-only installs avoid a duplicate staged tree

- [x] Scenario: The script path helper resolves staged entrypoints fail-closed.
  - Given project and global staged roots plus invalid or missing paths
  - When the script-path tests run
  - Then project wins over global, found returns 0, missing returns 2, and unsafe relative paths are rejected

- [x] Scenario: Docs teach the dual contract with no repo-relative bun paths.
  - Given ADR-023 and H1 define staged path as standard and registry dispatch as optional
  - When the anti-hallucination docs and README are inspected by the structure regression
  - Then staged `validate_response.mjs` invocation appears as standard/primary, `script run` is optional, and no install recipe invokes repo-relative TypeScript through Bun

- [x] Scenario: Hooks keep the hook run invocation form without CLAUDE_PLUGIN_ROOT regression.
  - Given task 0094 fixed hooks on the dispatcher form
  - When the canonical hooks and existing hook structure tests are inspected
  - Then `superskill hook run cc anti-hallucination` remains unchanged and no Claude-only plugin-root path is introduced
### Q&A
| Topic | Decision | Reason |
|---|---|---|
| Reopened scope | H1 contract-closure repair, not a second runtime implementation | All runtime surfaces named by H1 already exist and have focused tests |
| Invocation precedence | Staged `script path` is standard; in-binary `script run` remains optional | ADR-023 is binding and H1 repeats the same contract |
| Phase 4 workflow | Keep marked pending and out of scope | It is a separate Spur data-threading/orchestration concern, not plugin-script delivery |
| Hook invocation | Keep `superskill hook run` unchanged | Task 0094 narrowed unification to delivery; ADR-020 skew behavior must remain intact |
| Historical sections | Leave Solution/Testing/Review for the implement/verify pipeline to replace | Refine owns planning sections; those sections record the completed first slice |
| Task title | Preserve | The supported task CLI has no title-edit surface; Background records the scope evolution |
### Design
**Shape: documentation contract repair plus one structural regression test. No new API.**

**Authority and precedence**

1. `docs/00_ADR.md` ADR-023 is binding: staged path is the invocation standard for skill docs and
   other non-hook callers; registry absorption is optional.
2. `docs/04_DESIGN.md` and H1 already derive that decision correctly.
3. Consumer docs must be changed to match those sources; do not weaken the sources to fit the drift.

**Files and exact changes**

- `plugins/cc/skills/anti-hallucination/SKILL.md`: make direct validation staged-path first and label
  registry dispatch optional; keep the pending Spur workflow ordering intact.
- `plugins/cc/skills/anti-hallucination/references/non-hook-enforcement.md`: invert the current
  primary/secondary presentation, examples, and Design Rule; preserve identical input and exit-code
  semantics for both adapters.
- `plugins/cc/skills/anti-hallucination/references/guard-implementation.md`: describe staged path as
  standard for platforms without hooks and registry dispatch as optional.
- `plugins/cc/README.md`: align the validator row with ADR-023 without changing the hook row.
- `plugins/cc/tests/structure.test.ts`: add one content invariant scoped to the non-hook guide. Assert
  the standard/optional labels and reject the repo-relative Bun recipe; do not snapshot whole prose.
- `CHANGELOG.md`: record the consumer-doc contract correction under Unreleased.

**Existing runtime reused as-is**

- Staging: `packages/core/src/mapper.ts` and `apps/cli/src/commands/install.ts`.
- Resolution: `apps/cli/src/commands/script-path.ts`.
- Portable build: `apps/cli/src/commands/script-convert.ts`, root `build:scripts`, and committed
  `validate_response.mjs`.
- Optional registry: `apps/cli/src/commands/script-run.ts`.
- Hooks: `apps/cli/src/commands/hook-run.ts` plus `plugins/cc/hooks/hooks.json`.

**Dependency and handoff contract**

0088 supplies target-delivery facts; 0089 supplies runtime/exit-code constraints. The implementation
must not re-own or revise those decisions. Tasks 0090–0095 are completed sibling outputs to verify,
not code to rebuild. This task leaves H1 with all feature scenarios traceable and no implementation
follow-up unless a focused test exposes a concrete runtime defect.

**Anti-patterns**

- Do not add another script runner, converter, staging root, or target-specific emitter.
- Do not make `script run` mandatory or remove it; it remains the optional zero-filesystem adapter.
- Do not rewrite hooks to staged paths or introduce `${CLAUDE_PLUGIN_ROOT}`.
- Do not encode the regression as a brittle full-document snapshot or line-number assertion.
- Do not edit generated `validate_response.mjs` by hand; `build:scripts` owns it.
### Plan
1. [x] Re-read ADR-023, H1, and the four consumer docs; list only statements that reverse the standard/optional order or teach a repo-relative Bun install recipe. (R2, R3)
2. [x] Update the anti-hallucination `SKILL.md`, `non-hook-enforcement.md`, `guard-implementation.md`, and plugin README so staged `validate_response.mjs` is standard/primary and `script run` is optional; preserve Phase 4 and hook semantics. (R2, R3, R6)
3. [x] Add the narrow contract regression to `plugins/cc/tests/structure.test.ts` and an Unreleased CHANGELOG note. (R4, R6)
4. [x] Run focused tests: plugin structure; script-path; script-convert; validate-response twin; mapper plugin-script staging; install integration script-staging cases. Repair runtime code only if a named failure proves drift. (R1, R5)
5. [x] Run `spur feature check H1 --json`; confirm the four exact task AC titles cover all H1 scenarios and resolve any remaining traceability warning without changing feature scenario identity. (R5)
6. [x] Run project gates required by AGENTS.md: `bun run lint`, `bun run test`, `bun run build`, and `bun run spur-check`. (R5)
7. [x] Replace the historical Solution/Testing/Review through the normal implement/verify pipeline with current file:line evidence, then advance the task through lifecycle guards. (R1–R7)
### Solution
**Contract repair — ADR-023 invocation order restored in anti-hallucination consumer docs (R2, R3, R6).** The four consumer docs reversed ADR-023's standard/optional ordering (calling the registry primary/preferred and the staged twin secondary). Each now presents the staged `node "$(superskill script path cc anti-hallucination/validate_response.mjs)"` form as the standard non-hook invocation and `superskill script run cc validate-response` as the optional registry form:

- `plugins/cc/skills/anti-hallucination/SKILL.md:222` — "Platforms Without Hooks" direct-validation item re-labeled: staged-path command first as **standard**, `script run` demoted to **optional** (registry form). The Phase 4 pending workflow (item 1) and the `script path` standard + `script run` optional summary at `plugins/cc/skills/anti-hallucination/SKILL.md:238` were already correct and are unchanged.
- `plugins/cc/skills/anti-hallucination/references/non-hook-enforcement.md:9-29` — guide intro inverted: staged path introduced as **standard** (install-time staging + `script path` resolution, citing ADR-023), registry as **Optional (registry)**. Removed the registry-boosting claims ("recommended recipe", "not the preferred way to reach this engine") and the staged-twin demotion ("only useful if you specifically need an FS entrypoint"). Both adapters still share the same engine, exit codes, and input modes.
- `plugins/cc/skills/anti-hallucination/references/non-hook-enforcement.md:61-86` — Host-Side Validation and Pipe-Final-Output example pairs reordered: staged-path command is the "Standard form", `script run` the "Optional form"; identical `RESPONSE_TEXT`/stdin semantics preserved.
- `plugins/cc/skills/anti-hallucination/references/non-hook-enforcement.md:106-111` — Cross-Agent Enforcement "Until Phase 4 lands" guidance now leads with the staged path and labels `script run` optional; the workflow itself stays marked pending (blocked on Spur `agent.run` output capture, ADR-015) per R3.
- `plugins/cc/skills/anti-hallucination/references/non-hook-enforcement.md:118-119` and `:136-138` — Reviewer Workflow and Structured Output validation commands reordered staged-path-first with the registry as the optional alternative.
- `plugins/cc/skills/anti-hallucination/references/non-hook-enforcement.md:145` — Design Rule now reads **standard**: staged path; **optional**: `script run`, mirroring ADR-023's vocabulary.
- `plugins/cc/skills/anti-hallucination/references/guard-implementation.md:63` — no-hook-platforms paragraph now presents the staged `.mjs` twin as the standard form and `superskill script run cc validate-response` as the optional registry form; the hook configuration section (portable `superskill hook run` command, `minCliVersion` floor) is untouched.
- `plugins/cc/README.md:146` — `validate_response.ts` row re-labeled: **Standard install-target form** is the staged `node "$(superskill script path cc anti-hallucination/validate_response.mjs)"` twin; **Optional (registry)** is `superskill script run cc validate-response`. The hook row (`plugins/cc/README.md:135`, `:308`) is unchanged per the task constraint.

**Regression lock (R4).** `plugins/cc/tests/structure.test.ts:242-258` adds one focused content invariant scoped to the non-hook guide: asserts both invocation commands appear, the guide carries `**standard**`/`**optional**` labels, the staged path is presented before the registry (content order, not line numbers), and no repo-relative `bun plugins/cc/scripts` recipe exists. No whole-doc snapshot, no line-number assertion.

**CHANGELOG (R6).** `CHANGELOG.md:7-13` — new `## Unreleased` → `### Documentation` entry recording the consumer-doc contract correction, the regression test, and that runtime behavior is untouched.

**Authoritative docs untouched (R6).** `docs/00_ADR.md` (ADR-023) and `docs/04_DESIGN.md` already state the correct contract (staged path standard, registry optional); neither was edited.

**Runtime untouched (R1).** No command, registry, converter, hook-path, or exit-code change; no new dependency. The named focused suites pass without any runtime modification — the drift was documentation-only.

**Verification (R5).**
- `bun test plugins/cc/tests/structure.test.ts` — 14 pass / 0 fail (includes the new ADR-023 regression).
- `bun test apps/cli/tests/commands/script-path.test.ts apps/cli/tests/commands/script-convert.test.ts apps/cli/tests/commands/validate-response-twin.test.ts packages/core/tests/mapper.test.ts` — 63 pass / 0 fail.
- `bun test apps/cli/tests/commands/install.integration.test.ts --test-name-pattern "scripts"` — 7 pass / 0 fail (script-staging cases).
- `spur feature check H1 --json` — pass: true. The four `L4.scenario-unverified` warnings each name exactly this task's four AC titles (Install stages… / The script path helper… / Docs teach the dual contract… / Hooks keep the hook run invocation form…) and clear when the pipeline verify hop records task 0087's PASS verdict. The 4× `L2.disallowed-section` warnings are pre-existing feature-file template-conformance findings (Destination / Decisions so far / Not yet specified / Out of scope), not traceability gaps; the feature file was left unchanged per task scope.
### Testing
**Re-verify (force, 2026-08-12):** independent re-audit of done task 0087 (H1 contract-closure). Scope = consumer docs + structure regression + CHANGELOG; runtime paths empty this run.

**Per-Requirement Traceability**

| Req | Status | Evidence |
| --- | --- | --- |
| R1 | MET | `git diff --name-only -- apps/cli/src packages/core/src plugins/cc/scripts plugins/cc/hooks` → empty this run. Deliverable scope limited to 4 consumer docs + `plugins/cc/tests/structure.test.ts` + `CHANGELOG.md` + task file. |
| R2 | MET | `plugins/cc/skills/anti-hallucination/SKILL.md:222` (standard staged path, optional registry); `plugins/cc/skills/anti-hallucination/references/non-hook-enforcement.md:9-28` (intro order), `:62-86` (usage pairs), `:145` (Design Rule); `plugins/cc/skills/anti-hallucination/references/guard-implementation.md:63`; `plugins/cc/README.md:146` (validator row). Matches ADR-023 dual contract. |
| R3 | MET | `rg` residual for preferred/recommended-recipe/secondary registry claims → none in the four consumer docs. Phase 4 remains pending (`plugins/cc/skills/anti-hallucination/references/non-hook-enforcement.md:89-107`, `plugins/cc/skills/anti-hallucination/SKILL.md:221`). Dev-repo bun warning (`plugins/cc/skills/anti-hallucination/references/non-hook-enforcement.md:33-36`) is a negative contrast, not a primary recipe. |
| R4 | MET | `plugins/cc/tests/structure.test.ts:242-258` content invariant: both forms present, `**standard**`/`**optional**` labels, staged path indexOf precedes registry, rejects `/bun\s+plugins\/cc\/scripts/`. No full-doc snapshot. Re-ran this hop: 14 pass / 0 fail. |
| R5 | MET | This run: `bun test plugins/cc/tests/structure.test.ts` → 14/0; `bun test apps/cli/tests/commands/script-path.test.ts apps/cli/tests/commands/validate-response-twin.test.ts` → 24/0; `bun test apps/cli/tests/commands/script-convert.test.ts` → 10/0; `bun test packages/core/tests/mapper.test.ts --test-name-pattern script` → 2/0 (27 filtered); `bun test apps/cli/tests/commands/install.integration.test.ts --test-name-pattern scripts` → 7/0 (27 filtered). `spur feature check H1 --json` → pass true after verdict ids matched feature scenario titles (trailing periods); L4 empty. |
| R6 | MET | `CHANGELOG.md:7-11` Unreleased Documentation entry records contract correction + regression lock + R1. Four consumer docs synced. Authoritative numbered docs not edited by this deliverable (runtime/ADR sources already correct). |
| R7 | MET | No new command/registry/converter/package/dependency/hook rewrite/workspace boundary/discovery in the 0087 deliverable set. |

**Acceptance Criteria Verification**

| AC | Status | Evidence Type | Evidence |
| --- | --- | --- | --- |
| Scenario: Install stages plugin-level scripts for rulesync-class targets. | MET | test | `bun test apps/cli/tests/commands/install.integration.test.ts --test-name-pattern scripts` → 7 pass / 27 filtered / 0 fail (exit 0 this run); mapper script cases `bun test packages/core/tests/mapper.test.ts --test-name-pattern script` → 2 pass |
| Scenario: The script path helper resolves staged entrypoints fail-closed. | MET | test | `bun test apps/cli/tests/commands/script-path.test.ts` (part of 24-pass twin suite this run). Contract anchors re-read: `apps/cli/src/commands/script-path.ts:58-66` unsafe-rel reject; `:109-133` project-before-global; `:150` usage exit 1; `:174-184` missing exit 2; `:190` found exit 0 |
| Scenario: Docs teach the dual contract with no repo-relative bun paths. | MET | test | `plugins/cc/tests/structure.test.ts:242-258` green (14/0 structure suite). `rg` for `bun plugins/cc/scripts` under anti-hallucination + README → zero hits this run |
| Scenario: Hooks keep the hook run invocation form without CLAUDE_PLUGIN_ROOT regression. | MET | command | `plugins/cc/hooks/hooks.json:10` = `superskill hook run cc anti-hallucination`; `rg -c CLAUDE_PLUGIN_ROOT plugins/cc/hooks/hooks.json` → 0; hooks.json not in 0087 diff |

**Design conformance:** all Design claims DONE (SKILL re-label, guide inversion + examples + Design Rule, guard-implementation paragraph, README validator row, structure invariant, CHANGELOG). Anti-patterns respected (no new runner, no snapshot, no hook rewrite, generated `.mjs` untouched, `script run` remains optional).

**SECUA (focus=all):** no P1–P3 findings. P4 advisory only: structure regex is case-sensitive substring for bun recipes — no residual recipes exist today; not a blocker.

**Coverage:** N/A (documentation + structure-contract change; no new runtime code path).

**Commands this run (exit 0):** structure 14/0; script-path+twin 24/0; script-convert 10/0; mapper script 2/0; install scripts 7/0; `spur feature check H1` pass (L4 empty after AC id period fix); `spur task check 0087 --strict-core` PASS.

**Fix-pass note (`--fix all`):** repaired verdict AC/requirement row ids so feature scenario titles match exactly (trailing `.`); artifacts rewritten at `.spur/run/0087-verdict.json` and `.spur/run/0087-verify-answer.txt`.
### Review
**Findings (dev-review hop, 2026-08-12):**

| Priority | Location | Finding |
|---|---|---|
| P1 | — | None. |
| P2 | — | None. |
| P3 | — | None. |
| P4 | `plugins/cc/tests/structure.test.ts:258` | Hardening nit: `expect(guide).not.toMatch(/bun\s+plugins\/cc\/scripts/)` is a case-sensitive substring anchor — it would miss a hypothetical `bun ./plugins/cc/scripts/...` (leading `./`) or capitalized `Bun plugins/cc/scripts/...` recipe. No such recipe exists today (verified by grep across `plugins/cc/skills/anti-hallucination/` and `plugins/cc/README.md`); tighten to `/(?:bun|Bun)\s+\.?\/?plugins\/cc\/scripts/` only if future doc churn makes it worth it. |

**Per-requirement traceability (review pass):**

| Req | Status | Evidence |
|---|---|---|
| R1 | MET | `git diff --name-only -- apps/cli/src packages/core/src plugins/cc/scripts plugins/cc/hooks` → empty this run. Runtime untouched; only consumer docs + one structure test + CHANGELOG changed. |
| R2 | MET | `plugins/cc/skills/anti-hallucination/SKILL.md:222` (direct-validation item: **standard** staged path first, **optional** registry); `references/non-hook-enforcement.md:9-29` (intro inversion), `:61-86` (host-side/pipe example pairs), `:100-111` (cross-agent guidance), `:134-145` (reviewer, structured output, Design Rule); `references/guard-implementation.md:63`; `plugins/cc/README.md:146` (validator row re-labeled; hook row `:135` unchanged). Ordering matches ADR-023 and `docs/04_DESIGN.md`. |
| R3 | MET | Registry-boosting claims removed in `non-hook-enforcement.md` diff ("recommended recipe", "not the preferred way to reach this engine", "only useful if you specifically need an FS entrypoint"); staged-twin demotion gone. Phase 4 workflow still marked pending (`non-hook-enforcement.md:84-108`, `SKILL.md:221`). Grep for residual primary/preferred/recommended/secondary claims in the four consumer docs finds only unrelated usages (tool-selection table `SKILL.md:113`, research table `anti-hallucination-research.md:186`, dev-repo warning `non-hook-enforcement.md:36` which cautions against bun-of-source, not the registry). |
| R4 | MET | `plugins/cc/tests/structure.test.ts:242-258` — one content-invariant regression: both commands present, `**standard**`/`**optional**` labels, staged path precedes registry (content order via `indexOf`, not line numbers), no repo-relative `bun plugins/cc/scripts` recipe. No snapshot, no line-number assertion. Re-ran this hop: 14 pass / 0 fail. |
| R5 | MET | Testing-section evidence re-verified this run: `bun test plugins/cc/tests/structure.test.ts` → 14 pass / 0 fail (559 expect); `bun test apps/cli/tests/commands/script-path.test.ts apps/cli/tests/commands/validate-response-twin.test.ts` → 24 pass / 0 fail; `bun test apps/cli/tests/commands/install.integration.test.ts --test-name-pattern "scripts"` → 7 pass / 27 filtered. `spur feature check H1 --json` → 4× `L4.scenario-unverified` warnings, each naming exactly this task's four AC titles (clear once the verify hop records the PASS verdict); 4× `L2.disallowed-section` are pre-existing template findings, feature file untouched. |
| R6 | MET | `CHANGELOG.md:7-13` — `## Unreleased` → `### Documentation` entry recording the contract correction, the regression lock, and R1 (runtime untouched). Four consumer docs synced. Authoritative docs not edited by this task: `docs/00_ADR.md` ADR-023 and `docs/04_DESIGN.md` working-tree modifications are unrelated session dirt, not 0087 changes. |
| R7 | MET | Diff scope = 4 consumer docs + `structure.test.ts` (+19) + `CHANGELOG.md` (+4) + task file. No new command, registry, converter, package, dependency, hook-path rewrite, workspace boundary, or script discovery. |

**Acceptance criteria traceability:**

| AC | Status | Evidence |
|---|---|---|
| AC1 — Install stages plugin-level scripts for rulesync-class targets | MET | `apps/cli/tests/commands/install.integration.test.ts` script-staging cases — 7 pass / 27 filtered (re-run this hop): plugin scripts land under shared agents scripts root for rulesync/Hermes; native-only installs avoid duplicate staged tree. Runtime unchanged (`install.ts`, `packages/core/src/mapper.ts` not in diff). |
| AC2 — script path resolves staged entrypoints fail-closed | MET | `apps/cli/tests/commands/script-path.test.ts` (24 pass with twin suite, re-run). Code confirms contract: project root searched before global (`apps/cli/src/commands/script-path.ts:109-133`), `..`/absolute/empty rel rejected (`:58-66`), found → exit 0 (`:190`), missing → exit 2 (`:174-184`), unsafe rel → exit 1 (`:150`). |
| AC3 — Docs teach the dual contract with no repo-relative bun paths | MET | New regression `plugins/cc/tests/structure.test.ts:242-258` green (14/0 this hop): staged path standard, registry optional, ordering asserted, `/bun\s+plugins\/cc\/scripts/` rejected. Doc state re-read this hop confirms all four consumer docs carry the inverted labels. |
| AC4 — Hooks keep the hook run invocation form without CLAUDE_PLUGIN_ROOT regression | MET | `plugins/cc/hooks/hooks.json` — `supershell hook run cc anti-hallucination` unchanged, 0× `CLAUDE_PLUGIN_ROOT` occurrences (grep this hop). `plugins/cc/tests/structure.test.ts:127` hooks.json `minCliVersion` floor green. `guard-implementation.md:56-59` and `README.md:135,384` mention `${CLAUDE_PLUGIN_ROOT}` only as pre-existing negative contrasts (rejecting plugin-root script paths), not as an invocation; none introduced by this diff. |

**SECUA notes:** Security — no new code; all doc claims cross-checked: `package.json:23` (`build:scripts` = `script convert cc anti-hallucination/validate_response.ts`), twin exists at `plugins/cc/scripts/anti-hallucination/validate_response.mjs`, exit-code claims match `script-path.ts`. Correctness — regression is content-based, no brittle line-number/snapshot assertions; ordering assertion is first-occurrence `indexOf`, robust to later section reordering of examples (intro remains the canonical teaching spot). Usability — labels and examples are consistent across all four docs ("Standard form (staged path)" / "Optional form (registry)"); the "Dev-repo only" warning (`non-hook-enforcement.md:33-36`) correctly distinguishes repo-checkout bun from install-target forms. Architecture — docs-only footprint; regression scoped to the guide file it protects, matching sibling tests in the same file (`:232-240`); no seam/coupling impact. Design conformance: every Design-section change is implemented exactly (SKILL re-label, guide inversion + examples + Design Rule, guard-implementation paragraph, README validator row, content invariant, CHANGELOG entry); anti-patterns respected (no new runner, no snapshot, no hook rewrite, generated `.mjs` untouched, `script run` remains optional).

**Verdict:** PASS
### References
**Authority**

- `docs/00_ADR.md` — ADR-023 (staged-path standard, registry optional), ADR-024 (dispatcher deep-import scope)
- `docs/04_DESIGN.md` — plugin-script delivery and invocation surface
- `docs/features/H1_portable-plugin-scripts-via-install-time-staging.md` — four feature scenarios and locked scope

**Completed prerequisite work**

- Task 0088 — target delivery inventory
- Task 0089 — Entrypoint Contract v1
- Tasks 0090–0095 — staging, path helper, guide, consumer migration, hook decision, ADR synchronization

**Current implementation and checks**

- `packages/core/src/mapper.ts`
- `apps/cli/src/commands/install.ts`
- `apps/cli/src/commands/script-path.ts`
- `apps/cli/src/commands/script-convert.ts`
- `apps/cli/src/commands/script-run.ts`
- `plugins/cc/scripts/anti-hallucination/validate_response.ts`
- `plugins/cc/scripts/anti-hallucination/validate_response.mjs`
- `plugins/cc/tests/structure.test.ts`
- `apps/cli/tests/commands/script-path.test.ts`
- `apps/cli/tests/commands/script-convert.test.ts`
- `apps/cli/tests/commands/validate-response-twin.test.ts`
- `packages/core/tests/mapper.test.ts`
- `apps/cli/tests/commands/install.integration.test.ts`
### History
- 2026-07-17T04:25:54.254Z backlog → todo (system)
- 2026-07-17T04:25:54.369Z todo → wip (system)
- 2026-07-17T05:05:10.507Z wip → testing (system)
- 2026-07-17T05:05:10.742Z testing → done (system)
- 2026-07-17T06:13:51.505Z done → wip (system)
- 2026-07-17T06:14:42.379Z wip → blocked (system)
- 2026-08-12T14:42:08.021Z blocked → todo (system)
- 2026-08-12T14:48:09.827Z todo → wip (system)
- 2026-08-12T14:49:01.469Z wip → testing (system)
- 2026-08-12T15:01:38.553Z testing → done (system)
