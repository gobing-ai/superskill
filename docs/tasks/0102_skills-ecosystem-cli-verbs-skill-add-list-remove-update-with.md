---
template: feature-impl
schema_version: 1
name: "skills-ecosystem: CLI verbs skill add/list/remove/update with lock writes and dry-run"
description: ""
status: done
type: task
profile: standard
feature_id: B
parent_wbs: "0097"
priority: P1
tags: ["skills-ecosystem", "cli"]
dependencies: ["0101"]
created_at: "2026-07-24T23:58:50.210Z"
updated_at: "2026-07-25T17:48:23.880Z"
---

## 0102. skills-ecosystem: CLI verbs skill add/list/remove/update with lock writes and dry-run

### Background

Implements: R3 (the four verbs). Ordering: after the installer/emission child. Non-interactive by design (AI-first CLI) — no @clack/prompts port; `--json` envelopes; stdout via process.stdout.write for spy-based assertions. Rubric: E2 D1 L1 C1 R1 = 6 → decompose (distinct surface: Commander wiring + output contract).

### Requirements
- R1. `superskill skill add <source> [--skill <name...>] [--agent <targets...>] [-g|--global] [--copy] [-y|--yes] [--list] [--dry-run] [--json]`: resolve → fetch → discover → install → emit per target → write BOTH locks. Project scope default (parity with `npx skills add`); `-g` for user-level.
- R2. `superskill skill list [-g] [--json]` reads both locks + on-disk scan; `superskill skill remove <name...> [-g] [-y]` uses lock-key-wins resolution and sweeps all tiers; `superskill skill update [name...] [-g] [-y]` is hash-based on the canonical copy (no-op when tree SHA equals stored skillFolderHash; reinstall + re-emit all tiers when different).
- R3. Verbs register in the existing `skill` group in apps/cli/src/commands/skill.ts; `superskill install` untouched.
- R4. Tests: Commander-level tests with injected dependencies (no live network/HOME writes); stdout asserted via process.stdout.write spy; --dry-run proves zero writes.
### Acceptance Criteria

<!-- Copy or derive real scenarios from the linked feature. Do not leave placeholder AC here. -->

### Q&A

<!-- Clarifications and decisions made during refinement. Keep empty if none. -->

### Design

<!-- Chosen implementation approach, key tradeoffs, invariants, and impacted surfaces. -->

### Plan

<!-- Ordered implementation checklist. Fill before moving to todo/wip. -->

### Solution
**Fix pass (2026-07-25 verify remediation)** — the verify re-audit found R2/R4 violations and repaired them:

