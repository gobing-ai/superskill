import { FrontmatterError, parseFrontmatter } from '../content/frontmatter';
import { type DimensionScore, IMPERATIVE_KEYWORDS, VAGUE_KEYWORDS } from './types';

// ── Shared Dimension Scorers ───────────────────────────────────────────────────

/**
 * Score the `clarity` dimension from a body's imperative vs vague keyword density.
 *
 * Unified formula for skill and command (was divergent — skill used a 0.5-baseline
 * symmetric scale, command used a raw difference that floored at 0). Uses the
 * 0.5-baseline scale so neutral prose scores mid-range and the two content types
 * are comparable: `clamp((imperative - vague) / 2 + 0.5)`.
 */
export function scoreClarityFromDensities(body: string): DimensionScore {
    const imperative = keywordDensity(body, [...IMPERATIVE_KEYWORDS]);
    const vague = keywordDensity(body, [...VAGUE_KEYWORDS]);
    const score = clamp((imperative - vague) / 2 + 0.5);

    const lower = body.toLowerCase();
    const found = VAGUE_KEYWORDS.filter((t) => lower.includes(t));
    const note = found.length === 0 ? 'Good imperative style' : `Vague terms found: ${found.join(', ')}`;

    return { score, note };
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
 *
 * Content without a leading `---` opener has no frontmatter — the whole string
 * is the body. With an opener but no bare-`---` closer, returns everything after
 * the opener line. The closer must be a bare `---` line (matching F007's parser),
 * so `---` inside body text is not mistaken for the delimiter.
 */
export function extractBody(content: string): string {
    if (!content.startsWith('---\n')) return content;
    const closerMatch = content.slice(4).match(/\n---(?=\n|$)/);
    if (closerMatch?.index === undefined) return content.slice(4); // opener but no closer
    return content.slice(closerMatch.index + 4 + 4);
}

/** Clamp a number to [0, 1]. */
export function clamp(n: number): number {
    return Math.max(0, Math.min(1, n));
}

/** Escape regex-special characters in a string. */
function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
