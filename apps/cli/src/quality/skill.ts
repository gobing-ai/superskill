import {
    clamp,
    computeAggregate,
    type DimensionScore,
    extractBody,
    hasPattern,
    keywordDensity,
    parseErrorNote,
    parseFrontmatterSafe,
    type QualityReport,
    REQUIRED_FIELDS,
    scoreLength,
    scorePresence,
} from './dimensions';

// ── Public API ─────────────────────────────────────────────────────────────────

export function evaluateSkill(content: string, target: string): QualityReport {
    const data = parseFrontmatterSafe(content);
    const body = extractBody(content);

    const dimensions: Record<string, DimensionScore> = {
        completeness: scoreCompleteness(content, data, body),
        clarity: scoreClarity(body),
        'trigger-accuracy': scoreTriggerAccuracy(body),
        'anti-hallucination': scoreAntiHallucination(body),
        conciseness: scoreConciseness(body),
    };

    return {
        type: 'skill',
        target,
        content: '',
        aggregate: computeAggregate(dimensions),
        dimensions,
    };
}

// ── Dimension Scorers ─────────────────────────────────────────────────────────

function scoreCompleteness(content: string, data: Record<string, unknown> | null, body: string): DimensionScore {
    // R14: frontmatter parse failures never throw, produce low score with error note
    if (data === null) {
        const note = parseErrorNote(content, 'Frontmatter parse error');
        return { score: 0, note };
    }

    const presentKeys = Object.keys(data);
    const required = REQUIRED_FIELDS.skill;
    const presence = scorePresence(presentKeys, required);
    const structure = hasPattern(body, [/^# /m, /^## /m, /^### /m]);
    const score = clamp(presence * structure);

    const keySet = new Set(presentKeys);
    const missing = required.filter((f) => !keySet.has(f));
    const note = missing.length > 0 ? `Missing fields: ${missing.join(', ')}` : 'All required fields present';

    return { score, note };
}

function scoreClarity(body: string): DimensionScore {
    const imperativeDensity = keywordDensity(body, [
        'must',
        'should',
        'never',
        'always',
        'required',
        'ensure',
        'validate',
    ]);
    const vagueDensity = keywordDensity(body, ['maybe', 'perhaps', 'might', 'could be', 'probably']);
    const score = clamp((imperativeDensity - vagueDensity) / 2 + 0.5);

    const lower = body.toLowerCase();
    const vagueTerms = ['maybe', 'perhaps', 'might', 'could be', 'probably'].filter((t) => lower.includes(t));

    const note = vagueTerms.length === 0 ? 'Good imperative style' : `Vague terms found: ${vagueTerms.join(', ')}`;

    return { score, note };
}

function scoreTriggerAccuracy(body: string): DimensionScore {
    const count = countTriggerPhrases(body);

    // Score 1.0 for 3–10 triggers; linear ramp below 3, linear drop above 10
    let score: number;
    if (count >= 3 && count <= 10) {
        score = 1.0;
    } else if (count < 3) {
        score = clamp(count / 3);
    } else {
        score = clamp(1 - (count - 10) / 10);
    }

    return { score, note: `${count} trigger phrases found` };
}

function scoreAntiHallucination(body: string): DimensionScore {
    const density = keywordDensity(body, [
        'verify',
        'cite',
        'source',
        'cross-check',
        'reference',
        'validate',
        'document',
        'evidence',
    ]);
    const note = density > 0 ? 'Includes verification language' : 'Missing verification instructions';

    return { score: density, note };
}

function scoreConciseness(body: string): DimensionScore {
    const score = scoreLength(body, 500, 5000);
    return { score, note: `Body length: ${body.length} chars` };
}

// ── Trigger Phrase Counter ────────────────────────────────────────────────────

/**
 * Count trigger phrases in the body by locating trigger-related sections
 * (headings containing "trigger" or "when to use") and counting list items
 * within them. Falls back to counting all top-level list items if no
 * trigger-specific section is found.
 */
function countTriggerPhrases(body: string): number {
    const lines = body.split('\n');
    let inTriggerSection = false;
    let sectionDepth = 0;
    let count = 0;

    for (const line of lines) {
        const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
        if (headingMatch) {
            const depth = headingMatch[1]?.length ?? 0;
            const title = (headingMatch[2] ?? '').toLowerCase();

            if (/\btrigger|when to use/i.test(title)) {
                inTriggerSection = true;
                sectionDepth = depth;
            } else if (inTriggerSection && depth <= sectionDepth) {
                // Exited the trigger section
                inTriggerSection = false;
            }
            continue;
        }
        if (inTriggerSection) {
            // Count list items (unordered: -, *, +  or  ordered: 1., 2), etc.)
            if (/^\s*[-*+]\s/.test(line) || /^\s*\d+[.)]\s/.test(line)) {
                count++;
            }
        }
    }

    // Fallback: if no trigger section found, count top-level list items
    // in the entire body as approximate trigger count
    if (count === 0) {
        for (const line of lines) {
            if (/^\s*[-*+]\s/.test(line)) {
                count++;
            }
        }
    }

    return count;
}
