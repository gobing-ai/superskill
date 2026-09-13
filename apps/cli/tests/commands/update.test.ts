import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    addSkills,
    checkSkills,
    type InstallTarget,
    listRegularFilesUnder,
    snapshotFiles,
    writeInstallManifest,
} from '@gobing-ai/superskill-core';
import type { ProcessExecutor, ProcessOptions } from '@gobing-ai/ts-runtime';
import { Command } from 'commander';
import * as installNs from '../../src/commands/install';
import { executeUpdate, formatUpdateRow, registerUpdate, type UpdateJsonEnvelope } from '../../src/commands/update';

const originalCwd = process.cwd();
const originalHomeDir = process.env.HOME_DIR;
const originalXdgStateHome = process.env.XDG_STATE_HOME;
let tempDir: string | undefined;
let testHome: string | undefined;

function workspace(): string {
    tempDir = mkdtempSync(join(tmpdir(), 'superskill-update-test-'));
    process.chdir(tempDir);
    return tempDir;
}

afterEach(() => {
    mock.restore();
    if (originalHomeDir === undefined) delete process.env.HOME_DIR;
    else process.env.HOME_DIR = originalHomeDir;
    if (originalXdgStateHome === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = originalXdgStateHome;
    process.chdir(originalCwd);
    if (tempDir) {
        rmSync(tempDir, { recursive: true, force: true });
        tempDir = undefined;
    }
    if (testHome) {
        rmSync(testHome, { recursive: true, force: true });
        testHome = undefined;
    }
});

/** Skill SKILL.md fixture; the frontmatter name drives the sanitized lock key. */
function skillMd(name: string): string {
    return `---\nname: ${name}\ndescription: fixture skill\n---\n# ${name}`;
}

/** Install one skill into the global (HOME_DIR) scope via the real addSkills path. */
async function installGlobalSkillFrom(sourceDir: string): Promise<void> {
    const res = await addSkills(sourceDir, { global: true, homeDir: process.env.HOME_DIR });
    if (!res.success) throw new Error(res.error ?? 'addSkills failed');
}

/** Seed a global lock whose skill rows have no hashable local source (fetch-only shapes). */
function writeGlobalSkillsLock(skills: Record<string, unknown>): void {
    const home = process.env.HOME_DIR as string;
    mkdirSync(join(home, '.agents'), { recursive: true });
    writeFileSync(join(home, '.agents', '.skill-lock.json'), JSON.stringify({ version: 3, skills }));
}

function writePlugin(root: string, name: string, version: string, body: string): string {
    const pluginRoot = join(root, 'plugins', name);
    mkdirSync(join(pluginRoot, 'skills'), { recursive: true });
    writeFileSync(join(pluginRoot, 'plugin.json'), JSON.stringify({ name, version }));
    writeFileSync(join(pluginRoot, 'skills', 'a.md'), body);
    return pluginRoot;
}

function writeMarket(root: string, name: string, version: string): string {
    mkdirSync(join(root, '.claude-plugin'), { recursive: true });
    const path = join(root, '.claude-plugin', 'marketplace.json');
    writeFileSync(
        path,
        JSON.stringify({ name: 'superskill', plugins: [{ name, source: `./plugins/${name}`, version }] }),
    );
    return path;
}

function writeManifest(
    scope: string,
    plugin: string,
    pluginRoot: string,
    extras: {
        version?: string;
        channel?: 'bundled' | 'marketplace';
        locator?: string;
        target?: InstallTarget;
        grokBot?: { materialize: 'bridge' | 'full' };
    } = {},
): void {
    const upstream = snapshotFiles(pluginRoot, listRegularFilesUnder(pluginRoot));
    const target = extras.target ?? 'codex';
    writeInstallManifest(scope, target, plugin, {
        schemaVersion: 1,
        plugin,
        target,
        channel: extras.channel ?? 'marketplace',
        upstreamVersion: extras.version ?? '1.0.0',
        marketplaceLocator: extras.locator,
        installedAt: '2026-08-31T18:00:00.000Z',
        superskillVersion: '0.3.19',
        installed: upstream,
        upstream,
        ...(extras.grokBot !== undefined ? { grokBot: extras.grokBot } : {}),
    });
}

describe('registerUpdate', () => {
    it('registers update with name, check, json, targets, marketplace, and no-global options (R2/R4)', () => {
        const program = new Command();
        registerUpdate(program);
        const cmd = program.commands.find((c) => c.name() === 'update');
        expect(cmd).toBeDefined();
        const names = cmd?.options.map((o) => o.long) ?? [];
        expect(names).toContain('--check');
        expect(names).toContain('--json');
        expect(names).toContain('--targets');
        expect(names).toContain('--marketplace');
        expect(names).toContain('--no-global');
        expect(cmd?.helpInformation()).toContain('[name]');
    });
});

describe('formatUpdateRow', () => {
    it('prints the reason after the locator for an unavailable row that carries one (R4)', () => {
        const line = formatUpdateRow({
            kind: 'plugin',
            name: 'kk',
            status: 'unavailable',
            locator: '/tmp/gone-marketplace',
            reason: 'locator path missing',
        });
        expect(line).toContain('(/tmp/gone-marketplace): locator path missing');
    });

    it('keeps the unavailable line byte-identical when no reason is set (R1)', () => {
        expect(formatUpdateRow({ kind: 'plugin', name: 'kk', status: 'unavailable', locator: '/tmp/gone' })).toBe(
            'kk: upstream unavailable (/tmp/gone)',
        );
    });

    it('renders skill unchecked and unavailable rows as name: status: reason (R1/R20)', () => {
        expect(
            formatUpdateRow({
                kind: 'skill',
                name: 'git-skill',
                status: 'unchecked',
                reason: "Source type 'gitlab' has no read-only hash",
            }),
        ).toBe("git-skill: unchecked: Source type 'gitlab' has no read-only hash");
        expect(
            formatUpdateRow({ kind: 'skill', name: 'last30days', status: 'unavailable', reason: 'network down' }),
        ).toBe('last30days: unavailable: network down');
        expect(formatUpdateRow({ kind: 'skill', name: 'last30days', status: 'unavailable' })).toBe(
            'last30days: unavailable: unknown failure',
        );
    });
});

describe('executeUpdate', () => {
    it('reports a stale marketplace plugin once and exits 1 in --check', async () => {
        const root = workspace();
        writePlugin(root, 'demo', '2.0.0', '# new\n');
        const market = writeMarket(root, 'demo', '2.0.0');
        const oldRoot = join(root, 'old');
        writePlugin(oldRoot, 'demo', '1.0.0', '# old\n');
        writeManifest(root, 'demo', join(oldRoot, 'plugins', 'demo'), { version: '1.0.0', locator: market });
        const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);

        const code = await executeUpdate('demo', ['codex'], {
            check: true,
            global: false,
            marketplacePath: market,
            outputRoot: root,
        });

        const output = stdout.mock.calls.map((c) => String(c[0])).join('');
        stdout.mockRestore();
        expect(code).toBe(1);
        expect(output).toContain('demo: stale:');
        expect(output).toContain('1.0.0 → 2.0.0');
        expect(output).toContain('skills/a.md');
    });

    it('reports up to date without calling install', async () => {
        const root = workspace();
        const pluginRoot = writePlugin(root, 'demo', '1.0.0', '# same\n');
        const market = writeMarket(root, 'demo', '1.0.0');
        writeManifest(root, 'demo', pluginRoot, { version: '1.0.0', locator: market });
        let installed = 0;
        const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);
        const code = await executeUpdate(
            'demo',
            ['codex'],
            {
                check: true,
                global: false,
                marketplacePath: market,
                outputRoot: root,
            },
            {
                executeInstall: async () => {
                    installed += 1;
                },
            },
        );
        const output = stdout.mock.calls.map((c) => String(c[0])).join('');
        stdout.mockRestore();
        expect(code).toBe(0);
        expect(installed).toBe(0);
        expect(output).toContain('demo: 1.0.0 up to date');
    });

    it('errors when an explicit name matches neither a plugin nor a lock-tracked skill (R2)', async () => {
        const root = workspace();
        // Task 0135: bare names are no longer silently reinterpreted as legacy plugin guidance —
        // an unknown name is a usage error naming the value and the scopes it searched.
        await expect(
            executeUpdate('ghost', ['codex'], { check: true, global: false, outputRoot: root }),
        ).rejects.toThrow("no plugin or skill named 'ghost' in the project scope");
        await expect(
            executeUpdate('ghost', ['codex'], { check: true, global: false, outputRoot: root }),
        ).rejects.toThrow('skills-lock.json');
    });

    it('treats corrupt JSON as legacy without trusting identity fields', async () => {
        const root = workspace();
        const dest = join(root, '.superskill', 'manifests', 'codex', 'demo');
        mkdirSync(dest, { recursive: true });
        writeFileSync(join(dest, '.superskill-manifest.json'), '{"plugin":"evil","schemaVersion":99');
        const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);
        const code = await executeUpdate('demo', ['codex'], { check: true, global: false, outputRoot: root });
        const output = stdout.mock.calls.map((c) => String(c[0])).join('');
        stdout.mockRestore();
        expect(code).toBe(0);
        expect(output).toContain('demo: installed before manifest support - reinstall to adopt');
        expect(output).not.toContain('evil');
    });

    it('treats a valid manifest whose identity disagrees with its registry path as legacy', async () => {
        const root = workspace();
        const pluginRoot = writePlugin(root, 'demo', '1.0.0', '# demo\n');
        const snapshot = snapshotFiles(pluginRoot, listRegularFilesUnder(pluginRoot));
        const dest = join(root, '.superskill', 'manifests', 'codex', 'demo');
        mkdirSync(dest, { recursive: true });
        writeFileSync(
            join(dest, '.superskill-manifest.json'),
            JSON.stringify({
                schemaVersion: 1,
                plugin: '../evil',
                target: 'codex',
                channel: 'marketplace',
                upstreamVersion: '1.0.0',
                marketplaceLocator: '/not-used',
                installedAt: '2026-08-31T18:00:00.000Z',
                superskillVersion: '0.3.19',
                installed: snapshot,
                upstream: snapshot,
            }),
        );
        const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);

        const code = await executeUpdate('demo', ['codex'], { check: true, global: false, outputRoot: root });

        const output = stdout.mock.calls.map((c) => String(c[0])).join('');
        stdout.mockRestore();
        expect(code).toBe(0);
        expect(output).toContain('demo: installed before manifest support - reinstall to adopt');
        expect(output).not.toContain('evil');
    });

    it('reports unavailable locator, continues a second plugin, and exits 2 over stale 1', async () => {
        const root = workspace();
        const pluginRoot = writePlugin(root, 'fresh', '1.0.0', '# x\n');
        const market = writeMarket(root, 'fresh', '1.0.0');
        writeManifest(root, 'fresh', pluginRoot, { version: '1.0.0', locator: market });
        writeManifest(root, 'gone', pluginRoot, { version: '1.0.0', locator: '/no/such/marketplace' });
        const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);
        const code = await executeUpdate(undefined, ['codex'], { check: true, global: false, outputRoot: root });
        const output = stdout.mock.calls.map((c) => String(c[0])).join('');
        stdout.mockRestore();
        expect(code).toBe(2);
        expect(output).toContain('gone: upstream unavailable');
        expect(output).toContain('fresh:');
    });

    it('re-installs a stale marketplace plugin and does not write during --check', async () => {
        const root = workspace();
        writePlugin(root, 'demo', '2.0.0', '# new\n');
        const market = writeMarket(root, 'demo', '2.0.0');
        const oldRoot = join(root, 'old');
        writePlugin(oldRoot, 'demo', '1.0.0', '# old\n');
        writeManifest(root, 'demo', join(oldRoot, 'plugins', 'demo'), { version: '1.0.0', locator: market });
        const calls: Array<{
            name: string;
            targets: string[];
            marketplacePath?: string;
            pluginPath?: string;
            global?: boolean;
        }> = [];
        spyOn(process.stdout, 'write').mockImplementation(() => true);
        const checkCode = await executeUpdate(
            'demo',
            ['codex'],
            {
                check: true,
                global: false,
                marketplacePath: market,
                outputRoot: root,
            },
            {
                executeInstall: async (name) => {
                    calls.push({ name, targets: [name] });
                },
            },
        );
        expect(checkCode).toBe(1);
        expect(calls).toEqual([]);
        const mutCode = await executeUpdate(
            'demo',
            ['codex'],
            {
                check: false,
                global: false,
                marketplacePath: market,
                outputRoot: root,
            },
            {
                executeInstall: async (name, targets, options) => {
                    calls.push({
                        name,
                        targets: [...targets],
                        marketplacePath: options.marketplacePath,
                        pluginPath: options.pluginPath,
                        global: options.global,
                    });
                },
            },
        );
        expect(mutCode).toBe(0);
        expect(calls).toEqual([
            {
                name: 'demo',
                targets: ['codex'],
                marketplacePath: market,
                pluginPath: undefined,
                global: false,
            },
        ]);
    });

    it('prints the npm upgrade command once for a stale bundled plugin', async () => {
        const root = workspace();
        const pluginRoot = writePlugin(root, 'cc', '0.1.0', '# cc\n');
        writeManifest(root, 'cc', pluginRoot, { version: '0.1.0', channel: 'bundled' });
        const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);
        const code = await executeUpdate(
            'cc',
            ['codex'],
            { check: false, global: false, outputRoot: root },
            {
                npmLatest: async () => '9.9.9',
                executeInstall: async () => {
                    throw new Error('bundled must not re-install via executeInstall');
                },
            },
        );
        const output = stdout.mock.calls.map((c) => String(c[0])).join('');
        stdout.mockRestore();
        expect(code).toBe(0);
        expect(output).toContain('npm i -g @gobing-ai/superskill@latest');
        expect(output).toContain('superskill <9.9.9> available');
    });

    it('executes both update actions when one plugin is stale on marketplace and bundled targets', async () => {
        const root = workspace();
        writePlugin(root, 'demo', '2.0.0', '# new\n');
        const market = writeMarket(root, 'demo', '2.0.0');
        const oldRoot = join(root, 'old');
        const oldPluginRoot = writePlugin(oldRoot, 'demo', '1.0.0', '# old\n');
        writeManifest(root, 'demo', oldPluginRoot, { version: '1.0.0', locator: market, target: 'codex' });
        writeManifest(root, 'demo', oldPluginRoot, { version: '0.1.0', channel: 'bundled', target: 'claude' });
        const calls: Array<{ plugin: string; targets: InstallTarget[] }> = [];
        const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);

        const code = await executeUpdate(
            'demo',
            ['codex', 'claude'],
            { check: false, global: false, outputRoot: root },
            {
                npmLatest: async () => '9.9.9',
                executeInstall: async (plugin, targets) => {
                    calls.push({ plugin, targets: [...targets] });
                },
            },
        );

        const output = stdout.mock.calls.map((call) => String(call[0])).join('');
        stdout.mockRestore();
        expect(code).toBe(0);
        expect(calls).toEqual([{ plugin: 'demo', targets: ['codex'] }]);
        expect(output.match(/demo: stale:/g)).toHaveLength(1);
        expect(output).toContain('npm i -g @gobing-ai/superskill@latest');
    });

    it('reports bundled npm lookup failure as unavailable and exits 2', async () => {
        const root = workspace();
        const pluginRoot = writePlugin(root, 'cc', '0.1.0', '# cc\n');
        writeManifest(root, 'cc', pluginRoot, { version: '0.1.0', channel: 'bundled' });
        spyOn(process.stdout, 'write').mockImplementation(() => true);
        const code = await executeUpdate(
            'cc',
            ['codex'],
            { check: true, global: false, outputRoot: root },
            {
                npmLatest: async () => {
                    throw new Error('offline');
                },
            },
        );
        expect(code).toBe(2);
    });

    it('uses processExecutor for npm view on bundled current', async () => {
        const root = workspace();
        const pluginRoot = writePlugin(root, 'cc', '0.3.19', '# cc\n');
        writeManifest(root, 'cc', pluginRoot, { version: '0.3.19', channel: 'bundled' });
        const executor: ProcessExecutor = {
            run: async (_options: ProcessOptions) => ({
                command: 'npm',
                args: ['view'],
                exitCode: 0,
                stdout: '0.3.19\n',
                stderr: '',
                durationMs: 0,
            }),
            runStreaming: () => {
                throw new Error('unused');
            },
        };
        spyOn(process.stdout, 'write').mockImplementation(() => true);
        const code = await executeUpdate(
            'cc',
            ['codex'],
            { check: true, global: false, outputRoot: root },
            {
                processExecutor: executor,
            },
        );
        expect(code).toBe(0);
    });

    it('rejects an unsafe plugin name', async () => {
        await expect(executeUpdate('../x', ['codex'], { check: true, global: false })).rejects.toThrow(
            'single path segment',
        );
    });

    it('exits 1 for an unknown name through process.exit from the registered command (R2)', async () => {
        const root = workspace();
        const exits: number[] = [];
        spyOn(process, 'exit').mockImplementation(((code?: number) => {
            exits.push(code ?? 0);
            throw new Error('exit');
        }) as typeof process.exit);
        spyOn(process.stdout, 'write').mockImplementation(() => true);
        const program = new Command();
        program.exitOverride();
        registerUpdate(program);
        await expect(
            program.parseAsync(['node', 'superskill', 'update', 'ghost', '--check', '--no-global']),
        ).rejects.toThrow('exit');
        // Task 0135: 'ghost' matches nothing, so the R2 usage error exits 1 (previously a
        // legacy-guidance row exited 0).
        expect(exits[0]).toBe(1);
        expect(root).toBeTruthy();
    });

    it('treats a marketplace manifest with no locator as unavailable', async () => {
        const root = workspace();
        const pluginRoot = writePlugin(root, 'demo', '1.0.0', '# x\n');
        writeManifest(root, 'demo', pluginRoot, { version: '1.0.0' });
        spyOn(process.stdout, 'write').mockImplementation(() => true);
        const code = await executeUpdate('demo', ['codex'], { check: true, global: false, outputRoot: root });
        expect(code).toBe(2);
    });

    it('treats empty npm view output as bundled unavailable', async () => {
        const root = workspace();
        const pluginRoot = writePlugin(root, 'cc', '0.1.0', '# cc\n');
        writeManifest(root, 'cc', pluginRoot, { version: '0.1.0', channel: 'bundled' });
        const executor: ProcessExecutor = {
            run: async () => ({
                command: 'npm',
                args: ['view'],
                exitCode: 0,
                stdout: '   \n',
                stderr: '',
                durationMs: 0,
            }),
            runStreaming: () => {
                throw new Error('unused');
            },
        };
        spyOn(process.stdout, 'write').mockImplementation(() => true);
        const code = await executeUpdate(
            'cc',
            ['codex'],
            { check: true, global: false, outputRoot: root },
            {
                processExecutor: executor,
            },
        );
        expect(code).toBe(2);
    });

    it('lists injected bundled names as legacy when no manifest exists', async () => {
        const root = workspace();
        const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);
        const code = await executeUpdate(
            undefined,
            ['codex'],
            { check: true, global: false, outputRoot: root },
            { listBundledPlugins: () => ['cc'] },
        );
        const output = stdout.mock.calls.map((c) => String(c[0])).join('');
        stdout.mockRestore();
        expect(code).toBe(0);
        expect(output).toContain('cc: installed before manifest support - reinstall to adopt');
    });

    it('does not report a false legacy row for a plugin manifested only on another target', async () => {
        const root = workspace();
        const pluginRoot = writePlugin(root, 'demo', '1.0.0', '# x\n');
        const market = writeMarket(root, 'demo', '1.0.0');
        writeManifest(root, 'demo', pluginRoot, { version: '1.0.0', locator: market });
        const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);
        const code = await executeUpdate(
            undefined,
            ['claude'],
            { check: true, global: false, outputRoot: root },
            { listBundledPlugins: () => [] },
        );
        const output = stdout.mock.calls.map((c) => String(c[0])).join('');
        stdout.mockRestore();
        expect(code).toBe(0);
        expect(output).not.toContain('demo:');
        expect(output).not.toContain('reinstall to adopt');
    });

    it('snapshots a plugin-root locator and re-installs via pluginPath', async () => {
        const root = workspace();
        const current = writePlugin(root, 'demo', '2.0.0', '# new\n');
        const oldRoot = join(root, 'old');
        writePlugin(oldRoot, 'demo', '1.0.0', '# old\n');
        writeManifest(root, 'demo', join(oldRoot, 'plugins', 'demo'), { version: '1.0.0', locator: current });
        const calls: Array<{ name: string; pluginPath?: string; marketplacePath?: string }> = [];
        const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);
        const checkCode = await executeUpdate('demo', ['codex'], {
            check: true,
            global: false,
            outputRoot: root,
        });
        const checkOut = stdout.mock.calls.map((c) => String(c[0])).join('');
        expect(checkCode).toBe(1);
        expect(checkOut).toContain('demo: stale:');
        expect(checkOut).toContain('1.0.0 → 2.0.0');
        const mutCode = await executeUpdate(
            'demo',
            ['codex'],
            { check: false, global: false, outputRoot: root },
            {
                executeInstall: async (name, _targets, options) => {
                    calls.push({
                        name,
                        pluginPath: options.pluginPath,
                        marketplacePath: options.marketplacePath,
                    });
                },
            },
        );
        stdout.mockRestore();
        expect(mutCode).toBe(0);
        expect(calls).toEqual([{ name: 'demo', pluginPath: current, marketplacePath: undefined }]);
    });

    it('omits an empty changed-path list on version-only marketplace stale', async () => {
        const root = workspace();
        const pluginRoot = writePlugin(root, 'demo', '1.0.0', '# same\n');
        const market = writeMarket(root, 'demo', '2.0.0');
        writeManifest(root, 'demo', pluginRoot, { version: '1.0.0', locator: market });
        const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);
        const code = await executeUpdate('demo', ['codex'], {
            check: true,
            global: false,
            marketplacePath: market,
            outputRoot: root,
        });
        const output = stdout.mock.calls.map((c) => String(c[0])).join('');
        stdout.mockRestore();
        expect(code).toBe(1);
        expect(output).toContain('1.0.0 → 2.0.0');
        expect(output).not.toContain('0 file(s) changed');
    });

    it('lists a configured plugin as legacy when omitted plugin has no manifest', async () => {
        const root = workspace();
        writeFileSync(
            join(root, 'superskill.jsonc'),
            JSON.stringify({
                version: 1,
                plugins: [{ name: 'fromconfig', path: './plugins/fromconfig' }],
                targets: ['codex'],
            }),
        );
        const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);
        const code = await executeUpdate(
            undefined,
            ['codex'],
            { check: true, global: false, outputRoot: root },
            { listBundledPlugins: () => [] },
        );
        const output = stdout.mock.calls.map((c) => String(c[0])).join('');
        stdout.mockRestore();
        expect(code).toBe(0);
        expect(output).toContain('fromconfig: installed before manifest support - reinstall to adopt');
    });

    it('lists packaged bundled plugins, not a CWD marketplace, when the plugin is omitted', async () => {
        const root = workspace();
        const pkg = join(root, 'pkg');
        mkdirSync(join(pkg, '.claude-plugin'), { recursive: true });
        writeFileSync(
            join(pkg, '.claude-plugin', 'marketplace.json'),
            JSON.stringify({ name: 'pkg', plugins: [{ name: 'pkg-cc', source: './plugins/pkg-cc' }] }),
        );
        mkdirSync(join(root, '.claude-plugin'), { recursive: true });
        writeFileSync(
            join(root, '.claude-plugin', 'marketplace.json'),
            JSON.stringify({ name: 'cwd', plugins: [{ name: 'cwd-only', source: './plugins/cwd-only' }] }),
        );
        spyOn(installNs, 'resolveInstalledPackageRoot').mockImplementation(() => pkg);
        const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);
        const code = await executeUpdate(undefined, ['codex'], { check: true, global: false, outputRoot: root });
        const output = stdout.mock.calls.map((c) => String(c[0])).join('');
        stdout.mockRestore();
        expect(code).toBe(0);
        expect(output).toContain('pkg-cc: installed before manifest support - reinstall to adopt');
        expect(output).not.toContain('cwd-only');
    });

    it('scans HOME_DIR when global is true', async () => {
        const root = workspace();
        process.env.HOME_DIR = root;
        const pluginRoot = writePlugin(root, 'demo', '1.0.0', '# x\n');
        const market = writeMarket(root, 'demo', '1.0.0');
        writeManifest(root, 'demo', pluginRoot, { version: '1.0.0', locator: market });
        spyOn(process.stdout, 'write').mockImplementation(() => true);
        const code = await executeUpdate('demo', ['codex'], { check: true, global: true, marketplacePath: market });
        delete process.env.HOME_DIR;
        expect(code).toBe(0);
    });

    it('merges a stale plugin across two targets into one unchanged text row (R2)', async () => {
        const root = workspace();
        writePlugin(root, 'demo', '2.0.0', '# new\n');
        const market = writeMarket(root, 'demo', '2.0.0');
        const oldRoot = join(root, 'old');
        writePlugin(oldRoot, 'demo', '1.0.0', '# old\n');
        const oldPluginRoot = join(oldRoot, 'plugins', 'demo');
        writeManifest(root, 'demo', oldPluginRoot, { version: '1.0.0', locator: market, target: 'codex' });
        writeManifest(root, 'demo', oldPluginRoot, { version: '1.0.0', locator: market, target: 'claude' });
        const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);
        const code = await executeUpdate('demo', ['codex', 'claude'], {
            check: true,
            global: false,
            marketplacePath: market,
            outputRoot: root,
        });
        const output = stdout.mock.calls.map((c) => String(c[0])).join('');
        stdout.mockRestore();
        expect(code).toBe(1);
        expect(output.match(/demo: stale:/g)).toHaveLength(1);
        expect(output).toContain('1.0.0 → 2.0.0');
    });

    it('threads the recorded grok-bot materialize mode into a marketplace reinstall (R7)', async () => {
        const root = workspace();
        writePlugin(root, 'demo', '2.0.0', '# new\n');
        const market = writeMarket(root, 'demo', '2.0.0');
        const oldRoot = join(root, 'old');
        const oldPluginRoot = writePlugin(oldRoot, 'demo', '1.0.0', '# old\n');
        const sandRoot = join(root, 'sand-data');
        mkdirSync(sandRoot, { recursive: true });
        process.env.SAND_DATA = sandRoot;
        writeManifest(sandRoot, 'demo', oldPluginRoot, {
            version: '1.0.0',
            locator: market,
            target: 'grok-bot',
            grokBot: { materialize: 'full' },
        });
        const calls: Array<{ targets: string[]; materialize?: string }> = [];
        spyOn(process.stdout, 'write').mockImplementation(() => true);
        try {
            const code = await executeUpdate(
                'demo',
                ['grok-bot'],
                { check: false, global: false, marketplacePath: market, outputRoot: root },
                {
                    executeInstall: async (_name, targets, options) => {
                        calls.push({ targets: [...targets], materialize: options.materialize });
                    },
                },
            );
            expect(code).toBe(0);
            expect(calls).toEqual([{ targets: ['grok-bot'], materialize: 'full' }]);
        } finally {
            delete process.env.SAND_DATA;
        }
    });

    it('skips a grok-bot reinstall with guidance when the receipt has no recorded mode (R7)', async () => {
        const root = workspace();
        writePlugin(root, 'demo', '2.0.0', '# new\n');
        const market = writeMarket(root, 'demo', '2.0.0');
        const oldRoot = join(root, 'old');
        const oldPluginRoot = writePlugin(oldRoot, 'demo', '1.0.0', '# old\n');
        const sandRoot = join(root, 'sand-data');
        mkdirSync(sandRoot, { recursive: true });
        process.env.SAND_DATA = sandRoot;
        writeManifest(sandRoot, 'demo', oldPluginRoot, { version: '1.0.0', locator: market, target: 'grok-bot' });
        let installs = 0;
        spyOn(process.stdout, 'write').mockImplementation(() => true);
        const stderr = spyOn(process.stderr, 'write').mockImplementation(() => true);
        try {
            const code = await executeUpdate(
                'demo',
                ['grok-bot'],
                { check: false, global: false, marketplacePath: market, outputRoot: root },
                {
                    executeInstall: async () => {
                        installs += 1;
                    },
                },
            );
            expect(code).toBe(0);
            expect(installs).toBe(0);
            const errOut = stderr.mock.calls.map((call) => String(call[0])).join('');
            expect(errOut).toContain('no recorded materialization mode');
        } finally {
            delete process.env.SAND_DATA;
        }
    });
});

