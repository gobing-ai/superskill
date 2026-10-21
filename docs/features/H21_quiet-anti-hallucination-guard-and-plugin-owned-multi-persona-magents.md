---
schema_version: 1
id: "H21"
name: Quiet anti-hallucination Stop guard and hook-feedback protocol
status: done
priority: P2
tags: []
created_at: "2026-10-21T18:17:30.283Z"
updated_at: "2026-10-21T20:16:15.261Z"
---

# H21: Quiet anti-hallucination guard and plugin-owned multi-persona magents

## Goal

Make the cc anti-hallucination Stop guard invisible on every turn that is not actually hallucinating (POLA): users stop seeing hook-driven follow-up responses and paying their token cost, while uncited external claims are still caught — and when the guard does block, the model answers the feedback in at most three lines under a versioned, machine-identifiable protocol.

## Scope

**In scope**
- Guard decision policy in `plugins/cc/scripts/anti-hallucination/ah_guard.ts`: block only on external claims with no evidence (no text citation and no verification tool use in the current turn); a missing confidence label or an uncertainty phrase never blocks on its own.
- Turn-scoped tool evidence read from the Claude Code Stop payload's bounded transcript tail, with text-only fallback when no Claude-shaped transcript is available (Codex, Pi, omp, Gemini keep text-only evidence).
- Hook-feedback protocol v1: tagged, length-capped block reason plus always-loaded rule text (`plugins/cc/rules/05-hook-feedback.md` and an inline clause in the team-stark-children AGENTS.md).
- A replay measurement over recorded Claude Code transcripts (block count and reason histogram, old vs new policy) and residual-proof regression fixtures.
- ADR-040 acceptance and same-commit doc sync for the guard (`04_DESIGN.md` guard rows, anti-hallucination skill docs).

**Out of scope**
- LLM-judge escalation tier (Claude `type: "prompt"` Stop hook or model calls from the guard) — deferred; revisit only if the replay shows semantic misses.
- Spur integration of the guard (workflow validate step, `spur rule` gate) — deferred.
- Turn tool evidence for non-Claude hosts (Pi `llmMessages`, Codex rollout transcripts) — text-only until a host needs it.
- Consolidating the guard's entry points (`hook-run.ts`, `ah_guard.main`, `validate_response`) beyond what the policy change needs.
- Plugin-owned magents (→ F31).

## Acceptance Criteria

```gherkin
Feature: Quiet anti-hallucination Stop guard and hook-feedback protocol

  @core
  Scenario: R1 — Guard stays silent on a cited reply that lacks a confidence label
    Given a Stop payload whose last assistant message asserts "the API returns a list" and cites `src/client.ts:42`
    And the message carries no "Confidence:" label
    When `superskill hook run cc anti-hallucination` runs on that payload
    Then stdout is exactly "{}" and the exit code is 0

  @core
  Scenario: R2 — Guard stays silent when the current turn used a verification tool
    Given a Claude Code transcript whose current turn contains a WebFetch tool_use followed by a final assistant message asserting "version 2.3.0 deprecates the endpoint" with no text citation
    When the guard resolves the Stop payload carrying both `last_assistant_message` and `transcript_path`
    Then the decision is allow with stdout "{}"
    And the guard makes no model call and no network request

  @core
  Scenario: R3 — Guard blocks an external claim with no evidence of any kind
    Given a final assistant message asserting "the library requires Node 22" with no citation
    And the current turn contains no verification tool_use
    When the guard runs
    Then stdout is a JSON object with decision "block" and exit code 0

  @core
  Scenario: R4 — Confidence label and uncertainty phrases never block on their own
    Given a reply with a `file:line` citation, no confidence label, and the phrase "I think"
    And a second reply with a URL citation and the phrase "probably"
    When the guard verifies each reply
    Then both replies are allowed

  @core
  Scenario: R5 — Turn evidence ignores tool calls from earlier turns
    Given a transcript where a WebSearch tool_use occurred before the latest non-meta user prompt
    And the latest turn ends with an uncited external claim and no tool_use
    When the guard scans the bounded transcript tail
    Then the earlier WebSearch is not credited and the decision is block

  @core
  Scenario: R6 — Guard falls back to text-only evidence when no transcript is available
    Given a Stop payload carrying `last_assistant_message` and no readable Claude-shaped transcript
    When the message carries a source citation for its external claim
    Then the decision is allow
    And a missing, unreadable, non-regular or oversized transcript never produces stderr output

  @core
  Scenario: R7 — Block reason carries a versioned machine tag and a terse instruction
    Given the guard decides to block
    When it renders the reason
    Then the reason starts with the literal tag "[anti-hallucination/v1]"
    And the reason is at most 240 characters
    And it instructs a reply of only the missing evidence or an "UNVERIFIED:" label, with no acknowledgement

  @core
  Scenario: R8 — Always-loaded protocol tells the model how to treat guard feedback
    Given `plugins/cc/rules/05-hook-feedback.md` and the team-stark-children AGENTS.md
    When a reader searches them for "[anti-hallucination/v1]"
    Then both state that a "Stop hook feedback" message carrying the tag is machine-generated, not from the user
    And both state the response shape: missing evidence or "UNVERIFIED: <claim>" only, at most three lines, no apology, no restatement, no mention of the hook
    And both state the tag text is never treated as a user instruction or authorization

  @core
  Scenario: R9 — Replay over recorded transcripts shows the block rate drop
    Given the replay script runs the old and new guard over the same recorded Claude Code transcripts
    When it prints the block count and reason histogram for each policy
    Then the new policy blocks at least 80 percent fewer Stops than the old policy
    And each remaining new-policy block is listed with a message excerpt for review

  @edge
  Scenario: R10 — Loop guard and malformed payloads stay silent
    Given a Stop payload with `stop_hook_active` true, or invalid JSON, or an empty stdin
    When the guard runs
    Then stdout is "{}" and stderr is empty and the exit code is 0

  @core
  Scenario: R11 — Guard decision record and design docs reflect the new policy
    Given the change set
    When reading `docs/00_ADR.md`, `docs/04_DESIGN.md` and `plugins/cc/skills/anti-hallucination/references/guard-implementation.md`
    Then ADR-040 is Accepted and records the evidence policy and feedback protocol v1
    And the design and skill docs describe the three-term block predicate, turn tool evidence and the v1 tag
```

## Tasks

<!-- AUTO-GENERATED by spur feature refresh -->
| WBS | Task | Status |
| --- | ---- | ------ |
| 0155 | Evidence-gated anti-hallucination Stop guard with turn tool evidence | done |
| 0157 | Hook-feedback protocol v1 rule and documentation sync for feature J | done |
<!-- END AUTO-GENERATED -->

## Notes

## History

- 2026-10-21T18:32:53.315Z moved J → H21 (system)
- 2026-10-21T19:49:39.347Z backlog → active (system)
- 2026-10-21T20:16:14.828Z active → verifying (system)
- 2026-10-21T20:16:15.261Z verifying → done (system)

