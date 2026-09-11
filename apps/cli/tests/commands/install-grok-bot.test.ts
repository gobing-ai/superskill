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
import { join } from 'node:path';
import {
    type BotRegisterHandoff,
    collectBotSkillEntries,
    installManifestPath,
    mapPluginToRulesync,
    readInstallManifest,
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
            expect(stdout).toContain('register each listed skill id at most once');
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
