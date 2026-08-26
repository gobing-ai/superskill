---
title: "Absorb skill-doctor usage loop into cc-skills"
date: 2026-08-26
topic: cc-skills-vendor-absorption
run_id: c6ef217a-9a79-4025-9790-10ab64e79177
needs_design: true
design_status: pending_operator_review
recommended_approach: staged-absorb-two-planes
---

# Brainstorm: Absorb skill-doctor / update-skill into `cc-skills`

**Date:** 2026-08-26

## Overview

`plugins/cc/skills/cc-skills` already owns skill authoring, static evaluation, and a persona-driven evolve loop. The vendor skills `update-skill` and `skill-doctor` were reviewed in a verified grounding brief. `update-skill` is already absorbed into `references/best-practices.md` except two one-line gaps. `skill-doctor` is the real delta: our `evaluate` scores static SKILL.md text, and our `evolve` trends only the history of those static scores. There is no real-session feedback loop.

The four candidate absorptions are not one build. The cheapest, highest-ratio item is the "when NOT to propose a change" bar, wired into Author/Skeptic briefs and the evolve workflow. Scorer-rubric craft (labeled bands, evidence-citing notes) tightens the existing Scorer seam. Usage-grounded evolve and `skill_coverage` need a transcript source this repository does not ship — `spur history` / `sp:history-anatomy` live in the sibling spur product, not here. Do not re-import `update-skill`. Do not import the HTML report, PNG export, or Warp CTA. Do not add `scripts/` inside the skill folder.

This artifact records approaches, a design summary, and `needs_design: true`. It does not create a feature or tasks.

## Targeted Evidence Audit

Inspection was limited to claims the grounding brief marked as load-bearing. Vendor trees were read, not modified.

| Claim | Verified finding | Implication |
| --- | --- | --- |
| `update-skill` already absorbed | Grounding grep stands. Remaining gaps: over-structuring (`vendors/common-skills/.agents/skills/update-skill/references/best-practices.md` "Over-Structuring Simple Skills") vs our inverse-only `red-flags.md` §10; iteration "only add what's proven necessary through real usage" vs our `best-practices.md` feedback loop, which is a validator loop, not a usage-proof rule. | Two replace-in-place prose edits. No new reference file. |
| `evolve` has no usage input | `addEvolveOptions` exposes `--from`, `--analyze`, `--history`, `--rollback`, `--ingest`, `--eval-gate`. `generateChanges()` iterates `TrendEntry[]` from evaluation rows only. `--analyze` lists `evaluation-history` and a `.git` presence check; git is not a scored signal. | Confirming the loop gap. `--eval-gate` is a *different* usage-adjacent path (authored `eval/cases.yaml` holdouts), not real transcripts. |
| `trigger-accuracy` is a static proxy | `packages/core/src/quality/skill.ts` `scoreTriggerAccuracy` counts distinct trigger *branches* in description/body. Rubric criterion in `skill.yaml` is the same static question. `evaluation-framework.md` still says "Counts trigger phrases" (stale vs branch-counting). | Observed firing rate is ground truth this dimension approximates. Do not pretend phrase-counting *is* coverage. |
| `spur history` already in this repo | **False for superskill.** No `history import` / `history analyze` in this tree. Those verbs, plus `sp:history-anatomy` (interpretation-only over already-imported history) and `sp:issue-finding`, live in spur-new. `history-anatomy` never reprocesses raw session files. | Wave C is a source spike first, not "wire the in-repo history module." A spur dependency is cross-product, not an in-tree extension. |
| Author/Skeptic never ask "is a change warranted" | Evolve gate = validate-zero-errors + Δ-margin + `anchor_hash` + Skeptic veto (`SkepticVerdict { ok, violations[] }`). Briefs are per-dimension rewrite work-orders (`GenerationBrief`). Workflows.md evolve step 3 reviews proposals for match/redundancy/order, not the skill-doctor filing bar. | Item 3 is a persona + workflow prose change on the existing seam. Cheapest, highest ratio. |
| Scorer notes may be bare | `ScoresJson` types `note: string`, but `ingestScores` only checks dimension set + score in `[0,1]`. Empty or non-citing notes persist. `skill.yaml` has `excellent`/`poor` anchors, not labeled numeric bands. No `insufficient_evidence` exclusion in `computeWeightedAggregate`. | Item 4 is rubric-criterion + Scorer-contract + optional ingest presence check. `insufficient_evidence` belongs on a *usage* scoring plane, not static SKILL.md evaluate (the artifact is always present). |
| cc-skills is prose-only | `SKILL.md` directory contract, `validate` `_layout` error, ADR-015/024. `plugins/cc/scripts/` currently holds only `anti-hallucination/`. | Any collector/scorer executable goes at `plugins/cc/scripts/<feature>/`. No `scripts/` inside `cc-skills`. |
| Privacy / out of scope | skill-doctor: "Everything runs locally. Never upload transcripts…" HTML render, share-as-PNG, `cta_url`, mandated Warp closing boilerplate are vendor surface. | If Wave C lands, privacy is mandatory boilerplate. HTML/PNG/CTA stay out. |

