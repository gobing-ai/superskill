import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { GenerateResult } from 'rulesync';
import { executeInstall } from '../../src/commands/install';

const originalCwd = process.cwd();
let tempDir: string | undefined;

function createTempWorkspace(): string {
    tempDir = mkdtempSync(join(tmpdir(), 'superskill-min-cli-version-test-'));
    process.chdir(tempDir);
    return tempDir;
}

function createPluginWithFloor(root: string, floor: string, pluginName = 'floordemo'): string {
    const pluginRoot = join(root, 'plugins', pluginName);
    mkdirSync(join(pluginRoot, 'skills'), { recursive: true });
    mkdirSync(join(pluginRoot, 'commands'), { recursive: true });
    writeFileSync(join(pluginRoot, 'plugin.json'), JSON.stringify({ name: pluginName }));
    writeFileSync(join(pluginRoot, 'skills', 'a.md'), '---\nname: a\ndescription: Skill a\n---\n# skill a\n');
    // Claude Code format hooks.json with a minCliVersion floor above any realistic CLI version.
    writeFileSync(
        join(pluginRoot, 'hooks.json'),
        JSON.stringify({
            minCliVersion: floor,
            hooks: {
                PreToolUse: [{ matcher: 'bash', hooks: [{ type: 'command', command: 'echo guard' }] }],
            },
        }),
    );
    return pluginRoot;
}

function makeResult(overrides: Partial<GenerateResult> = {}): GenerateResult {
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
        ...overrides,
    };
}

afterEach(() => {
    process.chdir(originalCwd);
    if (tempDir) {
        rmSync(tempDir, { recursive: true, force: true });
        tempDir = undefined;
    }
});

describe('executeInstall — minCliVersion compat gate', () => {
    it('warns and skips pi hooks when CLI is below the floor (skills still install)', async () => {
        const workspace = createTempWorkspace();
        createPluginWithFloor(workspace, '99.0.0', 'floorblock');
        const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);

        await executeInstall(
            'floorblock',
            ['pi'],
            { global: false, dryRun: false, verbose: true },
            { runRulesync: async () => makeResult({ skillsCount: 1 }) },
        );

        const output = stdout.mock.calls.map((call) => String(call[0])).join('');
        // Compat warning surfaced with the floor and the installed version
        expect(output).toContain('plugin requires superskill ≥ 99.0.0');
        expect(output).toContain('Hooks will be skipped');
        // Pi hooks explicitly skipped in verbose
        expect(output).toContain('Pi hooks: skipped (CLI below plugin minCliVersion)');
        // No pi hooks file written
        expect(existsSync(join(workspace, '.pi', 'hooks.json'))).toBe(false);
        // Skills still install
        expect(output).toContain('Skills written: 1');

        stdout.mockRestore();
    });

    it('installs hooks normally when no minCliVersion is declared', async () => {
        const workspace = createTempWorkspace();
        // Plugin with hooks but no floor
        const pluginRoot = join(workspace, 'plugins', 'nofloor');
        mkdirSync(join(pluginRoot, 'skills'), { recursive: true });
        writeFileSync(join(pluginRoot, 'plugin.json'), JSON.stringify({ name: 'nofloor' }));
        writeFileSync(join(pluginRoot, 'skills', 'a.md'), '---\nname: a\ndescription: Skill a\n---\n# skill a\n');
        writeFileSync(
            join(pluginRoot, 'hooks.json'),
            JSON.stringify({
                hooks: { PreToolUse: [{ matcher: 'bash', hooks: [{ type: 'command', command: 'echo g' }] }] },
            }),
        );
        process.chdir(workspace);

        const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);
        await executeInstall(
            'nofloor',
            ['pi'],
            { global: false, dryRun: false, verbose: true },
            { runRulesync: async () => makeResult({ skillsCount: 1 }) },
        );

        const output = stdout.mock.calls.map((call) => String(call[0])).join('');
        // No compat warning
        expect(output).not.toContain('Hooks will be skipped');
        // Pi hooks written
        expect(output).toContain('@vahor/pi-hooks');
        expect(existsSync(join(workspace, '.pi', 'hooks.json'))).toBe(true);

        stdout.mockRestore();
    });

    it('does not block when the floor is below the installed CLI version', async () => {
        const workspace = createTempWorkspace();
        // Floor of 0.0.1 is satisfied by any real CLI version
        createPluginWithFloor(workspace, '0.0.1', 'lowfloor');
        const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);

        await executeInstall(
            'lowfloor',
            ['pi'],
            { global: false, dryRun: false, verbose: true },
            { runRulesync: async () => makeResult({ skillsCount: 1 }) },
        );

        const output = stdout.mock.calls.map((call) => String(call[0])).join('');
        expect(output).not.toContain('Hooks will be skipped');
        expect(existsSync(join(workspace, '.pi', 'hooks.json'))).toBe(true);

        stdout.mockRestore();
    });

    it('preserves minCliVersion through the Claude→canonical hooks conversion', async () => {
        const workspace = createTempWorkspace();
        createPluginWithFloor(workspace, '99.0.0', 'mappreserves');
        const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);

        await executeInstall(
            'mappreserves',
            ['pi'],
            { global: false, dryRun: false, verbose: false },
            { runRulesync: async () => makeResult({ skillsCount: 1 }) },
        );

        // The canonical .rulesync/hooks.json must carry minCliVersion (mapper task 0074 R3)
        const canonical = JSON.parse(readFileSync(join(workspace, '.rulesync', 'hooks.json'), 'utf-8'));
        expect(canonical.minCliVersion).toBe('99.0.0');
        expect(canonical.hooks).toBeDefined();

        stdout.mockRestore();
    });
});
