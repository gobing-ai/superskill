import { afterEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
        writeFileSync(join(pluginDir, 'plugin.json'), '{"name":"demo"}');
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
        writeFileSync(join(pluginDir, 'plugin.json'), '{"name":"demo"}');
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

    it('throws on ../ path escape', () => {
        tmpDir = mkdtempSync('superskill-mp-');
        const claudePluginDir = join(tmpDir, '.claude-plugin');
        mkdirSync(claudePluginDir, { recursive: true });
        writeFileSync(
            join(claudePluginDir, 'marketplace.json'),
            JSON.stringify({ plugins: [{ name: 'demo', source: '../escape' }] }),
        );

        expect(() => resolvePlugin(join(claudePluginDir, 'marketplace.json'), 'demo')).toThrow('escapes');
    });

    it('throws when marketplace manifest is missing', () => {
        expect(() => resolvePlugin('/nonexistent/marketplace.json', 'demo')).toThrow('not found');
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
        expect(listResolvablePlugins(undefined)).toEqual([]);
    });
});
