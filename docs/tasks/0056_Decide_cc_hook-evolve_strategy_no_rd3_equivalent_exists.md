---
name: Decide cc hook-evolve strategy (no rd3 equivalent exists)
description: Decide cc hook-evolve strategy (no rd3 equivalent exists)
status: Testing
created_at: 2026-06-21T20:57:07.001Z
updated_at: 2026-06-22T04:29:02.558Z
folder: docs/tasks
type: task
feature-id: ""
priority: medium
tags: ["cc-hooks","evolve","dogfood","design-decision","missing-command"]
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0056. Decide cc hook-evolve strategy (no rd3 equivalent exists)

### Background

Dogfood goal was /cc:hook-evolve vs /rd3:hook-evolve, but NEITHER EXISTS. (1) cc has NO hook-evolve wrapper (plugins/cc/commands/ has agent/command/magent/skill-evolve only — verified). (2) rd3 has NO hook-evolve either (only hook-emit/list/setup/validate). (3) The shared evolve engine (operations/evolve.ts) is built on EVALUATION-HISTORY trend analysis (computeTrends over saved evaluations, declining/flat-low → proposed changes). Hooks were only made evaluable in task 0051 (hook evaluate scores hooks.json: correctness/event-coverage/safety/pattern-match). So a hook evolution loop is now THEORETICALLY possible (trend the safety/coverage scores over time), but its VALUE is unclear: hooks.json is terse config, not prose; the highest-value signal (safety) is a binary scan, not a slowly-drifting quality narrative; and applying auto-changes to a security-critical hooks.json (the F024 double-loop gate would rewrite shell commands) is risky. Like task 0051 (hook-evaluate), this is a DESIGN+DECIDE task, NOT a replacement — there is nothing to replace, and forcing an evolve loop onto config may add little.


### Requirements

DESIGN DECISION REQUIRED (operator-confirmed shape: design+decide, like 0051). Assess whether a hook evolution loop is worth building given: hooks.json is config not prose; the F024 gate auto-rewriting security-critical shell commands is high-risk; hook evaluate (0051) only just exists so there is little/no evaluation history to trend. Produce a recommendation: (A) build hook-evolve on hooks.json evaluation history with the safety gate kept strict and apply gated behind explicit --confirm; (B) de-scope hook-evolve entirely and document why (hooks evolve by hand-editing config + re-validating, not by longitudinal trend); (C) lightweight --analyze-only for hooks (surface safety/coverage trend, NO auto-apply). Whichever: no false capability claims; if de-scoped, ensure no wrapper/help advertises hook-evolve. This task is LOWER priority than 0052-0055 and has NO user-facing command to break. Gates if any code ships: bun run lint, bun run test (no skips), bun run build, git clean.


### Q&A

Design+decide task (mirrors task 0051 hook-evaluate). NOT a replacement — neither cc nor rd3 has
hook-evolve. Verified: `plugins/cc/commands/` has agent/command/magent/skill-evolve only; rd3 has
hook-emit/list/setup/validate, no evolve.

## Why this is a decision, not a build
The shared evolve engine (`operations/evolve.ts`) is built on EVALUATION-HISTORY trend analysis
(`computeTrends` over saved evaluations → declining/flat-low dims → proposed changes). Three frictions
for hooks:
1. Hooks.json is terse CONFIG, not prose — little to "improve" via description rewrites (the seed path
   targets `frontmatter.description`, which hooks.json has none of).
2. The highest-value hook dimension (safety, task 0051) is a binary danger scan, not a slowly-drifting
   quality narrative — trends over it are near-meaningless.
3. The F024 double-loop gate would auto-REWRITE shell commands in a security-critical hooks.json —
   high blast radius for an auto-apply loop.
4. hook evaluate only landed in 0051, so there is little/no evaluation history to trend yet.

## Options
- **A** Build hook-evolve on hooks.json evaluation history; keep safety strict; apply behind `--confirm`.
- **B** De-scope hook-evolve; document that hooks evolve by hand-edit + re-validate, not by trend. Ensure
  no wrapper/help advertises a hook-evolve that doesn't exist.
- **C** Lightweight `--analyze`-only for hooks (surface safety/coverage trend; NO auto-apply).

## DECISION (operator-confirmed 2026-06-21): C — analyze-only, no auto-apply.
Add a lightweight `--analyze`-only hook surface that surfaces the safety/coverage trend from hook
evaluation history; NO file mutation, NO proposal write, NO apply path. Rationale: an auto-apply
evolution loop over security-critical shell config is not worth the blast radius, but an analyze-only
read gives a quality signal cheaply and reuses computeTrends + the 0051 evaluator. NOT option A
(no auto-rewrite of hooks.json). Implementation must NOT advertise apply/history/rollback for hooks.

