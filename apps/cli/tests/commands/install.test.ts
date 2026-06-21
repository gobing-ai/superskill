import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { executeInstall, parseTargets, registerInstall } from '../../src/commands/install';

const originalCwd = process.cwd();
let tempDir: string | undefined;

function createTempWorkspace(): string {
    tempDir = mkdtempSync(join(tmpdir(), 'superskill-install-test-'));
    process.chdir(tempDir);
    return tempDir;
}

function createPlugin(root: string, pluginName = 'demo'): string {
    const pluginRoot = join(root, 'plugins', pluginName);
    mkdirSync(join(pluginRoot, 'skills'), { recursive: true });
    mkdirSync(join(pluginRoot, 'commands'), { recursive: true });
    mkdirSync(join(pluginRoot, 'agents'), { recursive: true });
    writeFileSync(join(pluginRoot, 'plugin.json'), JSON.stringify({ name: pluginName }));
    writeFileSync(join(pluginRoot, 'skills', 'a.md'), '---\nname: a\ndescription: Skill a\n---\n# skill a\n');
    return pluginRoot;
}

afterEach(() => {
    process.chdir(originalCwd);
    if (tempDir) {
        rmSync(tempDir, { recursive: true, force: true });
        tempDir = undefined;
    }
});

describe('registerInstall', () => {
    it('registers an install command on a Commander program', () => {
        const program = new Command();
        registerInstall(program);
        const cmd = program.commands.find((c) => c.name() === 'install');
        expect(cmd).toBeDefined();
        expect(cmd?.description()).toContain('Install');
    });

    it('install command has <plugin> argument', () => {
        const program = new Command();
        registerInstall(program);
        const cmd = program.commands.find((c) => c.name() === 'install');
        expect(cmd?.registeredArguments.some((a) => a.name() === 'plugin')).toBe(true);
    });

    it('install command has expected options', () => {
        const program = new Command();
        registerInstall(program);
        const cmd = program.commands.find((c) => c.name() === 'install');
        const optionNames = cmd?.options.map((o) => o.long) ?? [];
        expect(optionNames).toContain('--marketplace');
        expect(optionNames).toContain('--targets');
        expect(optionNames).toContain('--no-global');
        expect(optionNames).toContain('--dry-run');
        expect(optionNames).toContain('--verbose');
    });

    it('install command option --no-global allows project-level install', () => {
        const program = new Command();
        registerInstall(program);
        const cmd = program.commands.find((c) => c.name() === 'install');
        const globalOpt = cmd?.options.find((o) => o.long === '--no-global');
        expect(globalOpt).toBeDefined();
    });

    it('parses --no-global to global=false', async () => {
        const workspace = createTempWorkspace();
        createPlugin(workspace);

        const program = new Command();
        program.exitOverride();
        registerInstall(program);
        const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);

        await program.parseAsync(['node', 'superskill', 'install', 'demo', '--no-global', '--dry-run']);

        const output = stdout.mock.calls.map((call) => String(call[0])).join('');
        // --no-global means project-level install → dry-run still works
        expect(output).toContain('[DRY-RUN] No files were written.');
        stdout.mockRestore();
    });
    it('install command option --dry-run defaults to false', () => {
        const program = new Command();
        registerInstall(program);
        const cmd = program.commands.find((c) => c.name() === 'install');
        const dryRunOpt = cmd?.options.find((o) => o.long === '--dry-run');
        expect(dryRunOpt?.defaultValue).toBe(false);
    });

    it('install command option --verbose defaults to false', () => {
        const program = new Command();
        registerInstall(program);
        const cmd = program.commands.find((c) => c.name() === 'install');
        const verboseOpt = cmd?.options.find((o) => o.long === '--verbose');
        expect(verboseOpt?.defaultValue).toBe(false);
    });

    it('executes the install action with parsed targets in dry-run mode', async () => {
        const workspace = createTempWorkspace();
        createPlugin(workspace);

        const program = new Command();
        program.exitOverride();
        registerInstall(program);
        const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);

        await program.parseAsync([
            'node',
            'superskill',
            'install',
            'demo',
            '--targets',
            'hermes,omp',
            '--no-global',
            '--dry-run',
        ]);

        expect(stdout).toHaveBeenCalled();
        expect(stdout.mock.calls.map((call) => String(call[0])).join('')).toContain('[DRY-RUN] No files were written.');
        stdout.mockRestore();
    });
});

