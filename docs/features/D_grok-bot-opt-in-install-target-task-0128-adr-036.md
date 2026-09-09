---
schema_version: 1
id: "D"
name: "Grok Bot opt-in install target (task 0128; ADR-036)"
status: backlog
priority: P2
tags: []
created_at: "2026-09-09T00:18:21.958Z"
updated_at: "2026-09-09T06:05:11.685Z"
---

# D: Grok Bot opt-in install target (task 0128; ADR-036)

## Goal

Let operators publish a plugin's skill catalog to Grok Bot's VPS Sand host as durable workflows via an explicit opt-in install target, with owned updates, provenance receipts, and a read-only doctor diagnostic — without ever enabling Bot installs implicitly on other hosts (ADR-036).

## Scope

Opt-in install-only target `grok-bot` (ADR-036) that publishes a plugin's flat skill catalog to Grok Bot's VPS Sand host:

- Sand root resolution: `SAND_DATA` env → `<home>/sand-data` → qualifying `<home>/agent-data`; host-global only; never creates alias roots; dangling alias symlinks fail loudly.
- Bridge materialization (default): canonical copy under `<sandRoot>/.superskill/grok-bot/skills/<id>/` + thin `workflows/<id>/SKILL.md` pointer; `--materialize full` writes everything under `workflows/`.
- Grok Bot dialect: `/skill:<id>` → `/<id>` in skill prose.
- Ownership markers `.superskill-origin.json` (schema v1) gate reinstall/prune; unmarked/foreign entries fail instead of being overwritten.
- Receipt at `<sandRoot>/.superskill/manifests/grok-bot/<plugin>/` with `grokBot.materialize`; scanned by `superskill update` as an extra candidate root.
- `superskill doctor --targets grok-bot [--json]`: read-only health check (exit 0 healthy/creatable, 1 broken, 2 usage).

Excluded from `all` and implicit/config-only selections by design (opt-in).

**Out of scope:** remote/SSH transport, auto-deployment, native Bot subagents, hook/MCP emission for Bot, marketplace UX, and changes to other targets' behavior (ADR-036; task 0128 Q&A).

## Acceptance Criteria

```gherkin
Feature: Grok Bot opt-in install target (task 0128; ADR-036)

  Scenario: R1 — AC1 Explicit opt-in protects default hosts (R1)
    Given Sand directories or SAND_DATA exist on a host
    When install or update runs without an explicit grok-bot target selection or with bare --targets all
    Then grok-bot is excluded and no Bot workflow, canonical tree, or receipt is touched
    And explicit --targets grok-bot (alone or mixed) enables Bot

  Scenario: R2 — AC2 Resolve only valid host destinations (R2)
    Given env override, existing sand-data, qualifying agent-data alias, and no-root layouts
    When an explicit Bot install or diagnostic resolves its root
    Then documented priority, canonicalization, and missing/creatable behavior apply
    And invalid explicit roots fail without fallback or laptop-tree creation

  Scenario: R3 — AC3 All invocable entity kinds form valid skills (R3)
    Given a plugin with skills, commands, agents, and resource directories
    When Bot installation maps the selected feature classes
    Then unique flat IDs use existing collision precedence with valid name/description frontmatter
    And zero selected invocable entities fail before any target writes

  Scenario: R4 — AC4 Bridge survives staging and source removal (R4)
    Given a Bot-only bridge installation
    When mapping staging and the original plugin source are removed
    Then every bridge resolves its private canonical recipe and relative resources

  Scenario: R4 — AC5 Full mode and mode switches preserve usable content (R4, R6)
    Given full-mode installation and explicit reinstall mode switches
    When the original plugin disappears
    Then the current mode's recipes remain usable and only obsolete owned artifacts are removed

  Scenario: R5 — AC6 Bot dialect and skipped capabilities are isolated (R5)
    Given plugin colon references, Skill recipe notation, and optional host capabilities
    When Bot-only and mixed-target installs run
    Then Bot shows flat slash IDs with explicit playbook adaptation and triggers no host CLI/rulesync/magent/hook/MCP/scripts writes

  Scenario: R6 — AC7 Ownership limits reinstall and prune (R6)
    Given owned workflows, stale owned IDs, unmarked lookalikes, foreign markers, and modified owned files
    When reinstall, mode switch, and prune plans run
    Then conflicts fail before overwriting or deleting local/unowned content

  Scenario: R6 — AC8 Failed Bot writes recover prior output (R6, R8)
    Given an existing Bot install and an injected write or receipt failure
    When the replacement attempt fails
    Then prior Bot files and receipt are restored and success is not printed

  Scenario: R7 — AC9 Custom-root provenance and update retain identity (R7)
    Given Bot receipts under a custom Sand root
    When explicit Bot update check and marketplace update run
    Then only selected target roots are consulted and the recorded mode and source identity are preserved

  Scenario: R8 — AC10 Dry-run exposes the complete plan without target mutation (R8)
    Given a local plugin and a creatable absent Sand root
    When dry-run install is requested
    Then the full plan is printed and no destination, marker, receipt, or prune mutation occurs

  Scenario: R9 — AC11 Doctor reports local readiness honestly (R9)
    Given valid, absent, creatable, and broken Sand fixtures
    When doctor --targets grok-bot runs in text and JSON modes
    Then documented fields and exit 0/1/2 distinguish readiness and issues without mutation

  Scenario: R10 — AC12 Documentation and host discovery are verified (R10)
    Given synchronized owning docs and green repository gates
    When an authorized Bot host session previews, installs, and invokes representative workflows
    Then slash discovery, argument passing, and relative-resource reads are recorded as host evidence
```

## Tasks

<!-- AUTO-GENERATED by spur feature refresh -->
| WBS | Task | Status |
| --- | ---- | ------ |
| 0128 | Add explicit opt-in Grok Bot VPS install target with durable workflow skills | testing |
<!-- END AUTO-GENERATED -->

## Notes

## History
