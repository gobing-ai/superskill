import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    addSkillToGlobalLock,
    addSkillToLocalLock,
    computeCanonicalSkillFolderHash,
    computeContentHash,
    computeStructuredContentHash,
    getGlobalLockPath,
    getLocalLockPath,
    isCanonicalSkillPath,
    readGlobalLock,
    readLocalLock,
    removeSkillFromGlobalLock,
    removeSkillFromLocalLock,
    writeGlobalLock,
    writeLocalLock,
} from '../../src/skills-ecosystem/locks';

describe('locks.ts - Dual lock read/writers & hash invariant', () => {
    it('isCanonicalSkillPath identifies translated paths vs canonical paths', () => {
        expect(isCanonicalSkillPath('/project/skills/my-skill')).toBe(true);
        expect(isCanonicalSkillPath('/project/.agents/skills/my-skill')).toBe(true);

        expect(isCanonicalSkillPath('/project/.hermes/skills/my-skill')).toBe(false);
        expect(isCanonicalSkillPath('/project/.grok/skills/my-skill')).toBe(false);
        expect(isCanonicalSkillPath('/project/translated/skills/my-skill')).toBe(false);
    });

    it('enforces hash invariant: throws if provided translated path', async () => {
        const fakeDir = join(tmpdir(), `test-lock-hash-${Date.now()}`);
        const translatedDir = join(fakeDir, '.hermes', 'skills', 'test-skill');
        mkdirSync(translatedDir, { recursive: true });
        writeFileSync(join(translatedDir, 'SKILL.md'), '# Test Skill');

        await expect(computeCanonicalSkillFolderHash(translatedDir)).rejects.toThrow(
            /Lock operations accept only canonical skill folder paths/,
        );

        const canonicalDir = join(fakeDir, 'skills', 'test-skill');
        mkdirSync(canonicalDir, { recursive: true });
        writeFileSync(join(canonicalDir, 'SKILL.md'), '# Test Skill');

        const hash = await computeCanonicalSkillFolderHash(canonicalDir);
        expect(typeof hash).toBe('string');
        expect(hash.length).toBe(64);
    });

    it('computes deterministic SHA-256 hash across files in canonical folder', async () => {
        const canonicalDir = join(tmpdir(), `test-lock-canonical-${Date.now()}`);
        mkdirSync(join(canonicalDir, 'sub'), { recursive: true });
        writeFileSync(join(canonicalDir, 'SKILL.md'), 'line 1\nline 2');
        writeFileSync(join(canonicalDir, 'sub', 'helper.py'), 'print("hello")');

        const hash1 = await computeCanonicalSkillFolderHash(canonicalDir);

        // Modifying a file must change the hash
        writeFileSync(join(canonicalDir, 'SKILL.md'), 'line 1\nline 2 modified');
        const hash2 = await computeCanonicalSkillFolderHash(canonicalDir);

        expect(hash1).not.toBe(hash2);
    });

    it('length-frames file paths and contents so distinct trees cannot concatenate to the same hash input', async () => {
        const testDir = join(tmpdir(), `test-lock-framing-${Date.now()}`);
        const firstDir = join(testDir, 'first');
        const secondDir = join(testDir, 'second');
        mkdirSync(firstDir, { recursive: true });
        mkdirSync(secondDir, { recursive: true });
        writeFileSync(join(firstDir, 'a'), 'bc');
        writeFileSync(join(secondDir, 'ab'), 'c');

        const firstHash = await computeCanonicalSkillFolderHash(firstDir);
        const secondHash = await computeCanonicalSkillFolderHash(secondDir);

        expect(firstHash).not.toBe(secondHash);
    });

    it('hashes UTF-8 strings and raw bytes to the same digest for the same payload', () => {
        const text = 'hello\n';
        const expected = createHash('sha256').update(text, 'utf-8').digest('hex');
        expect(computeContentHash(text)).toBe(expected);
        expect(computeContentHash(Buffer.from(text, 'utf-8'))).toBe(expected);
        expect(computeContentHash(new Uint8Array(Buffer.from(text, 'utf-8')))).toBe(expected);
    });

    it('orders framed hash paths by UTF-8 bytes rather than the host locale', () => {
        const entries = [
            { path: 'ä', contents: 'umlaut' },
            { path: 'z', contents: 'ascii' },
        ];
        const expected = createHash('sha256');
        for (const entry of [entries[1], entries[0]]) {
            if (!entry) continue;
            const pathBytes = Buffer.from(entry.path, 'utf-8');
            const contentBytes = Buffer.from(entry.contents, 'utf-8');
            const pathLength = Buffer.alloc(8);
            const contentLength = Buffer.alloc(8);
            pathLength.writeBigUInt64BE(BigInt(pathBytes.byteLength));
            contentLength.writeBigUInt64BE(BigInt(contentBytes.byteLength));
            expected.update(pathLength);
            expected.update(pathBytes);
            expected.update(contentLength);
            expected.update(contentBytes);
        }

        expect(computeStructuredContentHash(entries)).toBe(expected.digest('hex'));
    });

    it('round-trips local lock (v1) with sorted keys and no timestamps', async () => {
        const testDir = join(tmpdir(), `test-local-lock-${Date.now()}`);
        mkdirSync(testDir, { recursive: true });

        const canonicalSkillDir = join(testDir, 'skills', 'pdf');
        mkdirSync(canonicalSkillDir, { recursive: true });
        writeFileSync(join(canonicalSkillDir, 'SKILL.md'), '# PDF Skill');

        await addSkillToLocalLock(
            'pdf',
            {
                source: 'vercel-labs/agent-skills',
                sourceType: 'github',
                ref: 'main',
                computedHash: '',
            },
            { canonicalSkillDir, cwd: testDir },
        );

        await addSkillToLocalLock(
            'abc-skill',
            {
                source: 'owner/abc',
                sourceType: 'github',
                computedHash: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
            },
            { cwd: testDir },
        );

        const lock = await readLocalLock(testDir);
        expect(lock.version).toBe(1);
        expect(Object.keys(lock.skills)).toEqual(['abc-skill', 'pdf']);
        expect(lock.skills.pdf?.computedHash).toBeDefined();

        const rawContent = readFileSync(getLocalLockPath(testDir), 'utf-8');
        expect(rawContent).not.toContain('installedAt');
        expect(rawContent).not.toContain('updatedAt');

        const removed = await removeSkillFromLocalLock('abc-skill', testDir);
        expect(removed).toBe(true);

        const lockAfter = await readLocalLock(testDir);
        expect(Object.keys(lockAfter.skills)).toEqual(['pdf']);
    });

    it('preserves newer local lock version without overwriting or wiping (R3)', async () => {
        const testDir = join(tmpdir(), `test-local-lock-newer-${Date.now()}`);
        mkdirSync(testDir, { recursive: true });

        const lockFile = getLocalLockPath(testDir);
        const newerJson = {
            version: 99,
            skills: {
                futureSkill: {
                    source: 'future/repo',
                    sourceType: 'future',
                    computedHash: 'hash999',
                },
            },
        };
        writeFileSync(lockFile, JSON.stringify(newerJson, null, 2));

        const readResult = await readLocalLock(testDir);
        expect(readResult.warning).toBeDefined();
        expect(readResult.warning).toContain('newer than supported version');
        expect(readResult.skills.futureSkill).toBeDefined();

        await expect(writeLocalLock(readResult, testDir)).rejects.toThrow(/newer than supported version/);
    });

    it('round-trips global lock (v3) with timestamps and custom state home', async () => {
        const stateHome = join(tmpdir(), `test-global-lock-${Date.now()}`);
        const env = { XDG_STATE_HOME: stateHome };

        await addSkillToGlobalLock(
            'react-best-practices',
            {
                source: 'vercel-labs/agent-skills',
                sourceType: 'github',
                sourceUrl: 'https://github.com/vercel-labs/agent-skills',
                skillFolderHash: 'tree-sha-12345',
            },
            { env },
        );

        const lock = await readGlobalLock(env);
        expect(lock.version).toBe(3);
        expect(lock.skills['react-best-practices']).toBeDefined();
        expect(lock.skills['react-best-practices']?.installedAt).toBeDefined();

        const rawContent = readFileSync(getGlobalLockPath(env), 'utf-8');
        expect(rawContent).toContain('skillFolderHash');

        const removed = await removeSkillFromGlobalLock('react-best-practices', env);
        expect(removed).toBe(true);

        const lockAfter = await readGlobalLock(env);
        expect(lockAfter.skills['react-best-practices']).toBeUndefined();
    });

    it('preserves newer global lock version without overwriting or wiping (R3)', async () => {
        const stateHome = join(tmpdir(), `test-global-lock-newer-${Date.now()}`);
        const env = { XDG_STATE_HOME: stateHome };

        const lockPath = getGlobalLockPath(env);
        mkdirSync(join(stateHome, 'skills'), { recursive: true });

        const newerJson = {
            version: 99,
            skills: {
                futureSkill: {
                    source: 'future/repo',
                    sourceType: 'future',
                    sourceUrl: 'https://future.dev',
                    skillFolderHash: 'sha-999',
                    installedAt: '2099-01-01T00:00:00.000Z',
                    updatedAt: '2099-01-01T00:00:00.000Z',
                },
            },
        };
        writeFileSync(lockPath, JSON.stringify(newerJson, null, 2));

        const readResult = await readGlobalLock(env);
        expect(readResult.warning).toBeDefined();
        expect(readResult.warning).toContain('newer than supported version');
        expect(readResult.skills.futureSkill).toBeDefined();

        await expect(writeGlobalLock(readResult, env)).rejects.toThrow(/newer than supported version/);
    });

    it('preserves an older global lock version without wiping (R3: vendor wipe-on-bump NOT ported)', async () => {
        const stateHome = join(tmpdir(), `test-global-lock-older-${Date.now()}`);
        const env = { XDG_STATE_HOME: stateHome };

        const lockPath = getGlobalLockPath(env);
        mkdirSync(join(stateHome, 'skills'), { recursive: true });

        // Vendor v2 shape: no skillFolderHash (the field the v3 bump added). The vendor
        // wipes this on read; the port must preserve it untouched and warn instead.
        const olderJson = {
            version: 2,
            skills: {
                legacySkill: {
                    source: 'legacy/repo',
                    sourceType: 'github',
                    sourceUrl: 'https://legacy.dev',
                    installedAt: '2020-01-01T00:00:00.000Z',
                    updatedAt: '2020-01-01T00:00:00.000Z',
                },
            },
        };
        writeFileSync(lockPath, JSON.stringify(olderJson, null, 2));

        const readResult = await readGlobalLock(env);
        expect(readResult.warning).toContain('older than current version');
        expect(readResult.skills.legacySkill).toBeDefined();

        // Every write route refuses: raw writer, warned round-trip, and add/remove helpers.
        await expect(writeGlobalLock(readResult, env)).rejects.toThrow();
        await expect(
            addSkillToGlobalLock(
                'new-skill',
                { source: 'o/r', sourceType: 'github', sourceUrl: 'https://x.dev', skillFolderHash: 'h' },
                { env },
            ),
        ).rejects.toThrow();
        await expect(removeSkillFromGlobalLock('legacySkill', env)).rejects.toThrow();

        // The on-disk bytes survive every refused path.
        expect(JSON.parse(readFileSync(lockPath, 'utf-8')).skills.legacySkill).toBeDefined();
    });

    it('preserves an older local lock version without wiping (R3)', async () => {
        const testDir = join(tmpdir(), `test-local-lock-older-${Date.now()}`);
        mkdirSync(testDir, { recursive: true });

        const lockFile = getLocalLockPath(testDir);
        writeFileSync(
            lockFile,
            JSON.stringify({
                version: 0,
                skills: { legacy: { source: 'legacy/repo', sourceType: 'git', computedHash: 'old' } },
            }),
        );

        const readResult = await readLocalLock(testDir);
        expect(readResult.warning).toContain('older than current version');
        expect(readResult.skills.legacy).toBeDefined();
        await expect(writeLocalLock(readResult, testDir)).rejects.toThrow();
        expect(JSON.parse(readFileSync(lockFile, 'utf-8')).skills.legacy).toBeDefined();
    });

    it('raw writers refuse to overwrite a mismatched on-disk lock even with a fresh object', async () => {
        const testDir = join(tmpdir(), `test-raw-write-guard-${Date.now()}`);
        mkdirSync(testDir, { recursive: true });

        // A caller-constructed v1 object must not clobber a newer on-disk lock.
        const lockFile = getLocalLockPath(testDir);
        writeFileSync(
            lockFile,
            JSON.stringify({
                version: 99,
                skills: { future: { source: 'f/r', sourceType: 'git', computedHash: 'h' } },
            }),
        );
        await expect(writeLocalLock({ version: 1, skills: {} }, testDir)).rejects.toThrow(/on-disk lock version/);
        expect(JSON.parse(readFileSync(lockFile, 'utf-8')).version).toBe(99);

        // Same guard on the global writer, older direction.
        const stateHome = join(tmpdir(), `test-raw-write-guard-g-${Date.now()}`);
        const env = { XDG_STATE_HOME: stateHome };
        mkdirSync(join(stateHome, 'skills'), { recursive: true });
        const globalPath = getGlobalLockPath(env);
        writeFileSync(globalPath, JSON.stringify({ version: 2, skills: {} }));
        await expect(writeGlobalLock({ version: 3, skills: {} }, env)).rejects.toThrow(/on-disk lock version/);
        expect(JSON.parse(readFileSync(globalPath, 'utf-8')).version).toBe(2);
    });

    it('raw writers reject caller-constructed older lock versions even when no lock exists', async () => {
        const testDir = join(tmpdir(), `test-raw-write-old-local-${Date.now()}`);
        mkdirSync(testDir, { recursive: true });
        await expect(writeLocalLock({ version: 0, skills: {} }, testDir)).rejects.toThrow(
            /differs from supported version/,
        );
        expect(existsSync(getLocalLockPath(testDir))).toBe(false);

        const stateHome = join(tmpdir(), `test-raw-write-old-global-${Date.now()}`);
        const env = { XDG_STATE_HOME: stateHome };
        await expect(writeGlobalLock({ version: 2, skills: {} }, env)).rejects.toThrow(
            /differs from supported version/,
        );
        expect(existsSync(getGlobalLockPath(env))).toBe(false);
    });

    it('round-trips a vendor-shaped local lock sample verbatim (R5)', async () => {
        // Sample copied verbatim from vercel-labs/skills vendors/skills/tests/local-lock.test.ts
        // ('reads a valid lock file').
        const testDir = join(tmpdir(), `test-vendor-local-${Date.now()}`);
        mkdirSync(testDir, { recursive: true });
        const content = {
            version: 1,
            skills: {
                'my-skill': {
                    source: 'vercel-labs/skills',
                    sourceType: 'github',
                    computedHash: 'abc123',
                },
            },
        };
        writeFileSync(getLocalLockPath(testDir), JSON.stringify(content), 'utf-8');

        const lock = await readLocalLock(testDir);
        expect(lock.version).toBe(1);
        expect(lock.skills['my-skill']).toEqual({
            source: 'vercel-labs/skills',
            sourceType: 'github',
            computedHash: 'abc123',
        });
    });

    it('round-trips a vendor-shaped global lock sample verbatim (R5)', async () => {
        // Sample copied verbatim from vercel-labs/skills vendors/skills/tests/update.test.ts
        // (the mocked `.skill-lock.json` payload, version 3 with skill-a/skill-b).
        const stateHome = join(tmpdir(), `test-vendor-global-${Date.now()}`);
        const env = { XDG_STATE_HOME: stateHome };
        mkdirSync(join(stateHome, 'skills'), { recursive: true });
        const content = {
            version: 3,
            skills: {
                'skill-a': {
                    source: 'owner/repo',
                    skillPath: 'skills/skill-a/SKILL.md',
                    sourceType: 'github',
                    skillFolderHash: 'abc',
                    installedAt: '',
                    updatedAt: '',
                },
                'skill-b': {
                    source: 'owner/repo',
                    skillPath: 'skills/skill-b/SKILL.md',
                    sourceType: 'github',
                    skillFolderHash: 'def',
                    installedAt: '',
                    updatedAt: '',
                },
            },
        };
        writeFileSync(getGlobalLockPath(env), JSON.stringify(content), 'utf-8');

        const lock = await readGlobalLock(env);
        expect(lock.version).toBe(3);
        // Field-wise assertions: the vendor sample legitimately omits `sourceUrl` (runtime
        // JSON is not interface-validated — the vendor's own interface also marks it
        // required, so this documents the tolerated real-world shape).
        expect(lock.skills['skill-a']?.source).toBe('owner/repo');
        expect(lock.skills['skill-a']?.skillPath).toBe('skills/skill-a/SKILL.md');
        expect(lock.skills['skill-a']?.sourceType).toBe('github');
        expect(lock.skills['skill-a']?.skillFolderHash).toBe('abc');
        expect(lock.skills['skill-b']?.skillPath).toBe('skills/skill-b/SKILL.md');
        expect(lock.skills['skill-b']?.skillFolderHash).toBe('def');
    });
});
