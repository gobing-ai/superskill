import { describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { replayCorpus, replayTranscript } from '../ah-replay';

/**
 * WHY these fixtures (falsification, not coverage theatre).
 *
 * The replay is the AC9 evidence: it claims the new policy blocks strictly fewer replies. Each
 * fixture below carries one of the two evidence halves the new policy credits — a citation in the
 * text and a verification tool in the turn — plus one reply with neither. If either half stops
 * being credited, or the old-block counter stops finding guard feedback, the counts move.
 */

const userPrompt = (text: string) => ({ type: 'user', message: { role: 'user', content: text } });
const assistantText = (text: string) => ({ type: 'assistant', message: { role: 'assistant', content: text } });
const toolUse = (name: string) => ({
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'tool_use', name, input: {} }] },
});
const toolResult = () => ({
    type: 'user',
    message: { role: 'user', content: [{ type: 'tool_result', content: 'ok' }] },
});
const feedback = (reason: string) => ({
    type: 'user',
    isMeta: true,
    message: { role: 'user', content: `Stop hook feedback:\n\nAdd verification for: ${reason}` },
});

const jsonl = (entries: unknown[]): string => `${entries.map((e) => JSON.stringify(e)).join('\n')}\n`;

describe('replayTranscript', () => {
    const cited = 'The API returns a list — see src/client.ts:42 for the call site.';
    const toolBacked = 'Version 2.3.0 deprecates the endpoint.';
    const unevidenced = 'The library requires Node 22 for this feature to work.';

    it('counts old blocks, keeps only the unevidenced one, and buckets the reasons', () => {
        const result = replayTranscript(
            jsonl([
                userPrompt('Q1'),
                assistantText(cited),
                feedback('confidence level (HIGH/MEDIUM/LOW)'),
                userPrompt('Q2'),
                toolUse('WebFetch'),
                toolResult(),
                assistantText(toolBacked),
                feedback('confidence level (HIGH/MEDIUM/LOW)'),
                userPrompt('Q3'),
                assistantText(unevidenced),
                feedback('source citations for API/library claims, confidence level (HIGH/MEDIUM/LOW)'),
            ]),
            'fixture.jsonl',
        );

        expect(result.oldBlocks).toBe(3);
        expect(result.newBlocks).toBe(1);
        expect(result.remaining).toEqual([{ file: 'fixture.jsonl', line: 11, excerpt: unevidenced }]);
        expect(result.histogram).toEqual({ confidence: 2, 'confidence+sources': 1 });
    });

    it('ignores non-feedback meta entries and malformed lines', () => {
        const result = replayTranscript(
            `${jsonl([
                userPrompt('Q'),
                assistantText(unevidenced),
                { type: 'user', isMeta: true, message: { role: 'user', content: 'other meta noise' } },
            ])}not json\n`,
        );

        expect(result.oldBlocks).toBe(0);
        expect(result.newBlocks).toBe(0);
        expect(result.histogram).toEqual({});
    });

    it('buckets an unrecognized old reason as `other`', () => {
        const result = replayTranscript(
            jsonl([userPrompt('Q'), assistantText(unevidenced), feedback('something retired')]),
        );

        expect(result.histogram).toEqual({ other: 1 });
        expect(result.newBlocks).toBe(1);
    });
});

describe('replayCorpus', () => {
    let dir: string;
    it('walks *.jsonl, skips subagents/, and reports the reduction percentage', () => {
        dir = mkdtempSync(join(tmpdir(), 'ah-replay-'));
        mkdirSync(join(dir, 'subagents'));
        const entries = [
            userPrompt('Q1'),
            assistantText('The API returns a list — see src/client.ts:42.'),
            feedback('confidence level (HIGH/MEDIUM/LOW)'),
            userPrompt('Q2'),
            assistantText('The library requires Node 22 for this feature to work.'),
            feedback('source citations for API/library claims, confidence level (HIGH/MEDIUM/LOW)'),
        ];
        writeFileSync(join(dir, 'session.jsonl'), jsonl(entries));
        // A subagent transcript must not be replayed: it would inflate both counters.
        writeFileSync(join(dir, 'subagents', 'agent.jsonl'), jsonl(entries));

        const result = replayCorpus(dir);
        rmSync(dir, { recursive: true, force: true });

        expect(result.files).toBe(1);
        expect(result.oldBlocks).toBe(2);
        expect(result.newBlocks).toBe(1);
        expect(result.reductionPct).toBe(50);
        expect(result.oldReasonHistogram).toEqual({ confidence: 1, 'confidence+sources': 1 });
    });

    it('reports zero rather than dividing by zero when no transcripts hold guard feedback', () => {
        dir = mkdtempSync(join(tmpdir(), 'ah-replay-empty-'));
        const result = replayCorpus(dir);
        rmSync(dir, { recursive: true, force: true });

        expect(result).toMatchObject({ files: 0, oldBlocks: 0, newBlocks: 0, reductionPct: 0 });
    });
});
