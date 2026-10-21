import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RulesyncOptions, Target } from '@gobing-ai/superskill-core';
import { getEnvVar, removeEnvVar, setEnvVar } from '@gobing-ai/superskill-core';
import type { ProcessExecutor, ProcessOptions } from '@gobing-ai/ts-runtime';
import { executeInstall } from '../../src/commands/install';

/**
 * A native target skipped because its CLI is absent must not receive magent or
 * rules writes, and the grok/rulesync dual-path warning must not fire for a
 * skipped grok.
 */

const originalCwd = process.cwd();
let tempDir: string;
let home: string;
const saved: Record<string, string | undefined> = {};

function mockRulesync(): (
    targets: Target[],
    features: string[],
    inputRoot: string,
    options: RulesyncOptions,
) => Promise<{
    rulesCount: number;
    rulesPaths: string[];
    ignoreCount: number;
    ignorePaths: string[];
    mcpCount: number;
    mcpPaths: string[];
    commandsCount: number;
    commandsPaths: string[];
    subagentsCount: number;
    subagentsPaths: string[];
    skillsCount: number;
    skillsPaths: string[];
    hooksCount: number;
    hooksPaths: string[];
    permissionsCount: number;
    permissionsPaths: string[];
    skills: [];
    hasDiff: false;
}> {
    return async () => ({
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
}

function writePlugin(): void {
    const pluginRoot = join(tempDir, 'plugins', 'demo');
    mkdirSync(join(pluginRoot, 'skills'), { recursive: true });
    mkdirSync(join(pluginRoot, 'magents', 'persona'), { recursive: true });
    mkdirSync(join(pluginRoot, 'rules'), { recursive: true });
    writeFileSync(join(pluginRoot, 'plugin.json'), JSON.stringify({ name: 'demo', version: '0.0.1' }));
    writeFileSync(join(pluginRoot, 'skills', 'a.md'), '---\nname: a\ndescription: Skill a\n---\n# skill a\n');
    writeFileSync(join(pluginRoot, 'magents', 'persona', 'AGENTS.md'), '# persona\n');
    writeFileSync(join(pluginRoot, 'rules', 'safety.md'), '# safety\n');
    mkdirSync(join(tempDir, '.claude-plugin'), { recursive: true });
    writeFileSync(
        join(tempDir, '.claude-plugin', 'marketplace.json'),
        JSON.stringify({ name: 'test-mkp', plugins: [{ name: 'demo', source: './plugins/demo' }] }),
    );
}

const okExecutor: ProcessExecutor = {
    run: (options: ProcessOptions) =>
        Promise.resolve({
            command: options.command,
            args: options.args ?? [],
            exitCode: 0,
            stdout: '',
            stderr: '',
            durationMs: 0,
        }),
    runStreaming: () => {
        throw new Error('runStreaming is not used by install');
    },
};

beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'superskill-skip-writes-'));
    home = join(tempDir, 'home');
    mkdirSync(home, { recursive: true });
    process.chdir(tempDir);
    saved.HOME_DIR = getEnvVar('HOME_DIR');
    saved.PATH = getEnvVar('PATH');
    saved.BUN_INSTALL = getEnvVar('BUN_INSTALL');
    setEnvVar('HOME_DIR', home);
    setEnvVar('PATH', join(tempDir, 'empty-path'));
    setEnvVar('BUN_INSTALL', join(tempDir, 'empty-bun'));
    writePlugin();
});

afterEach(() => {
    process.chdir(originalCwd);
    for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) removeEnvVar(key);
        else setEnvVar(key, value);
        delete saved[key];
    }
    rmSync(tempDir, { recursive: true, force: true });
});

describe('skipped native targets get no writes', () => {
    it('does not write claude magents or rules when the claude CLI is absent', async () => {
        const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);
        const stderr = spyOn(process.stderr, 'write').mockImplementation(() => true);
        await executeInstall(
            'demo',
            ['claude', 'pi'],
            { marketplacePath: tempDir, global: true, dryRun: false, verbose: true },
            { runRulesync: mockRulesync() },
        );
        const out = stdout.mock.calls.map((call) => String(call[0])).join('');
        const err = stderr.mock.calls.map((call) => String(call[0])).join('');
        stdout.mockRestore();
        stderr.mockRestore();

        expect(err).toContain("skipping target 'claude'");
        expect(existsSync(join(home, '.claude', 'CLAUDE.md'))).toBe(false);
        expect(existsSync(join(home, '.claude', 'AGENTS.md'))).toBe(false);
        expect(existsSync(join(home, '.claude', 'rules', 'safety.md'))).toBe(false);
        expect(existsSync(join(home, '.claude', '.claude'))).toBe(false);
        expect(existsSync(join(home, '.pi', 'agent', 'AGENTS.md'))).toBe(true);
        expect(out).toContain("Installed 'demo' to 1 target(s) (skipped: claude).");
        expect(out).not.toContain('installing both grok');
    });

    it('does not warn about grok plus rulesync, or write grok magents, when grok is skipped', async () => {
        const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);
        const stderr = spyOn(process.stderr, 'write').mockImplementation(() => true);
        await executeInstall(
            'demo',
            ['grok', 'pi'],
            { marketplacePath: tempDir, global: true, dryRun: false, verbose: true },
            { runRulesync: mockRulesync() },
        );
        const out = stdout.mock.calls.map((call) => String(call[0])).join('');
        const err = stderr.mock.calls.map((call) => String(call[0])).join('');
        stdout.mockRestore();
        stderr.mockRestore();

        expect(err).toContain("skipping target 'grok'");
        expect(out).not.toContain('installing both grok');
        expect(existsSync(join(home, 'AGENTS.md'))).toBe(false);
        expect(existsSync(join(home, '.pi', 'agent', 'AGENTS.md'))).toBe(true);
    });

    it('warns about grok plus rulesync only when grok is actually installed', async () => {
        const bin = join(home, '.local', 'bin');
        mkdirSync(bin, { recursive: true });
        writeFileSync(join(bin, 'grok'), '#!/bin/sh\n');
        chmodSync(join(bin, 'grok'), 0o755);

        const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);
        await executeInstall(
            'demo',
            ['grok', 'pi'],
            { marketplacePath: tempDir, global: true, dryRun: false, verbose: true },
            { runRulesync: mockRulesync(), processExecutor: okExecutor },
        );
        const out = stdout.mock.calls.map((call) => String(call[0])).join('');
        stdout.mockRestore();

        expect(out).toContain('installing both grok');
        expect(existsSync(join(home, 'AGENTS.md'))).toBe(true);
    });
});
