import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chdir, cwd } from 'node:process';
import type { QualityReport } from '@gobing-ai/superskill-core';
import { createDbAdapter, type DbAdapter } from '@gobing-ai/ts-db';
import type { ProposedChange, TrendEntry } from '../../src/operations/evolve';
import {
    computeTrends,
    evolve,
    finalizeApply,
    generateChanges,
    generateProposalId,
    interactiveReview,
    isHookApplyCapableOpt,
} from '../../src/operations/evolve';
import type { JudgeBackend, PairwiseVerdict } from '../../src/operations/pairwise-judge';
import type { ReplayBackend } from '../../src/operations/replay-runner';
import type { Evaluation, Proposal } from '../../src/store';
import { EvaluationDao } from '../../src/store/evaluations';
import { ProposalDao } from '../../src/store/proposals';
import { evaluations, proposals } from '../../src/store/schema';

function makeEval(overrides: Partial<Evaluation> = {}): Evaluation {
    return {
        id: overrides.id ?? 1,
        content_type: overrides.content_type ?? 'skill',
        content_name: overrides.content_name ?? 'test',
        target_agent: overrides.target_agent ?? 'claude',
        operation: overrides.operation ?? 'evaluate',
        aggregate: overrides.aggregate ?? 0.8,
        dimensions: overrides.dimensions ?? ({} as Record<string, { score: number; note: string }>),
        file_hash: overrides.file_hash,
        created_at: overrides.created_at ?? 1000,
    };
}

function makeEvalWithDims(aggregate: number, dims: Record<string, number>, createdAt: number): Evaluation {
    const dimensionEntries: Record<string, { score: number; note: string }> = {};
    for (const [k, v] of Object.entries(dims)) {
        dimensionEntries[k] = { score: v, note: `${k} note` };
    }
    return makeEval({ aggregate, created_at: createdAt, dimensions: dimensionEntries });
}
function makeReport(dims: Record<string, { score: number; note: string }>): QualityReport {
    return {
        content: 'test',
        type: 'skill',
        target: 'claude',
        aggregate: Object.values(dims).reduce((a, b) => a + b.score, 0) / Object.values(dims).length,
        dimensions: dims,
    };
}

describe('computeTrends', () => {
    it('returns empty array for fewer than 2 evaluations', () => {
        expect(computeTrends([])).toEqual([]);
        expect(computeTrends([makeEvalWithDims(0.5, { clarity: 0.5 }, 1000)])).toEqual([]);
    });

    it('computes improving trend', () => {
        const evals = [makeEvalWithDims(0.5, { clarity: 0.3 }, 1000), makeEvalWithDims(0.7, { clarity: 0.6 }, 2000)];
        const trends = computeTrends(evals);
        expect(trends).toHaveLength(1);
        expect(trends[0]?.dimension).toBe('clarity');
        expect(trends[0]?.earliest).toBe(0.3);
        expect(trends[0]?.latest).toBe(0.6);
        expect(trends[0]?.delta).toBe(0.3);
        expect(trends[0]?.trend).toBe('improving');
    });

    it('computes declining trend', () => {
        const evals = [makeEvalWithDims(0.8, { clarity: 0.9 }, 1000), makeEvalWithDims(0.6, { clarity: 0.5 }, 2000)];
        const trends = computeTrends(evals);
        expect(trends[0]?.trend).toBe('declining');
        expect(trends[0]?.delta).toBe(-0.4);
    });

    it('computes flat trend for small delta', () => {
        const evals = [makeEvalWithDims(0.8, { clarity: 0.5 }, 1000), makeEvalWithDims(0.8, { clarity: 0.52 }, 2000)];
        const trends = computeTrends(evals);
        expect(trends[0]?.trend).toBe('flat');
    });

    it('computes trends across multiple dimensions', () => {
        const evals = [
            makeEvalWithDims(0.5, { clarity: 0.3, completeness: 0.8 }, 1000),
            makeEvalWithDims(0.7, { clarity: 0.7, completeness: 0.6 }, 2000),
        ];
        const trends = computeTrends(evals);
        expect(trends).toHaveLength(2);
    });

    it('sorts declining first, then flat, then improving', () => {
        const evals = [
            makeEvalWithDims(0.5, { improving: 0.3, declining: 0.8, flat: 0.5 }, 1000),
            makeEvalWithDims(0.7, { improving: 0.7, declining: 0.3, flat: 0.53 }, 2000),
        ];
        const trends = computeTrends(evals);
        expect(trends[0]?.trend).toBe('declining');
    });

    it('handles evaluations where dimensions changed between evals', () => {
        const evals = [makeEvalWithDims(0.5, { a: 0.5 }, 1000), makeEvalWithDims(0.6, { a: 0.6, b: 0.4 }, 2000)];
        const trends = computeTrends(evals);
        expect(trends).toHaveLength(2);
        // a: 0.5 → 0.6 (improving)
        // b: appears only in second eval — earliest=latest=0.4, flat
        const b = trends.find((t) => t.dimension === 'b');
        expect(b?.earliest).toBe(0.4);
        expect(b?.latest).toBe(0.4);
    });

    it('sorts by latest score within same trend category', () => {
        const evals = [
            makeEvalWithDims(0.5, { a: 0.2, b: 0.8 }, 1000),
            makeEvalWithDims(0.5, { a: 0.21, b: 0.81 }, 2000),
        ];
        const trends = computeTrends(evals);
        // Both flat, sorted by latest score → a (0.21) before b (0.81)? No, lower first
        expect(trends[0]?.dimension).toBe('a');
    });
});

describe('generateChanges', () => {
    const report = makeReport({
        completeness: { score: 0.85, note: 'Missing error-handling guidance' },
        clarity: { score: 0.9, note: 'Well-structured sections' },
        conciseness: { score: 0.55, note: 'Too verbose, redundant examples' },
    });

    it('generates changes for declining dimensions', () => {
        const trends: TrendEntry[] = [
            { dimension: 'conciseness', earliest: 0.8, latest: 0.55, delta: -0.25, trend: 'declining' },
        ];
        const changes = generateChanges(report, trends);
        expect(changes).toHaveLength(1);
        expect(changes[0]?.dimension).toBe('conciseness');
    });

    it('generates changes for flat dimensions below 0.7', () => {
        const trends: TrendEntry[] = [
            { dimension: 'conciseness', earliest: 0.55, latest: 0.55, delta: 0, trend: 'flat' },
        ];
        const changes = generateChanges(report, trends);
        expect(changes).toHaveLength(1);
    });

    it('skips improving dimensions', () => {
        const trends: TrendEntry[] = [
            { dimension: 'completeness', earliest: 0.5, latest: 0.85, delta: 0.35, trend: 'improving' },
        ];
        const changes = generateChanges(report, trends);
        expect(changes).toHaveLength(0);
    });

    it('skips flat dimensions above 0.7', () => {
        const trends: TrendEntry[] = [
            { dimension: 'clarity', earliest: 0.9, latest: 0.92, delta: 0.02, trend: 'flat' },
        ];
        const changes = generateChanges(report, trends);
        expect(changes).toHaveLength(0);
    });

    it('uses dimension note in reason when available', () => {
        const trends: TrendEntry[] = [
            { dimension: 'conciseness', earliest: 0.8, latest: 0.55, delta: -0.25, trend: 'declining' },
        ];
        const changes = generateChanges(report, trends);
        expect(changes[0]?.reason).toContain('Too verbose');
    });

    it('generates fallback reason when no note', () => {
        const emptyReport = makeReport({
            completeness: { score: 0.5, note: '' },
        });
        const trends: TrendEntry[] = [
            { dimension: 'completeness', earliest: 0.5, latest: 0.5, delta: 0, trend: 'flat' },
        ];
        const changes = generateChanges(emptyReport, trends);
        expect(changes[0]?.reason).toContain('Score below threshold');
    });

    it('emits frontmatter.description location with meaningful proposed text', () => {
        const trends: TrendEntry[] = [
            { dimension: 'conciseness', earliest: 0.8, latest: 0.55, delta: -0.25, trend: 'declining' },
        ];
        const changes = generateChanges(report, trends);
        expect(changes[0]?.location).toBe('frontmatter.description');
        expect(changes[0]?.proposed).toContain('[Improve conciseness]');
        expect(changes[0]?.proposed).toContain('Too verbose');
        expect(changes[0]?.current).toBe('conciseness score: 0.55');
    });

    it('emits frontmatter.description even when no dimension note', () => {
        const emptyReport = makeReport({
            completeness: { score: 0.5, note: '' },
        });
        const trends: TrendEntry[] = [
            { dimension: 'completeness', earliest: 0.5, latest: 0.5, delta: 0, trend: 'flat' },
        ];
        const changes = generateChanges(emptyReport, trends);
        expect(changes[0]?.location).toBe('frontmatter.description');
        expect(changes[0]?.proposed).toContain('[Improve completeness]');
        expect(changes[0]?.proposed).toContain('review and enhance the description');
    });

    it('targets the body (not frontmatter.description) when content has no frontmatter (task 0054)', () => {
        const trends: TrendEntry[] = [
            { dimension: 'conciseness', earliest: 0.8, latest: 0.55, delta: -0.25, trend: 'declining' },
        ];
        const frontmatterLess = '# AGENTS.md\n\nGuidance for coding agents.\n';
        const changes = generateChanges(report, trends, frontmatterLess);
        expect(changes).toHaveLength(1);
        expect(changes[0]?.location).toBe('body');
        expect(changes[0]?.proposed).toContain('[Improve conciseness]');
        // Body anchor is the first non-empty line
        expect(changes[0]?.current).toBe('# AGENTS.md');
        expect(changes[0]?.proposed).toBe('# AGENTS.md\n\n[Improve conciseness]: Too verbose, redundant examples');
    });

    it('falls back to bare suggestion when frontmatter-less body is empty (task 0054)', () => {
        const emptyBodyReport = makeReport({ conciseness: { score: 0.4, note: '' } });
        const trends: TrendEntry[] = [
            { dimension: 'conciseness', earliest: 0.6, latest: 0.4, delta: -0.2, trend: 'declining' },
        ];
        const changes = generateChanges(emptyBodyReport, trends, '\n  \n');
        expect(changes).toHaveLength(1);
        expect(changes[0]?.location).toBe('body');
        expect(changes[0]?.current).toBe('');
        expect(changes[0]?.proposed).toBe(
            '[Improve conciseness]: review and enhance this config for better conciseness.',
        );
    });

    it('preserves frontmatter.description targeting when content has frontmatter (task 0054)', () => {
        const trends: TrendEntry[] = [
            { dimension: 'conciseness', earliest: 0.8, latest: 0.55, delta: -0.25, trend: 'declining' },
        ];
        const withFrontmatter = '---\nname: test\ndescription: A test config\n---\n\nBody.\n';
        const changes = generateChanges(report, trends, withFrontmatter);
        expect(changes[0]?.location).toBe('frontmatter.description');
    });
});

