---
schema_version: 1
name: "Enhance cc-magents meta-skill and design first-class main-agent definitions for all supported coding agents, treating spur and superskill as default infrastructure"
status: done
template: standard
created_at: 2026-07-15T00:00:00.000Z
updated_at: "2026-07-15T21:38:31.033Z"
priority: P1
feature-id: 
---

## 0080. Enhance cc-magents meta-skill and design first-class main-agent definitions for all supported coding agents, treating spur and superskill as default infrastructure

### Background
<!-- Why this task exists: the problem, motivation, and context. Self-contained — readable without the parent. -->

When migrating plugin `rd3` (Claude Code specific) to `sp` / superskill, the main agent definitions (the `magent` content type) in the original `/Users/robin/projects/cc-agents/magents` were intentionally skipped. The originals were not good enough for direct migration. They need hardening based on the original plus modern understanding of platform differences.

A reference document `docs/about_main_agent.md` was prepared (differences and similarities across Claude Code, Codex, pi, omp, opencode, antigravity-cli, openclaw, hermes, grok build — covering manifests, system prompt injection, and native tool surfaces). This file is **reference only** for research; it is not the deliverable.

The real deliverable is a **new set of high-quality, first-class main agent definitions** (AGENTS.md / CLAUDE.md / platform-native equivalents) for all supported coding agents.

**Key new constraint:** superskill and spur are now first-class harness infrastructure. Any new main agent must treat them as the default/recommended way to manage tasks, features, skills, commands, hooks, sub-agents, and cross-platform distribution. The main agents must be "harness-aware" and provide concrete guidance on using `spur` (for WBS/task/feature/rule/workflow lifecycle) and `superskill` (for authoring, validation, installation to targets).

**Prerequisite:** This work is tightly coupled to `plugins/cc/skills/cc-magents`. The meta-skill itself must be enhanced first so that it (and the `superskill magent` commands) can produce and manage the new generation of main agents. Only after the enhancement can we reliably use the tooling to create/validate/evaluate/refine/evolve the new main agents.

This task is the entry point for the design + implementation work. It will drive:
- Enhancement of cc-magents (capability matrix, templates, workflows, rubric alignment, spur/superskill integration points).
- Design of the new main agents (informed by the reference, the original skipped material, SOTA technical practices in 2026 coding agents, and industry best practices for tool use, verification, context discipline, etc.).
- Production of the hardened main agent artifacts (as improved scaffold templates + reference implementations).
- Dogfooding via the enhanced meta-skill.

### Requirements
- [x] R1. **Enhance `plugins/cc/skills/cc-magents` as the prerequisite meta-skill.** Update the skill to understand and promote spur + superskill as first-class infrastructure. At minimum:
  - Expand `references/platform-compatibility.md` (and any code matrix) with accurate, high-confidence entries for spur-related targets and superskill usage patterns. Mark confidence levels honestly.
  - Add or update workflows/references that describe how a main agent should instruct the coding agent to use `spur task/feature/rule/workflow` and `superskill` (install, magent, skill, etc.) for day-to-day work.
  - Improve the default (and any tiered) magent templates in `apps/cli/templates/magent/` so that scaffolded main agents contain dedicated, actionable sections on "Harness Infrastructure" (spur + superskill), tool selection discipline, verification loops, and platform-specific padding notes derived from `docs/about_main_agent.md`.
  - Ensure the skill's own SKILL.md, rubric usage, and evaluation criteria reward main agents that properly position the harness tools and account for cross-platform differences.

- [x] R2. **Design the new main agent set based on the specified sources.** Create (or heavily revise) main-agent definitions that:
  - Start from the intent and structure of the original (skipped) material in the external cc-agents/magents.
  - Incorporate the platform differences and tool-surface insights from `docs/about_main_agent.md` (so each platform version is "padded" correctly for native strengths while presenting a coherent external interface).
  - Incorporate SOTA technical practices and industry best practices for AI coding agents in 2026 (strong tool-use discipline, context engineering, verification/anti-hallucination patterns, explicit use of structured workflows, evidence citation, capability-aware instructions, etc.).
  - Explicitly establish spur and superskill as the default infrastructure: concrete instructions, examples, and "use this first" guidance for task decomposition, feature planning, skill/command/hook/agent authoring, cross-target install, and lifecycle management.

- [x] R3. **Produce concrete artifacts deliverable via the enhanced meta-skill.** The task must result in:
  - Updated/improved magent templates (and any supporting references) inside the superskill project that can be used with `superskill magent scaffold` / add / etc.
  - A set of reference hardened main-agent files (one or more per major target) that pass evaluation under the enhanced cc-magents.
  - Updates to the cc-magents skill itself so future users can maintain these main agents using the superskill tooling.

