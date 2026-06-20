import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import {
    copyFileSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import type { RulesyncOptions, Target } from '@gobing-ai/superskill-core';
import { executeInstall } from '../../src/commands/install';

const FIXTURE_DIR = join(import.meta.dir, '..', 'fixtures', 'plugin-min');

function copyDirSync(src: string, dest: string): void {
    mkdirSync(dest, { recursive: true });
    for (const entry of readdirSync(src)) {
        const srcPath = join(src, entry);
        const destPath = join(dest, entry);
        if (statSync(srcPath).isDirectory()) {
            copyDirSync(srcPath, destPath);
        } else {
            copyFileSync(srcPath, destPath);
        }
    }
}

describe('executeInstall', () => {
    let tmpDir: string;

    beforeEach(() => {
        spyOn(process.stdout, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
        if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
    });

    function setupPluginDir(): { pluginDir: string; marketplacePath: string } {
        tmpDir = mkdtempSync('superskill-int-');
        const pluginDir = join(tmpDir, 'plugins', 'demo');
        copyDirSync(FIXTURE_DIR, pluginDir);

        // Create marketplace.json with absolute path
        const claudePluginDir = join(tmpDir, '.claude-plugin');
        mkdirSync(claudePluginDir, { recursive: true });
        writeFileSync(
            join(claudePluginDir, 'marketplace.json'),
            JSON.stringify({ plugins: [{ name: 'demo', source: './plugins/demo' }] }),
        );

        return { pluginDir, marketplacePath: join(claudePluginDir, 'marketplace.json') };
    }

    it('resolves plugin via marketplace and maps to .rulesync/', async () => {
        const { marketplacePath } = setupPluginDir();

        let capturedOptions: RulesyncOptions | undefined;
        const mockRunRulesync = async (
            _targets: Target[],
            _features: string[],
            _inputRoot: string,
            options: RulesyncOptions,
        ) => {
            capturedOptions = options;
            return {
                rulesCount: 0,
                rulesPaths: [],
                ignoreCount: 0,
                ignorePaths: [],
                mcpCount: 0,
                mcpPaths: [],
                commandsCount: 1,
                commandsPaths: [],
                subagentsCount: 1,
                subagentsPaths: [],
                skillsCount: 2,
                skillsPaths: [],
                hooksCount: 0,
                hooksPaths: [],
                permissionsCount: 0,
                permissionsPaths: [],
                skills: [],
                hasDiff: false,
            };
        };

        await executeInstall(
            'demo',
            ['codex', 'pi'],
            { marketplacePath, global: true, dryRun: true, verbose: false },
            { runRulesync: mockRunRulesync },
        );

        // Verify .rulesync/ was mapped (in CWD, not tmpDir)
        expect(existsSync(join('.rulesync', 'skills', 'demo-a', 'SKILL.md'))).toBe(true);
        expect(existsSync(join('.rulesync', 'commands', 'demo-run.md'))).toBe(true);

        // Verify rulesync called with correct options (ADR-010)
        expect(capturedOptions).toBeDefined();
        expect(capturedOptions?.global).toBe(true);
        expect(capturedOptions?.dryRun).toBe(true);
    });

    it('passes all five features to rulesync', async () => {
        const { marketplacePath } = setupPluginDir();

        let capturedFeatures: string[] = [];
        const mockRunRulesync = async (_targets: Target[], features: string[]) => {
            capturedFeatures = features;
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
                skillsCount: 0,
                skillsPaths: [],
                hooksCount: 0,
                hooksPaths: [],
                permissionsCount: 0,
                permissionsPaths: [],
                skills: [],
                hasDiff: false,
            };
        };

        await executeInstall(
            'demo',
            ['codex'],
            { marketplacePath, global: false, dryRun: true, verbose: false },
            { runRulesync: mockRunRulesync },
        );
        expect(capturedFeatures).toEqual(['skills', 'commands', 'subagents', 'hooks', 'mcp']);
    });

    it('filters out claude/hermes/omp from rulesync call', async () => {
        const { marketplacePath } = setupPluginDir();

        const capturedTargets: Target[] = [];
        const mockRunRulesync = async (targets: Target[]) => {
            capturedTargets.push(...targets);
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
                skillsCount: 0,
                skillsPaths: [],
                hooksCount: 0,
                hooksPaths: [],
                permissionsCount: 0,
                permissionsPaths: [],
                skills: [],
                hasDiff: false,
            };
        };

        await executeInstall(
            'demo',
            ['claude', 'hermes', 'omp', 'codex'],
            { marketplacePath, global: false, dryRun: true, verbose: false },
            { runRulesync: mockRunRulesync },
        );
        expect(capturedTargets).toEqual(['codex', 'pi', 'opencode']);
    });

    it('runs pipeline transforms before rulesync', async () => {
        const { marketplacePath, pluginDir } = setupPluginDir();
        writeFileSync(join(pluginDir, 'commands', 'run.md'), 'Use rd3:dev-run\n/rd3:dev-run 0004\n');

        let capturedInputRoot = '';
        const mockRunRulesync = async (_targets: Target[], _features: string[], inputRoot: string) => {
            capturedInputRoot = inputRoot;
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
                skillsCount: 0,
                skillsPaths: [],
                hooksCount: 0,
                hooksPaths: [],
                permissionsCount: 0,
                permissionsPaths: [],
                skills: [],
                hasDiff: false,
            };
        };

        await executeInstall(
            'demo',
            ['codex'],
            { marketplacePath, global: false, dryRun: true, verbose: false },
            { runRulesync: mockRunRulesync },
        );

        expect(capturedInputRoot).toBe(join('.rulesync', '.targets', 'codex'));
        const commandContent = readFileSync(join(capturedInputRoot, '.rulesync', 'commands', 'demo-run.md'), 'utf-8');
        expect(commandContent).toContain('name: demo-run');
        expect(commandContent).toContain('Use rd3-dev-run');
        expect(commandContent).toContain('$rd3-dev-run 0004');
    });

    it('copies superskill-owned target output when not dry-run', async () => {
        const { marketplacePath } = setupPluginDir();
        const outRoot = join(tmpDir, 'out');

        await executeInstall('demo', ['hermes', 'omp'], {
            marketplacePath,
            global: false,
            dryRun: false,
            verbose: false,
            outputRoot: outRoot,
        });

        expect(existsSync(join(outRoot, '.hermes', 'skills', 'demo-a', 'SKILL.md'))).toBe(true);
        expect(existsSync(join(outRoot, '.omp', 'agent', 'skills', 'demo-b', 'SKILL.md'))).toBe(true);
    });

    it('throws when plugin not found', () => {
        const promise = executeInstall('nonexistent', ['codex'], { global: false, dryRun: true, verbose: false });
        expect(promise).rejects.toThrow("Plugin 'nonexistent' not found");
    });

    it('dry-run mode prints message', async () => {
        const { marketplacePath } = setupPluginDir();

        const mockRunRulesync = async () => ({
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
        });

        const writeCalls: string[] = [];
        const origWrite = process.stdout.write.bind(process.stdout);
        process.stdout.write = (chunk: unknown) => {
            writeCalls.push(String(chunk));
            return true;
        };

        try {
            await executeInstall(
                'demo',
                ['codex'],
                { marketplacePath, global: false, dryRun: true, verbose: false },
                { runRulesync: mockRunRulesync },
            );
        } finally {
            process.stdout.write = origWrite;
        }

        expect(writeCalls.join('')).toContain('[DRY-RUN]');
    });
});
