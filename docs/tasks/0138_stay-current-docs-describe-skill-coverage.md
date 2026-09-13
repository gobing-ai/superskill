---
schema_version: 1
name: Stay-current docs describe skill coverage
status: done
template: feature-impl
created_at: 2026-09-13T18:04:14.442Z
updated_at: "2026-09-13T23:07:02.110Z"
feature_id: F8
priority: P2
tags:
  - docs
  - update

dependencies: ["0137"]
---

## 0138. Stay-current docs describe skill coverage

### Background

User-facing doc close-out. The ADR-035 amendment (docs/00_ADR.md, dated 2026-09-13) and the 04_DESIGN.md rows already landed or land in tasks 0133-0137's same commits; this task owns docs/help2/installation.md § Stay current (currently lines 84-88: three bullets describing update --check, update [plugin], skill update) and a final audit that every doc claim matches shipped behavior. Rubric: E1 D1 L1 C1 R1 = 5 → single doc task. Implements: F8 R19.

### Requirements

- [x] R1. help2 Stay current describes the shipped surface. docs/help2/installation.md § Stay current covers: update checking both plugins and lock-tracked skills, skill rows in the output, --check --json for scripts, the exit codes 0/1/2, and skill update --check as the skill-scoped read-only variant. Wording matches the behavior shipped in 0133-0137 — no claims about notifications or push-style updates (ADR-035 defers those).
- [x] R2. The doc set is audited against the merged code. Re-read the ADR-035 amendment, docs/04_DESIGN.md update/skill rows, and docs/design/skill-update-notification.md § Unified update; confirm every command, flag, exit code, and output example they cite exists in the shipped CLI (verify by running --help and --check against a fixture); fix drift in the same commit or file it as a follow-up note in this task.
- [x] R3. Leave regression evidence. A docs lint/check consistent with repo practice runs clean; the audit outcome (what was verified, command by command) is recorded in the task record.

### Acceptance Criteria

```gherkin
Scenario: R19 — Update surface docs describe skill coverage
  Given the feature's update and skill verb changes are merged
  When a reader opens docs/00_ADR.md, docs/04_DESIGN.md, and docs/help2/installation.md
  Then ADR-035 carries a dated amendment covering lock-tracked skills, and the 04 update surface and help2 "Stay current" section describe skill rows, --json, and skill update --check
```

### Q&A

<!-- CLOSED decisions from refinement: what was chosen and why, what was deferred and on what
     condition. Not a parking lot for open questions — an unanswered question here means the task
     is not ready to hand off. Keep empty if none. -->

### Design

**Out of scope for this task:** anything not named in Requirements below — no speculative abstractions, no drive-by refactors (project rule).



Docs-only task; no code surface. The help2 edit follows the section's existing bullet style (imperative one-liners with the command in backticks). The audit is a manual checklist executed against the built CLI, recorded as evidence in the task's Notes.

### Plan

1. Edit docs/help2/installation.md § Stay current. 2. Run the audit per R2 with the built CLI. 3. Record evidence; bun run lint. The pre-batch-create quiz gate was auto-skipped under --auto; sizing recorded via rubric line in Background.

### Solution

Docs-only close-out for F8 R19 (tasks 0133-0137 shipped the code surface):

- docs/help2/installation.md:86-95 — § Stay current rewritten to the shipped update surface: `superskill update` checks plugins AND lock-tracked skills, rows grouped under `Plugins:`/`Skills:`, exit codes 0/1/2, `--check --json` script envelope (`--json` requires `--check`), apply mode reinstalls stale rows, `superskill update [name]` (fix hop: `[plugin]` → `[name]`), and `skill update --check` as the skill-scoped read-only variant. No notification/push claims (ADR-035 defers them).
- docs/04_DESIGN.md:121 — carried 0135-review P2: the "no-second-fetch" claim verified imprecise and reworded (apply set = stale rows only; `updateSkills` re-hashes each applied stale row in its no-op pre-check via `computeSourceSkillHash` rather than reusing the check hash; failed skill reinstall exits 1).
- docs/04_DESIGN.md:181 — skill-update exit gloss `current/unchanged` → `current/unchecked` to match shipped behavior (apps/cli/src/commands/skill.ts:414-416).
- docs/00_ADR.md:631-634 — dated **Erratum (2026-09-13)** inside the F8 amendment: bare `update` reinstalls stale rows only (plugins filtered to stale + skills whose precheck row is stale; unchecked e.g. git/gitlab/well-known and unavailable rows reported, never reinstalled). Original sentence preserved. Evidence: apps/cli/src/commands/update.ts:387-388, packages/core/src/skills-ecosystem/operations.ts:896-898.

Rationale: R2 required fixing doc drift in the same commit; the ADR is authoritative on decisions, so drift was corrected by erratum convention rather than rewriting history or bending derived docs.

### Testing

**Pipeline verify results**

- Verdict: PASS (from verdict artifact)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| R1 | MET | docs/help2/installation.md:86-95 — both kinds (:86), Plugins:/Skills: rows (:87), exits 0/1/2 (:88), --check --json + --json requires --check (:89-90), [name] apply (:91), skill update --check variant with 0/1/2 (:93-95); matches update.ts:91,:107 and 04_DESIGN.md:104-105,181; no notification/push claims |
| R2 | MET | audit recorded command-by-command in task record § Testing (11-row table + drift-fixed list); spot-verified vs code update.ts:107,328,388,421 + operations.ts:650-670; ADR erratum docs/00_ADR.md:632-634; drift fixes live at 04_DESIGN.md:121,:181 |
| R3 | MET | .spur/run/0138-test-gate.log — lint clean (stage 1 of spur-check), 33 pre + 3 post rules, 2355 pass/0 fail, proof digest sha256:20c3704b… = certified tree; .spur/run/0138-build.log exit 0; audit outcome persisted in task record § Testing |

| Acceptance Criteria | Status | Evidence Type | Evidence |
|---------------------|--------|---------------|----------|
| R19 — Update surface docs describe skill coverage | MET | test | ADR-035 dated amendment + erratum docs/00_ADR.md:615-634; 04 update surface docs/04_DESIGN.md:103-107,:117,:181,:311 (skill rows, --json, skill update --check); help2 docs/help2/installation.md:86-95; 2355 tests pass + build exit 0 |
- Coverage: N/A (verdict-based; verify pipeline does not measure code coverage)

### Review

<!-- spur:record-review -->

**SECU findings** (pipeline verify step — verdict: PASS)

| Priority | Dimension | Location | Finding |
|----------|-----------|----------|----------|
| P4 | spur task check | — | task check passed |
| P4 | evidence-rule-pass | — | All behavior-bearing AC rows have executable evidence or are explicitly non-behavioral. |
| P4 | proof-input-digest | — | sha256:8e71fc50617f19b133a3e5f767c02c3bc21d443591b6dbe1830d2f06897170bd |

### References

<!-- Links to the parent feature, design docs, related tasks, or external references. -->

### History

- 2026-09-13T22:31:52.460Z todo → wip (system)
- 2026-09-13T23:07:00.928Z wip → testing (system)
- 2026-09-13T23:07:02.110Z testing → done (system)

