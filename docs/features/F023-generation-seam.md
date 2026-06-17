---
feature_id: F023
title: Generation seam (evolve --propose-only --json / --ingest)
phase: 4
status: planned
depends_on: [F021]
deliverables:
  - apps/cli/src/operations/evolve.ts (replace generateChanges placeholder)
  - apps/cli/src/commands/helpers.ts (--json / --ingest on evolve)
created: 2026-06-17
---

# F023 — Generation seam (non-deterministic content rewrite)

## What

Replace the `generateChanges` placeholder (`evolve.ts` ~line 118, emits
`"[Improve <dim>]: review and enhance the description…"`) with a real generation seam. The CLI
contributes an **envelope-out** (`evolve --propose-only --json`) emitting per-dimension generation
**briefs**, and an **ingest-in** (`evolve --ingest <proposal.json>`) accepting agent-authored
`ProposedChange[]`, persisting the proposal, and applying on accept through the existing machinery.

## Why

`ProposedChange` already carries `{ location, current, proposed, reason }` and `applyChange` already
does real text replacement — the **only** fake part is *where `proposed` comes from* (design §2.2).
Today `evolve` runs a real loop around fake content (a TODO note prepended to the description). This
seam routes real rewritten text from an Author persona into the existing, tested apply/verify loop.

## Change

### Two modes (design §2.2)

| Mode | Who runs it | `ProposedChange.proposed` |
|------|-------------|---------------------------|
| `placeholder` (current) | CLI | TODO note (to be removed) |
| `authored` (new) | agent/Spur Author persona → CLI ingests | real rewritten text |

### CLI contribution — `operations/evolve.ts`

**Envelope-out** — `superskill <type> evolve <name> --propose-only --json`:
- Emits `{ trends: <computeTrends output>, baseline: <QualityReport>, rubric: <loaded rubric>,
  briefs: GenerationBrief[] }` where each `GenerationBrief` = `{ dimension, current_text,
  target_criterion, anchor }`.
- **Goal anchoring (design §2.2 IMPORTANT, anti-drift):** every brief includes the **immutable**
  goal anchor — the original frontmatter, the relevant rubric criteria, and the negative constraints
  (DON'T rules) — emitted **verbatim**. The CLI must not summarise or drop them. This is the data the
  Skeptic/Judge later receive (F024).

**Ingest-in** — `superskill <type> evolve <name> --ingest <proposal.json>`:
- Accepts agent-authored `ProposedChange[]` (real `proposed` text).
- Persists the proposal via `ProposalDao.insertProposal` (existing).
- On accept, applies via the existing `applyChange` (`content/edit.ts`) and runs the existing verify
  loop (`stepVerify`). **The double-loop gate (F024) runs here** — F023 wires the ingest path; F024
  adds the gate decision.

### Replace the placeholder — `generateChanges`

- The deterministic `generateChanges(report, trends)` that emits `[Improve …]` TODO text is **removed
  from the default path**. In `--propose-only --json` mode the CLI emits *briefs* (work orders), not
  changes. In `--ingest` mode the CLI consumes authored changes. The placeholder string must not
  appear in any evolve output (design §7 exit #1).
- `stepApply` (`evolve.ts` ~line 377) keeps applying via `applyChange` — but now applies *authored*
  `proposed` text from ingest, not the prepended placeholder.

### `commands/helpers.ts`

- Ensure `--json` is accepted on `evolve` (envelope mode) and add `--ingest <file>`. Compose with the
  existing `addEvolveOptions` (`--from`/`--propose-only`/`--accept`/`--reject`).

### Invariants honored

- **CLI is deterministic** (#1): the rewrite is authored by the agent and ingested as JSON.
- **Goal anchor is immutable** (#6): original instructions + negative constraints travel verbatim in
  every brief; never summarised away.

## Acceptance

```bash
# Envelope-out: generation briefs with immutable anchor
superskill skill evolve my-skill --propose-only --json
# → JSON: { trends, baseline, rubric, briefs:[{dimension,current_text,target_criterion,anchor}] }
# → anchor contains original frontmatter + negative constraints verbatim → exit 0
# → NO [Improve …] placeholder text anywhere

# Ingest-in: authored proposal applied
superskill skill evolve my-skill --ingest ./fixtures/proposal.json --accept <id>
# → real rewritten text written to the file (no placeholder), proposal persisted, verify runs → exit 0

# Placeholder is gone
superskill skill evolve my-skill --propose-only --json | rg "\[Improve"   # → no match
```
