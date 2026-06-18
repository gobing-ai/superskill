---
name: Binary on PATH and Phase 3 verification
description: Binary on PATH and Phase 3 verification
status: Done
created_at: 2026-06-17T22:29:14.161Z
updated_at: 2026-06-18T04:32:23.184Z
folder: docs/tasks
type: task
feature-id: F020
priority: high
estimated_hours: 2
dependencies: ["0023","0024","0025","0026"]
tags: ["phase3","verification","binary","gate"]
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0027. Binary on PATH and Phase 3 verification

### Background

Closing feature: establish and EXERCISE the path by which the global superskill binary resolves on PATH (design D2), so the rewritten plugin commands (F017/F018) actually run, then run the Phase 3 exit gate (design §6). If superskill does not resolve on PATH, every rewritten invocation fails at runtime — the single thing that can silently make the whole phase non-functional. Verified: apps/cli/package.json bin is {superskill: dist/index.js} (name=superskill, target=dist/index.js); package publishes as @gobing-ai/superskill (v0.1.3 live). Gates on F016-F019; run last. Design: design-doc-phase3.md §6, D2. Owning feature: F020.


### Requirements

- [x] **R1** — Dev binary path exercised → **MET** | `which superskill` → `/Users/robin/.bun/bin/superskill`; `bun run build` emits `apps/cli/dist/index.js`
- [x] **R2** — Bare `superskill agent validate <sample>` runs → **MET** | exit 0, output "Valid"
- [x] **R3** — Consumer install documented → **MET** | `README.md:54-66`
- [x] **R4** — No bin field change → **MET** | bin still `{ "superskill": "dist/index.js" }`
- [x] **R5** — Design §6 exit gate, all blocks → **MET** | all 7 blocks pass (re-run)
- [x] **R6** — Root gate green → **MET** | lint 0 · test 462 pass/0 fail · build 0
- [x] **R7** — `git status -s` only intentional → **MET** | 4 intentional files, no CLI regression

**Acceptance commands:**
```bash
bun run build && (cd apps/cli && bun link)
which superskill && superskill agent validate <sample-file>
rg "rd3" plugins/cc/ ; rg "bun .*scripts/.*\.ts" plugins/cc/
find plugins/cc -type d \( -name scripts -o -name templates -o -name tests -o -name emitters -o -name schema \)
ls plugins/cc/commands/ | wc -l
bun run lint && bun run test && bun run build && git status -s
```

**Dependency note:** gates on 0023–0026. Run last.


### Q&A



### Design

**Timestamp:** 2026-06-18T02:30:00Z

This task IS the Phase 3 exit gate (design-doc-phase3.md §6). It verifies the consolidation work from 0023–0026 holds and the global `superskill` binary resolves + runs. No source code changes expected — only a runbook doc note.

**D2 locked mechanism (verified):**
- `apps/cli/package.json` `bin` = `{ "superskill": "dist/index.js" }` (name `superskill`, target built `dist/index.js`)
- **Dev:** `bun run build` (emits `dist/`) then `cd apps/cli && bun link` → `which superskill` resolves
- **Consumers:** `npm i -g @gobing-ai/superskill` (v0.1.3 live)
- If `bun link` doesn't expose the name, fix is ensuring `bun run build` ran first — NOT repointing `bin` to `src/index.ts` (R4)

**Sample file for R2:** `apps/cli/tests/fixtures/phase2/valid-agent.md` — a known-valid agent fixture used by the CLI's own test suite.

**Runbook note location (R3):** `README.md` — add a short "Installation" section with the two commands (dev link + consumer install). README is where a developer will find them; no new tooling, no new file.

**Gate blocks (R5 = design §6, all must pass):**
1. `rg "rd3" plugins/cc/` → zero (F016/0023)
2. `rg "bun .*scripts/.*\.ts" plugins/cc/` → zero (F017/F018/0024+0025)
3. `find plugins/cc -type d \( -name scripts -o -name templates -o -name tests -o -name emitters -o -name schema \)` → empty (F019/0026)
4. `plugins/cc/hooks/hooks.json` valid JSON, no dangling skill refs (F018/0025)
5. `ls plugins/cc/commands/ | wc -l` → 17 (F018/0025)
6. `which superskill` resolves + `superskill agent validate <sample>` runs (D2)
7. Root gate: `bun run lint && bun run test && bun run build` green; `git status -s` clean

**R7 scope guard:** `plugins/` is untracked in git, so `git status -s` shows only `plugins/` (intentional) + the README runbook edit. No CLI source touched — a CLI test regression means accidental out-of-scope edit → revert, don't patch.


### Solution

