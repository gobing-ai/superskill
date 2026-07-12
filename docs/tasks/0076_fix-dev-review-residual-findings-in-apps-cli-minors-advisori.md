---
schema_version: 1
name: "Fix dev-review residual findings in apps/cli (minors, advisories, architecture deepening C1-C3)"
status: done
template: standard
created_at: 2026-07-11T23:08:28.183Z
updated_at: "2026-07-12T00:29:31.393Z"
---

## 0076. Fix dev-review residual findings in apps/cli (minors, advisories, architecture deepening C1-C3)

### Background
A full `/sp:dev-review apps --focus all --fix all --auto --force` ran on 2026-07-11 across all 29 source files of `apps/cli` (~6,650 lines), following the same-day `packages/core` review (task 0075). The blocker and major SECUA findings were fixed in-session (logged as bug-043..bug-046 in `.wolf/buglog.json`): marketplace-name path traversal into the `rmSync` cache clear (probe-confirmed to resolve to `$HOME`), discarded `claude`/`omp` subprocess exit codes, quote/newline injection in generated OMP hook modules, and the interactive-evolve ENOENT crash after a gate rejection — all with regression tests, gates green (lint, 1339 tests, build).

This task carries the **residual findings** the fix policy left alone (minors/advisories plus three architecture-deepening candidates from the `sp:code-improvement` pass). Sibling task: 0075 owns the `packages/core` residuals; R6 there (hook-event taxonomy SSOT) is related to C2/C3 here — coordinate if both are picked up.

All `file:line` anchors reflect the tree as of 2026-07-11 (post-fix, uncommitted); re-verify anchors before editing.
### Requirements
R1. [minor, correctness] **Guard `stepApply`'s frontmatter prepend against frontmatter-less magents.** `stepApply` calls `parseFrontmatter(content)` unguarded (`apps/cli/src/operations/evolve.ts:1039`); an agent-authored proposal targeting `frontmatter.*` on a frontmatter-less magent crashes with a raw FrontmatterError instead of a skip-with-warning like the text branch's not-found path. Done when the branch degrades gracefully (skip + `echoError` naming the change) with a test.

R2. [minor, correctness] **Match OMP install entry scope to the requested `global` flag.** `resolveOmpInstallPath` returns `entries[0].installPath` without matching scope (`apps/cli/src/commands/install.ts:~475`); a registry with both user and project entries can post-process the wrong cache path. Done when the entry is selected by scope (`global → 'user'`, else `'project'`, fallback first) with a test.

R3. [advisory, usability] **Filter empty `--targets` segments before validation.** `parseTargets` doesn't filter empties — `--targets codex,` fails with `Unknown target ''` (`apps/cli/src/commands/install.ts:~525`). Done when empty segments are filtered before validation, with a test.

R4. [advisory, correctness] **Make `copyDirectory` lstat instead of stat (skip symlinks).** `copyDirectory` in install.ts follows symlinks via `statSync` (`apps/cli/src/commands/install.ts:~665`) — a circular symlink recurses forever. The mapper's `copyAndRewriteDirectory` already lstats and skips. Done when install's copier mirrors that discipline.

R5. [advisory, style] **Remove the inline `require('node:fs')` in `registerHookRun`.** `registerHookRun` uses inline `require('node:fs')` though `readFileSync` is already statically imported (`apps/cli/src/commands/hook-run.ts:389`). Done when the require is removed and the static import is used.

R6. [advisory, usability] **Echo an explicit "no evaluation history" line when the store is empty.** `showHistory` prints nothing when the store has zero rows (`apps/cli/src/operations/evaluate.ts:47`) — indistinguishable from a failed command. Done when it echoes an explicit "no evaluation history for X" line.

R7. [minor, weak locality — C1] **Unify the `evalGate` context literal into one helper.** The context literal (8 fields: name, candidate/baseline text, margin, target, replay/judge backends, judgeReplays, judgeBudget) is built three times (`apps/cli/src/operations/evolve.ts:757-769, ~1428-1440, ~1487-1499`). The apply-tail triplication already shipped bug-046 before unification. Done when a single `buildEvalGateCtx(...)` helper feeds all three sites, behavior-identical, with the existing eval-gate tests still green.

R8. [minor, weak locality — C2/C3] **Collapse canonical-hooks walking into one iterator.** Walking is triplicated: `convertCanonicalToPiHooks` (`apps/cli/src/hooks.ts:63-95`), `parseCanonicalHooks` (`apps/cli/src/omp-hooks.ts:61-92`), and `mergeCanonicalHooks`'s `signatureOf` (`apps/cli/src/hooks.ts:253-267`) each re-implement the nested-Claude vs flat-canonical entry duality. Done when one `flattenCanonicalHookEntries(definitions)` iterator (hooks.ts) is consumed by all three apps sites. Coordinate with 0075 R6 (now done) — one combined refactor acceptable.

R9. [advisory, wrong seam — C2] **Give the canonical event taxonomy one home with explicit per-target views.** `CANONICAL_TO_PI_EVENT` (`apps/cli/src/hooks.ts:14-21`) is named/documented as the Pi lifecycle map but is also OMP's event SSOT (`apps/cli/src/omp-hooks.ts:21,67`), while OMP-specific views (`PRE_TOOL_EVENTS`, `BLOCKABLE_OMP_EVENTS`) live in the other file. Done when the taxonomy has one home with explicit per-target views (rename/re-export sufficient; no behavior change).
### Solution

