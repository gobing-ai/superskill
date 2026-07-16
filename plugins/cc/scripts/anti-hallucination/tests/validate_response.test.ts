import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { isGlobalSilent, setGlobalSilent } from '../logger';
import { main, readStdinText, validateResponseText } from '../validate_response';

describe('validateResponseText', () => {
    it('allows empty response text', () => {
        expect(validateResponseText('')).toEqual({
            ok: true,
            reason: 'No response text provided',
        });
    });

    it('rejects non-compliant externally sourced claims', () => {
        const result = validateResponseText(
            'The library API added a new method in version 3.1 without any cited source or confidence level.',
        );

        expect(result.ok).toBe(false);
        expect(result.issues).toContain('source citations for API/library claims');
    });

    it('allows compliant externally sourced claims', () => {
        const result = validateResponseText(
            'According to the official documentation at https://api.example.com, ' +
                'the method is getUser(id: string): User. ' +
                '**Confidence**: HIGH. Source: https://api.example.com/docs',
        );

        expect(result.ok).toBe(true);
    });
});

describe('readStdinText', () => {
    it('returns stdin text when provided by the reader', () => {
        const text = readStdinText((path, encoding) => {
            expect(path).toBe('/dev/stdin');
            expect(encoding).toBe('utf-8');
            return 'stdin response';
        }, false);

        expect(text).toBe('stdin response');
    });

    it('returns undefined for blank stdin', () => {
        expect(readStdinText(() => '   ', false)).toBeUndefined();
    });

    it('returns undefined when stdin cannot be read', () => {
        expect(
            readStdinText(() => {
                throw new Error('boom');
            }, false),
        ).toBeUndefined();
    });

    it('never reads stdin on a TTY, so manual invocation cannot hang', () => {
        // WHY: `bun validate_response.ts` with nothing piped used to block on /dev/stdin until
        // EOF — an interactive terminal never sends one, so the CLI hung with no prompt.
        let readAttempted = false;
        const text = readStdinText(() => {
            readAttempted = true;
            return 'should never be read';
        }, true);

        expect(text).toBeUndefined();
        expect(readAttempted).toBe(false);
    });
});

describe('main', () => {
    let previousSilentState = false;

    beforeEach(() => {
        previousSilentState = isGlobalSilent();
        setGlobalSilent(true);
    });

    afterEach(() => {
        setGlobalSilent(previousSilentState);
    });

    it('returns 0 when RESPONSE_TEXT is empty', () => {
        const originalResponseText = Bun.env.RESPONSE_TEXT;
        Bun.env.RESPONSE_TEXT = '';

        try {
            expect(main()).toBe(0);
        } finally {
            if (originalResponseText === undefined) {
                Bun.env.RESPONSE_TEXT = undefined;
            } else {
                Bun.env.RESPONSE_TEXT = originalResponseText;
            }
        }
    });

    it('returns 1 when RESPONSE_TEXT fails validation', () => {
        const originalResponseText = Bun.env.RESPONSE_TEXT;
        Bun.env.RESPONSE_TEXT =
            'The API method is getUser() which returns a user object and was introduced in version 2.0.';

        try {
            expect(main()).toBe(1);
        } finally {
            if (originalResponseText === undefined) {
                Bun.env.RESPONSE_TEXT = undefined;
            } else {
                Bun.env.RESPONSE_TEXT = originalResponseText;
            }
        }
    });

    it('returns 0 when RESPONSE_TEXT passes validation', () => {
        const originalResponseText = Bun.env.RESPONSE_TEXT;
        Bun.env.RESPONSE_TEXT =
            'According to the official documentation at https://api.example.com, ' +
            'the method is getUser(id: string): User. ' +
            '**Confidence**: HIGH. Source: https://api.example.com/docs';

        try {
            expect(main()).toBe(0);
        } finally {
            if (originalResponseText === undefined) {
                Bun.env.RESPONSE_TEXT = undefined;
            } else {
                Bun.env.RESPONSE_TEXT = originalResponseText;
            }
        }
    });
});
