import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    defaultRunOmpInstall,
    emitHooksForSurrogateTarget,
    postInstallOmp,
    resolveOmpInstallPath,
} from '../../src/commands/install';

// ── Env fixtures ─────────────────────────────────────────────────────────────

const originalCwd = process.cwd();
const originalEnv = { ...process.env };
let tempHome: string | undefined;
let tempWorkspace: string | undefined;

function makeTempDir(prefix: string): string {
    return mkdtempSync(join(tmpdir(), prefix));
}

beforeEach(() => {
    tempHome = makeTempDir('superskill-omp-home-');
    tempWorkspace = makeTempDir('superskill-omp-ws-');
    process.env.HOME_DIR = tempHome;
    process.chdir(tempWorkspace);
});

afterEach(() => {
    process.chdir(originalCwd);
    process.env = { ...originalEnv };
    if (tempHome) rmSync(tempHome, { recursive: true, force: true });
    if (tempWorkspace) rmSync(tempWorkspace, { recursive: true, force: true });
    tempHome = undefined;
    tempWorkspace = undefined;
});

/** Write an OMP registry file at the given location. */
function writeRegistry(dir: string, registry: object): void {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'installed_plugins.json'), JSON.stringify(registry));
}

/** Minimal plugin scaffold: plugin.json at root, optional hooks.json + commands. */
function scaffoldPlugin(root: string, name: string, hooks = true): string {
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, 'plugin.json'), JSON.stringify({ name, version: '0.0.1' }));
    if (hooks) {
        writeFileSync(
            join(root, 'hooks.json'),
            JSON.stringify({
                hooks: {
                    preToolUse: [{ hooks: [{ type: 'command', command: 'echo hi' }] }],
                },
            }),
        );
    }
    return root;
}

// ── resolveOmpInstallPath ────────────────────────────────────────────────────

describe('resolveOmpInstallPath', () => {
    it('returns undefined when the registry file does not exist (project scope)', () => {
        expect(resolveOmpInstallPath('superskill', 'demo', false)).toBeUndefined();
    });

    it('returns undefined when the registry JSON is malformed', () => {
        const registryDir = join(process.cwd(), '.omp', 'plugins');
        mkdirSync(registryDir, { recursive: true });
        writeFileSync(join(registryDir, 'installed_plugins.json'), '{ not valid json');
        expect(resolveOmpInstallPath('superskill', 'demo', false)).toBeUndefined();
    });

    it('returns undefined when the registry lacks the version/plugins shape', () => {
        writeRegistry(join(process.cwd(), '.omp', 'plugins'), { weird: true });
        expect(resolveOmpInstallPath('superskill', 'demo', false)).toBeUndefined();
    });

    it('returns undefined when the plugin key is absent', () => {
        writeRegistry(join(process.cwd(), '.omp', 'plugins'), {
            version: 1,
            plugins: { 'other@superskill': [{ scope: 'project', installPath: '/x' }] },
        });
        expect(resolveOmpInstallPath('superskill', 'demo', false)).toBeUndefined();
    });

    it('returns undefined when the key maps to an empty array', () => {
        writeRegistry(join(process.cwd(), '.omp', 'plugins'), {
            version: 1,
            plugins: { 'demo@superskill': [] },
        });
        expect(resolveOmpInstallPath('superskill', 'demo', false)).toBeUndefined();
    });

    it('returns the first installPath for a project-scope match', () => {
        const expected = join(process.cwd(), 'cached', 'demo');
        writeRegistry(join(process.cwd(), '.omp', 'plugins'), {
            version: 1,
            plugins: {
                'demo@superskill': [
                    { scope: 'project', installPath: expected },
                    { scope: 'project', installPath: '/second' },
                ],
            },
        });
        expect(resolveOmpInstallPath('superskill', 'demo', false)).toBe(expected);
    });

    it('reads the global registry under HOME_DIR when global is true', () => {
        if (!tempHome) throw new Error('tempHome not set');
        const expected = join(tempHome, 'global-cached', 'demo');
        writeRegistry(join(tempHome, '.omp', 'plugins'), {
            version: 1,
            plugins: { 'demo@superskill': [{ scope: 'user', installPath: expected }] },
        });
        expect(resolveOmpInstallPath('superskill', 'demo', true)).toBe(expected);
    });

    it('returns undefined when the global registry file is missing', () => {
        expect(resolveOmpInstallPath('superskill', 'demo', true)).toBeUndefined();
    });
});

