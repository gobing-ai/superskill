import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getEnvVar } from '@gobing-ai/superskill-core';
import type { PipeProcess, ProcessExecutor } from '@gobing-ai/ts-runtime';
import { Command } from 'commander';
import {
    DEFAULT_HOOK_TIMEOUT_MS,
    HOOK_TIMEOUT_MARGIN_MS,
    hookRun,
    hookScriptRuntime,
    hookScriptTimeoutMs,
    pluginRootCandidates,
    registerHookRun,
    resolveHookScript,
    runHookScript,
} from '../../src/commands/hook-run';
import { cliVersion } from '../../src/version';

/**
 * `superskill hook run <plugin> <hook-id>` — the cross-agent hook runtime trigger.
 * Tests assert the dispatcher contract (built-in runner → the plugin's own hook script → fail-open
 * warning), id → script resolution across every install root, and the script runner's forwarding,
 * host translation, timeout and fail-open behavior through real `bun` spawns of fixture scripts.
 * `hookRun` returns the exit code and writes to stdout/stderr; tests capture both streams.
 */

async function capture(
    plugin: string,
    hookId: string,
    env: NodeJS.ProcessEnv,
    stdinText: string,
    profile?: 'block' | 'deny',
    location?: { home?: string; cwd?: string },
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
        const code = await hookRun(plugin, hookId, env, stdinText, profile, location);
        return { code, out: chunks.join(''), err: errChunks.join('') };
    } finally {
        process.stdout.write = original;
        process.stderr.write = originalErr;
    }
}

afterEach(() => {
    mock.restore();
});

/**
 * Fixture hook script: records its stdin + the superskill env it got, then behaves per
 * `FIXTURE_MODE`. Spawned (never imported), so coverage never instruments it.
 */
const FIXTURE_HOOK = readFileSync(join(import.meta.dir, '..', 'fixtures', 'hook-run', 'fixture-hook.mjs'), 'utf-8');

function makePluginRoot(base: string, plugin: string, opts: { manifest?: string | null; script?: string[] } = {}) {
    mkdirSync(base, { recursive: true });
    if (opts.manifest !== null)
        writeFileSync(join(base, 'plugin.json'), JSON.stringify({ name: opts.manifest ?? plugin }));
    for (const rel of opts.script ?? []) {
        mkdirSync(join(base, rel, '..'), { recursive: true });
        writeFileSync(join(base, rel), FIXTURE_HOOK);
    }
    return base;
}

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

        await cmd.parseAsync(['node', 'hook', 'run', 'no-such-plugin', 'does-not-exist']);

        // Unresolvable hooks fail open (exit 0) — see dispatcher test for the policy rationale.
        expect(exit).toHaveBeenCalledWith(0);
    });
});

describe('hook run — dispatcher', () => {
    let dir: string;
    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'hook-run-plugin-'));
    });
    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
    });

    it('fails open (exit 0) with a skew warning when no built-in runner and no hook script exist', async () => {
        // Unresolvable ids mean plugin/CLI skew or an incomplete install — not a policy
        // violation. Blocking would turn skew into stuck agent loops. Assert a loud warning.
        const { code, out, err } = await capture('acme', 'does-not-exist', {}, '{}', undefined, {
            home: dir,
            cwd: dir,
        });
        expect(code).toBe(0);
        expect(out).toBe('');
        expect(err).toContain("unknown hook 'acme does-not-exist'");
        expect(err).toContain('hooks/does-not-exist.{ts,mjs,js}');
        expect(err).toContain('SUPERSKILL_PLUGIN_ROOT');
        expect(err).toContain('Failing open');
        // The warning must name the real installed version — 'unknown' means the version
        // lookup silently broke (task 0074: skew is only diagnosable if the version is real).
        expect(err).toContain(`(superskill ${cliVersion})`);
        expect(err).toContain('cc/anti-hallucination');
    });

    it("runs the plugin's own hook script: one file + one hooks.json line, no registration", async () => {
        const root = makePluginRoot(join(dir, 'acme'), 'acme', { script: ['hooks/new-guard.ts'] });
        const env = { PATH: getEnvVar('PATH'), SUPERSKILL_PLUGIN_ROOT: root, FIXTURE_DIR: dir, FIXTURE_MODE: 'deny' };
        const payload = JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash' });
        const { code, out, err } = await capture('acme', 'new-guard', env, payload, undefined, {
            home: dir,
            cwd: dir,
        });
        expect(code).toBe(2);
        expect(out).toBe('');
        expect(err.trim()).toBe('nope');
        expect(readFileSync(join(dir, 'stdin'), 'utf-8')).toBe(payload);
        expect(JSON.parse(readFileSync(join(dir, 'env'), 'utf-8'))).toEqual({
            root,
            id: 'new-guard',
            host: 'generic',
            event: 'PreToolUse',
            profile: 'block',
        });
    });

    it('prefers a first-party built-in runner over a same-named plugin script', async () => {
        const root = makePluginRoot(join(dir, 'cc'), 'cc', { script: ['hooks/anti-hallucination.ts'] });
        const env = { SUPERSKILL_PLUGIN_ROOT: root, FIXTURE_DIR: dir, FIXTURE_MODE: 'deny' };
        const { code, out } = await capture('cc', 'anti-hallucination', env, '', undefined, { home: dir, cwd: dir });
        expect(code).toBe(0);
        expect(JSON.parse(out)).toEqual({});
    });
});

