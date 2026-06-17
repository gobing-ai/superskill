---
name: "Phase 1 & 2 review findings remediation"
description: "Phase 1 & 2 review findings remediation"
status: Done
created_at: 2026-06-16T23:58:10.492Z
updated_at: 2026-06-17T00:33:32.069Z
folder: docs/tasks
type: task
feature-id: ""
priority: high
tags: ["review","remediation","phase1","phase2","bugfix"]
preset: complex
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0016. "Phase 1 & 2 review findings remediation"

### Background

#### Code Review: superskill — Phase 1 & Phase 2
  Verification gate: all green. bun run lint clean, bun run test 443 pass / 0 fail, typecheck passes, coverage ~95%+ line/function. The implementation is substantially
  complete and well-structured. Both phases' command surfaces, modules, and data flows match the design docs' code-layout sections almost exactly.

  That said, there are real correctness gaps — most notably one that the test suite masks rather than catches. Findings ranked by severity.

  🔴 Critical

##### C1 — evolve auto-generated changes can never be applied (silent no-op)

  Files: operations/evolve.ts:117-138 (generateChanges) vs :379-418 (stepApply)

  generateChanges emits every change as:
  location: `dimension:${trend.dimension}`,   // e.g. "dimension:clarity"
  current:  `Score: ${trend.latest.toFixed(2)}`,  // e.g. "Score: 0.55"
  But stepApply only knows two location forms: frontmatter.<key> → frontmatter edit, everything else → locate change.current as literal text in the file. "Score: 0.55"
  never exists in the content, so every self-generated change hits the !content.includes(change.current) branch and is skipped with a warning. The default interactive
  evolve flow applies zero changes by construction, regardless of what the user accepts.

  The "applies changes" test (evolve.test.ts:342) passes only because it injects hand-crafted proposal JSON with frontmatter.description + real body text, bypassing
  generateChanges entirely. So the generator and the applier have never been tested end-to-end together. This violates R8 (the test encodes the wrong intent) and the
  Phase 2 acceptance criterion "Content updated in place."

  Effort: M (0.5–1 day). Either make generateChanges emit applicable frontmatter.<key>/real-text changes, or have stepApply understand dimension: locations. The honest
  fix requires deciding what an auto-proposal actually mutates (the dimensions are heuristic scores, not file locations) — likely the proposals should target concrete
  frontmatter fields, which is a design clarification, not just code.

  🟠 High

##### H1 — --accept <id> / --reject <id> use the SQLite rowid, not proposal_id

  Files: operations/evolve.ts:521,533; helpers.ts:26-27

  The design (phase2 §2.5) and the written proposal file both use proposal_id: agent-evolve-2026-06-16-001. But accept/reject match on String(p.id) — the integer
  autoincrement PK. A user reading the proposal file sees agent-evolve-2026-06-16-001 and runs --accept agent-evolve-2026-06-16-001, which silently finds nothing (reject)
  or errors (accept). The proposal_id string isn't even persisted to a column; it only lives in the .md file. UX-breaking inconsistency for the headline Phase 2 feature.
  Effort: S (2–4h). Persist proposal_id (add to proposal_json or a column) and match against it, or document that the ID is the DB rowid and surface it in output.

##### H2 — Agent completeness scores against agentType, which no schema/template requires consistently

  Files: quality/agent.ts:19-25 vs operations/validate.ts:55-62 (FIELD_TYPES.agent) and dimensions.ts:62 (REQUIRED_FIELDS.agent)

  evaluateAgent.scoreCompleteness penalizes any agent missing agentType (factor 0.3) and lists it as "Missing." But validate's agent schema knows nothing about agentType
  (it knows tools, model, platforms), and REQUIRED_FIELDS.agent is [name, description, model]. The scaffold template does emit agentType: task, so freshly scaffolded
  agents pass, but any real-world Claude Code subagent (which uses name/description/tools/model, never agentType) is unfairly marked incomplete and capped at ~0.65
  completeness. The three modules disagree on what an agent is — violates R6 (conflicting patterns blended). platforms is in the validate schema but unused by the
  evaluator; agentType is the reverse.
  Effort: S (2–4h). Pick one field set. agentType isn't a standard Claude Code subagent field — recommend dropping it from the evaluator and template, scoring tools/model
  instead.

