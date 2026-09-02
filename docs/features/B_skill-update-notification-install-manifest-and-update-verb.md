---
schema_version: 1
id: "B"
name: "Skill update notification - install manifest and update verb"
status: done
priority: P2
tags: []
created_at: "2026-08-31T17:24:10.568Z"
updated_at: "2026-09-01T05:29:10.192Z"
---

# B: Skill update notification - install manifest and update verb

## Goal

Give consumers of installed superskill capabilities a pull-based way to discover and apply upstream updates. Today `superskill install` is a one-shot copy with no provenance: installed skill/command/agent copies carry no version, source stamp, or hashes, so a plugin author shipping several versions in a day is invisible to everyone who already installed (real external user feedback). v1 makes staleness computable and actionable: (1) install writes a per-scope provenance manifest (plugin id, source locator, upstream version/commit, timestamp, per-file hashes), and (2) a new `superskill update` verb checks installed copies against the upstream marketplace (`--check` reports stale capabilities; bare `update` re-installs) for real user feedback: "一天连续更新好几个版本，没有更新提醒机制，别人很难知道你更新了".

## Scope

**In scope (v1 — pull model):**

- Install-time provenance manifest written per target scope on `superskill install` (plugin id, marketplace locator, upstream version/commit, install timestamp, capability file list + content hashes); target-agnostic write across all platforms.
- New `superskill update [plugin]` verb: `--check` diffs manifests vs upstream (local path marketplaces in v1; GitHub locator reuse from `--marketplace`), lists stale/changed capabilities; bare `update` re-installs changed plugin(s).
- Back-compat behavior for pre-manifest installs: report "reinstall to adopt" instead of failing.
- Unit tests for manifest write/diff and update verb; docs/04_DESIGN.md updated same-commit for the new verb + manifest schema.

**Out of scope (deferred layers):**

- Push notification (release feeds, `updates.json` publishing conventions).
- In-agent stale banner hook (opt-in network check inside coding agents).
- Auto-update / scheduled background checks.
- Transform-aware diffing beyond straight file copy.

## Acceptance Criteria

```gherkin
Feature: Skill update notification - install manifest and update verb

  @core
  Scenario: R1 — Install writes a provenance manifest per target scope
    Given a plugin with skills and commands and a configured target agent
    When the operator runs "superskill install <plugin>"
    Then a provenance manifest is written next to the installed capabilities for that scope
    And the manifest records plugin id, marketplace locator, upstream version or commit, install timestamp, and a per-file list with content hashes matching the installed files

  @core
  Scenario: R2 — Update check reports stale capabilities against an upstream local marketplace
    Given an installed plugin with a provenance manifest
    And the upstream marketplace at the recorded locator has changed at least one capability file since install
    When the operator runs "superskill update --check"
    Then the output lists the plugin as stale and names the changed capabilities
    And the exit code signals updates available

  @core
  Scenario: R3 — Update check reports up-to-date installs without false positives
    Given an installed plugin whose manifest hashes and version match the upstream marketplace
    When the operator runs "superskill update --check"
    Then the output reports the plugin as up to date
    And no files are modified

  @core
  Scenario: R4 — Update re-installs a stale plugin
    Given an installed plugin reported stale by "superskill update --check"
    When the operator runs "superskill update <plugin>"
    Then the plugin's capabilities are re-installed from the upstream marketplace
    And the provenance manifest is refreshed to match the newly installed files

  @core
  Scenario: R5 — Pre-manifest installs degrade gracefully
    Given an installed plugin from a superskill version that wrote no manifest
    When the operator runs "superskill update --check"
    Then the output reports the plugin as "installed before manifest support - reinstall to adopt"
    And the command exits successfully without crashing

  @edge
  Scenario: R6 — Upstream locator unavailable during check
    Given an installed plugin whose marketplace locator no longer resolves
    When the operator runs "superskill update --check"
    Then the output reports the upstream as unavailable for that plugin
    And other plugins in the same check run are still reported

  @edge
  Scenario: R7 — Corrupt or missing manifest is treated as pre-manifest
    Given an installed plugin whose manifest file is corrupt or was deleted
    When the operator runs "superskill update --check"
    Then the plugin is reported with the "reinstall to adopt" guidance
    And the command does not crash

  @edge
  Scenario: R8 — Multiple same-day upstream versions collapse into one stale report
    Given an installed plugin whose upstream published several new versions since install
    When the operator runs "superskill update --check"
    Then the plugin is reported stale once with the current upstream version
    And no per-release history is required to produce the report
```

## Tasks

<!-- AUTO-GENERATED by spur feature refresh -->
| WBS | Task | Status |
| --- | ---- | ------ |
| 0123 | Install writes provenance manifest per target scope | done |
| 0124 | superskill update verb - check and re-install stale plugins | done |
<!-- END AUTO-GENERATED -->

## Notes

## History
- 2026-09-01T05:29:09.896Z backlog → active (system)
- 2026-09-01T05:29:10.053Z active → verifying (system)
- 2026-09-01T05:29:10.192Z verifying → done (system)
