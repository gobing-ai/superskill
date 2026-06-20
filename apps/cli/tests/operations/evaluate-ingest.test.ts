import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDbAdapter } from '@gobing-ai/ts-db';
import { evaluate } from '../../src/operations/evaluate';
import { computeTrends } from '../../src/operations/evolve';
import type { Evaluation } from '../../src/store/evaluations';
import { EvaluationDao } from '../../src/store/evaluations';
import { evaluations } from '../../src/store/schema';

/** Assert non-null for evaluate() calls in heuristic mode (always returns a report). */
function notNull<T>(val: T | null): T {
    if (val === null) throw new Error('expected non-null, got null');
    return val;
}

/** Well-formed agent content for evaluate baseline. */
const GOOD_AGENT = `---
name: code-reviewer
description: Reviews code for quality issues and security vulnerabilities
model: claude-sonnet-4-20250514
tools:
  - read
  - grep
---

## IDENTITY
You are a senior code reviewer. You must review code for security, correctness, and maintainability.
Never skip verification steps. Always cite specific line numbers.

## When to Use
Trigger when the user asks to review code, PRs, or security audits.
`;

/** Valid scores JSON matching the agent rubric (5 dims, version 1). */
const VALID_AGENT_SCORES = {
    rubric_version: 1,
    dimensions: {
        completeness: { score: 0.85, note: 'All required sections present' },
        'role-clarity': { score: 0.9, note: 'Specific, non-generic persona' },
        'tool-selection': { score: 0.75, note: 'Good tool list' },
        'skill-linkage': { score: 0.8, note: 'References skills well' },
        'model-fit': { score: 0.7, note: 'Adequate model choice' },
    },
};

/** Compute expected weighted aggregate from rubric weights × scores. */
function expectedAggregate(scores: typeof VALID_AGENT_SCORES): number {
    // Agent rubric weights: completeness=0.20, role-clarity=0.25, tool-selection=0.20, skill-linkage=0.20, model-fit=0.15
    const weights: Record<string, number> = {
        completeness: 0.2,
        'role-clarity': 0.25,
        'tool-selection': 0.2,
        'skill-linkage': 0.2,
        'model-fit': 0.15,
    };
    let sum = 0;
    for (const [dim, { score }] of Object.entries(scores.dimensions)) {
        const weight = weights[dim];
        if (weight !== undefined) sum += score * weight;
    }
    return sum;
}

describe('scorer seam — envelope-out', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'superskill-envelope-'));
    });

    afterEach(() => {
        if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
    });

    it('emits envelope JSON with rubric, content, and baseline via stdout', async () => {
        const file = join(tmpDir, 'code-reviewer.md');
        writeFileSync(file, GOOD_AGENT);

        const stdoutCalls: string[] = [];
        const origWrite = process.stdout.write;
        process.stdout.write = vi.fn((chunk: string) => {
            stdoutCalls.push(chunk);
            return true;
        }) as typeof process.stdout.write;

        try {
            const result = await evaluate('agent', file, {
                rubric: 'packages/core/src/rubrics/agent.yaml',
                json: true,
            });
            expect(result).toBeNull();
        } finally {
            process.stdout.write = origWrite;
        }

        const envelope = JSON.parse(stdoutCalls.join(''));
        expect(envelope.type).toBe('agent');
        expect(envelope.content_name).toBe('code-reviewer');
        expect(envelope.target).toBe('claude');
        expect(envelope.content).toContain('## IDENTITY');
        expect(envelope.rubric.version).toBe(1);
        expect(envelope.rubric.type).toBe('agent');
        expect(envelope.rubric.dimensions).toHaveLength(5);
        expect(envelope.baseline).toBeDefined();
        expect(envelope.baseline.aggregate).toBeGreaterThanOrEqual(0);
        expect(envelope.baseline.dimensions).toBeDefined();
    });

    it('does not write to the store in envelope-out mode', async () => {
        const file = join(tmpDir, 'code-reviewer.md');
        writeFileSync(file, GOOD_AGENT);

        const adapter = await createDbAdapter({ driver: 'bun-sqlite', url: ':memory:' });
        await adapter.exec(evaluations.createTableSql);

        const origWrite = process.stdout.write;
        process.stdout.write = vi.fn(() => true) as typeof process.stdout.write;
        try {
            await evaluate('agent', file, {
                rubric: 'packages/core/src/rubrics/agent.yaml',
                json: true,
                save: true,
                adapter,
            });
        } finally {
            process.stdout.write = origWrite;
        }

        const dao = new EvaluationDao(adapter);
        const rows = await dao.getEvaluations('agent', 'code-reviewer');
        expect(rows).toHaveLength(0);
    });
});

