# Phase 4 Design — The Quality Brain

> **One-line goal.** Close the *evaluation & evolution* gap for all five meta-agent skills by adding
> a **non-deterministic quality layer** — real LLM-driven scoring and content generation — while
> keeping the `superskill` CLI deterministic and the model intelligence in the agent / Spur layer.

## 0. Context & Problem Statement

Phases 1–3 built the *machinery*: scaffold / validate / evaluate / refine / evolve, a SQLite
evaluation+proposal store, a closed verify loop, and a thin `cc` plugin that delegates to the CLI.
What the machinery **cannot do today** is actually make a prompt better. Two stubs prove it:

| Stub | Location | What it does today |
|------|----------|--------------------|
| Content generation | `evolve.ts` → `generateChanges()` (~line 118) | Emits placeholder text: `"[Improve <dim>]: review and enhance the description…"` (the `[Improve` template ~line 127). No real rewrite. |
| Description "fix" | `evolve.ts` → `stepApply()` (~line 377) | Applies that placeholder via `applyChange`, then re-evaluates. "Evolution" inserts a TODO note. |
| Scoring | `evaluate.ts` → `EVALUATORS` map (~line 34) | Pure deterministic heuristics (keyword/regex counts). No semantic judgment of prompt quality. |

So `evolve` runs a real loop around fake content. Phase 4 replaces the fake parts with genuine
intelligence — without coupling the CLI to a model provider.

### Locked decisions (this phase)

| # | Decision | Rationale |
|---|----------|-----------|
| **P4-D1** | **Primary deliverable = the quality brain only.** Non-deterministic scoring + generation for all 5 meta skills. Restoring deleted verbs (`adapt`, `skill package/migrate`, hook `emit`) is **not** in Phase 4. | Focused, highest value-per-effort; the deterministic cleanup debt can wait. |
| **P4-D2** | **Agent/Spur orchestrates the non-determinism; the CLI stays deterministic.** The CLI does machinery (hashing, SQLite, proposal drafts, edits, verify) and exposes clean I/O seams. The `cc` skill + Spur agent personas drive LLM scoring/generation through those seams. | Keeps the CLI testable, provider-agnostic, no API keys in the binary. Realises the old §5.2 "machinery vs brain" split. |
| **P4-D3** | **Hide `validate` behind evaluate/refine/evolve** in `cc` (mirror `rd3`). `validate` stays a CLI verb used as an internal precondition gate; **no `*-validate` slash command**, and the transitional `hook-validate` (kept in Phase 3) is **removed here**. | *Dissolves* the Phase 3 §3.3 gap by hiding `validate` rather than adding four `*-validate` commands; fewer slash commands, no capability loss. |
| **P4-D4** | **Cross-platform hook redesign is deferred to Phase 5.** Problem statement + interface sketch recorded here (§6); built later. | It's a separate concern (CLI + `cc:cc-hooks` + per-agent shims) that would dilute the quality-brain focus. |

---

## 1. Architecture — Machinery vs. Brain

```
                 ┌─────────────────────────────────────────────┐
   user / agent  │            cc plugin  (cc:cc-<type>)         │
        │        │   SKILL.md workflow  +  expert-<type> agent  │
        ▼        └───────────────┬───────────────┬─────────────┘
   superskill CLI                │ (deterministic │ (non-deterministic
   (deterministic)               │  verbs)        │  scoring/generation)
        │                        ▼                ▼
        │              ┌──────────────────┐  ┌──────────────────────────┐
        │              │ superskill CLI   │  │  Spur agent personas      │
        │              │ scaffold/validate│  │  - Scorer (rubric judge)  │
        │              │ evaluate/refine/ │  │  - Author (rewriter)      │
        │              │ evolve           │  │  - Skeptic (refuter)      │
        │              └────────┬─────────┘  │  - Judge (tournament)     │
        │                       │            └────────────┬──────────────┘
        ▼                       ▼                         │
   SQLite store  ◄──────────────┴── proposal/eval I/O ◄───┘
   (.superskill/*.db)        (JSON in / JSON out)
```

**Invariant (carried from `03_ARCHITECTURE.md`):** the CLI never calls a model API. All
non-deterministic work is performed by the orchestrating agent and **fed into** the CLI as data.

---

## 2. The Two Seams (how the brain plugs into the machinery)

The current code already exposes the right shapes. Phase 4 formalises two seams.

### 2.1 Scorer seam — non-deterministic evaluation

