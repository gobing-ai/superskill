import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getEnvVar } from '@gobing-ai/superskill-core';
import { Command } from 'commander';
import {
    couldBeTaskCorpusPath,
    hookRun,
    payloadCouldTouchTaskCorpus,
    preToolUseByExitCode,
    registerHookRun,
    SPUR_CAPTURE_TIMEOUT_MS,
    SPUR_GUARD_TIMEOUT_MS,
    spurDelegate,
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

/**
 * `sp/*` → `spur self hook <id>` transport ({@link spurDelegate}). A fake `spur` shell script
 * (via `SPUR_BIN`, or as `spur` on `PATH`) records its argv + stdin and answers per
 * `FAKE_SPUR_MODE`, so every branch runs through a real spawn: success passthrough, deny
 * passthrough, ENOENT, timeout, an older spur without `self hook`, an unknown id, a crash, and
 * the task-write-guard pre-filter that avoids the spawn.
 */
const FAKE_SPUR = `#!/bin/sh
printf '%s\\n' "$@" > "$FAKE_SPUR_DIR/argv"
cat > "$FAKE_SPUR_DIR/stdin"
case "$FAKE_SPUR_MODE" in
  deny) printf '%s\\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"owned task file"}}' ;;
  block) printf '%s\\n' '{"decision":"block","reason":"inbox"}' ;;
  sleep) exec sleep 5 ;;
  old) printf 'spur logo\\n'; printf "error: unknown command 'hook'\\n" >&2; exit 1 ;;
  unknown-id) printf "spur self hook: unknown hook id 'nope' (known: task-write-guard); allowing\\n" >&2 ;;
  crash) exit 3 ;;
esac
exit 0
`;

describe('hook run — sp/* delegate to `spur self hook`', () => {
    let dir: string;
    let binDir: string;
    let spurPath: string;

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'hook-run-spur-'));
        binDir = join(dir, 'bin dir'); // a space: SPUR_BIN must be quoted to resolve
        mkdirSync(binDir);
        spurPath = join(binDir, 'spur');
        writeFileSync(spurPath, FAKE_SPUR);
        chmodSync(spurPath, 0o755);
    });

    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
    });

    const env = (mode: string, extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
        PATH: getEnvVar('PATH') ?? '/usr/bin:/bin',
        SPUR_BIN: `"${spurPath}"`,
        FAKE_SPUR_DIR: dir,
        FAKE_SPUR_MODE: mode,
        ...extra,
    });
    const argv = () => readFileSync(join(dir, 'argv'), 'utf-8').trim().split('\n');
    const spawned = () => existsSync(join(dir, 'argv'));
    const writePayload = (filePath: string) =>
        JSON.stringify({ tool_name: 'Write', tool_input: { file_path: filePath } });

    it('registers every sp hook id the sp plugin wires, including the formerly unhandled ones', async () => {
        const { err } = await capture('sp', 'does-not-exist', {}, '{}');
        for (const id of [
            'task-write-guard',
            'careful-guard',
            'context-post-tool',
            'context-session-start',
            'context-session-stop',
            'agent-lifecycle',
            'fleet-guest-stop',
        ]) {
            expect(err).toContain(`sp/${id}`);
        }
    });

    it('spawns `spur self hook <id> --host auto` with the payload on stdin and stays silent for a capture id', async () => {
        const payload = '{"session_id":"s1","tool_name":"Read"}';
        const { code, out, err } = await capture('sp', 'context-post-tool', env('silent'), payload);
        expect(code).toBe(0);
        expect(out).toBe('');
        expect(err).toBe('');
        expect(argv()).toEqual(['self', 'hook', 'context-post-tool', '--host', 'auto']);
        expect(readFileSync(join(dir, 'stdin'), 'utf-8')).toBe(payload);
    });

    it('passes --host claude when Claude Code is the host (CLAUDE_PROJECT_DIR set)', async () => {
        await capture('sp', 'agent-lifecycle', env('silent', { CLAUDE_PROJECT_DIR: dir }), '{}');
        expect(argv()).toEqual(['self', 'hook', 'agent-lifecycle', '--host', 'claude']);
    });

    it('keeps SPUR_BIN leading arguments ahead of the self-hook argv', async () => {
        await capture('sp', 'careful-guard', env('silent', { SPUR_BIN: `"${spurPath}" --no-logo` }), '{}');
        expect(argv()).toEqual(['--no-logo', 'self', 'hook', 'careful-guard', '--host', 'auto']);
    });

    it("forwards spur's deny decision verbatim (one line, exit 0) for an owned task file", async () => {
        const { code, out } = await capture(
            'sp',
            'task-write-guard',
            env('deny', { CLAUDE_PROJECT_DIR: dir }),
            writePayload(`${dir}/docs/tasks/0001_x.md`),
        );
        expect(code).toBe(0);
        expect(out).toBe(
            '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"owned task file"}}\n',
        );
    });

    it('re-expresses a deny as exit 2 + stderr reason off Claude Code (Codex/omp key off the exit code)', async () => {
        const { code, out, err } = await capture('sp', 'task-write-guard', env('deny'), writePayload('/r/tasks/1.md'));
        expect(code).toBe(2);
        expect(out).toBe('');
        expect(err.trim()).toBe('owned task file');
    });

    it('drops a PreToolUse allow/ask JSON off Claude Code (Codex rejects it) and keeps other output as-is', () => {
        const pre = (decision: string, extra: Record<string, unknown> = {}) =>
            JSON.stringify({
                hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: decision, ...extra },
            });
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

    it("forwards spur's Stop block for fleet-guest-stop", async () => {
        const { code, out } = await capture('sp', 'fleet-guest-stop', env('block'), '{}');
        expect(code).toBe(0);
        expect(JSON.parse(out)).toEqual({ decision: 'block', reason: 'inbox' });
    });

    it('finds `spur` on PATH when SPUR_BIN is unset', async () => {
        const { SPUR_BIN: _drop, ...rest } = env('silent');
        const { code } = await capture(
            'sp',
            'context-session-start',
            { ...rest, PATH: `${binDir}:${rest.PATH}` },
            '{}',
        );
        expect(code).toBe(0);
        expect(argv()).toEqual(['self', 'hook', 'context-session-start', '--host', 'auto']);
    });

    it('fails open (exit 0, no stdout, one stderr line) when spur is not installed (ENOENT)', async () => {
        const { code, out, err } = await capture(
            'sp',
            'careful-guard',
            env('deny', { SPUR_BIN: join(dir, 'missing', 'spur') }),
            '{}',
        );
        expect(code).toBe(0);
        expect(out).toBe('');
        expect(err.trim().split('\n')).toHaveLength(1);
        expect(err).toContain('superskill hook run sp careful-guard');
        expect(err).toContain('not found');
        expect(err).toContain('failing open');
    });

    it('fails open and kills spur when it outlives the deadline (timeout)', async () => {
        const runner = spurDelegate('careful-guard', { timeoutMs: 200 });
        const started = Date.now();
        const result = await runner.run(env('sleep'), '{}');
        expect(Date.now() - started).toBeLessThan(3000);
        expect(result).toEqual({
            output: '',
            exitCode: 0,
            stderr: 'superskill hook run sp careful-guard: spur timed out after 200 ms; failing open (exit 0).',
        });
    });

    it('uses the short guard deadline for guards and the longer capture deadline otherwise', () => {
        expect(SPUR_GUARD_TIMEOUT_MS).toBe(5000);
        expect(SPUR_CAPTURE_TIMEOUT_MS).toBe(10_000);
    });

    it('fails open on an older spur without `self hook` and drops its stdout (logo) — unknown command', async () => {
        const { code, out, err } = await capture('sp', 'context-session-stop', env('old'), '{}');
        expect(code).toBe(0);
        expect(out).toBe('');
        expect(err).toContain("spur does not know 'self hook context-session-stop' (upgrade spur)");
        expect(err).toContain('failing open');
    });

    it('fails open when spur reports an unknown hook id at exit 0', async () => {
        const { code, out, err } = await capture('sp', 'agent-lifecycle', env('unknown-id'), '{}');
        expect(code).toBe(0);
        expect(out).toBe('');
        expect(err.trim().split('\n')).toHaveLength(1);
        expect(err).toContain("spur does not know 'self hook agent-lifecycle'");
    });

    it('fails open on any other non-zero spur exit', async () => {
        const { code, out, err } = await capture('sp', 'context-post-tool', env('crash'), '{}');
        expect(code).toBe(0);
        expect(out).toBe('');
        expect(err).toContain('spur exited 3');
    });

    describe('task-write-guard pre-filter (Spur task 0398 R2)', () => {
        it('does not spawn spur for a path that cannot be a task file (baseline negative)', async () => {
            const { code, out } = await capture(
                'sp',
                'task-write-guard',
                env('deny'),
                writePayload('/repo/src/index.ts'),
            );
            expect(code).toBe(0);
            expect(out).toBe('');
            expect(spawned()).toBe(false);
        });

        it('does not spawn spur for markdown outside a tasks* segment, even with a deny-mode spur (residual-proof negative)', async () => {
            // Carries both trigger halves the guard could fire on except the segment: a Write of a
            // `.md` file, plus a spur that WOULD deny — still no spawn, no deny.
            const { out } = await capture(
                'sp',
                'task-write-guard',
                env('deny'),
                writePayload('/repo/docs/tasksfoo/x.md'),
            );
            expect(out).toBe('');
            expect(spawned()).toBe(false);
        });

        it('does not spawn spur for an unparseable payload', async () => {
            await capture('sp', 'task-write-guard', env('deny'), 'not json');
            expect(spawned()).toBe(false);
        });

        it('spawns spur for a task-corpus path and leaves the decision to spur', async () => {
            const { out } = await capture(
                'sp',
                'task-write-guard',
                env('deny', { CLAUDE_PROJECT_DIR: dir }),
                writePayload('/repo/docs/tasks3/0398_x.md'),
            );
            expect(spawned()).toBe(true);
            expect(JSON.parse(out).hookSpecificOutput.permissionDecision).toBe('deny');
        });

        it('classifies paths at the unit level', () => {
            expect(couldBeTaskCorpusPath('/repo/docs/tasks3/0398_x.md')).toBe(true);
            expect(couldBeTaskCorpusPath('/repo/tasks/0042_x.md')).toBe(true);
            expect(couldBeTaskCorpusPath('/repo/src/index.ts')).toBe(false);
            expect(couldBeTaskCorpusPath('/repo/docs/tasks3/x.txt')).toBe(false);
            expect(couldBeTaskCorpusPath('/repo/docs/tasksfoo/x.md')).toBe(false);
            expect(couldBeTaskCorpusPath('C:\\repo\\docs\\tasks\\0001_x.md')).toBe(true);
            expect(payloadCouldTouchTaskCorpus(writePayload('/r/docs/tasks/1.md'))).toBe(true);
            expect(payloadCouldTouchTaskCorpus('{"tool_input":{}}')).toBe(false);
            expect(payloadCouldTouchTaskCorpus('null')).toBe(false);
        });
    });
});

