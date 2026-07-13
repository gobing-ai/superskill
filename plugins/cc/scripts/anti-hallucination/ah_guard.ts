#!/usr/bin/env bun
/**
 * Anti-Hallucination Guard - Stop Hook for Claude Code
 *
 * This script enforces the anti-hallucination protocol by verifying that
 * responses include proper source citations, confidence levels,
 * and evidence of verification tool usage.
 *
 * Input channels (first non-empty wins — see {@link resolveStopContext}):
 *     ARGUMENTS env - legacy/test channel: JSON with `messages` / `last_message`
 *     stdin         - what real hosts deliver:
 *                     - Claude Code Stop payload: `{transcript_path, stop_hook_active, ...}`
 *                       (the last assistant message is read from the transcript JSONL;
 *                       `stop_hook_active: true` allows immediately to prevent block loops)
 *                     - omp agent_end event: `{type: "agent_end", messages: [...]}`
 *
 * Exit Codes:
 *     0 - Allow stop (protocol followed)
 *     2 - Deny stop (universal cross-agent block signal; reason also on stderr)
 *
 * Output Format (stdout) — Claude Code canonical Stop-hook JSON:
 *     {"hookSpecificOutput":{"hookEventName":"Stop"}}                          # Allow stop (no feedback)
 *     {"decision":"block","reason":"…","hookSpecificOutput":{"hookEventName":"Stop"}}  # Block stop
 */

import { readFileSync } from 'node:fs';
import { logger } from './logger';

// =============================================================================
// VERIFICATION PATTERNS
// =============================================================================

// Source citation patterns (no 'g' flag to avoid stateful lastIndex). (0079 R2: coding
// agents cite via file:line anchors and pasted command output, not just Source:/URL —
// recognize those evidence forms so evidence-dense replies aren't nagged for a URL they
// never needed. A bare fenced code block is intentionally NOT credited — too broad.)
const SOURCE_PATTERNS = [
    /\[Source:\s*[^\]]+\]/i, // [Source: URL or Title]
    /Source:\s*\[?[^\n]+\]?/i, // Source: URL or Title
    /Sources:\s*\n\s*-\s*\[?[^\n]+\]/i, // Sources: list format
    /https?:\/\/[^\s)]+/i, // Any HTTP/HTTPS URL
    /\*\*Source\*\*:\s*[^\n]+/i, // Markdown bold Source:
    // (0079) file:line anchor — the canonical in-repo citation form, e.g. `ah_guard.ts:288`
    // or `foo.ts:12-20`. Requires a letter extension to avoid matching decimals like 94.87.
    /\b[a-zA-Z][a-zA-Z0-9_-]*\.[a-zA-Z0-9]+:\d+(?:-\d+)?/,
    // (0079) explicit exit-code line, e.g. "exit 0", "exit code 1" — evidence a command ran.
    /\bexit\s+code\s+\d+/i,
    /\bexit\s+\d+/i,
    // (0079) pasted test-result line, e.g. "1626 pass / 0 fail" or "3 passed and 0 failed".
    /\b\d+\s+pass(?:ed)?\s+(?:\/|and)\s+\d+\s+fail(?:ed)?\b/i,
];

// Confidence level patterns (no 'g' flag to avoid stateful lastIndex)
const CONFIDENCE_PATTERNS = [
    /Confidence:\s*(HIGH|MEDIUM|LOW)/i,
    /\*\*Confidence\*\*:\s*(HIGH|MEDIUM|LOW)/i,
    /### Confidence/i,
];

// Verification tool usage patterns (evidence tools)
const TOOL_PATTERNS = [
    /ref_search_documentation/,
    /ref_read_url/,
    /searchCode/,
    /WebSearch/,
    /WebFetch/,
    /mcp__ref__ref_search_documentation/,
    /mcp__ref__ref_read_url/,
    /mcp__grep__searchCode/,
];

// Red flags - patterns that indicate claims without verification
const RED_FLAG_PATTERNS = [
    /I (?:think|believe|recall) (?:that|the)?/gi,
    /(?:It|This) (?:should|might|may|could)/gi,
    /Probably|Likely|Possibly/gi,
    /(?:As far as|If I) (?:know|recall)/gi,
];

// =============================================================================
// TYPES
// =============================================================================

interface VerificationResult {
    ok: boolean;
    reason: string;
    issues?: string[];
}

/**
 * Build the Claude Code canonical Stop-hook JSON for a verification result. Claude's Stop schema
 * requires `hookSpecificOutput.hookEventName: "Stop"`. An allow emits only that bare envelope — it
 * carries no `additionalContext`, since a permitted stop has nothing the model needs to act on, and
 * surfacing the allow reason ("Task is complete", "No content to verify") just adds per-turn chat
 * noise. A block rides on the top-level `decision: "block"` + `reason` channel — that feedback is the
 * point of blocking (Stop has no `allowStop`/`feedback` fields — that shape fails Claude's
 * hook-output validation). The exit code stays the allow/deny signal (0 = allow, 1 = deny) for
 * agents that key off it.
 */