Today `EVALUATORS` maps each type to a deterministic `(content, target) => QualityReport`. Phase 4
introduces a **scorer mode** producing the *same* `QualityReport` shape so everything downstream
(trends, proposals, verify) is unchanged.

| Mode | Who runs it | Output |
|------|-------------|--------|
| `heuristic` (default, exists) | CLI | deterministic `QualityReport` |
| `rubric` (new) | agent/Spur Scorer persona → CLI ingests | LLM-judged `QualityReport` against a versioned rubric |

**CLI contribution (deterministic):**
- `superskill <type> evaluate <name> --rubric <file> --json` emits the *rubric definition* + the
  content + the deterministic baseline as a single JSON envelope for the agent to score.
- `superskill <type> evaluate <name> --ingest <scores.json> --save` validates an
  agent-produced score set against the rubric schema and persists it as an `evaluation` row
  (operation tagged `evaluate`, with a `scorer: rubric` marker).

**Why an envelope, not a direct call:** keeps determinism, lets the rubric version travel with the
score, and makes the agent step replayable/testable from fixtures.

### 2.2 Generation seam — non-deterministic content rewrite

Replace the `generateChanges` placeholder. `ProposedChange` already carries
`{ location, current, proposed, reason }` and `applyChange` already does real text replacement — the
only fake part is *where `proposed` comes from*.

| Mode | Who runs it | `ProposedChange.proposed` |
|------|-------------|---------------------------|
| `placeholder` (current) | CLI | TODO note (to be removed) |
| `authored` (new) | agent/Spur Author persona → CLI ingests | real rewritten text |

**CLI contribution (deterministic):**
- `superskill <type> evolve <name> --propose-only --json` emits trends + baseline report +
  per-dimension *generation briefs* (which dimension, current text, target rubric criterion) — a
  work order for the Author persona.
- `superskill <type> evolve <name> --ingest <proposal.json>` accepts agent-authored
  `ProposedChange[]`, persists the proposal, applies on accept, runs the existing verify loop.

