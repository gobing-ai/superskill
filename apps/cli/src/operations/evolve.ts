import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { echo, echoError } from '@gobing-ai/ts-utils';
import { applyChange, type Change } from '../content/edit';
import { parseFrontmatter } from '../content/frontmatter';
import { resolveContentName, resolveContentPath } from '../content/identity';
import { getProposalsDir } from '../content/paths';
import type { ContentType, QualityReport } from '../quality/dimensions';
import type { DbAdapter, Evaluation, Proposal } from '../store';
import { EvaluationDao } from '../store/evaluations';
import { ProposalDao } from '../store/proposals';
import type { Target } from '../targets';
import { evaluate } from './evaluate';

// ── Types ────────────────────────────────────────────────────────────────────

/** Options controlling the evolve pipeline's behavior. */
export interface EvolveOptions {
    target?: Target;
    /** ISO date string for filtering evaluations (only those after this date). */
    from?: string;
    /** Write proposal file only, do not apply changes. */
    proposeOnly?: boolean;
    /** Accept and apply a proposal by its `proposal_id`. */
    acceptId?: string;
    /** Reject a proposal by its `proposal_id`. */
    rejectId?: string;
    /** Inject an already-open DbAdapter for testing. */
    adapter?: DbAdapter;
}

/** A single dimension's trend over time: earliest score, latest score, delta, and trend direction. */
export interface TrendEntry {
    dimension: string;
    earliest: number;
    latest: number;
    delta: number;
    trend: 'improving' | 'declining' | 'flat';
}

/** A concrete change proposed by the evolve operation. */
export interface ProposedChange {
    dimension: string;
    location: string;
    current: string;
    proposed: string;
    reason: string;
}

/** Result of an evolve() call: baseline/post scores, delta, changes applied, and proposal path. */
export interface EvolveResult {
    baselineScore: number;
    postScore: number;
    delta: number;
    changesApplied: number;
    proposalPath: string;
}
// ── Pure Helpers ─────────────────────────────────────────────────────────────

/**
 * Compute per-dimension trends from a list of evaluations (sorted by created_at ASC).
 * Returns empty array when fewer than 2 evaluations exist.
 *
 * Trend classification:
 * - `'improving'` if delta ≥ 0.05
 * - `'declining'` if delta ≤ -0.05
 * - `'flat'` if |delta| < 0.05
 *
 * Sorted: declining first, then flat, then improving; within same trend, lowest latest first.
 */
export function computeTrends(evaluations: Evaluation[]): TrendEntry[] {
    if (evaluations.length < 2) return [];

    const ordered = [...evaluations].sort((a, b) => a.created_at - b.created_at);

    const dims = new Map<string, { earliest: number; earliestDate: number; latest: number; latestDate: number }>();
    for (const record of ordered) {
        const dimsData = record.dimensions as Record<string, { score: number }> | undefined;
        if (!dimsData || typeof dimsData !== 'object') continue;
        for (const [dim, { score }] of Object.entries(dimsData)) {
            const existing = dims.get(dim);
            if (!existing) {
                dims.set(dim, {
                    earliest: score,
                    earliestDate: record.created_at,
                    latest: score,
                    latestDate: record.created_at,
                });
            } else if (record.created_at > existing.latestDate) {
                existing.latest = score;
                existing.latestDate = record.created_at;
            }
        }
    }

    const trends: TrendEntry[] = [];
    for (const [dimension, { earliest, latest }] of dims) {
        const delta = earliest === latest ? 0 : latest - earliest;
        const trend = delta >= 0.05 ? 'improving' : delta <= -0.05 ? 'declining' : 'flat';
        trends.push({ dimension, earliest, latest, delta, trend });
    }

    trends.sort((a, b) => {
        const rank = (t: TrendEntry) => (t.trend === 'declining' ? 0 : t.trend === 'flat' ? 1 : 2);
        const r = rank(a) - rank(b);
        if (r !== 0) return r;
        return a.latest - b.latest;
    });

    return trends;
}

/**
 * Generate proposed changes from a quality report and trend table.
 * Only proposes for declining dimensions or flat dimensions below 0.7.
 */
