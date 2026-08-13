---
template: feature-impl
schema_version: 1
name: "Investigate minimizing the magent scaffold template"
description: ""
status: done
type: task
profile: standard
feature_id: A
parent_wbs: null
priority: P2
tags: []
dependencies: ["0115"]
ac_numbering: task-local
created_at: "2026-08-13T18:34:31.510Z"
updated_at: "2026-08-13T20:21:40.841Z"
---

## 0117. Investigate minimizing the magent scaffold template

### Background
`packages/core/src/templates/magent/default.md` is **14,101 chars** — the only magent template we
ship. Against `scoreConciseness`'s `scoreLength(body, 1000, 8000)` that yields a length score of
≈ **0.24**: `superskill magent scaffold` emits a config our own scorer marks down. This is a concrete
instance of the guide's warning that generated configs "prioritize comprehensiveness over restraint".

The obvious response — a minimal template tier — is not obviously correct, which is why this is an
investigation rather than an implementation. `scorePlatformCoverage` (`quality/magent.ts:95`)
needs ≥3 platforms named to score well, and a genuinely minimal root may name none, so minimizing the
template could simply move the penalty from `conciseness` to `platform-coverage`.

Blocked on 0115: the post-change scorer determines what "minimal" actually scores, so measuring
against today's scorer would produce a number we then discard.

Ticket type: `wayfinder:research`. Map: feature A.
### Requirements
- **R1** — Score `templates/magent/default.md` against the **post-0115** scorer and report the
  per-dimension breakdown. Establishes whether disclosure-aware completeness alone fixes the
  self-penalty or whether the template is genuinely too long.
- **R2** — Determine whether the template's bulk is governance content that *should* move behind
  links (fixable by restructuring, given 0115) or boilerplate that should be deleted outright.
- **R3** — Quantify the `platform-coverage` interaction: what a minimal root scores when it names
  fewer than three platforms, and whether that penalty is legitimate or an artifact.
- **R4** — Emit a recommendation with a rejected-alternatives note: minimal tier, restructure in
  place, or leave as-is. No template edits in this ticket — the recommendation graduates into an
  implementation ticket if accepted.
### Acceptance Criteria
```gherkin
Feature: Scaffold template minimization assessment

  Scenario: The template is measured against the new scorer
    Given the disclosure-aware completeness change has landed
    When templates/magent/default.md is evaluated
    Then a per-dimension score breakdown is recorded in the ticket

  Scenario: The platform-coverage interaction is quantified
    Given a hypothetical minimal root config naming fewer than three platforms
    When it is evaluated
    Then the platform-coverage penalty is measured and judged legitimate or artifactual

  Scenario: The ticket produces a decision, not an edit
    When the investigation completes
    Then a recommendation with rejected alternatives is recorded
    And no file under packages/core/src/templates/ has been modified
```
### Q&A

<!-- CLOSED decisions from refinement: what was chosen and why, what was deferred and on what
     condition. Not a parking lot for open questions — an unanswered question here means the task
     is not ready to hand off. Keep empty if none. -->

### Design
**WHAT** — A measurement, not a change. Score `templates/magent/default.md` against the post-0115
scorer, decompose where its 14,101 chars go, and emit a recommendation with rejected alternatives.

**WHY** — `scoreLength(body, 1000, 8000)` gives the shipped template ≈ 0.24 on conciseness, so
`superskill magent scaffold` emits a config our own `evaluate` marks down. Whether that is a template
defect or a scorer defect is the open question — and 0115 may resolve it without any template edit,
which is why measuring first is cheaper than editing first.

**WHERE (read-only)** — `packages/core/src/templates/magent/default.md`,
`packages/core/src/quality/magent.ts`, `packages/core/src/operations/scaffold.ts`.

**No new API.** This task freezes no names and adds no code. Its deliverable is the ticket's own
`## Solution` section plus, if the recommendation is accepted, a graduated implementation ticket.

**Method**

1. Baseline — run the post-0115 evaluator over the template, record all five dimensions. The
   pre-0115 number (≈ 0.24 length score) is context, not the comparison point.
2. Attribution — bucket the template's bulk by governance area, so "too long" is decomposed into
   *which* area is long. An area that is long **and** linkable is a 0115 restructure candidate; an
   area that is long and inherently inline is not.