**Verified:** 2026-08-26 against:

- Grounding brief `.spur/run/idea-grounding-cc-skills.md`
- `plugins/cc/skills/cc-skills/SKILL.md`, `references/{workflows,evaluation-framework,red-flags,best-practices}.md`
- `apps/cli/src/commands/helpers.ts` (`addEvolveOptions`)
- `apps/cli/src/operations/evolve.ts` (`generateChanges`, `GenerationBrief`, `SkepticVerdict`, `formatAnalyze`)
- `apps/cli/src/operations/evaluate.ts` (`ingestScores`, `ScoresJson`)
- `packages/core/src/rubrics/skill.yaml`, `packages/core/src/quality/skill.ts` (`scoreTriggerAccuracy`)
- `plugins/cc/agents/expert-skill.md`
- `vendors/common-skills/.agents/skills/{skill-doctor,update-skill}/` (read-only)
- `docs/00_ADR.md` ADR-015 / ADR-024; `docs/05_FEATURES.md` G26/G33/G34/G35
- Sibling spur-new `plugins/sp/skills/history-anatomy/SKILL.md` (existence + interpretation-only contract)

No subprocess research escalation. Verification ran inline against primary sources in this session.

### Scope check (wayfinding)

Destination is clear: absorb the named deltas into cc-skills / the existing quality seams, not invent a new doctor product. The only fog is Wave C's transcript source, and that is a gated spike, not a multi-session map. Standard ideation suffices; do not escalate to `sp:wayfinder`.

## Approaches

### Approach 1: Staged absorb on two scoring planes ⭐ Recommended

**Description:** Keep static evaluate and real-usage feedback as separate planes. Ship the prose and Scorer-contract deltas now by *replacing* existing guidance. Defer transcript-backed evolve until a source spike names an in-tree or explicit cross-product input. Do not stand up a parallel skill-doctor engine. Do not re-import `update-skill`.

**Wave A — warrant bar + two update-skill gaps (prose, this feature).** Replace, do not append:

- Author/Skeptic contracts in `plugins/cc/skills/cc-skills/SKILL.md` and `plugins/cc/agents/expert-skill.md`: file a change only when a missing/wrong/underspecified instruction on a *named owning surface* caused a failure that one reusable rule would have prevented; recur across >1 run or one severe missing-contract case; do not file on model variance, ignored-but-present instructions, restating/hedging/examples-only, or product/infra/scorer/code fixes. Prefer replacing existing guidance. "When nothing clears this bar, open no change and say why — that is a success."
- `references/workflows.md` evolve step 3: the same bar, so embedded LLM review can return an empty proposal set as success.
- `references/red-flags.md` §10: add the over-structuring flag (simple skill = Title + instructions; do not scaffold Overview/Best-Practices/Examples onto a short skill). Keep the existing missing-sections flag; they are inverses, not duplicates.
- `references/best-practices.md` "Workflows and Feedback Loops": add the iteration rule "only add what real usage proved necessary" as a replacement of the validator-only loop's implication, not a new section.

**Wave B — Scorer craft on the static plane (same feature).** `skill.yaml` criterion/anchors get labeled bands for the LLM Scorer (`excellent`/`poor` today → explicit band language with numeric meaning). Scorer persona output remains `{ score, note }` per dimension, but the note must be 1–3 sentences citing the skill text (location or quote) and the likely fixable cause. Optionally enforce non-empty notes in `ingestScores` (shared evaluate path — document in `docs/04_DESIGN.md` same commit if the DTO contract tightens). Do **not** add `insufficient_evidence` to static `skill.yaml` dimensions: a SKILL.md is always present, so that band would be dead weight and would perturb weights/aggregates. That band belongs on the usage plane (Wave C).

