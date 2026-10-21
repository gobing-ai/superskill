---
schema_version: 1
id: "F31"
name: "Plugin-owned multi-persona magents"
status: backlog
priority: P2
tags: []
created_at: "2026-10-21T18:32:53.527Z"
updated_at: "2026-10-21T18:33:55.312Z"
---

# F31: Plugin-owned multi-persona magents

## Goal

Main-agent personas are plugin-owned packages under `plugins/<plugin>/magents/<name>/` (starting with `plugins/cc/magents/team-stark-children`), with one defined way to package, list, select, install and coexist a second and third persona (content creation, travel planning, …) — while `superskill install cc --verbose --magent team-stark-children --marketplace <package-root>` keeps working unchanged.

## Scope

**In scope**
- `git mv magents/team-stark-children plugins/cc/magents/team-stark-children`; rewrite its relative links and every repo link to the old path.
- Remove marketplace-root `magents/` discovery (install Step 5, `nameMode: 'bare'`), bundling (`build:bundle`, npm `files`) and documentation.
- Magent identity resolution (`superskill magent validate|evaluate|refine <name>`) finds `plugins/*/magents/<name>/`.
- Multi-persona selection: auto-select when exactly one plugin-owned persona ships; with several and no `--magent`, write no main-agent file and print one non-verbose stdout line listing names.
- `superskill install <plugin> --list-magents`: list persona names and descriptions without installing.
- Scope-based coexistence (global `-g` vs project) and in-scope switching verified by tests.
- ADR-041 acceptance and same-commit doc sync (`04_DESIGN.md`, `docs/help/cmd_install.md`, `bundled_plugin.md`, `release.md`, `plugins/cc/README.md`, `plugins/cc/rules/README.md`, cc-magents skill references).

**Out of scope**
- Authoring the second/third personas themselves — only the mechanism that hosts them.
- Shared cross-persona layers (one `USER.md` reused by several personas) — deferred until a second persona exists.
- Deleting stale layer files on persona switch — inert under the Claude `@import` model (only `CLAUDE.md` decides what loads) and single-file assembly elsewhere; revisit if a target loads every `*.md` in its config dir.
- Anti-hallucination guard changes (→ H21).

## Acceptance Criteria

```gherkin
Feature: Plugin-owned multi-persona magents

  @core
  Scenario: R1 — Persona package lives under the cc plugin tree
    Given the repository after the move
    When listing `plugins/cc/magents/`
    Then it contains `team-stark-children/` with IDENTITY.md, SOUL.md, AGENTS.md, USER.md, CLAUDE.md and README.md
    And the repository root has no `magents/` directory
    And `claude plugin validate plugins/cc` reports no errors

  @core
  Scenario: R2 — Existing install command still installs the primary persona
    Given the published package layout produced by `bun run build:bundle` in `apps/cli`
    When `superskill install cc --verbose --magent team-stark-children --marketplace <apps/cli package root> --dry-run` runs
    Then it reports magent `cc-team-stark-children` for the Claude CLAUDE.md destination
    And the bundle contains `plugins/cc/magents/team-stark-children/` and no root `magents/` copy

  @core
  Scenario: R3 — Root magents discovery and references are removed
    Given the install command, the build bundle script, the package files list and the core mapper
    When searching them for marketplace-root `magents` handling
    Then no code path stages a marketplace-root `magents/` directory and `nameMode` no longer exists
    And `superskill magent evaluate team-stark-children` run from the repository root resolves `plugins/cc/magents/team-stark-children/CLAUDE.md`

  @core
  Scenario: R4 — Install without a persona flag lists choices when several personas ship
    Given the cc plugin's `magents/` holds two packages "team-stark-children" and "travel-planner"
    When `superskill install cc` runs without `--magent` and without `--verbose`
    Then no main-agent file is written
    And exactly one stdout line names both personas and the `--magent <name>` flag

  @core
  Scenario: R5 — Personas coexist by install scope
    Given "team-stark-children" is installed with `-g`
    When `superskill install cc --magent travel-planner` runs in a project directory without `-g`
    Then the project-scope CLAUDE.md is the travel-planner package
    And the global CLAUDE.md is byte-identical to before

  @core
  Scenario: R6 — Switching personas in one scope loads only the new persona
    Given "team-stark-children" is installed in a scope
    When `superskill install cc --magent travel-planner` runs in the same scope
    Then the scope's CLAUDE.md is the travel-planner package and imports only layers travel-planner ships

  @core
  Scenario: R7 — Available personas are listable
    Given the cc plugin's `magents/` holds one or more persona packages
    When `superskill install cc --list-magents` runs
    Then each line prints a package name and its one-line description
    And nothing is installed and the exit code is 0

  @core
  Scenario: R8 — Decision record and docs describe plugin-owned personas
    Given the change set
    When reading `docs/00_ADR.md`, `docs/04_DESIGN.md`, `docs/help/cmd_install.md`, `docs/help/bundled_plugin.md` and `docs/help/release.md`
    Then ADR-041 is Accepted and supersedes the root-magents clause of ADR-034
    And `--list-magents` is documented in `04_DESIGN.md` and `cmd_install.md`
    And no doc outside dated ADR history describes a marketplace-root `magents/` directory
```

## Tasks

<!-- AUTO-GENERATED by spur feature refresh -->
| WBS | Task | Status |
| --- | ---- | ------ |
| 0156 | Plugin-owned magents under plugins/cc/magents with multi-persona install | todo |
<!-- END AUTO-GENERATED -->

## Notes

## History
