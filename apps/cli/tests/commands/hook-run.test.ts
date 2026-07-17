import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { hookRun, parseSpurBinSpec, registerHookRun, runSpTaskWriteGuard } from '../../src/commands/hook-run';
import { cliVersion } from '../../src/version';

/**
 * `superskill hook run <plugin> <hook-id>` — the cross-agent hook runtime trigger (task 0151).
 * Tests assert the dispatcher contract (resolve runner, emit the right exit code + output) and
 * each runner's decision + fail-open behavior. Allow → exit 0 (PreToolUse with empty stdout, Stop
 * with canonical JSON); deny → exit 2 + reason on stderr (Claude Code treats exit 1 as a
 * non-blocking error, so 1 never blocks). `hookRun` returns the exit code and writes to
 * stdout/stderr; tests capture both streams to inspect the payload.
 */

function capture(plugin: string, hookId: string, env: NodeJS.ProcessEnv, stdinText: string) {
    const chunks: string[] = [];
    const errChunks: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    const originalErr = process.stderr.write.bind(process.stderr);
    // biome-ignore lint/suspicious/noExplicitAny: stdout.write overload shim for capture
    (process.stdout.write as any) = (chunk: unknown) => {
        chunks.push(String(chunk));
        return true;
    };
    // biome-ignore lint/suspicious/noExplicitAny: stderr.write overload shim for capture
    (process.stderr.write as any) = (chunk: unknown) => {
        errChunks.push(String(chunk));
        return true;
    };
    try {
        const code = hookRun(plugin, hookId, env, stdinText);
        return { code, out: chunks.join(''), err: errChunks.join('') };
    } finally {
        process.stdout.write = original;
        process.stderr.write = originalErr;
    }
}

afterEach(() => {
    mock.restore();
});

describe('hook run — registration', () => {
    it('registers the run subcommand under the hook group', () => {
        const cmd = new Command('hook');
        registerHookRun(cmd);
        const run = cmd.commands.find((c) => c.name() === 'run');
        expect(run).toBeDefined();
        // <plugin> <hook-id> are two required positional args
        expect(run?.usage()).toContain('<plugin>');
        expect(run?.usage()).toContain('<hook-id>');
    });

    it('action reads stdin, runs the dispatcher, and exits with the hook code', async () => {
        const cmd = new Command('hook');
        registerHookRun(cmd, () => '{"tool_name":"Read"}');
        spyOn(process.stderr, 'write').mockImplementation(() => true);
        const exit = spyOn(process, 'exit').mockImplementation(() => undefined as never);

        await cmd.parseAsync(['node', 'hook', 'run', 'sp', 'does-not-exist']);

        // Unknown hooks fail open (exit 0) — see dispatcher test for the policy rationale.
        expect(exit).toHaveBeenCalledWith(0);
    });
});

describe('hook run — dispatcher', () => {
    it('fails open (exit 0) with a skew warning and the known-hook list for an unknown hook id', () => {
        // Unknown hooks fail open: an unrecognized id means the installed plugin emits a hook
        // the running CLI doesn't know — version skew, not a policy violation. Blocking would
        // turn skew into stuck agent loops. Assert we still surface a loud warning + the list.
        const errs: string[] = [];
        const originalErr = process.stderr.write.bind(process.stderr);
        (process.stderr.write as (chunk: unknown) => boolean) = (chunk: unknown) => {
            errs.push(String(chunk));
            return true;
        };
        try {
            const code = hookRun('sp', 'does-not-exist', {}, '{}');
            expect(code).toBe(0);
            expect(errs.join('')).toContain("unknown hook 'sp does-not-exist'");
            expect(errs.join('')).toContain('Failing open');
            // The warning must name the real installed version — 'unknown' means the version
            // lookup silently broke (task 0074: skew is only diagnosable if the version is real).
            expect(errs.join('')).toContain(`(superskill ${cliVersion})`);
            expect(errs.join('')).toContain('sp/task-write-guard');
            expect(errs.join('')).toContain('sp/context-post-tool');
            expect(errs.join('')).toContain('sp/context-session-start');
            expect(errs.join('')).toContain('sp/context-session-stop');
            expect(errs.join('')).toContain('cc/anti-hallucination');
        } finally {
            process.stderr.write = originalErr;
        }
    });
});

