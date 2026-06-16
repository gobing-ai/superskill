import { FrontmatterError, parseFrontmatter } from '../content/frontmatter';

// ── Types ────────────────────────────────────────────────────────────────────

/** Canonical content types — the authoritative definition consumed by F007 and F010–F014. */
export type ContentType = 'skill' | 'command' | 'agent' | 'hook' | 'magent';

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
}

/** The complete evaluation result for a piece of content. */
export interface QualityReport {
    /** Content name (resolved via resolveContentName when a path is available). */
    content: string;
    type: ContentType;
    target: string;
    /** Equal-weighted mean of all dimension scores (0.0–1.0). */
    aggregate: number;
    /** Per-dimension scores keyed by dimension name. */
    dimensions: Record<string, DimensionScore>;
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

/** Required frontmatter fields per content type. Consumed by validate (F010) and evaluate (F009). */
export const REQUIRED_FIELDS: Record<ContentType, string[]> = {
    skill: ['name', 'description'],
    command: ['name', 'description'],
    agent: ['name', 'description', 'model'],
    hook: ['name', 'description', 'event'],
    magent: ['name', 'description'],
};

// ── Aggregate ────────────────────────────────────────────────────────────────

/** Equal-weighted mean of all dimension scores. Returns 0.0 if no dimensions. */
export function computeAggregate(dimensions: Record<string, DimensionScore>): number {
    const scores = Object.values(dimensions).map((d) => d.score);
    if (scores.length === 0) return 0;
    return scores.reduce((a, b) => a + b, 0) / scores.length;
}

// ── Heuristic Helpers ────────────────────────────────────────────────────────

/**
 * Safely parse frontmatter, returning null on any parse failure.
 * Does NOT throw — callers get null and can score accordingly.
 */
export function parseFrontmatterSafe(content: string): Record<string, unknown> | null {
    try {
        return parseFrontmatter(content).data;
    } catch (e) {
        if (e instanceof FrontmatterError) {
            return null;
        }
        return null;
    }
}

/**
 * Extract the error message string from a caught value, or a default string.
 */
export function parseErrorNote(content: string, fallback: string): string {
    try {
        parseFrontmatter(content);
        return fallback;
    } catch (e) {
        if (e instanceof FrontmatterError) {
            return `Frontmatter parse error: ${e.message}`;
        }
        return `Frontmatter parse error: ${fallback}`;
    }
}

/**
 * Score the presence of required fields: fraction of `required` entries present
 * in `present`. Returns 0.0–1.0.
 */
export function scorePresence(present: string[], required: string[]): number {
    if (required.length === 0) return 1;
    const set = new Set(present);
    let found = 0;
    for (const r of required) {
        if (set.has(r)) found++;
    }
    return clamp(found / required.length);
}

/**
 * Score content length within a sweet spot.
 * - 1.0 when length is within [min, max].
 * - Linear ramp down from 1.0 to 0.0 as length moves toward 0 or toward max*2.
 */
export function scoreLength(text: string, min: number, max: number): number {
    const len = text.length;
    if (len >= min && len <= max) return 1;
    if (len < min) return clamp(len / min);
    // Above max: linear ramp down to 0 at max*2
    if (len >= max * 2) return 0;
    return clamp(1 - (len - max) / max);
}

/**
 * Fraction of `keywords` found in `text` (case-insensitive whole-word match).
 * Returns 0.0–1.0.
 */
export function keywordDensity(text: string, keywords: string[]): number {
    if (keywords.length === 0) return 1;
    const lower = text.toLowerCase();
    let found = 0;
    for (const kw of keywords) {
        // Whole-word match via word boundary or start/end of line
        const re = new RegExp(`(?:^|\\s)${escapeRegex(kw.toLowerCase())}(?:\\s|$|[.,;:!?])`, 'i');
        if (re.test(lower)) found++;
    }
    return clamp(found / keywords.length);
}

/**
 * Fraction of regex patterns that match at least once in `text`.
 * Returns 0.0–1.0.
 */
export function hasPattern(text: string, patterns: RegExp[]): number {
    if (patterns.length === 0) return 1;
    let matched = 0;
    for (const p of patterns) {
        if (p.test(text)) matched++;
    }
    return clamp(matched / patterns.length);
}

/**
 * Extract the body text from content (everything after the closing `---`).
 */
export function extractBody(content: string): string {
    const closerIdx = content.indexOf('\n---', 4);
    if (closerIdx === -1) return content.slice(4); // no closer, return after opener
    return content.slice(closerIdx + 4);
}

/** Clamp a number to [0, 1]. */
export function clamp(n: number): number {
    return Math.max(0, Math.min(1, n));
}

/** Escape regex-special characters in a string. */
function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