describe('executeInstall', () => {
    it('maps a fallback plugins/<name> plugin and performs a dry-run install', async () => {
        const workspace = createTempWorkspace();
        createPlugin(workspace);
        const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);

        await executeInstall('demo', ['claude', 'hermes', 'omp'], {
            global: false,
            dryRun: true,
            verbose: true,
        });

        const output = stdout.mock.calls.map((call) => String(call[0])).join('');
        expect(output).toContain('Mapping plugin to .rulesync/ canonical layout');
        expect(output).toContain('Claude Code: registering marketplace and installing plugin');
        expect(output).toContain('Copying to Hermes');
        expect(output).toContain('Copying to omp');
        expect(output).toContain('[DRY-RUN] No files were written.');
        stdout.mockRestore();
    });

    it('resolves a marketplace plugin and runs rulesync for supported targets', async () => {
        const workspace = createTempWorkspace();
        createPlugin(workspace, 'market');
        mkdirSync(join(workspace, '.claude-plugin'), { recursive: true });
        writeFileSync(
            join(workspace, '.claude-plugin', 'marketplace.json'),
            JSON.stringify({
                plugins: [{ name: 'market', source: './plugins/market' }],
            }),
        );
        const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);

        await executeInstall(
            'market',
            ['codex'],
            {
                marketplacePath: join(workspace, '.claude-plugin'),
                global: false,
                dryRun: true,
                verbose: true,
            },
            {
                runRulesync: async () => ({
                    rulesCount: 0,
                    rulesPaths: [],
                    ignoreCount: 0,
                    ignorePaths: [],
                    mcpCount: 0,
                    mcpPaths: [],
                    commandsCount: 1,
                    commandsPaths: ['commands/market-run.md'],
                    subagentsCount: 1,
                    subagentsPaths: ['subagents/market-coder.md'],
                    skillsCount: 1,
                    skillsPaths: ['skills/market-a/SKILL.md'],
                    hooksCount: 0,
                    hooksPaths: [],
                    permissionsCount: 0,
                    permissionsPaths: [],
                    skills: [],
                    hasDiff: false,
                }),
            },
        );

        const output = stdout.mock.calls.map((call) => String(call[0])).join('');
        expect(output).toContain('Plugin root:');
        expect(output).toContain('Running rulesync for codex');
        expect(output).toContain('Skills written: 1, Commands: 1, Subagents: 1, Hooks: 0');
        expect(output).toContain('[DRY-RUN] No files were written.');
        stdout.mockRestore();
    });

    it('runs rulesync for pi when omp is requested without pi (M2 regression)', async () => {
        const workspace = createTempWorkspace();
        createPlugin(workspace, 'm2');
        const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);

        let rulesyncTargets: string[] = [];
        await executeInstall(
            'm2',
            ['omp'],
            {
                global: false,
                dryRun: true,
                verbose: true,
            },
            {
                runRulesync: async (targets) => {
                    rulesyncTargets = [...targets];
                    return {
                        rulesCount: 0,
                        rulesPaths: [],
                        ignoreCount: 0,
                        ignorePaths: [],
                        mcpCount: 0,
                        mcpPaths: [],
                        commandsCount: 0,
                        commandsPaths: [],
                        subagentsCount: 0,
                        subagentsPaths: [],
                        skillsCount: 1,
                        skillsPaths: ['skills/m2-a/SKILL.md'],
                        hooksCount: 0,
                        hooksPaths: [],
                        permissionsCount: 0,
                        permissionsPaths: [],
                        skills: [],
                        hasDiff: false,
                    };
                },
            },
        );

        // pi should be included in rulesync targets because omp was requested
        expect(rulesyncTargets).toContain('pi');
        // omp itself should NOT be passed to rulesync
        expect(rulesyncTargets).not.toContain('omp');
        stdout.mockRestore();
    });

    it('runs rulesync for opencode when hermes is requested without opencode (M2 regression)', async () => {
        const workspace = createTempWorkspace();
        createPlugin(workspace, 'm2b');
        const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);

        let rulesyncTargets: string[] = [];
        await executeInstall(
            'm2b',
            ['hermes'],
            {
                global: false,
                dryRun: true,
                verbose: true,
            },
            {
                runRulesync: async (targets) => {
                    rulesyncTargets = [...targets];
                    return {
                        rulesCount: 0,
                        rulesPaths: [],
                        ignoreCount: 0,
                        ignorePaths: [],
                        mcpCount: 0,
                        mcpPaths: [],
                        commandsCount: 0,
                        commandsPaths: [],
                        subagentsCount: 0,
                        subagentsPaths: [],
                        skillsCount: 1,
                        skillsPaths: ['skills/m2b-a/SKILL.md'],
                        hooksCount: 0,
                        hooksPaths: [],
                        permissionsCount: 0,
                        permissionsPaths: [],
                        skills: [],
                        hasDiff: false,
                    };
                },
            },
        );

        // opencode should be included in rulesync targets because hermes was requested
        expect(rulesyncTargets).toContain('opencode');
        // hermes itself should NOT be passed to rulesync
        expect(rulesyncTargets).not.toContain('hermes');
        stdout.mockRestore();
    });

    it('throws a useful error when the plugin cannot be resolved', async () => {
        const workspace = createTempWorkspace();
        createPlugin(workspace, 'available');
        mkdirSync(join(workspace, '.claude-plugin'), { recursive: true });
        writeFileSync(
            join(workspace, '.claude-plugin', 'marketplace.json'),
            JSON.stringify({
                plugins: [{ name: 'available', source: './plugins/available' }],
            }),
        );

        await expect(
            executeInstall('missing', ['hermes'], {
                marketplacePath: join(workspace, '.claude-plugin'),
                global: false,
                dryRun: true,
                verbose: false,
            }),
        ).rejects.toThrow("Plugin 'missing' not found. Available: available");
    });

    it('calls runClaudeInstall with marketplace metadata for non-dry-run claude target', async () => {
        const workspace = createTempWorkspace();
        createPlugin(workspace, 'market');
        mkdirSync(join(workspace, '.claude-plugin'), { recursive: true });
        writeFileSync(
            join(workspace, '.claude-plugin', 'marketplace.json'),
            JSON.stringify({
                name: 'test-marketplace',
                plugins: [{ name: 'market', source: './plugins/market' }],
            }),
        );

        // volCapturedArgs is mutated in the runClaudeInstall callback, so
        // TypeScript can't narrow its type through control flow. Use a
        // volatile wrapper that the callback mutates, then unwrap for checks.
        const volArg: { args: { root: string; name: string; plugin: string } | null } = { args: null };
        process.chdir(workspace);

        const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);

        await executeInstall(
            'market',
            ['claude'],
            { marketplacePath: join(workspace, '.claude-plugin'), global: false, dryRun: false, verbose: false },
            {
                runClaudeInstall: async (root, name, plugin) => {
                    volArg.args = { root, name, plugin };
                },
            },
        );

        const args = volArg.args;
        expect(args).not.toBeNull();
        // guard after .not.toBeNull() since TS can't track the assertion
        if (!args) throw new Error('expected captured args to be non-null');
        const output = stdout.mock.calls.map((call) => String(call[0])).join('');
        expect(args.plugin).toBe('market');
        expect(args.name).toBe('test-marketplace');
        expect(args.root).toBe(workspace);
        expect(output).toContain("Installed 'market' to 1 target(s).");
    });

    it('spawns claude marketplace add and install when using default runClaudeInstall', async () => {
        const workspace = createTempWorkspace();
        createPlugin(workspace, 'market');
        mkdirSync(join(workspace, '.claude-plugin'), { recursive: true });
        writeFileSync(
            join(workspace, '.claude-plugin', 'marketplace.json'),
            JSON.stringify({
                name: 'test-mkp',
                plugins: [{ name: 'market', source: './plugins/market' }],
            }),
        );
        const spawnCalls: { cmd: string[]; options: Record<string, unknown> }[] = [];
        const origSpawn = Bun.spawn;
        Bun.spawn = ((cmd: string[], options: Record<string, unknown>) => {
            spawnCalls.push({ cmd: [...cmd], options });
            return { exited: Promise.resolve(0) };
        }) as typeof Bun.spawn;

        spyOn(process.stdout, 'write').mockImplementation(() => true);

        process.chdir(workspace);
        await executeInstall('market', ['claude'], {
            marketplacePath: join(workspace, '.claude-plugin'),
            global: false,
            dryRun: false,
            verbose: false,
        });

        Bun.spawn = origSpawn;

        expect(spawnCalls.length).toBe(2);
        const c0 = spawnCalls[0];
        const c1 = spawnCalls[1];
        if (!c0 || !c1) throw new Error('expected 2 spawn calls');
        expect(c0.cmd[0]).toBe('claude');
        expect(c0.cmd[1]).toBe('plugin');
        expect(c0.cmd[2]).toBe('marketplace');
        expect(c0.cmd[3]).toBe('add');
        expect(c1.cmd[0]).toBe('claude');
        expect(c1.cmd[1]).toBe('plugin');
        expect(c1.cmd[2]).toBe('install');
        expect(c1.cmd[3]).toBe('market@test-mkp');
    });
});