describe('executeUpdate - lock-tracked skills (F8 task 0135)', () => {
    beforeEach(() => {
        // Skill locks resolve through HOME_DIR/XDG_STATE_HOME; give every test a private home
        // so a bare update can never read or write the real user lock.
        testHome = mkdtempSync(join(tmpdir(), 'superskill-update-home-'));
        process.env.HOME_DIR = testHome;
        delete process.env.XDG_STATE_HOME;
    });

    function drain(stdout: { mock: { calls: unknown[][] } }): string {
        return stdout.mock.calls.map((c) => String(c[0])).join('');
    }

    async function seedGlobalSkill(name: string, mutate = false): Promise<void> {
        const src = join(testHome as string, `${name}-src`);
        mkdirSync(src, { recursive: true });
        writeFileSync(join(src, 'SKILL.md'), skillMd(name));
        await installGlobalSkillFrom(src);
        if (mutate) writeFileSync(join(src, 'SKILL.md'), `${skillMd(name)}\n- v2 line\n`);
    }

    it('aggregates a stale lock-tracked skill under Skills: and exits 1 in --check without writing (R1)', async () => {
        workspace();
        await seedGlobalSkill('last30days', true);
        const lockPath = join(testHome as string, '.agents', '.skill-lock.json');
        const canonicalPath = join(testHome as string, '.agents', 'skills', 'last30days', 'SKILL.md');
        const lockBefore = readFileSync(lockPath, 'utf-8');
        const canonicalBefore = readFileSync(canonicalPath, 'utf-8');
        const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);

        const code = await executeUpdate(
            undefined,
            ['codex'],
            { check: true, global: true },
            {
                listBundledPlugins: () => [],
            },
        );

        const output = drain(stdout);
        stdout.mockRestore();
        expect(code).toBe(1);
        expect(output).toContain('Skills:');
        // Shared formatter keeps stale rows byte-identical across kinds; the row reason
        // ('Upstream hash differs') is still carried in the JSON envelope rows.
        expect(output).toContain('last30days: stale: changed');
        expect(readFileSync(lockPath, 'utf-8')).toBe(lockBefore);
        expect(readFileSync(canonicalPath, 'utf-8')).toBe(canonicalBefore);
    });

    it('reports a current lock-tracked skill up to date and prints Plugins: before Skills: (R2)', async () => {
        workspace();
        const home = testHome as string;
        await seedGlobalSkill('last30days');
        const pluginRoot = writePlugin(home, 'demo', '1.0.0', '# demo\n');
        const market = writeMarket(home, 'demo', '1.0.0');
        writeManifest(home, 'demo', pluginRoot, { version: '1.0.0', locator: market });
        const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);

        const code = await executeUpdate(
            undefined,
            ['codex'],
            { check: true, global: true, marketplacePath: market },
            {
                listBundledPlugins: () => [],
            },
        );

        const output = drain(stdout);
        stdout.mockRestore();
        expect(code).toBe(0);
        expect(output.indexOf('Plugins:')).toBeLessThan(output.indexOf('Skills:'));
        expect(output).toContain('demo: 1.0.0 up to date');
        expect(output).toContain('last30days: up to date');
    });

    it('applies a stale lock-tracked skill in mutating mode and exits 0 once current (R3)', async () => {
        workspace();
        const home = testHome as string;
        await seedGlobalSkill('last30days', true);
        const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);
        const stderr = spyOn(process.stderr, 'write').mockImplementation(() => true);

        const checkCode = await executeUpdate(
            undefined,
            ['codex'],
            { check: true, global: true },
            {
                listBundledPlugins: () => [],
            },
        );
        expect(checkCode).toBe(1);

        const mutCode = await executeUpdate(
            undefined,
            ['codex'],
            { check: false, global: true },
            {
                listBundledPlugins: () => [],
            },
        );

        const output = drain(stdout);
        stdout.mockRestore();
        stderr.mockRestore();
        expect(mutCode).toBe(0);
        expect(output).toContain('last30days: updated');
        const check = await checkSkills(undefined, { global: true, homeDir: home, env: process.env });
        expect(check.rows[0]?.status).toBe('current');
    });

    it('reads the project skill lock under --no-global and ignores the global lock (R4)', async () => {
        const root = workspace();
        const demoSrc = join(root, 'demo-skill-src');
        mkdirSync(demoSrc, { recursive: true });
        writeFileSync(join(demoSrc, 'SKILL.md'), skillMd('demo-skill'));
        const projectAdd = await addSkills(demoSrc, { cwd: root });
        expect(projectAdd.success).toBe(true);
        await seedGlobalSkill('last30days');
        const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);

        const code = await executeUpdate(
            undefined,
            ['codex'],
            { check: true, global: false },
            {
                listBundledPlugins: () => [],
            },
        );

        const output = drain(stdout);
        stdout.mockRestore();
        expect(code).toBe(0);
        expect(output).toContain('demo-skill: up to date');
        expect(output).not.toContain('last30days');
    });

    it('emits exactly one JSON envelope for --check --json and rejects bare --json (R4)', async () => {
        workspace();
        await seedGlobalSkill('last30days', true);
        const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);

        const code = await executeUpdate(
            undefined,
            ['codex'],
            { check: true, global: true, json: true },
            {
                listBundledPlugins: () => [],
            },
        );

        const output = drain(stdout);
        stdout.mockRestore();
        const envelope = JSON.parse(output) as UpdateJsonEnvelope;
        expect(code).toBe(1);
        expect(envelope.scope).toBe('global');
        expect(envelope.check).toBe(true);
        expect(envelope.rows).toEqual([
            { kind: 'skill', name: 'last30days', status: 'stale', reason: 'Upstream hash differs' },
        ]);
        expect(envelope.summary).toEqual({ stale: 1, current: 0, unchecked: 0, legacy: 0, unavailable: 0 });
        expect(envelope.exitCode).toBe(1);

        await expect(executeUpdate(undefined, ['codex'], { check: false, global: true, json: true })).rejects.toThrow(
            '--json requires --check',
        );
    });

    it('filters skills and plugins by the [name] argument across the shared namespace (R5)', async () => {
        workspace();
        const home = testHome as string;
        await seedGlobalSkill('last30days', true);
        await seedGlobalSkill('gpt-image-2-style-library');
        const pluginRoot = writePlugin(home, 'kk', '2.0.0', '# kk\n');
        const market = writeMarket(home, 'kk', '2.0.0');
        writeManifest(home, 'kk', pluginRoot, { version: '2.0.0', locator: market });
        const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);

        const skillCode = await executeUpdate(
            'last30days',
            ['codex'],
            { check: true, global: true },
            {
                listBundledPlugins: () => [],
            },
        );
        const skillOutput = drain(stdout);
        stdout.mockClear();

        const pluginCode = await executeUpdate(
            'kk',
            ['codex'],
            { check: true, global: true, marketplacePath: market },
            {
                listBundledPlugins: () => [],
            },
        );
        const pluginOutput = drain(stdout);
        stdout.mockRestore();

        expect(skillCode).toBe(1);
        expect(skillOutput).toContain('last30days: stale: changed');
        expect(skillOutput).not.toContain('gpt-image-2-style-library');
        expect(skillOutput).not.toContain('kk:');
        expect(pluginCode).toBe(0);
        expect(pluginOutput).toContain('kk: 2.0.0 up to date');
        expect(pluginOutput).not.toContain('Skills:');
        expect(pluginOutput).not.toContain('last30days');
    });

    it('errors when a name matches both a plugin and a lock-tracked skill (R2 shared namespace)', async () => {
        workspace();
        const home = testHome as string;
        await seedGlobalSkill('demo');
        const pluginRoot = writePlugin(home, 'demo', '1.0.0', '# demo\n');
        const market = writeMarket(home, 'demo', '1.0.0');
        writeManifest(home, 'demo', pluginRoot, { version: '1.0.0', locator: market });

        await expect(
            executeUpdate('demo', ['codex'], { check: true, global: true }, { listBundledPlugins: () => [] }),
        ).rejects.toThrow('share one namespace');
    });

    it('reports a lock entry with an unhashable remote source as unavailable and exits 2 (R20)', async () => {
        workspace();
        const now = new Date().toISOString();
        writeGlobalSkillsLock({
            last30days: {
                source: 'owner/repo',
                sourceType: 'github',
                sourceUrl: 'https://github.com/owner/repo',
                skillFolderHash: 'stored-hash',
                installedAt: now,
                updatedAt: now,
            },
        });
        const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);
        const stderr = spyOn(process.stderr, 'write').mockImplementation(() => true);

        const code = await executeUpdate(
            undefined,
            ['codex'],
            { check: true, global: true },
            {
                listBundledPlugins: () => [],
                fetchFn: (async () => {
                    throw new Error('network down');
                }) as unknown as typeof fetch,
            },
        );

        const output = drain(stdout);
        stdout.mockRestore();
        stderr.mockRestore();
        expect(code).toBe(2);
        expect(output).toContain('Skills:');
        expect(output).toContain('last30days: unavailable: Failed to fetch source tree');
    });
});
