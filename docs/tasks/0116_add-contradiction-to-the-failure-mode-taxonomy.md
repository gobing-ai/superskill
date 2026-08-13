---
template: feature-impl
schema_version: 1
name: "Add contradiction to the failure-mode taxonomy"
description: ""
status: done
type: task
profile: standard
feature_id: A
parent_wbs: null
priority: P2
tags: []
dependencies: []
ac_numbering: task-local
created_at: "2026-08-13T18:34:31.353Z"
updated_at: "2026-08-13T19:48:50.239Z"
---

## 0116. Add contradiction to the failure-mode taxonomy

### Background
The evolve failure-mode taxonomy exists so every proposal names the failure it cures and
`--history` reads as a ledger. It has no tag for **conflict**: two instructions in one config that
cannot both be followed. `docs/A-Complete-Guide-To-AGENTS.md` makes contradiction-finding step 1 of
its refactoring prompt, and it is the only step of that prompt not already owned by
`docs/99_PROJECT_CONSTITUTION.md` §7 or `sp:doc-evolve` — which is why the prompt itself is Out of
scope (feature A) and only this tag is absorbed.

**Premise corrections from `--depth ready` verification (2026-08-13).** Three claims in the charting
draft of this ticket were wrong; they are corrected here rather than left for the implementer:

1. **The taxonomy has six tags, not five.** `apps/cli/src/operations/evolve.ts:113-120` defines
   `FAILURE_MODES = ['sprawl','sediment','duplication','no-op','premature-completion','negation']`.
   The charting draft omitted `negation`. Adding `contradiction` makes **seven**.
2. **The validator is in `apps/cli`, not `packages/core`.** `ingestProposal` rejects unknown values
   at `apps/cli/src/operations/evolve.ts:730-733`. The charting-session grep that "returned nothing"
   searched `packages/core/src` only — the wrong tree.
3. **Command surfaces do NOT inherit the list.** All four evolve commands restate it inline at
   line 57: `plugins/cc/commands/{command,agent,magent,skill}-evolve.md`. Adding a tag therefore
   requires four doc edits, not zero. This invalidates the charting draft's R4.

**Pre-existing drift found while verifying.** Three of those four command files
(`command-evolve.md`, `agent-evolve.md`, `magent-evolve.md`) list only five tags — they omit
`negation` and are already stale against the CLI. Only `skill-evolve.md:57` is current at six. Same
defect class as task 0115's 6-vs-5 dimension drift, found in a different surface family. Fixing it
is folded into this ticket: the files are already being edited, and shipping `contradiction` into
three docs that are wrong about `negation` would bank the error.

Ticket type: `wayfinder:task`. Map: feature A.
### Requirements
- **R1** — `contradiction` is added to `FAILURE_MODES` in `apps/cli/src/operations/evolve.ts:113-120`,
  making seven. `ingestProposal` accepts it and still rejects unknown values.
- **R2** — The theory reference `plugins/cc/skills/cc-skills/references/skill-engineering-theory.md`
  defines it: *two instructions in the same config that cannot both be followed*. The definition
  states the discriminator against its two nearest neighbours — `duplication` (same instruction
  stated twice) and `negation` (an instruction that only forbids, with no positive alternative) —
  so an authoring persona picks the right tag rather than the closest-sounding one.
- **R3** — The reference's `## The six named failure modes` heading (line 108) and its "these are the
  taxonomy" preamble are updated to seven. Its sibling references
  (`cc-skills/references/glossary.md`, `cc-skills/references/workflows.md`) name the same set.
- **R4** — All four evolve command surfaces
  (`plugins/cc/commands/{command,agent,magent,skill}-evolve.md`, each at line 57) list the full
  seven. This **corrects** the charting-draft assumption that they inherit the list.
- **R5** — The pre-existing `negation` omission in `command-evolve.md`, `agent-evolve.md`, and
  `magent-evolve.md` is fixed in the same pass. No surface in the repo may name a tag set that
  disagrees with `FAILURE_MODES`.
