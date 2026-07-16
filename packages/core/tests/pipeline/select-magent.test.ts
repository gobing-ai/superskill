import { describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
    adaptMagentForTarget,
    assembleMagentContent,
    isClaudeImportStyle,
    isMultiFileMagent,
    listRuleMarkdownFiles,
    magentGlobalDir,
    magentOutputFilename,
    magentRulesRelDir,
    resolveMagentLayerFile,
    selectMagentVariant,
} from '../../src/pipeline/select-magent';
import type { Target } from '../../src/targets';

const ALL_TARGETS: Target[] = [
    'claude',
    'codex',
    'pi',
    'omp',
    'opencode',
    'antigravity-cli',
    'antigravity-ide',
    'hermes',
    'grok',
];

function makeTmpMagentDir(files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), 'magent-select-'));
    for (const [name, body] of Object.entries(files)) {
        const path = join(dir, name);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, body);
    }
    return dir;
}

describe('selectMagentVariant', () => {
    it('prefers the target-specific variant over the base AGENTS.md (codex)', () => {
        const dir = makeTmpMagentDir({
            'AGENTS.md': 'base body',
            'AGENTS.codex.md': 'codex-specific body',
        });
        const picked = selectMagentVariant(dir, 'codex');
        expect(picked).toBe(join(dir, 'AGENTS.codex.md'));
        rmSync(dir, { recursive: true, force: true });
    });

    it('falls back to AGENTS.md when no target-specific variant exists (pi)', () => {
        const dir = makeTmpMagentDir({ 'AGENTS.md': 'base body' });
        const picked = selectMagentVariant(dir, 'pi');
        expect(picked).toBe(join(dir, 'AGENTS.md'));
        rmSync(dir, { recursive: true, force: true });
    });

    it('prefers CLAUDE.claude.md on claude over the bare CLAUDE.md (legacy name support)', () => {
        const dir = makeTmpMagentDir({
            'CLAUDE.md': 'bare claude',
            'CLAUDE.claude.md': 'claude-specific',
        });
        const picked = selectMagentVariant(dir, 'claude');
        expect(picked).toBe(join(dir, 'CLAUDE.claude.md'));
        rmSync(dir, { recursive: true, force: true });
    });

    it('prefers AGENTS.claude.md over CLAUDE.md on claude (cross-platform default wins)', () => {
        const dir = makeTmpMagentDir({
            'AGENTS.claude.md': 'agents-claude',
            'CLAUDE.md': 'bare claude',
        });
        const picked = selectMagentVariant(dir, 'claude');
        expect(picked).toBe(join(dir, 'AGENTS.claude.md'));
        rmSync(dir, { recursive: true, force: true });
    });

    it('returns null when no candidate exists (caller must skip emission)', () => {
        const dir = makeTmpMagentDir({ 'README.md': 'not a magent' });
        for (const target of ALL_TARGETS) {
            expect(selectMagentVariant(dir, target)).toBeNull();
        }
        rmSync(dir, { recursive: true, force: true });
    });

    it('honors target-family fallback for antigravity-cli via AGENTS.antigravity.md', () => {
        const dir = makeTmpMagentDir({
            'AGENTS.md': 'base',
            'AGENTS.antigravity.md': 'family-shared',
        });
        // No antigravity-cli-specific variant → falls back to the .antigravity. family file
        expect(selectMagentVariant(dir, 'antigravity-cli')).toBe(join(dir, 'AGENTS.antigravity.md'));
        expect(selectMagentVariant(dir, 'antigravity-ide')).toBe(join(dir, 'AGENTS.antigravity.md'));
        rmSync(dir, { recursive: true, force: true });
    });

    it('prefers the antigravity-cli-specific variant over the family-shared one', () => {
        const dir = makeTmpMagentDir({
            'AGENTS.antigravity.md': 'family-shared',
            'AGENTS.antigravity-cli.md': 'cli-specific',
        });
        expect(selectMagentVariant(dir, 'antigravity-cli')).toBe(join(dir, 'AGENTS.antigravity-cli.md'));
        rmSync(dir, { recursive: true, force: true });
    });

    it('every target resolves from a single AGENTS.md (cross-platform default)', () => {
        const dir = makeTmpMagentDir({ 'AGENTS.md': 'universal' });
        for (const target of ALL_TARGETS) {
            expect(selectMagentVariant(dir, target)).toBe(join(dir, 'AGENTS.md'));
        }
        rmSync(dir, { recursive: true, force: true });
    });
});

