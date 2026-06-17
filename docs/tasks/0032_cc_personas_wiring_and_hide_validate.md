---
name: cc personas wiring and hide validate
description: cc personas wiring and hide validate
status: Backlog
created_at: 2026-06-17T22:37:43.652Z
updated_at: 2026-06-17T22:37:43.652Z
folder: docs/tasks
type: task
feature-id: F025
priority: high
estimated_hours: 5
dependencies: ["0029","0030","0031"]
tags: ["phase4","plugin","personas","spur","validate-hide"]
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0032. cc personas wiring and hide validate

### Background

Wire the cc:cc-<type> skill workflows (re-authored thin in Phase 3) to DRIVE the Phase 4 seams via four Spur agent personas — Scorer, Author, Skeptic, Judge — and remove the deterministic-only framing from SKILL.md. Also implement P4-D3: hide validate behind evaluate/refine/evolve — delete hook-validate.md, ensure no *-validate slash command exists, confirm operations gate on validate internally. F022-F024 added the CLI seams but the CLI does no scoring/generation itself (P4-D2); the cc skill is where the non-determinism is orchestrated. Without this wiring the seams have no driver. P4-D3 resolves the Phase 3 §3.3 validate-surface gap by HIDING it, not by adding four commands. Design: design-doc-phase4.md §1, §4, §5.1, D3. Owning feature: F025.


### Requirements

- [ ] **R1** — All 5 `cc:cc-<type>` SKILL.md rewrite evaluate/refine/evolve to the **two-call seam pattern**: `evaluate --rubric --json` → Scorer → `evaluate --ingest --save`; `evolve --propose-only --json` → Author → Skeptic → (Judge) → `evolve --ingest --accept`.
- [ ] **R2** — Four personas defined in the expert agents (or referenced Spur prompts):
  - **Scorer** → `{ rubric_version, dimensions:{name:{score,note}} }`.
  - **Author** → `ProposedChange[]` with real `proposed` text + `anchor_hash`.
  - **Skeptic** → `{ ok, violations[] }` against the verbatim goal anchor.
  - **Judge** → pairwise tournament selector when multiple candidates.
- [ ] **R3** — Deterministic-only framing removed from SKILL.md (the rubric/authored path is the primary workflow now).
- [ ] **R4** — **Goal-anchor discipline:** persona prompts pass the original instructions + negative constraints **verbatim** to Skeptic/Judge; no compaction. (CLI gate F024 enforces via `anchor_hash`; the skill must not strip it pre-call.)
- [ ] **R5** — **Hide `validate` (P4-D3):** delete `plugins/cc/commands/hook-validate.md`. No `*-validate` slash command for any type.
- [ ] **R6** — `validate` stays a CLI verb used as an internal precondition gate (evaluate/refine/evolve gate on it; F024's deterministic gate is this). Confirmed for all 5 types.
- [ ] **R7** — Command surface after this = **16** (Phase 3's 17 minus `hook-validate`).
- [ ] **R8** — No invented flags, no new CLI verbs — F025 is plugin-side wiring + one deletion. Seams (`--rubric`/`--ingest`/`--json`) come from F022/F023.

**Acceptance:**
```bash
test ! -f plugins/cc/commands/hook-validate.md && echo deleted
ls plugins/cc/commands/ | wc -l                                   # → 16
rg "evaluate .* --rubric .* --json" plugins/cc/skills/            # → hits
rg "evolve .* --propose-only --json|evolve .* --ingest" plugins/cc/skills/  # → hits
rg -i "scorer|author|skeptic|judge" plugins/cc/agents/            # → hits
rg -i "verbatim|do not summari|immutable.*anchor" plugins/cc/skills/ plugins/cc/agents/  # → hits
```

**Out of scope:** the CLI seam/gate implementation (F022–F024). (Tests are not out of scope — this task owns the plugin-wiring tests **and** the Phase 4 closing gate; see `### Testing`.)


### Q&A



### Design



### Solution

Per cc:cc-<type>: rewrite evaluate->'<type> evaluate --rubric --json' (Scorer) then '--ingest --save'; evolve->'<type> evolve --propose-only --json' (Author from briefs -> Skeptic refutes -> Judge selects if multiple) then '--ingest --accept' (CLI gate F024 decides). Define personas in expert-*.md or referenced Spur prompts. Remove heuristic-only framing. Persona prompts pass original instructions + negative constraints verbatim (CLI gate enforces via anchor_hash but skill must not strip pre-call). Delete hook-validate.md. Match Phase 3 thin SKILL.md structure — extend workflow sections, don't restructure.


### Plan



### Review



### Testing

Tests ship **in this task** (design rule: each task owns its tests — no separate pure-test task).

- [ ] Plugin-side wiring assertions (the §Acceptance commands in this task): `hook-validate.md` deleted; command surface = 16; SKILL.md drives the two-call seam; personas defined; goal anchor passed verbatim.
- [ ] **Phase-4 closing gate** (this is the last Phase-4 impl task, so it owns the whole-phase checks):
  - `bun run test` — all Phase 4 tests (rubric / evaluate-ingest / evolve-ingest / gate, each owned by tasks 0028–0031) pass; **none** skipped / `.skip`'d / commented out.
  - Aggregate coverage **line ≥ 90% / function ≥ 90%** (`bunfig.toml`).
  - **CLI makes zero model API calls** (invariant #1): assert no model/provider/network call is reachable from the tested paths — `rg -i "anthropic|openai|fetch\(|http" apps/cli/src/operations/ apps/cli/src/quality/` → none.
- [ ] `bun run lint && bun run build` green; `git status` shows only intentional changes.

This task carries the cross-feature gate the dissolved pure-test feature (former F026) used to hold; per-feature tests live in 0028–0031.


### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References

- Design: [design-doc-phase4.md](../design/design-doc-phase4.md) §1, §4, §5.1, P4-D3
- Feature: [F025](../features/F025-cc-personas-hide-validate.md)
- Depends on: 0029, 0030, 0031
- Owns: Phase 4 closing gate (full suite + >=90% coverage + zero model calls)
- Carries the gate formerly held by canceled task 0033