describe('hook run — id → script resolution', () => {
    let dir: string;
    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'hook-run-plugin-'));
    });
    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
    });
    const loc = () => ({ home: join(dir, 'home'), cwd: join(dir, 'proj') });

    it('resolves under SUPERSKILL_PLUGIN_ROOT, then CLAUDE_PLUGIN_ROOT', () => {
        const a = makePluginRoot(join(dir, 'a'), 'acme', { script: ['hooks/h.ts'] });
        const b = makePluginRoot(join(dir, 'b'), 'acme', { script: ['hooks/h.ts'] });
        expect(resolveHookScript('acme', 'h', { SUPERSKILL_PLUGIN_ROOT: a, CLAUDE_PLUGIN_ROOT: b }, loc())).toEqual({
            script: join(a, 'hooks', 'h.ts'),
            root: a,
            source: 'env',
        });
        expect(resolveHookScript('acme', 'h', { CLAUDE_PLUGIN_ROOT: b }, loc())?.source).toBe('claude-plugin-root');
    });

    it("rejects a root whose manifest names another plugin (an inherited env root never serves another plugin's hooks)", () => {
        const other = makePluginRoot(join(dir, 'other'), 'other', { script: ['hooks/h.ts'] });
        expect(resolveHookScript('acme', 'h', { CLAUDE_PLUGIN_ROOT: other }, loc())).toBeNull();
        // .claude-plugin/plugin.json counts as a manifest too; a manifest-less root is accepted.
        const bare = makePluginRoot(join(dir, 'bare'), 'acme', { manifest: null, script: ['hooks/h.ts'] });
        expect(resolveHookScript('acme', 'h', { SUPERSKILL_PLUGIN_ROOT: bare }, loc())?.root).toBe(bare);
        mkdirSync(join(bare, '.claude-plugin'));
        writeFileSync(join(bare, '.claude-plugin', 'plugin.json'), '{"name":"other"}');
        expect(resolveHookScript('acme', 'h', { SUPERSKILL_PLUGIN_ROOT: bare }, loc())).toBeNull();
    });

    it('tries hooks/<id>.ts|.mjs|.js, then scripts/hooks/<id>.*', () => {
        const root = makePluginRoot(join(dir, 'r'), 'acme', {
            script: ['hooks/x.mjs', 'hooks/x.js', 'scripts/hooks/y.ts', 'scripts/hooks/x.ts'],
        });
        const env = { SUPERSKILL_PLUGIN_ROOT: root };
        expect(resolveHookScript('acme', 'x', env, loc())?.script).toBe(join(root, 'hooks', 'x.mjs'));
        expect(resolveHookScript('acme', 'y', env, loc())?.script).toBe(join(root, 'scripts', 'hooks', 'y.ts'));
    });

    it('scans the Claude Code plugin cache newest version first, skipping versions without the script', () => {
        const cache = join(dir, 'home', '.claude', 'plugins', 'cache', 'mkt', 'acme');
        makePluginRoot(join(cache, '0.9.0'), 'acme', { script: ['hooks/h.ts'] });
        makePluginRoot(join(cache, '0.10.0'), 'acme', { script: ['hooks/h.ts'] });
        makePluginRoot(join(cache, '0.11.0'), 'acme');
        expect(resolveHookScript('acme', 'h', {}, loc())).toEqual({
            script: join(cache, '0.10.0', 'hooks', 'h.ts'),
            root: join(cache, '0.10.0'),
            source: 'claude-cache',
        });
        // CLAUDE_CONFIG_DIR relocates the cache.
        const cfg = join(dir, 'cfg', 'plugins', 'cache', 'm', 'acme', '1.0.0');
        makePluginRoot(cfg, 'acme', { script: ['hooks/h.ts'] });
        expect(resolveHookScript('acme', 'h', { CLAUDE_CONFIG_DIR: join(dir, 'cfg') }, loc())?.root).toBe(cfg);
    });

    it('scans the omp plugin cache (project, then home) and Grok installed-plugins', () => {
        const omp = join(dir, 'proj', '.omp', 'plugins', 'cache', 'plugins');
        makePluginRoot(join(omp, 'acme___mkt___1.0.0'), 'acme', { script: ['hooks/h.ts'] });
        makePluginRoot(join(omp, 'acme-two___mkt___9.0.0'), 'acme-two', { script: ['hooks/h.ts'] });
        expect(resolveHookScript('acme', 'h', {}, loc())?.root).toBe(join(omp, 'acme___mkt___1.0.0'));

        rmSync(join(dir, 'proj'), { recursive: true, force: true });
        const grok = join(dir, 'home', '.grok', 'installed-plugins');
        makePluginRoot(join(grok, 'acme-tools-1'), 'acme-tools', { script: ['hooks/h.ts'] });
        makePluginRoot(join(grok, 'acme-adf27'), 'acme', { script: ['hooks/h.ts'] });
        expect(resolveHookScript('acme', 'h', {}, loc())).toEqual({
            script: join(grok, 'acme-adf27', 'hooks', 'h.ts'),
            root: join(grok, 'acme-adf27'),
            source: 'grok',
        });
    });

    it('falls back to staged scripts roots (project, then global), searching only their hooks/', () => {
        const project = join(dir, 'proj', '.agents', 'scripts', 'acme');
        const global = join(dir, 'home', '.agents', 'scripts', 'acme');
        makePluginRoot(global, 'acme', { manifest: null, script: ['hooks/h.ts', 'scripts/hooks/g.ts'] });
        expect(resolveHookScript('acme', 'h', {}, loc())?.root).toBe(global);
        expect(resolveHookScript('acme', 'g', {}, loc())).toBeNull();
        makePluginRoot(project, 'acme', { manifest: null, script: ['hooks/h.ts'] });
        expect(resolveHookScript('acme', 'h', {}, loc())).toEqual({
            script: join(project, 'hooks', 'h.ts'),
            root: project,
            source: 'staged',
        });
        expect(pluginRootCandidates('acme', {}, loc()).map((c) => c.source)).toEqual(['staged', 'staged']);
    });

    it('defaults the project anchor to CLAUDE_PROJECT_DIR', () => {
        const project = join(dir, 'proj', '.agents', 'scripts', 'acme');
        makePluginRoot(project, 'acme', { manifest: null, script: ['hooks/h.ts'] });
        const found = resolveHookScript('acme', 'h', { CLAUDE_PROJECT_DIR: join(dir, 'proj') }, { home: dir });
        expect(found?.root).toBe(project);
    });

    it('returns null for an id or plugin that is not a single safe path segment', () => {
        const root = makePluginRoot(join(dir, 'r'), 'acme', { script: ['hooks/h.ts'] });
        expect(resolveHookScript('acme', '../hooks/h', { SUPERSKILL_PLUGIN_ROOT: root }, loc())).toBeNull();
        expect(resolveHookScript('..', 'h', { SUPERSKILL_PLUGIN_ROOT: root }, loc())).toBeNull();
    });
});

