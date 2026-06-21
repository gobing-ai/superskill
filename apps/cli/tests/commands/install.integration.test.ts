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

        // Verify .rulesync/skills/ was mapped (commands and agents now adapted as skills)
        expect(existsSync(join('.rulesync', 'skills', 'demo-a', 'SKILL.md'))).toBe(true);
        expect(existsSync(join('.rulesync', 'skills', 'demo-run', 'SKILL.md'))).toBe(true);
        expect(existsSync(join('.rulesync', 'skills', 'demo-coder', 'SKILL.md'))).toBe(true);
        // No separate commands/ or subagents/ dirs anymore
        expect(existsSync(join('.rulesync', 'commands'))).toBe(false);
        expect(existsSync(join('.rulesync', 'subagents'))).toBe(false);

        // Verify rulesync called with correct options (ADR-010)
        expect(capturedOptions).toBeDefined();
        expect(capturedOptions?.global).toBe(true);
        expect(capturedOptions?.dryRun).toBe(true);
    });

    it('passes skills/hooks/mcp features to rulesync (commands and subagents downgraded to skills)', async () => {
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
        // plugin-min has no mcp.json, so 'mcp' is omitted — requesting it would make
        // rulesync log a per-target ENOENT for the missing .rulesync/mcp.json.
        expect(capturedFeatures).toEqual(['skills', 'hooks']);
    });

    it("includes 'mcp' feature only when the plugin actually ships an mcp.json", async () => {
        const { marketplacePath, pluginDir } = setupPluginDir();
        // Add an mcp.json so the mapper reports mcp: true
        writeFileSync(join(pluginDir, 'mcp.json'), JSON.stringify({ mcpServers: {} }));

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
        expect(capturedFeatures).toEqual(['skills', 'hooks', 'mcp']);
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

    it('runs pipeline transforms before rulesync (commands adapted as skills)', async () => {
        const { marketplacePath, pluginDir } = setupPluginDir();
        // Use demo: prefix so the scoped rewriter catches it (plugin = 'demo')
        writeFileSync(join(pluginDir, 'commands', 'run.md'), 'Use demo:dev-run\n/demo:dev-run 0004\n');

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
        // Command is now adapted as a skill directory, not a flat .md in commands/
        const skillContent = readFileSync(
            join(capturedInputRoot, '.rulesync', 'skills', 'demo-run', 'SKILL.md'),
            'utf-8',
        );
        expect(skillContent).toContain('name: demo-run');
        expect(skillContent).toContain('disable-model-invocation: true');
        // demo:dev-run → demo-dev-run (scoped to plugin prefix)
        expect(skillContent).toContain('Use demo-dev-run');
        // Slash command translation: /demo:dev-run → $demo-dev-run (codex dialect).
        // Slash translation runs in transformMarkdownDirectory; the mapper must
        // leave the `:` intact (not pre-rewrite it) so the translator can match.
        expect(skillContent).toContain('$demo-dev-run 0004');
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

    it('R1: rulesync skills land under a custom outputRoot, not $HOME/cwd', async () => {
        const { marketplacePath } = setupPluginDir();
        const outRoot = join(tmpDir, 'r1-out');

        // Real rulesync (no mock) — project mode, codex target. Plugin 'demo'
        // ships skills/demo-a and demo-b (from the plugin-min fixture).
        await executeInstall('demo', ['codex'], {
            marketplacePath,
            global: false,
            dryRun: false,
            verbose: false,
            outputRoot: outRoot,
        });

        // Skills MUST land under the custom outputRoot (R1 acceptance)
        // codex project-mode reldir is .agents/skills (verified empirically)
        expect(existsSync(join(outRoot, '.agents', 'skills', 'demo-a', 'SKILL.md'))).toBe(true);
        expect(existsSync(join(outRoot, '.agents', 'skills', 'demo-b', 'SKILL.md'))).toBe(true);

        // Anti-pollution: nothing written to the real $HOME or cwd
        // (tmpDir is isolated; outRoot is under tmpDir, so this proves no leak outside outRoot)
        expect(existsSync(join(tmpDir, '.agents'))).toBe(false);
    });

    it('R2: project-mode install from a clean cwd does not crash with ENOENT', async () => {
        const { marketplacePath } = setupPluginDir();
        const outRoot = join(tmpDir, 'r2-clean'); // no pre-existing .agents/skills/

        // Before R2, this threw: ENOENT mkdir '.agents/skills/...' because rulesync
        // mkdirs the leaf non-recursively and the parent didn't exist in project mode.
        // executeInstall now pre-creates per-target parents via TARGET_SKILLS_RELDIR.
        await expect(
            executeInstall('demo', ['codex'], {
                marketplacePath,
                global: false,
                dryRun: false,
                verbose: false,
                outputRoot: outRoot,
            }),
        ).resolves.toBeUndefined();

        // Skill exists — the install actually completed, not just survived
        expect(existsSync(join(outRoot, '.agents', 'skills', 'demo-a', 'SKILL.md'))).toBe(true);
    });
});