> [!IMPORTANT]
> **Goal anchoring (anti-drift).** The generation brief always includes the original frontmatter,
> the relevant rubric criteria, and the immutable negative constraints (DON'T rules). The CLI emits
> them verbatim; the agent must not summarise or drop them. This addresses goal-drift from the old §5.4.

---

## 3. The Rubric (the fitness function)

A **versioned, upgradeable** config — *not* CLI code — so scoring criteria iterate without
re-releasing the binary (old §5.1 "Extension" requirement).

### 3.1 Unified shape (all five types)

```yaml
# .superskill/rubrics/<type>.yaml   (user-overridable; package ships defaults)
version: 1
type: agent
dimensions:
  - name: role-clarity
    weight: 0.25
    criterion: >
      Does the body define a specific, non-generic persona with a clear scope?
      Penalize "helpful assistant" framing and vague responsibilities.
    anchors:                 # few-shot calibration for the Scorer persona
      excellent: "…example of a 0.9–1.0 body…"
      poor: "…example of a 0.2–0.4 body…"
  - name: trigger-accuracy
    weight: 0.20
    criterion: …
```

- **Same four columns everywhere** — Dimensions, Weights, Score, Note/Rationale — per the old §5.2
  "unified shape" requirement, so users learn one structure.
- Dimension *names* reuse the existing `DIMENSION_REGISTRY` keys (`dimensions.ts:50`) so heuristic
  and rubric scores are directly comparable in the store.
- Weights make the aggregate a **weighted** mean for rubric mode (heuristic stays equal-weighted;
  the `scorer` marker on the row disambiguates).

### 3.2 Versioning & storage

- Rubric `version` is stamped onto each `evaluation` row (new column or in the `dimensions` JSON).
- Trend analysis (`computeTrends`) must only compare scores from the **same rubric version**, or
  flag a version boundary, so a rubric change doesn't masquerade as a quality regression.

---

## 4. Adversarial & Anti-Loop Safeguards

Carried from old §5.4, scoped to what's needed for safe self-evolution. All run as Spur agent
personas (P4-D2); the CLI only gates on their structured output.

1. **Skeptic / Refuter** — every authored proposal is passed to an independent persona with a
   skeptic prompt + strict rubric to find flaws/omissions before apply.
2. **Tournament selection** — when the Author emits multiple candidate rewrites, a Judge persona
   does pairwise comparison (more reliable than absolute scoring). Winner is the applied proposal.
3. **Immutable goal anchoring** — Skeptic and Judge always receive the original instructions, rules,
   and negative constraints verbatim (see §2.2). Compaction of this anchor is prohibited.
4. **Double-loop gate** (enforced by the CLI on ingest):
   - **Deterministic gate:** the rewritten file passes `validate` with zero errors.
   - **Non-deterministic gate:** post-evolution aggregate exceeds baseline by a configurable margin
     (default Δ ≥ 0.05) **and** no invariant/anchor violation reported by the Skeptic.
     Failing either gate → proposal stays `draft`, file is restored, no silent acceptance.

> The existing closed-loop verify (`evolve.ts:427` `stepVerify`) already records the post-eval row;
> Phase 4 adds the gate decision and a reject-on-regression path.

---

## 5. Scope by Deliverable

### 5.1 In scope (Phase 4)

- [ ] **Rubric config format** + package-default rubrics for all 5 types; user override resolution.
- [ ] **Scorer seam:** `evaluate --rubric`/`--ingest` envelope I/O; rubric-version stamping; weighted aggregate; `scorer` marker.
- [ ] **Generation seam:** replace `generateChanges` placeholder; `evolve --propose-only --json` generation briefs; `evolve --ingest` for authored proposals.
- [ ] **Double-loop gate** on ingest (validate-zero-errors + Δ-margin + anchor check) with reject-on-regression / restore.
- [ ] **`cc` skill + Spur personas:** Scorer, Author, Skeptic, Judge; wire `cc:cc-<type>` workflows to drive the seams; remove the deterministic-only framing from SKILL.md.
- [ ] **D3 — hide `validate`:** remove the transitional `hook-validate` command (Phase 3 carry); confirm no `*-validate` slash command for any type; ensure evaluate/refine/evolve gate on validate internally for all 5 types.
- [ ] **Tests:** fixture-driven (record agent score/proposal JSON, replay through CLI ingest) so the non-deterministic layer is testable without live model calls; ≥90% line/function coverage maintained.

### 5.2 Explicitly out of scope

- Restoring `adapt` / `skill package` / `skill migrate` / hook `emit` (Phase 5+ backlog from Phase 3 §7).
- Cross-platform hook redesign (Phase 5 — §6 below).
- New content *types* beyond the existing five.

---

## 6. Deferred to Phase 5 — Cross-Platform Hook System (decision recorded)

**Problem.** Most coding agents now support hooks, but with divergent event names, payload shapes,
matchers, and config locations. Today `cc:cc-hooks` carried bash emitters + an abstract-hook schema
(deleted in Phase 3 §5). We want **one hook definition → all supported agents**.

**Shape of the eventual solution** (not built in Phase 4):
- **CLI side:** an abstract-hook schema + `superskill hook emit --target <agent>` that compiles one
  canonical definition into each agent's native config (event-map + tool-map per agent).
- **`cc:cc-hooks` side:** authoring workflow that produces the canonical definition; validate/lint
  against the schema; `evaluate`/`evolve` reuse the Phase 4 quality brain.
- **Per-agent shims:** the emitter adapters (the deleted `emitters/*.sh` become CLI emit targets).

**Why deferred:** it spans CLI + skill + N agent adapters and is orthogonal to the quality brain.
Recorded so the Phase 3 deletion of hook machinery is a tracked debt, not a silent loss.

---

## 7. Verification & Exit Criteria

1. `superskill <type> evolve <name>` produces a **real** rewritten file (no placeholder text in
   output), for all five types, driven by the rubric.
2. A rubric edit changes scores **without** a CLI rebuild (config-only iteration proven).
3. The double-loop gate rejects a deliberately regressive proposal (test fixture) and restores the file.
4. Trend analysis does not flag a rubric-version change as a quality regression.
5. No `*-validate` slash command exists; evaluate/refine/evolve still gate on validation.
6. Fixture-replay tests cover the Scorer/Author/Skeptic/Judge ingest paths; CLI makes no model API call.
7. Root gate green: `bun run lint`, `bun run test`, `bun run build`; ≥90% coverage; `git status` clean.

---

## 8. Invariants

1. **CLI is deterministic.** No model API call originates in `superskill`; intelligence enters as ingested data (P4-D2).
2. **One report shape.** Heuristic and rubric scoring both produce `QualityReport`; downstream code is mode-agnostic.
3. **Rubric is config, not code.** Scoring criteria/weights iterate without releasing the binary.
4. **Version-aware trends.** Scores are only compared within the same rubric version.
5. **Gated acceptance.** No proposal is applied unless it passes both the deterministic and non-deterministic gates; regressions restore the original.
6. **Goal anchor is immutable.** Original instructions + negative constraints travel verbatim to every adversarial persona; never summarised away.
