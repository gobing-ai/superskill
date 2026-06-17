import type { ContentType, DimensionScore, QualityReport } from './dimensions';
import {
    clamp,
    computeAggregate,
    DIMENSION_REGISTRY,
    extractBody,
    keywordDensity,
    parseErrorNote,
    parseFrontmatterSafe,
    scoreLength,
} from './dimensions';

const MAGENT_SECTIONS = [/^## IDENTITY/m, /^## SOUL/m, /^## AGENTS/m, /^## USER/m];

/** Count IDENTITY, SOUL, AGENTS, USER section headers in body. */
function scoreCompleteness(body: string): DimensionScore {
    let found = 0;
    for (const re of MAGENT_SECTIONS) {
        if (re.test(body)) found++;
    }
    return {
        score: clamp(found / MAGENT_SECTIONS.length),
        note: `${found}/${MAGENT_SECTIONS.length} sections present`,
    };
}

/** Score platform coverage from frontmatter data.platforms (string | string[]). */
function scorePlatformCoverage(data: Record<string, unknown>): DimensionScore {
    const raw = data.platforms;
    let platforms: string[] = [];
    if (Array.isArray(raw)) {
        platforms = raw.map(String);
    } else if (typeof raw === 'string') {
        platforms = raw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
    }
    const score = clamp(Math.min(platforms.length / 5, 1));
    return { score, note: `${platforms.length} platforms covered` };
}

/** Score body length within 1000–8000 sweet spot. */
function scoreConciseness(body: string): DimensionScore {
    return {
        score: scoreLength(body, 1000, 8000),
        note: `Body length: ${body.length} chars`,
    };
}

/**
 * Detect tone-consistency signals (tone, style, voice, personality, forbidden).
 * >= 2 matched → 1.0,  1 → 0.6,  0 → 0.2.
 */
function scoreToneConsistency(body: string): DimensionScore {
    const signals = [/tone/i, /style/i, /voice/i, /personality/i, /forbidden/i];
    let found = 0;
    for (const re of signals) {
        if (re.test(body)) found++;
    }
    if (found >= 2) return { score: 1.0, note: 'Tone consistent across sections' };
    return { score: found === 1 ? 0.6 : 0.2, note: 'Mixed tone signals' };
}

/** Score safety keyword density with explicit count. */
function scoreSafety(body: string): DimensionScore {
    const keywords = ['[CRITICAL]', 'safety', 'NEVER', 'block', 'dangerous', 'security', 'validation'];
    const density = keywordDensity(body, keywords);
    // Count exact occurrences for the note (case-insensitive)
    const lower = body.toLowerCase();
    let count = 0;
    for (const kw of keywords) {
        if (lower.includes(kw.toLowerCase())) count++;
    }
    return { score: density, note: `${count} safety markers found` };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Evaluate magent content against 5 quality dimensions: completeness,
 * platform-coverage, conciseness, tone-consistency, and safety.
 *
 * @param content  Markdown content string with YAML frontmatter.
 * @param target   Identifier for the content being evaluated.
 * @returns        QualityReport with per-dimension scores and aggregate.
 */
export function evaluateMagent(content: string, target: string): QualityReport {
    const fmResult = parseFrontmatterSafe(content);
    const data = fmResult ?? {};
    const fmNote = fmResult === null ? parseErrorNote(content, 'unknown parse error') : null;
    const body = extractBody(content);

    const dimensions: Record<string, DimensionScore> = {
        completeness: scoreCompleteness(body),
        'platform-coverage': scorePlatformCoverage(data),
        conciseness: scoreConciseness(body),
        'tone-consistency': scoreToneConsistency(body),
        safety: scoreSafety(body),
    };

    // R14: on frontmatter parse failure, attach error note to first dimension
    if (fmNote) {
        const firstKey = DIMENSION_REGISTRY.magent[0];
        if (firstKey && dimensions[firstKey]) {
            dimensions[firstKey] = { ...dimensions[firstKey], note: fmNote };
        }
    }

    return {
        type: 'magent' as ContentType,
        target,
        content: '',
        aggregate: computeAggregate(dimensions),
        dimensions,
    };
}