- **Out of scope** — no new evolve behavior, no rubric change, no scorer change. Tag vocabulary and
  its documentation only.
### Acceptance Criteria
```gherkin
Feature: Contradiction failure mode

  Scenario: The tag is accepted on ingest
    Given a proposal whose failure_mode is "contradiction"
    When it is ingested through an evolve seam
    Then the ingest succeeds and the tag is persisted in proposal history

  Scenario: Unknown tags are still rejected
    Given a proposal whose failure_mode is "not-a-real-mode"
    When it is ingested through an evolve seam
    Then the ingest is rejected naming the seven valid modes

  Scenario: The definition discriminates against its nearest neighbours
    Given the skill-engineering theory reference
    When the contradiction entry is read
    Then it distinguishes contradiction from duplication and from negation

  Scenario: Every documented surface agrees with the CLI
    Given FAILURE_MODES in apps/cli/src/operations/evolve.ts
    When the tag lists in the four evolve command files and the cc-skills references are compared to it
    Then every list names the same seven tags in the same order

  Scenario: The pre-existing negation omission is repaired
    Given command-evolve.md, agent-evolve.md, and magent-evolve.md each listed five tags
    When this task completes
    Then each names negation and contradiction alongside the original five
```
### Q&A

<!-- CLOSED decisions from refinement: what was chosen and why, what was deferred and on what
     condition. Not a parking lot for open questions — an unanswered question here means the task
     is not ready to hand off. Keep empty if none. -->

### Design
**WHAT** — One new tag in the `FAILURE_MODES` const, its definition in the theory reference, and a
consistency sweep across the seven surfaces that restate the set.

**WHY** — The taxonomy covers repetition (`duplication`), volume (`sprawl`), staleness (`sediment`),
inertness (`no-op`), false-done (`premature-completion`), and bare prohibition (`negation`) — but has
no tag for two instructions that cannot both be obeyed. That is the guide's only novel contribution.

**WHERE** — one code file, six doc files:

| Surface | Path | Current | Target |
|---|---|---|---|
| CLI const (authority) | `apps/cli/src/operations/evolve.ts:113-120` | 6 | 7 |
| Theory reference | `cc-skills/references/skill-engineering-theory.md:108` | 6 | 7 |
| Glossary | `cc-skills/references/glossary.md` | mentions set | 7 |
| Workflows ref | `cc-skills/references/workflows.md` | mentions set | 7 |
| command-evolve | `plugins/cc/commands/command-evolve.md:57` | **5 (stale)** | 7 |
| agent-evolve | `plugins/cc/commands/agent-evolve.md:57` | **5 (stale)** | 7 |
| magent-evolve | `plugins/cc/commands/magent-evolve.md:57` | **5 (stale)** | 7 |
| skill-evolve | `plugins/cc/commands/skill-evolve.md:57` | 6 | 7 |

**Frozen names** — tag literal is exactly `contradiction`. Append **last** in `FAILURE_MODES`;
`FailureMode` is `(typeof FAILURE_MODES)[number]` and needs no edit. Every doc list uses the same
order as the const so a reader can diff them by eye.

**Definition (verbatim target)** — *contradiction: two instructions in the same config that cannot
both be followed. Distinct from duplication (the same instruction stated twice, wasteful but
consistent) and from negation (a prohibition with no positive alternative). The fix is not to delete
both sides — it is to ask which one the operator wants and delete the loser.*

**Anti-patterns (do not implement)**

- Do **not** build contradiction *detection*. This ticket ships vocabulary, not a checker. An
  automated conflict detector is a separate effort and is not in feature A's destination.
- Do **not** renumber or reorder the existing six. Tags are persisted in proposal history; order
  changes make old ledgers read wrong.
- Do **not** "fix" the doc drift by deleting the inline lists in favor of a link. That is a real
  improvement and a real `duplication` finding — but it is a structural change to eight surfaces,
  out of scope here. Record it as a note; ship the corrected lists.
- Do **not** edit `plugins/cc/commands/command-refine.md`. It carries the pruning doctrine, not the
  tag list — verified, no occurrence.