describe('parseSpurBinSpec', () => {
    it('splits unquoted tokens on spaces', () => {
        expect(parseSpurBinSpec('spur --flag')).toEqual(['spur', '--flag']);
    });

    it('preserves spaces inside double- or single-quoted paths', () => {
        expect(parseSpurBinSpec('"/opt/my tools/spur" task')).toEqual(['/opt/my tools/spur', 'task']);
        expect(parseSpurBinSpec("'/opt/my tools/spur' --x")).toEqual(['/opt/my tools/spur', '--x']);
    });

    it('returns a single token when the whole binary path is quoted', () => {
        expect(parseSpurBinSpec('"/Applications/Spur CLI/spur"')).toEqual(['/Applications/Spur CLI/spur']);
    });
});

describe('hook run — sp/task-write-guard', () => {
    const payload = (tool: string, path: string) =>
        JSON.stringify({ tool_name: tool, tool_input: { file_path: path } });
    it('fails open (allow) for a non-Write/Edit tool', () => {
        const { code, out } = capture('sp', 'task-write-guard', {}, payload('Read', '/tmp/x.md'));
        // WHY: allow = empty stdout + exit 0 — the cross-agent "continue normally" signal.
        // Codex rejects `permissionDecision:"allow"` in JSON, so the guard emits nothing.
        expect(code).toBe(0);
        expect(out).toBe('');
    });
    it('fails open (allow) on a malformed payload', () => {
        const { code, out } = capture('sp', 'task-write-guard', {}, 'not json');
        expect(code).toBe(0);
        expect(out).toBe('');
    });
    it('fails open (allow) when the path is empty', () => {
        const { code, out } = capture('sp', 'task-write-guard', {}, payload('Edit', ''));
        expect(code).toBe(0);
        expect(out).toBe('');
    });
    it('short-circuits to allow when SPUR_WRITE_GUARD=off (no subprocess)', () => {
        const { code, out } = capture(
            'sp',
            'task-write-guard',
            { SPUR_WRITE_GUARD: 'off' },
            payload('Edit', '/any/task.md'),
        );
        expect(code).toBe(0);
        expect(out).toBe('');
    });
    it('fails open (allow) when `spur` cannot resolve ownership (not on PATH / unknown cwd)', () => {
        // PATH stripped → spawnSync errors → fail open. A non-corpus path under any resolvable cwd
        // also yields allow; both converge on the safe default.
        const { code, out } = capture(
            'sp',
            'task-write-guard',
            { PATH: '', CLAUDE_PROJECT_DIR: '/nonexistent-project-dir' },
            payload('Edit', '/nonexistent-project-dir/scratch.md'),
        );
        expect(code).toBe(0);
        expect(out).toBe('');
    });
    it('fails open (allow) when the resolver reports an unowned path', () => {
        const result = runSpTaskWriteGuard(
            { CLAUDE_PROJECT_DIR: process.cwd() },
            payload('Edit', '/tmp/not-a-task.md'),
            () => 'unowned',
        );
        expect(result.exitCode).toBe(0);
        expect(result.output).toBe('');
    });

    it('denies Write/Edit when the resolver reports an owned task file', () => {
        const result = runSpTaskWriteGuard(
            { CLAUDE_PROJECT_DIR: process.cwd() },
            payload('Write', '/repo/docs/tasks/0001_example.md'),
            () => 'owned',
        );
        // WHY: deny = exit 2 + reason on stderr (universal block signal). Empty stdout avoids
        // the Codex-incompatible `permissionDecision` JSON. Both Claude Code and Codex honor
        // exit 2 as a block.
        expect(result.exitCode).toBe(2);
        expect(result.output).toBe('');
        expect(result.stderr).toContain('owned by the spur corpus');
    });
});