export function buildStopOutput(result: VerificationResult): string {
    if (result.ok) {
        return JSON.stringify({
            hookSpecificOutput: { hookEventName: 'Stop' },
        });
    }
    return JSON.stringify({
        decision: 'block',
        reason: result.reason,
        hookSpecificOutput: { hookEventName: 'Stop' },
    });
}

interface Message {
    role: string;
    content: string | Array<{ type: string; text?: string }>;
}

interface HookContext {
    messages?: Message[];
    last_message?: string;
}

// =============================================================================
// VERIFICATION FUNCTIONS
// =============================================================================

/** Extract the text of a message body (string, or joined text parts of mixed content). */
function messageText(content: Message['content']): string {
    if (Array.isArray(content)) {
        // Handle mixed content (text + tool_use)
        const textParts: string[] = [];
        for (const part of content) {
            if (part.type === 'text' && part.text) {
                textParts.push(part.text);
            }
        }
        return textParts.join('\n');
    }
    return String(content);
}

export function extractLastAssistantMessage(context: HookContext): string | undefined {
    const messages = context.messages ?? [];

    // Find the last assistant message in messages array
    for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i];
        if (message?.role === 'assistant') {
            return messageText(message.content);
        }
    }

    // Fallback to last_message if provided
    const lastMsg = context.last_message;
    if (lastMsg) {
        return String(lastMsg);
    }

    return undefined;
}

/**
 * Extract the last assistant message with non-empty text from a Claude Code
 * transcript (JSONL; assistant entries are `{type:"assistant", message:{role,content}}`).
 * Entries whose content carries no text (e.g. tool_use-only turns) are skipped —
 * the verifiable claim lives in the last *textual* assistant turn.
 */
export function extractLastAssistantFromTranscript(jsonl: string): string | undefined {
    const lines = jsonl.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i]?.trim();
        if (!line) continue;
        let entry: { type?: string; message?: Message };
        try {
            entry = JSON.parse(line);
        } catch {
            continue;
        }
        if (entry.type !== 'assistant' || entry.message?.role !== 'assistant') continue;
        const text = messageText(entry.message.content);
        if (text.trim().length > 0) return text;
    }
    return undefined;
}

/** Outcome of resolving a Stop payload: extracted content, or an immediate-allow reason. */
export interface ResolvedStopContext {
    /** Last assistant message text, when the payload yielded one. */
    content?: string;
    /** Set when the payload dictates an immediate allow (loop guard, unreadable input). */
    allowReason?: string;
}

/**
 * Resolve the Stop-hook payload from whichever channel the host used.
 *
 * Real hosts deliver on stdin: Claude Code sends `{transcript_path, stop_hook_active}` (content
 * must be read from the transcript; `stop_hook_active: true` means this stop was already blocked
 * once — allow immediately or the agent loops), omp forwards its `agent_end` event
 * (`{messages}`). The `ARGUMENTS` env var is the legacy/test channel and wins when set.
 * Every unreadable input resolves to an allow — this guard fails open by design.
 */
export function resolveStopContext(
    argumentsJson: string | undefined,
    stdinText: string,
    readTranscript: (path: string) => string = (path) => readFileSync(path, 'utf-8'),
): ResolvedStopContext {
    if (argumentsJson) {
        try {
            return { content: extractLastAssistantMessage(JSON.parse(argumentsJson) as HookContext) };
        } catch {
            return { allowReason: 'Task is complete (invalid context ignored)' };
        }
    }

    if (!stdinText || stdinText.trim().length === 0) return {};

    let payload: HookContext & { transcript_path?: string; stop_hook_active?: boolean };
    try {
        payload = JSON.parse(stdinText);
    } catch {
        return { allowReason: 'Task is complete (invalid context ignored)' };
    }
    if (typeof payload !== 'object' || payload === null) {
        return { allowReason: 'Task is complete (invalid context ignored)' };
    }

    if (payload.stop_hook_active === true) {
        return { allowReason: 'Task is complete (stop already processed — loop guard)' };
    }

    if (payload.messages || payload.last_message) {
        return { content: extractLastAssistantMessage(payload) };
    }

    if (typeof payload.transcript_path === 'string') {
        let transcript: string;
        try {
            transcript = readTranscript(payload.transcript_path);
        } catch {
            return { allowReason: 'Task is complete (transcript unavailable)' };
        }
        return { content: extractLastAssistantFromTranscript(transcript) };
    }

    return {};
}

export function hasSourceCitations(text: string): boolean {
    if (!text) return false;

    for (const pattern of SOURCE_PATTERNS) {
        if (pattern.test(text)) {
            return true;
        }
    }
    return false;
}

export function hasConfidenceLevel(text: string): boolean {
    if (!text) return false;

    for (const pattern of CONFIDENCE_PATTERNS) {
        if (pattern.test(text)) {
            return true;
        }
    }
    return false;
}

export function hasToolUsageEvidence(text: string): boolean {
    if (!text) return false;

    for (const pattern of TOOL_PATTERNS) {
        if (pattern.test(text)) {
            return true;
        }
    }
    return false;
}

