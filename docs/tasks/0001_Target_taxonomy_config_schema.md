---
name: Target taxonomy + config schema
description: Target taxonomy + config schema
status: Done
created_at: 2026-06-16T05:43:00.903Z
updated_at: 2026-06-16T06:51:12.257Z
folder: docs/tasks
type: task
feature-id: F001
priority: high
estimated_hours: 2
tags: ["foundation","types","config"]
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0001. Target taxonomy + config schema

### Background

Every other module depends on knowing what agents exist, how they map to rulesync targets, and where their directories live. Foundation type for the entire codebase.


### Requirements

TARGETS enum covers 8 agents; TARGET_TO_RULESYNC maps non-Claude targets to rulesync ToolTarget; TARGET_TO_AGENT_NAME bridges every Target to ts-ai-runner AgentName for slash translation (omp→pi; antigravity/hermes→default dialect — the sets are disjoint, ADR-009 amendment). No getSkillPath for rulesync-supported targets (rulesync owns paths via outputRoots, ADR-010); only hermes/omp may need a path helper. zod schema validates superskill.jsonc; loadConfig handles missing file gracefully.

#### Traceability Verdict — 2026-06-15 (verify mode)

- [x] **R1** TARGETS enum covers 8 agents → **MET** | Evidence: `apps/cli/src/targets.ts:5-14` · `tests/targets.test.ts:5-15`
- [x] **R2** TARGET_TO_RULESYNC maps non-Claude targets to rulesync ToolTarget → **MET** | Evidence: `apps/cli/src/targets.ts:20-27` (6 entries; excludes claude+hermes) · `tests/targets.test.ts:17-29`
- [x] **R3** TARGET_TO_AGENT_NAME bridges every Target → AgentName (omp→pi; antigravity/hermes→default dialect) → **MET** | Evidence: `apps/cli/src/targets.ts:38-47`; `'opencode'`∈AgentName → `translateSlashCommand` default `/plugin-command` (`shims.ts:2`, `slash-command.ts:39`) · `tests/targets.test.ts:31-53`
- [x] **R4** No getSkillPath for rulesync-supported targets (ADR-010) → **MET** | Evidence: no `getSkillPath` in `targets.ts`/`config.ts`
- [x] **R5** zod schema validates superskill.jsonc → **MET** | Evidence: `apps/cli/src/config.ts:13-18` · `tests/config.test.ts:6-36`
- [x] **R6** loadConfig handles missing file gracefully → **MET** | Evidence: `apps/cli/src/config.ts:38-40` (returns defaults) · `tests/config.test.ts:39-45`

**Summary:** 6/6 MET · 0 partial · 0 unmet · 0 scope drift.


### Q&A



### Design


`targets.ts` exports: `TARGETS` (8), `Target`, `TARGET_TO_RULESYNC` (non-Claude → rulesync `ToolTarget`), and **`TARGET_TO_AGENT_NAME: Record<Target, AgentName>`** bridging to `@gobing-ai/ts-ai-runner`'s `AgentName` for slash translation. The two enums are **disjoint** on `antigravity-cli`/`antigravity-ide`/`hermes`/`omp` (verified ts-ai-runner@0.3.19: `AgentName = claude|codex|gemini|pi|opencode|antigravity|openclaw`). Mapping: `omp→pi`; antigravity/hermes → any non-claude/codex/pi name (falls to `translateSlashCommand` default `/plugin-command`). ADR-009 amendment.

**No superskill path table** for rulesync-supported targets — rulesync resolves paths from `outputRoots` (ADR-010). Drop `getSkillPath` for them; only `hermes`/`omp` may need a path helper.

`config.ts`: zod schema `{ version:1, plugins:[{name,path}], targets:Target[], features:string[] }`; `loadConfig()` reads/validates `superskill.jsonc`, missing file → defaults.


### Solution

- `targets.ts`: `TARGETS` const (8 agents), `Target` type, `TARGET_TO_RULESYNC` mapping (6 non-Claude targets → rulesync ToolTarget), `TARGET_TO_AGENT_NAME` bridging to ts-ai-runner AgentName (new targets map to fallback values since AgentName is disjoint on 4 of them)
- `config.ts`: zod schema for superskill.jsonc, `loadConfig()` with graceful missing-file fallback
- No getSkillPath — rulesync owns path resolution (ADR-010), only hermes/omp may need a path helper later


### Plan

1. Create `apps/cli/src/targets.ts` — Target enum, TARGET_TO_RULESYNC, TARGET_TO_AGENT_NAME
2. Create `apps/cli/src/config.ts` — zod schema, SuperskillConfig type, loadConfig
3. Add `@gobing-ai/ts-ai-runner` dependency to apps/cli
4. Create tests: targets.test.ts (7 tests), config.test.ts (10 tests)
5. Run autofix + spur-check — all green


### Review


**Fix-pass 2026-06-15 (`--fix all`):** 1 fixed, 0 failed, 1 skipped.

- **FIXED P3 #1** — `apps/cli/src/targets.ts:20`: removed `| string` from `TARGET_TO_RULESYNC` value type → now `Partial<Record<Target, ToolTarget>>`. Verified all 5 values (`codexcli`, `pi`, `opencode`, `antigravity-cli`, `antigravity-ide`) ∈ rulesync `ALL_TOOL_TARGETS` (rulesync@8.29.0 `dist/index.d.ts:3`); typecheck now enforces membership. Gate green.
- **SKIPPED P4 #2** — JSDoc/ADR prose drift: cosmetic only, runtime-identical. JSDoc is already accurate (states concrete `opencode` value); no change needed.

**Post-fix gate:** `bun run lint` ✅ · `bun run test` ✅ (20 pass, 100% line+func coverage) · `bun run build` ✅.
**Post-fix verdict:** PASS (0 P1, 0 P2, 0 P3, 0 unmet, 0 partial).

> Note: ADR-009/010 pin `rulesync@8.28.1`; installed is `8.29.0`. ToolTarget membership verified against the installed version. Flag for ADR sync if the pin matters.


### P1 — Blockers
| # | Title | Dimension | Location | Recommendation |
|---|-------|-----------|----------|----------------|
| _none_ | | | | |

### P2 — Warnings
| # | Title | Dimension | Location | Recommendation |
|---|-------|-----------|----------|----------------|
| _none_ | | | | |

### P3 — Info
| # | Title | Dimension | Location | Recommendation |
|---|-------|-----------|----------|----------------|
| 1 | `TARGET_TO_RULESYNC` value type widened to `string` | Correctness | `apps/cli/src/targets.ts:20` | `ToolTarget \| string` defeats `ToolTarget` type safety; `codexcli`/`antigravity-cli` values aren't checked against rulesync's union. Drop `\| string` if values are valid `ToolTarget` members (verify against rulesync@8.28.1). |

### P4 — Suggestions
| # | Title | Dimension | Location | Recommendation |
|---|-------|-----------|----------|----------------|
| 2 | JSDoc/ADR prose drift on antigravity/hermes mapping | Usability | `apps/cli/src/targets.ts:33-37` | JSDoc says all four new targets → `opencode`; ADR-009 phrases it as "default dialect / hermes outside shim." Same runtime result; align wording. |

**Security:** clean — no secrets, no injection sinks, no eval/exec/child_process.
**Correctness:** central claim verified — `antigravity-*`/`hermes`→`opencode` hits `translateSlashCommand` `default` branch (`/plugin-command`), exactly as ADR-009 specifies (`slash-command.ts:39-40`).


### Testing



### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References