## Acceptance
`hook ... --analyze` prints the safety/coverage trend from evaluation history; writes nothing, mutates
nothing, exposes no apply/history/rollback. No wrapper or help text claims an apply-capable hook-evolve.
Gates if code ships: bun run lint, bun run test (no skips), bun run build, git clean.


### Design

Design+decide task (mirrors task 0051 hook-evaluate). NOT a replacement — neither cc nor rd3 has
hook-evolve. Verified: `plugins/cc/commands/` has agent/command/magent/skill-evolve only; rd3 has
hook-emit/list/setup/validate, no evolve.

## Why this is a decision, not a build
The shared evolve engine (`operations/evolve.ts`) is built on EVALUATION-HISTORY trend analysis
(`computeTrends` over saved evaluations → declining/flat-low dims → proposed changes). Three frictions
for hooks:
1. Hooks.json is terse CONFIG, not prose — little to "improve" via description rewrites (the seed path
   targets `frontmatter.description`, which hooks.json has none of).
2. The highest-value hook dimension (safety, task 0051) is a binary danger scan, not a slowly-drifting
   quality narrative — trends over it are near-meaningless.
3. The F024 double-loop gate would auto-REWRITE shell commands in a security-critical hooks.json —
   high blast radius for an auto-apply loop.
4. hook evaluate only landed in 0051, so there is little/no evaluation history to trend yet.

## Options
- **A** Build hook-evolve on hooks.json evaluation history; keep safety strict; apply behind `--confirm`.
- **B** De-scope hook-evolve; document that hooks evolve by hand-edit + re-validate, not by trend. Ensure
  no wrapper/help advertises a hook-evolve that doesn't exist.
- **C** Lightweight `--analyze`-only for hooks (surface safety/coverage trend; NO auto-apply).

## Recommendation
Lean B or C. An auto-apply evolution loop over security-critical shell config is hard to justify; an
analyze-only surface (C) gives a quality signal without the rewrite risk. Operator to confirm A/B/C.

## Acceptance
Decision recorded with rationale. If C: `--analyze`-only hook surface, no apply. If B: documented
de-scope, no false claims. If A: gated build with strict safety + `--confirm`.


### Solution

**Approach: analyze-only surface for hooks, apply/history/rollback blocked.**

The shared `evolve()` engine already supports `--analyze` for all content types (G2/A2, task 0052). For hooks, the apply-capable paths (`--propose-only`, `--accept`, `--reject`, `--ingest`, `--history`, `--rollback`) must be gated off per decision C.

**Two-layer fix:**

1. **Command layer** (`commands/hook.ts`): Replace `addEvolveOptions` on `hook evolve` with a hook-specific `addHookEvolveOptions` that only registers `--target`, `--from`, `--analyze`, `--json`. The apply/history/rollback flags are never advertised in help text.

2. **Engine layer** (`operations/evolve.ts`): Add a `guardHookAnalyzeOnly()` check at the top of `evolve()` that refuses `--history`, `--rollback`, `--propose-only`, `--accept`, `--reject`, `--ingest` when `type === 'hook'`. Defense-in-depth: even if a user passes the flag via a raw API call, the engine rejects it.

**No new files** — both changes are surgical edits to existing files. Tests cover both layers.


### Plan

**Decision C confirmed (2026-06-21). Implementation plan:**

1. `commands/helpers.ts`: Add `addHookEvolveOptions(cmd)` — registers only `--target`, `--from`, `--analyze`, `--json` (no apply/history/rollback flags).
2. `commands/hook.ts`: Replace `addEvolveOptions` with `addHookEvolveOptions` on `hook evolve`. Update description to "Analyze hook evaluation trends (analyze-only, no apply)". Update `hookEvolve` handler + `evolveHook` inner fn to only forward analyze-safe opts.
3. `operations/evolve.ts`: Add `guardHookAnalyzeOnly(type, opts)` at top of `evolve()` — emits `echoError` and returns zero result if hook + any apply/history/rollback opt is set.
4. Tests: `evolve.test.ts` — add "evolve — hook type, analyze-only (0056)" describe block covering: `--analyze` works, `--history`/`--rollback`/`--propose-only`/`--accept`/`--reject`/`--ingest` all rejected for hooks. `hook.test.ts` — verify `hook evolve --help` does NOT list apply/history/rollback flags.
5. Gates: `bun run lint`, `bun run test`, `bun run build`, `git status` clean.