describe('hook run — deadline from the declared hooks.json timeout', () => {
    let dir: string;
    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'hook-run-plugin-'));
    });
    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
    });
    const hooksJson = (path: string) => {
        mkdirSync(join(path, '..'), { recursive: true });
        writeFileSync(
            path,
            JSON.stringify({
                hooks: {
                    Stop: [{ hooks: [{ type: 'command', command: 'superskill hook run acme h', timeout: 10 }] }],
                    SessionStart: [{ type: 'command', command: 'superskill hook run acme h', timeout: 5 }],
                    UserPromptSubmit: [
                        { hooks: [{ type: 'command', command: 'superskill hook run acme tiny', timeout: 1 }] },
                    ],
                    Bad: 'not-an-array',
                },
            }),
        );
    };

    it('uses the smallest declared timeout minus the margin, floored at 1 s', () => {
        hooksJson(join(dir, 'hooks', 'hooks.json'));
        expect(hookScriptTimeoutMs(dir, 'acme', 'h', {})).toBe(5000 - HOOK_TIMEOUT_MARGIN_MS);
        expect(hookScriptTimeoutMs(dir, 'acme', 'tiny', {})).toBe(1000);
    });

    it('reads a root-level hooks.json, honors SUPERSKILL_HOOK_TIMEOUT_MS, else the default', () => {
        hooksJson(join(dir, 'hooks.json'));
        expect(hookScriptTimeoutMs(dir, 'acme', 'h', {})).toBe(4500);
        expect(hookScriptTimeoutMs(dir, 'acme', 'h', { SUPERSKILL_HOOK_TIMEOUT_MS: '1234' })).toBe(1234);
        expect(hookScriptTimeoutMs(dir, 'acme', 'h', { SUPERSKILL_HOOK_TIMEOUT_MS: 'x' })).toBe(4500);
        expect(hookScriptTimeoutMs(dir, 'acme', 'undeclared', {})).toBe(DEFAULT_HOOK_TIMEOUT_MS);
        expect(hookScriptTimeoutMs(join(dir, 'missing'), 'acme', 'h', {})).toBe(DEFAULT_HOOK_TIMEOUT_MS);
    });
});

