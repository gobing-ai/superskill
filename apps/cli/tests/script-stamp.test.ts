import { afterEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeContentHash } from '@gobing-ai/superskill-core';
import {
    diffScriptFiles,
    isReservedStampRel,
    readScriptStamp,
    SCRIPT_STAMP_FILENAME,
    snapshotScriptRootFiles,
    writeScriptStamp,
} from '../src/script-stamp';

let tmpDir: string;

afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

interface Fixture {
    projectRoot: string;
    home: string;
    projectScripts: string;
    globalScripts: string;
}

/** Sandbox with a project root and a fake home; both plugin script roots exist as paths only. */
function setup(): Fixture {
    tmpDir = mkdtempSync('superskill-script-verify-');
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

describe('script stamp reader/writer', () => {
    it('round-trips a stamp and writes a stable sorted map with no temp leftovers', () => {
        const { projectScripts } = setup();
        seedFiles(projectScripts, { 'util/zz.js': 'z', 'util/aa.js': 'a' });

        const written = writeScriptStamp(projectScripts, {
            plugin: 'cc',
            upstreamVersion: '1.2.3',
            resolvedRef: 'cafe',
            superskillVersion: '9.9.9',
            installedAt: '2026-09-27T00:00:00.000Z',
            files: { 'util/zz.js': 'b'.repeat(64), 'util/aa.js': 'a'.repeat(64) },
        });

        expect(written).toBe(join(projectScripts, SCRIPT_STAMP_FILENAME));
        expect(readdirSync(projectScripts).filter((entry) => entry.endsWith('.tmp'))).toEqual([]);
        const raw = readFileSync(written, 'utf-8');
        expect(raw.endsWith('\n')).toBe(true);
        // Key order is byte-sorted, so two installs with the same content produce identical bytes.
        expect(raw.indexOf('util/aa.js')).toBeLessThan(raw.indexOf('util/zz.js'));

        const read = readScriptStamp(projectScripts, 'cc');
        expect(read.status).toBe('ok');
        if (read.status !== 'ok') throw new Error('expected ok');
        expect(read.stamp.files).toEqual({ 'util/aa.js': 'a'.repeat(64), 'util/zz.js': 'b'.repeat(64) });
        expect(read.stamp.resolvedRef).toBe('cafe');
    });

    it('distinguishes a missing stamp from an unusable one', () => {
        const { projectScripts } = setup();
        expect(readScriptStamp(projectScripts, 'cc')).toEqual({ status: 'missing' });

        const bad = [
            '{ not json',
            JSON.stringify({ schemaVersion: 1 }),
            JSON.stringify({ schemaVersion: 2, plugin: 'cc' }),
            JSON.stringify({
                schemaVersion: 1,
                plugin: 'cc',
                upstreamVersion: '1.0.0',
                superskillVersion: '9.9.9',
                installedAt: '2026-09-27T00:00:00.000Z',
                files: { 'util/a.js': 'NOTHEX' },
            }),
            // A stamp that names itself in its own file map is never a usable baseline.
            JSON.stringify({
                schemaVersion: 1,
                plugin: 'cc',
                upstreamVersion: '1.0.0',
                superskillVersion: '9.9.9',
                installedAt: '2026-09-27T00:00:00.000Z',
                files: { [SCRIPT_STAMP_FILENAME]: 'a'.repeat(64) },
            }),
            // Escaping / non-slash-normalized keys are rejected too.
            JSON.stringify({
                schemaVersion: 1,
                plugin: 'cc',
                upstreamVersion: '1.0.0',
                superskillVersion: '9.9.9',
                installedAt: '2026-09-27T00:00:00.000Z',
                files: { '../escape.js': 'a'.repeat(64) },
            }),
        ];
        for (const body of bad) {
            mkdirSync(projectScripts, { recursive: true });
            writeFileSync(join(projectScripts, SCRIPT_STAMP_FILENAME), body);
            expect(readScriptStamp(projectScripts, 'cc').status).toBe('invalid');
        }
        // A valid stamp for a different plugin is unusable for this one.
        writeStampFor(projectScripts, { 'util/a.js': 'a' });
        expect(readScriptStamp(projectScripts, 'cc').status).toBe('ok');
        expect(readScriptStamp(projectScripts, 'other').status).toBe('invalid');
    });

    it('refuses to write a stamp whose file map is not a valid baseline', () => {
        const { projectScripts } = setup();
        expect(() =>
            writeScriptStamp(projectScripts, {
                plugin: 'cc',
                upstreamVersion: '1.2.3',
                superskillVersion: '9.9.9',
                installedAt: '2026-09-27T00:00:00.000Z',
                files: { '../escape.js': 'a'.repeat(64) },
            }),
        ).toThrow(/invalid script stamp/);
        expect(readScriptStamp(projectScripts, 'cc').status).toBe('missing');
    });

    it('rejects a parsed plugin identity that could not be a directory segment', () => {
        const { projectScripts } = setup();
        mkdirSync(projectScripts, { recursive: true });
        writeFileSync(
            join(projectScripts, SCRIPT_STAMP_FILENAME),
            JSON.stringify({
                schemaVersion: 1,
                plugin: '..',
                upstreamVersion: '1.0.0',
                superskillVersion: '9.9.9',
                installedAt: '2026-09-27T00:00:00.000Z',
                files: {},
            }),
        );
        expect(readScriptStamp(projectScripts, '..').status).toBe('invalid');
    });

    it('snapshots regular files only, excluding the stamp itself and symlinks', () => {
        const { projectScripts } = setup();
        seedFiles(projectScripts, { 'util/a.js': 'a' });
        writeStampFor(projectScripts, { 'util/a.js': 'a' });
        symlinkSync(join(projectScripts, 'util', 'a.js'), join(projectScripts, 'linked.js'));

        expect(snapshotScriptRootFiles(projectScripts)).toEqual({
            'util/a.js': computeContentHash(Buffer.from('a')),
        });
        expect(snapshotScriptRootFiles(join(tmpDir, 'absent'))).toEqual({});
    });

    it('diffs snapshots into sorted added/removed/changed lists', () => {
        const diff = diffScriptFiles(
            { 'a.js': 'one', 'gone.js': 'x', 'keep.js': 'same' },
            { 'a.js': 'two', 'added.js': 'y', 'keep.js': 'same' },
        );
        expect(diff).toEqual({ added: ['added.js'], removed: ['gone.js'], changed: ['a.js'] });
    });

    it('reserves only the root-level stamp filename, including ./-normalized spellings', () => {
        expect(isReservedStampRel(SCRIPT_STAMP_FILENAME)).toBe(true);
        expect(isReservedStampRel(`./${SCRIPT_STAMP_FILENAME}`)).toBe(true);
        expect(isReservedStampRel('.\\' + SCRIPT_STAMP_FILENAME)).toBe(true);
        expect(isReservedStampRel(`nested/${SCRIPT_STAMP_FILENAME}`)).toBe(false);
        expect(isReservedStampRel('util/a.js')).toBe(false);
    });
});
