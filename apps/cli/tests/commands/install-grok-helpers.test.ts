import { describe, expect, it } from 'bun:test';
import type { ProcessExecutor, ProcessOptions, ProcessResult } from '@gobing-ai/ts-runtime';
import {
    defaultRunGrokInstall,
    parseGrokPluginListJson,
    resolveGrokInstallPath,
    resolveGrokInstallPathFromList,
} from '../../src/commands/install';

interface RecordedRun {
    command: string;
    args: string[];
}

/**
 * Recording ProcessExecutor fake — the DI seam behind the default installers
 * (replaces Bun.spawn monkey-patching after the no-direct-process-spawn refactor).
 * `results[i]` = [exitCode, stdout, stderr] for the i-th run; defaults to [0].
 */
function recordingExecutor(results: [number, string?, string?][] = []) {
    const calls: RecordedRun[] = [];
    let i = 0;
    const executor: ProcessExecutor = {
        run: (options: ProcessOptions): Promise<ProcessResult> => {
            const args = options.args ?? [];
            calls.push({ command: options.command, args });
            const [exitCode = 0, stdout = '', stderr = ''] = results[i++] ?? [];
            return Promise.resolve({ command: options.command, args, exitCode, stdout, stderr, durationMs: 0 });
        },
        runStreaming: () => {
            throw new Error('runStreaming is not used by install helpers');
        },
    };
    return { calls, executor };
}

/** Full argv of a recorded run, for argv-shape assertions. */
function argv(call: RecordedRun): string[] {
    return [call.command, ...call.args];
}

// ── parseGrokPluginListJson / resolveGrokInstallPathFromList ────────────────

describe('parseGrokPluginListJson', () => {
    it('returns empty array for malformed JSON', () => {
        expect(parseGrokPluginListJson('{ not json')).toEqual([]);
    });

    it('returns empty array when root is not an array', () => {
        expect(parseGrokPluginListJson('{"plugins":[]}')).toEqual([]);
    });

    it('skips entries missing name or path', () => {
        const raw = JSON.stringify([
            { name: 'ok', path: '/p/ok' },
            { name: 'no-path' },
            { path: '/p/no-name' },
            null,
            'x',
        ]);
        expect(parseGrokPluginListJson(raw)).toEqual([{ name: 'ok', path: '/p/ok' }]);
    });

    it('preserves optional fields from a live-shaped entry (Grok 0.2.93)', () => {
        const raw = JSON.stringify([
            {
                status: 'installed',
                name: 'demo',
                repo_key: 'demo-adf2758e',
                version: '0.0.1',
                path: '/Users/u/.grok/installed-plugins/demo-adf2758e',
                source: '/tmp/plugins/demo',
                marketplace: null,
            },
        ]);
        expect(parseGrokPluginListJson(raw)).toEqual([
            {
                status: 'installed',
                name: 'demo',
                repo_key: 'demo-adf2758e',
                version: '0.0.1',
                path: '/Users/u/.grok/installed-plugins/demo-adf2758e',
                source: '/tmp/plugins/demo',
                marketplace: null,
            },
        ]);
    });
});

describe('resolveGrokInstallPathFromList', () => {
    it('returns undefined when the plugin name is absent', () => {
        expect(resolveGrokInstallPathFromList([{ name: 'other', path: '/x' }], 'demo')).toBeUndefined();
    });

    it('prefers status=installed when multiple rows share a name', () => {
        const path = resolveGrokInstallPathFromList(
            [
                { name: 'demo', path: '/disabled', status: 'disabled' },
                { name: 'demo', path: '/installed', status: 'installed' },
            ],
            'demo',
        );
        expect(path).toBe('/installed');
    });

    it('falls back to the first match when no installed status is present', () => {
        expect(
            resolveGrokInstallPathFromList(
                [
                    { name: 'demo', path: '/first' },
                    { name: 'demo', path: '/second' },
                ],
                'demo',
            ),
        ).toBe('/first');
    });
});

// ── resolveGrokInstallPath (spawn) ──────────────────────────────────────────

describe('resolveGrokInstallPath', () => {
    it('returns the install path when list --json includes the plugin', async () => {
        const body = JSON.stringify([
            {
                status: 'installed',
                name: 'demo',
                path: '/Users/u/.grok/installed-plugins/demo-abc',
            },
        ]);
        const fake = recordingExecutor([[0, body]]);

        await expect(resolveGrokInstallPath('demo', fake.executor)).resolves.toBe(
            '/Users/u/.grok/installed-plugins/demo-abc',
        );
    });

    it('returns undefined when list exits non-zero', async () => {
        const fake = recordingExecutor([[1]]);

        await expect(resolveGrokInstallPath('demo', fake.executor)).resolves.toBeUndefined();
    });
});

