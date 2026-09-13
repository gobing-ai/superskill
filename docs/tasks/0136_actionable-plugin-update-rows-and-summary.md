---
schema_version: 1
name: Actionable plugin update rows and summary
status: done
template: feature-impl
created_at: 2026-09-13T18:04:14.441Z
updated_at: "2026-09-13T22:00:48.328Z"
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

- [x] R1. Content drift at an unchanged version is named as such. When a stale marketplace row's installedVersion equals upstreamVersion, the row reads `<name>: stale: content changed, version <v> unchanged (<n> files changed: <a>, <b>, <c>)` instead of `<v> → <v>`; the drift wording triggers only on equal versions, and a version bump keeps the existing `<old> → <new>` form.
- [x] R2. Changed-path lists are capped in text. A stale row names at most 5 changed paths followed by `+N more` when longer; --check --json always lists every path (envelope rows carry the full changedPaths array).
- [x] R3. Partially stale targets are named. When a merged stale plugin row has staleTargets (0133 R2) covering fewer targets than installed, the row appends `[stale on: <targets>]`.
- [x] R4. Disagreeing version declarations are surfaced. resolveMarketplaceUpstream returns { ok: true, version, snapshot, versionMismatch? } | { ok: false, reason } in place of today's undefined-on-catch (~update.ts:338); when marketplace.json and plugin.json declare different versions, the compare keeps marketplace-first precedence and the row prints `note: marketplace.json declares <a>, plugin.json declares <b>`.
- [x] R5. Unavailable rows name the cause. The { ok: false, reason } path feeds UpdateRow.reason: missing locator directory, manifest/parse failure, and network/registry failures each produce a specific reason string; the bundled-unavailable and missing-locator rows get concrete reasons instead of empty locators. The 0133 formatter branch prints `(<locator>): <reason>`; exit code 2 semantics are unchanged.
- [x] R6. A legacy row names the reinstall command. Legacy plugin rows append ``run `superskill install <name>` to adopt``.
- [x] R7. The npm remedy is labeled. The bundled-channel line reads `To upgrade superskill and its bundled plugins, run: npm i -g @gobing-ai/superskill@latest`.
- [x] R8. Check output ends with a summary and the next command. After the Plugins:/Skills: groups, a final line counts every status present — `Summary: <s> stale, <c> up to date[, <u> not checked][, <l> legacy][, <x> unavailable]. Run: superskill update` — the `Run:` clause names bare `superskill update` only when at least one row is stale.
- [x] R9. Help documents the exit codes. superskill update --help states: 0 nothing stale, 1 stale under --check or apply failure, 2 an unavailable upstream; the --json flag help states it requires --check.
- [x] R10. Leave focused regression evidence. The 25 CLI update tests are extended (not rewritten) for: drift wording (kk-shaped fixture), 12-path cap with +7 more and full JSON list, [stale on: claude], version-mismatch note naming both versions, unavailable reason for a missing locator path, legacy remedy line, labeled npm line, summary footer, and --help exit-code text. bun run lint, bun run test, bun run build pass. docs/04_DESIGN.md update row wording and exit codes sync in the same commit.

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

Change-map (auto-generated — implement step did not record a Solution).
Each entry cites the first changed line per file (`file:line`).

| Change (`file:line`) |
|----------------------|
| `apps/cli/src/commands/update.ts:105` |
| `apps/cli/src/commands/update.ts:18` |
| `apps/cli/src/commands/update.ts:205` |
| `apps/cli/src/commands/update.ts:228` |
| `apps/cli/src/commands/update.ts:236` |
| `apps/cli/src/commands/update.ts:250` |
| `apps/cli/src/commands/update.ts:261` |
| `apps/cli/src/commands/update.ts:269` |
| `apps/cli/src/commands/update.ts:281` |
| `apps/cli/src/commands/update.ts:30` |
| `apps/cli/src/commands/update.ts:333` |
| `apps/cli/src/commands/update.ts:345` |
| `apps/cli/src/commands/update.ts:429` |
| `apps/cli/src/commands/update.ts:466` |
| `apps/cli/src/commands/update.ts:471` |
| `apps/cli/src/commands/update.ts:476` |
| `apps/cli/src/commands/update.ts:481` |
| `apps/cli/src/commands/update.ts:485` |
| `apps/cli/src/commands/update.ts:575` |
| `apps/cli/src/commands/update.ts:589` |
| `apps/cli/src/commands/update.ts:591` |
| `apps/cli/src/commands/update.ts:595` |
| `apps/cli/src/commands/update.ts:611` |
| `apps/cli/src/commands/update.ts:617` |
| `apps/cli/src/commands/update.ts:643` |
| `apps/cli/src/commands/update.ts:663` |
| `apps/cli/src/commands/update.ts:671` |
| `apps/cli/src/commands/update.ts:678` |
| `apps/cli/src/commands/update.ts:684` |
| `apps/cli/src/commands/update.ts:693` |
| `apps/cli/src/commands/update.ts:698` |
| `apps/cli/src/commands/update.ts:80` |
| `apps/cli/src/commands/update.ts:95` |
| `apps/cli/tests/commands/update.test.ts:132` |
| `apps/cli/tests/commands/update.test.ts:16` |
| `apps/cli/tests/commands/update.test.ts:168` |
| `apps/cli/tests/commands/update.test.ts:245` |
| `apps/cli/tests/commands/update.test.ts:342` |
| `apps/cli/tests/commands/update.test.ts:374` |
| `apps/cli/tests/commands/update.test.ts:389` |
| `apps/cli/tests/commands/update.test.ts:477` |
| `apps/cli/tests/commands/update.test.ts:518` |
| `apps/cli/tests/commands/update.test.ts:529` |
| `apps/cli/tests/commands/update.test.ts:532` |
| `apps/cli/tests/commands/update.test.ts:590` |
| `apps/cli/tests/commands/update.test.ts:594` |
| `apps/cli/tests/commands/update.test.ts:596` |
| `apps/cli/tests/commands/update.test.ts:599` |
| `apps/cli/tests/commands/update.test.ts:643` |
| `apps/cli/tests/commands/update.test.ts:740` |
| `apps/cli/tests/commands/update.test.ts:764` |
| `apps/cli/tests/commands/update.test.ts:872` |

