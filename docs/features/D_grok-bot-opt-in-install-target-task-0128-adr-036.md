---
schema_version: 1
id: "D"
name: "Grok Bot opt-in install target (task 0128; ADR-036)"
status: done
priority: P2
tags: []
created_at: "2026-09-09T00:18:21.958Z"
updated_at: "2026-09-10T15:41:31.013Z"
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

**Approved extension (2026-09-09, Robin):** installation prepares a safe, plugin-scoped Grok Bot registration handoff through a reusable target post-install action mechanism shared with update; doctor distinguishes filesystem health from unverified slash visibility. Host registration and per-Bot enablement are separate observed steps. No new public register command, registration flag or host API transport. Verification-only 0129 is cancelled; its useful checks belong to the follow-up implementation task.

**Mechanism clarification (Robin, 2026-09-09):** task 0130 builds the common post-install action mechanism first and applies it to Grok Bot. Future coding-agent customizations use the same registration/dispatch contract (ADR-037); extensibility is verified with a second-target action test. Existing OMP customization is a reference case, with migration deferred.

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

  Scenario: R10 — AC12 Documentation and gates verified; host smoke split to 0129 (R10)
    Given synchronized owning docs and green repository gates
    When the verify pass runs lint, test, build, and spur task check
    Then ADR-036 and docs 01/02/03/04/05, README, and entity_locations carry grok-bot and every gate passes
    And the authorized VPS host smoke is split to follow-up task 0129 as the remaining host-acceptance evidence, not claimed here
```

```gherkin
Scenario: R11 — Install prepares a Grok Bot handoff automatically
  Given a plugin and an explicit grok-bot install selection
  When the Bot install succeeds
  Then a stable plugin-scoped JSON handoff and its next-step message are available
  And ordinary target installs create no Bot handoff

Scenario: R12 — Dry-run and failed installs do not publish a new handoff
  Given a prior Bot install or a missing Sand destination
  When dry-run or a failing catalog, handoff, or receipt write runs
  Then dry-run leaves destinations untouched and failures restore prior Bot artifacts
  And no new successful handoff is advertised

Scenario: R13 — Bridge and full handoffs preserve executable recipes
  Given bridge and full skills with custom frontmatter, arguments and relative resources
  When handoff records are generated and a preserving host-write round trip is simulated
  Then bridge instructions read the distinct canonical recipe and full records retain the actual recipe
  And self-referential replacement bodies are rejected and required metadata and resources survive

Scenario: R14 — Reinstall update and prune keep the handoff current
  Given an existing handoff, changed plugin catalog and recorded materialization mode
  When reinstall, marketplace update, mode switch or owned prune runs
  Then one current handoff contains exactly this install batch and reflects its mode and committed files
  And foreign files and plugins remain untouched and no host registry deletion is claimed

Scenario: R15 — Host rewrites retain ownership conflict protection
  Given a registered workflow whose bytes or resources differ from its ownership evidence
  When doctor and reinstall inspect the modified files
  Then meaningful edits remain protected and unsafe host normalization is reported as a conflict
  And no automatic rehash, force overwrite or delete-recreate hides the change

Scenario: R16 — Doctor separates filesystem health from slash visibility
  Given healthy, creatable, unavailable and broken Bot filesystem fixtures
  When doctor runs in human and JSON modes
  Then existing filesystem fields and exit semantics remain compatible and slash visibility is unknown
  And guidance distinguishes handoff preparation, host registration and per-Bot enablement

Scenario: R17 — Documentation and repository gates cover the install adaptation
  Given the implemented helper, diagnostics and focused regression tests
  When owning documentation is synchronized and required repository gates run
  Then the install-only handoff contract is documented and all required checks pass
  And no register command, registration flag, host transport or new dependency is added

Scenario: R18 — Host acceptance evidence remains explicit within implementation
  Given local tests and a separately authorized Bot session when one is available
  When representative skills, degraded commands and specialist playbooks are exercised
  Then Testing distinguishes local results from observed host registration, enablement, slash discovery and invocation
  And missing host access, unknown ids or unsafe host rewrites are recorded as unverified or blocked rather than successful
```

```gherkin
Scenario: R19 — Target post-install actions share an extensible lifecycle
  Given registered Grok Bot and second-target test actions
  When selected targets install, preview, fail or reinstall through update
  Then the shared mechanism selects and runs eligible actions in order with explicit results and failures
  And a second target requires only its action and registration without changing dispatcher logic
  And dry-run does not apply actions and a failed base install runs no dependent action
```

## Tasks

<!-- AUTO-GENERATED by spur feature refresh -->
| WBS | Task | Status |
| --- | ---- | ------ |
| 0128 | Add explicit opt-in Grok Bot VPS install target with durable workflow skills | done |
| 0130 | Prepare safe Grok Bot slash registration handoffs within install | done |
<!-- END AUTO-GENERATED -->

## Notes

**2026-09-09 (operator decision, Robin):** AC12 narrowed to docs+gates (locally verified); the authorized VPS host smoke split to task 0129, deliberately not `feature_id`-linked so this gate reflects shipped scope. Host acceptance remains unclaimed until 0129 records real VPS evidence.

**2026-09-09 amendment (Robin approved):** the earlier reference to 0129 is historical. Task 0129 is cancelled; its host checks transfer to the install-helper implementation task. The R11–R18 extension is planned, not shipped; task 0128 remains locally verified. Host acceptance remains unclaimed without runtime evidence.

## History

- 2026-09-09T18:39:15.322Z backlog → active (system)
- 2026-09-09T18:39:15.490Z active → verifying (system)
- 2026-09-09T18:39:15.636Z verifying → done (system)
- 2026-09-10T04:29:05.202Z done → active (system)
- 2026-09-10T15:41:30.790Z active → verifying (system)
- 2026-09-10T15:41:31.013Z verifying → done (system)

