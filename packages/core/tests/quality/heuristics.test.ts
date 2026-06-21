import { describe, expect, it } from 'bun:test';

import {
    clamp,
    extractBody,
    hasPattern,
    keywordDensity,
    parseErrorNote,
    parseFrontmatterSafe,
    scoreClarityFromDensities,
    scoreLength,
    scorePresence,
} from '../../src/quality/heuristics';

// ── Helpers ────────────────────────────────────────────────────────────────────

const validFm = `---
name: test-skill
description: A sample skill for testing
---
This is the body text.`;

const noFrontmatter = 'Just plain text, no frontmatter at all.';

const malformedFm = `---
name: [unclosed bracket
---
body`;

const emptyFm = `---
---
Some body text.`;

// ── parseFrontmatterSafe ───────────────────────────────────────────────────────

describe('parseFrontmatterSafe', () => {
    it('returns parsed data for valid frontmatter', () => {
        const result = parseFrontmatterSafe(validFm);
        expect(result).not.toBeNull();
        expect(result?.name).toBe('test-skill');
        expect(result?.description).toBe('A sample skill for testing');
    });

    it('returns null for content without frontmatter', () => {
        expect(parseFrontmatterSafe(noFrontmatter)).toBeNull();
    });

    it('returns null for malformed YAML frontmatter', () => {
        expect(parseFrontmatterSafe(malformedFm)).toBeNull();
    });

    it('returns null for empty frontmatter (no data between ---)', () => {
        expect(parseFrontmatterSafe(emptyFm)).toBeNull();
    });

    it('returns null for empty string', () => {
        expect(parseFrontmatterSafe('')).toBeNull();
    });
});

// ── parseErrorNote ─────────────────────────────────────────────────────────────

