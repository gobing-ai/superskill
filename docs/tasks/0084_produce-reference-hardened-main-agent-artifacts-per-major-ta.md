---
template: standard
schema_version: 1
name: "Produce reference hardened main-agent artifacts per major target family, dogfood via superskill magent evaluate, update docs and changelog"
description: ""
status: done
type: task
profile: standard
feature_id: null
parent_wbs: "0080"
priority: P2
tags: []
dependencies: ["0082", "0083"]
created_at: "2026-07-15T17:54:05.286Z"
updated_at: "2026-07-15T22:59:56.644Z"
---

## 0084. Produce reference hardened main-agent artifacts per major target family, dogfood via superskill magent evaluate, update docs and changelog

### Background
Child of 0080. Depends on 0083 (hardened template). With the meta-skill enhanced (0082) and the template hardened (0083), produce the actual reference main-agent artifacts — one or more per major target family — and dogfood them through the enhanced meta-skill's evaluate/refine operations. Then update project docs and changelog.
### Requirements
- [x] R1. **Produce reference hardened main-agent files** for each major target family (at minimum: Claude Code, pi, omp, openclaw, hermes, grok). Each must: contain explicit "Harness Infrastructure" guidance recommending spur + superskill; account for native tool and manifest differences; follow SOTA/best-practice patterns for tool discipline and verification. Use the hardened template from 0083 as the base.
- [x] R2. **Dogfood via the enhanced meta-skill.** Run `superskill magent scaffold` (or add), `validate`, `evaluate`, `refine` against the new main-agent content. Operations must succeed with high scores. Record evaluation evidence in the Testing section.
- [x] R3. **Update project docs** (architecture, features, AGENTS.md if needed) to reflect the new status of main agents and the role of spur/superskill. Provide migration/adoption guidance from older main-agent patterns.
- [x] R4. **Update changelog and bump version** if appropriate. Follow the project's Conventional Commits + Keep a Changelog conventions. (Changelog [Unreleased] entry landed; version bump deferred to next release cut.)
### Acceptance Criteria
**Scenario: reference main agents are harness-aware and platform-padded**
- Given the reference `docs/about_main_agent.md` and the hardened template from 0083
- When a new main agent definition is produced for each major target
- Then each version contains explicit "Harness Infrastructure" guidance, accounts for native tool/manifest differences, and follows SOTA patterns

**Scenario: meta-skill manages the new main agents end-to-end**
- Given the enhanced cc-magents (from 0082)
- When `superskill magent scaffold`, `validate`, `evaluate`, `refine`, `evolve` are run against the new content
- Then operations succeed with high scores and artifacts are installable/distributable

**Scenario: docs reflect new main-agent status**
- Given all changes for this task
- When docs are reviewed
- Then architecture/features/AGENTS.md reflect spur+superskill as first-class and provide migration guidance

**Scenario: quality gates pass**
- Given all changes
- When `bun run spur-check` runs
- Then it is green with no skipped tests
### Q&A

<!-- Clarifications and decisions made during refinement. Keep empty if none. -->

### Design
Two-phase: (1) produce artifacts using the hardened template + platform padding from `docs/about_main_agent.md`; (2) dogfood through the meta-skill. Artifacts may live under `plugins/cc/skills/cc-magents/references/main-agents/` or a new `main-agents/` area. Each artifact is a platform-native main agent file (e.g., `claude-code.md`, `pi.md`, `omp.md`, etc.).
### Plan
- [x] P1. Read the hardened template (from 0083) and `docs/about_main_agent.md` for per-platform differences.
- [x] P2. Produce reference main-agent files for Claude Code, pi, omp, openclaw, hermes, grok (+ codex sibling).
- [x] P3. Run `superskill magent evaluate` on each; record scores in Testing section.
- [x] P4. Refine any that score below the bar; re-evaluate (condensed + safety markers → Grade A).
- [x] P5. Update docs (architecture, help/cmd_magent, changelog, main-agents/README migration).
- [x] P6. Run full `bun run spur-check` gate.
### Solution
Delivered under parent 0080; re-verified `/sp:dev-verify 0084 --force` with fresh dogfood.

| Deliverable | file:line | Notes |
| --- | --- | --- |
| Gold masters (7) | `plugins/cc/skills/cc-magents/references/main-agents/claude-code.md:1` | Also: codex, pi, omp, openclaw, hermes, grok — Grade A evaluate this session |
| Migration / dogfood README | `plugins/cc/skills/cc-magents/references/main-agents/README.md:1` | validate/evaluate/refine + migration |
| Help surface | `docs/help/cmd_magent.md:5` | Harness-aware note + path to gold masters |
| Architecture | `docs/03_ARCHITECTURE.md:96` | magent template callout |
| Features status | `docs/05_FEATURES.md` Phase 2 foundation row | Harness-aware gold masters (0080/0084) |
| Changelog | `CHANGELOG.md` Unreleased | Task 0080/0084 feature note |
| Base template (0083) | `packages/core/src/templates/magent/default.md:26` | Harness & Infrastructure |

