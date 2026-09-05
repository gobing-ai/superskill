import { describe, expect, it, spyOn } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
    SkillMutationContentionError,
    withSkillMutationGuard,
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

describe('locks.ts - per-scope mutation guard (R3/F3)', () => {
    const localEntry = { source: 'x', sourceType: 'local', computedHash: 'h' };

    it('blocks a second mutator until the first releases, then lets it run (serialization half)', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'guard-serial-'));
        const lockPath = join(dir, 'skills-lock.json');
        try {
            await addSkillToLocalLock('alpha', localEntry, { cwd: dir });

            const events: string[] = [];
            let releaseHeld!: () => void;
            const held = new Promise<void>((resolve) => {
                releaseHeld = resolve;
            });

            const first = withSkillMutationGuard(lockPath, async () => {
                events.push('add-enter');
                await held;
                events.push('add-exit');
            });
            // Atomic-mkdir acquisition promises no FIFO order, so wait until the
            // first mutator observably holds the guard before scheduling the
            // contender — otherwise either order is legal and the assertion flakes.
            while (!events.includes('add-enter')) {
                await new Promise((resolve) => setTimeout(resolve, 5));
            }
            const second = withSkillMutationGuard(lockPath, async () => {
                events.push('remove-enter');
                events.push('remove-exit');
            });

            await new Promise((resolve) => setTimeout(resolve, 300));
            expect(events).toEqual(['add-enter']);

            releaseHeld();
            await first;
            await second;
            expect(events).toEqual(['add-enter', 'add-exit', 'remove-enter', 'remove-exit']);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    // Residual-proof (F3): the compound fixture composes guard + read-modify-write
    // helpers exactly as operations.ts does; without the guard this add/remove pair
    // interleaves from the same base snapshot and loses one mutation.
    it('keeps the union of a concurrent add and remove under the guard composition', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'guard-union-'));
        const lockPath = join(dir, 'skills-lock.json');
        try {
            await addSkillToLocalLock('alpha', localEntry, { cwd: dir });

            let releaseHeld!: () => void;
            const held = new Promise<void>((resolve) => {
                releaseHeld = resolve;
            });
            const first = withSkillMutationGuard(lockPath, async () => {
                await held;
                await addSkillToLocalLock('beta', localEntry, { cwd: dir });
            });
            const second = withSkillMutationGuard(lockPath, async () => {
                await removeSkillFromLocalLock('alpha', dir);
            });

            await new Promise((resolve) => setTimeout(resolve, 300));
            releaseHeld();
            await first;
            await second;

            const finalLock = await readLocalLock(dir);
            expect(Object.keys(finalLock.skills).sort()).toEqual(['beta']);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('steals a guard abandoned by a dead owner and cleans it up', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'guard-stale-'));
        const lockPath = join(dir, 'skills-lock.json');
        const guardDir = `${lockPath}.mutation-lock`;
        try {
            const dead = Bun.spawnSync(['true']);
            mkdirSync(guardDir);
            writeFileSync(join(guardDir, 'owner'), `${JSON.stringify({ pid: dead.pid, acquiredAt: 'stale' })}\n`);

            const result = await withSkillMutationGuard(lockPath, async () => 'ran');
            expect(result).toBe('ran');
            expect(existsSync(guardDir)).toBe(false);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('throws SkillMutationContentionError when the guard stays held past the bounded wait', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'guard-contend-'));
        const lockPath = join(dir, 'skills-lock.json');
        const guardDir = `${lockPath}.mutation-lock`;
        try {
            // Unparseable owner metadata reads as conservatively live, so the waiter
            // must retry until the deadline instead of stealing.
            mkdirSync(guardDir);
            writeFileSync(join(guardDir, 'owner'), 'not-json');

            const realNow = Date.now.bind(Date);
            const start = realNow();
            const spy = spyOn(Date, 'now').mockImplementation(() => realNow() + (realNow() - start < 25 ? 0 : 11_000));
            try {
                await expect(withSkillMutationGuard(lockPath, async () => 'x')).rejects.toThrow(
                    SkillMutationContentionError,
                );
            } finally {
                spy.mockRestore();
            }
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('reports contention for a live owner whose pid is not a number', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'guard-owner2-'));
        const lockPath = join(dir, 'skills-lock.json');
        const guardDir = `${lockPath}.mutation-lock`;
        try {
            mkdirSync(guardDir);
            writeFileSync(join(guardDir, 'owner'), `${JSON.stringify({ pid: 'not-a-number' })}\n`);

            const realNow = Date.now.bind(Date);
            const start = realNow();
            const spy = spyOn(Date, 'now').mockImplementation(() => realNow() + (realNow() - start < 25 ? 0 : 11_000));
            try {
                await expect(withSkillMutationGuard(lockPath, async () => 'x')).rejects.toThrow(/contention/i);
            } finally {
                spy.mockRestore();
            }
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('fails closed when the guard parent chain is broken by a regular file', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'guard-broken-'));
        try {
            const blocker = join(dir, 'blocker');
            writeFileSync(blocker, 'a file, not a directory');
            const lockPath = join(blocker, 'skills-lock.json');

            let callbackRan = false;
            await expect(
                withSkillMutationGuard(lockPath, async () => {
                    callbackRan = true;
                }),
            ).rejects.toThrow();
            expect(callbackRan).toBe(false);
            expect(existsSync(`${lockPath}.mutation-lock`)).toBe(false);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});

