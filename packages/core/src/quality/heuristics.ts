import { FrontmatterError, findFrontmatterBounds, parseFrontmatter } from '../content/frontmatter';
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
    } catch {
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

// ── R2 Proxies (task 0070): description budget, no-op density, duplication,
// trigger-cluster, completion-checkability, progressive-disclosure ────────────

/** Curated phrases that restate default model behavior without changing it (no-op candidates). */
export const NO_OP_PHRASES = [
    'be helpful',
    'be concise',
    'be accurate',
    'do your best',
    'think carefully',
    'think step by step',
    'try your best',
    'work hard',
    'pay attention',
    'be thorough',
    'take your time',
    'be careful',
    'stay focused',
    'use good judgment',
] as const;

/**
 * Score a description string against a soft character budget (context-load proxy).
 * A model-invoked description is loaded into context on every turn it's a candidate,
 * so shorter-but-sufficient beats longer. 1.0 within [min, max]; ramps down outside.
 */
export function scoreDescriptionBudget(description: string, min = 20, max = 500): number {
    return scoreLength(description, min, max);
}

/**
 * No-op density: fraction of curated default-behavior phrases (see {@link NO_OP_PHRASES})
 * found in `text`, out of the total imperative-keyword hits. High density signals
 * instructions that don't change default model behavior — candidates for deletion
 * (see skill-engineering-theory.md "no-op" failure mode). Returns 0.0–1.0; 0 is best.
 *
 * This is a CANDIDATE proxy only — genuine no-op-ness for a specific model is LLM-judged.
 */
export function noOpDensity(text: string): number {
    const lower = text.toLowerCase();
    const noOpHits = NO_OP_PHRASES.filter((p) => lower.includes(p)).length;
    const imperativeHits = IMPERATIVE_KEYWORDS.filter((k) => lower.includes(k)).length;
    const denominator = noOpHits + imperativeHits;
    if (denominator === 0) return 0;
    return clamp(noOpHits / denominator);
}

/** Prohibition markers that steer by naming the banned behavior (negation candidates). */
export const PROHIBITION_MARKERS = [
    "don't ",
    'do not ',
    'never ',
    'avoid ',
    'must not ',
    'should not ',
    "shouldn't ",
    'cannot ',
    "can't ",
    'no need to ',
] as const;

/** Positive-direction imperatives — the denominator of "steering that names a target". */
export const POSITIVE_IMPERATIVES = [
    'use ',
    'write ',
    'state ',
    'make ',
    'run ',
    'add ',
    'keep ',
    'prefer ',
    'cite ',
    'set ',
    'name ',
    'choose ',
    'ensure ',
] as const;

/**
 * Count word-start occurrences of each needle in `text`. A match counts only when the
 * character before it is a word boundary (start of string or non-alphanumeric) — so
 * "whenever" does not match the needle "never " and "reset" does not match "set ".
 * Needles are lowercase; `text` is lowercased by callers.
 */
function countOccurrences(text: string, needles: readonly string[]): number {
    let total = 0;
    for (const needle of needles) {
        let from = text.indexOf(needle);
        while (from !== -1) {
            const prev = from === 0 ? '' : (text[from - 1] ?? '');
            if (!/[a-z0-9]/.test(prev)) total += 1;
            from = text.indexOf(needle, from + needle.length);
        }
    }
    return total;
}

/**
 * Negation density: prohibition-steered instructions as a fraction of all directional
 * steering. High density flags a body that steers by naming banned behavior (the
 * "don't think of an elephant" failure mode) instead of prompting the positive target.
 * Returns 0.0–1.0; 0 is best (see skill-engineering-theory.md "negation" failure mode).
 *
 * This is a CANDIDATE proxy only — whether a specific prohibition is an unavoidable hard
 * guardrail (keep) or a rewritable negation (flip to the positive) is LLM-judged in the
 * two-call seam, never decided here.
 */
export function negationDensity(text: string): number {
    const lower = text.toLowerCase();
    const prohibitions = countOccurrences(lower, PROHIBITION_MARKERS);
    if (prohibitions === 0) return 0;
    const positives = countOccurrences(lower, POSITIVE_IMPERATIVES);
    return clamp(prohibitions / (prohibitions + positives));
}

/**
 * Extract word-shingles (n-grams) of `size` words from `text`, lowercased and
 * whitespace-normalized. Used by {@link duplicationRatio} to detect repeated phrasing.
 */
function shingles(text: string, size: number): string[] {
    const words = text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(Boolean);
    if (words.length < size) return [];
    const result: string[] = [];
    for (let i = 0; i <= words.length - size; i++) {
        result.push(words.slice(i, i + size).join(' '));
    }
    return result;
}

/**
 * Duplication ratio: fraction of `size`-word shingles in `text` that repeat at least
 * once (within `text` itself, or — when `other` is given — that also appear in `other`).
 * Returns 0.0–1.0; 0 means no repeated n-grams, 1 means every shingle repeats.
 *
 * Used for two checks: description-vs-body duplication (pass `other = body`) and
 * within-body duplication (omit `other`, self-compare).
 */
export function duplicationRatio(text: string, other?: string, size = 8): number {
    const own = shingles(text, size);
    if (own.length === 0) return 0;

    if (other !== undefined) {
        const otherSet = new Set(shingles(other, size));
        if (otherSet.size === 0) return 0;
        const dup = own.filter((s) => otherSet.has(s)).length;
        return clamp(dup / own.length);
    }

    const counts = new Map<string, number>();
    for (const s of own) counts.set(s, (counts.get(s) ?? 0) + 1);
    const repeated = own.filter((s) => (counts.get(s) ?? 0) > 1).length;
    return clamp(repeated / own.length);
}

/**
 * Cluster near-duplicate trigger phrases by word-overlap (Jaccard similarity ≥ 0.5
 * counts as the same branch) and return the number of DISTINCT branches, not the
 * raw phrase count. Fixes the "34 triggers because every bullet in the body got
 * counted" failure. This is a bag-of-words proxy: it catches phrases that differ
 * only by function words (e.g. "review this code" / "review the code" / "review
 * code"), NOT verb-level synonyms with no shared words (e.g. "review code" vs
 * "audit code") — that judgment needs semantics a deterministic heuristic doesn't
 * have, so it stays a genuinely distinct branch here (consistent with D6: no
 * heuristic overreach into LLM-judged territory).
 */
export function countTriggerBranches(phrases: string[]): number {
    const wordSets = phrases.map((p) => new Set(p.toLowerCase().split(/\s+/).filter(Boolean)));
    const branchOf = new Array<number>(phrases.length).fill(-1);
    let nextBranch = 0;

    for (let i = 0; i < wordSets.length; i++) {
        if (branchOf[i] !== -1) continue;
        branchOf[i] = nextBranch;
        for (let j = i + 1; j < wordSets.length; j++) {
            if (branchOf[j] !== -1) continue;
            if (jaccard(wordSets[i] ?? new Set(), wordSets[j] ?? new Set()) >= 0.5) {
                branchOf[j] = branchOf[i] ?? nextBranch;
            }
        }
        nextBranch++;
    }

    return nextBranch;
}

/** Jaccard similarity between two word sets: |intersection| / |union|. */
function jaccard(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 && b.size === 0) return 1;
    let intersection = 0;
    for (const w of a) if (b.has(w)) intersection++;
    const union = a.size + b.size - intersection;
    return union === 0 ? 0 : intersection / union;
}