describe('hook run — cc/anti-hallucination (Stop, canonical output contract)', () => {
    it('emits a bare Claude Stop allow shape (hookEventName only, no feedback) on a passing message', () => {
        const args = JSON.stringify({
            messages: [{ role: 'assistant', content: 'Done. Refactored the helper; all tests green.' }],
        });
        const { code, out } = capture('cc', 'anti-hallucination', { ARGUMENTS: args }, '');
        const parsed = JSON.parse(out);
        // WHY: Claude validates Stop output against a fixed schema — the allow path must carry
        // `hookSpecificOutput.hookEventName: "Stop"` (required) and must NOT use the invented
        // `allowStop`/`feedback` fields that fail validation. It also omits `additionalContext`:
        // a permitted stop has nothing for the model to act on, so surfacing the allow reason
        // would only add per-turn chat noise.
        expect(parsed.hookSpecificOutput.hookEventName).toBe('Stop');
        expect(parsed.hookSpecificOutput.additionalContext).toBeUndefined();
        expect(parsed.allowStop).toBeUndefined();
        expect(parsed.decision).toBeUndefined();
        expect(code).toBe(0);
    });

    it('blocks the stop via decision:"block" + reason (exit 2, reason on stderr) when the protocol fails', () => {
        const args = JSON.stringify({
            messages: [
                {
                    role: 'assistant',
                    content:
                        'The library version 2.3.1 API uses the new documentation method for the framework function. I think this should work probably.',
                },
            ],
        });
        const { code, out, err } = capture('cc', 'anti-hallucination', { ARGUMENTS: args }, '');
        const parsed = JSON.parse(out);
        // WHY: a Stop hook blocks via the top-level `decision: "block"` + `reason` channel, not via
        // a non-schema `allowStop:false`. `hookEventName` is still required on the block payload.
        // Exit MUST be 2 with the reason on stderr: Claude Code treats exit 1 as a non-blocking
        // error (stdout JSON is only honored at exit 0), so a 1 here would never block anything.
        expect(parsed.decision).toBe('block');
        expect(parsed.reason).toContain('Add verification');
        expect(parsed.hookSpecificOutput.hookEventName).toBe('Stop');
        expect(code).toBe(2);
        expect(err).toContain('Add verification');
    });

    it('fails open with a valid allow shape on empty/invalid ARGUMENTS', () => {
        const empty = capture('cc', 'anti-hallucination', {}, '');
        const emptyParsed = JSON.parse(empty.out);
        expect(emptyParsed.hookSpecificOutput.hookEventName).toBe('Stop');
        expect(emptyParsed.decision).toBeUndefined();
        expect(empty.code).toBe(0);

        const invalid = capture('cc', 'anti-hallucination', { ARGUMENTS: 'not json' }, '');
        const invalidParsed = JSON.parse(invalid.out);
        expect(invalidParsed.hookSpecificOutput.hookEventName).toBe('Stop');
        expect(invalidParsed.decision).toBeUndefined();
        expect(invalid.code).toBe(0);
    });

    it('verifies the omp agent_end event delivered on stdin (no ARGUMENTS set)', () => {
        // WHY: real hosts deliver the payload on stdin — omp's generated hook module forwards
        // its agent_end event ({type, messages}). Before the stdin channel existed the guard
        // resolved an empty context and allowed everything: permanently fail-open in production.
        const event = JSON.stringify({
            type: 'agent_end',
            messages: [
                {
                    role: 'assistant',
                    content: 'The framework API function documentation says version 4.2 probably works, I think.',
                },
            ],
        });
        const { code, err } = capture('cc', 'anti-hallucination', {}, event);
        expect(code).toBe(2);
        expect(err).toContain('Add verification');
    });

    it('verifies the Claude Stop payload by reading the transcript JSONL from stdin transcript_path', () => {
        const dir = mkdtempSync(join(tmpdir(), 'superskill-ah-transcript-'));
        const transcriptPath = join(dir, 'session.jsonl');
        const lines = [
            JSON.stringify({ type: 'user', message: { role: 'user', content: 'what version?' } }),
            JSON.stringify({
                type: 'assistant',
                message: {
                    role: 'assistant',
                    content: [
                        {
                            type: 'text',
                            text: 'The library version 9.9 API method should probably work — I believe the framework function handles it.',
                        },
                    ],
                },
            }),
            // Trailing tool_use-only assistant turn: the verifiable claim is the last TEXTUAL turn.
            JSON.stringify({
                type: 'assistant',
                message: { role: 'assistant', content: [{ type: 'tool_use' }] },
            }),
        ];
        writeFileSync(transcriptPath, `${lines.join('\n')}\n`);

        const payload = JSON.stringify({ transcript_path: transcriptPath, stop_hook_active: false });
        const { code, err } = capture('cc', 'anti-hallucination', {}, payload);
        expect(code).toBe(2);
        expect(err).toContain('Add verification');
    });

    it('allows immediately when stop_hook_active is true (block-loop guard)', () => {
        // WHY: Claude sets stop_hook_active=true when the agent continues because a Stop hook
        // already blocked once. Blocking again would loop the agent forever.
        const payload = JSON.stringify({ transcript_path: '/nonexistent.jsonl', stop_hook_active: true });
        const { code, out } = capture('cc', 'anti-hallucination', {}, payload);
        expect(code).toBe(0);
        expect(JSON.parse(out).decision).toBeUndefined();
    });

    it('fails open when the transcript path is unreadable', () => {
        const payload = JSON.stringify({ transcript_path: '/nonexistent/never.jsonl', stop_hook_active: false });
        const { code, out } = capture('cc', 'anti-hallucination', {}, payload);
        expect(code).toBe(0);
        expect(JSON.parse(out).decision).toBeUndefined();
    });
});

