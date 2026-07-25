import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    addSkills,
    cleanAndCreateDir,
    computeCanonicalSkillFolderHash,
    getCanonicalSkillsDir,
    getLocalLockPath,
    listSkills,
    readGlobalLock,
    readLocalLock,
    removeSkills,
    sanitizeName,
} from '../../src/index';

describe('npx-interop.test.ts - Round-trip interop verification with npx skills lock and layout conventions', () => {
    it('installs local skill with layout and lock structure matching npx skills Local v1 schema', async () => {
        const testCwd = await mkdtemp(join(tmpdir(), 'npx-interop-local-'));
        const sourceDir = join(testCwd, 'sample-skill');

        await cleanAndCreateDir(sourceDir);
        writeFileSync(
            join(sourceDir, 'SKILL.md'),
            '---\nname: Interop Skill\ndescription: Round-trip test skill\n---\n# Interop Test Skill\n\nContent here.',
        );

        const addRes = await addSkills(sourceDir, {
            cwd: testCwd,
            global: false,
        });

        expect(addRes.success).toBe(true);
        const skillName = sanitizeName('Interop Skill');
        expect(skillName).toBe('interop-skill');

        const canonicalDir = getCanonicalSkillsDir(false, testCwd);
        const canonicalSkillPath = join(canonicalDir, skillName);
        expect(existsSync(join(canonicalSkillPath, 'SKILL.md'))).toBe(true);

        const localLockPath = getLocalLockPath(testCwd);
        expect(existsSync(localLockPath)).toBe(true);

        const lock = await readLocalLock(testCwd);
        expect(lock.version).toBe(1);
        expect(lock.skills[skillName]).toBeDefined();

        const entry = lock.skills[skillName];
        expect(entry).toBeDefined();
        if (entry) {
            expect(entry.source).toBe(sourceDir);
            expect(entry.computedHash).toBeDefined();
            expect(entry.computedHash.length).toBe(64); // SHA-256

            const computedHash = await computeCanonicalSkillFolderHash(canonicalSkillPath);
            expect(entry.computedHash).toBe(computedHash);
        }

        await rm(testCwd, { recursive: true, force: true });
    });

    it('round-trips global lock with Global v3 schema and removeSkills cleanup', async () => {
        const testHome = await mkdtemp(join(tmpdir(), 'npx-interop-global-'));
        const sourceDir = join(testHome, 'global-source-skill');

        await cleanAndCreateDir(sourceDir);
        writeFileSync(
            join(sourceDir, 'SKILL.md'),
            '---\nname: Global Interop\ndescription: Global round-trip\n---\n# Global Interop Skill',
        );

        const testEnv = { HOME: testHome, CLAUDE_CONFIG_DIR: join(testHome, '.claude') };

        const addRes = await addSkills(sourceDir, {
            global: true,
            homeDir: testHome,
            env: testEnv,
        });

        expect(addRes.success).toBe(true);

        const lock = await readGlobalLock(testEnv, testHome);
        expect(lock.version).toBe(3);
        expect(lock.skills['global-interop']).toBeDefined();
        expect(lock.skills['global-interop']?.skillFolderHash.length).toBe(64);

        const rmRes = await removeSkills(['global-interop'], {
            global: true,
            homeDir: testHome,
            env: testEnv,
        });

        expect(rmRes.success).toBe(true);
        expect(rmRes.removed).toContain('global-interop');

        const updatedLock = await readGlobalLock(testEnv, testHome);
        expect(updatedLock.skills['global-interop']).toBeUndefined();

        await rm(testHome, { recursive: true, force: true });
    });

    it('consumes a vendor-produced lock and canonical layout (vice-versa round-trip)', async () => {
        const testCwd = await mkdtemp(join(tmpdir(), 'npx-interop-vice-'));

        // Recorded fixture: vendor canonical layout + vendor-shaped project lock (Local v1),
        // byte shape copied from vercel-labs/skills vendors/skills/tests/local-lock.test.ts.
        await cleanAndCreateDir(join(testCwd, '.agents/skills/my-skill'));
        writeFileSync(join(testCwd, '.agents/skills/my-skill/SKILL.md'), '# My Skill');
        writeFileSync(
            getLocalLockPath(testCwd),
            JSON.stringify({
                version: 1,
                skills: {
                    'my-skill': {
                        source: 'vercel-labs/skills',
                        sourceType: 'github',
                        computedHash: 'abc123',
                    },
                },
            }),
        );

        // npx-installed skill is listed by superskill (lock entry wins over disk-scan).
        const listRes = await listSkills({ cwd: testCwd });
        const locked = listRes.skills.find((s) => s.name === 'my-skill');
        expect(locked?.source).toBe('vercel-labs/skills');
        expect(locked?.hash).toBe('abc123');

        // ...and removed by superskill: canonical dir swept, lock entry dropped.
        const rmRes = await removeSkills(['my-skill'], { cwd: testCwd });
        expect(rmRes.success).toBe(true);
        expect(existsSync(join(testCwd, '.agents/skills/my-skill'))).toBe(false);
        const lockAfter = await readLocalLock(testCwd);
        expect(lockAfter.skills['my-skill']).toBeUndefined();

        await rm(testCwd, { recursive: true, force: true });
    });

    it('writes project lock bytes in the vendor Local v1 shape (sorted keys, schema fields)', async () => {
        const testCwd = await mkdtemp(join(tmpdir(), 'npx-interop-shape-'));

        for (const [dir, name] of [
            ['b-src', 'B Interop'],
            ['a-src', 'A Interop'],
        ] as const) {
            const sourceDir = join(testCwd, dir);
            await cleanAndCreateDir(sourceDir);
            writeFileSync(join(sourceDir, 'SKILL.md'), `---\nname: ${name}\ndescription: shape\n---\n# ${name}`);
            const res = await addSkills(sourceDir, { cwd: testCwd, global: false });
            expect(res.success).toBe(true);
        }

        // Vendor Local v1 contract: version 1, sorted skill keys, timestamp-free entries with
        // { source, sourceType, computedHash } (+ optional sourceUrl).
        const raw = JSON.parse(readFileSync(getLocalLockPath(testCwd), 'utf-8')) as {
            version: number;
            skills: Record<string, Record<string, unknown>>;
        };
        expect(raw.version).toBe(1);
        const keys = Object.keys(raw.skills);
        expect(keys).toEqual(['a-interop', 'b-interop']);
        const entry = raw.skills['a-interop'];
        expect(entry).toBeDefined();
        if (entry) {
            for (const field of ['source', 'sourceType', 'computedHash']) {
                expect(entry[field]).toBeDefined();
            }
            expect(entry.installedAt).toBeUndefined();
            expect(entry.updatedAt).toBeUndefined();
        }

        await rm(testCwd, { recursive: true, force: true });
    });
});
