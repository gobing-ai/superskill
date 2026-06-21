import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { loadRubric, RubricError, RubricSchema } from '../../src/quality/rubric';
import { type ContentType, DIMENSION_REGISTRY } from '../../src/quality/types';

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** Temp dir for test fixtures (invalid rubrics + user-override simulation). */
const TMP_DIR = join(import.meta.dir, '..', '..', 'tmp-rubric-tests');

/** Valid rubric used as a base for mutation in validation tests. */
const validAgentRubric = `version: 1
type: agent
dimensions:
  - name: completeness
    weight: 0.20
    criterion: Agent covers scope end-to-end.
  - name: role-clarity
    weight: 0.25
    criterion: Specific non-generic persona.
  - name: tool-selection
    weight: 0.20
    criterion: Tool choices match task.
  - name: skill-linkage
    weight: 0.20
    criterion: Right skills at right time.
  - name: model-fit
    weight: 0.15
    criterion: Model tier fits cognitive load.
`;

/** Rubric with an unknown dimension name (not in DIMENSION_REGISTRY['agent']). */
const unknownDimRubric = `version: 1
type: agent
dimensions:
  - name: completeness
    weight: 0.50
    criterion: Valid dim.
  - name: nonexistent-dimension
    weight: 0.50
    criterion: This dim does not exist in the registry.
`;

/** Rubric where weights sum to 0.8 instead of 1.0. */
const badWeightsRubric = `version: 1
type: agent
dimensions:
  - name: completeness
    weight: 0.40
    criterion: Valid dim.
  - name: role-clarity
    weight: 0.40
    criterion: Valid dim.
`;

/** Rubric missing the version field. */
const missingVersionRubric = `type: agent
dimensions:
  - name: completeness
    weight: 1.0
    criterion: Valid dim.
`;

/** Path to a fixture file. */
function fixturePath(name: string): string {
    return join(TMP_DIR, name);
}

/** Write a fixture file and return its path. */
function writeFixture(name: string, content: string): string {
    const p = fixturePath(name);
    writeFileSync(p, content, 'utf-8');
    return p;
}

// ── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(() => {
    mkdirSync(TMP_DIR, { recursive: true });
});

afterAll(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
});

// ── Package defaults ─────────────────────────────────────────────────────────

describe('package defaults', () => {
    const types: ContentType[] = ['agent', 'skill', 'command', 'hook', 'magent'];

    for (const type of types) {
        it(`loadRubric("${type}") loads and validates the package default`, () => {
            const rubric = loadRubric(type);
            expect(rubric.type).toBe(type);
            expect(rubric.version).toBeGreaterThanOrEqual(1);
            expect(rubric.dimensions.length).toBeGreaterThan(0);
        });
    }

    it('every default dimension name is a DIMENSION_REGISTRY key for its type', () => {
        for (const type of types) {
            const rubric = loadRubric(type);
            const allowed = DIMENSION_REGISTRY[type];
            for (const dim of rubric.dimensions) {
                expect(allowed).toContain(dim.name);
            }
            // Every registry key should have a rubric dimension (1:1 coverage)
            expect(rubric.dimensions.map((d) => d.name).sort()).toEqual([...allowed].sort());
        }
    });

    it('every default has weights summing to 1.0 (±0.001)', () => {
        for (const type of types) {
            const rubric = loadRubric(type);
            const sum = rubric.dimensions.reduce((acc, d) => acc + d.weight, 0);
            expect(Math.abs(sum - 1.0)).toBeLessThanOrEqual(0.001);
        }
    });
});

// ── Resolution order ─────────────────────────────────────────────────────────

