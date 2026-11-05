import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    realpathSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import {
    type BotRegisterHandoff,
    collectBotSkillEntries,
    getEnvVar,
    installManifestPath,
    listRegularFilesUnder,
    mapPluginToRulesync,
    readInstallManifest,
    removeEnvVar,
    setEnvVar,
} from '@gobing-ai/superskill-core';
import { executeInstall } from '../../src/commands/install';
import { executeUpdate } from '../../src/commands/update';

let tempDir: string;
let stdoutSpy: ReturnType<typeof spyOn> | undefined;
const saved: Record<string, string | undefined> = {};

function botEnv(): { home: string; sand: string } {
    const home = join(tempDir, 'home');
    const sand = join(tempDir, 'sand');
    mkdirSync(home, { recursive: true });
    saved.HOME_DIR = getEnvVar('HOME_DIR');
    saved.SAND_DATA = getEnvVar('SAND_DATA');
    setEnvVar('HOME_DIR', home);
    setEnvVar('SAND_DATA', sand);
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
        if (value === undefined) removeEnvVar(key);
        else setEnvVar(key, value);
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
        expect(stdout).toContain("Installed 'demo' to 1 target(s).");

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

    it('installs the real mixed cc catalog once with a scoped recovery bootstrap in bridge and full modes (0132)', async () => {
        const { sand } = botEnv();
        const pluginRoot = join(import.meta.dir, '../../../..', 'plugins/cc');
        const mappedRoot = join(tempDir, 'mapped');
        const mapped = mapPluginToRulesync(pluginRoot, 'cc', mappedRoot, {
            features: ['skills', 'commands', 'subagents'],
        });
        expect(mapped.skills).toBeGreaterThan(0);
        expect(mapped.commands).toBeGreaterThan(0);
        expect(mapped.subagents).toBeGreaterThan(0);
        const expectedIds = collectBotSkillEntries(join(mappedRoot, 'skills')).map((skill) => skill.id);
        for (const materialize of ['bridge', 'full'] as const) {
            await executeInstall('cc', ['grok-bot'], {
                pluginPath: pluginRoot,
                global: true,
                dryRun: false,
                verbose: false,
                prune: false,
                materialize,
            });
            const handoff = JSON.parse(
                readFileSync(join(sand, '.superskill/grok-bot/register/cc.json'), 'utf-8'),
            ) as BotRegisterHandoff;
            expect(handoff.skills.map((skill) => skill.id)).toEqual(expectedIds);
            expect(readdirSync(join(sand, 'workflows')).sort()).toEqual(expectedIds);
            expect(expectedIds.filter((id) => id === 'cc-grok-bot-register')).toHaveLength(1);
            expect(expectedIds).not.toContain('cc-cc-grok-bot-register');
            const recovery = handoff.skills.find((skill) => skill.id === 'cc-grok-bot-register');
            expect(recovery?.mode).toBe(materialize);
            expect(readFileSync(recovery?.recipePath ?? '', 'utf-8')).toContain('Host capability evidence');
            expect(stdout).toContain('with --plugin cc');
            expect(stdout).toContain('registration pending');
        }
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
        // No canonical tree in full mode; task 0130 adds only the register/ handoff artifact.
        expect(existsSync(join(sand, '.superskill', 'grok-bot', 'skills'))).toBe(false);
        const manifest = readInstallManifest(installManifestPath(sand, 'grok-bot', 'demo'));
        expect(manifest.grokBot).toEqual({ materialize: 'full' });
    });

    it('marketplace update preserves mode, metadata and arguments; full refuses host drift, bridge allows pointer rewrite (0132 R7/R9)', async () => {
        const { sand } = botEnv();
        const pluginRoot = createPlugin(tempDir);
        writeFileSync(join(pluginRoot, 'plugin.json'), JSON.stringify({ name: 'demo', version: '1.0.0' }));
        const market = join(tempDir, 'marketplace.json');
        writeFileSync(market, JSON.stringify({ name: 'local', plugins: [{ name: 'demo', source: './plugins/demo' }] }));
        const source = join(pluginRoot, 'skills/a.md');
        for (const materialize of ['bridge', 'full'] as const) {
            writeFileSync(
                source,
                '---\nname: a\ndescription: Skill a\ncustom: keep\ndisable-model-invocation: true\n---\nUse $ARGUMENTS.\n',
            );
            await executeInstall('demo', ['grok-bot'], {
                marketplacePath: market,
                global: true,
                dryRun: false,
                verbose: false,
                prune: false,
                materialize,
            });
            writeFileSync(source, `${readFileSync(source, 'utf-8')}Updated recipe.\n`);
            expect(
                await executeUpdate('demo', ['grok-bot'], { check: false, global: true, marketplacePath: market }),
            ).toBe(0);
            const handoffPath = join(sand, '.superskill/grok-bot/register/demo.json');
            const handoff = JSON.parse(readFileSync(handoffPath, 'utf-8')) as BotRegisterHandoff;
            expect(handoff.materialize).toBe(materialize);
            expect(handoff.skills[0]?.frontmatter.custom).toBe('keep');
            expect(handoff.skills[0]?.frontmatter['disable-model-invocation']).toBe(true);
            expect(readFileSync(handoff.skills[0]?.recipePath ?? '', 'utf-8')).toContain('Use $ARGUMENTS.');
            expect(stdout).toContain('update each existing skill id at most once');
            expect(stdout).toContain('cannot create it');
            const workflow = join(sand, 'workflows/demo-a/SKILL.md');
            const original = readFileSync(workflow, 'utf-8');
            const changed = `${original}\nHost annotation.\n`;
            writeFileSync(workflow, changed);
            writeFileSync(source, `${readFileSync(source, 'utf-8')}Next update.\n`);
            if (materialize === 'full') {
                // Full mode stores the recipe in workflows/; host edits must block update.
                await expect(
                    executeUpdate('demo', ['grok-bot'], { check: false, global: true, marketplacePath: market }),
                ).rejects.toThrow(/locally modified/);
                expect(readFileSync(workflow, 'utf-8')).toBe(changed);
                writeFileSync(workflow, original);
            } else {
                // Bridge pointer is disposable; host registry upserts rewrite it — update must proceed.
                expect(
                    await executeUpdate('demo', ['grok-bot'], {
                        check: false,
                        global: true,
                        marketplacePath: market,
                    }),
                ).toBe(0);
                expect(readFileSync(workflow, 'utf-8')).not.toBe(changed);
            }
        }
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
        saved.HOME_DIR = getEnvVar('HOME_DIR');
        saved.SAND_DATA = getEnvVar('SAND_DATA');
        setEnvVar('HOME_DIR', home);
        removeEnvVar('SAND_DATA');
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
        saved.HOME_DIR = getEnvVar('HOME_DIR');
        saved.SAND_DATA = getEnvVar('SAND_DATA');
        setEnvVar('HOME_DIR', home);
        removeEnvVar('SAND_DATA');
        const stderrSpy = spyOn(process.stderr, 'write').mockImplementation(() => true);
        // Task 0135 R2: an unknown explicit name is a usage error, so pass no name; an empty
        // bundled list keeps the scan offline (no npm lookups for real bundled plugins).
        const code = await executeUpdate(
            undefined,
            ['grok-bot'],
            { check: false, global: true, outputRoot: tempDir },
            {
                listBundledPlugins: () => [],
            },
        );
        expect(code).toBe(0);
        const errOut = stderrSpy.mock.calls.map((call) => String(call[0])).join('');
        stderrSpy.mockRestore();
        expect(errOut).toContain('skipping grok-bot manifest scan');
    });
});

