import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProcessExecutor, ProcessOptions } from '@gobing-ai/ts-runtime';
import { Command } from 'commander';
import {
    couldBeTaskCorpusPath,
    hookRun,
    parseSpurBinSpec,
    registerHookRun,
    resolveSpurTaskOwnership,
    runSpTaskWriteGuard,
} from '../../src/commands/hook-run';
import { cliVersion } from '../../src/version';

/**
 * `superskill hook run <plugin> <hook-id>` — the cross-agent hook runtime trigger (task 0151).
 * Tests assert the dispatcher contract (resolve runner, emit the right exit code + output) and
 * each runner's decision + fail-open behavior. Allow → exit 0 (PreToolUse with empty stdout, Stop
 * with canonical JSON). Deny takes the clean channel per host: Stop → `decision:"block"` JSON at
 * exit 0 (cc/anti-hallucination is Claude-Code-only); PreToolUse → `permissionDecision:"deny"` JSON
 * at exit 0 when Claude Code is the host (CLAUDE_PROJECT_DIR set), else exit 2 + stderr for
 * Codex/omp. Claude Code treats exit 1 as a non-blocking error, so 1 never blocks; it honors stdout
 * JSON only at exit 0. `hookRun` returns the exit code and writes to stdout/stderr; tests capture
 * both streams to inspect the payload.
 */

