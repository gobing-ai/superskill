---
feature_id: F027
title: Surface hook counts in install + validation checklist
phase: 5
status: planned
depends_on: []
deliverables:
  - apps/cli/src/commands/install.ts (InstallResultCounts + accumulate result.hooksCount)
created: 2026-06-17
---

# F027 — Surface hook counts in install + validation checklist

## What

Make `superskill install` **report** the hook configs it already emits. Hooks already generate for
the four rulesync-hook-supported targets — `runRulesync` forwards `'hooks'` to `generate()`
(`rulesync.ts:60`, `install.ts:151`). The install reporting path drops the count: `InstallResultCounts`
(`install.ts:72`) has no `hooksCount` field and the aggregation loop (`install.ts:159–161`) sums only
skills/commands/subagents. Add the field, accumulate `result.hooksCount`, print it.

Plus a small **validation checklist** (design §1.1): confirm rulesync's `HookEvent` maps cleanly to
each ✅ target's native events; confirm the pinned rulesync version accepts `hooks` in
`generate({ features })`.

## Why

The corrected Phase 5 finding (design §0): the earlier "`rulesync.ts:51` hardcodes `hooksCount: 0`,
hooks mapped but not emitted" was a **misread** — line 51 is the no-target early-return, not a stub.
The genuine defect is reporting, not emission. This feature is the small, accurate version of what
the old doc framed as "un-stub the install hook path." Without it, install silently reports 0 hooks
even though native hook config was written (design §6 exit #3).

## Change

### `commands/install.ts` (deliverable)

1. **Extend `InstallResultCounts`** (`install.ts:72`) — add `hooksCount: number` (initialize 0 at
   `install.ts:144`).
2. **Accumulate** — in the rulesync aggregation loop (`install.ts:159–161`, where
   `skillsCount/commandsCount/subagentsCount` are summed), add
   `resultCounts.hooksCount += result.hooksCount`. `result.hooksCount` is already returned by
   `runRulesync` → `generate()`.
3. **Surface** — add hooks to the verbose summary line (`install.ts:165`) and the non-verbose result
   so the user sees the real count.

> **No `rulesync.ts` change** for the ✅ targets. Its `generate()` call already emits and returns
> `hooksCount`/`hooksPaths`. (The Pi/omp/hermes uncovered targets are F028, not this feature.)

### Validation checklist (design §1.1) — record findings, don't redesign

- [ ] **Event-name fidelity** — spot-check rulesync's `HookEvent` → native event mapping is lossless
  for codex/opencode/antigravity-cli/antigravity-ide (e.g. Claude `SessionStart`/`PreToolUse`/`Stop`).
  Reference `vendors/rulesync/src/types/hooks.ts` (the `*_HOOK_EVENTS` per-tool arrays). Flag any
  lossy mapping in a test fixture (the test ships **in this feature's task**); do **not** redesign around it.
- [ ] **rulesync API shape** — confirm the pinned rulesync version accepts `hooks` in
  `generate({ features: [...] })` and the `.rulesync/hooks.json` shape (already wired —
  `rulesync.ts:60`, `install.ts:151`).

### Constraints

- **Surgical** — `install.ts` only; one field + one accumulation + one print. Do not refactor the
  result-counts plumbing or the rulesync loop (R3).
- The §1 coverage table (which targets emit) is already complete in the design — this feature does
  **not** run a discovery pass.

## Acceptance

```bash
# install reports a real hook count for a plugin with hooks.json + a ✅ target
superskill install <plugin> --targets codex --verbose
# → summary line includes "Hooks: N" with N > 0 (was silently 0 before)

# InstallResultCounts carries hooksCount
rg "hooksCount" apps/cli/src/commands/install.ts        # → field + accumulation + print

# rulesync.ts untouched
git diff --name-only apps/cli/src/rulesync.ts           # → empty
```