describe('resolution order', () => {
    it('explicit path takes highest priority', () => {
        const explicitPath = writeFixture('explicit-agent.yaml', validAgentRubric);
        const rubric = loadRubric('agent', { path: explicitPath });
        expect(rubric.version).toBe(1);
        expect(rubric.type).toBe('agent');
    });

    it('explicit path wins over user override', () => {
        const homeDir = process.env.HOME ?? homedir();
        const userRubricDir = join(homeDir, '.superskill', 'rubrics');
        const userRubricPath = join(userRubricDir, 'agent.yaml');
        const userExisted = existsSync(userRubricPath);
        const userContent =
            'version: 99\ntype: agent\ndimensions:\n  - name: completeness\n    weight: 1.0\n    criterion: user override\n';

        const explicitPath = writeFixture('explicit-over-user.yaml', validAgentRubric);

        try {
            if (!userExisted) {
                mkdirSync(userRubricDir, { recursive: true });
                writeFileSync(userRubricPath, userContent, 'utf-8');
            }
            // Explicit path should win — version 1, not 99
            const rubric = loadRubric('agent', { path: explicitPath });
            expect(rubric.version).toBe(1);
        } finally {
            if (!userExisted && existsSync(userRubricPath)) {
                rmSync(userRubricPath);
            }
        }
    });

    it('explicit path not found throws RubricError with field=path', () => {
        const bogusPath = join(TMP_DIR, 'does-not-exist.yaml');
        expect(() => loadRubric('agent', { path: bogusPath })).toThrow(RubricError);
        try {
            loadRubric('agent', { path: bogusPath });
        } catch (e) {
            expect(e).toBeInstanceOf(RubricError);
            expect((e as RubricError).field).toBe('path');
        }
    });

    it('user override wins over package default', () => {
        const homeDir = process.env.HOME ?? homedir();
        const userRubricDir = join(homeDir, '.superskill', 'rubrics');
        const userRubricPath = join(userRubricDir, 'agent.yaml');
        const userExisted = existsSync(userRubricPath);
        const userContent =
            'version: 42\ntype: agent\ndimensions:\n  - name: completeness\n    weight: 1.0\n    criterion: user override wins\n';

        try {
            if (!userExisted) {
                mkdirSync(userRubricDir, { recursive: true });
                writeFileSync(userRubricPath, userContent, 'utf-8');
            }
            const rubric = loadRubric('agent');
            expect(rubric.version).toBe(42);
        } finally {
            if (!userExisted && existsSync(userRubricPath)) {
                rmSync(userRubricPath);
            }
        }
    });
});

// ── Validation errors ────────────────────────────────────────────────────────

describe('validation errors', () => {
    it('unknown dimension name throws RubricError naming the dimension field', () => {
        const path = writeFixture('unknown-dim.yaml', unknownDimRubric);
        expect(() => loadRubric('agent', { path })).toThrow(RubricError);
        try {
            loadRubric('agent', { path });
        } catch (e) {
            expect(e).toBeInstanceOf(RubricError);
            expect((e as RubricError).field).toContain('dimensions[');
            expect((e as RubricError).field).toContain('.name');
            expect((e as RubricError).actual).toBe('nonexistent-dimension');
        }
    });

    it('weights summing to 0.8 throws RubricError naming weights.sum', () => {
        const path = writeFixture('bad-weights.yaml', badWeightsRubric);
        expect(() => loadRubric('agent', { path })).toThrow(RubricError);
        try {
            loadRubric('agent', { path });
        } catch (e) {
            expect(e).toBeInstanceOf(RubricError);
            expect((e as RubricError).field).toBe('weights.sum');
            expect((e as RubricError).actual).toBe(0.8);
        }
    });

    it('missing version throws RubricError', () => {
        const path = writeFixture('missing-version.yaml', missingVersionRubric);
        expect(() => loadRubric('agent', { path })).toThrow(RubricError);
        try {
            loadRubric('agent', { path });
        } catch (e) {
            expect(e).toBeInstanceOf(RubricError);
            // version is caught by zod schema — field is the zod path
            expect((e as RubricError).field).toContain('version');
        }
    });

    it('weights within tolerance (0.9995) are accepted', () => {
        const withinTolerance = `version: 1
type: agent
dimensions:
  - name: completeness
    weight: 0.9995
    criterion: Within tolerance of 1.0.
  - name: role-clarity
    weight: 0.0005
    criterion: Tiny weight, sum is 1.0 exactly.
`;
        const path = writeFixture('within-tolerance.yaml', withinTolerance);
        expect(() => loadRubric('agent', { path })).not.toThrow();
    });

    it('malformed YAML throws RubricError with field=yaml', () => {
        const path = writeFixture('malformed.yaml', 'version: 1\ntype: agent\ndimensions: [unclosed');
        expect(() => loadRubric('agent', { path })).toThrow(RubricError);
        try {
            loadRubric('agent', { path });
        } catch (e) {
            expect(e).toBeInstanceOf(RubricError);
            expect((e as RubricError).field).toBe('yaml');
        }
    });
});

