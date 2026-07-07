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

    it('verbose install does not double-echo hook-emit results (pi/omp/hermes each printed once)', async () => {
        // Regression test for the bug where the per-target verbose echo at the dispatch site
        // AND the post-loop unconditional echo at install.ts:296-299 both fired in --verbose
        // mode, producing duplicated pi/omp/hermes lines. The fix gates the post-loop echo on
        // `!options.verbose`; verbose mode already echoes each result at the dispatch site.
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
            await executeInstall('demo', ['pi', 'omp', 'hermes'], {
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
        const ompRulesyncLines = output.match(/^\s*omp: \d+ skill\(s\) at .+$/gm) ?? [];
        const ompHookLines =
            output.match(/^\s*omp: (?:no hooks in plugin|no mappable hooks|.+? hook\(s\) emitted)/gm) ?? [];
        const hermesRulesyncLines = output.match(/^\s*hermes: \d+ skill\(s\) at .+$/gm) ?? [];
        const hermesHookLines =
            output.match(/^\s*hermes: (?:no hooks in plugin|no hooks to install|.+? hook\(s\) copied)/gm) ?? [];
        expect(piRulesyncLines).toHaveLength(1);
        expect(piHookLines).toHaveLength(1);
        expect(ompRulesyncLines).toHaveLength(0);
        expect(ompHookLines).toHaveLength(1);
        expect(hermesRulesyncLines).toHaveLength(0);
        expect(hermesHookLines).toHaveLength(1);
        // Sanity: the per-target verbose copy-marker is present (verbose is on, so the
        // dispatch-site "Copying to Hermes" line is emitted — was not over-suppressed).
        expect(output).toContain('Copying to Hermes');
    });

    it('non-verbose install still surfaces hook-emit results for pi/omp/hermes', async () => {
        // Companion test: when --verbose is off, the post-loop echo at install.ts:296-299 is
        // the ONLY place hook results surface. With the fix, this echo is gated on
        // `!options.verbose`, so non-verbose output is unchanged (pi/omp/hermes each appear
        // exactly once via the post-loop echo).
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
            await executeInstall('demo', ['pi', 'omp', 'hermes'], {
                marketplacePath,
                global: true,
                dryRun: false,
                verbose: false,
            });
        } finally {
            process.stdout.write = origWrite;
            if (origHomeDir === undefined) delete process.env.HOME_DIR;
            else process.env.HOME_DIR = origHomeDir;
        }

        const output = chunks.join('');
        // Same line-prefix match as the verbose test — the post-loop echo (gated on
        // !options.verbose) emits each target's line once.
        const piLines = output.match(/^\s*pi: .*$/gm) ?? [];
        const ompLines = output.match(/^\s*omp: .*$/gm) ?? [];
        const hermesLines = output.match(/^\s*hermes: .*$/gm) ?? [];
        expect(piLines).toHaveLength(1);
        expect(ompLines).toHaveLength(1);
        expect(hermesLines).toHaveLength(1);
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
});
