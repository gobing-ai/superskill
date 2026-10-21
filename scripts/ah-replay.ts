#!/usr/bin/env bun
/**
 * Replay recorded Claude Code transcripts against the H21 evidence policy.
 *
 * Every `isMeta: true` user entry starting `Stop hook feedback:` is a block the **old** policy
 * produced (the guard wrote exactly that shape). The new policy is a strict subset of the old one
 * — a claim with no citation in the text or the turn was blocked then too — so replaying only
 * those entries counts every block the new policy would still produce without keeping the deleted
 * code around.
 *
 * Usage: `bun scripts/ah-replay.ts [root=~/.claude/projects]`
 * Prints `{files, oldBlocks, newBlocks, reductionPct, oldReasonHistogram, remaining}` as JSON.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
    extractLastAssistantFromTranscript,
    extractTurnToolNames,
    verifyAntiHallucinationProtocol,
} from '../plugins/cc/scripts/anti-hallucination/ah_guard';

/** One still-blocked reply, with enough context to judge whether it is a false positive. */
export interface RemainingBlock {
    file: string;
    /** 1-based line number of the guard-feedback entry that flagged it. */
    line: number;
    /** First 160 characters of the reply text the new policy still blocks. */
    excerpt: string;
}

/** Per-transcript replay outcome. */
export interface TranscriptReplay {
    oldBlocks: number;
    newBlocks: number;
    remaining: RemainingBlock[];
    /** Blocked-entry count keyed by the sorted issue heads the old reason named. */
    histogram: Record<string, number>;
}

const FEEDBACK_PREFIX = 'Stop hook feedback:';
const OLD_REASON_PREFIX = 'Add verification for: ';

/** Old-policy issue markers, mapped to the short head used in the histogram key. */
const ISSUE_HEADS: Array<[marker: string, head: string]> = [
    ['confidence level', 'confidence'],
    ['source citations', 'sources'],
    ['uncertainty phrases', 'uncertainty'],
];

/** Histogram key for an old block reason: sorted short heads, or `other` when unrecognized. */
function reasonKey(reason: string): string {
    const heads = ISSUE_HEADS.filter(([marker]) => reason.includes(marker))
        .map(([, head]) => head)
        .sort();
    return heads.length > 0 ? heads.join('+') : 'other';
}

/**
 * Replay one transcript. Pure: no I/O, so the counter logic is testable against fixtures.
 * `file` only labels the `remaining` entries.
 */
export function replayTranscript(jsonl: string, file = 'transcript'): TranscriptReplay {
    const lines = jsonl.split('\n');
    const replay: TranscriptReplay = { oldBlocks: 0, newBlocks: 0, remaining: [], histogram: {} };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]?.trim();
        if (!line) continue;
        let entry: { type?: string; isMeta?: boolean; message?: { content?: unknown } };
        try {
            entry = JSON.parse(line);
        } catch {
            continue;
        }
        const content = entry.message?.content;
        if (entry.type !== 'user' || entry.isMeta !== true) continue;
        if (typeof content !== 'string' || !content.startsWith(FEEDBACK_PREFIX)) continue;

        replay.oldBlocks += 1;
        const reason = content.slice(content.indexOf(OLD_REASON_PREFIX) + OLD_REASON_PREFIX.length);
        const key = reasonKey(reason);
        replay.histogram[key] = (replay.histogram[key] ?? 0) + 1;

        const prefix = lines.slice(0, i).join('\n');
        const text = extractLastAssistantFromTranscript(prefix);
        const tools = extractTurnToolNames(prefix);
        if (!verifyAntiHallucinationProtocol(text ?? '', tools).ok) {
            replay.newBlocks += 1;
            replay.remaining.push({ file, line: i + 1, excerpt: (text ?? '').slice(0, 160) });
        }
    }

    return replay;
}

/** Every `*.jsonl` under `root`, skipping `subagents/` (subagent transcripts are not turn state). */
function collectTranscripts(root: string): string[] {
    const found: string[] = [];
    const walk = (dir: string): void => {
        let entries: ReturnType<typeof readdirSync<{ withFileTypes: true }>>;
        try {
            entries = readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            const path = join(dir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name !== 'subagents') walk(path);
            } else if (entry.name.endsWith('.jsonl')) {
                found.push(path);
            }
        }
    };
    walk(root);
    return found.sort();
}

/**
 * Replay every transcript under `root` and summarize. `reductionPct` is the share of old blocks
 * the new policy no longer produces, rounded to one decimal.
 */
export function replayCorpus(root: string): {
    files: number;
    oldBlocks: number;
    newBlocks: number;
    reductionPct: number;
    oldReasonHistogram: Record<string, number>;
    remaining: RemainingBlock[];
} {
    const result = {
        files: 0,
        oldBlocks: 0,
        newBlocks: 0,
        reductionPct: 0,
        oldReasonHistogram: {} as Record<string, number>,
        remaining: [] as RemainingBlock[],
    };
    for (const path of collectTranscripts(root)) {
        result.files += 1;
        const replay = replayTranscript(readFileSync(path, 'utf-8'), path);
        result.oldBlocks += replay.oldBlocks;
        result.newBlocks += replay.newBlocks;
        result.remaining.push(...replay.remaining);
        for (const [key, count] of Object.entries(replay.histogram)) {
            result.oldReasonHistogram[key] = (result.oldReasonHistogram[key] ?? 0) + count;
        }
    }
    result.reductionPct =
        result.oldBlocks === 0 ? 0 : Math.round((1 - result.newBlocks / result.oldBlocks) * 1000) / 10;
    return result;
}

if (import.meta.main) {
    const root = process.argv[2] ?? join(homedir(), '.claude', 'projects');
    process.stdout.write(`${JSON.stringify(replayCorpus(root), null, 2)}\n`);
}
