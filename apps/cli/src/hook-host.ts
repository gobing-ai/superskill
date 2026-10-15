/**
 * Host adapter layer for plugin hook scripts run by `superskill hook run` (ADR-039).
 *
 * A hook script sees ONE payload shape and answers in ONE result shape, whatever agent fired it:
 *
 * - **In:** {@link normalizeHookPayload} turns a Pi/omp event (`toolName`, `input`, `content`) into
 *   the canonical Claude-style payload (`hook_event_name`, `tool_name`, `tool_input`,
 *   `tool_response`). Claude Code / Codex / Hermes payloads already have that shape and pass through.
 * - **Out:** the script prints nothing (allow / capture-only) or one {@link NeutralHookResult}
 *   (`{"decision":"allow|deny|ask|block","reason":"…"}`), and {@link translateHookResult} renders it
 *   in the shape the running host honors for the event.
 *
 * Plugin scripts that already print Claude's native JSON (`hookSpecificOutput…`) keep working: on
 * Claude Code it is forwarded verbatim; elsewhere a PreToolUse decision goes through
 * {@link preToolUseByExitCode}.
 */

import type { StopProfile } from '../../../plugins/cc/scripts/anti-hallucination/ah_guard';

/** What a host adapter produces: stdout text, optional stderr, exit code. */
export interface HookHostOutput {
    output: string;
    stderr?: string;
    exitCode: number;
}

/** The host-neutral result a hook script prints on stdout (or prints nothing). */
export interface NeutralHookResult {
    /** `allow` = no objection; `deny`/`block` = stop the action (synonyms); `ask` = confirm with the user. */
    decision: 'allow' | 'deny' | 'ask' | 'block';
    /** Why — shown to the agent/user on deny, block and ask. */
    reason?: string;
}

/**
 * Which host fired the hook. `SUPERSKILL_HOOK_HOST` wins (superskill's generated omp modules set
 * `omp`); else Claude Code is recognized by `CLAUDE_PROJECT_DIR`; anything else is `generic`
 * (Codex, Hermes, Antigravity, …), which honors Claude-style Stop JSON and the exit-2 block.
 */
export type HookHost = 'claude' | 'omp' | 'pi' | 'generic';

/** Resolve the {@link HookHost} for this invocation from its environment (see {@link HookHost}). */
export function detectHookHost(env: NodeJS.ProcessEnv): HookHost {
    const declared = env.SUPERSKILL_HOOK_HOST;
    if (declared === 'claude' || declared === 'omp' || declared === 'pi' || declared === 'generic') return declared;
    return env.CLAUDE_PROJECT_DIR ? 'claude' : 'generic';
}

/** Pi/omp lifecycle event → canonical (Claude) event name. */
const PI_EVENT_TO_CANONICAL: Record<string, string> = {
    tool_call: 'PreToolUse',
    tool_result: 'PostToolUse',
    agent_end: 'Stop',
    session_start: 'SessionStart',
    session_shutdown: 'SessionEnd',
    session_before_compact: 'PreCompact',
};

/** Pi/omp tool name → canonical (Claude) tool name. */
const PI_TOOL_TO_CANONICAL: Record<string, string> = {
    read: 'Read',
    write: 'Write',
    edit: 'Edit',
    bash: 'Bash',
    grep: 'Grep',
    find: 'Glob',
    glob: 'Glob',
};

