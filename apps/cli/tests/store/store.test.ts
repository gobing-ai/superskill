import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { createDbAdapter, type DbAdapter } from '@gobing-ai/ts-db';
import type { EvaluationInput } from '../../src/store/evaluations';
import { EvaluationDao } from '../../src/store/evaluations';
import type { ProposalInput } from '../../src/store/proposals';
import { ProposalDao } from '../../src/store/proposals';
import { evaluations, proposals } from '../../src/store/schema';

/** Helper: create an in-memory store and run table DDL. */
async function createTestStore(): Promise<DbAdapter> {
    const adapter = await createDbAdapter({ driver: 'bun-sqlite', url: ':memory:' });
    await adapter.exec(evaluations.createTableSql);
    await adapter.exec(proposals.createTableSql);
    return adapter;
}

const sampleEval: EvaluationInput = {
    content_type: 'skill',
    content_name: 'test-skill',
    target_agent: 'claude',
    operation: 'evaluate',
    aggregate: 0.85,
    dimensions: { completeness: { score: 0.9, note: 'good' }, clarity: { score: 0.8, note: 'ok' } },
};

const sampleProposal: ProposalInput = {
    content_type: 'skill',
    content_name: 'test-skill',
    proposal_json: { changes: [{ kind: 'frontmatter', key: 'name', value: 'renamed' }] },
};

describe('EvaluationDao', () => {
    let adapter: DbAdapter;
    let dao: EvaluationDao;

    beforeEach(async () => {
        adapter = await createTestStore();
        dao = new EvaluationDao(adapter);
    });

    it('inserts an evaluation and returns an id', async () => {
        const id = await dao.insertEvaluation(sampleEval);
        expect(id).toBeGreaterThan(0);
    });

    it('retrieves evaluations by content type and name', async () => {
        await dao.insertEvaluation(sampleEval);
        await dao.insertEvaluation({ ...sampleEval, aggregate: 0.9, file_hash: 'abc123' });

        const results = await dao.getEvaluations('skill', 'test-skill');
        expect(results).toHaveLength(2);
        expect(results[0]?.content_type).toBe('skill');
        expect(results[0]?.content_name).toBe('test-skill');
        expect(results[0]?.target_agent).toBe('claude');
    });

    it('returns evaluations ordered by created_at desc (newest first)', async () => {
        vi.useFakeTimers();
        await dao.insertEvaluation({ ...sampleEval, aggregate: 0.7 });
        vi.advanceTimersByTime(10);
        await dao.insertEvaluation({ ...sampleEval, aggregate: 0.9 });
        vi.useRealTimers();

        const results = await dao.getEvaluations('skill', 'test-skill');
        expect(results).toHaveLength(2);
        expect(results[0]?.aggregate).toBe(0.9);
        expect(results[1]?.aggregate).toBe(0.7);
    });

    it('deserializes dimensions from JSON', async () => {
        await dao.insertEvaluation(sampleEval);
        const results = await dao.getEvaluations('skill', 'test-skill');
        expect(results[0]?.dimensions).toEqual(sampleEval.dimensions);
    });

    it('handles file_hash as optional', async () => {
        const id = await dao.insertEvaluation({ ...sampleEval, file_hash: 'sha256hex' });
        expect(id).toBeGreaterThan(0);

        const results = await dao.getEvaluations('skill', 'test-skill');
        expect(results[0]?.file_hash).toBe('sha256hex');
    });

    it('handles file_hash as undefined', async () => {
        const id = await dao.insertEvaluation(sampleEval);
        expect(id).toBeGreaterThan(0);

        const results = await dao.getEvaluations('skill', 'test-skill');
        expect(results[0]?.file_hash).toBeUndefined();
    });

    it('getLatestEvaluation returns the most recent evaluation', async () => {
        vi.useFakeTimers();
        await dao.insertEvaluation({ ...sampleEval, aggregate: 0.6 });
        vi.advanceTimersByTime(10);
        await dao.insertEvaluation({ ...sampleEval, aggregate: 0.95 });
        vi.useRealTimers();

        const latest = await dao.getLatestEvaluation('skill', 'test-skill');
        expect(latest).not.toBeNull();
        expect(latest?.aggregate).toBe(0.95);
    });

    it('getLatestEvaluation returns null when no records', async () => {
        const latest = await dao.getLatestEvaluation('skill', 'nonexistent');
        expect(latest).toBeNull();
    });

    it('getEvaluations returns empty array when no records', async () => {
        const results = await dao.getEvaluations('skill', 'nonexistent');
        expect(results).toEqual([]);
    });

    it('filters by content_type and content_name independently', async () => {
        await dao.insertEvaluation({ ...sampleEval, content_type: 'command', content_name: 'deploy' });
        await dao.insertEvaluation(sampleEval);

        const skillResults = await dao.getEvaluations('skill', 'test-skill');
        expect(skillResults).toHaveLength(1);

        const cmdResults = await dao.getEvaluations('command', 'deploy');
        expect(cmdResults).toHaveLength(1);
    });

    it('propagates operation field', async () => {
        await dao.insertEvaluation({ ...sampleEval, operation: 'refine' });
        const results = await dao.getEvaluations('skill', 'test-skill');
        expect(results[0]?.operation).toBe('refine');
    });
});