##### H3 — refine re-classifies dimension notes as error and feeds them to auto-fix that can't fix them

  File: operations/refine.ts:296-305

  Every evaluate dimension with score < 0.7 is converted to a synthetic Finding{ severity: 'error' }, then classifyFix maps error → auto-apply, then generateAutoChange is
  called. But generateAutoChange only handles findings whose message contains "missing"/"must be an array"/"must be a string" — dimension notes like "3 trigger phrases
  found" or "Body length: 1200 chars" match none, so they return null and get skipped. Net effect: refine reports a long list of "fixes" it attempts but the
  dimension-derived ones are all no-ops. Not as severe as C1 (structural validate findings DO get fixed), but the dimension→error→auto-apply path is dead weight that
  inflates the skipped list and confuses the delta. Borderline R12 (reports work that didn't happen).
  Effort: S (3–5h). Either don't synthesize fixable findings from dimension notes (leave them as suggest/flag informational), or wire real fixes.

  🟡 Medium

##### M1 — --global defaults to true but Commander can't express "default true, settable false"

  File: commands/install.ts:37,42

  .option('--global', '...', true) makes global always truthy; there's no --no-global registered, so --global false (shown in the design's own example, phase1 §2.1:
  superskill install wt --global false) is parsed as a positional, not a flag value. options.global !== false will never be false from the CLI. Project-level install is
  unreachable via the documented flag.
  Effort: S (1–2h). Use .option('--no-global', ...) or --global [bool] with explicit parsing.

##### M2 — omp/hermes receive mapped-canonical skills, not rulesync-generated Pi output

  File: commands/install.ts:172-184

  Design (phase1 §2.3 Step 4) says omp should get generated Pi output (omp shares Pi's format). But omp/hermes are excluded from rulesyncTargets (line 130) and their copy
  reads the prepared .rulesync/skills (mapper output + pipeline transforms), not Pi's rulesync-generated tree. For skills the difference is small (skills are mostly
  format-stable); for subagents omp does get convertToPiSubagent via the pipeline, so it's partially correct. Still a deviation from "copy generated Pi output."
  Effort: M (0.5 day). Run rulesync for pi once when omp is requested and copy from its output, or document the simplification in an ADR.

##### M3 — marketplace.ts ../ rejection message is unreachable / order bug

  File: marketplace.ts:104-113

  Line 104 allows sources starting with ./ or ../, then line 111 rejects any source containing ... So a ../-source reaches the "escapes the marketplace root" message
  (correct outcome), but the startsWith('../') allowance on line 104 is dead — and a source like ./a/../b (legitimate-ish) is also rejected by the blanket includes('..').
  Minor: the logic works but is tangled and the ../ allow-branch is misleading.
  Effort: S (1h). Drop ../ from the allow check; keep the includes('..') guard.

##### M4 — bin points to a build artifact (./superskill) that doesn't exist in-repo

  File: apps/cli/package.json:5-6

  bin.superskill = "./superskill" but there's no superskill file — it's produced by bun build --compile into ../../dist/cli/superskill, not apps/cli/superskill. bun
  link/npm i -g from the package as-is would install a broken symlink. The design (phase1 §3 / AGENTS.md) expects bin to point at ./src/index.ts (dev) or ./dist/index.js
  (shipped). Current value matches neither and the files array lists superskill which isn't generated at that path.
  Effort: S (1–2h). Point bin at src/index.ts for Bun, or fix the build outfile to land at apps/cli/superskill and document the Node story.

  🟢 Low / Nitpick

##### - L1 — quality/magent.ts:89-90 parses frontmatter twice (parseFrontmatterSafe called back-to-back). Harmless, slight waste. Effort: trivial.
##### - L2 — quality/command.ts:100 scoreSlashSyntax never validates slash dialect per target (the dimension's stated purpose, phase2 §3); it only checks a /word pattern
  exists. The target is available but unused. Functional gap vs spec intent. Effort: S.
##### - L3 — validate.ts link validity checks skill:/agent:/command: reference format but the design (phase2 §2.2 "Link validity: References resolve") implies checking they
  actually resolve on disk. Current impl is format-only. Effort: M if real resolution wanted.
