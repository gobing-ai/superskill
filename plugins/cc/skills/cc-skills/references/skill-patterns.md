# Workflow Patterns

Choose a workflow shape only when the task needs it. These are reusable design options, not a
requirement to turn every skill into a pipeline or a claim of universal benchmark superiority.
Interaction roles are covered separately in [skill-patterns-adk.md](skill-patterns-adk.md).

## Pattern selection

| Pattern | Fits when | Essential design choice |
|---|---|---|
| Sequential workflow | Later work depends on earlier results | Name each dependency and completion evidence; do not serialize independent work unnecessarily. |
| Multi-service coordination | One authorized task spans different tools or services | Carry identifiers and provenance between steps; distinguish drafts from external writes. |
| Iterative refinement | A useful criterion can guide another attempt | Bound effort, retain the baseline, and stop on satisfied criteria or lack of useful progress. |
| Context-aware tool selection | Available tools or input shape change the route | Check actual capabilities and explain a fallback when its result differs. |
| Domain-specific intelligence | The agent needs project or specialist facts | Point to verified, version-applicable sources and encode the decisions those facts affect. |
| Composable library | Several workflows share stable, useful operations | Reuse existing tools/engines with explicit inputs and outputs; avoid a speculative SDK. |

## Sequential workflow

An illustrative data-import skill might:

1. Read the requested source and current schema.
2. Validate field types and report incompatible records.
3. Generate a preview at the requested output location.
4. Apply the import only within the authorized scope, then check resulting records.

Steps depend on prior outputs. A review-only request stops at findings or preview; a stage boundary
does not automatically require another user confirmation. Reuse established authorization.

## Multi-service coordination

Pass stable IDs and necessary evidence instead of copying whole transcripts between systems.
Check for existing artifacts before retrying creation. Preserve idempotency and failure recovery
where an external operation can partially succeed.

Tool access is not authority to publish, message, assign work, or deploy. A generated draft and a
sent message are different outcomes. Keep the workflow aligned with the requested result.

## Iterative refinement

Fix acceptance criteria before generating candidates. Compare artifacts or resulting state, preserve
relevant constraints, and record remaining defects. Do not keep retrying until a model reviewer has
only cosmetic comments, or lower the criterion to manufacture a pass.

Use fresh context or independent review only when available, authorized, and useful. The calling
agent can perform a bounded self-review without mandatory subagents.

## Context-aware tool selection

Prefer an available native capability or established project tool. Read actual input constraints
before routing: a text extractor may not handle scanned images, and a dry-run API may not reproduce
write-time behavior. Report a missing capability rather than fabricate output.

A fallback should retain the required outcome and boundaries. If it cannot, identify the unsupported
part and continue independent work that remains useful.

## Domain-specific intelligence

Keep facts near their authoritative source and pin versions where behavior depends on them.
Use examples for the errors the model is likely to make in that domain. Do not copy legal,
financial, or operational mandates from an unrelated example into a new skill.

## Composable library

Share an operation when multiple actual consumers need it. Keep the interface small and explicit;
do not require a class hierarchy, orchestrator, or persistent store for one caller.
For superskill plugin engines, use [scripts-and-install.md](scripts-and-install.md).

Validate the chosen pattern through [evaluation-framework.md](evaluation-framework.md).
A pattern name or metadata tag does not make a host execute that structure.
