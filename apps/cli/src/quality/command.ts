import {
    clamp,
    computeAggregate,
    type DimensionScore,
    extractBody,
    keywordDensity,
    parseFrontmatterSafe,
    type QualityReport,
    REQUIRED_FIELDS,
    scorePresence,
} from './dimensions';

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
    const imperative = keywordDensity(body, ['must', 'should', 'never', 'always', 'required', 'ensure', 'validate']);
    const vague = keywordDensity(body, ['maybe', 'perhaps', 'might', 'could be', 'probably']);
    const score = clamp(imperative - vague);

    const detectedVague: string[] = [];
    for (const v of ['maybe', 'perhaps', 'might', 'could be', 'probably']) {
        if (new RegExp(`(?:^|\\s)${v.replace(/\s/g, '\\s')}(?:\\s|$|[.,;:!?])`, 'i').test(body)) {
            detectedVague.push(v);
        }
    }

    const note =
        detectedVague.length > 0 ? `Uses vague language: ${detectedVague.join(', ')}` : 'Good imperative style';

    return { score, note };
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
    const toolRefs: RegExp[] = [/`[a-z][a-z0-9_-]*`/g, /tool:/gi, /tools:/gi];

    let count = 0;
    for (const pattern of toolRefs) {
        // Reset regex state for global patterns
        pattern.lastIndex = 0;
        const matches = body.match(pattern);
        if (matches) count += matches.length;
    }

    // Deduplicate backtick-quoted names that also appear in tool:/tools: labels
    // but keep it simple: count total matches

    let score: number;
    let note: string;
    if (count >= 2) {
        score = 1.0;
        note = 'Uses tool references';
    } else if (count === 1) {
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
