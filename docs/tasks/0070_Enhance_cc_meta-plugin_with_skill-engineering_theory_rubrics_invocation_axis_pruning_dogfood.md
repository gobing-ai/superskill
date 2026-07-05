---
template: standard
schema_version: 1
name: "Enhance cc meta-plugin with skill-engineering theory — rubrics, invocation axis, pruning, dogfood"
description: ""
status: wip
type: task
profile: standard
feature_id: null
parent_wbs: null
priority: P2
tags: []
dependencies: []
created_at: "2026-07-03T16:26:12.000Z"
updated_at: "2026-07-03T21:55:59.010Z"
---

## 0070. Enhance cc meta-plugin with skill-engineering theory — rubrics, invocation axis, pruning, dogfood

### Background
Provenance: a 2026-07-03 comparative study (run in ~/xprojects/spur-new) of `vendors/skills` —
Matt Pocock's "Skills For Real Engineers" repo — against production skill plugins. A sibling
task applies the lessons to spur's sp plugin (spur-new `docs/tasks2/0187`). THIS task applies
them to superskill's `plugins/cc` — with one decisive difference in leverage: **cc is the meta
toolkit**. Its rubrics, scaffold templates, and refine/evolve operations shape every skill,
subagent, slash command, hook, and magent config it produces. A principle encoded in cc's
rubrics is enforced on every future artifact; a principle only written in cc's docs is advice.
Rubrics first, docs second.

The absorbed theory (vendor `writing-great-skills` + `GLOSSARY.md`), in brief:

- **Predictability** is the root virtue — the agent takes the same process every run.
- **Two invocation loads**: model-invoked skills pay *context load* (description in the window
  every turn); user-invoked skills (`disable-model-invocation: true`) pay *cognitive load* (the
  human is the index). Choose per skill; a router skill cures cognitive-load pileup.
- **Information hierarchy**: steps → in-file reference → disclosed reference behind a pointer;
  disclose what only some branches need (branch-based progressive disclosure).
- **Completion criteria** must be *checkable* (done vs not-done decidable) and *exhaustive*
  ("every X accounted for") — the defense against premature completion.
- **Leading words**: pretrained tokens (*tight*, *red*, *tracer bullet*, *deep module*) that
  anchor behavior in one token instead of a restated sentence.
- **Named failure modes**: sprawl (too long even if all live), sediment (stale layers),
  duplication (one meaning, two homes), no-op (line the model already obeys — the test: does it
  change behavior vs the default?), premature completion.
- **Description rules**: front-load the leading identity phrase; one trigger per genuine branch
  (collapse synonyms); no identity restated from the body.

cc baseline (2026-07-03, plugin v0.2.5):

- 6 skills — body line counts: cc-hooks 396, cc-agents 383, anti-hallucination 325,
  cc-commands 321, cc-skills 319, cc-magents 111. Descriptions 155–329 chars (already
  disciplined — description pruning is NOT the priority here, unlike the sp sibling task).
- 17 commands (add/evaluate/refine/evolve × skill/agent/command/magent + hook-evaluate),
  5 expert subagents.
- Evaluation stack: 5 dimensions (completeness, clarity, trigger-accuracy, anti-hallucination,
  conciseness), PASS ≥ 0.70, grades A–F; rubrics `packages/core/src/rubrics/<type>.yaml` (all
  five entity types); deterministic heuristic scorers `packages/core/src/quality/<type>.ts`;
  a two-call LLM seam (envelope-out / ingest-in); 4-tier rubric resolution.
- `disable-model-invocation` is *documented* in cc-commands references but is not a first-class
  axis: not a scaffold choice, not validated for mode/description consistency, not scored.

What cc already does well (do NOT regress):

- "Skills are knowledge, not execution" — deterministic execution lives in the `superskill`
  CLI; keep new checks in the CLI/heuristics, not as prose-only rules.
- The auditable two-call LLM seam — subjective criteria belong in rubric YAML for that seam,
  never hidden in heuristic code.
- Governed evolve with proposal history and rollback.
- Per-skill `references/` discipline (12+ reference docs under cc-skills alone).

