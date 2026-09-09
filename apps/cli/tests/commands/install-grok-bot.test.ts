import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installManifestPath, readInstallManifest } from '@gobing-ai/superskill-core';
import { executeInstall } from '../../src/commands/install';
import { executeUpdate } from '../../src/commands/update';

let tempDir: string;
let stdoutSpy: ReturnType<typeof spyOn> | undefined;
const saved: Record<string, string | undefined> = {};

function botEnv(): { home: string; sand: string } {
    const home = join(tempDir, 'home');
    const sand = join(tempDir, 'sand');
    mkdirSync(home, { recursive: true });
    saved.HOME_DIR = process.env.HOME_DIR;
    saved.SAND_DATA = process.env.SAND_DATA;
    process.env.HOME_DIR = home;
    process.env.SAND_DATA = sand;
    return { home, sand };
}

function createPlugin(root: string): string {
    const pluginRoot = join(root, 'plugins', 'demo');
    mkdirSync(join(pluginRoot, 'skills'), { recursive: true });
    writeFileSync(join(pluginRoot, 'plugin.json'), JSON.stringify({ name: 'demo' }));
    writeFileSync(
        join(pluginRoot, 'skills', 'a.md'),
        '---\nname: a\ndescription: Skill a\n---\nUse /skill:demo-a for help.\n',
    );
    return pluginRoot;
}

afterEach(() => {
    stdoutSpy?.mockRestore();
    stdoutSpy = undefined;
    for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
        delete saved[key];
    }
    if (tempDir) {
        rmSync(tempDir, { recursive: true, force: true });
        tempDir = undefined as unknown as string;
    }
});

