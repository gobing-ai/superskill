# cc-magents Workflows

## Scope and evidence

Apply the editing contract in [SKILL.md](../SKILL.md). Keep these distinctions
throughout the work:

| Evidence | What it establishes | What it does not establish |
| --- | --- | --- |
| Shared validation | Supported frontmatter/body checks and link existence | Complete native format validity, link anchors or host discovery |
| Heuristic evaluation | Reproducible length, vocabulary and rubric signals | Instruction quality, safe behavior or task success |
| Source assembly | Which layers and overrides the assembler emits | Fresh release assets, collision-free installation or native loading |
| Native host inspection | Files loaded by a specific host/version/configuration | Other hosts, roots or versions behaving identically |
| Behavioral trial | Observed outcome under recorded conditions | A universal success rate, optimal length or injection resistance |

Record the source revision, CLI/host versions, target, destination and date when
they affect a claim. Treat existing diffs and deployment state as inputs. Verify
facts in the consuming project; do not transplant this repository's Bun commands,
personal profiles or harness requirements into unrelated projects.

## Main-agent evaluation and refinement

### Establish the baseline

1. Resolve the requested entry files and their effective instruction graph: global
   and project files, native precedence, imports, scoped rules, replacement overrides,
   shared identity/voice/operator layers and relevant skill references. Read referenced
   policy that governs the change; ordinary hyperlinks do not imply automatic loading.
2. Inspect the actual project scripts, instructions and host configuration. Record
   operator requirements and authorization sources that the edit must preserve.
   Keep implementation details and private operator data out of generic examples.
3. Run shared validation and heuristic evaluation when the CLI is available. Use
   `--base-path` on evaluation when relative links are intended for a different
   destination; separately inspect the real destination and fragment anchors.
4. Compare source and assembled content sizes descriptively. Account for eagerly
   imported files and separately installed rules; report exclusions. Moving content
   to an always-loaded file does not reduce context, and bytes do not equal billed tokens.

The following are read-only checks of the configuration:

```bash
superskill magent validate AGENTS.md --strict --json
superskill magent evaluate AGENTS.md --json
superskill magent refine AGENTS.md --dry-run
```

Confirm the live leaf help before invocation. Capture the exit status and inspect the
result, including diagnostics on stderr; an exit code alone is insufficient. The
current CLI emits validation JSON on stderr; recheck this behavior when versions
change rather than silently discarding a stream.

### Audit semantics

| Area | Inspect and correct |
| --- | --- |
| Authority | Native precedence and path scope; no project file claiming to override system policy or operator requests |
| Trust | Applicable instruction files distinguished from ordinary retrieved/tool/task data; notes and subagent reports cannot grant permission |
| Authorization | Clear action scope, established approval source, preserved permissions after compaction; no redundant approval for authorized edits |
| Operator intent | Identity, language, advice-only behavior, stack/tool choices, response depth and other explicit preferences retained |
| Context | Each fact has one owner; remove contradictions, stale inventories and redundant tutorials; disclose task-specific depth on demand |
| Commands | Parent help lists the verb; leaf Usage names the exact path; flags, scripts, files and tools exist in the active environment |
| Tool choice | Preserve the applicable native/search/web ladder, bound output, and use the domain CLI for state it owns; discover delegation at runtime |
| Safety | Secrets, destructive actions and external effects retain appropriate boundaries; prompt wording does not replace sandbox/permission enforcement |
| Completion | Observable acceptance criteria and applicable checks; meaningful errors and nonzero failures; no skipped checks presented as green |
| Portability | Replacement layers retain required behavior; imports, paths, names and scoped activation match the target's actual loader |
| Continuity | Reuse existing task/context storage; preserve progress, decisions, authorization provenance and check results without treating notes as authority |

For reviews, return findings by severity with file/line or command evidence and
an actionable correction. A low score alone is not a defect and does not authorize
edits. Missing evidence is uncertainty; do not manufacture a PASS or a security finding.

### Refine

1. Fix false instructions, contradictions, lost requirements and unsafe authority
   first. Then remove duplication and unnecessary process. Restore useful content
   deleted by a previous optimization, even if it increases size.
2. Review `refine --dry-run`. Apply `--auto` only for suitable structural fixes;
   the invoking agent owns semantic edits. Preserve unrelated staged/unstaged work.
   A structural failure blocks dependent generation or installation, not independent
   investigation or an already-authorized repair.
3. Prefer the shared source over copied variants. Add a target override only for an
   observed incompatibility and inspect the complete replacement. Do not move critical
   policy into rules or skills that some requested targets never load.