// ── postInstallOmp ───────────────────────────────────────────────────────────

describe('postInstallOmp', () => {
    it('copies plugin.json to .claude-plugin/plugin.json and generates hooks', () => {
        const pluginRoot = makeTempDir('superskill-omp-proot-');
        scaffoldPlugin(pluginRoot, 'demo');
        const installPath = makeTempDir('superskill-omp-install-');
        // postInstallOmp reads the canonical hooks.json from hooksSourceDir.
        const hooksSourceDir = makeTempDir('superskill-omp-hooksrc-');
        writeFileSync(
            join(hooksSourceDir, 'hooks.json'),
            JSON.stringify({
                hooks: {
                    preToolUse: [{ hooks: [{ type: 'command', command: 'echo hi' }] }],
                    stop: [{ hooks: [{ type: 'command', command: 'echo done' }] }],
                },
            }),
        );

        const result = postInstallOmp(pluginRoot, installPath, hooksSourceDir, 'demo', {
            dryRun: false,
            verbose: false,
        });

        expect(result.count).toBeGreaterThan(0);
        expect(existsSync(join(installPath, '.claude-plugin', 'plugin.json'))).toBe(true);
        const manifest = JSON.parse(readFileSync(join(installPath, '.claude-plugin', 'plugin.json'), 'utf-8'));
        expect(manifest.name).toBe('demo');
        expect(existsSync(join(installPath, 'hooks', 'pre'))).toBe(true);
        expect(existsSync(join(installPath, 'hooks', 'post'))).toBe(true);
    });

    it('skips manifest copy when source plugin.json is absent', () => {
        const pluginRoot = makeTempDir('superskill-omp-proot-');
        // No plugin.json written.
        const installPath = makeTempDir('superskill-omp-install-');
        const hooksSourceDir = makeTempDir('superskill-omp-hooksrc-');
        writeFileSync(
            join(hooksSourceDir, 'hooks.json'),
            JSON.stringify({ hooks: { stop: [{ hooks: [{ type: 'command', command: 'echo done' }] }] } }),
        );

        const result = postInstallOmp(pluginRoot, installPath, hooksSourceDir, 'demo', {
            dryRun: false,
            verbose: false,
        });

        expect(result.count).toBeGreaterThan(0);
        expect(existsSync(join(installPath, '.claude-plugin', 'plugin.json'))).toBe(false);
    });

    it('still copies manifest even when no hooks are present', () => {
        const pluginRoot = makeTempDir('superskill-omp-proot-');
        scaffoldPlugin(pluginRoot, 'demo', false);
        const installPath = makeTempDir('superskill-omp-install-');
        const hooksSourceDir = makeTempDir('superskill-omp-hooksrc-');
        writeFileSync(join(hooksSourceDir, 'hooks.json'), JSON.stringify({ hooks: {} }));

        const result = postInstallOmp(pluginRoot, installPath, hooksSourceDir, 'demo', {
            dryRun: false,
            verbose: false,
        });

        expect(result.count).toBe(0);
        expect(existsSync(join(installPath, '.claude-plugin', 'plugin.json'))).toBe(true);
    });
});

// ── defaultRunOmpInstall ──────────────────────────────────────────────────────

interface StubChild {
    exited: Promise<number>;
    stdout: null;
    stderr: null;
    kill(): void;
}

