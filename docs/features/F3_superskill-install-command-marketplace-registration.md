---
schema_version: 1
id: "F3"
name: "superskill install command + marketplace registration"
status: active
priority: P1
tags: []
created_at: "2026-08-01T00:40:45.858Z"
updated_at: "2026-08-02T22:22:12.795Z"
---

# F3: superskill install command + marketplace registration

## Goal
Host-CLI install dispatch (`superskill install`) including Layer A marketplace registration (`--marketplace-source directory|github`). Hand-authored companion notes also live in `F004-install-command.md` (legacy feature-tree slug). Supersedes malformed legacy file F1 (recreated via CLI after F1 failed L2 section-matrix checks — pre-existing hand-authored structure, unfixable via section-replace). Also absorbs legacy F004 (install command + target dispatch, Phase 1) — converted 2026-08-01.
## Scope
- In: Host-CLI install dispatch (`superskill install`) including Layer A marketplace registration (`--marketplace-source directory|github`); per-target artifact dispatch for skills/commands/subagents/hooks/mcp; native subagent emitters where the target has a real subagent runtime (pi; codex TOML via task 0111, dual-emit alongside the skills floor); declared `model-tier` → per-target model/reasoning translation in native emitters; authoring-time tier classification rule (rubric + judge seam in cc-agents).
- Out: Target-side runtime behavior after install (agent orchestration internals); changes to the rulesync-uniform skill downgrade for targets without a native subagent runtime; pruning of stale native agent files on reinstall; install-time LLM classification of any kind; per-agent hardcoded model registries.
## Acceptance Criteria
Feature: superskill install command + marketplace registration

  Scenario: Install resolves plugins via marketplace and dispatches per target.
    Given a plugin registered in a marketplace
    When the operator runs superskill install for a target
    Then the plugin is resolved via the marketplace and dispatched per that target

  Scenario: Claude/Grok/OMP can register marketplaces as directory path or github slug.
    Given a marketplace source expressed as a directory path or github slug
    When the operator registers it for Claude, Grok, or OMP
    Then the marketplace is registered and usable for installs

  Scenario: Operator migration runbook ships for directory to github without breaking plugin IDs.
    Given an existing directory-based marketplace registration
    When the operator follows the migration runbook to a github source
    Then plugin IDs remain stable across the migration

  Scenario: Codex target receives native subagent TOML alongside the skills floor.
    Given a plugin that ships agents/*.md subagents
    When the operator installs it for the codex target
    Then one <plugin>-<agent>.toml per agent lands in <codex-home>/agents/ and the subagent-derived skills still land under .agents/skills/

  Scenario: Codex subagent TOML carries the verified schema with rewritten references.
    Given a Claude-format subagent markdown file
    When it is adapted for codex
    Then the TOML contains name/description/developer_instructions plus model/reasoning keys from the tier mapping, with a non-blank developer_instructions and plugin-scoped references rewritten to installed skill names

  Scenario: Codex subagent dispatch honors feature gates, dry-run, and project mode.
    Given install options that exclude subagents, or --dry-run, or --no-global
    When the operator installs a plugin with agents for the codex target
    Then TOML emission is suppressed or redirected to <cwd>/.codex/agents/ accordingly

  Scenario: Non-codex install flows remain unchanged.
    Given the pi, claude, hermes, omp, and grok install paths
    When the codex subagent dispatch ships
    Then those flows behave byte-identically to before and mapPluginToRulesync is untouched

  Scenario: Codex agent discovery mechanism is probed and recorded before emission ships.
    Given a scratch CODEX_HOME with a hand-written agent TOML
    When the probe runs against the installed codex CLI
    Then the task records whether directory auto-discovery suffices or [agents] config registration is required

  Scenario: Codex subagent TOML emits model and reasoning effort from the declared model tier.
    Given an agent whose frontmatter declares model-tier judgment or execution
    When it is adapted for codex and the probe confirms codex honors the keys
    Then the TOML carries the mapped model and model_reasoning_effort from the single tier-mapping const

  Scenario: Agents without a declared tier fall back to the execution tier for cost control.
    Given an agent with no model-tier field (or only a Claude-side model value)
    When it is adapted for codex
    Then the TOML carries the execution mapping (gpt-5.6-luna, max) so sub-agent cost and effort stay pinned

  Scenario: Model tier classification is rule-based and applied at authoring time, never during install.
    Given the model-tier rubric and the quality-brain Scorer seam
    When an agent is authored, evolved, or audited
    Then its tier is derived from the rubric's characteristics by LLM-as-judge and stamped into frontmatter, while superskill install never calls an LLM

  Scenario: Docs record the codex subagent dispatch in the same commit.
    Given the codex subagent dispatch implementation
    When it lands
    Then 00_ADR, 04_DESIGN, and 03_ARCHITECTURE describe it consistently in the same commit

  Scenario: Install quality gates stay green with the codex dispatch added.
    Given the codex dispatch and its tests
    When bun run spur-check runs
    Then lint, typecheck, tests, build, and pre/post rules pass without skips or ignore-list entries

  Scenario: Codex agent discovery and model-key honoring are live-verified and routed.
    Given the account usage limit has reset and a scratch CODEX_HOME with a probe agent TOML
    When the live list_agents and spawn probes run
    Then the discovery and model-key verdicts are recorded and routed per the 0111 R9/R14 fallback paths
## Tasks

<!-- AUTO-GENERATED by spur feature refresh -->
| WBS | Task | Status |
| --- | ---- | ------ |
| 0004 | superskill install command + target dispatch | done |
| 0073 | Enhance superskill install to support omp targets as native Claude Code plugins | done |
| 0086 | GitHub marketplace registration for spur/superskill (replace directory marketplaces) | done |
<!-- END AUTO-GENERATED -->

## Notes

## History
- 2026-08-01T00:40:59.611Z backlog → active (system)
