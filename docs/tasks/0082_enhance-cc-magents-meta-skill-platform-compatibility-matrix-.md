---
template: standard
schema_version: 1
name: "Enhance cc-magents meta-skill: platform-compatibility matrix, workflows harness-usage, SKILL.md rubric/eval for spur+superskill awareness"
description: ""
status: done
type: task
profile: standard
feature_id: null
parent_wbs: "0080"
priority: P2
tags: []
dependencies: []
created_at: "2026-07-15T17:52:21.692Z"
updated_at: "2026-07-15T18:33:14.229Z"
---

## 0082. Enhance cc-magents meta-skill: platform-compatibility matrix, workflows harness-usage, SKILL.md rubric/eval for spur+superskill awareness

### Background
Child of 0080. The cc-magents meta-skill is the prerequisite for all other main-agent work: it must understand and promote spur + superskill as first-class infrastructure before the tooling can reliably produce or evaluate hardened main agents.

The canonical magent template lives at `packages/core/src/templates/magent/default.md` (NOT `apps/cli/templates/` — that path is a gitignored build-artifact copy, per task 0029 finding and 0066 confirmation). The meta-skill lives at `plugins/cc/skills/cc-magents/` with references at `plugins/cc/skills/cc-magents/references/`.


- [x] R1. **Expand `plugins/cc/skills/cc-magents/references/platform-compatibility.md`** with accurate, high-confidence entries for spur-related targets and superskill usage patterns. Add an explicit "harness" row/column for spur + superskill. Document how main agents should declare preferred tool usage when the harness is present. Note lossy mappings and recommended workarounds per platform. Mark confidence levels honestly (HIGH/MEDIUM/LOW).
- [x] R2. **Update `plugins/cc/skills/cc-magents/references/workflows.md`** with a section describing how a main agent should instruct the coding agent to use `spur task/feature/rule/workflow` and `superskill` (install, magent, skill, etc.) for day-to-day work. Include canonical command patterns and "use this first" guidance.
- [x] R3. **Update `plugins/cc/skills/cc-magents/SKILL.md`** so the skill's rubric usage and evaluation criteria reward main agents that properly position the harness tools and account for cross-platform differences. Ensure `superskill magent` commands (scaffold, evaluate, refine, evolve) are documented as harness-aware.


**Scenario: platform-compatibility matrix reflects harness capabilities**
- Given the expanded `platform-compatibility.md`
- When a user reads the matrix
- Then spur and superskill appear as first-class entries with confidence levels, and lossy mappings per platform are documented

**Scenario: workflows reference gives actionable harness guidance**
- Given the updated `workflows.md`
- When a main agent is scaffolded or refined
- Then it contains canonical spur/superskill command patterns for task/feature/rule/workflow and install/magent/skill

**Scenario: SKILL.md rubric rewards harness-awareness**
- Given the updated `SKILL.md`
- When `superskill magent evaluate` runs against a main agent
- Then harness-awareness and cross-platform coverage are scored dimensions


Three files touched, all under `plugins/cc/skills/cc-magents/`. No code changes — documentation/reference content only. Sources: `docs/about_main_agent.md` (reference), existing `platform-compatibility.md` (14 lines — needs substantial expansion), existing `workflows.md` (73 lines — needs harness section), existing `SKILL.md` (111 lines — rubric/eval criteria updates).


- [x] P1. Read `docs/about_main_agent.md` for platform tool-surface differences (manifests, system prompt injection, native tool surfaces across Claude Code, Codex, pi, omp, opencode, antigravity-cli, openclaw, hermes, grok).
- [x] P2. Expand `platform-compatibility.md` with harness row + per-platform entries + lossy mappings.
- [x] P3. Add harness-usage section to `workflows.md` with canonical spur/superskill command patterns.
- [x] P4. Update `SKILL.md` rubric/eval criteria to reward harness-awareness and cross-platform coverage.
- [x] P5. Run `bun run lint` + `bun test plugins/cc/tests/structure.test.ts` to verify no breakage.


- Updated `plugins/cc/skills/cc-magents/references/platform-compatibility.md`
- Updated `plugins/cc/skills/cc-magents/references/workflows.md`
- Updated `plugins/cc/skills/cc-magents/SKILL.md`


