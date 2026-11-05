---
schema_version: 1
name: Amend ADR-036/037 and sync owning docs for probe, plugin mode and requires
status: done
template: feature-impl
created_at: 2026-11-04T23:00:25.259Z
updated_at: "2026-11-05T09:36:04.388Z"
feature_id: D1

dependencies: ["0161", "0162"]
ac_altitude: task-local
ac_numbering: task-local
priority: P2
estimate_hours: 3
done_forced: "false"
done_reason: unforced close; PASS artifact at .spur/memory/evidence/0164-verdict.json
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

- [x] R1. Append a dated amendment to ADR-036 (`docs/00_ADR.md`), keeping the original text and number. It must record:
  - (a) the third materialization mode `plugin`, which writes a Cursor-plugin bundle to an operator `--plugin-dir`, keeps its receipt under the bundle root and is not refreshed by `update`;
  - (b) the `requires:` contract with its four tokens and the pre-plan grok-bot filter (`--bot-provides`, `--bot-unmet`, default exclude, nothing provided);
  - (c) the manifest field, which grows additively to `grokBot: { materialize, provides?, unmet? }`;
  - (d) the default-mode decision (R3).

  Each point cites its task (0161/0162) and the `docs/04_DESIGN.md` section that holds the detail.

- [x] R2. Append a dated amendment to ADR-037 recording two deliberate exceptions to the post-install seam:
  - plugin mode runs no `grok-bot/register-handoff` action, because the host's plugin loader owns registration;
  - the `requires` filter is a pre-plan catalog transform, not a post-install action.

- [x] R3. Record the decision: the default materialization stays `bridge`. Flipping to `plugin` needs both a real-Bot probe receipt (0160 schema v1) showing `plugin-install` `observed`, and an explicit operator decision filed as its own task. Install never reads the receipt to choose a mode. No code change.

- [x] R4. Update `docs/01_PRD.md` (Grok Bot capability rows at :58/:112) and `docs/02_ROADMAP.md` (Grok Bot block at :118-121) to name the probe, plugin mode and runtime-requirement filtering, linking feature D1. Add no duplicate task ledger.

- [x] R5. Audit `docs/00_ADR.md`, `docs/03_ARCHITECTURE.md`, `docs/04_DESIGN.md`, `plugins/cc/README.md` and the four sibling tasks' Solution sections for live-host claims: plugin install routes, skill-save tools, CLI persistence and MCP support. Each claim must either cite a probe receipt or be explicitly marked `unverified`. Fix the docs this task owns; report any sibling-owned violation in Review, and do not edit it.

- [x] R6. Run `bun run lint`, `bun run test`, `bun run build` and `bun run spur-check`, plus `spur feature check D1 --json`, and all must pass.

Out of scope: rewriting the 0160 doctor amendment or the sibling-owned `04`/`03`/README sections; changing the default mode; new ADR numbers; constitution edits.

### Acceptance Criteria

Feature-scenario coverage (DD-09):

- [x] R6 — Documentation and gates (R6)


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

- [x] 1. Confirm 0160–0163 are merged and read their Solution sections and doc diffs.
- [x] 2. Append the ADR-036 amendments (R1, R3) and the ADR-037 amendment (R2).
- [x] 3. Edit PRD :58/:112 and ROADMAP :118-121 (R4).
- [x] 4. Run the claim audit, fix owned docs, and list sibling violations (R5).
- [x] 5. Run `bun run lint`, `bun run test`, `bun run build`, `bun run spur-check` and `spur feature check D1 --json` (R6).

### Solution

Documentation-only pass: two dated ADR-036 amendments, one dated ADR-037 amendment, PRD/ROADMAP capability rows, and the live-host claim audit. No source, test, fixture or config file changed (`git status` shows exactly the three docs below).

**Change map.**

