---
template: issue
schema_version: 1
name: "harden hook/script stdin payload read: bounded non-blocking reader replacing blocking readFileSync(0)"
description: ""
status: testing
type: issue
profile: standard
feature_id: A
parent_wbs: null
priority: P2
tags: ["bug"]
dependencies: []
created_at: "2026-07-25T04:48:53.609Z"
updated_at: "2026-07-25T05:48:13.525Z"
---

## 0104. harden hook/script stdin payload read: bounded non-blocking reader replacing blocking readFileSync(0)

### Background
`agy` (Antigravity) running `/sp:dev-next 0098 --auto --full` hung mid-run. Both dispatchers —
`superskill script run` and `superskill hook run` — plus `ah_guard.ts`'s direct-invocation path read
their payload synchronously from fd 0. A host that opens fd 0 but never writes and never closes it
makes that read block forever, stalling the agent. In the shipped 0.3.8 bundle the `hook run` path
has no TTY guard at all, so even a manual invocation blocks.

**Correction — which paths are live here.** An earlier revision of this section claimed this project
installs no hooks, citing `.claude/settings.json` → `"hooks": {}`. That was the wrong place to look:
plugin-provided hooks are not registered in `settings.json`. Verified registrations:

- `cc@superskill` — the `superskill` marketplace is a **directory source pointing at this repo**
  (`known_marketplaces.json` → `/Users/robin/xprojects/superskill`), so `plugins/cc/hooks/hooks.json`
  is the live config. It registers a `Stop` hook → `superskill hook run cc anti-hallucination`.
  This hook fired during the very session that produced this task.
- `sp@spur` — installed at **user scope**, so its hooks apply to every project including this one.
  It registers `PreToolUse` on `Write|Edit` → `superskill hook run sp task-write-guard`, plus
  PostToolUse / SessionStart / SessionEnd context hooks.

So the hook path was live here all along, and a Stop hook running at the end of every turn is the
best fit for a hang observed while completing a task. The `script run` path
(`superskill script run cc validate-response`, invoked per the always-on anti-hallucination skill)
is a second reachable route. Both blocked before this fix.

A first repair attempt replaced the blocking read with an event-based reader under a single fixed
50 ms deadline. That removed the hang but introduced a worse failure: the deadline was never re-armed
on incoming data, so a payload written late was dropped and a payload streamed in more than one write
was truncated. Because every runner fails open on an unparseable payload (`runSpTaskWriteGuard`,
`runStopGuard`), a truncated read silently turns a `deny` into an `allow`.
### Requirements
- R1 — A host that holds fd 0 open without writing must not block the dispatcher indefinitely.
- R2 — A payload delivered in more than one write must be read in full, never truncated.
- R3 — The reader must be shared by both dispatchers, not duplicated per command module.
- R4 — The bound must be tunable without a code change, for hosts with unusual piping latency.
- R5 — The staged direct-invocation path (`ah_guard.ts` `import.meta.main`) must get the same
  non-blocking semantics, without importing from `apps/cli` (ADR-024 boundary).
- R6 — The stdin contract, its invariant, and its residual must be documented in `docs/04_DESIGN.md`.
- R7 — Codify the ban so the blocking read cannot silently return: a constraint rule must fail the
  gate on any synchronous fd-0 read in production source or plugin scripts.

### Acceptance Criteria
- AC1 (R1) — Invoking `superskill hook run` with stdin as an open, never-written pipe exits promptly
  instead of hanging; covered by a labelled hang regression test.
- AC2 (R2) — A payload streamed in chunks whose total span exceeds the budget, with each gap under it,
  is returned whole and is `JSON.parse`-able; covered by a labelled truncation regression test on both
  the CLI reader and `readPipedStdin`.
- AC3 (R2, end-to-end) — `hook run sp task-write-guard` on an owned task path returns
  `permissionDecision: deny` for both immediate and chunked delivery of the same payload.
- AC4 (R3) — `script-run.ts` and `hook-run.ts` both import the reader from `apps/cli/src/stdin.ts`;
  neither defines its own and neither imports from the other.
- AC5 (R4) — `SUPERSKILL_STDIN_TIMEOUT_MS` overrides the budget; non-numeric and non-positive values
  fall back to the 250 ms default.
- AC6 (R5) — `ah_guard.ts` contains no `readFileSync(0)`; `readPipedStdin` carries the same idle-rearm
  semantics and is covered by tests.
- AC7 (R6) — `docs/04_DESIGN.md` documents the condition→result table, the idle-vs-deadline invariant,
  the env override, and the first-byte residual.
- AC8 — Full gate green: `bun run lint`, `bun run test` (coverage thresholds met), `bun run build`,
  `bun run spur-check`.
- AC9 (R7) — `.spur/rules/typescript/no-blocking-stdin-read.yaml` fires on `readFileSync(0, …)`,
  `readFileSync(0)`, `readFileSync('/dev/stdin')`, and `readSync(0, …)`, stays silent on real-path
  reads and on the sanctioned idle-budget reader, and is picked up by `recommended-pre-check`
  (rule count 30 → 31).

