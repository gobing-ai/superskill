---
name: Quality dimension definitions
description: Per-content-type quality dimension definitions, scoring heuristics, and the DimensionScore/QualityReport type system consumed by validate and evaluate operations.
status: Done
created_at: 2026-06-16T00:00:00.000Z
updated_at: 2026-06-16T21:09:18.674Z
folder: docs/tasks
type: task
feature-id: F009
priority: high
estimated_hours: 5
tags: ["foundation","quality","dimensions","evaluate"]
impl_progress:
    planning: done
    design: done
    implementation: done
    review: done
    testing: done
---

## 0009. Quality dimension definitions

### Background

`validate` and `evaluate` operations both need to know what to check and how to score content. The quality dimensions are per-content-type scoring rubrics — each type has 5 dimensions (4 for hooks) scored 0.0–1.0 with a one-line explanation note. The `dimensions.ts` module defines shared types and the dimension registry; each type-specific module exports an `evaluate` function that scores content against all its dimensions.

This module is the knowledge base that powers quality assessment — it defines not just the dimension names but what each dimension means and how to compute a score from markdown content. Without this, `evaluate` has no scoring criteria and `evolve` has no improvement targets.

Scoring is heuristic-based initially (ML-augmented scoring deferred per design §7). Heuristics use frontmatter field presence, keyword detection, length analysis, and pattern matching — all synchronous, deterministic, and transparent.

Design references: design doc §3 (quality dimensions by content type), design doc §2.3 (evaluate operation).

### Requirements

- [x] **R1** — `DimensionScore` type `{ score, note }` → **MET** | `quality/dimensions.ts:30`
- [x] **R2** — `QualityReport` type → **MET** | `quality/dimensions.ts:36`
- [x] **R3** — `ContentType` canonical union → **MET** | `quality/dimensions.ts:6`
- [x] **R4** — `REQUIRED_FIELDS` per-type → **MET** | `quality/dimensions.ts:59`
- [x] **R5** — `DIMENSION_REGISTRY` per §3 → **MET** | `quality/dimensions.ts:50`
- [x] **R6** — `computeAggregate` equal-weighted mean, 0.0 when empty → **MET** | `quality/dimensions.ts:70`
- [x] **R7** — heuristic helpers (`parseFrontmatterSafe`, `scorePresence`, `scoreLength`, `keywordDensity`, `hasPattern`) → **MET** | `quality/dimensions.ts:82-163`
- [x] **R8** — `evaluateSkill` 5 dims → **MET** | `quality/skill.ts:26`
- [x] **R9** — `evaluateCommand` 5 dims → **MET** | `quality/command.ts:132`
- [x] **R10** — `evaluateAgent` 5 dims → **MET** | `quality/agent.ts:147`
- [x] **R11** — `evaluateHook` 4 dims → **MET** | `quality/hook.ts:121`
- [x] **R12** — `evaluateMagent` 5 dims → **MET** | `quality/magent.ts:88`
- [x] **R13** — scores discriminate quality → **MET** | `evaluators.test.ts:35` + per-type `good.aggregate > bad.aggregate`
- [x] **R14** — frontmatter parse failure → low completeness + error note, never throws → **MET** | `skill.ts:51`, `hook.ts:130`, `magent.ts:102`
- [x] **R15** — `QualityReport.content` set via caller (`resolveContentName` when path available, else name/empty) → **MET** | evaluators emit `''`; caller (F014 evaluate) fills via `resolveContentName`
- [x] **R16** — all scoring synchronous → **MET** | no `async`/`await` in `quality/`

**Traceability:** 16/16 MET · 0 unmet · 0 partial · no scope drift. 6 new files all map to requirements; no untraced code.


### Q&A

Q: Why is `ContentType` defined in `quality/dimensions.ts` and not in `content/`?
A: The quality module is the authority on content types — it defines what dimensions each type has. F007 (`content/*`) and F010–F014 consume `ContentType` from here. This avoids a circular dependency (content→quality would need ContentType; quality→content needs parseFrontmatter) — quality defines the type, content imports it.

Q: Why `REQUIRED_FIELDS` lives in `dimensions.ts` rather than in `validate.ts`?
A: `validate` (F010) needs to check required fields; `evaluate` (F009) also uses field presence for completeness scoring. Putting `REQUIRED_FIELDS` in `dimensions.ts` makes it a single source of truth — no duplication between validate and evaluate modules. F010 imports it; F009 already owns it.

