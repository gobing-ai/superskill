import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// The CLI twin is imported by this test only (0147 R4); production must not import `apps/cli`
// from a staged plugin script (ADR-024).
import {
    DEFAULT_STDIN_TIMEOUT_MS as CLI_DEFAULT_STDIN_TIMEOUT_MS,
    resolveStdinTimeoutMs as resolveStdinTimeoutMsFromCli,
} from '../../../../../apps/cli/src/stdin.ts';
import {
    buildStopOutput,
    DEFAULT_STDIN_TIMEOUT_MS,
    extractLastAssistantFromTranscript,
    extractLastAssistantMessage,
    hasConfidenceLevel,
    hasRedFlags,
    hasSourceCitations,
    hasToolUsageEvidence,
    main,
    readPipedStdin,
    readTranscriptForStop,
    requiresExternalVerification,
    resolveStdinTimeoutMs,
    resolveStopContext,
    runStopGuard,
    verifyAntiHallucinationProtocol,
} from '../ah_guard';
import { getEnvVar, setEnvVar } from '../lib/env';
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

    it('keeps weak vocabulary and assertion couplers sentence-local', () => {
        expect(
            requiresExternalVerification('The API change is local. The helper returns early when the list is empty.'),
        ).toBe(false);
        expect(
            requiresExternalVerification('The library wrapper is internal. A regression test was added for it.'),
        ).toBe(false);
        expect(requiresExternalVerification('The API change is local\nThe helper returns early when empty')).toBe(
            false,
        );
        expect(requiresExternalVerification('The API change is local.The helper returns early when empty.')).toBe(
            false,
        );
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

    it('residual-proof: passes local-change talk carrying a lifecycle verb (verb half, no external subject)', () => {
        // RESIDUAL-PROOF (compound-carrying): each sentence carries a lifecycle verb —
        // the half that used to fire bare as a STRONG pattern — and still must not fire,
        // because none names an external artifact. These are the most common sentences in
        // a coding summary; firing on them demanded citations for the agent's own edits
        // and blocked nearly every substantive Stop. Regression for the live block observed
        // on "the tests fail loudly if the re-arm is removed".
        expect(requiresExternalVerification('A regression test was added for the truncation case.')).toBe(false);
        expect(requiresExternalVerification('The rule exclusion was removed and the gate covers it.')).toBe(false);
        expect(requiresExternalVerification('The tests fail loudly if the re-arm is removed.')).toBe(false);
        expect(requiresExternalVerification('The helper is renamed to readPipedStdin.')).toBe(false);
        expect(requiresExternalVerification('Two fixtures were added under the rules folder.')).toBe(false);
    });

    it('still fires when a lifecycle verb has an external subject (both halves present)', () => {
        // The other side of the same gate: weak keyword ∧ lifecycle verb is a real external
        // claim and must keep demanding verification.
        expect(requiresExternalVerification('The package was removed from the registry.')).toBe(true);
        expect(requiresExternalVerification('That SDK is deprecated.')).toBe(true);
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

    it('does not let short external claims smuggle past the length floor', () => {
        // WHY: length < 50 used to allow *any* short text, so "The API returns a list."
        // (needsVerification=true, no citation) exited ok:true. The floor only applies to
        // short *internal* notes; short external claims still need the protocol.
        const shortApi = verifyAntiHallucinationProtocol('The API returns a list.');
        expect(shortApi.ok).toBe(false);
        expect(shortApi.issues).toContain('source citations for API/library claims');

        const shortLib = verifyAntiHallucinationProtocol('This library supports OAuth.');
        expect(shortLib.ok).toBe(false);

        // Still allow short non-claims.
        expect(verifyAntiHallucinationProtocol('LGTM')).toBeTruthy();
        expect(verifyAntiHallucinationProtocol('LGTM').ok).toBe(true);
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

describe('buildStopOutput — prevent-stop profiles', () => {
    const fail = { ok: false, reason: 'Add verification for: x' };

    it('block profile: block → decision:block + hookEventName:Stop', () => {
        const parsed = JSON.parse(buildStopOutput(fail, 'block'));
        expect(parsed.decision).toBe('block');
        expect(parsed.reason).toBe('Add verification for: x');
        expect(parsed.hookSpecificOutput.hookEventName).toBe('Stop');
    });

    it('block profile: allow → bare Stop envelope, no decision', () => {
        const parsed = JSON.parse(buildStopOutput({ ok: true, reason: 'Task is complete' }, 'block'));
        expect(parsed.decision).toBeUndefined();
        expect(parsed.hookSpecificOutput.hookEventName).toBe('Stop');
    });

    it('deny profile: block → decision:deny + hookEventName:AfterAgent (Gemini/Antigravity)', () => {
        const parsed = JSON.parse(buildStopOutput(fail, 'deny'));
        expect(parsed.decision).toBe('deny');
        expect(parsed.reason).toBe('Add verification for: x');
        expect(parsed.hookSpecificOutput.hookEventName).toBe('AfterAgent');
    });

    it('deny profile: allow → bare AfterAgent envelope, no decision', () => {
        const parsed = JSON.parse(buildStopOutput({ ok: true, reason: 'ok' }, 'deny'));
        expect(parsed.decision).toBeUndefined();
        expect(parsed.hookSpecificOutput.hookEventName).toBe('AfterAgent');
    });

    it('defaults to the block profile', () => {
        expect(JSON.parse(buildStopOutput(fail)).decision).toBe('block');
        expect(JSON.parse(buildStopOutput(fail)).hookSpecificOutput.hookEventName).toBe('Stop');
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
        const originalArguments = getEnvVar('ARGUMENTS');
        setEnvVar('ARGUMENTS', 'invalid json');

        try {
            expect(main()).toBe(0);
        } finally {
            if (originalArguments === undefined) {
                setEnvVar('ARGUMENTS', undefined);
            } else {
                setEnvVar('ARGUMENTS', originalArguments);
            }
        }
    });

    it('returns 0 when ARGUMENTS is empty', () => {
        const originalArguments = getEnvVar('ARGUMENTS');
        setEnvVar('ARGUMENTS', '');

        try {
            expect(main()).toBe(0);
        } finally {
            if (originalArguments === undefined) {
                setEnvVar('ARGUMENTS', undefined);
            } else {
                setEnvVar('ARGUMENTS', originalArguments);
            }
        }
    });

    it('returns 0 when there is no content to verify', () => {
        const originalArguments = getEnvVar('ARGUMENTS');
        setEnvVar(
            'ARGUMENTS',
            JSON.stringify({
                messages: [{ role: 'user', content: 'hello' }],
            }),
        );

        try {
            expect(main()).toBe(0);
        } finally {
            if (originalArguments === undefined) {
                setEnvVar('ARGUMENTS', undefined);
            } else {
                setEnvVar('ARGUMENTS', originalArguments);
            }
        }
    });

    it('returns 0 with a decision:"block" JSON for non-compliant externally sourced claims', () => {
        // WHY 0: Claude Code honors stdout JSON only at exit 0 — the block rides on the
        // `decision:"block"` + `reason` JSON that main() writes, not on exit 2 (which would
        // discard that JSON and surface stderr as a "blocking error"). Exit 1 is a non-blocking
        // error and could never block a Stop.
        const originalArguments = getEnvVar('ARGUMENTS');
        setEnvVar(
            'ARGUMENTS',
            JSON.stringify({
                messages: [
                    {
                        role: 'assistant',
                        content:
                            'The API method is getUser() which returns a user object and was introduced in version 2.0.',
                    },
                ],
            }),
        );

        try {
            expect(main()).toBe(0);
        } finally {
            if (originalArguments === undefined) {
                setEnvVar('ARGUMENTS', undefined);
            } else {
                setEnvVar('ARGUMENTS', originalArguments);
            }
        }
    });

    it('returns 0 for compliant externally sourced claims', () => {
        const originalArguments = getEnvVar('ARGUMENTS');
        setEnvVar(
            'ARGUMENTS',
            JSON.stringify({
                messages: [
                    {
                        role: 'assistant',
                        content:
                            'According to the official documentation at https://api.example.com, ' +
                            'the method is getUser(id: string): User. ' +
                            '**Confidence**: HIGH. Source: https://api.example.com/docs',
                    },
                ],
            }),
        );

        try {
            expect(main()).toBe(0);
        } finally {
            if (originalArguments === undefined) {
                setEnvVar('ARGUMENTS', undefined);
            } else {
                setEnvVar('ARGUMENTS', originalArguments);
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
        // Residual TLDs that previously cleared the gate (expanded denylist).
        expect(hasSourceCitations('foo.test:1 is not a file anchor')).toBe(false);
        expect(hasSourceCitations('svc.xyz:9000 is up')).toBe(false);
        expect(hasSourceCitations('edge.cloud:443')).toBe(false);
        expect(hasSourceCitations('ah_guard.ts:288')).toBe(true);
        expect(hasSourceCitations('see main.py:42 and lib.rs:7')).toBe(true);
        expect(hasSourceCitations('foo.ts:12-20')).toBe(true);
        // Code extensions that must never be denylisted as TLDs.
        expect(hasSourceCitations('setup.sh:5')).toBe(true);
        expect(hasSourceCitations('main.rs:10')).toBe(true);
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

describe('R1: blank assistant turns are skipped on both channels', () => {
    // WHY (0147 F1): `String(undefined)` and `String(null)` are non-empty words, so a trailing
    // assistant turn with no `content` field (or `content: null`) was returned as the message and
    // hid the previous real claim. Both channels must skip blank turns and keep scanning.
    const PRIOR = 'The library version 2.3.1 is required and the API returns paginated lists from the public endpoint.';

    let dir: string;
    let transcriptPath: string;

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'ah-guard-'));
        transcriptPath = join(dir, 'transcript.jsonl');
    });

    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
    });

    const withTempTranscript = (lines: string[]): string => {
        writeFileSync(transcriptPath, `${lines.join('\n')}\n`);
        return transcriptPath;
    };

    const priorTurn = JSON.stringify({
        type: 'assistant',
        message: { role: 'assistant', content: [{ type: 'text', text: PRIOR }] },
    });

    it('omitted-content regression: a trailing assistant with no content field does not hide the claim', () => {
        const path = withTempTranscript([
            priorTurn,
            JSON.stringify({ type: 'assistant', message: { role: 'assistant' } }),
        ]);
        const result = runStopGuard(undefined, JSON.stringify({ transcript_path: path, stop_hook_active: false }));
        const parsed = JSON.parse(result.output);
        expect(parsed.decision).toBe('block');
        expect(parsed.reason).toContain('source citations');
    });

    it('null-content regression: `content: null` does not hide the claim', () => {
        const path = withTempTranscript([
            priorTurn,
            JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: null } }),
        ]);
        const result = runStopGuard(undefined, JSON.stringify({ transcript_path: path, stop_hook_active: false }));
        const parsed = JSON.parse(result.output);
        expect(parsed.decision).toBe('block');
        expect(parsed.reason).toContain('source citations');
    });

    it('messages channel: skips a trailing blank assistant and returns the prior claim', () => {
        expect(
            extractLastAssistantMessage({ messages: [{ role: 'assistant', content: PRIOR }, { role: 'assistant' }] }),
        ).toBe(PRIOR);
        expect(
            extractLastAssistantMessage({
                messages: [
                    { role: 'assistant', content: PRIOR },
                    { role: 'assistant', content: null },
                ],
            }),
        ).toBe(PRIOR);
        expect(
            extractLastAssistantMessage({
                messages: [
                    { role: 'assistant', content: PRIOR },
                    { role: 'assistant', content: '' },
                ],
            }),
        ).toBe(PRIOR);
        expect(
            extractLastAssistantMessage({
                messages: [
                    { role: 'assistant', content: PRIOR },
                    { role: 'assistant', content: [{ type: 'tool_use' }] },
                ],
            }),
        ).toBe(PRIOR);
    });

    it('returns undefined when no assistant has text, and honors a non-blank last_message then', () => {
        expect(extractLastAssistantMessage({ messages: [{ role: 'assistant', content: null }] })).toBeUndefined();
        expect(
            extractLastAssistantMessage({ messages: [{ role: 'assistant', content: null }], last_message: PRIOR }),
        ).toBe(PRIOR);
    });

    it('treats the literal string `undefined` as real payload, not a missing field', () => {
        expect(extractLastAssistantMessage({ last_message: 'undefined' })).toBe('undefined');
    });

    it('yields undefined for a blank last_message', () => {
        expect(extractLastAssistantMessage({ last_message: '   ' })).toBeUndefined();
    });

    it('tool_use-only transcript regression: the last textual turn still blocks', () => {
        const path = withTempTranscript([
            priorTurn,
            JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use' }] } }),
        ]);
        const result = runStopGuard(undefined, JSON.stringify({ transcript_path: path, stop_hook_active: false }));
        expect(JSON.parse(result.output).decision).toBe('block');
    });
});

/**
 * The direct-invocation stdin reader. Mirrors `apps/cli/src/stdin.ts` and exists for the
 * same reason: a host that holds fd 0 open without writing must not hang this script, and
 * a payload streamed in several writes must never be truncated (a truncated Stop payload
 * silently degrades the guard to allow).
 */
describe('readPipedStdin', () => {
    const origTty = process.stdin.isTTY;
    const origTimeout = getEnvVar('SUPERSKILL_STDIN_TIMEOUT_MS');
    const setTty = (value: boolean) => Object.defineProperty(process.stdin, 'isTTY', { value, configurable: true });

    afterEach(() => {
        Object.defineProperty(process.stdin, 'isTTY', { value: origTty, configurable: true });
        // Restores absence when the var was unset (`setEnvVar(k, undefined)` deletes it).
        setEnvVar('SUPERSKILL_STDIN_TIMEOUT_MS', origTimeout);
        process.stdin.pause();
    });

    it('returns empty string on an interactive TTY (manual invocation, nothing piped)', async () => {
        setTty(true);
        expect(await readPipedStdin(10)).toBe('');
    });

    it('returns the payload on data + end', async () => {
        setTty(false);
        const promise = readPipedStdin(500);
        process.stdin.emit('data', Buffer.from('{"stop_hook_active":false}'));
        process.stdin.emit('end');
        expect(await promise).toBe('{"stop_hook_active":false}');
    });

    // Regression (hang): the blocking readFileSync(0) this replaced never returned here.
    it('gives up within the budget when a host holds stdin open without writing', async () => {
        setTty(false);
        const started = Date.now();
        expect(await readPipedStdin(40)).toBe('');
        expect(Date.now() - started).toBeLessThan(2000);
    });

    // Regression (truncation): per-chunk gaps stay under the budget, total span exceeds it.
    it('accumulates chunks whose total span exceeds the idle budget', async () => {
        setTty(false);
        const chunks = ['{"transcript_path"', ':"/tmp/t.jsonl",', '"stop_hook_active":false}'];
        const promise = readPipedStdin(120);
        chunks.forEach((chunk, i) => {
            setTimeout(() => process.stdin.emit('data', Buffer.from(chunk)), 60 * (i + 1));
        });
        setTimeout(() => process.stdin.emit('end'), 60 * (chunks.length + 1));
        const res = await promise;
        expect(res).toBe(chunks.join(''));
        expect(() => JSON.parse(res)).not.toThrow();
    });

    it('discards a partial buffer when the stream errors', async () => {
        // A stream error can mean the payload is truncated; verify nothing rather than half.
        setTty(false);
        const promise = readPipedStdin(500);
        process.stdin.emit('data', Buffer.from('PARTIAL'));
        process.stdin.emit('error', new Error('boom'));
        expect(await promise).toBe('');
    });

    it('reads whitespace-only input as empty', async () => {
        setTty(false);
        const promise = readPipedStdin(500);
        process.stdin.emit('data', Buffer.from('   \n  '));
        process.stdin.emit('end');
        expect(await promise).toBe('');
    });

    it('defaults the idle budget from SUPERSKILL_STDIN_TIMEOUT_MS', async () => {
        setTty(false);
        setEnvVar('SUPERSKILL_STDIN_TIMEOUT_MS', '80');
        const started = Date.now();
        expect(await readPipedStdin()).toBe('');
        expect(Date.now() - started).toBeLessThan(1000);
    });
});

describe('R4: the staged stdin timeout resolver matches the CLI twin', () => {
    // WHY (0147 F4): `readPipedStdin` is a deliberate copy of the CLI reader; the CLI later gained
    // `resolveStdinTimeoutMs`, so the copy's hard-coded 250 drifted. This locks the two together.
    it('shares the default and resolves the same number for one env record', () => {
        expect(DEFAULT_STDIN_TIMEOUT_MS).toBe(CLI_DEFAULT_STDIN_TIMEOUT_MS);
        for (const raw of ['', '0', '-1', 'foo', '400', '250']) {
            const env = { SUPERSKILL_STDIN_TIMEOUT_MS: raw };
            expect(resolveStdinTimeoutMs(env)).toBe(resolveStdinTimeoutMsFromCli(env));
        }
        expect(resolveStdinTimeoutMs({ SUPERSKILL_STDIN_TIMEOUT_MS: '400' })).toBe(400);
        expect(resolveStdinTimeoutMs({ SUPERSKILL_STDIN_TIMEOUT_MS: '250' })).toBe(250);
        expect(resolveStdinTimeoutMs({ SUPERSKILL_STDIN_TIMEOUT_MS: 'foo' })).toBe(DEFAULT_STDIN_TIMEOUT_MS);
    });
});

describe('R2: a filename dot does not end the sentence', () => {
    // WHY (0147 F2): the splitter's `(?=\S)` alternative fired on the `m` in `readme.md`,
    // the `j` in `lodash.js` and the `t` in `service.ts`, so the weak keyword and its
    // coupler landed in different fragments and the claim was allowed. These three are
    // each ONE grammatical sentence and must demand verification.
    const FILENAME_CLAIMS = [
        'The API documented in readme.md returns a paginated list.',
        'The library (see lodash.js) returns a Buffer.',
        'The endpoint in service.ts returns 404 for unknown ids.',
    ];

    it('keeps filename dots inside one grammatical sentence', () => {
        for (const claim of FILENAME_CLAIMS) {
            expect(requiresExternalVerification(claim)).toBe(true);
        }
    });

    it('blocks each filename claim when it carries no citation and no confidence line', () => {
        for (const claim of FILENAME_CLAIMS) {
            expect(verifyAntiHallucinationProtocol(claim).ok).toBe(false);
        }
    });
});

describe('R3: past-tense and modal capability couplers', () => {
    // WHY (0147 F3): couplers were present tense only, so `returned`, `accepted`,
    // `exposed`, and `will return` never fired and the claim passed unverified.
    it('fires on past-tense and modal assertions about an external artifact', () => {
        expect(requiresExternalVerification('The library returned a Buffer from decode.')).toBe(true);
        expect(requiresExternalVerification('The API accepted a null body and returned 204.')).toBe(true);
        expect(requiresExternalVerification('The framework exposed a helper for retries.')).toBe(true);
        expect(requiresExternalVerification('The API will return a paginated list of users.')).toBe(true);
    });

    it('residual-proof: passes past-tense local-code talk (coupler, no external keyword)', () => {
        // RESIDUAL-PROOF (compound-carrying): the sentence carries the new past-tense coupler
        // (`returned`) — the half that used to be missing — and still must not fire, because
        // `function` is not a weak keyword. Guards against re-adding `function`/`method`.
        expect(requiresExternalVerification('The function returned early when the list was empty.')).toBe(false);
    });
});

describe('R6: confidence words are whole words', () => {
    // WHY (0147 F6): the old patterns matched a level as a prefix, so `HIGHWAY`,
    // `HIGHly uncertain`, `LOWER` and `MEDIUM-rare` all read as a declared confidence
    // level and silently satisfied the protocol.
    it('rejects a level that is only a word prefix', () => {
        expect(hasConfidenceLevel('Confidence: HIGHWAY')).toBe(false);
        expect(hasConfidenceLevel('Confidence: HIGHly uncertain')).toBe(false);
        expect(hasConfidenceLevel('Confidence: LOWER')).toBe(false);
        expect(hasConfidenceLevel('Confidence: MEDIUM-rare')).toBe(false);
    });

    it('rejects a `### Confidence` heading with no level nearby', () => {
        expect(hasConfidenceLevel('### Confidence\n\nI am unsure about the API.')).toBe(false);
    });

    it('still blocks a bogus confidence word on a real claim', () => {
        const result = verifyAntiHallucinationProtocol(
            'Confidence: HIGHWAY\nThe API returns a paginated list.\nplugins/cc/plugin.json:1',
        );
        expect(result.ok).toBe(false);
        expect(result.issues).toContain('confidence level (HIGH/MEDIUM/LOW)');
    });
});

describe('R7: the transcript reader is bounded and refuses non-regular files', () => {
    // WHY (0147 F7): `resolveStopContext` used a bare `readFileSync(path)`, so a directory, a fifo
    // or a multi-hundred-megabyte transcript could stall inside the 10 s hook budget. The reader
    // must refuse non-regular files and read only the tail of a large one.
    const PRIOR = 'The library version 2.3.1 is required and the API returns paginated lists from the public endpoint.';

    let dir: string;
    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'ah-guard-tail-'));
    });
    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
    });

    it('a directory transcript_path fails open as transcript unavailable', () => {
        const resolved = resolveStopContext(undefined, JSON.stringify({ transcript_path: dir }));
        expect(resolved.content).toBeUndefined();
        expect(resolved.allowReason).toContain('transcript unavailable');
    });

    it('a symlink to a regular transcript is still read', () => {
        const real = join(dir, 'real.jsonl');
        writeFileSync(
            real,
            `${JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: PRIOR } })}\n`,
        );
        const link = join(dir, 'link.jsonl');
        symlinkSync(real, link);
        const resolved = resolveStopContext(undefined, JSON.stringify({ transcript_path: link }));
        expect(resolved.content).toBe(PRIOR);
    });

    it('reads only the tail of a file larger than the cap', () => {
        const line = JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: 'tail-claim' } });
        const path = join(dir, 'big.jsonl');
        writeFileSync(path, `${'X'.repeat(200)}\n${line}\n`);
        const tail = readTranscriptForStop(path, 80);
        expect(tail).not.toContain('X');
        expect(JSON.parse(tail).message.content).toBe('tail-claim');
        expect(extractLastAssistantFromTranscript(tail)).toBe('tail-claim');
    });

    it('returns a small file unchanged under the default cap', () => {
        const path = join(dir, 'small.jsonl');
        writeFileSync(path, '{"ok":true}\n');
        expect(readTranscriptForStop(path)).toBe('{"ok":true}\n');
    });

    it('returns empty when the tail contains no complete line', () => {
        const path = join(dir, 'noline.txt');
        writeFileSync(path, 'no-newline-at-all');
        expect(readTranscriptForStop(path, 16)).toBe('');
    });
});