##### - L4 — config.ts:16 targets: z.array(z.string() as z.ZodType<Target>) casts away validation — unknown target strings in superskill.jsonc pass schema validation and only
  fail later. Design specified z.array(z.enum(TARGETS)). Effort: S.
##### - L5 — Phase 1 deferred commands (list, doctor, init) correctly absent — matches "deferred." Not a defect; noted for completeness.
##### - L6 — evolve.ts:258 proposalRecord.created_at is set to evaluations[0].created_at instead of the new row's actual created timestamp. The record is returned but unused
  downstream, so cosmetic. Effort: trivial.

### Requirements

Fix the 14 findings from the comprehensive Phase 1 & Phase 2 code review. C1 and H1 are must-fix before Phase 2 can be considered done. Each fix must include a regression test that exercises the real seam (not a fixture that bypasses the broken code path).

1. **C1** — Fix `evolve.ts` auto-generated changes that can never be applied (silent no-op). Either make `generateChanges` emit applicable `frontmatter.<key>` / real-text body changes, or have `stepApply` understand `dimension:` locations. Requires design clarification on what auto-proposals actually mutate (the dimensions are heuristic scores, not file locations).
2. **H1** — Fix `--accept <id>` / `--reject <id>` to use `proposal_id` instead of SQLite `rowid`. Persist `proposal_id` (add to `proposal_json` or a column) and match against it, or surface the DB `rowid` in CLI output so users can reference it.
3. **H2** — Fix agent completeness scoring inconsistency across `quality/agent.ts`, `operations/validate.ts`, and `dimensions.ts`. Drop `agentType` from evaluator and template; score `tools`/`model` instead. Align `FIELD_TYPES`, `REQUIRED_FIELDS`, and `scoreCompleteness` on one field set.
4. **H3** — Fix `refine.ts` dimension-notes-as-errors dead-weight path. Either stop synthesizing fixable findings from dimension notes (leave them as `suggest`/`flag` informational), or wire real fixes for dimension-derived findings.
5. **M1** — Fix `--global` flag parsing in `commands/install.ts`. Use `.option('--no-global', ...)` or `--global [bool]` with explicit parsing so project-level install is reachable.
6. **M2** — Fix `omp`/`hermes` install path to receive rulesync-generated Pi output instead of mapped-canonical skills (or document the simplification in an ADR).
7. **M3** — Fix `marketplace.ts` `../` rejection logic: drop `../` from the allow check on line 104; keep the `includes('..')` guard.
8. **M4** — Fix `bin` path in `apps/cli/package.json`. Point at `src/index.ts` for Bun development, or fix the build outfile to land at `apps/cli/superskill` and document the Node story.
9. **L1** — Remove duplicate `parseFrontmatterSafe` call in `quality/magent.ts:89-90`.
10. **L2** — Fix `scoreSlashSyntax` in `quality/command.ts` to use the available `target` parameter for dialect validation per the dimension's stated purpose.
11. **L3** — Fix `validate.ts` link validity checks to verify actual disk resolution of `skill:`/`agent:`/`command:` references, not just URI format.
12. **L4** — Fix `config.ts` targets validation to use `z.enum(TARGETS)` instead of `z.array(z.string())` so unknown target strings fail at schema validation.
13. **L5** — Verify Phase 1 deferred commands (`list`, `doctor`, `init`) correctly absent. Not a defect; confirmation-only.
14. **L6** — Fix `evolve.ts:258` `proposalRecord.created_at` to use the new row's actual creation timestamp instead of `evaluations[0].created_at`.

### Constraints

- **Architecture boundaries**: Must not change module boundaries, public APIs, or data formats defined in ADR/architecture docs. Design clarifications (e.g., C1) stay within existing seams.
- **Regression test per fix**: Each fix must include a regression test that exercises the real code path (not a fixture that bypasses the broken seam).
- **Fix order**: C1 must be fixed first (design clarification for auto-proposals). H1-H3 follow in any order after C1. M1-M4 and L1-L6 can proceed independently.

### Solution

Decomposed into 6 deliverable-based subtasks (by finding severity and module boundaries, not implementation phases).

#### Subtasks