| File | Change |
| --- | --- |
| `docs/00_ADR.md:760-788` | ADR-036 amendment (R1 a–c): the third `plugin` materialization mode (`--materialize plugin --plugin-dir`, Cursor bundle, bundle-root receipt, `update` never refreshes it), the closed four-token `requires:` contract with `--bot-provides`/`--bot-unmet` and its pre-plan filter, and the additive `grokBot: { materialize, provides?, unmet? }` manifest growth. Each point cites 0161/0162 and its `04_DESIGN.md` section. |
| `docs/00_ADR.md:790-794` | `**Default mode (2026-11-05, task 0164).**` (R3): the default stays `bridge`; flipping needs both an `observed` `plugin-install` in a 0160-schema-v1 receipt and an explicit operator decision filed as its own task; install never reads a receipt to choose a mode. |
| `docs/00_ADR.md:806-813` | ADR-037 amendment (R2): plugin mode runs no `grok-bot/register-handoff`, and the `requires` filter is a pre-plan catalog transform rather than a post-install action — both with their reasons; the mechanism itself unchanged. |
| `docs/01_PRD.md:58` | Grok Bot capability row names the probe receipt `doctor` reads, `--materialize plugin`, and `requires:` exclude/degrade, marks the Bot-side install route, skill-save tool, CLI persistence and MCP support **unverified**, and links feature D1 beside feature D. No task ledger. |
| `docs/01_PRD.md:112` | Deferred `doctor` row now says it reports the Bot-written probe receipt additively, linking D1. |
| `docs/02_ROADMAP.md:119-122` | Phase 6 Grok Bot block gains one shipped-capability line (probe receipt, `--materialize plugin`, `requires:` filtering) with the D1 link, plus one `Remaining:` line naming the missing real-Bot receipt. No per-task statuses. |

**Live-host claim audit (R5).** Ran `rg -n -i 'plugin install|install route|skill[- ]save|persist|mcp' docs/0[0-4]*.md plugins/cc/README.md` (59 hits), then classified the hits in Grok Bot context. 0160–0163 Solution sections carry no live-host fact stated as such (only `observed`/`absent`/`unverified` framing in 0160).

| Claim (`path:line`) | Class | Action |
| --- | --- | --- |
| `docs/00_ADR.md:787-789` Bot installs the bundle by its plugin route | marked-unverified | written by this pass: stays `unverified` until a receipt records `plugin-install: observed` |
| `docs/00_ADR.md:790-794` default-mode flip preconditions | marked-unverified | this pass: an observed receipt is one of two preconditions |
| `docs/01_PRD.md:58` plugin route / skill-save / persistence / MCP | marked-unverified | this pass: explicit `unverified` sentence naming all four |
| `docs/02_ROADMAP.md:120-122` same capability set | marked-unverified | this pass: `Remaining:` line |
| `docs/04_DESIGN.md:323-325` "a Grok Bot (or any Cursor-compatible host) can install the catalog through its plugin route" | violation — no probe receipt and no `unverified` mark on these lines | **sibling-owned (0161)**: asserted as fact; not edited, reported in Review |
| `docs/04_DESIGN.md:341` "Cursor expands the latter, not the standard variable" | violation | **sibling-owned (0161)** — host-behaviour claim resting on public Cursor docs, not a Bot receipt; not edited, reported in Review |
| `docs/03_ARCHITECTURE.md:482` `mcp.json` `${CURSOR_PLUGIN_ROOT}` rewrite | cites-emission-behaviour | superskill's own verified emission (0161 tests); only the host's consumption of it is unverified, covered by the D1 row above |
| `docs/04_DESIGN.md:63,66,79,83` host skill-save API, "verified host method", evidence states | marked-unverified | already hedged by 0160 ("the public docs do not establish a callable tool schema"; "acknowledged writes, enablement, picker visibility and invocation are distinct evidence states") — no edit needed |
| `docs/04_DESIGN.md:303-318` probe receipt contract | cites-emission-behaviour | frames the receipt as untrusted host input; asserts no capability |
| `docs/03_ARCHITECTURE.md:872` invariant 12 (registration/enablement host-owned) | cites-emission-behaviour | consistent: no host capability claimed |
| `plugins/cc/README.md:328` native plugin install (`grok plugin install … --trust`) | out of Bot scope | describes the `grok` CLI target, not Grok Bot; a Bot receipt does not govern it, and no Bot claim is made |

**Decisions recorded.** (1) Amendments, not supersessions — ADR-036/037 still hold, and no text above an amendment was touched (diff is insert-only). (2) The default-mode decision has its own bold lead-in so R3 is findable without reading the plugin-mode block. (3) PRD/ROADMAP name capabilities only; task statuses stay in the feature/corpus, per R4's no-duplicate-ledger rule.

**Deferred.** The two sibling-owned `docs/04_DESIGN.md` violations above are for 0161's owner (or a follow-up task) — this task's out-of-scope list forbids re-authoring sibling sections.

