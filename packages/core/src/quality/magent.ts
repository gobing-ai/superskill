import { clamp, extractBody, keywordDensity, parseErrorNote, parseFrontmatterSafe, scoreLength } from './heuristics';
import {
    type ContentType,
    computeAggregate,
    DIMENSION_REGISTRY,
    type DimensionScore,
    type QualityReport,
} from './types';

// Governance section patterns for main-agent configs (frontmatter-optional)
const MAGENT_SECTIONS: { re: RegExp; label: string }[] = [
    { re: /^## .*[Pp]roject|^## .*[Ss]tack/m, label: 'project' },
    { re: /^## .*[Cc]ommand|^## .*[Tt]ool/m, label: 'commands' },
    { re: /^## .*[Vv]erif|^## .*[Tt]est|^## .*[Gg]ate/m, label: 'verification' },
    { re: /^## .*[Cc]onvention|^## .*[Ss]tyle|^## .*[Bb]oundar/m, label: 'conventions' },
    { re: /^## .*[Ss]afety|^## .*[Ss]ecurity|^## .*[Cc]ritical/m, label: 'safety' },
    { re: /^## .*[Dd]oc|^## .*[Rr]eference|^## .*[Rr]outing/m, label: 'docs' },
];

/** Count governance sections found in body. */
function scoreCompleteness(body: string): DimensionScore {
    let found = 0;
    for (const { re } of MAGENT_SECTIONS) {
        if (re.test(body)) found++;
    }
    const score = clamp(found / MAGENT_SECTIONS.length);
    const findings = found < MAGENT_SECTIONS.length / 2 ? ['Config is missing key governance sections'] : undefined;
    const recs =
        found < MAGENT_SECTIONS.length
            ? ['Add more governance sections (commands, verification, conventions, safety, docs)']
            : undefined;
    return {
        score,
        note: `${found}/${MAGENT_SECTIONS.length} governance sections present`,
        findings,
        recommendations: recs,
    };
}

/** Score platform coverage from frontmatter data.platforms, with body-based fallback. */
function scorePlatformCoverage(data: Record<string, unknown>, body: string): DimensionScore {
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

    // Body-based fallback: detect platform mentions in prose
    if (platforms.length === 0) {
        const detected: string[] = [];
        const platformPatterns: [RegExp, string][] = [
            [/claude.?code/i, 'claude-code'],
            [/codex/i, 'codex'],
            [/gemini/i, 'gemini'],
            [/cursor/i, 'cursor'],
            [/windsurf/i, 'windsurf'],
            [/opencode/i, 'opencode'],
            [/openclaw/i, 'openclaw'],
            [/antigravity/i, 'antigravity'],
            [/pi\b/i, 'pi'],
        ];
        for (const [re, name] of platformPatterns) {
            if (re.test(body)) detected.push(name);
        }
        platforms = detected;
    }

    const score = clamp(Math.min(platforms.length / 5, 1));
    const findings =
        platforms.length === 0
            ? ['No platforms declared or detected']
            : platforms.length < 3
              ? ['Limited platform coverage']
              : undefined;
    const recs =
        platforms.length < 3
            ? ['Declare supported platforms in frontmatter (platforms:) or mention them in prose']
            : undefined;
    return { score, note: `${platforms.length} platforms covered`, findings, recommendations: recs };
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
    const findings = count < 3 ? ['Limited safety markers in config'] : undefined;
    const recs =
        count < 3 ? ['Add [CRITICAL] markers, safety rules, NEVER directives, and security validation'] : undefined;
    return { score: density, note: `${count} safety markers found`, findings, recommendations: recs };
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
    const body = extractBody(content);
    // Distinguish "no frontmatter" (valid for magents — AGENTS.md/CLAUDE.md are plain markdown)
    // from "malformed frontmatter" (starts with --- but parse fails — real error)
    const hasFrontmatter = /^---\s*$/m.test(content);
    const fmResult = hasFrontmatter ? parseFrontmatterSafe(content) : undefined;
    const data = fmResult ?? {};
    const fmNote = hasFrontmatter && fmResult === null ? parseErrorNote(content, 'Frontmatter parse error') : null;

    const dimensions: Record<string, DimensionScore> = {
        completeness: scoreCompleteness(body),
        'platform-coverage': scorePlatformCoverage(data, body),
        conciseness: scoreConciseness(body),
        'tone-consistency': scoreToneConsistency(body),
        safety: scoreSafety(body),
    };

    // Only attach frontmatter error note for real parse failures (starts with --- but parse fails)
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