Boundary: absorb the vendor's ideas — rewritten in superskill vocabulary. No file under
plugins/ or packages/ may cite `vendors/` paths or the vendor author; provenance lives only in
this task file.
### Requirements
R1. Skill-engineering theory reference (the knowledge base). Add
    `plugins/cc/skills/cc-skills/references/skill-engineering-theory.md` carrying the absorbed
    theory: the two invocation loads, information hierarchy + branch-based progressive
    disclosure, checkable/exhaustive completion criteria, leading words, and the five named
    failure modes (sprawl, sediment, duplication, no-op, premature completion) — each with a
    definition, a detection question, and a fix. Link it from cc-skills SKILL.md. The other
    lifecycle skills (cc-agents, cc-commands, cc-hooks, cc-magents) reference the theory by
    naming `cc:cc-skills`, not by deep relative links across skill folders.

R2. Rubric + heuristic upgrades (the enforcement core). Extend
    `packages/core/src/rubrics/skill.yaml` and `packages/core/src/quality/skill.ts` with
    measurable criteria derived from the theory, folded into the EXISTING five dimensions (no
    dimension explosion; weights re-balanced, still summing to 1.0; rubric version bumped):
    - conciseness ← description char budget (context load) + no-op density proxy (ratio of
      imperative sentences matching a curated default-behavior list) + duplication proxy
      (repeated n-grams between description and body, and within the body).
    - trigger-accuracy ← one-trigger-per-branch: penalize synonym-cluster triggers; reward
      distinct-branch coverage (triggers ↔ "when to use" branches).
    - clarity ← completion-criteria checkability for step-type skills: presence of a decidable
      done-condition per workflow section; penalize vague bounds ("understanding reached",
      "as needed").
    - completeness ← progressive-disclosure shape: body length vs references/ usage; a body
      over a line budget with no disclosed references is a finding.
    Deterministic proxies go in the heuristic scorer WITH unit tests; genuinely subjective
    criteria (leading-word quality, premature-completion risk) go ONLY in the rubric YAML as
    LLM-judged criteria for the two-call seam. Mirror the applicable criteria into
    `rubrics/{agent,command,hook,magent}.yaml` + their `quality/<type>.ts` scorers where the
    concept transfers (descriptions and triggers transfer everywhere; disclosure applies to
    skills and agents).

R3. Invocation axis, end to end. Make model- vs user-invoked a first-class property across the
    skill lifecycle: (a) scaffold — `superskill skill scaffold` accepts an invocation mode
    (flag and/or interactive question) and emits `disable-model-invocation: true` plus a
    one-line human-facing description for user-invoked skills, or trigger-rich description for
    model-invoked; (b) validate — flag mode/description mismatches (user-invoked with trigger
    lists; model-invoked with no trigger phrasing) and warn that a user-invoked skill cannot be
    fired by other skills/commands; (c) evaluate — score the description against the declared
    mode; (d) knowledge — cc-skills SKILL.md + references teach the axis, the two loads, and
    the router-skill cure for cognitive-load pileup.

R4. Description rules in add/refine/evolve. Encode the three description rules (front-load the
    identity phrase; one trigger per genuine branch; no body-identity restatement) as: scaffold
    template guidance, an explicit refine fix-type ("description prune"), and evolve-proposal
    vocabulary. The heuristic proxies land via R2; this requirement is the operation-side
    wiring so refine can actually apply the fix.

R5. Pruning pass in refine; failure-mode taxonomy in evolve. Refine gains a documented pruning
    mode: sentence-level no-op hunt (delete, don't trim), duplication collapse (one meaning →
    one home), sediment/footer removal. Evolve proposals must be tagged with the failure mode
    they cure (sprawl/sediment/duplication/no-op/premature-completion), so evolution history
    becomes a failure-mode ledger.

R6. Grill-style discovery in scaffold operations. All `*-add` commands adopt the interview
    discipline before generating: one question at a time, each with a recommended answer,
    exploring existing artifacts (sibling skills, the target repo, prior evaluations) before
    asking the user anything answerable from the codebase. Document as shared scaffold
    behavior in the cc-skills workflow reference; apply to skill-add, agent-add, command-add,
    magent-add.

R7. Router / lifecycle flow map. Add a "which operation when" router surface (plugins/cc README
    section or a dedicated help command): the main lifecycle flow (add → validate → evaluate →
    refine → evolve), what each expert subagent is for, when to use the two-call LLM seam vs
    heuristic mode, and session-crossing guidance. Every command in plugins/cc/commands/
    appears exactly once in the flow map.