OpenClaw is not a `superskill magent --target` id; reference was platform-padded. Version bump deferred to release chore.
### Testing
**Mode:** `/sp:dev-verify 0084 --auto --focus all --fix all --force` (standalone re-audit of done task).

**Commands run this session (fresh evidence):**

| Command | Result |
| --- | --- |
| `./dist/superskill magent validate` ×7 | PASS — all Valid |
| `./dist/superskill magent evaluate` ×7 | PASS — aggregate **1.00 / Grade A** each |
| `./dist/superskill magent refine …/claude-code.md --dry-run` | PASS — No issues; Score 1.00 |
| `./dist/superskill magent evaluate … --rubric packages/core/src/rubrics/magent.yaml --json` | PASS — envelope-out |
| `./dist/superskill magent evaluate … --save` (×2) + `evolve … --propose-only --json` | PASS — envelope with flat Grade-A trends (rubric via `~/.superskill/rubrics/magent.yaml` or source CLI; compiled binary alone needs rubric on search path) |
| `bun run lint` | PASS |
| `bun run spur-check` | PASS — **1436 pass / 0 fail**; post-check rules green |
| `spur task check 0084 --strict-core` | PASS — L4 feature_id advisory only |

**Section presence (static):** all 7 gold masters contain `## Harness & Infrastructure` and primary **Platform Padding**.

**Per-requirement traceability**

| Req | Status | Evidence |
| --- | --- | --- |
| R1 Reference main-agent files | MET | `plugins/cc/skills/cc-magents/references/main-agents/{claude-code,codex,pi,omp,openclaw,hermes,grok}.md` + README; each harness + platform-padded |
| R2 Dogfood via meta-skill | MET | validate/evaluate Grade A ×7; refine dry-run 1.00; evaluate envelope-out; evolve --propose-only JSON trends (this session) |
| R3 Project docs | MET | `docs/help/cmd_magent.md:5`; `docs/03_ARCHITECTURE.md:96`; `docs/05_FEATURES.md` foundation row; `main-agents/README.md` migration |
| R4 Changelog | MET | `CHANGELOG.md` Unreleased (task 0080/0084); version bump deferred to release cut (documented) |

**Acceptance Criteria Verification**

| AC | Status | Evidence Type | Evidence |
| --- | --- | --- | --- |
| Scenario: reference main agents harness-aware and platform-padded | MET | static-ref + command | harness=1 padding≥1 on all 7; evaluate Grade A |
| Scenario: meta-skill manages end-to-end | MET | command | validate + evaluate + refine + evolve envelope this session |
| Scenario: docs reflect new main-agent status | MET | static-ref | cmd_magent, architecture, 05_FEATURES foundation row, README migration, CHANGELOG |
| Scenario: quality gates pass | MET | command | `bun run spur-check` exit 0; 1436 pass / 0 fail |

**Design conformance**

| Claim | Status | Notes |
| --- | --- | --- |
| Artifacts under cc-magents/references/main-agents/ | DONE | 7 platforms + README |
| Platform-native padding from about_main_agent | DONE | Primary platform table per file |
| Dogfood through enhanced meta-skill | DONE | Grade A evaluate; refine/evolve envelopes |
| OpenClaw not CLI --target | CHANGED (accepted) | Hand-padded reference; documented in Solution |

**Coverage:** N/A (documentation/template artifacts). Heuristic magent evaluate is deterministic (no LLM for Grade A).

**SECUA (summary):** No secrets; gold masters keep [CRITICAL]/NEVER/safety markers (7/7). Residual: keep gold masters in sync when canonical template changes; feature_id advisory remains open.
### Review
**Verdict: PASS** — all R1–R4 met; gold masters Grade A; gates green.

| # | Severity | Title | Status |
| --- | --- | --- | --- |
| 1 | P4 | Missing feature_id (advisory; parent_wbs 0080) | OPEN (advisory; does not block done) |
| 2 | P4 | OpenClaw not a CLI `--target` — reference hand-padded | ACCEPTED (documented in Solution) |
| 3 | P3 | Version bump deferred to release cut | ACCEPTED (Unreleased changelog only) |

No SECUA blockers. Residual risk: keep main-agents in sync when the canonical template changes significantly.
### References
- `docs/about_main_agent.md`
- `plugins/cc/skills/cc-magents/` (after 0082)
- `packages/core/src/templates/magent/default.md` (after 0083)
- Parent task 0080
- Depends on 0083
### History
- 2026-07-15T21:37:15.696Z backlog → todo (system)
- 2026-07-15T21:38:33.529Z todo → wip (system)
- 2026-07-15T21:38:34.877Z wip → testing (system)
- 2026-07-15T21:38:36.388Z testing → done (system)
