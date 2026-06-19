---
name: "Review findings: apps"
description: "Review findings: apps"
status: Done
created_at: 2026-06-19T23:20:57.793Z
updated_at: 2026-06-19T23:21:34.322Z
folder: docs/tasks
type: task
feature-id: ""
preset: simple
impl_progress:
  planning: complete
  design: complete
  implementation: complete
  review: complete
  testing: complete
---

## 0042. "Review findings: apps"

### Background

Code review findings for apps


### Requirements

See Review section


### Q&A



### Design

Review `apps/` as the CLI workspace: architecture pass over command/operation/content/pipeline/store seams, then SECU pass over TypeScript source and adjacent tests. Auto-fix only mechanical findings with narrow blast radius.


### Solution

Fixed two findings:

- `apps/cli/src/cli.ts` now derives Commander's version from `apps/cli/package.json` instead of a stale hardcoded string.
- `apps/cli/src/mapper.ts` now rejects plugin names that are not a single path segment before using them in generated `.rulesync` paths.


### Plan

1. Map `apps/cli` source and tests.
2. Run architecture review against ADR/docs.
3. Run SECU review across security, efficiency, correctness, and usability.
4. Apply mechanical fixes for confirmed findings.
5. Run lint, test, build, and built CLI smoke checks.



### Review

**Verdict: PASS after fix pass.**

**Scope:** `apps`

**Focus:** security, efficiency, correctness, usability, architecture

**Mode:** source review

**Fix mode:** `--fix all --auto`

**Findings:** 2 total, both fixed.

**P1 blockers:** none.

**P2 warnings:**

| # | Title | Dimension | Location | Recommendation | Status |
|---|-------|-----------|----------|----------------|--------|
| 1 | Plugin name can shape `.rulesync` output paths | Security/Correctness | `apps/cli/src/mapper.ts:28` | Reject plugin names that are not a single path segment before interpolating them into generated canonical paths. | FIXED |

**P3 info:**

| # | Title | Dimension | Location | Recommendation | Status |
|---|-------|-----------|----------|----------------|--------|
| 2 | CLI reports stale hardcoded version | Usability/Correctness | `apps/cli/src/cli.ts:12` | Read the version from `apps/cli/package.json` so `superskill --version` tracks package releases. | FIXED |

**P4 suggestions:** none.

**Architecture notes:** no immediate deepening refactor warranted in `apps/` during this pass. The main seams are already load-bearing and match ADR/docs: `commands/` own Commander surfaces, `operations/` own behavior, `content/` owns structured file edits, `pipeline/` owns pure conversion stages, and `store/` owns persistence through `@gobing-ai/ts-db`. The only architectural caveat observed is the known dry-run preview artifact: `executeInstall(... dryRun: true)` still writes `.rulesync/` intermediates and tests assert that behavior. That is a product/API decision, not a safe auto-fix in this review.


### Testing

**Gate results:**

- `bun run lint`: PASS
- `bun run test`: PASS — 726 pass, 0 fail, 99.55% funcs / 98.29% lines
- `bun run build`: PASS — bundled 758 modules
- Built CLI smoke: `bun apps/cli/dist/index.js --version` → `0.1.3`
- Built CLI smoke: `bun apps/cli/dist/index.js --help` exits 0 and lists install/type commands


### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |
| Review | `apps/` | rd3-dev-review | 2026-06-19 |

### References
