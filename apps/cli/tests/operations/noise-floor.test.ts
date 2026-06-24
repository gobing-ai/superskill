import { describe, expect, it } from 'bun:test';
import type { RubricRef } from '@gobing-ai/superskill-core';
import { estimateNoiseFloor, rejectsWithinNoise } from '../../src/operations/noise-floor';
import type { JudgeBackend } from '../../src/operations/pairwise-judge';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const clarityRubric: RubricRef = {
    criterion: 'Clarity',
    excellent: 'Clear',
    poor: 'Confusing',
};

/** Stable judge: always returns the same verdict. */
function stableJudge(): JudgeBackend {
    return {
        judge: async () => ({ winner: 'candidate' as const, margin: 0.8 }),
    };
}

/** Flip-flopping judge: alternates between verdicts. */
function flipFloppingJudge(): JudgeBackend {
    let callCount = 0;
    return {
        judge: async () => {
            callCount++;
            const replayIndex = Math.ceil(callCount / 2);
            if (replayIndex % 2 === 0) {
                return { winner: 'candidate' as const, margin: 0.8 };
            }
            return { winner: 'baseline' as const, margin: 0.8 };
        },
    };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('estimateNoiseFloor', () => {
    it('returns low noise floor for a stable judge', async () => {
        const judge = stableJudge();
        const floor = await estimateNoiseFloor(judge, clarityRubric, 'prompt', 'cand', 'base', 10);
        // Stable judge always returns margin 0.8 → std-dev = 0
        expect(floor).toBeLessThan(1e-10);
    });

    it('returns high noise floor for a flip-flopping judge', async () => {
        const judge = flipFloppingJudge();
        const floor = await estimateNoiseFloor(judge, clarityRubric, 'prompt', 'cand', 'base', 10);
        // Alternating signed margins -0.8 and +0.8 must be noisy even with identical absolute margins.
        expect(floor).toBeGreaterThan(0.7);
    });

    it('returns 0 for n < 2', async () => {
        const judge = stableJudge();
        const floor = await estimateNoiseFloor(judge, clarityRubric, 'prompt', 'cand', 'base', 1);
        expect(floor).toBe(0);
    });
});

describe('rejectsWithinNoise', () => {
    it('rejects a small delta under a high noise floor', () => {
        expect(rejectsWithinNoise(0.1, 0.5)).toBe(true);
    });

    it('does not reject a large delta above a low noise floor', () => {
        expect(rejectsWithinNoise(0.8, 0.1)).toBe(false);
    });

    it('rejects exactly-at-noise-floor', () => {
        // |0.3| < 0.3 → false (not strictly less than)
        expect(rejectsWithinNoise(0.3, 0.3)).toBe(false);
    });

    it('rejects just-below-noise-floor', () => {
        // |0.29| < 0.3 → true
        expect(rejectsWithinNoise(0.29, 0.3)).toBe(true);
    });

    it('handles negative deltas', () => {
        // |-0.2| < 0.5 → true
        expect(rejectsWithinNoise(-0.2, 0.5)).toBe(true);
    });
});
