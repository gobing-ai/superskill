---
schema_version: 1
id: "C"
name: "SOTA refresh of the team-stark-children magent package"
status: done
priority: P2
tags: []
created_at: "2026-09-02T18:56:52.720Z"
updated_at: "2026-09-02T20:46:46.863Z"
---

# C: SOTA refresh of the team-stark-children magent package

## Goal

**Destination:** `magents/team-stark-children/` teaches every coding agent the *same* three things
it teaches today — harness routing, safety, discipline — but at roughly half the token cost, with
zero invocations that do not resolve against the live CLI, and with one new doctrine the model
cannot infer: **how to pick a tool.**

Reaching the destination means: `AGENTS.md` drops from 17,278 to ≤9,500 chars with all 16 `##`
headings intact and in order; `spur status` / `spur init` (which do not exist) are gone; the
tool-priority ladder reaches all nine install targets, including the two that read an override
instead of the root file; and `superskill magent evaluate` clears 0.90 aggregate on the project's
own rubric — up from 0.7857.

## Scope

- In:
  - `magents/team-stark-children/AGENTS.md` — compression to ≤9,500 chars, CLI-drift repair, new tool-priority doctrine
  - `magents/team-stark-children/overrides/codexcli/AGENTS.md` — doctrine mirror + drift repair
  - `magents/team-stark-children/overrides/pi/AGENTS.md` — doctrine mirror + drift repair
  - `plugins/cc/rules/` — a new rule module receiving depth displaced from `AGENTS.md`
  - `magents/team-stark-children/README.md` — layout table refresh if the rule set changes
- Out:
  - `IDENTITY.md` / `SOUL.md` / `USER.md` — persona layers, untouched by this feature
  - `packages/core/src/quality/*` — the rubric is the measuring instrument, not the subject; changing it to flatter the file would invalidate the gate (feature A already re-scoped it)
  - Symlinking `AGENTS.md` ↔ `CLAUDE.md` — operator ruled out 2026-08-13 (feature A, Scope § Out); still ruled out
  - `scoreSafety` keyword-density rework — pre-existing weakness inherited from feature A's Out list; this feature must clear 0.90 **without** it
  - Other magent packages under `magents/` — this feature is scoped to `team-stark-children`

## Acceptance Criteria

```gherkin
Feature: SOTA refresh of the team-stark-children magent package

  @core
  Scenario: R1 — Every documented harness invocation resolves against the live CLI
    Given the installed spur and superskill binaries on PATH
    When a reviewer extracts every "spur <noun> <verb>" and "superskill <noun> <verb>" invocation from AGENTS.md and both override files
    Then each extracted noun and verb appears in that binary's own --help output
    And no invocation of "spur status" or "spur init" remains anywhere in the package

  @core
  Scenario: R2 — The tool-priority doctrine states the ladder and its reason
    Given the refreshed AGENTS.md
    When an agent reads the tool-selection guidance
    Then native built-in tools rank above every shell-shaped tool
    And the shell-shaped family is named explicitly, covering at least bash, Bash, shell, Shell, run_terminal_command, and Python
    And the demotion carries its reason: unbounded output floods context and a general shell shadows the purpose-built tool
    And file search ranks native tools first, then rg and sg, then grep, sed, awk, and perl
    And the rg and sg preference carries its reason: gitignore-aware traversal skips files a raw text scan would read
    And web access ranks native search and fetch first, then curl, wget, and MCP or plugin surfaces

  @core
  Scenario: R3 — The doctrine reaches every install target
    Given the magent package emits to nine targets and only codex and pi resolve an overrides/ AGENTS layer
    When the package is assembled for each target
    Then the assembled content for every target contains the tool-priority ladder
    And the codex override stays within its documented 32 KiB cap

  @core
  Scenario: R4 — AGENTS.md is compressed without losing its layout
    Given AGENTS.md measured 17278 characters before the refresh
    When the refreshed file is measured
    Then its body is at most 9500 characters
    And it still contains the same 16 level-two headings in the same order

  @core
  Scenario: R5 — Quality clears the gate on the project's own rubric
    Given the refreshed magent package
    When "superskill magent evaluate magents/team-stark-children/AGENTS.md --json" is run
    Then the aggregate is at least 0.90
    And the conciseness dimension is greater than 0.70
    And no dimension scores lower than it did at the 0.7857 baseline

  @core
  Scenario: R6 — Displaced depth is relocated, not deleted
    Given content removed from AGENTS.md during compression
    When the reviewer diffs the removed content against the plugin rules directory
    Then each removed rule is either present in a plugins/cc/rules module or was a verbatim duplicate of content that already lived there
    And no removed rule is absent from both

  @edge
  Scenario: R7 — Targets without a rules directory retain safety and discipline
    Given opencode, hermes, grok, and omp receive no plugin rules at install time
    When the assembled AGENTS.md for those targets is read
    Then it still states the CRITICAL safety boundaries and the verification gate inline

  @edge
  Scenario: R8 — The refreshed package installs and validates cleanly
    Given the refreshed magent package
    When "superskill magent validate magents/team-stark-children" is run
    And "bun run spur-check" is run
    Then both report success
```

## Tasks

<!-- AUTO-GENERATED by spur feature refresh -->
| WBS | Task | Status |
| --- | ---- | ------ |
| 0125 | Refresh the team-stark-children magent package to SOTA | done |
<!-- END AUTO-GENERATED -->

## Notes

## History

- 2026-09-02T20:39:03.718Z backlog → active (system)
- 2026-09-02T20:46:46.713Z active → verifying (system)
- 2026-09-02T20:46:46.863Z verifying → done (system)
