import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MAGENT_LAYER_FILES, stageMagentsFromDir, TARGETS } from '@gobing-ai/superskill-core';
import { emitMagents, emitPluginRules, type InstallOptions } from '../../src/commands/install';

const originalCwd = process.cwd();
let tempDir: string | undefined;

function makeTempRoot(): string {
    tempDir = mkdtempSync(join(tmpdir(), 'install-magents-test-'));
    return tempDir;
}

/** Minimal InstallOptions with only the fields these functions read. */
function opts(overrides: Partial<InstallOptions> = {}): InstallOptions {
    return {
        global: false,
        dryRun: false,
        verbose: false,
        ...overrides,
    };
}

beforeEach(() => {
    spyOn(process.stdout, 'write').mockImplementation(() => true);
    spyOn(process.stderr, 'write').mockImplementation(() => true);
});
afterEach(() => {
    process.chdir(originalCwd);
    if (tempDir) {
        rmSync(tempDir, { recursive: true, force: true });
        tempDir = undefined;
    }
});

describe('emitMagents', () => {
    it('emits identical team-stark source layers for each target into separate fresh destinations', () => {
        const root = makeTempRoot();
        const sourceRoot = join(import.meta.dir, '../../../..', 'magents');
        const sourceDir = join(sourceRoot, 'team-stark-children');
        const outputDir = join(root, 'staging');
        const expected = `${MAGENT_LAYER_FILES.map((name) =>
            readFileSync(join(sourceDir, name), 'utf-8').trimEnd(),
        ).join('\n\n')}\n`;
        stageMagentsFromDir(sourceRoot, 'cc', outputDir, { nameMode: 'bare' });

        for (const target of TARGETS) {
            const destination = join(root, target);
            emitMagents('cc', [target], outputDir, destination, opts({ magent: 'team-stark-children' }));
            if (target === 'claude') {
                const entry = readFileSync(join(destination, 'CLAUDE.md'), 'utf-8');
                const imports = [...entry.matchAll(/^@(\S+)$/gm)].map((match) => match[1] ?? '');
                expect(imports).toEqual([...MAGENT_LAYER_FILES]);
                const expanded = `${imports
                    .map((name) => readFileSync(join(destination, name), 'utf-8').trimEnd())
                    .join('\n\n')}\n`;
                expect(expanded).toBe(expected);
            } else {
                expect(readFileSync(join(destination, 'AGENTS.md'), 'utf-8')).toBe(expected);
            }
        }
    });

    it('no-ops when no magents/ staging directory exists', () => {
        const root = makeTempRoot();
        const outputDir = join(root, 'out');
        mkdirSync(outputDir, { recursive: true });
        // No magents/ dir — should not throw, should not write anything.
        emitMagents('demo', ['claude'], outputDir, outputDir, opts());
        expect(existsSync(join(outputDir, 'CLAUDE.md'))).toBe(false);
    });

    it('no-ops when magents/ is empty (no subdirectories)', () => {
        const root = makeTempRoot();
        const outputDir = join(root, 'out');
        mkdirSync(join(outputDir, 'magents'), { recursive: true });
        emitMagents('demo', ['claude'], outputDir, outputDir, opts());
        expect(existsSync(join(outputDir, 'CLAUDE.md'))).toBe(false);
    });

    it('throws when --magent names a package that is not staged', () => {
        const root = makeTempRoot();
        const outputDir = join(root, 'out');
        const stagedRoot = join(outputDir, 'magents', 'demo-persona');
        mkdirSync(stagedRoot, { recursive: true });
        writeFileSync(join(stagedRoot, 'AGENTS.md'), '# persona\n');
        expect(() => emitMagents('demo', ['codex'], outputDir, outputDir, opts({ magent: 'missing' }))).toThrow(
            /Magent 'missing' not found/,
        );
    });

    it('auto-selects the single plugin-owned package and emits AGENTS.md for codex', () => {
        const root = makeTempRoot();
        const outputDir = join(root, 'out');
        const outputRoot = join(root, 'dest');
        const stagedRoot = join(outputDir, 'magents', 'demo-persona');
        mkdirSync(stagedRoot, { recursive: true });
        writeFileSync(join(stagedRoot, 'AGENTS.md'), '# demo persona\n');
        emitMagents('demo', ['codex'], outputDir, outputRoot, opts());
        expect(existsSync(join(outputRoot, 'AGENTS.md'))).toBe(true);
        expect(readFileSync(join(outputRoot, 'AGENTS.md'), 'utf-8')).toContain('demo persona');
    });

    it('selects via --magent by bare name (suffix match)', () => {
        const root = makeTempRoot();
        const outputDir = join(root, 'out');
        const outputRoot = join(root, 'dest');
        const stagedRoot = join(outputDir, 'magents', 'demo-persona');
        mkdirSync(stagedRoot, { recursive: true });
        writeFileSync(join(stagedRoot, 'AGENTS.md'), '# persona body\n');
        emitMagents('demo', ['codex'], outputDir, outputRoot, opts({ magent: 'persona' }));
        expect(existsSync(join(outputRoot, 'AGENTS.md'))).toBe(true);
    });

    it('selects via --magent by exact staged name', () => {
        const root = makeTempRoot();
        const outputDir = join(root, 'out');
        const outputRoot = join(root, 'dest');
        const stagedRoot = join(outputDir, 'magents', 'custom-pkg');
        mkdirSync(stagedRoot, { recursive: true });
        writeFileSync(join(stagedRoot, 'AGENTS.md'), '# custom\n');
        emitMagents('demo', ['codex'], outputDir, outputRoot, opts({ magent: 'custom-pkg' }));
        expect(existsSync(join(outputRoot, 'AGENTS.md'))).toBe(true);
    });

    it('no-ops (verbose) when multiple plugin-owned packages are staged and no --magent given', () => {
        const root = makeTempRoot();
        const outputDir = join(root, 'out');
        const outputRoot = join(root, 'dest');
        mkdirSync(join(outputDir, 'magents', 'demo-a'), { recursive: true });
        mkdirSync(join(outputDir, 'magents', 'demo-b'), { recursive: true });
        writeFileSync(join(outputDir, 'magents', 'demo-a', 'AGENTS.md'), '# a\n');
        writeFileSync(join(outputDir, 'magents', 'demo-b', 'AGENTS.md'), '# b\n');
        emitMagents('demo', ['codex'], outputDir, outputRoot, opts({ verbose: true }));
        // Ambiguous → no emission.
        expect(existsSync(join(outputRoot, 'AGENTS.md'))).toBe(false);
    });

    it('emits Claude import-style package files when CLAUDE.md uses @-imports', () => {
        const root = makeTempRoot();
        const outputDir = join(root, 'out');
        const outputRoot = join(root, 'dest');
        const stagedRoot = join(outputDir, 'magents', 'demo-persona');
        mkdirSync(stagedRoot, { recursive: true });
        // @-import line triggers isClaudeImportStyle === true for the 'claude' target.
        writeFileSync(join(stagedRoot, 'CLAUDE.md'), '# Entry\n\n@IDENTITY.md\n');
        writeFileSync(join(stagedRoot, 'IDENTITY.md'), '# Identity\n');
        emitMagents('demo', ['claude'], outputDir, outputRoot, opts());
        expect(existsSync(join(outputRoot, 'CLAUDE.md'))).toBe(true);
        expect(existsSync(join(outputRoot, 'IDENTITY.md'))).toBe(true);
    });

    it('respects dry-run: no files written but emission counted', () => {
        const root = makeTempRoot();
        const outputDir = join(root, 'out');
        const outputRoot = join(root, 'dest');
        const stagedRoot = join(outputDir, 'magents', 'demo-persona');
        mkdirSync(stagedRoot, { recursive: true });
        writeFileSync(join(stagedRoot, 'AGENTS.md'), '# persona\n');
        emitMagents('demo', ['codex'], outputDir, outputRoot, opts({ dryRun: true }));
        expect(existsSync(join(outputRoot, 'AGENTS.md'))).toBe(false);
    });

    it('skips targets whose assembly has no magent content', () => {
        const root = makeTempRoot();
        const outputDir = join(root, 'out');
        const outputRoot = join(root, 'dest');
        const stagedRoot = join(outputDir, 'magents', 'demo-empty');
        // Directory exists but holds no AGENTS.md / CLAUDE.md — assembleMagentContent returns null.
        mkdirSync(stagedRoot, { recursive: true });
        writeFileSync(join(stagedRoot, 'README.md'), '# nothing useful\n');
        emitMagents('demo', ['codex'], outputDir, outputRoot, opts({ verbose: true }));
        expect(existsSync(join(outputRoot, 'AGENTS.md'))).toBe(false);
    });

    it('writes to global magent dir when options.global is true (claude)', () => {
        const root = makeTempRoot();
        const outputDir = join(root, 'out');
        const stagedRoot = join(outputDir, 'magents', 'demo-persona');
        mkdirSync(stagedRoot, { recursive: true });
        writeFileSync(join(stagedRoot, 'AGENTS.md'), '# global persona\n');
        // Global mode resolves ~/.claude for claude target. Point HOME at our temp root.
        const fakeHome = join(root, 'home');
        mkdirSync(fakeHome, { recursive: true });
        process.env.HOME_DIR = fakeHome;
        emitMagents('demo', ['claude'], outputDir, join(root, 'unused'), opts({ global: true }));
        expect(existsSync(join(fakeHome, '.claude', 'CLAUDE.md'))).toBe(true);
        delete process.env.HOME_DIR;
    });
});

