---
schema_version: 1
name: Amend ADR-036/037 and sync owning docs for probe, plugin mode and requires
status: todo
template: feature-impl
created_at: 2026-11-04T23:00:25.259Z
updated_at: "2026-11-04T23:30:42.289Z"
feature_id: D1

dependencies: ["0161", "0162"]
ac_altitude: task-local
ac_numbering: task-local
priority: P2
estimate_hours: 3
---

## 0164. Amend ADR-036/037 and sync owning docs for probe, plugin mode and requires

### Background

Task 0164 is feature D1's documentation leg (`docs/features/D1_grok-bot-plugin-native-distribution-and-host-probe.md:25`, scenario R6). It consolidates the architectural record after 0160–0163 land: ADR-036/037 amendments for plugin mode and the `requires:` filter, the default-mode decision, PRD/ROADMAP status, and an audit that live-host claims cite the probe receipt or stay marked unverified.

Ownership split, verified against the refined siblings (2026-11-04). Each sibling syncs only its own surface; this task owns the cross-cutting decision record:

| Task | Syncs itself | Defers to 0164 |
| --- | --- | --- |
| 0160 | `docs/04_DESIGN.md` doctor row + receipt subsection, dated ADR-036 doctor-reads-receipt amendment, `docs/03_ARCHITECTURE.md`, `plugins/cc/README.md` (0160 R6) | — |
| 0161 | `docs/04_DESIGN.md` flag table + bundle layout, `docs/03_ARCHITECTURE.md` (0161 R6) | ADR-036/037 amendment, default-mode decision (0161 Design "Handoff") |
| 0162 | `docs/04_DESIGN.md` contract + flags, `docs/03_ARCHITECTURE.md` filter step (0162 R6) | ADR amendment (0162 R6) |
| 0163 | none (annotations + test) | — |

Current tree state:

- ADR-036 (`docs/00_ADR.md:687-749`) says "Materialization has two modes, default `bridge`" and gives the manifest field as `grokBot: { materialize }` (`docs/00_ADR.md:706-715`). Both become false after 0161 (third mode, bundle-root manifest) and 0162 (`provides`/`unmet` fields).
- ADR-037 (`docs/00_ADR.md:751-757`) makes post-install actions the single customization seam. 0161's plugin mode runs no register handoff, and 0162's filter is a pre-plan step, not a post-install action. Both are deliberate exceptions that ADR-037 does not yet record.
- `docs/01_PRD.md:58,112` and `docs/02_ROADMAP.md:118-121` describe Grok Bot as Sand-only registration/doctor work, with no plugin-native or runtime-requirement capability.
- Superskill's `spur-check-feature` is an alias of `spur-check` (`package.json:35-36`).

**Refine corrections (2026-11-04)**

- The title implies this task writes every doc for probe, plugin mode and requires. In fact the siblings sync their own `04`/`03`/README surfaces. This task owns only the ADR record, PRD/ROADMAP and the cross-doc audit, which avoids two writers per section.
- The 0160 doctor amendment is written by 0160 itself (0160 R6). This task does not rewrite it; it only cross-links and audits it.

### Requirements

- [ ] R1. Append a dated amendment to ADR-036 (`docs/00_ADR.md`), keeping the original text and number. It must record:
  - (a) the third materialization mode `plugin`, which writes a Cursor-plugin bundle to an operator `--plugin-dir`, keeps its receipt under the bundle root and is not refreshed by `update`;
  - (b) the `requires:` contract with its four tokens and the pre-plan grok-bot filter (`--bot-provides`, `--bot-unmet`, default exclude, nothing provided);
  - (c) the manifest field, which grows additively to `grokBot: { materialize, provides?, unmet? }`;
  - (d) the default-mode decision (R3).

  Each point cites its task (0161/0162) and the `docs/04_DESIGN.md` section that holds the detail.

- [ ] R2. Append a dated amendment to ADR-037 recording two deliberate exceptions to the post-install seam:
  - plugin mode runs no `grok-bot/register-handoff` action, because the host's plugin loader owns registration;
  - the `requires` filter is a pre-plan catalog transform, not a post-install action.

- [ ] R3. Record the decision: the default materialization stays `bridge`. Flipping to `plugin` needs both a real-Bot probe receipt (0160 schema v1) showing `plugin-install` `observed`, and an explicit operator decision filed as its own task. Install never reads the receipt to choose a mode. No code change.

- [ ] R4. Update `docs/01_PRD.md` (Grok Bot capability rows at :58/:112) and `docs/02_ROADMAP.md` (Grok Bot block at :118-121) to name the probe, plugin mode and runtime-requirement filtering, linking feature D1. Add no duplicate task ledger.

- [ ] R5. Audit `docs/00_ADR.md`, `docs/03_ARCHITECTURE.md`, `docs/04_DESIGN.md`, `plugins/cc/README.md` and the four sibling tasks' Solution sections for live-host claims: plugin install routes, skill-save tools, CLI persistence and MCP support. Each claim must either cite a probe receipt or be explicitly marked `unverified`. Fix the docs this task owns; report any sibling-owned violation in Review, and do not edit it.

- [ ] R6. Run `bun run lint`, `bun run test`, `bun run build` and `bun run spur-check`, plus `spur feature check D1 --json`, and all must pass.

Out of scope: rewriting the 0160 doctor amendment or the sibling-owned `04`/`03`/README sections; changing the default mode; new ADR numbers; constitution edits.

### Acceptance Criteria