export function hasRedFlags(text: string): string[] {
    if (!text) return [];

    const foundFlags: string[] = [];
    for (const pattern of RED_FLAG_PATTERNS) {
        const matches = text.match(pattern);
        if (matches) {
            foundFlags.push(...matches);
        }
    }
    return foundFlags;
}

// Assertion-shaped external claims — sufficient on their own to require verification.
// (0077 R1: bare vocabulary must not trigger; these shapes assert a fact about the
// external world that a reader could act on.)
const STRONG_CLAIM_PATTERNS = [
    // Version references need a cue so metrics/percentages (94.87%, 100.00), ratios,
    // durations (1.5s) and file:line refs do NOT read as versions. (0079)
    /\bv\d+(?:\.\d+)+\b/i, // v-prefixed: v2, v2.0, v1.2.3
    /\b(?:version|release|semver)\s+v?\d+\.\d+/i, // worded: "version 2.0", "release 1.4"
    /(?<![\d.])\d+\.\d+\.\d+(?![\d.])(?!\s*%)/, // 3-part semver (d.d.d), not part of a longer number, not a %
    /https?:\/\//, // URLs mentioned
    /recent\s+(?:change|update|release)/i,
    /\b(?:was|were|is|are)\s+(?:introduced|added|deprecated|removed|renamed|released)\b/i,
    /\baccording to\b/i,
    /\bdocumentation\s+(?:says|states|shows|confirms)\b/i,
];

// External-artifact vocabulary — too common in ordinary implementation talk
// ("added a helper function", "refactored the method") to trigger alone.
const WEAK_KEYWORD_PATTERN = /\b(?:api|library|framework|sdk|package|method|function|endpoint|documentation)\b/i;

// Capability couplers: a weak keyword only becomes a claim when the text asserts what the
// external thing does/has ("the API returns…", "this framework exposes…").
const CLAIM_COUPLER_PATTERN =
    /\b(?:returns|accepts|expects|supports|requires|provides|exposes|takes|emits|throws|defaults? to)\b/i;

export function requiresExternalVerification(text: string): boolean {
    if (!text) return false;

    for (const pattern of STRONG_CLAIM_PATTERNS) {
        if (pattern.test(text)) return true;
    }

    // Weak vocabulary needs an assertion-shaped coupler in the same message; either
    // alone is ordinary implementation talk and passes without demanding citations.
    return WEAK_KEYWORD_PATTERN.test(text) && CLAIM_COUPLER_PATTERN.test(text);
}

export function verifyAntiHallucinationProtocol(text: string): VerificationResult {
    if (!text || text.trim().length < 50) {
        // Empty or very short messages are OK
        return { ok: true, reason: 'Task is complete' };
    }

    // Check if content requires verification
    const needsVerification = requiresExternalVerification(text);

    if (!needsVerification) {
        // Internal discussion, no verification needed
        return { ok: true, reason: 'Task is complete (internal discussion)' };
    }

    // Check for source citations
    const hasSources = hasSourceCitations(text);

    // Check for confidence levels
    const hasConfidence = hasConfidenceLevel(text);

    // Check for tool usage evidence
    const hasTools = hasToolUsageEvidence(text);

    // Check for red flags
    const redFlags = hasRedFlags(text);

    // Decision logic
    const issues: string[] = [];

    if (!hasSources) {
        issues.push('source citations for API/library claims');
    }

    if (!hasConfidence) {
        issues.push('confidence level (HIGH/MEDIUM/LOW)');
    }

    if (redFlags.length > 0 && !hasTools) {
        const uniqueFlags = Array.from(new Set(redFlags)).slice(0, 3);
        issues.push(`uncertainty phrases detected: ${uniqueFlags.join(', ')}`);
    }

    if (issues.length > 0) {
        const reason = `Add verification for: ${issues.join(', ')}`;
        return { ok: false, reason, issues };
    }

    // If all checks pass
    return { ok: true, reason: 'Task is complete' };
}

// =============================================================================
// MAIN ENTRY POINT
// =============================================================================

export function main(stdinText = ''): number {
    const resolved = resolveStopContext(Bun.env.ARGUMENTS, stdinText);

    if (resolved.allowReason) {
        logger.log(buildStopOutput({ ok: true, reason: resolved.allowReason }));
        return 0;
    }

    // Handle case where content couldn't be extracted
    if (resolved.content === undefined) {
        logger.log(buildStopOutput({ ok: true, reason: 'No content to verify' }));
        return 0;
    }

    // Verify anti-hallucination protocol
    const result = verifyAntiHallucinationProtocol(resolved.content);

    logger.log(buildStopOutput(result));

    if (result.ok) return 0;
    // Deny: exit 2 is the universal cross-agent block signal (Claude Code treats exit 1 as a
    // non-blocking error and only feeds exit-2 stderr back to the model), reason on stderr.
    logger.error(result.reason);
    return 2;
}

if (import.meta.main) {
    let stdinText = '';
    // A TTY means no host piped a payload (manual invocation) — reading fd 0 would hang.
    if (!process.stdin.isTTY) {
        try {
            stdinText = readFileSync(0, 'utf-8');
        } catch {
            stdinText = '';
        }
    }
    process.exit(main(stdinText));
}
