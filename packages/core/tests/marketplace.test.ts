import { afterEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { listResolvablePlugins, resolvePlugin } from '../src/marketplace';

describe('resolvePlugin', () => {
    let tmpDir: string;

    afterEach(() => {
        if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
    });

    it('resolves a plugin via marketplace manifest', () => {
        tmpDir = mkdtempSync('superskill-mp-');
        const claudePluginDir = join(tmpDir, '.claude-plugin');
        mkdirSync(claudePluginDir, { recursive: true });
        const pluginDir = join(tmpDir, 'plugins', 'demo');
        mkdirSync(pluginDir, { recursive: true });
        mkdirSync(join(pluginDir, 'skills'), { recursive: true });
        writeFileSync(
            join(claudePluginDir, 'marketplace.json'),
            JSON.stringify({
                name: 'demo-marketplace',
                owner: { name: 'Demo Team', email: 'demo@example.com' },
                description: 'extra top-level field should be accepted',
                plugins: [{ name: 'demo', source: './plugins/demo' }],
            }),
        );

        const result = resolvePlugin(join(claudePluginDir, 'marketplace.json'), 'demo');
        expect(result).not.toBeNull();
        expect(result?.pluginRoot).toBe(resolve(pluginDir));
        expect(result?.source).toBe('./plugins/demo');
    });

    it('honors metadata.pluginRoot prefixing', () => {
        tmpDir = mkdtempSync('superskill-mp-');
        const claudePluginDir = join(tmpDir, '.claude-plugin');
        mkdirSync(claudePluginDir, { recursive: true });
        const pluginDir = join(tmpDir, 'plugins', 'demo');
        mkdirSync(pluginDir, { recursive: true });
        mkdirSync(join(pluginDir, 'skills'), { recursive: true });
        writeFileSync(
            join(claudePluginDir, 'marketplace.json'),
            JSON.stringify({
                metadata: { pluginRoot: './plugins' },
                plugins: [{ name: 'demo', source: './demo' }],
            }),
        );

        const result = resolvePlugin(join(claudePluginDir, 'marketplace.json'), 'demo');

        expect(result?.pluginRoot).toBe(resolve(pluginDir));
        expect(result?.marketplaceRoot).toBe(resolve(tmpDir));
    });

    it('returns null when no marketplace found', () => {
        const result = resolvePlugin(undefined, 'demo');
        expect(result).toBeNull();
    });

    it('returns null when plugin not in manifest', () => {
        tmpDir = mkdtempSync('superskill-mp-');
        const claudePluginDir = join(tmpDir, '.claude-plugin');
        mkdirSync(claudePluginDir, { recursive: true });
        writeFileSync(
            join(claudePluginDir, 'marketplace.json'),
            JSON.stringify({ plugins: [{ name: 'other', source: './plugins/other' }] }),
        );

        const result = resolvePlugin(join(claudePluginDir, 'marketplace.json'), 'demo');
        expect(result).toBeNull();
    });

    it('throws on remote source (Phase 1 only supports relative paths)', () => {
        tmpDir = mkdtempSync('superskill-mp-');
        const claudePluginDir = join(tmpDir, '.claude-plugin');
        mkdirSync(claudePluginDir, { recursive: true });
        writeFileSync(
            join(claudePluginDir, 'marketplace.json'),
            JSON.stringify({ plugins: [{ name: 'demo', source: 'github:user/repo' }] }),
        );

        expect(() => resolvePlugin(join(claudePluginDir, 'marketplace.json'), 'demo')).toThrow(
            'Remote sources not yet supported',
        );
    });

    it('reports the offending field when the manifest fails schema validation', () => {
        // A raw ZodError dump is not actionable at the CLI: the operator needs the
        // manifest path and the field that broke, matching the Invalid-JSON wrap.
        tmpDir = mkdtempSync('superskill-mp-');
        const claudePluginDir = join(tmpDir, '.claude-plugin');
        mkdirSync(claudePluginDir, { recursive: true });
        const manifestPath = join(claudePluginDir, 'marketplace.json');
        writeFileSync(manifestPath, JSON.stringify({ plugins: [{ name: 'demo', source: 42 }] }));

        expect(() => resolvePlugin(manifestPath, 'demo')).toThrow('Invalid marketplace manifest');
        expect(() => resolvePlugin(manifestPath, 'demo')).toThrow('plugins.0.source');
    });

    it('throws on object source with the remote-source message', () => {
        tmpDir = mkdtempSync('superskill-mp-');
        const claudePluginDir = join(tmpDir, '.claude-plugin');
        mkdirSync(claudePluginDir, { recursive: true });
        writeFileSync(
            join(claudePluginDir, 'marketplace.json'),
            JSON.stringify({
                plugins: [{ name: 'demo', source: { source: 'github', repo: 'owner/repo' } }],
            }),
        );

        expect(() => resolvePlugin(join(claudePluginDir, 'marketplace.json'), 'demo')).toThrow(
            'Remote sources not yet supported',
        );
    });

    it('rejects ../ path (now caught by remote-source guard instead of escape guard)', () => {
        tmpDir = mkdtempSync('superskill-mp-');
        const claudePluginDir = join(tmpDir, '.claude-plugin');
        mkdirSync(claudePluginDir, { recursive: true });
        writeFileSync(
            join(claudePluginDir, 'marketplace.json'),
            JSON.stringify({ plugins: [{ name: 'demo', source: '../escape' }] }),
        );

        // ../escape does not start with './' so hits the remote-source guard (M3 fix)
        expect(() => resolvePlugin(join(claudePluginDir, 'marketplace.json'), 'demo')).toThrow(
            'Remote sources not yet supported',
        );
    });

    it('catches path escape via ./ prefix with .. in the middle (M3 regression)', () => {
        tmpDir = mkdtempSync('superskill-mp-');
        const claudePluginDir = join(tmpDir, '.claude-plugin');
        mkdirSync(claudePluginDir, { recursive: true });
        writeFileSync(
            join(claudePluginDir, 'marketplace.json'),
            JSON.stringify({ plugins: [{ name: 'demo', source: './foo/../bar' }] }),
        );

        // ./foo/../bar starts with './' but contains '..' — still caught by escape guard
        expect(() => resolvePlugin(join(claudePluginDir, 'marketplace.json'), 'demo')).toThrow('escapes');
    });

    it('allows ".." as a substring inside a path segment (not a traversal)', () => {
        tmpDir = mkdtempSync('superskill-mp-');
        const claudePluginDir = join(tmpDir, '.claude-plugin');
        mkdirSync(claudePluginDir, { recursive: true });
        writeFileSync(
            join(claudePluginDir, 'marketplace.json'),
            JSON.stringify({ plugins: [{ name: 'demo', source: './a..b' }] }),
        );

        // ./a..b has '..' only as a substring, not a path segment — it clears
        // the escape guard and fails on the non-existent plugin root.
        expect(() => resolvePlugin(join(claudePluginDir, 'marketplace.json'), 'demo')).toThrow('Plugin root not found');
    });

    it('throws when marketplace manifest is missing', () => {
        expect(() => resolvePlugin('/nonexistent/marketplace.json', 'demo')).toThrow('not found');
    });
    it('probes <X>/.claude-plugin/marketplace.json when given a directory (R1)', () => {
        tmpDir = mkdtempSync('superskill-mp-');
        const claudePluginDir = join(tmpDir, '.claude-plugin');
        mkdirSync(claudePluginDir, { recursive: true });
        const pluginDir = join(tmpDir, 'plugins', 'demo');
        mkdirSync(join(pluginDir, 'skills'), { recursive: true });
        writeFileSync(
            join(claudePluginDir, 'marketplace.json'),
            JSON.stringify({ plugins: [{ name: 'demo', source: './plugins/demo' }] }),
        );

        // Point at the marketplace root dir — must probe <X>/.claude-plugin/marketplace.json
        const result = resolvePlugin(tmpDir, 'demo');
        expect(result).not.toBeNull();
        expect(result?.pluginRoot).toBe(resolve(pluginDir));
        expect(result?.marketplaceRoot).toBe(resolve(tmpDir));
    });

    it('derives marketplaceRoot === <X> for the root-level <X>/marketplace.json branch (R1 regression)', () => {
        tmpDir = mkdtempSync('superskill-mp-');
        const pluginDir = join(tmpDir, 'plugins', 'demo');
        mkdirSync(join(pluginDir, 'skills'), { recursive: true });
        mkdirSync(join(tmpDir, 'magents'), { recursive: true });
        // Manifest at <X>/marketplace.json — NO .claude-plugin dir.
        writeFileSync(
            join(tmpDir, 'marketplace.json'),
            JSON.stringify({ name: 'root-marketplace', plugins: [{ name: 'demo', source: './plugins/demo' }] }),
        );

        const result = resolvePlugin(tmpDir, 'demo');
        expect(result).not.toBeNull();
        // The latent bug resolved to dirname(<X>); must be <X> itself.
        expect(result?.marketplaceRoot).toBe(resolve(tmpDir));
        expect(result?.pluginRoot).toBe(resolve(pluginDir));
        // Companion: the magents/ sibling must resolve under <X>.
        expect(resolve(result?.marketplaceRoot ?? '', 'magents')).toBe(resolve(join(tmpDir, 'magents')));
    });

    it('throws one error listing every probed path when all three probe branches are missing (R1)', () => {
        tmpDir = mkdtempSync('superskill-mp-');
        expect(() => resolvePlugin(tmpDir, 'demo')).toThrow('Marketplace manifest not found');
        expect(() => resolvePlugin(tmpDir, 'demo')).toThrow(resolve(join(tmpDir, 'marketplace.json')));
        expect(() => resolvePlugin(tmpDir, 'demo')).toThrow(
            resolve(join(tmpDir, '.claude-plugin', 'marketplace.json')),
        );
    });

    // R3 regression: absolute pluginRoot in metadata is rejected
    it('rejects absolute pluginRoot in metadata', () => {
        tmpDir = mkdtempSync('superskill-mp-');
        const claudePluginDir = join(tmpDir, '.claude-plugin');
        mkdirSync(claudePluginDir, { recursive: true });
        writeFileSync(
            join(claudePluginDir, 'marketplace.json'),
            JSON.stringify({ metadata: { pluginRoot: '/etc' }, plugins: [{ name: 'demo', source: './demo' }] }),
        );
        expect(() => resolvePlugin(join(claudePluginDir, 'marketplace.json'), 'demo')).toThrow('escapes');
    });
});
describe('listResolvablePlugins', () => {
    let tmpDir: string;

    afterEach(() => {
        if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
    });

    it('lists plugin names from manifest', () => {
        tmpDir = mkdtempSync('superskill-mp-');
        const claudePluginDir = join(tmpDir, '.claude-plugin');
        mkdirSync(claudePluginDir, { recursive: true });
        writeFileSync(
            join(claudePluginDir, 'marketplace.json'),
            JSON.stringify({
                plugins: [
                    { name: 'rd3', source: './plugins/rd3' },
                    { name: 'wt', source: './plugins/wt' },
                ],
            }),
        );

        const names = listResolvablePlugins(join(claudePluginDir, 'marketplace.json'));
        expect(names).toEqual(['rd3', 'wt']);
    });

    it('returns empty when no manifest found', () => {
        tmpDir = mkdtempSync('superskill-mp-');
        expect(listResolvablePlugins(tmpDir)).toEqual([]);
    });
});

describe('resolvePlugin — real-path containment (R2/F2)', () => {
    let mpDir: string;
    let outsideDir: string;

    afterEach(() => {
        if (mpDir) rmSync(mpDir, { recursive: true, force: true });
        if (outsideDir) rmSync(outsideDir, { recursive: true, force: true });
    });

    function writeManifest(source: string): string {
        const claudePluginDir = join(mpDir, '.claude-plugin');
        mkdirSync(claudePluginDir, { recursive: true });
        const manifestPath = join(claudePluginDir, 'marketplace.json');
        writeFileSync(
            manifestPath,
            JSON.stringify({
                name: 'demo-marketplace',
                owner: { name: 'Demo Team', email: 'demo@example.com' },
                plugins: [{ name: 'demo', source }],
            }),
        );
        return manifestPath;
    }

    // Residual-proof (F2): the compound half is the symlinked source leaf escaping the
    // root; the bare half is an equivalent real in-root layout that must still resolve.
    it('rejects a source that is a symlink escaping the marketplace root after resolution', () => {
        mpDir = mkdtempSync(join(tmpdir(), 'superskill-mp-in-'));
        outsideDir = mkdtempSync(join(tmpdir(), 'superskill-mp-out-'));
        mkdirSync(join(outsideDir, 'skills'), { recursive: true });
        symlinkSync(outsideDir, join(mpDir, 'escape'));
        const manifestPath = writeManifest('./escape');

        expect(() => resolvePlugin(manifestPath, 'demo')).toThrow(
            /escapes the marketplace root after symlink resolution/,
        );
    });

    it('still resolves an in-root symlink whose real target stays inside the root', () => {
        mpDir = mkdtempSync(join(tmpdir(), 'superskill-mp-in-'));
        mkdirSync(join(mpDir, 'real-plugin', 'skills'), { recursive: true });
        symlinkSync(join(mpDir, 'real-plugin'), join(mpDir, 'alias'));
        const manifestPath = writeManifest('./alias');

        const result = resolvePlugin(manifestPath, 'demo');
        expect(result).not.toBeNull();
    });

    it('rejects a pluginRoot metadata leaf that symlinks out while the source stays lexical', () => {
        mpDir = mkdtempSync(join(tmpdir(), 'superskill-mp-in-'));
        outsideDir = mkdtempSync(join(tmpdir(), 'superskill-mp-out-'));
        mkdirSync(join(outsideDir, 'skills'), { recursive: true });
        symlinkSync(outsideDir, join(mpDir, 'escape'));
        const claudePluginDir = join(mpDir, '.claude-plugin');
        mkdirSync(claudePluginDir, { recursive: true });
        const manifestPath = join(claudePluginDir, 'marketplace.json');
        writeFileSync(
            manifestPath,
            JSON.stringify({
                metadata: { pluginRoot: '.' },
                plugins: [{ name: 'demo', source: './escape' }],
            }),
        );

        expect(() => resolvePlugin(manifestPath, 'demo')).toThrow(
            /escapes the marketplace root after symlink resolution/,
        );
    });
});
