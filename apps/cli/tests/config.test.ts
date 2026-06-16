import { describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { configSchema, loadConfig } from '../src/config';

describe('configSchema', () => {
    it('validates a minimal valid config', () => {
        const result = configSchema.safeParse({ version: 1 });
        expect(result.success).toBe(true);
    });

    it('rejects missing version', () => {
        const result = configSchema.safeParse({});
        expect(result.success).toBe(false);
    });

    it('rejects wrong version number', () => {
        const result = configSchema.safeParse({ version: 2 });
        expect(result.success).toBe(false);
    });

    it('defaults plugins to empty array', () => {
        const result = configSchema.parse({ version: 1 });
        expect(result.plugins).toEqual([]);
    });

    it('defaults features to all five', () => {
        const result = configSchema.parse({ version: 1 });
        expect(result.features).toEqual(['skills', 'commands', 'subagents', 'hooks', 'mcp']);
    });

    it('rejects invalid feature names', () => {
        const result = configSchema.safeParse({ version: 1, features: ['skills', 'bogus'] });
        expect(result.success).toBe(false);
    });
});

describe('loadConfig', () => {
    it('returns defaults when no config file exists', () => {
        const config = loadConfig('/nonexistent/path/superskill.jsonc');
        expect(config.version).toBe(1);
        expect(config.plugins).toEqual([]);
        expect(config.targets).toEqual([]);
        expect(config.features).toEqual(['skills', 'commands', 'subagents', 'hooks', 'mcp']);
    });

    it('loads and validates a real config file', () => {
        const dir = mkdtempSync('superskill-config-test-');
        const configPath = join(dir, 'superskill.jsonc');
        try {
            writeFileSync(
                configPath,
                JSON.stringify({
                    version: 1,
                    plugins: [{ name: 'rd3', path: './plugins/rd3' }],
                    targets: ['codex', 'pi'],
                    features: ['skills', 'commands'],
                }),
            );

            const config = loadConfig(configPath);
            expect(config.version).toBe(1);
            expect(config.plugins).toEqual([{ name: 'rd3', path: './plugins/rd3' }]);
            expect(config.targets).toEqual(['codex', 'pi']);
            expect(config.features).toEqual(['skills', 'commands']);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('throws on invalid JSON', () => {
        const dir = mkdtempSync('superskill-config-test-');
        const configPath = join(dir, 'superskill.jsonc');
        try {
            writeFileSync(configPath, 'not json');
            expect(() => loadConfig(configPath)).toThrow();
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('throws on invalid schema', () => {
        const dir = mkdtempSync('superskill-config-test-');
        const configPath = join(dir, 'superskill.jsonc');
        try {
            writeFileSync(configPath, JSON.stringify({ version: 2 }));
            expect(() => loadConfig(configPath)).toThrow();
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('uses cwd-relative path when no path given', () => {
        // When no path is given and no file exists, returns defaults
        const config = loadConfig();
        expect(config.version).toBe(1);
        expect(config.targets).toEqual([]);
    });
});
