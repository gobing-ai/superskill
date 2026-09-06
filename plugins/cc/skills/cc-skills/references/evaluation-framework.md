# Evaluation Framework

Evaluate whether a skill helps its intended users, tasks, and hosts. Fix the success criteria
before optimizing the skill. A static grade, a persuasive review, and a successful runtime trial
are different evidence; report them separately.

## Evidence layers

| Layer | Check | What it cannot establish |
|---|---|---|
| Structural | Frontmatter, layout, resolvable references, declared dependencies | Factual correctness, safe tools, actual discovery |
| Semantic | Correct instructions, preserved intent, useful boundaries, source-backed facts | Measured task success or performance |
| Native host | Installed name, discovery, invocation controls, tools, resource loading | Transfer to another host/model/version |
| Behavioral | Task artifacts/state, required process, failures, triggering, resource use | General reliability beyond the cases and environment tested |

Use the smallest sufficient check for the change. A repaired link needs a resolution check;
a changed trigger needs discovery cases; a tool workflow needs checks of its resulting state.
For substantive improvement claims, compare baseline and candidate on representative tasks.
Do not introduce a new evaluation framework when existing tests or a small reproducible trial suffice.

## Define the target

Record the intended tasks, host/model versions, tool versions, skill revision, installed path,
other active instructions/skills, permissions, and environment needed to reproduce a result.
Use existing records rather than creating a mandatory metadata schema.

Separate these purposes:

- **Capability uplift:** compare with the base agent without this skill as well as the previous
  version where useful. If the base agent now succeeds, investigate whether the workaround can retire.
- **Encoded preferences and process:** assess fidelity to operator requirements and project
  constraints. Base-model competence does not make those requirements obsolete.
- **Domain knowledge:** verify sources and version applicability, then test the errors the knowledge
  is meant to prevent. Generic prose cannot replace a missing dependency or runtime capability.

Freeze inputs and expected outcomes before rewriting. Include ordinary requests, edge cases, known
failures, missing prerequisites, and relevant trust-boundary cases. Retain a separate holdout when
iteratively tuning the skill; cases used to select an edit are development evidence, not unseen tests.

## Test discovery separately

Exercise the host's actual selection path with the intended installed skill catalog:

- Requests that should trigger, including realistic paraphrases and implicit requests.
- Near misses that share terminology but should not trigger.
- Neighboring skills with overlapping descriptions and a clear expected owner.
- Explicit invocation and explicit-only behavior when those are part of the contract.

Record expected and observed selection. Report counts of false positives and false negatives;
use precision/recall only with a clear denominator and label undefined values. Artificially forcing
the skill into a prompt tests execution with the skill loaded, not discovery. A count of trigger
phrases is not a measured firing rate, and merely mentioning a skill is not proof it loaded.

## Compare task results

1. Reproduce the baseline when practical. Keep task inputs, tool access, working state, and execution
   budgets comparable. Use clean contexts and isolated fixtures; prevent one candidate's files,
   conversation, caches, or memory from supplying the other's answer.
2. Run the candidate against the same development cases and then untouched holdouts. Inspect
   output artifacts and resulting state with deterministic checks where possible. Judge a patch
   with applicable tests; judge a generated file's actual structure and content, not the claim
   that it was created.
3. Check required process and constraints as well as outcomes: read-only requests, authorization,
   resource routing, preservation of data, missing dependencies, and honest failure reporting.
   Untrusted evaluation fixtures must not cause real external side effects.
4. For subjective criteria, use an anchored rubric and examples. Where useful, compare outputs
   blind to identity, vary ordering, permit ties, and calibrate the judge against human judgments.
   Review source evidence; a second model's confidence is not verification.
5. Repeat noisy cases enough to assess variation within the task's budget. Report trial counts,
   failure distribution, and uncertainty; a single lucky run cannot establish reliable uplift.
   Do not promote a noisy average by hiding severe regressions or weakening the grader.

Keep the evaluator independent of candidate instructions. Do not let a proposal rewrite acceptance
criteria, reference answers, or safety constraints to make itself pass. If a criterion was wrong,
correct it explicitly and re-evaluate both baseline and candidate under the corrected criterion.

## Cost and selection

Measure task success and fidelity alongside elapsed time, tool calls, and token usage when useful.
Distinguish context size, billed/cached tokens, and monetary cost; source length alone measures none
of them precisely. Compare similar conditions and note environment or model changes.

