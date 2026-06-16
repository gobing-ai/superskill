import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { createDbAdapter, type DbAdapter } from '@gobing-ai/ts-db';
import type { EvaluationInput } from '../../src/store/evaluations';
import { EvaluationDao } from '../../src/store/evaluations';
import { evaluations } from '../../src/store/schema';

/** Helper: create an in-memory store and run table DDL. */
async function createTestStore(): Promise<DbAdapter> {
    const adapter = await createDbAdapter({ driver: 'bun-sqlite', url: ':memory:' });
    await adapter.exec(evaluations.createTableSql);
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
