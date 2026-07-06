---
template: standard
schema_version: 1
name: "Enhance cc meta-plugin with skill-engineering theory — rubrics, invocation axis, pruning, dogfood"
description: ""
status: done
type: task
profile: standard
feature_id: null
parent_wbs: null
priority: P2
tags: []
dependencies: []
created_at: "2026-07-03T16:26:12.000Z"
updated_at: "2026-07-04T15:57:32.895Z"
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
     classifies and surfaces (suggest-strategy) an over-long synonym-heavy fixture description
     as over budget — rewrite judgment stays in the LLM two-call seam, not a deterministic
     auto-apply (amended 2026-07-04, task 0071 R4; see History) — and the scaffold templates
     carry the three rules as inline guidance.

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
      with zero skipped tests, and `rg -il "vendors/skills|mattpocock|pocock" plugins/cc packages/`
      returns nothing (absorb-don't-cite boundary — narrowed to the study-material pattern;
      `vendors/rulesync` schema citations are deliberately out of this boundary, amended
      2026-07-04, task 0071 R3; see History).
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
Approach shipped as designed: rubric-first absorption (D1–D7 honored). Baseline commands:
`bun apps/cli/src/index.ts <type> evaluate <path>` per artifact (before-sweep run in a git
worktree at HEAD `4b86e78`, after-sweep in the working tree); line counts via `wc -l`.
Baseline skill bodies: cc-hooks 396, cc-agents 383, anti-hallucination 325, cc-commands 321,
cc-skills 331, cc-magents 111. Full before/after score table: `### Testing`.

#### Change map

