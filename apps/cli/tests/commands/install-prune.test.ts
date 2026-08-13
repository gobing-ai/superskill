import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executeInstall } from '../../src/commands/install';

const originalCwd = process.cwd();
let tempDir: string | undefined;

function createTempWorkspace(): string {
    tempDir = mkdtempSync(join(tmpdir(), 'superskill-prune-test-'));
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

/** Mock rulesync that actually writes the mapped skill dirs to the dest so prune + write is realistic. */
function mockRulesyncThatWrites(destSkillsDir: (target: string) => string) {
    return async (targets: readonly string[]) => {
        for (const target of targets) {
            const dir = destSkillsDir(target);
            if (dir === '') continue;
            mkdirSync(dir, { recursive: true });
            const skillDir = join(dir, 'demo-a');
            mkdirSync(skillDir, { recursive: true });
            writeFileSync(join(skillDir, 'SKILL.md'), '---\nname: demo-a\ndescription: a\n---\n# a\n');
        }
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
            skillsPaths: ['skills/demo-a/SKILL.md'],
            hooksCount: 0,
            hooksPaths: [],
            permissionsCount: 0,
            permissionsPaths: [],
            skills: [],
            hasDiff: false,
        };
    };
}

let stdoutSpy: ReturnType<typeof spyOn> | undefined;

afterEach(() => {
    stdoutSpy?.mockRestore();
    process.chdir(originalCwd);
    if (tempDir) {
        rmSync(tempDir, { recursive: true, force: true });
        tempDir = undefined;
    }
});

describe('install --prune (R4/R5/R6)', () => {
    beforeEach(() => {
        createTempWorkspace();
        // Suppress install command's echo() output so dots reporter stays clean
        stdoutSpy = spyOn(process.stdout, 'write').mockImplementation(() => true);
    });

    it('R4 — removes orphan <plugin>-* dest dirs but keeps other plugins', async () => {
        createPlugin(tempDir as string, 'demo');
        const outRoot = join(tempDir as string, 'out');
        const skillsDest = join(outRoot, '.agents', 'skills');
        mkdirSync(skillsDest, { recursive: true });
        // Leftover orphan from a renamed-away command in this plugin
        mkdirSync(join(skillsDest, 'demo-oldcmd'), { recursive: true });
        writeFileSync(join(skillsDest, 'demo-oldcmd', 'SKILL.md'), 'stale');
        // Another plugin's dest dir — must survive
        mkdirSync(join(skillsDest, 'cc-skills'), { recursive: true });
        writeFileSync(join(skillsDest, 'cc-skills', 'SKILL.md'), 'other plugin');

        await executeInstall(
            'demo',
            ['codex'],
            { global: false, dryRun: false, verbose: false, outputRoot: outRoot, prune: true },
            { runRulesync: mockRulesyncThatWrites(() => join(outRoot, '.agents', 'skills')) },
        );

        expect(existsSync(join(skillsDest, 'demo-oldcmd'))).toBe(false);
        expect(existsSync(join(skillsDest, 'cc-skills', 'SKILL.md'))).toBe(true);
        // Current install's skill is present (prune ran before rulesync wrote it)
        expect(existsSync(join(skillsDest, 'demo-a', 'SKILL.md'))).toBe(true);
    });

    it('R5 — replaces remaining <plugin>-* dirs so intra-dir leftovers disappear', async () => {
        createPlugin(tempDir as string, 'demo');
        const outRoot = join(tempDir as string, 'out');
        const skillsDest = join(outRoot, '.agents', 'skills');
        // Stale file inside a mapped dest dir that the current source no longer ships
        mkdirSync(join(skillsDest, 'demo-a', 'references'), { recursive: true });
        writeFileSync(join(skillsDest, 'demo-a', 'references', 'debugging.md'), 'stale ref');

        await executeInstall(
            'demo',
            ['codex'],
            { global: false, dryRun: false, verbose: false, outputRoot: outRoot, prune: true },
            { runRulesync: mockRulesyncThatWrites(() => join(outRoot, '.agents', 'skills')) },
        );

        // The stale references file is gone (dir was replaced before rulesync rewrote SKILL.md)
        expect(existsSync(join(skillsDest, 'demo-a', 'references', 'debugging.md'))).toBe(false);
        // The current skill is present
        expect(existsSync(join(skillsDest, 'demo-a', 'SKILL.md'))).toBe(true);
    });

    it('R6 — install without --prune keeps leftover dest files (additive default)', async () => {
        createPlugin(tempDir as string, 'demo');
        const outRoot = join(tempDir as string, 'out');
        const skillsDest = join(outRoot, '.agents', 'skills');
        mkdirSync(join(skillsDest, 'demo-oldcmd'), { recursive: true });
        writeFileSync(join(skillsDest, 'demo-oldcmd', 'SKILL.md'), 'stale');

        await executeInstall(
            'demo',
            ['codex'],
            { global: false, dryRun: false, verbose: false, outputRoot: outRoot }, // no prune
            { runRulesync: mockRulesyncThatWrites(() => join(outRoot, '.agents', 'skills')) },
        );

        // Leftover remains — default install is additive
        expect(existsSync(join(skillsDest, 'demo-oldcmd', 'SKILL.md'))).toBe(true);
        expect(existsSync(join(skillsDest, 'demo-a', 'SKILL.md'))).toBe(true);
    });

    it('--prune dry-run removes nothing', async () => {
        createPlugin(tempDir as string, 'demo');
        const outRoot = join(tempDir as string, 'out');
        const skillsDest = join(outRoot, '.agents', 'skills');
        mkdirSync(join(skillsDest, 'demo-oldcmd'), { recursive: true });
        writeFileSync(join(skillsDest, 'demo-oldcmd', 'SKILL.md'), 'stale');

        await executeInstall(
            'demo',
            ['codex'],
            { global: false, dryRun: true, verbose: false, outputRoot: outRoot, prune: true },
            { runRulesync: mockRulesyncThatWrites(() => join(outRoot, '.agents', 'skills')) },
        );

        // Dry-run: leftover survives
        expect(existsSync(join(skillsDest, 'demo-oldcmd', 'SKILL.md'))).toBe(true);
    });

    it('--prune does not touch native plugin-tree dests (claude)', async () => {
        createPlugin(tempDir as string, 'demo');
        const outRoot = join(tempDir as string, 'out');
        // A native dest path that should never be pruned by --prune
        const claudeInstallPath = join(outRoot, '.claude', 'plugins', 'cache', 'superskill', 'demo');
        mkdirSync(join(claudeInstallPath, 'skills', 'demo-oldcmd'), { recursive: true });
        writeFileSync(join(claudeInstallPath, 'skills', 'demo-oldcmd', 'SKILL.md'), 'native stale');

        await executeInstall(
            'demo',
            ['claude'],
            { global: false, dryRun: false, verbose: false, outputRoot: outRoot, prune: true },
            {
                runClaudeInstall: async () => {},
            },
        );

        // Native plugin tree untouched by --prune (claude host CLI owns its tree)
        expect(existsSync(join(claudeInstallPath, 'skills', 'demo-oldcmd', 'SKILL.md'))).toBe(true);
    });
});