3. Counterfactual — construct a throwaway minimal variant (not committed) and score it, to get the
   real trade curve rather than an assumed one.
4. Interaction check — `scorePlatformCoverage` (`magent.ts:95`) scores `min(platforms/5, 1)` from
   frontmatter `platforms:` or body prose. A minimal root naming zero platforms scores **0** on a
   0.25-weighted dimension — larger than the conciseness penalty it would relieve. Quantify this
   before recommending minimization; it is the most likely reason to recommend *no change*.

**Decision rule** — recommend a minimal tier only if the counterfactual beats the restructured
current template on aggregate score **after** the platform-coverage interaction is paid. Otherwise
recommend restructure-in-place, or no change.

**Anti-patterns (do not implement)**

- Do **not** edit any file under `packages/core/src/templates/`. The deliverable is a recommendation.
- Do **not** re-open 0115's design. This task consumes that scorer; it does not litigate it.
- Do **not** propose widening the 1000–8000 window to make the template pass. That inverts the
  measurement — tuning the ruler to fit the object.
- Do **not** treat "0.24 is low" as the finding. The finding is *why*, and whether 0115 already fixed it.

**Cross-task** — hard-depends on 0115 (`dependencies: ["0115"]`); measuring against today's scorer
produces a number that is discarded the moment 0115 lands. Leaves nothing for dependents.
### Plan
1. Confirm 0115 is `done` before starting. If not, stop — the dependency is the whole point.
2. Score `packages/core/src/templates/magent/default.md` with the post-0115 evaluator, passing a real
   `basePath` so link credit is exercised. Record all five dimensions.
3. Attribute the 14,101 chars by governance area; tabulate chars per area in `## Solution`.
4. Mark each area linkable / inherently-inline. Linkable + long = 0115 restructure candidate.
5. Build a throwaway minimal variant in the scratchpad (never under `packages/core/`), score it.
6. Quantify the `platform-coverage` interaction: score the minimal variant naming 0, 3, and 5
   platforms; report the aggregate delta at each point.
7. Apply the decision rule; write the recommendation into `## Solution` with rejected alternatives
   and the numbers behind each.
8. Verify `git status` shows no change under `packages/core/src/templates/`.
9. If the recommendation is "act", graduate an implementation ticket under feature A and note it in
   the map's `## Decisions so far`; if "no change", record that as the answer — a negative result
   closes the ticket just as validly.
### Solution
**Measurement** (post-0115 scorer, `packages/core/src/quality/magent.ts:214` `evaluateMagent`, unweighted aggregate via `computeAggregate`, real `basePath` = repo root). Citations: `scoreConciseness` `packages/core/src/quality/magent.ts:147`; `scorePlatformCoverage` `packages/core/src/quality/magent.ts:95`; `scoreCompleteness` `packages/core/src/quality/magent.ts:71`; `scoreLength` `packages/core/src/quality/heuristics.ts:74`; template sections `packages/core/src/templates/magent/default.md:10-231`.

Baseline `templates/magent/default.md` — 14,101 bytes / 14,023 chars, body 13,961:

| dimension | score | note |
| --- | --- | --- |
| completeness | 1.000 | 6/6 governance sections via headings; template has **0 markdown links**, so 0115's link credit is inert for it |
| platform-coverage | 1.000 | 8 platforms detected from prose (6 genuine: Claude Code, Codex, Pi, OpenCode, OpenClaw, Antigravity; `gemini` credited from `~/.gemini/…` path and `cursor` from "Merges Cursor/Cline/…" — substring artifacts that do not change the score, 6 ≥ the 5 needed) |
| conciseness | 0.255 | body 13,961 chars → `scoreLength(_, 1000, 8000)` = 0.2548; noOp density 0.000; dup ratio 0.000 — **pure byte-length penalty** |
| tone-consistency | 1.000 | 5 signals matched |
| safety | 1.000 | 7/7 markers |
| **aggregate** | **0.851** | |

**R1 — does 0115 fix the self-penalty? No.** Completeness was already 1.0 (all six governance headings present), so disclosure-aware link credit changes nothing for this template. The drag is conciseness, which is 100% byte length — no no-op or duplication penalties to correct. The ≈0.24 → 0.255 length-score delta vs the pre-0115 figure is a body-length definition difference, not a scorer change.

