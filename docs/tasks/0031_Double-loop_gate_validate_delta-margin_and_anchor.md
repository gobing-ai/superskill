---
name: Double-loop gate validate delta-margin and anchor
description: Double-loop gate validate delta-margin and anchor
status: Backlog
created_at: 2026-06-17T22:37:29.054Z
updated_at: 2026-06-17T22:37:29.054Z
folder: docs/tasks
type: task
feature-id: F024
priority: high
estimated_hours: 5
dependencies: ["0029","0030"]
tags: ["phase4","gate","safety","evolve","adversarial"]
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0031. Double-loop gate validate delta-margin and anchor

### Background

A gate enforced by the CLI on the evolve ingest path (F023): an authored proposal is applied only if it passes BOTH a deterministic gate (validate, zero errors) AND a non-deterministic gate (post-aggregate exceeds baseline by a margin AND no anchor violation reported by the Skeptic). Failing either -> proposal stays draft, file restored, no silent acceptance (design §4). Self-evolution without a gate can regress quality or drift from the original goal; the gate makes the closed evolve loop SAFE to run autonomously. The personas (Skeptic, Judge) run in the agent/Spur layer (P4-D2); the CLI only gates on their structured output. Design: design-doc-phase4.md §4, §8 #5. Owning feature: F024.


### Requirements

- [ ] **R1** — **Deterministic gate:** the rewritten file passes `validate(type, path)` with **zero errors** (reuse `operations/validate.ts`). Errors > 0 → gate fail.
- [ ] **R2** — **Δ-margin gate:** `postAggregate − baselineAggregate ≥ Δ` (default **0.05**; configurable via `--margin` with a 0.05 default). Below margin → gate fail.
- [ ] **R3** — **Anchor gate:** the ingested proposal's `anchor_hash` matches the baseline anchor's hash. Mismatch (anchor tampered/summarised) → gate fail.
- [ ] **R4** — **Skeptic gate:** if `ingest.skeptic.ok === false` → gate fail (records `violations`).
- [ ] **R5** — Failing **any** gate → proposal stays `'draft'` (not `accepted`), file **restored** from the pre-apply backup, result surfaces the rejection reason. **No silent acceptance** (design §8 #5).
- [ ] **R6** — Pre-apply backup reuses the refine `.bak` primitive.
- [ ] **R7** — On **pass:** keep the existing accept + `verify_id` linkage; the post-eval verify row is still written (closed loop, 03 invariant #6 — the gate sits on top, does not bypass it).
- [ ] **R8** — Implemented by extending `stepVerify` (`evolve.ts:427`), not a parallel path.

The gate's tests (`tests/operations/gate.test.ts`) ship **in this task** — see the `### Testing` section. There is no separate test task.

**Out of scope:** persona definitions / skill wiring (F025), and the phase closing gate (owned by F025 as the last implementing task).


### Q&A



### Design



### Solution

Extend stepVerify (evolve.ts:427 — already runs post-eval + records the row). Add: (1) pre-apply backup (reuse refine's .bak); (2) deterministic gate via validate(type,path) errors>0->fail; (3) Delta-margin postScore-baselineScore>=Delta (default 0.05; prefer --margin option w/ 0.05 default); (4) anchor check: ingested anchor_hash vs baseline anchor hash; (5) skeptic: ingest.skeptic.ok===false->fail; (6) on any fail restore from backup, set proposal 'draft', return rejection w/ reason; on pass keep accept + verify_id. Gate sits ON TOP of the verify row, does not bypass it (03 invariant #6).


### Plan



### Review



### Testing

Tests ship **in this task** (design rule: each task owns its tests — no separate pure-test task).

- [ ] `tests/operations/gate.test.ts`:
  - Regressive proposal fixture → gate fails on Δ-margin → file **restored** (assert content byte-identical to pre-apply) → proposal stays `draft`.
  - Validation-failing proposal → gate fails on the deterministic gate → restored.
  - Anchor-tampered fixture (`anchor_hash` mismatch) → gate fails → restored.
  - Skeptic-veto fixture (`{ ok: false }`) → gate fails → restored.
  - Good proposal → passes both gates → applied → `verify_id` linked + post-eval row written.
- [ ] Fixtures hand-authored: `proposal-regressive.json`, `proposal-invalid.json`, `proposal-anchor-tampered.json`, `skeptic-veto.json` — never live-generated.
- [ ] Coverage for all gate branches contributes to the ≥90% gate.
- [ ] No test skipped / `.skip`'d (R12).

`tests/fixtures/phase4/`. Spy on `process.stdout.write`.


### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References

- Design: [design-doc-phase4.md](../design/design-doc-phase4.md) §4, §8 #5
- Feature: [F024](../features/F024-double-loop-gate.md)
- Depends on: 0029, 0030
- Code: apps/cli/src/operations/evolve.ts (stepVerify:427), operations/validate.ts