describe('scorer seam — ingest-in', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'superskill-ingest-'));
    });

    afterEach(() => {
        if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
    });

    it('validates and persists rubric-scored evaluation with scorer=rubric', async () => {
        const file = join(tmpDir, 'code-reviewer.md');
        writeFileSync(file, GOOD_AGENT);
        const scoresFile = join(tmpDir, 'scores.json');
        writeFileSync(scoresFile, JSON.stringify(VALID_AGENT_SCORES, null, 2));

        const adapter = await createDbAdapter({ driver: 'bun-sqlite', url: ':memory:' });
        await adapter.exec(evaluations.createTableSql);

        const report = await evaluate('agent', file, {
            ingest: scoresFile,
            save: true,
            adapter,
        });

        expect(report).not.toBeNull();
        if (!report) return;

        expect(report.type).toBe('agent');
        expect(report.aggregate).toBeCloseTo(expectedAggregate(VALID_AGENT_SCORES), 5);
        expect(report.dimensions).toHaveProperty('completeness');
        expect(report.dimensions.completeness?.score).toBe(0.85);

        const dao = new EvaluationDao(adapter);
        const rows = await dao.getEvaluations('agent', 'code-reviewer');
        expect(rows).toHaveLength(1);
        expect(rows[0]?.scorer).toBe('rubric');
        expect(rows[0]?.rubric_version).toBe(1);
        expect(rows[0]?.aggregate).toBeCloseTo(expectedAggregate(VALID_AGENT_SCORES), 5);
    });

    it('rejects missing dimension in scores — exit 1, no row inserted', async () => {
        const file = join(tmpDir, 'code-reviewer.md');
        writeFileSync(file, GOOD_AGENT);
        const badScores = {
            rubric_version: 1,
            dimensions: {
                completeness: { score: 0.85, note: 'present' },
                'role-clarity': { score: 0.9, note: 'present' },
                // missing: tool-selection, skill-linkage, model-fit
            },
        };
        const scoresFile = join(tmpDir, 'bad-scores.json');
        writeFileSync(scoresFile, JSON.stringify(badScores));

        const adapter = await createDbAdapter({ driver: 'bun-sqlite', url: ':memory:' });
        await adapter.exec(evaluations.createTableSql);

        await expect(evaluate('agent', file, { ingest: scoresFile, save: true, adapter })).rejects.toThrow(
            /Missing dimension/,
        );

        const dao = new EvaluationDao(adapter);
        const rows = await dao.getEvaluations('agent', 'code-reviewer');
        expect(rows).toHaveLength(0);
    });

    it('rejects out-of-range score — exit 1, no row inserted', async () => {
        const file = join(tmpDir, 'code-reviewer.md');
        writeFileSync(file, GOOD_AGENT);
        const badScores = {
            rubric_version: 1,
            dimensions: {
                completeness: { score: 1.5, note: 'out of range' },
                'role-clarity': { score: 0.9, note: 'ok' },
                'tool-selection': { score: 0.75, note: 'ok' },
                'skill-linkage': { score: 0.8, note: 'ok' },
                'model-fit': { score: 0.7, note: 'ok' },
            },
        };
        const scoresFile = join(tmpDir, 'bad-scores.json');
        writeFileSync(scoresFile, JSON.stringify(badScores));

        const adapter = await createDbAdapter({ driver: 'bun-sqlite', url: ':memory:' });
        await adapter.exec(evaluations.createTableSql);

        await expect(evaluate('agent', file, { ingest: scoresFile, save: true, adapter })).rejects.toThrow(
            /out of range/,
        );

        const dao = new EvaluationDao(adapter);
        const rows = await dao.getEvaluations('agent', 'code-reviewer');
        expect(rows).toHaveLength(0);
    });

    it('rejects rubric_version mismatch — exit 1, no row inserted', async () => {
        const file = join(tmpDir, 'code-reviewer.md');
        writeFileSync(file, GOOD_AGENT);
        const badScores = {
            rubric_version: 99,
            dimensions: VALID_AGENT_SCORES.dimensions,
        };
        const scoresFile = join(tmpDir, 'bad-scores.json');
        writeFileSync(scoresFile, JSON.stringify(badScores));

        const adapter = await createDbAdapter({ driver: 'bun-sqlite', url: ':memory:' });
        await adapter.exec(evaluations.createTableSql);

        await expect(evaluate('agent', file, { ingest: scoresFile, save: true, adapter })).rejects.toThrow(
            /rubric_version mismatch/,
        );

        const dao = new EvaluationDao(adapter);
        const rows = await dao.getEvaluations('agent', 'code-reviewer');
        expect(rows).toHaveLength(0);
    });

    it('rejects unexpected dimension in scores', async () => {
        const file = join(tmpDir, 'code-reviewer.md');
        writeFileSync(file, GOOD_AGENT);
        const badScores = {
            rubric_version: 1,
            dimensions: {
                ...VALID_AGENT_SCORES.dimensions,
                'nonexistent-dim': { score: 0.5, note: 'extra' },
            },
        };
        const scoresFile = join(tmpDir, 'bad-scores.json');
        writeFileSync(scoresFile, JSON.stringify(badScores));

        const adapter = await createDbAdapter({ driver: 'bun-sqlite', url: ':memory:' });
        await adapter.exec(evaluations.createTableSql);

        await expect(evaluate('agent', file, { ingest: scoresFile, save: true, adapter })).rejects.toThrow(
            /Unexpected dimension/,
        );

        const dao = new EvaluationDao(adapter);
        const rows = await dao.getEvaluations('agent', 'code-reviewer');
        expect(rows).toHaveLength(0);
    });
});