export function generateChanges(report: QualityReport, trends: TrendEntry[]): ProposedChange[] {
    const changes: ProposedChange[] = [];
    const dimMap = new Map(Object.entries(report.dimensions));

    for (const trend of trends) {
        if (trend.trend === 'declining' || (trend.trend === 'flat' && trend.latest < 0.7)) {
            const dimData = dimMap.get(trend.dimension);
            const note = dimData?.note ?? '';
            const suggestion = note
                ? `[Improve ${trend.dimension}]: ${note}`
                : `[Improve ${trend.dimension}]: review and enhance the description for better ${trend.dimension}.`;
            changes.push({
                dimension: trend.dimension,
                location: 'frontmatter.description',
                current: `${trend.dimension} score: ${trend.latest.toFixed(2)}`,
                proposed: suggestion,
                reason: note
                    ? `Score: ${trend.latest.toFixed(2)} (trend: ${trend.trend}, Δ${trend.delta >= 0 ? '+' : ''}${trend.delta.toFixed(2)}). Note: "${note}".`
                    : `Score: ${trend.latest.toFixed(2)} (trend: ${trend.trend}, Δ${trend.delta >= 0 ? '+' : ''}${trend.delta.toFixed(2)}). Score below threshold.`,
            });
        }
    }

    return changes;
}

/**
 * Generate a proposal ID in the format `<type>-evolve-<YYYY-MM-DD>-<NNN>`.
 * NNN is the next sequence number, zero-padded to 3 digits.
 */
export function generateProposalId(type: ContentType, _name: string, existingProposals: Proposal[]): string {
    const date = new Date().toISOString().slice(0, 10);
    const seq = String(existingProposals.length + 1).padStart(3, '0');
    return `${type}-evolve-${date}-${seq}`;
}

// ── Internal Steps ───────────────────────────────────────────────────────────

async function openDb(opts?: EvolveOptions): Promise<DbAdapter> {
    if (opts?.adapter) return opts.adapter;
    const { openStore } = await import('../store/db');
    return openStore();
}

interface AnalyzeResult {
    evaluations: Evaluation[];
    trends: TrendEntry[];
    baselineScore: number;
    baselineDate: string;
}

async function stepAnalyze(
    db: DbAdapter,
    type: ContentType,
    name: string,
    opts?: EvolveOptions,
): Promise<AnalyzeResult> {
    const evalDao = new EvaluationDao(db);
    let evaluations = await evalDao.getEvaluations(type, name);

    if (opts?.from) {
        const fromMs = Date.parse(opts.from);
        if (!Number.isNaN(fromMs)) {
            evaluations = evaluations.filter((e) => e.created_at >= fromMs);
        }
    }

    if (evaluations.length === 0) {
        throw Object.assign(
            new Error(
                `No historical evaluations found for ${type}/${name}. Run \`superskill ${type} evaluate ${name} --save\` first to build evaluation history.`,
            ),
            { code: 1 },
        );
    }

    const trends = computeTrends(evaluations);
    const newest = evaluations[0] as Evaluation;
    const baselineScore = newest.aggregate;
    const baselineDate = new Date(newest.created_at).toISOString();

    return { evaluations, trends, baselineScore, baselineDate };
}

async function stepPropose(
    db: DbAdapter,
    type: ContentType,
    name: string,
    report: QualityReport,
    trends: TrendEntry[],
    evaluations: Evaluation[],
    baselineScore: number,
    baselineDate: string,
): Promise<{
    proposalId: string;
    proposalDbId: number;
    proposalPath: string;
    changes: ProposedChange[];
    proposalRecord: Proposal;
}> {
    const changes = generateChanges(report, trends);
    const proposalDao = new ProposalDao(db);

    const existingProposals = await proposalDao.getProposals(type, name);
    const proposalId = generateProposalId(type, name, existingProposals);

    const baselineId = evaluations[0]?.id ?? 0;

    const proposalJson = {
        proposal_id: proposalId,
        changes,
        trends,
        baselineScore,
        baselineDate,
        evaluationsCount: evaluations.length,
    };
    const proposalRecord = await proposalDao.insertProposal({
        content_type: type,
        content_name: name,
        baseline_id: baselineId,
        proposal_json: proposalJson,
    });
    const id = proposalRecord.id;

    const proposalsRoot = getProposalsDir();
    const proposalDir = join(proposalsRoot, type, name);
    mkdirSync(proposalDir, { recursive: true });

    const today = new Date().toISOString().slice(0, 10);
    const proposalPath = join(proposalDir, `${today}-${proposalId}.md`);

    writeProposalFile(proposalPath, {
        type,
        name,
        baselineScore,
        baselineDate,
        evaluationsCount: evaluations.length,
        trends,
        changes,
        proposalId,
    });

    return { proposalId, proposalDbId: id, proposalPath, changes, proposalRecord };
}