- [x] R4. **Leverage spur and superskill throughout the work.** This task itself must be executed using the spur task/feature workflow where appropriate. The implementation must demonstrate (and the produced main agents must recommend) use of:
  - `spur` for planning, decomposition, task tracking, and workflow.
  - `superskill` for skill/meta-skill authoring, validation, and distribution of the main-agent improvements.

- [x] R5. **Verification and quality gates.** The enhanced cc-magents must be used (after its own changes) to validate/evaluate the new main agents. All changes must pass `bun run spur-check` (or equivalent full gate). No pure-test tasks; tests and verification evidence live in the implementing task's Testing section. The produced main agents must score well on the magent quality dimensions (completeness of governance sections, platform coverage, conciseness, tone, safety).

- [x] R6. **Documentation and handoff.** Update relevant project docs (architecture, features, help, AGENTS.md if needed) to reflect the new status of main agents and the role of spur/superskill. Provide clear migration or adoption guidance from older main-agent patterns.
### Acceptance Criteria

**Scenario: cc-magents is enhanced before any new main agent is produced**
- Given the current cc-magents skill
- When the changes for R1 are implemented and the skill is installed/used
- Then `superskill magent` commands (scaffold, evaluate, refine, evolve) are aware of spur/superskill as first-class and the platform matrix reflects current harness capabilities

**Scenario: New main agents are harness-aware and platform-padded**
- Given the reference `docs/about_main_agent.md` and the original external material intent
- When a new main agent definition is produced for each major target (Claude Code, pi, omp, openclaw, hermes, grok, etc.)
- Then each version contains explicit "Harness Infrastructure" guidance recommending spur + superskill, accounts for native tool and manifest differences, and follows SOTA/best-practice patterns for tool discipline and verification

**Scenario: The meta-skill can manage the new main agents end-to-end**
- Given the enhanced cc-magents
- When `superskill magent scaffold`, `validate`, `evaluate`, `refine`, and `evolve` are run against the new main-agent content
- Then the operations succeed with high scores and the resulting artifacts are installable/distributable

**Scenario: spur and superskill are used as infrastructure in this work**
- Given this task (0080)
- When executing the work (planning, decomposition, implementation tracking, skill changes)
- Then spur task/feature commands and superskill authoring commands are the primary mechanisms used (and evidenced in the task artifacts)

**Scenario: Quality gates pass**
- Given all changes for this task
- When `bun run spur-check` (lint + pre-check rules + test + post-check) runs
- Then it is green with no skipped tests and the new main agents (via templates or references) pass magent evaluation at a high bar

### Design

**Phase split (enforced by requirements):**
1. Enhance the meta-skill (`plugins/cc/skills/cc-magents` + supporting CLI templates + rubric usage + platform matrix + references).
2. Design + produce the new main-agent content, using the enhanced meta-skill.

**Sources of truth for the design:**
- `docs/about_main_agent.md` (differences/similarities — reference only).
- Original external magents (intent and structure, not verbatim copy).
- SOTA 2026 coding-agent practices (tool calling discipline, context management, verification loops, structured workflows, evidence citation).
- superskill/spur capabilities as first-class (the harness must be celebrated and given concrete usage patterns in every main agent).

**Where the new main agents live:**
- Improved scaffold templates under `apps/cli/templates/magent/` (and any tiered variants).
- Reference/example main agents (possibly under `plugins/cc/skills/cc-magents/references/` or a new `main-agents/` area) that can be used as gold masters and distributed.

**Capability matrix updates:**
- Add explicit "harness" row/column for spur + superskill.
- Document how main agents should declare preferred tool usage when the harness is present.
- Note lossy mappings and recommended workarounds per platform.

**Template strategy:**
- Base structure follows the quality dimensions in `quality/magent.ts` (Project/Stack, Commands/Tools/Harness, Verification, Conventions, Safety, Docs/Routing, Tone).
- Add a prominent "Harness & Infrastructure" section that names spur and superskill, gives canonical command patterns, and explains when to reach for each.
- Platform variants include "padding" notes derived from the reference doc (e.g., how to express tool allow-lists, how to invoke sub-agents/skills, hook usage, manifest discovery).

**No direct `superskill magent evaluate` on the reference:**
- The reference file stays research-only. Evaluation is performed on the new hardened artifacts produced after the meta-skill enhancement.

