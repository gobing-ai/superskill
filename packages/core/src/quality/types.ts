import type { ContentType } from '../content/types';

export type { ContentType };

// ── Types ────────────────────────────────────────────────────────────────────

/** Dimension names (union of all possible dimension keys across content types). */
export type DimensionName =
    | 'completeness'
    | 'clarity'
    | 'trigger-accuracy'
    | 'anti-hallucination'
    | 'conciseness'
    | 'argument-hints'
    | 'tool-references'
    | 'slash-syntax'
    | 'role-clarity'
    | 'tool-selection'
    | 'skill-linkage'
    | 'model-fit'
    | 'correctness'
    | 'event-coverage'
    | 'safety'
    | 'pattern-match-quality'
    | 'platform-coverage'
    | 'tone-consistency';

/** A single dimension's score and explanatory note. Score is clamped to 0.0–1.0. */
export interface DimensionScore {
    score: number;
    note: string;
    /** Specific issues found (additive — optional). */
    findings?: string[];
    /** Actionable suggestions (additive — optional). */
    recommendations?: string[];
}

/** The complete evaluation result for a piece of content. */
export interface QualityReport {
    /** Content name (resolved via resolveContentName when a path is available). */
    content: string;
    type: ContentType;
    target: string;
    /** Aggregate score (0.0–1.0). Equal-weight mean for heuristic; rubric-weighted when rubric is applied. */
    aggregate: number;
    /** Per-dimension scores keyed by dimension name. */
    dimensions: Record<string, DimensionScore>;
    /** PASS | FAIL verdict based on aggregate threshold (0.0–1.0 scale, 0.70 threshold) — additive. */
    verdict?: string;
    /** Letter grade: A (≥0.90), B (≥0.75), C (≥0.60), D (≥0.45), F (<0.45) — additive. */
    grade?: string;
}

// ── Registry ─────────────────────────────────────────────────────────────────

/** Dimension names per content type (design doc §3). */
export const DIMENSION_REGISTRY: Record<ContentType, string[]> = {
    skill: ['completeness', 'clarity', 'trigger-accuracy', 'anti-hallucination', 'conciseness'],
    command: ['completeness', 'clarity', 'argument-hints', 'tool-references', 'slash-syntax'],
    agent: ['completeness', 'role-clarity', 'tool-selection', 'skill-linkage', 'model-fit'],
    hook: ['correctness', 'event-coverage', 'safety', 'pattern-match-quality'],
    magent: ['completeness', 'platform-coverage', 'conciseness', 'tone-consistency', 'safety'],
};

/** Imperative keywords signalling clear, directive prose. Shared by clarity scorers. */
export const IMPERATIVE_KEYWORDS = ['must', 'should', 'never', 'always', 'required', 'ensure', 'validate'] as const;

/** Vague hedging terms that weaken directive prose. Shared by clarity scorers. */
export const VAGUE_KEYWORDS = ['maybe', 'perhaps', 'might', 'could be', 'probably'] as const;

/** Required frontmatter fields per content type. Consumed by validate (F010) and evaluate (F009). */
export const REQUIRED_FIELDS: Record<ContentType, string[]> = {
    skill: ['name', 'description'],
    command: ['description'],
    agent: ['name', 'description', 'model', 'tools'],
    hook: [],
    magent: [],
};

// ── Aggregate ────────────────────────────────────────────────────────────────

/**
 * Equal-weighted mean of all dimension scores. Returns 0.0 if no dimensions.
 *
 * Unweighted by design: this is the default heuristic aggregate. Rubric
 * per-dimension weights apply only on the agent-scored `--ingest` path
 * (`computeWeightedAggregate` in the CLI evaluate operation), not here.
 */
export function computeAggregate(dimensions: Record<string, DimensionScore>): number {
    const scores = Object.values(dimensions).map((d) => d.score);
    if (scores.length === 0) return 0;
    return scores.reduce((a, b) => a + b, 0) / scores.length;
}
