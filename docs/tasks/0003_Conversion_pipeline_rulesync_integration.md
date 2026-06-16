---
name: Conversion pipeline + rulesync integration
description: Conversion pipeline + rulesync integration
status: Done
created_at: 2026-06-16T05:43:14.543Z
updated_at: 2026-06-16T07:09:33.401Z
folder: docs/tasks
type: task
feature-id: F003
priority: high
estimated_hours: 4
dependencies: ["0001"]
tags: ["pipeline","conversion","rulesync","pi"]
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0003. Conversion pipeline + rulesync integration

### Background

The bash scripts do per-agent transformations by hand with regex. rulesync handles heavy format conversion, but cc-agents-specific transforms must still run. The pipeline is the home for those — pure functions, per-target registration, no side effects.


### Requirements

- [x] **R1**: `ConversionPipeline` supports named per-target pure stages. → **MET** | Evidence: `apps/cli/src/pipeline/convert.ts:8 ConversionPipeline`, `apps/cli/tests/pipeline/convert.test.ts:4`
- [x] **R2**: `rewriteColonRefs` rewrites `rd3:foo`/`wt:foo` references to hyphenated names in prose. → **MET** | Evidence: `apps/cli/src/pipeline/rewrite-colons.ts:7 rewriteColonRefs()`, `apps/cli/tests/pipeline/rewrite-colons.test.ts:4`
- [x] **R3**: Slash-command translation delegates to `@gobing-ai/ts-ai-runner` using `TARGET_TO_AGENT_NAME[target]`. → **MET** | Evidence: `apps/cli/src/pipeline/slash-command.ts:1 translateAgentSlashCommand`, `apps/cli/src/pipeline/slash-command.ts:8 translateSlashCommands()`, `apps/cli/tests/pipeline/slash-command.test.ts:4`
- [x] **R4**: Frontmatter normalization injects a missing `name` field. → **MET** | Evidence: `apps/cli/src/pipeline/frontmatter.ts:2 normalizeFrontmatter()`, `apps/cli/tests/pipeline/frontmatter.test.ts:4`
- [x] **R5**: `convertToPiSubagent` converts Skills 2.0 YAML to Pi native agent YAML, remapping tools to CSV, removing `model: inherit`, and remapping skills. → **MET** | Evidence: `apps/cli/src/pipeline/pi-subagent.ts:122 convertToPiSubagent()`, `apps/cli/tests/pipeline/pi-subagent.test.ts:80`
- [x] **R6**: `runRulesync` calls the `rulesync` npm package programmatic `generate()` API with mandatory `outputRoots=[global ? os.homedir() : process.cwd()]`. → **MET** | Evidence: `apps/cli/src/rulesync.ts:60 rulesyncGenerate()`, `apps/cli/src/rulesync.ts:64 outputRoots`, `apps/cli/tests/rulesync.test.ts:13`
- [x] **R7**: `@gobing-ai/ts-ai-runner@^0.3.19` is a registry dependency, not `workspace:*`. → **MET** | Evidence: `apps/cli/package.json:23`
- [x] **R8**: Only rulesync-supported targets are passed to `generate()`; `claude`, `omp`, and `hermes` are skipped for superskill-owned handling. → **MET** | Evidence: `apps/cli/src/targets.ts:20 TARGET_TO_RULESYNC`, `apps/cli/src/rulesync.ts:31`, `apps/cli/tests/rulesync.test.ts:25`


### Q&A



### Design

**ADR-010 — `outputRoots` is mandatory.** `rulesync.generate()` writes to `<outputRoot>/<relativeDirPath>` and never resolves `~`; the `global` flag only swaps the relative subdir. `runRulesync` sets `outputRoots: [global ? os.homedir() : process.cwd()]`. Omitting it would send global installs to cwd.

**Dependency:** `@gobing-ai/ts-ai-runner@^0.3.19` is declared in `apps/cli/package.json` as a registry dependency, not `workspace:*`. `rulesync@^8.28.1` is also declared there.

