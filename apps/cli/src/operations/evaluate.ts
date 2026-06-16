import { echoError } from '@gobing-ai/ts-utils';
import { hashContent } from '../content/hash';
import { resolveContentName, resolveContentPath } from '../content/identity';
import { evaluateAgent } from '../quality/agent';
import { evaluateCommand } from '../quality/command';
import type { ContentType, QualityReport } from '../quality/dimensions';
import { evaluateHook } from '../quality/hook';
import { evaluateMagent } from '../quality/magent';
import { evaluateSkill } from '../quality/skill';
import type { DbAdapter } from '../store';
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
 * Reads the file, resolves the target agent, dispatches to the correct F009
 * evaluator, optionally persists results to the SQLite store (`--save`), and
 * returns a QualityReport.
 */
export async function evaluate(
    type: ContentType,
    nameOrPath: string,
    opts?: EvaluateOptions,
): Promise<EvaluationResult> {
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

    // 4. Dispatch evaluator
    const evaluator = EVALUATORS[type];
    const report = evaluator(content, resolvedTarget);

    // 5. Set canonical content name
    report.content = resolveContentName(resolvedPath);

    // 6. Persist if requested
    if (opts?.save) {
        await persistEvaluation(type, resolvedPath, resolvedTarget, report, opts);
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
): Promise<void> {
    try {
        const fileHash = hashContent(resolvedPath);
        const adapter = opts.adapter ?? (await (await import('../store/db')).openStore());
        const { EvaluationDao } = await import('../store/evaluations');
        const dao = new EvaluationDao(adapter);

        await dao.insertEvaluation({
            content_type: type,
            content_name: resolveContentName(resolvedPath),
            target_agent: resolvedTarget,
            operation: (opts.operation as 'evaluate' | 'refine' | 'evolve') ?? 'evaluate',
            aggregate: report.aggregate,
            dimensions: report.dimensions as Record<string, { score: number; note: string }>,
            file_hash: fileHash,
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