R8. cc glossary. Add a single-copy glossary reference defining cc's own vocabulary — entity
    type, operation, rubric, dimension, heuristic mode, two-call seam, envelope, ingest,
    verdict, grade, proposal, rollback, invocation mode — in canonical-term + "Avoid:" format
    (banned near-synonyms per term). Link from cc-skills SKILL.md; collapse re-explanations of
    these terms across the six skill bodies to bare terms.

R9. Dogfood: apply the upgraded toolkit to cc itself. Run the upgraded evaluate on all 6
    skills, 5 agents, and 17 commands; record before/after scores. Run the pruning pass (R5) on
    the four largest skill bodies (cc-hooks 396, cc-agents 383, anti-hallucination 325,
    cc-commands 321 lines) — target ≥ 20% body reduction via no-op deletion, duplication
    collapse, and disclosure moves into existing references/ (content moved, not deleted).
    Every cc skill must pass its own upgraded evaluate at grade B or better.

R10. Regression tests. Unit-test every new deterministic heuristic (fixture skills that
     exercise each proxy both ways); add structural tests asserting: rubric weights sum to
     1.0 ± 0.001 after re-balance, the theory reference and glossary exist as single copies,
     scaffold emits valid frontmatter for both invocation modes, and the router flow map covers
     all commands. All within the existing bun test suite so `bun run check` gates them.
### Acceptance Criteria
AC1. Theory reference — MET when skill-engineering-theory.md exists under cc-skills/references
     with all five failure modes (each: definition + detection question + fix), the two loads,
     the hierarchy, completion-criteria rules, and leading words; is linked from cc-skills
     SKILL.md; and no other lifecycle skill deep-links into cc-skills' folder (they name
     cc:cc-skills instead).