**Attribution** (body = 13,961 chars):

| section | chars | % | scored governance area? | linkable? |
| --- | --- | --- | --- | --- |
| Harness & Infrastructure | 4,221 | 30.2% | no | yes (`docs/03_ARCHITECTURE.md`, `docs/A-Complete-Guide-To-AGENTS.md` exist) |
| Platform Padding | 3,352 | 24.0% | no | yes (platform matrix); also the platform-coverage source |
| Tool Discipline | 2,213 | 15.9% | no | yes (tool-routing reference) |
| Verification | 1,913 | 13.7% | yes (heading already counts) | partially (gate prose is procedural) |
| Safety | 562 | 4.0% | yes | no — inherently inline |
| Tone & Style | 450 | 3.2% | no | no |
| Conventions | 369 | 2.6% | yes | no |
| Project | 325 | 2.3% | yes | no |
| Docs & Routing | 295 | 2.1% | yes | no |
| Commands | 221 | 1.6% | yes | no |
| preamble | 40 | 0.3% | — | — |

**R2 — bulk is NOT governance content.** 70.1% of the body (9,786 chars = Harness & Infrastructure + Tool Discipline + Platform Padding) is enablement/teaching prose that no scorer dimension rewards; only Verification (13.7%) is a scored area and its length is a command list + gate prose. So the fix is "padding that should move **behind links** (restructure)", not "governance to delete" — a minimal tier deletes the padding and gains nothing on aggregate (below).

**R3 — platform-coverage interaction** (throwaway minimal root, 1,178–1,236 chars, all 6 governance headings, tone + safety signals kept):

| variant | platforms | aggregate | platform dim |
| --- | --- | --- | --- |
| minimal-0 | none declared, none in prose | **0.800** | 0.000 |
| minimal-3 | 3 frontmatter | 0.920 | 0.600 |
| minimal-5 | 5 frontmatter | 1.000 | 1.000 |
| restructured (current, slimmed) | 5 frontmatter | 1.000 | 1.000 |
| baseline (current) | 8 detected | 0.851 | 1.000 |

Penalty is **legitimate, not an artifact**: a config naming no platforms genuinely fails to say where it runs, and the unweighted aggregate costs it −0.20 (the 0.25-weighted rubric path would cost −0.25). It is cheap to avoid — one frontmatter line or one prose sentence — so minimization without it is a template design choice, not a scorer defect. Body-fallback substring artifacts (gemini from a path) change no score here.

**Decision rule applied** — minimal tier only if the counterfactual beats the restructured current template after the platform-coverage interaction is paid: minimal-5 **ties** restructured (1.000 vs 1.000) but does not beat it; minimal-3 (0.920) and minimal-0 (0.800) lose outright. → **no minimal tier.**

**Recommendation: restructure in place** — keep all six governance headings and the small inline sections (Safety, Conventions, Verification, Project, Commands, Docs & Routing, Tone & Style); slim the three long non-governance sections (Harness & Infrastructure, Tool Discipline, Platform Padding) to short link-bearing versions; declare `platforms:` in frontmatter so platform coverage survives the Platform Padding slimming. Measured: 3,275 chars, aggregate **1.000** (all five dimensions 1.000) — +0.149 over baseline at zero platform-coverage cost and no loss of inline safety/verification content.

**Rejected alternatives**

- **Minimal tier** — rejected: ties restructured on aggregate (1.000) only when it declares ≥5 platforms, is strictly worse below that (0.920 / 0.800), and deletes the template's teaching value (per-platform manifests/hooks matrix, harness routing, tool-discipline tables) for zero score gain.
- **Leave as-is** — rejected: 0.851 aggregate is a pure byte-length drag; restructure recovers +0.149 with no scoring trade-off.
- **Widen the 1000–8000 window** — rejected per task anti-pattern (tuning the ruler to fit the object).

**Graduated work** — implementation ticket **0119** under feature A: restructure `templates/magent/default.md` per the recommendation. No template edits made here (AC).

Evidence: scratchpad `/tmp/magent0117/{score.ts, debug.ts, restructured-keep.md, minimal.md}` (throwaway, never under `packages/core/`); output captured in Testing.
### Testing
**Pipeline verify results**

