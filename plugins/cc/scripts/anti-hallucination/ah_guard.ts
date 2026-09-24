#!/usr/bin/env bun
/**
 * Anti-Hallucination Guard - prevent-stop hook engine
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
 * Exit Code:
 *     0 - Always. Supported hosts consume the canonical stdout decision at exit 0. Claude Code
 *         would discard that JSON at exit 2 and surface stderr as a "blocking error". The
 *         `decision` field in the output JSON is the sole block/allow signal.
 *
 * Output Format (stdout) — host-canonical prevent-stop JSON:
 *     {"hookSpecificOutput":{"hookEventName":"Stop"}}                          # Allow stop (no feedback)
 *     {"decision":"block","reason":"…","hookSpecificOutput":{"hookEventName":"Stop"}}  # Block stop (clean feedback)
 */

import { readFileSync } from 'node:fs';
import { getEnvVar } from './lib/env';
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
    // The TLD denylist keeps `example.com:8080` / `foo.test:1` from passing as a citation. It is a
    // denylist rather than a code-extension allowlist on purpose: a missed extension would
    // *uncredit* a real citation and block an evidenced reply (the 0079 failure mode), whereas no
    // source file ends in `.com`/`.io`/`.dev`/`.xyz`, so excluding TLDs cannot cost a legitimate
    // anchor. Expand the denylist when a host:port form is observed clearing the gate.
    // TLD denylist only — never include real source extensions (ts/js/py/go/rs/sh/pl/…).
    /\b[a-zA-Z][a-zA-Z0-9_-]*\.(?!(?:com|org|net|edu|gov|mil|io|dev|app|ai|co|info|biz|local|me|us|uk|cn|jp|de|fr|xyz|test|cloud|tech|site|online|store|shop|blog|tv|cc|pro|name|to|ly|gg|fm|au|ca|br|ru|kr|tw|hk|sg|nz|za|mx|es|it|nl|se|no|fi|ch|at|be|ie|pt|cz|ro|hu|tr|il|sa|ae|th|vn|ph|my|pk|bd|ng|eg|ar|cl|pe):)[a-zA-Z0-9]+:\d+(?:-\d+)?/,
    // (0079) explicit exit-code line, e.g. "exit 0", "exit code 1" — evidence a command ran.
    /\bexit\s+code\s+\d+/i,
    /\bexit\s+\d+/i,
    // (0079) pasted test-result line, e.g. "1626 pass / 0 fail" or "3 passed and 0 failed".
    /\b\d+\s+pass(?:ed)?\s+(?:\/|and)\s+\d+\s+fail(?:ed)?\b/i,
];