### Q&A

<!-- Clarifications and triage decisions. Keep empty if none. -->

### Design

<!-- Fix approach and tradeoffs. Keep this short unless the issue changes architecture. -->

### Plan

<!-- Ordered debugging/fix checklist. Fill before moving to todo/wip. -->

### Root Cause
Two distinct defects, one per attempt:

1. **Hang** — a synchronous fd-0 read on a non-TTY pipe held open with no data never returns.
   Verified: an open-but-silent pipe blocks indefinitely; after the fix the same invocation exits in
   ~2 s.
2. **Silent truncation** — a single `setTimeout` deadline set once at read start, never re-armed on
   `data`. Measured through `superskill hook run sp task-write-guard` against a real owned task path
   (this repo owns the runner; the numbers are the runner's, independent of which project installs
   the hook):
   - delivered immediately → `permissionDecision: deny` (correct)
   - delivered at +2 s → payload dropped → **allow** (guard bypassed)
   - streamed in chunks spanning 2 s → truncated JSON → parse failure → **allow** (guard bypassed)

The invariant the first attempt missed: only *idleness* may end the read. A deadline on the whole
read cannot distinguish "host is still writing" from "host will never write".

Note on an early mis-measurement: a probe using a fabricated task path (`0098_x.md`) showed the guard
exiting 0 and briefly looked like a guard bug. It was not — `spur task resolve --strict` correctly
reports an unowned path, so allow was right. Re-probing with a real owned path produced the deny
baseline above.
### Solution
**Change map:**

- `apps/cli/src/stdin.ts:43` (new file) — canonical `readStdinNonBlocking(firstByteMs, idleMs)`. The
  budget is an **idle** timeout re-armed on every chunk, so a multi-write payload is never truncated;
  only a silent stream ends the read. `apps/cli/src/stdin.ts:26` `resolveStdinTimeoutMs` reads
  `SUPERSKILL_STDIN_TIMEOUT_MS` (positive integer; invalid → 250 ms default).
- `apps/cli/src/commands/script-run.ts:4` — dropped its local reader; imports the shared one.
- `apps/cli/src/commands/hook-run.ts:7` — imports from `../stdin` instead of the sibling command
  module, removing the command→command coupling.
- `apps/cli/src/index.ts:7` — `parseAsync()` instead of `parse()`. The `run` actions are now async and
  Commander only propagates async handler rejections through `parseAsync`.
- `plugins/cc/scripts/anti-hallucination/ah_guard.ts:490` — exported `readPipedStdin` with the same
  idle-rearm semantics; `plugins/cc/scripts/anti-hallucination/ah_guard.ts:524` `import.meta.main` no
  longer calls `readFileSync(0)`. Deliberately duplicated rather than imported: the script is staged
  and invoked by path on non-Claude targets (ADR-024), so it may not import from `apps/cli`. A
  keep-in-sync comment sits on both sides.
- `docs/04_DESIGN.md:57` — new "Stdin payload contract" section: condition→result table, the
  idle-vs-deadline invariant and why it is a correctness requirement, the env override, and the
  documented residual.

**Residual, accepted and documented:** a host whose *first* byte arrives later than `firstByteMs`
still has its payload dropped and the runner fails open. This is unavoidable without blocking — the
two cases are indistinguishable from inside the process. Real hosts write at spawn and the payload is
already buffered by the time the runtime boots, so 250 ms is generous in practice;
`SUPERSKILL_STDIN_TIMEOUT_MS` is the escape hatch. Raising the default would tax every hook
invocation against a silent host.

**Constraint rule (R7):** `.spur/rules/typescript/no-blocking-stdin-read.yaml` — `rg` evaluator on
`read(File)?Sync\(\s*(0\s*[,)]|['"]/dev/stdin['"])`, scoped to `apps/**/src`, `packages/**/src`,
and `plugins/**/scripts` (the second offender lived in a plugin script, outside the include set every
other typescript rule uses). Fixtures at `.spur/rules/fixtures/no-blocking-stdin-read/`:
`should-fire.ts` carries all four blocking forms, `should-pass.ts` carries the two legitimate shapes
that must not fire — a real-path read, a path literal containing `0` — plus the sanctioned
idle-budget reader.

Deliberately **not** covered by the rule: the "fixed deadline instead of idle re-arm" defect. A
regex cannot see whether a timer is re-armed on `data`, and a rule that guessed at it would be noise.
That half of the contract is held by the truncation regression tests, which fail loudly if the
re-arm is ever removed. Stating the split explicitly so a future reader does not mistake the rule
for full coverage of this class.