describe('hook run — cc/anti-hallucination (Stop, canonical output contract)', () => {
    it('emits an empty shared Stop allow object on a passing message', async () => {
        const args = JSON.stringify({
            messages: [{ role: 'assistant', content: 'Done. Refactored the helper; all tests green.' }],
        });
        const { code, out } = await capture('cc', 'anti-hallucination', { ARGUMENTS: args }, '');
        const parsed = JSON.parse(out);
        // Codex rejects unknown Stop fields; Claude and Hermes also accept this allow shape.
        expect(parsed).toEqual({});
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
        expect(Object.keys(parsed).sort()).toEqual(['decision', 'reason']);
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
        expect(emptyParsed).toEqual({});
        expect(empty.code).toBe(0);

        const invalid = await capture('cc', 'anti-hallucination', { ARGUMENTS: 'not json' }, '');
        const invalidParsed = JSON.parse(invalid.out);
        expect(invalidParsed).toEqual({});
        expect(invalid.code).toBe(0);
    });

    it('verifies current Codex/Claude assistant text delivered on stdin and honors the loop guard', async () => {
        const payload = {
            hook_event_name: 'Stop',
            last_assistant_message: 'The library version 2.3.1 API should probably work.',
            stop_hook_active: false,
        };
        const blocked = await capture('cc', 'anti-hallucination', {}, JSON.stringify(payload));
        expect(JSON.parse(blocked.out).decision).toBe('block');
        expect(Object.keys(JSON.parse(blocked.out)).sort()).toEqual(['decision', 'reason']);
        expect(blocked.code).toBe(0);
        expect(blocked.err).toBe('');
        const allowed = await capture(
            'cc',
            'anti-hallucination',
            {},
            JSON.stringify({
                ...payload,
                stop_hook_active: true,
            }),
        );
        expect(JSON.parse(allowed.out)).toEqual({});
        expect(allowed.code).toBe(0);
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