// ── defaultRunGrokInstall spawn contract ────────────────────────────────────

describe('defaultRunGrokInstall', () => {
    it('adds marketplace then installs from pluginRoot with --trust (Grok 0.2.93 path form)', async () => {
        const fake = recordingExecutor([[0], [0], [0]]); // add, uninstall, install

        await defaultRunGrokInstall(
            { source: '/mkp', mode: 'directory' },
            'superskill',
            'demo',
            '/mkp/plugins/demo',
            fake.executor,
        );

        expect(fake.calls).toHaveLength(3);
        expect(argv(fake.calls[0] as RecordedRun)).toEqual(['grok', 'plugin', 'marketplace', 'add', '/mkp']);
        expect(argv(fake.calls[1] as RecordedRun)).toEqual(['grok', 'plugin', 'uninstall', 'demo', '--confirm']);
        expect(argv(fake.calls[2] as RecordedRun)).toEqual([
            'grok',
            'plugin',
            'install',
            '/mkp/plugins/demo',
            '--trust',
        ]);
        // Must never use plugin@marketplace addressing (not supported by Grok CLI).
        for (const call of fake.calls) {
            expect(argv(call).join(' ')).not.toContain('demo@superskill');
        }
    });

    it('passes github owner/repo slug to marketplace add when registration mode is github', async () => {
        // R3/R8: github mode uses registration.source (slug), not a local path.
        const fake = recordingExecutor([[0], [0], [0]]);

        await defaultRunGrokInstall(
            { source: 'gobing-ai/superskill', mode: 'github' },
            'superskill',
            'demo',
            '/mkp/plugins/demo',
            fake.executor,
        );

        expect(argv(fake.calls[0] as RecordedRun)).toEqual([
            'grok',
            'plugin',
            'marketplace',
            'add',
            'gobing-ai/superskill',
        ]);
        expect(argv(fake.calls[2] as RecordedRun)).toEqual([
            'grok',
            'plugin',
            'install',
            '/mkp/plugins/demo',
            '--trust',
        ]);
    });

    it('tolerates marketplace already-configured (idempotent re-add)', async () => {
        const fake = recordingExecutor([[1, '', 'Error: Marketplace source already configured: /mkp\n'], [0], [0]]);

        await defaultRunGrokInstall(
            { source: '/mkp', mode: 'directory' },
            'superskill',
            'demo',
            '/mkp/plugins/demo',
            fake.executor,
        );

        expect(argv(fake.calls[2] as RecordedRun)).toEqual([
            'grok',
            'plugin',
            'install',
            '/mkp/plugins/demo',
            '--trust',
        ]);
    });

    it('fails loudly when marketplace add fails for a reason other than already-configured', async () => {
        const fake = recordingExecutor([[1, '', 'Error: permission denied\n']]);

        await expect(
            defaultRunGrokInstall(
                { source: '/mkp', mode: 'directory' },
                'superskill',
                'demo',
                '/mkp/plugins/demo',
                fake.executor,
            ),
        ).rejects.toThrow(/marketplace add failed/);
    });

    it('continues when uninstall fails (first install) then installs', async () => {
        const fake = recordingExecutor([[0], [1], [0]]); // add ok, uninstall miss, install ok

        await defaultRunGrokInstall(
            { source: '/mkp', mode: 'directory' },
            'superskill',
            'demo',
            '/mkp/plugins/demo',
            fake.executor,
        );

        expect(fake.calls[2]?.command).toBe('grok');
        expect(fake.calls[2]?.args[1]).toBe('install');
    });

    it('rejects unsafe marketplace names before spawning', async () => {
        const fake = recordingExecutor([[0], [0], [0]]);
        await expect(
            defaultRunGrokInstall(
                { source: '/mkp', mode: 'directory' },
                '../evil',
                'demo',
                '/mkp/plugins/demo',
                fake.executor,
            ),
        ).rejects.toThrow();
        expect(fake.calls).toHaveLength(0);
    });

    it('rejects unsafe plugin names before spawning', async () => {
        const fake = recordingExecutor([[0], [0], [0]]);
        await expect(
            defaultRunGrokInstall(
                { source: '/mkp', mode: 'directory' },
                'superskill',
                'a/b',
                '/mkp/plugins/demo',
                fake.executor,
            ),
        ).rejects.toThrow();
        expect(fake.calls).toHaveLength(0);
    });
});