**Drive-by, same gate:** the 8 `noNonNullAssertion` Biome warnings in `source-parser.ts` /
`frontmatter.ts` (vendor-verbatim `match[n]!`) were resolved with `?? ''` — the idiom already used at
`frontmatter.ts:38`. Each site sits inside an `if (match)` on a pattern whose capture group is
mandatory, so the fallback is unreachable and behavior is unchanged. `bun run lint` is now
warning-free instead of warning-tolerant.

### Testing
**Per-Requirement Traceability** (verify run 2026-07-24; every `file:line` re-read this run)

| Req | Status | Evidence |
| --- | --- | --- |
| R1 non-blocking on silent pipe | MET | test `gives up within the budget when a host holds stdin open without writing` (`apps/cli/tests/stdin.test.ts:85`); e2e `hook run sp task-write-guard` with an 8 s silent pipe exits 0 in 2 s |
| R2 multi-write payload read whole | MET | test `accumulates a payload streamed in chunks whose total span exceeds the budget` (`apps/cli/tests/stdin.test.ts:96`); idle re-arm at `apps/cli/src/stdin.ts:43` |
| R3 shared reader | MET | `apps/cli/src/commands/script-run.ts:4` and `apps/cli/src/commands/hook-run.ts:7` both `import { readStdinNonBlocking } from '../stdin'`; no command↔command import remains |
| R4 tunable bound | MET | `apps/cli/src/stdin.ts:26` `resolveStdinTimeoutMs`; `apps/cli/src/stdin.ts:27` reads `SUPERSKILL_STDIN_TIMEOUT_MS`; 3 env tests in `apps/cli/tests/stdin.test.ts` |
| R5 staged path, no apps/cli import | MET | `plugins/cc/scripts/anti-hallucination/ah_guard.ts:497` `readPipedStdin`; `rg readFileSync\(0` over that file returns no match; 4 `readPipedStdin` tests |
| R6 contract documented | MET | `docs/04_DESIGN.md:67` section; `:83` idle-vs-deadline invariant; `:86` env override; `:89` residual |
| R7 codified ban | MET | `.spur/rules/typescript/no-blocking-stdin-read.yaml`; `spur rule run --rule no-blocking-stdin-read` → "All 1 rule passed"; picked up by `recommended-pre-check` (30 → 31) |

**Acceptance Criteria Verification**

| AC | Status | Evidence Type | Evidence |
| --- | --- | --- | --- |
| AC1 hang bounded | MET | test + command | `apps/cli/tests/stdin.test.ts:85`; e2e 8 s silent pipe → exit 0 in 2 s |
| AC2 no truncation, both readers | MET | test | `apps/cli/tests/stdin.test.ts:96`; `plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts` `accumulates chunks whose total span exceeds the idle budget` |
| AC3 e2e deny, immediate + chunked | MET | command | `hook run sp task-write-guard` on an owned task path → `permissionDecision:"deny"` for both deliveries |
| AC4 shared import | MET | static | `script-run.ts:4`, `hook-run.ts:7` |
| AC5 env override + fallback | MET | test | 3 cases: unset → 250, `"1500"` → 1500, `"soon"`/`"0"`/`"-5"` → 250 |
| AC6 no fd-0 read in ah_guard | MET | static + test | no `readFileSync(0` match; `readPipedStdin` covered by 4 tests |
| AC7 design doc complete | MET | static | `docs/04_DESIGN.md:67,83,86,89` |
| AC8 full gate green | MET | command | `bun run autofix && bun run spur-check` EXIT_CODE=0; 31/31 pre-check, 1757 pass / 0 fail, 3/3 post-check, Biome 0 warnings; `bun run build` exit 0 |
| AC9 rule both directions | MET | command | 4 hits on `should-fire.ts`, 0 on `should-pass.ts`; `spur rule run` passes; rule count 31 |

**Defect found and fixed by this verify run.** Running `apps/cli/tests/stdin.test.ts` together with
the ah_guard suite failed: `readPipedStdin > accumulates chunks whose total span exceeds the idle
budget` received `…"stop_hook_active":false}too late`. A test scheduled
`setTimeout(() => process.stdin.emit('data', 'too late'), 300)` that outlived its own test and
injected a stray chunk into the next suite's reader on the shared `process.stdin`. Order-dependent,
so the full-suite run was green and hid it. Removed the leaking case; its branch (first-byte timer
fires with no data) is identical to the retained hang test, which now documents the bounded-drop
residual and why no late emit is scheduled. Re-verified in both file orders and standalone: 90/90,
90/90, 9/9.

Coverage: `apps/cli/src/stdin.ts` 100% functions / 100% lines; `ah_guard.ts` 100% / 98.42%;
suite aggregate 99.86% functions / 99.00% lines (gate >=90%).
### Review

<!-- Filled during review: P1-P4 findings, residual risk, and final disposition. -->

### References

<!-- Links to failing logs, related issues, tasks, docs, or external references. -->

### History
- 2026-07-25T04:52:56.227Z backlog → todo (system)
- 2026-07-25T04:52:57.472Z todo → wip (system)
- 2026-07-25T04:52:58.852Z wip → testing (system)
