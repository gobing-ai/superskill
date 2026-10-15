import { describe, expect, it } from 'bun:test';
import {
    detectHookHost,
    hookEventOf,
    isPreToolUseAllow,
    normalizeHookPayload,
    parseNeutralResult,
    preToolUseByExitCode,
    translateHookResult,
} from '../src/hook-host';

/**
 * Host adapter layer: one canonical payload in, one host-neutral result out. These pin the
 * translation table hook scripts rely on, so a plugin hook never has to know the host.
 */

describe('detectHookHost', () => {
    it('honors SUPERSKILL_HOOK_HOST, else recognizes Claude Code by CLAUDE_PROJECT_DIR, else generic', () => {
        expect(detectHookHost({ SUPERSKILL_HOOK_HOST: 'omp', CLAUDE_PROJECT_DIR: '/p' })).toBe('omp');
        expect(detectHookHost({ SUPERSKILL_HOOK_HOST: 'pi' })).toBe('pi');
        expect(detectHookHost({ SUPERSKILL_HOOK_HOST: 'claude' })).toBe('claude');
        expect(detectHookHost({ SUPERSKILL_HOOK_HOST: 'generic', CLAUDE_PROJECT_DIR: '/p' })).toBe('generic');
        expect(detectHookHost({ SUPERSKILL_HOOK_HOST: 'bogus', CLAUDE_PROJECT_DIR: '/p' })).toBe('claude');
        expect(detectHookHost({})).toBe('generic');
    });
});

describe('normalizeHookPayload', () => {
    it('passes Claude/Codex payloads, unparseable text, and non-objects through unchanged', () => {
        const claude = '{"hook_event_name":"Stop","session_id":"s"}';
        expect(normalizeHookPayload(claude, {})).toBe(claude);
        expect(normalizeHookPayload('{"tool_name":"Read"}', {})).toBe('{"tool_name":"Read"}');
        expect(normalizeHookPayload('not json', {})).toBe('not json');
        expect(normalizeHookPayload('[1]', {})).toBe('[1]');
        expect(normalizeHookPayload('{"other":1}', {})).toBe('{"other":1}');
    });

    it('maps a Pi/omp edit tool_call to canonical names, keeping the host event', () => {
        const event = {
            type: 'tool_call',
            toolName: 'edit',
            input: { path: '/a.ts', edits: [{ oldText: 'a', newText: 'b' }] },
        };
        const out = JSON.parse(normalizeHookPayload(JSON.stringify(event), {}, '/cwd'));
        expect(out).toEqual({
            cwd: '/cwd',
            host_event: event,
            hook_event_name: 'PreToolUse',
            tool_name: 'Edit',
            tool_input: {
                path: '/a.ts',
                edits: event.input.edits,
                file_path: '/a.ts',
                old_string: 'a',
                new_string: 'b',
            },
        });
    });

    it('maps tool_result content text, read/write/bash/find tools, and the session id', () => {
        const read = JSON.parse(
            normalizeHookPayload(
                JSON.stringify({
                    toolName: 'read',
                    input: { path: '/r' },
                    content: [{ text: 'x' }, { image: 1 }, { text: 'y' }],
                    sessionId: 's1',
                }),
                { SUPERSKILL_HOOK_EVENT: 'PostToolUse' },
            ),
        );
        expect(read.hook_event_name).toBe('PostToolUse');
        expect(read.tool_input.file_path).toBe('/r');
        expect(read.tool_response).toEqual({ content: 'x\ny' });
        expect(read.session_id).toBe('s1');
        const write = JSON.parse(
            normalizeHookPayload('{"toolName":"write","input":{"file_path":"/w"},"content":"c"}', {}),
        );
        expect(write.tool_input).toEqual({ file_path: '/w', content: '' });
        expect(write.tool_response).toEqual({ content: 'c' });
        const edit = JSON.parse(
            normalizeHookPayload('{"toolName":"edit","input":{"path":"/e","oldText":"o","newText":"n"}}', {}),
        );
        expect(edit.tool_input.old_string).toBe('o');
        expect(edit.tool_input.new_string).toBe('n');
        expect(JSON.parse(normalizeHookPayload('{"toolName":"bash","input":{"command":"ls"}}', {})).tool_name).toBe(
            'Bash',
        );
        expect(JSON.parse(normalizeHookPayload('{"toolName":"find"}', {})).tool_input).toEqual({});
        expect(JSON.parse(normalizeHookPayload('{"toolName":"custom_tool"}', {})).tool_name).toBe('custom_tool');
    });

    it('maps a tool-less Pi lifecycle event by its type', () => {
        const out = JSON.parse(normalizeHookPayload('{"type":"session_shutdown","session_id":"s2"}', {}, '/c'));
        expect(out).toEqual({
            cwd: '/c',
            host_event: { type: 'session_shutdown', session_id: 's2' },
            hook_event_name: 'SessionEnd',
            session_id: 's2',
        });
    });
});