Mechanism (D2 locked): dev = bun run build (emits dist/) then 'cd apps/cli && bun link'; consumers = npm i -g @gobing-ai/superskill. If bun link does not expose superskill name, fix is to ensure build ran first — NOT to repoint bin to src/index.ts (the .ts entry runs only under Bun; Node consumers need dist/). Add a short runbook note (plugin README or docs/) with the two commands. Then run all 7 §6 gate blocks: (1) rg rd3 plugins/cc/=0, (2) rg bun.*scripts.*.ts plugins/cc/=0, (3) find embedded dirs=empty, (4) hooks.json clean+valid, (5) ls commands=17, (6) which superskill resolves + runs, (7) bun run lint/test/build green + git status clean. If bun run test fails it must be plugin-adjacent only — a CLI test regression means an accidental out-of-scope edit (R3); revert, do not patch.


### Plan

1. **R1 — Build + link binary:** `bun run build` (emits `apps/cli/dist/index.js`), then `cd apps/cli && bun link`. Verify `which superskill` resolves to a path under the bun global bin dir.
2. **R2 — Binary runs:** `superskill agent validate apps/cli/tests/fixtures/phase2/valid-agent.md`. Expect exit 0 (valid fixture) — a real result, not "command not found". Capture exit code + output.
3. **R3 — Runbook note:** Add an "Installation" section to `README.md` with two commands: dev (`bun run build && (cd apps/cli && bun link)`) and consumer (`npm i -g @gobing-ai/superskill`). No new file, no new tooling.
4. **R4 — No package.json change:** Verify `apps/cli/package.json` `bin` field is still `{ "superskill": "dist/index.js" }`. Do NOT repoint to `src/index.ts`.
5. **R5 — Design §6 exit gate (all 7 blocks):** Run each gate block command, record output as evidence:
   - Block 1: `rg "rd3" plugins/cc/` → expect zero hits
   - Block 2: `rg "bun .*scripts/.*\.ts" plugins/cc/` → expect zero hits
   - Block 3: `find plugins/cc -type d \( -name scripts -o -name templates -o -name tests -o -name emitters -o -name schema \)` → expect empty
   - Block 4: `plugins/cc/hooks/hooks.json` valid JSON + no dangling skill refs (`rg "indexed-context|anti-hallucination" plugins/cc/hooks/hooks.json` → none)
   - Block 5: `ls plugins/cc/commands/ | wc -l` → expect 17
   - Block 6: covered by R1+R2
   - Block 7: covered by R6
6. **R6 — Root gate:** `bun run lint && bun run test && bun run build` — all green.
7. **R7 — git status clean:** `git status -s` shows only intentional `plugins/` (untracked) + README runbook edit. No CLI source changes.

**Loop bound:** single pass — this is a verification task, not an implementation loop. If any gate block fails, diagnose root cause (likely an out-of-scope edit or incomplete prior task) rather than patching.


### Review

## Re-Verification — 2026-06-17 (--force --fix all)

**Status:** 0 findings (PASS — confirms prior verdict)
**Scope:** README.md, apps/cli/package.json, scripts/builder.ts (modified source)
**Mode:** verify (Phase 7 SECU + Phase 8 traceability, --focus all)
**Channel:** current (inline)
**Gate:** `bun run lint` → exit 0 · `bun run test` → 462 pass / 0 fail / 99.53% func cov · `bun run build` → exit 0

### Phase 7 — SECU (all dimensions)

No P1/P2/P3/P4 findings on modified source.

- **Security:** No secrets/injection. `scripts/builder.ts` uses Bun tagged-template `$` (auto-escaping); package.json build-path change is security-neutral.
- **Efficiency:** Build-helper only; no hot-path or N+1 concerns.
- **Correctness:** `postbuild` idempotent guard (`scripts/builder.ts:84`) correct; top-level try/catch (`:110`) propagates via `fail()` — no swallowed errors.
- **Usability:** JSDoc + header usage examples present.

### Phase 8 — Requirements Traceability (live re-run)

| Req | Verdict | Evidence (this run) |
|-----|---------|---------------------|
| R1 | MET | `which superskill` → `/Users/robin/.bun/bin/superskill`; `bun run build` emits `apps/cli/dist/index.js` (3.17 MB, 753 modules) |
| R2 | MET | `superskill agent validate apps/cli/tests/fixtures/phase2/valid-agent.md` → "Valid", exit 0 |
| R3 | MET | `README.md:54-66` — "Build and install (development)" + "Consumer install" sections |
| R4 | MET | `apps/cli/package.json` bin unchanged: `{ "superskill": "dist/index.js" }`; build output path matches bin (not repointed to src) |
| R5 | MET | All 7 §6 blocks: (1) rg rd3=0 (2) rg bun-scripts=0 (3) find embedded dirs=empty (4) hooks.json valid + no dangling refs (5) ls commands=17 (6) binary resolves+runs (7) root gate green |
| R6 | MET | lint exit 0 · test 462 pass/0 fail · build exit 0 |
| R7 | MET | `git status -s` → 4 intentional files (README, package.json, builder.ts, task file); no CLI source regression |

