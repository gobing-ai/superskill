---
feature_id: F009
title: Quality dimension definitions
phase: 2
status: planned
depends_on: [F007]
deliverables:
  - apps/cli/src/quality/dimensions.ts
  - apps/cli/src/quality/skill.ts
  - apps/cli/src/quality/command.ts
  - apps/cli/src/quality/agent.ts
  - apps/cli/src/quality/hook.ts
  - apps/cli/src/quality/magent.ts
created: 2026-06-16
---

# F009 — Quality dimension definitions

## What

Define quality dimensions per content type (5 dimensions each except hook which has 4). Each dimension is scored 0.0–1.0 with a one-line note. `dimensions.ts` exports the shared types (`DimensionScore`, `DimensionEvaluator`, `QualityReport`) and the dimension registry. Each type-specific file exports an `evaluate` function that scores content against all its dimensions.

## Why

`validate` and `evaluate` operations both need to know what to check and how to score it. The dimension definitions are the knowledge base that powers quality assessment. Without them, `evaluate` has no scoring criteria and `evolve` has no improvement targets.

## Change

### `quality/dimensions.ts`

- Export `DimensionName` type: string union of all dimension names across types.
- Export `DimensionScore` type: `{ score: number, note: string }` — score is 0.0–1.0.
- Export `QualityReport` type: `{ content: string, type: ContentType, target: Target, aggregate: number, dimensions: Record<string, DimensionScore> }`.
- Export `DimensionEvaluator` type: `(content: string, target: string) => DimensionScore`.
- Export `ContentType` type: `'skill' | 'command' | 'agent' | 'hook' | 'magent'` — the canonical definition; F007 `content/*` and F010–F014 import `ContentType` from here.
- Export `REQUIRED_FIELDS: Record<ContentType, string[]>` — the type-specific required frontmatter fields consumed by `validate` (F010), e.g. `agent: ['name','description','model']`, `hook: ['name','description','event']`. This lives here (not duplicated in F010) so the field list has one owner.
- Export `DIMENSION_REGISTRY: Record<ContentType, string[]>` mapping each content type to its dimension names:

```
skill:    ['completeness', 'clarity', 'trigger-accuracy', 'anti-hallucination', 'conciseness']
command:  ['completeness', 'clarity', 'argument-hints', 'tool-references', 'slash-syntax']
agent:    ['completeness', 'role-clarity', 'tool-selection', 'skill-linkage', 'model-fit']
hook:     ['correctness', 'event-coverage', 'safety', 'pattern-match-quality']
magent:   ['completeness', 'platform-coverage', 'conciseness', 'tone-consistency', 'safety']
```

### `quality/skill.ts`

- Export `evaluateSkill(content: string, target: string): QualityReport`
- Dimensions: completeness, clarity, trigger-accuracy, anti-hallucination, conciseness (from design doc §3).
- Reads frontmatter via `parseFrontmatter` (F007) — does **not** hand-parse the `---` block. Frontmatter that fails to parse yields a low `completeness` score with an explanatory note rather than throwing.
- Each dimension is scored heuristically (frontmatter field presence, description length, trigger phrase uniqueness, verification language, filler-phrase detection).
- Aggregate = mean of all dimension scores. `QualityReport.content` is set via `resolveContentName` when a path is available, else the caller-supplied name.

### `quality/command.ts`

- Export `evaluateCommand(content: string, target: string): QualityReport`
- Dimensions: completeness, clarity, argument-hints, tool-references, slash-syntax.

### `quality/agent.ts`

- Export `evaluateAgent(content: string, target: string): QualityReport`
- Dimensions: completeness, role-clarity, tool-selection, skill-linkage, model-fit.

### `quality/hook.ts`

- Export `evaluateHook(content: string, target: string): QualityReport`
- Dimensions: correctness, event-coverage, safety, pattern-match-quality (4 dims — fewer than other types).

### `quality/magent.ts`

- Export `evaluateMagent(content: string, target: string): QualityReport`
- Dimensions: completeness, platform-coverage, conciseness, tone-consistency, safety.

## Acceptance

```
import { evaluateSkill } from './quality/skill';
const report = evaluateSkill(skillContent, 'claude');
// report.aggregate is 0.0–1.0
// report.dimensions.completeness.score is 0.0–1.0
// report.dimensions.completeness.note is a string
```
