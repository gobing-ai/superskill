# ADK Interaction Patterns

This guide documents the five Google ADK interaction patterns as an **additive behavior layer** for cc skills.

Use this guide together with:
- [skill-patterns.md](skill-patterns.md) for cc workflow heuristics
- [skill-categories.md](skill-categories.md) for business-purpose categories

## What This Adds

The ADK patterns do **not** replace `technique`, `pattern`, or `reference`.

They answer a different question:
- **Type**: what the skill contains
- **Interaction pattern**: how the skill behaves at runtime

## The 5 Patterns

| Pattern | Best For | Typical cc Type | Common Resources |
|---------|----------|------------------|------------------|
| Tool Wrapper | Library or framework expertise on demand | Reference | `references/` |
| Generator | Structured document or artifact creation | Technique | `assets/`, `references/` |
| Reviewer | Rubric, checklist, or audit workflows | Pattern | `references/` |
| Inversion | Requirement gathering before synthesis | Technique | `assets/` optional |
| Pipeline | Ordered workflows with checkpoints | Technique | `references/`, `assets/` |

## Tool Wrapper

Use when the skill should load specific rules or documentation only when relevant.

Signals:
- library/framework-specific work
- references are the source of truth
- the skill is mostly about correct rule application

Recommended metadata:

```yaml
metadata:
  interactions:
    - tool-wrapper
  trigger_keywords:
    - fastapi
    - pydantic
```

## Generator

Use when the skill must produce consistent structured output from a template.

Signals:
- template-driven output
- missing variables must be gathered
- output shape matters as much as content

Recommended metadata:

```yaml
metadata:
  interactions:
    - generator
```

## Reviewer

Use when the skill evaluates code or documents against explicit criteria.

Signals:
- checklist or rubric in `references/`
- severity-grouped findings
- score, summary, and recommendations

Recommended metadata:

```yaml
metadata:
  interactions:
    - reviewer
  severity_levels:
    - error
    - warning
    - info
```

## Inversion

Use when the agent should gather context first and refuse to act early.

Signals:
- interview flow
- one question at a time
- explicit "do not start until ..." gates

Recommended metadata:

```yaml
metadata:
  interactions:
    - inversion
```

## Pipeline

Use when steps must occur in strict order and cannot be skipped.

Signals:
- named stages
- approval gates or stop conditions
- later stages depend on validated earlier output

Recommended metadata:

```yaml
metadata:
  interactions:
    - pipeline
  pipeline_steps:
    - inventory
    - draft
    - review
    - finalize
```

## Composition

Patterns compose when the runtime behavior genuinely combines them.

Examples:
- `["inversion", "generator"]`: collect missing requirements, then fill a template
- `["pipeline", "reviewer"]`: execute a staged workflow, then run a final audit
- `["tool-wrapper", "reviewer"]`: load rules on demand, then critique against them

Use the first item as the primary behavior when ordering matters.

## Decision Tree

```text
What does the skill primarily do?
|
|-- Ask questions before acting? -> inversion
|-- Load rules/docs on demand? -> tool-wrapper
|-- Fill a template into structured output? -> generator
|-- Review against checklist or rubric? -> reviewer
|-- Enforce ordered stages with gates? -> pipeline
```

If none fit cleanly, leave `metadata.interactions` omitted and rely on cc workflow heuristics instead.

## Mapping to cc Guidance

| ADK Pattern | Related cc Heuristic | Relationship |
|------------|------------------------|--------------|
| Tool Wrapper | Context-Aware Tool Selection, Composable Library | Similar runtime loading behavior |
| Generator | Sequential Workflow | Often a structured multi-step technique |
| Reviewer | Iterative Refinement | Often used as the validation stage |
| Inversion | Domain-Specific Intelligence | Sometimes paired when discovery is critical |
| Pipeline | Sequential Workflow | Stronger form with explicit gates |

The cc heuristics remain useful design guidance. ADK patterns simply add a sharper runtime behavior vocabulary.
