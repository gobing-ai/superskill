import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import {
    applyChange,
    backupFile,
    type Change,
    type ContentType,
    getProposalsDir,
    loadEvalCases,
    loadRubric,
    parseFrontmatter,
    type QualityReport,
    resolveContentName,
    resolveContentPath,
    restoreFromBackup,
    type Target,
} from '@gobing-ai/superskill-core';
import { echo, echoError } from '@gobing-ai/ts-utils';
import type { DbAdapter, Evaluation, Proposal } from '../store';
import { EvaluationDao } from '../store/evaluations';
import { ProposalDao } from '../store/proposals';
import { evaluate } from './evaluate';
import { createReplayBackend, type ReplayBackend, replaySplit } from './replay-runner';
import { validate } from './validate';

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
    /** Output machine-readable JSON (envelope-out mode with --propose-only). */
    json?: boolean;
    /** Path to an agent-authored proposal JSON (ingest-in mode). */
    ingest?: string;
    /** Δ-margin gate threshold: post must exceed baseline by at least this (default 0.05). */
    margin?: number;
    /** Print analysis summary (trend table + score/grade + data sources) without writing a proposal. */
    analyze?: boolean;
    /** List applied proposal versions from the store. */
    history?: boolean;
    /** Rollback to a prior version by proposal_id (requires --confirm). */
    rollback?: string;
    /** Confirm a destructive operation (required for --rollback). */
    confirm?: boolean;
    /** Enable the empirical behavior gate (requires skills/<name>/eval/cases.yaml). */
    evalGate?: boolean;
    /** Internal test seam for deterministic empirical-gate replay without model calls. */
    replayBackend?: ReplayBackend;
    /** Inject an already-open DbAdapter for testing. */
    adapter?: DbAdapter;
}

/** Immutable goal anchor emitted verbatim in every generation brief (design §2.2, anti-drift). */
export interface GenerationAnchor {
    /** Original frontmatter as parsed — never summarised. */
    frontmatter: Record<string, unknown>;
    /** Rubric criterion for this dimension, verbatim. */
    rubric_criteria: string;
    /** Negative constraints (DON'T/NEVER rules) from the description, verbatim. */
    negative_constraints: string[];
}

/** A work-order brief for the Author persona: what dimension, current text, target criterion, anchor. */
export interface GenerationBrief {
    dimension: string;
    current_text: string;
    target_criterion: string;
    anchor: GenerationAnchor;
    /** 16-hex sha256 of the anchor — the agent echoes this in the proposal so the gate detects drift (F024 R3). */
    anchor_hash: string;
}

/** A single dimension's trend over time: earliest score, latest score, delta, and trend direction. */
export interface TrendEntry {
    dimension: string;
    earliest: number;
    latest: number;
    delta: number;
    trend: 'improving' | 'declining' | 'flat';
    /** True when a rubric version boundary exists in the evaluation history (F022 R8). */
    version_boundary?: boolean;
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
    /** True when the double-loop gate rejected the proposal (file restored, proposal stays draft). */
    rejected?: boolean;
    /** Human-readable reason the gate rejected the proposal (names the failed gate). */
    rejectionReason?: string;
}

/** Skeptic persona verdict carried on an ingested proposal (F024 R4). Absent ⇒ treated as ok. */
export interface SkepticVerdict {
    ok: boolean;
    violations?: string[];
    note?: string;
}
// ── Pure Helpers ─────────────────────────────────────────────────────────────

/**
 * Task 0056 decision C: hooks are analyze-only. Detect whether any apply-capable
 * option is set so `evolve()` can refuse early for hook content.
 */
export function isHookApplyCapableOpt(opts?: EvolveOptions): boolean {
    if (!opts) return false;
    return Boolean(opts.proposeOnly || opts.acceptId || opts.rejectId || opts.ingest || opts.history || opts.rollback);
}
/**
 * Compute per-dimension trends from a list of evaluations (sorted by created_at ASC).
 * Returns empty array when fewer than 2 evaluations exist.
 *
 * Trend classification:
 * - `'improving'` if delta ≥ 0.05
 * - `'declining'` if delta ≤ -0.05
 * - `'flat'` if |delta| < 0.05
 *
 * Version-aware (F022 R8): evaluations are partitioned by rubric_version. Trends are
 * computed within each partition only — a rubric version change is never compared as a
 * regression. When multiple version partitions exist, every TrendEntry carries
 * `version_boundary: true` so callers can flag the boundary.
 *
 * Sorted: declining first, then flat, then improving; within same trend, lowest latest first.
 */