describe('locks.ts - corrupt lock preservation (R4/F4)', () => {
    it('readLocalLock reports malformed JSON as a warning and preserves the original bytes', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'lock-corrupt-'));
        const lockPath = join(dir, 'skills-lock.json');
        try {
            const original = '{ this is not json';
            writeFileSync(lockPath, original);

            const lock = await readLocalLock(dir);
            expect(lock.warning).toContain('JSON parse error');
            expect(lock.warning).toContain('repair or remove');
            expect(Object.keys(lock.skills)).toEqual([]);
            expect(readFileSync(lockPath, 'utf-8')).toBe(original);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('readLocalLock rejects a non-object skills shape instead of synthesizing an empty lock', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'lock-shape-'));
        const lockPath = join(dir, 'skills-lock.json');
        try {
            const original = '{"version":1,"skills":[]}';
            writeFileSync(lockPath, original);

            const lock = await readLocalLock(dir);
            expect(lock.warning).toContain('invalid version/skills shape');
            expect(readFileSync(lockPath, 'utf-8')).toBe(original);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('readLocalLock rejects a non-object top level instead of synthesizing an empty lock', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'lock-top-'));
        const lockPath = join(dir, 'skills-lock.json');
        try {
            writeFileSync(lockPath, '[1,2]');
            const lock = await readLocalLock(dir);
            expect(lock.warning).toContain('top-level shape is not a JSON object');
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('readGlobalLock reports a corrupt global lock the same way (env-scoped)', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'lock-gcorrupt-'));
        try {
            const env = { XDG_STATE_HOME: dir };
            const lockPath = getGlobalLockPath(env);
            mkdirSync(join(dir, 'skills'), { recursive: true });
            const original = '{ broken';
            writeFileSync(lockPath, original);

            const lock = await readGlobalLock(env);
            expect(lock.warning).toContain('JSON parse error');
            expect(readFileSync(lockPath, 'utf-8')).toBe(original);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('reports a non-directory lock ancestor (ENOTDIR) instead of synthesizing absence', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'lock-enotdir-'));
        try {
            const blocker = join(dir, 'blocker');
            writeFileSync(blocker, 'file');
            const cwd = join(blocker, 'project');

            const lock = await readLocalLock(cwd);
            expect(lock.warning).toContain('read error');
            expect(lock.warning).toContain('not a directory');
            expect(Object.keys(lock.skills)).toEqual([]);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('writeLocalLock refuses to replace a corrupt on-disk lock and preserves its bytes', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'lock-writecorrupt-'));
        const lockPath = join(dir, 'skills-lock.json');
        try {
            const original = '{ corrupt bytes';
            writeFileSync(lockPath, original);

            await expect(
                writeLocalLock(
                    { version: 1, skills: { a: { source: 's', sourceType: 'local', computedHash: 'h' } } },
                    dir,
                ),
            ).rejects.toThrow(/corrupt/);
            expect(readFileSync(lockPath, 'utf-8')).toBe(original);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('writeLocalLock refuses an invalid on-disk version shape and preserves bytes', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'lock-writever-'));
        const lockPath = join(dir, 'skills-lock.json');
        try {
            const original = '{"version":"one","skills":{}}';
            writeFileSync(lockPath, original);

            await expect(writeLocalLock({ version: 1, skills: {} }, dir)).rejects.toThrow(/invalid version shape/);
            expect(readFileSync(lockPath, 'utf-8')).toBe(original);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('writeLocalLock refuses an invalid on-disk skills shape and preserves bytes', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'lock-writeshape-'));
        const lockPath = join(dir, 'skills-lock.json');
        try {
            const original = '{"version":1,"skills":[]}';
            writeFileSync(lockPath, original);

            await expect(writeLocalLock({ version: 1, skills: {} }, dir)).rejects.toThrow(/invalid skills shape/);
            expect(readFileSync(lockPath, 'utf-8')).toBe(original);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('writeLocalLock creates a fresh lock only when none exists (ENOENT-only init)', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'lock-init-'));
        try {
            await writeLocalLock(
                { version: 1, skills: { a: { source: 's', sourceType: 'local', computedHash: 'h' } } },
                dir,
            );
            const lock = await readLocalLock(dir);
            expect(lock.warning).toBeUndefined();
            expect(lock.skills.a?.source).toBe('s');
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});

