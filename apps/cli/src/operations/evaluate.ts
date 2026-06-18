import { readFileSync } from 'node:fs';
import { echo, echoError } from '@gobing-ai/ts-utils';
import { hashContent } from '../content/hash';
import { resolveContentName, resolveContentPath } from '../content/identity';
import { evaluateAgent } from '../quality/agent';
import { evaluateCommand } from '../quality/command';
import type { ContentType, DimensionScore, QualityReport } from '../quality/dimensions';
import { evaluateHook } from '../quality/hook';
import { evaluateMagent } from '../quality/magent';
import type { Rubric } from '../quality/rubric';
import { loadRubric } from '../quality/rubric';
import { evaluateSkill } from '../quality/skill';
import type { DbAdapter } from '../store';
import { openStore } from '../store/db';
import { EvaluationDao } from '../store/evaluations';
import type { Target } from '../targets';

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
}

/** Result of an evaluate call — aliases QualityReport from F009. */
export type EvaluationResult = QualityReport;

// ── Evaluator Dispatch ───────────────────────────────────────────────────────

const EVALUATORS: Record<ContentType, (content: string, target: string) => QualityReport> = {
    skill: evaluateSkill,
    command: evaluateCommand,
    agent: evaluateAgent,
    hook: evaluateHook,
    magent: evaluateMagent,
};

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
    const evaluator = EVALUATORS[type];
    const report = evaluator(content, resolvedTarget);
    report.content = resolveContentName(resolvedPath);

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

    // Baseline: heuristic QualityReport for the same content
    const baseline = EVALUATORS[type](content, resolvedTarget);
    baseline.content = contentName;

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

    return lines.join('\n');
}
