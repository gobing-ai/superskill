import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { createDbAdapter, type DbAdapter } from '@gobing-ai/ts-db';
import type { ProposalInput } from '../../src/store/proposals';
import { ProposalDao } from '../../src/store/proposals';
import { proposals } from '../../src/store/schema';

/** Helper: create an in-memory store and run table DDL. */
async function createTestStore(): Promise<DbAdapter> {
    const adapter = await createDbAdapter({ driver: 'bun-sqlite', url: ':memory:' });
    await adapter.exec(proposals.createTableSql);
    return adapter;
}

const sampleProposal: ProposalInput = {
    content_type: 'skill',
    content_name: 'test-skill',
    proposal_json: { changes: [{ kind: 'frontmatter', key: 'name', value: 'renamed' }] },
};

describe('ProposalDao', () => {
    let adapter: DbAdapter;
    let dao: ProposalDao;

    beforeEach(async () => {
        adapter = await createTestStore();
        dao = new ProposalDao(adapter);
    });

    afterEach(() => {
        vi.useRealTimers();
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

    it('updateProposalStatus returns undefined for nonexistent proposal id', async () => {
        await expect(dao.updateProposalStatus(9999, 'accepted')).resolves.toBeUndefined();
    });

    it('updateProposalStatus bumps updated_at', async () => {
        vi.useFakeTimers();
        const id = await dao.insertProposal(sampleProposal);
        const before = (await dao.getProposals('skill', 'test-skill'))[0]?.updated_at ?? 0;
        vi.advanceTimersByTime(10);
        const updated = await dao.updateProposalStatus(id, 'accepted');

        expect(updated?.updated_at).toBeGreaterThan(before);
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