```gherkin
Scenario: AC1 — ADR-036 records plugin mode, requires and manifest growth (req: R1, R3)
  Given 0160–0163 are merged
  When `docs/00_ADR.md` ADR-036 is read
  Then a dated amendment names `plugin` mode, `--plugin-dir`, the bundle-root receipt, the four `requires` tokens, `--bot-provides`/`--bot-unmet` and `grokBot: { materialize, provides?, unmet? }`, each citing 0161/0162 and a `04_DESIGN.md` section
  And it states the default stays `bridge` with the two flip preconditions, while the original ADR text is unchanged

Scenario: AC2 — ADR-037 records both exceptions (req: R2)
  Given the amended `docs/00_ADR.md`
  When ADR-037 is read
  Then a dated amendment states that plugin mode runs no register handoff and that the requires filter is a pre-plan transform, with reasons

Scenario: AC3 — PRD and ROADMAP reflect the capability (req: R4)
  Given the updated `docs/01_PRD.md` and `docs/02_ROADMAP.md`
  When their Grok Bot rows are read
  Then they name the probe, plugin mode and requires filtering and link D1 without listing task statuses

Scenario: AC4 — Live-host claims are evidenced or marked unverified (req: R5)
  Given the audited documents
  When each plugin-install, skill-save, persistence or MCP claim is located
  Then each one cites a probe receipt or is marked `unverified`, and any sibling-owned violation is listed in Review with its file:line

Scenario: AC5 — Gates and feature check pass (req: R6)
  Given the doc changes
  When `bun run lint`, `bun run test`, `bun run build`, `bun run spur-check` and `spur feature check D1 --json` run
  Then all pass
```

### Q&A

<!-- CLOSED decisions from refinement: what was chosen and why, what was deferred and on what
     condition. Not a parking lot for open questions — an unanswered question here means the task
     is not ready to hand off. Keep empty if none. -->

#### Q&A entry — 2026-11-04T23:30:40.337Z

- **CLOSED: amend, do not supersede.** ADR-036/037 still hold. Plugin mode and the filter extend them rather than reverse them, so they get dated amendments (constitution: preserve ADR numbers and history).
- **CLOSED: default stays `bridge`.** Feature P1 makes plugin mode primary "only when the P0 receipt confirms a personal install route". No real-Bot receipt exists yet, and install must not read untrusted host evidence (0161 Q&A). The flip is a future task.
- **CLOSED: siblings own their surfaces.** One writer per doc section. This task cross-links and audits; it does not re-author.
- **DEFERRED: a doc for a real-Bot receipt sample.** Add it only once an operator captures one; until then, claims stay `unverified`.

### Design

**WHAT.** Documentation only. Two dated ADR amendments, PRD/ROADMAP row edits, and a claim audit.

**WHERE.** `docs/00_ADR.md` (append under ADR-036 and ADR-037), `docs/01_PRD.md:58,112`, `docs/02_ROADMAP.md:118-121`, plus fixes in those files arising from the audit.

**Amendment shape.** Follow the existing in-place amendment style: a bold dated lead-in like `docs/00_ADR.md:148` ("**Target-specific exception (2026-09-08, task 0128 / ADR-036).**").

- `**Plugin materialization and runtime requirements (<date>, tasks 0161/0162).**` covers R1 a–c in ≤12 lines and points to `04_DESIGN.md` for flags and layout.
- `**Default mode (<date>, task 0164).**` covers R3.
- Under ADR-037, `**Exceptions (<date>, tasks 0161/0162).**` covers R2.

**Audit method.** Run `rg -n 'plugin install|install route|skill[- ]save|persist|MCP|mcp' docs/0[0-4]*.md plugins/cc/README.md`, scoped to Grok Bot context, and classify each hit into one of three outcomes:

- `cites-receipt`
- `marked-unverified`
- `violation`

Record the table in Solution.

**Invariants.**
- No ADR text above an amendment changes.
- No status ledger appears in PRD/ROADMAP.
- No code changes.

**Anti-patterns.**
- Rewriting sibling-owned sections.
- Claiming a Bot capability as fact without a receipt.
- Adding ADR-0xx numbers.

**Handoff.** The feature can close once AC5 passes; `spur feature verify D1` records the receipt.

### Plan

- [ ] 1. Confirm 0160–0163 are merged and read their Solution sections and doc diffs.
- [ ] 2. Append the ADR-036 amendments (R1, R3) and the ADR-037 amendment (R2).
- [ ] 3. Edit PRD :58/:112 and ROADMAP :118-121 (R4).
- [ ] 4. Run the claim audit, fix owned docs, and list sibling violations (R5).
- [ ] 5. Run `bun run lint`, `bun run test`, `bun run build`, `bun run spur-check` and `spur feature check D1 --json` (R6).

### Solution

<!-- Filled during implementation: file:line change map and concise rationale. -->

### Testing

<!-- Filled during verification: commands run, outcomes, coverage claim or N/A. -->

### Review

<!-- Filled during review: P1-P4 findings, residual risk, and final disposition. -->

### References

- Feature: `docs/features/D1_grok-bot-plugin-native-distribution-and-host-probe.md` (Scope bullet 4, scenario R6)
- Upstream: 0160 (receipt schema, doctor amendment), 0161 (plugin mode), 0162 (requires filter), 0163 (cc annotations)
- `docs/00_ADR.md:687-757` (ADR-036/037), `docs/99_PROJECT_CONSTITUTION.md` (amendment rules)

### History

- 2026-11-04T23:03:28.070Z feature_id J → D1 (system)
- 2026-11-04T23:09:54.896Z backlog → todo (system)
- 2026-11-04T23:20:32.521Z todo → backlog (system)
- 2026-11-04T23:30:42.289Z backlog → todo (system)