// Confidence level patterns (no 'g' flag to avoid stateful lastIndex)
const CONFIDENCE_PATTERNS = [
    // Allow optional markdown bold around the value (e.g. `Confidence: **HIGH**`),
    // not just around the label — both bold-on-value and bold-on-label are valid.
    // (0147 F6) The level must be a whole word. A trailing `\b` is not enough: `-` is a
    // non-word character, so `Confidence: MEDIUM-rare` would match (`M`→`-` is a boundary).
    // `(?!\w)` alone is not enough either, because `-` is not `\w`. `(?![\w-])` rejects a
    // following letter, digit, `_` or `-`, which is what closes HIGHWAY / HIGHly / LOWER /
    // MEDIUM-rare without narrowing the leading boundary.
    /Confidence:\s*\**\b(?:HIGH|MEDIUM|LOW)(?![\w-])\**/i,
    /\*\*Confidence\*\*:\s*\**\b(?:HIGH|MEDIUM|LOW)(?![\w-])\**/i,
    // A bare `### Confidence` heading only declares a level when a level appears within the
    // next 80 characters; otherwise the heading alone satisfied the protocol.
    /### Confidence\b[\s\S]{0,80}?\b(?:HIGH|MEDIUM|LOW)(?![\w-])/i,
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
 * Output profiles for the prevent-stop hook across hosts (cross-agent Stop contract).
 *
 * - `block` — Claude Code `Stop`, Codex `Stop`, and Hermes `pre_verify`. Emits
 *   `{"decision":"block","reason":…}` at exit 0. Hermes `pre_verify` explicitly accepts the
 *   Claude Code Stop shape (blocking the stop = keep going).
 * - `deny` — Gemini CLI / Antigravity `AfterAgent`. Emits `{"decision":"deny","reason":…}` at
 *   exit 0; `decision:"deny"` rejects the response and feeds `reason` back as a new prompt.
 *   Allow omits `decision` so the turn completes.
 *
 * OpenCode / omp / pi / Grok cannot prevent stop — install gates them out, so they have no profile.
 */
export type StopProfile = 'block' | 'deny';

/**
 * Build the host-canonical prevent-stop JSON for a verification result under the given profile.
 * `block` uses `decision:"block"` + `hookEventName:"Stop"`; `deny` uses `decision:"deny"` +
 * `hookEventName:"AfterAgent"` (Gemini/Antigravity). An allow omits `decision` (the turn completes)
 * and carries only the bare `hookSpecificOutput` envelope for the host's event. The exit code stays
 * 0 — the `decision` field is the block/allow signal (Claude Code honors stdout JSON only at exit 0;
 * Codex/Gemini/Antigravity/Hermes likewise read the JSON at exit 0).
 */
export function buildStopOutput(result: VerificationResult, profile: StopProfile = 'block'): string {
    const hookEventName = profile === 'deny' ? 'AfterAgent' : 'Stop';
    if (result.ok) {
        return JSON.stringify({ hookSpecificOutput: { hookEventName } });
    }
    const decision = profile === 'deny' ? 'deny' : 'block';
    return JSON.stringify({
        decision,
        reason: result.reason,
        hookSpecificOutput: { hookEventName },
    });
}

interface Message {
    role: string;
    // Optional and nullable: a real host may send a trailing assistant turn with no content
    // field, or with `content: null` (0147 F1).
    content?: string | Array<{ type: string; text?: string }> | null;
}

interface HookContext {
    messages?: Message[];
    last_message?: string;
}

// =============================================================================
// VERIFICATION FUNCTIONS
// =============================================================================

/** Extract the text of a message body (string, or joined text parts of mixed content). */
function messageText(content: Message['content'] | null | undefined): string {
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
    // A missing/`null`/non-string body has no text. Never `String()` it: `String(undefined)` and
    // `String(null)` are non-empty, so a blank trailing turn would hide the real claim (0147 F1).
    return typeof content === 'string' ? content : '';
}

export function extractLastAssistantMessage(context: HookContext): string | undefined {
    const messages = context.messages ?? [];

    // Walk from the end and skip assistant turns whose text is blank, mirroring the transcript
    // scanner: a trailing blank/tool_use-only turn must not hide the last textual claim (0147 F1).
    for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i];
        if (message?.role !== 'assistant') continue;
        const text = messageText(message.content);
        if (text.trim().length > 0) return text;
    }

    // Fallback to last_message only when no assistant turn had text. A non-blank string is real
    // payload — even the literal words `undefined`/`null` (0147 Q1).
    const lastMsg = context.last_message;
    if (typeof lastMsg === 'string' && lastMsg.trim().length > 0) {
        return lastMsg;
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
    /\baccording to\b/i,
    /\bdocumentation\s+(?:says|states|shows|confirms)\b/i,
];

// External-artifact vocabulary — too common in ordinary implementation talk
// ("added a helper function", "refactored the method") to trigger alone.
// `function`/`method` are deliberately absent: they name the agent's *own* code far more often
// than an external one, and the coupler below cannot tell "the function returns early" (local,
// needs nothing) from "the API returns a list" (external, needs a citation). Keeping them made
// the guard nag on the most common sentence shape in a coding reply.
const WEAK_KEYWORD_PATTERN = /\b(?:api|library|framework|sdk|package|endpoint|documentation)\b/i;

