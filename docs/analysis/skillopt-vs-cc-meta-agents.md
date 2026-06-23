# SkillOpt vs. our `cc-*` meta-agent skills — comparative code review & adoption analysis

> **Status:** analysis only — no code changed.
> **Date:** 2026-06-22
> **Reviewer:** Lord Robb (code review of `vendors/SkillOpt` + `plugins/cc/skills/cc-*` + `apps/cli` / `packages/core`)
> **Scope:** What SkillOpt is, how it differs from our meta-agent toolkit, where its real advantages lie, and what (if anything) we can absorb into the current architecture.

---

## 0. TL;DR (read this first)

SkillOpt and our `cc-*` system **look similar and are actually solving different problems**, so the
overlap is smaller than the surface suggests.

- **SkillOpt** answers *"is this skill document making the agent get tasks **right**?"* — it
  measures **empirical task outcomes** (replay real tasks, score against a checkable reference,
  accept an edit only if a **held-out task score** strictly improves). It is an **optimizer with a
  closed feedback loop grounded in execution**.
- **Our `cc-*` system** answers *"is this skill document **well-authored and portable**?"* — it
  measures **static document quality** (heuristic + rubric scores: required fields, imperative-vs-vague
  density, trigger-phrase count, citation resolution, conciseness) and distributes one source of truth
  across 15 platforms. It is an **authoring / lifecycle / distribution toolkit with a quality gate
  grounded in document structure**.

**The single most important difference:** SkillOpt's gate is keyed on *what the skill does to task
success*; ours is keyed on *what the skill looks like as a document*. SkillOpt closes the loop on
**behavior**; we close the loop on **form**.

**The one advantage genuinely worth absorbing** is the **execution-grounded validation gate** — the
idea that a self-evolution proposal should be accepted because it **demonstrably improved a measured
outcome on held-out cases**, not because a heuristic score went up. Our `evolve` double-loop gate is
architecturally *ready* for this (it already has a pluggable `runGate`, a baseline→post delta, backup/
restore, and a staging/proposal model) but its scoring substrate is static. The rest of SkillOpt
(RL training core, multi-backend rollout, six research benchmarks, the "DL analogy") is **out of scope
for an authoring CLI** and should not be ported.

---

## 1. What each system actually is

### 1.1 SkillOpt — two distinct subsystems

`vendors/SkillOpt` is a **Microsoft Research** Python project (MIT, arXiv 2605.23904) with **two
loosely-coupled halves**:

| Subsystem | Path | Purpose | Comparable to us? |
|---|---|---|---|
| **`skillopt`** (the paper) | `skillopt/` | RL-style **training loop** that optimizes a skill `.md` like NN weights: `rollout → reflect → aggregate → select → update → gate`, with epochs, learning-rate, LR scheduler, slow/meta updates. Six benchmarks (SearchQA, SpreadsheetBench, AlfWorld, DocVQA, OfficeQA, LiveMath), seven target models, multi-backend (OpenAI/Azure/Claude/Qwen/MiniMax/Codex). | **No** — this is a research training harness, not an authoring tool. |
| **`skillopt_sleep`** (preview) | `skillopt_sleep/` | **Deployment-time companion**: a nightly "sleep cycle" for a local Claude Code / Codex / Copilot agent — `harvest sessions → mine recurring tasks → replay offline → consolidate (gated) → stage → adopt`. Zero dependency on the paper's `skillopt/` (the gate is vendored). | **Yes** — this is the part that overlaps our `evolve`/`refine`. |

The **"DL analogy"** (`docs/guide/dl-analogy.md`) is the framing the paper sells: skill document =
weights, rollout = forward pass, reflect = backprop, edit patches = gradients, `learning_rate` = max
edits/step, gate = validation set, slow update = momentum, meta skill = meta-learning. It is a clean
mental model, but it is **a metaphor for the optimization schedule**, not a new mechanism — the
operative mechanism is "propose bounded text edits, keep only what passes a held-out gate."

### 1.2 Our `cc-*` meta-agent skills

Our system (`plugins/cc/skills/cc-{skills,agents,commands,magents,hooks}` + the `superskill` CLI in
`apps/cli` / `packages/core`) is a **cross-platform authoring, validation, and distribution toolkit**.
Each content type supports a **5-operation lifecycle**:

```
scaffold → validate → evaluate → refine → evolve
```

- **scaffold** (`packages/core/src/operations/scaffold.ts`) — template-driven creation; the scaffolded
  artifact must PASS its own evaluator (regression-enforced).
