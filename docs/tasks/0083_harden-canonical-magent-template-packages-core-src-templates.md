---
template: standard
schema_version: 1
name: "Harden canonical magent template (packages/core/src/templates/magent/default.md) with Harness Infrastructure section, tool-selection discipline, verification loops, platform-padding notes"
description: ""
status: done
type: task
profile: standard
feature_id: null
parent_wbs: "0080"
priority: P2
tags: []
dependencies: []
created_at: "2026-07-15T17:53:11.132Z"
updated_at: "2026-07-15T19:10:06.357Z"
---

## 0083. Harden canonical magent template (packages/core/src/templates/magent/default.md) with Harness Infrastructure section, tool-selection discipline, verification loops, platform-padding notes

### Background
Child of 0080. Depends on 0082 (cc-magents meta-skill enhancement). Once the meta-skill understands spur + superskill as first-class, the canonical magent template must be hardened to produce scaffolds that contain dedicated, actionable sections on harness infrastructure, tool selection, verification, and platform-specific padding.

The canonical template is at `packages/core/src/templates/magent/default.md` (65 lines currently). The `apps/cli/templates/magent/default.md` is a gitignored build-artifact copy — do NOT edit it directly; it regenerates from the canonical source during build.
### Requirements
- [ ] R1. **Add a prominent "Harness & Infrastructure" section** to `packages/core/src/templates/magent/default.md` that names spur and superskill, gives canonical command patterns (`spur task/feature/rule/workflow`, `superskill install/magent/skill`), and explains when to reach for each. Include "use this first" guidance for task decomposition, feature planning, skill/command/hook/agent authoring, cross-target install, and lifecycle management.
- [ ] R2. **Strengthen tool-selection discipline** in the template: structured guidance on preferring specialized tools over shell equivalents, LSP for code intelligence, AST-aware search before text hacks, task CLI for task files, etc. Draw from the project's own AGENTS.md tool guidance as a gold master.
- [ ] R3. **Add verification loop guidance** to the template: explicit instructions for evidence-based verification (tests, E2E, lint gates, `bun run spur-check`), anti-hallucination patterns (confidence levels, source citation), and "fail loud" expectations.
- [ ] R4. **Add platform-specific padding notes** derived from `docs/about_main_agent.md`: how to express tool allow-lists, how to invoke sub-agents/skills, hook usage, manifest discovery — per platform family (Claude Code, pi, omp, openclaw, hermes, grok, etc.).
### Acceptance Criteria
**Scenario: scaffolded main agents contain harness guidance**
- Given the hardened `default.md` template
- When `superskill magent scaffold` produces a main agent
- Then the output contains a dedicated "Harness & Infrastructure" section with actionable spur/superskill command patterns

**Scenario: template covers tool discipline and verification**
- Given the hardened template
- When a main agent is scaffolded from it
- Then it contains tool-selection discipline, verification loop guidance, and anti-hallucination patterns

**Scenario: platform padding notes are present**
- Given the hardened template
- When a main agent is produced for a specific platform
- Then it carries padding notes for that platform's native tool surfaces and manifest format
### Q&A

<!-- Clarifications and decisions made during refinement. Keep empty if none. -->

### Design
Single file edit: `packages/core/src/templates/magent/default.md`. After editing, run `bun run build` to regenerate the `apps/cli/templates/` artifact. The template structure follows the quality dimensions in `packages/core/src/quality/magent.ts` (Project/Stack, Commands/Tools/Harness, Verification, Conventions, Safety, Docs/Routing, Tone). Add "Harness & Infrastructure" as a top-level section.
### Plan
- [ ] P1. Read `packages/core/src/templates/magent/default.md` (current 65 lines) and `packages/core/src/quality/magent.ts` (quality dimensions).
- [ ] P2. Read `docs/about_main_agent.md` for platform-specific padding notes.
- [ ] P3. Write the hardened template: add Harness & Infrastructure section, strengthen tool discipline, add verification loops, add platform padding notes.
- [ ] P4. Run `bun run build` to regenerate the `apps/cli/templates/` artifact.
- [ ] P5. Run `bun run lint` + `bun test plugins/cc/tests/structure.test.ts` to verify no breakage.
### Solution
**Changed file:** `packages/core/src/templates/magent/default.md:1-231` (was 1-65) — Rewrote canonical magent template.

