---
name: Make cc command-refine ready to replace rd3 command-refine
description: Make cc command-refine ready to replace rd3 command-refine
status: Done
updated_at: 2026-06-21T23:30:00.000Z
folder: docs/tasks
type: task
feature-id: ""
priority: high
tags: ["cc-commands","refine","dogfood","migration","rd3-parity"]
impl_progress:
  planning: complete
  design: complete
  implementation: complete
  review: complete
  testing: complete
---

## 0058. Make cc command-refine ready to replace rd3 command-refine

### Background

Dogfood pair-run /cc:command-refine vs /rd3:command-refine. Same SHARED-ENGINE gaps as agent-refine (operations/refine.ts type-agnostic): R1 validation-error early-return makes auto-apply dead code, R3 TODO placeholders degrade score, R4 suggest/flag dims never fixed, R2 no --dry-run, R5 wrapper doc-drift in plugins/cc/commands/command-refine.md (false 'LLM content improvement' claim + 'to file' --save). Commands are file-based (.md). This task tracks the COMMAND slice: the core engine fix is shared with agent-refine (0057) — register --dry-run on apps/cli/src/commands/command.ts, fix the command-refine wrapper, add command-type regression. Depends on 0057.


### Requirements

Inherit 0057 decisions (R1/R3 reorder + real defaults; R2 --dry-run; R5 honest wrapper). This task: register --dry-run on the command refine subcommand (apps/cli/src/commands/command.ts), fix plugins/cc/commands/command-refine.md drift, confirm a command with a structural error gets a real fix (not TODO) and --dry-run previews without writing. Gates: bun run lint, bun run test (no skips, command-type regression), bun run build, git clean. DOCS SYNC (CLAUDE.md mandate): the new --dry-run flag touches the CLI command/flag surface — update docs/04_DESIGN.md (and docs/design/design-doc-phase2.md) in the SAME commit. Do NOT flip /command-refine alias until parity confirmed AND global binary ships.


### Q&A



### Design

Per-type slice. SHARED engine fix (R1 reorder+real-defaults, R2 --dry-run) lands in **task 0057**
(`apps/cli/src/operations/refine.ts`); this task CONSUMES it for the command type. Depends on 0057.

## Pair-run evidence
`/cc:command-refine` vs `/rd3:command-refine`: same shared-engine gaps (early-return dead auto-apply,
TODO placeholders, no --dry-run, suggest/flag never fixed) + command-wrapper doc-drift.

## Work Items
- **C1** Register `--dry-run` on the command refine subcommand (`apps/cli/src/commands/command.ts`).
- **C2** Fix `plugins/cc/commands/command-refine.md`: drop false 'LLM content improvement' claim,
  correct --save to 'evaluation store', add --dry-run to argument-hint.
- **C3** Command-type regression: a command with a structural error gets a real fix (not TODO), refine
  never lowers score, --dry-run writes nothing. Commands are file-based (no dir resolution).

## Acceptance
command refine on a broken command → real fix, no 'fix validation errors' dead-end; --dry-run previews
without writing; wrapper claims match reality. Gates green.

## Do-not-drift
No engine changes beyond 0057 — flag registration + wrapper + tests only. Coordinate alias/deployment.


### Solution

Consume the 0057 shared-engine fix (R1 reorder + R3 real defaults + R2 --dry-run) for the **command** type:

- **C1 — Register `--dry-run` on `command refine`** (`apps/cli/src/commands/command.ts`): mirror agent.ts. Import `addDryRunOption` from helpers; add `dryRun?: boolean` to `commandRefine` opts and the register action; wrap the refine subcommand registration with `addDryRunOption(...)`; forward `dryRun` into `refine('command', ...)`.
- **C2 — Wrapper doc-drift fix** (`plugins/cc/commands/command-refine.md`): drop the false "LLM content improvement" claim (refine is structural only); correct `--save` to "Persist the evaluation to the evaluation store" (not "to file"); add `--dry-run` to argument-hint + Arguments table + a preview example. Mirror the post-0057 `agent-refine.md`.
- **C3 — Command-type regression** (`apps/cli/tests/operations/refine.test.ts`): command's required field set is `['description']`. Add a regression: a command missing `description` (with a body H1) gets a real humanized default, not TODO; refine is monotonic (post >= pre); `--dry-run` leaves the file byte-identical.