// ── Schema export ────────────────────────────────────────────────────────────

describe('RubricSchema', () => {
    it('validates a correct rubric shape', () => {
        const valid = {
            version: 1,
            type: 'agent',
            dimensions: [{ name: 'completeness', weight: 1.0, criterion: 'test' }],
        };
        expect(RubricSchema.safeParse(valid).success).toBe(true);
    });

    it('rejects version 0', () => {
        const invalid = { version: 0, type: 'agent', dimensions: [{ name: 'x', weight: 1.0, criterion: 'y' }] };
        expect(RubricSchema.safeParse(invalid).success).toBe(false);
    });

    it('rejects unknown type', () => {
        const invalid = { version: 1, type: 'unknown', dimensions: [{ name: 'x', weight: 1.0, criterion: 'y' }] };
        expect(RubricSchema.safeParse(invalid).success).toBe(false);
    });

    it('rejects empty dimensions array', () => {
        const invalid = { version: 1, type: 'agent', dimensions: [] };
        expect(RubricSchema.safeParse(invalid).success).toBe(false);
    });
});

// ── Weighted aggregate tests ───────────────────────────────────────────────────

describe('weighted aggregate', () => {
    it('agent rubric weights produce different result from equal-weight mean', () => {
        const rubric = loadRubric('agent');
        // 5 dimensions with different scores; role-clarity (weight 0.25) dominates
        const scores: Record<string, { score: number }> = {
            completeness: { score: 1.0 },
            'role-clarity': { score: 0.5 },
            'tool-selection': { score: 1.0 },
            'skill-linkage': { score: 1.0 },
            'model-fit': { score: 1.0 },
        };

        // Equal-weight: (1.0+0.5+1.0+1.0+1.0)/5 = 0.90
        const equalWeight = Object.values(scores).reduce((a, s) => a + s.score, 0) / 5;
        expect(equalWeight).toBeCloseTo(0.9, 2);

        // Weighted: 0.20*1.0 + 0.25*0.5 + 0.20*1.0 + 0.20*1.0 + 0.15*1.0
        // = 0.20 + 0.125 + 0.20 + 0.20 + 0.15 = 0.875
        let weightedSum = 0;
        for (const dim of rubric.dimensions) {
            const entry = scores[dim.name];
            if (entry) weightedSum += entry.score * dim.weight;
        }
        expect(weightedSum).toBeCloseTo(0.875, 2);

        // Weighted ≠ equal-weight (role-clarity weight dominance pulls it down)
        expect(weightedSum).not.toBeCloseTo(equalWeight, 2);
    });

    it('agent rubric weights: role-clarity dominates (0.25)', () => {
        const rubric = loadRubric('agent');
        const rcd = rubric.dimensions.find((d) => d.name === 'role-clarity');
        expect(rcd).toBeDefined();
        expect(rcd?.weight).toBe(0.25);

        // Verify no other dimension exceeds role-clarity
        for (const dim of rubric.dimensions) {
            expect(dim.weight).toBeLessThanOrEqual(0.25);
        }
    });

    it('all default rubrics compute stable weighted aggregates', () => {
        const types: ContentType[] = ['agent', 'skill', 'command', 'hook', 'magent'];
        for (const type of types) {
            const rubric = loadRubric(type);
            const allOnes: Record<string, { score: number }> = {};
            for (const dim of rubric.dimensions) allOnes[dim.name] = { score: 1.0 };
            let weightedSum = 0;
            for (const dim of rubric.dimensions) {
                weightedSum += (allOnes[dim.name]?.score ?? 0) * dim.weight;
            }
            // All-1.0 should yield 1.0 since weights sum to 1.0
            expect(weightedSum).toBeCloseTo(1.0, 2);
        }
    });
});