- [x] [0017 - Fix evolve auto-change generation and application](0017_fix-evolve-auto-change-generation.md)
- [x] [0018 - Fix proposal_id matching for accept/reject](0018_fix-proposal-id-matching.md)
- [x] [0019 - Fix refine dimension-notes dead path](0019_fix-refine-dimension-notes-dead-path.md)
- [x] [0020 - Align agent completeness scoring across modules](0020_align-agent-completeness-scoring.md)
- [x] [0021 - Fix low-priority review findings (L1-L6)](0021_fix-low-priority-review-findings.md)
- [x] [0022 - Fix medium-severity review findings (M1-M4)](0022_fix-medium-severity-review-findings.md)

**Dependency order:** 0017 → (0018 || 0019 || 0020) → (0021 || 0022)
**Estimated total effort:** 18-31 hours

### Plan

- [x] Stage 1: Refine requirements (14 numbered items, constraints, preset)
- [x] Stage 2: Decompose into 6 subtasks
- [ ] Execute 0017: C1 — evolve auto-change generation fix (blocking)
- [ ] Execute 0018-0020: H1-H3 — high-severity fixes (parallel after 0017)
- [ ] Execute 0021-0022: L1-L6 + M1-M4 — medium/low fixes (parallel after high-severity)
- [ ] Stage 3: Implement/Test loop per subtask
- [ ] Stage 4: Verification gate (SECU review + requirements traceability)
- [ ] Stage 5: Post-flight verify
- **Verification gate**: `bun run lint` clean, `bun run test` all passing, `bun run typecheck` passes. No test skipped or `.skip`'d.


### Design

- **C1**: Auto-proposals target `frontmatter.description` with prepend semantics (not replace). Design clarification: dimensions are heuristic scores; proposals target concrete frontmatter fields.
- **H1**: `proposal_id` persisted in `proposal_json` (not new DB column) to avoid schema migration.
- **H2**: Drop `agentType`; align `REQUIRED_FIELDS`, `FIELD_TYPES`, and `scoreCompleteness` on `[name, description, model, tools]`.
- **H3**: Dimension notes use `severity: 'warning'` + `strategy: 'suggest'` directly, bypassing `classifyFix()` dead auto-apply path.
- **M1-M4**: `--no-global` Commander flag; `omp`/`hermes` surrogate targets via `pi`/`opencode` rulesync; marketplace `../` guard simplification; `bin` → `src/index.ts`.
- **L1-L6**: Targeted cleanup: duplicate parse removal, `target` param in slash-syntax, disk resolution for link validation, `z.enum(TARGETS)`, timestamp fix.

### Review

All 14 findings from the Phase 1 & 2 review have been fixed across 6 subtasks:

| Severity | Finding | Subtask | Status |
|----------|---------|---------|--------|
| 🔴 Critical | C1: evolve auto-changes silent no-op | 0017 | ✅ Fixed |
| 🟠 High | H1: proposal_id vs rowid mismatch | 0018 | ✅ Fixed |
| 🟠 High | H2: agent scoring inconsistency | 0020 | ✅ Fixed |
| 🟠 High | H3: refine dimension-notes dead path | 0019 | ✅ Fixed |
| 🟡 Medium | M1-M4: install flag, omp path, marketplace, bin | 0022 | ✅ Fixed |
| 🟢 Low | L1-L6: duplicate parse, slash syntax, links, targets, timestamps | 0021 | ✅ Fixed |

**Verification:** `bun run lint` clean, `bun run typecheck` clean, 460 tests pass / 0 fail.

### Testing

- Command: `bun run test`
- Scope: Full test suite (37 files, 460 tests)
- Result: 460 pass / 0 fail
- Coverage: 99.53% funcs / 98.10% lines
- Key regression tests added:
  - evolve: generateChanges → stepApply end-to-end (C1)
  - evolve: proposal_id matching for accept/reject (H1)
  - refine: dimension notes as suggestions not auto-apply (H3)
  - quality: agent scoring aligned across modules (H2)
  - config: z.enum(TARGETS) validation (L4)
  - command: slash-syntax target param (L2)
  - validate: link disk resolution (L3)
  - install: --no-global flag (M1)
  - marketplace: ../ guard (M3)
  - install integration: surrogate targets for omp/hermes (M2)