// Capability couplers: a weak keyword only becomes a claim when the text asserts what the
// external thing does/has ("the API returns…", "this framework exposes…").
// (0147 F3) Past tense included: a reply that reports what an external thing *did*
// ("the library returned a Buffer") asserts the same fact as the present-tense form and
// must not slip through. Kept as an explicit alternation so each tense is auditable —
// optional-s forms like `returns?` are rejected because they also match nouns.
const CLAIM_COUPLER_PATTERN =
    /\b(?:returns|returned|accepts|accepted|expects|expected|supports|supported|requires|required|provides|provided|exposes|exposed|takes|took|emits|emitted|throws|threw|defaults? to|defaulted to)\b/i;

// (0147 F3) Modal + base verb: "the API will return…" is a claim about the external world
// just like "the API returns…", but the base verb carries no tense suffix, so the explicit
// alternation above never sees it. Only the modal half is coupled here.
const MODAL_COUPLER_PATTERN =
    /\b(?:will|would|can|could|did|does)\s+(?:return|accept|expect|support|require|provide|expose|take|emit|throw|default to)\b/i;

// Lifecycle verbs ("was removed", "were added") assert an external fact only when the subject is an
// external artifact. Bare, they are the single most common shape in a coding summary — "a regression
// test was added", "the exclusion was removed", "the tests fail if the re-arm is removed" — so as a
// STRONG pattern this fired on nearly every substantive reply and demanded citations for the agent's
// own edits. Same lesson as 0077 R1, applied to the verb half: couple it to external vocabulary.
const LIFECYCLE_VERB_PATTERN = /\b(?:was|were|is|are)\s+(?:introduced|added|deprecated|removed|renamed|released)\b/i;

/** Weak vocabulary and its assertion must occur in the same sentence. */
function hasWeakExternalClaim(text: string): boolean {
    // (0147 F2) Split after `.`/`!`/`?` only at whitespace or before a capital letter. The
    // previous `(?=\S)` alternative also split before a lowercase letter or digit, so a
    // filename dot (`readme.md`, `lodash.js`, `service.ts`) severed the weak keyword from its
    // coupler and the claim was allowed. A new sentence after a dot starts with a capital;
    // `local.The helper …` still splits, `readme.md` (one sentence) does not.
    const sentences = text.split(/(?<=[.!?])(?:\s+|(?=[A-Z]))|\n+/);
    return sentences.some(
        (sentence) =>
            WEAK_KEYWORD_PATTERN.test(sentence) &&
            (CLAIM_COUPLER_PATTERN.test(sentence) ||
                MODAL_COUPLER_PATTERN.test(sentence) ||
                LIFECYCLE_VERB_PATTERN.test(sentence)),
    );
}

export function requiresExternalVerification(text: string): boolean {
    if (!text) return false;

    for (const pattern of STRONG_CLAIM_PATTERNS) {
        if (pattern.test(text)) return true;
    }

    // Weak vocabulary needs an assertion-shaped coupler in the same sentence — either a capability
    // claim ("the API returns…") or a lifecycle claim ("the endpoint was deprecated"). Either half
    // alone is ordinary implementation talk and passes without demanding citations.
    return hasWeakExternalClaim(text);
}