async function capture(
    plugin: string,
    hookId: string,
    env: NodeJS.ProcessEnv,
    stdinText: string,
    profile?: 'block' | 'deny',
) {
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
        const code = await hookRun(plugin, hookId, env, stdinText, profile);
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
    it('registers the run subcommand under the hook group', async () => {
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
    it('fails open (exit 0) with a skew warning and the known-hook list for an unknown hook id', async () => {
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
            const code = await hookRun('sp', 'does-not-exist', {}, '{}');
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
    it('splits unquoted tokens on spaces', async () => {
        expect(parseSpurBinSpec('spur --flag')).toEqual(['spur', '--flag']);
    });

    it('preserves spaces inside double- or single-quoted paths', async () => {
        expect(parseSpurBinSpec('"/opt/my tools/spur" task')).toEqual(['/opt/my tools/spur', 'task']);
        expect(parseSpurBinSpec("'/opt/my tools/spur' --x")).toEqual(['/opt/my tools/spur', '--x']);
    });

    it('returns a single token when the whole binary path is quoted', async () => {
        expect(parseSpurBinSpec('"/Applications/Spur CLI/spur"')).toEqual(['/Applications/Spur CLI/spur']);
    });
});

describe('hook run — sp/task-write-guard', () => {
    const payload = (tool: string, path: string) =>
        JSON.stringify({ tool_name: tool, tool_input: { file_path: path } });
    it('fails open (allow) for a non-Write/Edit tool', async () => {
        const { code, out } = await capture('sp', 'task-write-guard', {}, payload('Read', '/tmp/x.md'));
        // WHY: allow = empty stdout + exit 0 — the cross-agent "continue normally" signal.
        // Codex rejects `permissionDecision:"allow"` in JSON, so the guard emits nothing.
        expect(code).toBe(0);
        expect(out).toBe('');
    });
    it('fails open (allow) on a malformed payload', async () => {
        const { code, out } = await capture('sp', 'task-write-guard', {}, 'not json');
        expect(code).toBe(0);
        expect(out).toBe('');
    });
    it('fails open (allow) when the path is empty', async () => {
        const { code, out } = await capture('sp', 'task-write-guard', {}, payload('Edit', ''));
        expect(code).toBe(0);
        expect(out).toBe('');
    });
    it('short-circuits to allow when SPUR_WRITE_GUARD=off (no subprocess)', async () => {
        const { code, out } = await capture(
            'sp',
            'task-write-guard',
            { SPUR_WRITE_GUARD: 'off' },
            payload('Edit', '/any/task.md'),
        );
        expect(code).toBe(0);
        expect(out).toBe('');
    });
    it('fails open (allow) when `spur` cannot resolve ownership (not on PATH / unknown cwd)', async () => {
        // PATH stripped → spawnSync errors → fail open. A non-corpus path under any resolvable cwd
        // also yields allow; both converge on the safe default.
        const { code, out } = await capture(
            'sp',
            'task-write-guard',
            { PATH: '', CLAUDE_PROJECT_DIR: '/nonexistent-project-dir' },
            payload('Edit', '/nonexistent-project-dir/scratch.md'),
        );
        expect(code).toBe(0);
        expect(out).toBe('');
    });
    it('fails open (allow) when the resolver reports an unowned path', async () => {
        const result = await runSpTaskWriteGuard(
            { CLAUDE_PROJECT_DIR: process.cwd() },
            payload('Edit', '/tmp/not-a-task.md'),
            () => Promise.resolve('unowned'),
        );
        expect(result.exitCode).toBe(0);
        expect(result.output).toBe('');
    });

    it('denies Write/Edit via permissionDecision:"deny" JSON (exit 0) when Claude Code is the host', async () => {
        const result = await runSpTaskWriteGuard(
            { CLAUDE_PROJECT_DIR: process.cwd() },
            payload('Write', '/repo/docs/tasks/0001_example.md'),
            () => Promise.resolve('owned'),
        );
        // WHY: Claude Code honors stdout JSON only at exit 0, so a clean deny emits
        // `permissionDecision:"deny"` + reason at exit 0 (not the exit-2 "blocking error" path).
        const parsed = JSON.parse(result.output);
        expect(parsed.hookSpecificOutput.hookEventName).toBe('PreToolUse');
        expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny');
        expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain('owned by the spur corpus');
        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBeUndefined();
    });

    it('denies Write/Edit via exit 2 + stderr when a non-Claude-Code host has no CLAUDE_PROJECT_DIR', async () => {
        const result = await runSpTaskWriteGuard({}, payload('Write', '/repo/docs/tasks/0001_example.md'), () =>
            Promise.resolve('owned'),
        );
        // WHY: Codex/omp don't set CLAUDE_PROJECT_DIR and reject `permissionDecision` JSON (418894e),
        // so the cross-agent fallback is exit 2 + stderr — the universal block signal.
        expect(result.exitCode).toBe(2);
        expect(result.output).toBe('');
        expect(result.stderr).toContain('owned by the spur corpus');
    });
});

describe('hook run — sp/task-write-guard prefilter (Spur task 0398 R2)', () => {
    const payload = (tool: string, file_path: string) => JSON.stringify({ tool_name: tool, tool_input: { file_path } });

    /** Resolver that records whether it ran, so a skipped spawn is observable (R7). */
    function spyResolver() {
        let called = false;
        return {
            fn: () => {
                called = true;
                return Promise.resolve('unowned' as const);
            },
            wasCalled: () => called,
        };
    }

    // WHY: each row is a path that cannot be a task file. The guard must allow it without ever
    // consulting `spur task resolve` — the spawn costs ~2.4 s. The spy makes the skip observable;
    // a test that only checked exitCode === 0 would pass even with the prefilter deleted.
    it.each([
        ['source file', '/repo/src/foo.ts'],
        ['manifest', '/repo/package.json'],
        ['lockfile', '/repo/bun.lock'],
        ['markdown outside a tasks segment', '/repo/README.md'],
        ['docs markdown that is not task corpus', '/repo/docs/00_ADR.md'],
        ['tasks-like segment that is not markdown', '/repo/docs/tasks3/notes.txt'],
    ])('allows a %s without spawning spur task resolve', async (_label, path) => {
        const spy = spyResolver();
        const result = await runSpTaskWriteGuard({ CLAUDE_PROJECT_DIR: process.cwd() }, payload('Write', path), spy.fn);
        expect(result.exitCode).toBe(0);
        expect(result.output).toBe('');
        // WHY: the spawn costs ~2.4 s. Skipping it for non-corpus paths is the whole fix.
        expect(spy.wasCalled()).toBe(false);
    });

    it.each([
        ['docs/tasks', '/repo/docs/tasks/0001_example.md'],
        ['docs/tasks3', '/repo/docs/tasks3/0398_example.md'],
        ['flat tasks dir', '/repo/tasks/0042_example.md'],
        ['relative path', 'docs/tasks2/0007_example.md'],
    ])('still consults spur task resolve for a %s path', async (_label, path) => {
        const spy = spyResolver();
        await runSpTaskWriteGuard({ CLAUDE_PROJECT_DIR: process.cwd() }, payload('Write', path), spy.fn);
        expect(spy.wasCalled()).toBe(true);
    });

    it('still denies an owned task file — the prefilter must not weaken the guard', async () => {
        const result = await runSpTaskWriteGuard(
            { CLAUDE_PROJECT_DIR: process.cwd() },
            payload('Write', '/repo/docs/tasks/0001_example.md'),
            () => Promise.resolve('owned'),
        );
        expect(JSON.parse(result.output).hookSpecificOutput.permissionDecision).toBe('deny');
    });

    it('still fails open when ownership cannot be determined', async () => {
        const result = await runSpTaskWriteGuard(
            { CLAUDE_PROJECT_DIR: process.cwd() },
            payload('Write', '/repo/docs/tasks/0001_example.md'),
            () => Promise.resolve('unknown'),
        );
        expect(result.exitCode).toBe(0);
        expect(result.output).toBe('');
    });

    it('classifies paths at the unit level', () => {
        expect(couldBeTaskCorpusPath('/repo/docs/tasks3/0398_x.md')).toBe(true);
        expect(couldBeTaskCorpusPath('/repo/tasks/0042_x.md')).toBe(true);
        expect(couldBeTaskCorpusPath('/repo/src/index.ts')).toBe(false);
        expect(couldBeTaskCorpusPath('/repo/docs/tasks3/x.txt')).toBe(false);
        expect(couldBeTaskCorpusPath('/repo/docs/tasksfoo/x.md')).toBe(false);
        expect(couldBeTaskCorpusPath('C:\\repo\\docs\\tasks\\0001_x.md')).toBe(true);
    });
});

/**
 * `resolveSpurTaskOwnership` subprocess contract — the three exit-code branches and the SPUR_BIN
 * override (task 0109 + the resolveSpurTaskOwnership refactor). A fake {@link ProcessExecutor}
 * records the argv the hook builds, so these tests prove the exact `spur task resolve` invocation
 * (flags, positional path, --strict --json) without shelling out.
 */
describe('resolveSpurTaskOwnership — subprocess contract', () => {
    /** Minimal fake executor that returns a canned result and records the invocation. */
    function fakeExecutor(exitCode: number | null): { executor: ProcessExecutor; calls: ProcessOptions[] } {
        const calls: ProcessOptions[] = [];
        const executor: ProcessExecutor = {
            run: (options) => {
                calls.push(options);
                return Promise.resolve({
                    command: options.command,
                    args: options.args ?? [],
                    exitCode,
                    stdout: '',
                    stderr: '',
                    durationMs: 1,
                });
            },
            runStreaming: () => {
                throw new Error('not used');
            },
        };
        return { executor, calls };
    }

    it('maps a spur exit code 0 to "owned" and builds the strict JSON argv', async () => {
        const { executor, calls } = fakeExecutor(0);
        const ownership = await resolveSpurTaskOwnership('/repo/docs/tasks/0001_x.md', '/repo', executor);
        expect(ownership).toBe('owned');
        expect(calls[0]).toBeDefined();
        const opts = calls[0];
        expect(opts?.command).toBe('spur');
        // WHY: --strict makes unowned exit non-zero; --json keeps stdout machine-parsable. The
        // resolved file path must be the first positional after 'task resolve'.
        expect(opts?.args).toEqual(['task', 'resolve', '/repo/docs/tasks/0001_x.md', '--strict', '--json']);
        expect(opts?.cwd).toBe('/repo');
        expect(opts?.timeout).toBe(8000);
    });

    it('maps a non-zero spur exit code to "unowned"', async () => {
        const { executor } = fakeExecutor(1);
        const ownership = await resolveSpurTaskOwnership('/repo/scratch.md', '/repo', executor);
        expect(ownership).toBe('unowned');
    });

    it('fails open ("unknown") when spur cannot run (exitCode null — spawn/timeout failure)', async () => {
        // WHY: a missing `spur` binary, a SIGKILL, or a timeout all surface as exitCode === null.
        // The guard must fail open rather than block writes it cannot vet.
        const { executor } = fakeExecutor(null);
        const ownership = await resolveSpurTaskOwnership('/repo/docs/tasks/0001_x.md', '/repo', executor);
        expect(ownership).toBe('unknown');
    });

    it('honors a quoted SPUR_BIN override by splitting it into command + leading args', async () => {
        const { executor, calls } = fakeExecutor(0);
        const restore = process.env.SPUR_BIN;
        process.env.SPUR_BIN = '"/opt/my tools/spur" --no-color';
        try {
            await resolveSpurTaskOwnership('/x.md', '/repo', executor);
        } finally {
            if (restore === undefined) delete process.env.SPUR_BIN;
            else process.env.SPUR_BIN = restore;
        }
        expect(calls[0]).toBeDefined();
        const opts = calls[0];
        // WHY: SPUR_BIN may carry a quoted path with spaces plus preset flags; parseSpurBinSpec
        // splits them so the spawn sees ['/opt/my tools/spur', '--no-color', 'task', ...].
        expect(opts?.command).toBe('/opt/my tools/spur');
        expect(opts?.args).toEqual(['--no-color', 'task', 'resolve', '/x.md', '--strict', '--json']);
    });
});

describe('hook run — cc/anti-hallucination (Stop, canonical output contract)', () => {
    it('emits a bare Claude Stop allow shape (hookEventName only, no feedback) on a passing message', async () => {
        const args = JSON.stringify({
            messages: [{ role: 'assistant', content: 'Done. Refactored the helper; all tests green.' }],
        });
        const { code, out } = await capture('cc', 'anti-hallucination', { ARGUMENTS: args }, '');
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

    it('blocks the stop via decision:"block" + reason at exit 0 (clean feedback, no error) when the protocol fails', async () => {
        const args = JSON.stringify({
            messages: [
                {
                    role: 'assistant',
                    content:
                        'The library version 2.3.1 API uses the new documentation method for the framework function. I think this should work probably.',
                },
            ],
        });
        const { code, out, err } = await capture('cc', 'anti-hallucination', { ARGUMENTS: args }, '');
        const parsed = JSON.parse(out);
        // WHY: a Stop hook blocks via the top-level `decision: "block"` + `reason` channel, not via
        // a non-schema `allowStop:false`. Claude Code honors stdout JSON ONLY at exit 0, so the block
        // emits its JSON there; exit 2 would discard that JSON and surface stderr as a "blocking
        // error" (the misrendering this test pins as fixed). stderr stays empty.
        expect(parsed.decision).toBe('block');
        expect(parsed.reason).toContain('Add verification');
        expect(parsed.hookSpecificOutput.hookEventName).toBe('Stop');
        expect(code).toBe(0);
        expect(err).toBe('');
    });

    it('emits decision:"deny" (AfterAgent) under --profile deny for Gemini/Antigravity hosts', async () => {
        const args = JSON.stringify({
            messages: [
                {
                    role: 'assistant',
                    content:
                        'The library version 2.3.1 API uses the new documentation method for the framework function. I think this should work probably.',
                },
            ],
        });
        const { code, out, err } = await capture('cc', 'anti-hallucination', { ARGUMENTS: args }, '', 'deny');
        const parsed = JSON.parse(out);
        // WHY: Gemini/Antigravity AfterAgent rejects via decision:"deny" (not "block"); reason feeds
        // back as a new prompt. Allow omits decision. Same engine, profile-selected output shape.
        expect(parsed.decision).toBe('deny');
        expect(parsed.reason).toContain('Add verification');
        expect(parsed.hookSpecificOutput.hookEventName).toBe('AfterAgent');
        expect(code).toBe(0);
        expect(err).toBe('');
    });

    it('fails open with a valid allow shape on empty/invalid ARGUMENTS', async () => {
        const empty = await capture('cc', 'anti-hallucination', {}, '');
        const emptyParsed = JSON.parse(empty.out);
        expect(emptyParsed.hookSpecificOutput.hookEventName).toBe('Stop');
        expect(emptyParsed.decision).toBeUndefined();
        expect(empty.code).toBe(0);

        const invalid = await capture('cc', 'anti-hallucination', { ARGUMENTS: 'not json' }, '');
        const invalidParsed = JSON.parse(invalid.out);
        expect(invalidParsed.hookSpecificOutput.hookEventName).toBe('Stop');
        expect(invalidParsed.decision).toBeUndefined();
        expect(invalid.code).toBe(0);
    });

    it('verifies the omp agent_end event delivered on stdin (no ARGUMENTS set)', async () => {
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
        const { code, out, err } = await capture('cc', 'anti-hallucination', {}, event);
        const parsed = JSON.parse(out);
        expect(parsed.decision).toBe('block');
        expect(parsed.reason).toContain('Add verification');
        expect(code).toBe(0);
        expect(err).toBe('');
    });

    it('verifies the Claude Stop payload by reading the transcript JSONL from stdin transcript_path', async () => {
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
        const { code, out, err } = await capture('cc', 'anti-hallucination', {}, payload);
        const parsed = JSON.parse(out);
        expect(parsed.decision).toBe('block');
        expect(parsed.reason).toContain('Add verification');
        expect(code).toBe(0);
        expect(err).toBe('');
    });

    it('allows immediately when stop_hook_active is true (block-loop guard)', async () => {
        // WHY: Claude sets stop_hook_active=true when the agent continues because a Stop hook
        // already blocked once. Blocking again would loop the agent forever.
        const payload = JSON.stringify({ transcript_path: '/nonexistent.jsonl', stop_hook_active: true });
        const { code, out } = await capture('cc', 'anti-hallucination', {}, payload);
        expect(code).toBe(0);
        expect(JSON.parse(out).decision).toBeUndefined();
    });

    it('fails open when the transcript path is unreadable', async () => {
        const payload = JSON.stringify({ transcript_path: '/nonexistent/never.jsonl', stop_hook_active: false });
        const { code, out } = await capture('cc', 'anti-hallucination', {}, payload);
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

    function sessionPaths(): string[] {
        const ctxDir = join(tmpRoot, '.spur', 'context');
        if (!existsSync(ctxDir)) return [];
        return readdirSync(ctxDir)
            .filter((name) => /^\.session-[a-f0-9]{16}\.json$/.test(name))
            .map((name) => join(ctxDir, name));
    }

    function onlySessionPath(): string {
        const paths = sessionPaths();
        expect(paths).toHaveLength(1);
        return paths[0] as string;
    }

    beforeEach(() => {
        tmpRoot = mkdtempSync(join(tmpdir(), 'hook-run-ctx-'));
    });
    afterEach(() => {
        mock.restore();
    });

    it('context-session-start: creates an isolated session file + session_start event and exits 0', async () => {
        const { code, out } = await capture('sp', 'context-session-start', { CLAUDE_PROJECT_DIR: tmpRoot }, '');
        expect(code).toBe(0);
        expect(out).toBe('');
        const ctxDir = join(tmpRoot, '.spur', 'context');
        const session = JSON.parse(readFileSync(onlySessionPath(), 'utf-8'));
        expect(session.session).toMatch(/^session-\d{4}-\d{2}-\d{2}-\d{4}-[a-f0-9]{8}$/);
        expect(session.started).toBeString();
        // F4 (task 0127 R4): identity/start marker only — no running counters on session files.
        expect(session.reads).toBeUndefined();
        expect(session.writes).toBeUndefined();
        expect(session.tokens).toBeUndefined();
        const ledger = readFileSync(join(ctxDir, 'token-ledger.jsonl'), 'utf-8').trim().split('\n');
        expect(ledger.length).toBe(1);
        const first = JSON.parse(ledger[0] ?? '');
        expect(first.type).toBe('session_start');
    });

    it('context-post-tool: appends a read event and exits 0', async () => {
        capture('sp', 'context-session-start', { CLAUDE_PROJECT_DIR: tmpRoot }, '');
        const payload = JSON.stringify({
            tool_name: 'Read',
            tool_input: { file_path: '/tmp/x.md' },
            tool_response: { content: 'hello world' },
        });
        const { code, out } = await capture('sp', 'context-post-tool', { CLAUDE_PROJECT_DIR: tmpRoot }, payload);
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
        // F4 (task 0127 R4): PostToolUse only appends to the ledger — it must NOT rewrite the
        // session JSON (an unlocked read-modify-write lost increments under concurrency). The
        // session file stays an identity marker; Stop aggregates the ledger.
        const session = JSON.parse(readFileSync(onlySessionPath(), 'utf-8'));
        expect(session.reads).toBeUndefined();
        expect(session.writes).toBeUndefined();
        expect(session.tokens).toBeUndefined();
    });

    it('context-post-tool: fails open (exit 0, no ledger write) without a session', async () => {
        // No session-start called → no session file → hook must fail open silently.
        const payload = JSON.stringify({
            tool_name: 'Read',
            tool_input: { file_path: '/tmp/x.md' },
            tool_response: { content: 'hello' },
        });
        const { code, out } = await capture('sp', 'context-post-tool', { CLAUDE_PROJECT_DIR: tmpRoot }, payload);
        expect(code).toBe(0);
        expect(out).toBe('');
    });

    it('context-post-tool: fails open on malformed JSON', async () => {
        capture('sp', 'context-session-start', { CLAUDE_PROJECT_DIR: tmpRoot }, '');
        const { code, out } = await capture('sp', 'context-post-tool', { CLAUDE_PROJECT_DIR: tmpRoot }, 'not json');
        expect(code).toBe(0);
        expect(out).toBe('');
    });

    it('context-post-tool: ignores non-Read/Write/Edit tools (matcher contract)', async () => {
        capture('sp', 'context-session-start', { CLAUDE_PROJECT_DIR: tmpRoot }, '');
        const { code, out } = await capture(
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

    it('context-session-stop: appends session_end with totals and removes its session file', async () => {
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

        const { code, out } = await capture('sp', 'context-session-stop', { CLAUDE_PROJECT_DIR: tmpRoot }, '');
        expect(code).toBe(0);
        expect(out).toBe('');

        const ctxDir = join(tmpRoot, '.spur', 'context');
        expect(sessionPaths()).toHaveLength(0);
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

    it('context-session-stop: fails open when no session exists', async () => {
        const { code, out } = await capture('sp', 'context-session-stop', { CLAUDE_PROJECT_DIR: tmpRoot }, '');
        expect(code).toBe(0);
        expect(out).toBe('');
    });

    it('isolates interleaved concurrent sessions by payload session_id', async () => {
        const env = { CLAUDE_PROJECT_DIR: tmpRoot };
        const sessionA = JSON.stringify({ session_id: 'session-a' });
        const sessionB = JSON.stringify({ session_id: 'session-b' });
        capture('sp', 'context-session-start', env, sessionA);
        capture('sp', 'context-session-start', env, sessionB);
        expect(sessionPaths()).toHaveLength(2);

        capture(
            'sp',
            'context-post-tool',
            env,
            JSON.stringify({
                session_id: 'session-a',
                tool_name: 'Read',
                tool_input: { file_path: '/a.md' },
                tool_response: { content: 'aaaa' },
            }),
        );
        for (const file of ['/b.md', '/c.md']) {
            capture(
                'sp',
                'context-post-tool',
                env,
                JSON.stringify({
                    session_id: 'session-b',
                    tool_name: 'Write',
                    tool_input: { file_path: file },
                    tool_response: { content: 'bbbb' },
                }),
            );
        }

        capture('sp', 'context-session-stop', env, sessionA);
        expect(sessionPaths()).toHaveLength(1);
        const remaining = JSON.parse(readFileSync(onlySessionPath(), 'utf-8'));
        expect(remaining.session).toBe('session-b');
        // F4 (task 0127 R4): no running counters — each session's totals come from the ledger.
        expect(remaining.reads).toBeUndefined();
        expect(remaining.writes).toBeUndefined();

        capture('sp', 'context-session-stop', env, sessionB);
        expect(sessionPaths()).toHaveLength(0);
        const events = readFileSync(join(tmpRoot, '.spur', 'context', 'token-ledger.jsonl'), 'utf-8')
            .trim()
            .split('\n')
            .map((line) => JSON.parse(line));
        expect(events.find((event) => event.type === 'session_end' && event.session === 'session-a').totals).toEqual({
            reads: 1,
            writes: 0,
            tokens: 1,
        });
        expect(events.find((event) => event.type === 'session_end' && event.session === 'session-b').totals).toEqual({
            reads: 0,
            writes: 2,
            tokens: 2,
        });
    });

    it('context-session-stop: stale/partial session counters never override the ledger', async () => {
        // WHY (F4, task 0127 R4): concurrent PostToolUse processes could lose increments or
        // leave unreadable counters. Stop must ignore any present counters and always aggregate
        // the append-only ledger: only parseable read/write events whose session exactly
        // matches count; malformed lines and foreign sessions are skipped.
        const env = { CLAUDE_PROJECT_DIR: tmpRoot };
        const sessionId = 'ledger-wins';
        const sessionPayload = JSON.stringify({ session_id: sessionId });
        capture('sp', 'context-session-start', env, sessionPayload);
        const ctxDir = join(tmpRoot, '.spur', 'context');
        const sessionFile = onlySessionPath();
        const started = JSON.parse(readFileSync(sessionFile, 'utf-8'));
        // Seed stale counters for the SAME session — the state a lost PostToolUse race leaves.
        writeFileSync(sessionFile, JSON.stringify({ ...started, reads: 99, writes: 1, tokens: 999 }));

        // Append three ledger events for this session (2 reads, 1 write) plus a decoy from another.
        const ledger = join(ctxDir, 'token-ledger.jsonl');
        const evts = [
            { ts: '2026-07-31T00:00:00Z', session: sessionId, type: 'read', file: '/a.md', tokens: 3 },
            { ts: '2026-07-31T00:00:01Z', session: sessionId, type: 'read', file: '/b.md', tokens: 5 },
            { ts: '2026-07-31T00:00:02Z', session: sessionId, type: 'write', file: '/c.md', tokens: 7 },
            { ts: '2026-07-31T00:00:03Z', session: 'other', type: 'read', file: '/d.md', tokens: 99 },
            // An unparseable line must be skipped, not abort the scan.
            'this is not json',
        ];
        writeFileSync(ledger, `${evts.map((e) => (typeof e === 'string' ? e : JSON.stringify(e))).join('\n')}\n`);

        const { code, out } = await capture('sp', 'context-session-stop', env, sessionPayload);
        expect(code).toBe(0);
        expect(out).toBe('');

        const endEvents = readFileSync(ledger, 'utf-8')
            .trim()
            .split('\n')
            // WHY: the ledger intentionally contains an unparseable line (to prove the guard's
            // scan skips it). Parse defensively so the assertion doesn't choke on that seed line.
            .map((l) => {
                try {
                    return JSON.parse(l) as Record<string, unknown>;
                } catch {
                    return null;
                }
            })
            .filter((e): e is Record<string, unknown> => e !== null && e.type === 'session_end');
        const endEvt = endEvents.find((e) => e.session === sessionId);
        expect(endEvt).toBeDefined();
        // Only this session's events counted; the decoy 'other' session read excluded.
        expect(endEvt?.totals).toEqual({ reads: 2, writes: 1, tokens: 15 });
    });

    it('context-session-stop: fails open when the session file has no "session" string', async () => {
        // WHY: a corrupted/truncated session file (e.g. {reads:0} with no session id) must not
        // crash Stop. The guard reads the id, finds it missing, and returns OK without writing
        // a bogus session_end event.
        const env = { CLAUDE_PROJECT_DIR: tmpRoot };
        const sessionPayload = JSON.stringify({ session_id: 'corrupt' });
        capture('sp', 'context-session-start', env, sessionPayload);
        const sessionFile = onlySessionPath();
        writeFileSync(sessionFile, JSON.stringify({ reads: 0, writes: 0 })); // no "session" field

        const { code, out } = await capture('sp', 'context-session-stop', env, sessionPayload);
        expect(code).toBe(0);
        expect(out).toBe('');
        const ledger = readFileSync(join(tmpRoot, '.spur', 'context', 'token-ledger.jsonl'), 'utf-8')
            .trim()
            .split('\n');
        const events = ledger.map((l) => JSON.parse(l));
        // No session_end emitted for the corrupt session.
        expect(events.some((e) => e.type === 'session_end' && e.session === 'corrupt')).toBe(false);
    });

    it('uses transcript_path as the session identity when session_id is absent (Claude Stop payload)', async () => {
        // WHY: Claude Code Stop payloads carry transcript_path (not session_id). The context hooks
        // must key the session file off transcript_path so a Stop without session_id still resolves
        // to the same session the SessionStart/PostToolUse hooks created from that transcript.
        const env = { CLAUDE_PROJECT_DIR: tmpRoot };
        const transcript = '/tmp/session-xyz.jsonl';
        const startPayload = JSON.stringify({ transcript_path: transcript });
        capture('sp', 'context-session-start', env, startPayload);
        expect(sessionPaths()).toHaveLength(1);

        // A Stop with the SAME transcript_path must resolve to that session and clean it up.
        const { code } = await capture('sp', 'context-session-stop', env, startPayload);
        expect(code).toBe(0);
        expect(sessionPaths()).toHaveLength(0);
    });
});
