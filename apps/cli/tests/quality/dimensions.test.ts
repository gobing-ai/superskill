import { describe, expect, it } from 'bun:test';
import {
    clamp,
    computeAggregate,
    extractBody,
    hasPattern,
    keywordDensity,
    parseErrorNote,
    parseFrontmatterSafe,
    scoreLength,
    scorePresence,
} from '../../src/quality/dimensions';

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Content with valid YAML frontmatter. */
const validFm = `---
name: test-skill
description: A sample skill for testing
---
This is the body text.`;

/** Content missing the opening `---`. */
const noFrontmatter = 'Just plain text, no frontmatter at all.';

/** Content with malformed YAML. */
const malformedFm = `---
name: [unclosed bracket
---
body`;

/** Content with empty frontmatter (delimiters present, nothing between). */
const emptyFm = `---

---
body`;

/** Content with YAML array instead of mapping. */
const arrayFm = `---
- item1
- item2
---
body`;

// ── parseFrontmatterSafe ───────────────────────────────────────────────────────

describe('parseFrontmatterSafe', () => {
    it('returns data for valid frontmatter', () => {
        const result = parseFrontmatterSafe(validFm);
        expect(result).toBeDefined();
        expect(result).not.toBeNull();
        expect(result?.name).toBe('test-skill');
        expect(result?.description).toBe('A sample skill for testing');
    });

    it('returns null for missing frontmatter', () => {
        expect(parseFrontmatterSafe(noFrontmatter)).toBeNull();
    });

    it('returns null for malformed YAML', () => {
        expect(parseFrontmatterSafe(malformedFm)).toBeNull();
    });

    it('returns null for empty frontmatter', () => {
        expect(parseFrontmatterSafe(emptyFm)).toBeNull();
    });

    it('returns null for YAML array instead of mapping', () => {
        expect(parseFrontmatterSafe(arrayFm)).toBeNull();
    });

    it('returns null for empty string', () => {
        expect(parseFrontmatterSafe('')).toBeNull();
    });
});

// ── scorePresence ──────────────────────────────────────────────────────────────

describe('scorePresence', () => {
    it('returns 1.0 when all required fields are present', () => {
        expect(scorePresence(['name', 'description'], ['name', 'description'])).toBe(1.0);
    });

    it('returns 0.5 when half the required fields are present', () => {
        expect(scorePresence(['name'], ['name', 'description'])).toBe(0.5);
    });

    it('returns 0.0 when none of the required fields are present', () => {
        expect(scorePresence(['other'], ['name', 'description'])).toBe(0.0);
    });

    it('returns 1.0 when required list is empty', () => {
        expect(scorePresence(['name'], [])).toBe(1.0);
    });

    it('handles present fields that are not in required (ignores extras)', () => {
        expect(scorePresence(['name', 'extra'], ['name', 'description'])).toBe(0.5);
    });

    it('handles duplicate entries in present array correctly', () => {
        expect(scorePresence(['name', 'name'], ['name', 'description'])).toBe(0.5);
    });

    it('returns 1.0 for 3 of 3 required present', () => {
        expect(scorePresence(['name', 'description', 'model'], ['name', 'description', 'model'])).toBe(1.0);
    });

    it('returns 1/3 ≈ 0.333... for 1 of 3 required present', () => {
        expect(scorePresence(['name'], ['name', 'description', 'model'])).toBeCloseTo(1 / 3, 5);
    });
});

// ── scoreLength ────────────────────────────────────────────────────────────────

