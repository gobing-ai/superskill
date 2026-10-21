import { describe, expect, it } from 'bun:test';
import { hasConfidenceLevel, hasRedFlags, verifyAntiHallucinationProtocol } from '../ah_guard';

/**
 * WHY this file exists (falsification, not coverage theatre).
 *
 * `hasRedFlags` and `hasConfidenceLevel` stay exported and unit-tested: the docs and skills
 * recommend both as prose conventions. Since H21 they are **not** decision inputs, so this file
 * also pins the negative — an uncertainty phrase or a missing/malformed confidence level must
 * never block on its own, and must never rescue an unevidenced claim either. Before H21 those
 * halves produced the issues this file asserted; the assertions are flipped, not deleted.
 *
 * Every helper test below fails if its branch is removed (mutate the pattern and it goes red).
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

describe('verifyAntiHallucinationProtocol — uncertainty never decides', () => {
    it('reports only the source issue for a hedged external claim with no evidence', () => {
        const result = verifyAntiHallucinationProtocol(claim('It may also emit a stream when tool calls are absent.'));

        expect(result.ok).toBe(false);
        expect(result.issues).toEqual(['source citations for API/library claims']);
    });

    it('never reports an uncertainty issue, whatever the hedge', () => {
        const text =
            'I think the Gemini API Probably returns candidates. Likely true. Possibly so. It may allow streaming.';
        const result = verifyAntiHallucinationProtocol(text);

        expect(result.ok).toBe(false);
        expect(result.issues?.some((issue) => issue.startsWith('uncertainty phrases detected:'))).toBe(false);
    });

    it('allows a cited reply that hedges (residual-proof: hedge + citation)', () => {
        // RESIDUAL-PROOF negative: carries the hedge half (`It may`, `probably`) AND the citation
        // half, so it fails if either the old uncertainty branch or a re-added text-tool branch
        // decides instead of the citation.
        const result = verifyAntiHallucinationProtocol(
            claim('It may also emit a stream. I think that is probably right — see packages/core/src/ai/client.ts:88.'),
        );

        expect(result.ok).toBe(true);
        expect(result.issues).toBeUndefined();
    });

    it('allows a hedged claim when the current turn used a verification tool', () => {
        const result = verifyAntiHallucinationProtocol(claim('It may also emit a stream.'), ['WebSearch']);

        expect(result.ok).toBe(true);
    });

    it('never reaches the decision for internal discussion', () => {
        const result = verifyAntiHallucinationProtocol('Let me think about the architecture approach');

        expect(result.ok).toBe(true);
        expect(result.issues).toBeUndefined();
    });
});

describe('confidence level — declaration forms, and no decision power', () => {
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

    it('blocks an unevidenced claim even when it declares a level', () => {
        // RESIDUAL-PROOF: the label half is present (`Confidence: MEDIUM`) and the claim half is
        // present. A re-added label branch would allow this; only evidence may.
        const result = verifyAntiHallucinationProtocol(claim('It may also emit a stream. Confidence: MEDIUM'));

        expect(result.ok).toBe(false);
        expect(result.issues).toEqual(['source citations for API/library claims']);
    });

    it('never reports a confidence issue', () => {
        const result = verifyAntiHallucinationProtocol(claim('It may also emit a stream.'));

        expect(result.issues).not.toContain('confidence level (HIGH/MEDIUM/LOW)');
    });
});