`translateSlashCommand` takes an `AgentName`, not a superskill `Target`; pass `TARGET_TO_AGENT_NAME[target]`. Slash rules verified against `@gobing-ai/ts-ai-runner@0.3.19`: Codex `$plugin-command`, Pi `/skill:plugin-command`, others `/plugin-command`.

For rulesync-supported targets, `generate()` does the write. Only `claude`, `hermes`, and `omp` are skipped by `runRulesync`; `hermes`/`omp` are copied afterward by superskill because they are absent from rulesync `ToolTarget`.


### Solution

- `pipeline/convert.ts`: `ConversionPipeline` with per-target stage registration and pure transformation stages.
- `pipeline/rewrite-colons.ts`: `rd3:foo`/`wt:foo` → `rd3-foo`/`wt-foo` prose rewrite.
- `pipeline/slash-command.ts`: standalone Claude-style slash commands translated through `@gobing-ai/ts-ai-runner` using `TARGET_TO_AGENT_NAME[target]`.
- `pipeline/frontmatter.ts`: frontmatter normalization that injects missing `name:` fields.
- `pipeline/pi-subagent.ts`: Skills 2.0 → Pi native YAML conversion with tool expansion, prose skill extraction, runtime notes, and `model: inherit` removal.
- `rulesync.ts`: `runRulesync()` wraps `rulesync.generate()` programmatic API with mandatory `outputRoots` per ADR-010 and skips non-rulesync targets.
- `targets.ts`: `omp` is excluded from `TARGET_TO_RULESYNC` and remains mapped to Pi slash dialect through `TARGET_TO_AGENT_NAME`.


### Plan

1. Verify pipeline stage coverage against F003 requirements.
2. Add missing slash-command translation stage and tests.
3. Add missing frontmatter normalization stage and tests.
4. Correct `omp` rulesync mapping and update regression coverage plus design snippet.
5. Restore the 90/90 coverage threshold.
6. Run lint, tests, and build.


### Review

**Review date:** 2026-06-16
**Status:** 0 open findings
**Scope:** `apps/cli/src/pipeline/`, `apps/cli/src/rulesync.ts`, `apps/cli/src/targets.ts`, `apps/cli/tests/pipeline/`, `apps/cli/tests/rulesync.test.ts`, `apps/cli/tests/targets.test.ts`, `docs/design/design-doc-phase1.md`
**Mode:** verify
**Channel:** current
**Gate:** `bun run lint` → pass; `bun run test` → pass; `bun run build` → pass

#### P1 — Blockers
| # | Title | Dimension | Location | Recommendation |
|---|-------|-----------|----------|----------------|

#### P2 — Warnings
| # | Title | Dimension | Location | Recommendation |
|---|-------|-----------|----------|----------------|
| 1 | FIXED: Missing slash-command translation stage | Correctness | `apps/cli/src/pipeline/` | Added `translateSlashCommands()` delegating to `@gobing-ai/ts-ai-runner` with `TARGET_TO_AGENT_NAME[target]`, plus dialect tests for Codex, Pi/omp, and default targets. |
| 2 | FIXED: Missing frontmatter name normalization stage | Correctness | `apps/cli/src/pipeline/` | Added `normalizeFrontmatter()` and tests for existing, missing, absent, and malformed frontmatter. |
| 3 | FIXED: `omp` was incorrectly passed to `rulesync.generate()` as `pi` | Correctness | `apps/cli/src/targets.ts:20` | Removed `omp` from `TARGET_TO_RULESYNC`; it still maps to Pi slash dialect through `TARGET_TO_AGENT_NAME`. Added `runRulesync(['omp'])` skip coverage. |
| 4 | FIXED: Coverage gate was lowered from 90/90 to 80/80 | Correctness | `bunfig.toml:10` | Restored `coverageThreshold = { lines = 0.9, functions = 0.9 }`; tests now pass under the original gate. |

#### P3 — Info
| # | Title | Dimension | Location | Recommendation |
|---|-------|-----------|----------|----------------|

#### P4 — Suggestions
| # | Title | Dimension | Location | Recommendation |
|---|-------|-----------|----------|----------------|

**Fix-pass 2026-06-16:** 4 fixed, 0 failed, 0 skipped.


### Testing



### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References


