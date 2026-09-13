---
schema_version: 1
id: "F8"
name: "Unified update: lock-tracked skills + actionable output"
status: active
priority: P2
tags: []
created_at: "2026-09-13T17:34:31.464Z"
updated_at: "2026-09-13T21:26:28.602Z"
---

# F8: Unified update: lock-tracked skills + actionable output

## Goal

`superskill update` is the one place a user checks and applies updates for everything superskill installed. That covers marketplace/bundled plugins tracked by install manifests and skills added with `superskill skill add` tracked by the npx-skills locks. Its output says what is stale, why (version bump or content drift at an unchanged version), where, and the single command to run next, and `--json` gives scripts a stable surface. The locks remain the source of truth for ecosystem skills (ADR-028).

## Scope

**In scope**

- Core: a read-only `checkSkills()` extracted from the source-hash pre-check inside `updateSkills`. `updateSkills` reuses it, and a source that cannot be hashed is never reported `current`.
- `superskill update` covers lock-tracked ecosystem skills in the same scope as plugin manifests. Skills and plugins share the `stale | current | unavailable` vocabulary and the 0/1/2 exit contract. Stale skills are applied via `updateSkills`.
- `superskill skill update --check` (read-only).
- `superskill update --json` with a structured result envelope. Exit codes are documented in `--help`.
- Output:
  - rows grouped by kind
  - content drift at an unchanged version gets its own wording, replacing `0.0.1 → 0.0.1`
  - a capped changed-path list
  - stale targets shown when only some targets are stale
  - a summary footer with counts and one next command
  - per-item progress plus a final result when applying
  - a labeled npm remedy for the bundled channel
  - legacy and unavailable rows that name the remedy
- Version-declaration mismatch: a marketplace plugin row notes when its `marketplace.json` entry and its `plugin.json` declare different versions (observed: kk `0.0.1` vs `0.1.0`).
- `skill update` fixes: the header counts only updated skills, and the duplicated `-y` help default is removed.
- Docs in the same commits: an ADR-035 amendment, `docs/04_DESIGN.md` update/skill surfaces, and `docs/help2/installation.md` § Stay current.

**Out of scope**

- Version hygiene inside plugin repos (e.g. knowledge-kit bumping or aligning its own versions).
- Recording `skill add` installs in install manifests (breaks ADR-028 lock parity).
- Attributing plugin-emitted `[disk-scan]` skills in `skill list`.
- Push-style update notifications (deferred by ADR-035).
- The `installer.test.ts:112` repo-dir leak.

## Acceptance Criteria

