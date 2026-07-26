import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { join } from 'node:path';
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
    it('returns stdin text when provided by the bounded reader', async () => {
        const text = await readStdinText(async () => 'stdin response', false);

        expect(text).toBe('stdin response');
    });

    it('returns undefined for blank stdin', async () => {
        expect(await readStdinText(async () => '   ', false)).toBeUndefined();
    });

    it('returns undefined when stdin cannot be read', async () => {
        expect(
            await readStdinText(async () => {
                throw new Error('boom');
            }, false),
        ).toBeUndefined();
    });

    it('never reads stdin on a TTY, so manual invocation cannot hang', async () => {
        let readAttempted = false;
        const text = await readStdinText(async () => {
            readAttempted = true;
            return 'should never be read';
        }, true);

        expect(text).toBeUndefined();
        expect(readAttempted).toBe(false);
    });
});

describe('direct entrypoint stdin', () => {
    it('exits within the idle budget when stdin stays open and silent', async () => {
        const proc = Bun.spawn(['bun', join(import.meta.dir, '..', 'validate_response.ts')], {
            stdin: 'pipe',
            stdout: 'pipe',
            stderr: 'pipe',
        });
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            const code = await Promise.race([
                proc.exited,
                new Promise<never>((_, reject) => {
                    timer = setTimeout(() => reject(new Error('validator remained blocked on open stdin')), 1_000);
                }),
            ]);
            expect(code).toBe(0);
        } finally {
            if (timer !== undefined) clearTimeout(timer);
            proc.stdin.end();
        }
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

    it('returns 0 when RESPONSE_TEXT is empty', async () => {
        const originalResponseText = Bun.env.RESPONSE_TEXT;
        Bun.env.RESPONSE_TEXT = '';

        try {
            expect(await main()).toBe(0);
        } finally {
            if (originalResponseText === undefined) {
                Bun.env.RESPONSE_TEXT = undefined;
            } else {
                Bun.env.RESPONSE_TEXT = originalResponseText;
            }
        }
    });

    it('returns 1 when RESPONSE_TEXT fails validation', async () => {
        const originalResponseText = Bun.env.RESPONSE_TEXT;
        Bun.env.RESPONSE_TEXT =
            'The API method is getUser() which returns a user object and was introduced in version 2.0.';

        try {
            expect(await main()).toBe(1);
        } finally {
            if (originalResponseText === undefined) {
                Bun.env.RESPONSE_TEXT = undefined;
            } else {
                Bun.env.RESPONSE_TEXT = originalResponseText;
            }
        }
    });

    it('returns 0 when RESPONSE_TEXT passes validation', async () => {
        const originalResponseText = Bun.env.RESPONSE_TEXT;
        Bun.env.RESPONSE_TEXT =
            'According to the official documentation at https://api.example.com, ' +
            'the method is getUser(id: string): User. ' +
            '**Confidence**: HIGH. Source: https://api.example.com/docs';

        try {
            expect(await main()).toBe(0);
        } finally {
            if (originalResponseText === undefined) {
                Bun.env.RESPONSE_TEXT = undefined;
            } else {
                Bun.env.RESPONSE_TEXT = originalResponseText;
            }
        }
    });
});