describe('ProposalDao', () => {
    let adapter: DbAdapter;
    let dao: ProposalDao;

    beforeEach(async () => {
        adapter = await createTestStore();
        dao = new ProposalDao(adapter);
    });

    it('inserts a proposal with draft status', async () => {
        const id = await dao.insertProposal(sampleProposal);
        expect(id).toBeGreaterThan(0);

        const results = await dao.getProposals('skill', 'test-skill');
        expect(results).toHaveLength(1);
        expect(results[0]?.status).toBe('draft');
    });

    it('deserializes proposal_json from JSON', async () => {
        await dao.insertProposal(sampleProposal);
        const results = await dao.getProposals('skill', 'test-skill');
        expect(results[0]?.proposal_json).toEqual(sampleProposal.proposal_json);
    });

    it('updates proposal status', async () => {
        const id = await dao.insertProposal(sampleProposal);
        await dao.updateProposalStatus(id, 'accepted', { applied_at: '2026-06-16' });

        const results = await dao.getProposals('skill', 'test-skill');
        expect(results[0]?.status).toBe('accepted');
        expect(results[0]?.applied_at).toBe('2026-06-16');
    });

    it('updateProposalStatus sets optional verify_id', async () => {
        const id = await dao.insertProposal(sampleProposal);
        await dao.updateProposalStatus(id, 'rejected', { verify_id: 42 });

        const results = await dao.getProposals('skill', 'test-skill');
        expect(results[0]?.status).toBe('rejected');
        expect(results[0]?.verify_id).toBe(42);
    });

    it('getPendingProposals returns only draft proposals across all types', async () => {
        await dao.insertProposal(sampleProposal);
        await dao.insertProposal({
            content_type: 'command',
            content_name: 'deploy',
            proposal_json: { changes: [] },
        });

        const acceptedId = await dao.insertProposal({
            content_type: 'agent',
            content_name: 'reviewer',
            proposal_json: {},
        });
        await dao.updateProposalStatus(acceptedId, 'accepted');

        const pending = await dao.getPendingProposals();
        expect(pending).toHaveLength(2);
        expect(pending.every((p) => p.status === 'draft')).toBe(true);
    });

    it('getPendingProposals returns empty array when none', async () => {
        const pending = await dao.getPendingProposals();
        expect(pending).toEqual([]);
    });

    it('getProposals filters by content type and name', async () => {
        await dao.insertProposal(sampleProposal);
        await dao.insertProposal({
            content_type: 'command',
            content_name: 'deploy',
            proposal_json: {},
        });

        const skillResults = await dao.getProposals('skill', 'test-skill');
        expect(skillResults).toHaveLength(1);

        const cmdResults = await dao.getProposals('command', 'deploy');
        expect(cmdResults).toHaveLength(1);
    });

    it('handles baseline_id as optional', async () => {
        await dao.insertProposal({ ...sampleProposal, baseline_id: 5 });
        const results = await dao.getProposals('skill', 'test-skill');
        expect(results[0]?.baseline_id).toBe(5);
    });

    it('updates to rejected status', async () => {
        const id = await dao.insertProposal(sampleProposal);
        await dao.updateProposalStatus(id, 'rejected');

        const results = await dao.getProposals('skill', 'test-skill');
        expect(results[0]?.status).toBe('rejected');
    });
});
