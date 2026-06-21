import { readFileSync } from 'node:fs';
import {
    type ContentType,
    type DimensionScore,
    evaluate as evaluateContent,
    hashContent,
    loadRubric,
    type QualityReport,
    type Rubric,
    resolveContentName,
    resolveContentPath,
    type Target,
} from '@gobing-ai/superskill-core';
import { echo, echoError } from '@gobing-ai/ts-utils';
import type { DbAdapter } from '../store';
import { openStore } from '../store/db';
import { EvaluationDao } from '../store/evaluations';

// ── Types ────────────────────────────────────────────────────────────────────

/** Options for the evaluate operation. */
export interface EvaluateOptions {
    /** Target agent (defaults to 'claude'). */
    target?: Target;
    /** Output as JSON instead of human-readable table. */
    json?: boolean;
    /** Persist the evaluation to the SQLite store. */
    save?: boolean;
    /** Operation label stored in the evaluations table (defaults to 'evaluate'; refine passes 'refine'). */
    operation?: string;
    /** Inject an already-open DbAdapter (e.g. from F013 evolve or tests). When absent and `save` is true, openStore() is called. */
    adapter?: DbAdapter;
    /** Path to a rubric file → envelope-out mode: emit scoring work-order JSON (with --json). No scoring, no DB write. */
    rubric?: string;
    /** Path to an agent-produced scores JSON → ingest-in mode: validate against rubric, persist (with --save). */
    ingest?: string;
    /** Show evaluation history from the store for the given content (--history mode). */
    history?: boolean;
}

/** Show prior evaluation rows from the SQLite store for a given content type and name. */
async function showHistory(type: ContentType, contentName: string, opts: EvaluateOptions): Promise<void> {
    const adapter = opts.adapter ?? (await openStore());
    const dao = new EvaluationDao(adapter);
    const rows = await dao.getEvaluations(type, contentName);

    if (rows.length === 0) return;

    const cols = { date: 19, agg: 9, verdict: 7 };
    const lines: string[] = [];
    lines.push(`Evaluation history for ${contentName} (${rows.length} entries):`);
    lines.push('');
    const header = `${'Date'.padEnd(cols.date)}  ${'Aggregate'.padEnd(cols.agg)}  ${'Verdict'.padEnd(cols.verdict)}  Scorer`;
    lines.push(header);
    lines.push('-'.repeat(header.length));

    for (const row of rows) {
        const date = new Date(row.created_at).toISOString().slice(0, 19).replace('T', ' ');
        const agg = row.aggregate.toFixed(2).padEnd(cols.agg);
        const verdict = (row.aggregate >= 0.7 ? 'PASS' : 'FAIL').padEnd(cols.verdict);
        const scorer = row.scorer ?? 'heuristic';
        const rv = row.rubric_version ? ` v${row.rubric_version}` : '';
        lines.push(`${date.padEnd(cols.date)}  ${agg}  ${verdict}  ${scorer}${rv}`);
    }

    echo(lines.join('\n'));
}

/** Result of an evaluate call — aliases QualityReport from F009. */
export type EvaluationResult = QualityReport;

// ── Core ─────────────────────────────────────────────────────────────────────

/**
 * Score content across type-specific quality dimensions.
 *
 * Three modes:
 * - **Heuristic** (default): deterministic F009 evaluators, equal-weighted aggregate.
 * - **Envelope-out** (`--rubric <file> --json`): emit a scoring work-order JSON for the agent. No scoring, no DB write.
 * - **Ingest-in** (`--ingest <scores.json> --save`): validate agent-produced scores against the rubric, persist.
 */
export async function evaluate(
    type: ContentType,
    nameOrPath: string,
    opts?: EvaluateOptions,
): Promise<EvaluationResult | null> {
    // 1. Resolve path
    const resolvedPath = resolveContentPath(type, nameOrPath);
    if (!resolvedPath) {
        throw Object.assign(new Error(`File not found: ${nameOrPath}`), { code: 2 });
    }

    // History mode: show prior evaluations from the store (E7)
    if (opts?.history) {
        await showHistory(type, resolveContentName(resolvedPath), opts);
        return null;
    }

    // 2. Read content
    let content: string;
    try {
        content = await Bun.file(resolvedPath).text();
    } catch {
        throw Object.assign(new Error(`Cannot read file: ${resolvedPath}`), { code: 2 });
    }

    // 3. Resolve target
    const resolvedTarget = opts?.target ?? 'claude';

    // 4. Ingest-in mode: validate + persist agent-produced rubric scores
    if (opts?.ingest) {
        return ingestScores(type, resolvedPath, resolvedTarget, opts);
    }

    // 5. Envelope-out mode: emit rubric + content + baseline as JSON work order
    if (opts?.rubric) {
        return emitEnvelope(type, resolvedPath, content, resolvedTarget, opts);
    }

    // 6. Heuristic mode (default): deterministic F009 evaluators
    const report = evaluateContent(type, content, resolvedTarget);
    report.content = resolveContentName(resolvedPath);
    applyRubricWeightingAndVerdict(type, report, opts);

    if (opts?.save) {
        await persistEvaluation(type, resolvedPath, resolvedTarget, report, opts);
    }

    return report;
}