AC2. Rubrics + heuristics — MET when skill.yaml carries the new criteria inside the existing
     five dimensions with weights summing to 1.0 ± 0.001 and a bumped rubric version; every
     deterministic proxy in quality/skill.ts has unit tests with fixtures exercising both pass
     and fail; subjective criteria appear only in rubric YAML (grep of quality/*.ts shows no
     LLM-judgment heuristics); and the transferable criteria are mirrored into
     agent/command/hook/magent rubrics + scorers.

AC3. Invocation axis — MET when `superskill skill scaffold` can emit both modes (user-invoked
     with disable-model-invocation + one-line description; model-invoked with trigger-rich
     description); `superskill skill validate` flags a mode/description mismatch on a fixture;
     evaluate scores description-vs-mode; and cc-skills documents the axis + the two loads +
     the router cure.

AC4. Description rules — MET when refine exposes a description-prune fix type that
     demonstrably rewrites an over-long synonym-heavy fixture description to budget, and the
     scaffold templates carry the three rules as inline guidance.

AC5. Pruning + taxonomy — MET when refine's pruning mode is documented and produces
     sentence-level deletions on a no-op-laden fixture, and evolve proposals carry a
     failure-mode tag persisted in proposal history.

AC6. Grill discovery — MET when the four *-add commands document the one-question-at-a-time +
     recommended-answer + explore-before-ask discipline, sourced from one shared reference
     (single copy, not restated per command).

AC7. Router — MET when the flow map exists, lists every plugins/cc/commands/*.md exactly once
     (structural-test enforced), and covers the lifecycle flow, expert-agent routing, and
     heuristic-vs-LLM-seam guidance.

AC8. Glossary — MET when the glossary exists as a single copy with Avoid-lists, is linked from
     cc-skills SKILL.md, and at least five terms have had re-explanations collapsed to bare
     terms across the six skill bodies (diff evidence in ## Solution).

AC9. Dogfood — MET when before/after evaluate scores for all 28 cc artifacts (6 skills,
     5 agents, 17 commands) are recorded in ## Testing; the four largest skill bodies shrink
     ≥ 20% with moved content verifiably present in references/; and every cc skill grades
     ≥ B under the upgraded rubric.

AC10. Tests — MET when all new heuristics and structural invariants (weight sum, single-copy
      theory/glossary, scaffold frontmatter validity for both modes, router coverage) run in
      the bun test suite and fail on seeded regressions.

AC11. Global gates — MET when `bun run check` (biome + typecheck + full test suite) passes
      with zero skipped tests, and `rg -il "vendors/|mattpocock|pocock" plugins/cc packages/`
      returns nothing (absorb-don't-cite boundary).
### Q&A
Q: Why extend the existing five dimensions instead of adding new ones?
A: Dimension explosion dilutes weights and breaks score comparability with historical
   evaluations. The theory's criteria map cleanly onto existing dimensions (context load →
   conciseness, trigger discipline → trigger-accuracy, checkable criteria → clarity,
   disclosure shape → completeness); a version bump + criteria list inside each dimension
   keeps the QualityReport schema stable.

Q: Why rubrics/heuristics first and docs second?
A: cc is the meta toolkit — docs teach once, rubrics enforce on every artifact cc ever
   evaluates or refines. The knowledge reference (R1) exists so the rubric criteria have an
   explainable source, not the other way round.

Q: Which theory criteria are heuristic vs LLM-judged?
A: Deterministic proxies (char budgets, n-gram duplication, trigger/branch counts, done-
   condition presence, body-vs-references shape) → quality/<type>.ts with unit tests.
   Judgment calls (is this leading word strong? is this line a no-op for THIS model? is a
   completion criterion genuinely checkable?) → rubric YAML criteria consumed by the two-call
   seam. Never bury judgment in heuristic code — it breaks the auditable-seam design.

Q: Why is description pruning not a headline requirement here (unlike the sp sibling task)?
A: cc descriptions are already 155–329 chars — disciplined. The gap is body sprawl
   (396/383/325/321-line SKILL.md bodies) and the missing enforcement layer; hence R2/R5/R9
   carry the weight instead.

Q: What was deliberately NOT adopted from the vendor repo?
A: (a) the HTML architecture report — cc's output surfaces are terminal + JSON; (b) the teach
   skill — out of scope; (c) repo-root CONTEXT.md — superskill's docs/00–05 own product
   vocabulary; the R8 glossary is plugin-internal; (d) deleting descriptions on user-invoked
   entities where the platform requires one — follow platform constraints over vendor purism.

Q: Can user-invoked skills still be dispatched by cc's expert subagents?
A: No — a skill with disable-model-invocation cannot be fired via the Skill tool by another
   skill/agent/command body. R3's validate check must warn about exactly this: flipping a
   skill that an expert agent dispatches breaks the dispatch. Same rule discovered in the sp
   sibling task.

Q: Relationship to spur-new task 0187?
A: Same study, two applications: 0187 hardens sp (a consumer plugin — descriptions, content
   upgrades); this task hardens cc (the producer toolkit — rubrics, scaffolds, refine). No
   file-level dependency between them; the theory reference is written independently in each
   repo's own vocabulary.

(Per-criterion heuristic-vs-LLM placement decisions and the R9 before/after score table are
appended here during execution.)
### Design
Approach: **rubric-first absorption.** The vendor's skill-writing theory becomes (1) one
knowledge reference, (2) measurable rubric criteria + deterministic heuristic proxies, (3)
operation-side wiring (scaffold/validate/refine/evolve), (4) a dogfood pass proving the
toolkit on itself. Enforcement over advice at every step.

Key decisions:

- D1. Absorb, never cite. All theory content is rewritten in superskill vocabulary; no
  plugins/ or packages/ file references the vendor repo or author. Provenance lives in this
  task only.
- D2. Extend, don't multiply. New criteria fold into the existing five dimensions; weights
  re-balance to 1.0; rubric files get a version bump. The QualityReport schema and
  PASS/grade thresholds stay stable so historical evaluations remain comparable.
- D3. The heuristic/LLM seam is sacred. Deterministic proxies → quality/<type>.ts (unit
  tested). Judgment criteria → rubric YAML for the two-call seam (envelope-out/ingest-in).
  Nothing subjective hides in heuristic code; nothing deterministic wastes an LLM call.
- D4. Knowledge placement follows ownership: cc-skills owns the theory reference and glossary
  (single copies); the other lifecycle skills reach them by naming cc:cc-skills. No deep
  relative links across skill folders.
- D5. Invocation axis is a property, not a preference: scaffold emits it, validate checks
  mode/description consistency, evaluate scores it. The validate warning must cover the
  dispatch-break case (a user-invoked skill cannot be fired by expert agents or other skills).
- D6. Scope guard. No new entity types, no CLI architecture changes, no changes to the
  4-tier rubric resolution or the envelope schema beyond additive criteria fields. If a
  requirement seems to need a breaking schema change, stop and split a follow-up task.
- D7. Dogfood is the acceptance instrument: the upgraded evaluate must run green (grade ≥ B)
  on cc's own 28 artifacts before the task closes — the toolkit is not done until it passes
  its own bar.

Impacted surfaces:

- packages/core/src/rubrics/{skill,agent,command,hook,magent}.yaml — criteria + weights +
  version bump.
- packages/core/src/quality/{skill,agent,command,hook,magent}.ts (+ heuristics.ts if proxies
  are shared) — new deterministic scorers + unit tests.
- plugins/cc/skills/cc-skills/ — SKILL.md (axis + theory links), references/
  skill-engineering-theory.md (new), glossary (new), workflow reference (grill discovery,
  refine pruning mode, evolve taxonomy).
- plugins/cc/skills/{cc-agents,cc-commands,cc-hooks,cc-magents}/SKILL.md — bare-term
  collapses + cc:cc-skills pointers; anti-hallucination untouched except pruning.
- plugins/cc/commands/*-add.md — grill discipline pointer; *-refine.md — pruning +
  description-prune fix types; *-evolve.md — failure-mode tags.
- plugins/cc/README.md — router/flow map.
- Scaffold templates wherever `superskill skill scaffold` sources them (locate in
  packages/core; follow existing template mechanism).

Risks and mitigations:

- Heuristic proxies misfire on legitimate styles (e.g. reference-only skills have no steps →
  no done-conditions) → gate each proxy on skill interaction type (generator/reviewer/
  pipeline/knowledge-only) before scoring; fixtures must include a reference-only skill.
- Weight re-balance shifts existing artifact grades unexpectedly → run the before/after
  evaluation sweep (R9) early in a spike to calibrate weights before locking the rubric bump.
- Body pruning (R9) deletes content instead of disclosing it → moved content must be shown
  present in references/ (diff evidence), mirroring the sibling task's rule.
- Glossary/theory reference drifts from rubric criteria → structural test asserts every
  criterion id named in the rubric YAML has a matching section anchor in the theory reference.
### Plan
Wave 0 — baseline + calibration spike

- [ ] Record baselines in ## Solution: per-artifact evaluate scores for all 6 skills /
      5 agents / 17 commands (current rubric), skill body line counts, description char
      counts, with exact commands.
- [ ] Spike: prototype the R2 criteria on skill.yaml + quality/skill.ts against the 6 cc
      skills; calibrate weights so intended grades hold; lock the criteria list.

Wave 1 — knowledge base (R1, R8)

- [ ] Author skill-engineering-theory.md (five failure modes with detection questions +
      fixes; two loads; hierarchy; completion criteria; leading words); link from cc-skills.
- [ ] Author the cc glossary (canonical term + Avoid list); link from cc-skills; collapse
      ≥ 5 term re-explanations across the six skill bodies.
- [ ] Structural tests: single-copy theory + glossary; rubric-criterion ↔ theory-anchor map.

Wave 2 — enforcement core (R2, R10)

- [ ] Land skill.yaml criteria + version bump + weight re-balance (sum 1.0 ± 0.001).
- [ ] Implement deterministic proxies in quality/skill.ts, gated on interaction type; unit
      tests with both-ways fixtures (including a reference-only skill).
- [ ] Add LLM-judged criteria to rubric YAML only (two-call seam); verify envelope carries
      them.
- [ ] Mirror transferable criteria into agent/command/hook/magent rubrics + scorers + tests.

Wave 3 — operation wiring (R3, R4, R5, R6)

- [ ] R3: scaffold invocation-mode flag/question + both-mode templates; validate
      mode/description consistency check (incl. dispatch-break warning); evaluate
      description-vs-mode scoring; cc-skills docs for the axis.
- [ ] R4: description-prune fix type in refine; scaffold template guidance for the three
      description rules.
- [ ] R5: refine pruning mode (sentence-level no-op hunt, duplication collapse); evolve
      failure-mode tags persisted in proposal history.
- [ ] R6: shared grill-discovery reference; pointer from skill-add, agent-add, command-add,
      magent-add.

Wave 4 — surface (R7)

- [ ] Router/flow map in plugins/cc/README.md (lifecycle flow, expert-agent routing,
      heuristic-vs-seam guidance); structural test: every commands/*.md listed exactly once.

Wave 5 — dogfood (R9)

- [ ] Re-run evaluate on all 28 artifacts with the upgraded rubric; record before/after in
      ## Testing.
- [ ] Pruning pass on cc-hooks, cc-agents, anti-hallucination, cc-commands bodies (≥ 20%
      reduction, content disclosed to references/, diff evidence).
- [ ] Fix any cc artifact below grade B; re-run until all pass.

Wave 6 — gates

- [ ] `bun run check` green, zero skipped tests.
- [ ] `rg -il "vendors/|mattpocock|pocock" plugins/cc packages/` returns nothing.
- [ ] Changelog + plugin version bump per repo convention.
### Solution

<!-- Change map — HOW/WHERE. A `file:line` table of every touched site, one sentence each; <=8-line snippets only for non-obvious logic. NO full-function dumps. (Filled at `wip`/`testing`.) -->

### Testing

<!-- Test results + a numeric coverage claim, or explicit `N/A`. (Filled at `testing`.) -->

### Review

<!-- P1-P4 findings table (Severity / File / Finding / Recommendation). (Filled at `done`.) -->

### References
Study sources (in ~/xprojects/spur-new — reference-only; never cite from plugins/ or
packages/ here):

- spur-new vendors/skills/skills/productivity/writing-great-skills/SKILL.md + GLOSSARY.md —
  the theory absorbed by R1/R2 (loads, hierarchy, completion criteria, leading words, failure
  modes, description rules).
- spur-new vendors/skills/docs/invocation.md — model- vs user-invoked semantics; the
  "user-invoked cannot be fired by other skills" dispatch rule (R3).
- spur-new vendors/skills/skills/productivity/grilling/SKILL.md — the interview discipline
  (R6).
- spur-new vendors/skills/skills/engineering/ask-matt/SKILL.md — router/flow-map pattern (R7).
- spur-new vendors/skills/CONTEXT.md — glossary format: canonical term + Avoid list (R8).
- spur-new vendors/skills/docs/adr/0001-explicit-setup-pointer-only-for-hard-dependencies.md —
  hard/soft pointer split (informs D4 knowledge placement).
- spur-new docs/tasks2/0187_adopt-vendors-skills-lessons-into-plugins-sp-10-point-improv.md —
  the sibling task applying the same study to spur's sp plugin (consumer-side application;
  this task is the producer-side application).

superskill surfaces to modify:

- packages/core/src/rubrics/{skill,agent,command,hook,magent}.yaml — R2.
- packages/core/src/quality/{skill,agent,command,hook,magent}.ts, heuristics.ts — R2/R10.
- plugins/cc/skills/cc-skills/SKILL.md + references/ (theory, glossary, workflows,
  evaluation-framework) — R1/R3/R5/R6/R8.
- plugins/cc/skills/{cc-agents,cc-commands,cc-hooks,cc-magents,anti-hallucination}/SKILL.md —
  R8 collapses + R9 pruning.
- plugins/cc/commands/*.md — R4/R5/R6 wiring; plugins/cc/README.md — R7.
- Scaffold templates under packages/core (locate via `superskill skill scaffold`
  implementation) — R3/R4.

Repo context:

- plugins/cc/README.md — entity design purposes, "skills are knowledge, not execution".
- plugins/cc/skills/cc-skills/references/evaluation-framework.md — scoring model, two-call
  seam, 4-tier rubric resolution (the mechanism R2 extends).
- AGENTS.md / docs/99_PROJECT_CONSTITUTION.md — repo gates and doc-edit process.
- Gate commands: `bun run check` (lint + typecheck + test); `bun run spur-check` for the
  rule-gated variant.
### History
- 2026-07-03T16:26:12.000Z created manually (spec assembled in spur-new session; moved into corpus by operator)
- 2026-07-03T16:26:12.000Z backlog -> todo (manual, fully specified at creation)
- 2026-07-03T21:55:59.010Z todo → wip (system)