describe('parseErrorNote', () => {
    it('returns fallback when frontmatter parses successfully', () => {
        expect(parseErrorNote(validFm, 'default note')).toBe('default note');
    });

    it('returns FrontmatterError message for malformed YAML', () => {
        const note = parseErrorNote(malformedFm, 'fallback');
        expect(note).toContain('Frontmatter parse error');
    });

    it('returns FrontmatterError message for content with no frontmatter', () => {
        const note = parseErrorNote(noFrontmatter, 'no fm');
        expect(note).toContain('Frontmatter parse error');
        expect(note).toContain('Missing frontmatter');
    });
    // ── scorePresence ───────────────────────────────────────────────────────────────

    describe('scorePresence', () => {
        it('returns 1.0 when all required fields are present', () => {
            expect(scorePresence(['name', 'description'], ['name', 'description'])).toBe(1);
        });

        it('returns 0.5 when half the required fields are present', () => {
            expect(scorePresence(['name'], ['name', 'description'])).toBe(0.5);
        });

        it('returns 0.0 when no required fields are present', () => {
            expect(scorePresence([], ['name', 'description'])).toBe(0);
        });

        it('returns 1.0 when required array is empty', () => {
            expect(scorePresence(['name'], [])).toBe(1);
        });

        it('handles extra present fields beyond required', () => {
            expect(scorePresence(['name', 'description', 'extra'], ['name'])).toBe(1);
        });
    });

    // ── scoreLength ─────────────────────────────────────────────────────────────────

    describe('scoreLength', () => {
        it('returns 1.0 when length is within [min, max]', () => {
            expect(scoreLength('1234567890', 5, 15)).toBe(1);
        });

        it('returns 1.0 at exact min boundary', () => {
            expect(scoreLength('12345', 5, 15)).toBe(1);
        });

        it('returns 1.0 at exact max boundary', () => {
            expect(scoreLength('123456789012345', 5, 15)).toBe(1);
        });

        it('ramps down linearly below min', () => {
            const score = scoreLength('12', 5, 15);
            expect(score).toBe(0.4); // 2/5 = 0.4
        });

        it('ramps down linearly above max', () => {
            const text = 'x'.repeat(25);
            const score = scoreLength(text, 5, 15);
            // len=25, max=15 → (25-15)/15 = 10/15 ≈ 0.667; 1 - 0.667 ≈ 0.333
            expect(score).toBeCloseTo(1 / 3, 2);
        });

        it('returns 0.0 at or above max*2', () => {
            const text = 'x'.repeat(30);
            expect(scoreLength(text, 5, 15)).toBe(0);
        });

        it('returns 0.0 for empty string when min > 0', () => {
            expect(scoreLength('', 5, 15)).toBe(0);
        });
    });

    // ── keywordDensity ──────────────────────────────────────────────────────────────

    describe('keywordDensity', () => {
        it('returns 1.0 when empty keyword list', () => {
            expect(keywordDensity('any text', [])).toBe(1);
        });

        it('returns 1.0 when all keywords found', () => {
            expect(keywordDensity('must ensure validate', ['must', 'ensure', 'validate'])).toBe(1);
        });

        it('returns 0.5 when half keywords found', () => {
            expect(keywordDensity('must ensure xyz', ['must', 'ensure', 'validate', 'never'])).toBe(0.5);
        });

        it('returns 0.0 when no keywords found', () => {
            expect(keywordDensity('xyz abc def', ['must', 'should', 'never'])).toBe(0);
        });

        it('matches case-insensitively', () => {
            expect(keywordDensity('MUST Ensure', ['must', 'ensure'])).toBe(1);
        });

        it('matches whole words only', () => {
            // 'must' as a whole word, 'mustard' should NOT match
            expect(keywordDensity('mustard sauce', ['must'])).toBe(0);
        });

        it('matches keywords followed by punctuation', () => {
            expect(keywordDensity('must, ensure. validate!', ['must', 'ensure', 'validate'])).toBe(1);
        });
    });

    // ── hasPattern ──────────────────────────────────────────────────────────────────

    describe('hasPattern', () => {
        it('returns 1.0 when empty pattern list', () => {
            expect(hasPattern('any text', [])).toBe(1);
        });

        it('returns 1.0 when all patterns match', () => {
            expect(hasPattern('hello world', [/hello/, /world/])).toBe(1);
        });

        it('returns 0.5 when half the patterns match', () => {
            expect(hasPattern('hello world', [/hello/, /goodbye/])).toBe(0.5);
        });

        it('returns 0.0 when no patterns match', () => {
            expect(hasPattern('hello world', [/foo/, /bar/])).toBe(0);
        });

        it('handles patterns that match multiple times', () => {
            expect(hasPattern('hello hello hello', [/hello/])).toBe(1);
        });
    });

    // ── extractBody ─────────────────────────────────────────────────────────────────

    describe('extractBody', () => {
        it('returns the whole string when no frontmatter opener', () => {
            expect(extractBody('plain body text')).toBe('plain body text');
        });

        it('extracts body after frontmatter', () => {
            const body = extractBody(validFm);
            expect(body).toContain('This is the body text.');
            expect(body).not.toContain('---');
            expect(body).not.toContain('name:');
        });

        it('handles content with opener but no closer', () => {
            const content = '---\nname: x\nbody without closing delimiter';
            const body = extractBody(content);
            expect(body).toContain('body without closing delimiter');
            expect(body).toContain('name: x');
        });

        it('does not treat --- inside body as closer', () => {
            // The closer must be a bare `---` line; `---` followed by text is not a closer
            const content = '---\nname: x\n---\nbody with --- inline\nmore body';
            const body = extractBody(content);
            expect(body).toContain('body with --- inline');
            expect(body).toContain('more body');
        });

        it('handles frontmatter with no body', () => {
            const content = '---\nname: x\n---\n';
            const body = extractBody(content);
            expect(body.trim()).toBe('');
        });
    });

    // ── clamp ───────────────────────────────────────────────────────────────────────

    describe('clamp', () => {
        it('returns value unchanged within [0, 1]', () => {
            expect(clamp(0.5)).toBe(0.5);
        });

        it('clamps negative values to 0', () => {
            expect(clamp(-0.5)).toBe(0);
        });

        it('clamps values above 1 to 1', () => {
            expect(clamp(1.5)).toBe(1);
        });

        it('returns 0 for 0', () => {
            expect(clamp(0)).toBe(0);
        });

        it('returns 1 for 1', () => {
            expect(clamp(1)).toBe(1);
        });
    });

    // ── scoreClarityFromDensities ───────────────────────────────────────────────────

    describe('scoreClarityFromDensities', () => {
        it('returns high score for imperative prose with no vague terms', () => {
            const body = 'You must validate inputs and should ensure correctness. Never skip checks.';
            const result = scoreClarityFromDensities(body);
            expect(result.score).toBeGreaterThan(0.5);
            expect(result.note).toBe('Good imperative style');
        });

        it('returns low score for vagueness-heavy prose', () => {
            const body = 'maybe we could perhaps do something but it might not work probably';
            const result = scoreClarityFromDensities(body);
            expect(result.score).toBeLessThan(0.5);
            expect(result.note).toContain('Vague terms found');
        });

        it('returns mid-range score for neutral prose', () => {
            // Equal imperative and vague densities → score of 0.5
            // Use one imperative keyword and one vague keyword
            const body = 'must maybe'; // 'must' matches imperative, 'maybe' matches vague
            const result = scoreClarityFromDensities(body);
            // Both densities are 1/n where n is keyword count. With many keywords, each
            // single match gives low density, but the formula is (imp - vague)/2 + 0.5
            // Since imp and vague densities will be similar, score ≈ 0.5
            expect(result.score).toBeCloseTo(0.5, 1);
        });

        it('returns a DimensionScore with score between 0 and 1', () => {
            const result = scoreClarityFromDensities('');
            expect(result.score).toBeGreaterThanOrEqual(0);
            expect(result.score).toBeLessThanOrEqual(1);
            expect(typeof result.note).toBe('string');
        });

        it('handles empty body with neutral score and no vague detection', () => {
            const result = scoreClarityFromDensities('');
            expect(result.score).toBe(0.5); // (0-0)/2 + 0.5
            expect(result.note).toBe('Good imperative style');
        });
    });
});