describe('generateProposalId', () => {
    it('formats proposal ID correctly', () => {
        const id = generateProposalId('skill', 'test', []);
        expect(id).toMatch(/^skill-evolve-\d{4}-\d{2}-\d{2}-001$/);
    });

    it('increments sequence number based on existing proposals', () => {
        const existing: Proposal[] = [
            {
                id: 1,
                content_type: 'skill',
                content_name: 'test',
                baseline_id: undefined,
                proposal_json: {},
                status: 'draft',
                applied_at: null,
                verify_id: null,
                created_at: 1000,
                updated_at: 1000,
            },
        ];
        const id = generateProposalId('skill', 'test', existing);
        expect(id).toMatch(/skill-evolve-\d{4}-\d{2}-\d{2}-002$/);
    });
});

// ── Orchestrator integration (in-memory adapter, hermetic cwd) ─────────────────

describe('evolve — orchestrator', () => {
    let dir: string;
    let prevCwd: string;
    let adapter: DbAdapter;

    async function makeAdapter(): Promise<DbAdapter> {
        const a = await createDbAdapter({ driver: 'bun-sqlite', url: ':memory:' });
        await a.exec(evaluations.createTableSql);
        await a.exec(proposals.createTableSql);
        return a;
    }

    /** Seed evaluations for skill 'widget' so trend analysis has history. */
    async function seedHistory(a: DbAdapter, scores: number[]): Promise<void> {
        const dao = new EvaluationDao(a);
        for (let i = 0; i < scores.length; i++) {
            const score = scores[i];
            if (score === undefined) continue;
            const id = await dao.insertEvaluation({
                content_type: 'skill',
                content_name: 'widget',
                target_agent: 'claude',
                operation: 'evaluate',
                aggregate: score,
                dimensions: { clarity: { score, note: 'needs work' } },
                file_hash: 'abc',
            });
            await a.exec(`UPDATE evaluations SET created_at = ${Date.UTC(2026, 5, 1, 0, 0, i)} WHERE id = ${id}`);
        }
    }

    function writeWidgetEvalCases(): void {
        mkdirSync(join(dir, 'skills', 'widget', 'eval'), { recursive: true });
        writeFileSync(
            join(dir, 'skills', 'widget', 'eval', 'cases.yaml'),
            `version: 1
cases:
  - id: holdout-1
    split: holdout
    prompt: "Return the expected marker"
    reference_kind: exact
    reference: "PASS"
  - id: train-1
    split: train
    prompt: "Return the training marker"
    reference_kind: exact
    reference: "PASS"
`,
        );
    }

    function writeWidgetRubricEvalCases(): void {
        mkdirSync(join(dir, 'skills', 'widget', 'eval'), { recursive: true });
        writeFileSync(
            join(dir, 'skills', 'widget', 'eval', 'cases.yaml'),
            `version: 1
cases:
  - id: open-ended-1
    split: holdout
    prompt: "Explain the widget lifecycle clearly"
    reference_kind: rubric
    reference:
      criterion: "The answer explains lifecycle behavior clearly and concretely."
      excellent: "Specific lifecycle steps and actionable guidance."
      poor: "Vague or generic prose."
  - id: train-1
    split: train
    prompt: "Training case"
    reference_kind: exact
    reference: "PASS"
`,
        );
    }

    class ContentSensitiveReplayBackend implements ReplayBackend {
        constructor(private readonly marker: string) {}

        async run(systemPrompt: string): Promise<string> {
            return systemPrompt.includes(this.marker) ? 'PASS' : 'FAIL';
        }
    }

    class PassFailJudgeBackend implements JudgeBackend {
        calls = 0;

        async judge(
            _rubric: Parameters<JudgeBackend['judge']>[0],
            _prompt: string,
            candOutput: string,
            baseOutput: string,
        ): Promise<PairwiseVerdict> {
            this.calls++;
            if (candOutput.includes('PASS') && !baseOutput.includes('PASS')) {
                return { winner: 'candidate', margin: 0.9 };
            }
            if (!candOutput.includes('PASS') && baseOutput.includes('PASS')) {
                return { winner: 'baseline', margin: 0.9 };
            }
            return { winner: 'tie', margin: 0 };
        }
    }

    class NoisyJudgeBackend implements JudgeBackend {
        private replay = 0;
        calls = 0;

        async judge(): Promise<PairwiseVerdict> {
            this.calls++;
            if (this.calls % 2 === 1) this.replay++;
            return this.replay % 2 === 0 ? { winner: 'candidate', margin: 0.8 } : { winner: 'baseline', margin: 0.8 };
        }
    }
    /** Judge that gives a small candidate win on the primary call but flips across replays, so the noise floor exceeds the delta. */
    class WithinNoiseJudgeBackend implements JudgeBackend {
        calls = 0;

        async judge(): Promise<PairwiseVerdict> {
            this.calls++;
            if (this.calls === 1) return { winner: 'candidate', margin: 0.3 };
            return this.calls % 2 === 0 ? { winner: 'candidate', margin: 0.9 } : { winner: 'baseline', margin: 0.9 };
        }
    }

    beforeEach(async () => {
        prevCwd = cwd();
        dir = mkdtempSync(join(tmpdir(), 'superskill-evolve-'));
        mkdirSync(join(dir, '.superskill'), { recursive: true });
        writeFileSync(
            join(dir, 'widget.md'),
            '---\nname: widget\ndescription: A widget skill that does widget things well\n---\n\nBody content here for the widget skill.',
        );
        chdir(dir);
        adapter = await makeAdapter();
        spyOn(process.stdout, 'write').mockImplementation(() => true);
        spyOn(process.stderr, 'write').mockImplementation(() => true);
    });
    afterEach(() => {
        chdir(prevCwd);
        rmSync(dir, { recursive: true, force: true });
    });

    it('returns zero result and proposalPath="" when the content file is missing', async () => {
        const r = await evolve('skill', 'does-not-exist', { adapter });
        expect(r.proposalPath).toBe('');
        expect(r.changesApplied).toBe(0);
    });

    it('errors (zero result) when no historical evaluations exist', async () => {
        const r = await evolve('skill', 'widget', { adapter });
        expect(r.baselineScore).toBe(0);
        expect(r.proposalPath).toBe('');
    });

    it('--propose-only seeds heuristic changes for declining dimensions (G1/A1)', async () => {
        await seedHistory(adapter, [0.9, 0.5]); // declining clarity
        const r = await evolve('skill', 'widget', { adapter, proposeOnly: true });
        expect(r.proposalPath).not.toBe('');
        // G1/A1: propose-only now seeds heuristic changes via generateChanges for declining dims.
        const proposalContent = readFileSync(r.proposalPath, 'utf-8');
        expect(proposalContent).toContain('[Improve clarity]');
        expect(proposalContent).toContain('Fix clarity');
        expect(r.changesApplied).toBe(0);
        // Proposal persisted as draft.
        const props = await new ProposalDao(adapter).getProposals('skill', 'widget');
        expect(props).toHaveLength(1);
        expect(props[0]?.status).toBe('draft');
    });

    it('--accept marks the proposal accepted with applied_at (R9) and links verify_id (R10)', async () => {
        await seedHistory(adapter, [0.9, 0.5]);
        // First create a draft proposal via propose-only.
        await evolve('skill', 'widget', { adapter, proposeOnly: true });
        const draft = (await new ProposalDao(adapter).getProposals('skill', 'widget'))[0];
        expect(draft).toBeDefined();

        // Accept it by proposal_id string (as users see in the proposal file).
        // margin:0 — this test exercises the accept/link mechanics, not the Δ-margin gate (F024).
        const pid = ((draft?.proposal_json as Record<string, unknown>)?.proposal_id as string) ?? '';
        await evolve('skill', 'widget', { adapter, acceptId: pid, margin: -1 });

        // R9: proposal status updated to accepted with a real applied_at timestamp.
        const after = (await new ProposalDao(adapter).getProposals('skill', 'widget')).find((p) => p.id === draft?.id);
        expect(after?.status).toBe('accepted');
        expect(after?.applied_at).toBeTruthy();

        // R10: a post-evolution evaluation was persisted with operation 'evolve' and linked as verify_id.
        const evolveEvals = (await new EvaluationDao(adapter).getEvaluations('skill', 'widget')).filter(
            (e) => e.operation === 'evolve',
        );
        expect(evolveEvals.length).toBeGreaterThanOrEqual(1);
        expect(after?.verify_id).toBe(evolveEvals[0]?.id ?? -1);
    });

    it('--reject marks the proposal rejected without applying changes', async () => {
        await seedHistory(adapter, [0.9, 0.5]);
        await evolve('skill', 'widget', { adapter, proposeOnly: true });
        const draft = (await new ProposalDao(adapter).getProposals('skill', 'widget'))[0];

        const pid = ((draft?.proposal_json as Record<string, unknown>)?.proposal_id as string) ?? '';
        const r = await evolve('skill', 'widget', { adapter, rejectId: pid });
        expect(r.changesApplied).toBe(0);
        const after = (await new ProposalDao(adapter).getProposals('skill', 'widget')).find((p) => p.id === draft?.id);
        expect(after?.status).toBe('rejected');
    });

    it('--accept returns zero result when the proposal id is not found', async () => {
        await seedHistory(adapter, [0.9, 0.5]);
        const r = await evolve('skill', 'widget', { adapter, acceptId: '9999' });
        expect(r.changesApplied).toBe(0);
    });

    it('--reject returns zero result when the proposal id is not found', async () => {
        await seedHistory(adapter, [0.9, 0.5]);
        const r = await evolve('skill', 'widget', { adapter, rejectId: 'nonexistent-id' });
        expect(r.changesApplied).toBe(0);
    });

    it('applies authored changes via --ingest + --accept (F023 R6, no placeholder)', async () => {
        await seedHistory(adapter, [0.9, 0.5]); // declining clarity
        // Author a real proposal (not a placeholder) and ingest it.
        const authoredProposal = {
            proposal_id: 'skill-evolve-authored-001',
            changes: [
                {
                    dimension: 'clarity',
                    location: 'frontmatter.description',
                    current: 'A widget skill that does widget things well',
                    proposed: 'A sharper widget skill for clear lifecycle management.',
                    reason: 'Score 0.50 declining — description is too vague.',
                },
            ],
        };
        const proposalPath = join(dir, 'authored-proposal.json');
        writeFileSync(proposalPath, JSON.stringify(authoredProposal, null, 2));

        const r = await evolve('skill', 'widget', {
            adapter,
            ingest: proposalPath,
            acceptId: 'skill-evolve-authored-001',
            margin: -1, // gate disabled — test probes apply mechanics, not Δ
        });
        const content = readFileSync(join(dir, 'widget.md'), 'utf-8');
        // Authored change must actually modify the content
        expect(r.changesApplied).toBeGreaterThanOrEqual(1);
        // The authored proposed text is prepended to the existing description
        expect(content).toContain('A sharper widget skill for clear lifecycle management.');
        // No placeholder text
        expect(content).not.toContain('[Improve');
        // The original description is preserved (prepended, not replaced)
        expect(content).toContain('A widget skill that does widget things well');
    });

    it('warns when change.current is not found in content (guard)', async () => {
        await seedHistory(adapter, [0.9, 0.5]);
        // Ingest a proposal whose `current` text does not exist in the file.
        const badCurrentProposal = {
            proposal_id: 'skill-evolve-bad-current-001',
            changes: [
                {
                    dimension: 'clarity',
                    location: 'body',
                    current: 'THIS TEXT DOES NOT EXIST IN THE FILE',
                    proposed: 'replacement text',
                    reason: 'test guard',
                },
            ],
        };
        const proposalPath = join(dir, 'bad-current.json');
        writeFileSync(proposalPath, JSON.stringify(badCurrentProposal, null, 2));

        const r = await evolve('skill', 'widget', {
            adapter,
            ingest: proposalPath,
            acceptId: 'skill-evolve-bad-current-001',
            margin: -1, // gate disabled — test probes the skip-guard, not the Δ gate
        });
        // The change targeting nonexistent text is skipped — 0 applied
        expect(r.changesApplied).toBe(0);
    });

    it('--accept applies stored frontmatter and text changes', async () => {
        await seedHistory(adapter, [0.9, 0.5]);
        const handPid = 'skill-evolve-2026-06-01-001';
        await new ProposalDao(adapter).insertProposal({
            content_type: 'skill',
            content_name: 'widget',
            baseline_id: 1,
            proposal_json: {
                proposal_id: handPid,
                changes: [
                    {
                        dimension: 'description',
                        location: 'frontmatter.description',
                        current: 'A widget skill that does widget things well',
                        proposed: 'A sharper widget skill',
                        reason: 'frontmatter update',
                    },
                    {
                        dimension: 'body',
                        location: 'body',
                        current: 'Body content here',
                        proposed: 'Improved body content here',
                        reason: 'text update',
                    },
                ],
            },
        });

        const r = await evolve('skill', 'widget', { adapter, acceptId: handPid, margin: -1 });
        const content = readFileSync(join(dir, 'widget.md'), 'utf-8');
        expect(r.changesApplied).toBe(2);
        expect(content).toContain('description: A sharper widget skill');
        expect(content).toContain('Improved body content here for the widget skill.');
    });

    it('opens DB without adapter (dynamic import path)', async () => {
        await seedHistory(adapter, [0.9, 0.5]);
        // Without adapter, opens new DB via dynamic import — no historical evals there
        const r = await evolve('skill', 'widget', { proposeOnly: true });
        // Zero result because the new DB has no evaluations
        expect(r.baselineScore).toBe(0);
    });

    it('warns about single evaluation and proceeds', async () => {
        await seedHistory(adapter, [0.7]); // only 1 eval
        const r = await evolve('skill', 'widget', { adapter, proposeOnly: true });
        // Should still produce a proposal file
        expect(r.proposalPath).not.toBe('');
    });

    it('filters evaluations by --from date', async () => {
        // Seed 3 evals: 2026-06-01T00:00:00, :01, :02
        await seedHistory(adapter, [0.9, 0.8, 0.5]);
        // Use --from to keep only the last 2 (>= 2026-06-01T00:00:01)
        const r = await evolve('skill', 'widget', {
            adapter,
            proposeOnly: true,
            from: '2026-06-01T00:00:01Z',
        });
        // With 2 remaining evals, should produce a proposal
        expect(r.proposalPath).not.toBe('');
    });

    it('runs double-loop gate on --accept with default margin', async () => {
        await seedHistory(adapter, [0.9, 0.5]);
        await evolve('skill', 'widget', { adapter, proposeOnly: true });
        const draft = (await new ProposalDao(adapter).getProposals('skill', 'widget'))[0];
        expect(draft).toBeDefined();
        const pid = ((draft?.proposal_json as Record<string, unknown>)?.proposal_id as string) ?? '';
        // No margin override — defaults to 0.05, runs the full gate
        const r = await evolve('skill', 'widget', { adapter, acceptId: pid });
        // Gate may pass or reject; verify either outcome is clean (no throw)
        expect([true, undefined]).toContain(r.rejected);
    });

    it('--eval-gate accepts when candidate behavior improves and persists empirical dimensions', async () => {
        await seedHistory(adapter, [0.9, 0.5]);
        writeWidgetEvalCases();
        const pid = 'skill-evolve-empirical-pass-001';
        await new ProposalDao(adapter).insertProposal({
            content_type: 'skill',
            content_name: 'widget',
            baseline_id: 1,
            proposal_json: {
                proposal_id: pid,
                changes: [
                    {
                        dimension: 'body',
                        location: 'body',
                        current: 'Body content here',
                        proposed: 'Body content here with empirical better',
                        reason: 'exercise empirical gate',
                    },
                ],
            },
        });

        const r = await evolve('skill', 'widget', {
            adapter,
            acceptId: pid,
            margin: -1,
            evalGate: true,
            replayBackend: new ContentSensitiveReplayBackend('empirical better'),
        });

        expect(r.rejected).toBeUndefined();
        expect(readFileSync(join(dir, 'widget.md'), 'utf-8')).toContain('empirical better');
        const rows = await new EvaluationDao(adapter).getEvaluations('skill', 'widget');
        const empirical = rows.find((row) => row.dimensions.empirical);
        expect(empirical?.dimensions.empirical?.score).toBe(1);
        expect(empirical?.dimensions.empirical?.hard).toBe(1);
        expect(empirical?.dimensions.empirical?.holdout_n).toBe(1);
        expect(empirical?.dimensions.empirical?.train_n).toBe(1);
        expect(empirical?.dimensions.empirical?.note).toContain('holdout_n=1');
    });

    it('--eval-gate blocks behavior regressions and restores the file', async () => {
        await seedHistory(adapter, [0.9, 0.5]);
        writeWidgetEvalCases();
        const before = readFileSync(join(dir, 'widget.md'), 'utf-8');
        const pid = 'skill-evolve-empirical-block-001';
        await new ProposalDao(adapter).insertProposal({
            content_type: 'skill',
            content_name: 'widget',
            baseline_id: 1,
            proposal_json: {
                proposal_id: pid,
                changes: [
                    {
                        dimension: 'body',
                        location: 'body',
                        current: 'Body content here',
                        proposed: 'Body content here with empirical worse',
                        reason: 'exercise empirical gate rejection',
                    },
                ],
            },
        });

        const r = await evolve('skill', 'widget', {
            adapter,
            acceptId: pid,
            margin: -1,
            evalGate: true,
            replayBackend: new ContentSensitiveReplayBackend('Body content here for the widget skill.'),
        });

        expect(r.rejected).toBe(true);
        expect(r.rejectionReason).toContain('Empirical gate failed');
        expect(readFileSync(join(dir, 'widget.md'), 'utf-8')).toBe(before);
        const proposal = (await new ProposalDao(adapter).getProposals('skill', 'widget')).find(
            (row) => (row.proposal_json as { proposal_id?: string }).proposal_id === pid,
        );
        expect(proposal?.status).toBe('draft');
        const rows = await new EvaluationDao(adapter).getEvaluations('skill', 'widget');
        expect(rows.some((row) => row.dimensions.empirical)).toBe(false);
    });

    it('--eval-gate accepts rubric cases using replayed candidate/baseline outputs and persists noise data', async () => {
        await seedHistory(adapter, [0.9, 0.5]);
        writeWidgetRubricEvalCases();
        const judge = new PassFailJudgeBackend();
        const pid = 'skill-evolve-rubric-pass-001';
        await new ProposalDao(adapter).insertProposal({
            content_type: 'skill',
            content_name: 'widget',
            baseline_id: 1,
            proposal_json: {
                proposal_id: pid,
                changes: [
                    {
                        dimension: 'body',
                        location: 'body',
                        current: 'Body content here',
                        proposed: 'Body content here with rubric better',
                        reason: 'exercise rubric empirical gate',
                    },
                ],
            },
        });

        const r = await evolve('skill', 'widget', {
            adapter,
            acceptId: pid,
            margin: -1,
            evalGate: true,
            replayBackend: new ContentSensitiveReplayBackend('rubric better'),
            judgeBackend: judge,
        });

        expect(r.rejected).toBeUndefined();
        expect(judge.calls).toBeGreaterThan(0);
        const rows = await new EvaluationDao(adapter).getEvaluations('skill', 'widget');
        const empirical = rows.find((row) => row.dimensions.empirical);
        expect(empirical?.dimensions.empirical?.score).toBe(1);
        expect(empirical?.dimensions.empirical?.noise_floor).toBe(0);
        expect(empirical?.dimensions.empirical?.rubric_delta).toBe(0.9);
        expect(empirical?.dimensions.empirical?.note).toContain('noise_floor=0.00');
    });

    it('--eval-gate does not call the judge when no rubric cases exist', async () => {
        await seedHistory(adapter, [0.9, 0.5]);
        writeWidgetEvalCases();
        const judge = new PassFailJudgeBackend();
        const pid = 'skill-evolve-no-rubric-judge-001';
        await new ProposalDao(adapter).insertProposal({
            content_type: 'skill',
            content_name: 'widget',
            baseline_id: 1,
            proposal_json: {
                proposal_id: pid,
                changes: [
                    {
                        dimension: 'body',
                        location: 'body',
                        current: 'Body content here',
                        proposed: 'Body content here with empirical better',
                        reason: 'exercise exact empirical gate',
                    },
                ],
            },
        });

        const r = await evolve('skill', 'widget', {
            adapter,
            acceptId: pid,
            margin: -1,
            evalGate: true,
            replayBackend: new ContentSensitiveReplayBackend('empirical better'),
            judgeBackend: judge,
        });

        expect(r.rejected).toBeUndefined();
        expect(judge.calls).toBe(0);
    });

    it('--eval-gate rejects rubric wins that are within the judge noise floor', async () => {
        await seedHistory(adapter, [0.9, 0.5]);
        writeWidgetRubricEvalCases();
        const before = readFileSync(join(dir, 'widget.md'), 'utf-8');
        const pid = 'skill-evolve-rubric-noisy-001';
        await new ProposalDao(adapter).insertProposal({
            content_type: 'skill',
            content_name: 'widget',
            baseline_id: 1,
            proposal_json: {
                proposal_id: pid,
                changes: [
                    {
                        dimension: 'body',
                        location: 'body',
                        current: 'Body content here',
                        proposed: 'Body content here with noisy better',
                        reason: 'exercise noise floor',
                    },
                ],
            },
        });

        const r = await evolve('skill', 'widget', {
            adapter,
            acceptId: pid,
            margin: -1,
            evalGate: true,
            replayBackend: new ContentSensitiveReplayBackend('noisy better'),
            judgeBackend: new NoisyJudgeBackend(),
        });

        expect(r.rejected).toBe(true);
        expect(r.rejectionReason).toContain('noise_floor=');
        expect(readFileSync(join(dir, 'widget.md'), 'utf-8')).toBe(before);
    });
    it('--eval-gate downgrades a within-noise candidate win to a tie (split, no strict improve)', async () => {
        await seedHistory(adapter, [0.9, 0.5]);
        writeWidgetRubricEvalCases();
        const before = readFileSync(join(dir, 'widget.md'), 'utf-8');
        const pid = 'skill-evolve-rubric-within-noise-001';
        await new ProposalDao(adapter).insertProposal({
            content_type: 'skill',
            content_name: 'widget',
            baseline_id: 1,
            proposal_json: {
                proposal_id: pid,
                changes: [
                    {
                        dimension: 'body',
                        location: 'body',
                        current: 'Body content here',
                        proposed: 'Body content here with within-noise better',
                        reason: 'exercise within-noise split branch',
                    },
                ],
            },
        });

        const r = await evolve('skill', 'widget', {
            adapter,
            acceptId: pid,
            margin: -1,
            evalGate: true,
            replayBackend: new ContentSensitiveReplayBackend('within-noise better'),
            judgeBackend: new WithinNoiseJudgeBackend(),
        });

        // Primary verdict is a candidate win (margin 0.3), but the noise floor (~0.85) exceeds the
        // delta, so rejectsWithinNoise is true → win downgraded to a 0.5/0.5 split → no strict
        // improve → gate rejects. This exercises evolve.ts:514-516, not a baseline-win rejection.
        expect(r.rejected).toBe(true);
        expect(r.rejectionReason).toContain('noise_floor=');
        expect(r.rejectionReason).toContain('rubric_delta=');
        expect(readFileSync(join(dir, 'widget.md'), 'utf-8')).toBe(before);
    });

    it('--eval-gate fails loud when the rubric judge budget cap is exceeded', async () => {
        await seedHistory(adapter, [0.9, 0.5]);
        writeWidgetRubricEvalCases();
        const before = readFileSync(join(dir, 'widget.md'), 'utf-8');
        const pid = 'skill-evolve-rubric-budget-001';
        await new ProposalDao(adapter).insertProposal({
            content_type: 'skill',
            content_name: 'widget',
            baseline_id: 1,
            proposal_json: {
                proposal_id: pid,
                changes: [
                    {
                        dimension: 'body',
                        location: 'body',
                        current: 'Body content here',
                        proposed: 'Body content here with budget better',
                        reason: 'exercise budget cap',
                    },
                ],
            },
        });

        const r = await evolve('skill', 'widget', {
            adapter,
            acceptId: pid,
            margin: -1,
            evalGate: true,
            replayBackend: new ContentSensitiveReplayBackend('budget better'),
            judgeBackend: new PassFailJudgeBackend(),
            judgeBudget: { maxModelCalls: 1 },
        });

        expect(r.rejected).toBe(true);
        expect(r.rejectionReason).toContain('budget cap hit');
        expect(readFileSync(join(dir, 'widget.md'), 'utf-8')).toBe(before);
    });

    // ── G1/A1: seeded proposals ───────────────────────────────────────────────

    it('--propose-only yields no changes for a perfect agent (G1/A1)', async () => {
        await seedHistory(adapter, [0.95, 0.95]); // flat, high — no declining/flat-low dims
        const r = await evolve('skill', 'widget', { adapter, proposeOnly: true });
        expect(r.proposalPath).not.toBe('');
        const proposalContent = readFileSync(r.proposalPath, 'utf-8');
        // No proposed changes because all dims are high and flat (not declining, not flat-low < 0.7)
        expect(proposalContent).not.toContain('[Improve');
        expect(proposalContent).not.toContain('Fix clarity');
    });

    it('--propose-only seeds changes for flat-low dimensions (G1/A1)', async () => {
        await seedHistory(adapter, [0.5, 0.5]); // flat, low (< 0.7)
        const r = await evolve('skill', 'widget', { adapter, proposeOnly: true });
        const proposalContent = readFileSync(r.proposalPath, 'utf-8');
        expect(proposalContent).toContain('[Improve clarity]');
    });

    // ── G2/A2: --analyze ───────────────────────────────────────────────────────

    it('--analyze prints trend table, score/grade, and data sources without writing a proposal (G2/A2)', async () => {
        await seedHistory(adapter, [0.9, 0.5]); // declining clarity
        const writes: string[] = [];
        const spy = spyOn(process.stdout, 'write').mockImplementation((data) => {
            writes.push(typeof data === 'string' ? data : data.toString());
            return true;
        });
        const r = await evolve('skill', 'widget', { adapter, analyze: true });
        spy.mockRestore();
        const output = writes.join('');
        expect(output).toContain('=== Evolution Analysis ===');
        expect(output).toContain('Score:');
        expect(output).toContain('declining');
        expect(output).toContain('evaluation-history');
        // No proposal written
        expect(r.proposalPath).toBe('');
        expect(r.changesApplied).toBe(0);
    });

    it('--analyze works with a single evaluation (G2/A2)', async () => {
        await seedHistory(adapter, [0.85]);
        const writes: string[] = [];
        const spy = spyOn(process.stdout, 'write').mockImplementation((data) => {
            writes.push(typeof data === 'string' ? data : data.toString());
            return true;
        });
        const r = await evolve('skill', 'widget', { adapter, analyze: true });
        spy.mockRestore();
        const output = writes.join('');
        expect(output).toContain('=== Evolution Analysis ===');
        expect(r.proposalPath).toBe('');
    });

    // ── G3/A3: --history ───────────────────────────────────────────────────────

    it('--history reports no applied versions when none exist (G3/A3)', async () => {
        const writes: string[] = [];
        const spy = spyOn(process.stdout, 'write').mockImplementation((data) => {
            writes.push(typeof data === 'string' ? data : data.toString());
            return true;
        });
        const r = await evolve('skill', 'widget', { adapter, history: true });
        spy.mockRestore();
        const output = writes.join('');
        expect(output).toContain('No applied versions');
        expect(r.changesApplied).toBe(0);
    });

    it('--history lists an applied version after --accept (G3/A3)', async () => {
        await seedHistory(adapter, [0.9, 0.5]);
        // Create and accept a proposal.
        await evolve('skill', 'widget', { adapter, proposeOnly: true });
        const draft = (await new ProposalDao(adapter).getProposals('skill', 'widget'))[0];
        const pid = ((draft?.proposal_json as Record<string, unknown>)?.proposal_id as string) ?? '';
        await evolve('skill', 'widget', { adapter, acceptId: pid, margin: -1 });

        // Query history.
        const writes: string[] = [];
        const spy = spyOn(process.stdout, 'write').mockImplementation((data) => {
            writes.push(typeof data === 'string' ? data : data.toString());
            return true;
        });
        const r = await evolve('skill', 'widget', { adapter, history: true });
        spy.mockRestore();
        const output = writes.join('');
        expect(output).toContain('=== Version History: widget ===');
        expect(output).toContain(pid);
        expect(output).toContain('✓'); // snapshot exists
        expect(r.changesApplied).toBe(0);
    });

    // ── G3/A3: --rollback ──────────────────────────────────────────────────────

    it('--rollback requires --confirm (G3/A3)', async () => {
        await seedHistory(adapter, [0.9, 0.5]);
        const r = await evolve('skill', 'widget', { adapter, rollback: 'some-id' });
        expect(r.changesApplied).toBe(0);
        // No file mutation occurred
    });

    it('--rollback restores byte-identical content after an applied evolve (G3/A3)', async () => {
        await seedHistory(adapter, [0.9, 0.5]);
        const originalContent = readFileSync(join(dir, 'widget.md'), 'utf-8');

        // Create and accept a proposal (this modifies the file and creates a version snapshot).
        await evolve('skill', 'widget', { adapter, proposeOnly: true });
        const draft = (await new ProposalDao(adapter).getProposals('skill', 'widget'))[0];
        const pid = ((draft?.proposal_json as Record<string, unknown>)?.proposal_id as string) ?? '';
        await evolve('skill', 'widget', { adapter, acceptId: pid, margin: -1 });

        // File should now be different from original.
        const modifiedContent = readFileSync(join(dir, 'widget.md'), 'utf-8');
        expect(modifiedContent).not.toBe(originalContent);

        // Rollback to the pre-apply version.
        const r = await evolve('skill', 'widget', { adapter, rollback: pid, confirm: true });
        expect(r.changesApplied).toBe(0);

        // File should be byte-identical to the original.
        const restoredContent = readFileSync(join(dir, 'widget.md'), 'utf-8');
        expect(restoredContent).toBe(originalContent);
    });

    it('--rollback errors when the version snapshot does not exist (G3/A3)', async () => {
        await seedHistory(adapter, [0.9, 0.5]);
        const r = await evolve('skill', 'widget', {
            adapter,
            rollback: 'nonexistent-version',
            confirm: true,
        });
        expect(r.changesApplied).toBe(0);
    });
});