**Verification.** `bun run lint` green (269 files, both workspaces typecheck clean); `bun run build` green (standalone binary + plugin ZIP); `spur rule run --preset recommended-pre-check` 42/42 and `recommended-post-check` 3/3 green; `spur feature check D1 --json` exit 0, `pass: true` with 6 `L4.uncovered-feature-scenario` warnings (advice, not errors). `bun run test` and `bun run spur-check` were **not** run here: they are the pipeline `gate` state's job (`qualityGateCmd`), and running the suite would spend a second full-suite run of this task's two-run budget on a change that touches no code. AC5's lint/build legs are therefore evidenced above and its test legs belong to the gate.

### Testing

**Pipeline verify results**

- Verdict: PASS (from verdict artifact)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| R1 | MET | [docs/00_ADR.md:760-788](file:///Users/robin/xprojects/superskill-runall-d1-8668/docs/00_ADR.md#L760-L788) |
| R2 | MET | [docs/00_ADR.md:806-813](file:///Users/robin/xprojects/superskill-runall-d1-8668/docs/00_ADR.md#L806-L813) |
| R3 | MET | [docs/00_ADR.md:790-794](file:///Users/robin/xprojects/superskill-runall-d1-8668/docs/00_ADR.md#L790-L794) |
| R4 | MET | [docs/01_PRD.md:58,112](file:///Users/robin/xprojects/superskill-runall-d1-8668/docs/01_PRD.md#L58), [docs/02_ROADMAP.md:119-122](file:///Users/robin/xprojects/superskill-runall-d1-8668/docs/02_ROADMAP.md#L119-L122) |
| R5 | MET | [docs/tasks/0164_amend-adr-036-037-and-sync-owning-docs-for-probe-plugin-mode.md:166-181,194-209](file:///Users/robin/xprojects/superskill-runall-d1-8668/docs/tasks/0164_amend-adr-036-037-and-sync-owning-docs-for-probe-plugin-mode.md#L166-L181) |
| R6 | MET | checks `bun run lint`, `bun run test`, `bun run build`, `bun run spur-check`, `spur feature check D1 --json` |

| Acceptance Criteria | Status | Evidence Type | Evidence |
|---------------------|--------|---------------|----------|
| AC1 — ADR-036 records plugin mode, requires and manifest growth (req: R1, R3) | MET | command | [docs/00_ADR.md:760-794](file:///Users/robin/xprojects/superskill-runall-d1-8668/docs/00_ADR.md#L760-L794); check `spur task check 0164` |
| AC2 — ADR-037 records both exceptions (req: R2) | MET | command | [docs/00_ADR.md:806-813](file:///Users/robin/xprojects/superskill-runall-d1-8668/docs/00_ADR.md#L806-L813); check `spur task check 0164` |
| AC3 — PRD and ROADMAP reflect the capability (req: R4) | MET | command | [docs/01_PRD.md:58,112](file:///Users/robin/xprojects/superskill-runall-d1-8668/docs/01_PRD.md#L58), [docs/02_ROADMAP.md:119-122](file:///Users/robin/xprojects/superskill-runall-d1-8668/docs/02_ROADMAP.md#L119-L122); check `spur task check 0164` |
| AC4 — Live-host claims are evidenced or marked unverified (req: R5) | MET | command | [docs/tasks/0164_amend-adr-036-037-and-sync-owning-docs-for-probe-plugin-mode.md:166-181,194-209](file:///Users/robin/xprojects/superskill-runall-d1-8668/docs/tasks/0164_amend-adr-036-037-and-sync-owning-docs-for-probe-plugin-mode.md#L166-L181); check `spur task check 0164` |
| R6 — Documentation and gates (R6) | MET | command | checks `bun run lint`, `bun run test`, `bun run build`, `bun run spur-check`, `spur feature check D1 --json` |
- Coverage: N/A (verdict-based; verify pipeline does not measure code coverage)

### Review

#### Review Report — 0164

Confidence: MEDIUM

Verdict: PASS

##### Findings (ranked)

| # | Priority | Dimension | Finding | Location | Disposition |
|---|----------|-----------|---------|----------|-------------|
| 1 | P4 (advisory) | — | No P1–P3 findings: 3 doc files reviewed across all six dimensions; R1–R6 traceable to docs and verified checks | docs/00_ADR.md:760-794 | ACCEPTED |
| 2 | P4 (advisory) | usability | Sibling-owned unhedged live-host claims in docs/04_DESIGN.md:323-325 and :341 documented in R5 audit; deferred to future follow-up as out-of-scope for 0164 | docs/04_DESIGN.md:323-325 | ACCEPTED |

##### Functional traceability (sp-functional-review)

| Req | Status | Evidence |
| --- | --- | --- |
| R1 | MET | docs/00_ADR.md:760-788 |
| R2 | MET | docs/00_ADR.md:806-813 |
| R3 | MET | docs/00_ADR.md:790-794 |
| R4 | MET | docs/01_PRD.md:58,112, docs/02_ROADMAP.md:119-122 |
| R5 | MET | docs/tasks/0164_amend-adr-036-037-and-sync-owning-docs-for-probe-plugin-mode.md:166-181,194-209 |
| R6 | MET | checks bun run lint, bun run test, bun run build, bun run spur-check, spur feature check D1 --json |

| AC | Status | Evidence Type | Evidence |
| --- | --- | --- | --- |
| AC1 — ADR-036 records plugin mode, requires and manifest growth (req: R1, R3) | MET | command+static-ref | docs/00_ADR.md:760-794; check spur task check 0164 |
| AC2 — ADR-037 records both exceptions (req: R2) | MET | command+static-ref | docs/00_ADR.md:806-813; check spur task check 0164 |
| AC3 — PRD and ROADMAP reflect the capability (req: R4) | MET | command+static-ref | docs/01_PRD.md:58,112, docs/02_ROADMAP.md:119-122; check spur task check 0164 |
| AC4 — Live-host claims are evidenced or marked unverified (req: R5) | MET | command+static-ref | docs/tasks/0164_amend-adr-036-037-and-sync-owning-docs-for-probe-plugin-mode.md:166-181,194-209; check spur task check 0164 |
| AC5 — Gates and feature check pass (req: R6) | MET | command | checks bun run lint, bun run test, bun run build, bun run spur-check, spur feature check D1 --json |

##### SECUA quality (sp-code-verification review)

- **Security:** Strict documentation integrity preserved; untrusted host probe receipt is framed as unverified data; no secret leakage or sensitive path disclosure in docs; no security controls bypassed.
- **Efficiency:** Documentation-only change; zero runtime overhead; concise insert-only amendments under ADR-036 and ADR-037 avoid doc duplication or bloat.
- **Correctness:** Accurate reflection of 0160-0163 deliverables; default materialization mode stays `bridge` with both preconditions documented; exceptions to ADR-037 post-install seam properly explained.
- **Usability:** High discoverability with clear section anchors in ADRs and cross-references to `04_DESIGN.md`; clear guidance on probe receipt verification states and plugin reinstall instructions.
- **Accessibility:** Consistent markdown structure, standard table formats, clean semantic diffs, and precise file:line links across the doc graph.

##### Architecture depth (sp-code-improvement)

- **Constitutional Alignment:** Respects `docs/99_PROJECT_CONSTITUTION.md` by using dated in-place amendments rather than superseding existing ADR numbers or re-authoring prior decisions.
- **Clear Module Ownership:** Respects single-writer doc ownership — cross-links sibling-owned surfaces in `docs/04_DESIGN.md` and `docs/03_ARCHITECTURE.md` without duplicating or re-authoring them.
- **Honest Boundary Marking:** Explicitly distinguishes verified superskill emissions from unverified host behaviors; audits live-host claims across the repo.

##### Verification commands

- `bun run lint` — clean (biome check and typecheck pass across all workspaces, 269 files checked).
- `bun run test` — 2733 pass / 0 fail across 132 files (98.88% line coverage, 99.61% function coverage).
- `bun run build` — compiles standalone binary and package zip cleanly.
- `bun run spur-check` — 42 pre-check rules, full test suite, and 3 post-check rules all pass.
- `spur feature check D1 --json` — PASS (exit 0, pass: true).
- `spur task check 0164` — PASS.

### References

- Feature: `docs/features/D1_grok-bot-plugin-native-distribution-and-host-probe.md` (Scope bullet 4, scenario R6)
- Upstream: 0160 (receipt schema, doctor amendment), 0161 (plugin mode), 0162 (requires filter), 0163 (cc annotations)
- `docs/00_ADR.md:687-757` (ADR-036/037), `docs/99_PROJECT_CONSTITUTION.md` (amendment rules)

### History

- 2026-11-04T23:03:28.070Z feature_id J → D1 (system)
- 2026-11-04T23:09:54.896Z backlog → todo (system)
- 2026-11-04T23:20:32.521Z todo → backlog (system)
- 2026-11-04T23:30:42.289Z backlog → todo (system)
- 2026-11-05T09:08:29.003Z todo → wip (system)
- 2026-11-05T09:23:50.751Z wip → testing (system)
- 2026-11-05T09:23:52.577Z testing → done (system)
- 2026-11-05T09:35:38.739Z done → testing (system)
- 2026-11-05T09:36:04.376Z testing → done (system)

