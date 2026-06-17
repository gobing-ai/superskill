---
name: fix-medium-severity-review-findings
description: fix-medium-severity-review-findings
status: Done
created_at: 2026-06-17T00:09:03.159Z
updated_at: 2026-06-17T00:31:08.201Z
folder: docs/tasks
type: task
feature-id: ""
priority: medium
estimated_hours: 5
tags: ["install","marketplace","bin","M1-M4","medium"]
preset: standard
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0022. fix-medium-severity-review-findings

### Background

M1-M4 findings from Phase 1 & 2 review: M1: --global flag defaults to true, Commander can't express 'default true, settable false' — project-level install unreachable. M2: omp/hermes receive mapped-canonical skills instead of rulesync-generated Pi output. M3: marketplace.ts ../ rejection logic has dead allow-branch and blanket includes('..') guard. M4: bin points to ./superskill which doesn't exist in-repo — broken symlink on install.


### Requirements

1. M1: Fix --global flag using --no-global or --global [bool] with explicit parsing. 2. M2: Run rulesync for pi when omp requested and copy from its output, or document simplification in ADR. 3. M3: Drop ../ from allow check on line 104; keep includes('..') guard. 4. M4: Point bin at src/index.ts for Bun development. 5. Each fix includes regression test.


### Q&A



### Design

- **M1**: Use Commander's `--no-global` pattern (auto-negation) instead of `.option('--global', ..., true)`. This allows `--no-global` to set `options.global = false`.
- **M2**: When `omp` or `hermes` target is requested, run rulesync for `pi` as a surrogate and copy from its output tree.
- **M3**: Remove `../` from the allow-prefix check on line 104; the blanket `includes('..')` guard on line 111 already handles traversal attempts.
- **M4**: Point `bin.superskill` at `src/index.ts` for Bun development (Bun resolves `.ts` entries natively).

### Solution

| Fix | File | Change |
|-----|------|--------|
| M1 | `apps/cli/src/commands/install.ts:37` | `.option('--no-global', ...)` replaces `.option('--global', ..., true)` |
| M2 | `apps/cli/src/commands/install.ts` | Omp/hermes dispatch runs rulesync for pi as surrogate |
| M3 | `apps/cli/src/marketplace.ts:104` | Dropped `../` from allow-prefix check |
| M4 | `apps/cli/package.json:6` | `bin.superskill` → `src/index.ts` |

### Plan

- [x] M1: Replace --global with --no-global in install command
- [x] M2: Route omp/hermes through pi rulesync surrogate
- [x] M3: Drop ../ from marketplace allow check
- [x] M4: Fix bin path to src/index.ts
- [x] Add regression tests for M1-M4
- [x] Verify: typecheck clean, 36 tests pass (install + marketplace + index)

### Testing

- Command: `bun test apps/cli/tests/commands/install.test.ts apps/cli/tests/marketplace.test.ts apps/cli/tests/index.test.ts`
- Result: 36 pass / 0 fail
- Evidence: --no-global flag parsed correctly, omp targets invoke rulesync, marketplace ../ blocked, bin resolves


### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References