describe('parseNeutralResult / hookEventOf', () => {
    it('accepts only {decision: allow|deny|ask|block}, dropping a blank reason', () => {
        expect(parseNeutralResult('{"decision":"deny","reason":"r"}')).toEqual({ decision: 'deny', reason: 'r' });
        expect(parseNeutralResult('{"decision":"block","reason":"  "}')).toEqual({ decision: 'block' });
        expect(parseNeutralResult('{"decision":"approve"}')).toBeNull();
        expect(parseNeutralResult('{"hookSpecificOutput":{},"decision":"block"}')).toBeNull();
        expect(parseNeutralResult('[]')).toBeNull();
        expect(parseNeutralResult('')).toBeNull();
    });

    it("reads the payload's hook_event_name, else SUPERSKILL_HOOK_EVENT", () => {
        expect(hookEventOf('{"hook_event_name":"Stop"}', { SUPERSKILL_HOOK_EVENT: 'X' })).toBe('Stop');
        expect(hookEventOf('nope', { SUPERSKILL_HOOK_EVENT: 'PreToolUse' })).toBe('PreToolUse');
        expect(hookEventOf('null', {})).toBe('');
    });
});

describe('translateHookResult', () => {
    const deny = { decision: 'deny' as const, reason: 'r' };

    it('PreToolUse: permissionDecision JSON on Claude Code, exit 2 elsewhere, never an allow JSON', () => {
        expect(JSON.parse(translateHookResult(deny, 'claude', 'PreToolUse').output)).toEqual({
            hookSpecificOutput: {
                hookEventName: 'PreToolUse',
                permissionDecision: 'deny',
                permissionDecisionReason: 'r',
            },
        });
        expect(
            JSON.parse(translateHookResult({ decision: 'ask' }, 'claude', 'PreToolUse').output).hookSpecificOutput,
        ).toEqual({
            hookEventName: 'PreToolUse',
            permissionDecision: 'ask',
            permissionDecisionReason: 'blocked by hook',
        });
        expect(translateHookResult({ decision: 'allow' }, 'claude', 'PreToolUse')).toEqual({ output: '', exitCode: 0 });
        expect(translateHookResult({ decision: 'block' }, 'generic', 'PreToolUse')).toEqual({
            output: '',
            stderr: 'blocked by hook',
            exitCode: 2,
        });
        expect(translateHookResult({ decision: 'ask', reason: 'q' }, 'pi', 'PreToolUse')).toEqual({
            output: '',
            exitCode: 0,
        });
    });

    it('Stop-like events: decision JSON on Claude/generic (deny profile except PostToolUse), exit 2 on omp/pi', () => {
        expect(translateHookResult(deny, 'claude', 'Stop')).toEqual({
            output: '{"decision":"block","reason":"r"}',
            exitCode: 0,
        });
        expect(translateHookResult(deny, 'generic', 'SubagentStop', 'deny').output).toBe(
            '{"decision":"deny","reason":"r"}',
        );
        expect(translateHookResult(deny, 'generic', 'PostToolUse', 'deny').output).toBe(
            '{"decision":"block","reason":"r"}',
        );
        expect(translateHookResult(deny, 'omp', 'UserPromptSubmit')).toEqual({ output: '', stderr: 'r', exitCode: 2 });
        expect(translateHookResult({ decision: 'ask' }, 'claude', 'Stop')).toEqual({ output: '', exitCode: 0 });
    });

    it('other or unknown events: a stop decision becomes exit 2 + stderr', () => {
        expect(translateHookResult(deny, 'claude', 'SessionStart')).toEqual({ output: '', stderr: 'r', exitCode: 2 });
        expect(translateHookResult(deny, 'generic', '')).toEqual({ output: '', stderr: 'r', exitCode: 2 });
    });
});

describe('preToolUseByExitCode (legacy Claude-native output off Claude Code)', () => {
    const pre = (decision: string, extra: Record<string, unknown> = {}) =>
        JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: decision, ...extra } });

    it('drops allow/ask, turns deny into exit 2 + reason, and leaves other output alone', () => {
        expect(preToolUseByExitCode(pre('allow'))).toEqual({ output: '', exitCode: 0 });
        expect(preToolUseByExitCode(pre('ask', { permissionDecisionReason: 'sure?' }))).toEqual({
            output: '',
            exitCode: 0,
        });
        expect(preToolUseByExitCode(JSON.stringify({ ...JSON.parse(pre('deny')), systemMessage: 'via sm' }))).toEqual({
            output: '',
            exitCode: 2,
            stderr: 'via sm',
        });
        expect(preToolUseByExitCode(pre('deny'))?.stderr).toBe('blocked by PreToolUse hook');
        expect(preToolUseByExitCode(pre('allow', { updatedInput: { command: 'ls' } }))).toBeNull();
        expect(preToolUseByExitCode('{"decision":"block","reason":"x"}')).toBeNull();
        expect(preToolUseByExitCode('')).toBeNull();
        expect(preToolUseByExitCode('null')).toBeNull();
    });
});

describe('isPreToolUseAllow', () => {
    it('matches only a bare Claude-native PreToolUse allow', () => {
        const allow = { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } };
        expect(isPreToolUseAllow(JSON.stringify(allow))).toBe(true);
        expect(
            isPreToolUseAllow(
                JSON.stringify({ hookSpecificOutput: { ...allow.hookSpecificOutput, updatedInput: {} } }),
            ),
        ).toBe(false);
        expect(
            isPreToolUseAllow('{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask"}}'),
        ).toBe(false);
        expect(isPreToolUseAllow('{"decision":"block"}')).toBe(false);
        expect(isPreToolUseAllow('null')).toBe(false);
        expect(isPreToolUseAllow('x')).toBe(false);
    });
});
