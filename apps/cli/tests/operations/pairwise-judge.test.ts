import { describe, expect, it } from 'bun:test';
import type { RubricRef } from '@gobing-ai/superskill-core';
import {
    createJudgeBackend,
    deBias,
    type JudgeBackend,
    pairwiseJudge,
    ScriptedJudgeBackend,
    signedMargin,
    TsAiRunnerJudgeBackend,
} from '../../src/operations/pairwise-judge';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const clarityRubric: RubricRef = {
    criterion: 'Clarity of explanation',
    excellent: 'Crystal clear, step-by-step',
    poor: 'Confusing or circular',
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ScriptedJudgeBackend', () => {
    it('returns scripted verdict for a known case id', async () => {
        const backend = new ScriptedJudgeBackend({ clarity: { winner: 'candidate', margin: 0.8 } });
        const verdict = await backend.judge(clarityRubric, '[case:clarity] Explain', 'output A', 'output B');
        expect(verdict.winner).toBe('candidate');
        expect(verdict.margin).toBe(0.8);
    });

    it('returns order-specific verdict', async () => {
        const backend = new ScriptedJudgeBackend({
            'clarity:cb': { winner: 'candidate', margin: 0.9 },
            'clarity:bc': { winner: 'baseline', margin: 0.9 },
        });
        const v1 = await backend.judge(clarityRubric, '[case:clarity] Explain', 'Good', 'Bad', {
            order: 'candidate-first',
        });
        expect(v1.winner).toBe('candidate');
        const v2 = await backend.judge(clarityRubric, '[case:clarity] Explain', 'Good', 'Bad', {
            order: 'baseline-first',
        });
        expect(v2.winner).toBe('baseline');
    });

    it('returns tie default for unknown case id', async () => {
        const backend = new ScriptedJudgeBackend({});
        const verdict = await backend.judge(clarityRubric, 'unknown prompt', 'A', 'B');
        expect(verdict.winner).toBe('tie');
        expect(verdict.margin).toBe(0);
    });
});

describe('pairwiseJudge', () => {
    /** Content-aware judge: prefers whichever output contains 'Good'. */
    function contentJudge(): JudgeBackend {
        return {
            judge: async (_rubric, _prompt, candOutput, baseOutput) => {
                const aGood = candOutput.includes('Good');
                const bGood = baseOutput.includes('Good');
                if (aGood && !bGood) return { winner: 'candidate', margin: 0.9 };
                if (!aGood && bGood) return { winner: 'baseline', margin: 0.9 };
                return { winner: 'tie', margin: 0 };
            },
        };
    }

    it('returns candidate winner when candidate output is clearly better', async () => {
        const backend = contentJudge();
        const verdict = await pairwiseJudge(backend, clarityRubric, 'Explain', 'Good explanation', 'Bad explanation');
        expect(verdict.winner).toBe('candidate');
        expect(verdict.margin).toBe(0.9);
    });

    it('returns baseline winner when baseline is clearly better', async () => {
        const backend = contentJudge();
        const verdict = await pairwiseJudge(backend, clarityRubric, 'Explain', 'Bad explanation', 'Good explanation');
        expect(verdict.winner).toBe('baseline');
    });

    it('returns tie when outputs are equivalent', async () => {
        const backend = contentJudge();
        const verdict = await pairwiseJudge(backend, clarityRubric, 'Explain', 'Output A', 'Output B');
        expect(verdict.winner).toBe('tie');
    });

    it('order de-bias: clear winner is stable regardless of random position', async () => {
        const backend = contentJudge();
        const results: string[] = [];
        for (let i = 0; i < 20; i++) {
            const v = await pairwiseJudge(backend, clarityRubric, 'Explain', 'Good output', 'Bad output');
            results.push(v.winner);
        }
        expect(results.every((w) => w === 'candidate')).toBe(true);
    });
});

describe('deBias', () => {
    it('averages margins when both agree on winner', () => {
        const result = deBias({ winner: 'candidate', margin: 0.8 }, { winner: 'candidate', margin: 0.6 });
        expect(result.winner).toBe('candidate');
        expect(result.margin).toBe(0.7);
    });

    it('returns tie when one verdict is tie', () => {
        const result = deBias({ winner: 'candidate', margin: 0.8 }, { winner: 'tie', margin: 0 });
        expect(result.winner).toBe('tie');
    });

    it('returns tie when verdicts disagree on direction', () => {
        const result = deBias({ winner: 'candidate', margin: 0.8 }, { winner: 'baseline', margin: 0.8 });
        expect(result.winner).toBe('tie');
    });
});

describe('signedMargin', () => {
    it('preserves winner direction', () => {
        expect(signedMargin({ winner: 'candidate', margin: 0.6 })).toBe(0.6);
        expect(signedMargin({ winner: 'baseline', margin: 0.6 })).toBe(-0.6);
        expect(signedMargin({ winner: 'tie', margin: 0 })).toBe(0);
    });
});

describe('TsAiRunnerJudgeBackend', () => {
    it('delegates to the injected runner and maps A/B winners back to candidate/baseline', async () => {
        const calls: Array<{ input: string; seed?: number; temperature?: number }> = [];
        const runner = {
            runPromptCommand: async (_agent: string, opts: { input: string; seed?: number; temperature?: number }) => {
                calls.push(opts);
                return { stdout: '{"winner":"A","margin":0.75}', stderr: '', exitCode: 0 };
            },
        };
        const backend = new TsAiRunnerJudgeBackend('claude', runner as never);
        const forward = await backend.judge(clarityRubric, 'Explain', 'candidate text', 'baseline text', {
            order: 'candidate-first',
            seed: 7,
            temperature: 0,
        });
        const reverse = await backend.judge(clarityRubric, 'Explain', 'candidate text', 'baseline text', {
            order: 'baseline-first',
        });
        expect(forward).toEqual({ winner: 'candidate', margin: 0.75 });
        expect(reverse).toEqual({ winner: 'baseline', margin: 0.75 });
        expect(calls[0]?.seed).toBe(7);
        expect(calls[0]?.temperature).toBe(0);
        expect(calls[0]?.input).toContain('Output A:');
    });
});

describe('createJudgeBackend', () => {
    it('uses an injected backend when provided', () => {
        const injected = new ScriptedJudgeBackend();
        expect(createJudgeBackend('claude', injected)).toBe(injected);
    });

    it('creates a ts-ai-runner backend for the requested target by default', () => {
        expect(createJudgeBackend('codex')).toBeInstanceOf(TsAiRunnerJudgeBackend);
    });
});
