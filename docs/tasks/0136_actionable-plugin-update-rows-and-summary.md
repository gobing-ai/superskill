---
schema_version: 1
name: Actionable plugin update rows and summary
status: todo
template: feature-impl
created_at: 2026-09-13T18:04:14.441Z
updated_at: "2026-09-13T18:41:49.091Z"
feature_id: F8
priority: P2
tags:
  - update
  - cli
  - ux

dependencies: ["0133"]
---

## 0136. Actionable plugin update rows and summary

### Background

The UX half of the feature for plugin rows, triggered by the observed `kk: stale: 0.0.1 → 0.0.1` line (content drift without a version bump; knowledge-kit commits 6896953/8b6549c/69135e4 changed workflows at unchanged 0.0.1, and kk declares 0.0.1 in .claude-plugin/marketplace.json vs 0.1.0 in plugins/kk/plugin.json — both verified against /Users/robin/xprojects/knowledge-kit on 2026-09-13). Depends on 0133 (UpdateRow fields). Rubric: E2 D2 L1 C2 R1 = 8 → decomposed (cohesion: single formatter surface in apps/cli/src/commands/update.ts:375-395 + resolveMarketplaceUpstream update.ts:338). Implements: F8 R8–R12, R14, R15, R17, R21; 04_DESIGN.md update surface (row wording, exit-code help).

### Requirements

- [ ] R1. Content drift at an unchanged version is named as such. When a stale marketplace row's installedVersion equals upstreamVersion, the row reads `<name>: stale: content changed, version <v> unchanged (<n> files changed: <a>, <b>, <c>)` instead of `<v> → <v>`; the drift wording triggers only on equal versions, and a version bump keeps the existing `<old> → <new>` form.
- [ ] R2. Changed-path lists are capped in text. A stale row names at most 5 changed paths followed by `+N more` when longer; --check --json always lists every path (envelope rows carry the full changedPaths array).
- [ ] R3. Partially stale targets are named. When a merged stale plugin row has staleTargets (0133 R2) covering fewer targets than installed, the row appends `[stale on: <targets>]`.
- [ ] R4. Disagreeing version declarations are surfaced. resolveMarketplaceUpstream returns { ok: true, version, snapshot, versionMismatch? } | { ok: false, reason } in place of today's undefined-on-catch (~update.ts:338); when marketplace.json and plugin.json declare different versions, the compare keeps marketplace-first precedence and the row prints `note: marketplace.json declares <a>, plugin.json declares <b>`.
- [ ] R5. Unavailable rows name the cause. The { ok: false, reason } path feeds UpdateRow.reason: missing locator directory, manifest/parse failure, and network/registry failures each produce a specific reason string; the bundled-unavailable and missing-locator rows get concrete reasons instead of empty locators. The 0133 formatter branch prints `(<locator>): <reason>`; exit code 2 semantics are unchanged.
- [ ] R6. A legacy row names the reinstall command. Legacy plugin rows append ``run `superskill install <name>` to adopt``.
- [ ] R7. The npm remedy is labeled. The bundled-channel line reads `To upgrade superskill and its bundled plugins, run: npm i -g @gobing-ai/superskill@latest`.
- [ ] R8. Check output ends with a summary and the next command. After the Plugins:/Skills: groups, a final line counts every status present — `Summary: <s> stale, <c> up to date[, <u> not checked][, <l> legacy][, <x> unavailable]. Run: superskill update` — the `Run:` clause names bare `superskill update` only when at least one row is stale.
- [ ] R9. Help documents the exit codes. superskill update --help states: 0 nothing stale, 1 stale under --check or apply failure, 2 an unavailable upstream; the --json flag help states it requires --check.
- [ ] R10. Leave focused regression evidence. The 25 CLI update tests are extended (not rewritten) for: drift wording (kk-shaped fixture), 12-path cap with +7 more and full JSON list, [stale on: claude], version-mismatch note naming both versions, unavailable reason for a missing locator path, legacy remedy line, labeled npm line, summary footer, and --help exit-code text. bun run lint, bun run test, bun run build pass. docs/04_DESIGN.md update row wording and exit codes sync in the same commit.