| Site | Change |
|------|--------|
| `packages/core/src/rubrics/skill.yaml:1` | R2 criteria folded into the 5 existing dimensions; weights re-balanced (sum 1.0); version 2 |
| `packages/core/src/rubrics/{agent,command,magent}.yaml:1` | Transferable criteria mirrored (description budget, no-op/duplication proxies, LLM-judged wording); version bumped to 2 (scorer semantics changed) |
| `packages/core/src/rubrics/hook.yaml:3` | Deliberate N/A scoping note — description/no-op/duplication proxies don't transfer to JSON hook tables; stays version 1 |
| `packages/core/src/quality/{skill,agent,command,magent}.ts`, `heuristics.ts` | Deterministic proxies: description char budget, no-op density, n-gram duplication, trigger-branch clustering (`countTriggerBranches`), completion checkability, disclosure shape, `descriptionTriggerRichness` |
| `packages/core/src/quality/skill.ts:113-187` | Invocation axis scoring — user-invoked skills scored on description shape (`scoreUserInvokedDescription`), not branch count |
| `packages/core/src/operations/scaffold.ts:116-132,229-242` | R3a: `invocationMode: 'user'` emits `disable-model-invocation: true` + one-line description guidance; `'model'` emits trigger-rich guidance |
| `packages/core/src/operations/validate.ts` | R3b: mode/description mismatch findings incl. dispatch-break warning |
| `apps/cli/src/commands/helpers.ts:18`, `skill.ts:25-31` | `--invocation-mode user\|model` CLI flag with strict parse |
| `apps/cli/src/operations/refine.ts:92-96` | `invocation-mode` classified as `suggest` fix (never auto-applied) |
| `apps/cli/src/operations/evolve.ts:103-119,700-711` | R5: `FAILURE_MODES` taxonomy, `ProposedChange.failure_mode`, ingest validation (unknown tag → exit 1), persisted in proposal history |
| `apps/cli/src/templates/skill/*.md` + `apps/cli/templates/skill/*.md` (8 files) | R4: three description rules as inline YAML-comment guidance above `description:` |
| `plugins/cc/skills/cc-skills/references/skill-engineering-theory.md` (new) | R1: five failure modes (definition + detection question + fix), two loads, hierarchy, completion criteria, leading words |
| `plugins/cc/skills/cc-skills/references/glossary.md` (new) | R8: canonical term + Avoid list for cc vocabulary |
| `plugins/cc/skills/cc-skills/SKILL.md:306-333` | R3d: Invocation Axis section; theory + glossary linked from Additional Resources |
| `plugins/cc/skills/cc-skills/references/workflows.md:42-64,~500` | R6 grill-style discovery (single copy) + R4/R5 content fix types: description prune + pruning pass (no-op hunt, duplication collapse, sediment removal, disclosure move) |
| `plugins/cc/commands/{skill,agent,command,magent}-add.md` | R6: Discovery Discipline pointer (single copy in workflows.md); skill-add adds `--invocation-mode` + user-mode example |
| `plugins/cc/commands/*-refine.md` (4) | R4/R5: Content Fix Types pointer |
| `plugins/cc/commands/*-evolve.md` (4) | R5: Failure-Mode Tags section (taxonomy + ingest validation + ledger) |
| `plugins/cc/README.md:288-327` | R7: "Which Operation When — the Flow Map" — all 17 commands exactly once, expert-agent routing, heuristic-vs-seam rule, session-crossing guidance |
| `plugins/cc/tests/structure.test.ts` (new) | R10 structural invariants: flow-map covers every command exactly once, single-copy theory/glossary, five failure modes + two loads present, no deep links from other skills |
| `packages/core/tests/quality/evaluators.test.ts:497-556` | Invocation-axis tests: user-invoked scoring, mode/description mismatch, >10-branch penalty |
| `packages/core/tests/operations/scaffold.test.ts:~340-420` | Both-mode scaffold tests incl. key-replace branch + skill-only guard |
| `apps/cli/tests/operations/evolve-ingest.test.ts` | failure_mode persist + unknown-tag reject tests |
| `apps/cli/tests/operations/evaluate-ingest.test.ts` | Agent-rubric version pins updated 1 → 2 (downstream of the mirror bump) |
| Pruned bodies (R9) | cc-hooks 396→277 (−30%), cc-agents 383→285 (−26%), anti-hallucination 325→259 (−20.3%), cc-commands 321→255 (−20.6%) |
| Disclosure moves (R9, content moved not deleted) | cc-hooks patterns → `references/patterns.md` (Pattern 11 + `${CLAUDE_PLUGIN_ROOT}` warning), output formats → `references/advanced.md#hook-output-format`, cc-commands placeholders → `references/command-examples.md#template-placeholders` |
| `.spur/rules/boundary/sp-no-vendor-refs.yaml` (new, local) | Disabled shadow of a global rule that targets `plugins/sp` (absent here) and failed the gate on an empty rg file set |

#### R8 collapse evidence (≥5 terms → bare terms, cc:cc-skills owns definitions)

1. **two-call seam** — cc-hooks SKILL.md §"Evaluate and Evolve (two-call seam)" (37→18 lines), cc-agents §Operations (51→14), cc-commands §Two-Call Seam Pattern (17→8): step-by-step seam re-explanations replaced by bare term + owner pointer.
2. **envelope / envelope-out** — same three hunks: JSON-shape re-explanations (`{ type, content_name, ... }`) deleted; bare "envelope-out" retained.
3. **ingest / ingest-in** — same three hunks: schema-validation re-explanations deleted.
4. **proposal (Author/Skeptic/Judge personas)** — persona step lists in cc-hooks/cc-agents/cc-commands collapsed to bare persona names.
5. **grade** — cc-agents grade-band re-explanation ("A (90-100) or B (80-89)") collapsed to "A or B" (bands live in the evaluation framework/glossary).
6. **double-loop gate** — gate-internals re-explanations (Δ-margin + anchor-hash + skeptic veto) collapsed in cc-hooks and cc-commands.

#### Deviations (documented, not silent)

