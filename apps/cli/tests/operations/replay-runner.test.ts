import { describe, expect, it } from 'bun:test';
import type { EvalCase } from '@gobing-ai/superskill-core';
import type { AiRunner } from '@gobing-ai/ts-ai-runner';
import {
    createReplayBackend,
    MockReplayBackend,
    replayCase,
    replaySplit,
    TsAiRunnerBackend,
} from '../../src/operations/replay-runner';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const exactCase: EvalCase = {
    id: 'greet-fr',
    split: 'train',
    prompt: 'Say hello in French',
    reference_kind: 'exact',
    reference: 'Bonjour',
};

const ruleCase: EvalCase = {
    id: 'color-check',
    split: 'holdout',
    prompt: 'List colors',
    reference_kind: 'rule',
    reference: {
        checks: [
            { op: 'contains', arg: 'red' },
            { op: 'not_contains', arg: 'purple' },
        ],
    },
};

const allCases: EvalCase[] = [
    exactCase,
    { ...exactCase, id: 'greet-es', split: 'holdout', reference: 'Hola' },
    ruleCase,
    {
        id: 'greet-jp',
        split: 'train',
        prompt: 'Say hello in Japanese',
        reference_kind: 'exact',
        reference: 'Konnichiwa',
    },
];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MockReplayBackend', () => {
    it('returns scripted output for a known case id', async () => {
        const backend = new MockReplayBackend({ 'greet-fr': 'Bonjour' });
        const result = await backend.run('skill text', '[case:greet-fr] Say hello');
        expect(result).toBe('Bonjour');
    });

    it('returns a default message for unknown case id', async () => {
        const backend = new MockReplayBackend({});
        const result = await backend.run('skill text', '[case:unknown] Test');
        expect(result).toContain('mock: no output');
    });

    it('handles prompt without case prefix (uses raw prompt)', async () => {
        const backend = new MockReplayBackend({ 'bare prompt': 'got it' });
        const result = await backend.run('skill text', 'bare prompt');
        expect(result).toBe('got it');
    });
});

describe('replayCase', () => {
    it('scores exact match 1.0 when output matches reference', async () => {
        const backend = new MockReplayBackend({ 'greet-fr': 'Bonjour' });
        const result = await replayCase(backend, 'skill text', exactCase);
        expect(result.hard).toBe(1.0);
        expect(result.output).toBe('Bonjour');
    });

    it('scores exact match 0.0 when output differs', async () => {
        const backend = new MockReplayBackend({ 'greet-fr': 'Guten Tag' });
        const result = await replayCase(backend, 'skill text', exactCase);
        expect(result.hard).toBe(0.0);
    });

    it('scores rule match 1.0 when all checks pass', async () => {
        const backend = new MockReplayBackend({ 'color-check': 'red blue green' });
        const result = await replayCase(backend, 'skill text', ruleCase);
        expect(result.hard).toBe(1.0);
    });

    it('scores rule match 0.0 when a check fails', async () => {
        const backend = new MockReplayBackend({ 'color-check': 'red purple green' });
        const result = await replayCase(backend, 'skill text', ruleCase);
        expect(result.hard).toBe(0.0);
    });

    it('prefixes prompt with [case:<id>] for mock extraction', async () => {
        // We spy to verify the prefix is added — the mock extracts it
        const backend = new MockReplayBackend({ 'greet-fr': 'Bonjour' });
        const result = await replayCase(backend, 'skill text', exactCase);
        // The mock returns the output matching greet-fr, which proves
        // the prefix was correctly extracted
        expect(result.output).toBe('Bonjour');
    });
});

describe('replaySplit', () => {
    it('replays only holdout cases', async () => {
        const backend = new MockReplayBackend({
            'greet-es': 'Hola',
            'color-check': 'red blue green',
        });
        const result = await replaySplit(backend, 'skill text', allCases, 'holdout');
        expect(result.n).toBe(2);
    });

    it('replays only train cases', async () => {
        const backend = new MockReplayBackend({
            'greet-fr': 'Bonjour',
            'greet-jp': 'Konnichiwa',
        });
        const result = await replaySplit(backend, 'skill text', allCases, 'train');
        expect(result.n).toBe(2);
    });

    it('returns 0.0 hard for empty split', async () => {
        const backend = new MockReplayBackend({});
        const result = await replaySplit(backend, 'skill text', [], 'holdout');
        expect(result.hard).toBe(0.0);
        expect(result.n).toBe(0);
    });

    it('aggregates scores correctly', async () => {
        const backend = new MockReplayBackend({
            'greet-es': 'Hola', // matches
            'color-check': 'wrong output', // fails rule check
        });
        const result = await replaySplit(backend, 'skill text', allCases, 'holdout');
        expect(result.hard).toBe(0.5); // 1 match, 1 fail → 0.5
    });

    it('returns 1.0 when all cases match', async () => {
        const backend = new MockReplayBackend({
            'greet-es': 'Hola',
            'color-check': 'red blue green',
        });
        const result = await replaySplit(backend, 'skill text', allCases, 'holdout');
        expect(result.hard).toBe(1.0);
    });
});

// ── TsAiRunnerBackend (DI seam) ────────────────────────────────────────────

/** Minimal stub matching the `AiRunner.runPromptCommand` signature. */
interface RunnerStub {
    runPromptCommand(
        agent: string,
        opts: { input: string; systemPrompt: string },
    ): Promise<{ exitCode: number | null; stdout: string; stderr: string; durationMs: number }>;
}

describe('TsAiRunnerBackend', () => {
    it('delegates to the injected runner and returns stdout', async () => {
        const stubRunner: RunnerStub = {
            runPromptCommand: async (_agent, opts) => ({
                exitCode: 0,
                stdout: `[system: ${opts.systemPrompt}] output for: ${opts.input}`,
                stderr: '',
                durationMs: 5,
            }),
        };
        const backend = new TsAiRunnerBackend('claude', stubRunner as unknown as AiRunner);

        const result = await backend.run('skill text', 'test prompt');
        expect(result).toBe('[system: skill text] output for: test prompt');
    });
});

describe('createReplayBackend', () => {
    it('uses an injected backend when provided', () => {
        const injected = new MockReplayBackend({ 'case-1': 'ok' });
        expect(createReplayBackend('claude', injected)).toBe(injected);
    });

    it('creates a ts-ai-runner backend for the requested target by default', () => {
        expect(createReplayBackend('codex')).toBeInstanceOf(TsAiRunnerBackend);
    });
});
