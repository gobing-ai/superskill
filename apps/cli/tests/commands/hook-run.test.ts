import { describe, expect, it } from 'bun:test';
import { Command } from 'commander';
import { hookRun, registerHookRun } from '../../src/commands/hook-run';

/**
 * `superskill hook run <plugin> <hook-id>` — the cross-agent hook runtime trigger (task 0151).
 * Tests assert the dispatcher contract (resolve runner, emit Claude canonical JSON, exit code) and
 * each runner's decision + fail-open behavior. `hookRun` returns the exit code and writes JSON to
 * stdout; tests capture stdout to inspect the decision payload.
 */

function capture(plugin: string, hookId: string, env: NodeJS.ProcessEnv, stdinText: string) {
    const chunks: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    // biome-ignore lint/suspicious/noExplicitAny: stdout.write overload shim for capture
    (process.stdout.write as any) = (chunk: unknown) => {
        chunks.push(String(chunk));
        return true;
    };
    try {
        const code = hookRun(plugin, hookId, env, stdinText);
        return { code, out: chunks.join('') };
    } finally {
        process.stdout.write = original;
    }
}

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
});

describe('hook run — dispatcher', () => {
    it('exits 2 with a clear error and the known-hook list for an unknown hook id', () => {
        // stderr capture
        const errs: string[] = [];
        const originalErr = process.stderr.write.bind(process.stderr);
        // biome-ignore lint/suspicious/noExplicitAny: stderr.write overload shim
        (process.stderr.write as any) = (chunk: unknown) => {
            errs.push(String(chunk));
            return true;
        };
        try {
            const code = hookRun('sp', 'does-not-exist', {}, '{}');
            expect(code).toBe(2);
            expect(errs.join('')).toContain("unknown hook 'sp does-not-exist'");
            expect(errs.join('')).toContain('sp/task-write-guard');
            expect(errs.join('')).toContain('cc/anti-hallucination');
        } finally {
            process.stderr.write = originalErr;
        }
    });
});

describe('hook run — sp/task-write-guard', () => {
    const payload = (tool: string, path: string) =>
        JSON.stringify({ tool_name: tool, tool_input: { file_path: path } });

    it('fails open (allow) for a non-Write/Edit tool', () => {
        const { code, out } = capture('sp', 'task-write-guard', {}, payload('Read', '/tmp/x.md'));
        expect(code).toBe(0);
        expect(JSON.parse(out).hookSpecificOutput.permissionDecision).toBe('allow');
    });

    it('fails open (allow) on a malformed payload', () => {
        const { code, out } = capture('sp', 'task-write-guard', {}, 'not json');
        expect(code).toBe(0);
        expect(JSON.parse(out).hookSpecificOutput.permissionDecision).toBe('allow');
    });

    it('fails open (allow) when the path is empty', () => {
        const { code, out } = capture('sp', 'task-write-guard', {}, payload('Edit', ''));
        expect(code).toBe(0);
        expect(JSON.parse(out).hookSpecificOutput.permissionDecision).toBe('allow');
    });

    it('short-circuits to allow when SPUR_WRITE_GUARD=off (no subprocess)', () => {
        const { code, out } = capture(
            'sp',
            'task-write-guard',
            { SPUR_WRITE_GUARD: 'off' },
            payload('Edit', '/any/task.md'),
        );
        expect(code).toBe(0);
        expect(JSON.parse(out).hookSpecificOutput.permissionDecision).toBe('allow');
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
        expect(JSON.parse(out).hookSpecificOutput.permissionDecision).toBe('allow');
    });
});

describe('hook run — cc/anti-hallucination (Stop, corrected output contract)', () => {
    it('emits the Claude Stop shape {hookSpecificOutput:{allowStop,feedback}} and allows a passing message', () => {
        const args = JSON.stringify({
            messages: [{ role: 'assistant', content: 'Done. Refactored the helper; all tests green.' }],
        });
        const { code, out } = capture('cc', 'anti-hallucination', { ARGUMENTS: args }, '');
        const parsed = JSON.parse(out);
        expect(parsed.hookSpecificOutput).toBeDefined();
        expect(parsed.hookSpecificOutput.allowStop).toBe(true);
        expect(typeof parsed.hookSpecificOutput.feedback).toBe('string');
        expect(code).toBe(0);
    });

    it('blocks the stop (allowStop:false, exit 1) when the protocol fails on a fact-claiming message', () => {
        const args = JSON.stringify({
            messages: [
                {
                    role: 'assistant',
                    content:
                        'The library version 2.3.1 API uses the new documentation method for the framework function. I think this should work probably.',
                },
            ],
        });
        const { code, out } = capture('cc', 'anti-hallucination', { ARGUMENTS: args }, '');
        const parsed = JSON.parse(out);
        expect(parsed.hookSpecificOutput.allowStop).toBe(false);
        expect(parsed.hookSpecificOutput.feedback).toContain('Add verification');
        expect(code).toBe(1);
    });

    it('fails open (allowStop:true) on empty/invalid ARGUMENTS', () => {
        const empty = capture('cc', 'anti-hallucination', {}, '');
        expect(JSON.parse(empty.out).hookSpecificOutput.allowStop).toBe(true);
        expect(empty.code).toBe(0);

        const invalid = capture('cc', 'anti-hallucination', { ARGUMENTS: 'not json' }, '');
        expect(JSON.parse(invalid.out).hookSpecificOutput.allowStop).toBe(true);
        expect(invalid.code).toBe(0);
    });
});