describe('hook run — sp/context-* (indexed-context token ledger, all fail-open)', () => {
    // WHY: the 3 context hooks are side-effect-only (token ledger). They must ALWAYS return
    // exit 0 with empty stdout — a broken context hook must never wedge the agent. These tests
    // verify the fail-open contract against the edge cases that triggered it (missing dir,
    // missing session, bad JSON, wrong tool), plus a golden-path ledger write.
    let tmpRoot: string;

    beforeEach(() => {
        tmpRoot = mkdtempSync(join(tmpdir(), 'hook-run-ctx-'));
    });
    afterEach(() => {
        mock.restore();
    });

    it('context-session-start: creates .session.json + session_start event and exits 0', () => {
        const { code, out } = capture('sp', 'context-session-start', { CLAUDE_PROJECT_DIR: tmpRoot }, '');
        expect(code).toBe(0);
        expect(out).toBe('');
        const ctxDir = join(tmpRoot, '.spur', 'context');
        const session = JSON.parse(readFileSync(join(ctxDir, '.session.json'), 'utf-8'));
        expect(session.session).toMatch(/^session-\d{4}-\d{2}-\d{2}-\d{4}$/);
        expect(session.reads).toBe(0);
        expect(session.writes).toBe(0);
        expect(session.tokens).toBe(0);
        const ledger = readFileSync(join(ctxDir, 'token-ledger.jsonl'), 'utf-8').trim().split('\n');
        expect(ledger.length).toBe(1);
        const first = JSON.parse(ledger[0] ?? '');
        expect(first.type).toBe('session_start');
    });

    it('context-post-tool: appends a read event and exits 0', () => {
        capture('sp', 'context-session-start', { CLAUDE_PROJECT_DIR: tmpRoot }, '');
        const payload = JSON.stringify({
            tool_name: 'Read',
            tool_input: { file_path: '/tmp/x.md' },
            tool_response: { content: 'hello world' },
        });
        const { code, out } = capture('sp', 'context-post-tool', { CLAUDE_PROJECT_DIR: tmpRoot }, payload);
        expect(code).toBe(0);
        expect(out).toBe('');
        const ledger = readFileSync(join(tmpRoot, '.spur', 'context', 'token-ledger.jsonl'), 'utf-8')
            .trim()
            .split('\n');
        const events = ledger.map((l) => JSON.parse(l));
        const readEvt = events.find((e) => e.type === 'read');
        expect(readEvt).toBeDefined();
        expect(readEvt.file).toBe('/tmp/x.md');
        expect(readEvt.tokens).toBeGreaterThan(0);
        // Running totals on .session.json keep Stop O(1).
        const session = JSON.parse(readFileSync(join(tmpRoot, '.spur', 'context', '.session.json'), 'utf-8'));
        expect(session.reads).toBe(1);
        expect(session.writes).toBe(0);
        expect(session.tokens).toBe(readEvt.tokens);
    });

    it('context-post-tool: fails open (exit 0, no ledger write) without a session', () => {
        // No session-start called → no .session.json → hook must fail open silently.
        const payload = JSON.stringify({
            tool_name: 'Read',
            tool_input: { file_path: '/tmp/x.md' },
            tool_response: { content: 'hello' },
        });
        const { code, out } = capture('sp', 'context-post-tool', { CLAUDE_PROJECT_DIR: tmpRoot }, payload);
        expect(code).toBe(0);
        expect(out).toBe('');
    });

    it('context-post-tool: fails open on malformed JSON', () => {
        capture('sp', 'context-session-start', { CLAUDE_PROJECT_DIR: tmpRoot }, '');
        const { code, out } = capture('sp', 'context-post-tool', { CLAUDE_PROJECT_DIR: tmpRoot }, 'not json');
        expect(code).toBe(0);
        expect(out).toBe('');
    });

    it('context-post-tool: ignores non-Read/Write/Edit tools (matcher contract)', () => {
        capture('sp', 'context-session-start', { CLAUDE_PROJECT_DIR: tmpRoot }, '');
        const { code, out } = capture(
            'sp',
            'context-post-tool',
            { CLAUDE_PROJECT_DIR: tmpRoot },
            JSON.stringify({ tool_name: 'Bash', tool_input: { file_path: '/tmp/x' } }),
        );
        expect(code).toBe(0);
        expect(out).toBe('');
        const ledger = readFileSync(join(tmpRoot, '.spur', 'context', 'token-ledger.jsonl'), 'utf-8')
            .trim()
            .split('\n');
        const events = ledger.map((l) => JSON.parse(l));
        expect(events.some((e) => e.type === 'read' || e.type === 'write')).toBe(false);
    });

    it('context-session-stop: appends session_end with totals and removes .session.json', () => {
        capture('sp', 'context-session-start', { CLAUDE_PROJECT_DIR: tmpRoot }, '');
        capture(
            'sp',
            'context-post-tool',
            { CLAUDE_PROJECT_DIR: tmpRoot },
            JSON.stringify({
                tool_name: 'Read',
                tool_input: { file_path: '/a.md' },
                tool_response: { content: 'aaaa' },
            }),
        );
        capture(
            'sp',
            'context-post-tool',
            { CLAUDE_PROJECT_DIR: tmpRoot },
            JSON.stringify({
                tool_name: 'Write',
                tool_input: { file_path: '/b.md' },
                tool_response: { content: 'bbbb' },
            }),
        );

        const { code, out } = capture('sp', 'context-session-stop', { CLAUDE_PROJECT_DIR: tmpRoot }, '');
        expect(code).toBe(0);
        expect(out).toBe('');

        const ctxDir = join(tmpRoot, '.spur', 'context');
        expect(existsSync(join(ctxDir, '.session.json'))).toBe(false);
        const events = readFileSync(join(ctxDir, 'token-ledger.jsonl'), 'utf-8')
            .trim()
            .split('\n')
            .map((l) => JSON.parse(l));
        const endEvt = events.find((e) => e.type === 'session_end');
        expect(endEvt).toBeDefined();
        expect(endEvt.totals.reads).toBe(1);
        expect(endEvt.totals.writes).toBe(1);
        expect(endEvt.totals.tokens).toBeGreaterThan(0);
    });

    it('context-session-stop: fails open when no session exists', () => {
        const { code, out } = capture('sp', 'context-session-stop', { CLAUDE_PROJECT_DIR: tmpRoot }, '');
        expect(code).toBe(0);
        expect(out).toBe('');
    });
});
