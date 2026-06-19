import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
    extractLastAssistantMessage,
    hasConfidenceLevel,
    hasRedFlags,
    hasSourceCitations,
    hasToolUsageEvidence,
    main,
    requiresExternalVerification,
    verifyAntiHallucinationProtocol,
} from '../ah_guard';
import { isGlobalSilent, setGlobalSilent } from '../logger';

describe('extractLastAssistantMessage', () => {
    it('extracts the last assistant message from plain string content', () => {
        const result = extractLastAssistantMessage({
            messages: [
                { role: 'user', content: 'Question' },
                { role: 'assistant', content: 'First answer' },
                { role: 'assistant', content: 'Second answer' },
            ],
        });

        expect(result).toBe('Second answer');
    });

    it('extracts joined text parts from mixed content', () => {
        const result = extractLastAssistantMessage({
            messages: [
                {
                    role: 'assistant',
                    content: [
                        { type: 'text', text: 'I searched the docs.' },
                        { type: 'tool_use' },
                        { type: 'text', text: 'The method exists.' },
                    ],
                },
            ],
        });

        expect(result).toBe('I searched the docs.\nThe method exists.');
    });

    it('falls back to last_message when there are no assistant messages', () => {
        const result = extractLastAssistantMessage({
            messages: [{ role: 'user', content: 'Question' }],
            last_message: 'Fallback answer',
        });

        expect(result).toBe('Fallback answer');
    });

    it('returns undefined when no assistant content is available', () => {
        expect(extractLastAssistantMessage({ messages: [] })).toBeUndefined();
    });
});

describe('hasSourceCitations', () => {
    it('detects markdown source format', () => {
        expect(hasSourceCitations('**Source**: [Docs](https://example.com)')).toBe(true);
    });

    it('detects bracketed source format', () => {
        expect(hasSourceCitations('[Source: Example](https://example.com)')).toBe(true);
    });

    it('detects plain URL', () => {
        expect(hasSourceCitations('Check https://example.com for details')).toBe(true);
    });

    it('detects sources list format', () => {
        expect(hasSourceCitations('Sources:\n - [Example](https://example.com)')).toBe(true);
    });

    it('returns false for text without sources', () => {
        expect(hasSourceCitations('I think this is a good approach')).toBe(false);
    });

    it('returns false for empty text', () => {
        expect(hasSourceCitations('')).toBe(false);
    });
});

describe('hasConfidenceLevel', () => {
    it('detects uppercase confidence', () => {
        expect(hasConfidenceLevel('**Confidence**: HIGH')).toBe(true);
    });

    it('detects plain confidence', () => {
        expect(hasConfidenceLevel('Confidence: MEDIUM')).toBe(true);
    });

    it('detects section header', () => {
        expect(hasConfidenceLevel('### Confidence\n\nHIGH')).toBe(true);
    });

    it('returns false for text without confidence', () => {
        expect(hasConfidenceLevel('The solution is complete')).toBe(false);
    });

    it('detects lowercase confidence text', () => {
        expect(hasConfidenceLevel('confidence: low')).toBe(true);
    });
});

describe('hasToolUsageEvidence', () => {
    it('detects ref_search_documentation', () => {
        expect(hasToolUsageEvidence('Used ref_search_documentation to verify')).toBe(true);
    });

    it('detects WebSearch', () => {
        expect(hasToolUsageEvidence('WebSearch found relevant results')).toBe(true);
    });

    it('detects ref_read_url and WebFetch', () => {
        expect(hasToolUsageEvidence('Used ref_read_url on the official docs')).toBe(true);
        expect(hasToolUsageEvidence('Fetched the page with WebFetch')).toBe(true);
    });

    it('detects searchCode usage', () => {
        expect(hasToolUsageEvidence('Found implementation examples via searchCode')).toBe(true);
    });

    it('detects MCP prefixed tools', () => {
        expect(hasToolUsageEvidence('mcp__ref__ref_search_documentation was used')).toBe(true);
    });

    it('returns false for text without tool evidence', () => {
        expect(hasToolUsageEvidence('I recall from memory')).toBe(false);
    });
});

describe('hasRedFlags', () => {
    it("detects 'I think'", () => {
        const flags = hasRedFlags('I think this is correct');
        expect(flags.length).toBeGreaterThan(0);
    });

    it("detects 'I believe'", () => {
        const flags = hasRedFlags('I believe the answer is 42');
        expect(flags.length).toBeGreaterThan(0);
    });

    it("detects 'Probably'", () => {
        const flags = hasRedFlags('Probably the best approach');
        expect(flags.length).toBeGreaterThan(0);
    });

    it("detects 'I recall' and 'might'", () => {
        expect(hasRedFlags('I recall this might be supported').length).toBeGreaterThanOrEqual(2);
    });

    it("detects 'It should be'", () => {
        const flags = hasRedFlags('It should be available now');
        expect(flags.length).toBeGreaterThan(0);
    });

    it('returns empty array for clean text', () => {
        const flags = hasRedFlags('The function is defined in the official documentation.');
        expect(flags).toEqual([]);
    });

    it('returns empty array for empty text', () => {
        expect(hasRedFlags('')).toEqual([]);
    });
});