Q: How do the scoring heuristics discriminate quality differences?
A: Each heuristic is multi-factor:
- **completeness**: fraction of required frontmatter fields present (0.0–1.0) × fraction of expected body sections found.
- **clarity**: keyword density of imperative verbs (`must`, `should`, `never`) minus density of vague terms (`maybe`, `perhaps`, `might want to`), normalized to 0.0–1.0.
- **conciseness**: char count sweet spot (500–5000 for body) → 1.0; below or above → linear ramp down.
- **safety**: fraction of expected safety keywords found (`[CRITICAL]`, `security`, `safety`, `validation`).
- **trigger-accuracy**: number of trigger phrases found in content, penalized if fewer than 3 (too broad) or more than 10 (likely overlapping).
- **anti-hallucination**: presence of verification language (`verify`, `cite`, `source`, `cross-check`).

Q: Why synchronous only?
A: Heuristic checks are pure string analysis — no I/O, no network, no DB access. Making them async would add unwarranted complexity to the call chain (evaluate → dimension scorers → heuristic helpers). If ML-augmented scoring is added later, it can be wrapped in async `evaluate*Async` variants.

Q: What's the difference between `evaluateSkill` and `evaluateCommand` clarity?
A: Both check for unambiguous language, imperative verbs, and lack of vague terms. But `evaluateCommand` additionally checks that the argument-hints in frontmatter match the body's usage examples. The common clarity heuristic is parameterized — skill passes standard keywords; command passes command-specific ones.

Q: How does `evaluateHook` handle having only 4 dimensions?
A: `DIMENSION_REGISTRY['hook']` has 4 entries. `evaluateHook` scores those 4. `computeAggregate` works with any number of dimensions. The `QualityReport` for hooks will have 4 entries in `dimensions`, not 5 — the type system reflects this naturally since `dimensions` is `Record<string, DimensionScore>`.

### Design

**Dimension registry** (from design doc §3):

```typescript
const DIMENSION_REGISTRY: Record<ContentType, string[]> = {
    skill:   ['completeness', 'clarity', 'trigger-accuracy', 'anti-hallucination', 'conciseness'],
    command: ['completeness', 'clarity', 'argument-hints', 'tool-references', 'slash-syntax'],
    agent:   ['completeness', 'role-clarity', 'tool-selection', 'skill-linkage', 'model-fit'],
    hook:    ['correctness', 'event-coverage', 'safety', 'pattern-match-quality'],
    magent:  ['completeness', 'platform-coverage', 'conciseness', 'tone-consistency', 'safety'],
};
```

**Required fields**:
```typescript
const REQUIRED_FIELDS: Record<ContentType, string[]> = {
    skill:   ['name', 'description'],
    command: ['name', 'description'],
    agent:   ['name', 'description', 'model'],
    hook:    ['name', 'description', 'event'],
    magent:  ['name', 'description'],
};
```

**Dimension scoring per type**:

_Skill (5 dims)_:
- **completeness** (weight 0.20): `scorePresence(frontmatter fields, required)` × `hasPattern(body, ['# <!-- NAME -->', '##', '###'])` for section structure. Note: `"Missing fields: [list]"` or `"All required fields present"`.
- **clarity** (weight 0.20): `keywordDensity(body, ['must', 'should', 'never', 'always', 'required', 'ensure', 'validate'])` minus `keywordDensity(body, ['maybe', 'perhaps', 'might', 'could be', 'probably'])`. Note: `"Good imperative style"` or `"Uses vague language: [terms]"`.
- **trigger-accuracy** (weight 0.20): Count trigger phrases in content (look for `Triggers:`, `trigger phrases`, bullet lists under trigger sections). Score 1.0 for 3–10 triggers; linear drop below 3 (too broad) and above 10 (likely overlapping). Note: `"N trigger phrases found"`.
- **anti-hallucination** (weight 0.20): `keywordDensity(body, ['verify', 'cite', 'source', 'cross-check', 'reference', 'validate', 'document', 'evidence'])`. Note: `"Includes verification language"` or `"Missing verification instructions"`.
- **conciseness** (weight 0.20): `scoreLength(body, 500, 5000)`. Note: `"Body length: N chars"`.