// ── Scorer Seam (F022) ───────────────────────────────────────────────────────

/** Shape of the agent-produced scores JSON (ingest-in input). */
interface ScoresJson {
    rubric_version: number;
    dimensions: Record<string, { score: number; note: string }>;
}

/** Weighted aggregate: Σ(score × weight). Rubric weights sum to 1.0 (F021 R3). */
function computeWeightedAggregate(scores: Record<string, DimensionScore>, rubric: Rubric): number {
    let sum = 0;
    for (const dim of rubric.dimensions) {
        const entry = scores[dim.name];
        if (entry) {
            sum += entry.score * dim.weight;
        }
    }
    return sum;
}

/**
 * Apply rubric weighting and a verdict/grade to a heuristic report in place.
 *
 * `loadRubric` throws when no rubric ships for the type — in that case the
 * equal-weight aggregate from `evaluateContent` is kept. This is the single
 * source of truth for the default-path aggregate so the envelope baseline and
 * the default report share the same weighting basis (Scorer deltas stay comparable).
 */
function applyRubricWeightingAndVerdict(type: ContentType, report: QualityReport, opts?: EvaluateOptions): void {
    try {
        const rubric = loadRubric(type, opts?.rubric ? { path: opts.rubric } : undefined);
        report.aggregate = computeWeightedAggregate(report.dimensions, rubric);
    } catch {
        // No rubric available: keep the equal-weight aggregate from evaluateContent.
    }

    const agg = report.aggregate;
    report.verdict = agg >= 0.7 ? 'PASS' : 'FAIL';
    if (agg >= 0.9) report.grade = 'A';
    else if (agg >= 0.75) report.grade = 'B';
    else if (agg >= 0.6) report.grade = 'C';
    else if (agg >= 0.45) report.grade = 'D';
    else report.grade = 'F';
}

/**
 * Envelope-out: emit `{ type, content_name, target, content, rubric, baseline }` as JSON.
 * No scoring, no DB write, no model call. The agent scores offline and returns via --ingest.
 */
function emitEnvelope(
    type: ContentType,
    resolvedPath: string,
    content: string,
    resolvedTarget: string,
    opts: EvaluateOptions,
): null {
    const rubric = loadRubric(type, { path: opts.rubric });
    const contentName = resolveContentName(resolvedPath);

    // Baseline: heuristic QualityReport, weighted on the same basis as the default
    // report (P2#3) so the Scorer's deltas against the baseline stay comparable.
    const baseline = evaluateContent(type, content, resolvedTarget);
    baseline.content = contentName;
    applyRubricWeightingAndVerdict(type, baseline, opts);

    const envelope = {
        type,
        content_name: contentName,
        target: resolvedTarget,
        content,
        rubric: { version: rubric.version, type: rubric.type, dimensions: rubric.dimensions },
        baseline,
    };

    echo(JSON.stringify(envelope, null, 2));
    return null;
}

/**
 * Ingest-in: validate agent-produced scores against the rubric, compute weighted aggregate, persist.
 * On validation failure: throw with code=1 and field name — no row inserted.
 */