describe('scoreLength', () => {
    const min = 10;
    const max = 100;

    it('returns 1.0 when length is within the sweet spot', () => {
        expect(scoreLength('x'.repeat(50), min, max)).toBe(1.0);
    });

    it('returns 1.0 when length is exactly at the minimum', () => {
        expect(scoreLength('x'.repeat(10), min, max)).toBe(1.0);
    });

    it('returns 1.0 when length is exactly at the maximum', () => {
        expect(scoreLength('x'.repeat(100), min, max)).toBe(1.0);
    });

    it('returns 0.5 when length is half the minimum', () => {
        expect(scoreLength('x'.repeat(5), min, max)).toBe(0.5);
    });

    it('returns 0.0 when length is 0', () => {
        expect(scoreLength('', min, max)).toBe(0.0);
    });

    it('returns < 1.0 when length is above max', () => {
        const score = scoreLength('x'.repeat(150), min, max);
        expect(score).toBeLessThan(1.0);
        expect(score).toBeGreaterThan(0.0);
    });

    it('returns 0.5 at max * 1.5 (midpoint in the ramp-down)', () => {
        expect(scoreLength('x'.repeat(150), min, max)).toBeCloseTo(0.5, 5);
    });

    it('returns 0.0 at max * 2', () => {
        expect(scoreLength('x'.repeat(200), min, max)).toBe(0.0);
    });

    it('returns 0.0 beyond max * 2', () => {
        expect(scoreLength('x'.repeat(300), min, max)).toBe(0.0);
    });

    it('ramps linearly below min: score = len / min', () => {
        expect(scoreLength('x'.repeat(7), min, max)).toBeCloseTo(0.7, 5);
    });

    it('ramps linearly above max: score = 1 - (len-max)/max', () => {
        // At 120: 1 - (120-100)/100 = 0.8
        expect(scoreLength('x'.repeat(120), min, max)).toBeCloseTo(0.8, 5);
    });

    it('handles min === max (single-point sweet spot)', () => {
        expect(scoreLength('x'.repeat(50), 50, 50)).toBe(1.0);
        expect(scoreLength('x'.repeat(25), 50, 50)).toBe(0.5);
        expect(scoreLength('x'.repeat(75), 50, 50)).toBe(0.5);
    });
});

// ── keywordDensity ─────────────────────────────────────────────────────────────

describe('keywordDensity', () => {
    it('returns 1.0 when all keywords are found', () => {
        expect(keywordDensity('hello world test', ['hello', 'world'])).toBe(1.0);
    });

    it('returns 0.5 when half the keywords are found', () => {
        expect(keywordDensity('hello world', ['hello', 'missing'])).toBe(0.5);
    });

    it('returns 0.0 when no keywords are found', () => {
        expect(keywordDensity('foo bar', ['hello', 'world'])).toBe(0.0);
    });

    it('returns 1.0 when keywords array is empty', () => {
        expect(keywordDensity('hello world', [])).toBe(1.0);
    });

    it('matches case-insensitively', () => {
        expect(keywordDensity('HELLO World', ['hello'])).toBe(1.0);
    });

    it('requires whole-word match (substring in larger word does not count)', () => {
        // "hello" embedded in "helloworld" — no word boundary, so not matched
        expect(keywordDensity('helloworld', ['hello'])).toBe(0.0);
    });

    it('matches keyword followed by punctuation', () => {
        expect(keywordDensity('hello, world.', ['hello', 'world'])).toBe(1.0);
    });

    it('matches keyword at the start of text', () => {
        expect(keywordDensity('hello everyone', ['hello'])).toBe(1.0);
    });

    it('matches keyword at the end of text', () => {
        expect(keywordDensity('say hello', ['hello'])).toBe(1.0);
    });

    it('escapes regex-special characters in keywords', () => {
        // "+" is a regex quantifier — must be escaped to match literally
        expect(keywordDensity('C++ is great', ['C++'])).toBe(1.0);
        expect(keywordDensity('C-- is not C++', ['C++'])).toBe(1.0);
    });

    it('returns 1/3 for 1 of 3 keywords found', () => {
        expect(keywordDensity('hello world', ['hello', 'missing', 'gone'])).toBeCloseTo(1 / 3, 5);
    });
});

// ── hasPattern ─────────────────────────────────────────────────────────────────

describe('hasPattern', () => {
    it('returns 1.0 when all patterns match', () => {
        expect(hasPattern('hello world', [/hello/, /world/])).toBe(1.0);
    });

    it('returns 0.5 when half the patterns match', () => {
        expect(hasPattern('hello', [/hello/, /world/])).toBe(0.5);
    });

    it('returns 0.0 when no patterns match', () => {
        expect(hasPattern('foo', [/hello/, /world/])).toBe(0.0);
    });

    it('returns 1.0 when patterns array is empty', () => {
        expect(hasPattern('hello', [])).toBe(1.0);
    });

    it('matches each pattern at least once (not requiring multiple matches per pattern)', () => {
        expect(hasPattern('hello hello world', [/hello/, /world/])).toBe(1.0);
    });

    it('handles patterns with flags (e.g. case-insensitive)', () => {
        expect(hasPattern('HELLO', [/hello/i])).toBe(1.0);
    });

    it('returns 1/3 for 1 of 3 patterns matched', () => {
        expect(hasPattern('hello', [/hello/, /world/, /foo/])).toBeCloseTo(1 / 3, 5);
    });
});

