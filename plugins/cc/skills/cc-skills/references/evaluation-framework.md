# Evaluation Framework

The authoritative source for dimension weights is `packages/core/src/rubrics/skill.yaml`. This document describes the evaluation model, scoring modes, and rubric resolution. Do not restate weights inline — they drift.

## Scoring Model

Skills are scored across **5 dimensions** with rubric-weighted heuristics:

| Dimension | What It Checks |
|-----------|----------------|
| **completeness** | Required frontmatter fields present? Sections structured? |
| **clarity** | Unambiguous instruction? Penalizes vague verbs. |
| **trigger-accuracy** | Fires on right inputs? Counts *distinct* trigger branches — synonym clusters collapse to one. |
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
2. **Scorer:** Agent reads the envelope, scores each dimension against rubric criteria, writes `scores.json`. See the Scorer contract below.
3. **Ingest-in:** `superskill skill evaluate --ingest scores.json --save`
   - Validates scores against rubric schema, computes weighted aggregate, persists.

This seam keeps LLM scoring offline and auditable.

#### The Scorer contract

The rubric owns *what* each dimension means — its `criterion` and `anchors` in
`packages/core/src/rubrics/skill.yaml`. This contract owns *how* to turn that judgment into a
number, so two Scorer runs over the same content land in the same place.

**Calibrate to bands, not to a feeling.** Pick the band whose description fits, then emit its
score. Do not free-hand intermediate values — a 0.63 asserts a precision the judgment does not have.

| Band | Score | When it applies |
|------|-------|-----------------|
| `excellent` | 1.0 | Matches the dimension's `anchors.excellent`. |
| `adequate` | 0.8 | Meets the criterion with a slip or two that cost nothing downstream. |
| `weak` | 0.4 | Repeatedly falls short of the criterion, or one shortfall forces the reader to guess. |
| `poor` | 0.2 | Matches the dimension's `anchors.poor`. |

**Every `note` must cite, not assert.** One to three sentences that (a) quote or name the specific
locus — a heading, a phrase, a frontmatter field — and (b) name what would fix it. A note that
restates the band (`"clarity is weak"`) or the criterion carries no information and cannot be
audited later.

- ✓ `"Step 4 ends on 'iterate as needed' with no done-condition; give it a checkable exit like 'until validate exits 0'."`
- ✗ `"Instructions are somewhat vague in places."`

**There is no `insufficient_evidence` band on this plane.** Static evaluation always has its
artifact — the SKILL.md is right there in the envelope. A missing-evidence verdict only makes
sense where the evidence can genuinely be absent, which is the usage plane below. Do not add the
band here to express "I found this hard to score"; pick the band and cite why.

### 3. Default command surface

The slash command `/cc:skill-evaluate` runs the heuristic mode with rubric weights. It produces a PASS/FAIL verdict, letter grade, per-dimension findings, and actionable recommendations — no LLM call.

## The Usage Plane (not built)

Every mode above scores the **artifact**: what the SKILL.md says. None of them can see what the
skill actually *did* — whether it fired when it should have, or whether the sessions it ran in went
well. Two known gaps follow from that, both recorded here as named paths rather than built:

- **`skill_coverage`** — the fraction of real sessions in which an installed skill actually
  triggered. This is the ground truth that `trigger-accuracy` currently approximates by counting
  distinct trigger branches in the description. A skill that never fires in any observed session is
  usually a description problem, and no amount of static branch-counting will reveal it.
- **Transcript-grounded `evolve`** — today `superskill skill evolve` trends *evaluation history*,
  i.e. the record of our own static scores. Real conversation transcripts, scored for efficiency and
  outcome, would let a proposal cite an observed failure instead of a score trend.

**Blocker — do not skip this.** Both require a transcript source this repository does not own.
`spur history import/analyze`, `sp:history-anatomy`, and `sp:issue-finding` live in the **spur**
product, not in superskill; treating them as in-tree modules is a false premise and would produce a
second collector built against an unowned data plane. Commission a spike that names an owned or
explicitly-adapted source **first**. Crossing that boundary is a cross-package decision and belongs
in `docs/00_ADR.md` before any code.

Until then, proposals cite static-score trends, and that limit is stated rather than papered over.

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