function writeProposalFile(
    path: string,
    info: {
        type: ContentType;
        name: string;
        baselineScore: number;
        baselineDate: string;
        evaluationsCount: number;
        trends: TrendEntry[];
        changes: ProposedChange[];
        proposalId: string;
    },
): void {
    const lines: string[] = [];
    lines.push('---');
    lines.push(`proposal_id: ${info.proposalId}`);
    lines.push(`content: ${info.name}`);
    lines.push(`type: ${info.type}`);
    lines.push(`baseline_score: ${info.baselineScore.toFixed(2)}`);
    lines.push(`baseline_date: ${info.baselineDate}`);
    lines.push(`from_evaluations: ${info.evaluationsCount}`);
    lines.push('---');
    lines.push('');
    lines.push(`# Evolution Proposal: ${info.name}`);
    lines.push('');
    lines.push('## Trend analysis');
    lines.push('');
    lines.push('| Dimension | Baseline | Current | Trend |');
    lines.push('|-----------|----------|---------|-------|');

    for (const t of info.trends) {
        const arrow = t.trend === 'improving' ? '↑' : t.trend === 'declining' ? '↓' : '→';
        lines.push(`| ${t.dimension} | ${t.earliest.toFixed(2)} | ${t.latest.toFixed(2)} | ${arrow} ${t.trend} |`);
    }

    lines.push('');
    lines.push('## Proposed changes');
    lines.push('');
    for (let i = 0; i < info.changes.length; i++) {
        const c = info.changes[i];
        if (!c) continue;
        lines.push(`### ${i + 1}. Fix ${c.dimension}`);
        lines.push(`**Location:** ${c.location}`);
        lines.push(`**Current:** ${c.current}`);
        lines.push(`**Proposed:** ${c.proposed}`);
        lines.push(`**Reason:** ${c.reason}`);
        lines.push('');
    }

    writeFileSync(path, lines.join('\n'), 'utf-8');
}

// ── Interactive Review ───────────────────────────────────────────────────────

/**
 * Present proposed changes to the user via a readline interface.
 * Displays a trend table first, then prompts accept/reject/edit/quit per change.
 *
 * @param changes  Proposed changes to review.
 * @param trends  Trend entries for display.
 * @param _createRl  Injectable readline factory for testing.
 * @returns  Accepted and rejected changes.
 */
export async function interactiveReview(
    changes: ProposedChange[],
    trends: TrendEntry[],
    _createRl: typeof createInterface = createInterface,
): Promise<{ accepted: ProposedChange[]; rejected: ProposedChange[] }> {
    const rl = _createRl({ input: process.stdin, output: process.stdout });
    const q = (prompt: string): Promise<string> => new Promise((resolve) => rl.question(prompt, resolve));

    // Display trend table
    echo('\nTrend analysis:');
    for (const t of trends) {
        const arrow = t.trend === 'improving' ? '↑' : t.trend === 'declining' ? '↓' : '→';
        echo(`  ${t.dimension.padEnd(20)} ${t.earliest.toFixed(2)} → ${t.latest.toFixed(2)} ${arrow}`);
    }

    const accepted: ProposedChange[] = [];
    const rejected: ProposedChange[] = [];

    for (let i = 0; i < changes.length; i++) {
        const c = changes[i];
        if (!c) continue;
        echo(`\nChange ${i + 1}/${changes.length}: ${c.dimension}`);
        echo(`  Location: ${c.location}`);
        echo(`  Current:  ${c.current}`);
        echo(`  Proposed: ${c.proposed}`);
        echo(`  Reason:   ${c.reason}`);

        const prompt = '  (a)ccept / (r)eject / (e)dit / (q)uit: ';
        const answer = (await q(prompt)).trim().toLowerCase();

        if (answer === 'q') {
            rejected.push(...changes.slice(i));
            break;
        }

        if (answer === 'a') {
            accepted.push(c);
        } else if (answer === 'e') {
            const edited = (await q('  New proposed text: ')).trim();
            if (edited) {
                accepted.push({ ...c, proposed: edited });
            }
        } else {
            rejected.push(c);
        }
    }

    rl.close();
    return { accepted, rejected };
}