### Plan
- [x] P1. Read and internalize `docs/about_main_agent.md`, current cc-magents, existing magent template, quality/magent.ts, and relevant vendors for the 9 agents.
- [x] P2. Enhance cc-magents (SKILL.md updates, platform-compatibility expansion, new or revised references for harness usage, template improvements).
- [x] P3. Design the content model for the new main agents (section outline + best-practice patterns that incorporate spur/superskill).
- [x] P4. Implement the hardened templates + at least one full reference main agent per major target family.
- [x] P5. Use the enhanced meta-skill to validate/evaluate/refine the new artifacts (dogfood).
- [x] P6. Add tests/evidence in the Testing section; run full spur-check gate.
- [x] P7. Update docs, changelog, version bumps as needed.
- [x] P8. Close with Review + verification that spur/superskill are positioned as default infra.

<!-- AUTO-GENERATED by spur task refresh-roster -->
| WBS | Sub-task | Status |
| --- | -------- | ------ |
| 0082 | Enhance cc-magents meta-skill: platform-compatibility matrix, workflows harness-usage, SKILL.md rubric/eval for spur+superskill awareness | done |
| 0083 | Harden canonical magent template (packages/core/src/templates/magent/default.md) with Harness Infrastructure section, tool-selection discipline, verification loops, platform-padding notes | done |
| 0084 | Produce reference hardened main-agent artifacts per major target family, dogfood via superskill magent evaluate, update docs and changelog | done |
<!-- END AUTO-GENERATED -->
### Solution
Parent epic for harness-aware main agents. Delivered via children + verify `--fix all` pass:

| Area | file:line | Notes |
| --- | --- | --- |
| Meta-skill harness awareness | `plugins/cc/skills/cc-magents/SKILL.md:49` | Harness awareness + rubric dimensions |
| Platform matrix + harness row | `plugins/cc/skills/cc-magents/references/platform-compatibility.md:18` | Main-agent matrix; harness row ~L53 |
| Harness-usage workflow | `plugins/cc/skills/cc-magents/references/workflows.md` (Harness-Usage section) | Use-this-first + canonical verbs |
| Canonical template | `packages/core/src/templates/magent/default.md:26` | `## Harness & Infrastructure` (+ Tool Discipline, Verification, Platform Padding) |
| Gold-master Claude Code | `plugins/cc/skills/cc-magents/references/main-agents/claude-code.md:1` | Grade A under `superskill magent evaluate` |
| Gold-master set + migration | `plugins/cc/skills/cc-magents/references/main-agents/README.md:1` | 7 platforms + dogfood + migration |
| Help surface | `docs/help/cmd_magent.md:5` | Harness-aware note + path to gold masters |
| Architecture template callout | `docs/03_ARCHITECTURE.md:85` | magent heuristics + `templates/magent/default.md` |
| Changelog | `CHANGELOG.md` Unreleased | Task 0080 feature note |

Also: `main-agents/{codex,pi,omp,openclaw,hermes,grok}.md` (siblings of claude-code). Children 0082/0083 closed earlier; 0084 content completed in this fix pass.

**Fix during verify:** initial FAIL (no gold masters / docs). Produced condensed platform-padded references, dogfood evaluate Grade A ×7, doc/changelog updates, SKILL.md invented-verb scan fix.
### Review
**Verdict: PASS** (from `/sp:dev-verify 0080 --auto --focus all --fix all --force`).

| # | Severity | Title | Status |
| --- | --- | --- | --- |
| 1 | P4 | Missing feature_id (advisory) | OPEN (skipped per operator; does not block done) |
| 2 | — | Child 0082/0083 done; 0084 gold masters + docs closed in residual pass | FIXED |

See `## Testing` for full traceability and `.spur/run/0080-verdict.json`.
### Testing
**Mode:** `/sp:dev-verify 0080 --auto --focus all --fix all --force` (standalone; post-fix re-verify).

**Child roll-up:** 0082 (cc-magents meta-skill) **done**; 0083 (canonical template) **done**; 0084 deliverables completed in the verify `--fix all` pass (reference main agents + docs/changelog).

**Commands run this session (fresh evidence):**

| Command | Result |
| --- | --- |
| `bun run lint` | PASS — 168 files, Biome + typecheck exit 0 |
| `bun test` (via `bun run spur-check`) | PASS — 1407 pass / 0 fail |
| `bun run build` | PASS — 819 modules bundled to `dist/superskill` |
| `bun run spur-check` | PASS — pre-check + tests + post-check rules (coverage-gate, skill-citations-resolve, every-export-has-tsdoc) |
| `spur task check 0080 --strict-core` | PASS — L2/L4 advisory WARNs only (Artifacts section variant; missing feature_id) |
| `./dist/superskill magent validate` ×7 refs | PASS — all Valid |
| `./dist/superskill magent evaluate` ×7 refs | PASS — aggregate **1.00 / Grade A** each |
| `./dist/superskill magent refine …/claude-code.md --dry-run` | PASS — "No issues found. Score: 1.00" |
| `./dist/superskill magent evaluate … --rubric packages/core/src/rubrics/magent.yaml --json` | PASS — envelope-out emits (two-call seam ready) |
| `./dist/superskill magent scaffold proof-harness` | PASS — embedded template includes `## Harness & Infrastructure` |

