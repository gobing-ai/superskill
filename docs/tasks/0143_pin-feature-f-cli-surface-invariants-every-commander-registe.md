---
schema_version: 1
name: "Pin feature F CLI-surface invariants: every Commander-registered command documented in 04_DESIGN + stdout.write testability"
status: done
template: feature-impl
created_at: 2026-09-14T17:43:19.883Z
updated_at: "2026-09-14T17:44:45.413Z"
feature_id: F

---

## 0143. Pin feature F CLI-surface invariants: every Commander-registered command documented in 04_DESIGN + stdout.write testability

### Background

`spur feature check F` reports two DD-09 uncovered-scenario findings: no linked task covers the feature's two CLI-surface invariant scenarios ("Every CLI command is wired through Commander in apps/cli and documented in 04_DESIGN." / "CLI stdout output remains testable via process.stdout.write."). The findings surfaced during task 0141's shippable gate (verify `--fix all`, 2026-09-14).

Both invariants already hold in the codebase — `createProgram()` (`apps/cli/src/cli.ts:16`) wires every command through Commander, `docs/04_DESIGN.md` carries a Command surface section naming every family, and the suite spies on `process.stdout.write` in 8+ files (repo convention, ADR: testable output). What is missing is executable *cover*: a linked task whose AC carries the scenario titles and pins the invariants with tests, so feature-check satisfaction can mark them MET.

### Requirements

- [x] R1. A test proves every top-level command registered on the Commander tree (`createProgram().commands`) is documented in `docs/04_DESIGN.md`, so a new command that lands without its design-doc entry fails the suite.
- [x] R2. A test proves the CLI program's primary output is captured by a `process.stdout.write` spy with no log-format coupling.
- [x] R3. The task's Acceptance Criteria carry the two feature-F scenario titles verbatim, and the verdict artifact marks both rows MET with the R1/R2 tests as evidence (DD-09 cover).
- [x] R4. No regression: existing `cli-smoke.test.ts` cases pass unedited; `bun run lint` green.

**Out of scope / non-goals**