// ── Command-type regression (task 0053 C3: file-based .md commands) ────────────

describe('evolve — command type (0053)', () => {
    let dir: string;
    let prevCwd: string;
    let adapter: DbAdapter;

    async function makeAdapter(): Promise<DbAdapter> {
        const a = await createDbAdapter({ driver: 'bun-sqlite', url: ':memory:' });
        await a.exec(evaluations.createTableSql);
        await a.exec(proposals.createTableSql);
        return a;
    }

    /** Seed command evaluations so trend analysis has declining history. */
    async function seedCommandHistory(a: DbAdapter, scores: number[]): Promise<void> {
        const dao = new EvaluationDao(a);
        for (let i = 0; i < scores.length; i++) {
            const score = scores[i];
            if (score === undefined) continue;
            const id = await dao.insertEvaluation({
                content_type: 'command',
                content_name: 'deploy',
                target_agent: 'claude',
                operation: 'evaluate',
                aggregate: score,
                dimensions: { clarity: { score, note: 'declining clarity' } },
                file_hash: 'abc',
            });
            await a.exec(`UPDATE evaluations SET created_at = ${Date.UTC(2026, 5, 1, 0, 0, i)} WHERE id = ${id}`);
        }
    }

    beforeEach(async () => {
        prevCwd = cwd();
        dir = mkdtempSync(join(tmpdir(), 'superskill-evolve-command-'));
        mkdirSync(join(dir, '.superskill'), { recursive: true });
        writeFileSync(
            join(dir, 'deploy.md'),
            '---\nname: deploy\ndescription: Deploy command\n---\n\nRun the deployment.\n',
        );
        chdir(dir);
        adapter = await makeAdapter();
        spyOn(process.stdout, 'write').mockImplementation(() => true);
        spyOn(process.stderr, 'write').mockImplementation(() => true);
    });
    afterEach(() => {
        chdir(prevCwd);
        rmSync(dir, { recursive: true, force: true });
    });

    it('--propose-only seeds heuristic changes for a sub-perfect command (C3/G1)', async () => {
        await seedCommandHistory(adapter, [0.9, 0.5]); // declining clarity
        const r = await evolve('command', 'deploy', { adapter, proposeOnly: true });
        expect(r.proposalPath).not.toBe('');
        const proposalContent = readFileSync(r.proposalPath, 'utf-8');
        expect(proposalContent).toContain('[Improve clarity]');
        expect(r.changesApplied).toBe(0);
        const props = await new ProposalDao(adapter).getProposals('command', 'deploy');
        expect(props).toHaveLength(1);
        expect(props[0]?.status).toBe('draft');
    });

    it('--analyze prints summary for a command without writing a proposal (C3/G2)', async () => {
        await seedCommandHistory(adapter, [0.9, 0.5]);
        const writes: string[] = [];
        const spy = spyOn(process.stdout, 'write').mockImplementation((data) => {
            writes.push(typeof data === 'string' ? data : data.toString());
            return true;
        });
        const r = await evolve('command', 'deploy', { adapter, analyze: true });
        spy.mockRestore();
        const output = writes.join('');
        expect(output).toContain('=== Evolution Analysis ===');
        expect(output).toContain('Score:');
        expect(r.proposalPath).toBe('');
        expect(r.changesApplied).toBe(0);
    });

    it('--history lists an applied command version after --accept (C3/G3)', async () => {
        await seedCommandHistory(adapter, [0.9, 0.5]);
        await evolve('command', 'deploy', { adapter, proposeOnly: true });
        const draft = (await new ProposalDao(adapter).getProposals('command', 'deploy'))[0];
        const pid = ((draft?.proposal_json as Record<string, unknown>)?.proposal_id as string) ?? '';
        await evolve('command', 'deploy', { adapter, acceptId: pid, margin: -1 });

        const writes: string[] = [];
        const spy = spyOn(process.stdout, 'write').mockImplementation((data) => {
            writes.push(typeof data === 'string' ? data : data.toString());
            return true;
        });
        const r = await evolve('command', 'deploy', { adapter, history: true });
        spy.mockRestore();
        const output = writes.join('');
        expect(output).toContain('=== Version History: deploy ===');
        expect(output).toContain(pid);
        expect(r.changesApplied).toBe(0);
    });

    it('--rollback restores byte-identical command file after apply (C3/G3)', async () => {
        await seedCommandHistory(adapter, [0.9, 0.5]);
        const originalContent = readFileSync(join(dir, 'deploy.md'), 'utf-8');

        await evolve('command', 'deploy', { adapter, proposeOnly: true });
        const draft = (await new ProposalDao(adapter).getProposals('command', 'deploy'))[0];
        const pid = ((draft?.proposal_json as Record<string, unknown>)?.proposal_id as string) ?? '';
        await evolve('command', 'deploy', { adapter, acceptId: pid, margin: -1 });

        const modifiedContent = readFileSync(join(dir, 'deploy.md'), 'utf-8');
        expect(modifiedContent).not.toBe(originalContent);

        const r = await evolve('command', 'deploy', { adapter, rollback: pid, confirm: true });
        expect(r.changesApplied).toBe(0);

        const restoredContent = readFileSync(join(dir, 'deploy.md'), 'utf-8');
        expect(restoredContent).toBe(originalContent);
    });

    it('--rollback without --confirm does not mutate the command file (C3/G3)', async () => {
        await seedCommandHistory(adapter, [0.9, 0.5]);
        const originalContent = readFileSync(join(dir, 'deploy.md'), 'utf-8');
        const r = await evolve('command', 'deploy', { adapter, rollback: 'some-id' });
        expect(r.changesApplied).toBe(0);
        expect(readFileSync(join(dir, 'deploy.md'), 'utf-8')).toBe(originalContent);
    });
});

