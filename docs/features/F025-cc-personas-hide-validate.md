---
feature_id: F025
title: cc skill + Spur personas + hide validate (P4-D3)
phase: 4
status: planned
depends_on: [F022, F023, F024]
deliverables:
  - plugins/cc/skills/cc-agents/SKILL.md
  - plugins/cc/skills/cc-skills/SKILL.md
  - plugins/cc/skills/cc-commands/SKILL.md
  - plugins/cc/skills/cc-hooks/SKILL.md
  - plugins/cc/skills/cc-magents/SKILL.md
  - plugins/cc/agents/expert-*.md (persona wiring)
  - delete plugins/cc/commands/hook-validate.md
created: 2026-06-17
---

# F025 — `cc` skill + Spur personas + hide `validate` (P4-D3)

## What

Wire the `cc:cc-<type>` skill workflows (re-authored thin in Phase 3) to **drive** the Phase 4 seams
via four Spur agent personas — Scorer, Author, Skeptic, Judge — and remove the deterministic-only
framing from SKILL.md. Also implement **P4-D3**: hide `validate` behind evaluate/refine/evolve —
delete `hook-validate.md`, ensure no `*-validate` slash command exists, and confirm the operations
gate on `validate` internally.

## Why

F022–F024 added the CLI seams (envelope-out / ingest-in / gate) but the CLI does no scoring or
generation itself (P4-D2). The `cc` skill is where the non-determinism is orchestrated: the Scorer
judges against the rubric, the Author rewrites, the Skeptic refutes, the Judge selects — each feeding
JSON back into the CLI. Without this wiring, the seams have no driver. P4-D3 resolves the Phase 3
§3.3 `validate`-surface gap by hiding it, not by adding four commands.

## Change

### Persona wiring (design §1, §4) — SKILL.md + expert-*.md

For each `cc:cc-<type>`:
- Rewrite the evaluate/refine/evolve workflows to the **two-call seam pattern**:
  1. `superskill <type> evaluate <name> --rubric <rubric> --json` → Scorer persona scores the
     envelope → `superskill <type> evaluate <name> --ingest <scores.json> --save`.
  2. `superskill <type> evolve <name> --propose-only --json` → Author persona authors rewrites from
     the briefs → Skeptic refutes → (Judge selects if multiple) → `superskill <type> evolve <name>
     --ingest <proposal.json> --accept <id>` → CLI gate (F024) decides.
- Define the four personas in the expert agents (or referenced Spur persona prompts):
  - **Scorer** — rubric judge; outputs `{ rubric_version, dimensions:{name:{score,note}} }`.
  - **Author** — rewriter; outputs `ProposedChange[]` with real `proposed` text + `anchor_hash`.
  - **Skeptic** — refuter; outputs `{ ok, violations[] }` against the verbatim goal anchor.
  - **Judge** — pairwise tournament selector when the Author emits multiple candidates.
- **Remove the deterministic-only framing** from SKILL.md (the Phase 3 thin version still describes
  evaluate as heuristic-only) — describe the rubric/authored path as the primary workflow.

> **Goal-anchor discipline (design §2.2, §4):** the persona prompts must pass the original
> instructions + negative constraints **verbatim** to Skeptic and Judge. Compaction of the anchor is
> prohibited — the CLI gate (F024) enforces it via `anchor_hash`, but the skill must not strip it
> before the call.

### Hide `validate` (P4-D3) — design §5.1, §2 (D3)

- **Delete `plugins/cc/commands/hook-validate.md`** (the lone `*-validate`, kept transitional in
  Phase 3). After this, **no `*-validate` slash command exists** for any type.
- `validate` stays a **CLI verb** used as an internal precondition gate (evaluate/refine/evolve call
  it; F024's deterministic gate is exactly this). Confirm all five types' evaluate/refine/evolve gate
  on validate internally — no user-facing `validate` command.
- Command surface after this: **16 commands** (Phase 3's 17 minus `hook-validate`).

### Tests + phase closing gate (in this feature's task)

Tests ship **in this feature's task** — there is no pure-test feature. As the last Phase 4
implementing feature, this feature's task also owns the **Phase 4 closing gate**: the full suite
green (per-feature fixture-replay tests live in F021–F024's tasks), ≥90% line/function coverage, and
the **zero model API call** assertion (no model/provider/network call reachable from `operations/`,
`quality/`).

### Constraints

- **No invented flags / no new CLI verbs** — F025 is plugin-side wiring + one deletion. The seams
  (`--rubric`/`--ingest`/`--json`) come from F022/F023; do not add CLI surface here.
- **Match the Phase 3 thin SKILL.md structure** — extend the workflow sections, don't restructure.

## Acceptance

```bash
# hook-validate gone; no *-validate anywhere (design §7 exit #5)
test ! -f plugins/cc/commands/hook-validate.md && echo "deleted"
rg "\-validate" plugins/cc/commands/ ; ls plugins/cc/commands/ | rg "validate"   # → none
ls plugins/cc/commands/ | wc -l                                                  # → 16

# SKILL.md drives the seams (two-call pattern present)
rg "evaluate .* --rubric .* --json" plugins/cc/skills/                           # → hits
rg "evolve .* --propose-only --json|evolve .* --ingest" plugins/cc/skills/        # → hits

# Personas defined
rg -i "scorer|author|skeptic|judge" plugins/cc/agents/                           # → hits

# Goal anchor passed verbatim (skill instructs not to summarise it)
rg -i "verbatim|do not summari|immutable.*anchor" plugins/cc/skills/ plugins/cc/agents/  # → hits
```
