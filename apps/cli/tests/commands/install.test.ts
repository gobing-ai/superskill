import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProcessExecutor, ProcessOptions } from '@gobing-ai/ts-runtime';
import { Command } from 'commander';
import {
    copyDirectory,
    executeInstall,
    isRemoteMarketplaceLocator,
    marketplaceCacheRoot,
    parseRemoteMarketplaceLocator,
    parseTargets,
    registerInstall,
    resolveInstalledPackageRoot,
    resolvePluginRoot,
    resolveRemoteMarketplace,
    runCheckedCommand,
} from '../../src/commands/install';
import { cliVersion } from '../../src/version';

const originalCwd = process.cwd();
let tempDir: string | undefined;

function createTempWorkspace(): string {
    tempDir = mkdtempSync(join(tmpdir(), 'superskill-install-test-'));
    process.chdir(tempDir);
    return tempDir;
}

function seedFile(root: string, ...parts: string[]): void {
    const dest = join(root, ...parts);
    mkdirSync(join(dest, '..'), { recursive: true });
    writeFileSync(dest, 'seed\n');
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
        expect(optionNames).toContain('--magent');
        expect(optionNames).toContain('--marketplace-source');
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
        expect(output).toContain('[DRY-RUN] No files were written to install targets');
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
        expect(stdout.mock.calls.map((call) => String(call[0])).join('')).toContain(
            '[DRY-RUN] No files were written to install targets',
        );
        stdout.mockRestore();
    });

    it('uses JSONC plugin path, targets, and features as install defaults', async () => {
        const workspace = createTempWorkspace();
        const configuredRoot = join(workspace, 'configured-plugin');
        mkdirSync(join(configuredRoot, 'skills'), { recursive: true });
        mkdirSync(join(configuredRoot, 'commands'), { recursive: true });
        writeFileSync(join(configuredRoot, 'skills', 'a.md'), '---\nname: a\n---\n# A\n');
        writeFileSync(join(configuredRoot, 'commands', 'run.md'), '# Run\n');
        writeFileSync(
            join(workspace, 'superskill.jsonc'),
            `{
                // Defaults consumed by install
                "version": 1,
                "plugins": [{ "name": "demo", "path": "./configured-plugin" }],
                "targets": ["codex",],
                "features": ["commands",],
            }`,
        );
        const program = new Command();
        program.exitOverride();
        registerInstall(program);
        const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);

        await program.parseAsync(['node', 'superskill', 'install', 'demo', '--no-global', '--dry-run', '--verbose']);
        const output = stdout.mock.calls.map((call) => String(call[0])).join('');
        expect(output).toContain('Plugin root: ');
        expect(output).toContain('/configured-plugin');
        expect(output).toContain('Skills: 0, Commands: 1, Subagents: 0');
        expect(output).toContain('Running rulesync for codex');
        stdout.mockRestore();
    });

    it('lets explicit --targets override configured target defaults', async () => {
        const workspace = createTempWorkspace();
        createPlugin(workspace);
        writeFileSync(
            join(workspace, 'superskill.jsonc'),
            JSON.stringify({ version: 1, targets: ['codex'], features: ['skills'] }),
        );
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
            'pi',
            '--no-global',
            '--dry-run',
            '--verbose',
        ]);
        const output = stdout.mock.calls.map((call) => String(call[0])).join('');
        expect(output).toContain('Running rulesync for pi');
        expect(output).not.toContain('Running rulesync for codex');
        stdout.mockRestore();
    });
});

