import { clamp, extractBody, parseFrontmatterSafe, scoreClarityFromDensities, scorePresence } from './heuristics';
import { computeAggregate, type DimensionScore, type QualityReport, REQUIRED_FIELDS } from './types';

// ── Dimension Scorers ──────────────────────────────────────────────────────────

function scoreCompleteness(data: Record<string, unknown>): DimensionScore {
    const fieldsPresent = Object.keys(data);
    const base = scorePresence(fieldsPresent, REQUIRED_FIELDS.command);
    const argsFactor = Array.isArray(data.arguments) ? 1 : 0;
    const score = clamp(base * (0.5 + 0.5 * argsFactor));

    const missing: string[] = [];
    for (const f of REQUIRED_FIELDS.command) {
        if (!(f in data)) missing.push(f);
    }
    const note = missing.length > 0 ? `Missing fields: ${missing.join(', ')}` : 'All required fields present';

    return { score, note };
}

function scoreClarity(body: string): DimensionScore {
    return scoreClarityFromDensities(body);
}

function scoreArgumentHints(data: Record<string, unknown>): DimensionScore {
    const args = data.arguments;

    if (!Array.isArray(args)) {
        return { score: 0.0, note: 'No arguments array found' };
    }

    if (args.length === 0) {
        return { score: 0.0, note: '0/0 arguments have hints' };
    }

    let withHints = 0;
    for (const arg of args) {
        if (typeof arg === 'object' && arg !== null && 'name' in arg && 'description' in arg) {
            withHints++;
        }
    }

    const score = clamp(withHints / args.length);
    return { score, note: `${withHints}/${args.length} arguments have hints` };
}

function scoreToolReferences(body: string): DimensionScore {
    // Structured references (`tool:`/`tools:`) are a strong signal — they name a
    // tool dependency explicitly. Backtick-quoted tokens are a weak secondary
    // signal: any inline-code span matches, so prose with `json`/`true` must NOT
    // alone saturate the score (SECU #2). Cap their contribution at 1.
    const structuredCount = (body.match(/\btools?:/gi) ?? []).length;
    const backtickCount = (body.match(/`[a-z][a-z0-9_-]*`/g) ?? []).length;
    const weightedCount = structuredCount + Math.min(backtickCount, 1);

    let score: number;
    let note: string;
    if (structuredCount >= 1 || weightedCount >= 2) {
        score = 1.0;
        note = 'Uses tool references';
    } else if (weightedCount === 1) {
        score = 0.6;
        note = 'Limited tool references';
    } else {
        score = 0.1;
        note = 'No tool references found';
    }

    return { score, note };
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
        'tool-references': scoreToolReferences(body),
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
