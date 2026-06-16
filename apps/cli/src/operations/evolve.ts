import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { echo, echoError } from '@gobing-ai/ts-utils';
import { applyChange, type Change } from '../content/edit';
import { resolveContentName, resolveContentPath } from '../content/identity';
import { getProposalsDir } from '../content/paths';
import type { ContentType, QualityReport } from '../quality/dimensions';
import type { DbAdapter, Evaluation, Proposal } from '../store';
import { EvaluationDao } from '../store/evaluations';
import { ProposalDao } from '../store/proposals';
import type { Target } from '../targets';
import { evaluate } from './evaluate';

// ── Types ────────────────────────────────────────────────────────────────────

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

export interface TrendEntry {
    dimension: string;
    earliest: number;
    latest: number;
    delta: number;
    trend: 'improving' | 'declining' | 'flat';
}

export interface ProposedChange {
    dimension: string;
    location: string;
    current: string;
    proposed: string;
    reason: string;
}

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
            changes.push({
                dimension: trend.dimension,
                location: `dimension:${trend.dimension}`,
                current: `Score: ${trend.latest.toFixed(2)}`,
                proposed: `Improve ${trend.dimension} from ${trend.latest.toFixed(2)} toward 1.0`,
                reason: note
                    ? `Latest evaluation note: "${note}". Trend: ${trend.trend} (Δ${trend.delta >= 0 ? '+' : ''}${trend.delta.toFixed(2)}).`
                    : `Trend: ${trend.trend} (Δ${trend.delta >= 0 ? '+' : ''}${trend.delta.toFixed(2)}). Score below threshold.`,
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
): Promise<{ proposalId: string; proposalPath: string; changes: ProposedChange[]; proposalRecord: Proposal }> {
    const changes = generateChanges(report, trends);
    const proposalDao = new ProposalDao(db);

    const existingProposals = await proposalDao.getProposals(type, name);
    const proposalId = generateProposalId(type, name, existingProposals);

    const baselineId = evaluations[0]?.id ?? 0;

    const proposalJson = { changes, trends, baselineScore, baselineDate, evaluationsCount: evaluations.length };
    const id = await proposalDao.insertProposal({
        content_type: type,
        content_name: name,
        baseline_id: baselineId,
        proposal_json: proposalJson,
    });

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

    const status = 'draft' as const;
    const proposalRecord: Proposal = {
        id,
        content_type: type,
        content_name: name,
        baseline_id: baselineId,
        proposal_json: proposalJson,
        status,
        applied_at: null,
        verify_id: null,
        created_at: evaluations[0]?.created_at ?? 0,
        updated_at: 0,
    };

    return { proposalId, proposalPath, changes, proposalRecord };
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

async function interactiveReview(
    changes: ProposedChange[],
    trends: TrendEntry[],
): Promise<{ accepted: ProposedChange[]; rejected: ProposedChange[] }> {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
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
    proposalId: string,
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
            c = { kind: 'frontmatter', key, value: change.proposed };
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
    await proposalDao.updateProposalStatus(Number(proposalId), 'accepted', { applied_at: new Date().toISOString() });

    return applied;
}

async function stepVerify(
    type: ContentType,
    _name: string,
    filePath: string,
    baselineScore: number,
    opts: EvolveOptions | undefined,
    db: DbAdapter,
): Promise<{ postScore: number; delta: number }> {
    let postScore = baselineScore;
    try {
        const report = await evaluate(type, filePath, { target: opts?.target, adapter: db });
        postScore = report.aggregate;
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

    // Step 2: PROPOSE
    const { proposalId, proposalPath, changes } = await stepPropose(
        db,
        type,
        contentName,
        baselineReport,
        trends,
        evaluations,
        baselineScore,
        baselineDate,
    );

    // Step 3: REVIEW
    if (opts?.proposeOnly) {
        echo(`Proposal written to: ${proposalPath}`);
        return { baselineScore, postScore: baselineScore, delta: 0, changesApplied: 0, proposalPath };
    }

    let acceptedChanges: ProposedChange[] = [];

    if (opts?.rejectId) {
        const proposalDao = new ProposalDao(db);
        const proposals = await proposalDao.getProposals(type, contentName);
        const target = proposals.find((p) => String(p.id) === opts.rejectId);
        if (target) {
            await proposalDao.updateProposalStatus(target.id, 'rejected');
            echo(`Proposal ${opts.rejectId} rejected.`);
        }
        return { baselineScore, postScore: baselineScore, delta: 0, changesApplied: 0, proposalPath };
    }

    if (opts?.acceptId) {
        const proposalDao = new ProposalDao(db);
        const proposals = await proposalDao.getProposals(type, contentName);
        const target = proposals.find((p) => String(p.id) === opts.acceptId);
        if (target) {
            try {
                const json =
                    typeof target.proposal_json === 'string' ? JSON.parse(target.proposal_json) : target.proposal_json;
                acceptedChanges = (json?.changes as ProposedChange[]) ?? [];
            } catch {
                acceptedChanges = [];
            }
        }
    } else {
        // Interactive mode
        const result = await interactiveReview(changes, trends);
        acceptedChanges = result.accepted;
    }

    // Step 4: APPLY
    const changesApplied = await stepApply(acceptedChanges, resolvedPath, proposalId, db);

    // Step 5: VERIFY
    const { postScore, delta } = await stepVerify(type, contentName, resolvedPath, baselineScore, opts, db);

    return { baselineScore, postScore, delta, changesApplied, proposalPath };
}
