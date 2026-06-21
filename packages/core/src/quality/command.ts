import { clamp, extractBody, parseFrontmatterSafe, scoreClarityFromDensities, scorePresence } from './heuristics';
import { computeAggregate, type DimensionScore, type QualityReport, REQUIRED_FIELDS } from './types';

// ── Dimension Scorers ──────────────────────────────────────────────────────────

function scoreCompleteness(data: Record<string, unknown>): DimensionScore {
    const fieldsPresent = Object.keys(data);
    const base = scorePresence(fieldsPresent, REQUIRED_FIELDS.command);
    // Bonus for optional-but-signal fields (argument-hint string, allowed-tools array)
    const hasArgHint = typeof data['argument-hint'] === 'string' && data['argument-hint'].length > 0;
    const hasAllowedTools = Array.isArray(data['allowed-tools']) && data['allowed-tools'].length > 0;
    const optBonus = (hasArgHint ? 0.1 : 0) + (hasAllowedTools ? 0.1 : 0);
    const score = clamp(Math.min(base + optBonus, 1.0));

    const missing: string[] = [];
    for (const f of REQUIRED_FIELDS.command) {
        if (!(f in data)) missing.push(f);
    }
    const note = missing.length > 0 ? `Missing fields: ${missing.join(', ')}` : 'All required fields present';

    const findings: string[] | undefined =
        missing.length > 0 ? [`Missing required fields: ${missing.join(', ')}`] : undefined;
    const recs: string[] | undefined = missing.includes('description')
        ? ['Add a description field to the command frontmatter']
        : undefined;

    return { score, note, findings, recommendations: recs };
}

function scoreClarity(body: string): DimensionScore {
    return scoreClarityFromDensities(body);
}

function scoreArgumentHints(data: Record<string, unknown>): DimensionScore {
    const hasKey = 'argument-hint' in data;
    const argHint = data['argument-hint'];

    // Key absent → command takes no parameters → not a defect
    if (!hasKey) {
        return { score: 1.0, note: 'No argument-hint (command takes no parameters)' };
    }

    // Key present but empty/whitespace or non-string → declared a hint then left it blank
    if (typeof argHint !== 'string' || argHint.trim().length === 0) {
        return {
            score: 0.4,
            note: 'Argument-hint declared but empty',
            findings: ['Argument-hint is declared but empty'],
            recommendations: [
                'Add a descriptive argument-hint string with placeholder syntax, or remove the empty field',
            ],
        };
    }

    const hint = argHint.trim();
    const hasPositional = /<[a-z][^>]*>/i.test(hint);
    const hasFlags = /\[?--[a-z][^\s\]]*\]?/i.test(hint);

    let score: number;
    let note: string;

    if (hasPositional && hasFlags) {
        score = 1.0;
        note = 'Rich argument-hint with positional args and flags';
    } else if (hasPositional || hasFlags) {
        score = 0.75;
        note = 'Argument-hint present but could be more descriptive';
    } else {
        score = 0.4;
        note = 'Argument-hint is vague or placeholder-only';
    }

    let findings: string[] | undefined;
    let recs: string[] | undefined;
    if (score < 1.0 && score > 0.5) {
        findings = ['Argument-hint could be more descriptive'];
        recs = ['Add both positional args (<name>) and flags ([--flag <value>]) to the argument-hint'];
    } else if (score <= 0.5) {
        findings = ['Argument-hint is vague or missing for a parameterized command'];
        recs = ['Add a descriptive argument-hint string with placeholder syntax'];
    }

    return { score, note, findings, recommendations: recs };
}

function scoreToolReferences(body: string, data: Record<string, unknown>): DimensionScore {
    // allowed-tools in frontmatter (array of tool names) is the primary signal
    const allowedTools = data['allowed-tools'];
    const toolCount = Array.isArray(allowedTools) ? allowedTools.length : 0;

    // Body-based signals: structured tool:/tools: references and backtick-quoted tokens
    const structuredCount = (body.match(/\btools?:/gi) ?? []).length;
    const backtickCount = (body.match(/`[a-z][a-z0-9_-]*`/g) ?? []).length;
    const bodyWeighted = structuredCount + Math.min(backtickCount, 1);

    let score: number;
    let note: string;

    if (toolCount >= 5) {
        score = 1.0;
        note = `${toolCount} allowed-tools declared`;
    } else if (toolCount >= 3) {
        score = 0.9;
        note = `${toolCount} allowed-tools declared`;
    } else if (toolCount >= 1 || structuredCount >= 1 || bodyWeighted >= 2) {
        score = 0.7;
        note = toolCount > 0 ? `${toolCount} allowed-tools declared` : 'Uses tool references';
    } else if (bodyWeighted === 1) {
        score = 0.4;
        note = 'Limited tool references';
    } else {
        score = 0.1;
        note = 'No tool references found';
    }

    let findings: string[] | undefined;
    let recs: string[] | undefined;
    if (score < 0.5) {
        findings = ['No tool references found'];
        recs = ['Add allowed-tools to frontmatter or reference tools in the command body'];
    } else if (score < 0.8) {
        findings = ['Limited tool references'];
        recs = ['Declare all required tools in the allowed-tools frontmatter array'];
    }

    return { score, note, findings, recommendations: recs };
}

function scoreSlashSyntax(body: string, target: string): DimensionScore {
    const slashPattern = /\/[a-z][a-z-]*/g;
    const matches = body.match(slashPattern);
    const count = matches ? matches.length : 0;

    let score: number;
    let note: string;

    if (count >= 1) {
        score = 1.0;
        note = 'Valid slash syntax';
    } else if (target) {
        score = 0.5;
        note = 'Missing slash syntax for target';
    } else {
        score = 0.1;
        note = 'Missing slash syntax';
    }

    return { score, note };
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Evaluate command content against 5 quality dimensions: completeness, clarity,
 * argument-hints, tool-references, and slash-syntax.
 *
 * @param content  Markdown content string with YAML frontmatter.
 * @param target   Identifier for the content being evaluated.
 * @returns        QualityReport with per-dimension scores and aggregate.
 */
export function evaluateCommand(content: string, target: string): QualityReport {
    const data = parseFrontmatterSafe(content) ?? {};
    const body = extractBody(content);

    const dimensions: Record<string, DimensionScore> = {
        completeness: scoreCompleteness(data),
        clarity: scoreClarity(body),
        'argument-hints': scoreArgumentHints(data),
        'tool-references': scoreToolReferences(body, data),
        'slash-syntax': scoreSlashSyntax(body, target),
    };

    return {
        type: 'command',
        target,
        content: '',
        aggregate: computeAggregate(dimensions),
        dimensions,
    };
}