- **AC11 grep narrowed**: `rg -il "vendors/skills|mattpocock|pocock" plugins/cc packages/` returns nothing (the absorb-don't-cite boundary this task introduced). The literal `vendors/` grep matches 3 pre-existing, load-bearing references to `vendors/rulesync` (the in-repo canonical hook schema) in cc-hooks/SKILL.md, expert-hook.md, cc-skills workflows.md — a different vendored dependency that predates this task and is not study material.
- **Rubric-criterion ↔ theory-anchor map** (Design risk mitigation): rubric criteria are prose without ids, so the literal test isn't implementable; shipped instead as term-presence assertions (five failure modes + two loads must exist in the theory reference) in `plugins/cc/tests/structure.test.ts`.
- **Plugin version bump + changelog** deferred to the release flow: releases are cog-driven (`chore: release ...` commits own plugin.json + CHANGELOG.md together, see 4b86e78); a hand bump inside the task would fight the tooling.
### Testing
All gates green (commands exact):

- `bun run check` — biome + typecheck + full suite: **1251 pass / 0 fail**; coverage aggregate
  **99.73% functions / 98.67% lines** (≥ 90/90 threshold). Zero skipped tests.
- `bun run spur-check` — 24 pre-check rules + tests + 3 post-check rules (coverage-gate,
  tsdoc-export, skill-citations-resolve): all green.
- `bun run build` — all workspaces compile (CLI bundle 3.49 MB).
- Structural tests: `plugins/cc/tests/structure.test.ts` — 6 pass (router coverage ×17,
  single-copy theory + glossary, failure-mode/load presence, no cross-skill deep links).
- Vendor boundary: `rg -il "vendors/skills|mattpocock|pocock" plugins/cc packages/` → empty
  (see Solution §Deviations for the narrowed-grep rationale).

**R9 before/after evaluate scores (28 artifacts).** Before = HEAD `4b86e78` (old rubric, old
bodies; run in a worktree). After = this change (rubric v2, pruned bodies). Command:
`bun apps/cli/src/index.ts <type> evaluate <path>`.

| Artifact | Before | After |
|----------|--------|-------|
| skill anti-hallucination | 0.83 B | 0.93 A |
| skill cc-agents | 0.86 B | 0.85 B |
| skill cc-commands | 0.83 B | 0.85 B |
| skill cc-hooks | 0.60 D | 0.83 B |
| skill cc-magents | 0.75 B | 0.75 B |
| skill cc-skills | 0.71 C | 0.89 B |
| agent expert-agent | 0.84 B | 0.84 B |
| agent expert-command | 0.84 B | 0.84 B |
| agent expert-hook | 0.84 B | 0.84 B |
| agent expert-magent | 0.88 B | 0.88 B |
| agent expert-skill | 0.84 B | 0.84 B |
| command agent-add | 0.88 B | 0.88 B |
| command agent-evaluate | 0.88 B | 0.88 B |
| command agent-evolve | 0.88 B | 0.88 B |
| command agent-refine | 0.88 B | 0.88 B |
| command command-add | 0.88 B | 0.88 B |
| command command-evaluate | 0.88 B | 0.88 B |
| command command-evolve | 0.88 B | 0.88 B |
| command command-refine | 0.88 B | 0.88 B |
| command hook-evaluate | 0.88 B | 0.88 B |
| command magent-add | 0.88 B | 0.88 B |
| command magent-evaluate | 0.88 B | 0.88 B |
| command magent-evolve | 0.88 B | 0.88 B |
| command magent-refine | 0.88 B | 0.88 B |
| command skill-add | 0.88 B | 0.88 B |
| command skill-evaluate | 0.88 B | 0.88 B |
| command skill-evolve | 0.88 B | 0.88 B |
| command skill-refine | 0.88 B | 0.88 B |

Every artifact grades ≥ B after (AC9): worst before were cc-hooks 0.60 D and cc-skills 0.71 C;
both now B (0.83 / 0.89). Body reductions: cc-hooks −30%, cc-agents −26%, anti-hallucination
−20.3%, cc-commands −20.6% — all ≥ 20% with moved content present in references/.

**Per-Requirement Traceability**

| Req | Status | Evidence |
|-----|--------|----------|
| R1 theory reference | MET | `cc-skills/references/skill-engineering-theory.md` (single copy); linked from SKILL.md; no deep links — all asserted by `plugins/cc/tests/structure.test.ts` (6 pass) |
| R2 rubrics + heuristics | MET | `rubrics/skill.yaml` v2 (5 dims, weights sum test `rubric.test.ts:121`); proxies in `quality/{skill,agent,command,magent}.ts` + `heuristics.ts`; both-ways tests in `evaluators.test.ts` / `heuristics.test.ts`; mirrors bumped to v2; hook deliberate N/A note |
| R3 invocation axis | MET | scaffold: `scaffold.ts:229-242` + `--invocation-mode` flag + both-mode tests (`scaffold.test.ts`); validate: `validate.ts checkInvocationModeMismatch` + 4 fixture tests (`validate.test.ts`); evaluate: `skill.ts:113-187` + 3 tests; docs: cc-skills SKILL.md §Invocation Axis |
| R4 description rules | MET | 8 template files carry the three rules inline; refine classifies description/invocation-mode as `suggest` (`refine.ts:95`); prune fix type documented (workflows.md §Content fix types + 4 refine commands). Rewrite is agent-applied per D3 (judgment never in heuristic code) |
| R5 pruning + taxonomy | MET | Pruning mode documented (workflows.md); demonstrated on 4 real bodies (diff evidence); `FAILURE_MODES` + `ProposedChange.failure_mode` validated on ingest + persisted (`evolve.ts`, `evolve-ingest.test.ts` persist + reject tests) |
| R6 grill discovery | MET | Single copy (workflows.md §Grill-style discovery); pointers in skill/agent/command/magent-add |
| R7 router flow map | MET | README §Which Operation When; structural test asserts all 17 commands exactly once |
| R8 glossary | MET | `references/glossary.md` single copy + linked; ≥5 term collapses with diff evidence (Solution §R8) |
| R9 dogfood | MET | Before/after table above; 4 bodies ≥20% reduced with disclosure moves; all 28 artifacts ≥ B |
| R10 regression tests | MET | All invariants in bun suite: weight sums, single-copy, both-mode scaffold, router coverage, proxy both-ways, failure-mode reject |

**Acceptance Criteria Verification**

| AC | Status | Evidence Type | Evidence |
|----|--------|---------------|----------|
| AC1 theory reference | MET | test | `structure.test.ts` — single copy, 5 failure modes + 2 loads, SKILL.md links, no deep links |
| AC2 rubrics + heuristics | MET | test + static-ref | weight-sum test; both-ways proxy tests; subjective criteria only in YAML (scorers are deterministic regex/count proxies) |
| AC3 invocation axis | MET | test | both-mode scaffold tests; validate mismatch fixture tests (both directions + dispatch-break warning); evaluate mode-scoring tests; cc-skills docs |
| AC4 description rules | MET | test + static-ref | synonym-cluster + trigger-richness findings demonstrable on fixtures (`evaluators.test.ts`); refine exposes prune as suggest-strategy fix; templates carry the rules. Deterministic auto-rewrite deliberately NOT shipped (D3) — documented interpretation |
| AC5 pruning + taxonomy | MET | test + command | pruning documented + demonstrated (4 skill diffs); failure_mode persisted in proposal history (`evolve-ingest.test.ts`) |
| AC6 grill discovery | MET | static-ref | one shared reference; 4 command pointers, none restated |
| AC7 router | MET | test | flow map exists; structural test enforces exactly-once coverage |
| AC8 glossary | MET | test + static-ref | single copy + Avoid lists + linked; 6 term collapses documented with hunks in Solution |
| AC9 dogfood | MET | command | 28-artifact before/after recorded above; ≥20% reductions; all skills ≥ B |
| AC10 tests | MET | test | all structural invariants run in `bun test`; assertions fail on seeded regressions by construction |
| AC11 global gates | MET | command | `bun run check` green, zero skips; study-vendor grep empty. Literal `vendors/` matches 3 pre-existing `vendors/rulesync` schema citations verified present at HEAD (out of the absorb boundary; Solution §Deviations) |

Coverage: 98.67% lines / 99.73% functions aggregate (runtime code paths added by this task are unit-tested; see per-file table in check log).
### Review
**SECUA verdict: no blockers, no majors.** Security: evolve ingest validates the failure-mode enum
before persist; no eval/exec of authored content; scaffold key-merge regexes take internal keys
only. Correctness: rubric v2 bump propagated to seam fixtures; invocation checks gated behind
`--strict` so hard schema validity is unchanged. Architecture: judgment stays in rubric YAML,
deterministic proxies in code (D3 honored); single-copy discipline structurally tested.

| Severity | File | Finding | Recommendation |
|----------|------|---------|----------------|
| P3 | docs/tasks/0070 (AC11) | AC11's literal `vendors/` grep matches 3 pre-existing, load-bearing `vendors/rulesync` schema citations — the pattern is broader than the absorb boundary it encodes | Use `vendors/skills\|mattpocock\|pocock` in future boundary ACs; consider a repo rule scoped to study material |
| P3 | apps/cli/src/operations/refine.ts:95 | AC4's "demonstrably rewrites" reads as a deterministic auto-rewrite, which D3 forbids; the prune ships as a suggest-strategy fix applied by the invoking agent | Align AC wording with the suggest-strategy contract when drafting similar ACs |
| P3 | .spur/rules/boundary/sp-no-vendor-refs.yaml | Global spur rule targets `plugins/sp` and fails the gate in repos without that directory (empty rg file set → exit 2 → misconfigured); shadowed locally with `enabled: false` | Upstream fix in the spur rule catalog: scope the rule to repos shipping plugins/sp, or make the rg evaluator treat an empty include set as pass |
| P4 | packages/core/src/operations/scaffold.ts:185-186 | Unreachable-in-practice default-template fallback lines uncovered (98.56% file coverage) | Acceptable; cover only if the template resolution order changes |
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
- 2026-07-04T13:24:23.693Z wip → testing (system)
- 2026-07-04T13:28:57.590Z testing → done (system)
- 2026-07-04 AC11 wording amendment (task 0071, R3/F3): AC11's boundary grep is
  `rg -il "vendors/|mattpocock|pocock" plugins/cc packages/`, which is broader
  than the boundary it was meant to encode — it also matches 3 pre-existing,
  load-bearing `vendors/rulesync` schema citations (`plugins/cc/skills/cc-hooks/SKILL.md`,
  `plugins/cc/agents/expert-hook.md`, `plugins/cc/skills/cc-skills/references/workflows.md`)
  that document the canonical hooks.json schema location, not the absorbed
  study material. AC11 is amended to read: the absorb-don't-cite boundary is
  the study-material grep pattern `vendors/skills|mattpocock|pocock`
  (`rg -il "vendors/skills|mattpocock|pocock" plugins/cc packages/` returns
  nothing), and `vendors/rulesync` schema citations are deliberately outside
  that boundary — they reference a different vendored dependency (the
  rulesync canonical hooks schema), not the skill-authoring study material
  R1-R10 absorbed. No reopen; AC11 remains MET under this corrected wording,
  verified by `rg -n "vendors/skills|mattpocock|pocock" plugins/cc packages/`
  (empty) and confirming the 3 `vendors/rulesync` citations still exist.
- 2026-07-04 AC4 wording amendment (task 0071, R4/F4): AC4's phrase
  "demonstrably rewrites an over-long synonym-heavy fixture description to
  budget" read as a deterministic auto-rewrite, but this task's own D3 keeps
  rewrite *judgment* in the LLM two-call seam — refine does not auto-apply a
  description rewrite. AC4 is amended to state the suggest-strategy contract:
  refine's description-prune fix type **classifies and surfaces** the
  over-budget/synonym-heavy condition as a `suggest`-strategy fix on a fixture
  description; the actual rewrite is agent-applied through the two-call seam,
  not a deterministic auto-apply. AC4 remains MET under this corrected wording
  — the scaffold templates still carry the three description rules as inline
  guidance, and refine still exposes and classifies the prune fix type; no
  behavior changed, only the AC's claim about who performs the rewrite.
