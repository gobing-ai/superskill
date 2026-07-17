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
        expect(capturedTargets).toEqual(['codex', 'opencode']);
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

        await executeInstall(
            'demo',
            ['hermes', 'omp'],
            {
                marketplacePath,
                global: false,
                dryRun: false,
                verbose: false,
                outputRoot: outRoot,
            },
            {
                // OMP native install spawns the `omp` binary — mock it so the test stays hermetic.
                // resolveOmpInstallPath returns undefined (no registry written) so post-install is skipped.
                runOmpInstall: async () => {},
            },
        );

        expect(existsSync(join(outRoot, '.hermes', 'skills', 'demo-a', 'SKILL.md'))).toBe(true);
        // OMP skills are now installed natively via the omp CLI, not copied to .agents/skills/
        expect(existsSync(join(outRoot, '.agents', 'skills', 'demo-b', 'SKILL.md'))).toBe(false);
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

        // codex/pi share codexcli → global reldir .agents/skills. (omp no longer uses this
        // path — it's installed natively via the omp CLI as of task 0073.)
        expect(existsSync(join(fakeHome, '.agents', 'skills', 'demo-a', 'SKILL.md'))).toBe(true);
        expect(existsSync(join(fakeHome, '.agents', 'skills', 'demo-b', 'SKILL.md'))).toBe(true);
    });

    it('verbose install does not double-echo hook-emit results (pi/hermes each printed once)', async () => {
        // Regression test for the bug where the per-target verbose echo at the dispatch site
        // AND the post-loop unconditional echo at install.ts:296-299 both fired in --verbose
        // mode, producing duplicated pi/hermes lines. The fix gates the post-loop echo on
        // `!options.verbose`; verbose mode already echoes each result at the dispatch site.
        // (OMP no longer goes through hook-emit — it's installed natively as of task 0073.)
        const { marketplacePath } = setupPluginDir();
        const fakeHome = join(tmpDir, 'fake-home-verbose');
        mkdirSync(fakeHome, { recursive: true });
        const origHomeDir = process.env.HOME_DIR;
        process.env.HOME_DIR = fakeHome;

        // Capture stdout into a string buffer.
        const chunks: string[] = [];
        const origWrite = process.stdout.write.bind(process.stdout);
        process.stdout.write = (chunk: unknown) => {
            chunks.push(typeof chunk === 'string' ? chunk : (chunk as Buffer).toString('utf-8'));
            return true;
        };

        try {
            await executeInstall(
                'demo',
                ['pi', 'omp', 'hermes'],
                {
                    marketplacePath,
                    global: true,
                    dryRun: false,
                    verbose: true,
                },
                {
                    // OMP native install spawns the `omp` binary — mock for hermetic testing.
                    runOmpInstall: async () => {},
                },
            );
        } finally {
            process.stdout.write = origWrite;
            if (origHomeDir === undefined) delete process.env.HOME_DIR;
            else process.env.HOME_DIR = origHomeDir;
        }
        const output = chunks.join('');
        // Two semantically distinct kinds of line both start with the per-target prefix in
        // verbose mode:
        //   1. The per-target RULESYNC line (added in this revision): "<target>: N skill(s) at <path>"
        //   2. The HOOK-EMIT line at the dispatch site: "<target>: N hook(s) emitted" or the
        //      "no hooks" variant — gated to fire once per target by the post-loop echo
        //      suppression at install.ts (R-suppress).
        // Both should appear exactly once in verbose mode. We assert each independently.
        const piRulesyncLines = output.match(/^\s*pi: \d+ skill\(s\) at .+$/gm) ?? [];
        const piHookLines =
            output.match(/^\s*pi: (?:no hooks in plugin|no mappable hooks|.+? hook\(s\) emitted)/gm) ?? [];
        const hermesRulesyncLines = output.match(/^\s*hermes: \d+ skill\(s\) at .+$/gm) ?? [];
        const hermesHookLines =
            output.match(/^\s*hermes: (?:no hooks in plugin|no hooks to install|.+? hook\(s\) copied)/gm) ?? [];
        expect(piRulesyncLines).toHaveLength(1);
        expect(piHookLines).toHaveLength(1);
        expect(hermesRulesyncLines).toHaveLength(0);
        expect(hermesHookLines).toHaveLength(1);
        // OMP is now installed natively — verbose output shows the native install message,
        // not a hook-emit line.
        expect(output).toContain('OMP: registering marketplace and installing plugin');
        // Sanity: the per-target verbose copy-marker is present (verbose is on, so the
        // dispatch-site "Copying to Hermes" line is emitted — was not over-suppressed).
        expect(output).toContain('Copying to Hermes');
    });

    it('non-verbose install still surfaces hook-emit results for pi/hermes (omp is silent)', async () => {
        // Companion test: when --verbose is off, the post-loop echo at install.ts is
        // the ONLY place hook results surface (gated on `!options.verbose`). Pi and hermes
        // each push to hookEmitResults and appear once via the post-loop echo.
        // OMP is installed natively as of task 0073 — its messages are verbose-only, so
        // in non-verbose mode it produces no output at all.
        const { marketplacePath } = setupPluginDir();
        const fakeHome = join(tmpDir, 'fake-home-quiet');
        mkdirSync(fakeHome, { recursive: true });
        const origHomeDir = process.env.HOME_DIR;
        process.env.HOME_DIR = fakeHome;

        const chunks: string[] = [];
        const origWrite = process.stdout.write.bind(process.stdout);
        process.stdout.write = (chunk: unknown) => {
            chunks.push(typeof chunk === 'string' ? chunk : (chunk as Buffer).toString('utf-8'));
            return true;
        };

        try {
            await executeInstall(
                'demo',
                ['pi', 'omp', 'hermes'],
                {
                    marketplacePath,
                    global: true,
                    dryRun: false,
                    verbose: false,
                },
                {
                    // OMP native install spawns the `omp` binary — mock for hermetic testing.
                    runOmpInstall: async () => {},
                },
            );
        } finally {
            process.stdout.write = origWrite;
            if (origHomeDir === undefined) delete process.env.HOME_DIR;
            else process.env.HOME_DIR = origHomeDir;
        }

        const output = chunks.join('');
        // Pi and hermes each appear once via the post-loop echo (non-verbose path).
        const piLines = output.match(/^\s*pi: .*$/gm) ?? [];
        const hermesLines = output.match(/^\s*hermes: .*$/gm) ?? [];
        expect(piLines).toHaveLength(1);
        expect(hermesLines).toHaveLength(1);
        // OMP produces no output in non-verbose mode (all its messages are verbose-only).
        const ompLines = output.match(/^\s*[Oo][Mm][Pp]: .*$/gm) ?? [];
        expect(ompLines).toHaveLength(0);
        // And the per-target verbose copy-marker is NOT present (verbose is off).
        expect(output).not.toContain('Copying to Hermes');
    });

    it('verbose install reports actual on-disk skill count, not the rulesync diff count', async () => {
        // Regression test: a re-install with no diff used to print "0 skill(s) at <path>"
        // (because rulesync returns 0 in hasDiff=false cases), which is misleading. The
        // fix walks the target's skills dir after runRulesync and reports the actual
        // count of directories containing SKILL.md. In dry-run, falls back to the
        // diff count (the dir doesn't exist yet).
        const { marketplacePath } = setupPluginDir();
        const fakeHome = join(tmpDir, 'fake-home-actualcount');
        mkdirSync(fakeHome, { recursive: true });
        const origHomeDir = process.env.HOME_DIR;
        process.env.HOME_DIR = fakeHome;

        const chunks: string[] = [];
        const origWrite = process.stdout.write.bind(process.stdout);
        process.stdout.write = (chunk: unknown) => {
            chunks.push(typeof chunk === 'string' ? chunk : (chunk as Buffer).toString('utf-8'));
            return true;
        };

        try {
            // First install — populates the dir.
            await executeInstall('demo', ['codex'], {
                marketplacePath,
                global: true,
                dryRun: false,
                verbose: true,
            });
            // Second install — re-run; rulesync returns 0 diff but the dir still has skills.
            await executeInstall('demo', ['codex'], {
                marketplacePath,
                global: true,
                dryRun: false,
                verbose: true,
            });
        } finally {
            process.stdout.write = origWrite;
            if (origHomeDir === undefined) delete process.env.HOME_DIR;
            else process.env.HOME_DIR = origHomeDir;
        }

        const output = chunks.join('');
        // Both runs print "<target>: N skill(s) at <path>" — the count must be the same
        // (the actual on-disk count, not a diff that decays to 0 on the second run).
        const codexLines = output.match(/^\s*codex: \d+ skill\(s\) at .+$/gm) ?? [];
        expect(codexLines).toHaveLength(2);
        // And both lines must report the SAME count — the actual inventory, not a
        // transient diff. The fixture plugin-min ships 2 skills (demo-a, demo-b), but
        // after the first run + cleanup, we expect at least 2 (the two source skills
        // were adapted). Filter to digits and assert non-zero + equal.
        const counts = codexLines.map((line) => Number(line.match(/codex: (\d+)/)?.[1] ?? '0'));
        expect(counts[0]).toBeGreaterThan(0);
        expect(counts[1]).toBe(counts[0]);
    });
    // ─── Task 0081: magents/ (main-agent config) install scenarios ───
    // The plugin-min fixture ships one magent: my-agent/ (common AGENTS.md +
    // AGENTS.claude.md override). Multi-magent tests (AC6/AC8) add foo/ and
    // bar/ dynamically. These cover the eight acceptance scenarios in docs/tasks/0081.

    it('0081 AC1: plugin without magents installs normally (zero count, no extra files)', async () => {
        const { marketplacePath, pluginDir } = setupPluginDir();
        // Strip the magents/ dir so this plugin has none
        rmSync(join(pluginDir, 'magents'), { recursive: true, force: true });
        const outRoot = join(tmpDir, 'ac1-out');

        await executeInstall('demo', ['pi'], {
            marketplacePath,
            global: false,
            dryRun: false,
            verbose: false,
            outputRoot: outRoot,
        });

        // No magent output files at the project root
        expect(existsSync(join(outRoot, 'AGENTS.md'))).toBe(false);
    });

    it('marketplace-only bare magent is not auto-installed without --magent', async () => {
        // Simulates monorepo magents/ next to plugins when installing a plugin that
        // has no magents of its own (e.g. install sp while team-stark-children exists).
        const { marketplacePath, pluginDir } = setupPluginDir();
        rmSync(join(pluginDir, 'magents'), { recursive: true, force: true });
        // marketplacePath is …/.claude-plugin/marketplace.json → root is two levels up
        const marketplaceRoot = join(marketplacePath, '..', '..');
        const bare = join(marketplaceRoot, 'magents', 'team-stark-children');
        mkdirSync(bare, { recursive: true });
        writeFileSync(join(bare, 'AGENTS.md'), '# bare marketplace persona\n');
        const outRoot = join(tmpDir, 'bare-magent-out');
        const captured: string[] = [];
        const spy = spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
            captured.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
            return true;
        });

        await executeInstall('demo', ['pi'], {
            marketplacePath,
            global: false,
            dryRun: false,
            verbose: true,
            outputRoot: outRoot,
        });
        spy.mockRestore();

        expect(existsSync(join(outRoot, 'AGENTS.md'))).toBe(false);
        expect(captured.join('')).toMatch(/pass --magent/);
    });

    it('0081 AC2: common AGENTS.md is selected as fallback for pi', async () => {
        const { marketplacePath } = setupPluginDir();
        const outRoot = join(tmpDir, 'ac2-out');

        await executeInstall('demo', ['pi'], {
            marketplacePath,
            global: false,
            dryRun: false,
            verbose: false,
            outputRoot: outRoot,
        });

        // The single magent (my-agent) auto-selects; pi consumes AGENTS.md as fallback.
        // Output filename is AGENTS.md for every non-claude target.
        const dest = join(outRoot, 'AGENTS.md');
        expect(existsSync(dest)).toBe(true);
        const body = readFileSync(dest, 'utf-8');
        // Common body identifies itself; the claude override must NOT have been picked.
        expect(body).toContain('Universal main-agent config');
        expect(body).not.toContain('Claude-tuned');
    });

    it('0081 AC3: target-specific override wins for claude (AGENTS.claude.md over AGENTS.md)', async () => {
        const { marketplacePath } = setupPluginDir();
        const outRoot = join(tmpDir, 'ac3-out');
        const captured: string[] = [];
        const spy = spyOn(process.stdout, 'write').mockImplementation((data) => {
            captured.push(typeof data === 'string' ? data : data.toString());
            return true;
        });

        // Dry-run + verbose: claude's native installer isn't invoked, but the magent
        // selection still runs and the verbose output records which source was chosen.
        await executeInstall('demo', ['claude'], {
            marketplacePath,
            global: false,
            dryRun: true,
            verbose: true,
            outputRoot: outRoot,
        });
        spy.mockRestore();

        const out = captured.join('');
        // The AGENTS.claude.md override was selected (not the common AGENTS.md) and
        // the destination is CLAUDE.md (claude's output filename policy).
        expect(out).toMatch(/claude: magent demo-my-agent → .*CLAUDE\.md \(from .*AGENTS\.claude\.md\)/);
        // Nothing written in dry-run
        expect(existsSync(join(outRoot, 'CLAUDE.md'))).toBe(false);
    });

    it('0081 AC4: claude special naming — CLAUDE.claude.md fixture also resolves', async () => {
        const { marketplacePath, pluginDir } = setupPluginDir();
        // Replace the override with the legacy CLAUDE.claude.md name to exercise
        // the claude candidate list's CLAUDE.claude.md entry.
        rmSync(join(pluginDir, 'magents', 'my-agent', 'AGENTS.claude.md'), { force: true });
        writeFileSync(join(pluginDir, 'magents', 'my-agent', 'CLAUDE.claude.md'), '# Legacy variant\n');
        const outRoot = join(tmpDir, 'ac4-out');
        const captured: string[] = [];
        const spy = spyOn(process.stdout, 'write').mockImplementation((data) => {
            captured.push(typeof data === 'string' ? data : data.toString());
            return true;
        });

        await executeInstall('demo', ['claude'], {
            marketplacePath,
            global: false,
            dryRun: true,
            verbose: true,
            outputRoot: outRoot,
        });
        spy.mockRestore();

        const out = captured.join('');
        expect(out).toMatch(/from .*CLAUDE\.claude\.md/);
    });

    it('0081 AC5: shimming rewrites plugin-scoped skill references in the installed magent', async () => {
        const { marketplacePath } = setupPluginDir();
        const outRoot = join(tmpDir, 'ac5-out');

        await executeInstall('demo', ['codex'], {
            marketplacePath,
            global: false,
            dryRun: false,
            verbose: false,
            outputRoot: outRoot,
        });

        // The fixture's AGENTS.md contains `demo:coder`. After shimming the
        // plugin-scoped reference must be rewritten to the local hyphen form.
        const body = readFileSync(join(outRoot, 'AGENTS.md'), 'utf-8');
        expect(body).not.toMatch(/demo:coder/);
    });

    it('0081 AC6: --magent <name> selects only the named magent (multi-magent plugin)', async () => {
        const { marketplacePath, pluginDir } = setupPluginDir();
        // Add two more magents so the plugin has foo, bar, and my-agent
        mkdirSync(join(pluginDir, 'magents', 'foo'), { recursive: true });
        writeFileSync(join(pluginDir, 'magents', 'foo', 'AGENTS.md'), '# Foo magent\n');
        mkdirSync(join(pluginDir, 'magents', 'bar'), { recursive: true });
        writeFileSync(join(pluginDir, 'magents', 'bar', 'AGENTS.md'), '# Bar magent\n');
        const outRoot = join(tmpDir, 'ac6-out');

        await executeInstall('demo', ['codex'], {
            marketplacePath,
            global: false,
            dryRun: false,
            verbose: false,
            outputRoot: outRoot,
            magent: 'bar',
        });

        // Only bar's body should be present; foo and my-agent must NOT leak.
        const body = readFileSync(join(outRoot, 'AGENTS.md'), 'utf-8');
        expect(body).toContain('Bar magent');
        expect(body).not.toContain('Foo magent');
        expect(body).not.toContain('Universal main-agent config');
    });

    it('0081 AC6b: --magent <name> with an unknown name fails loudly rather than silently installing nothing', async () => {
        const { marketplacePath } = setupPluginDir();
        const outRoot = join(tmpDir, 'ac6b-out');

        await expect(
            executeInstall('demo', ['codex'], {
                marketplacePath,
                global: false,
                dryRun: false,
                verbose: false,
                outputRoot: outRoot,
                magent: 'nonexistent',
            }),
        ).rejects.toThrow(/Magent 'nonexistent' not found/);
    });

    it('0081 AC7: --dry-run --verbose shows selection decisions without writing files', async () => {
        const { marketplacePath } = setupPluginDir();
        const outRoot = join(tmpDir, 'ac7-out');
        const captured: string[] = [];
        const spy = spyOn(process.stdout, 'write').mockImplementation((data) => {
            captured.push(typeof data === 'string' ? data : data.toString());
            return true;
        });

        await executeInstall('demo', ['claude', 'pi'], {
            marketplacePath,
            global: false,
            dryRun: true,
            verbose: true,
            outputRoot: outRoot,
        });
        spy.mockRestore();

        const out = captured.join('');
        // Verbose output names the source file, target, and destination for each magent.
        expect(out).toMatch(/claude: magent .* → .*CLAUDE\.md/);
        expect(out).toMatch(/pi: magent .* → .*AGENTS\.md/);
        expect(out).toContain('[DRY-RUN] No files were written to install targets');
        // Nothing was actually written
        expect(existsSync(join(outRoot, 'CLAUDE.md'))).toBe(false);
        expect(existsSync(join(outRoot, 'AGENTS.md'))).toBe(false);
    });

    it('0081 AC8: multiple magents without --magent selector skips with a verbose note (no silent install)', async () => {
        const { marketplacePath, pluginDir } = setupPluginDir();
        // Add two more magents so the plugin has foo, bar, and my-agent
        mkdirSync(join(pluginDir, 'magents', 'foo'), { recursive: true });
        writeFileSync(join(pluginDir, 'magents', 'foo', 'AGENTS.md'), '# Foo magent\n');
        mkdirSync(join(pluginDir, 'magents', 'bar'), { recursive: true });
        writeFileSync(join(pluginDir, 'magents', 'bar', 'AGENTS.md'), '# Bar magent\n');
        const outRoot = join(tmpDir, 'ac8-out');
        const captured: string[] = [];
        const spy = spyOn(process.stdout, 'write').mockImplementation((data) => {
            captured.push(typeof data === 'string' ? data : data.toString());
            return true;
        });

        await executeInstall('demo', ['codex'], {
            marketplacePath,
            global: false,
            dryRun: false,
            verbose: true,
            outputRoot: outRoot,
        });
        spy.mockRestore();

        // Plugin ships 3 magents; with no --magent, emission is skipped (no auto-pick
        // on ambiguity) and a verbose note explains how to select.
        const out = captured.join('');
        expect(out).toMatch(/Magents: 3 staged \(3 plugin-owned\); pass --magent/);
        expect(existsSync(join(outRoot, 'AGENTS.md'))).toBe(false);
    });

    // ── Plugin-level scripts staging (task 0090) ──

    /** Minimal GenerateResult stub for tests that don't exercise rulesync output. */
    function mockEmptyRulesyncResult() {
        return {
            rulesCount: 0,
            rulesPaths: [] as string[],
            ignoreCount: 0,
            ignorePaths: [] as string[],
            mcpCount: 0,
            mcpPaths: [] as string[],
            commandsCount: 0,
            commandsPaths: [] as string[],
            subagentsCount: 0,
            subagentsPaths: [] as string[],
            skillsCount: 0,
            skillsPaths: [] as string[],
            hooksCount: 0,
            hooksPaths: [] as string[],
            permissionsCount: 0,
            permissionsPaths: [] as string[],
            skills: [],
            hasDiff: false,
        };
    }
    it('stages plugin-level scripts/ to .agents/scripts/<plugin>/ on rulesync targets', async () => {
        const { marketplacePath, pluginDir } = setupPluginDir();
        // Add a scripts/ directory to the fixture
        const scriptsDir = join(pluginDir, 'scripts', 'anti-hallucination');
        mkdirSync(scriptsDir, { recursive: true });
        writeFileSync(join(scriptsDir, 'validate.js'), '#!/usr/bin/env node\nconsole.log("validating");');
        writeFileSync(join(scriptsDir, 'check.sh'), '#!/usr/bin/env bash\necho "checking"');

        const outRoot = join(tmpDir, 'out');
        mkdirSync(outRoot, { recursive: true });

        await executeInstall(
            'demo',
            ['codex'],
            { marketplacePath, global: false, dryRun: false, verbose: false, outputRoot: outRoot },
            { runRulesync: async () => mockEmptyRulesyncResult() },
        );

        // Scripts staged at the shared agents root
        const scriptsDest = join(outRoot, '.agents', 'scripts', 'demo');
        expect(existsSync(join(scriptsDest, 'anti-hallucination', 'validate.js'))).toBe(true);
        expect(existsSync(join(scriptsDest, 'anti-hallucination', 'check.sh'))).toBe(true);
        // Content preserved
        expect(readFileSync(join(scriptsDest, 'anti-hallucination', 'check.sh'), 'utf-8')).toContain(
            '#!/usr/bin/env bash',
        );
    });

    it('skips scripts staging when plugin has no scripts/ directory', async () => {
        const { marketplacePath } = setupPluginDir();
        const outRoot = join(tmpDir, 'out');
        mkdirSync(outRoot, { recursive: true });

        await executeInstall(
            'demo',
            ['codex'],
            { marketplacePath, global: false, dryRun: false, verbose: false, outputRoot: outRoot },
            { runRulesync: async () => mockEmptyRulesyncResult() },
        );

        // No scripts root created when plugin has no scripts/
        expect(existsSync(join(outRoot, '.agents', 'scripts', 'demo'))).toBe(false);
    });

    it('dry-run does not write scripts to disk', async () => {
        const { marketplacePath, pluginDir } = setupPluginDir();
        const scriptsDir = join(pluginDir, 'scripts', 'util');
        mkdirSync(scriptsDir, { recursive: true });
        writeFileSync(join(scriptsDir, 'helper.js'), '// dry-run test');

        const outRoot = join(tmpDir, 'out');
        mkdirSync(outRoot, { recursive: true });

        await executeInstall(
            'demo',
            ['codex'],
            { marketplacePath, global: false, dryRun: true, verbose: false, outputRoot: outRoot },
            { runRulesync: async () => mockEmptyRulesyncResult() },
        );

        // dry-run: scripts are NOT written
        expect(existsSync(join(outRoot, '.agents', 'scripts', 'demo'))).toBe(false);
    });
});
