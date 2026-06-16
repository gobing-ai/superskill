import { describe, expect, it } from 'bun:test';
import type { TrendEntry } from '../../src/operations/evolve';
import { computeTrends, generateChanges, generateProposalId } from '../../src/operations/evolve';
import type { QualityReport } from '../../src/quality/dimensions';
import type { Evaluation, Proposal } from '../../src/store';

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