Choose the smallest candidate that satisfies the requirements and holds up on relevant cases.
Retain a longer example or guard when it prevents an observed failure or preserves an explicit
requirement. If behavior is unchanged but context cost falls, report that specific improvement.
If evidence is inconclusive, say so; do not force a winner or invent a target percentage.

Recheck after relevant model, tool, host, or task changes. Retire stale workarounds when comparative
evidence supports it, while retaining operator preferences and project constraints.

## CLI scoring and persistence

`superskill skill evaluate <nameOrPath> --json` produces a heuristic `QualityReport`.
The source owners are `packages/core/src/quality/skill.ts`,
`packages/core/src/quality/types.ts`, and `packages/core/src/rubrics/skill.yaml`.
The rubric owns dimensions, weights, and anchors; do not duplicate them in skill instructions.
`packages/core/src/quality/rubric.ts` owns rubric resolution and validation.

These heuristics inspect the artifact. Trigger-branch counts do not measure discovery; verification
language does not measure truthfulness; length does not measure usefulness. Report a grade as a
static diagnostic even when the label is PASS.

The optional rubric Scorer seam and `--save` behavior are defined in
[workflows.md](workflows.md#optional-scorer-seam). Ground notes in a specific location and evidence,
use the rubric's anchors, and disclose unavailable evidence. Do not promise identical model scores
across runs. `evaluate --history` reads saved evaluation rows; `evolve --history` concerns versions.

## The usage plane

Runtime evidence can come from authorized local trials, existing tests, or available session traces.
It need not wait for an automated transcript collector. Record what the evidence actually contains:
selection events, loaded resources, actions, outcomes, or only final prose.

The optional CLI `--eval-gate` is an output replay check with case-resolution and backend limits
described in [workflows.md](workflows.md#gate-limits). Its runner injects skill text directly and
returns output text; it does not test native discovery or automatically verify every tool-side effect.
Mock replay fixtures test gate logic, not model quality. A continuous cross-host telemetry collector
is separate product work; do not invent one or claim it already exists.

## Research basis and limits

Research cutoff: **2026-08-31**. The dated sources below support this method; none establish a
universally optimal skill prompt. Rolling format and host documentation is identified separately
in [platform-compatibility.md](platform-compatibility.md).

| Primary source | Published | Application and limit |
|---|---|---|
| [Anthropic: Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) | 2026-01-09 | Inspect outcomes and traces, use appropriate graders and repeated trials; an evaluation harness needs its own scrutiny. |
| [SkillsBench, v1](https://arxiv.org/html/2602.12670v1) | 2026-02-13 | Curated skills helped on average in its benchmark, with substantial task/domain variation; self-generated skills did not show the same average benefit. This motivates task-specific comparisons, not a fixed module count or promised uplift. |
| [Anthropic: Improving skill-creator](https://claude.com/blog/improving-skill-creator-test-measure-and-refine-agent-skills) | 2026-03-03 | Separate triggering from output evaluation, compare skill/no-skill and versions, and revisit capability workarounds as models improve. Product-specific implementation is not a required universal workflow. |
| [SWE-Skills-Bench, v1](https://arxiv.org/html/2603.15401v1) | 2026-03-16 | Many public software-engineering skills provided little benefit in its matched tasks and could add substantial token cost; some specialized skills helped. Different tasks and methods prevent direct equivalence with SkillsBench. |
| [Anthropic: Context engineering for Claude 5 generation models](https://claude.com/blog/the-new-rules-of-context-engineering-for-claude-5-generation-models) | 2026-07-24 | Vendor coding evaluations supported pruning older scaffolding for those models. Apply this as a model-specific hypothesis to test, not a universal deletion quota or permission to remove operator requirements. |
| [Anthropic: Value of Claude Code sessions](https://claude.com/blog/maximizing-the-value-of-your-claude-code-sessions) | 2026-08-14 | Loaded context, repeated turns, and cache behavior affect cost differently. Measure the actual host's usage; do not equate file length with tokens billed each turn or copy fixed cache settings across hosts. |
| [Anthropic: Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) | 2025-09-29 | Select useful context and retrieve detail as needed. Minimal sufficient context is task-dependent; deleting requirements is not an optimization. |

The workflow choices here are engineering judgments informed by these sources. They are not a claim
that this meta skill, or every skill it edits, has passed a cross-model benchmark.