describe('evolve — magent type, frontmatter-less (0054)', () => {
    let dir: string;
    let prevCwd: string;
    let adapter: DbAdapter;

    async function makeAdapter(): Promise<DbAdapter> {
        const a = await createDbAdapter({ driver: 'bun-sqlite', url: ':memory:' });
        await a.exec(evaluations.createTableSql);
        await a.exec(proposals.createTableSql);
        return a;
    }

    /** Seed magent evaluations so trend analysis has declining history. */
    async function seedMagentHistory(a: DbAdapter, scores: number[]): Promise<void> {
        const dao = new EvaluationDao(a);
        for (let i = 0; i < scores.length; i++) {
            const score = scores[i];
            if (score === undefined) continue;
            const id = await dao.insertEvaluation({
                content_type: 'magent',
                content_name: 'AGENTS',
                target_agent: 'claude',
                operation: 'evaluate',
                aggregate: score,
                dimensions: { completeness: { score, note: 'declining completeness' } },
                file_hash: 'abc',
            });
            await a.exec(`UPDATE evaluations SET created_at = ${Date.UTC(2026, 5, 1, 0, 0, i)} WHERE id = ${id}`);
        }
    }

    beforeEach(async () => {
        prevCwd = cwd();
        dir = mkdtempSync(join(tmpdir(), 'superskill-evolve-magent-'));
        mkdirSync(join(dir, '.superskill'), { recursive: true });
        // Frontmatter-LESS magent (plain markdown, like AGENTS.md/CLAUDE.md/GEMINI.md per task 0050).
        writeFileSync(join(dir, 'AGENTS.md'), '# AGENTS.md\n\nGuidance for coding agents in this repo.\n');
        chdir(dir);
        adapter = await makeAdapter();
        spyOn(process.stdout, 'write').mockImplementation(() => true);
        spyOn(process.stderr, 'write').mockImplementation(() => true);
    });
    afterEach(() => {
        chdir(prevCwd);
        rmSync(dir, { recursive: true, force: true });
    });

    it('--propose-only seeds body-targeted changes (no frontmatter.description) for a frontmatter-less magent (M2/M4)', async () => {
        await seedMagentHistory(adapter, [0.9, 0.5]); // declining completeness
        const r = await evolve('magent', 'AGENTS', { adapter, proposeOnly: true });
        expect(r.proposalPath).not.toBe('');
        const proposalContent = readFileSync(r.proposalPath, 'utf-8');
        expect(proposalContent).toContain('[Improve completeness]');
        // Critical: the change targets the body, not a frontmatter.description field edit
        // (the config has no frontmatter). Assert the Location line, not the whole file, since
        // the reason string legitimately mentions "frontmatter.description" by name.
        expect(proposalContent).toContain('**Location:** body');
        expect(proposalContent).not.toMatch(/\*\*Location:\*\* frontmatter\.description/);
        expect(r.changesApplied).toBe(0);
        const props = await new ProposalDao(adapter).getProposals('magent', 'AGENTS');
        expect(props).toHaveLength(1);
        expect(props[0]?.status).toBe('draft');
    });

    it('--analyze prints summary for a frontmatter-less magent without crashing (M1/M4)', async () => {
        await seedMagentHistory(adapter, [0.9, 0.5]);
        const writes: string[] = [];
        const spy = spyOn(process.stdout, 'write').mockImplementation((data) => {
            writes.push(typeof data === 'string' ? data : data.toString());
            return true;
        });
        const r = await evolve('magent', 'AGENTS', { adapter, analyze: true });
        spy.mockRestore();
        const output = writes.join('');
        expect(output).toContain('=== Evolution Analysis ===');
        expect(output).toContain('Score:');
        expect(r.proposalPath).toBe('');
        expect(r.changesApplied).toBe(0);
    });

    it('--history lists an applied version after --accept on a frontmatter-less magent (M1/M4)', async () => {
        await seedMagentHistory(adapter, [0.9, 0.5]);
        await evolve('magent', 'AGENTS', { adapter, proposeOnly: true });
        const draft = (await new ProposalDao(adapter).getProposals('magent', 'AGENTS'))[0];
        const pid = ((draft?.proposal_json as Record<string, unknown>)?.proposal_id as string) ?? '';
        await evolve('magent', 'AGENTS', { adapter, acceptId: pid, margin: -1 });

        const writes: string[] = [];
        const spy = spyOn(process.stdout, 'write').mockImplementation((data) => {
            writes.push(typeof data === 'string' ? data : data.toString());
            return true;
        });
        const r = await evolve('magent', 'AGENTS', { adapter, history: true });
        spy.mockRestore();
        const output = writes.join('');
        expect(output).toContain('=== Version History: AGENTS ===');
        expect(output).toContain(pid);
        expect(r.changesApplied).toBe(0);
    });

    it('--rollback restores byte-identical frontmatter-less magent after apply (M1/M4)', async () => {
        await seedMagentHistory(adapter, [0.9, 0.5]);
        const originalContent = readFileSync(join(dir, 'AGENTS.md'), 'utf-8');

        await evolve('magent', 'AGENTS', { adapter, proposeOnly: true });
        const draft = (await new ProposalDao(adapter).getProposals('magent', 'AGENTS'))[0];
        const pid = ((draft?.proposal_json as Record<string, unknown>)?.proposal_id as string) ?? '';
        await evolve('magent', 'AGENTS', { adapter, acceptId: pid, margin: -1 });

        const modifiedContent = readFileSync(join(dir, 'AGENTS.md'), 'utf-8');
        expect(modifiedContent).not.toBe(originalContent);

        const r = await evolve('magent', 'AGENTS', { adapter, rollback: pid, confirm: true });
        expect(r.changesApplied).toBe(0);

        const restoredContent = readFileSync(join(dir, 'AGENTS.md'), 'utf-8');
        expect(restoredContent).toBe(originalContent);
    });

    it('--rollback without --confirm does not mutate the frontmatter-less magent (M1/M4)', async () => {
        await seedMagentHistory(adapter, [0.9, 0.5]);
        const originalContent = readFileSync(join(dir, 'AGENTS.md'), 'utf-8');
        const r = await evolve('magent', 'AGENTS', { adapter, rollback: 'some-id' });
        expect(r.changesApplied).toBe(0);
        expect(readFileSync(join(dir, 'AGENTS.md'), 'utf-8')).toBe(originalContent);
    });

    it('--json --propose-only emits an envelope without crashing on a frontmatter-less magent (M2/M4)', async () => {
        await seedMagentHistory(adapter, [0.9, 0.5]);
        const r = await evolve('magent', 'AGENTS', { adapter, proposeOnly: true, json: true });
        // Envelope path returns proposalPath === '' and writes JSON to stdout; just assert no crash.
        expect(r.changesApplied).toBe(0);
    });
});
// ── Skill-type regression (task 0055: directory-based SKILL.md) ─────────────────

