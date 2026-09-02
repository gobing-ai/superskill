import { afterEach, describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
    type InstallManifestV1,
    installManifestPath,
    listRegularFilesUnder,
    readInstallManifest,
    snapshotFiles,
    writeInstallManifest,
} from '../../src/operations/install-manifest';
import { computeContentHash, computeStructuredContentHash } from '../../src/skills-ecosystem/locks';

describe('install-manifest', () => {
    const dirs: string[] = [];

    afterEach(() => {
        for (const dir of dirs.splice(0)) {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    function tmp(prefix: string): string {
        const dir = mkdtempSync(join(tmpdir(), prefix));
        dirs.push(dir);
        return dir;
    }

    function sampleManifest(
        overrides: Partial<InstallManifestV1> & { plugin: string; target: string },
    ): InstallManifestV1 {
        const empty = snapshotFiles(tmp('empty-snap-'), []);
        return {
            schemaVersion: 1,
            channel: 'marketplace',
            upstreamVersion: '1.2.3',
            installedAt: '2026-08-31T18:00:00.000Z',
            superskillVersion: '0.3.19',
            installed: empty,
            upstream: empty,
            ...overrides,
        };
    }

    it('derives a plugin-keyed path under the scope root and rejects unsafe segments', () => {
        const scope = tmp('manifest-path-');
        expect(installManifestPath(scope, 'codex', 'cc')).toBe(
            join(scope, '.superskill', 'manifests', 'codex', 'cc', '.superskill-manifest.json'),
        );
        expect(() => installManifestPath(scope, '../x', 'cc')).toThrow('single path segment');
        expect(() => installManifestPath(scope, 'codex', 'cc/../x')).toThrow('single path segment');
    });

    it('snapshots regular files with slash-normalized paths and ADR-031 hashes', () => {
        const root = tmp('snap-root-');
        mkdirSync(join(root, 'skills', 'cc-a'), { recursive: true });
        writeFileSync(join(root, 'skills', 'cc-a', 'SKILL.md'), '# skill a\n');
        writeFileSync(join(root, 'z.md'), 'zzz');
        writeFileSync(join(root, 'a.md'), 'aaa');
        const snapshot = snapshotFiles(root, [
            join(root, 'z.md'),
            join(root, 'a.md'),
            join(root, 'skills', 'cc-a', 'SKILL.md'),
            join(root, 'z.md'),
        ]);
        expect(Object.keys(snapshot.files)).toEqual(['a.md', 'skills/cc-a/SKILL.md', 'z.md']);
        expect(snapshot.files['a.md']).toBe(computeContentHash(readFileSync(join(root, 'a.md'))));
        expect(snapshot.canonicalHash).toBe(
            computeStructuredContentHash([
                { path: 'a.md', contents: readFileSync(join(root, 'a.md')) },
                { path: 'skills/cc-a/SKILL.md', contents: readFileSync(join(root, 'skills', 'cc-a', 'SKILL.md')) },
                { path: 'z.md', contents: readFileSync(join(root, 'z.md')) },
            ]),
        );
    });

    it('orders snapshot entries by raw UTF-8 path bytes, not locale sort', () => {
        const root = tmp('snap-order-');
        writeFileSync(join(root, 'A.md'), 'A');
        writeFileSync(join(root, 'a.md'), 'a');
        const snapshot = snapshotFiles(root, [join(root, 'a.md'), join(root, 'A.md')]);
        expect(Object.keys(snapshot.files)).toEqual(['A.md', 'a.md']);
    });

    it('skips symlinks, directory-symlinks, and special files, and rejects paths that escape the root', () => {
        const root = tmp('snap-skip-');
        const outside = tmp('snap-out-');
        mkdirSync(join(root, 'realdir'), { recursive: true });
        writeFileSync(join(root, 'keep.md'), 'keep');
        writeFileSync(join(root, 'realdir', 'nested.md'), 'nested');
        writeFileSync(join(outside, 'secret.md'), 'nope');
        symlinkSync(join(outside, 'secret.md'), join(root, 'link.md'));
        symlinkSync(join(root, 'realdir'), join(root, 'linkdir'));
        const fifo = join(root, 'pipe.fifo');
        const mkfifo = spawnSync('mkfifo', [fifo], { encoding: 'utf-8' });
        expect(mkfifo.status).toBe(0);
        const snapshot = snapshotFiles(root, [
            join(root, 'keep.md'),
            join(root, 'link.md'),
            join(root, 'linkdir'),
            join(root, 'realdir'),
            fifo,
        ]);
        expect(Object.keys(snapshot.files)).toEqual(['keep.md', 'realdir/nested.md']);
        expect(listRegularFilesUnder(root)).toEqual([join(root, 'keep.md'), join(root, 'realdir', 'nested.md')]);
        expect(() => snapshotFiles(root, [join(outside, 'secret.md')])).toThrow(/escapes scope root/);
    });

    it('lists upstream regular files while skipping .git, node_modules, .rulesync, and .targets', () => {
        const root = tmp('list-up-');
        mkdirSync(join(root, '.git'), { recursive: true });
        mkdirSync(join(root, 'node_modules', 'x'), { recursive: true });
        mkdirSync(join(root, '.rulesync'), { recursive: true });
        mkdirSync(join(root, '.targets', 'codex'), { recursive: true });
        mkdirSync(join(root, 'skills'), { recursive: true });
        writeFileSync(join(root, '.git', 'HEAD'), 'ref');
        writeFileSync(join(root, 'node_modules', 'x', 'index.js'), 'mod');
        writeFileSync(join(root, '.rulesync', 'staged.md'), 'staged');
        writeFileSync(join(root, '.targets', 'codex', 'x.md'), 'target');
        writeFileSync(join(root, 'skills', 'a.md'), 'skill');
        const files = listRegularFilesUnder(root);
        expect(files).toEqual([join(root, 'skills', 'a.md')]);
    });

    it('removes the sibling temp file when rename cannot replace the destination', () => {
        const scope = tmp('write-fail-');
        const dest = installManifestPath(scope, 'codex', 'cc');
        mkdirSync(dest, { recursive: true });
        writeFileSync(join(dest, 'blocker'), 'cannot-replace-dir');
        expect(() =>
            writeInstallManifest(scope, 'codex', 'cc', sampleManifest({ plugin: 'cc', target: 'codex' })),
        ).toThrow();
        expect(readdirSync(dirname(dest)).filter((n) => n.endsWith('.tmp'))).toEqual([]);
    });

    it('writes atomically, replacing the previous manifest without deleting first', () => {
        const scope = tmp('write-atom-');
        const first = sampleManifest({ plugin: 'cc', target: 'codex', upstreamVersion: '1.0.0' });
        const path = writeInstallManifest(scope, 'codex', 'cc', first);
        expect(readInstallManifest(path).upstreamVersion).toBe('1.0.0');
        const second = sampleManifest({ plugin: 'cc', target: 'codex', upstreamVersion: '2.0.0' });
        writeInstallManifest(scope, 'codex', 'cc', second);
        expect(readInstallManifest(path).upstreamVersion).toBe('2.0.0');
        const leftover = readdirSync(join(scope, '.superskill', 'manifests', 'codex', 'cc')).filter((n) =>
            n.endsWith('.tmp'),
        );
        expect(leftover).toEqual([]);
    });

    it('keeps two plugins under one target in distinct files', () => {
        const scope = tmp('two-plugins-');
        writeInstallManifest(scope, 'codex', 'alpha', sampleManifest({ plugin: 'alpha', target: 'codex' }));
        writeInstallManifest(scope, 'codex', 'beta', sampleManifest({ plugin: 'beta', target: 'codex' }));
        expect(readInstallManifest(installManifestPath(scope, 'codex', 'alpha')).plugin).toBe('alpha');
        expect(readInstallManifest(installManifestPath(scope, 'codex', 'beta')).plugin).toBe('beta');
    });

    it('keeps two targets for one plugin in distinct files', () => {
        const scope = tmp('two-targets-');
        writeInstallManifest(scope, 'codex', 'cc', sampleManifest({ plugin: 'cc', target: 'codex' }));
        writeInstallManifest(scope, 'pi', 'cc', sampleManifest({ plugin: 'cc', target: 'pi' }));
        expect(readInstallManifest(installManifestPath(scope, 'codex', 'cc')).target).toBe('codex');
        expect(readInstallManifest(installManifestPath(scope, 'pi', 'cc')).target).toBe('pi');
    });

    it('rejects a corrupt manifest and a plugin/target mismatch on write', () => {
        const scope = tmp('corrupt-');
        const path = join(scope, 'broken.json');
        writeFileSync(path, '{not json');
        expect(() => readInstallManifest(path)).toThrow(/not valid JSON/);
        expect(() => readInstallManifest(join(scope, 'missing.json'))).toThrow(/not found/);
        expect(() =>
            writeInstallManifest(scope, 'codex', 'cc', sampleManifest({ plugin: 'other', target: 'codex' })),
        ).toThrow(/does not match path segment/);
        expect(() =>
            writeInstallManifest(scope, 'codex', 'cc', sampleManifest({ plugin: 'cc', target: 'pi' })),
        ).toThrow(/does not match path segment/);
    });

    it('expands directories, relative paths, and skips the manifest file itself', () => {
        const root = tmp('snap-dir-');
        mkdirSync(join(root, 'skills', 'cc-a'), { recursive: true });
        writeFileSync(join(root, 'skills', 'cc-a', 'SKILL.md'), '# a\n');
        mkdirSync(join(root, '.superskill', 'manifests', 'codex', 'cc'), { recursive: true });
        writeFileSync(join(root, '.superskill', 'manifests', 'codex', 'cc', '.superskill-manifest.json'), '{}');
        writeFileSync(join(root, 'skills', 'cc-a', '.superskill-manifest.json'), '{}');
        const snapshot = snapshotFiles(root, [
            'skills',
            '.superskill/manifests/codex/cc/.superskill-manifest.json',
            'skills/cc-a/.superskill-manifest.json',
        ]);
        expect(Object.keys(snapshot.files)).toEqual(['skills/cc-a/SKILL.md']);
        expect(() => snapshotFiles(root, [join(root, 'nope.md')])).toThrow(/missing file/);
        expect(listRegularFilesUnder(join(root, 'absent'))).toEqual([]);
        expect(listRegularFilesUnder(join(root, 'skills', 'cc-a', 'SKILL.md'))).toEqual([]);
        expect(listRegularFilesUnder(root, { skipDirNames: new Set(['skills']) })).toEqual([
            join(root, '.superskill', 'manifests', 'codex', 'cc', '.superskill-manifest.json'),
        ]);
    });

    it('round-trips optional locator and resolvedRef, and rejects invalid schema', () => {
        const scope = tmp('schema-');
        const written = writeInstallManifest(
            scope,
            'codex',
            'cc',
            sampleManifest({
                plugin: 'cc',
                target: 'codex',
                channel: 'bundled',
                marketplaceLocator: '/tmp/market',
                resolvedRef: 'abc123',
            }),
        );
        const read = readInstallManifest(written);
        expect(read.channel).toBe('bundled');
        expect(read.marketplaceLocator).toBe('/tmp/market');
        expect(read.resolvedRef).toBe('abc123');

        const bad = join(scope, 'bad.json');
        const cases: unknown[] = [
            null,
            { schemaVersion: 2, plugin: 'cc', target: 'codex', channel: 'marketplace' },
            {
                schemaVersion: 1,
                plugin: 'cc',
                target: 'codex',
                channel: 'nightly',
                upstreamVersion: '1',
                installedAt: 't',
                superskillVersion: '1',
                installed: { files: {}, canonicalHash: 'a'.repeat(64) },
                upstream: { files: {}, canonicalHash: 'a'.repeat(64) },
            },
            {
                schemaVersion: 1,
                plugin: 'cc',
                target: 'codex',
                channel: 'marketplace',
                upstreamVersion: '1',
                installedAt: 't',
                superskillVersion: '1',
                installed: null,
                upstream: { files: {}, canonicalHash: 'a'.repeat(64) },
            },
            {
                schemaVersion: 1,
                plugin: 'cc',
                target: 'codex',
                channel: 'marketplace',
                upstreamVersion: '1',
                installedAt: 't',
                superskillVersion: '1',
                installed: { files: {}, canonicalHash: 'nope' },
                upstream: { files: {}, canonicalHash: 'a'.repeat(64) },
            },
            {
                schemaVersion: 1,
                plugin: 'cc',
                target: 'codex',
                channel: 'marketplace',
                upstreamVersion: '1',
                installedAt: 't',
                superskillVersion: '1',
                installed: { files: [], canonicalHash: 'a'.repeat(64) },
                upstream: { files: {}, canonicalHash: 'a'.repeat(64) },
            },
            {
                schemaVersion: 1,
                plugin: 'cc',
                target: 'codex',
                channel: 'marketplace',
                upstreamVersion: '1',
                installedAt: 't',
                superskillVersion: '1',
                installed: { files: { '../x': 'a'.repeat(64) }, canonicalHash: 'a'.repeat(64) },
                upstream: { files: {}, canonicalHash: 'a'.repeat(64) },
            },
            {
                schemaVersion: 1,
                plugin: 'cc',
                target: 'codex',
                channel: 'marketplace',
                upstreamVersion: '1',
                installedAt: 't',
                superskillVersion: '1',
                installed: { files: { 'a.md': 'short' }, canonicalHash: 'a'.repeat(64) },
                upstream: { files: {}, canonicalHash: 'a'.repeat(64) },
            },
            {
                schemaVersion: 1,
                plugin: '',
                target: 'codex',
                channel: 'marketplace',
                upstreamVersion: '1',
                installedAt: 't',
                superskillVersion: '1',
                installed: { files: {}, canonicalHash: 'a'.repeat(64) },
                upstream: { files: {}, canonicalHash: 'a'.repeat(64) },
            },
            {
                schemaVersion: 1,
                plugin: '../cc',
                target: 'codex',
                channel: 'marketplace',
                upstreamVersion: '1',
                installedAt: '2026-08-31T18:00:00.000Z',
                superskillVersion: '1',
                installed: { files: {}, canonicalHash: 'a'.repeat(64) },
                upstream: { files: {}, canonicalHash: 'a'.repeat(64) },
            },
            {
                schemaVersion: 1,
                plugin: 'cc',
                target: 'codex',
                channel: 'marketplace',
                upstreamVersion: '1',
                installedAt: 't',
                superskillVersion: '1',
                marketplaceLocator: 1,
                installed: { files: {}, canonicalHash: 'a'.repeat(64) },
                upstream: { files: {}, canonicalHash: 'a'.repeat(64) },
            },
            {
                schemaVersion: 1,
                plugin: 'cc',
                target: 'codex',
                channel: 'marketplace',
                upstreamVersion: '1',
                installedAt: 't',
                superskillVersion: '1',
                resolvedRef: '',
                installed: { files: {}, canonicalHash: 'a'.repeat(64) },
                upstream: { files: {}, canonicalHash: 'a'.repeat(64) },
            },
            {
                schemaVersion: 1,
                plugin: 'cc',
                target: 'codex',
                channel: 'marketplace',
                upstreamVersion: '1',
                installedAt: 't',
                superskillVersion: '1',
                installed: { files: { '\\win.md': 'a'.repeat(64) }, canonicalHash: 'a'.repeat(64) },
                upstream: { files: {}, canonicalHash: 'a'.repeat(64) },
            },
            {
                schemaVersion: 1,
                plugin: 'cc',
                target: 'codex',
                channel: 'marketplace',
                upstreamVersion: '1',
                installedAt: 't',
                superskillVersion: '1',
                installed: { files: { '/abs.md': 'a'.repeat(64) }, canonicalHash: 'a'.repeat(64) },
                upstream: { files: {}, canonicalHash: 'a'.repeat(64) },
            },
            {
                schemaVersion: 1,
                plugin: 'cc',
                target: 'codex',
                channel: 'marketplace',
                upstreamVersion: '1',
                installedAt: '2026-08-31T18:00:00.000Z',
                superskillVersion: '1',
                installed: { files: { '': 'a'.repeat(64) }, canonicalHash: 'a'.repeat(64) },
                upstream: { files: {}, canonicalHash: 'a'.repeat(64) },
            },
        ];
        for (const body of cases) {
            writeFileSync(bad, `${JSON.stringify(body)}\n`);
            expect(() => readInstallManifest(bad)).toThrow(/Install (manifest|snapshot)/);
        }
    });
});