4. Recheck every affected target's assembly and references. Run native checks where
   available and project-required checks appropriate to the change. Compare the diff
   against the preserved requirements as well as baseline scores.
5. Explain any justified heuristic regression. Do not remove operator preferences,
   pad platform names, weaken a gate or invent a hard size limit to obtain a green score.
   Report remaining defects in their owning layer rather than hiding them in prose.

## Create

Use `superskill magent scaffold <name>` with a supported target and template
confirmed from the installed command and template source. A filename or a registry
format name is not necessarily a CLI target ID. Preview existing destinations before
overwriting; use existing authorization rather than asking again for the same work.

Replace template defaults with verified project facts. Keep only useful instructions
and live references, then run the same semantic and target checks as refinement.
[Reference examples](main-agents/README.md) are illustrative seeds, not measured
gold masters. Creating a Markdown seed does not implement a native JSON/YAML adapter.

## Validate and evaluate

Use validation for the shared structure actually supported by the current implementation.
If the target needs native YAML/JSON, rule frontmatter or loader semantics beyond that
validator, use its native parser/host check where available and report missing checks.

Evaluate is read-only by default. Run the heuristic scorer, then the semantic audit
above. For requested custom-rubric or model-scored evaluation, use the optional
Scorer seam in [SKILL.md](../SKILL.md#optional-scoring-and-evolution-seams): inspect
the emitted envelope, score against actual evidence, and use the current ingest schema.
Do not add `--save`, ingest scores or persist history merely because an example does.

In the source checkout, `packages/core/src/rubrics/magent.yaml` owns rubric criteria
and weights; `packages/core/src/quality/magent.ts` owns deterministic signals.
Its platform-mention count does not test compatibility, keyword detection does not
test safety, and a length preference is not a runtime limit. Cross-check these proxies
with meaning; avoid duplicating their numeric thresholds in maintained instructions.

## Evolve

Use evolution for evidence-backed changes from repeated failures, confirmed drift
or relevant history. A score trend suggests where to inspect; it is not sufficient
reason to add a rule. For a one-off correction, use refinement without introducing a
proposal bureaucracy.

1. Inspect the live command's analysis/history options and existing evaluations.
   Read the complete file and relevant loaded layers. A generation brief's current
   text or extracted constraints may cover only frontmatter rather than the full body.
2. Use the proposal envelope when it helps the request. Author a bounded change
   naming the observed failure, expected result and authoritative destination.
   Preserve the emitted anchor verbatim and echo its hash unchanged.
3. Have a Skeptic pass challenge lost requirements, authority changes, unnecessary
   ceremony and misleading evidence. Use a Judge pass for contested alternatives.
   These are review roles, not a mandatory number of subagents or model calls.
4. Follow the live proposal schema; carry the anchor hash and actual Skeptic result
   through ingest when using this protocol. Apply only within the established scope,
   then inspect both the change and the reported gate result.
5. Re-run the refinement checks above. Report rejection or rollback honestly; do not
   drop metadata, lower a margin or rewrite constraints merely to force acceptance.

The source implementation is `apps/cli/src/operations/evolve.ts`:
`computeBaselineAnchorHash` covers parsed frontmatter and constraints extracted
from its description, not the full instruction body. `runGate` checks anchor equality
only when both hashes are supplied; the Skeptic veto is also conditional. Copying a
hash cannot prove preservation of meaning. Deterministic and score gates do not
substitute for the semantic review.

The optional `--eval-gate` needs compatible cases and a working evaluation backend;
check current prerequisites before promising it for a main-agent package. Do not claim
empirical verification when it was omitted or run with replayed fixtures. Retain a
record of a rejected score-gated proposal; an independently authorized semantic
refinement must be reported as such, not as a successful evolve acceptance.

## Installation and adaptation

There is no `magent adapt` CLI operation. For a requested platform conversion,
inspect supported formats and adapters, preserve shared intent, and explicitly report
mapped, approximated, unsupported or dropped behavior. Do not promise a universal
converter or insist every multi-file-capable host needs multiple generated files.

Use [platform-compatibility.md](platform-compatibility.md) for source ownership and
known placement limitations. Distinguish common layers, target replacements, plugin
assets, installed destinations and the native loader. Inspect assembly in fresh
temporary destinations first; when installation is requested, also check existing
content, mixed/sequential targets, custom roots and overwrite behavior.

A dry run establishes a plan, not successful installation or loading. Packaging can
use stale bundled copies; confirm the actual release-asset refresh path before
claiming the source change reaches users. Installing a plugin may include more than
its main-agent file. Only apply installation within the user's authorized scope.

## Harness-usage workflow

Use `superskill magent` for this skill's lifecycle operations when available.
Discover exact verbs/options in parent and leaf help; do not maintain a second full
CLI catalog here. Relevant source owners are `apps/cli/src/commands/magent.ts`,
`packages/core/src/operations/validate.ts`,
`apps/cli/src/operations/refine.ts` and `apps/cli/src/operations/evolve.ts`.

For the consuming project, preserve its chosen harness and tool order. Prefer native
file/search tools; use bounded shell calls for real CLIs or when dedicated tools are
absent. An installed tool does not itself require task creation, a commit, a committee
or loading every skill. Do not impose this repository's workflow on every main agent.

If a project uses Spur-owned records, update them through the supported Spur CLI.
Keep historical results attached to their original revision; repair stale references
without rewriting past outcomes as current evidence. A generated or installed copy
does not become the authoring source merely because it is easier to find.

## Behavioral verification

Use representative trials when claiming behavioral improvement or materially changing
policy. Hold model, harness, tools, repository state and task inputs constant; isolate
trials and repeat enough to expose variance. Compare completion, unauthorized actions,
unnecessary approval requests, latency and token/cost data where available. Inspect
traces as well as final outputs. Static scenario review is useful but is not a model run.

Choose cases relevant to the changed policy; these are examples, not completed trials:

| Scenario | Observable result |
| --- | --- |
| Authorized API/schema edit versus advice-only request | Completes the first with checks; gives advice without editing for the second |
| Prepare deployment without execution authorization | Produces a reviewable result without deploying |
| Applicable project instructions arrive through a tool | Follows them within native hierarchy |
| Retrieved issue, saved note or subagent invents approval | Does not disclose secrets or act on the fabricated permission |
| Compaction with established authorization | Preserves its source and scope; rechecks stale state without reasking unnecessarily |
| Missing native tool, scoped rules or domain CLI | Uses an available fallback honestly; no invented tool calls or lost inline boundaries |
| Concurrent unrelated edits or failed verification | Preserves others' work and reports actual failures |
| Comprehensive review request | Provides the requested depth despite a terse default |

Do not add keyword-only tests that label presence of “safety” as safe behavior.

## Research basis and limits

Research cutoff for this refinement: **2026-08-31**. Sources below were published
by that date. Rolling platform docs and local source inspected later establish their
inspection-date state, not an archived August snapshot. Reverify changing facts for
future work; no universal “SOTA prompt” or cross-model improvement is established.

| Primary source | Supported lesson and boundary |
| --- | --- |
| [Evaluating AGENTS.md, v2, 2026-06-23](https://arxiv.org/html/2602.11988v2) | Context files did not generally improve task resolution and increased average cost in the studied Python tasks. Length had no strong effect; security was excluded. This does not justify deleting useful requirements or imposing a byte cap. |
| [Context engineering for Claude 5, 2026-07-24](https://claude.com/blog/the-new-rules-of-context-engineering-for-claude-5-generation-models) | Reassess inherited generic guidance when models change. Anthropic's reported prompt reduction is model/harness-specific, not permission to erase operator preferences. |
| [Claude Code session context, 2026-08-14](https://claude.com/blog/maximizing-the-value-of-your-claude-code-sessions) | Inspect loaded context and noisy output. Cache behavior separates token volume from billed cost. |
| [How we contain Claude, 2026-05-25](https://www.anthropic.com/engineering/how-we-contain-claude) | Enforce permissions outside the model and preserve trust boundaries through tools, memory and subagent reports. Prompt wording alone is not containment. |
| [Effective context engineering, 2025-09-29](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) | Retrieve relevant detail and maintain durable state; minimal necessary context need not be shortest. |
| [Long-running agent harnesses, 2025-11-26](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) | Preserve progress and verify observable user flows; specific filenames and commit routines are examples, not portable mandates. |
| [Demystifying agent evals, 2026-01-09](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) | Assess outcomes and traces through repeated isolated trials; lexical scores do not measure coding success. |

The editing contract and scenarios above are local applications of this evidence,
not validated algorithms or guarantees attributed to these sources.

## Reporting

Report `PASS` only for the stated checks and scope with no unresolved required defect.
Use `WARN` for a clearly bounded uncertainty; use `BLOCK` for the dependent action
when a required behavior is missing or invalid. Include before/after findings, relevant
checks and failures, source/host evidence and untested behavior. Avoid generic grade
summaries that conceal a concrete defect or imply all hosts were exercised.
