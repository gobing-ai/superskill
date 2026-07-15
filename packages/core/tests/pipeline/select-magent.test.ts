import { describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    adaptMagentForTarget,
    magentGlobalDir,
    magentOutputFilename,
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
        writeFileSync(join(dir, name), body);
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

    it('returns null for claude (native installer owns the layout)', () => {
        expect(magentGlobalDir('claude', home)).toBeNull();
    });

    it('returns null for omp, grok (native installers own the layout)', () => {
        expect(magentGlobalDir('omp', home)).toBeNull();
        expect(magentGlobalDir('grok', home)).toBeNull();
    });
});
