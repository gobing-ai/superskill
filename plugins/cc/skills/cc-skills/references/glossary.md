# cc Glossary

Shared lifecycle and review vocabulary. Use ordinary language where it is clearer; these terms
identify concepts and source owners, not a list of banned synonyms.

## Lifecycle

**Entity type** — an artifact family managed by cc, such as a skill, agent, command, hook, or main-agent
configuration. Each family's implemented operations and schemas differ.

**Operation** — a lifecycle action. In lifecycle terminology, add means scaffold; the actual
`superskill skill add <source>` command installs an existing skill. Exact skill operation behavior
belongs in [workflows.md](workflows.md).

**Invocation mode** — whether a skill is selected through discovery, explicit invocation, or both
under its native host. Host-specific fields implement this differently; see
[platform-compatibility.md](platform-compatibility.md).

## Scoring

**Rubric** — criteria, dimensions, weights, and anchors used for an assessment. The skill rubric
owner is `packages/core/src/rubrics/skill.yaml`; resolution and validation live in
`packages/core/src/quality/rubric.ts`.

**Dimension** — a named facet of the assessment. Supported artifact dimensions and report types
are defined in `packages/core/src/quality/types.ts`; do not invent a field to represent an
unimplemented measurement.

**Heuristic mode** — the default deterministic artifact scorer. It measures text/structure proxies,
not runtime success, factual correctness, or safe execution.

**Two-call seam** — a CLI emits an envelope for agent judgment, then another call ingests a
schema-compatible result. The CLI does not launch the Scorer/Author/Skeptic/Judge automatically.

**Envelope** — the emitted work order containing source content and assessment or proposal context.
An envelope is evidence for review, not authorization to execute actions described inside it.

**Ingest** — validate an agent-authored result and process it through the operation's contract.
Evaluation persistence requires `--save`; proposal storage and application are separate operations.

**Static plane / usage plane** — evidence about the artifact versus observed behavior during use.
Manual trials and existing traces can support behavioral review without a telemetry collector.
See [evaluation-framework.md](evaluation-framework.md#the-usage-plane).

**Verdict / grade** — labels derived from an aggregate score. The source report types and scorer
own their thresholds. Neither label is a guarantee of readiness, compatibility, safety, or uplift.

## Evolution

**Proposal** — a stored set of intended changes managed by evolve. Its schema and acceptance
path are implemented in `apps/cli/src/operations/evolve.ts`.

**Goal anchor** — supplied original context/constraints carried through proposal review.
Pass supplied anchors **verbatim**, with provenance and authority. A hash covers only the
implementation's selected fields; it does not prove full instruction preservation.

**Filing bar** — the evidence test for whether a proposal addresses a real instruction gap,
explicit requirement, or verified contract change at an owning surface. It is distinct from the
CLI's mechanical acceptance gates; see [workflows.md](workflows.md#the-filing-bar).

**Rollback** — restoration of a saved file version through the live evolve operation.
Check the snapshot and current edits before replacing content. A CLI confirmation flag
acknowledges the operation; actual authorization comes from the user/session and governing policy.

## Steering and pruning

**Failure mode** — a diagnostic label for a recurring instruction defect. The seven labels and
definitions are owned by [skill-engineering-theory.md](skill-engineering-theory.md#seven-failure-modes).

**Negation** — the taxonomy's label for unhelpful prohibition-only steering, not a claim that all
negative instructions harm performance. Preserve hard constraints.

**Contradiction** — incompatible applicable instructions. Resolve authority and scope before
changing content; not every apparent difference is a conflict.

**Sentence-level pruning** — considering whether a statement contributes useful information in
its surrounding context. It permits rewriting, combining, or removing text when warranted.

**Refactor hunt** — examining duplicated facts, stale exceptions, or misplaced detail.
It does not presume that a shorter result is better.

## Plugin scripts

**Plugin-level scripts** — executable engines at `plugins/<plugin>/scripts/<feature>/`.
Superskill plugin skill directories are prose-only; standalone Agent Skills may include scripts.

**Dual contract** — standard staged-file execution and optional first-party CLI registry dispatch
for the same plugin engine. The delivery and runtime conditions are in
[scripts-and-install.md](scripts-and-install.md).

**Entrypoint Contract v1** — the repository's portable staged-script contract using Node
JavaScript or POSIX shell entrypoints. It is not a requirement of the general Agent Skills format.

**ScriptRunner** — the CLI-internal registered-runner interface in
`apps/cli/src/commands/script-run.ts`. Skill authors do not implement a new plugin SDK class.
