import { afterEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Command } from 'commander';
import { registerScriptPath, resolveScriptPath, UsageError } from '../../src/commands/script-path';

describe('resolveScriptPath', () => {
    let tmpDir: string;

    afterEach(() => {
        if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
    });

    function setupTree(opts: { projectScript?: string; globalScript?: string }) {
        tmpDir = mkdtempSync('superskill-script-path-');
        const fakeHome = join(tmpDir, 'home');
        const projectRoot = join(tmpDir, 'project');
        mkdirSync(fakeHome, { recursive: true });
        mkdirSync(projectRoot, { recursive: true });

        if (opts.projectScript) {
            const p = join(projectRoot, '.agents', 'scripts', 'cc', opts.projectScript);
            mkdirSync(join(p, '..'), { recursive: true });
            writeFileSync(p, 'ok');
        }
        if (opts.globalScript) {
            const p = join(fakeHome, '.agents', 'scripts', 'cc', opts.globalScript);
            mkdirSync(join(p, '..'), { recursive: true });
            writeFileSync(p, 'ok');
        }

        return { fakeHome, projectRoot };
    }

    it('resolves from project root first', () => {
        const { fakeHome, projectRoot } = setupTree({ projectScript: 'cmd/check.js', globalScript: 'cmd/check.js' });
        const result = resolveScriptPath({ plugin: 'cc', rel: 'cmd/check.js', home: fakeHome, projectRoot });
        expect(result).not.toBeNull();
        if (!result) throw new Error('null result');
        expect(result.path).toBe(join(projectRoot, '.agents', 'scripts', 'cc', 'cmd/check.js'));
        expect(result.source).toBe('project');
    });

    it('resolves from global root when project is absent', () => {
        const { fakeHome, projectRoot } = setupTree({ globalScript: 'cmd/check.js' });
        const result = resolveScriptPath({ plugin: 'cc', rel: 'cmd/check.js', home: fakeHome, projectRoot });
        expect(result).not.toBeNull();
        if (!result) throw new Error('null result');
        expect(result.path).toBe(join(fakeHome, '.agents', 'scripts', 'cc', 'cmd/check.js'));
        expect(result.source).toBe('global');
    });

    it('resolves nested relative paths', () => {
        const { projectRoot } = setupTree({ projectScript: 'anti-hallucination/validate_response.js' });
        const result = resolveScriptPath({ plugin: 'cc', rel: 'anti-hallucination/validate_response.js', projectRoot });
        expect(result).not.toBeNull();
        if (!result) throw new Error('null result');
        expect(result.path).toContain('anti-hallucination/validate_response.js');
    });

    it('returns null when file not found', () => {
        const { fakeHome, projectRoot } = setupTree({});
        const result = resolveScriptPath({ plugin: 'cc', rel: 'missing/script.sh', home: fakeHome, projectRoot });
        expect(result).toBeNull();
    });

    it('returns null when plugin subdir does not exist', () => {
        tmpDir = mkdtempSync('superskill-script-path-');
        const result = resolveScriptPath({
            plugin: 'nonexistent',
            rel: 'foo.js',
            home: join(tmpDir, 'home'),
            projectRoot: join(tmpDir, 'project'),
        });
        expect(result).toBeNull();
    });

    it('forceGlobal skips project root', () => {
        const { fakeHome, projectRoot } = setupTree({ projectScript: 'cmd/check.js', globalScript: 'cmd/check.js' });
        const result = resolveScriptPath({
            plugin: 'cc',
            rel: 'cmd/check.js',
            home: fakeHome,
            projectRoot,
            forceGlobal: true,
        });
        expect(result).not.toBeNull();
        if (!result) throw new Error('null result');
        expect(result.source).toBe('global');
    });

    it('forceProject skips global root', () => {
        const { fakeHome, projectRoot } = setupTree({ globalScript: 'cmd/check.js' });
        const result = resolveScriptPath({
            plugin: 'cc',
            rel: 'cmd/check.js',
            home: fakeHome,
            projectRoot,
            forceProject: true,
        });
        expect(result).toBeNull();
    });

    it('rejects .. segments in rel', () => {
        expect(() => resolveScriptPath({ plugin: 'cc', rel: '../escape/foo.sh' })).toThrow(UsageError);
        expect(() => resolveScriptPath({ plugin: 'cc', rel: 'foo/../../bar' })).toThrow(UsageError);
    });

    it('rejects absolute paths as rel', () => {
        expect(() => resolveScriptPath({ plugin: 'cc', rel: '/etc/passwd' })).toThrow(UsageError);
    });
});

describe('registerScriptPath CLI', () => {
    it('registers path subcommand under script group', () => {
        const program = new Command().name('superskill');
        registerScriptPath(program);
        const scriptCmd = program.commands.find((c) => c.name() === 'script');
        expect(scriptCmd).toBeDefined();
        const pathCmd = scriptCmd?.commands.find((c) => c.name() === 'path');
        expect(pathCmd).toBeDefined();
        expect(pathCmd?.options.some((o) => o.long === '--json')).toBe(true);
        expect(pathCmd?.options.some((o) => o.long === '--global')).toBe(true);
        expect(pathCmd?.options.some((o) => o.long === '--project')).toBe(true);
    });

    it('adds to existing script group without conflicts', () => {
        const program = new Command().name('superskill');
        program.command('script').description('Plugin script utilities');
        registerScriptPath(program);
        const scriptCmd = program.commands.find((c) => c.name() === 'script');
        expect(scriptCmd?.commands.some((c) => c.name() === 'path')).toBe(true);
    });

    it('accepts required positional arguments plugin and rel', () => {
        const program = new Command().name('superskill');
        registerScriptPath(program);
        const scriptCmd = program.commands.find((c) => c.name() === 'script');
        const pathCmd = scriptCmd?.commands.find((c) => c.name() === 'path');
        const args = pathCmd?.registeredArguments;
        expect(args?.some((a) => a.name() === 'plugin')).toBe(true);
        expect(args?.some((a) => a.name() === 'rel')).toBe(true);
    });
});
