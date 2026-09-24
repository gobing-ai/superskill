import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getEnvVar, removeEnvVar, setEnvVar } from '@gobing-ai/superskill-core';
import { Command } from 'commander';
import { registerScriptPath, resolveScriptPath, runScriptPathAction, UsageError } from '../../src/commands/script-path';

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
        const result = resolveScriptPath({
            plugin: 'cc',
            rel: 'anti-hallucination/validate_response.js',
            projectRoot,
        });
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
        expect(() => resolveScriptPath({ plugin: 'cc', rel: 'C:\\Windows\\notepad.exe' })).toThrow(UsageError);
        expect(() => resolveScriptPath({ plugin: 'cc', rel: 'D:/abs/script.ts' })).toThrow(UsageError);
    });

    it('rejects empty segments / repeated separators in rel', () => {
        expect(() => resolveScriptPath({ plugin: 'cc', rel: 'a//b.ts' })).toThrow(UsageError);
        expect(() => resolveScriptPath({ plugin: 'cc', rel: 'a\\\\b.ts' })).toThrow(UsageError);
    });

    it('rejects an unsafe plugin segment before probing', () => {
        expect(() => resolveScriptPath({ plugin: '../cc', rel: 'ok.ts' })).toThrow(/single path segment/);
        expect(() => resolveScriptPath({ plugin: 'cc/evil', rel: 'ok.ts' })).toThrow(/single path segment/);
    });

    it('allows filenames that contain ".." as a substring but not as a segment', () => {
        const { projectRoot } = setupTree({ projectScript: 'file..ts' });
        const result = resolveScriptPath({ plugin: 'cc', rel: 'file..ts', projectRoot });
        expect(result).not.toBeNull();
        expect(result?.path).toContain('file..ts');
    });

    it('skips a symlinked project candidate and falls through to the global root', () => {
        tmpDir = mkdtempSync('superskill-script-path-');
        const projectRoot = join(tmpDir, 'project');
        const home = join(tmpDir, 'home');
        const outside = join(tmpDir, 'outside');
        mkdirSync(join(projectRoot, '.agents', 'scripts', 'cc'), { recursive: true });
        mkdirSync(join(home, '.agents', 'scripts', 'cc'), { recursive: true });
        mkdirSync(outside, { recursive: true });
        const target = join(outside, 'real.mjs');
        writeFileSync(target, 'ok');
        symlinkSync(target, join(projectRoot, '.agents', 'scripts', 'cc', 'linked.mjs'));

        // The link itself is not a regular file; with no other candidate the lookup misses.
        expect(
            resolveScriptPath({ plugin: 'cc', rel: 'linked.mjs', home, projectRoot, forceProject: true }),
        ).toBeNull();

        // With a regular global file for the same rel, the skipped project link falls through to it.
        const globalFile = join(home, '.agents', 'scripts', 'cc', 'linked.mjs');
        writeFileSync(globalFile, 'ok');
        const result = resolveScriptPath({ plugin: 'cc', rel: 'linked.mjs', home, projectRoot });
        expect(result).not.toBeNull();
        if (!result) throw new Error('null result');
        expect(result.path).toBe(globalFile);
        expect(result.source).toBe('global');
    });

    it('returns null when the candidate path is a directory, not a file', () => {
        tmpDir = mkdtempSync('superskill-script-path-');
        const projectRoot = join(tmpDir, 'project');
        const dirPath = join(projectRoot, '.agents', 'scripts', 'cc', 'cmd');
        mkdirSync(dirPath, { recursive: true });
        // candidate is the directory itself (rel points at a dir, not a file)
        const result = resolveScriptPath({ plugin: 'cc', rel: 'cmd', projectRoot });
        expect(result).toBeNull();
    });
});
describe('resolveScriptPath home resolution', () => {
    let tmpDir: string;
    let savedHomeDir: string | undefined;

    beforeEach(() => {
        savedHomeDir = getEnvVar('HOME_DIR');
    });

    afterEach(() => {
        // Restore the previous HOME_DIR, including removing it when it was unset.
        if (savedHomeDir === undefined) removeEnvVar('HOME_DIR');
        else setEnvVar('HOME_DIR', savedHomeDir);
        if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
    });

    function setupHomeAndProject(opts: { globalScript?: string }) {
        tmpDir = mkdtempSync('superskill-script-path-home-');
        const home = join(tmpDir, 'home');
        const projectRoot = join(tmpDir, 'project');
        mkdirSync(home, { recursive: true });
        mkdirSync(projectRoot, { recursive: true });
        if (opts.globalScript) {
            const p = join(home, '.agents', 'scripts', 'cc', opts.globalScript);
            mkdirSync(join(p, '..'), { recursive: true });
            writeFileSync(p, 'ok');
        }
        return { home, projectRoot };
    }

    it('uses HOME_DIR as the global root when home is omitted', () => {
        const { home, projectRoot } = setupHomeAndProject({ globalScript: 'only-home-dir.mjs' });
        setEnvVar('HOME_DIR', home);
        const result = resolveScriptPath({ plugin: 'cc', rel: 'only-home-dir.mjs', projectRoot, forceGlobal: true });
        expect(result).not.toBeNull();
        if (!result) throw new Error('null result');
        expect(result.path).toBe(join(home, '.agents', 'scripts', 'cc', 'only-home-dir.mjs'));
        expect(result.source).toBe('global');
    });

    it('an explicit home beats HOME_DIR', () => {
        // Both halves present: HOME_DIR points at env-home, the home option at opt-home.
        tmpDir = mkdtempSync('superskill-script-path-home-');
        const envHome = join(tmpDir, 'env-home');
        const optHome = join(tmpDir, 'opt-home');
        const projectRoot = join(tmpDir, 'project');
        for (const dir of [envHome, optHome, projectRoot]) mkdirSync(dir, { recursive: true });
        const envFile = join(envHome, '.agents', 'scripts', 'cc', 'from-env.mjs');
        mkdirSync(join(envFile, '..'), { recursive: true });
        writeFileSync(envFile, 'ok');
        const optFile = join(optHome, '.agents', 'scripts', 'cc', 'from-opt.mjs');
        mkdirSync(join(optFile, '..'), { recursive: true });
        writeFileSync(optFile, 'ok');
        setEnvVar('HOME_DIR', envHome);

        const fromOpt = resolveScriptPath({
            plugin: 'cc',
            rel: 'from-opt.mjs',
            home: optHome,
            projectRoot,
            forceGlobal: true,
        });
        expect(fromOpt).not.toBeNull();
        if (!fromOpt) throw new Error('null result');
        expect(fromOpt.path).toBe(optFile);
        expect(fromOpt.source).toBe('global');

        expect(
            resolveScriptPath({ plugin: 'cc', rel: 'from-env.mjs', home: optHome, projectRoot, forceGlobal: true }),
        ).toBeNull();
    });
});
describe('runScriptPathAction', () => {
    let tmpDir: string;

    afterEach(() => {
        if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
    });

    function fixture(rel: string): string {
        const t = mkdtempSync('superskill-spa-');
        tmpDir = t;
        const d = join(t, '.agents', 'scripts', 'cc');
        mkdirSync(d, { recursive: true });
        writeFileSync(join(d, rel), '#!/usr/bin/env node\n// test');
        return t;
    }

    /** Call runScriptPathAction with a throw-on-exit callback and catch the throw. */
    function invoke(
        plugin: string,
        rel: string,
        options: { json?: boolean; global?: boolean; project?: boolean } = {},
        overrides?: { home?: string; projectRoot?: string },
    ): { exits: number[]; lines: string[]; errors: string[] } {
        const exits: number[] = [];
        const lines: string[] = [];
        const errors: string[] = [];
        const outSpy = spyOnStream(process.stdout, 'stdout', (l) => lines.push(l));
        const errSpy = spyOnStream(process.stderr, 'stderr', (l) => errors.push(l));
        try {
            runScriptPathAction(
                plugin,
                rel,
                options,
                (code) => {
                    exits.push(code);
                    throw new Error(`exit ${code}`);
                },
                overrides,
            );
        } catch {
            // exitFn throws — expected
        }
        outSpy.mockRestore();
        errSpy.mockRestore();
        return { exits, lines, errors };
    }

    it('exits 0 and prints path when script found', () => {
        const root = fixture('validate.js');
        const { exits, lines } = invoke('cc', 'validate.js', {}, { projectRoot: root });
        expect(exits).toEqual([0]);
        expect(lines[0]).toContain('validate.js');
    });

    it('exits 2 when script not found', () => {
        const root = fixture('exists.sh');
        const { exits } = invoke('cc', 'missing.js', {}, { projectRoot: root });
        expect(exits).toEqual([2]);
    });

    it('exits 1 on path traversal rejection', () => {
        const { exits } = invoke('cc', '../escape');
        expect(exits).toEqual([1]);
    });

    it('--json success outputs structured object', () => {
        const root = fixture('validate.js');
        const { exits, lines } = invoke('cc', 'validate.js', { json: true }, { projectRoot: root });
        expect(exits).toEqual([0]);
        const raw = lines[0];
        if (!raw) throw new Error('expected output line');
        const parsed = JSON.parse(raw);
        expect(parsed.plugin).toBe('cc');
        expect(parsed.rel).toBe('validate.js');
        expect(parsed.source).toBe('project');
        expect(parsed.path).toContain('validate.js');
    });

    it('--json on invalid_args emits structured error', () => {
        const { exits, lines } = invoke('cc', '../escape', { json: true });
        expect(exits).toEqual([1]);
        const raw = lines[0];
        if (!raw) throw new Error('expected output line');
        const parsed = JSON.parse(raw);
        expect(parsed.error).toBe('invalid_args');
        expect(typeof parsed.message).toBe('string');
    });

    it('--json on not_found emits structured error with searched paths', () => {
        const root = fixture('exists.sh');
        const { exits, lines } = invoke('cc', 'missing.js', { json: true }, { projectRoot: root });
        expect(exits).toEqual([2]);
        const raw = lines[0];
        if (!raw) throw new Error('expected output line');
        const parsed = JSON.parse(raw);
        expect(parsed.error).toBe('not_found');
        expect(parsed.plugin).toBe('cc');
        expect(parsed.rel).toBe('missing.js');
        expect(Array.isArray(parsed.searched)).toBe(true);
        expect(parsed.searched.length).toBeGreaterThan(0);
    });

    it('--global flag skips project root', () => {
        const t = mkdtempSync('superskill-spa-');
        tmpDir = t;
        const home = join(t, 'home');
        const root = join(t, 'project');
        const d = join(home, '.agents', 'scripts', 'cc');
        mkdirSync(d, { recursive: true });
        writeFileSync(join(d, 'check.sh'), '#!/usr/bin/env bash\necho ok');

        const { exits } = invoke('cc', 'check.sh', { global: true }, { home, projectRoot: root });
        expect(exits).toEqual([0]);
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

    it('CLI action exits 1 on path traversal (covers .action arrow)', async () => {
        const program = new Command().name('superskill');
        const exits: number[] = [];
        registerScriptPath(program, {
            exit: (code) => {
                exits.push(code);
                throw new Error(`exit ${code}`);
            },
        });
        const outSpy = spyOnStream(process.stdout, 'stdout', () => {});
        const errSpy = spyOnStream(process.stderr, 'stderr', () => {});
        try {
            await program.parseAsync(['node', 'superskill', 'script', 'path', 'cc', '../escape']);
        } catch {
            // exit throws
        }
        outSpy.mockRestore();
        errSpy.mockRestore();
        expect(exits).toEqual([1]);
    });
});

/**
 * Spy on a writable stream (`process.stdout`/`process.stderr`) so that
 * output from `echo()` / `echoError()` is captured instead of leaking to
 * the terminal. Restore with `spy.mockRestore()`.
 *
 * Without the stderr spy, the non-JSON error paths in `runScriptPathAction`
 * (invalid args, not-found) leak their messages via `echoError` even though
 * the tests only assert on exit codes.
 */
function spyOnStream(
    stream: typeof process.stdout | typeof process.stderr,
    _label: 'stdout' | 'stderr',
    capture: (line: string) => void,
) {
    return spyOn(stream, 'write').mockImplementation((data: unknown) => {
        capture(String(data));
        return true;
    });
}