**Cross-task** — independent of 0115, 0117, 0118. Shares 0115's *defect class* (docs drifted from
code) but no files; the two may land in either order.
### Plan
1. Append `'contradiction'` to `FAILURE_MODES` in `apps/cli/src/operations/evolve.ts:113-120`.
   Confirm the `ingestProposal` rejection message at `:730-733` enumerates from the const (it uses
   `FAILURE_MODES.join(', ')`, so it updates itself — verify, do not hand-edit).
2. Add the contradiction entry to `skill-engineering-theory.md` following the existing
   definition / detection-question / fix shape used by the other six.
3. Retitle `## The six named failure modes` (`:108`) → seven; update the preamble sentence at `:110`.
4. Update the set in `cc-skills/references/glossary.md` and `cc-skills/references/workflows.md`.
5. Update line 57 of all four `plugins/cc/commands/*-evolve.md`. For `command`, `agent`, and
   `magent` this also repairs the pre-existing missing `negation` (R5); `skill` only gains
   `contradiction`.
6. Add a test asserting `contradiction` ingests cleanly and an unknown tag is still rejected.
7. Grep the repo for any remaining five- or six-tag list and reconcile it: every surface must agree
   with `FAILURE_MODES`. Beware — shell greps in this environment mangle long identifiers; verify
   hits by reading the file, not by trusting grep output bodies.
8. Gate: `bun run lint` && `bun run test` && `bun run spur-check`.
### Solution
`apps/cli/src/operations/evolve.ts:113-121` — appended `'contradiction'` to `FAILURE_MODES` as the
seventh and last tag (frozen-order rule; tags persist in proposal history, so no reordering). The
type `FailureMode` derives from the const (`(typeof FAILURE_MODES)[number]`), so no type edit. The
`ingestProposal` rejection at `:735-738` enumerates via `FAILURE_MODES.join(', ')`, so the message
now names all seven automatically — verified by test, not hand-edited. Type JSDoc updated to seven.

`apps/cli/tests/operations/evolve-ingest.test.ts:398-417` — new test `accepts the contradiction
failure_mode tag (0116 — seventh mode)` mirroring the 0077 negation test (ingest → persisted in
proposal history). `:450-452` — the existing unknown-tag test now also asserts the rejection message
enumerates all seven valid modes, covering the AC scenario literally.

`plugins/cc/skills/cc-skills/references/skill-engineering-theory.md:108` — heading retitled
`## The seven named failure modes`. `:152` — Duplication fix says "seven modes". `:215-229` — new
`### 7. Contradiction` section after Negation, in the shared definition / detection-question / fix
shape; the definition is the Design's verbatim target and discriminates against duplication
(restatement) and negation (lone prohibition). The preamble at `:110-111` names no count, so no
change needed there.

`plugins/cc/skills/cc-skills/references/glossary.md:76-78` — Proposal entry names all seven in const
order. `:100-103` — new **Contradiction** anchor in the Steering & pruning section (seventh failure
mode, Avoid: "conflict"/"clash"), consistent with how Negation was anchored in 0077 R5a. Negation's
"the sixth failure mode" label stays correct — contradiction was appended last.

`plugins/cc/skills/cc-skills/references/workflows.md:501-502` — "all seven" list, normalized to
const order (this file previously listed the six in a different order, which the const-order rule
now fixes).

`plugins/cc/commands/command-evolve.md:57`, `agent-evolve.md:57`, `magent-evolve.md:57` — five tags
→ seven, repairing the pre-existing missing `negation` (R5) and adding `contradiction`.
`plugins/cc/commands/skill-evolve.md:57-60` — six → seven; "Definitions (all seven modes)".

`plugins/cc/skills/cc-skills/SKILL.md:347` — "seven named failure modes" in the theory pointer.

`plugins/cc/tests/structure.test.ts:9,102-117` — theory-presence assertion now names all seven modes
including `contradiction` (test name and term list).

