import {
    clamp,
    computeAggregate,
    type DimensionScore,
    extractBody,
    keywordDensity,
    parseErrorNote,
    parseFrontmatterSafe,
    type QualityReport,
} from './dimensions';

// ── Constants ─────────────────────────────────────────────────────────────────

const KNOWN_HOOK_EVENTS = [
    'PreToolUse',
    'PostToolUse',
    'Stop',
    'SubagentStop',
    'SessionStart',
    'SessionEnd',
    'UserPromptSubmit',
    'PreCompact',
    'Notification',
];

// ── Dimension scorers ─────────────────────────────────────────────────────────

/** correctness: validate event field against known events + enabled bonus */
function scoreCorrectness(data: Record<string, unknown>): DimensionScore {
    const raw = data.event;
    let base: number;
    let note: string;

    if (typeof raw === 'string' && raw.trim().length > 0) {
        const event = raw.trim();
        if (KNOWN_HOOK_EVENTS.includes(event)) {
            base = 1.0;
            note = `Valid event: ${event}`;
        } else {
            base = 0.5;
            note = `Unknown event: ${event}`;
        }
    } else {
        base = 0.0;
        note = 'Missing event field';
    }

    // Small bonus when enabled is explicitly true
    if (data.enabled === true) {
        base = clamp(base + 0.1);
    }

    return { score: clamp(base), note };
}

/** event-coverage: how well the body describes the hook's event behaviour */
function scoreEventCoverage(data: Record<string, unknown>, body: string): DimensionScore {
    const eventName = typeof data.event === 'string' ? data.event.trim() : '';
    const mentionsEventName = eventName.length > 0 && body.toLowerCase().includes(eventName.toLowerCase()) ? 1.0 : 0.0;

    const density = keywordDensity(body, ['event', 'intercept', 'trigger', 'when', 'condition', 'match']);

    const score = 0.5 * mentionsEventName + 0.5 * density;
    const note = score >= 0.5 ? 'Event coverage described' : 'Minimal event description';

    return { score: clamp(score), note };
}

/** safety: presence of safety-gate language in the body */
function scoreSafety(body: string): DimensionScore {
    const density = keywordDensity(body, [
        'safety',
        'secure',
        'gated',
        'approval',
        'explicit',
        'dangerous',
        'destructive',
        'block',
    ]);

    const note = density >= 0.2 ? 'Includes safety considerations' : 'No safety gates described';

    return { score: clamp(density), note };
}

/** pattern-match-quality: discrimination between specific vs broad file patterns */
function scorePatternMatchQuality(body: string): DimensionScore {
    // File-glob patterns with an extension → specific (e.g. *.ts, **/*.js, src/**/*.css)
    const hasSpecificGlob = /\*\.[a-z]+\b/i.test(body);

    // Pattern-related keywords in the prose
    const patternDensity = keywordDensity(body, ['match', 'pattern', 'regex', 'glob']);

    let score: number;
    let note: string;

    if (hasSpecificGlob) {
        score = 0.9;
        note = 'Specific match patterns';
    } else if (patternDensity > 0) {
        score = 0.3;
        note = 'Broad/unspecific patterns';
    } else {
        score = 0.0;
        note = 'No match patterns';
    }

    return { score, note };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Evaluate a hook definition for quality across 4 dimensions:
 * correctness, event-coverage, safety, and pattern-match-quality.
 *
 * Frontmatter parse failures produce low scores with "Frontmatter parse error: …"
 * notes on each dimension (R14), never throwing.
 */
export function evaluateHook(content: string, target: string): QualityReport {
    const parsed = parseFrontmatterSafe(content);
    const data: Record<string, unknown> = parsed ?? {};
    const body = extractBody(content);

    // Frontmatter parse failure → every dimension gets the error note (R14)
    const isParseError = parsed === null;

    const dimensions: Record<string, DimensionScore> = (() => {
        if (isParseError) {
            const errNote = parseErrorNote(content, 'Frontmatter parse error');
            return {
                correctness: { score: 0.1, note: errNote },
                'event-coverage': { score: 0.0, note: errNote },
                safety: { score: 0.0, note: errNote },
                'pattern-match-quality': { score: 0.0, note: errNote },
            };
        }

        return {
            correctness: scoreCorrectness(data),
            'event-coverage': scoreEventCoverage(data, body),
            safety: scoreSafety(body),
            'pattern-match-quality': scorePatternMatchQuality(body),
        };
    })();

    return {
        type: 'hook',
        target,
        content: '',
        aggregate: computeAggregate(dimensions),
        dimensions,
    };
}