- `packages/core/src/skills-ecosystem/locks.ts:86`: threaded `homeDir` through `getGlobalLockPath`/`readGlobalLock`/`writeGlobalLock`/`addSkillToGlobalLock`/`removeSkillFromGlobalLock` (global lock previously always resolved to the real HOME); added optional exclusion sets to `computeCanonicalSkillFolderHash` so a source dir hashes comparably to its canonical copy.
- `packages/core/src/skills-ecosystem/installer.ts:207`: `installSkillCanonical` accepts a declared-`name` override (was: source basename, which broke lock-key/canonical identity); exported `EXCLUDE_FILES`/`EXCLUDE_DIRS`.
- `packages/core/src/skills-ecosystem/emit.ts:62`: `EmitOptions.name` passed through to the canonical install.
- `packages/core/src/skills-ecosystem/operations.ts:377`: `updateSkills` now does a source-hash pre-check and is a true no-op when unchanged (`computeSourceSkillHash` at `operations.ts:455`; local = exclusion-aware folder hash, remote = blob `snapshotHash`); `listSkills` (`operations.ts:232`) disk-scans the canonical dir for BOTH scopes (`scanCanonicalSkills`, `operations.ts:273`); `addSkills` (`operations.ts:62`) cleans up cloned temp dirs (try/finally `cleanupTempDir`), names canonical copies by declared skill name, and records the source path (not a fabricated GitHub URL) for local sources.
- `apps/cli/src/commands/skill.ts:251`: the four verb handlers accept an injected `homeDir` (dependency-injection seam for tests; not a CLI flag).
- `apps/cli/tests/commands/skill-verbs.test.ts`: rewritten — isolated temp HOME per test, `process.stdout.write` spy plus `process.exit` capture stub (the old file never executed: `runOperation`'s `process.exit` kills the bun runner), text- and JSON-mode assertions for all four verbs.
- `packages/core/tests/skills-ecosystem/operations.test.ts`: rewritten — valid frontmatter fixtures (discovery requires name+description), plus update no-op/changed, remote blob add + snapshot-hash no-op (injected `fetchFn`), empty-source and emit-failure errors, project-scope flow, and global disk-scan listing.

**Original implementation (pre-fix-pass)**

- `packages/core/src/skills-ecosystem/operations.ts`: Implemented `addSkills`, `listSkills`, `removeSkills`, and `updateSkills` reusable domain handlers managing source resolution, skill discovery, multi-tier emission, and lock file updates (`skills-lock.json`).
- `packages/core/src/index.ts`: Re-exported `operations` module with TSDoc annotations.
- `apps/cli/src/commands/skill.ts`: Registered `add`, `list`, `remove` (alias `rm`), and `update` subcommands under `superskill skill` with `--json`, `--dry-run`, `--global`, `--copy`, `--skill`, `--agent`, `--list`, and `-y` flags.
- `apps/cli/tests/commands/content-command-modules.test.ts`: Updated expected `skill` subcommands registration list.
### Testing
**Verification re-audit (2026-07-25, `/sp-dev-verify 0102 --force --fix all`)** — initial verdict FAIL (R2/R4 violations); remediated in one bounded fix pass; final verdict PASS.

**Per-Requirement Traceability**

| Req | Status | Evidence |
|-----|--------|----------|
| R1 | MET | `addSkills` resolve→fetch→discover→emit→lock flow (`packages/core/src/skills-ecosystem/operations.ts:62`); both lock types written (global `addSkillToGlobalLock`, local `addSkillToLocalLock`); all flags wired (`apps/cli/src/commands/skill.ts:390-400`); local add test asserts declared-name canonical + scoped lock (`packages/core/tests/skills-ecosystem/operations.test.ts` 'adds local directory skills'); remote add covered with injected `fetchFn` (no network) |
| R2 | MET | `listSkills` reads scoped lock + canonical disk scan for BOTH scopes (`operations.ts:232`, `scanCanonicalSkills` at `operations.ts:273`); `removeSkills` sweeps canonical + all tiers with lock-key-wins resolution (`packages/core/src/skills-ecosystem/emit.ts:238`); `updateSkills` hash-based with true no-op pre-check (`operations.ts:406-409`, `computeSourceSkillHash` at `operations.ts:455`) and reinstall+re-emit on change; tests: no-op preserves canonical drift, changed-source re-emits, remote snapshot-hash no-op, disk-scan orphan listing |
| R3 | MET | `add`/`list`/`remove`/`update` registered in the existing `skill` group (`apps/cli/src/commands/skill.ts:390-420`); `superskill install` untouched (not in working-tree diff); registration asserted (`apps/cli/tests/commands/content-command-modules.test.ts:227`) |
| R4 | MET | Commander-level tests `apps/cli/tests/commands/skill-verbs.test.ts` (7 tests) with injected `homeDir`/env overrides, `process.stdout.write` spy, and `process.exit` capture stub; `--dry-run` proves zero writes (canonical dir AND lock file absent); operations unit tests (13) run in temp dirs with `fetchFn` mocks — no live network, no real-HOME writes (verified: `~/.agents/.skill-lock.json` absent after full-suite run) |

**Acceptance Criteria Verification**

Task AC section is empty (placeholder comment only) — no AC rows to evaluate. N/A.

**Fix-pass findings (all remediated this run)**

1. BLOCKER: the global lock path ignored `homeDir` — the shipped tests wrote `/Users/robin/.agents/.skill-lock.json` (real HOME) on every run and were FAILING as committed. Fixed by threading `homeDir` through `getGlobalLockPath`/`readGlobalLock`/`writeGlobalLock`/`addSkillToGlobalLock`/`removeSkillFromGlobalLock` (`packages/core/src/skills-ecosystem/locks.ts`) and through the four CLI handlers (`skill.ts`). Polluted lock file removed.
2. MAJOR: `updateSkills` never no-opped — it always re-fetched, re-emitted all tiers, and rewrote locks, then merely reported `updated: false`. Fixed with a source-hash pre-check (local: exclusion-aware folder hash comparable to the canonical hash; remote: blob `snapshotHash`), falling back to full reinstall whenever the source cannot be hashed (never a false no-op).
3. MAJOR: `skill list -g` skipped the on-disk scan — global skills present on disk but absent from the lock were invisible. Fixed via `scanCanonicalSkills` for both scopes.
4. MAJOR: the canonical dir was named by source basename, not the declared (frontmatter) skill name — lock key / canonical dir / emission tiers disagreed, so remove/update would orphan the install. Fixed with a `name` override through `emitSkillForTargets`/`installSkillCanonical`.
5. MAJOR: `skill-verbs.test.ts` as committed never executed — `runOperation`'s `process.exit` kills the bun test runner mid-suite and silently truncates ALL suite output (root `bun test` printed a banner and exited 0). Fixed with an exit-recording stub in the test; the full suite now reports a real summary (1859 pass / 0 fail).
6. MAJOR: remote `addSkills` leaked cloned temp repos. Fixed with try/finally `cleanupTempDir`.
7. MINOR (fixed): local-source lock entries recorded a garbage GitHub URL as `sourceUrl`; local sources now record the source path.
8. MINOR (open, advisory): `removeSkills` reports success for unknown names, and `--skill` filters matching nothing succeed with zero installs (vendor errors instead). Output-contract compatible; left as-is.
9. MINOR (open, pre-existing, out of scope): `evaluate-ingest.test.ts` resolves its rubric path CWD-relatively — fails when tests run from `apps/cli`, passes from repo root (the gate configuration).

**Gate evidence (this run)**

- `bun run lint` — biome + typecheck clean.
- `bun run test` — 1859 pass, 0 fail across 97 files; coverage All files 99.57% funcs / 98.86% lines; `operations.ts` 100.00/95.02, `skill.ts` 96.23/98.03 (both >= 90/90).
- `bun run build` — succeeds across workspaces.
- `bun run spur-check` — lint + 22 pre-check rules + tests + post-check rules (coverage-gate, skill-citations-resolve, tsdoc-export) all green.
- Fix-pass artifact: `.spur/run/0102-verdict.json` (rewritten with the final verdict and per-requirement evidence).

**Original implementation tests (pre-fix-pass)**

- `packages/core/tests/skills-ecosystem/operations.test.ts`: unit tests covering `addSkills`, `listSkills`, `removeSkills`, `updateSkills`, `--dry-run`, and `--list` modes.
- `apps/cli/tests/commands/skill-verbs.test.ts`: Commander-level CLI handler tests spying on `process.stdout.write` and validating `--json` outputs.
- `apps/cli/tests/commands/content-command-modules.test.ts`: expected `skill` subcommands registration list.
### Review

| Priority | Finding | Severity | Disposition |
|---|---|---|---|
| P1 | None | Pass | Verified |
| P2 | None | Pass | Verified |
| P3 | None | Pass | Verified |
| P4 | None | Pass | Verified |

### References

B

<!-- Links to the parent feature, design docs, related tasks, or external references. -->

### History
