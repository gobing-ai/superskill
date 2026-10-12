---
schema_version: 1
name: Prevent script conversion from overwriting its source
status: done
template: issue
created_at: 2026-10-12T16:36:52.631Z
updated_at: "2026-10-12T17:56:12.294Z"
feature_id: H1

ac_altitude: task-local
ac_numbering: task-local
priority: P1
estimate_hours: 2
done_forced: "false"
done_reason: unforced close; PASS artifact at .spur/memory/evidence/0152-verdict.json
---

## 0152. Prevent script conversion from overwriting its source

### Background

Review of packages, apps, plugins, scripts confirmed source destruction in script conversion. In a temporary directory, convertScriptToPortableTwin(source, source) with demo.mjs succeeds and replaces the original bytes with a generated bundle. The CLI default maps demo.mjs to itself; explicit --out can also alias a .ts source. Evidence: apps/cli/src/commands/script-convert.ts:124 and apps/cli/src/commands/script-convert.ts:167. Direct triage fixes already resolved malformed Stop content parts and stale builder release guidance; neither fixes conversion.

**Refine corrections (2026-10-12)**
- Bidirectional path containment plus stat → source/output identity needs only resolved spelling and stat dev/ino; freeze one private assertion and ENOENT-only output absence handling before temp creation and CLI preview.
- Earlier claim that pathsNestOrEqual rejects sibling files because their directories overlap → the helper compares the supplied paths and does not reject ordinary sibling files; remove that false rationale. Stat identity was demonstrated for symlink and hard-link aliases.

### Requirements

- [x] R1. Reject source/output identity collisions in convertScriptToPortableTwin before bundling or mutation, including normalized paths, symlink aliases and hard links to an existing source. Preserve source and existing output bytes on refusal.
- [x] R2. Apply the same collision check to the CLI default and explicit --out paths, including --dry-run, with an actionable error and exit 1. Keep distinct .ts-to-.mjs conversions working.
- [x] R3. Add focused helper and CLI regressions covering .mjs default collision, explicit source output, aliases and successful distinct output; document the rejection in docs/04_DESIGN.md.

### Acceptance Criteria

```gherkin
Scenario: AC1 — Reject identical and aliased files before bundling (req: R1)
Given a temporary source with known bytes and an output naming it directly, via normalized spelling, a symlinked path or a hard link
When convertScriptToPortableTwin is called, including with syntax-invalid source text
Then it rejects with a collision diagnostic before bundling and preserves all original bytes

Scenario: AC2 — CLI collision refusal includes preview and JSON (req: R2)
Given plugin demo.mjs with default output or demo.ts with an explicit --out that identifies its source
When script convert runs normally, with --dry-run or with --json
Then it exits 1, emits an actionable stderr collision diagnostic, emits no stdout and writes nothing

Scenario: AC3 — Distinct output conversion remains portable (req: R3)
Given plugin demo.ts and distinct output demo.mjs, whether absent or already an unrelated file
When script convert runs
Then the twin runs under Node, existing conversion tests pass and docs/04_DESIGN.md describes collision refusal
```

### Q&A

<!-- Clarifications and triage decisions. Keep empty if none. -->

#### Q&A entry — 2026-10-12T16:39:52.682Z

All decisions closed under --auto: preserve existing APIs and dependencies; reject invalid identities or lock entry shapes at the owning boundary. No upstream dependencies or dependent tasks. Reproduction and file scope are frozen in Background and Design. Larger shared-write fixes remain in this task; direct fixes to Stop parsing and builder diagnostics are already complete.

#### Q&A entry — 2026-10-12T16:47:17.146Z

Ready audit 2026-10-12: corrections accepted under --auto. Use one private stat-based source/output identity assertion; no new public API. No open design questions or task dependencies. Existing priority/estimate remain unchanged; task already todo, so no status promotion. No implementation requested.

### Design

No new public API, flag, package or dependency. Keep one private assertDistinctScriptOutput(srcPath: string, outPath: string): void in apps/cli/src/commands/script-convert.ts. Call it before mkdtempSync/Bun.build in convertScriptToPortableTwin, and inside the CLI action's existing error handling before --dry-run output. Reuse node:fs statSync and node:path resolve. Reject equal resolved paths first; otherwise stat the source and existing output, following symlinks, and reject equal dev/ino pairs. A missing output (ENOENT only) is allowed; other stat errors propagate before bundling/writes. This covers normalized paths, symlinked parents/leaves and hard links without two directional containment calls. Preserve the existing actionable stderr/exit-1 CLI behavior and all successful distinct-output behavior, including replacing a distinct existing twin. Reject rather than rename or overwrite a colliding source. pathsNestOrEqual does not falsely reject ordinary sibling files; it is simply unnecessary because containment is not the question here. File scope: apps/cli/src/commands/script-convert.ts, apps/cli/tests/commands/script-convert.test.ts, docs/04_DESIGN.md. No task dependencies or known concurrent ownership: git worktree list shows only the invoking main tree; spur task list --status wip returns empty. Out of scope: compiler main-guard rewriting, imported-module output collisions, concurrent adversarial filesystem changes, generic output transactions and unrelated installer paths.