describe('requiresExternalVerification', () => {
    it('detects API mentions', () => {
        expect(requiresExternalVerification('Using the REST API to fetch data')).toBe(true);
    });

    it('detects library mentions', () => {
        expect(requiresExternalVerification('The library provides this feature')).toBe(true);
    });

    it('detects framework, method, and documentation mentions', () => {
        expect(requiresExternalVerification('This framework exposes a helper')).toBe(true);
        expect(requiresExternalVerification('Call this method with the right payload')).toBe(true);
        expect(requiresExternalVerification('Check the official documentation first')).toBe(true);
    });

    it('detects recent update phrasing', () => {
        expect(requiresExternalVerification('A recent update changed the API shape')).toBe(true);
    });

    it('detects version numbers', () => {
        expect(requiresExternalVerification('Version 2.0 introduced this')).toBe(true);
    });

    it('detects URLs', () => {
        expect(requiresExternalVerification('Check https://example.com for docs')).toBe(true);
    });

    it('returns false for internal content', () => {
        expect(requiresExternalVerification('The code handles the error case')).toBe(false);
    });
});

describe('verifyAntiHallucinationProtocol', () => {
    it('allows short messages without verification', () => {
        const result = verifyAntiHallucinationProtocol('Done');
        expect(result.ok).toBe(true);
    });

    it('allows internal discussion without verification', () => {
        const result = verifyAntiHallucinationProtocol('Let me think about the architecture approach');
        expect(result.ok).toBe(true);
    });

    it('flags missing source citations', () => {
        const result = verifyAntiHallucinationProtocol('The API method is getUser() which returns a user object');
        expect(result.ok).toBe(false);
        expect(result.issues).toContain('source citations for API/library claims');
    });

    it('flags missing confidence level', () => {
        const result = verifyAntiHallucinationProtocol('According to the documentation at https://example.com');
        expect(result.ok).toBe(false);
        expect(result.issues).toContain('confidence level (HIGH/MEDIUM/LOW)');
    });

    it('flags uncertainty with red flags and no tool evidence', () => {
        const result = verifyAntiHallucinationProtocol(
            'I think the API probably supports this feature based on the documentation I reviewed',
        );
        expect(result.ok).toBe(false);
    });

    it('allows compliant response', () => {
        const result = verifyAntiHallucinationProtocol(
            'According to the official documentation at https://api.example.com, ' +
                'the method is getUser(id: string): User. ' +
                '**Confidence**: HIGH. ' +
                'Source: https://api.example.com/docs',
        );
        expect(result.ok).toBe(true);
    });

    it('allows response with tool evidence even with red flags', () => {
        const result = verifyAntiHallucinationProtocol(
            'I think this method works, but I verified it with ' +
                'ref_search_documentation. Source: https://example.com. ' +
                '**Confidence**: HIGH',
        );
        expect(result.ok).toBe(true);
    });

    it('reports multiple issues together for weak externally sourced claims', () => {
        const result = verifyAntiHallucinationProtocol(
            'I believe the library has a method that might work for version 1.5',
        );

        expect(result.ok).toBe(false);
        expect(result.issues).toContain('source citations for API/library claims');
        expect(result.issues).toContain('confidence level (HIGH/MEDIUM/LOW)');
    });

    it('rejects verified-sounding code examples without citations', () => {
        const result = verifyAntiHallucinationProtocol(`
\`\`\`python
import requests
requests.get(url)
\`\`\`
This uses the requests library.
`);

        expect(result.ok).toBe(false);
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

    it('returns 0 for invalid JSON hook payloads', () => {
        const originalArguments = Bun.env.ARGUMENTS;
        Bun.env.ARGUMENTS = 'invalid json';

        try {
            expect(main()).toBe(0);
        } finally {
            if (originalArguments === undefined) {
                Bun.env.ARGUMENTS = undefined;
            } else {
                Bun.env.ARGUMENTS = originalArguments;
            }
        }
    });

    it('returns 0 when ARGUMENTS is empty', () => {
        const originalArguments = Bun.env.ARGUMENTS;
        Bun.env.ARGUMENTS = '';

        try {
            expect(main()).toBe(0);
        } finally {
            if (originalArguments === undefined) {
                Bun.env.ARGUMENTS = undefined;
            } else {
                Bun.env.ARGUMENTS = originalArguments;
            }
        }
    });

    it('returns 0 when there is no content to verify', () => {
        const originalArguments = Bun.env.ARGUMENTS;
        Bun.env.ARGUMENTS = JSON.stringify({
            messages: [{ role: 'user', content: 'hello' }],
        });

        try {
            expect(main()).toBe(0);
        } finally {
            if (originalArguments === undefined) {
                Bun.env.ARGUMENTS = undefined;
            } else {
                Bun.env.ARGUMENTS = originalArguments;
            }
        }
    });

    it('returns 1 for non-compliant externally sourced claims', () => {
        const originalArguments = Bun.env.ARGUMENTS;
        Bun.env.ARGUMENTS = JSON.stringify({
            messages: [
                {
                    role: 'assistant',
                    content:
                        'The API method is getUser() which returns a user object and was introduced in version 2.0.',
                },
            ],
        });

        try {
            expect(main()).toBe(1);
        } finally {
            if (originalArguments === undefined) {
                Bun.env.ARGUMENTS = undefined;
            } else {
                Bun.env.ARGUMENTS = originalArguments;
            }
        }
    });

    it('returns 0 for compliant externally sourced claims', () => {
        const originalArguments = Bun.env.ARGUMENTS;
        Bun.env.ARGUMENTS = JSON.stringify({
            messages: [
                {
                    role: 'assistant',
                    content:
                        'According to the official documentation at https://api.example.com, ' +
                        'the method is getUser(id: string): User. ' +
                        '**Confidence**: HIGH. Source: https://api.example.com/docs',
                },
            ],
        });

        try {
            expect(main()).toBe(0);
        } finally {
            if (originalArguments === undefined) {
                Bun.env.ARGUMENTS = undefined;
            } else {
                Bun.env.ARGUMENTS = originalArguments;
            }
        }
    });
});
