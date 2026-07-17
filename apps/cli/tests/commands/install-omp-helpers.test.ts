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
    // Restore by MUTATION, never `process.env = {...}` — reassignment replaces the global
    // binding while `Bun.env` keeps pointing at the ORIGINAL object, splitting the alias for
    // every test file that runs after this one (order-dependent pollution, bug class from
    // the cerebrum: passes in isolation, fails in the full suite).
    for (const key of Object.keys(process.env)) {
        if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
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

    it('selects the requested project scope instead of the first registry entry', () => {
        const expected = join(process.cwd(), 'cached', 'demo');
        writeRegistry(join(process.cwd(), '.omp', 'plugins'), {
            version: 1,
            plugins: {
                'demo@superskill': [
                    { scope: 'user', installPath: '/wrong-scope' },
                    { scope: 'project', installPath: expected },
                ],
            },
        });
        expect(resolveOmpInstallPath('superskill', 'demo', false)).toBe(expected);
    });

    it('reads the global registry and selects user scope when global is true', () => {
        if (!tempHome) throw new Error('tempHome not set');
        const expected = join(tempHome, 'global-cached', 'demo');
        writeRegistry(join(tempHome, '.omp', 'plugins'), {
            version: 1,
            plugins: {
                'demo@superskill': [
                    { scope: 'project', installPath: '/wrong-scope' },
                    { scope: 'user', installPath: expected },
                ],
            },
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

    it('translates installed slash commands to the omp dialect (R4)', () => {
        // omp does not understand Claude's `/plugin:command` colon form; the installed
        // commands/ markdown must carry the omp (pi-style) `/skill:plugin-command` form.
        const pluginRoot = makeTempDir('superskill-omp-proot-');
        scaffoldPlugin(pluginRoot, 'demo', false);
        const installPath = makeTempDir('superskill-omp-install-');
        const commandsDir = join(installPath, 'commands');
        mkdirSync(commandsDir, { recursive: true });
        writeFileSync(join(commandsDir, 'usage.md'), 'Run:\n/demo:skill-add my-skill --force\n');
        const hooksSourceDir = makeTempDir('superskill-omp-hooksrc-');
        writeFileSync(join(hooksSourceDir, 'hooks.json'), JSON.stringify({ hooks: {} }));

        postInstallOmp(pluginRoot, installPath, hooksSourceDir, 'demo', {
            dryRun: false,
            verbose: false,
        });

        const translated = readFileSync(join(commandsDir, 'usage.md'), 'utf-8');
        expect(translated).toContain('/skill:demo-skill-add my-skill --force');
        expect(translated).not.toContain('/demo:skill-add');
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

    it('re-registers the marketplace and force-installs so re-installs are idempotent (project scope)', async () => {
        // omp 16.x: `marketplace add` exits 1 on an existing marketplace and a plain
        // `install` exits 1 on an installed plugin — remove-first + --force is what
        // makes a second `superskill install --targets omp` succeed.
        const marketRoot = makeTempDir('superskill-omp-market-');
        await defaultRunOmpInstall({ source: marketRoot, mode: 'directory' }, 'superskill', 'demo', false);

        expect(spawnCalls).toHaveLength(3);
        expect(spawnCalls[0]).toEqual(['omp', 'plugin', 'marketplace', 'remove', 'superskill']);
        expect(spawnCalls[1]).toEqual(['omp', 'plugin', 'marketplace', 'add', marketRoot]);
        expect(spawnCalls[2]).toEqual(['omp', 'plugin', 'install', 'demo@superskill', '--force', '--scope', 'project']);
    });

    it('passes github owner/repo slug to marketplace add when registration mode is github', async () => {
        // R3/R8: github mode must register the slug, not a local absolute path.
        await defaultRunOmpInstall({ source: 'gobing-ai/superskill', mode: 'github' }, 'superskill', 'demo', true);

        expect(spawnCalls).toHaveLength(3);
        expect(spawnCalls[0]).toEqual(['omp', 'plugin', 'marketplace', 'remove', 'superskill']);
        expect(spawnCalls[1]).toEqual(['omp', 'plugin', 'marketplace', 'add', 'gobing-ai/superskill']);
        expect(spawnCalls[2]).toEqual(['omp', 'plugin', 'install', 'demo@superskill', '--force']);
    });

    it('omits --scope for global installs', async () => {
        const marketRoot = makeTempDir('superskill-omp-market-');
        await defaultRunOmpInstall({ source: marketRoot, mode: 'directory' }, 'superskill', 'demo', true);

        expect(spawnCalls).toHaveLength(3);
        expect(spawnCalls[2]).toEqual(['omp', 'plugin', 'install', 'demo@superskill', '--force']);
    });

    it('tolerates a failing marketplace remove (first install: nothing to remove yet)', async () => {
        // The remove step exits 1 when the marketplace was never registered — the
        // normal first-install case. It must not abort the add + install that follow.
        const stub = ((args: string[]): StubChild => {
            spawnCalls = [...spawnCalls, args];
            const isRemove = args[2] === 'marketplace' && args[3] === 'remove';
            return { exited: Promise.resolve(isRemove ? 1 : 0), stdout: null, stderr: null, kill() {} };
        }) as unknown as typeof Bun.spawn;
        Bun.spawn = stub;

        const marketRoot = makeTempDir('superskill-omp-market-');
        await defaultRunOmpInstall({ source: marketRoot, mode: 'directory' }, 'superskill', 'demo', true);
        expect(spawnCalls).toHaveLength(3);
        expect(spawnCalls[1]).toEqual(['omp', 'plugin', 'marketplace', 'add', marketRoot]);
    });

    it('rejects a marketplace name that is not a single path segment, before any spawn', async () => {
        // The name flows into `<plugin>@<marketplace>` CLI addressing and the registry
        // key; `..` would corrupt both. The guard must throw before any omp call runs.
        const marketRoot = makeTempDir('superskill-omp-market-');
        await expect(
            defaultRunOmpInstall({ source: marketRoot, mode: 'directory' }, '..', 'demo', true),
        ).rejects.toThrow('single path segment');

        expect(spawnCalls).toHaveLength(0);
    });

    it('rejects a plugin name that is not a single path segment, before any spawn', async () => {
        // Plugin is the left half of `plugin@marketplace` — same segment rule as
        // defaultRunGrokInstall. Throw before any omp CLI call.
        const marketRoot = makeTempDir('superskill-omp-market-');
        await expect(
            defaultRunOmpInstall({ source: marketRoot, mode: 'directory' }, 'superskill', '../evil', true),
        ).rejects.toThrow('single path segment');

        expect(spawnCalls).toHaveLength(0);
    });

    it('throws when an omp CLI step exits non-zero instead of reporting success', async () => {
        const failingStub = ((args: string[]): StubChild => {
            spawnCalls = [...spawnCalls, args];
            return { exited: Promise.resolve(1), stdout: null, stderr: null, kill() {} };
        }) as unknown as typeof Bun.spawn;
        Bun.spawn = failingStub;

        const marketRoot = makeTempDir('superskill-omp-market-');
        await expect(
            defaultRunOmpInstall({ source: marketRoot, mode: 'directory' }, 'superskill', 'demo', true),
        ).rejects.toThrow('omp plugin marketplace add failed with exit code 1');
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