describe('evolve — skill type, directory-based (0055)', () => {
    let dir: string;
    let prevCwd: string;
    let adapter: DbAdapter;

    async function makeAdapter(): Promise<DbAdapter> {
        const a = await createDbAdapter({ driver: 'bun-sqlite', url: ':memory:' });
        await a.exec(evaluations.createTableSql);
        await a.exec(proposals.createTableSql);
        return a;
    }

    /** Seed skill evaluations so trend analysis has declining history. */
    async function seedSkillHistory(a: DbAdapter, scores: number[]): Promise<void> {
        const dao = new EvaluationDao(a);
        for (let i = 0; i < scores.length; i++) {
            const score = scores[i];
            if (score === undefined) continue;
            const id = await dao.insertEvaluation({
                content_type: 'skill',
                content_name: 'my-skill',
                target_agent: 'claude',
                operation: 'evaluate',
                aggregate: score,
                dimensions: { clarity: { score, note: 'declining clarity' } },
                file_hash: 'abc',
            });
            await a.exec(`UPDATE evaluations SET created_at = ${Date.UTC(2026, 5, 1, 0, 0, i)} WHERE id = ${id}`);
        }
    }

    const SKILL_CONTENT = [
        '---',
        'name: my-skill',
        'description: A test skill for evolve regression',
        'version: 1.0.0',
        '---',
        '',
        '# My Skill',
        '',
        'This is a directory-based skill.',
    ].join('\n');

    function writeSkill(dirPath: string) {
        mkdirSync(join(dirPath, 'skills', 'my-skill'), { recursive: true });
        writeFileSync(join(dirPath, 'skills', 'my-skill', 'SKILL.md'), SKILL_CONTENT);
    }

    beforeEach(async () => {
        prevCwd = cwd();
        dir = mkdtempSync(join(tmpdir(), 'superskill-evolve-skill-'));
        mkdirSync(join(dir, '.superskill'), { recursive: true });
        writeSkill(dir);
        chdir(dir);
        adapter = await makeAdapter();
        spyOn(process.stdout, 'write').mockImplementation(() => true);
        spyOn(process.stderr, 'write').mockImplementation(() => true);
    });
    afterEach(() => {
        chdir(prevCwd);
        rmSync(dir, { recursive: true, force: true });
    });

    it('--propose-only seeds heuristic changes for a sub-perfect directory-based skill', async () => {
        await seedSkillHistory(adapter, [0.9, 0.5]); // declining clarity
        const r = await evolve('skill', 'skills/my-skill/SKILL.md', { adapter, proposeOnly: true });
        expect(r.proposalPath).not.toBe('');
        const proposalContent = readFileSync(r.proposalPath, 'utf-8');
        expect(proposalContent).toContain('[Improve clarity]');
        expect(r.changesApplied).toBe(0);
        const props = await new ProposalDao(adapter).getProposals('skill', 'my-skill');
        expect(props).toHaveLength(1);
        expect(props[0]?.status).toBe('draft');
    });

    it('resolves directory path (no SKILL.md suffix) to SKILL.md inside the dir', async () => {
        await seedSkillHistory(adapter, [0.9, 0.5]);
        const r = await evolve('skill', 'skills/my-skill', { adapter, proposeOnly: true });
        expect(r.proposalPath).not.toBe('');
        const proposalContent = readFileSync(r.proposalPath, 'utf-8');
        expect(proposalContent).toContain('[Improve clarity]');
        const props = await new ProposalDao(adapter).getProposals('skill', 'my-skill');
        expect(props).toHaveLength(1);
    });

    it('--analyze prints summary for a directory-based skill without writing a proposal', async () => {
        await seedSkillHistory(adapter, [0.9, 0.5]);
        const writes: string[] = [];
        const spy = spyOn(process.stdout, 'write').mockImplementation((data) => {
            writes.push(typeof data === 'string' ? data : data.toString());
            return true;
        });
        const r = await evolve('skill', 'skills/my-skill/SKILL.md', { adapter, analyze: true });
        spy.mockRestore();
        const output = writes.join('');
        expect(output).toContain('=== Evolution Analysis ===');
        expect(output).toContain('Score:');
        expect(r.proposalPath).toBe('');
        expect(r.changesApplied).toBe(0);
    });

    it('--history lists an applied skill version after --accept', async () => {
        await seedSkillHistory(adapter, [0.9, 0.5]);
        await evolve('skill', 'skills/my-skill/SKILL.md', { adapter, proposeOnly: true });
        const draft = (await new ProposalDao(adapter).getProposals('skill', 'my-skill'))[0];
        const pid = ((draft?.proposal_json as Record<string, unknown>)?.proposal_id as string) ?? '';
        await evolve('skill', 'skills/my-skill/SKILL.md', { adapter, acceptId: pid, margin: -1 });

        const writes: string[] = [];
        const spy = spyOn(process.stdout, 'write').mockImplementation((data) => {
            writes.push(typeof data === 'string' ? data : data.toString());
            return true;
        });
        const r = await evolve('skill', 'skills/my-skill/SKILL.md', { adapter, history: true });
        spy.mockRestore();
        const output = writes.join('');
        expect(output).toContain('=== Version History: my-skill ===');
        expect(output).toContain(pid);
        expect(r.changesApplied).toBe(0);
    });

    it('--rollback restores byte-identical SKILL.md file after apply', async () => {
        await seedSkillHistory(adapter, [0.9, 0.5]);
        const skillPath = join(dir, 'skills', 'my-skill', 'SKILL.md');
        const originalContent = readFileSync(skillPath, 'utf-8');

        await evolve('skill', 'skills/my-skill/SKILL.md', { adapter, proposeOnly: true });
        const draft = (await new ProposalDao(adapter).getProposals('skill', 'my-skill'))[0];
        const pid = ((draft?.proposal_json as Record<string, unknown>)?.proposal_id as string) ?? '';
        await evolve('skill', 'skills/my-skill/SKILL.md', { adapter, acceptId: pid, margin: -1 });

        const modifiedContent = readFileSync(skillPath, 'utf-8');
        expect(modifiedContent).not.toBe(originalContent);

        const r = await evolve('skill', 'skills/my-skill/SKILL.md', { adapter, rollback: pid, confirm: true });
        expect(r.changesApplied).toBe(0);

        const restoredContent = readFileSync(skillPath, 'utf-8');
        expect(restoredContent).toBe(originalContent);
    });

    it('--rollback without --confirm does not mutate the SKILL.md file', async () => {
        await seedSkillHistory(adapter, [0.9, 0.5]);
        const skillPath = join(dir, 'skills', 'my-skill', 'SKILL.md');
        const originalContent = readFileSync(skillPath, 'utf-8');
        const r = await evolve('skill', 'skills/my-skill/SKILL.md', { adapter, rollback: 'some-id' });
        expect(r.changesApplied).toBe(0);
        expect(readFileSync(skillPath, 'utf-8')).toBe(originalContent);
    });
});
// ── Hook-type: analyze-only guard (task 0056 decision C) ──────────────────────