- Verdict: PASS (from verdict artifact)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| R1 | MET | Solution "Measurement" table — 5-dimension breakdown of `packages/core/src/templates/magent/default.md` (completeness 1.000, platform-coverage 1.000, conciseness 0.255, tone-consistency 1.000, safety 1.000, aggregate 0.851). Fresh re-run this turn: `bun /tmp/magent0117/verify-0117.ts` → byte-identical output. Anchors re-read this run: `evaluateMagent` `packages/core/src/quality/magent.ts:214`; `scoreConciseness` `magent.ts:147` (delegates to `scoreLength(body, 1000, 8000)` `packages/core/src/quality/heuristics.ts:74`); `scoreCompleteness` `magent.ts:71`. |
| R2 | MET | Solution "Attribution" table — 70.1% of body (9,786 chars = Harness & Infrastructure 4,221 + Tool Discipline 2,213 + Platform Padding 3,352) is non-governance enablement prose → linkable restructure, not deletion; only Verification (13.7%) is a scored area. Buckets sum exactly to body length (13,961; fresh `extractBody` = 13,962 — the disclosed 1-char definitional delta). |
| R3 | MET | Solution R3 table + fresh counterfactual matrix this turn (real basePath = repo root): minimal-0 (1,178 chars) → aggregate 0.800, platform dim 0.000; minimal-3 (1,213) → 0.920 / 0.600; minimal-5 (1,236) → 1.000 / 1.000. `scorePlatformCoverage` at `magent.ts:95` (re-read this run — `clamp(Math.min(platforms.length / 5, 1))` inside); zero platforms = −0.20 unweighted / −0.25 weighted. Penalty judged legitimate (a config naming no platforms fails to say where it runs). Artifacts confirmed inert: `gemini` from the `~/.gemini/…` path mention, `cursor` at body index 11,058 ("Merges Cursor/Cline/…"); 6 genuine platforms ≥ the 5 needed, so no score impact. |
| R4 | MET | Solution "Recommendation" + "Rejected alternatives" — restructure-in-place (3,275 chars → aggregate 1.000, +0.149 over baseline); minimal tier / leave-as-is / widen-window all rejected with numbers. Graduated to 0119 (`docs/tasks/0119_restructure-the-magent-scaffold-template-slim-bulk-behind-li.md` exists, status todo) and recorded in feature map `A` "Decisions so far" at `docs/features/A_absorb-agents-md-guide-into-magent-quality-surfaces.md:92` (re-read this run). No template edits: `git status --porcelain -- packages/core/src/templates/` clean this turn. |