describe('defaultRunOmpInstall', () => {
    // Bun.spawn resolves PATH from a snapshot taken at process start, so setting
    // process.env.PATH at runtime does not redirect `omp` resolution. We stub
    // Bun.spawn directly and capture the argv that defaultRunOmpInstall passes.
    let originalSpawn: typeof Bun.spawn;
    let spawnCalls: readonly string[][] = [];

    beforeEach(() => {
        originalSpawn = Bun.spawn;
        spawnCalls = [];
        const stub = ((args: string[]): StubChild => {
            spawnCalls = [...spawnCalls, args];
            return { exited: Promise.resolve(0), stdout: null, stderr: null, kill() {} };
        }) as unknown as typeof Bun.spawn;
        Bun.spawn = stub;
    });

    afterEach(() => {
        Bun.spawn = originalSpawn;
    });

    it('clears the marketplace cache and invokes omp marketplace add + install (project scope)', async () => {
        if (!tempHome) throw new Error('tempHome not set');
        const cacheDir = join(tempHome, '.omp', 'plugins', 'cache', 'superskill');
        mkdirSync(cacheDir, { recursive: true });
        writeFileSync(join(cacheDir, 'stale.txt'), 'old');
        expect(existsSync(cacheDir)).toBe(true);

        const marketRoot = makeTempDir('superskill-omp-market-');
        await defaultRunOmpInstall(marketRoot, 'superskill', 'demo', false);

        expect(existsSync(cacheDir)).toBe(false);
        expect(spawnCalls).toHaveLength(2);
        expect(spawnCalls[0]).toEqual(['omp', 'plugin', 'marketplace', 'add', marketRoot]);
        expect(spawnCalls[1]).toEqual(['omp', 'plugin', 'install', 'demo@superskill', '--scope', 'project']);
    });

    it('omits --scope for global installs', async () => {
        const marketRoot = makeTempDir('superskill-omp-market-');
        await defaultRunOmpInstall(marketRoot, 'superskill', 'demo', true);

        expect(spawnCalls).toHaveLength(2);
        expect(spawnCalls[1]).toEqual(['omp', 'plugin', 'install', 'demo@superskill']);
    });

    it('tolerates a missing cache dir (first install)', async () => {
        const marketRoot = makeTempDir('superskill-omp-market-');
        await defaultRunOmpInstall(marketRoot, 'superskill', 'demo', true);
        expect(spawnCalls).toHaveLength(2);
        expect(spawnCalls[0]?.[0]).toBe('omp');
    });

    it('rejects a marketplace name that escapes the cache dir, before any delete or spawn', async () => {
        if (!tempHome) throw new Error('tempHome not set');
        // With name '..', the cache-clear target resolves to ~/.omp/plugins — the
        // whole registry tree. The guard must throw before rmSync runs.
        const pluginsDir = join(tempHome, '.omp', 'plugins');
        mkdirSync(pluginsDir, { recursive: true });
        writeFileSync(join(pluginsDir, 'installed_plugins.json'), '{}');

        const marketRoot = makeTempDir('superskill-omp-market-');
        await expect(defaultRunOmpInstall(marketRoot, '..', 'demo', true)).rejects.toThrow('single path segment');

        expect(existsSync(join(pluginsDir, 'installed_plugins.json'))).toBe(true);
        expect(spawnCalls).toHaveLength(0);
    });

    it('throws when an omp CLI step exits non-zero instead of reporting success', async () => {
        const failingStub = ((args: string[]): StubChild => {
            spawnCalls = [...spawnCalls, args];
            return { exited: Promise.resolve(1), stdout: null, stderr: null, kill() {} };
        }) as unknown as typeof Bun.spawn;
        Bun.spawn = failingStub;

        const marketRoot = makeTempDir('superskill-omp-market-');
        await expect(defaultRunOmpInstall(marketRoot, 'superskill', 'demo', true)).rejects.toThrow(
            'omp plugin marketplace add failed with exit code 1',
        );
    });
});

// ── emitHooksForSurrogateTarget (omp branch survives via `hook emit`) ────────

describe('emitHooksForSurrogateTarget', () => {
    it('emits hooks for omp via the pi surrogate source format', () => {
        const rulesyncSourceDir = makeTempDir('superskill-omp-surrog-');
        writeFileSync(
            join(rulesyncSourceDir, 'hooks.json'),
            JSON.stringify({
                hooks: {
                    preToolUse: [{ hooks: [{ type: 'command', command: 'echo hi' }] }],
                    postToolUse: [{ hooks: [{ type: 'command', command: 'echo done' }] }],
                },
            }),
        );
        const outputRoot = makeTempDir('superskill-omp-out-');

        const result = emitHooksForSurrogateTarget('omp', rulesyncSourceDir, outputRoot, {
            dryRun: false,
            global: false,
        });

        expect(result).not.toBeNull();
        expect(result?.count).toBeGreaterThan(0);
    });

    it('returns null for an unsupported target', () => {
        const outputRoot = makeTempDir('superskill-omp-out-');
        const result = emitHooksForSurrogateTarget('codex', '/nonexistent', outputRoot, {
            dryRun: false,
            global: false,
        });
        expect(result).toBeNull();
    });
});