describe('grok-bot registration handoff (task 0130)', () => {
    let stdout: string;

    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), 'superskill-grok-bot-cli-'));
        stdout = '';
        stdoutSpy = spyOn(process.stdout, 'write').mockImplementation((chunk) => {
            stdout += String(chunk);
            return true;
        });
    });

    it('install prepares a deterministic handoff file and reports it without claiming registration', async () => {
        const { sand } = botEnv();
        const pluginRoot = createPlugin(tempDir);
        await executeInstall('demo', ['grok-bot'], {
            pluginPath: pluginRoot,
            global: true,
            dryRun: false,
            verbose: false,
            prune: false,
        });
        // Root exists at emission time: paths print in canonical (realpathed) form.
        const handoffPath = join(realpathSync(sand), '.superskill', 'grok-bot', 'register', 'demo.json');
        expect(existsSync(handoffPath)).toBe(true);
        const first = readFileSync(handoffPath, 'utf-8');
        const handoff = JSON.parse(first) as {
            schemaVersion: number;
            target: string;
            plugin: string;
            materialize: string;
            skills: Array<{
                id: string;
                recipePath: string;
                body: string;
                mode: string;
                resources: Record<string, string>;
            }>;
        };
        expect(handoff.schemaVersion).toBe(1);
        expect(handoff.target).toBe('grok-bot');
        expect(handoff.plugin).toBe('demo');
        expect(handoff.materialize).toBe('bridge');
        expect(handoff.skills[0]?.id).toBe('demo-a');
        expect(handoff.skills[0]?.mode).toBe('bridge');
        // First and reinstall handoffs are byte-identical (no timestamps; realpath normalization).
        expect(handoff.skills[0]?.recipePath).toBe(
            join(realpathSync(sand), '.superskill', 'grok-bot', 'skills', 'demo-a', 'SKILL.md'),
        );
        // Bridge body reads the distinct canonical recipe; never points at the pointer workflow.
        expect(handoff.skills[0]?.body).toContain('read and follow the canonical skill file at');
        expect(handoff.skills[0]?.body).not.toContain(join(sand, 'workflows'));
        expect(stdout).toContain(`handoff prepared at ${handoffPath}`);
        expect(stdout).toContain('NOT automatic');
        expect(stdout).toMatch(/does not fill chat|unverified until observed/);
        expect(stdout).not.toContain('registered at');
        // R4: reinstall regenerates byte-identical handoff (no timestamps inside).
        await executeInstall('demo', ['grok-bot'], {
            pluginPath: pluginRoot,
            global: true,
            dryRun: false,
            verbose: false,
            prune: false,
        });
        expect(readFileSync(handoffPath, 'utf-8')).toBe(first);
    });

    it('dry-run previews the handoff and slash caveat without creating anything', async () => {
        const { sand } = botEnv(); // sand intentionally absent
        const pluginRoot = createPlugin(tempDir);
        await executeInstall('demo', ['grok-bot'], {
            pluginPath: pluginRoot,
            global: true,
            dryRun: true,
            verbose: false,
            prune: false,
        });
        expect(stdout).toContain('grok-bot (dry-run): handoff would be prepared at');
        expect(stdout).toContain(join('.superskill', 'grok-bot', 'register', 'demo.json'));
        expect(stdout).toContain('NOT automatic');
        expect(existsSync(sand)).toBe(false);
        expect(existsSync(join(sand, '.superskill', 'grok-bot', 'register', 'demo.json'))).toBe(false);
    });

    it('reinstall switches handoff records to full recipes and --prune drops removed entries', async () => {
        const { sand } = botEnv();
        const pluginRoot = createPlugin(tempDir);
        writeFileSync(join(pluginRoot, 'skills', 'b.md'), '---\nname: b\ndescription: Skill b\n---\nBody b.\n');
        await executeInstall('demo', ['grok-bot'], {
            pluginPath: pluginRoot,
            global: true,
            dryRun: false,
            verbose: false,
            prune: false,
        });
        await executeInstall('demo', ['grok-bot'], {
            pluginPath: pluginRoot,
            global: true,
            dryRun: false,
            verbose: false,
            prune: false,
            materialize: 'full',
        });
        const handoffPath = join(sand, '.superskill', 'grok-bot', 'register', 'demo.json');
        let handoff = JSON.parse(readFileSync(handoffPath, 'utf-8')) as {
            materialize: string;
            skills: Array<{ id: string; mode: string; recipePath: string }>;
        };
        expect(handoff.materialize).toBe('full');
        expect(handoff.skills.map((s) => s.id)).toEqual(['demo-a', 'demo-b']);
        expect(handoff.skills[1]?.recipePath).toBe(join(realpathSync(sand), 'workflows', 'demo-b', 'SKILL.md'));
        // --prune replace: the handoff covers this committed batch only.
        rmSync(join(pluginRoot, 'skills', 'b.md'));
        await executeInstall('demo', ['grok-bot'], {
            pluginPath: pluginRoot,
            global: true,
            dryRun: false,
            verbose: false,
            prune: true,
            materialize: 'full',
        });
        handoff = JSON.parse(readFileSync(handoffPath, 'utf-8'));
        expect(handoff.skills.map((s) => s.id)).toEqual(['demo-a']);
        expect(existsSync(join(sand, 'workflows', 'demo-b'))).toBe(false);
    });

    it('ordinary target installs never create a Bot handoff or Sand root', async () => {
        const { sand } = botEnv();
        const pluginRoot = createPlugin(tempDir);
        await executeInstall('demo', ['codex'], {
            pluginPath: pluginRoot,
            global: true,
            dryRun: false,
            verbose: false,
            prune: false,
            outputRoot: tempDir,
        });
        expect(existsSync(sand)).toBe(false);
        expect(stdout).not.toContain('handoff prepared');
    });
});