- Per-command behavioral tests (owned by each command's own test files).
- Rewriting 04_DESIGN's Command surface section (it already names every family — verified this run).
- Pinning subcommand-level documentation (the scenario's granularity is command families; the pin asserts top-level names).

### Acceptance Criteria

- **AC1 (automated — R1)** — `apps/cli/tests/cli-smoke.test.ts` asserts every Commander-registered top-level command name appears in `docs/04_DESIGN.md`; the case passes.
- **AC2 (automated — R2)** — `apps/cli/tests/cli-smoke.test.ts` asserts `--help` output is captured through a `process.stdout.write` spy (`Usage: superskill` present); the case passes.
- **AC3 (no regression — R4)** — the pre-existing `cli-smoke.test.ts` cases pass unedited and `bun run lint` is green with no skipped tests.

```gherkin
Scenario: Every CLI command is wired through Commander in apps/cli and documented in 04_DESIGN.
  Given a new or changed CLI command, flag, or environment variable
  When it lands
  Then apps/cli wires it via Commander and docs/04_DESIGN.md carries its shape in the same commit

Scenario: CLI stdout output remains testable via process.stdout.write.
  Given any command that emits primary output
  When tests assert on that output
  Then they spy on process.stdout.write without coupling to log formatting
```

### Q&A

<!-- CLOSED decisions from refinement: what was chosen and why, what was deferred and on what
     condition. Not a parking lot for open questions — an unanswered question here means the task
     is not ready to hand off. Keep empty if none. -->

### Design

Extend `apps/cli/tests/cli-smoke.test.ts` (the existing CLI-program smoke suite — no new file) with one describe block of two cases:

1. R1: `createProgram().commands.map(name)` (minus Commander's implicit `help`) — each name must appear in `docs/04_DESIGN.md` as `` `superskill <name>` ``. Enumerating the live Commander tree (not a hardcoded list) is what keeps the pin honest when commands are added.
2. R2: `spyOn(process.stdout, 'write')` + `createProgram().exitOverride().parseAsync(['--help'], { from: 'user' })`, swallowing only `commander.helpDisplayed`; assert the captured text contains `Usage: superskill`.

Anti-patterns / do-not: hardcode the command list (rots silently); spy on console.log (the convention is stdout.write); touch `apps/cli/src` (the invariants hold — this task pins, it does not change behavior).

### Plan

<!-- Ordered implementation checklist. Fill before moving to todo/wip. -->

### Solution

All changes in `apps/cli/tests/cli-smoke.test.ts`; production untouched.

- `apps/cli/tests/cli-smoke.test.ts:1-4` — imports gain `spyOn`, `readFileSync`, `join`.
- `apps/cli/tests/cli-smoke.test.ts:28-39` — R1 case: enumerates the live Commander tree via `createProgram().commands` and asserts every top-level name appears in `docs/04_DESIGN.md` as `` `superskill <name>` ``; all 9 families (`install`, `update`, `doctor`, `agent`, `skill`, `command`, `hook`, `magent`, `script`) pass.
- `apps/cli/tests/cli-smoke.test.ts:42-60` — R2 case: `process.stdout.write` spy captures the `--help` output (`exitOverride` + `commander.helpDisplayed` swallow), asserting `Usage: superskill` arrives through the spy.

The two pre-existing smoke cases are unedited (R4).

### Testing

**Pipeline verify results**

- Verdict: PASS (from verdict artifact)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| R1 | MET | `apps/cli/tests/cli-smoke.test.ts:28-39` — enumerates the live Commander tree (`createProgram().commands`, implicit `help` filtered) and asserts every top-level name appears in `docs/04_DESIGN.md` as `` `superskill <name>` ``; all 9 families pass this run (`install`, `update`, `doctor`, `agent`, `skill`, `command`, `hook`, `magent`, `script`). |
| R2 | MET | `apps/cli/tests/cli-smoke.test.ts:42-60` — `process.stdout.write` spy captures the `--help` output (`exitOverride`, only `commander.helpDisplayed` swallowed); asserts `Usage: superskill` and a command name arrive through the spy. Passed this run. |
| R3 | MET | This task's AC section carries both feature scenario titles verbatim (gherkin block); the AC rows below key on those exact titles and mark both MET with the R1/R2 tests as executable evidence. |
| R4 | MET | The two pre-existing smoke cases (`creates a program without errors`, `registers all 5 type commands`) pass unedited — 4 pass / 0 fail this run; biome clean; no `.skip`/`.todo`/`.only`. |

| Acceptance Criteria | Status | Evidence Type | Evidence |
|---------------------|--------|---------------|----------|
| Scenario: Every CLI command is wired through Commander in apps/cli and documented in 04_DESIGN. | MET | test | `apps/cli/tests/cli-smoke.test.ts:28-39` — every name on the live Commander tree is asserted present in `docs/04_DESIGN.md`; passed this run (a command landing without its doc entry now fails the suite). |
| Scenario: CLI stdout output remains testable via process.stdout.write. | MET | test | `apps/cli/tests/cli-smoke.test.ts:42-60` — primary program output captured purely through a `process.stdout.write` spy; passed this run. Corroborating convention: 8+ suites spy on `process.stdout.write` (`apps/cli/tests/commands/update.test.ts`, `install-manifest.test.ts`, `install.test.ts`, …). |
| AC3 (no regression) | MET | command | This run: `bun test apps/cli/tests/cli-smoke.test.ts` 4 pass / 0 fail with the pre-existing cases unedited; `bunx biome check` clean. |
- Coverage: N/A (verdict-based; verify pipeline does not measure code coverage)

### Review

<!-- spur:record-review -->

**SECU findings** (pipeline verify step — verdict: PASS)

| Priority | Dimension | Location | Finding |
|----------|-----------|----------|----------|
| P4 | spur task check | — | task check passed |
| P4 | task-check | — | `spur task check 0143` → PASS (this run, after record). |
| P4 | scope-creep | — | Diff is exactly the Design's two cases in one existing test file; the named anti-patterns (hardcoded command list, console.log spy, touching `apps/cli/src`) are absent. |
| P4 | design-conformance | — | 2/2 design claims DONE at the cited anchors; no deviations. |
| P4 | Priority | — | Location |
| P4 | P4 | — | `apps/cli/tests/cli-smoke.test.ts:28-39` |
| P4 | P4 | — | `apps/cli/tests/cli-smoke.test.ts:42-60` |
| P4 | P4 | — | `apps/cli/tests/cli-smoke.test.ts:24` |
| P4 | P4 | — | — |
| P4 | evidence-rule-pass | — | All behavior-bearing AC rows have executable evidence or are explicitly non-behavioral. |

### References

<!-- Links to the parent feature, design docs, related tasks, or external references. -->

### History

- 2026-09-14T17:44:22.568Z backlog → todo (system)
- 2026-09-14T17:44:22.778Z todo → wip (system)
- 2026-09-14T17:44:39.300Z wip → testing (system)
- 2026-09-14T17:44:45.413Z testing → done (system)

