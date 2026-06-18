import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { GenerateResult } from 'rulesync';
import { executeInstall } from '../../src/commands/install';

const originalCwd = process.cwd();
let tempDir: string | undefined;

function createTempWorkspace(): string {
    tempDir = mkdtempSync(join(tmpdir(), 'superskill-install-hooks-test-'));
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

describe('executeInstall — hook counts', () => {
    it('accumulates hooksCount from rulesync results and prints it in verbose summary', async () => {
        const workspace = createTempWorkspace();
        createPlugin(workspace, 'hookdemo');
        const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);

        await executeInstall(
            'hookdemo',
            ['codex'],
            {
                global: false,
                dryRun: true,
                verbose: true,
            },
            {
                runRulesync: async () =>
                    makeResult({
                        skillsCount: 1,
                        commandsCount: 1,
                        subagentsCount: 1,
                        hooksCount: 3,
                        hooksPaths: ['hooks/codex.json', 'hooks/codex-2.json', 'hooks/codex-3.json'],
                    }),
            },
        );

        const output = stdout.mock.calls.map((call) => String(call[0])).join('');
        expect(output).toContain('Hooks: 3');
        expect(output).toContain('Skills written: 1, Commands: 1, Subagents: 1, Hooks: 3');
        stdout.mockRestore();
    });

    it('accumulates hooksCount across multiple targets', async () => {
        const workspace = createTempWorkspace();
        createPlugin(workspace, 'multitarget');
        const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);

        let callCount = 0;
        await executeInstall(
            'multitarget',
            ['codex', 'opencode'],
            {
                global: false,
                dryRun: true,
                verbose: true,
            },
            {
                runRulesync: async () => {
                    callCount++;
                    return makeResult({
                        skillsCount: 1,
                        hooksCount: callCount === 1 ? 2 : 3,
                        hooksPaths:
                            callCount === 1
                                ? ['hooks/a.json', 'hooks/b.json']
                                : ['hooks/c.json', 'hooks/d.json', 'hooks/e.json'],
                    });
                },
            },
        );

        const output = stdout.mock.calls.map((call) => String(call[0])).join('');
        // 2 + 3 = 5 total hooks across both targets
        expect(output).toContain('Hooks: 5');
        stdout.mockRestore();
    });

    it('reports Hooks: 0 when rulesync returns no hooks', async () => {
        const workspace = createTempWorkspace();
        createPlugin(workspace, 'nohooks');
        const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);

        await executeInstall(
            'nohooks',
            ['codex'],
            {
                global: false,
                dryRun: true,
                verbose: true,
            },
            {
                runRulesync: async () =>
                    makeResult({
                        skillsCount: 1,
                        hooksCount: 0,
                        hooksPaths: [],
                    }),
            },
        );

        const output = stdout.mock.calls.map((call) => String(call[0])).join('');
        expect(output).toContain('Hooks: 0');
        stdout.mockRestore();
    });

    it('does not print hook summary when no rulesync targets run', async () => {
        const workspace = createTempWorkspace();
        createPlugin(workspace, 'claudeonly');
        const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);

        await executeInstall(
            'claudeonly',
            ['claude'],
            {
                global: false,
                dryRun: true,
                verbose: true,
            },
            {
                runRulesync: async () => makeResult(),
            },
        );

        const output = stdout.mock.calls.map((call) => String(call[0])).join('');
        // claude target doesn't go through rulesync, so no rulesync summary line
        expect(output).not.toContain('Skills written:');
        expect(output).not.toContain('Hooks: 0');
        stdout.mockRestore();
    });
});

describe('validation checklist fixture (design §1.1)', () => {
    it('hook-events-checklist.md fixture exists and documents the four ✅ targets', () => {
        const checklistPath = join(import.meta.dir, '..', 'fixtures', 'phase5', 'hook-events-checklist.md');
        const { readFileSync, existsSync } = require('node:fs');
        expect(existsSync(checklistPath)).toBe(true);
        const content = readFileSync(checklistPath, 'utf-8');
        // All four ✅ targets documented
        expect(content).toContain('codex');
        expect(content).toContain('opencode');
        expect(content).toContain('antigravity-cli');
        expect(content).toContain('antigravity-ide');
        // Event-name fidelity confirmed
        expect(content).toContain('No lossy mapping');
        // rulesync API shape confirmed
        expect(content).toContain('rulesync API shape');
    });
});
