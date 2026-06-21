# Evaluation Framework

The authoritative source for dimension weights is `packages/core/src/rubrics/skill.yaml`. This document describes the evaluation model, scoring modes, and rubric resolution. Do not restate weights inline — they drift.

## Scoring Model

Skills are scored across **5 dimensions** with rubric-weighted heuristics:

| Dimension | What It Checks |
|-----------|----------------|
| **completeness** | Required frontmatter fields present? Sections structured? |
| **clarity** | Unambiguous instruction? Penalizes vague verbs. |
| **trigger-accuracy** | Fires on right inputs? Counts trigger phrases. |
| **anti-hallucination** | Prevents fabrication? Checks verification language density. |
| **conciseness** | Short as possible while complete? Penalizes bloat. |

**Verdict:** PASS (≥0.70) / FAIL (<0.70).
**Grade:** A (≥0.90) / B (≥0.75) / C (≥0.60) / D (≥0.45) / F (<0.45).

## Scoring Modes

### 1. Heuristic (default)

Deterministic scorers in `packages/core/src/quality/skill.ts` compute per-dimension scores from frontmatter + body analysis. Rubric weights from `skill.yaml` are applied for the weighted aggregate. No LLM required.

```bash
superskill skill evaluate ./skills/my-skill
# → human: table + verdict + grade + findings + recommendations
# → --json: full QualityReport
```

### 2. Rubric + LLM (two-call seam)

For LLM-enriched scoring:

1. **Envelope-out:** `superskill skill evaluate --rubric skill.yaml --json > envelope.json`
   - Emits content + rubric + heuristic baseline as a JSON work order.
2. **Scorer:** Agent reads the envelope, scores each dimension against rubric criteria, writes `scores.json`.
3. **Ingest-in:** `superskill skill evaluate --ingest scores.json --save`
   - Validates scores against rubric schema, computes weighted aggregate, persists.

This seam keeps LLM scoring offline and auditable.

### 3. Default command surface

The slash command `/cc:skill-evaluate` runs the heuristic mode with rubric weights. It produces a PASS/FAIL verdict, letter grade, per-dimension findings, and actionable recommendations — no LLM call.

## Rubric Resolution

The rubric file is resolved through 4 tiers (implemented in `resolveRubricContent`):

1. `--rubric <path>` flag — explicit override
2. `~/.superskill/rubrics/<type>.yaml` — per-user override
3. `packages/core/src/rubrics/<type>.yaml` — development default
4. `rubrics/<type>.yaml` — production default

The canonical rubric for skills is `packages/core/src/rubrics/skill.yaml` (version 1, 5 dimensions, weights sum to 1.0 ± 0.001).

## Platform-Specific Evaluation

### Claude Code
- Validates `!`cmd`` syntax
- Checks `$ARGUMENTS` usage
- Verifies `context: fork` compatibility
- Validates `hooks:` configuration

### Codex
- Validates `agents/openai.yaml` format
- Checks UI metadata completeness
- Verifies frontmatter strictness (no unknown fields)

### OpenClaw
- Extracts `metadata.openclaw` validation
- Checks emoji configuration
- Validates requires specifications

### OpenCode
- Checks permission configurations
- Validates config-level skill hints
- Verifies skill invocation patterns

### Antigravity
- Validates Gemini CLI compatibility
- Checks for Gemini-specific extensions
- Verifies standard format compliance

## Iterative Improvement

1. Run evaluation: `superskill skill evaluate ./skills/my-skill`
2. Review findings and recommendations
3. Apply refinements: `superskill skill refine <nameOrPath> --auto --save`
4. Re-run evaluation to verify improvements

## Persistence

When `--save` is used, evaluations are stored in SQLite. Use `superskill skill history <name>` to view prior scores and track improvement over time.

## JSON Output

The `--json` output is a `QualityReport` object. The schema is additive (fields added, never removed or renamed):

```json
{
  "content": "my-skill",
  "type": "skill",
  "target": "claude",
  "aggregate": 0.87,
  "dimensions": {
    "completeness": {"score": 1.0, "note": "All required fields present", "findings": [], "recommendations": []},
    "clarity": {"score": 0.86, "note": "Good imperative style"},
    "trigger-accuracy": {"score": 1.0, "note": "5 trigger phrases found"},
    "anti-hallucination": {"score": 0.50, "note": "Includes verification language"},
    "conciseness": {"score": 1.0, "note": "Body length: 14161 chars"}
  },
  "verdict": "PASS",
  "grade": "B"
}
```