describe('grok-bot plugin materialization (task 0161)', () => {
    let stdout: string;

    const LONG_DESC = 'A bundle skill with a description long enough to stay above the lint floor.';

    function createBundlePlugin(root: string, ids: string[] = ['a'], opts: { name?: string } = {}): string {
        const pluginName = opts.name ?? 'bundler';
        const pluginRoot = join(root, 'plugins', pluginName);
        mkdirSync(join(pluginRoot, 'skills'), { recursive: true });
        writeFileSync(
            join(pluginRoot, 'plugin.json'),
            JSON.stringify({ name: pluginName, description: 'A demo bundle for Cursor plugin mode', version: '1.4.0' }),
        );
        for (const id of ids) {
            writeFileSync(
                join(pluginRoot, 'skills', `${id}.md`),
                `---\nname: ${id}\ndescription: ${LONG_DESC}\n---\nUse /skill:${pluginName}-${id}.\n`,
            );
        }
        return pluginRoot;
    }

    function bundleOpts(pluginDir: string, pluginRoot: string): Parameters<typeof executeInstall>[2] {
        return {
            pluginPath: pluginRoot,
            global: true,
            dryRun: false,
            verbose: false,
            prune: false,
            materialize: 'plugin',
            pluginDir,
        };
    }

    function readTree(root: string): Record<string, string> {
        const out: Record<string, string> = {};
        for (const rel of listRegularFilesUnder(root)) out[relative(root, rel)] = readFileSync(rel).toString('base64');
        return out;
    }

    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), 'superskill-grok-bot-plugin-'));
        stdout = '';
        stdoutSpy = spyOn(process.stdout, 'write').mockImplementation((chunk) => {
            stdout += String(chunk);
            return true;
        });
    });

    it('AC1: emits an installable Cursor-plugin bundle without touching the Sand root', async () => {
        const { sand } = botEnv(); // SAND_DATA is set but must never be created or read
        const pluginRoot = createBundlePlugin(tempDir, ['a', 'b']);
        const pluginDir = join(tempDir, 'bundle');
        await executeInstall('bundler', ['grok-bot'], bundleOpts(pluginDir, pluginRoot));

        const cursorPlugin = JSON.parse(
            readFileSync(join(pluginDir, '.cursor-plugin', 'plugin.json'), 'utf-8'),
        ) as Record<string, string>;
        expect(cursorPlugin).toEqual({
            name: 'bundler',
            description: 'A demo bundle for Cursor plugin mode',
            version: '1.4.0',
        });

        // Exactly the ids the Bot mapper stages for the same plugin.
        const mappedRoot = join(tempDir, 'mapped');
        mapPluginToRulesync(pluginRoot, 'bundler', mappedRoot, { features: ['skills', 'commands', 'subagents'] });
        const expectedIds = collectBotSkillEntries(join(mappedRoot, 'skills')).map((entry) => entry.id);
        expect(expectedIds.length).toBe(2);
        expect(readdirSync(join(pluginDir, 'skills')).sort()).toEqual(expectedIds);
        for (const id of expectedIds) {
            const marker = JSON.parse(
                readFileSync(join(pluginDir, 'skills', id, '.superskill-origin.json'), 'utf-8'),
            ) as { mode: string; canonicalPath: string | null };
            expect(marker.mode).toBe('plugin');
            expect(marker.canonicalPath).toBeNull();
            expect(readFileSync(join(pluginDir, 'skills', id, 'SKILL.md'), 'utf-8')).toContain(`/bundler-`);
        }

        const manifest = readInstallManifest(installManifestPath(pluginDir, 'grok-bot', 'bundler'));
        expect(manifest.grokBot).toEqual({ materialize: 'plugin' });
        expect(manifest.target).toBe('grok-bot');
        // No Sand root, no register handoff anywhere.
        expect(existsSync(sand)).toBe(false);
        expect(existsSync(join(sand, '.superskill'))).toBe(false);
        expect(existsSync(join(pluginDir, '.superskill', 'grok-bot', 'register'))).toBe(false);
        expect(stdout).toContain(`2 skills in Cursor plugin bundle at ${pluginDir}`);
    });

    it('AC2: flag misplacement exits 2 before any staging', async () => {
        const { Command } = await import('commander');
        const { registerInstall } = await import('../../src/commands/install');
        const cases: Array<{ argv: string[]; message: RegExp }> = [
            {
                argv: ['install', 'bundler', '--targets', 'grok-bot', '--materialize', 'plugin'],
                message: /requires --plugin-dir/,
            },
            {
                argv: ['install', 'bundler', '--targets', 'grok-bot', '--plugin-dir', join(tempDir, 'b')],
                message: /--plugin-dir applies only with --materialize plugin/,
            },
            {
                argv: ['install', 'bundler', '--targets', 'codex', '--materialize', 'plugin', '--plugin-dir', 'x'],
                message: /applies only to target 'grok-bot'/,
            },
            {
                argv: ['install', 'bundler', '--targets', 'grok-bot', '--materialize', 'sideways'],
                message: /expected 'bridge', 'full' or 'plugin'/,
            },
        ];
        const err = spyOn(process.stderr, 'write').mockImplementation(() => true);
        const exit = spyOn(process, 'exit').mockImplementation(() => undefined as never);
        try {
            for (const testCase of cases) {
                err.mockClear();
                const program = new Command();
                registerInstall(program);
                await program.parseAsync(testCase.argv, { from: 'user' });
                expect(exit).toHaveBeenCalledWith(2);
                expect(err.mock.calls.map((call) => String(call[0])).join('')).toMatch(testCase.message);
                exit.mockClear();
            }
        } finally {
            exit.mockRestore();
            err.mockRestore();
            process.exitCode = 0;
        }
        // Defensive guards on the library entry point, too.
        const pluginRoot = createBundlePlugin(tempDir);
        await expect(
            executeInstall('bundler', ['grok-bot'], {
                ...bundleOpts(join(tempDir, 'b'), pluginRoot),
                pluginDir: undefined,
            }),
        ).rejects.toThrow(/requires --plugin-dir/);
        await expect(
            executeInstall('bundler', ['grok-bot'], {
                ...bundleOpts(join(tempDir, 'b'), pluginRoot),
                materialize: 'bridge',
            }),
        ).rejects.toThrow(/--plugin-dir applies only with --materialize plugin/);
    });

    it('AC3: mcp.json is emitted with the Cursor root variable, absent when the plugin ships none', async () => {
        const { sand } = botEnv();
        const pluginRoot = createBundlePlugin(tempDir);
        writeFileSync(
            join(pluginRoot, 'mcp.json'),
            JSON.stringify({ mcpServers: { demo: { command: `\${PLUGIN_ROOT}/bin/run` } } }, null, 2),
        );
        const withMcp = join(tempDir, 'bundle-mcp');
        await executeInstall('bundler', ['grok-bot'], bundleOpts(withMcp, pluginRoot));
        const emittedMcp = readFileSync(join(withMcp, 'mcp.json'), 'utf-8');
        expect(emittedMcp).toContain(`\${CURSOR_PLUGIN_ROOT}/bin/run`);
        expect(emittedMcp).not.toContain(`\${PLUGIN_ROOT}`);
        expect(stdout).not.toContain('unsupported by the Bot runtime: mcp');

        const plainRoot = createBundlePlugin(join(tempDir, 'plain'), ['a'], { name: 'plainbundle' });
        const withoutMcp = join(tempDir, 'bundle-plain');
        await executeInstall('plainbundle', ['grok-bot'], {
            pluginPath: plainRoot,
            global: true,
            dryRun: false,
            verbose: false,
            prune: false,
            materialize: 'plugin',
            pluginDir: withoutMcp,
        });
        expect(existsSync(join(withoutMcp, 'mcp.json'))).toBe(false);
        expect(existsSync(sand)).toBe(false);
    });

    it('AC4: reinstall + --prune delete owned dirs only, and foreign/drifted content is protected', async () => {
        const { sand } = botEnv();
        const pluginRoot = createBundlePlugin(tempDir, ['a', 'b']);
        const pluginDir = join(tempDir, 'bundle');
        await executeInstall('bundler', ['grok-bot'], bundleOpts(pluginDir, pluginRoot));
        mkdirSync(join(pluginDir, 'skills', 'foreign-x'), { recursive: true });
        writeFileSync(
            join(pluginDir, 'skills', 'foreign-x', 'SKILL.md'),
            '---\nname: foreign-x\ndescription: someone else\n---\n',
        );
        const foreignBefore = readFileSync(join(pluginDir, 'skills', 'foreign-x', 'SKILL.md'), 'utf-8');

        rmSync(join(pluginRoot, 'skills', 'b.md'));
        await executeInstall('bundler', ['grok-bot'], { ...bundleOpts(pluginDir, pluginRoot), prune: true });
        expect(existsSync(join(pluginDir, 'skills', 'bundler-b'))).toBe(false);
        expect(readFileSync(join(pluginDir, 'skills', 'foreign-x', 'SKILL.md'), 'utf-8')).toBe(foreignBefore);

        // Owned drift blocks the reinstall without writing anything.
        const owned = join(pluginDir, 'skills', 'bundler-a', 'SKILL.md');
        writeFileSync(owned, `${readFileSync(owned, 'utf-8')}\noperator edit\n`);
        const drifted = readFileSync(owned, 'utf-8');
        await expect(
            executeInstall('bundler', ['grok-bot'], { ...bundleOpts(pluginDir, pluginRoot), prune: true }),
        ).rejects.toThrow(/locally modified/);
        expect(readFileSync(owned, 'utf-8')).toBe(drifted);

        // A bundle root carrying plugin.json but no superskill manifest is foreign.
        const foreignDir = join(tempDir, 'foreign-bundle');
        mkdirSync(join(foreignDir, '.cursor-plugin'), { recursive: true });
        writeFileSync(join(foreignDir, '.cursor-plugin', 'plugin.json'), '{"name":"other"}\n');
        await expect(executeInstall('bundler', ['grok-bot'], bundleOpts(foreignDir, pluginRoot))).rejects.toThrow(
            /superskill did not install/,
        );
        expect(readFileSync(join(foreignDir, '.cursor-plugin', 'plugin.json'), 'utf-8')).toBe('{"name":"other"}\n');
        expect(existsSync(join(foreignDir, 'skills'))).toBe(false);
        expect(existsSync(sand)).toBe(false);
    });

    it('AC5: a failing manifest write restores every prior bundle byte', async () => {
        botEnv();
        const pluginRoot = createBundlePlugin(tempDir, ['a']);
        const pluginDir = join(tempDir, 'bundle');
        await executeInstall('bundler', ['grok-bot'], bundleOpts(pluginDir, pluginRoot));
        const before = readTree(pluginDir);

        writeFileSync(
            join(pluginRoot, 'skills', 'a.md'),
            `---\nname: a\ndescription: ${LONG_DESC}\n---\nChanged body for the reinstall.\n`,
        );
        writeFileSync(join(pluginRoot, 'skills', 'c.md'), `---\nname: c\ndescription: ${LONG_DESC}\n---\nNew skill.\n`);
        await expect(
            executeInstall('bundler', ['grok-bot'], bundleOpts(pluginDir, pluginRoot), {
                writeInstallManifest: () => {
                    throw new Error('manifest write forced to fail');
                },
            }),
        ).rejects.toThrow(/manifest write forced to fail/);
        expect(readTree(pluginDir)).toEqual(before);
    });

    it('AC6: budget and lint run before writes and fail the install', async () => {
        botEnv();
        const bulkRoot = createBundlePlugin(tempDir, [], { name: 'bulk' });
        for (let i = 0; i < 201; i += 1) {
            const id = `s${String(i).padStart(3, '0')}`;
            writeFileSync(
                join(bulkRoot, 'skills', `${id}.md`),
                `---\nname: ${id}\ndescription: ${LONG_DESC}\n---\nBody ${id}.\n`,
            );
        }
        const bulkDir = join(tempDir, 'bulk-bundle');
        await expect(
            executeInstall('bulk', ['grok-bot'], {
                pluginPath: bulkRoot,
                global: true,
                dryRun: true,
                verbose: false,
                prune: false,
                materialize: 'plugin',
                pluginDir: bulkDir,
            }),
        ).rejects.toThrow(/201 skill entries.*200/);
        expect(existsSync(bulkDir)).toBe(false);

        const lintRoot = join(tempDir, 'plugins', 'linty');
        mkdirSync(join(lintRoot, 'skills'), { recursive: true });
        writeFileSync(join(lintRoot, 'plugin.json'), JSON.stringify({ name: 'linty' }));
        writeFileSync(
            join(lintRoot, 'skills', 'short.md'),
            `---\nname: short\ndescription: ${'s'.repeat(20)}\n---\nBody.\n`,
        );
        writeFileSync(
            join(lintRoot, 'skills', 'long.md'),
            `---\nname: long\ndescription: ${'l'.repeat(1025)}\n---\nBody.\n`,
        );
        const lintDir = join(tempDir, 'lint-bundle');
        for (const dryRun of [true, false]) {
            stdout = '';
            await expect(
                executeInstall('linty', ['grok-bot'], {
                    pluginPath: lintRoot,
                    global: true,
                    dryRun,
                    verbose: false,
                    prune: false,
                    materialize: 'plugin',
                    pluginDir: lintDir,
                }),
            ).rejects.toThrow(/lint errors/);
            const lintLines = stdout.split('\n').filter((line) => line.includes('lint '));
            expect(lintLines).toEqual([
                expect.stringMatching(
                    /grok-bot: lint error linty-long: description is 1025 chars, over the 1024-char ceiling/,
                ),
                expect.stringMatching(
                    /grok-bot: lint warning linty-short: description is 20 chars, under the 40-char floor/,
                ),
            ]);
            expect(existsSync(lintDir)).toBe(false);
        }
    });

    it('AC6: a short description alone is only a warning and still installs', async () => {
        botEnv();
        const pluginRoot = join(tempDir, 'plugins', 'quiet');
        mkdirSync(join(pluginRoot, 'skills'), { recursive: true });
        // A non-semver upstream version is not a Cursor manifest version → the key is omitted.
        writeFileSync(join(pluginRoot, 'plugin.json'), JSON.stringify({ name: 'quiet', version: 'local-build' }));
        writeFileSync(join(pluginRoot, 'skills', 'a.md'), `---\nname: a\ndescription: ${'s'.repeat(20)}\n---\nBody.\n`);
        const pluginDir = join(tempDir, 'quiet-bundle');
        await executeInstall('quiet', ['grok-bot'], {
            pluginPath: pluginRoot,
            global: true,
            dryRun: false,
            verbose: false,
            prune: false,
            materialize: 'plugin',
            pluginDir,
        });
        expect(stdout).toContain('grok-bot: lint warning quiet-a');
        expect(existsSync(join(pluginDir, 'skills', 'quiet-a', 'SKILL.md'))).toBe(true);
        // No semver in plugin.json → no version key at all.
        expect(JSON.parse(readFileSync(join(pluginDir, '.cursor-plugin', 'plugin.json'), 'utf-8'))).toEqual({
            name: 'quiet',
            description: 'superskill bundle of quiet',
        });
    });

    it('AC7: update skips a plugin-mode receipt with explicit --plugin-dir guidance', async () => {
        botEnv();
        const pluginRoot = createBundlePlugin(tempDir, ['a']);
        const market = join(tempDir, 'marketplace.json');
        writeFileSync(
            market,
            JSON.stringify({ name: 'local', plugins: [{ name: 'bundler', source: './plugins/bundler' }] }),
        );
        const pluginDir = join(tempDir, 'bundle');
        await executeInstall('bundler', ['grok-bot'], {
            marketplacePath: market,
            global: true,
            dryRun: false,
            verbose: false,
            prune: false,
            materialize: 'plugin',
            pluginDir,
        });
        expect(readInstallManifest(installManifestPath(pluginDir, 'grok-bot', 'bundler')).grokBot).toEqual({
            materialize: 'plugin',
        });
        // Upstream drifts so the row is stale; the plugin-mode receipt must still be skipped.
        writeFileSync(
            join(pluginRoot, 'skills', 'b.md'),
            `---\nname: b\ndescription: ${LONG_DESC}\n---\nNew skill upstream.\n`,
        );
        setEnvVar('SAND_DATA', pluginDir);
        const err = spyOn(process.stderr, 'write').mockImplementation(() => true);
        try {
            const code = await executeUpdate(
                undefined,
                ['grok-bot'],
                { check: false, global: true, marketplacePath: market },
                { listBundledPlugins: () => [] },
            );
            expect(code).toBe(0);
            const errOut = err.mock.calls.map((call) => String(call[0])).join('');
            expect(errOut).toContain(
                'superskill install bundler --targets grok-bot --materialize plugin --plugin-dir <dir>',
            );
            expect(stdout).not.toContain('Updating bundler…');
        } finally {
            err.mockRestore();
        }
        // Nothing was rewritten by the skipped reinstall.
        expect(readdirSync(join(pluginDir, 'skills'))).toEqual(['bundler-a']);
    });
});