async function stepApply(
    acceptedChanges: ProposedChange[],
    filePath: string,
    proposalDbId: number,
    db: DbAdapter,
): Promise<number> {
    let content: string;
    try {
        content = await Bun.file(filePath).text();
    } catch {
        echoError(`Cannot read file: ${filePath}`);
        return 0;
    }

    let applied = 0;
    for (const change of acceptedChanges) {
        let c: Change;
        if (change.location.startsWith('frontmatter.')) {
            const key = change.location.replace(/^frontmatter\./, '');
            let value: unknown = change.proposed;
            if (key === 'description') {
                // Prepend the evolve suggestion to the existing description instead of replacing it.
                const parsed = parseFrontmatter(content);
                const existing = parsed.data?.description;
                if (existing && typeof existing === 'string' && existing.trim()) {
                    value = `${change.proposed}\n\n${existing}`;
                }
            }
            c = { kind: 'frontmatter', key, value };
        } else {
            if (!content.includes(change.current)) {
                echoError(
                    `Warning: could not find "${change.current.slice(0, 60)}" in content — skipping change for ${change.dimension}`,
                );
                continue;
            }
            c = { kind: 'text', current: change.current, proposed: change.proposed };
        }
        content = applyChange(content, c);
        applied++;
    }

    await Bun.write(filePath, content);

    const proposalDao = new ProposalDao(db);
    await proposalDao.updateProposalStatus(proposalDbId, 'accepted', { applied_at: new Date().toISOString() });

    return applied;
}

async function stepVerify(
    type: ContentType,
    name: string,
    filePath: string,
    baselineScore: number,
    proposalDbId: number,
    opts: EvolveOptions | undefined,
    db: DbAdapter,
): Promise<{ postScore: number; delta: number }> {
    let postScore = baselineScore;
    try {
        // R10: persist the post-evolution evaluation with operation 'evolve' (reuses the same store adapter).
        const report = await evaluate(type, filePath, {
            target: opts?.target,
            adapter: db,
            save: true,
            operation: 'evolve',
        });
        postScore = report.aggregate;

        // R10: link the proposal back to the verifying evaluation row.
        const verifyEval = await new EvaluationDao(db).getLatestEvaluation(type, name);
        if (verifyEval) {
            await new ProposalDao(db).updateProposalStatus(proposalDbId, 'accepted', { verify_id: verifyEval.id });
        }
    } catch {
        echoError('Cannot re-evaluate after changes.');
    }

    const delta = postScore - baselineScore;
    const pctStr = baselineScore > 0 ? `, ${delta >= 0 ? '+' : ''}${((delta / baselineScore) * 100).toFixed(1)}%` : '';
    echo(
        `Score: ${baselineScore.toFixed(2)} → ${postScore.toFixed(2)} (${delta >= 0 ? '+' : ''}${delta.toFixed(2)}${pctStr})`,
    );

    return { postScore, delta };
}

// ── Core ─────────────────────────────────────────────────────────────────────

/**
 * The self-evolution loop: analyze historical evaluations, propose improvements,
 * review/apply, and verify score improvement.
 *
 * 5-step workflow:
 * 1. ANALYZE — query evaluations, compute per-dimension trends
 * 2. PROPOSE — generate changes for declining/flat-low dimensions
 * 3. REVIEW — interactive, --propose-only, --accept, or --reject
 * 4. APPLY — apply accepted changes via `applyChange` from F007
 * 5. VERIFY — re-evaluate and display score delta
 */