### Plan

- [x] Consume 0057 engine (already landed, Done)
- [x] Register --dry-run on command.ts refine subcommand (C1)
- [x] Fix command-refine.md wrapper drift (C2)
- [x] Add command-type regression test (C3)
- [x] Sync docs/help/cmd_command.md + docs/help/cmd_agent.md refine section with --dry-run
- [x] Gate: bun run lint / test / build + git clean
- [ ] Do NOT flip /command-refine alias until ship + parity confirmed (out of scope for this task)

### Review

**Verdict: PASS** (SECU + requirements traceability, 2026-06-21)

| # | Acceptance criterion | Evidence |
|---|---|---|
| C1 | `--dry-run` on command refine | `command.ts:86,89,226-232`; `command refine --help` lists `--dry-run` |
| C2 | Wrapper drift fixed | `command-refine.md` rewritten: structural-only claim, "evaluation store", `--dry-run` in hint/table/example |
| C3a | Broken command → real fix | E2E: missing `description` → `Deploy Prod` (H1-derived), 0.42→0.66, no TODO |
| C3b | Monotonic (never lower score) | Regression asserts `postScore >= preScore`; E2E +0.25 |
| C3c | `--dry-run` writes nothing | Regression + E2E: byte-identical, no `.bak` |
| Docs | CLI surface sync (CLAUDE.md) | `cmd_agent.md` refine table + `cmd_command.md` example carry `--dry-run`; `04_DESIGN.md`/`design-doc-phase2.md` already current via 0057 |
| Gates | lint/test/build/git | 978/0 tests, lint clean, build OK, 7-file surgical diff |
| Do-not-drift | No engine changes beyond 0057 | Zero touches to `refine.ts` |

SECU: no new trust-boundary inputs, no error suppression, no secrets, no skipped tests. Monotonic guard inherited from 0057.

---

## Re-verification — 2026-06-21 (`/rd3:dev-verify 0058 --force --fix all`)

**Verdict: PASS** (Phase 7 SECU + Phase 8 traceability, re-audit of Done task via `--force`)

**Scope:** commit `4965647` (7 files). **Gate:** `bun run lint` clean · `bun run test` 978/0 · `bun run build` OK (3.43 MB).

**Phase 8 — traceability:** all requirements MET (C1, C2, C3a-c, Docs, Gates, Do-not-drift). No unmet requirements, no scope drift. `--dry-run` confirmed in `command refine --help`.

**Phase 7 — SECU findings:** no P1/P2. One P3 found and FIXED.

| # | Title | Dimension | Location | Resolution |
|---|---|---|---|---|
| 1 | `handleCommandRefine` opts type omitted `dryRun?: boolean` | Correctness (type safety) | `command.ts:161-168` | **FIXED** — added `dryRun?: boolean` to the handler's opts type. Runtime was already correct (spread forwarded it; test at `command.test.ts:135` green); fix closes the type-contract gap so the CLI-action boundary type-checks `dryRun`. |

**Fix-pass 2026-06-21:** 1 fixed (P3 type-contract), 0 failed, 0 skipped. Gate re-run after fix: lint clean, 978/0 tests. Working tree carries a single type-only edit to `command.ts` (not yet committed).


### Testing

- Command: `bun run test` (full suite)
- Scope: all 58 test files; new cases in `apps/cli/tests/operations/refine.test.ts` (command-type regression) + `apps/cli/tests/commands/command.test.ts` (dryRun forwarding + `--dry-run` flag registration)
- Result: **978 pass / 0 fail**; coverage 98.63% lines / 99.69% funcs (threshold 90%); `command.ts` 100/100
- Evidence: artifact://40 (full suite output); E2E smoke — `command refine broken.md --auto` → 0.42→0.66 real fix; `--dry-run` → byte-identical + no backup
- Lint: `bun run lint` clean; Build: `bun run build` OK (3.43 MB bundle)
- Next action: none




### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References


