import { describe, expect, it } from 'bun:test';
import { hasConfidenceLevel, hasRedFlags, verifyAntiHallucinationProtocol } from '../ah_guard';

/**
 * WHY this file exists (falsification, not coverage theatre).
 *
 * `uncertainty phrases detected: …` is the one issue `verifyAntiHallucinationProtocol` reports
 * that no test asserted anywhere in this package, and inside the red-flag alternative
 * `/(?:It|This) (?:should|might|may|could)/gi` only `should`/`might` had any coverage — the `may`
 * and `This` branches were unguarded, so deleting them changed no test outcome. The confidence
 * half of the same report already has assertions in `ah_guard.test.ts`, so this file pins the
 * uncertainty half plus the declaration forms the report depends on.
 *
 * Every test below fails if its branch is removed (mutate the pattern and it goes red); the two
 * gate tests fail if the `!hasTools` / `requiresExternalVerification` gates are dropped.
 */

/** A sentence that requires external verification (capability claim about an external API). */
const claim = (hedge: string): string => `The Gemini API returns a JSON object with a candidates array. ${hedge}`;

describe('hasRedFlags — every subject×modal alternative is reachable', () => {
    const subjects = ['It', 'This'];
    const modals = ['should', 'might', 'may', 'could'];

    it('detects all eight It|This × should|might|may|could combinations', () => {
        for (const subject of subjects) {
            for (const modal of modals) {
                const phrase = `${subject} ${modal}`;
                expect(hasRedFlags(`${phrase} hold under load.`)).toContain(phrase);
            }
        }
    });

    it('matches case-insensitively', () => {
        expect(hasRedFlags('IT MAY hold under load.')).toContain('IT MAY');
        expect(hasRedFlags('this could fail.')).toContain('this could');
    });

    it('detects the adverbial uncertainty family', () => {
        expect(hasRedFlags('Probably the response includes a rating.')).toContain('Probably');
        expect(hasRedFlags('Likely the response includes a rating.')).toContain('Likely');
        expect(hasRedFlags('Possibly the response includes a rating.')).toContain('Possibly');
    });

    it('leaves a bare modal without an It/This subject alone (documented scope bound)', () => {
        // WHY: the lexicon is subject-anchored on purpose — "the worker may restart" is ordinary
        // implementation talk. Broadening to bare `may` must be a deliberate decision that
        // updates this expectation, never a silent widening.
        expect(hasRedFlags('the worker may restart on a transport error.')).toEqual([]);
    });

    it('returns an empty array for clean text and for empty input', () => {
        expect(hasRedFlags('The worker restarts on a transport error.')).toEqual([]);
        expect(hasRedFlags('')).toEqual([]);
    });
});

describe('verifyAntiHallucinationProtocol — the uncertainty issue names the matched phrase', () => {
    it('reports the uncertainty issue for an It-may hedge on an unverified external claim', () => {
        const result = verifyAntiHallucinationProtocol(claim('It may also emit a stream when tool calls are absent.'));

        expect(result.ok).toBe(false);
        expect(
            result.issues?.some(
                (issue) => issue.startsWith('uncertainty phrases detected:') && issue.includes('It may'),
            ),
        ).toBe(true);
    });

    it('reports This-may and It-could the same way', () => {
        const thisMay = verifyAntiHallucinationProtocol(claim('This may indicate the response was truncated.'));
        expect(thisMay.issues?.some((issue) => issue.includes('This may'))).toBe(true);

        const itCould = verifyAntiHallucinationProtocol(claim('It could be omitted entirely in some versions.'));
        expect(itCould.issues?.some((issue) => issue.includes('It could'))).toBe(true);
    });

    it('caps the reported phrase list at three distinct matches', () => {
        const result = verifyAntiHallucinationProtocol(
            'I think the Gemini API Probably returns candidates. Likely true. Possibly so. It may allow streaming.',
        );

        const uncertainty = result.issues?.find((issue) => issue.startsWith('uncertainty phrases detected:'));
        expect(uncertainty).toBeDefined();
        expect(uncertainty?.split(': ')[1].split(', ').length).toBeLessThanOrEqual(3);
    });

    it('suppresses the uncertainty issue when tool evidence is present', () => {
        const result = verifyAntiHallucinationProtocol(
            claim('It may also emit a stream. I checked this with ref_search_documentation.'),
        );

        expect(result.issues?.some((issue) => issue.startsWith('uncertainty phrases detected:'))).toBe(false);
    });

    it('never reaches the uncertainty check for internal discussion', () => {
        const result = verifyAntiHallucinationProtocol('Let me think about the architecture approach');

        expect(result.ok).toBe(true);
        expect(result.issues).toBeUndefined();
    });
});

describe('confidence level — declaration forms and the reported issue', () => {
    it('accepts every documented declaration form', () => {
        expect(hasConfidenceLevel('Confidence: HIGH')).toBe(true);
        expect(hasConfidenceLevel('Confidence: **MEDIUM**')).toBe(true);
        expect(hasConfidenceLevel('**Confidence**: LOW')).toBe(true);
        expect(hasConfidenceLevel('confidence: high')).toBe(true);
        expect(hasConfidenceLevel('### Confidence\n\nOverall I would call this HIGH in my judgement.')).toBe(true);
    });

    it('rejects a level-shaped prefix and a heading with no nearby level', () => {
        // (0147 F6) `(?![\w-])` is what closes these: `-` and a following letter are not boundaries.
        expect(hasConfidenceLevel('Confidence: HIGHWAY')).toBe(false);
        expect(hasConfidenceLevel('Confidence: MEDIUM-rare')).toBe(false);
        // The `### Confidence` heading only declares a level within an 80-character window.
        expect(hasConfidenceLevel('### Confidence')).toBe(false);
        expect(hasConfidenceLevel(`### Confidence\n${'x'.repeat(120)}\nHIGH`)).toBe(false);
    });

    it('reports the confidence issue for an external claim that declares no level', () => {
        const result = verifyAntiHallucinationProtocol(claim('It may also emit a stream.'));

        expect(result.issues).toContain('confidence level (HIGH/MEDIUM/LOW)');
    });

    it('drops the confidence issue once a level is declared', () => {
        const result = verifyAntiHallucinationProtocol(claim('It may also emit a stream. Confidence: MEDIUM'));

        expect(result.issues).not.toContain('confidence level (HIGH/MEDIUM/LOW)');
    });
});