describe('evolve — hook type, analyze-only (0056)', () => {
    let dir: string;
    let prevCwd: string;
    let adapter: DbAdapter;

    async function makeAdapter(): Promise<DbAdapter> {
        const a = await createDbAdapter({ driver: 'bun-sqlite', url: ':memory:' });
        await a.exec(evaluations.createTableSql);
        await a.exec(proposals.createTableSql);
        return a;
    }

    /** Seed hook evaluations so trend analysis has declining history. */
    async function seedHookHistory(a: DbAdapter, scores: number[]): Promise<void> {
        const dao = new EvaluationDao(a);
        for (let i = 0; i < scores.length; i++) {
            const score = scores[i];
            if (score === undefined) continue;
            const id = await dao.insertEvaluation({
                content_type: 'hook',
                content_name: 'pre-tool',
                target_agent: 'claude',
                operation: 'evaluate',
                aggregate: score,
                dimensions: { safety: { score, note: 'safety trend' } },
                file_hash: 'abc',
            });
            await a.exec(`UPDATE evaluations SET created_at = ${Date.UTC(2026, 5, 1, 0, 0, i)} WHERE id = ${id}`);
        }
    }

    const HOOK_CONTENT = [
        '---',
        'name: pre-tool',
        'description: A pre-tool-use hook for validation',
        'event: PreToolUse',
        'enabled: true',
        '---',
        '',
        '<!-- TODO: hook script or matcher -->',
    ].join('\n');

    beforeEach(async () => {
        prevCwd = cwd();
        dir = mkdtempSync(join(tmpdir(), 'superskill-evolve-hook-'));
        mkdirSync(join(dir, '.superskill'), { recursive: true });
        writeFileSync(join(dir, 'pre-tool.md'), HOOK_CONTENT);
        chdir(dir);
        adapter = await makeAdapter();
        spyOn(process.stdout, 'write').mockImplementation(() => true);
        spyOn(process.stderr, 'write').mockImplementation(() => true);
    });
    afterEach(() => {
        chdir(prevCwd);
        rmSync(dir, { recursive: true, force: true });
    });

    it('--analyze prints trend summary for hooks without writing a proposal (0056 C)', async () => {
        await seedHookHistory(adapter, [0.9, 0.5]); // declining safety
        const writes: string[] = [];
        const spy = spyOn(process.stdout, 'write').mockImplementation((data) => {
            writes.push(typeof data === 'string' ? data : data.toString());
            return true;
        });
        const r = await evolve('hook', 'pre-tool', { adapter, analyze: true });
        spy.mockRestore();
        const output = writes.join('');
        expect(output).toContain('=== Evolution Analysis ===');
        expect(output).toContain('Score:');
        expect(output).toContain('declining');
        expect(r.proposalPath).toBe('');
        expect(r.changesApplied).toBe(0);
    });

    it('--analyze works with a single hook evaluation (0056 C)', async () => {
        await seedHookHistory(adapter, [0.85]);
        const r = await evolve('hook', 'pre-tool', { adapter, analyze: true });
        expect(r.proposalPath).toBe('');
        expect(r.changesApplied).toBe(0);
    });

    it('--propose-only is rejected for hooks (0056 C — analyze-only)', async () => {
        await seedHookHistory(adapter, [0.9, 0.5]);
        const writes: string[] = [];
        const spy = spyOn(process.stderr, 'write').mockImplementation((data) => {
            writes.push(typeof data === 'string' ? data : data.toString());
            return true;
        });
        const r = await evolve('hook', 'pre-tool', { adapter, proposeOnly: true });
        spy.mockRestore();
        const output = writes.join('');
        expect(output).toContain('analyze-only');
        expect(r.proposalPath).toBe('');
        expect(r.changesApplied).toBe(0);
    });

    it('--accept is rejected for hooks (0056 C — analyze-only)', async () => {
        await seedHookHistory(adapter, [0.9, 0.5]);
        const r = await evolve('hook', 'pre-tool', { adapter, acceptId: 'some-id', margin: -1 });
        expect(r.proposalPath).toBe('');
        expect(r.changesApplied).toBe(0);
    });

    it('--reject is rejected for hooks (0056 C — analyze-only)', async () => {
        await seedHookHistory(adapter, [0.9, 0.5]);
        const r = await evolve('hook', 'pre-tool', { adapter, rejectId: 'some-id' });
        expect(r.proposalPath).toBe('');
        expect(r.changesApplied).toBe(0);
    });

    it('--ingest is rejected for hooks (0056 C — analyze-only)', async () => {
        await seedHookHistory(adapter, [0.9, 0.5]);
        const r = await evolve('hook', 'pre-tool', { adapter, ingest: '/tmp/fake.json' });
        expect(r.proposalPath).toBe('');
        expect(r.changesApplied).toBe(0);
    });

    it('--history is rejected for hooks (0056 C — analyze-only)', async () => {
        await seedHookHistory(adapter, [0.9, 0.5]);
        const r = await evolve('hook', 'pre-tool', { adapter, history: true });
        expect(r.proposalPath).toBe('');
        expect(r.changesApplied).toBe(0);
    });

    it('--rollback is rejected for hooks (0056 C — analyze-only)', async () => {
        await seedHookHistory(adapter, [0.9, 0.5]);
        const originalContent = readFileSync(join(dir, 'pre-tool.md'), 'utf-8');
        const r = await evolve('hook', 'pre-tool', { adapter, rollback: 'some-id', confirm: true });
        expect(r.proposalPath).toBe('');
        expect(r.changesApplied).toBe(0);
        // File must not be mutated
        expect(readFileSync(join(dir, 'pre-tool.md'), 'utf-8')).toBe(originalContent);
    });

    it('isHookApplyCapableOpt detects apply-capable options', () => {
        expect(isHookApplyCapableOpt()).toBe(false);
        expect(isHookApplyCapableOpt({})).toBe(false);
        expect(isHookApplyCapableOpt({ analyze: true })).toBe(false);
        expect(isHookApplyCapableOpt({ from: '2026-01-01' })).toBe(false);
        expect(isHookApplyCapableOpt({ json: true })).toBe(false);
        expect(isHookApplyCapableOpt({ proposeOnly: true })).toBe(true);
        expect(isHookApplyCapableOpt({ acceptId: 'x' })).toBe(true);
        expect(isHookApplyCapableOpt({ rejectId: 'x' })).toBe(true);
        expect(isHookApplyCapableOpt({ ingest: '/tmp/f.json' })).toBe(true);
        expect(isHookApplyCapableOpt({ history: true })).toBe(true);
        expect(isHookApplyCapableOpt({ rollback: 'x' })).toBe(true);
    });
});
// ── Interactive review (injectable readline) ───────────────────────────────────

