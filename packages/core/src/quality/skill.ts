import {
    clamp,
    extractBody,
    hasPattern,
    keywordDensity,
    parseErrorNote,
    parseFrontmatterSafe,
    scoreClarityFromDensities,
    scoreLength,
    scorePresence,
} from './heuristics';
import { computeAggregate, type DimensionScore, type QualityReport, REQUIRED_FIELDS } from './types';

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Evaluate skill content against 5 quality dimensions: completeness, clarity,
 * trigger-accuracy, anti-hallucination, and conciseness.
 *
 * @param content  Markdown content string with YAML frontmatter.
 * @param target   Identifier for the content being evaluated.
 * @returns        QualityReport with per-dimension scores and aggregate.
 */
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

    const findings: string[] = [];
    const recommendations: string[] = [];
    if (missing.length > 0) {
        findings.push(`Missing required frontmatter: ${missing.join(', ')}`);
        recommendations.push(`Add \`${missing.join('`, `')}\` to YAML frontmatter`);
    }
    if (structure < 1) {
        findings.push('Body lacks section headings (# / ## / ###). Structure aids navigation.');
        recommendations.push('Organize content with markdown headings for progressive disclosure');
    }

    return { score, note, findings, recommendations };
}

function scoreClarity(body: string): DimensionScore {
    return scoreClarityFromDensities(body);
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

    const findings: string[] = [];
    const recommendations: string[] = [];
    if (count < 3) {
        findings.push(`Only ${count} trigger phrase(s) found; aim for 3–10 for reliable skill activation.`);
        recommendations.push('Add 1–2 more When-to-Use scenarios or trigger phrase patterns to the description.');
    } else if (count > 10) {
        findings.push(`${count} trigger phrases may cause overlap with adjacent skills.`);
        recommendations.push('Consolidate overlapping triggers or narrow the activation scope.');
    }

    return { score, note: `${count} trigger phrases found`, findings, recommendations };
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

    const findings: string[] = [];
    const recommendations: string[] = [];
    if (density < 0.3) {
        findings.push('Verification/citation language sparse or absent. Skill may invite fabrication.');
        recommendations.push(
            'Add explicit "verify with source", "cross-check against docs", or "cite the reference" instructions.',
        );
    }

    return { score: density, note, findings, recommendations };
}

function scoreConciseness(body: string): DimensionScore {
    // 500–15000 chars ≈ 15–500 lines of markdown. A rich skill body (e.g. cc-skills at ~14k)
    // should not auto-zero; 15000 accommodates complete multi-section skills.
    const score = scoreLength(body, 500, 15000);
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

            if (/\b(?:trigger|when to use)/i.test(title)) {
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
            if (/^\s*[-*+]\s/.test(line) || /^\s*\d+[.)]\s/.test(line)) {
                count++;
            }
        }
    }

    return count;
}