- **validate** (`packages/core/src/operations/validate.ts`) — structural + target-aware checks.
- **evaluate** (`apps/cli/src/operations/evaluate.ts` + `packages/core/src/quality/*`) — **heuristic +
  rubric** scoring across ~5 dimensions per type (`packages/core/src/rubrics/<type>.yaml`), with a
  two-call **Scorer** seam (envelope-out → LLM persona scores → ingest-in).
- **refine** (`apps/cli/src/operations/refine.ts`) — deterministic auto-fixes + suggestions.
- **evolve** (`apps/cli/src/operations/evolve.ts`) — longitudinal, history-driven proposals with a
  **double-loop gate** (deterministic validate + Δ-margin + anchor-hash + Skeptic veto), proposal
  history, version snapshots, and rollback.

The north-star is the **"fat skills, thin wrappers"** distribution model (`cc-skills/SKILL.md` §Core
Principles): ONE `SKILL.md` source of truth, adapted to 15 platforms via rulesync, with commands and
subagents downgraded to skill directories for uniform coverage (ADR-010/0044/0045).

---

## 2. Similarities (where the two genuinely rhyme)

These are real and worth noting — they explain why the comparison is natural.

| Concept | SkillOpt-Sleep | Our `cc-*` |
|---|---|---|
| **Skill = trainable text** | The `SKILL.md` / `CLAUDE.md` is the unit being improved. | The `SKILL.md` / agent / command / config is the unit being improved. |
| **Bounded edits** | `edit_budget` caps add/delete/replace edits per night (`consolidate.py`). | Proposals carry a finite `ProposedChange[]`; refine applies discrete auto-fixes. |
| **Validation gate before accept** | `evaluate_gate` accepts only if candidate score `>` current (`skillopt_sleep/gate.py`). | `runGate` accepts only if Δ ≥ margin **and** deterministic validate passes **and** anchor matches **and** Skeptic doesn't veto (`evolve.ts:383`). |
| **Rejected edits are kept** | Rejected edits go to a negative-feedback buffer (paper's rejected-edit buffer). | Rejected proposals stay `draft`; the file is restored byte-identical from backup (`evolve.ts:940`). |
| **Propose → review → adopt safety** | Stage to `.skillopt-sleep/staging/<date>/`; nothing live mutates until explicit `adopt` (Dreams contract). | Proposal files + version snapshots; `--accept <id>` is explicit; backup on every apply. |
| **Two-phase: deterministic plumbing + LLM judgment** | `mock` backend (deterministic, CI-able) vs `claude`/`codex` backend (real lift). | Heuristic path (deterministic) vs two-call persona seam (Scorer / Author→Skeptic→Judge). |
| **History / longitudinal memory** | `~/.skillopt-sleep/state.json`: night counter, task archive, slow/meta memory. | SQLite evaluation history; `computeTrends` over time; version snapshots for rollback. |
| **Claude Code plugin surface** | `plugins/claude-code/`: `plugin.json`, `/skillopt-sleep` command, `SKILL.md`, hooks, scripts. | `plugins/cc/`: `plugin.json`, slash commands, `cc-*` skills, hooks, scripts. |

The architectural *shapes* are close enough that an engineer skimming both would assume they're
competitors. They are not — they diverge precisely at the gate's scoring substrate.

---

## 3. Differences (where they diverge — this is the heart of it)

### 3.1 The decisive difference: signal source

| | SkillOpt-Sleep | Our `cc-*` |
|---|---|---|
| **What the gate scores** | **Task outcome** — replay real mined tasks, score each against a **checkable reference** (exact-match, rule judge, or LLM-judge rubric), aggregate `(hard, soft)` over a **held-out slice** (`replay.py`, `consolidate.py`). | **Document quality** — heuristic dimension scores on the document text itself: required-field presence, imperative-vs-vague keyword density, trigger-phrase count, verification-language density, body length (`packages/core/src/quality/heuristics.ts`, `skill.ts`). |
| **"Better" means** | The agent **gets more tasks right** with the new skill. | The document **looks more like a well-formed skill** (better structure, clearer triggers, resolved citations). |
| **Ground truth** | The user's own recurring tasks + outcome labels mined from feedback ("still broken" → fail; "works now" → success) (`harvest.py` feedback phrases). | The rubric criteria authored in `packages/core/src/rubrics/<type>.yaml` + static content heuristics. |
| **Failure mode it prevents** | Behavioral regression (an edit that *reads* better but makes the agent perform *worse*). | Authoring drift (a skill that's structurally malformed, has dead citations, or won't trigger reliably). |
| **Failure mode it CANNOT catch** | Authoring/portability defects (it doesn't care if the skill is portable or well-cited). | Behavioral regression (a higher heuristic score does **not** imply the agent performs better). |

This is the whole ballgame. **SkillOpt proves an edit helps by running it; we infer an edit helps by
scoring its prose.** Neither is wrong — they're tuned for different jobs (continual self-improvement of
one user's live agent vs. multi-platform authoring of distributable skills).

### 3.2 Other structural differences

| Dimension | SkillOpt | Our `cc-*` |
|---|---|---|
| **Primary job** | Continual *self-improvement* of a deployed agent's skill/memory from usage. | *Authoring + validation + distribution* of skills/agents/commands/configs across platforms. |
| **Cross-platform** | Three thin per-agent shells (`claude-code`, `codex`, `copilot`) over one engine; per-platform install scripts. | 15 platforms via rulesync; capability-aware adapt; downgrade-to-skills for uniform coverage. |
| **Data it consumes** | The user's real `~/.claude` transcripts + `history.jsonl` (privacy-sensitive, local-only). | The content file under edit + its evaluation history in SQLite. No transcript harvesting. |
| **Cost model** | Spends the user's LLM budget every night (replay + reflect + judge are all model calls). | Mostly deterministic (heuristics free); LLM only in the optional persona seam. |
| **Content types** | Skill (`SKILL.md`) + memory (`CLAUDE.md`). Two. | Skill, agent, command, magent (CLAUDE/AGENTS/GEMINI), hook. Five. |
| **Language / stack** | Python 3.10+, pip, pytest, Gradio WebUI. | Bun + TypeScript + Biome + Turborepo. |
| **Maturity of the comparable part** | `skillopt_sleep` is explicitly **preview** ("interfaces and defaults may change"). | `cc-*` lifecycle is shipped, test-gated (90/90 coverage), and ADR-governed. |
| **Memory consolidation** | First-class: dedup/merge/contradiction-resolution over `CLAUDE.md` (Dreams-style), gated. | Not a feature — we don't consolidate project memory; `magent` evolve edits config text, not usage-derived memory. |
| **Scheduling** | Built-in cron/`schedule` + on-session-end harvest hook. | None — operations are invoked on demand. |

---

## 4. SkillOpt's advantages — and *why* each one holds

Ranked by relevance to us.

### A. Execution-grounded validation gate (the crown jewel) — **HIGH relevance**

**What:** an edit is accepted only if **replaying held-out tasks with the candidate skill scores
strictly higher** than with the current skill (`consolidate.py:_gate_apply` → `evaluate_gate`).

**Why it's strong:** it ties self-evolution to **observable behavior**. A heuristic can be gamed
(stuff in imperative keywords, hit the trigger-count sweet spot) without the agent actually performing
better. SkillOpt's gate is **un-gameable in the way that matters** — the only way to pass is to make
the agent succeed on real held-out tasks. This is the same reason validation-set early-stopping beats
training-loss minimization in DL: it measures generalization, not fit-to-proxy.

**Why it's credible:** the paper reports best/tied-best on all 52 (model, benchmark, harness) cells and
+19–25 pt lifts; the sleep preview shows deficient seeds going 0.00→1.00 on held-out sets and
monotonic gains with more recalled experience (`docs/sleep/README.md` results table). The gate is the
mechanism behind "the worst case is bounded."

### B. Mining a checkable signal from real usage — **MEDIUM relevance**

**What:** `harvest.py` + `mine.py` turn raw transcripts into `TaskRecord`s with **outcome labels** and,
where possible, **checkable references** — using user-feedback phrases ("still broken", "works now"),
self-consistency, or an LLM-judge rubric.

**Why it's strong:** it manufactures a supervised signal **where none was explicitly provided**. The
agent learns *this user's* recurring work without the user writing eval sets. The feedback-phrase
heuristic (`_NEGATIVE_FEEDBACK` / `_POSITIVE_FEEDBACK`, env-extensible) is a cheap, surprisingly
effective label source.

**Why it's bounded:** honest scope is stated plainly — gains hold **only where tasks recur and have a
checkable correctness signal**; on saturated/noisy benchmarks the effect is flat within noise. This is
the right kind of honesty and it constrains where the advantage applies.

### C. Experience replay + associative recall — **LOW–MEDIUM relevance**

**What:** `dream.py` opt-in knobs — `recall_k` pulls the K most lexically-similar past tasks into
tonight's training pool; `dream_rollouts` runs each task K times for contrastive reflection;
`dream_factor` adds synthetic variants. All default OFF.

**Why it's strong:** the results show the gain rises **monotonically** with how much relevant past
experience is recalled (+3.1 → +4.5 → +5.6 as `recall_k` grows). It's a clean instance of "long-term
memory improves consolidation" with measured payoff. Recalled/dreamed tasks only enlarge the **train**
split — the val slice the gate scores on is never polluted (a careful, correct design choice).

### D. The DL-analogy as a tuning interface — **LOW relevance (mostly pedagogical)**

**What:** exposing `learning_rate`, `lr_scheduler` (cosine/linear/constant), `batch_size`, epochs,
slow update (momentum), meta skill (meta-learning).

**Why it's strong:** it gives ML practitioners a **familiar hyperparameter surface** and a principled
grid to search. "Cosine > constant," "moderate LR > extreme" transfer from DL intuition.

**Why it's mostly irrelevant to us:** this is the scheduling layer of a **batch training run over a
benchmark**. An authoring CLI evolves one document on demand, not over epochs of a labeled dataset.
The analogy is elegant but it's solving a problem we don't have.

### E. Safety/staging model — **already matched**

Read-only harvest, stage-then-adopt, backup-before-mutate, budget caps, secret redaction
(`design §7`). All sound — and we **already have the equivalent** (backup/restore, draft-on-reject,
proposal files, version snapshots). No net advantage here; parity.

---

## 5. Can we absorb these into our architecture? (the actionable part)

Our architecture is **well-positioned** to absorb the *interface* of the crown-jewel advantage because
`evolve.ts` already has the right seams:

- a pluggable gate (`runGate`, `evolve.ts:383`) evaluated in order with named failures,
- a baseline→post **delta** with a configurable `--margin`,
- backup → apply → verify → restore-on-fail lifecycle,
- a proposal/version store with history + rollback,
- an envelope-out / ingest-in two-call seam for LLM-driven steps.

What's missing is **only the substrate**: our `postScore`/`baselineScore` come from a **static document
evaluator** (`evaluate()` → heuristic dimensions), not from **replaying tasks**. That's the gap.

### Verdict per advantage

| Advantage | Absorb? | How / Why-not |
|---|---|---|
| **A. Execution-grounded gate** | **Yes — as an optional, opt-in gate, not a replacement.** | See §5.1. Add an *empirical* gate alongside the static one; keep static as default. |
| **B. Usage-mined checkable signal** | **Partial — out of core scope; viable as a separate optional capability.** | See §5.2. Harvesting `~/.claude` transcripts is a different product surface (privacy, scheduling, cost). Don't fold into the authoring CLI core; consider a discrete opt-in module. |
| **C. Experience replay / recall** | **No (now).** | Depends on (B) existing first. Premature. Revisit only if (B) ships. |
| **D. DL-analogy hyperparameters** | **No.** | Solves batch-training-over-a-benchmark; we evolve one doc on demand. Importing epochs/LR is over-engineering (R2). |
| **E. Safety/staging** | **No need.** | Already at parity. |

### 5.1 How to absorb (A) — the execution-grounded gate

**Design sketch (additive, opt-in, zero change to default behavior):**

1. **New gate stage in `runGate`.** Add a fifth, *optional* gate: `empirical`. It runs only when the
   caller supplies an **eval set** for the content (a small set of `{prompt, checkable_reference}`
   cases attached to the skill, e.g. `skills/<name>/eval/cases.jsonl`). When absent, the gate is
   skipped (exactly like today's anchor gate skips when no `anchor_hash` is supplied — same pattern,
   `evolve.ts:406`).
2. **The empirical score replaces the static `postScore` only inside this gate.** Replay each case
   against the candidate document (one model call per case via the existing persona/backend seam),
   score against the reference (exact-match / rubric-judge), aggregate, and require
   `candidate_score > baseline_score` (mirror `evaluate_gate`'s strict-improve). Keep the static
   Δ-margin gate as a **separate, still-active** gate so a change must be *both* well-formed *and*
   behavior-improving when an eval set exists.
3. **Vendor nothing.** SkillOpt's gate is ~15 lines of pure decision logic (`gate.py`); we already
   have the equivalent shape. Re-implement the strict-improve comparison in TS — do not take a Python
   dependency.

**Why this fits our constitution:**
- It's **surgical** (R3): one new gate, opt-in, no change when no eval set is present.
- It **closes the loop on behavior** for skills that opt in, which is the one thing our static gate
  structurally cannot do.
- It reuses the **existing two-call seam** for the model calls (envelope-out the cases → persona
  replays → ingest scores), so it stays consistent with how we already separate deterministic CLI from
  LLM judgment.
- It keeps **default cost at zero** — no eval set, no model calls, behavior unchanged. Opt-in cost only.

**Cost/risk:** an eval set per skill is real authoring overhead, and replay spends tokens. That's why
it must be opt-in and scoped to skills where recurrence + a checkable signal exist (SkillOpt's own
honest-scope caveat applies to us verbatim). This is a **capability for high-value, frequently-run
skills**, not a default for every `evolve`.

### 5.2 How to (maybe) absorb (B) — usage-mined signal

This is the larger, more speculative move. It is **architecturally foreign to the authoring CLI**:
harvesting `~/.claude` transcripts introduces privacy surface, scheduling, and per-night LLM cost —
none of which belong in `superskill skill evolve`. If we want it, it should be a **separate opt-in
surface** (its own command namespace, its own config, its own consent model), feeding *eval cases*
into the (A) gate rather than mutating documents directly. Recommend **deferring** until (A) proves
its worth on hand-authored eval sets; (B) is then "where do the eval cases come from automatically,"
which is a clean follow-on rather than a prerequisite.

---

## 6. Recommendation

1. **Absorb (A), opt-in, additively.** Add an optional `empirical` gate to `evolve`'s `runGate`,
   driven by a per-skill eval set, scored by replay-against-reference, requiring strict improvement —
   layered *on top of* (not replacing) the static Δ-margin gate. This imports SkillOpt's one
   genuinely differentiating idea — **evolution gated on measured behavior** — into the seam our
   architecture already exposes, at zero default cost. *Recommend prototyping behind a flag; do not
   ship to the default path until validated on a real skill.*

2. **Do not port the SkillOpt training core, the DL-analogy hyperparameters, or the six benchmarks.**
   They solve batch optimization over labeled datasets — a problem an authoring/distribution CLI does
   not have. Porting them would be textbook over-engineering (R2) and would dilute the "fat skills,
   thin wrappers" focus.

3. **Treat usage-mined signal (B/C) as a separate, deferred product surface.** Privacy, scheduling,
   and cost make transcript harvesting a poor fit for the core CLI. If pursued, build it as a discrete
   opt-in module that *feeds eval cases into the (A) gate*, never as a default behavior of `evolve`.

4. **Keep our genuine edges.** We are ahead on **multi-platform distribution** (15 targets vs 3),
   **content-type breadth** (5 vs 2), **deterministic-by-default cost**, and **shipped maturity /
   test-gating**. SkillOpt's sleep companion is explicitly preview. Our static gate plus an opt-in
   empirical gate would give us **both** "well-authored & portable" *and* "demonstrably improves
   behavior" — a strictly larger guarantee than either system offers alone.

---

## Appendix — key source references

**SkillOpt (vendored, read-only):**
- Concept & DL analogy: `vendors/SkillOpt/docs/guide/training-loop.md`, `docs/guide/dl-analogy.md`
- Sleep companion design: `vendors/SkillOpt/docs/superpowers/specs/2026-06-07-skillopt-sleep-claude-code-plugin-design.md`
- Nightly cycle orchestration: `vendors/SkillOpt/skillopt_sleep/cycle.py`
- Gated consolidation epoch: `vendors/SkillOpt/skillopt_sleep/consolidate.py`
- Validation gate (the crown jewel, ~15 lines): `vendors/SkillOpt/skillopt_sleep/gate.py`
- Replay → (hard, soft) signal: `vendors/SkillOpt/skillopt_sleep/replay.py`
- Harvest (feedback-phrase labels): `vendors/SkillOpt/skillopt_sleep/harvest.py`
- Dream / recall opt-in knobs: `vendors/SkillOpt/skillopt_sleep/dream.py`
- Claude Code plugin SKILL: `vendors/SkillOpt/plugins/claude-code/skills/skillopt-sleep/SKILL.md`

**Our `cc-*` system:**
- Evolve engine + double-loop gate: `apps/cli/src/operations/evolve.ts` (`runGate` at `:383`)
- Evaluate engine: `apps/cli/src/operations/evaluate.ts`
- Static quality heuristics: `packages/core/src/quality/heuristics.ts`, `quality/skill.ts`
- Rubrics (dimension source of truth): `packages/core/src/rubrics/<type>.yaml`
- Skill authoring source of truth: `plugins/cc/skills/cc-skills/SKILL.md`
- Architecture & decisions: `docs/03_ARCHITECTURE.md`, `docs/00_ADR.md`
</content>
</invoke>
