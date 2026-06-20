import type { DimensionScore, QualityReport } from './dimensions';
import {
    clamp,
    computeAggregate,
    extractBody,
    hasPattern,
    parseFrontmatterSafe,
    REQUIRED_FIELDS,
    scorePresence,
} from './dimensions';

// ── Dimension Scorers ──────────────────────────────────────────────────────────

function scoreCompleteness(data: Record<string, unknown>): DimensionScore {
    const fieldsPresent = Object.keys(data);
    const required = REQUIRED_FIELDS.agent;
    const score = scorePresence(fieldsPresent, required);
    const missing = required.filter((f) => !fieldsPresent.includes(f));
    const note = missing.length > 0 ? `Missing: ${missing.join(', ')}` : 'All required fields present';

    return { score: clamp(score), note };
}

function scoreRoleClarity(body: string): DimensionScore {
    const patterns: RegExp[] = [/you are/i, /role/i, /specialist/i, /persona/i];

    // Count how many distinct patterns match
    const matchedPatterns = patterns.filter((p) => p.test(body));
    const matchCount = matchedPatterns.length;

    let base: number;
    if (matchCount >= 2) {
        base = 0.9;
    } else if (matchCount === 1) {
        base = 0.5;
    } else {
        base = 0.1;
    }

    // Check for specificity: if any matching line exceeds 30 chars, add bonus
    let specificity = false;
    if (matchCount > 0) {
        const lines = body.split('\n');
        for (const line of lines) {
            if (patterns.some((p) => p.test(line)) && line.trim().length > 30) {
                specificity = true;
                break;
            }
        }
    }

    const score = specificity ? clamp(base + 0.2) : base;
    const note =
        matchCount >= 2
            ? 'Clear role defined'
            : matchCount === 1
              ? 'Role definition vague/generic'
              : 'No role definition found';

    return { score, note };
}

function scoreToolSelection(data: Record<string, unknown>): DimensionScore {
    const tools = data.tools;
    const count = Array.isArray(tools) ? tools.length : 0;

    let score: number;
    if (count >= 3) {
        score = 0.9;
    } else if (count >= 1) {
        score = 0.7;
    } else {
        score = 0.1;
    }

    return { score, note: `${count} tools selected` };
}

function scoreSkillLinkage(body: string): DimensionScore {
    const patterns: RegExp[] = [/skill:/i, /skills:/i, /skill/i];
    const fraction = hasPattern(body, patterns);

    let score: number;
    let note: string;

    if (fraction > 0) {
        // Check for structured skill refs (skill: or skills:) vs just the keyword
        const hasStructured = /skill:/i.test(body) || /skills:/i.test(body);
        if (hasStructured) {
            score = 1.0;
            note = 'Skill references found';
        } else {
            score = 0.5;
            note = 'Skill keyword found but no structured reference';
        }
    } else {
        score = 0.0;
        note = 'No skill references';
    }

    return { score, note };
}

function scoreModelFit(data: Record<string, unknown>): DimensionScore {
    const model = data.model;
    const recognizedAliases: Record<string, true> = { inherit: true, sonnet: true, opus: true, haiku: true };
    const wellFormedPattern = /^claude-(sonnet|opus|haiku)-/i;

    let score: number;
    let note: string;

    if (typeof model === 'string') {
        if (model.toLowerCase() in recognizedAliases) {
            score = 1.0;
        } else if (wellFormedPattern.test(model)) {
            score = 1.0;
        } else if (model.includes('-')) {
            score = 0.5;
        } else {
            score = 0.0;
        }
        note = `Model: ${model}`;
    } else {
        score = 0.0;
        note = 'Model: missing';
    }

    return { score, note };
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Evaluate agent content against 5 quality dimensions: completeness, role-clarity,
 * tool-selection, skill-linkage, and model-fit.
 *
 * @param content  Markdown content string with YAML frontmatter.
 * @param target   Identifier for the content being evaluated.
 * @returns        QualityReport with per-dimension scores and aggregate.
 */
export function evaluateAgent(content: string, target: string): QualityReport {
    const data = parseFrontmatterSafe(content) ?? {};
    const body = extractBody(content);

    const dimensions: Record<string, DimensionScore> = {
        completeness: scoreCompleteness(data),
        'role-clarity': scoreRoleClarity(body),
        'tool-selection': scoreToolSelection(data),
        'skill-linkage': scoreSkillLinkage(body),
        'model-fit': scoreModelFit(data),
    };

    return {
        type: 'agent',
        target,
        content: '',
        aggregate: computeAggregate(dimensions),
        dimensions,
    };
}
