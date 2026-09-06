# Skill-Engineering Theory

A local vocabulary for diagnosing instructions and choosing useful refinements. These are
engineering heuristics, not laws of model behavior. The research basis and empirical limits are in
[evaluation-framework.md](evaluation-framework.md#research-basis-and-limits).

## The two loads

**Context load** is the information the host supplies to the model: discovery metadata, invoked
instructions, imported/preloaded material, references, tool results, and retained conversation.
What loads, when it loads, and what is cached depend on the host. Source size is not equivalent
to tokens billed on every turn.

**Cognitive load** is the work a person or agent does to find and select the right procedure.
Explicit-only skills can reduce discovery context while making the operator responsible for
selection. Do not solve this tradeoff by automatically making every skill implicit or adding a
router. Improve names and descriptions first; add routing when observed selection problems warrant it.

## Invocation axis

Distinguish discovery-driven and explicit invocation conceptually, then verify the host's actual
controls. Claude's `disable-model-invocation` field is not a universal Agent Skills setting;
see [platform-compatibility.md](platform-compatibility.md#invocation-and-permissions).

A precise description states the useful task and its applicability. Do not overfit to exact phrases,
inflate a branch count, or treat descriptions as runtime enforcement. Test selection with realistic
requests, near misses, and competing skills. For explicitly selected skills, clarity still matters
even when implicit discovery is disabled.

## Information hierarchy

Keep the entry sufficient to choose and begin the right work safely. Route specialized facts and
procedures to references with clear loading conditions. Keep each fact at its owning source and
use direct links where possible.

A table inside an already-loaded body does not make its cells free context. A reference is deferred
only if the actual host and workflow defer it. Excessive indirection can make necessary information
unreachable, so inspect the effective load graph before claiming a context optimization.

## Outcomes, process, and completion criteria

Prefer repeatable outcomes and preserved constraints over identical action sequences for flexible
tasks. Require order where one step depends on another or where a fragile operation needs a gate.
Specify a done condition that reflects the requested scope and existing project checks.

Prematurely declaring success is a defect; forcing unrelated work is also a defect. A blocked
dependency requires an honest partial result and next step, not fabricated completion or endless
retries. Keep verification proportional to the change.

## Leading words and compression

Shared domain terms can replace repeated explanations when the intended reader and model understand
them consistently. Define ambiguous terms at one owner and prefer precise, familiar language.
A slogan or rare compressed token is not inherently more reliable than an explicit condition/action.

Retain enough context, examples, and hard constraints to recover the intended meaning. Compare
behavior before adopting aggressive compression. A model judge's preference for shorter prose
does not establish better execution.

## Seven failure modes

The labels below are also used by the repository's proposal/rubric machinery. Keep their identifiers
stable; diagnose the actual failure rather than forcing every edit into a taxonomy exercise.

| Mode | Diagnostic question | Useful correction |
|---|---|---|
| **Sprawl** (`sprawl`) | Is irrelevant or redundant context obscuring decisions for this task? | Remove unnecessary material or defer a specialized branch; retain required context. |
| **Sediment** (`sediment`) | Does an instruction encode a stale tool, obsolete workaround, or superseded decision? | Verify the current owner and remove or update the stale rule. |
| **Duplication** (`duplication`) | Is one fact copied across surfaces with drift risk? | Keep it at the authoritative owner and link from consumers. |
| **No-op** (`no-op`) | Does a statement add no useful decision, knowledge, preference, or constraint in context? | Remove or rewrite it when evidence supports that conclusion. |
| **Premature completion** (`premature-completion`) | Can the agent stop before the requested outcome and applicable checks are satisfied? | Give observable completion evidence and a truthful blocked path. |
| **Negation** (`negation`) | Does a prohibition leave the agent without a useful next action or create ambiguity? | Add an allowed action or clearer boundary; preserve necessary prohibitions. |
| **Contradiction** (`contradiction`) | Are applicable instructions incompatible under the active hierarchy? | Resolve authority and scope first, correct the stale owner, and ask only if material conflict remains. |

Negative wording does not universally backfire. Constraints such as "do not overwrite source data"
can be clearer and safer than an indirect positive reformulation. A contradiction is not a license
to delete the operator's preferred rule or select whichever sentence scores better.

## Sentence-level pruning and refactor hunt

Review each statement in the context of its branch, examples, dependencies, and rare but consequential
cases. A sentence that seems obvious in isolation may preserve a project preference or prevent a
severe failure. Do not require whole-sentence deletion or deny useful word-level edits.

A refactor hunt checks for repeated facts, stale exceptions, and misplaced detail. It does not
assume defects exist. Keep a no-change result when the current instructions are already suitable.
For iterative tuning, test ablations against development cases and validate the chosen change on
untouched cases; see [evaluation-framework.md](evaluation-framework.md).
