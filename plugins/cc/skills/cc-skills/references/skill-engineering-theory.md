# Skill-Engineering Theory

The knowledge base behind cc's rubrics, scaffolds, and refine/evolve heuristics. This document
defines the vocabulary once; the rubric YAMLs and quality scorers cite it, they don't restate it.
Read this before writing a new skill, refining an existing one, or extending a rubric criterion.

## The root virtue: predictability

A skill is engineered well when the agent takes the **same process every run** — same steps, same
order, same decision points — regardless of phrasing variance in the trigger. Predictability is
the property every other rule in this document exists to protect. When you're unsure whether a
change improves a skill, ask: does this make the agent's behavior more repeatable across runs, or
does it add a branch the agent has to interpret fresh each time?

## The two invocation loads

Every skill pays a cost whenever it's in scope — the question is which kind, and who pays it.

| Load | Who pays | Paid when | Frontmatter signal |
|------|----------|-----------|---------------------|
| **Context load** | The model | Every turn the skill is a candidate — its description sits in the context window | Model-invoked (default): description is trigger-rich, written for the model to pattern-match against |
| **Cognitive load** | The human | Every time the human has to remember the skill exists and invoke it explicitly | User-invoked (`disable-model-invocation: true`): description is a one-line human-facing summary; the human is the index |

**Choosing per skill:** model-invoked skills scale with clear, non-overlapping triggers — a model
that sees ten near-duplicate trigger-rich descriptions burns context and misfires. User-invoked
skills scale with human memory — a human who has to remember thirty command names has cognitive
load pileup instead. There's no free option; you're choosing who carries the cost.

**The router-skill cure:** when cognitive-load pileup shows up (the human can't remember which of N
user-invoked skills to reach for), the fix is not to flip them all back to model-invoked — that
just relocates the pileup into context load. Instead, add ONE thin model-invoked or well-known
router skill/command whose only job is "which one do I want" — a flow map, a decision table, or a
single entry point that fans out. `plugins/cc/README.md`'s router section is this pattern applied
to cc's own 17 commands (see cc:cc-skills workflow reference).

**Dispatch constraint:** a skill with `disable-model-invocation: true` cannot be fired via the Skill
tool by another skill, agent, or command body — only a human typing `/skill-name` (or platform
equivalent) can invoke it. Flipping a skill an expert subagent currently dispatches to user-invoked
silently breaks that dispatch path. Check callers before changing the axis on a skill that other
artifacts reference.

## Information hierarchy and progressive disclosure

Three tiers, loaded in order of increasing cost:

1. **Steps** — the SKILL.md body itself. Always loaded once the skill triggers. Keep this the
   critical path only: what the agent does on every run, in order.
2. **In-file reference** — a table, a short section, an inline example. Loaded with the body
   (no extra hop) but visually separable — the agent can skip it if the current branch doesn't
   need it.
3. **Disclosed reference** — a separate file under `references/`, reached only via an explicit
   pointer (`See references/x.md for …`). Loaded on demand, never by default.

**Branch-based progressive disclosure**: disclose content that only SOME invocation branches need.
If a skill has a `generator` mode and a `reviewer` mode, and only `reviewer` needs a scoring
rubric's full anchor text, that anchor text belongs in a disclosed reference the reviewer branch
points to — not inlined in the shared body, where the generator branch pays to load it too.

**Detection question:** for any paragraph in a SKILL.md body, ask "does every invocation of this
skill need this information?" If the honest answer is "only sometimes," it's a progressive
disclosure candidate — move it behind a `references/` pointer.

## Completion criteria: checkable and exhaustive

A completion criterion is the sentence that tells the agent "you are done." Two properties are
non-negotiable:

- **Checkable** — a fresh reader can look at the current state and answer done/not-done without
  interpretation. "Understanding reached" and "as needed" are not checkable — nobody can point to
  evidence of "understanding." "All acceptance criteria in the task file show a passing test" is
  checkable.
- **Exhaustive** — the criterion accounts for every item in scope, not a sample. "Every X is
  accounted for" beats "the main X are handled." An exhaustive criterion is immune to the failure
  mode below.

