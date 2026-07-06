import {
    clamp,
    duplicationRatio,
    extractBody,
    hasPattern,
    noOpDensity,
    parseFrontmatterSafe,
    scoreDescriptionBudget,
    scorePresence,
} from './heuristics';
import { computeAggregate, type DimensionScore, type QualityReport, REQUIRED_FIELDS } from './types';

// ── Dimension Scorers ──────────────────────────────────────────────────────────

function scoreCompleteness(data: Record<string, unknown>, body: string): DimensionScore {
    const fieldsPresent = Object.keys(data);
    const required = REQUIRED_FIELDS.agent;
    const presence = scorePresence(fieldsPresent, required);
    const missing = required.filter((f) => !fieldsPresent.includes(f));

    // Description quality (R2): folded into completeness (not a new dimension) since
    // agent's fixed registry has no separate conciseness/clarity dimension. Description is
    // the dispatch-time signal the Task-tool orchestrator reads, same context-load concern
    // as a skill description — but the budget is wider (20-2000, not 20-500): Claude Code's
    // own convention embeds <example> few-shot blocks directly in an agent's frontmatter
    // description (real cc agents run 550-850 chars), unlike a skill's single-sentence
    // dispatch trigger. Copying the skill ceiling verbatim would falsely flag every
    // convention-following agent description as over budget.
    //
    // Progressive-disclosure does NOT transfer from skill (deliberate scoping, not an
    // oversight): agents in this repo are flat single-file markdown documents with no
    // companion references/ directory convention — unlike skills, which are directories
    // (SKILL.md + references/*.md). An agent has no escape hatch to satisfy that check, so
    // applying it would penalize every long agent regardless of actual quality.
    const description = typeof data.description === 'string' ? data.description : '';
    const budgetScore = description ? scoreDescriptionBudget(description, 20, 2000) : 1;
    const noOp = noOpDensity(description);
    const descDup = description ? duplicationRatio(description, body, 12) : 0;

    const score = clamp(presence * budgetScore * (1 - noOp) * (1 - descDup));

    const findings: string[] = [];
    const recs: string[] = [];
    if (missing.length > 0) {
        findings.push(`Missing required fields: ${missing.join(', ')}`);
        recs.push('Add the missing frontmatter fields');
    }
    if (budgetScore < 1) {
        findings.push(`Description is ${description.length} chars, outside the 20\u20132000 char budget.`);
        recs.push('Tighten the description to the agent\u2019s role and dispatch trigger.');
    }
    if (noOp > 0.2) {
        findings.push('Description contains default-behavior phrases that add no signal (no-op candidates).');
        recs.push('Delete no-op phrasing from the description rather than trimming it.');
    }
    if (descDup > 0.3) {
        findings.push('Description restates body text near-verbatim (duplication).');
        recs.push('State the agent\u2019s role once in the description; do not repeat it in the body.');
    }

    return {
        score,
        note: missing.length > 0 ? `Missing: ${missing.join(', ')}` : 'All required fields present',
        findings: findings.length > 0 ? findings : undefined,
        recommendations: recs.length > 0 ? recs : undefined,
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
        completeness: scoreCompleteness(data, body),
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
