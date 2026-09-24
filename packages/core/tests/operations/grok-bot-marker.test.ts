/**
 * Behavior tests for the ownership-marker helpers moved out of grok-bot.ts (task 0146
 * R13): hashing primitives, recursive regular-file listing, marker build/read/validate,
 * and marker-hash freshness. Integration-level marker flows stay covered in
 * grok-bot.test.ts through the re-exported surface.
 */
import { afterEach, describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BOT_ORIGIN_MARKER, type BotSkillEntry, GrokBotPreflightError } from '../../src/operations/grok-bot';
import {
    buildMarker,
    listRegularFilesRel,
    markerHashesCurrent,
    readOriginMarker,
    sha256File,
    sha256Text,
} from '../../src/operations/grok-bot-marker';

function tempTree(): string {
    return mkdtempSync(join(tmpdir(), 'grok-marker-'));
}

function entry(overrides?: Partial<BotSkillEntry>): BotSkillEntry {
    return {
        id: 'demo',
        description: 'Demo skill',
        skillMd: '---\nname: demo\n---\nDemo body.',
        files: new Map([['logo.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xff, 0x00])]]),
        ...overrides,
    };
}

const tempDirs: string[] = [];
function trackedTree(): string {
    const dir = tempTree();
    tempDirs.push(dir);
    return dir;
}
afterEach(() => {
    while (tempDirs.length) rmSync(tempDirs.pop() as string, { recursive: true, force: true });
});

describe('hashing primitives', () => {
    it('sha256Text matches the NIST vectors for empty and abc inputs', () => {
        expect(sha256Text('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
        expect(sha256Text('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    });

    it('sha256File hashes raw file bytes: text matches the vector, binary is deterministic', () => {
        const dir = trackedTree();
        const textPath = join(dir, 'abc.txt');
        writeFileSync(textPath, 'abc');
        expect(sha256File(textPath)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');

        const binPath = join(dir, 'logo.bin');
        const bytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff]);
        writeFileSync(binPath, bytes);
        expect(sha256File(binPath)).toBe(sha256File(binPath));
        writeFileSync(binPath, Uint8Array.from([0x89, 0x50]));
        expect(sha256File(binPath)).not.toBe(sha256File(textPath));
    });
});

describe('listRegularFilesRel', () => {
    it('lists nested regular files as sorted /-joined relative paths and skips symlinks', () => {
        const dir = trackedTree();
        mkdirSync(join(dir, 'sub', 'deep'), { recursive: true });
        mkdirSync(join(dir, 'empty'));
        writeFileSync(join(dir, 'sub', 'b.txt'), 'b');
        writeFileSync(join(dir, 'a.txt'), 'a');
        writeFileSync(join(dir, '.hidden'), 'h');
        writeFileSync(join(dir, 'sub', 'deep', 'c.txt'), 'c');
        symlinkSync(join(dir, 'a.txt'), join(dir, 'link-to-a'));

        expect(listRegularFilesRel(dir)).toEqual(['.hidden', 'a.txt', 'sub/b.txt', 'sub/deep/c.txt']);
    });
});

describe('buildMarker', () => {
    it('emits stable JSON with schemaVersion 1 and per-file SHA-256 hashes', () => {
        const nowIso = '2026-01-02T03:04:05.000Z';
        const raw = buildMarker({
            plugin: 'sp',
            source: { channel: 'bundled', locator: 'sp' },
            mode: 'full',
            canonicalPath: null,
            superskillVersion: '1.2.3',
            nowIso,
            entry: entry(),
        });
        expect(raw.endsWith('\n')).toBe(true);
        const marker = JSON.parse(raw) as Record<string, unknown>;
        expect(marker.schemaVersion).toBe(1);
        expect(marker.target).toBe('grok-bot');
        expect(marker.installedAt).toBe(nowIso);
        const hashes = marker.hashes as Record<string, string>;
        expect(hashes['SKILL.md']).toBe(sha256Text(entry().skillMd));
        const logoBytes = (entry().files.get('logo.png') as Buffer).toString('latin1');
        expect(hashes['logo.png']).toBe(createHash('sha256').update(logoBytes, 'latin1').digest('hex'));
    });
});

describe('readOriginMarker', () => {
    const markerArgs = {
        plugin: 'sp',
        source: { channel: 'bundled' as const, locator: 'sp' },
        mode: 'bridge' as const,
        canonicalPath: '/skills/demo/SKILL.md',
        superskillVersion: '1.2.3',
        nowIso: '2026-01-02T03:04:05.000Z',
        entry: entry(),
    };

    it('returns null when no marker exists', () => {
        const dir = trackedTree();
        expect(readOriginMarker(dir, 'sp')).toBeNull();
    });

    it('round-trips a marker written by buildMarker', () => {
        const dir = trackedTree();
        writeFileSync(join(dir, BOT_ORIGIN_MARKER), buildMarker(markerArgs));
        expect(readOriginMarker(dir, 'sp')?.canonicalPath).toBe('/skills/demo/SKILL.md');
    });

    it('throws GrokBotPreflightError on foreign plugin ownership unless anyPlugin is set', () => {
        const dir = trackedTree();
        writeFileSync(join(dir, BOT_ORIGIN_MARKER), buildMarker(markerArgs));
        expect(() => readOriginMarker(dir, 'other')).toThrow(GrokBotPreflightError);
        expect(() => readOriginMarker(dir, 'other', { anyPlugin: true })).not.toThrow();
    });

    it('throws GrokBotPreflightError on malformed JSON and on unsupported shapes', () => {
        const dir = trackedTree();
        writeFileSync(join(dir, BOT_ORIGIN_MARKER), '{not json');
        expect(() => readOriginMarker(dir, 'sp')).toThrow(/malformed/);

        writeFileSync(
            join(dir, BOT_ORIGIN_MARKER),
            JSON.stringify({ ...JSON.parse(buildMarker(markerArgs)), schemaVersion: 99 }),
        );
        expect(() => readOriginMarker(dir, 'sp')).toThrow(/unsupported/);
    });
});

describe('markerHashesCurrent', () => {
    function installedTree(): { dir: string; markerRaw: string } {
        const dir = trackedTree();
        const skill = entry();
        writeFileSync(join(dir, 'SKILL.md'), skill.skillMd);
        writeFileSync(join(dir, 'logo.png'), skill.files.get('logo.png') as Buffer);
        return { dir, markerRaw: buildMarker({ ...markerArgs, entry: skill }) };
    }
    const markerArgs = {
        plugin: 'sp',
        source: { channel: 'bundled' as const, locator: 'sp' },
        mode: 'bridge' as const,
        canonicalPath: null,
        superskillVersion: '1.2.3',
        nowIso: '2026-01-02T03:04:05.000Z',
    };

    it('is true when the marker file plus every hashed file matches on disk', () => {
        const { dir, markerRaw } = installedTree();
        writeFileSync(join(dir, BOT_ORIGIN_MARKER), markerRaw);
        expect(markerHashesCurrent(JSON.parse(markerRaw), dir)).toBe(true);
    });

    it('is false on tampered bytes, a missing file, or an extra untracked file', () => {
        const { dir, markerRaw } = installedTree();
        writeFileSync(join(dir, BOT_ORIGIN_MARKER), markerRaw);
        const marker = JSON.parse(markerRaw);

        writeFileSync(join(dir, 'SKILL.md'), 'tampered');
        expect(markerHashesCurrent(marker, dir)).toBe(false);

        rmSync(join(dir, 'SKILL.md'));
        writeFileSync(join(dir, 'SKILL.md'), entry().skillMd);
        rmSync(join(dir, 'logo.png'));
        expect(markerHashesCurrent(marker, dir)).toBe(false);

        writeFileSync(join(dir, 'logo.png'), (entry().files.get('logo.png') as Buffer).toString('latin1'));
        writeFileSync(join(dir, 'extra.txt'), 'drift');
        expect(markerHashesCurrent(marker, dir)).toBe(false);
    });
});
