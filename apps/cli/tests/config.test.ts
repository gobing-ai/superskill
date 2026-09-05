import { describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { configSchema, loadConfig, parseJsonc } from '../src/config';

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

    it('accepts valid target names', () => {
        const result = configSchema.safeParse({ version: 1, targets: ['claude', 'codex', 'pi'] });
        expect(result.success).toBe(true);
        if (result.success) expect(result.data.targets).toEqual(['claude', 'codex', 'pi']);
    });

    it('rejects invalid target names', () => {
        const result = configSchema.safeParse({ version: 1, targets: ['claude', 'invalid-target'] });
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

    it('loads JSONC with line comments, block comments, and trailing commas', () => {
        const dir = mkdtempSync('superskill-config-test-');
        const configPath = join(dir, 'superskill.jsonc');
        try {
            writeFileSync(
                configPath,
                `{
                    // target defaults
                    "version": 1,
                    "plugins": [
                        { "name": "rd3", "path": "https://example.test/a//b" },
                    ],
                    /* keep only configured targets */
                    "targets": ["codex",],
                    "features": ["skills", "hooks",],
                }`,
            );
            const config = loadConfig(configPath);
            expect(config.plugins[0]?.path).toBe('https://example.test/a//b');
            expect(config.targets).toEqual(['codex']);
            expect(config.features).toEqual(['skills', 'hooks']);
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

describe('parseJsonc', () => {
    it('preserves comment-like and escaped content inside strings', () => {
        expect(parseJsonc(`{"url":"https://example.test/a/*b*/","quote":"\\\\\\"//literal","items":[1,],}`)).toEqual({
            url: 'https://example.test/a/*b*/',
            quote: '\\"//literal',
            items: [1],
        });
    });

    // F8 (task 0127 R8): EOF inside a block comment is a truncated document — fail loud
    // with the comment's start position instead of letting JSON.parse bless the prefix.
    it('throws SyntaxError naming the start position for an unterminated block comment on line 1', () => {
        const raw = '{"key": "value" /* truncated';
        expect(() => parseJsonc(raw)).toThrow(SyntaxError);
        expect(() => parseJsonc(raw)).toThrow('Unterminated block comment starting at line 1, column 17');
    });

    it('throws SyntaxError naming the start position for a multi-line unterminated block comment', () => {
        const raw = '{\n  "a": 1,\n  /* never closed\n}';
        expect(() => parseJsonc(raw)).toThrow(SyntaxError);
        expect(() => parseJsonc(raw)).toThrow('Unterminated block comment starting at line 3, column 3');
    });
});