| File:Lines | Change | Why |
| --- | --- | --- |
| `packages/core/src/templates/magent/default.md:26-113` | Added `## Harness & Infrastructure` section (R1) with spur/superskill command patterns and "use this first" table | Scaffolded main agents need actionable harness guidance |
| `packages/core/src/templates/magent/default.md:115-144` | Added `## Tool Discipline` section (R2) with specialized-over-shell table, LSP/AST-first guidance, task-CLI ownership, search-before-read | Strengthen tool-selection discipline in scaffolded output |
| `packages/core/src/templates/magent/default.md:147-177` | Expanded `## Verification` (R3) with evidence-before-assertions, anti-hallucination confidence levels, fail-loud | Verification loop guidance for evidence-based completion |
| `packages/core/src/templates/magent/default.md:199-223` | Added `## Platform Padding` (R4) with per-platform matrix (Claude Code, Codex, Pi, Omp, OpenCode, Antigravity, OpenClaw, Hermes, Grok) and portability rules | Platform-specific padding for native tool surfaces and manifest format |
| `packages/core/src/templates/magent/default.md:179-198` | Renamed `## Docs` → `## Docs & Routing` to match quality-dimension label | Align with packages/core/src/quality/magent.ts dimensions |
### Testing

**Mode:** sp-code-verification verify mode (terminal --next link).

**Commands run:**

| Command | Result |
| --- | --- |
| `bun run lint` | PASS — 168 files checked, Biome + typecheck clean (exit 0) |
| `bun test plugins/cc/tests/structure.test.ts` | PASS — 7 pass, 0 fail, 70 expect() calls (20ms) |
| `bun run build` | PASS — `@gobing-ai/superskill` build exit 0; 819 modules bundled |
| `spur task check 0083 --strict-core` | PASS — L4 advisory WARNs only (feature_id linkage, prerequisite 0080 status) |

**Compile-time embedding check:** The compiled binary `dist/superskill` contains all three new section markers (`Harness & Infrastructure`, `Platform Padding`, `Tool Discipline`) — confirms the canonical template at `packages/core/src/templates/magent/default.md` is bundled correctly via the `import ... with { type: 'text' }` path in `packages/core/src/operations/scaffold.ts:15`.

**CLI accuracy check:** Spot-checked the command patterns in the template against the actual CLI surface (`spur feature --help`, `spur task --help`, `superskill magent --help`). All verbs referenced in the template exist: `spur task create/update/check/list`, `spur feature create/show/update/advance`, `spur rule validate/run`, `spur workflow validate/run/continue`, `superskill magent scaffold/validate/evaluate/refine/evolve`, `superskill skill/agent/command/hook scaffold`, `superskill install`.

**Coverage claim:** N/A — this is a template-content task, not a code-path task. Verification is structural (section presence, command-pattern accuracy, build/lint/test gates).

**Stale artifact note:** `apps/cli/templates/magent/default.md` (dated Jul 11) is NOT regenerated by `bun run build` and does not contain the new sections. This is a non-issue: the file is gitignored and is never read at runtime (the compiled binary embeds the canonical source via the `import` statement). Flagged for transparency only; no action required for 0083 to pass.
### Review
**Scope:** `packages/core/src/templates/magent/default.md` (65 → 231 lines).

**Verdict: PASS** — all 4 requirements met, all 7 acceptance criteria satisfied, no SECUA blockers.