### Testing

**Pipeline verify results**

- Verdict: PASS (from verdict artifact)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| R1 | MET | update.ts:655-662 (equal versions → content changed, version <v> unchanged; bump keeps →) + update.test.ts:872-893 |
| R2 | MET | update.ts:644 (MAX_TEXT_CHANGED_PATHS=5) + :704-708 (+N more; JSON envelope keeps full changedPaths) + update.test.ts:895-929 |
| R3 | MET | update.ts:693-696 ([stale on: …]) + core update.ts:173-177 (staleTargets) + update.test.ts:931-953 |
| R4 | MET | update.ts:616-625 (typed resolver, versionMismatch, marketplace-first precedence) + :647-653 (note wording) + update.test.ts:955-975 |
| R5 | MET | update.ts:596-605 (typed {ok:false, reason} fail paths: locator path missing :603, manifest/parse :610-616, network :598-601) + :679-681 + update.test.ts:378-395 (exit 2),:158-166 |
| R6 | MET | update.ts:671 (run superskill install <name> to adopt) + update.test.ts:210-218,:631-645 |
| R7 | MET | update.ts:345 (To upgrade superskill and its bundled plugins, run: npm i -g @gobing-ai/superskill@latest) + update.test.ts:458-481 |
| R8 | MET | update.ts:449-466 (formatUpdateSummary, spec-order counts) + :335 (text-mode-only footer, skipped when empty) + update.test.ts:977-1002 |
| R9 | MET | update.ts:95 (--json help: requires --check) + :105-108 (Exit codes: 0/1/2 after-help) + update.test.ts:133-142 |
| R10 | MET | update.test.ts:47 pass (37→47, extended not rewritten); drift/12-path cap/[stale on: claude]/mismatch note/unavailable reason/legacy remedy/npm label/summary footer/help exit codes all covered; .spur/run/0136-test-gate.log (2351 pass/0 fail) + .spur/run/0136-build.log (exit 0); docs/04_DESIGN.md:113-121 synced |

| Acceptance Criteria | Status | Evidence Type | Evidence |
|---------------------|--------|---------------|----------|
| R8 — Content drift at an unchanged version is named as such | MET | test | update.test.ts:872-893 (drift wording asserted, 0.0.1 → 0.0.1 absent; exit 1) |
| R9 — Disagreeing plugin version declarations are surfaced | MET | test | update.test.ts:955-975 (note names both versions; precedence unchanged) |
| R10 — Check output ends with a summary and the next command | MET | test | update.test.ts:977-1002 (ends Summary: 1 stale, 1 up to date. Run: superskill update) |
| R11 — Long changed-path lists are capped in text output | MET | test | update.test.ts:895-929 (text +7 more, f3 absent; JSON changedPaths length 12) |
| R12 — Partially stale targets are named | MET | test | update.test.ts:931-953 (one merged row, [stale on: claude] asserted) |
| R14 — The bundled-channel npm remedy is labeled | MET | test | update.test.ts:458-481 (exact npm label in mutating run) |
| R15 — A legacy install row names the reinstall command | MET | test | update.test.ts:210-218 + :631-645; update.ts:671 |
| R17 — Update help documents the exit codes | MET | test | update.test.ts:133-142 (exit-code line via outputHelp; requires --check in helpInformation) |
| R21 — An unavailable plugin row names the cause | MET | test | update.test.ts:378-395 (unavailable reason + exit 2) and :158-166; update.ts:603 |
- Coverage: N/A (verdict-based; verify pipeline does not measure code coverage)

### Review

<!-- spur:record-review -->

**SECU findings** (pipeline verify step — verdict: PASS)

| Priority | Dimension | Location | Finding |
|----------|-----------|----------|----------|
| P4 | spur task check | — | task check passed |
| P4 | evidence-rule-pass | — | All behavior-bearing AC rows have executable evidence or are explicitly non-behavioral. |
| P4 | proof-input-digest | — | sha256:448e0810a5d8a0161b76d483e264ccb8ac74e67e09d5ea6e1926a20c60f1c311 |

### References

<!-- Links to the parent feature, design docs, related tasks, or external references. -->

### History

- 2026-09-13T21:27:12.559Z todo → wip (system)
- 2026-09-13T22:00:47.066Z wip → testing (system)
- 2026-09-13T22:00:48.328Z testing → done (system)

