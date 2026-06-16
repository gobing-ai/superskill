---
name: Tests + verification
description: Tests + verification
status: Done
created_at: 2026-06-16T05:43:29.877Z
updated_at: 2026-06-16T16:01:54.462Z
folder: docs/tasks
type: task
feature-id: F005
priority: high
estimated_hours: 3
dependencies: ["0001","0002","0003","0004","0006"]
tags: ["testing","verification","coverage","smoke-test"]
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0005. Tests + verification

### Background

F001–F004 deliver the code; F005 proves it works and stays working. Gate requirement: ≥90% line + function coverage. Smoke test with real plugin data.


### Requirements

Unit tests cover F001-F004 surfaces: targets and `TARGET_TO_AGENT_NAME`, config, marketplace resolution, mapper output, pipeline transforms, rulesync dispatch, and install orchestration. Integration coverage lives in `apps/cli/tests/commands/install.integration.test.ts` and uses the hermetic fixture at `apps/cli/tests/fixtures/plugin-min/`.

The install integration suite asserts mapped target dispatch, ADR-010 `global`/`dryRun` option propagation into `runRulesync`, target filtering for non-rulesync targets, transformed per-target input roots, slash bridge conversion before generic colon rewriting, dry-run output, missing-plugin errors, and direct copy dispatch for Superskill-owned targets (`hermes`, `omp`). Pi edge cases remain covered in the pipeline tests: tool expansion, prose skill extraction, and runtime-note conversion.

Verification gate: `bun run autofix && bun run spur-check && bun run build` must pass; aggregate coverage must stay above 90% function and 90% line. Smoke gate: a built binary running `superskill install demo --targets pi,codex --dry-run` against the `plugin-min` fixture must exit 0.


### Q&A



### Design

Tests use the `plugin-min` fixture (F002), not a real corpus. Integration tests exercise `executeInstall()` with an injected `runRulesync` dependency so they can assert target mapping, feature dispatch, ADR-010 option propagation, and transformed target-specific input roots without writing to real user agent directories.

The production install pipeline maps the plugin into canonical `.rulesync/`, then creates one project-shaped rulesync input root per target at `.rulesync/.targets/<target>/.rulesync`. This lets target-specific transforms run before `rulesync.generate()` while preserving the input-root contract expected by `rulesync`.

Gate: `bun run spur-check` (lint + pre-check + test + post-check) + `bun run build`; coverage >=90/90 per `bunfig.toml`. Smoke: built binary running `superskill install demo --targets pi,codex --dry-run` against a fresh `plugin-min` fixture exits 0.


### Solution

Added/verified unit and integration coverage for the F001-F004 install path. The integration suite now includes seven cases against `plugin-min`: marketplace resolution and `.rulesync` mapping, full feature dispatch, target filtering, transformed target-specific input roots, Superskill-owned target copy dispatch, missing plugin errors, and dry-run output.

Fixed a verification regression found by the binary smoke test: target-specific `rulesync` inputs were previously created as `.rulesync/.targets/<target>` containing canonical files directly, but `rulesync.generate()` expects the input root to contain a child `.rulesync` directory. `executeInstall()` now builds project-shaped target roots at `.rulesync/.targets/<target>/.rulesync`, passes `.rulesync/.targets/<target>` to `runRulesync`, and copies `hermes`/`omp` skills from the nested canonical directory.

Current verified result: 111 tests across 14 files, aggregate coverage 99.17% functions / 98.52% lines, build succeeds, and the requested fixture smoke exits 0.


### Plan

1. Verify existing F001-F004 test coverage and task requirements.
2. Run the required gates: `bun run autofix`, `bun run spur-check`, and `bun run build`.
3. Run the built-binary smoke against a fresh `plugin-min` fixture copy.
4. Fix the smoke-discovered target input-root mismatch.
5. Re-run the gates and smoke command after the fix.
6. Record the final verification outcome in task 0005.


### Review

Verification verdict: PASS after fix.

#### Fixed Finding P2: Binary smoke failed for rulesync targets

The initial smoke command failed with `Error: .rulesync directory not found in '/private/tmp/.../.rulesync/.targets/pi'. Run 'rulesync init' first.` The root cause was an input-root contract mismatch: `executeInstall()` passed `.rulesync/.targets/<target>` to `rulesync.generate()`, but that directory contained `skills/`, `commands/`, and `subagents/` directly instead of a nested `.rulesync/` canonical directory.

Fix applied in `apps/cli/src/commands/install.ts`: target-specific inputs are now project-shaped roots with transformed content under `.rulesync/.targets/<target>/.rulesync`, and `runRulesync` receives `.rulesync/.targets/<target>` as its input root. The non-rulesync `hermes` and `omp` copy paths were updated to read from the nested canonical directory.

Regression coverage added in `apps/cli/tests/commands/install.integration.test.ts`: one test asserts transformed slash bridge output in `.rulesync/.targets/codex/.rulesync/commands/demo-run.md`; another asserts non-dry-run copy output for `hermes` and `omp`.


### Testing

Passed:

- `bun run autofix`
- `bun run spur-check`
- `bun run build`
- Built-binary smoke from a fresh temp fixture: `/Users/robin/xprojects/superskill/dist/cli/superskill install demo --targets pi,codex --dry-run`

`bun run spur-check` result: 111 tests passing across 14 files, 0 failures, 211 assertions. Aggregate coverage: 99.17% functions and 98.52% lines.

Smoke note: `rulesync` prints warnings for missing optional `.rulesync/mcp.json` and `.rulesync/hooks.json` in the minimal fixture, but the command exits 0 and prints `[DRY-RUN] No files were written.`


### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References