### Phase 3 Exit Gate

All 7 blocks pass. Phase 3 (F016–F020) confirmed COMPLETE.

**No fixes applied (--fix all):** verdict PASS, 0 findings to fix.


### Testing

**Timestamp:** 2026-06-18T02:45:00Z

This task IS the Phase 3 exit gate (design-doc-phase3.md §6). All 7 gate blocks run as evidence.

**R1 (binary build+link):** PASS
- `bun run build` → exit 0, emits `apps/cli/dist/index.js` (3.17 MB, 753 modules)
- `cd apps/cli && bun link` → "Success! Registered @gobing-ai/superskill"
- `which superskill` → `/Users/robin/.bun/bin/superskill` (resolves on PATH)
- **Build fix applied:** `apps/cli/package.json` build script output path changed from `../../dist/cli/index.js` → `dist/index.js` (matches bin target). Previously `bun run build` + `bun link` produced a broken binary because the build output went to root `dist/cli/` while `bin` pointed at `apps/cli/dist/index.js`. This was a known bug flagged in task 0016 (Phase 1/2 review) but never fixed.

**R2 (binary runs):** PASS
- `superskill agent validate apps/cli/tests/fixtures/phase2/valid-agent.md` → "Valid", exit 0
- Sample file: `apps/cli/tests/fixtures/phase2/valid-agent.md` (known-valid fixture from CLI test suite)
- **Shebang fix applied:** `scripts/builder.ts` `postbuild` made idempotent — `bun build --target bun` already emits `#!/usr/bin/env bun` as line 1; the old `postbuild` prepended a second shebang → duplicate on line 2 → syntax error at runtime. Fix: skip prepend when file already starts with the shebang.

**R3 (consumer doc):** PASS
- Added "Build and install (development)" + "Consumer install" sections to `README.md:54-66`
- Dev: `bun run build && cd apps/cli && bun link`
- Consumer: `npm i -g @gobing-ai/superskill`

**R4 (no bin field change):** PASS
- `apps/cli/package.json` `bin` field unchanged: `{ "superskill": "dist/index.js" }`
- Build script output path fixed to MATCH the bin target (not repointing bin)

**R5 — design §6 exit gate (all 7 blocks):** PASS
- Block 1: `rg "rd3" plugins/cc/` → exit 1 (zero hits) — F016/0023 ✓
- Block 2: `rg "bun .*scripts/.*\.ts" plugins/cc/` → exit 1 (zero hits) — F017/F018/0024+0025 ✓
- Block 3: `find plugins/cc -type d \( -name scripts -o -name templates -o -name tests -o -name emitters -o -name schema \)` → empty — F019/0026 ✓
- Block 4: `rg "indexed-context|anti-hallucination" plugins/cc/hooks/hooks.json` → exit 1 (none); `json.load` → "valid JSON" — F018/0025 ✓
- Block 5: `ls plugins/cc/commands/ | wc -l` → 17 — F018/0025 ✓
- Block 6: `which superskill` resolves + `superskill agent validate <sample>` runs (exit 0) — D2 ✓
- Block 7: root gate green (see R6) ✓

**R6 (root gate):** PASS
- `bun run lint` → exit 0 (biome check + typecheck clean)
- `bun run test` → 462 pass, 0 fail, 1056 expect() calls, 99.53% func / 98.32% line coverage
- `bun run build` → exit 0 (753 modules bundled)

**R7 (git status clean):** PASS
- `git status -s` shows 4 modified files, all intentional:
  1. `README.md` — R3 runbook note
  2. `apps/cli/package.json` — build script output path fix (R1)
  3. `scripts/builder.ts` — postbuild idempotent shebang fix (R2)
  4. `docs/tasks/0027_*.md` — task file workflow updates
- No CLI source code regression. The 2 build fixes are necessary for the binary to run (R1+R2), not CLI test patches.
- `plugins/` changes from 0023-0026 committed in `9798b77`. Deleted embedded dirs were never git-tracked (untracked on-disk files removed in 0026).

**No new tests** — this is a verification/gate task. The "test" is the exit gate itself (7 blocks above). The build fixes (`scripts/builder.ts`, `apps/cli/package.json`) are covered by existing `bun run test` (462 pass) and `bun run build` (exit 0) — no regression.


### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References

- Design: [design-doc-phase3.md](../design/design-doc-phase3.md) §6 (exit gate), D2
- Feature: [F020](../features/F020-binary-path-verification.md)
- Depends on: 0023, 0024, 0025, 0026
- Binary: apps/cli/package.json:21 (bin name 'superskill')