describe('interactiveReview', () => {
    function fakeRl(answers: string[]) {
        let idx = 0;
        return () => ({
            question: (_p: string, cb: (ans: string) => void) => {
                cb(idx < answers.length ? (answers[idx++] as string) : 'q');
            },
            close: () => {},
        });
    }

    const change: ProposedChange = {
        dimension: 'clarity',
        location: 'dimension:clarity',
        current: 'Score: 0.50',
        proposed: 'Improve clarity',
        reason: 'declining',
    };
    const trends: TrendEntry[] = [
        { dimension: 'clarity', earliest: 0.9, latest: 0.5, delta: -0.4, trend: 'declining' },
    ];

    it('accepts a change on "a"', async () => {
        const rl = fakeRl(['a']) as unknown as typeof import('node:readline').createInterface;
        const r = await interactiveReview([change], trends, rl);
        expect(r.accepted).toHaveLength(1);
        expect(r.rejected).toHaveLength(0);
    });

    it('rejects a change on "r"', async () => {
        const rl = fakeRl(['r']) as unknown as typeof import('node:readline').createInterface;
        const r = await interactiveReview([change], trends, rl);
        expect(r.accepted).toHaveLength(0);
        expect(r.rejected).toHaveLength(1);
    });

    it('edits proposed text on "e" then accepts', async () => {
        const rl = fakeRl(['e', 'My edited proposal']) as unknown as typeof import('node:readline').createInterface;
        const r = await interactiveReview([change], trends, rl);
        expect(r.accepted).toHaveLength(1);
        expect(r.accepted[0]?.proposed).toBe('My edited proposal');
    });

    it('quits on "q" and rejects the remaining changes', async () => {
        const rl = fakeRl(['q']) as unknown as typeof import('node:readline').createInterface;
        const r = await interactiveReview([change, { ...change, dimension: 'conciseness' }], trends, rl);
        expect(r.accepted).toHaveLength(0);
        expect(r.rejected).toHaveLength(2);
    });
});