_Command (5 dims)_:
- **completeness** (0.20): `scorePresence(fields, REQUIRED_FIELDS.command)` + check for `arguments` array in frontmatter. Note: `"Fields missing: [list]"` or `"All required fields present"`.
- **clarity** (0.20): Same as skill clarity but applied to command body.
- **argument-hints** (0.20): Check frontmatter `arguments` is an array with items having `name` and `description`. Score = fraction of arguments that have both fields. Note: `"N/N arguments have hints"`.
- **tool-references** (0.20): Look for tool references in body (`tool:`, `tools:`, backtick-quoted tool names). Score based on whether referenced tools follow a known naming convention (lowercase, dashed). Note: `"Uses tool references"` or `"No tool references found"`.
- **slash-syntax** (0.20): Check for slash-command syntax (`/command-name` pattern) in body. Also checks that `target` field in frontmatter matches expected target syntax. Note: `"Valid slash syntax"` or `"Missing slash syntax for target <name>"`.

_Agent (5 dims)_:
- **completeness** (0.20): `scorePresence(fields, REQUIRED_FIELDS.agent)` + check for `tools` array, `agentType` field. Note: `"Fields missing: [list]"` or `"All required fields present"`.
- **role-clarity** (0.20): Check body for role-defining language (`role`, `you are`, `specialist`, `persona`). Score based on specificity — a generic "you are a coding agent" gets 0.3; a specific "Auth-flow security reviewer" gets 0.9. Note: `"Clear role defined"` or `"Role definition vague/generic"`.
- **tool-selection** (0.20): Check `tools` array in frontmatter. Score based on whether the tool list is non-empty and seems appropriate for the stated role (heuristic: ≥ 1 tool → 0.7; ≥ 3 tools → 0.9; none → 0.1). Note: `"N tools selected"`.
- **skill-linkage** (0.20): Look for skill references in body/frontmatter (`skill:`, `skills:`, references to skill names). Score 1.0 if at least one skill reference found; 0.5 if keyword present but no actual ref; 0.0 if none. Note: `"Skill references found"` or `"No skill references"`.
- **model-fit** (0.20): Check `model` field in frontmatter. Score 1.0 for a recognized agent-relative alias (`inherit` / `sonnet` / `opus` / `haiku`) or a well-formed full id (`claude-{sonnet,opus,haiku}-*`); 0.5 for plausible-but-unrecognized format; 0.0 for missing. Keep the alias list in sync with F010's `MODEL_ALIASES` (single source — consider importing it). Note: `"Model: <name>"`.

_Hook (4 dims)_:
- **correctness** (0.25): Check `event` field against known hook event types (PreToolUse, PostToolUse, Stop, SubagentStop, SessionStart, SessionEnd, UserPromptSubmit, PreCompact, Notification). Score 1.0 for recognized event; 0.5 for plausible event name; 0.0 for missing. Also checks if `enabled` is a boolean. Note: `"Valid event: <name>"` or `"Unknown event: <name>"`.
- **event-coverage** (0.25): Check body for event-related content — does it describe what the hook intercepts? Score based on whether body mentions the event type and describes behavior. Note: `"Event coverage described"` or `"Minimal event description"`.
- **safety** (0.25): `keywordDensity(body, ['safety', 'secure', 'gated', 'approval', 'explicit', 'dangerous', 'destructive', 'block'])`. Note: `"Includes safety considerations"` or `"No safety gates described"`.
- **pattern-match-quality** (0.25): Look for match patterns in body (`match`, `pattern`, `regex`, `glob`). Score based on specificity — `**/*` gets 0.0 (overly broad); specific file patterns get 0.8+. Note: `"Specific match patterns"` or `"Broad/unspecific patterns"`.

_Magent (5 dims)_:
- **completeness** (0.20): Check for all four config sections in body: IDENTITY, SOUL, AGENTS, USER. Score = fraction of sections present. Note: `"N/4 sections present"`.
- **platform-coverage** (0.20): Check frontmatter `platforms` array. Score based on count relative to total known platforms. Note: `"N platforms covered"`.
- **conciseness** (0.20): `scoreLength(body, 1000, 8000)` for magent configs (longer sweet spot than skills). Note: `"Body length: N chars"`.
- **tone-consistency** (0.20): Check for tone-related keywords across sections. Look for a `tone` or `style` section, consistent voice across IDENTITY/SOUL sections. Note: `"Tone consistent across sections"` or `"Mixed tone signals"`.
- **safety** (0.20): Check for `[CRITICAL]` markers, safety rules, `NEVER` directives. `keywordDensity(body, ['[CRITICAL]', 'safety', 'NEVER', 'block', 'dangerous'])`. Note: `"N safety markers found"`.