async function ingestScores(
    type: ContentType,
    resolvedPath: string,
    resolvedTarget: string,
    opts: EvaluateOptions,
): Promise<QualityReport> {
    const rubric = loadRubric(type, opts.rubric ? { path: opts.rubric } : {});
    const contentName = resolveContentName(resolvedPath);
    const ingestPath = opts.ingest;
    if (!ingestPath) {
        throw Object.assign(new Error('No scores file provided'), { code: 1, field: 'ingest' });
    }

    // Read + parse scores JSON
    let raw: string;
    try {
        raw = readFileSync(ingestPath, 'utf-8');
    } catch {
        throw Object.assign(new Error(`Cannot read scores file: ${ingestPath}`), { code: 2 });
    }

    let scores: ScoresJson;
    try {
        scores = JSON.parse(raw) as ScoresJson;
    } catch {
        throw Object.assign(new Error(`Invalid JSON in scores file: ${opts.ingest}`), { code: 1, field: 'json' });
    }

    // Validate rubric_version matches
    if (scores.rubric_version !== rubric.version) {
        throw Object.assign(
            new Error(`rubric_version mismatch: scores has ${scores.rubric_version}, rubric has ${rubric.version}`),
            { code: 1, field: 'rubric_version', actual: scores.rubric_version },
        );
    }

    // Validate every rubric dimension is present, no extras, scores in [0,1]
    const rubricDimNames = new Set(rubric.dimensions.map((d) => d.name));
    const scoreDimNames = new Set(Object.keys(scores.dimensions));

    for (const dimName of rubricDimNames) {
        if (!scoreDimNames.has(dimName)) {
            throw Object.assign(new Error(`Missing dimension in scores: ${dimName}`), {
                code: 1,
                field: `dimensions.${dimName}.missing`,
            });
        }
    }

    for (const dimName of scoreDimNames) {
        if (!rubricDimNames.has(dimName)) {
            throw Object.assign(new Error(`Unexpected dimension in scores: ${dimName}`), {
                code: 1,
                field: `dimensions.${dimName}.unexpected`,
            });
        }

        const entry = scores.dimensions[dimName];
        if (typeof entry?.score !== 'number' || entry.score < 0 || entry.score > 1) {
            throw Object.assign(new Error(`Score out of range [0,1] for dimension ${dimName}: ${entry?.score}`), {
                code: 1,
                field: `dimensions.${dimName}.score`,
                actual: entry?.score,
            });
        }
    }

    // Build QualityReport with weighted aggregate
    const dimensions = scores.dimensions as Record<string, DimensionScore>;
    const aggregate = computeWeightedAggregate(dimensions, rubric);
    const report: QualityReport = {
        content: contentName,
        type,
        target: resolvedTarget,
        aggregate,
        dimensions,
    };

    // Persist with scorer='rubric' marker + rubric_version
    if (opts.save) {
        await persistEvaluation(type, resolvedPath, resolvedTarget, report, opts, 'rubric', rubric.version);
    }

    return report;
}

// ── Persistence ──────────────────────────────────────────────────────────────

async function persistEvaluation(
    type: ContentType,
    resolvedPath: string,
    resolvedTarget: string,
    report: QualityReport,
    opts: EvaluateOptions,
    scorer?: string,
    rubricVersion?: number,
): Promise<void> {
    try {
        const fileHash = hashContent(resolvedPath);
        const adapter = opts.adapter ?? (await openStore());
        const dao = new EvaluationDao(adapter);

        await dao.insertEvaluation({
            content_type: type,
            content_name: resolveContentName(resolvedPath),
            target_agent: resolvedTarget,
            operation: (opts.operation as 'evaluate' | 'refine' | 'evolve') ?? 'evaluate',
            aggregate: report.aggregate,
            dimensions: report.dimensions as Record<string, { score: number; note: string }>,
            file_hash: fileHash,
            scorer: scorer ?? 'heuristic',
            ...(rubricVersion !== undefined ? { rubric_version: rubricVersion } : {}),
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        echoError(`Warning: failed to save evaluation: ${msg}`);
    }
}

// ── Output ───────────────────────────────────────────────────────────────────

/**
 * Format a QualityReport for display.
 * - JSON mode: full report as JSON string.
 * - Human mode: aligned table with dimensions, scores, notes, and aggregate.
 */
export function formatEvaluationReport(report: QualityReport, json?: boolean): string {
    if (json) {
        return JSON.stringify(report);
    }

    const lines: string[] = [];
    const dimNames = Object.keys(report.dimensions);
    const maxNameLen = Math.max(...dimNames.map((n) => n.length), 'AGGREGATE'.length);

    for (const name of dimNames) {
        const dim = report.dimensions[name];
        if (!dim) continue;
        const score = dim.score.toFixed(2);
        const padded = name.padEnd(maxNameLen);
        lines.push(`  ${padded}  ${score}  ${dim.note}`);
    }

    lines.push(`  ${'─'.repeat(maxNameLen)}${'─'.repeat(30)}`);
    lines.push(`  ${'AGGREGATE'.padEnd(maxNameLen)}  ${report.aggregate.toFixed(2)}`);

    // Verdict + grade (E5)
    if (report.verdict || report.grade) {
        lines.push('');
        lines.push(`  Verdict: ${report.verdict ?? ''}  Grade: ${report.grade ?? ''}`);
    }

    // Findings + Recommendations (E5)
    const findings: string[] = [];
    const recommendations: string[] = [];
    for (const name of dimNames) {
        const dim = report.dimensions[name];
        if (!dim) continue;
        if (dim.findings) findings.push(...dim.findings.map((f) => `[${name}] ${f}`));
        if (dim.recommendations) recommendations.push(...dim.recommendations.map((r) => `[${name}] ${r}`));
    }

    if (findings.length > 0) {
        lines.push('');
        lines.push('Findings:');
        for (const f of findings) lines.push(`  • ${f}`);
    }
    if (recommendations.length > 0) {
        lines.push('');
        lines.push('Recommendations:');
        for (const r of recommendations) lines.push(`  → ${r}`);
    }

    return lines.join('\n');
}