describe('executeInstall', () => {
    it('fails loudly when partial feature filtering is requested for native plugin targets', async () => {
        const workspace = createTempWorkspace();
        createPlugin(workspace);

        await expect(
            executeInstall('demo', ['claude'], {
                global: false,
                dryRun: true,
                verbose: false,
                features: ['skills'],
            }),
        ).rejects.toThrow(/Feature filtering is not supported by native plugin targets/);
    });

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
        // OMP no longer copies skills — reads from ~/.agents/skills/ natively
        expect(output).not.toContain('Copying to omp');
        // Dry-run: verbose message shows but actual install skipped — matches claude pattern
        expect(output).toContain('OMP: registering marketplace and installing plugin');
        expect(output).not.toContain('OMP manifest: copied plugin.json');
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
        expect(output).toContain('[DRY-RUN] No files were written to install targets');
        stdout.mockRestore();
    });

    it('installs omp natively via marketplace add + plugin install (task 0073)', async () => {
        const workspace = createTempWorkspace();
        createPlugin(workspace, 'm2');
        seedFile(workspace, '.omp', 'plugins', 'm2', 'plugin.json');
        const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);

        let rulesyncTargets: string[] = [];
        let ompInstallArgs: string[] = [];
        await executeInstall(
            'm2',
            ['omp'],
            {
                global: false,
                dryRun: false,
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
                runOmpInstall: async (registration, marketplaceName, plugin, _global) => {
                    ompInstallArgs = [registration.source, marketplaceName, plugin, String(_global)];
                },
            },
        );

        // omp is NOT passed to rulesync — it's installed natively now
        expect(rulesyncTargets).not.toContain('omp');
        // pi is NOT auto-added as a surrogate anymore
        expect(rulesyncTargets).not.toContain('pi');
        // runOmpInstall was called with the right marketplace + plugin args
        expect(ompInstallArgs[1]).toBe('superskill');
        expect(ompInstallArgs[2]).toBe('m2');
        // verbose output shows native install message
        const output = stdout.mock.calls.map((call) => String(call[0])).join('');
        expect(output).toContain('OMP: registering marketplace and installing plugin');
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
        const volArg: { args: { source: string; name: string; plugin: string } | null } = { args: null };
        process.chdir(workspace);
        seedFile(workspace, '.claude', 'plugins', 'cache', 'test-marketplace', 'market', 'plugin.json');

        const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);

        await executeInstall(
            'market',
            ['claude'],
            { marketplacePath: join(workspace, '.claude-plugin'), global: false, dryRun: false, verbose: false },
            {
                runClaudeInstall: async (registration, name, plugin) => {
                    volArg.args = { source: registration.source, name, plugin };
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
        expect(args.source).toBe(workspace);
        expect(output).toContain("Installed 'market' to 1 target(s).");
    });

    it('passes gobing-ai slug to runClaudeInstall when --marketplace-source github and name is known', async () => {
        // R8/AC3: github mode must register owner/repo, not the local marketplaceRoot.
        const workspace = createTempWorkspace();
        createPlugin(workspace, 'cc');
        mkdirSync(join(workspace, '.claude-plugin'), { recursive: true });
        writeFileSync(
            join(workspace, '.claude-plugin', 'marketplace.json'),
            JSON.stringify({
                name: 'superskill',
                plugins: [{ name: 'cc', source: './plugins/cc' }],
            }),
        );

        const volArg: { args: { source: string; mode: string; name: string; plugin: string } | null } = {
            args: null,
        };
        process.chdir(workspace);
        seedFile(workspace, '.claude', 'plugins', 'cache', 'superskill', 'cc', 'plugin.json');
        spyOn(process.stdout, 'write').mockImplementation(() => true);
        // T6/AC7: --marketplace-source is deprecated — warn on stderr, keep behavior.
        const stderr = spyOn(process.stderr, 'write').mockImplementation(() => true);

        await executeInstall(
            'cc',
            ['claude'],
            {
                marketplacePath: join(workspace, '.claude-plugin'),
                global: false,
                dryRun: false,
                verbose: false,
                marketplaceSource: 'github',
            },
            {
                runClaudeInstall: async (registration, name, plugin) => {
                    volArg.args = {
                        source: registration.source,
                        mode: registration.mode,
                        name,
                        plugin,
                    };
                },
            },
        );

        const warning = stderr.mock.calls.map((call) => String(call[0])).join('');
        expect(warning).toContain('--marketplace-source is deprecated');
        stderr.mockRestore();

        const args = volArg.args;
        expect(args).not.toBeNull();
        if (!args) throw new Error('expected captured args to be non-null');
        expect(args.plugin).toBe('cc');
        expect(args.name).toBe('superskill');
        expect(args.mode).toBe('github');
        expect(args.source).toBe('gobing-ai/superskill');
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
        const spawnCalls: { command: string; args: string[] }[] = [];
        const processExecutor: ProcessExecutor = {
            run: (options: ProcessOptions) => {
                const args = options.args ?? [];
                spawnCalls.push({ command: options.command, args });
                return Promise.resolve({
                    command: options.command,
                    args,
                    exitCode: 0,
                    stdout: '',
                    stderr: '',
                    durationMs: 0,
                });
            },
            runStreaming: () => {
                throw new Error('runStreaming is not used by install');
            },
        };

        spyOn(process.stdout, 'write').mockImplementation(() => true);

        process.chdir(workspace);
        seedFile(workspace, '.claude', 'plugins', 'cache', 'test-mkp', 'market', 'plugin.json');
        await executeInstall(
            'market',
            ['claude'],
            {
                marketplacePath: join(workspace, '.claude-plugin'),
                global: false,
                dryRun: false,
                verbose: false,
            },
            { processExecutor },
        );

        expect(spawnCalls.length).toBe(2);
        const c0 = spawnCalls[0];
        const c1 = spawnCalls[1];
        if (!c0 || !c1) throw new Error('expected 2 spawn calls');
        expect(c0.command).toBe('claude');
        expect(c0.args[0]).toBe('plugin');
        expect(c0.args[1]).toBe('marketplace');
        expect(c0.args[2]).toBe('add');
        expect(c1.command).toBe('claude');
        expect(c1.args[0]).toBe('plugin');
        expect(c1.args[1]).toBe('install');
        expect(c1.args[2]).toBe('market@test-mkp');
        expect(c1.args.slice(3)).toEqual(['--scope', 'project']);
    });

    it('installs grok natively via marketplace add + path install (task 0078)', async () => {
        const workspace = createTempWorkspace();
        createPlugin(workspace, 'm-grok');
        seedFile(workspace, '.grok', 'm-grok', 'plugin.json');
        const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);

        let rulesyncTargets: string[] = [];
        let grokInstallArgs: string[] = [];
        await executeInstall(
            'm-grok',
            ['grok'],
            {
                global: false,
                dryRun: false,
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
                        skillsPaths: ['skills/m-grok-a/SKILL.md'],
                        hooksCount: 0,
                        hooksPaths: [],
                        permissionsCount: 0,
                        permissionsPaths: [],
                        skills: [],
                        hasDiff: false,
                    };
                },
                runGrokInstall: async (registration, marketplaceName, plugin, pluginRoot) => {
                    grokInstallArgs = [registration.source, marketplaceName, plugin, pluginRoot];
                },
            },
        );

        // grok is NOT passed to rulesync — native Claude-format plugin install only
        expect(rulesyncTargets).not.toContain('grok');
        expect(grokInstallArgs[1]).toBe('superskill');
        expect(grokInstallArgs[2]).toBe('m-grok');
        expect(grokInstallArgs[3]).toContain('plugins/m-grok');
        const output = stdout.mock.calls.map((call) => String(call[0])).join('');
        expect(output).toContain('Grok: registering marketplace and installing plugin');
        // R4: no OMP dialect rewrite / hooks generation messaging for grok
        expect(output).not.toContain('OMP manifest');
        expect(output).not.toContain('translate');
        stdout.mockRestore();
    });

    it('dry-run grok echoes install intent without calling runGrokInstall', async () => {
        const workspace = createTempWorkspace();
        createPlugin(workspace, 'dry-grok');
        const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);
        let called = false;
        await executeInstall(
            'dry-grok',
            ['grok'],
            { global: false, dryRun: true, verbose: true },
            {
                runGrokInstall: async () => {
                    called = true;
                },
            },
        );
        expect(called).toBe(false);
        const output = stdout.mock.calls.map((call) => String(call[0])).join('');
        expect(output).toContain('Grok: registering marketplace and installing plugin');
        expect(output).toContain('[DRY-RUN] No files were written to install targets');
        stdout.mockRestore();
    });

    it('verbose dual-path warning when grok and a rulesync skill target share an install', async () => {
        const workspace = createTempWorkspace();
        createPlugin(workspace, 'dual');
        const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);
        await executeInstall(
            'dual',
            ['grok', 'codex'],
            { global: false, dryRun: true, verbose: true },
            {
                runRulesync: async () => ({
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
                    skillsCount: 0,
                    skillsPaths: [],
                    hooksCount: 0,
                    hooksPaths: [],
                    permissionsCount: 0,
                    permissionsPaths: [],
                    skills: [],
                    hasDiff: false,
                }),
                runGrokInstall: async () => {},
            },
        );
        const output = stdout.mock.calls.map((call) => String(call[0])).join('');
        expect(output).toContain('Warning: installing both grok');
        expect(output).toContain('/plugin:cmd');
        stdout.mockRestore();
    });
});