### Review

**Verdict: PASS**

_SECU review — 2026-06-22_

**S — Security (PASS):** The change restricts hook evolve to analyze-only, preventing auto-rewrite of security-critical hooks.json shell commands (F024 double-loop gate risk). The `isHookApplyCapableOpt` guard fires before any DB access or file mutation. No new security risks.

**E — Correctness (PASS):** `--analyze` prints the safety/coverage trend from evaluation history (test: "=== Evolution Analysis ===", "Score:", "declining", no proposal written). All 6 apply-capable opts are rejected at both layers. 1020 tests pass, 0 fail. Coverage: 99.69% funcs / 98.76% lines aggregate, all files above 90%.

**C — Architecture (PASS):** Two-layer defense follows existing `addEvolveOptions` pattern. `addHookEvolveOptions` is surgical — only registers `--target/--from/--analyze/--json`. `isHookApplyCapableOpt` is a pure function, testable in isolation. No new files, no new abstractions.

**U — Usability (PASS):** Help text says "Analyze hook evaluation trends (analyze-only, no apply)" — honest, no false capability claims. No apply/history/rollback advertised.

**Traceability — acceptance criteria:**
1. ✅ `hook evolve --analyze` prints safety/coverage trend from evaluation history (test: `--analyze prints trend summary for hooks`)
2. ✅ Writes nothing, mutates nothing (test: `r.proposalPath === ''`, `r.changesApplied === 0`)
3. ✅ Exposes no apply/history/rollback (test: flag verification — `--propose-only`/`--accept`/`--reject`/`--ingest`/`--margin`/`--history`/`--rollback`/`--confirm` NOT registered)
4. ✅ No wrapper or help text claims apply-capable hook-evolve (test: description contains "analyze-only")
5. ✅ Gates: lint clean, 1020 tests pass (no skips), build succeeds, git clean after commit

**Changed files (7):**
- `apps/cli/src/commands/helpers.ts` — added `addHookEvolveOptions`
- `apps/cli/src/commands/hook.ts` — switched `hook evolve` to `addHookEvolveOptions`, updated handler/description
- `apps/cli/src/operations/evolve.ts` — added `isHookApplyCapableOpt` guard
- `apps/cli/tests/commands/content-command-modules.test.ts` — updated `hookEvolve` call to analyze-only signature
- `apps/cli/tests/commands/hook.test.ts` — added flag verification tests
- `apps/cli/tests/operations/evolve.test.ts` — added 10 hook analyze-only tests
- `docs/tasks/0056_*.md` — Solution, Plan, Review, Testing sections


### Testing

_Testing — 2026-06-22T04:15:00Z_

**Test run:** `bun run test` → 1020 pass, 0 fail, 2563 expect() calls, 58 files.

**New tests (12 total):**

Engine-level (`apps/cli/tests/operations/evolve.test.ts` — "evolve — hook type, analyze-only (0056)"):
1. `--analyze prints trend summary for hooks without writing a proposal (0056 C)` — verifies trend table, score, "declining", no proposal
2. `--analyze works with a single hook evaluation (0056 C)` — single-eval edge case
3. `--propose-only is rejected for hooks (0056 C — analyze-only)` — stderr contains "analyze-only", no proposal
4. `--accept is rejected for hooks (0056 C — analyze-only)` — zero result
5. `--reject is rejected for hooks (0056 C — analyze-only)` — zero result
6. `--ingest is rejected for hooks (0056 C — analyze-only)` — zero result
7. `--history is rejected for hooks (0056 C — analyze-only)` — zero result
8. `--rollback is rejected for hooks (0056 C — analyze-only)` — zero result, file unmodified
9. `isHookApplyCapableOpt detects apply-capable options` — pure function: 11 assertions covering all opts

Command-level (`apps/cli/tests/commands/hook.test.ts` — "hook evolve — analyze-only surface (0056)"):
10. `exposes --analyze but not --history/--rollback/--propose-only/--accept/--reject/--ingest` — flag verification
11. `describes hook evolve as analyze-only` — description check

Updated test (`apps/cli/tests/commands/content-command-modules.test.ts`):
12. `hookEvolve` call updated from `{ proposeOnly: true, accept: 'a', reject: 'b' }` to `{ analyze: true }`

**Coverage:** 99.69% functions / 98.76% lines aggregate. All files above 90/90 threshold.

**Gates:**
- `bun run lint` — clean (biome + typecheck)
- `bun run test` — 1020 pass, 0 fail, no skips
- `bun run build` — 768 modules bundled, exit 0


### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References


