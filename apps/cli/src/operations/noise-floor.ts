import type { RubricRef } from '@gobing-ai/superskill-core';
import { type JudgeBackend, pairwiseJudge, signedMargin } from './pairwise-judge';

/**
 * Estimate the judge noise floor by replaying the same pairwise comparison and
 * measuring the standard deviation of signed margins. Direction matters:
 * candidate +0.8 and baseline +0.8 are far apart, not stable.
 */
export async function estimateNoiseFloor(
    judge: JudgeBackend,
    rubric: RubricRef,
    casePrompt: string,
    candOutput: string,
    baseOutput: string,
    n: number = 5,
): Promise<number> {
    const margins: number[] = [];
    for (let i = 0; i < n; i++) {
        const verdict = await pairwiseJudge(judge, rubric, casePrompt, candOutput, baseOutput, {
            seed: i + 1,
            temperature: 0,
        });
        margins.push(signedMargin(verdict));
    }

    if (margins.length < 2) return 0;

    const mean = margins.reduce((a, b) => a + b, 0) / margins.length;
    const variance = margins.reduce((sum, m) => sum + (m - mean) ** 2, 0) / margins.length;
    return Math.sqrt(variance);
}

/** Return true when the measured delta is indistinguishable from judge noise. */
export function rejectsWithinNoise(measuredDelta: number, noiseFloor: number): boolean {
    return Math.abs(measuredDelta) < noiseFloor;
}
