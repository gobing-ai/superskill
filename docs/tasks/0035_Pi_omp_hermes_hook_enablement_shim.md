---
schema_version: 1
name: Pi omp hermes hook enablement shim
status: done
type: task
priority: P2
tags: [phase5,hooks,pi,omp,hermes,shim,research]
dependencies: ["0034"]
created_at: 2026-06-17T22:43:35.628Z
updated_at: "2026-08-01T02:25:05.482Z"
feature_id: H8
---

## 0035. Pi omp hermes hook enablement shim

### Background
Give the 3 targets rulesync can't emit hooks for — Pi (maps to rulesync but hooks column blank), omp + hermes (absent from rulesync tool set) — a hook lifecycle as close to Claude Code's as the agent supports. THE ONE GENUINE RESEARCH ITEM in Phase 5 (design §1.2): a mechanism question, not coverage. The §1 coverage table (from vendors/rulesync/README.md:77-107 + TARGET_TO_RULESYNC) shows these uncovered. Closes the gap so 'one hooks.json installs correct native hook config for every supported target' (§6 exit #1) holds — shimmed or documented, NO silent drop (#2). Research before shims (invariant #5). Design: design-doc-phase5.md §1.2, §2.1. Owning feature: H8.
### Requirements
- [x] **R1** — Research note (rung + source + date) for Pi/omp → **MET** | design §1.2, 2026-06-18, @vahor/pi-hooks v0.0.11
- [x] **R2** — Fallback ladder, highest supported rung → **MET** | Pi/omp rung (b), hermes rung (c)
- [x] **R3** — install.ts copy/shim extended → **MET** | install.ts:195-233; hooks.ts emit functions
- [x] **R4** — No silent drop → **MET** | unconditional result loop install.ts:238-240
- [x] **R5** — Hook content untrusted (no eval) → **MET** | JSON verbatim; 2 tests
- [x] **R6** — rulesync owns ✅-target format → **MET** | no rulesync.ts change

**Acceptance:** pi/omp/hermes hook config emitted with explicit per-target message; research note has source+date; rulesync.ts unchanged. 625 pass / 0 fail.

**Out of scope:** 4 ✅ targets (F6); hook emit verb (H9).
### Q&A



### Design

**Research findings (recorded in design-doc-phase5.md §1.2):**

1. **Pi** — Has a native extension system (`pi.on()` for lifecycle events). Extension discovery at
   `~/.pi/agent/extensions/*.ts` (global) and `.pi/extensions/*.ts` (project). The `@vahor/pi-hooks`
   package (v0.0.11, npm, MIT) provides a declarative `.pi/hooks.json` config that runs shell commands
   on Pi lifecycle events (`session_start`, `session_shutdown`, `agent_end`, `tool_call`, `tool_result`, etc.).
   Chosen rung: **(b) superskill-installed shim** — superskill emits `.pi/hooks.json` in `@vahor/pi-hooks`
   format; the user installs `@vahor/pi-hooks` as the shim.

2. **omp** — Pi variant ("Oh My Pi"). Uses `.omp/` paths and Pi's slash dialect. Inherits Pi's extension
   system. Chosen rung: **(b)** — same mechanism as Pi, config at `.omp/hooks.json`.

3. **hermes** — Custom agent, absent from rulesync. Uses opencode as surrogate. Chosen rung: **(c) copy-step**
   — copy canonical `.rulesync/hooks.json` to `.hermes/hooks.json`.

**Implementation approach:**

- New module `apps/cli/src/hooks.ts`: canonical-to-Pi event mapping, conversion, and emission functions.
- `install.ts` Step 4 dispatch loop extended: after skills copy for hermes/omp, and as a new `pi` block,
  call the emit functions. Results collected and printed (no silent drop).
- Event mapping (canonical camelCase → Pi snake_case): `sessionStart`→`session_start`,
  `sessionEnd`→`session_shutdown`, `preToolUse`→`tool_call`, `postToolUse`→`tool_result`,
  `stop`→`agent_end`, `preCompact`→`session_before_compact`. Unsupported events skipped.
- Matcher limitation: `@vahor/pi-hooks` fires tool events for all tools without filtering. Matchers
  are dropped. Documented as acceptable trade-off.
- Hook content untrusted (R5): `hooks.ts` writes JSON verbatim — never evaluates, expands, or executes
  command strings. The emit functions use `JSON.stringify()` and `writeFileSync()` only.

### Solution

Researched Pi's extension system (web search + rulesync vendor analysis). Pi has a native extension system (`pi.on()`) and the `@vahor/pi-hooks` package provides declarative hook config. Chosen rungs: Pi/omp = (b) superskill-installed shim (emit `.pi/hooks.json` / `.omp/hooks.json` in `@vahor/pi-hooks` format); hermes = (c) copy-step (copy canonical hooks.json to `.hermes/hooks.json`). Created `apps/cli/src/hooks.ts` with event mapping (canonical camelCase → Pi snake_case), conversion, and emission functions. Extended `install.ts` Step 4 dispatch: added hook emission for pi (new block), omp (after skills copy), and hermes (after skills copy). Every target gets an explicit hook result message — no silent drop. Hook content is written as JSON data, never evaluated (R5). Research note recorded in design-doc-phase5.md §1.2 with sources + date.


### Plan

- [x] Research Pi extension/hook system (web search + rulesync vendor analysis) — R1
- [x] Record research note in design-doc-phase5.md §1.2 — R1
- [x] Create `apps/cli/src/hooks.ts` (event mapping, conversion, emission functions) — R3
- [x] Extend `install.ts` Step 4 dispatch: pi/omp/hermes hook emission — R3
- [x] Add no-silent-drop output (every target gets explicit hook result) — R4
- [x] Ensure hook content untrusted (JSON verbatim, no eval) — R5
- [x] Write tests: pi/omp/hermes emission, no silent drop, untrusted content, event mapping, edge cases — Testing
- [x] Run `bun run lint && bun run test && bun run build` — all green, coverage ≥90% — Testing

### Review
## Re-Verification — 2026-06-18 (--force --fix all)

**Verdict: PASS** — confirms prior verdict. 0 findings. The one genuine Phase 5 research item is sound.

**Scope:** hooks.ts (new, 208 lines), install.ts (Step 4 dispatch), +hooks.test.ts, +install-hooks.test.ts, design §1.2 note.
**Gate:** lint exit 0 · test 625 pass / 0 fail (99.57% func / 98.37% line) · build exit 0 · hooks.ts 100%/100%.

### Phase 7 — SECU (focus: R5 untrusted hook content)

**Security — clean, with the critical R5 surface verified:**
- **No code execution:** zero `eval`/`exec`/`child_process`/shell/`Function()` in hooks.ts. Hook command strings flow only through `JSON.stringify`/`writeFileSync`/`copyFileSync` — written as inert data, never evaluated or shell-expanded. Two tests assert this (hooks.test.ts:293 module-level, install-hooks.test.ts:317 integration).
- `readCanonicalHooks` parses with `JSON.parse` in try/catch → returns null on malformed input (no crash).
- No secrets, no network, no `any`.
- Paths (`outputRoot`, `targetDir`) are internal constants (`.pi`/`.omp`/`.hermes`), not user-controlled — no traversal vector.

**Correctness:** Event mapping (canonical camelCase → Pi snake_case) covers the 6 mappable events; unsupported events skipped (not silently dropped — surfaced via "no mappable hooks" message). Matcher-drop limitation honestly documented.

**No findings.**

### Phase 8 — Requirements Traceability (live re-run)

| Req | Verdict | Evidence (this run) |
|-----|---------|---------------------|
| R1 | MET | design §1.2 research note (2026-06-18): @vahor/pi-hooks v0.0.11, MIT, source URLs, honest limitation — anti-hallucination rule satisfied |
| R2 | MET | Pi/omp rung (b) @vahor/pi-hooks shim (emitPiStyleHooks); hermes rung (c) copy-step (emitHermesHooks) |
| R3 | MET | install.ts:195-201 (hermes copy), :211-233 (pi/omp emit); hooks.ts emit functions |
| R4 | MET | **Unconditional** result loop install.ts:238-240 prints every target's message regardless of verbose — no silent drop even in non-verbose mode |
| R5 | MET | hooks.ts writes JSON verbatim, never evaluates; 2 untrusted-content tests pass |
| R6 | MET | rulesync.ts unchanged (empty diff); hooks.ts only handles pi/omp/hermes |

36 hook tests pass (hooks.test.ts + install-hooks.test.ts).

### Note
Test count is 625 (task claimed 607) — external sync added tests since authoring; all pass together.

**No fixes applied (--fix all):** verdict PASS, 0 findings.


### Gate
lint exit 0 · 607 pass / 0 fail · build exit 0 · hooks.ts 100% func / 100% line · aggregate 99.57% func / 98.37% line.

### Testing
Tests ship **in this task** (design rule: each task owns its tests — no separate pure-test task).
Last run: 2026-06-18T23:45:00Z.

- [x] `tests/commands/install-hooks.test.ts` (the Pi/omp/hermes half): — 13 tests, 0 fail
  - hermes → hook config emitted via the copy-step (assert present at the expected hermes location). — `emitHermesHooks` test: canonical hooks.json copied to `.hermes/hooks.json`
  - Pi / omp → hook config emitted per the chosen rung (H8 research) **or** the output explicitly states unsupported (rung d) — **no silent drop** (design §6 exit #2). — `emitPiStyleHooks` tests: `.pi/hooks.json` and `.omp/hooks.json` in `@vahor/pi-hooks` format; "no silent drop" test asserts explicit message for all 3 targets
  - The shim never evaluates embedded instructions from external content (invariant #4) — assert a hook `command` carrying instruction-like text is treated as data, not executed/expanded. — "hook content untrusted" test: instruction-like text preserved verbatim, no command substitution
- [x] Fixtures: the shared `tests/fixtures/phase5/` hooks-bearing plugin + expected per-target output for the chosen rung. — `createPluginWithHooks` helper in test file creates hooks-bearing plugin inline
- [x] Coverage for the copy/shim branch contributes to the ≥90% gate. — hooks.ts: 100% funcs / 100% lines; aggregate: 99.57% funcs / 98.37% lines
- [x] No test skipped / `.skip`'d (R12). — 607 pass, 0 fail, 0 skip

(The ✅-target hook-count assertions live in 0034.)

**Test files added/modified:**
- `apps/cli/tests/commands/install-hooks.test.ts` — 13 new tests (pi emission, omp emission, hermes copy, no silent drop, untrusted content, event mapping, edge cases)
- `apps/cli/src/hooks.ts` — new module (event mapping, conversion, emission)
**Full suite:** `bun test --coverage` → 607 pass, 0 fail, 1520 expect() calls, Coverage: 98.37% lines / 99.57% funcs aggregate.
### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |
| code | apps/cli/src/hooks.ts | task-runner | 2026-06-18 |
| code | apps/cli/src/commands/install.ts (modified) | task-runner | 2026-06-18 |
| test | apps/cli/tests/commands/install-hooks.test.ts (extended) | task-runner | 2026-06-18 |
| doc | docs/design/design-doc-phase5.md §1.2 (research note) | task-runner | 2026-06-18 |

### References
- Design: [design-doc-phase5.md](../design/design-doc-phase5.md) §1.2, §2.1
- Feature: [H8](../features/H8_pi-omp-hermes-hook-enablement.md)
- Depends on: 0034
- Code: apps/cli/src/commands/install.ts:132-143 (surrogate/copy step)
- Research note destination: design-doc-phase5 §1.2
### History

- Migrated from legacy format (2026-08-01)