describe('locks.ts - prototype-safe skill records (R5/F5)', () => {
    const protoEntry = { source: 'x', sourceType: 'local', computedHash: 'h' };

    // Residual-proof (F5): both halves carried — reading an untrusted __proto__ key
    // must yield an own data key AND the write path must serialize it back out as an
    // own JSON key (a read-only fix would still orphan the install on round-trip).
    it('reads a __proto__ skills key as an own data key and round-trips it through write', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'lock-proto-'));
        const lockPath = join(dir, 'skills-lock.json');
        try {
            writeFileSync(
                lockPath,
                '{"version":1,"skills":{"__proto__":{"source":"x","sourceType":"local","computedHash":"h"}}}',
            );

            const lock = await readLocalLock(dir);
            expect(lock.warning).toBeUndefined();
            expect(Object.keys(lock.skills)).toContain('__proto__');
            expect('__proto__' in lock.skills).toBe(true);

            await writeLocalLock(lock, dir);
            const reread = JSON.parse(readFileSync(lockPath, 'utf-8')) as { skills: Record<string, unknown> };
            expect(Object.keys(reread.skills)).toContain('__proto__');
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('addSkillToLocalLock and removeSkillFromLocalLock round-trip a __proto__ identity', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'lock-proto-add-'));
        try {
            await addSkillToLocalLock('__proto__', protoEntry, { cwd: dir });
            let lock = await readLocalLock(dir);
            expect(Object.keys(lock.skills)).toContain('__proto__');

            expect(await removeSkillFromLocalLock('__proto__', dir)).toBe(true);
            lock = await readLocalLock(dir);
            expect(Object.keys(lock.skills)).toEqual([]);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('global add/remove round-trips a __proto__ identity (env-scoped)', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'lock-proto-global-'));
        try {
            const env = { XDG_STATE_HOME: dir };
            await addSkillToGlobalLock(
                '__proto__',
                { source: 'x', sourceType: 'github', sourceUrl: 'https://github.com/x', skillFolderHash: 'h' },
                { env },
            );
            let lock = await readGlobalLock(env);
            expect(Object.keys(lock.skills)).toContain('__proto__');

            expect(await removeSkillFromGlobalLock('__proto__', env)).toBe(true);
            lock = await readGlobalLock(env);
            expect(Object.keys(lock.skills)).toEqual([]);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});