function str(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

function contentText(content: unknown): string {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    return content
        .map((part) => (part && typeof part === 'object' ? str((part as { text?: unknown }).text) : ''))
        .filter((text) => text.length > 0)
        .join('\n');
}

/** Map a Pi/omp tool input onto the canonical field names (`path` → `file_path`, `edits` → strings). */
function canonicalToolInput(tool: string, input: Record<string, unknown>): Record<string, unknown> {
    const path = str(input.path) || str(input.file_path);
    switch (tool) {
        case 'Read':
            return { ...input, file_path: path };
        case 'Write':
            return { ...input, file_path: path, content: str(input.content) };
        case 'Edit': {
            const edits = Array.isArray(input.edits) ? (input.edits as Array<Record<string, unknown>>) : [];
            return {
                ...input,
                file_path: path,
                old_string: edits.length > 0 ? edits.map((e) => str(e.oldText)).join('') : str(input.oldText),
                new_string: edits.length > 0 ? edits.map((e) => str(e.newText)).join('') : str(input.newText),
            };
        }
        default:
            return input;
    }
}

/**
 * Normalize the host payload to the canonical shape a hook script reads. A payload that already
 * carries `hook_event_name` or `tool_name` (Claude Code, Codex, Hermes) is returned unchanged. A
 * Pi/omp event (`toolName`/`input`/`content`, or a Pi `type`) becomes
 * `{hook_event_name, tool_name, tool_input, tool_response, cwd, host_event}`; the event name comes
 * from `SUPERSKILL_HOOK_EVENT` (set by generated omp modules), else the event's `type`. Unparseable
 * text is returned unchanged — the script decides what an unreadable payload means.
 */
export function normalizeHookPayload(stdinText: string, env: NodeJS.ProcessEnv, cwd = process.cwd()): string {
    let parsed: unknown;
    try {
        parsed = JSON.parse(stdinText);
    } catch {
        return stdinText;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return stdinText;
    const event = parsed as Record<string, unknown>;
    if ('hook_event_name' in event || 'tool_name' in event) return stdinText;
    const piType = str(event.type);
    const isPiShape = 'toolName' in event || piType in PI_EVENT_TO_CANONICAL || env.SUPERSKILL_HOOK_EVENT !== undefined;
    if (!isPiShape) return stdinText;

    const out: Record<string, unknown> = { cwd, host_event: event };
    const eventName = env.SUPERSKILL_HOOK_EVENT || PI_EVENT_TO_CANONICAL[piType];
    if (eventName) out.hook_event_name = eventName;
    const rawTool = str(event.toolName);
    if (rawTool) {
        const tool = PI_TOOL_TO_CANONICAL[rawTool] ?? rawTool;
        const input = event.input && typeof event.input === 'object' ? (event.input as Record<string, unknown>) : {};
        out.tool_name = tool;
        out.tool_input = canonicalToolInput(tool, input);
        const text = contentText(event.content);
        if (text) out.tool_response = { content: text };
    }
    const sessionId = str(event.sessionId) || str(event.session_id);
    if (sessionId) out.session_id = sessionId;
    return JSON.stringify(out);
}

/**
 * Re-express a Claude-native PreToolUse `permissionDecision` JSON through the exit-code channel
 * for hosts other than Claude Code. Codex rejects `permissionDecision:"allow"`/`"ask"` (it marks
 * the hook run failed) and omp's generated hook modules block only on exit 2, so: deny/ask →
 * exit 2 + the reason on stderr (an unconfirmable ask fails closed), allow → empty stdout at
 * exit 0. Returns null for any other output (Stop decisions, `updatedInput` rewrites, silence).
 */
export function preToolUseByExitCode(output: string): HookHostOutput | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(output);
    } catch {
        return null;
    }
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { hookSpecificOutput: hso, systemMessage } = parsed as {
        hookSpecificOutput?: Record<string, unknown>;
        systemMessage?: unknown;
    };
    if (hso?.hookEventName !== 'PreToolUse' || hso.updatedInput !== undefined) return null;
    if (hso.permissionDecision !== 'deny' && hso.permissionDecision !== 'ask') {
        return { output: '', exitCode: 0 };
    }
    const reason = [hso.permissionDecisionReason, systemMessage].find((r) => typeof r === 'string' && r.trim());
    return { output: '', exitCode: 2, stderr: (reason as string | undefined) ?? 'blocked by PreToolUse hook' };
}

/**
 * True for a Claude-native PreToolUse `permissionDecision:"allow"` without an `updatedInput` rewrite.
 * `hook run` never forwards one, even on Claude Code: there it would auto-approve the tool call and
 * bypass the user's permission rules, while a hook's allow only means "no objection".
 */
export function isPreToolUseAllow(output: string): boolean {
    try {
        const hso = (JSON.parse(output) as { hookSpecificOutput?: Record<string, unknown> } | null)?.hookSpecificOutput;
        return (
            hso?.hookEventName === 'PreToolUse' && hso.permissionDecision === 'allow' && hso.updatedInput === undefined
        );
    } catch {
        return false;
    }
}

