---
schema_version: 1
name: Prevent script conversion from overwriting its source
status: todo
template: issue
created_at: 2026-10-12T16:36:52.631Z
updated_at: "2026-10-12T16:47:17.146Z"
feature_id: H1

ac_altitude: task-local
ac_numbering: task-local
priority: P1
estimate_hours: 2
---

## 0152. Prevent script conversion from overwriting its source

### Background

Review of packages, apps, plugins, scripts confirmed source destruction in script conversion. In a temporary directory, convertScriptToPortableTwin(source, source) with demo.mjs succeeds and replaces the original bytes with a generated bundle. The CLI default maps demo.mjs to itself; explicit --out can also alias a .ts source. Evidence: apps/cli/src/commands/script-convert.ts:124 and apps/cli/src/commands/script-convert.ts:167. Direct triage fixes already resolved malformed Stop content parts and stale builder release guidance; neither fixes conversion.

**Refine corrections (2026-10-12)**
- Bidirectional path containment plus stat → source/output identity needs only resolved spelling and stat dev/ino; freeze one private assertion and ENOENT-only output absence handling before temp creation and CLI preview.
- Earlier claim that pathsNestOrEqual rejects sibling files because their directories overlap → the helper compares the supplied paths and does not reject ordinary sibling files; remove that false rationale. Stat identity was demonstrated for symlink and hard-link aliases.

### Requirements

- [ ] R1. Reject source/output identity collisions in convertScriptToPortableTwin before bundling or mutation, including normalized paths, symlink aliases and hard links to an existing source. Preserve source and existing output bytes on refusal.
- [ ] R2. Apply the same collision check to the CLI default and explicit --out paths, including --dry-run, with an actionable error and exit 1. Keep distinct .ts-to-.mjs conversions working.
- [ ] R3. Add focused helper and CLI regressions covering .mjs default collision, explicit source output, aliases and successful distinct output; document the rejection in docs/04_DESIGN.md.

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

- [ ] R1: Add assertDistinctScriptOutput before shared converter temp creation; cover normalized path and dev/ino identity with ENOENT-only absent-output handling.
- [ ] R2: Invoke the same assertion inside CLI error handling before preview; preserve --out, --json and --dry-run behavior for distinct output.
- [ ] R1/R3: Add real temporary-file tests for identical, normalized, symlink and hard-link collisions. Use a syntax-invalid source and a collision-specific diagnostic to prove rejection precedes Bun.build; assert original bytes remain unchanged.
- [ ] R2/R3: Exercise CLI default demo.mjs collision, explicit --out collision, alias collision, --json and --dry-run; assert exit 1, stderr diagnostic and empty stdout. Retain normal Node-runnable distinct-output tests.
- [ ] R3: Sync docs/04_DESIGN.md, then run focused conversion tests, bun run spur-check and bun run build.

### Root Cause

The shared converter writes outPath without comparing it to srcPath. The default extension substitution is unchanged for .mjs inputs, so default output can be the source itself. Reproduced this session with a real temporary source and a successful conversion; this is a confirmed defect.

### Solution

<!-- Filled during implementation: file:line change map and concise rationale. -->

### Testing

Implementation verification: apps/cli/tests/commands/script-convert.test.ts owns helper and Commander-action regressions, with real fixtures under tmpdir() and per-fixture teardown. Cover direct identity, normalized spellings, symlink leaf/parent and hard links; verify collision rejection on syntax-invalid input to distinguish preflight from build failure. Capture process.stdout.write/process.stderr.write for CLI preview/JSON refusal; preserve existing Node execution tests and add a distinct pre-existing output success case. Planned commands: bun test apps/cli/tests/commands/script-convert.test.ts, bun run spur-check, bun run build. This refine reran the defect probe: same source/output changes source bytes, current CLI dry-run reports demo.mjs to itself, and stat dev/ino identifies both symlink and hard-link aliases. No implementation tests have been claimed green for the future fix.

### Review

<!-- Filled during review: P1-P4 findings, residual risk, and final disposition. -->

### References

- apps/cli/src/commands/script-convert.ts:88 — shared converter and sole runtime helper definition.
- apps/cli/src/commands/script-convert.ts:124 — unguarded output write.
- apps/cli/src/commands/script-convert.ts:167 — default path substitution before dry-run.
- apps/cli/tests/commands/script-convert.test.ts:10 — existing helper test surface; same file owns CLI tests.
- docs/04_DESIGN.md:259 — command surface to synchronize during implementation.
- docs/00_ADR.md — ADR-024 portable script contract.
- Concurrency audit 2026-10-12: only main worktree; no wip tasks; prior review edits remain intentional, no implementation owns these files.

### History