describe('hook run — script execution and host translation', () => {
    let dir: string;
    let root: string;
    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'hook-run-plugin-'));
        root = makePluginRoot(join(dir, 'acme'), 'acme', { script: ['hooks/h.ts'] });
    });
    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
    });
    const run = (mode: string, payload: unknown, extra: NodeJS.ProcessEnv = {}, profile?: 'block' | 'deny') =>
        capture(
            'acme',
            'h',
            { PATH: getEnvVar('PATH'), SUPERSKILL_PLUGIN_ROOT: root, FIXTURE_DIR: dir, FIXTURE_MODE: mode, ...extra },
            typeof payload === 'string' ? payload : JSON.stringify(payload),
            profile,
            { home: dir, cwd: dir },
        );
    const pre = { hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: 'x' } };
    const stop = { hook_event_name: 'Stop', session_id: 's1' };
    const claude = { CLAUDE_PROJECT_DIR: '/p' };

    it('a silent capture hook exits 0 with no output on every host', async () => {
        expect(await run('silent', stop)).toEqual({ code: 0, out: '', err: '' });
        expect(await run('allow', pre, claude)).toEqual({ code: 0, out: '', err: '' });
    });

    it('renders a neutral PreToolUse deny/ask as permissionDecision JSON on Claude Code', async () => {
        const deny = await run('deny', pre, claude);
        expect(deny.code).toBe(0);
        expect(JSON.parse(deny.out)).toEqual({
            hookSpecificOutput: {
                hookEventName: 'PreToolUse',
                permissionDecision: 'deny',
                permissionDecisionReason: 'nope',
            },
        });
        const ask = await run('ask', pre, claude);
        expect(JSON.parse(ask.out).hookSpecificOutput.permissionDecision).toBe('ask');
    });

    it('renders a neutral PreToolUse deny/ask as exit 2 + stderr elsewhere (unconfirmable ask fails closed)', async () => {
        expect(await run('deny', pre)).toEqual({ code: 2, out: '', err: 'nope\n' });
        expect(await run('ask', pre, { SUPERSKILL_HOOK_HOST: 'omp' })).toEqual({ code: 2, out: '', err: 'sure?\n' });
        expect(await run('ask', pre, { SUPERSKILL_HOOK_HOST: 'generic' })).toEqual({
            code: 2,
            out: '',
            err: 'sure?\n',
        });
    });

    it('renders a neutral Stop block as decision JSON (deny under --profile deny), exit 2 on omp', async () => {
        const block = await run('block', stop, claude);
        expect(JSON.parse(block.out)).toEqual({ decision: 'block', reason: 'inbox' });
        const gemini = await run('block', stop, {}, 'deny');
        expect(JSON.parse(gemini.out)).toEqual({ decision: 'deny', reason: 'inbox' });
        expect(await run('block', stop, { SUPERSKILL_HOOK_HOST: 'omp' })).toEqual({ code: 2, out: '', err: 'inbox\n' });
    });

    it('forwards legacy Claude-native JSON verbatim on Claude Code and re-expresses it elsewhere', async () => {
        const verbatim = await run('claude-deny', pre, claude);
        expect(JSON.parse(verbatim.out).hookSpecificOutput.permissionDecision).toBe('deny');
        expect(await run('claude-deny', pre)).toEqual({ code: 2, out: '', err: 'legacy deny\n' });
        expect(await run('claude-allow', pre)).toEqual({ code: 0, out: '', err: '' });
    });

    it('hands Pi the decision itself: neutral ask/deny JSON at exit 0, legacy Claude-native included', async () => {
        const pi = { SUPERSKILL_HOOK_HOST: 'pi' };
        expect(await run('ask', pre, pi)).toEqual({ code: 0, out: '{"decision":"ask","reason":"sure?"}\n', err: '' });
        expect(await run('deny', pre, pi)).toEqual({ code: 0, out: '{"decision":"deny","reason":"nope"}\n', err: '' });
        expect(await run('block', stop, pi)).toEqual({
            code: 0,
            out: '{"decision":"deny","reason":"inbox"}\n',
            err: '',
        });
        expect(await run('claude-ask', pre, pi)).toEqual({
            code: 0,
            out: '{"decision":"ask","reason":"legacy ask"}\n',
            err: '',
        });
        expect(await run('claude-allow', pre, pi)).toEqual({ code: 0, out: '', err: '' });
        expect(await run('ask', stop, pi)).toEqual({ code: 0, out: '', err: '' });
    });

    it('drops a legacy bare PreToolUse allow on Claude Code too (it would auto-approve the call)', async () => {
        expect(await run('claude-allow', pre, claude)).toEqual({ code: 0, out: '', err: '' });
    });

    it('forwards other stdout, the script stderr, and an exit-2 block as-is', async () => {
        expect(await run('text', stop)).toEqual({ code: 0, out: 'plain text\n', err: '' });
        expect(await run('warn', stop)).toEqual({ code: 0, out: '', err: 'a warning\n' });
        expect(await run('exit2', pre)).toEqual({ code: 2, out: '', err: 'blocked by exit code\n' });
    });

    it('normalizes an omp tool_call event into the canonical payload the script reads', async () => {
        const omp = { toolName: 'write', input: { path: '/r/a.md', content: 'hi' } };
        const result = await run('deny', omp, { SUPERSKILL_HOOK_HOST: 'omp', SUPERSKILL_HOOK_EVENT: 'PreToolUse' });
        expect(result.code).toBe(2);
        const seen = JSON.parse(readFileSync(join(dir, 'stdin'), 'utf-8'));
        expect(seen.hook_event_name).toBe('PreToolUse');
        expect(seen.tool_name).toBe('Write');
        expect(seen.tool_input.file_path).toBe('/r/a.md');
        expect(JSON.parse(readFileSync(join(dir, 'env'), 'utf-8')).host).toBe('omp');
    });

    it('fails open (exit 0, no stdout) with the cause and the script stderr on any other exit status', async () => {
        const { code, out, err } = await run('crash', pre);
        expect(code).toBe(0);
        expect(out).toBe('');
        expect(err).toContain(
            `superskill hook run acme h: ${join(root, 'hooks', 'h.ts')} exited 3; failing open (exit 0).`,
        );
        expect(err).toContain('boom');
    });

    it('fails open and kills the script when it outlives the deadline', async () => {
        const resolved = { script: join(root, 'hooks', 'h.ts'), root, source: 'env' as const };
        const started = Date.now();
        const result = await runHookScript({ PATH: getEnvVar('PATH'), FIXTURE_MODE: 'sleep' }, '{}', {
            plugin: 'acme',
            id: 'h',
            resolved,
            timeoutMs: 300,
        });
        expect(Date.now() - started).toBeLessThan(3000);
        expect(result).toEqual({
            output: '',
            exitCode: 0,
            stderr: `superskill hook run acme h: ${resolved.script} timed out after 300 ms; failing open (exit 0).`,
        });
    });

    it('fails open when the runtime cannot be spawned', async () => {
        const failing = (code?: string): ProcessExecutor => ({
            run: async () => ({ exitCode: 0, stdout: '', stderr: '' }) as never,
            runStreaming: (): PipeProcess => {
                throw Object.assign(new Error('spawn'), { code });
            },
        });
        const resolved = { script: join(root, 'hooks', 'h.ts'), root, source: 'env' as const };
        const missing = await runHookScript({}, '{}', {
            plugin: 'acme',
            id: 'h',
            resolved,
            timeoutMs: 100,
            executor: failing('ENOENT'),
        });
        expect(missing.exitCode).toBe(0);
        expect(missing.stderr).toContain('not found (install bun)');
        const other = await runHookScript({}, '{}', {
            plugin: 'acme',
            id: 'h',
            resolved,
            timeoutMs: 100,
            executor: failing(),
        });
        expect(other.stderr).toContain('spawn failed; failing open');
    });

    it('runs scripts under the Bun executing superskill', () => {
        expect(hookScriptRuntime({})).toEqual({ command: process.execPath, env: {} });
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