```gherkin
Feature: Unified update: lock-tracked skills + actionable output

  @core
  Scenario: R1 — Update check reports a stale lock-tracked skill without writing
    Given the global skill lock records `last30days` with a hash that differs from its current source hash
    When the operator runs `superskill update --check`
    Then the output lists `last30days` as a stale skill, the exit code is 1, and neither the lock file nor the skill directory changes

  @core
  Scenario: R2 — Update check reports a current lock-tracked skill as up to date
    Given the global skill lock records `last30days` with a hash equal to its current source hash and no plugin is stale
    When the operator runs `superskill update --check`
    Then the output lists `last30days` as up to date and the exit code is 0

  @core
  Scenario: R3 — Update applies a stale lock-tracked skill and records the new hash
    Given the global skill lock records a stale `last30days`
    When the operator runs `superskill update`
    Then `last30days` is reinstalled, its lock entry hash equals the current source hash, and the output reports `last30days` as updated

  @core
  Scenario: R4 — Project-scope update reads the project skill lock
    Given `./skills-lock.json` records skill `demo-skill` and the global lock records `last30days`
    When the operator runs `superskill update --check --no-global`
    Then the output lists `demo-skill` and does not list `last30days`

  @core
  Scenario: R5 — Update with a skill name checks only that skill
    Given the global skill lock records `last30days` and `gpt-image-2-style-library`, and plugin `kk` has a manifest
    When the operator runs `superskill update last30days --check`
    Then the output lists only `last30days`

  @core
  Scenario: R6 — Skill update check reports staleness without writing
    Given the project skill lock records a stale `demo-skill`
    When the operator runs `superskill skill update --check`
    Then the output lists `demo-skill` as stale, the exit code is 1, and the lock file is unchanged

  @core
  Scenario: R7 — Skill update summary counts only skills that changed
    Given the project skill lock records two skills whose hashes equal their source hashes
    When the operator runs `superskill skill update`
    Then the output reports 0 skills updated and 2 up to date, and never reports "Updated 2 skill(s)"

  @core
  Scenario: R8 — Content drift at an unchanged version is named as such
    Given marketplace plugin `kk` was installed at version `0.0.1` and upstream `workflows/kk-daily-ai-voice.yaml` changed while the version stayed `0.0.1`
    When the operator runs `superskill update --check`
    Then the `kk` row says its content changed with version `0.0.1` unchanged and does not contain `0.0.1 → 0.0.1`

  @core
  Scenario: R9 — Disagreeing plugin version declarations are surfaced
    Given the marketplace entry for `kk` declares version `0.0.1` and `plugins/kk/plugin.json` declares `0.1.0`
    When the operator runs `superskill update --check`
    Then the `kk` row notes that the marketplace and plugin.json versions disagree and names both `0.0.1` and `0.1.0`

  @core
  Scenario: R10 — Check output ends with a summary and the next command
    Given plugin `kk` is stale and plugin `sp` is up to date
    When the operator runs `superskill update --check`
    Then the output ends with a summary counting 1 stale and 1 up to date and naming the command `superskill update`

  @core
  Scenario: R11 — Long changed-path lists are capped in text output
    Given stale plugin `kk` has 12 changed upstream files
    When the operator runs `superskill update --check`
    Then the `kk` row names at most 5 paths followed by `+7 more`, and `superskill update --check --json` lists all 12 paths

  @core
  Scenario: R12 — Partially stale targets are named
    Given plugin `kk` is stale on target `claude` and current on its other installed targets
    When the operator runs `superskill update --check`
    Then the `kk` row names `claude` as the stale target

  @core
  Scenario: R13 — Applying updates reports progress and a final result
    Given plugin `kk` and skill `last30days` are stale
    When the operator runs `superskill update`
    Then the output prints one progress line for `kk` and one for `last30days`, followed by a final line counting 2 updated

  @core
  Scenario: R14 — The bundled-channel npm remedy is labeled
    Given a bundled plugin whose recorded superskill version is older than the npm latest
    When the operator runs `superskill update`
    Then the line with `npm i -g @gobing-ai/superskill@latest` says that it upgrades superskill and its bundled plugins

  @core
  Scenario: R15 — A legacy install row names the reinstall command
    Given plugin `kk` has installed files but no install manifest
    When the operator runs `superskill update --check`
    Then the `kk` row names the command `superskill install kk`

  @core
  Scenario: R16 — Update emits a machine-readable result with --json
    Given plugin `kk` is stale and skill `last30days` is up to date
    When the operator runs `superskill update --check --json`
    Then stdout is one JSON document whose rows carry kind, name, and status for `kk` and `last30days`, and the exit code equals the text-mode exit code

  @core
  Scenario: R17 — Update help documents the exit codes
    When the operator runs `superskill update --help`
    Then the help text states exit code 0 for nothing stale, 1 for stale under `--check`, and 2 for an unavailable upstream

  @core
  Scenario: R18 — Skill update help shows the --yes default once
    When the operator runs `superskill skill update --help`
    Then the `-y, --yes` line contains `(default: true)` exactly once

  @core
  Scenario: R19 — Update surface docs describe skill coverage
    Given the feature's update and skill verb changes are merged
    When a reader opens `docs/00_ADR.md`, `docs/04_DESIGN.md`, and `docs/help2/installation.md`
    Then ADR-035 carries a dated amendment covering lock-tracked skills, and the 04 update surface and help2 "Stay current" section describe skill rows, `--json`, and `skill update --check`

  @edge
  Scenario: R20 — An unhashable skill source is unavailable, never current
    Given the global skill lock records `last30days` and its source repository cannot be fetched
    When the operator runs `superskill update --check`
    Then `last30days` is reported unavailable with the fetch failure reason and the exit code is 2

  @edge
  Scenario: R21 — An unavailable plugin row names the cause
    Given plugin `kk` was installed from marketplace locator `/tmp/gone-marketplace` which no longer exists
    When the operator runs `superskill update --check`
    Then the `kk` row names `/tmp/gone-marketplace` and states that the locator path is missing, and the exit code is 2
```


  <!-- Task 0133 refinement scenarios (DD-09 subset rule): task-level ACs verified by
       spur task verdict 0133 (runall-f8-48d9), certified PASS 2026-09-13. -->
  @refinement-0133
  Scenario: R1 — The unified update row model replaces plugin rows
    Given the update command loads its row model from packages/core/src/operations/update.ts
    When any update row is constructed
    Then it uses UpdateRowStatus and UpdateRow with kind set, and no PluginUpdateStatus or PluginUpdateResult identifier remains in source or tests

  @refinement-0133
  Scenario: R2 — Merged stale rows expose their stale targets
    Given plugin `kk` is stale on target `claude` and current on target `codex`
    When mergePluginUpdateRows merges the rows
    Then the merged row is stale, carries staleTargets `["claude"]`, and rank and ordering semantics are unchanged

  @refinement-0133
  Scenario: R3 — Consumers and tests compile against the new names
    Given the update command and both update test suites are retargeted to the UpdateRow vocabulary
    When the lint, test, and build gates run
    Then all pass with no renamed-name leftovers and no snapshot or assertion drift beyond the R4 reason-printing case

  @refinement-0133
  Scenario: R4 — An unavailable row with a reason prints it
    Given an UpdateRow { kind: 'plugin', name: 'kk', status: 'unavailable', locator: '/tmp/gone-marketplace', reason: 'locator path missing' }
    When the text formatter renders it
    Then the row contains '(/tmp/gone-marketplace): locator path missing'


  <!-- Task 0134 refinement scenarios (DD-09 subset rule): task-level ACs verified by
       spur task verdict 0134 (runall-f8-48d9), certified PASS 2026-09-13. -->
  @refinement-0134
  Scenario: R6 — Skill update check reports staleness without writing
    Given the project skill lock records a stale `demo-skill`
    When the operator runs `superskill skill update --check`
    Then the output lists `demo-skill` as stale, the exit code is 1, and the lock file is unchanged

  @refinement-0134
  Scenario: R7 — Skill update summary counts only skills that changed
    Given the project skill lock records two skills whose hashes equal their source hashes
    When the operator runs `superskill skill update`
    Then the output reports 0 skills updated and 2 up to date, and never reports "Updated 2 skill(s)"

  @refinement-0134
  Scenario: R18 — Skill update help shows the --yes default once
    Given the `superskill skill add|remove|update` help output
    When the `--yes` flag line is rendered
    Then `(default: true)` appears exactly once and no description duplicates it

  @refinement-0134
  Scenario: R20 — An unhashable skill source is unavailable, never current (core half)
    Given a locked skill whose source type cannot be hashed (unsupported type or fetch failure)
    When `checkSkills` evaluates it
    Then the row is `unavailable` (or `unchecked` for unsupported types) with a reason, never `current`, and success is false

  @refinement-0134
  Scenario: R1 — checkSkills is read-only and scoped (core half of update coverage)
    Given a lock with a stale and a current local-source skill
    When `checkSkills` runs without names
    Then both rows report their statuses and hashes, the lock file and skill directories are byte-identical, and no clone occurs


  <!-- Task 0135 refinement scenarios (DD-09 subset rule): task-level ACs verified by
       spur task verdict 0135 (runall-f8-48d9), certified PASS 2026-09-13. -->
  @refinement-0135
  Scenario: R1 — Update check reports a stale lock-tracked skill without writing
    Given the global skill lock records a stale lock-tracked skill
    When the operator runs `superskill update --check`
    Then the output lists the skill as stale under a `Skills:` group, the exit code is 1, and the lock and skill directories are unchanged

  @refinement-0135
  Scenario: R2 — Update check reports a current lock-tracked skill as up to date
    Given a locked skill whose hash equals its source hash
    When the operator runs `superskill update --check`
    Then the output reports the skill as up to date, plugin rows precede skill rows, and the exit code is 0

  @refinement-0135
  Scenario: R3 — Update applies a stale lock-tracked skill and records the new hash
    Given the lock records a stale lock-tracked skill
    When the operator runs `superskill update`
    Then the skill is reinstalled from its locked source, a follow-up check reports it current, and the exit code is 0

  @refinement-0135
  Scenario: R4 — Project-scope update reads the project skill lock
    Given the project defines its own skills lock
    When the operator runs `superskill update --check --no-global`
    Then the output reflects the project lock only and the exit code is 0

  @refinement-0135
  Scenario: R5 — Update with a skill name checks only that skill
    Given multiple locked skills and plugins
    When the operator runs `superskill update <skill-name> --check`
    Then only that skill is listed and no other skill or plugin rows appear

  @refinement-0135
  Scenario: R20 — An unhashable skill source is unavailable, never current
    Given a locked skill whose source cannot be hashed
    When `superskill update --check` evaluates it
    Then the row is unavailable with a reason, never current, and the exit code is 2

## Tasks

<!-- AUTO-GENERATED by spur feature refresh -->
| WBS | Task | Status |
| --- | ---- | ------ |
| 0133 | Generalize update row model to UpdateRow with kind | testing |
| 0134 | Skill update check and honest summary | todo |
| 0135 | Update covers lock-tracked skills | todo |
| 0136 | Actionable plugin update rows and summary | todo |
| 0137 | Update apply progress lines and JSON envelope | todo |
| 0138 | Stay-current docs describe skill coverage | todo |
<!-- END AUTO-GENERATED -->

## Notes

## History

- 2026-09-13T19:43:05.515Z backlog → active (system)

