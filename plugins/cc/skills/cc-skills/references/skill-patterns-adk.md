# Interaction Patterns

Interaction patterns describe how a skill works with inputs, tools, and the user.
Content types describe how its material is organized: technique for procedures, pattern for
decisions, reference for lookup. These axes can be combined without adding extra machinery.

## The five patterns

| Pattern | Useful when | Boundary |
|---|---|---|
| Tool Wrapper | A tool needs project conventions or domain guidance | Read only relevant references and use the real tool contract. |
| Generator | A requested artifact has a reusable structure | Fill verified inputs into the actual template; inspect the resulting artifact. |
| Reviewer | Work must be assessed against criteria | Keep the target read-only unless edits are requested; cite evidence and distinguish uncertainty. |
| Inversion | Missing requirements materially affect the result | Use available context first, ask only necessary questions, and continue independent work. |
| Pipeline | Dependencies require ordered stages | Define inputs, outputs, and checks for each necessary stage; retain existing authorization. |

## Composition

A generator may use inversion to obtain a missing output schema and a reviewer to check the result.
A tool wrapper may supply domain conventions inside a pipeline. Use only the roles the task needs;
a composition diagram is not itself an execution engine.

For example, a schema-report generator can read the schema, ask about a genuinely unspecified
format, generate the report, and validate its fields. It need not ask the same questions after
the user has supplied answers or stop for approval at every stage.

## Metadata is descriptive

The local evaluator may recognize `metadata.interactions` and related advisory fields.
They do not schedule stages, enforce severity handling, launch reviewers, or guarantee native
support. The portable Agent Skills metadata convention uses string values; array-shaped native/local
extensions should be checked against the target parser rather than added everywhere for a score.

Prefer clear workflow instructions to redundant annotations. Check the applicable rubric/source
before relying on a local heuristic's interpretation.

## Source and limits

The names follow [Lavi Nigam's five ADK skill design patterns](https://lavinigam.com/posts/adk-skill-design-patterns/)
(2026-03-07), a practical taxonomy. This reference adapts the patterns to the active user request,
available tools, and authorization boundaries; it does not claim their labels are universal native
features or evidence that one pattern always performs better.

Use [skill-patterns.md](skill-patterns.md) for workflow structure and
[evaluation-framework.md](evaluation-framework.md) to test whether the chosen design helps.
