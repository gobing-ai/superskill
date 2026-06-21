import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chdir, cwd } from 'node:process';
import type { QualityReport } from '@gobing-ai/superskill-core';
import { createDbAdapter, type DbAdapter } from '@gobing-ai/ts-db';
import type { ProposedChange, TrendEntry } from '../../src/operations/evolve';
import {
    computeTrends,
    evolve,
    generateChanges,
    generateProposalId,
    interactiveReview,
} from '../../src/operations/evolve';
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
