import { clamp, extractBody, hasPattern, parseFrontmatterSafe, scorePresence } from './heuristics';
import { computeAggregate, type DimensionScore, type QualityReport, REQUIRED_FIELDS } from './types';

// ── Dimension Scorers ──────────────────────────────────────────────────────────

function scoreCompleteness(data: Record<string, unknown>): DimensionScore {
    const fieldsPresent = Object.keys(data);
    const required = REQUIRED_FIELDS.agent;
    const score = scorePresence(fieldsPresent, required);
    const missing = required.filter((f) => !fieldsPresent.includes(f));
    const findings = missing.length > 0 ? [`Missing required fields: ${missing.join(', ')}`] : undefined;
    const recs = missing.length > 0 ? ['Add the missing frontmatter fields'] : undefined;

    return {
        score: clamp(score),
        note: missing.length > 0 ? `Missing: ${missing.join(', ')}` : 'All required fields present',
        findings,
        recommendations: recs,
    };
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

    const findings: string[] | undefined =
        matchCount < 2 ? ['Role definition is vague, generic, or absent'] : undefined;
    const recs: string[] | undefined =
        matchCount === 0
            ? ['Add a role statement (e.g. "You are a ... specialist")']
            : matchCount === 1
              ? ['Add more role signals (specialist, persona, role scope)']
              : undefined;

    return { score, note, findings, recommendations: recs };
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

    const findings: string[] | undefined = count < 3 ? [`Only ${count} tool(s) selected — 3+ recommended`] : undefined;
    const recs: string[] | undefined =
        count === 0
            ? ['Add at least 3 tools to the agent frontmatter']
            : count < 3
              ? ['Add more tools to cover the agent workflow']
              : undefined;

    return { score, note: `${count} tools selected`, findings, recommendations: recs };
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

    let findings: string[] | undefined;
    let recs: string[] | undefined;
    if (score < 1.0) {
        findings = ['Skill linkage is weak or missing'];
        recs =
            score === 0.5
                ? ['Use structured skill references (skill: or skills:) in the agent body']
                : ['Add skill references to the agent body for delegated workflows'];
    }

    return { score, note, findings, recommendations: recs };
}

function scoreModelFit(data: Record<string, unknown>): DimensionScore {
    const model = data.model;
    const recognizedAliases: Record<string, true> = { inherit: true, sonnet: true, opus: true, haiku: true };
    const wellFormedPattern = /^claude-(\d+-\d+-)?(sonnet|opus|haiku)-/i;

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

    let findings: string[] | undefined;
    let recs: string[] | undefined;
    if (score < 0.5) {
        findings = ['Model field is missing or unrecognized'];
        recs = ['Specify a valid model (e.g. inherit, claude-sonnet-4, claude-opus-4)'];
    } else if (score === 0.5) {
        findings = ['Model name appears ambiguous'];
        recs = ['Use a recognized model alias (inherit, sonnet, opus, haiku) or well-formed name (claude-sonnet-4)'];
    }

    return { score, note, findings, recommendations: recs };
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