describe('parseTargets', () => {
    it('returns all targets when raw is undefined', () => {
        const result = parseTargets(undefined);
        expect(result).toHaveLength(9);
        expect(result).toContain('claude');
        expect(result).toContain('codex');
        expect(result).toContain('pi');
        expect(result).toContain('grok');
    });

    it('returns all targets when raw is "all"', () => {
        const result = parseTargets('all');
        expect(result).toHaveLength(9);
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

    it('filters empty comma-separated target segments', () => {
        expect(parseTargets(',codex,, pi,')).toEqual(['codex', 'pi']);
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

    it('works with grok', () => {
        expect(parseTargets('grok')).toEqual(['grok']);
        expect(parseTargets('claude,grok')).toEqual(['claude', 'grok']);
    });
});

describe('copyDirectory', () => {
    it('skips symbolic links instead of following or copying them', () => {
        const workspace = createTempWorkspace();
        const source = join(workspace, 'source');
        const destination = join(workspace, 'destination');
        mkdirSync(join(source, 'real'), { recursive: true });
        writeFileSync(join(source, 'real', 'file.txt'), 'real');
        symlinkSync(join(source, 'real'), join(source, 'linked-dir'));
        symlinkSync(join(source, 'real', 'file.txt'), join(source, 'linked-file'));

        copyDirectory(source, destination);

        expect(existsSync(join(destination, 'real', 'file.txt'))).toBe(true);
        expect(existsSync(join(destination, 'linked-dir'))).toBe(false);
        expect(existsSync(join(destination, 'linked-file'))).toBe(false);
    });
});

describe('resolvePluginRoot — marketplace name safety', () => {
    it('rejects a marketplace name that is not a single path segment', () => {
        // The name keys recursive cache deletes under $HOME; a hostile
        // `name: "../../.."` would resolve the delete target to $HOME itself.
        const root = createTempWorkspace();
        createPlugin(root, 'demo');
        mkdirSync(join(root, '.claude-plugin'), { recursive: true });
        writeFileSync(
            join(root, '.claude-plugin', 'marketplace.json'),
            JSON.stringify({ name: '../../..', plugins: [{ name: 'demo', source: './plugins/demo' }] }),
        );

        expect(() => resolvePluginRoot('demo')).toThrow('single path segment');
    });

    it('accepts a normal marketplace name', () => {
        const root = createTempWorkspace();
        createPlugin(root, 'demo');
        mkdirSync(join(root, '.claude-plugin'), { recursive: true });
        writeFileSync(
            join(root, '.claude-plugin', 'marketplace.json'),
            JSON.stringify({ name: 'my-marketplace', plugins: [{ name: 'demo', source: './plugins/demo' }] }),
        );

        const resolution = resolvePluginRoot('demo');
        expect(resolution.marketplaceName).toBe('my-marketplace');
    });

    it('gives an explicit marketplace path precedence over a configured plugin path', () => {
        const root = createTempWorkspace();
        const expected = createPlugin(root, 'demo');
        mkdirSync(join(root, '.claude-plugin'), { recursive: true });
        writeFileSync(
            join(root, '.claude-plugin', 'marketplace.json'),
            JSON.stringify({ plugins: [{ name: 'demo', source: './plugins/demo' }] }),
        );

        const resolution = resolvePluginRoot('demo', join(root, '.claude-plugin'), join(root, 'missing-config-path'));
        expect(resolution.pluginRoot).toBe(expected);
    });
});

describe('resolvePluginRoot — plugin name safety', () => {
    it('rejects path-escaping plugin names before any FS resolution', () => {
        // join('plugins', '../decoy') normalizes to 'decoy' outside plugins/.
        // Without the segment guard, a sibling dir that looks like a plugin would
        // be returned as pluginRoot from the public resolvePluginRoot API.
        const root = createTempWorkspace();
        mkdirSync(join(root, 'decoy', 'skills'), { recursive: true });
        writeFileSync(join(root, 'decoy', 'skills', 'a.md'), '---\nname: a\n---\n');

        expect(() => resolvePluginRoot('../decoy')).toThrow('single path segment');
        expect(() => resolvePluginRoot('a/b')).toThrow('single path segment');
        expect(() => resolvePluginRoot('..')).toThrow('single path segment');
    });

    it('still resolves a normal plugins/<name> layout', () => {
        const root = createTempWorkspace();
        createPlugin(root, 'demo');
        const resolution = resolvePluginRoot('demo');
        expect(resolution.pluginRoot).toContain('plugins');
        expect(resolution.pluginRoot).toContain('demo');
    });

    it('resolves a configured direct plugin directory', () => {
        const root = createTempWorkspace();
        const pluginRoot = createPlugin(root, 'configured');
        const resolution = resolvePluginRoot('configured', undefined, pluginRoot);
        expect(resolution.pluginRoot).toBe(pluginRoot);
        expect(resolution.channel).toBe('marketplace');
        expect(resolution.marketplaceLocator).toBe(pluginRoot);
        expect(resolution.upstreamVersion).toBe(cliVersion);
    });
});

describe('resolvePluginRoot — install source metadata', () => {
    it('prefers the marketplace entry version over plugin.json', () => {
        const root = createTempWorkspace();
        const pluginRoot = createPlugin(root, 'demo');
        writeFileSync(join(pluginRoot, 'plugin.json'), JSON.stringify({ name: 'demo', version: '0.1.0' }));
        mkdirSync(join(root, '.claude-plugin'), { recursive: true });
        const marketplacePath = join(root, '.claude-plugin', 'marketplace.json');
        writeFileSync(
            marketplacePath,
            JSON.stringify({ plugins: [{ name: 'demo', source: './plugins/demo', version: '9.9.9' }] }),
        );

        const resolution = resolvePluginRoot('demo', marketplacePath);
        expect(resolution.channel).toBe('marketplace');
        expect(resolution.upstreamVersion).toBe('9.9.9');
        expect(resolution.marketplaceLocator).toBe(root);
    });

    it('falls back to plugin.json version when the marketplace entry has none', () => {
        const root = createTempWorkspace();
        const pluginRoot = createPlugin(root, 'demo');
        writeFileSync(join(pluginRoot, 'plugin.json'), JSON.stringify({ name: 'demo', version: '3.1.4' }));
        mkdirSync(join(root, '.claude-plugin'), { recursive: true });
        writeFileSync(
            join(root, '.claude-plugin', 'marketplace.json'),
            JSON.stringify({ plugins: [{ name: 'demo', source: './plugins/demo' }] }),
        );

        expect(resolvePluginRoot('demo').upstreamVersion).toBe('3.1.4');
    });

    it('falls back to cliVersion when plugin.json is missing or unparseable', () => {
        const root = createTempWorkspace();
        createPlugin(root, 'demo');
        writeFileSync(join(root, 'plugins', 'demo', 'plugin.json'), '{');
        mkdirSync(join(root, '.claude-plugin'), { recursive: true });
        writeFileSync(
            join(root, '.claude-plugin', 'marketplace.json'),
            JSON.stringify({ plugins: [{ name: 'demo', source: './plugins/demo' }] }),
        );
        // Unparseable sibling is skipped; the valid .claude-plugin manifest still resolves.
        writeFileSync(join(root, 'marketplace.json'), '{not-json');

        expect(resolvePluginRoot('demo').upstreamVersion).toBe(cliVersion);
    });
});

describe('resolveInstalledPackageRoot — self-location fall-through (AC10)', () => {
    it('falls through silently for a virtual --compile root (/$bunfs) with no throw', () => {
        expect(resolveInstalledPackageRoot(['/$bunfs/root'])).toBeNull();
        expect(resolveInstalledPackageRoot(['/$bunfs/root', '/nonexistent/xyz'])).toBeNull();
    });

    it('returns an existing directory candidate', () => {
        const root = createTempWorkspace();
        expect(resolveInstalledPackageRoot([root])).toBe(root);
    });

    it('returns null when no candidate exists', () => {
        expect(resolveInstalledPackageRoot(['/nonexistent/definitely-not-here'])).toBeNull();
    });
});

describe('parseRemoteMarketplaceLocator + isRemoteMarketplaceLocator (R2 disambiguation)', () => {
    it('parses a plain GitHub URL', () => {
        expect(parseRemoteMarketplaceLocator('https://github.com/gobing-ai/superskill')).toEqual({
            owner: 'gobing-ai',
            repo: 'superskill',
            ref: 'HEAD',
        });
    });

    it('parses a /tree/<ref> URL and a /tree/<ref>/<subpath> URL', () => {
        expect(parseRemoteMarketplaceLocator('https://github.com/owner/repo/tree/main')).toEqual({
            owner: 'owner',
            repo: 'repo',
            ref: 'main',
        });
        expect(parseRemoteMarketplaceLocator('https://github.com/owner/repo/tree/main/.claude-plugin')).toEqual({
            owner: 'owner',
            repo: 'repo',
            ref: 'main',
            subdir: '.claude-plugin',
        });
    });

    it('parses owner/repo shorthand', () => {
        expect(parseRemoteMarketplaceLocator('gobing-ai/superskill')).toEqual({
            owner: 'gobing-ai',
            repo: 'superskill',
            ref: 'HEAD',
        });
    });

    it('returns null for non-GitHub input', () => {
        expect(parseRemoteMarketplaceLocator('not a locator')).toBeNull();
    });

    it('is local-first: an existing path wins, https/git@ always remote', () => {
        const root = createTempWorkspace();
        mkdirSync(join(root, 'some', 'dir'), { recursive: true });
        expect(isRemoteMarketplaceLocator('https://github.com/owner/repo')).toBe(true);
        expect(isRemoteMarketplaceLocator('git@github.com:owner/repo.git')).toBe(true);
        // Existing local dir with a slash stays local.
        expect(isRemoteMarketplaceLocator(join(root, 'some', 'dir'))).toBe(false);
        // Non-existent owner/repo shorthand → remote.
        expect(isRemoteMarketplaceLocator('nonexistent/owner-repo')).toBe(true);
        // Non-existent plain name (no slash) → not remote shorthand.
        expect(isRemoteMarketplaceLocator('no-slash-name')).toBe(false);
    });
});

describe('resolveRemoteMarketplace — cache + offline contract (R4/R9/AC6)', () => {
    const savedHomeDir = process.env.HOME_DIR;

    afterEach(() => {
        if (savedHomeDir === undefined) delete process.env.HOME_DIR;
        else process.env.HOME_DIR = savedHomeDir;
    });

    it('resolves a warm cache offline with zero network calls', async () => {
        const home = createTempWorkspace();
        process.env.HOME_DIR = home;
        const cacheRoot = join(marketplaceCacheRoot(), 'gobing-ai', 'superskill', 'HEAD');
        mkdirSync(join(cacheRoot, '.claude-plugin'), { recursive: true });
        writeFileSync(
            join(cacheRoot, '.claude-plugin', 'marketplace.json'),
            JSON.stringify({ name: 'superskill', plugins: [{ name: 'cc', source: './plugins/cc' }] }),
        );

        // A fetchFn that would throw if touched — warm cache must not call the network.
        const result = await resolveRemoteMarketplace('gobing-ai/superskill', {
            fetchFn: (async () => {
                throw new Error('network must not be reached');
            }) as unknown as typeof fetch,
        });
        expect(result.root).toBe(cacheRoot);
    });

    it('fails a cold cache with an actionable error naming the fetch target and cache path', async () => {
        const home = createTempWorkspace();
        process.env.HOME_DIR = home;
        const cacheRoot = join(marketplaceCacheRoot(), 'gobing-ai', 'superskill', 'HEAD');

        await expect(
            resolveRemoteMarketplace('gobing-ai/superskill', {
                fetchFn: (async () => {
                    throw new Error('offline');
                }) as unknown as typeof fetch,
            }),
        ).rejects.toThrow(/gobing-ai\/superskill/);
        await expect(
            resolveRemoteMarketplace('gobing-ai/superskill', {
                fetchFn: (async () => {
                    throw new Error('offline');
                }) as unknown as typeof fetch,
            }),
        ).rejects.toThrow(cacheRoot);
    });

    it('asserts every locator-derived cache path segment before any mkdir (AC6)', async () => {
        const home = createTempWorkspace();
        process.env.HOME_DIR = home;
        await expect(resolveRemoteMarketplace('gobing-ai/..')).rejects.toThrow('single path segment');
        // `..` is URL-normalized away by the URL parser and never reaches a cache path segment.
        await expect(resolveRemoteMarketplace('https://github.com/../repo')).rejects.toThrow(
            'Unrecognized --marketplace locator',
        );
    });

    // AC2 end-to-end: both locator forms must resolve the `cc` plugin with its root materialized
    // inside the cache. The parsing/disambiguation tests above cover the halves; this covers the
    // composition (locator → cold-cache materialize → resolvePluginRoot) that AC2 actually claims.
    function ccRepoFetch(): typeof fetch {
        const tree = {
            sha: 'abc',
            branch: 'main',
            tree: [
                { path: '.claude-plugin/marketplace.json', type: 'blob' as const, sha: 'm1' },
                { path: 'plugins/cc/plugin.json', type: 'blob' as const, sha: 'p1' },
                { path: 'plugins/cc/skills/a.md', type: 'blob' as const, sha: 's1' },
            ],
        };
        const contentByPath: Record<string, string> = {
            '.claude-plugin/marketplace.json': JSON.stringify({
                name: 'superskill',
                plugins: [{ name: 'cc', source: './plugins/cc' }],
            }),
            'plugins/cc/plugin.json': JSON.stringify({ name: 'cc' }),
            'plugins/cc/skills/a.md': '---\nname: a\ndescription: Skill a\n---\n# skill a\n',
        };
        return (async (url: string) => {
            if (url.includes('/git/trees/')) {
                return new Response(JSON.stringify(tree), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                });
            }
            for (const [path, content] of Object.entries(contentByPath)) {
                if (url.endsWith(`/${path}`)) return new Response(content, { status: 200 });
            }
            return new Response('not found', { status: 404 });
        }) as unknown as typeof fetch;
    }

    it.each([
        ['GitHub URL', 'https://github.com/gobing-ai/superskill'],
        ['owner/repo shorthand', 'gobing-ai/superskill'],
    ])('resolves the cc plugin into the cache from a %s (AC2)', async (_label, locator) => {
        const home = createTempWorkspace();
        process.env.HOME_DIR = home;

        const resolved = await resolveRemoteMarketplace(locator, { fetchFn: ccRepoFetch() });
        const cacheRoot = resolved.root;

        expect(cacheRoot).toBe(join(marketplaceCacheRoot(), 'gobing-ai', 'superskill', 'HEAD'));
        expect(existsSync(join(cacheRoot, '.claude-plugin', 'marketplace.json'))).toBe(true);
        expect(resolved.resolvedRef).toBe('abc');

        // The materialized cache root feeds the unchanged local resolve flow.
        const resolution = resolvePluginRoot('cc', cacheRoot);
        expect(resolution.pluginRoot).toBe(join(cacheRoot, 'plugins', 'cc'));
        expect(existsSync(join(resolution.pluginRoot, 'skills', 'a.md'))).toBe(true);
    });
});

describe('executeInstall - codex native agent dispatch (task 0111)', () => {
    beforeEach(() => {
        spyOn(process.stdout, 'write').mockImplementation(() => true);
        spyOn(process.stderr, 'write').mockImplementation(() => true);
    });
    function mockRulesyncResult() {
        return async () => ({
            rulesCount: 0,
            rulesPaths: [],
            ignoreCount: 0,
            ignorePaths: [],
            mcpCount: 0,
            mcpPaths: [],
            commandsCount: 0,
            commandsPaths: [],
            subagentsCount: 1,
            subagentsPaths: ['subagents/demo-coder.md'],
            skillsCount: 1,
            skillsPaths: ['skills/demo-a/SKILL.md'],
            hooksCount: 0,
            hooksPaths: [],
            permissionsCount: 0,
            permissionsPaths: [],
            skills: [],
            hasDiff: false,
        });
    }

    it('dispatches subagents to ~/.codex/agents/<plugin>-<agent>.toml', async () => {
        const workspace = createTempWorkspace();
        const pluginRoot = createPlugin(workspace, 'demo');
        // Add a subagent .md file to the agents/ directory
        writeFileSync(
            join(pluginRoot, 'agents', 'coder.md'),
            '---\nname: coder\ndescription: Code generation agent\n---\n\nYou are a coding assistant.',
        );
        const outRoot = join(workspace, 'out');
        mkdirSync(outRoot, { recursive: true });

        await executeInstall(
            'demo',
            ['codex'],
            { global: false, dryRun: false, verbose: true, outputRoot: outRoot },
            { runRulesync: mockRulesyncResult() },
        );

        const tomlPath = join(outRoot, '.codex', 'agents', 'demo-coder.toml');
        expect(existsSync(tomlPath)).toBe(true);
        const content = require('node:fs').readFileSync(tomlPath, 'utf-8');
        expect(content).toContain('name = "demo-coder"');
        expect(content).toContain('description = "Code generation agent"');
        expect(content).toContain('model = "');
        expect(content).toContain('model_reasoning_effort = "');
        expect(content).toContain("developer_instructions = '''");
        expect(content).toContain('You are a coding assistant.');
    });

    it('does not dispatch codex agents in dry-run mode', async () => {
        const workspace = createTempWorkspace();
        const pluginRoot = createPlugin(workspace, 'demo');
        writeFileSync(join(pluginRoot, 'agents', 'coder.md'), '---\nname: coder\ndescription: Test\n---\n\nBody.');
        const outRoot = join(workspace, 'out');
        mkdirSync(outRoot, { recursive: true });

        await executeInstall(
            'demo',
            ['codex'],
            { global: false, dryRun: true, verbose: true, outputRoot: outRoot },
            { runRulesync: mockRulesyncResult() },
        );

        expect(existsSync(join(outRoot, '.codex', 'agents', 'demo-coder.toml'))).toBe(false);
    });

    it('does not dispatch codex agents when subagents feature is disabled', async () => {
        const workspace = createTempWorkspace();
        const pluginRoot = createPlugin(workspace, 'demo');
        writeFileSync(join(pluginRoot, 'agents', 'coder.md'), '---\nname: coder\ndescription: Test\n---\n\nBody.');
        const outRoot = join(workspace, 'out');
        mkdirSync(outRoot, { recursive: true });
        seedFile(outRoot, '.agents', 'skills', 'demo-a', 'SKILL.md');

        await executeInstall(
            'demo',
            ['codex'],
            { global: false, dryRun: false, verbose: true, outputRoot: outRoot, features: ['skills'] },
            { runRulesync: mockRulesyncResult() },
        );

        expect(existsSync(join(outRoot, '.codex', 'agents', 'demo-coder.toml'))).toBe(false);
    });

    it('skips codex agent dispatch when plugin has no agents/ directory', async () => {
        const workspace = createTempWorkspace();
        const pluginRoot = createPlugin(workspace, 'demo');
        // Remove the agents/ directory created by createPlugin
        rmSync(join(pluginRoot, 'agents'), { recursive: true, force: true });
        const outRoot = join(workspace, 'out');
        mkdirSync(outRoot, { recursive: true });
        seedFile(outRoot, '.agents', 'skills', 'demo-a', 'SKILL.md');

        await executeInstall(
            'demo',
            ['codex'],
            { global: false, dryRun: false, verbose: true, outputRoot: outRoot },
            { runRulesync: mockRulesyncResult() },
        );

        expect(existsSync(join(outRoot, '.codex', 'agents'))).toBe(false);
    });

    it('overwrites stale TOML on reinstall (idempotent)', async () => {
        const workspace = createTempWorkspace();
        const pluginRoot = createPlugin(workspace, 'demo');
        const agentPath = join(pluginRoot, 'agents', 'coder.md');
        writeFileSync(agentPath, '---\nname: coder\ndescription: v1\n---\n\nFirst body.');
        const outRoot = join(workspace, 'out');
        mkdirSync(outRoot, { recursive: true });

        const install = () =>
            executeInstall(
                'demo',
                ['codex'],
                { global: false, dryRun: false, verbose: false, outputRoot: outRoot },
                { runRulesync: mockRulesyncResult() },
            );
        await install();
        writeFileSync(agentPath, '---\nname: coder\ndescription: v2\n---\n\nSecond body.');
        await install();

        const content = readFileSync(join(outRoot, '.codex', 'agents', 'demo-coder.toml'), 'utf-8');
        expect(content).toContain('description = "v2"');
        expect(content).toContain('Second body.');
        expect(content).not.toContain('First body.');
    });

    it('echoes the dispatch destination in verbose mode', async () => {
        const workspace = createTempWorkspace();
        const pluginRoot = createPlugin(workspace, 'demo');
        writeFileSync(join(pluginRoot, 'agents', 'coder.md'), '---\nname: coder\ndescription: Test\n---\n\nBody.');
        const outRoot = join(workspace, 'out');
        mkdirSync(outRoot, { recursive: true });

        const written: string[] = [];
        const spy = spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
            written.push(String(chunk));
            return true;
        });
        try {
            await executeInstall(
                'demo',
                ['codex'],
                { global: false, dryRun: false, verbose: true, outputRoot: outRoot },
                { runRulesync: mockRulesyncResult() },
            );
        } finally {
            spy.mockRestore();
        }

        expect(written.join('')).toContain(`Codex agents: dispatched to ${join(outRoot, '.codex', 'agents')}`);
    });

    it('keeps the skills floor running for codex (dual-emit)', async () => {
        const workspace = createTempWorkspace();
        const pluginRoot = createPlugin(workspace, 'demo');
        writeFileSync(join(pluginRoot, 'agents', 'coder.md'), '---\nname: coder\ndescription: Test\n---\n\nBody.');
        const outRoot = join(workspace, 'out');
        mkdirSync(outRoot, { recursive: true });

        const rulesyncTargetsSeen: string[][] = [];
        const recordingRulesync = async (targets: string[]) => {
            rulesyncTargetsSeen.push(targets);
            return mockRulesyncResult()();
        };
        await executeInstall(
            'demo',
            ['codex'],
            { global: false, dryRun: false, verbose: false, outputRoot: outRoot },
            { runRulesync: recordingRulesync as never },
        );

        // Native TOML written AND the rulesync skill pipeline still invoked for codex.
        expect(existsSync(join(outRoot, '.codex', 'agents', 'demo-coder.toml'))).toBe(true);
        expect(rulesyncTargetsSeen.flat()).toContain('codex');
    });

    it('project mode without outputRoot resolves codex agents under cwd', async () => {
        // createTempWorkspace chdirs into the temp dir, so this exercises the
        // --no-global fallback to process.cwd() without touching the real repo
        // tree or home (pitfall 0106).
        const workspace = createTempWorkspace();
        const pluginRoot = createPlugin(workspace, 'demo');
        writeFileSync(join(pluginRoot, 'agents', 'coder.md'), '---\nname: coder\ndescription: Test\n---\n\nBody.');

        await executeInstall(
            'demo',
            ['codex'],
            { global: false, dryRun: false, verbose: false },
            { runRulesync: mockRulesyncResult() },
        );

        expect(existsSync(join(workspace, '.codex', 'agents', 'demo-coder.toml'))).toBe(true);
    });
});

describe('runCheckedCommand', () => {
    it('resolves when the command exits 0', async () => {
        await runCheckedCommand(['true'], 'noop step');
    });

    it('throws with the label and exit code when the command fails', async () => {
        // A swallowed non-zero exit here is how a failed `claude plugin install`
        // still reported "Installed 'plugin' to N target(s)."
        await expect(runCheckedCommand(['false'], 'failing step')).rejects.toThrow(
            'failing step failed with exit code 1',
        );
    });
});
