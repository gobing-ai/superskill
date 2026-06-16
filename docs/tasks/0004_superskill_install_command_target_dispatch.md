---
name: superskill install command + target dispatch
description: superskill install command + target dispatch
status: Done
created_at: 2026-06-16T05:43:22.692Z
updated_at: 2026-06-16T07:22:55.555Z
folder: docs/tasks
type: task
feature-id: F004
priority: high
estimated_hours: 3
dependencies: ["0001","0002","0003","0006"]
tags: ["install","command","dispatch","claude-code"]
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0004. superskill install command + target dispatch

### Background

The primary deliverable of Phase 1. Wires mapper→pipeline→rulesync→target dispatch into a single Commander subcommand. Replaces setup-all.sh and four delegate bash scripts.


### Requirements

- [x] **R1**: `superskill install <plugin>` is registered in `cli.ts`, and the scaffold `add` command is removed. → **MET** | Evidence: `apps/cli/src/cli.ts:6 createProgram()`, `apps/cli/src/commands/install.ts:28 registerInstall()`, `apps/cli/tests/commands/install.test.ts:37`
- [x] **R2**: Command supports `--marketplace`, `--targets`, `--global`, `--dry-run`, and `--verbose`. → **MET** | Evidence: `apps/cli/src/commands/install.ts:34`, `apps/cli/tests/commands/install.test.ts:53`
- [x] **R3**: Plugin resolution follows marketplace/fallback behavior and reports available plugins on not found. → **MET** | Evidence: `apps/cli/src/commands/install.ts:91`, `apps/cli/src/marketplace.ts:45 resolvePlugin()`, `apps/cli/tests/commands/install.test.ts:181`, `apps/cli/tests/commands/install.integration.test.ts:234`
- [x] **R4**: Flow maps plugin content to `.rulesync`, applies F003 pipeline transforms, and passes transformed target input roots to `runRulesync`. → **MET** | Evidence: `apps/cli/src/commands/install.ts:114 mapPluginToRulesync()`, `apps/cli/src/commands/install.ts:121`, `apps/cli/src/commands/install.ts:205 prepareTargetRulesyncInput()`, `apps/cli/tests/commands/install.integration.test.ts:179`
- [x] **R5**: `runRulesync` is called with all five features and only rulesync-supported targets. → **MET** | Evidence: `apps/cli/src/commands/install.ts:129`, `apps/cli/src/commands/install.ts:130`, `apps/cli/tests/commands/install.integration.test.ts:105`, `apps/cli/tests/commands/install.integration.test.ts:142`
- [x] **R6**: Superskill-owned dispatch handles only `claude`, `hermes`, and `omp`; `hermes` and `omp` copy generated skill output when not dry-run. → **MET** | Evidence: `apps/cli/src/commands/install.ts:160`, `apps/cli/src/commands/install.ts:172`, `apps/cli/src/commands/install.ts:178`, `apps/cli/tests/commands/install.integration.test.ts:218`
- [x] **R7**: Dry-run previews without target writes; command errors exit through the Commander action catch path. → **MET** | Evidence: `apps/cli/src/commands/install.ts:40`, `apps/cli/src/commands/install.ts:185`, `apps/cli/tests/commands/install.test.ts:89`, `apps/cli/tests/commands/install.integration.test.ts:239`


### Q&A



### Design


Register `install` in `cli.ts` and **remove the scaffold `add` demo command**. Flow: resolve plugin → `mapPluginToRulesync` (F002) → ConversionPipeline (F003) → `runRulesync` with `outputRoots` set (F003/ADR-010) → dispatch only the targets rulesync can't write.

**rulesync owns paths (ADR-010).** With `outputRoots=[~]` for `--global`, `generate()` writes every supported target to its resolved path (Pi → `~/.pi/agent/skills`, Codex → `~/.agents/skills` under `$CODEX_HOME`, antigravity-cli → `~/.gemini/antigravity-cli/skills`, antigravity-ide → `~/.gemini/config/skills`). superskill does **not** reimplement these paths. The "not found" error lists resolvable plugins (config + `plugins/*`), not a hardcoded `rd3, wt`.

**superskill-owned dispatch** (only these): `claude` → `claude plugin install <name>@local --path plugins/<name>`; `hermes` → `~/.hermes/skills/`; `omp` → `~/.omp/agent/skills/` (copy generated Pi output).


### Solution

- `cli.ts` registers the `install` command and no longer exposes the scaffold `add` command.
- `commands/install.ts` resolves plugins through the marketplace/fallback resolver, maps the plugin into `.rulesync`, prepares per-target transformed rulesync inputs, runs `runRulesync` for supported targets, and dispatches only `claude`, `hermes`, and `omp` manually.
- Pipeline transforms applied before rulesync: frontmatter `name:` injection, slash-command dialect translation, colon-reference rewriting, and Pi/omp subagent conversion.
- `hermes` and `omp` copy generated skill output when not in dry-run mode; dry-run prints a preview message without target writes.
- Tests cover command registration, parser behavior, marketplace/fallback install paths, rulesync feature/target calls, pipeline transforms, and non-rulesync target copying.


### Plan

1. Verify command registration and option surface.
2. Verify plugin resolution and not-found behavior.
3. Verify mapper → pipeline → rulesync orchestration.
4. Verify rulesync-supported target filtering.
5. Verify superskill-owned `claude`/`hermes`/`omp` dispatch behavior.
6. Run lint, tests, and build.


### Review

**Review date:** 2026-06-16
**Status:** 0 open findings
**Scope:** `apps/cli/src/commands/install.ts`, `apps/cli/src/cli.ts`, `apps/cli/tests/commands/install.test.ts`, `apps/cli/tests/commands/install.integration.test.ts`
**Mode:** verify
**Channel:** current
**Gate:** `bun run lint` → pass; `bun run test` → pass; `bun run build` → pass

#### P1 — Blockers
| # | Title | Dimension | Location | Recommendation |
|---|-------|-----------|----------|----------------|

#### P2 — Warnings
| # | Title | Dimension | Location | Recommendation |
|---|-------|-----------|----------|----------------|
| 1 | FIXED: Install flow skipped the F003 conversion pipeline | Correctness | `apps/cli/src/commands/install.ts:121` | Added target-specific `.rulesync/.targets/<target>` input roots and applied frontmatter normalization, slash-command translation, colon rewrite, and Pi subagent conversion before rulesync. |
| 2 | FIXED: `hermes` and `omp` dispatch only logged paths | Correctness | `apps/cli/src/commands/install.ts:172` | Added recursive copy for superskill-owned target skill outputs when not in dry-run mode, with integration coverage. |
| 3 | FIXED: Slash-command translation order was masked by prose rewrite | Correctness | `apps/cli/src/commands/install.ts:240` | Translates slash commands before generic colon reference rewriting; integration test verifies `$rd3-dev-run` output for Codex. |

#### P3 — Info
| # | Title | Dimension | Location | Recommendation |
|---|-------|-----------|----------|----------------|

#### P4 — Suggestions
| # | Title | Dimension | Location | Recommendation |
|---|-------|-----------|----------|----------------|

**Fix-pass 2026-06-16:** 3 fixed, 0 failed, 0 skipped.


### Testing



### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References


