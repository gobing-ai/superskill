---
feature_id: F024
title: Double-loop gate (validate + Δ-margin + anchor)
phase: 4
status: planned
depends_on: [F022, F023]
deliverables:
  - apps/cli/src/operations/evolve.ts (gate decision on ingest)
  - apps/cli/src/operations/validate.ts (precondition reuse)
created: 2026-06-17
---

# F024 — Double-loop gate + adversarial safeguards

## What

A gate enforced by the CLI on the evolve **ingest** path (F023): an authored proposal is applied only
if it passes **both** a deterministic gate (validate, zero errors) and a non-deterministic gate
(post-evolution aggregate exceeds baseline by a configurable margin **and** no anchor violation
reported by the Skeptic). Failing either → proposal stays `draft`, the file is restored, no silent
acceptance (design §4).

## Why

Self-evolution without a gate can regress quality or drift from the original goal. The gate is what
makes the closed evolve loop **safe** to run autonomously: every accepted change has a measured,
gated outcome, and a regressive or goal-violating proposal is rejected and rolled back rather than
silently shipped (design §8 #5).

## Change

### The four safeguards (design §4) — Spur personas + CLI gate

The personas (Skeptic, Judge) run in the **agent/Spur layer** (P4-D2); the CLI only **gates** on
their structured output. F025 wires the personas; F024 implements the CLI-side gate decision.

1. **Skeptic / Refuter** — every authored proposal is passed (by the agent) to an independent skeptic
   persona that finds flaws/omissions before apply. Its verdict (`{ ok: boolean, violations: [] }`)
   arrives in the ingest JSON; the CLI reads it.
2. **Tournament selection** — when the Author emits multiple candidates, a Judge persona does pairwise
   comparison; the winner is the single `ProposedChange[]` ingested. (Selection happens agent-side;
   the CLI ingests the winner.)
3. **Immutable goal anchoring** — Skeptic and Judge receive the original instructions/rules/negative
   constraints verbatim (the anchor F023 emits). The CLI re-checks that the ingested proposal's
   `anchor_hash` matches the baseline anchor — a mismatch means the anchor was tampered/summarised →
   gate fail.
4. **Double-loop gate (CLI-enforced on ingest):**
   - **Deterministic gate:** the rewritten file passes `validate` with **zero errors** (reuse
     `operations/validate.ts`).
   - **Non-deterministic gate:** `postAggregate − baselineAggregate ≥ Δ` (default **0.05**,
     configurable) **and** Skeptic reports no invariant/anchor violation.
   - Failing **either** → proposal stays `draft`, file **restored** from the pre-apply backup, exit
     surfaces the rejection reason. No silent acceptance.

### Implementation — `operations/evolve.ts`

- Extend `stepVerify` (`evolve.ts:427`) — it already runs the post-eval and records the row. Add:
  1. A pre-apply backup (the refine path already backs up to `.bak`; reuse that primitive).
  2. The deterministic gate: call `validate(type, path)`; if errors > 0 → fail.
  3. The Δ-margin check: `postScore − baselineScore ≥ Δ` (default 0.05; expose a `--margin` option or
     read from rubric/config — **decide at impl time**, prefer an option with a 0.05 default).
  4. The anchor check: compare the ingested `anchor_hash` against the baseline anchor's hash.
  5. The Skeptic verdict: if `ingest.skeptic.ok === false` → fail.
  6. On any fail: restore the file from backup, set proposal status `draft` (not `accepted`), return a
     rejection result with the reason. On pass: keep the existing accept + `verify_id` linkage.

### Invariants honored

- **Gated acceptance** (#5): no proposal applied unless both gates pass; regressions restore the
  original.
- **Goal anchor is immutable** (#6): the anchor-hash check enforces it mechanically.
- **Closed evolve loop** (03 invariant #6): every accepted proposal still triggers a verification
  evaluation — the gate sits on top, it does not bypass the verify row.

## Acceptance

```bash
# Regressive proposal is rejected + file restored (design §7 exit #3)
superskill skill evolve my-skill --ingest ./fixtures/regressive-proposal.json --accept <id>
# → post-aggregate < baseline + Δ → GATE FAIL → file restored to original → proposal stays 'draft'
# → exit non-zero with reason "below Δ margin"; git diff of the content file → empty

# Validation-failing proposal is rejected
superskill skill evolve my-skill --ingest ./fixtures/invalid-proposal.json --accept <id>
# → validate errors > 0 → GATE FAIL → restored

# Anchor-tampered proposal is rejected
superskill skill evolve my-skill --ingest ./fixtures/anchor-tampered.json --accept <id>
# → anchor_hash mismatch → GATE FAIL → restored

# Genuine improvement passes
superskill skill evolve my-skill --ingest ./fixtures/good-proposal.json --accept <id>
# → validate clean + Δ ≥ 0.05 + skeptic ok → applied → verify row + verify_id linked → exit 0
```
