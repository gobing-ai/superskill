import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
    defaultRunGrokInstall,
    parseGrokPluginListJson,
    resolveGrokInstallPath,
    resolveGrokInstallPathFromList,
} from '../../src/commands/install';

/** Minimal Bun.spawn stub shape used by Grok helpers that pipe stdout/stderr. */
interface StubChild {
    exited: Promise<number>;
    stdout: ReadableStream<Uint8Array> | null;
    stderr: ReadableStream<Uint8Array> | null;
}

function textStream(text: string): ReadableStream<Uint8Array> {
    const bytes = Buffer.from(text, 'utf-8');
    return new ReadableStream({
        start(controller) {
            controller.enqueue(bytes);
            controller.close();
        },
    });
}

function emptyStream(): ReadableStream<Uint8Array> {
    return new ReadableStream({
        start(controller) {
            controller.close();
        },
    });
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
    let originalSpawn: typeof Bun.spawn;

    beforeEach(() => {
        originalSpawn = Bun.spawn;
    });

    afterEach(() => {
        Bun.spawn = originalSpawn;
    });

    it('returns the install path when list --json includes the plugin', async () => {
        const body = JSON.stringify([
            {
                status: 'installed',
                name: 'demo',
                path: '/Users/u/.grok/installed-plugins/demo-abc',
            },
        ]);
        const stub = ((): StubChild => ({
            exited: Promise.resolve(0),
            stdout: textStream(body),
            stderr: emptyStream(),
        })) as unknown as typeof Bun.spawn;
        Bun.spawn = stub;

        await expect(resolveGrokInstallPath('demo')).resolves.toBe('/Users/u/.grok/installed-plugins/demo-abc');
    });

    it('returns undefined when list exits non-zero', async () => {
        const stub = ((): StubChild => ({
            exited: Promise.resolve(1),
            stdout: emptyStream(),
            stderr: emptyStream(),
        })) as unknown as typeof Bun.spawn;
        Bun.spawn = stub;

        await expect(resolveGrokInstallPath('demo')).resolves.toBeUndefined();
    });
});

// ── defaultRunGrokInstall spawn contract ────────────────────────────────────

describe('defaultRunGrokInstall', () => {
    let originalSpawn: typeof Bun.spawn;
    let spawnCalls: string[][] = [];

    beforeEach(() => {
        originalSpawn = Bun.spawn;
        spawnCalls = [];
    });

    afterEach(() => {
        Bun.spawn = originalSpawn;
        spawnCalls = [];
    });

    function stubSpawn(exitCodes: number[], stderrByIndex: Record<number, string> = {}): void {
        let i = 0;
        const stub = ((cmd: string[]): StubChild => {
            const idx = i++;
            spawnCalls = [...spawnCalls, [...cmd]];
            const code = exitCodes[idx] ?? 0;
            const stderrText = stderrByIndex[idx] ?? '';
            return {
                exited: Promise.resolve(code),
                stdout: textStream(''),
                stderr: textStream(stderrText),
            };
        }) as unknown as typeof Bun.spawn;
        Bun.spawn = stub;
    }

    it('adds marketplace then installs from pluginRoot with --trust (Grok 0.2.93 path form)', async () => {
        stubSpawn([0, 0, 0]); // add, uninstall, install

        await defaultRunGrokInstall({ source: '/mkp', mode: 'directory' }, 'superskill', 'demo', '/mkp/plugins/demo');

        expect(spawnCalls).toHaveLength(3);
        expect(spawnCalls[0]).toEqual(['grok', 'plugin', 'marketplace', 'add', '/mkp']);
        expect(spawnCalls[1]).toEqual(['grok', 'plugin', 'uninstall', 'demo', '--confirm']);
        expect(spawnCalls[2]).toEqual(['grok', 'plugin', 'install', '/mkp/plugins/demo', '--trust']);
        // Must never use plugin@marketplace addressing (not supported by Grok CLI).
        for (const call of spawnCalls) {
            expect(call.join(' ')).not.toContain('demo@superskill');
        }
    });

    it('passes github owner/repo slug to marketplace add when registration mode is github', async () => {
        // R3/R8: github mode uses registration.source (slug), not a local path.
        stubSpawn([0, 0, 0]);

        await defaultRunGrokInstall(
            { source: 'gobing-ai/superskill', mode: 'github' },
            'superskill',
            'demo',
            '/mkp/plugins/demo',
        );

        expect(spawnCalls[0]).toEqual(['grok', 'plugin', 'marketplace', 'add', 'gobing-ai/superskill']);
        expect(spawnCalls[2]).toEqual(['grok', 'plugin', 'install', '/mkp/plugins/demo', '--trust']);
    });

    it('tolerates marketplace already-configured (idempotent re-add)', async () => {
        stubSpawn([1, 0, 0], {
            0: 'Error: Marketplace source already configured: /mkp\n',
        });

        await defaultRunGrokInstall({ source: '/mkp', mode: 'directory' }, 'superskill', 'demo', '/mkp/plugins/demo');

        expect(spawnCalls[2]).toEqual(['grok', 'plugin', 'install', '/mkp/plugins/demo', '--trust']);
    });

    it('fails loudly when marketplace add fails for a reason other than already-configured', async () => {
        stubSpawn([1], { 0: 'Error: permission denied\n' });

        await expect(
            defaultRunGrokInstall({ source: '/mkp', mode: 'directory' }, 'superskill', 'demo', '/mkp/plugins/demo'),
        ).rejects.toThrow(/marketplace add failed/);
    });

    it('continues when uninstall fails (first install) then installs', async () => {
        stubSpawn([0, 1, 0]); // add ok, uninstall miss, install ok

        await defaultRunGrokInstall({ source: '/mkp', mode: 'directory' }, 'superskill', 'demo', '/mkp/plugins/demo');

        expect(spawnCalls[2]?.[0]).toBe('grok');
        expect(spawnCalls[2]?.[2]).toBe('install');
    });

    it('rejects unsafe marketplace names before spawning', async () => {
        stubSpawn([0, 0, 0]);
        await expect(
            defaultRunGrokInstall({ source: '/mkp', mode: 'directory' }, '../evil', 'demo', '/mkp/plugins/demo'),
        ).rejects.toThrow();
        expect(spawnCalls).toHaveLength(0);
    });

    it('rejects unsafe plugin names before spawning', async () => {
        stubSpawn([0, 0, 0]);
        await expect(
            defaultRunGrokInstall({ source: '/mkp', mode: 'directory' }, 'superskill', 'a/b', '/mkp/plugins/demo'),
        ).rejects.toThrow();
        expect(spawnCalls).toHaveLength(0);
    });
});
