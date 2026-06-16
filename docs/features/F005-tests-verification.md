---
feature_id: F005
title: Tests + verification
phase: 1
status: planned
depends_on: [F001, F002, F003, F004]
deliverables:
  - apps/cli/tests/targets.test.ts
  - apps/cli/tests/config.test.ts
  - apps/cli/tests/mapper.test.ts
  - apps/cli/tests/pipeline/
  - apps/cli/tests/install.test.ts
created: 2026-06-16
---

# F005 — Tests + verification

## What

Comprehensive test coverage for all Phase 1 modules: unit tests for each feature, integration test for the end-to-end install flow, and gate verification.

## Why

F001–F004 deliver the code; F005 proves it works and stays working. ≥90% line + function coverage is required (bunfig.toml threshold).

## Change

### Unit tests (per-module, co-located with feature implementation)

- **F001 tests**: `targets.test.ts` — enum coverage, mapping accuracy, path resolution
- **F001 tests**: `config.test.ts` — valid/invalid config, defaults, missing file
- **F002 tests**: `mapper.test.ts` — file mapping, plugin prefix, missing dirs, merge behavior
- **F003 tests**: `pipeline/convert.test.ts` — stage registration, stage ordering, per-target filtering
- **F003 tests**: `pipeline/rewrite-colons.test.ts` — colon→hyphen in prose, edge cases
- **F003 tests**: `pipeline/pi-subagent.test.ts` — frontmatter conversion, model field, tools CSV
- **F004 tests**: `install.test.ts` — full flow, dry-run, error paths, idempotency

### Integration test

- `install.integration.test.ts`: Using a real `plugins/rd3/` directory (or a minimal test fixture), run `superskill install rd3 --targets pi,codex --dry-run` and verify:
  - `.rulesync/` is populated correctly
  - rulesync is called with correct targets
  - Pipeline stages applied to output
  - Target paths are resolved correctly
  - Exit code is 0

### Verification gates

- `bun run autofix` — format + typecheck clean
- `bun run spur-check` — 21 spur rules + 2 post-check rules + ≥90% coverage
- `bun run build` — binary compiles successfully
- Manual smoke test: `./dist/cli/superskill install rd3 --targets pi,codex --dry-run` against real plugin data

## Acceptance

```
bun run autofix && bun run spur-check && bun run build
# → All green

# Coverage
bun test --coverage
# → Line ≥ 90%, Function ≥ 90%

# Smoke test
./dist/cli/superskill install rd3 --targets pi,codex --dry-run
# → Lists files that would be installed, exit 0
```