### Plan

- [x] R1: Add assertDistinctScriptOutput before shared converter temp creation; cover normalized path and dev/ino identity with ENOENT-only absent-output handling.
- [x] R2: Invoke the same assertion inside CLI error handling before preview; preserve --out, --json and --dry-run behavior for distinct output.
- [x] R1/R3: Add real temporary-file tests for identical, normalized, symlink and hard-link collisions. Use a syntax-invalid source and a collision-specific diagnostic to prove rejection precedes Bun.build; assert original bytes remain unchanged.
- [x] R2/R3: Exercise CLI default demo.mjs collision, explicit --out collision, alias collision, --json and --dry-run; assert exit 1, stderr diagnostic and empty stdout. Retain normal Node-runnable distinct-output tests.
- [x] R3: Sync docs/04_DESIGN.md, then run focused conversion tests, bun run spur-check and bun run build.

### Root Cause

The shared converter writes outPath without comparing it to srcPath. The default extension substitution is unchanged for .mjs inputs, so default output can be the source itself. Reproduced this session with a real temporary source and a successful conversion; this is a confirmed defect.

### Solution

One private refusal at the conversion boundary, shared by the library converter and the CLI action — no new public API, flag, or dependency.

| File | Change |
| --- | --- |
| `apps/cli/src/commands/script-convert.ts:71-96` | New private `assertDistinctScriptOutput`: equal `resolve()`d spellings refuse first, then `statSync` dev/ino identity (stat follows symlinks, so a leaf or parent symlink alias and a hard link both report the source's inode); only ENOENT counts as an absent output, any other stat error propagates (R1) |
| `apps/cli/src/commands/script-convert.ts:115-120` | `convertScriptToPortableTwin` asserts before `mkdtempSync`/`Bun.build`, so a refusal creates no temp dir, builds nothing, and leaves the source and any existing output bytes untouched (R1) |
| `apps/cli/src/commands/script-convert.ts:177-203` | The CLI action runs the same assertion inside its existing try/catch ahead of the `--dry-run` preview, so the default path, `--out`, `--json` and `--dry-run` all exit 1 with the diagnostic on stderr and nothing on stdout (R2) |
| `apps/cli/tests/commands/script-convert.test.ts:153-213` | Helper regressions: direct identity, normalized spelling, symlink leaf and symlinked parent, hard link — every fixture is syntax-invalid so the collision diagnostic proves the check precedes `Bun.build`; original bytes asserted unchanged (R1, R3) |
| `apps/cli/tests/commands/script-convert.test.ts:370-444` | CLI regressions: `.mjs`-default collision, `--json`/`--dry-run` with empty stdout, explicit `--out` identity plus hard-link and symlink aliases; a distinct output still replaces a pre-existing unrelated twin and the twin runs under Node (R2, R3) |
| `docs/04_DESIGN.md:318` | Surface doc records the collision refusal, exit 1, and no-write behavior (R3) |

Rationale: identity, not containment, is the question, so one resolved-spelling comparison plus dev/ino stat replaces any path-containment call and covers normalized, symlink and hard-link aliases in both the library and CLI paths. Refusing before `mkdtempSync` is what makes "writes nothing" true without cleanup code. The plan's last item also names `bun run spur-check` and `bun run build`; those are the pipeline test hop's full gate, not this implement stage, so that checkbox is left for the record step.

### Testing

**Pipeline verify results**

- Verdict: PASS (from verdict artifact)
- Confidence: HIGH

| Requirement | Status | Evidence |
|-------------|--------|----------|
| R1 | MET | `apps/cli/src/commands/script-convert.ts:80-95` is `assertDistinctScriptOutput`: it refuses on equal `resolve()` spelling, then on equal `statSync` dev/ino (`statSync` follows symlinks, so a leaf/parent symlink alias and a hard link both report the source inode); only `ENOENT` means absent output, any other stat error is rethrown. It is called at `apps/cli/src/commands/script-convert.ts:117` before `mkdtempSync`/`Bun.build` and before the only write at `apps/cli/src/commands/script-convert.ts:153`. Tests `apps/cli/tests/commands/script-convert.test.ts:153-212` cover direct identity, normalized spelling, symlink leaf, symlinked parent and hard link on syntax-invalid fixtures with source and alias bytes asserted unchanged. Ran `bun test apps/cli/tests/commands/script-convert.test.ts` → 24 pass, 0 fail, 125 `expect()` calls. Independent probe of all five identity shapes threw `Refusing to convert: the output is the source itself...` with `bytesPreserved=true`. |
| R2 | MET | `apps/cli/src/commands/script-convert.ts:198-203` runs the same assertion inside the action's try/catch ahead of the `--dry-run` echo; the non-dry-run path reaches it through the converter at `apps/cli/src/commands/script-convert.ts:117`; the refusal is reported by `echoError` then `exitFn(1)` at `apps/cli/src/commands/script-convert.ts:209-210`. Tests `apps/cli/tests/commands/script-convert.test.ts:370-425` assert `exits === [1]`, stderr containing `Refusing to convert`, empty stdout and no `demo.mjs` created, for the default `.mjs` collision, `--json`, `--dry-run` and explicit `--out` (direct, hard link, symlink). Real CLI process runs: `CLAUDE_PROJECT_DIR=/tmp/0152-cli1/project bun apps/cli/src/index.ts script convert cc demo.mjs` → exit=1, stdout empty, stderr collision diagnostic, source sha256 `4d5d38ecc649718aefc8e9f00d8172f8563d41a394ab25fa7f1be28771384dd5` unchanged before and after; identical result for `--json`, `--dry-run` and `--out /tmp/0152-cli1/leaf.mjs` (symlink to the source). |
| R3 | MET | Distinct-output behavior is intact: `apps/cli/tests/commands/script-convert.test.ts:427-445` overwrites a pre-existing unrelated twin for a distinct output, asserts the result starts with `#!/usr/bin/env node` and that `spawnSync('node', [out]).status === 0`; the pre-existing distinct, dry-run and JSON CLI tests at `apps/cli/tests/commands/script-convert.test.ts:238-367` still pass (same 24/24 run). `docs/04_DESIGN.md:318` documents the collision refusal, exit 1, no write, including `--dry-run` and `--json`. Real CLI run: `CLAUDE_PROJECT_DIR=/tmp/0152-cli2/project bun apps/cli/src/index.ts script convert cc demo.ts` with a pre-existing `demo.mjs` → exit=0, stdout `✓ ... (232 bytes)`, twin first line `#!/usr/bin/env node`, `node /tmp/0152-cli2/project/plugins/cc/scripts/demo.mjs` printed `twin-ok` exit 0, and the `.ts` source remained byte-identical. |

| Acceptance Criteria | Status | Evidence Type | Evidence |
|---------------------|--------|---------------|----------|
| AC1 — Reject identical and aliased files before bundling (req: R1) | MET | test | `apps/cli/tests/commands/script-convert.test.ts:169-212`: five fixtures — direct identity, `sub/../` normalized spelling, symlink leaf, symlinked parent, hard link — each `rejects.toThrow(/Refusing to convert/)` on `INVALID = 'export const = ;\n'`; the collision diagnostic instead of `bun build failed` proves refusal precedes `Bun.build`; source and hard-link bytes asserted unchanged. `bun test apps/cli/tests/commands/script-convert.test.ts` → 24 pass, 0 fail. Independent probe `bun /tmp/0152-probe/probe.ts` / `probe2.ts` / `probe3.ts` reproduced all five refusals with `bytesPreserved=true`. |
| AC2 — CLI collision refusal includes preview and JSON (req: R2) | MET | command | Real CLI process evidence: default `demo.mjs` collision → exit=1, `STDOUT<<>>`, stderr `Refusing to convert: the output is the source itself, so writing it would destroy the source.` plus source/output lines and `Pass a distinct --out path (the default swaps the source extension for .mjs).`; `--json` → exit=1, stdout empty; `--dry-run` → exit=1, stdout empty; `--out` symlink alias → exit=1, stdout empty; source sha256 unchanged after all four. Commander-action tests `apps/cli/tests/commands/script-convert.test.ts:370-425` assert `exits === [1]`, stderr diagnostic, empty stdout and no `demo.mjs` written. |
| AC3 — Distinct output conversion remains portable (req: R3) | MET | test | `apps/cli/tests/commands/script-convert.test.ts:427-445` asserts the stale unrelated twin is replaced, the first line is `#!/usr/bin/env node`, the source remains, and the produced twin runs under `node` with status 0; existing distinct-output tests at `apps/cli/tests/commands/script-convert.test.ts:238-367` pass. Real CLI run of `script convert cc demo.ts` with a pre-existing `demo.mjs` → exit=0, `(232 bytes)`, `node` execution printed `twin-ok` exit 0, `.ts` source preserved. `docs/04_DESIGN.md:318` describes the refusal. |
- Coverage: N/A (verdict-based; verify pipeline does not measure code coverage)

### Review

<!-- spur:record-review -->

**SECU findings** (pipeline verify step — verdict: PASS)

| Priority | Dimension | Location | Finding |
|----------|-----------|----------|----------|
| P4 | — | — | No findings (verify verdict PASS) |

### References

- apps/cli/src/commands/script-convert.ts:88 — shared converter and sole runtime helper definition.
- apps/cli/src/commands/script-convert.ts:124 — unguarded output write.
- apps/cli/src/commands/script-convert.ts:167 — default path substitution before dry-run.
- apps/cli/tests/commands/script-convert.test.ts:10 — existing helper test surface; same file owns CLI tests.
- docs/04_DESIGN.md:259 — command surface to synchronize during implementation.
- docs/00_ADR.md — ADR-024 portable script contract.
- Concurrency audit 2026-10-12: only main worktree; no wip tasks; prior review edits remain intentional, no implementation owns these files.

### History

- 2026-10-12T17:26:05.578Z todo → wip (system)
- 2026-10-12T17:51:24.428Z wip → testing (system)
- 2026-10-12T17:56:12.288Z testing → done (system)

