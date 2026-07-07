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

    it('passes skills feature to rulesync; hooks pass is skipped for a hookless plugin (task 0151 two-pass split)', async () => {
        const { marketplacePath } = setupPluginDir();

        const allCapturedFeatures: string[][] = [];
        const mockRunRulesync = async (_targets: Target[], features: string[]) => {
            allCapturedFeatures.push([...features]);
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
        // plugin-min has no mcp.json (mcp omitted) and no hooks.json (hooks pass skipped). Hooks are
        // now requested in a SEPARATE pass gated on mapResult.hooks, so a hookless plugin makes a
        // single skills-only pass — requesting 'hooks'/'mcp' it doesn't have would make rulesync log
        // a per-target ENOENT for the missing .rulesync/{hooks,mcp}.json.
        expect(allCapturedFeatures).toEqual([['skills']]);
        expect(allCapturedFeatures.some((f) => f.includes('hooks'))).toBe(false);
    });

    it("includes 'mcp' feature only when the plugin actually ships an mcp.json", async () => {
        const { marketplacePath, pluginDir } = setupPluginDir();
        // Add an mcp.json so the mapper reports mcp: true
        writeFileSync(join(pluginDir, 'mcp.json'), JSON.stringify({ mcpServers: {} }));

        const allCapturedFeatures: string[][] = [];
        const mockRunRulesync = async (_targets: Target[], features: string[]) => {
            allCapturedFeatures.push([...features]);
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
        // mcp present (no hooks.json) → main pass carries skills+mcp; still no hooks pass.
        expect(allCapturedFeatures).toEqual([['skills', 'mcp']]);
        expect(allCapturedFeatures.some((f) => f.includes('hooks'))).toBe(false);
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
        // OMP reads from .agents/skills/ natively (unified with codex/pi)
        expect(existsSync(join(outRoot, '.agents', 'skills', 'demo-b', 'SKILL.md'))).toBe(true);
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
    it('R3 (task 0072): antigravity-cli global install lands at ~/.gemini/antigravity-cli/skills/', async () => {
        const { marketplacePath } = setupPluginDir();
        // Isolate rulesync's getHomeDirectory() from the real $HOME so global writes land in
        // a sandbox; rulesync reads process.env.HOME_DIR first, falling back to os.homedir().
        const fakeHome = join(tmpDir, 'fake-home-agy');
        mkdirSync(fakeHome, { recursive: true });
        const origHomeDir = process.env.HOME_DIR;
        process.env.HOME_DIR = fakeHome;
        try {
            await executeInstall('demo', ['antigravity-cli'], {
                marketplacePath,
                global: true,
                dryRun: false,
                verbose: false,
            });
        } finally {
            if (origHomeDir === undefined) delete process.env.HOME_DIR;
            else process.env.HOME_DIR = origHomeDir;
        }

        // antigravity-cli global reldir: .gemini/antigravity-cli/skills (verified against
        // rulesync 8.28.1 vendors/rulesync/src/features/skills/antigravity-cli-skill.ts).
        expect(existsSync(join(fakeHome, '.gemini', 'antigravity-cli', 'skills', 'demo-a', 'SKILL.md'))).toBe(true);
        expect(existsSync(join(fakeHome, '.gemini', 'antigravity-cli', 'skills', 'demo-b', 'SKILL.md'))).toBe(true);
        // Nothing under ~/.agents/skills/ for the antigravity target (that path is codex/pi/omp).
        expect(existsSync(join(fakeHome, '.agents', 'skills', 'demo-a'))).toBe(false);
    });

    it('R3 (task 0072): antigravity-ide global install lands at ~/.gemini/config/skills/', async () => {
        const { marketplacePath } = setupPluginDir();
        const fakeHome = join(tmpDir, 'fake-home-ide');
        mkdirSync(fakeHome, { recursive: true });
        const origHomeDir = process.env.HOME_DIR;
        process.env.HOME_DIR = fakeHome;
        try {
            await executeInstall('demo', ['antigravity-ide'], {
                marketplacePath,
                global: true,
                dryRun: false,
                verbose: false,
            });
        } finally {
            if (origHomeDir === undefined) delete process.env.HOME_DIR;
            else process.env.HOME_DIR = origHomeDir;
        }

        // antigravity-ide global reldir: .gemini/config/skills (verified against
        // vendors/rulesync/src/features/skills/antigravity-ide-skill.ts).
        expect(existsSync(join(fakeHome, '.gemini', 'config', 'skills', 'demo-a', 'SKILL.md'))).toBe(true);
        expect(existsSync(join(fakeHome, '.gemini', 'config', 'skills', 'demo-b', 'SKILL.md'))).toBe(true);
        expect(existsSync(join(fakeHome, '.agents', 'skills', 'demo-a'))).toBe(false);
    });

    it('R3 (task 0072): antigravity-cli project install lands at <cwd>/.agents/skills/', async () => {
        const { marketplacePath } = setupPluginDir();
        const outRoot = join(tmpDir, 'r3-antigravity-proj');

        // Project mode: antigravity shares codexcli's .agents/skills reldir
        // (ANTIGRAVITY_SKILLS_DIR_PATH in antigravity-shared-skill.ts).
        await executeInstall('demo', ['antigravity-cli'], {
            marketplacePath,
            global: false,
            dryRun: false,
            verbose: false,
            outputRoot: outRoot,
        });
        expect(existsSync(join(outRoot, '.agents', 'skills', 'demo-a', 'SKILL.md'))).toBe(true);
    });

    it('R3 (task 0072): codex/pi still land at ~/.agents/skills/ (regression guard)', async () => {
        const { marketplacePath } = setupPluginDir();
        const fakeHome = join(tmpDir, 'fake-home-codex');
        mkdirSync(fakeHome, { recursive: true });
        const origHomeDir = process.env.HOME_DIR;
        process.env.HOME_DIR = fakeHome;
        try {
            await executeInstall('demo', ['codex', 'pi'], {
                marketplacePath,
                global: true,
                dryRun: false,
                verbose: false,
            });
        } finally {
            if (origHomeDir === undefined) delete process.env.HOME_DIR;
            else process.env.HOME_DIR = origHomeDir;
        }

        // codex/pi share codexcli → global reldir .agents/skills. (omp is a surrogate of pi
        // and reads from the same shared dir, not tested here.)
        expect(existsSync(join(fakeHome, '.agents', 'skills', 'demo-a', 'SKILL.md'))).toBe(true);
        expect(existsSync(join(fakeHome, '.agents', 'skills', 'demo-b', 'SKILL.md'))).toBe(true);
    });
});