/** Vague completion-bound phrases that make a "done" condition undecidable. */
export const VAGUE_COMPLETION_BOUNDS = [
    'understanding reached',
    'as needed',
    'as appropriate',
    'when ready',
    'until satisfied',
    'good enough',
    'as necessary',
    'when done',
] as const;

/**
 * For step/workflow-shaped bodies (numbered lists or "## Steps"-like sections),
 * score whether each step reads as a decidable done-condition. Penalizes vague
 * bound phrases (see {@link VAGUE_COMPLETION_BOUNDS}); rewards checkable language
 * (checklists, explicit verification verbs). Returns 0.0–1.0.
 *
 * Bodies with no numbered/step structure return 1.0 (not applicable — not penalized).
 */
export function completionCheckability(body: string): number {
    const stepLines = body.split('\n').filter((l) => /^\s*\d+[.)]\s/.test(l) || /^\s*-\s*\[[ x]\]/i.test(l));
    if (stepLines.length === 0) return 1;

    const lower = body.toLowerCase();
    const vagueHits = VAGUE_COMPLETION_BOUNDS.filter((v) => lower.includes(v)).length;
    const penalty = clamp(vagueHits / Math.max(3, VAGUE_COMPLETION_BOUNDS.length));
    return clamp(1 - penalty);
}

/**
 * Progressive-disclosure shape: a body over `budget` chars with no reference to a
 * `references/` (or `See Also` / `Additional Resources`) disclosure path is a finding —
 * the content should have moved detail out rather than growing the main body.
 * Returns 0.0–1.0 (1.0 = under budget, or over budget but discloses).
 */
export function progressiveDisclosureShape(body: string, budget = 8000): boolean {
    if (body.length <= budget) return true;
    return /references\//i.test(body) || /##\s*(see also|additional resources)/i.test(body);
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
    const bounds = findFrontmatterBounds(content);
    if (!bounds) {
        // No opener (no frontmatter at all) → whole string is the body.
        // Opener without a closer is also `null` → return the post-opener text
        // so callers see everything after the opening `---` line.
        const opener = content.match(/^---\r?\n/);
        return opener ? content.slice(opener[0].length) : content;
    }
    return content.slice(bounds.bodyStart);
}

/**
 * Score how "trigger-rich" a description reads (0.0-1.0): distinct branch
 * delimiters (commas/semicolons/" or "), dispatch-cue phrasing ("use when",
 * "trigger", "whenever"), and length above a one-liner. Model-invoked
 * descriptions should score high (the Task-tool orchestrator needs branch
 * signal); user-invoked descriptions should score low (a human reads one
 * line and picks the skill directly - branch lists are wasted context for
 * a reader who already knows what they want).
 *
 * This is a shape proxy, not a semantic judge: it counts structural cues,
 * it does not verify the cues are accurate (that judgment stays in the
 * rubric YAML's two-call seam, consistent with D6).
 */
export function descriptionTriggerRichness(description: string): number {
    if (!description) return 0;
    const branchDelimiters = (description.match(/[,;]|\bor\b/gi) ?? []).length;
    const dispatchCues = (description.match(/\b(use (?:this|it) when|whenever|triggers? on|use when)\b/gi) ?? [])
        .length;
    const lengthSignal = clamp(description.length / 300);
    const branchSignal = clamp(branchDelimiters / 3);
    const cueSignal = clamp(dispatchCues);
    return clamp(branchSignal * 0.5 + cueSignal * 0.3 + lengthSignal * 0.2);
}

/** Clamp a number to [0, 1]. */
export function clamp(n: number): number {
    return Math.max(0, Math.min(1, n));
}

/** Escape regex-special characters in a string. */
function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