- `docs/about_main_agent.md`
- `plugins/cc/skills/cc-magents/`
- Parent task 0080
### Requirements
- [x] R1. **Expand `plugins/cc/skills/cc-magents/references/platform-compatibility.md`** with accurate, high-confidence entries for spur-related targets and superskill usage patterns. Add an explicit "harness" row/column for spur + superskill. Document how main agents should declare preferred tool usage when the harness is present. Note lossy mappings and recommended workarounds per platform. Mark confidence levels honestly (HIGH/MEDIUM/LOW).
- [x] R2. **Update `plugins/cc/skills/cc-magents/references/workflows.md`** with a section describing how a main agent should instruct the coding agent to use `spur task/feature/rule/workflow` and `superskill` (install, magent, skill, etc.) for day-to-day work. Include canonical command patterns and "use this first" guidance.
- [x] R3. **Update `plugins/cc/skills/cc-magents/SKILL.md`** so the skill's rubric usage and evaluation criteria reward main agents that properly position the harness tools and account for cross-platform differences. Ensure `superskill magent` commands (scaffold, evaluate, refine, evolve) are documented as harness-aware.
### Acceptance Criteria
**Scenario: platform-compatibility matrix reflects harness capabilities**
- Given the expanded `platform-compatibility.md`
- When a user reads the matrix
- Then spur and superskill appear as first-class entries with confidence levels, and lossy mappings per platform are documented

**Scenario: workflows reference gives actionable harness guidance**
- Given the updated `workflows.md`
- When a main agent is scaffolded or refined
- Then it contains canonical spur/superskill command patterns for task/feature/rule/workflow and install/magent/skill

**Scenario: SKILL.md rubric rewards harness-awareness**
- Given the updated `SKILL.md`
- When `superskill magent evaluate` runs against a main agent
- Then harness-awareness and cross-platform coverage are scored dimensions
### Q&A

<!-- Clarifications and decisions made during refinement. Keep empty if none. -->

### Design
Three files touched, all under `plugins/cc/skills/cc-magents/`. No code changes — documentation/reference content only. Sources: `docs/about_main_agent.md` (reference), existing `platform-compatibility.md` (14 lines — needs substantial expansion), existing `workflows.md` (73 lines — needs harness section), existing `SKILL.md` (111 lines — rubric/eval criteria updates).
### Plan
- [x] P1. Read `docs/about_main_agent.md` for platform tool-surface differences (manifests, system prompt injection, native tool surfaces across Claude Code, Codex, pi, omp, opencode, antigravity-cli, openclaw, hermes, grok).
- [x] P2. Expand `platform-compatibility.md` with harness row + per-platform entries + lossy mappings.
- [x] P3. Add harness-usage section to `workflows.md` with canonical spur/superskill command patterns.
- [x] P4. Update `SKILL.md` rubric/eval criteria to reward harness-awareness and cross-platform coverage.
- [x] P5. Run `bun run lint` + `bun test plugins/cc/tests/structure.test.ts` to verify no breakage.
### Solution
- `plugins/cc/skills/cc-magents/references/platform-compatibility.md:1-150` (was 1-14) — Expanded to a full matrix: main-agent capability matrix (9 platforms), native tool-surface matrix, a dedicated "Harness Row: spur + superskill" section documenting all 10 harness verbs with confidence levels, a preferred-tools statement template showing how main agents should declare harness usage, a lossy-mappings table with 11 rows of source→target losses and recommended workarounds, and confidence notes (HIGH/MEDIUM/LOW) sourced to `docs/about_main_agent.md` and CLI `--help` output verified 2026-07-15.
- `plugins/cc/skills/cc-magents/references/workflows.md:66-210` (new section, file now 1-219) — Added "Harness-Usage Workflow" section with a "Use this first" table mapping work types to harness verbs, canonical command patterns for `spur task/feature/rule/workflow` and `superskill magent/skill/install`, and cross-platform notes covering platforms without native subagents, skills delegation portability, and hook portability.
- `plugins/cc/skills/cc-magents/SKILL.md:49-59` (Harness awareness subsection) and `plugins/cc/skills/cc-magents/SKILL.md:112-147` (Rubric and Evaluation Criteria section) — Added "Harness awareness" subsection under Core Principle documenting that `superskill magent` scaffold/evaluate/refine/evolve are harness-aware. Added "Rubric and Evaluation Criteria" section with 5 scored dimensions (harness positioning, cross-platform coverage, lossy-mapping awareness, confidence honesty, safety boundaries) and a per-operation table confirming each `superskill magent` command emits and ingests harness-aware content.

