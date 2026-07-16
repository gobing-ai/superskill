import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
    extractLastAssistantFromTranscript,
    extractLastAssistantMessage,
    hasConfidenceLevel,
    hasRedFlags,
    hasSourceCitations,
    hasToolUsageEvidence,
    main,
    requiresExternalVerification,
    resolveStopContext,
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

    it('detects bold-on-value confidence', () => {
        // `Confidence: **HIGH**` (bold value, plain label) — the format the guard
        // previously missed, causing every Stop hook to block despite a present level.
        expect(hasConfidenceLevel('Confidence: **HIGH** — verified via endpoint')).toBe(true);
        expect(hasConfidenceLevel('Confidence: **MEDIUM**')).toBe(true);
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
    // WHY (0077 R1): the guard is live on every Stop — bare vocabulary triggering
    // verification would nag on nearly every substantive coding reply. Only
    // assertion-shaped external claims may demand citations.

    it('baseline: passes ordinary implementation talk that uses bare vocabulary with no coupler', () => {
        // BASELINE (bare-half regression): none of these carry a capability coupler, so they
        // only prove the bare weak keyword alone does not fire. They cannot certify the
        // compound residual (keyword + coupler) is handled — see the residual-proof case below.
        expect(requiresExternalVerification('Added a helper function for the parser')).toBe(false);
        expect(requiresExternalVerification('Refactored the method and renamed the local variable')).toBe(false);
        expect(requiresExternalVerification('Using the REST API to fetch data')).toBe(false);
        expect(requiresExternalVerification('Call this method with the right payload')).toBe(false);
        expect(requiresExternalVerification('Check the official documentation first')).toBe(false);
    });

    it('residual-proof: passes local-code talk that carries a capability coupler (keyword + coupler, still false)', () => {
        // RESIDUAL-PROOF (compound-carrying): these carry both a weak-name (`function`/`method`)
        // AND a coupler (`returns`/`accepts`/`throws`/`emits`) — the exact shape that fired as a
        // false positive in 0077 R1's residual. They name local code, not an external artifact,
        // so they must stay false after `function`/`method` were dropped from the weak set.
        expect(requiresExternalVerification('The function returns early when the list is empty.')).toBe(false);
        expect(requiresExternalVerification('I refactored the method so it accepts a second argument.')).toBe(false);
        expect(requiresExternalVerification('This helper function throws when the path is missing.')).toBe(false);
        expect(requiresExternalVerification('I added a function that emits a warning on bad input.')).toBe(false);
    });

    it('detects weak vocabulary coupled with a capability assertion', () => {
        expect(requiresExternalVerification('The library provides this feature')).toBe(true);
        expect(requiresExternalVerification('This framework exposes a helper')).toBe(true);
        expect(requiresExternalVerification('The API returns a paginated list')).toBe(true);
    });

    it('detects lifecycle assertions about external artifacts', () => {
        expect(requiresExternalVerification('The endpoint was deprecated last year')).toBe(true);
        expect(requiresExternalVerification('According to the maintainers, this is intended')).toBe(true);
        expect(requiresExternalVerification('The documentation states the flag is required')).toBe(true);
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

    it('rejects capability claims about external libraries without citations', () => {
        // WHY (0077 R1): naming a library beside code is ordinary talk, but asserting what
        // it supports is an external claim that needs a source.
        const result = verifyAntiHallucinationProtocol(`
\`\`\`python
import requests
requests.get(url)
\`\`\`
This uses the requests library, which supports automatic connection pooling.
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

    it('returns 2 for non-compliant externally sourced claims (universal block signal)', () => {
        // WHY 2: Claude Code treats exit 1 as a non-blocking error — only exit 2 (stderr fed to
        // the model) or exit 0 + decision JSON can block a Stop. Exit 1 could never block.
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
            expect(main()).toBe(2);
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

describe('resolveStopContext', () => {
    const failingClaim =
        'The library version 2.3.1 API method should probably work — I believe the framework function handles it.';

    it('prefers the ARGUMENTS channel when set (legacy/test contract)', () => {
        const args = JSON.stringify({ messages: [{ role: 'assistant', content: 'from arguments' }] });
        const stdin = JSON.stringify({ messages: [{ role: 'assistant', content: 'from stdin' }] });
        expect(resolveStopContext(args, stdin).content).toBe('from arguments');
    });

    it('reads the omp agent_end event shape from stdin when ARGUMENTS is unset', () => {
        // WHY: omp's generated hook module forwards its agent_end event ({type, messages}) on
        // stdin. Before the stdin channel existed, the guard resolved an empty context and
        // allowed everything — permanently fail-open in production.
        const stdin = JSON.stringify({ type: 'agent_end', messages: [{ role: 'assistant', content: failingClaim }] });
        expect(resolveStopContext(undefined, stdin).content).toBe(failingClaim);
    });

    it('reads the Claude Stop payload from stdin via transcript_path', () => {
        const transcript = [
            JSON.stringify({ type: 'user', message: { role: 'user', content: 'q' } }),
            JSON.stringify({
                type: 'assistant',
                message: { role: 'assistant', content: [{ type: 'text', text: failingClaim }] },
            }),
        ].join('\n');
        const resolved = resolveStopContext(
            undefined,
            JSON.stringify({ transcript_path: '/fake.jsonl' }),
            () => transcript,
        );
        expect(resolved.content).toBe(failingClaim);
    });

    it('allows immediately when stop_hook_active is true (block-loop guard)', () => {
        // WHY: Claude sets stop_hook_active=true when the agent already continued because this
        // hook blocked once. Verifying again would block forever and wedge the agent.
        const resolved = resolveStopContext(
            undefined,
            JSON.stringify({ transcript_path: '/fake.jsonl', stop_hook_active: true }),
            () => {
                throw new Error('must not read the transcript on the loop-guard path');
            },
        );
        expect(resolved.allowReason).toContain('loop guard');
        expect(resolved.content).toBeUndefined();
    });

    it('fails open on unreadable transcript, invalid JSON, and empty stdin', () => {
        const unreadable = resolveStopContext(undefined, JSON.stringify({ transcript_path: '/gone.jsonl' }), () => {
            throw new Error('ENOENT');
        });
        expect(unreadable.allowReason).toContain('transcript unavailable');

        expect(resolveStopContext(undefined, 'not json').allowReason).toContain('invalid context');
        expect(resolveStopContext(undefined, '')).toEqual({});
        expect(resolveStopContext('not json', '').allowReason).toContain('invalid context');
    });
});
// 0079: version-number false-positive regression. A metrics-dense verification verdict
// (coverage %, test counts, file:line anchors, exit codes) must NOT read as a version claim.
describe('requiresExternalVerification (0079: metrics are not versions)', () => {
    // WHY (0079 R1): the broad /\bv?\d+\.\d+\b/ regex treated ANY d.d decimal as a software
    // version, so coverage percentages (94.87%), ratios, and durations tripped the gate on
    // exactly the turns that are most rigorously evidenced. A decimal needs a version cue
    // (v-prefix, "version"/"release" word, or 3-part semver) to count.
    const metricsVerdict = [
        'Verdict: PASS.',
        'Coverage: func 94.87%, line 100.00%.',
        'Test result: 1626 pass / 0 fail.',
        'Evidence: ah_guard.ts:288, foo.ts:12-20, bar.rs:8.',
        'Exit code: 0.',
    ].join(' ');

    it('passes a metrics-dense verification verdict (the incident payload)', () => {
        expect(requiresExternalVerification(metricsVerdict)).toBe(false);
    });

    it('passes bare 2-part metric decimals without a version cue', () => {
        expect(requiresExternalVerification('coverage 94.87% line 100.00%')).toBe(false);
        expect(requiresExternalVerification('ratio 1.5 p95 1.2')).toBe(false);
        expect(requiresExternalVerification('took 1.5s wall 0.3s')).toBe(false);
    });

    it('still detects genuine version references (intended positives preserved)', () => {
        expect(requiresExternalVerification('Version 2.0 introduced this')).toBe(true);
        expect(requiresExternalVerification('the library version 2.3.1 is required')).toBe(true);
        expect(requiresExternalVerification('introduced in version 2.0.')).toBe(true);
        expect(requiresExternalVerification('built for version 1.5')).toBe(true);
        expect(requiresExternalVerification('shipped as v2.0')).toBe(true);
        expect(requiresExternalVerification('semver 1.2.3 is the floor')).toBe(true);
        expect(requiresExternalVerification('pinned at 1.2.3')).toBe(true);
    });
});

describe('verifyAntiHallucinationProtocol (0079: metrics verdict is not blocked)', () => {
    const metricsVerdict = [
        'Verdict: PASS.',
        'Coverage: func 94.87%, line 100.00%.',
        'Test result: 1626 pass / 0 fail.',
        'Evidence: ah_guard.ts:288, foo.ts:12-20, bar.rs:8.',
        'Exit code: 0.',
    ].join(' ');

    it('allows a metrics-dense verification verdict without demanding Source:/confidence', () => {
        const result = verifyAntiHallucinationProtocol(metricsVerdict);
        expect(result.ok).toBe(true);
        expect(result.issues).toBeUndefined();
    });

    it('still blocks an uncited external claim that mentions a version (guard keeps teeth)', () => {
        // WHY (0079 R4): the guard must still block when a real external claim is made
        // without ANY citation. R1/R2 must not over-broaden into "everything passes."
        const result = verifyAntiHallucinationProtocol(
            'The framework exposes a helper since version 2.0 and the API returns paginated lists.',
        );
        expect(result.ok).toBe(false);
        expect(result.issues).toContain('source citations for API/library claims');
    });
});

describe('hasSourceCitations (0079: credit engineering evidence)', () => {
    // WHY (0079 R2): coding agents cite via file:line anchors and pasted command output,
    // not Source: URLs. Recognizing these forms stops evidence-dense replies from being
    // nagged for a URL citation they never needed. A bare code fence is NOT credited — too
    // broad, would neuter the guard.
    it('credits a file:line anchor', () => {
        expect(hasSourceCitations('Fixed the regex at ah_guard.ts:288 and foo.ts:12-20')).toBe(true);
    });

    it('credits an exit-code line', () => {
        expect(hasSourceCitations('Ran the suite: exit 0')).toBe(true);
        expect(hasSourceCitations('bun test: exit code 0')).toBe(true);
    });

    it('credits a pasted test-result line', () => {
        expect(hasSourceCitations('1626 pass / 0 fail')).toBe(true);
        expect(hasSourceCitations('3 passed and 0 failed')).toBe(true);
    });

    it('does NOT credit a bare fenced code block alone', () => {
        const fencedOnly = '```\nconst x = 1;\n```';
        expect(hasSourceCitations(fencedOnly)).toBe(false);
    });

    it('still requires some evidence for an uncited external claim', () => {
        expect(hasSourceCitations('The library provides this feature')).toBe(false);
        expect(hasSourceCitations('I think this works')).toBe(false);
    });

    it('does not credit a hostname:port as a file:line anchor', () => {
        // WHY: `example.com:8080` structurally matches `name.ext:digits`, so mentioning a server
        // address would clear the citation gate. A TLD is not evidence. Denylisting TLDs (rather
        // than allowlisting code extensions) keeps every real anchor credited — an unknown
        // extension must never cost a citation, since that blocks an evidenced reply.
        expect(hasSourceCitations('Server runs at example.com:8080 locally.')).toBe(false);
        expect(hasSourceCitations('redis.local:6379 is up')).toBe(false);
        expect(hasSourceCitations('hit api.example.io:443 directly')).toBe(false);
        expect(hasSourceCitations('ah_guard.ts:288')).toBe(true);
        expect(hasSourceCitations('see main.py:42 and lib.rs:7')).toBe(true);
        expect(hasSourceCitations('foo.ts:12-20')).toBe(true);
    });
});

describe('extractLastAssistantFromTranscript', () => {
    it('skips trailing tool_use-only assistant turns and returns the last textual turn', () => {
        // WHY: the verifiable claim lives in the last assistant turn that carries text; a
        // trailing tool_use-only entry (common at stop time) has nothing to verify.
        const transcript = [
            JSON.stringify({
                type: 'assistant',
                message: { role: 'assistant', content: [{ type: 'text', text: 'the real claim' }] },
            }),
            JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use' }] } }),
        ].join('\n');
        expect(extractLastAssistantFromTranscript(transcript)).toBe('the real claim');
    });

    it('returns undefined for empty, malformed, or assistant-free transcripts', () => {
        expect(extractLastAssistantFromTranscript('')).toBeUndefined();
        expect(extractLastAssistantFromTranscript('garbage\n{broken')).toBeUndefined();
        expect(
            extractLastAssistantFromTranscript(
                JSON.stringify({ type: 'user', message: { role: 'user', content: 'q' } }),
            ),
        ).toBeUndefined();
    });
});