describe('parseTargets', () => {
    it('returns all targets when raw is undefined', () => {
        const result = parseTargets(undefined);
        expect(result).toHaveLength(8);
        expect(result).toContain('claude');
        expect(result).toContain('codex');
        expect(result).toContain('pi');
    });

    it('returns all targets when raw is "all"', () => {
        const result = parseTargets('all');
        expect(result).toHaveLength(8);
    });

    it('parses a single target', () => {
        const result = parseTargets('pi');
        expect(result).toEqual(['pi']);
    });

    it('parses a comma-separated list', () => {
        const result = parseTargets('codex,pi,opencode');
        expect(result).toEqual(['codex', 'pi', 'opencode']);
    });

    it('trims whitespace around targets', () => {
        const result = parseTargets(' codex , pi ');
        expect(result).toEqual(['codex', 'pi']);
    });

    it('throws on unknown target', () => {
        expect(() => parseTargets('bogus')).toThrow('Unknown target');
    });

    it('throws when any target in a list is unknown', () => {
        expect(() => parseTargets('codex,bogus,pi')).toThrow('Unknown target');
    });

    it('works with antigravity targets', () => {
        const result = parseTargets('antigravity-cli,antigravity-ide');
        expect(result).toEqual(['antigravity-cli', 'antigravity-ide']);
    });

    it('works with hermes and omp', () => {
        const result = parseTargets('hermes,omp');
        expect(result).toEqual(['hermes', 'omp']);
    });
});
