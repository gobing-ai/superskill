---
name: Generation seam evolve propose-only json and ingest
description: Generation seam evolve propose-only json and ingest
status: Backlog
created_at: 2026-06-17T22:37:16.802Z
updated_at: 2026-06-17T22:37:16.802Z
folder: docs/tasks
type: task
feature-id: F023
priority: high
estimated_hours: 6
dependencies: ["0028"]
tags: ["phase4","generation","evolve","seam","anti-drift"]
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0030. Generation seam evolve propose-only json and ingest

### Background

Replace the generateChanges placeholder (evolve.ts ~line 118, emits '[Improve <dim>]: review and enhance the description…') with a real generation seam. The CLI contributes envelope-out (evolve --propose-only --json) emitting per-dimension generation BRIEFS, and ingest-in (evolve --ingest <proposal.json>) accepting agent-authored ProposedChange[], persisting, and applying on accept through existing machinery. ProposedChange already carries {location,current,proposed,reason} and applyChange already does real text replacement — the ONLY fake part is where 'proposed' comes from (design §2.2). Today evolve runs a real loop around fake content (a TODO note prepended to the description). GOAL ANCHORING (anti-drift): every brief includes the IMMUTABLE goal anchor (original frontmatter + rubric criteria + DON'T rules) emitted VERBATIM; the CLI must not summarise/drop them. CLI never calls a model (invariant #1). Design: design-doc-phase4.md §2.2. Owning feature: F023.


### Requirements

- [ ] **R1** — Envelope-out (`evolve <name> --propose-only --json`): emits `{ trends, baseline, rubric, briefs: GenerationBrief[] }` where each brief = `{ dimension, current_text, target_criterion, anchor }`.
- [ ] **R2** — **Goal anchoring (anti-drift, design §2.2):** each brief's `anchor` carries the original frontmatter + relevant rubric criteria + negative constraints (DON'T rules) **verbatim** — the CLI does not summarise or drop them.
- [ ] **R3** — Ingest-in (`evolve <name> --ingest <proposal.json>`): accepts agent-authored `ProposedChange[]` with real `proposed` text.
- [ ] **R4** — Ingested proposal persisted via `ProposalDao.insertProposal`; on accept, applied via the existing `applyChange` (`content/edit.ts`) + the existing verify loop (`stepVerify`).
- [ ] **R5** — `generateChanges` placeholder (`[Improve <dim>]: …`) **removed** from the default path — must not appear in any evolve output (design §7 exit #1).
- [ ] **R6** — `stepApply` (`evolve.ts` ~line 377) applies *authored* `proposed` text from ingest, not the prepended placeholder.
- [ ] **R7** — `--json` accepted on `evolve` (envelope mode) and `--ingest <file>` added; composed with existing `addEvolveOptions` (`--from`/`--propose-only`/`--accept`/`--reject`).
- [ ] **R8** — `evolve.ts` makes **no** model API call; the rewrite enters only as ingested JSON.

**Acceptance:**
```bash
superskill skill evolve my-skill --propose-only --json | rg "\[Improve"   # → no match (placeholder gone)
superskill skill evolve my-skill --propose-only --json   # → briefs[] with verbatim anchor
superskill skill evolve my-skill --ingest ./proposal.json --accept <id>   # → real text written, no placeholder
```

**Out of scope:** the gate decision (F024 — F023 wires the ingest path, F024 adds validate/Δ/anchor gating).


### Q&A



### Design



### Solution

evolve.ts: envelope path emits briefs (work orders), NOT changes. Build GenerationBrief = {dimension,current_text,target_criterion,anchor}; the anchor is emitted verbatim (the same data Skeptic/Judge receive in F024). Ingest path consumes authored ProposedChange[], persists proposal, on accept applies via applyChange (content/edit.ts) + runs stepVerify (the F024 gate plugs in here — F023 wires the path, F024 adds the decision). Remove generateChanges from default path; placeholder string must be unreachable. helpers.ts: ensure --json accepted on evolve + add --ingest <file>.


### Plan



### Review



### Testing

Tests ship **in this task** (design rule: each task owns its tests — no separate pure-test task).

- [ ] `tests/operations/evolve-ingest.test.ts`:
  - Envelope-out (`evolve --propose-only --json`) emits briefs carrying the **verbatim** goal anchor (assert the anchor contains the original frontmatter + negative constraints unchanged).
  - Ingest-in: a recorded `proposal.json` applies real `proposed` text via `applyChange`; **no `[Improve` placeholder** appears anywhere in output.
  - Assert `evolve` never emits the old TODO placeholder on any path.
- [ ] Fixture-replay only — `proposal.json` hand-authored, never live-generated.
- [ ] Coverage for the generation-seam branches contributes to the ≥90% gate.
- [ ] No test skipped / `.skip`'d (R12).

`tests/fixtures/phase4/proposal-good.json`. Spy on `process.stdout.write`.


### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References

- Design: [design-doc-phase4.md](../design/design-doc-phase4.md) §2.2
- Feature: [F023](../features/F023-generation-seam.md)
- Depends on: 0028
- Code: apps/cli/src/operations/evolve.ts (generateChanges ~118, stepApply ~377)