export function computeTrends(evaluations: Evaluation[]): TrendEntry[] {
    if (evaluations.length < 2) return [];

    const ordered = [...evaluations].sort((a, b) => a.created_at - b.created_at);

    // Partition by rubric_version (null/undefined = heuristic group). F022 R8:
    // only compare scores within the same rubric version, or flag a version boundary.
    const partitions = new Map<string, Evaluation[]>();
    for (const record of ordered) {
        const key = record.rubric_version !== undefined ? String(record.rubric_version) : 'heuristic';
        const group = partitions.get(key);
        if (group) {
            group.push(record);
        } else {
            partitions.set(key, [record]);
        }
    }

    const hasVersionBoundary = partitions.size > 1;
    const trends: TrendEntry[] = [];

    for (const group of partitions.values()) {
        if (group.length < 2) continue;

        const dims = new Map<string, { earliest: number; earliestDate: number; latest: number; latestDate: number }>();
        for (const record of group) {
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

        for (const [dimension, { earliest, latest }] of dims) {
            const delta = earliest === latest ? 0 : latest - earliest;
            const trend = delta >= 0.05 ? 'improving' : delta <= -0.05 ? 'declining' : 'flat';
            trends.push({
                dimension,
                earliest,
                latest,
                delta,
                trend,
                ...(hasVersionBoundary ? { version_boundary: true } : {}),
            });
        }
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
 * Detect whether a content string carries a YAML frontmatter block (`---\n…\n---\n`).
 * Used to gate frontmatter-only code paths so frontmatter-OPTIONAL types (magents) degrade gracefully.
 */
function hasFrontmatter(content: string): boolean {
    if (!content.startsWith('---\n')) return false;
    return /\n---(?=\n|$)/.test(content.slice(4));
}

/** Extract the first non-empty line of a content body as a stable text anchor for body-targeted changes. */
function firstBodyLine(content: string): string {
    for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed) return trimmed;
    }
    return '';
}

/**
 * Generate proposed changes from a quality report and trend table.
 * Only proposes for declining dimensions or flat dimensions below 0.7.
 *
 * Frontmatter-OPTIONAL guard (task 0054): when `content` has no frontmatter (e.g. a plain-markdown
 * magent like AGENTS.md/CLAUDE.md/GEMINI.md), the change targets the body (`location: 'body'`) using
 * the first non-empty line as a text anchor, and `proposed` appends the suggestion — never a
 * `frontmatter.description` edit on a config that has no frontmatter.
 */
export function generateChanges(report: QualityReport, trends: TrendEntry[], content?: string): ProposedChange[] {
    const changes: ProposedChange[] = [];
    const dimMap = new Map(Object.entries(report.dimensions));
    const withFrontmatter = content === undefined ? true : hasFrontmatter(content);
    const bodyAnchor = withFrontmatter ? '' : firstBodyLine(content ?? '');

    for (const trend of trends) {
        if (trend.trend === 'declining' || (trend.trend === 'flat' && trend.latest < 0.7)) {
            const dimData = dimMap.get(trend.dimension);
            const note = dimData?.note ?? '';
            const scoreLine = `Score: ${trend.latest.toFixed(2)} (trend: ${trend.trend}, Δ${trend.delta >= 0 ? '+' : ''}${trend.delta.toFixed(2)}).`;
            if (withFrontmatter) {
                const suggestion = note
                    ? `[Improve ${trend.dimension}]: ${note}`
                    : `[Improve ${trend.dimension}]: review and enhance the description for better ${trend.dimension}.`;
                changes.push({
                    dimension: trend.dimension,
                    location: 'frontmatter.description',
                    current: `${trend.dimension} score: ${trend.latest.toFixed(2)}`,
                    proposed: suggestion,
                    reason: note ? `${scoreLine} Note: "${note}".` : `${scoreLine} Score below threshold.`,
                });
            } else {
                // Frontmatter-less config: target the body. Proposed text appends the suggestion to the
                // first non-empty line so stepApply's text-replace branch can apply it safely.
                const suggestion = note
                    ? `[Improve ${trend.dimension}]: ${note}`
                    : `[Improve ${trend.dimension}]: review and enhance this config for better ${trend.dimension}.`;
                changes.push({
                    dimension: trend.dimension,
                    location: 'body',
                    current: bodyAnchor,
                    proposed: bodyAnchor ? `${bodyAnchor}\n\n${suggestion}` : suggestion,
                    reason: `${scoreLine} Config has no frontmatter; suggesting a body addition rather than a frontmatter.description edit.`,
                });
            }
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

// ── Generation Seam (F023) ───────────────────────────────────────────────────

/**
 * Extract negative constraints (DON'T/NEVER rules) from a description string.
 * Each rule is returned verbatim. Returns empty array if none found.
 */
function extractNegativeConstraints(description: unknown): string[] {
    if (typeof description !== 'string') return [];
    const constraints: string[] = [];
    for (const line of description.split('\n')) {
        const trimmed = line.trim();
        if (/^(DON['']T|NEVER)\b/i.test(trimmed)) {
            constraints.push(trimmed);
        }
    }
    return constraints;
}

/**
 * Compute a stable 16-hex-char sha256 hash of a generation anchor (F024 R3).
 *
 * The anchor is serialized with its keys in a fixed order so the hash is reproducible
 * across CLI and agent: tampering with or summarising the frontmatter / criteria /
 * constraints changes the hash, which the gate detects as an anchor violation.
 */
export function computeAnchorHash(anchor: GenerationAnchor): string {
    const stable = JSON.stringify({
        frontmatter: anchor.frontmatter,
        rubric_criteria: anchor.rubric_criteria,
        negative_constraints: anchor.negative_constraints,
    });
    const hasher = new Bun.CryptoHasher('sha256');
    hasher.update(stable);
    return hasher.digest('hex').slice(0, 16);
}

/**
 * Recompute the baseline anchor hash for a content file's current frontmatter (F024 R3).
 * Mirrors the anchor that `emitGenerationEnvelope` emits, so a faithful agent round-trip
 * yields a matching `anchor_hash`. The rubric criterion is omitted (dimension-specific) —
 * the anchor gate guards the frontmatter + negative constraints that bound the goal.
 *
 * Frontmatter-OPTIONAL guard (task 0054): when the content has no frontmatter (e.g. a plain-markdown
 * magent), the hash is computed over an empty frontmatter mapping. This keeps the anchor stable and
 * crash-free without proposing a bogus frontmatter.description edit.
 */
function computeBaselineAnchorHash(content: string): string {
    let frontmatter: Record<string, unknown> = {};
    if (hasFrontmatter(content)) {
        try {
            frontmatter = parseFrontmatter(content).data;
        } catch {
            frontmatter = {};
        }
    }
    return computeAnchorHash({
        frontmatter,
        rubric_criteria: '',
        negative_constraints: extractNegativeConstraints(frontmatter.description),
    });
}

// ── Double-Loop Gate (F024) ──────────────────────────────────────────────────

/** Inputs to the double-loop gate. */
interface GateInput {
    type: ContentType;
    resolvedPath: string;
    postScore: number;
    baselineScore: number;
    margin: number;
    /** anchor_hash carried on the ingested proposal (optional — absent ⇒ anchor gate skipped). */
    ingestedAnchorHash?: string;
    /** Baseline anchor hash recomputed from the current file (paired with ingestedAnchorHash). */
    baselineAnchorHash?: string;
    /** Skeptic persona verdict (optional — absent ⇒ treated as ok). */
    skeptic?: SkepticVerdict;
    /** Empirical behavior gate context (optional — absent ⇒ empirical gate skipped). */
    evalGate?: {
        name: string;
        candidateSkillText: string;
        baselineSkillText: string;
        margin: number;
        target: Target;
        replayBackend?: ReplayBackend;
    };
}

/** Outcome of the double-loop gate: ok, plus the failed gate name + reason when ok=false. */
interface GateResult {
    ok: boolean;
    failedGate?: 'deterministic' | 'delta-margin' | 'empirical' | 'anchor' | 'skeptic';
    reason?: string;
    /** Empirical scores persisted when the empirical gate ran and passed. */
    empirical?: { hard: number; holdout_n: number; train_n: number };
}

/**
 * The double-loop gate (design §4). A proposal is accepted only if it passes ALL gates:
 * 1. Deterministic — the rewritten file validates with zero errors (R1).
 * 2. Δ-margin — postScore − baselineScore ≥ margin (R2).
 * 3. Anchor — the ingested anchor_hash matches the recomputed baseline hash (R3).
 * 4. Skeptic — the proposal carries no `skeptic.ok === false` veto (R4).
 *
 * Evaluated in order; the first failure wins and names the gate. No I/O beyond `validate`.
 */
async function runGate(input: GateInput): Promise<GateResult> {
    // 1. Deterministic gate (R1): the rewritten file must validate with zero errors.
    const validation = await validate(input.type, input.resolvedPath);
    const errorCount = validation.findings.filter((f) => f.severity === 'error').length;
    if (errorCount > 0) {
        return {
            ok: false,
            failedGate: 'deterministic',
            reason: `Deterministic gate failed: rewritten file has ${errorCount} validation error(s).`,
        };
    }

    // 2. Δ-margin gate (R2): the post-aggregate must exceed baseline by at least the margin.
    const delta = input.postScore - input.baselineScore;
    if (delta < input.margin) {
        return {
            ok: false,
            failedGate: 'delta-margin',
            reason: `Δ-margin gate failed: Δ${delta >= 0 ? '+' : ''}${delta.toFixed(2)} < required margin ${input.margin.toFixed(2)}.`,
        };
    }

    // 2.5. Empirical gate (R3): candidate must strictly improve behavior on holdout eval cases.
    // Skip when no evalGate is supplied OR no cases.yaml exists for the skill (skip-when-absent).
    let empiricalScores: { hard: number; holdout_n: number; train_n: number } | undefined;
    if (input.evalGate) {
        const cases = loadEvalCases(input.evalGate.name);
        if (cases) {
            const backend = createReplayBackend(input.evalGate.target, input.evalGate.replayBackend);
            const base = await replaySplit(backend, input.evalGate.baselineSkillText, cases.cases, 'holdout');
            const cand = await replaySplit(backend, input.evalGate.candidateSkillText, cases.cases, 'holdout');
            if (!(cand.hard > base.hard && cand.hard - base.hard >= input.evalGate.margin)) {
                return {
                    ok: false,
                    failedGate: 'empirical',
                    reason: `Empirical gate failed: candidate behavior ${cand.hard.toFixed(2)} ≤ baseline ${base.hard.toFixed(2)} (margin ${input.evalGate.margin.toFixed(2)}).`,
                };
            }
            const trainResult = await replaySplit(backend, input.evalGate.candidateSkillText, cases.cases, 'train');
            empiricalScores = { hard: cand.hard, holdout_n: cand.n, train_n: trainResult.n };
        }
    }

    // 3. Anchor gate (R3): the ingested anchor_hash must match the recomputed baseline hash.
    if (input.ingestedAnchorHash !== undefined && input.baselineAnchorHash !== undefined) {
        if (input.ingestedAnchorHash !== input.baselineAnchorHash) {
            return {
                ok: false,
                failedGate: 'anchor',
                reason: `Anchor gate failed: anchor_hash mismatch (proposal ${input.ingestedAnchorHash}, baseline ${input.baselineAnchorHash}) — goal anchor was tampered or summarised.`,
            };
        }
    }

    // 4. Skeptic gate (R4): an explicit ok=false veto fails the gate.
    if (input.skeptic && input.skeptic.ok === false) {
        const violations = input.skeptic.violations?.length
            ? ` Violations: ${input.skeptic.violations.join('; ')}.`
            : '';
        return {
            ok: false,
            failedGate: 'skeptic',
            reason: `Skeptic gate failed: the Skeptic reported an anchor/invariant violation.${violations}`,
        };
    }
    return { ok: true, ...(empiricalScores ? { empirical: empiricalScores } : {}) };
}

/**
 * Envelope-out: emit `{ trends, baseline, rubric, briefs }` as JSON to stdout.
 * Each brief carries the immutable goal anchor (frontmatter + rubric criterion + negative constraints) verbatim.
 * No DB write, no model call (design §2.2, invariant #1 + #6).
 */
function emitGenerationEnvelope(
    type: ContentType,
    resolvedPath: string,
    content: string,
    baseline: QualityReport,
    trends: TrendEntry[],
): EvolveResult {
    const rubric = loadRubric(type);
    // Frontmatter-OPTIONAL guard (task 0054): parse only when present; fall back to empty mapping
    // so a plain-markdown magent (AGENTS.md/CLAUDE.md/GEMINI.md) emits a valid envelope without crashing.
    let frontmatter: Record<string, unknown> = {};
    if (hasFrontmatter(content)) {
        try {
            frontmatter = parseFrontmatter(content).data;
        } catch {
            frontmatter = {};
        }
    }
    const description = frontmatter.description;
    const negativeConstraints = extractNegativeConstraints(description);
    const contentName = resolveContentName(resolvedPath);

    // Build a brief for every dimension in the baseline report.
    const dimMap = new Map(Object.entries(baseline.dimensions));
    const rubricByName = new Map(rubric.dimensions.map((d) => [d.name, d]));

    // R3: the anchor_hash the gate later checks is computed from the frontmatter + constraints
    // (dimension-independent), so every brief shares the same baseline anchor hash.
    const anchorHash = computeAnchorHash({
        frontmatter,
        rubric_criteria: '',
        negative_constraints: negativeConstraints,
    });

    const briefs: GenerationBrief[] = [];
    for (const dimName of dimMap.keys()) {
        const rubricDim = rubricByName.get(dimName);
        const dimData = dimMap.get(dimName);
        briefs.push({
            dimension: dimName,
            current_text: typeof description === 'string' ? description : '',
            target_criterion: rubricDim?.criterion ?? `Improve ${dimName}`,
            anchor: {
                frontmatter,
                rubric_criteria: rubricDim?.criterion ?? '',
                negative_constraints: negativeConstraints,
            },
            anchor_hash: anchorHash,
        });
        void dimData; // dimData available for future use; not needed for the brief shape
    }

    const envelope = {
        type,
        content_name: contentName,
        trends,
        baseline,
        rubric: { version: rubric.version, type: rubric.type, dimensions: rubric.dimensions },
        briefs,
    };

    echo(JSON.stringify(envelope, null, 2));
    return {
        baselineScore: baseline.aggregate,
        postScore: baseline.aggregate,
        delta: 0,
        changesApplied: 0,
        proposalPath: '',
    };
}

/**
 * Ingest-in: read agent-authored ProposedChange[] from a JSON file, validate, persist.
 * On accept (opts.acceptId), apply via stepApply + stepVerify.
 * The JSON shape: `{ proposal_id?: string, changes: ProposedChange[] }`.
 */
async function ingestProposal(
    db: DbAdapter,
    type: ContentType,
    name: string,
    resolvedPath: string,
    ingestPath: string,
    opts: EvolveOptions | undefined,
    baselineScore: number,
): Promise<EvolveResult> {
    let raw: string;
    try {
        raw = readFileSync(ingestPath, 'utf-8');
    } catch {
        throw Object.assign(new Error(`Cannot read proposal file: ${ingestPath}`), { code: 2 });
    }

    let parsed: { proposal_id?: string; changes: ProposedChange[]; anchor_hash?: string; skeptic?: SkepticVerdict };
    try {
        parsed = JSON.parse(raw) as {
            proposal_id?: string;
            changes: ProposedChange[];
            anchor_hash?: string;
            skeptic?: SkepticVerdict;
        };
    } catch {
        throw Object.assign(new Error(`Invalid JSON in proposal file: ${ingestPath}`), { code: 1 });
    }

    if (!Array.isArray(parsed.changes) || parsed.changes.length === 0) {
        throw Object.assign(new Error('Proposal file must contain a non-empty changes array'), { code: 1 });
    }

    // Validate each change has the required fields with non-empty proposed text.
    for (const change of parsed.changes) {
        if (!change.dimension || !change.location || !change.proposed || !change.reason) {
            throw Object.assign(
                new Error(`Invalid ProposedChange: missing required field (dimension, location, proposed, reason)`),
                { code: 1 },
            );
        }
    }

    const proposalDao = new ProposalDao(db);
    const existingProposals = await proposalDao.getProposals(type, name);
    const proposalId = parsed.proposal_id ?? generateProposalId(type, name, existingProposals);

    const proposalJson = {
        proposal_id: proposalId,
        changes: parsed.changes,
        ...(parsed.anchor_hash !== undefined ? { anchor_hash: parsed.anchor_hash } : {}),
        ...(parsed.skeptic !== undefined ? { skeptic: parsed.skeptic } : {}),
    };

    const proposalRecord = await proposalDao.insertProposal({
        content_type: type,
        content_name: name,
        baseline_id: 0,
        proposal_json: proposalJson,
    });

    const proposalsRoot = getProposalsDir();
    const proposalsDir = join(proposalsRoot, type, name);
    mkdirSync(proposalsDir, { recursive: true });
    const proposalPath = join(proposalsDir, `${proposalId}.json`);
    writeFileSync(proposalPath, JSON.stringify(proposalJson, null, 2));

    echo(`Proposal ${proposalId} ingested and persisted (ID: ${proposalRecord.id}).`);

    // If --accept <id> is also provided, apply the ingested proposal through the double-loop gate.
    if (opts?.acceptId) {
        // R6: back up before applying so a gate failure can restore the file byte-identical.
        const backupPath = await backupFile(resolvedPath);
        const appliedCount = await stepApply(parsed.changes, resolvedPath, proposalRecord.id, db);
        const evalGate = opts?.evalGate
            ? {
                  name,
                  candidateSkillText: await Bun.file(resolvedPath).text(),
                  baselineSkillText: readFileSync(backupPath, 'utf-8'),
                  margin: opts?.margin ?? 0.05,
                  target: opts?.target ?? 'claude',
                  replayBackend: opts?.replayBackend,
              }
            : undefined;
        const verdict = await stepVerify(type, name, resolvedPath, baselineScore, proposalRecord.id, opts, db, {
            backupPath,
            ingestedAnchorHash: parsed.anchor_hash,
            skeptic: parsed.skeptic,
            evalGate,
        });
        if (!verdict.rejected && verdict.backupPath) {
            await persistVersionSnapshot(verdict.backupPath, resolvedPath, proposalId);
        }
        return {
            baselineScore,
            postScore: verdict.postScore,
            delta: verdict.delta,
            changesApplied: verdict.rejected ? 0 : appliedCount,
            proposalPath,
            ...(verdict.rejected ? { rejected: true, rejectionReason: verdict.reason } : {}),
        };
    }

    echo(`Use --accept ${proposalId} to apply this proposal.`);
    return { baselineScore, postScore: baselineScore, delta: 0, changesApplied: 0, proposalPath };
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
    content?: string,
): Promise<{
    proposalId: string;
    proposalDbId: number;
    proposalPath: string;
    changes: ProposedChange[];
    proposalRecord: Proposal;
}> {
    const changes = generateChanges(report, trends, content);
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

/** Gate inputs threaded into stepVerify when an apply must pass the double-loop gate (F024). */
interface GateContext {
    /** Pre-apply backup path; the file is restored from this when a gate fails. */
    backupPath: string;
    /** anchor_hash carried on the ingested proposal (optional). */
    ingestedAnchorHash?: string;
    /** Skeptic persona verdict (optional). */
    skeptic?: SkepticVerdict;
    /** Empirical behavior gate context (optional — absent ⇒ empirical gate skipped). */
    evalGate?: {
        name: string;
        candidateSkillText: string;
        baselineSkillText: string;
        margin: number;
        target: Target;
        replayBackend?: ReplayBackend;
    };
}

async function stepVerify(
    type: ContentType,
    name: string,
    filePath: string,
    baselineScore: number,
    proposalDbId: number,
    opts: EvolveOptions | undefined,
    db: DbAdapter,
    gate?: GateContext,
): Promise<{ postScore: number; delta: number; rejected?: boolean; reason?: string; backupPath?: string }> {
    let postScore = baselineScore;
    let postReport: QualityReport | undefined;
    try {
        // R10/R7: persist the post-evolution evaluation with operation 'evolve' (reuses the same store adapter).
        // The gate sits ON TOP of this row — it never bypasses the closed-loop verify write (invariant #6).
        const report = await evaluate(type, filePath, {
            target: opts?.target,
            adapter: db,
            save: true,
            operation: 'evolve',
        });
        if (!report) throw new Error('evaluate returned null in heuristic mode');
        postScore = report.aggregate;
        postReport = report;
    } catch {
        echoError('Cannot re-evaluate after changes.');
    }

    const delta = postScore - baselineScore;

    // F024: when a gate context is supplied, the proposal is accepted only if it passes ALL gates.
    if (gate) {
        const margin = opts?.margin ?? 0.05;
        // The backup holds the pre-apply (baseline) content — recompute the baseline anchor from it.
        const baselineAnchorHash =
            gate.ingestedAnchorHash !== undefined
                ? computeBaselineAnchorHash(readFileSync(gate.backupPath, 'utf-8'))
                : undefined;
        const gateResult = await runGate({
            type,
            resolvedPath: filePath,
            postScore: postReport ? postScore : baselineScore,
            baselineScore,
            margin,
            ingestedAnchorHash: gate.ingestedAnchorHash,
            baselineAnchorHash,
            skeptic: gate.skeptic,
            evalGate: gate.evalGate,
        });

        if (!gateResult.ok) {
            // R5: restore from backup, keep the proposal 'draft' (NOT accepted), surface the reason.
            await restoreFromBackup(gate.backupPath, filePath);
            await new ProposalDao(db).updateProposalStatus(proposalDbId, 'draft');
            echoError(`Gate rejected proposal — ${gateResult.reason} File restored; proposal stays draft.`);
            return { postScore: baselineScore, delta: 0, rejected: true, reason: gateResult.reason };
        }

        // R4: persist empirical behavior score alongside the form evaluation.
        if (gateResult.empirical) {
            try {
                await new EvaluationDao(db).insertEvaluation({
                    content_type: type,
                    content_name: name,
                    target_agent: opts?.target ?? 'claude',
                    operation: 'evolve',
                    aggregate: gateResult.empirical.hard,
                    dimensions: {
                        empirical: {
                            score: gateResult.empirical.hard,
                            hard: gateResult.empirical.hard,
                            holdout_n: gateResult.empirical.holdout_n,
                            train_n: gateResult.empirical.train_n,
                            note: `Behavior gate: holdout_n=${gateResult.empirical.holdout_n}, train_n=${gateResult.empirical.train_n}`,
                        },
                    },
                });
                echo(
                    `Empirical behavior: holdout ${gateResult.empirical.hard.toFixed(2)} (holdout_n=${gateResult.empirical.holdout_n}, train_n=${gateResult.empirical.train_n})`,
                );
            } catch {
                echoError('Cannot persist empirical behavior score.');
            }
        }
    }

    // On pass (or no gate): keep the existing accept + verify_id linkage (R7).
    try {
        const verifyEval = await new EvaluationDao(db).getLatestEvaluation(type, name);
        if (verifyEval) {
            await new ProposalDao(db).updateProposalStatus(proposalDbId, 'accepted', { verify_id: verifyEval.id });
        }
    } catch {
        echoError('Cannot link verify evaluation.');
    }

    // R6: on a clean pass, keep the backup as a version snapshot for --rollback.
    // The caller renames it to a versioned path after linking the verify evaluation.
    const survivingBackupPath = gate?.backupPath;

    const pctStr = baselineScore > 0 ? `, ${delta >= 0 ? '+' : ''}${((delta / baselineScore) * 100).toFixed(1)}%` : '';
    echo(
        `Score: ${baselineScore.toFixed(2)} → ${postScore.toFixed(2)} (${delta >= 0 ? '+' : ''}${delta.toFixed(2)}${pctStr})`,
    );

    return { postScore, delta, ...(survivingBackupPath ? { backupPath: survivingBackupPath } : {}) };
}

// ── Analyze / History / Rollback (G2/G3) ─────────────────────────────────────

/** Map an aggregate score (0–1) to a letter grade, mirroring evaluate.ts. */
function scoreToGrade(score: number): string {
    if (score >= 0.9) return 'A';
    if (score >= 0.75) return 'B';
    if (score >= 0.6) return 'C';
    if (score >= 0.45) return 'D';
    return 'F';
}

/** Format the analysis summary for --analyze (no file mutation, no proposal write). */
function formatAnalyze(name: string, analysis: AnalyzeResult): string {
    const { trends, baselineScore, baselineDate, evaluations } = analysis;
    const grade = scoreToGrade(baselineScore);
    const verdict = baselineScore >= 0.7 ? 'PASS' : 'FAIL';
    const gitAvailable = existsSync(join(process.cwd(), '.git'));

    const lines: string[] = [];
    lines.push('=== Evolution Analysis ===');
    lines.push(`Target: ${name}   Score: ${(baselineScore * 100).toFixed(0)}% (${grade})   Status: ${verdict}`);
    lines.push(
        `Available data sources: evaluation-history (${evaluations.length}) · git-history (${gitAvailable ? '✓' : '✗'})`,
    );

    if (trends.length > 0) {
        lines.push('');
        lines.push('| Dimension | Earliest | Latest | Trend |');
        lines.push('|-----------|----------|--------|-------|');
        for (const t of trends) {
            const arrow = t.trend === 'improving' ? '↑' : t.trend === 'declining' ? '↓' : '→';
            lines.push(`| ${t.dimension} | ${t.earliest.toFixed(2)} | ${t.latest.toFixed(2)} | ${arrow} ${t.trend} |`);
        }
    }

    const declining = trends.filter((t) => t.trend === 'declining');
    const flatLow = trends.filter((t) => t.trend === 'flat' && t.latest < 0.7);
    if (declining.length > 0) {
        lines.push(`Patterns: [warning] declining dimensions: ${declining.map((t) => t.dimension).join(', ')}`);
    } else if (flatLow.length > 0) {
        lines.push(`Patterns: [warning] flat-low dimensions: ${flatLow.map((t) => t.dimension).join(', ')}`);
    } else {
        lines.push(`Patterns: [success] ${name} is currently stable at ${(baselineScore * 100).toFixed(0)}%`);
    }

    lines.push(`Baseline date: ${baselineDate}`);
    return lines.join('\n');
}

/** Rename a transient backup to a versioned snapshot for --rollback. */
async function persistVersionSnapshot(backupPath: string, resolvedPath: string, proposalId: string): Promise<string> {
    const versionPath = `${resolvedPath}.version-${proposalId}`;
    await Bun.write(versionPath, Bun.file(backupPath));
    rmSync(backupPath, { force: true });
    return versionPath;
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
    // Task 0056 decision C: hooks are analyze-only. No apply/history/rollback.
    if (type === 'hook' && isHookApplyCapableOpt(opts)) {
        echoError('hook evolve is analyze-only — apply/history/rollback are not supported for hooks.');
        return { baselineScore: 0, postScore: 0, delta: 0, changesApplied: 0, proposalPath: '' };
    }

    let db: DbAdapter;
    try {
        db = await openDb(opts);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        echoError(`Could not open the evaluation store. ${msg}`);
        return { baselineScore: 0, postScore: 0, delta: 0, changesApplied: 0, proposalPath: '' };
    }

    // --history: list applied proposal versions (no evaluation needed).
    if (opts?.history) {
        const proposals = await new ProposalDao(db).getProposals(type, contentName);
        const accepted = proposals.filter((p) => p.status === 'accepted');
        if (accepted.length === 0) {
            echo(`No applied versions found for ${type}/${contentName}.`);
            return { baselineScore: 0, postScore: 0, delta: 0, changesApplied: 0, proposalPath: '' };
        }
        const lines: string[] = [];
        lines.push(`=== Version History: ${contentName} ===`);
        lines.push('');
        lines.push('| Version | Applied At | Snapshot |');
        lines.push('|---------|------------|----------|');
        for (const p of accepted) {
            const json = typeof p.proposal_json === 'string' ? JSON.parse(p.proposal_json) : p.proposal_json;
            const proposalId = (json as Record<string, unknown>)?.proposal_id as string | undefined;
            const versionId = proposalId ?? `#${p.id}`;
            const appliedAt = p.applied_at ?? 'unknown';
            const versionPath = `${resolvedPath}.version-${versionId}`;
            const hasSnapshot = existsSync(versionPath) ? '✓' : '✗';
            lines.push(`| ${versionId} | ${appliedAt} | ${hasSnapshot} |`);
        }
        echo(lines.join('\n'));
        return { baselineScore: 0, postScore: 0, delta: 0, changesApplied: 0, proposalPath: '' };
    }

    // --rollback <ver>: restore from a version snapshot (requires --confirm).
    if (opts?.rollback) {
        if (!opts.confirm) {
            echoError('--rollback requires --confirm to proceed.');
            return { baselineScore: 0, postScore: 0, delta: 0, changesApplied: 0, proposalPath: '' };
        }
        const versionPath = `${resolvedPath}.version-${opts.rollback}`;
        if (!existsSync(versionPath)) {
            echoError(`Version snapshot not found: ${opts.rollback}`);
            return { baselineScore: 0, postScore: 0, delta: 0, changesApplied: 0, proposalPath: '' };
        }
        await Bun.write(resolvedPath, Bun.file(versionPath));
        echo(`Rolled back ${contentName} to version ${opts.rollback}.`);
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

    // --analyze: print analysis summary and exit (no proposal, no file mutation).
    if (opts?.analyze) {
        echo(formatAnalyze(contentName, analysis));
        return { baselineScore, postScore: baselineScore, delta: 0, changesApplied: 0, proposalPath: '' };
    }

    // Single evaluation edge case
    if (evaluations.length < 2) {
        echo(
            'Only one evaluation found — need at least two for trend analysis. Running evaluation-based proposal instead.',
        );
    }

    // Get baseline report
    let baselineReport: QualityReport;
    try {
        const report = await evaluate(type, resolvedPath, { target: opts?.target });
        if (!report) throw new Error('evaluate returned null in heuristic mode');
        baselineReport = report;
    } catch {
        echoError('Cannot evaluate content.');
        return { baselineScore, postScore: baselineScore, delta: 0, changesApplied: 0, proposalPath: '' };
    }

    // F023: Envelope-out — emit generation briefs as JSON (no DB write, no model call).
    if (opts?.json && opts.proposeOnly) {
        const content = await Bun.file(resolvedPath).text();
        return emitGenerationEnvelope(type, resolvedPath, content, baselineReport, trends);
    }

    // F023: Ingest-in — consume agent-authored ProposedChange[] from a JSON file.
    if (opts?.ingest) {
        return ingestProposal(db, type, contentName, resolvedPath, opts.ingest, opts, baselineScore);
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
        let storedAnchorHash: string | undefined;
        let storedSkeptic: SkepticVerdict | undefined;
        try {
            const json =
                typeof target.proposal_json === 'string' ? JSON.parse(target.proposal_json) : target.proposal_json;
            acceptedFromStore = (json?.changes as ProposedChange[]) ?? [];
            storedAnchorHash = json?.anchor_hash as string | undefined;
            storedSkeptic = json?.skeptic as SkepticVerdict | undefined;
        } catch {
            acceptedFromStore = [];
        }
        const backupPath = await backupFile(resolvedPath);
        const appliedCount = await stepApply(acceptedFromStore, resolvedPath, target.id, db);
        const evalGateCtx = opts?.evalGate
            ? {
                  name: contentName,
                  candidateSkillText: await Bun.file(resolvedPath).text(),
                  baselineSkillText: readFileSync(backupPath, 'utf-8'),
                  margin: opts?.margin ?? 0.05,
                  target: opts?.target ?? 'claude',
                  replayBackend: opts?.replayBackend,
              }
            : undefined;
        const verdict = await stepVerify(type, contentName, resolvedPath, baselineScore, target.id, opts, db, {
            backupPath,
            ingestedAnchorHash: storedAnchorHash,
            skeptic: storedSkeptic,
            evalGate: evalGateCtx,
        });
        if (!verdict.rejected && verdict.backupPath) {
            await persistVersionSnapshot(verdict.backupPath, resolvedPath, opts.acceptId);
        }
        return {
            baselineScore,
            postScore: verdict.postScore,
            delta: verdict.delta,
            changesApplied: verdict.rejected ? 0 : appliedCount,
            proposalPath: '',
            ...(verdict.rejected ? { rejected: true, rejectionReason: verdict.reason } : {}),
        };
    }

    // Step 2: PROPOSE (interactive and --propose-only paths create a fresh draft).
    const proposeContent = await Bun.file(resolvedPath).text();
    const { proposalId, proposalDbId, proposalPath, changes } = await stepPropose(
        db,
        type,
        contentName,
        baselineReport,
        trends,
        evaluations,
        baselineScore,
        baselineDate,
        proposeContent,
    );

    // Step 3: REVIEW — --propose-only writes the draft and stops.
    if (opts?.proposeOnly) {
        echo(`Proposal written to: ${proposalPath}`);
        return { baselineScore, postScore: baselineScore, delta: 0, changesApplied: 0, proposalPath };
    }

    // Interactive mode
    const { accepted: acceptedChanges } = await interactiveReview(changes, trends);

    // Step 4: APPLY (with backup for version history)
    const backupPath = await backupFile(resolvedPath);
    const changesApplied = await stepApply(acceptedChanges, resolvedPath, proposalDbId, db);

    const evalGateCtx = opts?.evalGate
        ? {
              name: contentName,
              candidateSkillText: await Bun.file(resolvedPath).text(),
              baselineSkillText: readFileSync(backupPath, 'utf-8'),
              margin: opts?.margin ?? 0.05,
              target: opts?.target ?? 'claude',
              replayBackend: opts?.replayBackend,
          }
        : undefined;

    // Step 5: VERIFY
    const { postScore, delta } = await stepVerify(
        type,
        contentName,
        resolvedPath,
        baselineScore,
        proposalDbId,
        opts,
        db,
        evalGateCtx ? { backupPath, evalGate: evalGateCtx } : undefined,
    );

    // Persist version snapshot for --rollback
    await persistVersionSnapshot(backupPath, resolvedPath, proposalId);

    return { baselineScore, postScore, delta, changesApplied, proposalPath };
}