**Detection question:** could two different agents, looking at the same intermediate state,
disagree about whether the step is done? If yes, the criterion isn't checkable yet — replace the
vague bound with an enumerable one (a count, a checklist, a command's exit code).

**The defense this buys:** checkable + exhaustive completion criteria are the direct countermeasure
to premature completion (below) — an agent cannot honestly claim "done" against a criterion that
names every remaining item.

## Leading words

A leading word is a single pretrained token that anchors a specific behavior more reliably than a
restated sentence, because the model has seen that token in thousands of training examples tied to
one meaning. Examples: *tight* (no slack, no filler), *red* (a failing-test-first state in TDD
framing), *tracer bullet* (a thin, real, end-to-end slice — not a mock), *deep module* (a small
interface hiding substantial implementation, per Ousterhout's terminology). Using the leading word
is not decoration — `"keep this tight"` reliably compresses a paragraph of "avoid unnecessary
elaboration, prefer concise phrasing, cut restated context" into one anchored instruction.

**Detection question (subjective — LLM-judged, not heuristic):** would swapping this leading word
for a generic paraphrase lose reliability? If a model behaves measurably differently when it reads
`tight` versus `concise and to the point`, the leading word is doing real work and should stay.
This judgment does not belong in a deterministic heuristic scorer — it's evaluated by the rubric's
two-call LLM seam (see `packages/core/src/rubrics/skill.yaml`), never hardcoded as a string match,
because "is this the RIGHT leading word for THIS model" is not decidable by pattern matching.

**The refactor hunt:** assume every mature skill is carrying restatements that a single pretrained
token retires — hunt for them during refine, don't wait for them to be reported. A triad spelled
out at three sites, a description spending a sentence to gesture at one idea — each is a passage
begging to collapse into a leading word: "fast, deterministic, low-overhead" → a *tight* loop;
"a loop you believe in" → the loop goes *red* on the bug, or it doesn't. The collapse wins twice:
fewer tokens, and a sharper hook for the agent to hang its thinking on.

## The six named failure modes

Each failure mode below has a definition, a detection question, and a fix. These are the taxonomy
`evolve` proposals tag against (see cc:cc-skills workflow reference for the tagging mechanism).

### 1. Sprawl

**Definition:** the skill body is too long even though every sentence in it is individually true
and relevant. Sprawl is a *volume* problem, not a correctness problem — nothing in the body is
wrong, there's just too much of it for the body tier of the information hierarchy.

**Detection question:** does the body exceed its line budget for its interaction type, with no
corresponding `references/` disclosure absorbing the excess? (See conciseness dimension,
`packages/core/src/quality/skill.ts`, for the deterministic proxy.)

**Fix:** move content to `references/`, not delete it — sprawl is solved by progressive disclosure,
not by information loss. Verify the moved content is genuinely present in the reference file
(diff evidence), never just deleted and asserted "moved."

### 2. Sediment

**Definition:** a stale layer of content that described a prior version of the workflow/tool/API
and was never removed when the current layer was added on top. Sediment differs from sprawl: the
content isn't merely long, it's **wrong** — it describes behavior that no longer exists.

**Detection question:** does this paragraph describe a step, flag, or field that the current
implementation no longer has? Cross-check against the actual CLI/API surface, not memory.

**Fix:** delete outright — sediment carries no information worth disclosing, because a disclosed
copy of wrong information is still wrong information.

### 3. Duplication

**Definition:** one meaning, restated in two homes (e.g. the same weight table copied into both a
skill body and a rubric YAML, or the same term re-explained in every lifecycle skill instead of
defined once). Duplication is a *drift* risk: the two copies will eventually disagree, and nothing
detects the disagreement until a reader trusts the stale one.

**Detection question:** if I change this fact in its authoritative location, does a second copy
elsewhere become silently wrong? If yes, that second copy is duplication.

**Fix:** collapse to one home, cite from the rest. `packages/core/src/rubrics/skill.yaml` owns
dimension weights; `cc-skills` SKILL.md cites it (`"See packages/core/src/rubrics/skill.yaml"`)
rather than restating the numbers. This document (`skill-engineering-theory.md`) owns the failure
taxonomy; other lifecycle skills name `cc:cc-skills` rather than re-explaining the six modes.

### 4. No-op

**Definition:** an instruction that restates behavior the model already exhibits by default — it
changes nothing about what the agent does, it just adds tokens. The test is behavioral, not
stylistic: **does this line change behavior versus the model's default, for this model?** If the
model would do the same thing with the line deleted, the line is a no-op.

**Detection question:** for an imperative sentence in a skill body, would removing it change any
observable agent behavior? Deterministic proxies flag *candidates* (imperative sentences matching a
curated list of default-behavior phrasings — see the no-op density proxy in
`packages/core/src/quality/skill.ts`); whether a specific candidate is a genuine no-op **for a
specific model** is a judgment call and belongs in the rubric's LLM-judged criteria, not hardcoded
as a delete rule — a heuristic can flag "this looks like a default-behavior sentence," but only a
model-aware judgment confirms it changes nothing.

**Fix:** delete the sentence (pruning is a deletion operation, not a trim/shorten operation — see
the cc:cc-skills workflow reference's pruning-mode documentation).

**Sentence-level pruning discipline:** run the no-op test on each *sentence in isolation*, not just
line by line — a live line can still carry a dead sentence. When a sentence fails the test, delete
the **whole sentence**, don't trim words from it; a half-deleted no-op is still a no-op with worse
grammar. Be aggressive: most prose that fails the test should go, not be rewritten.

### 5. Premature completion

**Definition:** the agent reports "done" before every item in scope has genuinely been addressed,
because the completion criterion it was checking against wasn't exhaustive enough to catch the gap.
This is the operational failure that checkable + exhaustive completion criteria (above) exist to
prevent.

**Detection question (subjective — LLM-judged):** given this skill's stated completion criterion,
could an agent honestly satisfy the letter of the criterion while leaving real work undone? If yes,
the criterion has a premature-completion risk, even if it's technically checkable.

**Fix:** tighten the criterion to be exhaustive — replace "the main cases are handled" with "every
case in the enumerated list is handled," replace "tests pass" with "the full suite passes with zero
skipped."

**Fix ordering (cheapest first):** sharpen the completion criterion before you restructure. Only if
the criterion is *irreducibly* fuzzy **and** you observe the rush do you hide the post-completion
steps by splitting the sequence — pushing the steps still ahead out of view so the agent does the
legwork on the step in front of it instead of racing toward "done." Splitting is the expensive
remedy (it spends a granularity cut); a checkable criterion is the local, free one.

### 6. Negation

**Definition:** steering the agent by prohibition, which backfires — *"don't think of an elephant"*
names the elephant and makes it *more* available, not less. A skill that says "don't write vague
descriptions" has just put "vague descriptions" in the model's active context as the salient
concept, priming the very behavior it meant to suppress.

**Detection question:** does this instruction tell the agent what NOT to do without naming the
positive target it should do instead? A bare prohibition ("never skip the citation") with no
paired positive ("cite the owning file for every claim") is a negation smell.

**Fix:** prompt the **positive** — state the target behavior so the banned one is never spoken.
"Don't leave the completion criterion vague" becomes "make every completion criterion checkable."
Keep a prohibition **only** as a hard guardrail you genuinely cannot phrase positively (a safety
"never force-push"), and even then pair it with what to do instead. This is the one failure mode
whose fix is a rewrite, not a deletion — the sentence stays, its polarity flips.

## Description rules

Three rules for writing a skill's frontmatter `description` field, enforced by the conciseness and
trigger-accuracy dimensions (`packages/core/src/rubrics/skill.yaml`) and wired into scaffold/refine
(see cc:cc-skills workflow reference for the `description-prune` refine fix type):

1. **Front-load the leading identity phrase.** The first few words name what the skill IS, before
   any trigger conditions. A model scanning many skill descriptions in a context window reads
   identity first; burying it after three trigger clauses costs a full re-read.
2. **One trigger per genuine branch; collapse synonyms.** Each distinct "when to use this" clause
   in the description should correspond to a materially different invocation branch — not a
   restatement of the same branch in different words. `"data viz"`, `"chart"`, and `"graph"` are
   one branch (three synonyms); `"chart"` and `"dashboard layout"` may be two genuine branches if
   the skill's internal handling differs.
3. **No identity restatement from the body.** The description's job is to get the skill selected;
   the body's job is to execute once selected. If the first paragraph of the body repeats what the
   description already said, that's duplication (failure mode 3) — the body should start where the
   description's job ends.

## See also

- `packages/core/src/rubrics/skill.yaml` — the rubric criteria these concepts are encoded into
  (conciseness, trigger-accuracy, clarity, completeness dimensions).
- `packages/core/src/quality/skill.ts` — deterministic proxies for the measurable half of this
  theory (char budgets, n-gram duplication, trigger/branch counts, done-condition presence,
  body-vs-references shape).
- [glossary.md](glossary.md) — cc's own vocabulary (entity type, operation, rubric, dimension, …).
- [workflows.md](workflows.md) — the invocation-axis scaffold/validate/evaluate wiring, the
  grill-discovery discipline, the refine pruning mode, and the evolve failure-mode tagging.