/** Parse stdout as a {@link NeutralHookResult}; null when it is anything else (incl. Claude-native JSON). */
export function parseNeutralResult(output: string): NeutralHookResult | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(output);
    } catch {
        return null;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    const rec = parsed as Record<string, unknown>;
    if ('hookSpecificOutput' in rec) return null;
    const { decision, reason } = rec;
    if (decision !== 'allow' && decision !== 'deny' && decision !== 'ask' && decision !== 'block') return null;
    return typeof reason === 'string' && reason.trim() ? { decision, reason } : { decision };
}

/** The canonical event the hook runs for: the payload's `hook_event_name`, else `SUPERSKILL_HOOK_EVENT`. */
export function hookEventOf(payloadText: string, env: NodeJS.ProcessEnv): string {
    try {
        const name = (JSON.parse(payloadText) as { hook_event_name?: unknown } | null)?.hook_event_name;
        if (typeof name === 'string' && name) return name;
    } catch {
        // fall through
    }
    return env.SUPERSKILL_HOOK_EVENT ?? '';
}

/** Events whose block is carried by `{"decision":"block","reason"}` stdout JSON at exit 0. */
const DECISION_JSON_EVENTS = new Set(['Stop', 'SubagentStop', 'UserPromptSubmit', 'PostToolUse']);

/**
 * Render a {@link NeutralHookResult} for `host` and `event`:
 *
 * | event | `deny`/`block` | `ask` | `allow` |
 * | --- | --- | --- | --- |
 * | `PreToolUse`, Claude Code | `permissionDecision:"deny"` JSON, exit 0 | `permissionDecision:"ask"` JSON, exit 0 | nothing |
 * | `PreToolUse`, other hosts | exit 2, reason on stderr | exit 2, reason on stderr (cannot confirm — fails closed) | nothing |
 * | `Stop`/`SubagentStop`/`UserPromptSubmit`/`PostToolUse`, Claude Code / generic | `{"decision":"block","reason"}` (`"deny"` under `--profile deny`), exit 0 | as allow | nothing |
 * | the same events, omp/pi | exit 2, reason on stderr | as allow | nothing |
 * | any other or unknown event | exit 2, reason on stderr | as allow | nothing |
 *
 * An `ask` is a confirmation request. Only Claude Code (and a native Pi extension that reads the
 * neutral decision itself) can show one; everywhere else it becomes a deny carrying the reason so
 * a safety guard cannot silently pass. Hook errors / timeouts / missing scripts still fail open.
 *
 * `allow` never emits a Claude `permissionDecision:"allow"`: that would bypass the user's
 * permission rules, while a neutral allow only means "this hook has no objection".
 */
export function translateHookResult(
    result: NeutralHookResult,
    host: HookHost,
    event: string,
    profile: StopProfile = 'block',
): HookHostOutput {
    const reason = result.reason ?? 'blocked by hook';
    const stop = result.decision === 'deny' || result.decision === 'block';
    if (event === 'PreToolUse') {
        if (host === 'claude' && (stop || result.decision === 'ask')) {
            return {
                output: JSON.stringify({
                    hookSpecificOutput: {
                        hookEventName: 'PreToolUse',
                        permissionDecision: stop ? 'deny' : 'ask',
                        permissionDecisionReason: reason,
                    },
                }),
                exitCode: 0,
            };
        }
        // Non-Claude hosts have no confirm UI: treat ask like deny (fail closed).
        return stop || result.decision === 'ask'
            ? { output: '', stderr: reason, exitCode: 2 }
            : { output: '', exitCode: 0 };
    }
    if (!stop) return { output: '', exitCode: 0 };
    if (DECISION_JSON_EVENTS.has(event) && (host === 'claude' || host === 'generic')) {
        const decision = profile === 'deny' && event !== 'PostToolUse' ? 'deny' : 'block';
        return { output: JSON.stringify({ decision, reason }), exitCode: 0 };
    }
    return { output: '', stderr: reason, exitCode: 2 };
}