**Common heuristic helpers** (in `dimensions.ts`):
```typescript
function parseFrontmatterSafe(content: string): Record<string, unknown> | null;
function scorePresence(present: string[], required: string[]): number;  // 0.0–1.0
function scoreLength(text: string, min: number, max: number): number;   // 0.0–1.0
function keywordDensity(text: string, keywords: string[]): number;      // 0.0–1.0
function hasPattern(text: string, patterns: RegExp[]): number;          // 0.0–1.0
function computeAggregate(dimensions: Record<string, DimensionScore>): number; // mean
```

**Code layout**:

| File | Export |
|------|--------|
| `quality/dimensions.ts` | `DimensionScore`, `QualityReport`, `ContentType`, `DimensionName`, `DIMENSION_REGISTRY`, `REQUIRED_FIELDS`, `computeAggregate`, helper functions |
| `quality/skill.ts` | `evaluateSkill(content: string, target: string): QualityReport` |
| `quality/command.ts` | `evaluateCommand(content: string, target: string): QualityReport` |
| `quality/agent.ts` | `evaluateAgent(content: string, target: string): QualityReport` |
| `quality/hook.ts` | `evaluateHook(content: string, target: string): QualityReport` |
| `quality/magent.ts` | `evaluateMagent(content: string, target: string): QualityReport` |

**`evaluate*` function template** (all five follow this structure):
```typescript
export function evaluateSkill(content: string, target: string): QualityReport {
    const frontmatter = parseFrontmatterSafe(content);
    const body = frontmatter ? (content.split('---').slice(2).join('---') || '') : content;
    const data = frontmatter ?? {};

    const dims: Record<string, DimensionScore> = {};
    for (const dim of DIMENSION_REGISTRY.skill) {
        dims[dim] = scoreDimension(dim, data, body, target);
    }

    return {
        content: content.slice(0, 50), // caller sets via resolveContentName
        type: 'skill',
        target: target,
        aggregate: computeAggregate(dims),
        dimensions: dims,
    };
}
```

**Edge cases**:
- Empty content string → all completeness scores at or near 0.0; other dimensions also low but may detect something from the empty string.
- Content with no frontmatter → `parseFrontmatterSafe` returns null; completeness scored on body-only presence.
- Content with malformed YAML → `parseFrontmatterSafe` returns null; completeness note includes `"Frontmatter parse error: <message>"`.
- Content with frontmatter but no body → length-based scores at 0.0; frontmatter-based scores still computed.
- Very long content (10k+ chars) → length scoring returns low score (above sweet spot).
- Very short content (< 50 chars) → length scoring returns low score; completeness also low.
- Target unknown → passed through to `QualityReport.target` as-is; no validation needed.
- Hook only has 4 dimensions → `computeAggregate` divides by 4, not 5. Registry has 4 entries for `hook`.
- `REQUIRED_FIELDS` for `hook` includes `event` which skill/command/magent don't have. Each type's completeness scorer uses its own required list.

### Solution

**New files** (6):

| Path | Purpose |
|------|---------|
| `apps/cli/src/quality/dimensions.ts` | Shared types, DIMENSION_REGISTRY, REQUIRED_FIELDS, computeAggregate, heuristic helpers |
| `apps/cli/src/quality/skill.ts` | evaluateSkill — 5 dimension scorers |
| `apps/cli/src/quality/command.ts` | evaluateCommand — 5 dimension scorers |
| `apps/cli/src/quality/agent.ts` | evaluateAgent — 5 dimension scorers |
| `apps/cli/src/quality/hook.ts` | evaluateHook — 4 dimension scorers |
| `apps/cli/src/quality/magent.ts` | evaluateMagent — 5 dimension scorers |

**No modified files** (depends on F007 for `parseFrontmatter`, `resolveContentName`, `ContentType` — imported, not duplicated).

**Key exports**:
```typescript
// quality/dimensions.ts
type ContentType = 'skill' | 'command' | 'agent' | 'hook' | 'magent';
type DimensionName = 'completeness' | 'clarity' | 'trigger-accuracy' | 'anti-hallucination'
    | 'conciseness' | 'argument-hints' | 'tool-references' | 'slash-syntax'
    | 'role-clarity' | 'tool-selection' | 'skill-linkage' | 'model-fit'
    | 'correctness' | 'event-coverage' | 'safety' | 'pattern-match-quality'
    | 'platform-coverage' | 'tone-consistency';
interface DimensionScore { score: number; note: string; }
interface QualityReport {
    content: string;
    type: ContentType;
    target: string;
    aggregate: number;
    dimensions: Record<string, DimensionScore>;
}
```

