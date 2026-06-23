import { describe, expect, it } from 'bun:test';
import type { RuleJudge } from '../../src/quality/eval-cases';
import { aggregateHard, scoreExact, scoreRule } from '../../src/quality/replay';

describe('scoreExact', () => {
    it('returns 1.0 for exact match', () => {
        expect(scoreExact('Hello World', 'Hello World')).toBe(1.0);
    });

    it('returns 1.0 for case-insensitive match', () => {
        expect(scoreExact('HELLO WORLD', 'hello world')).toBe(1.0);
    });

    it('returns 1.0 for leading/trailing whitespace mismatch', () => {
        expect(scoreExact('  hello  ', 'hello')).toBe(1.0);
    });

    it('returns 1.0 for internal whitespace collapse', () => {
        expect(scoreExact('hello   world', 'hello world')).toBe(1.0);
    });

    it('returns 1.0 for substring match', () => {
        expect(scoreExact('The answer is hello world today', 'hello world')).toBe(1.0);
    });

    it('returns 0.0 for complete mismatch', () => {
        expect(scoreExact('apple', 'orange')).toBe(0.0);
    });

    it('returns 0.0 for close-but-different text (not a substring)', () => {
        expect(scoreExact('hello world', 'goodbye')).toBe(0.0);
    });
});

describe('scoreRule', () => {
    it('passes a single contains check', () => {
        const judge: RuleJudge = { checks: [{ op: 'contains', arg: 'success' }] };
        expect(scoreRule('operation success', judge)).toBe(1.0);
    });

    it('fails a single contains check', () => {
        const judge: RuleJudge = { checks: [{ op: 'contains', arg: 'failure' }] };
        expect(scoreRule('operation success', judge)).toBe(0.0);
    });

    it('requires ALL checks to pass', () => {
        const judge: RuleJudge = {
            checks: [
                { op: 'contains', arg: 'red' },
                { op: 'not_contains', arg: 'purple' },
            ],
        };
        expect(scoreRule('red blue green', judge)).toBe(1.0);
    });

    it('fails when one of multiple checks fails', () => {
        const judge: RuleJudge = {
            checks: [
                { op: 'contains', arg: 'red' },
                { op: 'contains', arg: 'purple' },
            ],
        };
        expect(scoreRule('red blue green', judge)).toBe(0.0);
    });

    it('passes regex check with valid pattern', () => {
        const judge: RuleJudge = { checks: [{ op: 'regex', arg: '^\\d{3}-\\d{4}$' }] };
        expect(scoreRule('123-4567', judge)).toBe(1.0);
    });

    it('fails regex check with non-matching pattern', () => {
        const judge: RuleJudge = { checks: [{ op: 'regex', arg: '^\\d{3}-\\d{4}$' }] };
        expect(scoreRule('abc-defg', judge)).toBe(0.0);
    });

    it('handles invalid regex gracefully (returns false)', () => {
        const judge: RuleJudge = { checks: [{ op: 'regex', arg: '[' }] };
        expect(scoreRule('anything', judge)).toBe(0.0);
    });

    it('passes equals check with normalized match', () => {
        const judge: RuleJudge = { checks: [{ op: 'equals', arg: 'hello world' }] };
        expect(scoreRule('  HELLO   WORLD  ', judge)).toBe(1.0);
    });

    it('fails equals check with different text', () => {
        const judge: RuleJudge = { checks: [{ op: 'equals', arg: 'hello world' }] };
        expect(scoreRule('goodbye world', judge)).toBe(0.0);
    });

    it('passes not_contains check', () => {
        const judge: RuleJudge = { checks: [{ op: 'not_contains', arg: 'error' }] };
        expect(scoreRule('all systems operational', judge)).toBe(1.0);
    });

    it('fails not_contains check when substring present', () => {
        const judge: RuleJudge = { checks: [{ op: 'not_contains', arg: 'error' }] };
        expect(scoreRule('ERROR: something broke', judge)).toBe(0.0);
    });

    it('passes tool_called check when tool in list', () => {
        const judge: RuleJudge = { checks: [{ op: 'tool_called', arg: 'read' }] };
        expect(scoreRule('some output', judge, ['read', 'write'])).toBe(1.0);
    });

    it('fails tool_called check when tool not in list', () => {
        const judge: RuleJudge = { checks: [{ op: 'tool_called', arg: 'delete' }] };
        expect(scoreRule('some output', judge, ['read', 'write'])).toBe(0.0);
    });

    it('fails tool_called check when toolsCalled is undefined', () => {
        const judge: RuleJudge = { checks: [{ op: 'tool_called', arg: 'read' }] };
        expect(scoreRule('some output', judge)).toBe(0.0);
    });

    it('passes case-insensitive contains', () => {
        const judge: RuleJudge = { checks: [{ op: 'contains', arg: 'SUCCESS' }] };
        expect(scoreRule('operation success', judge)).toBe(1.0);
    });
});

describe('aggregateHard', () => {
    it('returns 1.0 when all scores are 1.0', () => {
        expect(aggregateHard([1.0, 1.0, 1.0])).toBe(1.0);
    });

    it('returns mean of mixed scores', () => {
        expect(aggregateHard([1.0, 0.0, 1.0, 0.0])).toBe(0.5);
    });

    it('returns 0.0 when all scores are 0.0', () => {
        expect(aggregateHard([0.0, 0.0])).toBe(0.0);
    });

    it('returns 0.0 for an empty array', () => {
        expect(aggregateHard([])).toBe(0.0);
    });

    it('handles a single score', () => {
        expect(aggregateHard([0.75])).toBe(0.75);
    });
});