// ── Empirical Gate Regression (0068 R6) ──────────────────────────────────────

describe('evolve — empirical gate default-path invariance', () => {
    let dir: string;
    let originalCwd: string;
    let adapter: DbAdapter;

    beforeEach(async () => {
        originalCwd = cwd();
        dir = mkdtempSync(join(tmpdir(), 'evolve-empirical-'));
        chdir(dir);
        adapter = await createDbAdapter({ driver: 'bun-sqlite', url: ':memory:' });
        await adapter.exec(evaluations.createTableSql);
        await adapter.exec(proposals.createTableSql);
    });

    afterEach(() => {
        chdir(originalCwd);
        rmSync(dir, { recursive: true, force: true });
    });

    async function seedEvals(
        adapter: DbAdapter,
        contentType: string,
        contentName: string,
        scores: { aggregate: number; dims: Record<string, number>; createdAt: number }[],
    ): Promise<void> {
        const dao = new EvaluationDao(adapter);
        for (const s of scores) {
            const dims: Record<string, { score: number; note: string }> = {};
            for (const [k, v] of Object.entries(s.dims)) {
                dims[k] = { score: v, note: `${k} note` };
            }
            await dao.insertEvaluation({
                content_type: contentType,
                content_name: contentName,
                target_agent: 'claude',
                operation: 'evaluate',
                aggregate: s.aggregate,
                dimensions: dims,
            });
        }
    }
    it('evolve with --eval-gate flag but no cases.yaml does not crash (skip-when-absent)', async () => {
        const content = '---\nname: noevals\ndescription: No eval cases\n---\n\n# No Evals\n\nBody text.';
        mkdirSync(join(dir, 'skills', 'noevals'), { recursive: true });
        writeFileSync(join(dir, 'skills', 'noevals', 'SKILL.md'), content);

        await seedEvals(adapter, 'skill', 'noevals', [
            { aggregate: 0.5, dims: { clarity: 0.4, completeness: 0.6 }, createdAt: 1000 },
            { aggregate: 0.7, dims: { clarity: 0.6, completeness: 0.8 }, createdAt: 2000 },
        ]);

        // --propose-only with evalGate should not crash when cases.yaml is absent
        const r = await evolve('skill', 'skills/noevals/SKILL.md', {
            adapter,
            proposeOnly: true,
            evalGate: true,
        });

        // Proposal should be generated (form gate passed, empirical gate skipped)
        expect(r.proposalPath).toBeTruthy();
        expect(r.baselineScore).toBeGreaterThan(0);
    });

    it('evolve without --eval-gate works as before (default-path invariant)', async () => {
        const content = '---\nname: basic\ndescription: A basic skill\n---\n\n# Basic\n\nSimple body.';
        mkdirSync(join(dir, 'skills', 'basic'), { recursive: true });
        writeFileSync(join(dir, 'skills', 'basic', 'SKILL.md'), content);

        await seedEvals(adapter, 'skill', 'basic', [
            { aggregate: 0.5, dims: { clarity: 0.4, completeness: 0.6 }, createdAt: 1000 },
            { aggregate: 0.7, dims: { clarity: 0.6, completeness: 0.8 }, createdAt: 2000 },
        ]);

        // Without evalGate, evolve should work normally
        const r = await evolve('skill', 'skills/basic/SKILL.md', { adapter, proposeOnly: true });
        expect(r.proposalPath).toBeTruthy();
        expect(r.baselineScore).toBeGreaterThan(0);
    });
});

describe('finalizeApply', () => {
    let dir: string;

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'superskill-finalize-'));
    });

    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
    });

    it('persists the version snapshot and reports applied changes on a clean pass', async () => {
        const resolvedPath = join(dir, 'skill.md');
        const backupPath = join(dir, 'skill.md.bak');
        writeFileSync(resolvedPath, 'post-apply content');
        writeFileSync(backupPath, 'baseline content');

        const result = await finalizeApply(
            { postScore: 0.8, delta: 0.1 },
            backupPath,
            resolvedPath,
            'prop-001',
            0.7,
            2,
            '/tmp/prop.json',
        );

        expect(result).toEqual({
            baselineScore: 0.7,
            postScore: 0.8,
            delta: 0.1,
            changesApplied: 2,
            proposalPath: '/tmp/prop.json',
        });
        expect(readFileSync(`${resolvedPath}.version-prop-001`, 'utf-8')).toBe('baseline content');
    });

    it('does not touch the consumed backup on a gate rejection (no ENOENT crash)', async () => {
        // A gate rejection restores from the backup and DELETES it; the interactive
        // evolve path previously persisted the snapshot unconditionally and crashed
        // reading the deleted backup.
        const resolvedPath = join(dir, 'skill.md');
        const backupPath = join(dir, 'skill.md.bak'); // deliberately never created
        writeFileSync(resolvedPath, 'restored baseline');

        const result = await finalizeApply(
            { postScore: 0.7, delta: 0, rejected: true, reason: 'Δ-margin gate failed' },
            backupPath,
            resolvedPath,
            'prop-002',
            0.7,
            2,
            '',
        );

        expect(result.rejected).toBe(true);
        expect(result.rejectionReason).toBe('Δ-margin gate failed');
        expect(result.changesApplied).toBe(0);
        expect(existsSync(`${resolvedPath}.version-prop-002`)).toBe(false);
    });
});