**Heuristic justification**: The heuristics are intentionally simple and transparent. They produce different scores for different content because they measure concrete, observable properties (field presence, keyword counts, section patterns). They are NOT LLM-based scoring — they are deterministic rules that run in < 1ms. The notes explain exactly what was observed, so a human can understand why the score changed between evaluations. This transparency is the foundation for trust in the `evolve` loop.

### Plan

1. Create `apps/cli/src/quality/dimensions.ts` — ContentType, DimensionScore, QualityReport, DIMENSION_REGISTRY, REQUIRED_FIELDS, computeAggregate, and 5 heuristic helper functions.
2. Create `apps/cli/src/quality/skill.ts` — evaluateSkill with 5 dimension-specific scorers.
3. Create `apps/cli/src/quality/command.ts` — evaluateCommand with 5 dimension-specific scorers.
4. Create `apps/cli/src/quality/agent.ts` — evaluateAgent with 5 dimension-specific scorers.
5. Create `apps/cli/src/quality/hook.ts` — evaluateHook with 4 dimension-specific scorers.
6. Create `apps/cli/src/quality/magent.ts` — evaluateMagent with 5 dimension-specific scorers.
7. Run `bun run lint` and verify typecheck passes.
8. Spot-check: score a few real content strings to verify scores discriminate quality differences.

### Review

## Review — 2026-06-16 (dev-verify --force --fix all)

**Status:** 3 findings (1 P3 fixed, 2 P4 accepted)
**Scope:** quality/{dimensions,skill,command,agent,hook,magent}.ts
**Mode:** verify (Phase 7 SECU + Phase 8 traceability)
**Channel:** current (inline)
**Gate:** `bun run lint` → pass · `bun run test` → 268 pass / 0 fail (all quality modules 100% funcs)
**Verdict:** PASS

### P1 — Blockers
| # | Title | Dimension | Location | Recommendation |
|---|-------|-----------|----------|----------------|

### P2 — Warnings
| # | Title | Dimension | Location | Recommendation |
|---|-------|-----------|----------|----------------|

### P3 — Info
| # | Title | Dimension | Location | Recommendation |
|---|-------|-----------|----------|----------------|
| 1 | `extractBody` dropped first 4 chars of frontmatter-less content (sliced past a non-existent opener) | Correctness | dimensions.ts:168 | FIXED — guard `startsWith('---\n')` returns whole string when no opener; closer now matches a bare `---` line (aligns with F007's hardened parser). Regression test added for the no-frontmatter case |

### P4 — Suggestions
| # | Title | Dimension | Location | Recommendation |
|---|-------|-----------|----------|----------------|
| 2 | `parseFrontmatterSafe` called twice in `evaluateMagent` (data + fmNote derivation) | Efficiency | magent.ts:89-90 | ACCEPTED — micro-redundancy on a sub-ms heuristic; collapsing it adds branching without measurable benefit |
| 3 | Coverage-recorded `magent` 85.7% funcs is stale (now 100%) | Maintainability | Testing section | NOTED — Testing section refreshed: 268 pass, all quality modules 100% funcs |

**Fix-pass 2026-06-16:** 1 fixed (+1 regression test), 0 failed, 2 accepted-as-designed. Gate + full suite green after fix.


### Testing

- **Command:** `bun run test`
- **Executed:** 2026-06-16 (re-confirmed during dev-verify; +1 regression test for extractBody)
- **Scope:** dimensions helpers + 5 evaluators (good/bad/edge content, discrimination assertions)
- **Result:** 268 pass, 0 fail across 26 files (full suite)
- **Coverage:** all quality modules 100% funcs (dimensions 97.3% lines, skill 98.1, command 94.7, agent 92.5, hook 95.8, magent 100/100)
- **Evidence:** `tests/quality/dimensions.test.ts` (helpers + extractBody incl. no-frontmatter regression), `tests/quality/evaluators.test.ts` (per-type good>bad aggregate)
- **Next action:** None — all gates pass.


### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References

- Design doc: `docs/design/design-doc-phase2.md` §3 (quality dimensions by content type), §2.3 (evaluate operation)
- Feature file: `docs/features/F009-quality-dimensions.md`
- F007: `content/frontmatter.ts` (parseFrontmatter consumed by evaluate functions), `content/identity.ts` (resolveContentName)