export function verifyAntiHallucinationProtocol(text: string): VerificationResult {
    if (!text || text.trim().length === 0) {
        return { ok: true, reason: 'Task is complete' };
    }

    // Check if content requires verification (shared by the short-message floor below).
    const needsVerification = requiresExternalVerification(text);

    // Very short *internal* notes ("Done", "OK") skip the protocol. Short external
    // claims must not use the length floor as a smuggle path — "The API returns X."
    // is still a claim even under 50 characters.
    if (text.trim().length < 50 && !needsVerification) {
        return { ok: true, reason: 'Task is complete' };
    }

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
// STOP GUARD — single orchestration owner
// =============================================================================

/** Result of running the Stop guard end-to-end: canonical Stop JSON (decision is the signal). */
export interface StopGuardResult {
    /** Canonical host prevent-stop JSON (built by {@link buildStopOutput}). */
    output: string;
    /**
     * Always 0. Supported hosts consume the canonical decision JSON at exit 0. The `decision`
     * field in `output` is the sole block/allow signal.
     */
    exitCode: 0;
}

/**
 * Run the Stop guard end-to-end. The single owner of the Stop branch table: resolve the payload
 * ({@link resolveStopContext}) → allow on loop guard / unreadable input → allow when no content
 * was extracted → verify via {@link verifyAntiHallucinationProtocol} → allow on ok / block on deny
 * (canonical Stop JSON `decision:"block"` + `reason`, always at exit 0). Adapters ({@link main} CLI,
 * `ccAntiHallucination` HookRunner) call this and only translate the result to their I/O shape — they
 * never re-implement the branches. Fails open (allow) on empty/invalid/`stop_hook_active` payloads by
 * construction of `resolveStopContext`.
 */
export function runStopGuard(
    argumentsEnv: string | undefined,
    stdinText: string,
    profile: StopProfile = 'block',
): StopGuardResult {
    const resolved = resolveStopContext(argumentsEnv, stdinText);
    if (resolved.allowReason) {
        return { output: buildStopOutput({ ok: true, reason: resolved.allowReason }, profile), exitCode: 0 };
    }
    if (resolved.content === undefined) {
        return { output: buildStopOutput({ ok: true, reason: 'No content to verify' }, profile), exitCode: 0 };
    }
    const result = verifyAntiHallucinationProtocol(resolved.content);
    if (result.ok) {
        return { output: buildStopOutput(result, profile), exitCode: 0 };
    }
    // Block rides on the `decision` + `reason` JSON in `output` at exit 0 — the clean feedback
    // channel for every profiled host (block/deny). Exit 2 would discard that JSON and surface
    // stderr as a "blocking error" (the misrendering this guard must not regress to).
    return { output: buildStopOutput(result, profile), exitCode: 0 };
}

// =============================================================================
// MAIN ENTRY POINT (thin CLI adapter)
// =============================================================================

/**
 * Direct CLI entry: a thin adapter over {@link runStopGuard}. Writes the canonical Stop JSON via
 * `logger.log` and returns the exit code (always 0 — the `decision` field in the JSON is the
 * block/allow signal). The branch table lives in `runStopGuard`; this surface only translates I/O.
 */
export function main(stdinText = ''): number {
    const result = runStopGuard(getEnvVar('ARGUMENTS'), stdinText);
    logger.log(result.output);
    return result.exitCode;
}

/**
 * Read a piped Stop payload without blocking indefinitely.
 *
 * Mirrors `apps/cli/src/stdin.ts` `readStdinNonBlocking`, deliberately duplicated: this
 * script is staged and invoked by path on non-Claude targets (ADR-024), so it must stay
 * self-contained — a plugin script may not import from `apps/cli`. Keep the two in sync.
 *
 * A TTY means no host piped a payload (manual invocation). Otherwise the read is bounded
 * by `idleMs` of silence, **re-armed on every chunk**, so a host that holds fd 0 open
 * without writing cannot hang the agent and a multi-write payload is never truncated.
 */
export function readPipedStdin(idleMs = 250): Promise<string> {
    if (process.stdin.isTTY) return Promise.resolve('');
    return new Promise((resolve) => {
        let data = '';
        let settled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;

        const settle = () => {
            if (settled) return;
            settled = true;
            if (timer !== undefined) clearTimeout(timer);
            process.stdin.removeListener('data', onData);
            process.stdin.removeListener('end', settle);
            process.stdin.removeListener('error', settle);
            resolve(data);
        };
        const arm = () => {
            if (timer !== undefined) clearTimeout(timer);
            timer = setTimeout(settle, idleMs);
        };
        function onData(chunk: string | Buffer) {
            data += chunk.toString();
            arm();
        }

        process.stdin.setEncoding('utf-8');
        process.stdin.on('data', onData);
        process.stdin.on('end', settle);
        process.stdin.on('error', settle);
        process.stdin.resume();
        arm();
    });
}

if (import.meta.main) {
    process.exit(main(await readPipedStdin()));
}