| Severity | File:Lines | Finding | Recommendation |
| --- | --- | --- | --- |
| P1 | `packages/core/src/templates/magent/default.md:26-113` | R1 Harness & Infrastructure section: 11-row "Use this first" table, 6 canonical command-pattern blocks, "Single source of truth" guidance. Names spur + superskill. Embedded in compiled binary. | None — meets requirement. |
| P2 | `packages/core/src/templates/magent/default.md:115-145` | R2 Tool Discipline: 13-row specialized-over-shell table, LSP/ast_grep-first guidance, task-CLI ownership, search-before-read. | None — meets requirement. |
| P3 | `packages/core/src/templates/magent/default.md:147-177` | R3 Verification: 5-item gate, evidence-before-assertions, HIGH/MEDIUM/LOW confidence levels, fail-loud. | None — meets requirement. |
| P4 | `packages/core/src/templates/magent/default.md:199-223` | R4 Platform Padding: 9-platform × 4-column matrix + 4 portability rules. Stale artifact `apps/cli/templates/magent/default.md` (gitignored, never read at runtime — binary embeds canonical source via import in `scaffold.ts:15`). Design-section claim that `bun run build` regenerates this artifact is inaccurate. Non-blocking. | Optional follow-up: delete stale artifact or add copy step to build script. Not required for 0083. |


| Req | Verdict | Evidence |
| --- | --- | --- |
| R1 — Harness & Infrastructure section | PASS | Lines 26-113; names spur + superskill; canonical command patterns; "use this first" guidance for task/feature/rule/workflow/magent/skill/agent/command/hook/install. |
| R2 — Tool-selection discipline | PASS | Lines 115-145; specialized-over-shell table; LSP for code intelligence; AST-aware search before text hacks; task CLI for task files. |
| R3 — Verification loop guidance | PASS | Lines 147-177; evidence-based verification (tests, E2E, lint, spur-check); anti-hallucination (confidence levels, source citation); fail-loud. |
| R4 — Platform-specific padding | PASS | Lines 199-223; per-platform matrix (Claude Code, Codex, Pi, Omp, OpenCode, Antigravity, OpenClaw, Hermes, Grok) covering tool allow-lists, sub-agents/skills, hooks, manifest discovery. |


| AC | Verdict | Evidence |
| --- | --- | --- |
| 1. Harness guidance in scaffolded agents | PASS | `## Harness & Infrastructure` at line 26; embedded in `dist/superskill` (grep confirms). |
| 2. Tool discipline + verification | PASS | `## Tool Discipline` (line 115) + `## Verification` (line 147), both actionable. |
| 3. Platform padding present | PASS | `## Platform Padding` (line 199) with 9-platform matrix. |
| 4. `bun run build` succeeds | PASS | Exit 0; 819 modules bundled. |
| 5. `bun run lint` clean | PASS | 168 files, Biome + typecheck exit 0. |
| 6. `bun test plugins/cc/tests/structure.test.ts` | PASS | 7 pass, 0 fail. |
| 7. `spur task check 0083` | PASS | `--strict-core` PASS (L4 advisory WARNs only). |


| Dimension | Verdict | Detail |
| --- | --- | --- |
| Security | PASS | Safety section preserved; `[CRITICAL]` markers intact; untrusted-content note at line 173; no secrets. |
| Efficiency | PASS | 231 lines, within 1000-8000 conciseness window; no duplication. |
| Correctness | PASS | CLI command patterns verified against actual CLI surface; section headings match `magent.ts` quality-dimension regexes. |
| Usability | PASS | Actionable tables, canonical command patterns with comments, per-platform matrix with portability rules. |
| Architecture | PASS | Additive sections; no conflict with `MAGENT_SECTIONS` scoring; follows quality-dimension taxonomy. |


1. **Stale build artifact (INFO, non-blocking):** `apps/cli/templates/magent/default.md` (gitignored) not regenerated by `bun run build`. Never read at runtime — binary embeds canonical source. No action for 0083.
2. **L4 advisory WARNs (INFO, non-blocking):** Missing `feature_id`; prerequisite 0080 not yet done. Traceability advisories, not deliverable defects.


**PASS.** Transition 0083 testing → done.
### References
- `packages/core/src/templates/magent/default.md`
- `packages/core/src/quality/magent.ts`
- `docs/about_main_agent.md`
- `plugins/cc/skills/cc-magents/` (after 0082 enhancement)
- Parent task 0080
- Depends on 0082
### History
- 2026-07-15T18:46:09.029Z backlog → todo (system)
- 2026-07-15T18:59:09.436Z todo → wip (system)
- 2026-07-15T19:01:14.751Z wip → testing (system)
- 2026-07-15T19:10:06.357Z testing → done (system)
