import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { computeContentHash } from '@gobing-ai/superskill-core';
import { Command } from 'commander';
import {
    registerScriptVerify,
    runScriptVerifyAction,
    selectScriptVerifyRoot,
    verifyScriptStamp,
} from '../../src/commands/script-verify';
import { SCRIPT_STAMP_FILENAME, writeScriptStamp } from '../../src/script-stamp';

const tmpDirs: string[] = [];

afterEach(() => {
    for (const dir of tmpDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

interface Fixture {
    projectRoot: string;
    home: string;
    projectScripts: string;
    globalScripts: string;
}

/** Sandbox with a project root and a fake home; both plugin script roots exist as paths only. */
function setup(): Fixture {
    const tmpDir = mkdtempSync(join(tmpdir(), 'superskill-script-verify-'));
    tmpDirs.push(tmpDir);
    const projectRoot = join(tmpDir, 'project');
    const home = join(tmpDir, 'home');
    return {
        projectRoot,
        home,
        projectScripts: join(projectRoot, '.agents', 'scripts', 'cc'),
        globalScripts: join(home, '.agents', 'scripts', 'cc'),
    };
}

function seedFiles(scriptRoot: string, files: Record<string, string>): void {
    for (const [rel, content] of Object.entries(files)) {
        const abs = join(scriptRoot, rel);
        mkdirSync(join(abs, '..'), { recursive: true });
        writeFileSync(abs, content);
    }
}

function hashes(files: Record<string, string>): Record<string, string> {
    return Object.fromEntries(
        Object.entries(files).map(([rel, content]) => [rel, computeContentHash(Buffer.from(content))]),
    );
}

/** Write the stamp exactly as install does: hashes of the staged bytes, sorted map. */
function writeStampFor(scriptRoot: string, files: Record<string, string>): void {
    writeScriptStamp(scriptRoot, {
        plugin: 'cc',
        upstreamVersion: '1.2.3',
        superskillVersion: '9.9.9',
        installedAt: '2026-09-27T00:00:00.000Z',
        files: hashes(files),
    });
}

/** Call runScriptVerifyAction with a throw-on-exit callback and capture stdout/stderr. */
function invoke(
    plugin: string,
    options: { json?: boolean; global?: boolean; project?: boolean } = {},
    overrides?: { home?: string; projectRoot?: string },
): { exits: number[]; lines: string[]; errors: string[] } {
    const exits: number[] = [];
    const lines: string[] = [];
    const errors: string[] = [];
    const outSpy = spyOnStream(process.stdout, (l) => lines.push(l));
    const errSpy = spyOnStream(process.stderr, (l) => errors.push(l));
    try {
        runScriptVerifyAction(
            plugin,
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

function spyOnStream(stream: typeof process.stdout | typeof process.stderr, capture: (line: string) => void) {
    return spyOn(stream, 'write').mockImplementation((data: unknown) => {
        capture(String(data));
        return true;
    });
}

describe('script verify', () => {
    it('0149 AC3: a fresh install verifies clean and exits 0', () => {
        const { projectRoot, home, projectScripts } = setup();
        const files = { 'util/a.js': 'a', 'util/b.js': 'b' };
        seedFiles(projectScripts, files);
        writeStampFor(projectScripts, files);

        const { exits, lines } = invoke('cc', { json: true }, { home, projectRoot });
        expect(exits).toEqual([0]);
        expect(JSON.parse(lines[0] ?? '{}')).toEqual({
            plugin: 'cc',
            source: 'project',
            status: 'ok',
            added: [],
            removed: [],
            changed: [],
        });

        const human = invoke('cc', {}, { home, projectRoot });
        expect(human.exits).toEqual([0]);
        expect(human.lines.join('')).toContain("Script stamp verified: 'cc' (project)");
    });

    it('0149 AC3: editing, adding, and deleting one staged file reports sorted drift and exits 2', () => {
        const { projectRoot, home, projectScripts } = setup();
        const baseline = { 'util/a.js': 'a', 'util/b.js': 'b', 'util/gone.js': 'g' };
        seedFiles(projectScripts, baseline);
        writeStampFor(projectScripts, baseline);
        // Edit one, add two (out of order on purpose), delete one.
        writeFileSync(join(projectScripts, 'util', 'a.js'), 'a-edited');
        seedFiles(projectScripts, { 'util/zz.js': 'z', 'util/added.js': 'n' });
        rmSync(join(projectScripts, 'util', 'gone.js'));

        const json = invoke('cc', { json: true }, { home, projectRoot });
        expect(json.exits).toEqual([2]);
        const parsed = JSON.parse(json.lines[0] ?? '{}');
        expect(parsed.status).toBe('drift');
        expect(parsed.changed).toEqual(['util/a.js']);
        expect(parsed.added).toEqual(['util/added.js', 'util/zz.js']);
        expect(parsed.removed).toEqual(['util/gone.js']);

        const human = invoke('cc', {}, { home, projectRoot });
        expect(human.exits).toEqual([2]);
        const report = human.errors.join('');
        expect(report).toContain('changed util/a.js');
        expect(report).toContain('added util/zz.js');
        expect(report).toContain('removed util/gone.js');
        expect(report).toContain('Reinstall to refresh');
    });

    it('0149 F1 (regression): an unreadable staged file is an unreadable diagnostic at exit 2, not a raw filesystem error', () => {
        const { projectRoot, home, projectScripts } = setup();
        const files = { 'util/a.js': 'a', 'util/b.js': 'b' };
        seedFiles(projectScripts, files);
        writeStampFor(projectScripts, files);
        const unreadable = join(projectScripts, 'util', 'b.js');
        // A staged file the verifier cannot read: the snapshot throws EACCES out of the walker.
        chmodSync(unreadable, 0o000);
        try {
            const json = invoke('cc', { json: true }, { home, projectRoot });
            expect(json.exits).toEqual([2]);
            const parsed = JSON.parse(json.lines[0] ?? '{}');
            expect(parsed).toMatchObject({
                plugin: 'cc',
                source: 'project',
                status: 'unreadable',
                added: [],
                removed: [],
                changed: [],
            });
            expect(typeof parsed.error).toBe('string');

            const human = invoke('cc', {}, { home, projectRoot });
            expect(human.exits).toEqual([2]);
            const report = human.errors.join('');
            expect(report).toContain('staged script files could not be read');
            expect(report).toContain('b.js');
        } finally {
            chmodSync(unreadable, 0o644);
        }
    });

    it('0149 AC3: missing root, missing stamp, and invalid stamp all exit 2 with a status', () => {
        const { projectRoot, home, projectScripts } = setup();

        // Neither default root exists.
        const noRoot = invoke('cc', { json: true }, { home, projectRoot });
        expect(noRoot.exits).toEqual([2]);
        expect(JSON.parse(noRoot.lines[0] ?? '{}')).toEqual({
            plugin: 'cc',
            source: null,
            status: 'missing_root',
            added: [],
            removed: [],
            changed: [],
        });

        // Project tree exists, never stamped.
        seedFiles(projectScripts, { 'util/a.js': 'a' });
        const noStamp = invoke('cc', { json: true }, { home, projectRoot });
        expect(noStamp.exits).toEqual([2]);
        expect(JSON.parse(noStamp.lines[0] ?? '{}').status).toBe('missing_stamp');
        expect(JSON.parse(noStamp.lines[0] ?? '{}').source).toBe('project');
        const noStampHuman = invoke('cc', {}, { home, projectRoot });
        expect(noStampHuman.errors.join('')).toContain('Reinstall to write a usable stamp');

        // Corrupt JSON, then a wrong-plugin stamp.
        writeFileSync(join(projectScripts, SCRIPT_STAMP_FILENAME), '{ not json');
        const invalid = invoke('cc', { json: true }, { home, projectRoot });
        expect(invalid.exits).toEqual([2]);
        expect(JSON.parse(invalid.lines[0] ?? '{}').status).toBe('invalid_stamp');
        expect(invalid.errors.join('')).toContain('an invalid script stamp');

        writeFileSync(
            join(projectScripts, SCRIPT_STAMP_FILENAME),
            JSON.stringify({
                schemaVersion: 1,
                plugin: 'other',
                upstreamVersion: '1.0.0',
                superskillVersion: '9.9.9',
                installedAt: '2026-09-27T00:00:00.000Z',
                files: {},
            }),
        );
        expect(JSON.parse(invoke('cc', { json: true }, { home, projectRoot }).lines[0] ?? '{}').status).toBe(
            'invalid_stamp',
        );
    });

    it('0149 AC3: a stamp-less project tree is an error, never a silent global fallback', () => {
        const { projectRoot, home, projectScripts, globalScripts } = setup();
        seedFiles(projectScripts, { 'util/a.js': 'project' });
        const globalFiles = { 'util/a.js': 'global' };
        seedFiles(globalScripts, globalFiles);
        writeStampFor(globalScripts, globalFiles);

        const result = verifyScriptStamp('cc', { home, projectRoot });
        expect(result.status).toBe('missing_stamp');
        expect(result.source).toBe('project');
    });

    it('0149 AC3: an explicit scope never falls back to the other root', () => {
        const { projectRoot, home, projectScripts } = setup();
        const files = { 'util/a.js': 'a' };
        seedFiles(projectScripts, files);
        writeStampFor(projectScripts, files);

        const forcedGlobal = invoke('cc', { global: true, json: true }, { home, projectRoot });
        expect(forcedGlobal.exits).toEqual([2]);
        expect(JSON.parse(forcedGlobal.lines[0] ?? '{}')).toMatchObject({
            status: 'missing_root',
            source: 'global',
        });

        const forcedProject = invoke('cc', { project: true, json: true }, { home, projectRoot });
        expect(forcedProject.exits).toEqual([0]);
        expect(JSON.parse(forcedProject.lines[0] ?? '{}')).toMatchObject({
            status: 'ok',
            source: 'project',
        });

        // Explicit project scope on an absent project root does not silently verify global.
        const { projectRoot: emptyProject, home: otherHome, globalScripts } = setup();
        seedFiles(globalScripts, files);
        writeStampFor(globalScripts, files);
        const explicitProject = invoke(
            'cc',
            { project: true, json: true },
            { home: otherHome, projectRoot: emptyProject },
        );
        expect(explicitProject.exits).toEqual([2]);
        expect(JSON.parse(explicitProject.lines[0] ?? '{}').status).toBe('missing_root');
    });

    it('0149 AC3: default root selection uses the global tree when no project tree exists', () => {
        const { projectRoot, home, globalScripts } = setup();
        const files = { 'util/a.js': 'a' };
        seedFiles(globalScripts, files);
        writeStampFor(globalScripts, files);

        const selection = selectScriptVerifyRoot('cc', { home, projectRoot });
        expect(selection).toEqual({ source: 'global', root: globalScripts });
        const result = invoke('cc', { json: true }, { home, projectRoot });
        expect(result.exits).toEqual([0]);
        expect(JSON.parse(result.lines[0] ?? '{}').source).toBe('global');
    });

    it('0149 AC3: conflicting scope flags and unsafe plugin names are usage errors (exit 1)', () => {
        const { projectRoot, home } = setup();

        const conflict = invoke('cc', { project: true, global: true, json: true }, { home, projectRoot });
        expect(conflict.exits).toEqual([1]);
        const parsed = JSON.parse(conflict.lines[0] ?? '{}');
        expect(parsed.error).toBe('invalid_args');
        expect(parsed.message).toContain('mutually exclusive');
        expect(conflict.errors.join('')).toContain('mutually exclusive');

        for (const plugin of ['../cc', 'cc/evil', '']) {
            const unsafe = invoke(plugin, { json: true }, { home, projectRoot });
            expect(unsafe.exits).toEqual([1]);
            expect(JSON.parse(unsafe.lines[0] ?? '{}').error).toBe('invalid_args');
        }
    });

    it('registers verify under the script group and routes the CLI action', async () => {
        const fresh = new Command().name('superskill');
        registerScriptVerify(fresh);
        const freshGroup = fresh.commands.find((c) => c.name() === 'script');
        expect(freshGroup?.commands.some((c) => c.name() === 'verify')).toBe(true);

        const existing = new Command().name('superskill');
        existing.command('script').description('Plugin script utilities');
        registerScriptVerify(existing);
        const group = existing.commands.find((c) => c.name() === 'script');
        const verifyCmd = group?.commands.find((c) => c.name() === 'verify');
        expect(verifyCmd?.options.some((o) => o.long === '--json')).toBe(true);
        expect(verifyCmd?.registeredArguments.some((a) => a.name() === 'plugin')).toBe(true);

        const exits: number[] = [];
        const program = new Command().name('superskill');
        registerScriptVerify(program, {
            exit: (code) => {
                exits.push(code);
                throw new Error(`exit ${code}`);
            },
        });
        const outSpy = spyOnStream(process.stdout, () => {});
        const errSpy = spyOnStream(process.stderr, () => {});
        try {
            await program.parseAsync(['node', 'superskill', 'script', 'verify', 'cc', '--project', '--global']);
        } catch {
            // exit throws
        }
        outSpy.mockRestore();
        errSpy.mockRestore();
        expect(exits).toEqual([1]);
    });
});