### Acceptance Criteria

```gherkin
Scenario: R8 — Content drift at an unchanged version is named as such
  Given marketplace plugin kk was installed at version 0.0.1 and upstream workflows/kk-daily-ai-voice.yaml changed while the version stayed 0.0.1
  When the operator runs `superskill update --check`
  Then the kk row says its content changed with version 0.0.1 unchanged and does not contain `0.0.1 → 0.0.1`

Scenario: R9 — Disagreeing plugin version declarations are surfaced
  Given the marketplace entry for kk declares version 0.0.1 and plugins/kk/plugin.json declares 0.1.0
  When the operator runs `superskill update --check`
  Then the kk row notes that the marketplace and plugin.json versions disagree and names both 0.0.1 and 0.1.0

Scenario: R10 — Check output ends with a summary and the next command
  Given plugin kk is stale and plugin sp is up to date
  When the operator runs `superskill update --check`
  Then the output ends with a summary counting 1 stale and 1 up to date and naming the command `superskill update`

Scenario: R11 — Long changed-path lists are capped in text output
  Given stale plugin kk has 12 changed upstream files
  When the operator runs `superskill update --check`
  Then the kk row names at most 5 paths followed by `+7 more`, and `superskill update --check --json` lists all 12 paths

Scenario: R12 — Partially stale targets are named
  Given plugin kk is stale on target claude and current on its other installed targets
  When the operator runs `superskill update --check`
  Then the kk row names claude as the stale target

Scenario: R14 — The bundled-channel npm remedy is labeled
  Given a bundled plugin whose recorded superskill version is older than the npm latest
  When the operator runs `superskill update`
  Then the line with `npm i -g @gobing-ai/superskill@latest` says that it upgrades superskill and its bundled plugins

Scenario: R15 — A legacy install row names the reinstall command
  Given plugin kk has installed files but no install manifest
  When the operator runs `superskill update --check`
  Then the kk row names the command `superskill install kk`

Scenario: R17 — Update help documents the exit codes
  When the operator runs `superskill update --help`
  Then the help text states exit code 0 for nothing stale, 1 for stale under --check, and 2 for an unavailable upstream

Scenario: R21 — An unavailable plugin row names the cause
  Given plugin kk was installed from marketplace locator /tmp/gone-marketplace which no longer exists
  When the operator runs `superskill update --check`
  Then the kk row names /tmp/gone-marketplace and states that the locator path is missing, and the exit code is 2
```

### Q&A

<!-- CLOSED decisions from refinement: what was chosen and why, what was deferred and on what
     condition. Not a parking lot for open questions — an unanswered question here means the task
     is not ready to hand off. Keep empty if none. -->

### Design

**Out of scope for this task:** anything not named in Requirements below — no speculative abstractions, no drive-by refactors (project rule).



Design D4 wording set. resolveMarketplaceUpstream's catch-all becomes a typed failure: each existing catch/undefined return site gains a reason string; version computation keeps marketplace-first precedence, with plugin.json's version read alongside to detect mismatch (no behavior change to which version wins). The summary formatter is a pure function over UpdateRow[] so both text and JSON modes share counts. All wording changes are confined to the formatter and the upstream-resolution return type — compare/merge logic untouched.

### Plan

1. update.ts (core): resolveMarketplaceUpstream typed result + versionMismatch detection; thread reason into unavailable rows. 2. update.ts (CLI): formatter branches for drift wording, path cap, staleTargets, mismatch note, legacy remedy, unavailable cause; summary footer; npm label; help text. 3. Extend update.test.ts per R10. 4. docs/04_DESIGN.md sync. 5. bun run lint && bun run test && bun run build. The pre-batch-create quiz gate was auto-skipped under --auto; sizing recorded via rubric line in Background.

### Solution

<!-- Filled during implementation: file:line change map and concise rationale. -->

### Testing

<!-- Filled during verification: commands run, outcomes, coverage claim or N/A. -->

### Review

<!-- Filled during review: P1-P4 findings, residual risk, and final disposition. -->

### References

<!-- Links to the parent feature, design docs, related tasks, or external references. -->

### History