export async function evolve(type: ContentType, name: string, opts?: EvolveOptions): Promise<EvolveResult> {
    // Resolve path
    const resolvedPath = resolveContentPath(type, name);
    if (!resolvedPath || !existsSync(resolvedPath)) {
        echoError(`File not found: ${name}`);
        return { baselineScore: 0, postScore: 0, delta: 0, changesApplied: 0, proposalPath: '' };
    }
    const contentName = resolveContentName(resolvedPath);

    let db: DbAdapter;
    try {
        db = await openDb(opts);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        echoError(`Could not open the evaluation store. ${msg}`);
        return { baselineScore: 0, postScore: 0, delta: 0, changesApplied: 0, proposalPath: '' };
    }

    // Step 1: ANALYZE
    let analysis: AnalyzeResult;
    try {
        analysis = await stepAnalyze(db, type, contentName, opts);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        echoError(msg);
        return { baselineScore: 0, postScore: 0, delta: 0, changesApplied: 0, proposalPath: '' };
    }

    const { trends, baselineScore, baselineDate, evaluations } = analysis;

    // Single evaluation edge case
    if (evaluations.length < 2) {
        echo(
            'Only one evaluation found — need at least two for trend analysis. Running evaluation-based proposal instead.',
        );
    }

    // Get baseline report
    let baselineReport: QualityReport;
    try {
        baselineReport = await evaluate(type, resolvedPath, { target: opts?.target });
    } catch {
        echoError('Cannot evaluate content.');
        return { baselineScore, postScore: baselineScore, delta: 0, changesApplied: 0, proposalPath: '' };
    }

    // Step 3 (early): --reject loads an existing proposal by id and rejects it; no new proposal, no apply.
    if (opts?.rejectId) {
        const proposalDao = new ProposalDao(db);
        const existing = await proposalDao.getProposals(type, contentName);
        const target = existing.find((p) => {
            const json = typeof p.proposal_json === 'string' ? JSON.parse(p.proposal_json) : p.proposal_json;
            return (json as Record<string, unknown>)?.proposal_id === opts.rejectId;
        });
        if (target) {
            await proposalDao.updateProposalStatus(target.id, 'rejected');
            echo(`Proposal ${opts.rejectId} rejected.`);
        } else {
            echoError(`Proposal ${opts.rejectId} not found for ${type}/${contentName}.`);
        }
        return { baselineScore, postScore: baselineScore, delta: 0, changesApplied: 0, proposalPath: '' };
    }

    // Step 3 (early): --accept loads an existing proposal by id and applies *its* changes against *its* id.
    if (opts?.acceptId) {
        const proposalDao = new ProposalDao(db);
        const existing = await proposalDao.getProposals(type, contentName);
        const target = existing.find((p) => {
            const json = typeof p.proposal_json === 'string' ? JSON.parse(p.proposal_json) : p.proposal_json;
            return (json as Record<string, unknown>)?.proposal_id === opts.acceptId;
        });
        if (!target) {
            echoError(`Proposal ${opts.acceptId} not found for ${type}/${contentName}.`);
            return { baselineScore, postScore: baselineScore, delta: 0, changesApplied: 0, proposalPath: '' };
        }
        let acceptedFromStore: ProposedChange[] = [];
        try {
            const json =
                typeof target.proposal_json === 'string' ? JSON.parse(target.proposal_json) : target.proposal_json;
            acceptedFromStore = (json?.changes as ProposedChange[]) ?? [];
        } catch {
            acceptedFromStore = [];
        }
        const appliedCount = await stepApply(acceptedFromStore, resolvedPath, target.id, db);
        const verdict = await stepVerify(type, contentName, resolvedPath, baselineScore, target.id, opts, db);
        return {
            baselineScore,
            postScore: verdict.postScore,
            delta: verdict.delta,
            changesApplied: appliedCount,
            proposalPath: '',
        };
    }

    // Step 2: PROPOSE (interactive and --propose-only paths create a fresh draft).
    const { proposalDbId, proposalPath, changes } = await stepPropose(
        db,
        type,
        contentName,
        baselineReport,
        trends,
        evaluations,
        baselineScore,
        baselineDate,
    );

    // Step 3: REVIEW — --propose-only writes the draft and stops.
    if (opts?.proposeOnly) {
        echo(`Proposal written to: ${proposalPath}`);
        return { baselineScore, postScore: baselineScore, delta: 0, changesApplied: 0, proposalPath };
    }

    // Interactive mode
    const { accepted: acceptedChanges } = await interactiveReview(changes, trends);

    // Step 4: APPLY
    const changesApplied = await stepApply(acceptedChanges, resolvedPath, proposalDbId, db);

    // Step 5: VERIFY
    const { postScore, delta } = await stepVerify(
        type,
        contentName,
        resolvedPath,
        baselineScore,
        proposalDbId,
        opts,
        db,
    );

    return { baselineScore, postScore, delta, changesApplied, proposalPath };
}