Plan-step-7 sweep: no live surface restates a stale tag set. `apps/cli/dist/index.js` (gitignored
build bundle) still embeds the old six-tag list — regenerated on build. `.rulesync/.targets/`
(gitignored, per-platform generated copies) regenerates from these sources on install. Historical
corpus records (`docs/tasks/*`, dogfood/analysis reports, `.spur/run` logs) document their own time
and are untouched.
### Testing
**Pipeline verify results**

- Verdict: PASS (from verdict artifact)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| R1 | MET | `apps/cli/src/operations/evolve.ts:113-121` — `'contradiction'` appended last to `FAILURE_MODES` (seven tags, frozen order; type `FailureMode = (typeof FAILURE_MODES)[number]` needs no edit — read-verified); `apps/cli/src/operations/evolve.ts:731-737` — `ingestProposal` rejects via `FAILURE_MODES.includes(...)` and enumerates via `FAILURE_MODES.join(', ')`, so unknown tags are rejected naming all seven (self-updating, no hand-edited string — read-verified); tests `apps/cli/tests/operations/evolve-ingest.test.ts:398-418` — `accepts the contradiction failure_mode tag (0116 — seventh mode)`: ingest succeeds and tag persists in proposal history; `apps/cli/tests/operations/evolve-ingest.test.ts:427-453` — unknown-tag rejection test asserts the message enumerates all seven (`:449-452`). Fresh run: 31 pass / 0 fail / 613 expect |
| R2 | MET | `plugins/cc/skills/cc-skills/references/skill-engineering-theory.md:215-219` — definition matches Design verbatim target: "two instructions in the same config that cannot both be followed", explicitly distinct from duplication (same instruction stated twice, wasteful but consistent) and negation (a prohibition with no positive alternative); detection question `plugins/cc/skills/cc-skills/references/skill-engineering-theory.md:220-224` discriminates against both neighbours ("not a restatement... not a lone prohibition") — read-verified |
| R3 | MET | `plugins/cc/skills/cc-skills/references/skill-engineering-theory.md:108` — heading retitled `## The seven named failure modes`; `plugins/cc/skills/cc-skills/references/skill-engineering-theory.md:152` — Duplication fix says "re-explaining the seven modes"; preamble `:110-111` names no count (matches Solution's no-change note); `plugins/cc/skills/cc-skills/references/glossary.md:76-78` — Proposal entry names all seven in const order; `plugins/cc/skills/cc-skills/references/glossary.md:100-103` — new Contradiction anchor (seventh failure mode, Avoid: "conflict"/"clash"); Negation anchor stays "the sixth failure mode" (correct — contradiction appended last); `plugins/cc/skills/cc-skills/references/workflows.md:501-502` — "all seven" list normalized to const order — all read-verified |
| R4 | MET | All four evolve command surfaces list the full seven in const order: `plugins/cc/commands/command-evolve.md:57-58`, `plugins/cc/commands/agent-evolve.md:57-58`, `plugins/cc/commands/magent-evolve.md:57-58` (six tags at :57 + `or \`contradiction\`` at :58), `plugins/cc/commands/skill-evolve.md:57-58` ("Definitions (all seven modes)" at :60) — read-verified |
| R5 | MET | `plugins/cc/commands/command-evolve.md:57-58`, `plugins/cc/commands/agent-evolve.md:57-58`, `plugins/cc/commands/magent-evolve.md:57-58` — each now names `negation` (was missing from the original five) and `contradiction` — read-verified; repo-wide sweep (grep for stale five/six-tag enumerations and "six named failure modes") finds no live surface disagreeing with `FAILURE_MODES`; remaining old-set text is historical corpus records only (`docs/tasks/0070,0077,0116`, dogfood reports — intentional, documented in Solution) |

| Acceptance Criteria | Status | Evidence Type | Evidence |
|---------------------|--------|---------------|----------|
| Scenario: The tag is accepted on ingest | MET | test | `apps/cli/tests/operations/evolve-ingest.test.ts:398-418` — `accepts the contradiction failure_mode tag (0116 — seventh mode)`: ingest succeeds, tag persisted in proposal history; fresh run 31 pass / 0 fail |
| Scenario: Unknown tags are still rejected | MET | test | `apps/cli/tests/operations/evolve-ingest.test.ts:427-453` — rejection message enumerates all seven valid modes (`apps/cli/tests/operations/evolve-ingest.test.ts:451` regex: sprawl…contradiction); rejection itself from `apps/cli/src/operations/evolve.ts:731-737` |
| Scenario: The definition discriminates against its nearest neighbours [docs-only] | MET | static-ref | `plugins/cc/skills/cc-skills/references/skill-engineering-theory.md:215-219` (definition) + `plugins/cc/skills/cc-skills/references/skill-engineering-theory.md:220-224` (detection question: "not a restatement (duplication asks…)" / "not a lone prohibition (negation asks…)") — read-verified; documentation-content claim, schema-sanctioned [docs-only] |
| Scenario: Every documented surface agrees with the CLI [docs-only] | MET | static-ref | 8 surfaces read-verified in const order: const `apps/cli/src/operations/evolve.ts:113-121`, theory ref `plugins/cc/skills/cc-skills/references/skill-engineering-theory.md:108`, `plugins/cc/skills/cc-skills/references/glossary.md:76-78`, `plugins/cc/skills/cc-skills/references/workflows.md:501-502`, 4 command files `plugins/cc/commands/{command,agent,magent,skill}-evolve.md:57-58`; repo-wide grep sweep — no stale five/six-tag list in live surfaces; documentation-state claim, schema-sanctioned [docs-only] |
| Scenario: The pre-existing negation omission is repaired [docs-only] | MET | static-ref | `plugins/cc/commands/command-evolve.md:57-58`, `plugins/cc/commands/agent-evolve.md:57-58`, `plugins/cc/commands/magent-evolve.md:57-58` — each names `negation` and `contradiction` alongside the original five (were five tags) — read-verified; documentation-state claim, schema-sanctioned [docs-only] |
- Coverage: N/A (verdict-based; verify pipeline does not measure code coverage)
### Review
| Priority | Dimension | Location | Finding |
| --- | --- | --- | --- |
| P4 | Functional | all R1–R5 surfaces | No P1–P3 findings; all five requirements MET, all five AC scenarios satisfied — verdict PASS |
| P4 | SECUA | `apps/cli/src/operations/evolve.ts:113-121,736-738` | No P1–P3 findings; append-only const change, validation preserved via const-derived `includes()`, rejection message self-enumerates all seven (no hand-edited string) |
| P4 | Architecture | `plugins/cc/commands/*-evolve.md:57` | Advisory-only: inline tag lists remain hand-maintained copies of `FAILURE_MODES` (a `duplication` drift risk — this task's own premise). Recorded in Design as out-of-scope; correctly not shipped |

**Functional Verdict: PASS** — per-requirement traceability:

| Req | Status | Evidence |
| --- | --- | --- |
| R1 | MET | `apps/cli/src/operations/evolve.ts:113-121` — `'contradiction'` appended last to `FAILURE_MODES` (seven); `evolve.ts:736-738` — rejection uses `FAILURE_MODES.join(', ')` so unknown tags are rejected naming all seven (verified by read, not hand-edit); `apps/cli/tests/operations/evolve-ingest.test.ts:398-417` — `accepts the contradiction failure_mode tag (0116 — seventh mode)` ingests and persists; `:450-452` — unknown tag rejection asserts all seven enumerated |
| R2 | MET | `plugins/cc/skills/cc-skills/references/skill-engineering-theory.md:215-219` — definition matches Design verbatim target: "two instructions in the same config that cannot both be followed", explicitly discriminated from duplication (restatement) and negation (lone prohibition) |
| R3 | MET | `skill-engineering-theory.md:108` — heading retitled `## The seven named failure modes`; `:152` — "re-explaining the seven modes"; `glossary.md:76-78` — Proposal entry names seven in const order; `glossary.md:100-103` — new Contradiction anchor; `workflows.md:501-502` — "all seven" normalized to const order |
| R4 | MET | All four command surfaces at line 57 carry the full seven in const order (read-verified): `command-evolve.md:57`, `agent-evolve.md:57`, `magent-evolve.md:57`, `skill-evolve.md:57-60` ("Definitions (all seven modes)") |
| R5 | MET | `command-evolve.md:57`, `agent-evolve.md:57`, `magent-evolve.md:57` — each now names `negation` and `contradiction` alongside the original five (was five tags; read-verified) |

**Acceptance Criteria Verification:**

| AC | Status | Evidence Type | Evidence |
| --- | --- | --- | --- |
| Tag accepted on ingest | MET | test | `evolve-ingest.test.ts:398-417` — ingest succeeds, tag persisted in proposal history (ran: 31 pass / 0 fail) |
| Unknown tags still rejected | MET | test | `evolve-ingest.test.ts:450-452` — rejection message enumerates all seven valid modes |
| Definition discriminates vs duplication/negation | MET | static ref | `skill-engineering-theory.md:217-219` + detection question `:220-224` |
| Every documented surface agrees with CLI | MET | static ref (repo-wide sweep) | 8 surfaces — const, theory ref, glossary, workflows, 4 command files — all name the same seven in the same order; no stale five/six-tag list in live surfaces |
| Pre-existing negation omission repaired | MET | static ref | `command/agent/magent-evolve.md:57` each name `negation` + `contradiction` |

**Design conformance:** DONE — frozen name `contradiction`, appended last (ledger-safe, no reorder); definition verbatim; all four anti-patterns respected (no detection builder, no reorder, no link-refactor of inline lists, `command-refine.md` untouched — not in diff). Theory preamble at `:110-111` indeed names no count, matching Solution's "no change needed".

**SECUA notes:** S — no new attack surface; tag literal validated against the const (`includes`), rejection interpolation of the invalid tag is pre-existing pattern. E — one array literal, O(n) scan of 7 elements; negligible. C — append-last preserves persisted-ledger ordering; type derives from const (`(typeof FAILURE_MODES)[number]`), no type drift; both changed behaviors under test. U — rejection message now names all seven (author can pick a real tag) — a usability improvement, not a regression. A — no structural change; diff is const append + docs + tests, no scope creep.

**Architecture candidates (sp-code-improvement, advisory only):**

- **C1 — duplication (advisory)** in `plugins/cc/commands/*-evolve.md:57`: the four command files each restate the full tag list inline — hand-maintained copies of `FAILURE_MODES`. Symptom: this task's own premise (3 of 4 were stale). Deepening: command files point at the theory reference as single home and stop enumerating. Challenge: cross-platform command docs are static markdown read by humans/agents; dropping the enumeration forces a link-follow to learn the tags. Defense: the files already cite `cc:cc-skills` as the definitions source; the enumeration adds convenience at drift cost. Severity held at advisory — Design explicitly records this as the out-of-scope improvement; do not ship here.
- **C2 — duplication (advisory)** in `plugins/cc/tests/structure.test.ts:102-117`: the theory-presence test enumerates the seven terms by hand. Symptom: a future eighth tag requires editing both const and test list. Deepening: drive the term list from `FAILURE_MODES` import. Challenge: the test reads rendered markdown text, not the TS const — cross-package import couples plugin tests to CLI internals. Defense: a shared constant package would serve both; marginal gain at current size. Held advisory.

**Residual risk:** low. The only remaining five/six-tag text lives in historical corpus records (`docs/tasks/*` 0077/0116 narrative) and gitignored build artifacts (`apps/cli/dist/index.js`, `.rulesync/.targets/`) — both documented in Solution as intentional. P2 tag (priority) unchanged; no rubric/scorer/behavior change shipped, matching Out-of-scope.
### References

A

<!-- Links to the parent feature, design docs, related tasks, or external references. -->

### History
- 2026-08-13T19:40:11.737Z todo → wip (system)
- 2026-08-13T19:48:49.958Z wip → testing (system)
- 2026-08-13T19:48:50.239Z testing → done (system)