| Acceptance Criteria | Status | Evidence Type | Evidence |
|---------------------|--------|---------------|----------|
| Scenario: The template is measured against the new scorer | MET | command | Fresh `bun /tmp/magent0117/verify-0117.ts` this turn — per-dimension breakdown recorded in Solution reproduced exactly (aggregate 0.851, all five dimensions). |
| Scenario: The platform-coverage interaction is quantified | MET | command | 0/3/5-platform counterfactual matrix reproduced this turn (aggregates 0.800 / 0.920 / 1.000); penalty measured (−0.20 unweighted / −0.25 weighted) and judged legitimate, not an artifact. |
| Scenario: The ticket produces a decision, not an edit | MET | command | Recommendation + rejected alternatives recorded in Solution; `git status --porcelain -- packages/core/src/templates/` clean this turn — no file under `packages/core/src/templates/` modified. |
- Coverage: N/A (verdict-based; verify pipeline does not measure code coverage)
### Review
| Priority | Dimension | Location | Finding |
| --- | --- | --- | --- |
| P4 | correctness (evidence hygiene) | task Background + Design: `packages/core/src/quality/magent.ts` | Stale anchor: both cite `scorePlatformCoverage (magent.ts:42-88)`; the function sits at `magent.ts:95` in the post-0115 tree (0115's edits shifted lines). Non-blocking — Solution/Testing correctly cite `:95`, and the measurement was run against the live tree, so no scored claim is affected. |
| P4 | usability (reproducibility) | Solution Attribution table; scratchpad `/tmp/magent0117/verify-0117.ts` | Section char buckets are hand-tabulated, not re-derived by the verify script; an independent recount matches only under a heading-inclusive definition (13,962 vs body 13,961 — the disclosed 1-char delta). Sums reconcile to body length exactly, so the claim is sound, but a re-audit must re-bucket by hand. |
| P4 | — | — | No P1–P3 findings; review verdict PASS |

**Functional Verdict: PASS**

All four requirements MET; all three Gherkin AC scenarios satisfied; evidence independently re-run this turn (fresh `bun /tmp/magent0117/verify-0117.ts` against the post-0115 working tree — every scored number reproduced exactly).

| Req | Status | Evidence |
| --- | --- | --- |
| R1 | MET | Solution "Measurement" table — 5-dimension breakdown of `templates/magent/default.md` (completeness 1.000, platform-coverage 1.000, conciseness 0.255, tone 1.000, safety 1.000, aggregate 0.851); re-verified this turn via `evaluateMagent` (magent.ts:214) with real basePath → identical output. |
| R2 | MET | Solution "Attribution" table — 70.1% of body (9,786 chars) is non-governance enablement prose (Harness & Infrastructure 4,221 / Tool Discipline 2,213 / Platform Padding 3,352), linkable → restructure, not delete; only Verification (13.7%) is a scored area and is partially linkable. Buckets sum exactly to body length 13,961. |
| R3 | MET | Solution R3 table — minimal-0/3/5 → aggregate 0.800 / 0.920 / 1.000 (platform dim 0.000 / 0.600 / 1.000), penalty judged legitimate (a config naming no platforms fails to say where it runs); interaction reproduced exactly this turn (`min(platforms/5,1)`, −0.20 unweighted / −0.25 weighted). |
| R4 | MET | Solution "Recommendation" + "Rejected alternatives" — restructure-in-place (3,275 chars → 1.000 aggregate, +0.149 over baseline); minimal tier / leave-as-is / widen-window all rejected with numbers; graduated to 0119 (status=todo, feature A) and recorded in feature map `A` "Decisions so far" (line 92). |

**Acceptance Criteria Verification**

| AC | Status | Evidence |
| --- | --- | --- |
| Scenario: template measured against new scorer | MET | Per-dimension breakdown recorded in Solution; fresh run this turn (aggregate 0.851, all five dims) matches exactly. |
| Scenario: platform-coverage interaction quantified | MET | 0/3/5-platform counterfactual matrix in Solution R3; reproduced this turn (0.800 / 0.920 / 1.000); penalty judged legitimate, not an artifact. |
| Scenario: ticket produces a decision, not an edit | MET | Recommendation + rejected alternatives recorded; `git status --porcelain -- packages/core/src/templates/` clean this turn — no template file modified. |

**SECUA Review** — no source code changed by this task (docs-only; diff scope = task file alone), so S/E/C/U dimensions apply to the investigation, not runtime code. Correctness: every scored claim re-verified against the live post-0115 scorer this turn with identical output; cited anchors (magent.ts:71/95/147/214, heuristics.ts:74, template :10-232) all resolve to the claimed functions/sections. Efficiency/usability: recommendation is quantified and actionable; no wasted surface. No P1–P3 SECUA findings.

**Architecture Depth** — N/A: zero files changed under any source tree, so no module-depth/coupling/seam signals exist to evaluate (sp-code-improvement finds no candidates). The investigation's own structure (baseline → attribution → counterfactual → interaction check → decision rule) is sound and the decision rule was applied correctly: minimal-5 ties restructured (1.000 vs 1.000) but does not beat it → no minimal tier, consistent with the rule.

**Residual risk** — Low. Counterfactual variants (`minimal.md`, `restructured-keep.md`) live only in `/tmp` scratchpad (throwaway by design, per task method step 5); 0119's implementation will need to rebuild them from the ticket's numbers. Platform detection's substring artifacts (gemini via `~/.gemini/` path, cursor via "Merges Cursor/Cline/…" at body index 11,058 — both confirmed this turn) are inert at current score but could shift if the prose they live in is slimmed; 0119's restructure must keep ≥5 genuine platform names or declare frontmatter `platforms:` (already in the recommendation).

Review Verdict: PASS
### References

A

<!-- Links to the parent feature, design docs, related tasks, or external references. -->

### History
- 2026-08-13T20:11:12.017Z todo → wip (system)
- 2026-08-13T20:21:40.550Z wip → testing (system)
- 2026-08-13T20:21:40.841Z testing → done (system)