**Per-requirement traceability**

| Req | Status | Evidence |
| --- | --- | --- |
| R1 Enhance cc-magents | MET | Child 0082 done + uncommitted skill refs: `plugins/cc/skills/cc-magents/SKILL.md` (Harness awareness + Rubric), `references/platform-compatibility.md` (matrix + harness row), `references/workflows.md` (harness-usage); template via 0083 |
| R2 Design new main-agent set | MET | Design section of this task + platform padding from `docs/about_main_agent.md`; 7 platform-padded gold masters under `plugins/cc/skills/cc-magents/references/main-agents/` |
| R3 Produce concrete artifacts | MET | Template: `packages/core/src/templates/magent/default.md` (Harness, Tool Discipline, Verification, Platform Padding). References: `main-agents/{claude-code,codex,pi,omp,openclaw,hermes,grok}.md` + README. Skill updates as above |
| R4 Leverage spur + superskill | MET | Task tree 0080→0082/0083/0084 via spur; dogfood via `superskill magent scaffold/validate/evaluate/refine` this session |
| R5 Verification and quality gates | MET | `bun run spur-check` green; all 7 reference magents Grade A; structure test + full suite 1407 pass |
| R6 Documentation and handoff | MET | `docs/help/cmd_magent.md`, `docs/03_ARCHITECTURE.md` (template + magent notes), `CHANGELOG.md` [Unreleased], `main-agents/README.md` migration guidance |

**Acceptance Criteria Verification**

| AC | Status | Evidence Type | Evidence |
| --- | --- | --- | --- |
| Scenario: cc-magents enhanced before new main agents | MET | static-ref + command | 0082 done before 0084 artifacts; skill files present; scaffold proof uses harness template |
| Scenario: New main agents harness-aware and platform-padded | MET | test + command | Each `main-agents/*.md` has Harness & Infrastructure + primary Platform Padding; evaluate Grade A |
| Scenario: Meta-skill manages new main agents end-to-end | MET | command | validate Valid; evaluate 1.00; refine dry-run clean; evaluate --rubric --json envelope-out OK |
| Scenario: spur and superskill used as infrastructure | MET | static-ref | spur task tree; superskill magent dogfood commands above |
| Scenario: Quality gates pass | MET | command | `bun run spur-check` exit 0 this session |

**Design conformance**

| Claim | Status | Evidence |
| --- | --- | --- |
| Phase 1: enhance meta-skill first | DONE | 0082 |
| Phase 2: design + produce main agents | DONE | main-agents/* after fix |
| Templates under apps/cli/templates | CHANGED | Canonical source is `packages/core/src/templates/magent/default.md` (embedded at build); apps/cli copy is stale/gitignored — documented in 0083 |
| Reference gold masters under cc-magents/references | DONE | `references/main-agents/` |
| Capability matrix + harness row | DONE | platform-compatibility.md |
| Template: Harness + padding + quality dimensions | DONE | default.md sections match magent.ts governance patterns |

**Coverage:** N/A for pure doc/template paths; runtime gates exercised via full test suite (1407 pass). Heuristic magent evaluate is deterministic (no LLM ingest required for Grade A).

**SECUA (summary):** No secrets, no permission expansion, no destructive defaults in templates/refs. Invented-CLI-verb false positive (`superskill toolchain`) fixed by rephrasing SKILL.md. Residual: 0080 still lacks `feature_id` (L4 advisory); uncommitted working tree pending operator commit.
### References

_Former Artifacts (moved):_
- Updated `plugins/cc/skills/cc-magents/SKILL.md` + references/
- Updated `apps/cli/templates/magent/*.md`
- New reference main-agent files (or a distribution point)
- This task file + any linked feature
- Evidence of spur + superskill usage in the execution of this task

- `docs/about_main_agent.md`
- Original external `/Users/robin/projects/cc-agents/magents` (intent)
- `plugins/cc/skills/cc-magents/`
- `packages/core/src/quality/magent.ts`
- `apps/cli/templates/magent/default.md`
- AGENTS.md, CLAUDE.md, 03_ARCHITECTURE.md, 01_PRD.md of this project
- Relevant vendors/ for platform tool surfaces
- Spur and superskill documentation / commands for infrastructure usage patterns### History

- 2026-07-15T17:32:09.413Z backlog → todo (system)

### History

- 2026-07-15T21:38:18.790Z todo → wip (system)
- 2026-07-15T21:38:21.448Z wip → testing (system)
- 2026-07-15T21:38:31.033Z testing → done (system)