describe('assembleMagentContent (multi-file + overrides)', () => {
    it('concatenates IDENTITY → SOUL → AGENTS → USER in order', () => {
        const dir = makeTmpMagentDir({
            'IDENTITY.md': '# I',
            'SOUL.md': '# S',
            'AGENTS.md': '# A',
            'USER.md': '# U',
            'MEMORY.md': '# M must not appear',
            'RULES.md': '# R must not appear',
        });
        const body = assembleMagentContent(dir, 'claude');
        expect(body?.content).toBe('# I\n\n# S\n\n# A\n\n# U\n');
        expect(body?.content).not.toContain('must not appear');
        expect(body?.sources).toHaveLength(4);
        expect(isMultiFileMagent(dir)).toBe(true);
        rmSync(dir, { recursive: true, force: true });
    });

    it('prefers overrides/codexcli/AGENTS.md for codex (legacy alias)', () => {
        const dir = makeTmpMagentDir({
            'IDENTITY.md': '# I',
            'AGENTS.md': '# base agents',
            'overrides/codexcli/AGENTS.md': '# codex override',
            'USER.md': '# U',
        });
        expect(resolveMagentLayerFile(dir, 'codex', 'AGENTS.md')).toBe(join(dir, 'overrides/codexcli/AGENTS.md'));
        const body = assembleMagentContent(dir, 'codex');
        expect(body?.content).toContain('# codex override');
        expect(body?.content).not.toContain('# base agents');
        expect(body?.content).toContain('# I');
        expect(body?.content).toContain('# U');
        expect(body?.sources.some((s) => s.endsWith('overrides/codexcli/AGENTS.md'))).toBe(true);
        rmSync(dir, { recursive: true, force: true });
    });

    it('falls back to single-file selectMagentVariant when not multi-file', () => {
        const dir = makeTmpMagentDir({
            'AGENTS.md': 'base',
            'AGENTS.pi.md': 'pi-only',
        });
        expect(isMultiFileMagent(dir)).toBe(false);
        expect(assembleMagentContent(dir, 'pi')?.content).toBe('pi-only');
        expect(assembleMagentContent(dir, 'codex')?.content).toBe('base');
        expect(assembleMagentContent(dir, 'pi')?.sources[0]).toBe(join(dir, 'AGENTS.pi.md'));
        rmSync(dir, { recursive: true, force: true });
    });
});

describe('adaptMagentForTarget', () => {
    it('rewrites plugin-scoped skill references so the installed config resolves them locally', () => {
        // A magent often references its own plugin's skills via `plugin:skill-name`.
        // After install the references must point at the locally-staged names.
        const adapted = adaptMagentForTarget('See demo:coder for details.', 'demo', 'codex');
        expect(adapted).not.toContain('demo:coder');
    });

    it('is a passthrough when no plugin-scoped references are present', () => {
        const body = '# Agent config\nNo plugin refs here.';
        expect(adaptMagentForTarget(body, 'demo', 'pi')).toBe(body);
    });

    it('strips bare @file import lines on codex only', () => {
        const body = '# Title\n@SOUL.md\n\nKeep this.\n';
        expect(adaptMagentForTarget(body, 'demo', 'codex')).not.toContain('@SOUL.md');
        expect(adaptMagentForTarget(body, 'demo', 'codex')).toContain('Keep this.');
        expect(adaptMagentForTarget(body, 'demo', 'claude')).toContain('@SOUL.md');
    });
});

describe('magentOutputFilename', () => {
    it('writes CLAUDE.md for the claude target (legacy convention)', () => {
        expect(magentOutputFilename('claude')).toBe('CLAUDE.md');
    });

    it('writes AGENTS.md for every non-claude target (cross-platform default)', () => {
        for (const target of ALL_TARGETS) {
            if (target === 'claude') continue;
            expect(magentOutputFilename(target)).toBe('AGENTS.md');
        }
    });
});

describe('magentGlobalDir', () => {
    const home = '/home/test';

    it('resolves the codex per-user config directory', () => {
        expect(magentGlobalDir('codex', home)).toBe(join(home, '.codex'));
    });

    it('resolves the pi per-user config directory (nested agent subdir)', () => {
        expect(magentGlobalDir('pi', home)).toBe(join(home, '.pi', 'agent'));
    });

    it('resolves the opencode per-user config directory', () => {
        expect(magentGlobalDir('opencode', home)).toBe(join(home, '.config', 'opencode'));
    });

    it('resolves the hermes per-user config directory', () => {
        expect(magentGlobalDir('hermes', home)).toBe(join(home, '.hermes'));
    });

    it('resolves the antigravity-cli per-user config directory (under .gemini)', () => {
        expect(magentGlobalDir('antigravity-cli', home)).toBe(join(home, '.gemini', 'antigravity-cli'));
    });

    it('resolves the antigravity-ide per-user config directory (.gemini/config)', () => {
        expect(magentGlobalDir('antigravity-ide', home)).toBe(join(home, '.gemini', 'config'));
    });

    it('resolves claude global to ~/.claude (modular package + CLAUDE.md)', () => {
        expect(magentGlobalDir('claude', home)).toBe(join(home, '.claude'));
    });

    it('returns null for omp, grok (no pinned global magent path)', () => {
        expect(magentGlobalDir('omp', home)).toBeNull();
        expect(magentGlobalDir('grok', home)).toBeNull();
    });
});

describe('isClaudeImportStyle / rules helpers', () => {
    it('detects CLAUDE.md @-import packages', () => {
        const dir = makeTmpMagentDir({
            'CLAUDE.md': '@IDENTITY.md\n@AGENTS.md\n',
            'IDENTITY.md': '# I',
            'AGENTS.md': '# A',
        });
        expect(isClaudeImportStyle(dir)).toBe(true);
        rmSync(dir, { recursive: true, force: true });
    });

    it('lists rule markdown files and maps rules dest dirs', () => {
        const dir = makeTmpMagentDir({
            '01-a.md': 'a',
            '02-b.md': 'b',
            'README.md': 'not a rule body',
        });
        // listRuleMarkdownFiles lists *.md in the rules dir itself (plugin layout).
        expect(listRuleMarkdownFiles(dir).map((p) => p.split(/[/\\]/).pop())).toEqual(['01-a.md', '02-b.md']);
        expect(magentRulesRelDir('claude')).toBe(join('.claude', 'rules'));
        expect(magentRulesRelDir('antigravity-cli')).toBe(join('.agents', 'rules'));
        expect(magentRulesRelDir('codex')).toBeNull();
        rmSync(dir, { recursive: true, force: true });
    });
});
