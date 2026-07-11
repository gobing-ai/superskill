---
schema_version: 1
name: "Fix dev-review residual findings in apps/cli (minors, advisories, architecture deepening C1-C3)"
status: backlog
template: standard
created_at: 2026-07-11T23:08:28.183Z
updated_at: "2026-07-11T23:09:22.184Z"
---

## 0076. Fix dev-review residual findings in apps/cli (minors, advisories, architecture deepening C1-C3)

### Background
A full `/sp:dev-review apps --focus all --fix all --auto --force` ran on 2026-07-11 across all 29 source files of `apps/cli` (~6,650 lines), following the same-day `packages/core` review (task 0075). The blocker and major SECUA findings were fixed in-session (logged as bug-043..bug-046 in `.wolf/buglog.json`): marketplace-name path traversal into the `rmSync` cache clear (probe-confirmed to resolve to `$HOME`), discarded `claude`/`omp` subprocess exit codes, quote/newline injection in generated OMP hook modules, and the interactive-evolve ENOENT crash after a gate rejection — all with regression tests, gates green (lint, 1339 tests, build).

This task carries the **residual findings** the fix policy left alone (minors/advisories plus three architecture-deepening candidates from the `sp:code-improvement` pass). Sibling task: 0075 owns the `packages/core` residuals; R6 there (hook-event taxonomy SSOT) is related to C2/C3 here — coordinate if both are picked up.

All `file:line` anchors reflect the tree as of 2026-07-11 (post-fix, uncommitted); re-verify anchors before editing.
### Requirements

**Residual SECUA findings (minor/advisory)**

- R1. [minor, correctness] `stepApply`'s `frontmatter.description` prepend calls `parseFrontmatter(content)` unguarded (`apps/cli/src/operations/evolve.ts:1039`); an agent-authored proposal targeting `frontmatter.*` on a frontmatter-less magent crashes with a raw FrontmatterError instead of a skip-with-warning like the text branch's not-found path. Done when the branch degrades gracefully (skip + `echoError` naming the change) with a test.
- R2. [minor, correctness] `resolveOmpInstallPath` returns `entries[0].installPath` without matching the entry `scope` to the requested `global` flag (`apps/cli/src/commands/install.ts:~475`); a registry carrying both user and project entries can post-process the wrong cache path. Done when the entry is selected by scope (`global → 'user'`, else `'project'`, fallback first) with a test.
- R3. [advisory, usability] `parseTargets` does not filter empty segments — `--targets codex,` fails with `Unknown target ''` (`apps/cli/src/commands/install.ts:~525`). Done when empty segments are filtered before validation, with a test.
- R4. [advisory, correctness] `copyDirectory` in install.ts follows symlinks via `statSync` (`apps/cli/src/commands/install.ts:~665`) — a circular symlink in a plugin recurses forever; the mapper's `copyAndRewriteDirectory` (packages) already lstats and skips symlinks. Done when install's copier mirrors that discipline.
- R5. [advisory, style] `registerHookRun` uses an inline `require('node:fs')` although `readFileSync` is already statically imported (`apps/cli/src/commands/hook-run.ts:389`). Done when the require is removed.
- R6. [advisory, usability] `showHistory` prints nothing when the store has zero rows (`apps/cli/src/operations/evaluate.ts:47`) — indistinguishable from a failed command. Done when it echoes an explicit "no evaluation history for X" line.

**Architecture deepening candidates (from sp:code-improvement)**

- R7. [minor, weak locality — C1] The `evalGate` context literal (8 fields: name, candidate/baseline text, margin, target, replay/judge backends, judgeReplays, judgeBudget) is built three times (`apps/cli/src/operations/evolve.ts:757-769, ~1428-1440, ~1487-1499`). The apply-tail triplication in the same function already shipped bug-046 before it was unified into `finalizeApply`; the context literal is the same drift class (one site silently missing a gate option). Done when a single `buildEvalGateCtx(...)` helper feeds all three sites, behavior-identical, with the existing eval-gate tests still green.
- R8. [minor, weak locality — C2/C3] Canonical-hooks walking is triplicated in apps: `convertCanonicalToPiHooks` (`apps/cli/src/hooks.ts:63-95`), `parseCanonicalHooks` (`apps/cli/src/omp-hooks.ts:61-92`), and `mergeCanonicalHooks`'s `signatureOf` (`apps/cli/src/hooks.ts:253-267`) each re-implement the nested-Claude vs flat-canonical entry duality; a fourth walker lives in the packages mapper. Done when one `flattenCanonicalHookEntries(definitions)` iterator (hooks.ts) is consumed by all three apps sites. Coordinate with 0075 R6 (hook-event SSOT) — same neighborhood, one combined refactor is acceptable.
- R9. [advisory, wrong seam — C2] `CANONICAL_TO_PI_EVENT` (`apps/cli/src/hooks.ts:14-21`) is named/documented as the Pi lifecycle map but is also OMP's event SSOT (`apps/cli/src/omp-hooks.ts:21,67`), while OMP-specific views (`PRE_TOOL_EVENTS`, `BLOCKABLE_OMP_EVENTS`) live in the other file. Done when the taxonomy has one home with explicit per-target views (rename/re-export is sufficient; no behavior change).

**Constraints**

- Surgical changes per requirement; each behavior-bearing R lands with its own regression test (per-file coverage gate is 90/90).
- Do not re-suggest collapsing the `apps/cli/src/commands/*` per-type handler files — explicitly rejected 2026-06-22 (cerebrum Decision Log).
- R7/R8 touch the evolve gate and hook emit paths — run the eval-gate test suites (`evolve.test.ts`, `evolve-ingest.test.ts`, `gate.test.ts`, `hooks.test.ts`, `omp-hooks.test.ts`) as the local gate before the full suite.

### References

- Review session: `/sp:dev-review apps --focus all --fix all --auto --force`, 2026-07-11 (SECUA via sp:code-verification review mode; architecture via sp:code-improvement).
- Fixed-in-review bug log entries: `.wolf/buglog.json` bug-043..bug-046.
- Sibling task: 0075 (packages/core residuals) — R6 there (hook-event taxonomy SSOT) neighbors R8/R9 here.
- Cerebrum Do-Not-Repeat entries added 2026-07-11 (path-segment guard before rmSync, checked spawns, codegen quoting, extract-shared-tails).
- Operator guardrail: command-handler factory refactor rejected 2026-06-22 (cerebrum Decision Log).

### History