describe('scorer seam — version-aware trends', () => {
    it('does not compare scores across different rubric versions', () => {
        const baseEval = {
            content_type: 'agent',
            content_name: 'test-agent',
            target_agent: 'claude',
            operation: 'evaluate' as const,
            aggregate: 0.5,
            dimensions: {},
            file_hash: undefined,
            scorer: undefined,
            rubric_version: undefined,
            id: 0,
            created_at: 0,
        };

        const evals: Evaluation[] = [
            {
                ...baseEval,
                id: 1,
                created_at: 1000,
                aggregate: 0.8,
                rubric_version: 1,
                scorer: 'rubric',
                dimensions: { clarity: { score: 0.8, note: '' } },
            },
            {
                ...baseEval,
                id: 2,
                created_at: 2000,
                aggregate: 0.6,
                rubric_version: 2,
                scorer: 'rubric',
                dimensions: { clarity: { score: 0.6, note: '' } },
            },
        ];

        const trends = computeTrends(evals);

        // With a version boundary, each version partition has only 1 eval → no trends computed
        // (need ≥2 per partition). So trends should be empty — no false regression.
        expect(trends).toHaveLength(0);
    });

    it('computes trends within the same rubric version', () => {
        const baseEval = {
            content_type: 'agent',
            content_name: 'test-agent',
            target_agent: 'claude',
            operation: 'evaluate' as const,
            aggregate: 0.5,
            dimensions: {},
            file_hash: undefined,
            scorer: undefined,
            rubric_version: undefined,
            id: 0,
            created_at: 0,
        };

        const evals: Evaluation[] = [
            {
                ...baseEval,
                id: 1,
                created_at: 1000,
                aggregate: 0.6,
                rubric_version: 1,
                scorer: 'rubric',
                dimensions: { clarity: { score: 0.6, note: '' } },
            },
            {
                ...baseEval,
                id: 2,
                created_at: 2000,
                aggregate: 0.8,
                rubric_version: 1,
                scorer: 'rubric',
                dimensions: { clarity: { score: 0.8, note: '' } },
            },
        ];

        const trends = computeTrends(evals);
        expect(trends).toHaveLength(1);
        expect(trends[0]?.dimension).toBe('clarity');
        expect(trends[0]?.earliest).toBe(0.6);
        expect(trends[0]?.latest).toBe(0.8);
        expect(trends[0]?.trend).toBe('improving');
        // Single version partition → no version_boundary flag
        expect(trends[0]?.version_boundary).toBeUndefined();
    });

    it('flags version_boundary when multiple versions exist with enough data', () => {
        const baseEval = {
            content_type: 'agent',
            content_name: 'test-agent',
            target_agent: 'claude',
            operation: 'evaluate' as const,
            aggregate: 0.5,
            dimensions: {},
            file_hash: undefined,
            scorer: undefined,
            rubric_version: undefined,
            id: 0,
            created_at: 0,
        };

        const evals: Evaluation[] = [
            {
                ...baseEval,
                id: 1,
                created_at: 1000,
                aggregate: 0.6,
                rubric_version: 1,
                scorer: 'rubric',
                dimensions: { clarity: { score: 0.6, note: '' } },
            },
            {
                ...baseEval,
                id: 2,
                created_at: 2000,
                aggregate: 0.8,
                rubric_version: 1,
                scorer: 'rubric',
                dimensions: { clarity: { score: 0.8, note: '' } },
            },
            {
                ...baseEval,
                id: 3,
                created_at: 3000,
                aggregate: 0.5,
                rubric_version: 2,
                scorer: 'rubric',
                dimensions: { clarity: { score: 0.5, note: '' } },
            },
            {
                ...baseEval,
                id: 4,
                created_at: 4000,
                aggregate: 0.7,
                rubric_version: 2,
                scorer: 'rubric',
                dimensions: { clarity: { score: 0.7, note: '' } },
            },
        ];

        const trends = computeTrends(evals);
        expect(trends).toHaveLength(2);
        // Both entries should have version_boundary=true
        expect(trends.every((t) => t.version_boundary === true)).toBe(true);
        // v1 trend: 0.6 → 0.8 (improving)
        // v2 trend: 0.5 → 0.7 (improving)
        // No cross-version comparison
    });

    it('separates heuristic (null rubric_version) from rubric version groups', () => {
        const baseEval = {
            content_type: 'agent',
            content_name: 'test-agent',
            target_agent: 'claude',
            operation: 'evaluate' as const,
            aggregate: 0.5,
            dimensions: {},
            file_hash: undefined,
            scorer: undefined,
            rubric_version: undefined,
            id: 0,
            created_at: 0,
        };

        const evals: Evaluation[] = [
            {
                ...baseEval,
                id: 1,
                created_at: 1000,
                aggregate: 0.4,
                scorer: 'heuristic',
                dimensions: { clarity: { score: 0.4, note: '' } },
            },
            {
                ...baseEval,
                id: 2,
                created_at: 2000,
                aggregate: 0.6,
                scorer: 'heuristic',
                dimensions: { clarity: { score: 0.6, note: '' } },
            },
            {
                ...baseEval,
                id: 3,
                created_at: 3000,
                aggregate: 0.8,
                rubric_version: 1,
                scorer: 'rubric',
                dimensions: { clarity: { score: 0.8, note: '' } },
            },
            {
                ...baseEval,
                id: 4,
                created_at: 4000,
                aggregate: 0.9,
                rubric_version: 1,
                scorer: 'rubric',
                dimensions: { clarity: { score: 0.9, note: '' } },
            },
        ];

        const trends = computeTrends(evals);
        expect(trends).toHaveLength(2);
        expect(trends.every((t) => t.version_boundary === true)).toBe(true);
        // heuristic group: 0.4 → 0.6 (improving)
        // rubric v1 group: 0.8 → 0.9 (flat, delta < 0.05)
    });
});

describe('scorer seam — heuristic path unchanged', () => {
    it('heuristic evaluate still returns equal-weighted aggregate and scorer=heuristic on save', async () => {
        const tmpDir = mkdtempSync(join(tmpdir(), 'superskill-heuristic-'));
        try {
            const file = join(tmpDir, 'test-agent.md');
            writeFileSync(file, GOOD_AGENT);

            const adapter = await createDbAdapter({ driver: 'bun-sqlite', url: ':memory:' });
            await adapter.exec(evaluations.createTableSql);

            const report = notNull(await evaluate('agent', file, { save: true, adapter }));

            // Heuristic path returns a real report (not null)
            expect(report.aggregate).toBeGreaterThanOrEqual(0);
            expect(report.dimensions).toBeDefined();

            // Store row has scorer='heuristic', rubric_version=null
            const dao = new EvaluationDao(adapter);
            const rows = await dao.getEvaluations('agent', 'test-agent');
            expect(rows).toHaveLength(1);
            expect(rows[0]?.scorer).toBe('heuristic');
            expect(rows[0]?.rubric_version).toBeUndefined();
        } finally {
            rmSync(tmpDir, { recursive: true, force: true });
        }
    });
});