**Change-map for R1–R9 (9 residuals across 6 `apps/cli` source files).**

| R | File | Change |
|---|------|--------|
| R1 | `operations/evolve.ts:1027` (`stepApply`) | Guard `parseFrontmatter(content)` in the `frontmatter.description` prepend branch with try/catch — on `FrontmatterError` (frontmatter-less magent), `echoError` + `continue` (skip change), mirroring the text branch's not-found path. |
| R2 | `commands/install.ts:454` (`resolveOmpInstallPath`) | Scope-aware entry selection: `entries.find(e => e.scope === (global ? 'user' : 'project'))` with fallback to `entries[0]`, instead of always returning `entries[0]?.installPath` regardless of scope. |
| R3 | `commands/install.ts:514` (`parseTargets`) | `.filter((t) => t.length > 0)` on the raw `--targets` split, so `--targets ,` / leading/trailing commas do not yield empty target strings. |
| R4 | `commands/install.ts:659` (`copyDirectory`) | `lstatSync(sourcePath)` instead of `statSync(sourcePath).isDirectory()` so symlinked directories are not followed/recursed (TOCTOU + cycle avoidance). |
| R5 | `commands/hook-run.ts:389` | Replaced inline `require('node:fs').readFileSync(0, 'utf-8')` with the already-imported `readFileSync` (imported at line 2). |
| R6 | `operations/evaluate.ts:47` | `echo(\`No evaluation history for ${contentName}.\`)` before the early `return` when `rows.length === 0`, so silent empty output is no longer mistaken for a bug. |
| R7 | `operations/evolve.ts` (3 sites: `applyProposal` L757, `applyStoredProposal` L1474, interactive evolve L1511) | Extracted `buildEvalGateContext(name, candidatePath, backupPath, opts)` + named `EvalGateContext` interface; all 3 literal evalGate objects collapsed into the one call. |
| R8 | `hooks.ts` (new `flattenCanonicalHookEntries` generator + `CanonicalHookCommand` interface) | Single iterator walks both on-disk shapes (matcher-wrapped `hooks[]` vs flat `type/command`) and yields normalized `{ targetEvent, canonicalEvent, matcher, command, timeout }`. `convertCanonicalToPiHooks` and `omp-hooks.ts:parseCanonicalHooks` both consume it — eliminates 2 duplicate walks. |
| R9 | `hooks.ts` (taxonomy SSOT) | Renamed `CANONICAL_TO_PI_EVENT` → `CANONICAL_HOOK_EVENTS` and exported; moved `PRE_TOOL_EVENTS`/`BLOCKABLE_OMP_EVENTS` from `omp-hooks.ts` into `hooks.ts` as `CANONICAL_PRE_TOOL_EVENTS`/`BLOCKABLE_OMP_EVENTS`. `omp-hooks.ts` now imports all three from the one home. JSDoc + tests updated. |

**Verification (all green):**
- `bun run lint` — Biome + turbo typecheck, 0 errors.
- `bun run test` — 1348 pass / 0 fail, 3379 expect() calls. Coverage: `hooks.ts` 100%/100%, `omp-hooks.ts` 100%/100%, `evolve.ts` 98.25%/96.18%, `install.ts` 97.06%/97.48%.

**Invariants preserved:**
- No backwards-compat shims — the old `CANONICAL_TO_PI_EVENT` export is fully removed; all callers (including `hooks.test.ts`) renamed.
- No new `ReturnType<typeof fn>` contracts — `EvalGateContext` and `CanonicalHookCommand` are named interfaces at their owning module.
- `ts-no-tiny-functions` respected — `buildEvalGateContext` has real body (async reads + field assembly), not a single-expression wrapper.
- No `--no-verify`, no `.skip`'d tests, no new `biome-ignore` suppressions.

**Files changed (9):** `apps/cli/src/commands/{hook-run,install}.ts`, `apps/cli/src/{hooks,omp-hooks}.ts`, `apps/cli/src/operations/{evaluate,evolve}.ts`, `apps/cli/tests/{hooks,omp-hooks}.test.ts`, `docs/tasks/0076_*.md`.

### References

- Review session: `/sp:dev-review apps --focus all --fix all --auto --force`, 2026-07-11 (SECUA via sp:code-verification review mode; architecture via sp:code-improvement).
- Fixed-in-review bug log entries: `.wolf/buglog.json` bug-043..bug-046.
- Sibling task: 0075 (packages/core residuals) — R6 there (hook-event taxonomy SSOT) neighbors R8/R9 here.
- Cerebrum Do-Not-Repeat entries added 2026-07-11 (path-segment guard before rmSync, checked spawns, codegen quoting, extract-shared-tails).
- Operator guardrail: command-handler factory refactor rejected 2026-06-22 (cerebrum Decision Log).

### History
- 2026-07-12T00:17:48.052Z backlog → todo (system)
- 2026-07-12T00:29:16.914Z todo → wip (system)
- 2026-07-12T00:29:19.787Z wip → testing (system)
- 2026-07-12T00:29:31.393Z testing → done (system)