// ── computeAggregate ───────────────────────────────────────────────────────────

describe('computeAggregate', () => {
    it('returns the mean of equal-weight scores', () => {
        expect(
            computeAggregate({
                a: { score: 0.5, note: '' },
                b: { score: 0.5, note: '' },
            }),
        ).toBe(0.5);
    });

    it('returns 0.0 when dimensions object is empty', () => {
        expect(computeAggregate({})).toBe(0.0);
    });

    it('returns the single score for one dimension', () => {
        expect(computeAggregate({ a: { score: 0.8, note: 'good' } })).toBe(0.8);
    });

    it('correctly averages mixed scores', () => {
        expect(
            computeAggregate({
                a: { score: 0.0, note: '' },
                b: { score: 1.0, note: '' },
            }),
        ).toBe(0.5);
    });

    it('returns the mean of three dimensions', () => {
        expect(
            computeAggregate({
                a: { score: 0.3, note: '' },
                b: { score: 0.6, note: '' },
                c: { score: 0.9, note: '' },
            }),
        ).toBeCloseTo(0.6, 5);
    });

    it('returns 1.0 when all dimensions are perfect', () => {
        expect(
            computeAggregate({
                a: { score: 1.0, note: '' },
                b: { score: 1.0, note: '' },
                c: { score: 1.0, note: '' },
            }),
        ).toBe(1.0);
    });

    it('returns 0.0 when all dimensions score 0.0', () => {
        expect(
            computeAggregate({
                a: { score: 0.0, note: '' },
                b: { score: 0.0, note: '' },
            }),
        ).toBe(0.0);
    });
});

// ── clamp ──────────────────────────────────────────────────────────────────────

describe('clamp', () => {
    it('returns 0 for values below 0', () => {
        expect(clamp(-5)).toBe(0);
        expect(clamp(-0.1)).toBe(0);
        expect(clamp(-Infinity)).toBe(0);
    });

    it('returns 1 for values above 1', () => {
        expect(clamp(5)).toBe(1);
        expect(clamp(1.1)).toBe(1);
        expect(clamp(Infinity)).toBe(1);
    });

    it('returns the value unchanged when within [0, 1]', () => {
        expect(clamp(0)).toBe(0);
        expect(clamp(0.5)).toBe(0.5);
        expect(clamp(0.333)).toBeCloseTo(0.333, 3);
        expect(clamp(1)).toBe(1);
        expect(clamp(1.0)).toBe(1.0);
    });
});

// ── extractBody ────────────────────────────────────────────────────────────────

describe('extractBody', () => {
    it('extracts text after the closing --- delimiter', () => {
        const content = '---\nname: test\n---\nbody text here';
        const body = extractBody(content);
        expect(body).toContain('body text here');
    });

    it('returns everything after the opener when there is no closer', () => {
        const content = '---\nname: test\nno closer here';
        expect(extractBody(content)).toBe('name: test\nno closer here');
    });

    it('handles content that is just an opener with nothing else', () => {
        expect(extractBody('---\n')).toBe('');
    });

    it('does not treat --- within body text as a closer', () => {
        // The closer is only detected as `\n---` followed by end-of-string or newline,
        // and the search starts at index 4 (after the opener), so the first `\n---`
        // after that is the real closer.
        const content = '---\nname: test\n---\nbody with --- in the middle';
        expect(extractBody(content)).toBe('\nbody with --- in the middle');
    });
});

// ── parseErrorNote ─────────────────────────────────────────────────────────────

describe('parseErrorNote', () => {
    it('returns the fallback string when frontmatter is valid', () => {
        const result = parseErrorNote(validFm, '(no issues)');
        expect(result).toBe('(no issues)');
    });

    it('returns an error note when frontmatter is missing', () => {
        const result = parseErrorNote(noFrontmatter, 'default fallback');
        expect(result).not.toBe('default fallback');
        expect(result).toContain('Frontmatter parse error');
    });

    it('returns an error note when YAML is malformed', () => {
        const result = parseErrorNote(malformedFm, 'ok');
        expect(result).not.toBe('ok');
        expect(result).toContain('Frontmatter parse error');
    });

    it('returns an error note when frontmatter is empty', () => {
        const result = parseErrorNote(emptyFm, 'ok');
        expect(result).not.toBe('ok');
        expect(result).toContain('Frontmatter parse error');
    });
});