**Wave C — usage plane (follow-on, gated).** After a spike that names a transcript source, extend `evolve.ts` signal ingestion (and `--analyze` data-source inventory) with usage evidence and a `skill_coverage` observation for trigger-accuracy. Prefer extending `generateChanges` / envelope briefs over a new command family. Privacy invariant is mandatory. Collector code, if any, lives at `plugins/cc/scripts/<feature>/`. Candidates to *evaluate then reject or adopt* during the spike: local harness session files (skill-doctor's collector model, reimplemented — never copy vendor scripts); optional read of spur history artifacts when spur is installed (adapter, not a hard dependency); reuse of `--eval-gate` holdouts as a weak proxy (insufficient as ground truth for firing). Do not start Wave C by assuming spur-new modules exist in this repo.

**Trade-offs:**

- **Pros:**
  - Ships the highest-ratio item (warrant bar) without waiting on an unowned transcript pipeline.
  - Extends proven modules (`evolve` briefs/gate, `skill.yaml`, cc-skills references) instead of a second doctor.
  - Keeps static scores comparable; usage signals cannot silently reweight completeness/clarity.
  - Respects prose-only skills, vendors/ immutability, and citation-resolve.
- **Cons:**
  - The "no real-usage feedback loop" gap remains until Wave C; evolve still trends static scores in the meantime.
  - Wave B ingest validation, if taken, is cross-type (evaluate ingest is shared).
  - Two-wave sequencing can stall if Wave A is treated as "done" and Wave C is never spiked.

**Implementation notes:**

- Citations added to cc-skills must resolve (`skill-citations-resolve`). Point at `skill.yaml` and `evolve.ts` instead of restating weights or flag lists.
- Bumping `skill.yaml` `version:` sweeps fixture pins (learnings: evaluate-ingest tests pin `rubric_version`).
- Persona prompts pass the warrant bar *verbatim* in `negative_constraints` / Skeptic input so `anchor_hash` covers it.
- `--eval-gate` (G35) stays opt-in empirical holdout replay; do not advertise it as skill-coverage.

**Confidence:** HIGH for Wave A/B shape (source in this tree this session). MEDIUM for Wave C size until the source spike returns. LOW that spur history can be "just wired" from this repo.

**Sources:**
- Grounding brief `.spur/run/idea-grounding-cc-skills.md` | **Verified:** 2026-08-26
- `apps/cli/src/operations/evolve.ts` `generateChanges`, `addEvolveOptions` | **Verified:** 2026-08-26
- `vendors/common-skills/.agents/skills/skill-doctor/references/skill-improvements.md` | **Verified:** 2026-08-26
- ADR-015 / ADR-024 (`docs/00_ADR.md`) | **Verified:** 2026-08-26

### Approach 2: In-tree usage-grader (skill-doctor minus HTML)

**Description:** Port skill-doctor's collect → score transcripts → aggregate `skill_coverage` → draft diffs pipeline into `plugins/cc/scripts/skill-usage/`, invoked from cc-skills evolve. Skip HTML/PNG/CTA. Feed findings into Author briefs as a first-class signal alongside evaluation trends.

**Trade-offs:**

- **Pros:** Closes the usage loop in one feature; `skill_coverage` becomes measurable; matches the highest-value skill-doctor story.
- **Cons:** New executable family and likely new DTOs; collector must support *our* harnesses, not Warp's; duplicates or wraps work that spur-new already does for its own history plane; high chance of importing vendor assumptions (Python collectors, report.json shape, 45-day/12-session defaults). Violates "extend proven modules" and the grounding's "verify history first" instruction — that verification already showed the history plane is not here.

**Implementation notes:** A honest version still needs the Wave A warrant bar, or the new grader will propose speculative diffs (skill-doctor's own `skill-improvements.md` exists to prevent that). Privacy boilerplate is mandatory. `vendors/` stays untouched; reimplementation from the brief, not copy.

**Confidence:** HIGH that it can be built; LOW that it is the right next increment given the missing source and the cheaper warrant-bar gap.

**Sources:** skill-doctor `SKILL.md` steps 1–4; ADR-015 script layout | **Verified:** 2026-08-26

### Approach 3: Warrant-bar-only (prose this idea; everything else later)

**Description:** Ship only Wave A from Approach 1. Leave Scorer bands, ingest note checks, and usage signals as a later idea after the operator separately commissions a source spike.

**Trade-offs:**

- **Pros:** Smallest diff; `needs_design` could be false; zero rubric-version churn; immediately cuts evolve proposal-churn and doc bloat.
- **Cons:** Leaves Scorer notes unenforced (typed required, validated optional). Leaves trigger-accuracy as a static proxy with no path on the board. Easy to lose the usage-loop intent if this idea is marked done.

**Implementation notes:** Same file list as Wave A. No `skill.yaml` bump. No `evaluate.ts` change.

**Confidence:** HIGH that Wave A is correct and sufficient as a first commit; MEDIUM that stopping there matches the operator's stated four-candidate intent.

**Sources:** grounding "Items 3 and the two update-skill gaps are prose-only"; `red-flags.md` §10; `skill-improvements.md` | **Verified:** 2026-08-26

## Recommendations

Recommend **Approach 1**. Wave A is the cheap, high-ratio absorb and should land first inside the same feature as Wave B so the Scorer contract and the evolve warrant bar ship together. Wave C is in scope as a *named follow-on with a source spike*, not as this feature's implementation work, and not as a silent "we'll use spur history."

Prefer Approach 3 only if the operator wants zero schema/config change this cycle. Reject Approach 2 as the opening move: it builds a parallel doctor before the warrant bar exists, and it assumes a transcript pipeline this repo does not own.

Key factors: vendors/ is reference-only; cc-skills stays prose-only; citations must resolve; replace rather than append; two scoring planes so static aggregates stay stable.

## Design Summary

**Problem.** `superskill skill evaluate` scores SKILL.md text. `superskill skill evolve` proposes from trends of those scores (`generateChanges` over `TrendEntry[]`). The product principle "self-evolving quality loop" therefore currently closes on static self-scores. skill-doctor's value is real-session evidence plus a filing bar that forbids speculative instruction edits. `update-skill` is not a second absorb.

**Chosen shape (Approach 1).** One feature, two waves in-tree, one gated follow-on:

| Wave | What | Where | Architectural impact |
| --- | --- | --- | --- |
| A | When-not-to-propose bar; over-structuring red flag; usage-proved iteration rule | `cc-skills` SKILL.md, `expert-skill.md`, `references/workflows.md`, `red-flags.md`, `best-practices.md` | None (prose replace) |
| B | Labeled score bands + mandatory evidence-citing Scorer notes; optional ingest non-empty-note check | `packages/core/src/rubrics/skill.yaml`; Scorer contract in cc-skills; `evaluate.ts` `ingestScores` only if the DTO is tightened | Rubric version bump; possible shared ingest contract (`docs/04_DESIGN.md` same commit) |
| C (follow-on) | Usage signals + `skill_coverage` into evolve envelope | `evolve.ts` signal path; optional `plugins/cc/scripts/<feature>/`; privacy boilerplate in cc-skills | New input plane; spike first |

**Scoring-plane rule.** Static evaluate keeps the five `skill.yaml` dimensions. Usage observations do not become extra static dimensions and do not reweight completeness/clarity/conciseness. `insufficient_evidence` is a usage-plane band (exclude from that plane's aggregate), not a sixth static skill dimension.

**Evolve warrant rule (Wave A, binding).** Author may return zero `ProposedChange`s. Skeptic rejects a change that fails the filing bar even if Δ-margin and `anchor_hash` would pass. Mechanical gates stay (validate, margin, hash, veto); the bar is an additional *warrant* constraint in the persona briefs, not a new CLI flag.

**Invariants.**

- Never modify `vendors/`.
- Never add `scripts/` or `extensions/` under `plugins/cc/skills/cc-skills/`.
- Every new citation resolves (`skill-citations-resolve`).
- Prefer replace over append.
- Prefer extend `evolve.ts` / `skill.yaml` / existing references over a new command or package.
- Transcripts, if ever ingested, stay local; never upload.
- Out of scope: HTML report, share-as-PNG, Warp CTA/closing boilerplate, re-import of `update-skill` rules already in `best-practices.md`.

**Open, non-blocking.** Wave C transcript source (local harness files vs optional spur adapter vs holdout proxy). Spike before any collector is specified. Do not encode a spur-new import path in this feature's AC.

**Doc sync when Wave B/C land.** `docs/04_DESIGN.md` for ingest/evolve flag or DTO changes; `docs/05_FEATURES.md` status; ADR only if a new module/package or a new scoring plane becomes a cross-cutting decision (Wave C likely; Wave A no; Wave B rubric bump is existing rubric ownership).

**`needs_design`.** `true`. Wave B is a rubric/config (and possibly ingest DTO) change; Wave C would add an input plane. Ties lean design. Wave A alone would have been `false`.

## Spec self-review

- No `TODO` / `TBD` / `???` / empty sections.
- No contradiction with the grounding brief except the corrected premise: spur history is **not** in this repository.
- Scope does not include HTML/PNG/CTA, vendor edits, or a skill-local `scripts/` directory.
- Decompose can map Wave A/B to tasks without guessing the Wave C source — that spike is an explicit later task with its own AC ("name the source or stop").

## Next Steps

1. Operator taste-gate: approve or reject `.spur/run/c6ef217a-9a79-4025-9790-10ab64e79177-idea-eval-report.md`.
2. On approve: feature-create from the enhanced idea (staged absorb, two planes, Wave C gated).
3. System-design (`needs_design: true`) — lock the scoring-plane rule, warrant-bar persona contract, and Wave B rubric-version consequences.
4. Decompose Wave A/B as the first batch; Wave C source spike as a separate later task, not a sibling that blocks A/B.

---

**Generated by:** sp:brainstorm
**Research delegation:** inline source-first verification (no `spur agent run`; no wayfinder)
**Operator review:** pending (`design_status: pending_operator_review`)
