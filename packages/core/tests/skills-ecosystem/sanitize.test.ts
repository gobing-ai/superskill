/**
 * Cross-function invariant tests for skills-ecosystem/sanitize.ts.
 * The verbatim vendor fixtures live in sanitize-name.test.ts and
 * sanitize-terminal.test.ts; this file anchors the test-location rule and
 * pins contracts that span all three exported functions.
 */
import { describe, expect, it } from 'bun:test';
import { sanitizeMetadata, sanitizeName, stripTerminalEscapes } from '../../src/skills-ecosystem/sanitize';

describe('sanitize.ts cross-function invariants', () => {
    it('sanitizeName output never contains characters the terminal filter would strip', () => {
        // A name laundered through sanitizeName must be terminal-safe as-is:
        // ESC and C1 bytes are outside [a-z0-9._] and collapse to hyphens.
        const hostile = '\x1b[31mskill\x1b[0m\x9bname\x07';
        const result = sanitizeName(hostile);
        expect(result).toBe(stripTerminalEscapes(result));
        expect(result).not.toContain('\x1b');
        expect(result).not.toContain('\x07');
    });

    it('sanitizeMetadata output is always single-line', () => {
        const result = sanitizeMetadata('multi\nline\r\nname\x1b[2J');
        expect(result).not.toMatch(/[\r\n]/);
    });

    it('stripTerminalEscapes is idempotent', () => {
        const hostile = '\x1b]0;title\x07\x1b[2Jtext\x9b';
        const once = stripTerminalEscapes(hostile);
        expect(stripTerminalEscapes(once)).toBe(once);
    });

    it('sanitizeName is idempotent on its own output', () => {
        for (const input of ['My Skill!', '../etc/passwd', '日本語', '---']) {
            const once = sanitizeName(input);
            expect(sanitizeName(once)).toBe(once);
        }
    });

    it('sanitizeName never returns a name that escapes its parent directory', () => {
        // Whatever the input, the result must be a bare filename: no slash,
        // no backslash, and never the "." or ".." segment.
        for (const input of ['../..', '..\\..\\', '/etc/passwd', 'a/b/c', '.', '..']) {
            const result = sanitizeName(input);
            expect(result).not.toMatch(/[/\\]/);
            expect(result).not.toBe('.');
            expect(result).not.toBe('..');
        }
    });
});
