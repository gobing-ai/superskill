---
name: Tests + verification
description: Tests + verification
status: Backlog
created_at: 2026-06-16T05:43:29.877Z
updated_at: 2026-06-16T05:43:29.877Z
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


Unit tests: targets.test.ts (incl. TARGET_TO_AGENT_NAME bridge), config.test.ts, mapper.test.ts, pipeline/convert.test.ts, pipeline/rewrite-colons.test.ts, pipeline/pi-subagent.test.ts, install.test.ts. Integration: install.integration.test.ts against the hermetic fixture `apps/cli/tests/fixtures/plugin-min/` (no real corpus). Asserts `generate()` called with mapped targets AND `outputRoots` per `--global` (ADR-010 — rulesync never resolves `~`; caller owns the root), and the slash bridge applied. Pi edge cases: tool expansion, prose skill extraction, runtime notes. Gate: `bun run autofix && bun run spur-check && bun run build` all green; coverage ≥90/90 per bunfig.toml. Smoke: `./dist/cli/superskill install demo --targets pi,codex --dry-run` exits 0.


### Q&A



### Design


Tests use the `plugin-min` fixture (F002), not a real corpus. Integration test asserts `generate()` is called with mapped targets **and `outputRoots`** set per `--global` (ADR-010), and that the `TARGET_TO_AGENT_NAME` slash bridge is applied. Gate: `bun run spur-check` (lint + pre-check + test + post-check) + `bun run build`; coverage ≥90/90 per `bunfig.toml`. Smoke: `./dist/cli/superskill install demo --targets pi,codex --dry-run` exits 0.


### Solution



### Plan



### Review



### Testing



### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References


