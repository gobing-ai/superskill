# cc Glossary

Canonical terms for cc's own vocabulary — the lifecycle, the scoring model, and the invocation
axis. Each entry is `Term — definition. Avoid: banned near-synonyms.` Defined once here; the six
skill bodies name the bare term and link here instead of re-explaining it.

## Lifecycle

**Entity type** — one of the five artifact kinds cc manages: skill, agent, command, hook, magent.
Each has its own scaffold template, rubric, and quality scorer.
Avoid: "content type" (reserve for the internal `ContentType` union in code), "artifact kind".

**Operation** — one of the five lifecycle verbs applied to an entity: add (scaffold), validate,
evaluate, refine, evolve. Operations compose into the lifecycle flow (add → validate → evaluate →
refine → evolve); see [workflows.md](workflows.md) and the router in `plugins/cc/README.md`.
Avoid: "action", "command" (a command is a specific artifact type, not a synonym for operation).

**Invocation mode** — a skill's binary property: model-invoked (default; description carries
trigger phrasing, fires automatically when the model matches it) or user-invoked
(`disable-model-invocation: true`; description is a one-line human-facing summary, fires only on
explicit human invocation). See [skill-engineering-theory.md](skill-engineering-theory.md) for the
two-loads framing this property exists to manage.
Avoid: "auto-invoke" / "manual-invoke" (use model-invoked / user-invoked — the frontmatter field
name is `disable-model-invocation`, keep the vocabulary anchored to it).

## Scoring

**Rubric** — the YAML file (`packages/core/src/rubrics/<type>.yaml`) defining an entity type's
dimensions, each dimension's weight, its scoring criterion, and few-shot anchors. The rubric is the
fitness function; `loadRubric` validates it (weights sum to 1.0 ± 0.001, dimension names match the
type's registry) before any scoring uses it.
Avoid: "scorecard", "criteria file" (both used loosely elsewhere; "rubric" is the exact artifact).

**Dimension** — one named, weighted facet of quality within a rubric (e.g. `completeness`,
`trigger-accuracy`). Dimensions are fixed per entity type in `DIMENSION_REGISTRY`
(`packages/core/src/quality/types.ts`) — a rubric cannot invent a new dimension name.
Avoid: "category", "axis" (axis is reserved for invocation mode's two-value property, not the
N-dimension scoring model).

**Heuristic mode** — the default, deterministic scoring path: `quality/<type>.ts` computes each
dimension's score directly from frontmatter + body analysis, no LLM call, no network access.
Produces a `QualityReport` with an equal-weighted aggregate.
Avoid: "auto mode", "fast mode".

**Two-call seam** — the pattern separating deterministic envelope emission from LLM judgment for
subjective criteria: one CLI call emits a work order (envelope-out), an LLM persona scores or
proposes offline, a second CLI call ingests and validates the result (ingest-in). Used by
`evaluate` (Scorer persona) and `evolve` (Author → Skeptic → Judge personas). The seam keeps LLM
judgment auditable and keeps deterministic proxies out of prose-only rules.
Avoid: "LLM mode" alone (ambiguous about which half of the seam is meant — always name envelope-out
or ingest-in when precision matters).

**Envelope** — the JSON work order a two-call seam's first call emits: content, rubric, baseline
report, and (for evolve) generation briefs with an immutable goal anchor. No DB write, no model
call happens when emitting an envelope — it's pure read + serialize.
Avoid: "payload", "job" — envelope is the exact term used in code comments and skill docs.

**Ingest** — the two-call seam's second call: an agent-authored result (scores or a proposal) is
read from a file, schema-validated, and persisted (evaluation row or proposal row). Ingest never
skips validation — a malformed ingest file is rejected, not silently coerced.
Avoid: "import", "apply" (apply is a separate evolve step that happens only after a proposal is
accepted, not synonymous with ingest).

**Verdict** — the PASS/FAIL label attached to an aggregate score against the 0.70 threshold.
Avoid: "result" (too generic — a QualityReport carries a verdict, not the reverse).

**Grade** — the letter (A–F) mapped from an aggregate score: A ≥0.90, B ≥0.75, C ≥0.60, D ≥0.45,
F <0.45. Grade and verdict are both derived from the same aggregate but serve different audiences
(verdict is machine-actionable pass/fail; grade is human-readable quality signal).
Avoid: "score" alone when you mean the letter (score is the 0.0–1.0 number; grade is the letter).

## Evolution

**Proposal** — a versioned, persisted set of `ProposedChange[]` generated (or agent-authored) by
`evolve`, gated by the double-loop gate before it can be `accepted`. Proposals carry status
(`draft` / `accepted` / `rejected`) and, per R5, a failure-mode tag naming which of the six named
failure modes (sprawl/sediment/duplication/no-op/premature-completion/negation) the proposal cures.
Avoid: "suggestion", "change request" (both used informally elsewhere; "proposal" is the exact
stored-row term).

**Rollback** — restoring a prior accepted version of an entity file from its persisted version
snapshot (`<path>.version-<proposalId>`), via `evolve --rollback <id> --confirm`. Requires explicit
confirmation — it is a destructive, file-overwriting operation.
Avoid: "revert", "undo" (both imply an in-memory operation; rollback is a file-level restore from a
named snapshot).

## Steering & pruning

Bare vocabulary anchors; the full taxonomy entry (detection question + fix) for each lives in
[skill-engineering-theory.md](skill-engineering-theory.md) — named here so skill bodies can cite the
term and link once.

**Negation** — the sixth failure mode: steering by prohibition, which backfires (naming the banned
behavior primes it — the "don't think of an elephant" effect). Fix by prompting the **positive**
target instead; keep a prohibition only as an unphraseable-otherwise hard guardrail. The one failure
mode whose fix flips a sentence's polarity rather than deleting it.
Avoid: "prohibition smell", "anti-pattern" (too generic — "negation" is the taxonomy term).

**Sentence-level pruning** — running the no-op test on each *sentence in isolation* (not just line
by line) and deleting the whole failing sentence, never trimming words from it. The discipline that
turns the no-op fix from a vibe into a checkable pass.
Avoid: "trimming", "tightening" (both imply word-level shortening; pruning is whole-sentence deletion).

**Refactor hunt** — the proactive search during `refine`/`evolve` for restatements that a single
**leading word** retires (a triad spelled at three sites collapsing to one anchored token). Not
reactive cleanup — an assumed-present target you go looking for.
Avoid: "cleanup", "polish".

## See also

- [skill-engineering-theory.md](skill-engineering-theory.md) — the absorbed theory these terms
  formalize into cc's own vocabulary (two loads, information hierarchy, completion criteria,
  leading words, failure modes, description rules).
- [evaluation-framework.md](evaluation-framework.md) — the scoring model and rubric resolution
  tiers in full mechanical detail.
- `packages/core/src/quality/types.ts` — `DIMENSION_REGISTRY`, `QualityReport`, `DimensionScore`.