**Verification**

- `bun run lint` (biome check + typecheck): clean, 168 files checked, 0 errors.
- `bun test plugins/cc/tests/structure.test.ts`: 7 pass, 0 fail, 70 expect() calls.
- `spur task check 0082`: run after this section is written.

**Sources**

- `docs/about_main_agent.md` (9-platform spec matrix, verified 2026-04-30)
- `spur --help`, `spur task/feature/rule/workflow --help` (verified 2026-07-15)
- `superskill --help`, `superskill magent --help` (verified 2026-07-15)
### Testing
Commands run on 2026-07-15 (re-verify with /sp:dev-verify 0082 --auto --focus all --fix all --force):

- `bun run lint`: PASS — clean (168 files).
- `bun test plugins/cc/tests/structure.test.ts`: PASS — 7 pass, 0 fail.
- `spur task check 0082`: PASS (after fixes to Requirements/Plan/Review sections; only L4 advisory for missing feature_id remains).
- `spur task check 0082 --strict-core`: PASS (advisory only).

All [ ] in Requirements and Plan marked [x] via fixes. Review restructured to include required P1–P4 table and Phase 8 traceability. No code changes needed (doc-only task).

Coverage claim: N/A (documentation-only; structure test covers layout).
### Review
Verdict: **PASS** (documentation-only task; one L4 advisory remains but is not a blocker for done per standard gate).

**Phase 7 — SECU review.**

| Dimension | Finding | Severity | Status |
|-----------|---------|----------|--------|
| Safety | No code changes; only .md updates under plugins/cc/skills/cc-magents/. No tool permission expansion, no destructive writes, no new auth surfaces. Explicit safety note in SKILL.md rubric preserves boundaries. | — | OK |
| Error handling | N/A — reference content only; no runtime paths changed. | — | OK |
| Conventions | Surgical edits to three reference files. Line counts and cross-refs verified. Uses exact CLI verbs from --help (verified 2026-07-15). | — | OK |
| Untested paths | Structure test (plugins/cc/tests/structure.test.ts) covers the layout invariants; passes. No production code paths added. | — | OK |

**P1–P4 priority findings** (reviewer's priority ordering):

| # | Severity | Title | Location | Status |
|---|----------|-------|----------|--------|
| 1 | P4 | Missing `feature_id` in frontmatter (advisory only; parent_wbs 0080 set) | Frontmatter of this task file | OPEN (advisory; does not block done per DD-07 and standard gate) |
| 2 | P3 | Review section originally lacked explicit P1–P4 table (gate requirement) | This Review section | FIXED (this update adds the table) |

**Phase 8 — requirements traceability.**

| Req | Where satisfied | Status |
|-----|-----------------|--------|
| R1 | `plugins/cc/skills/cc-magents/references/platform-compatibility.md` (expanded matrix + Harness Row + lossy mappings, 150 lines) | MET |
| R2 | `plugins/cc/skills/cc-magents/references/workflows.md` (Harness-Usage Workflow section added, canonical patterns) | MET |
| R3 | `plugins/cc/skills/cc-magents/SKILL.md` (Harness awareness subsection + Rubric and Evaluation Criteria section with 5 harness-aware dimensions) | MET |

**Phase 8 — acceptance criteria traceability.**

| AC | Where satisfied | Status |
|-----|-----------------|--------|
| platform-compatibility matrix reflects harness capabilities | platform-compatibility.md:59-140 (Harness Row table, preferred-tools template, lossy mappings with confidence) | MET |
| workflows reference gives actionable harness guidance | workflows.md:66- (Use this first table, canonical command patterns for spur/superskill verbs) | MET |
| SKILL.md rubric rewards harness-awareness | SKILL.md:49-59 (Harness awareness) + 112-147 (5-dimension rubric table + per-operation table) | MET |
### References
- `docs/about_main_agent.md`
- `plugins/cc/skills/cc-magents/`
- Parent task 0080
### History
- 2026-07-15T18:05:10.637Z backlog → todo (system)
- 2026-07-15T18:20:07.541Z todo → wip (system)
- 2026-07-15T18:20:07.768Z wip → testing (system)
- 2026-07-15T18:25:19.090Z testing → done (system)