describe('emitPluginRules', () => {
    it('no-ops when plugin has no rules/ directory', () => {
        const root = makeTempRoot();
        const pluginRoot = join(root, 'plugins', 'demo');
        mkdirSync(pluginRoot, { recursive: true });
        const outputRoot = join(root, 'dest');
        emitPluginRules(pluginRoot, ['claude'], outputRoot, opts());
        expect(existsSync(join(outputRoot, '.claude', 'rules'))).toBe(false);
    });

    it('no-ops when rules/ contains no markdown files', () => {
        const root = makeTempRoot();
        const pluginRoot = join(root, 'plugins', 'demo');
        mkdirSync(join(pluginRoot, 'rules'), { recursive: true });
        writeFileSync(join(pluginRoot, 'rules', 'README.md'), '# readme\n');
        writeFileSync(join(pluginRoot, 'rules', 'notes.txt'), 'notes\n');
        const outputRoot = join(root, 'dest');
        emitPluginRules(pluginRoot, ['claude'], outputRoot, opts());
        expect(existsSync(join(outputRoot, '.claude', 'rules'))).toBe(false);
    });

    it('copies rule files into .claude/rules for the claude target', () => {
        const root = makeTempRoot();
        const pluginRoot = join(root, 'plugins', 'demo');
        mkdirSync(join(pluginRoot, 'rules'), { recursive: true });
        writeFileSync(join(pluginRoot, 'rules', 'safety.md'), '# safety rules\n');
        const outputRoot = join(root, 'dest');
        emitPluginRules(pluginRoot, ['claude'], outputRoot, opts());
        const copied = join(outputRoot, '.claude', 'rules', 'safety.md');
        expect(existsSync(copied)).toBe(true);
        expect(readFileSync(copied, 'utf-8')).toContain('safety rules');
    });

    it('skips targets that have no rules directory (grok)', () => {
        const root = makeTempRoot();
        const pluginRoot = join(root, 'plugins', 'demo');
        mkdirSync(join(pluginRoot, 'rules'), { recursive: true });
        writeFileSync(join(pluginRoot, 'rules', 'safety.md'), '# safety\n');
        const outputRoot = join(root, 'dest');
        // grok → magentRulesRelDir returns null; verbose exercises the skip branch.
        emitPluginRules(pluginRoot, ['grok'], outputRoot, opts({ verbose: true }));
        expect(existsSync(join(outputRoot, '.claude', 'rules'))).toBe(false);
    });

    it('respects dry-run: logs but writes nothing', () => {
        const root = makeTempRoot();
        const pluginRoot = join(root, 'plugins', 'demo');
        mkdirSync(join(pluginRoot, 'rules'), { recursive: true });
        writeFileSync(join(pluginRoot, 'rules', 'safety.md'), '# safety\n');
        const outputRoot = join(root, 'dest');
        emitPluginRules(pluginRoot, ['claude'], outputRoot, opts({ dryRun: true, verbose: true }));
        expect(existsSync(join(outputRoot, '.claude', 'rules'))).toBe(false);
    });

    it('writes to global rules dir when options.global is true (claude)', () => {
        const root = makeTempRoot();
        const pluginRoot = join(root, 'plugins', 'demo');
        mkdirSync(join(pluginRoot, 'rules'), { recursive: true });
        writeFileSync(join(pluginRoot, 'rules', 'safety.md'), '# global safety\n');
        const fakeHome = join(root, 'home');
        mkdirSync(fakeHome, { recursive: true });
        process.env.HOME_DIR = fakeHome;
        emitPluginRules(pluginRoot, ['claude'], join(root, 'unused'), opts({ global: true }));
        expect(existsSync(join(fakeHome, '.claude', '.claude', 'rules', 'safety.md'))).toBe(true);
        delete process.env.HOME_DIR;
    });
});