describe('grok-bot install (task 0128)', () => {
    let stdout: string;

    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), 'superskill-grok-bot-cli-'));
        stdout = '';
        stdoutSpy = spyOn(process.stdout, 'write').mockImplementation((chunk) => {
            stdout += String(chunk);
            return true;
        });
    });

    it('installs the flat catalog into SAND_DATA workflows with bridge pointers, markers, and a receipt', async () => {
        const { sand } = botEnv();
        const pluginRoot = createPlugin(tempDir);
        await executeInstall('demo', ['grok-bot'], {
            pluginPath: pluginRoot,
            global: true,
            dryRun: false,
            verbose: false,
            prune: false,
        });
        expect(stdout).toContain('1 skills at');
        expect(stdout).toContain(join(sand, 'workflows'));

        const pointer = readFileSync(join(sand, 'workflows', 'demo-a', 'SKILL.md'), 'utf-8');
        expect(pointer).toContain('name: demo-a');
        expect(pointer).toContain('canonical: ');
        expect(pointer).toContain('../../.superskill/grok-bot/skills/demo-a/SKILL.md');
        expect(existsSync(join(sand, 'workflows', 'demo-a', '.superskill-origin.json'))).toBe(true);

        const canonical = readFileSync(join(sand, '.superskill', 'grok-bot', 'skills', 'demo-a', 'SKILL.md'), 'utf-8');
        expect(canonical).toContain('/demo-a for help'); // dialect applied, /skill: prefix stripped
        expect(canonical).not.toContain('/skill:demo-a');

        const manifest = readInstallManifest(installManifestPath(sand, 'grok-bot', 'demo'));
        expect(manifest.grokBot).toEqual({ materialize: 'bridge' });
    });

    it('full materialization writes everything under workflows/ and no canonical tree', async () => {
        const { sand } = botEnv();
        const pluginRoot = createPlugin(tempDir);
        await executeInstall('demo', ['grok-bot'], {
            pluginPath: pluginRoot,
            global: true,
            dryRun: false,
            verbose: false,
            prune: false,
            materialize: 'full',
        });
        expect(existsSync(join(sand, 'workflows', 'demo-a', 'SKILL.md'))).toBe(true);
        expect(existsSync(join(sand, '.superskill', 'grok-bot'))).toBe(false);
        const manifest = readInstallManifest(installManifestPath(sand, 'grok-bot', 'demo'));
        expect(manifest.grokBot).toEqual({ materialize: 'full' });
    });

    it('rejects --no-global for grok-bot with a preflight error', async () => {
        botEnv();
        const pluginRoot = createPlugin(tempDir);
        await expect(
            executeInstall('demo', ['grok-bot'], {
                pluginPath: pluginRoot,
                global: false,
                dryRun: false,
                verbose: false,
                prune: false,
            }),
        ).rejects.toThrow(/host-global only/);
    });

    it('fails with an actionable error when no Sand root resolves', async () => {
        const home = join(tempDir, 'home');
        mkdirSync(home, { recursive: true });
        saved.HOME_DIR = process.env.HOME_DIR;
        saved.SAND_DATA = process.env.SAND_DATA;
        process.env.HOME_DIR = home;
        delete process.env.SAND_DATA;
        const pluginRoot = createPlugin(tempDir);
        await expect(
            executeInstall('demo', ['grok-bot'], {
                pluginPath: pluginRoot,
                global: true,
                dryRun: false,
                verbose: false,
                prune: false,
            }),
        ).rejects.toThrow(/Unable to resolve a Grok Bot Sand data root/);
    });

    it('errors when the plugin produces no skill-shaped artifacts for grok-bot', async () => {
        botEnv();
        const pluginRoot = join(tempDir, 'plugins', 'empty');
        mkdirSync(pluginRoot, { recursive: true });
        writeFileSync(join(pluginRoot, 'plugin.json'), JSON.stringify({ name: 'empty' }));
        await expect(
            executeInstall('empty', ['grok-bot'], {
                pluginPath: pluginRoot,
                global: true,
                dryRun: false,
                verbose: false,
                prune: false,
            }),
        ).rejects.toThrow(/no skill-shaped artifacts.*grok-bot/);
    });

    it('respects reinstall ownership: unmarked workflows fail instead of being overwritten', async () => {
        const { sand } = botEnv();
        mkdirSync(join(sand, 'workflows', 'demo-a'), { recursive: true });
        writeFileSync(
            join(sand, 'workflows', 'demo-a', 'SKILL.md'),
            '---\nname: demo-a\ndescription: x\n---\nbot-owned\n',
        );
        const pluginRoot = createPlugin(tempDir);
        await expect(
            executeInstall('demo', ['grok-bot'], {
                pluginPath: pluginRoot,
                global: true,
                dryRun: false,
                verbose: false,
                prune: false,
            }),
        ).rejects.toThrow(/marker/);
        expect(readFileSync(join(sand, 'workflows', 'demo-a', 'SKILL.md'), 'utf-8')).toContain('bot-owned');
    });

    it('dry-run prints the full plan without creating the Sand root, workflows, or receipt', async () => {
        const { sand } = botEnv(); // sand intentionally absent → creatable, must NOT be created
        const pluginRoot = createPlugin(tempDir);
        await executeInstall('demo', ['grok-bot'], {
            pluginPath: pluginRoot,
            global: true,
            dryRun: true,
            verbose: false,
            prune: true,
        });
        expect(stdout).toContain('grok-bot (dry-run): create workflows/demo-a (bridge)');
        expect(stdout).toContain('[DRY-RUN] No files were written');
        expect(existsSync(sand)).toBe(false);
        expect(existsSync(installManifestPath(sand, 'grok-bot', 'demo'))).toBe(false);
    });

    it('update skips the Bot manifest scan with a warning when no Sand root resolves', async () => {
        const home = join(tempDir, 'home');
        mkdirSync(home, { recursive: true });
        saved.HOME_DIR = process.env.HOME_DIR;
        saved.SAND_DATA = process.env.SAND_DATA;
        process.env.HOME_DIR = home;
        delete process.env.SAND_DATA;
        const stderrSpy = spyOn(process.stderr, 'write').mockImplementation(() => true);
        const code = await executeUpdate(
            'nothing-installed',
            ['grok-bot'],
            { check: false, global: true, outputRoot: tempDir },
            {},
        );
        expect(code).toBe(0);
        const errOut = stderrSpy.mock.calls.map((call) => String(call[0])).join('');
        stderrSpy.mockRestore();
        expect(errOut).toContain('skipping grok-bot manifest scan');
    });
});
