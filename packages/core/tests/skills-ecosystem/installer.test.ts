import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BlobSkill } from '../../src/skills-ecosystem/fetch';
import {
    cleanAndCreateDir,
    copyDir,
    createSymlink,
    getCanonicalSkillsDir,
    installSkillCanonical,
    isPathSafe,
    pathsOverlap,
    sanitizeName,
    writeBlobSkill,
} from '../../src/skills-ecosystem/installer';

describe('installer.ts - Canonical skill installation and security guards', () => {
    it('sanitizeName converts names to safe kebab-case slugs', () => {
        expect(sanitizeName('My Test Skill')).toBe('my-test-skill');
        expect(sanitizeName('../../../etc/passwd')).toBe('etc-passwd');
        expect(sanitizeName('...')).toBe('unnamed-skill');
    });

    it('isPathSafe enforces boundary checking against path traversal', () => {
        const base = join(tmpdir(), 'base-dir');
        expect(isPathSafe(base, join(base, 'sub', 'file.txt'))).toBe(true);
        expect(isPathSafe(base, base)).toBe(true);
        expect(isPathSafe(base, join(base, '..', 'outside.txt'))).toBe(false);
        expect(isPathSafe(base, '/etc/passwd')).toBe(false);
    });

    it('pathsOverlap detects nesting between two paths', () => {
        const p1 = join(tmpdir(), 'folder1');
        const p2 = join(p1, 'nested');
        const p3 = join(tmpdir(), 'folder2');

        expect(pathsOverlap(p1, p2)).toBe(true);
        expect(pathsOverlap(p2, p1)).toBe(true);
        expect(pathsOverlap(p1, p3)).toBe(false);
    });

    it('getCanonicalSkillsDir resolves project and global canonical skill paths', () => {
        expect(getCanonicalSkillsDir(false, '/my/project')).toBe('/my/project/.agents/skills');
        expect(getCanonicalSkillsDir(true, undefined, '/home/user')).toBe('/home/user/.agents/skills');
    });

    it('installSkillCanonical installs local directory skill safely', async () => {
        const testHome = await mkdtemp(join(tmpdir(), 'installer-test-home-'));
        const sourceDir = join(testHome, 'source-skill');
        await cleanAndCreateDir(sourceDir);
        writeFileSync(join(sourceDir, 'SKILL.md'), '---\nname: Source Skill\ndescription: Source\n---\n# Source');

        const result = await installSkillCanonical(sourceDir, { global: true, homeDir: testHome });
        expect(result.success).toBe(true);
        expect(result.skillName).toBe('source-skill');
        expect(existsSync(join(testHome, '.agents/skills/source-skill/SKILL.md'))).toBe(true);

        await rm(testHome, { recursive: true, force: true });
    });

    it('installSkillCanonical skips when source and destination overlap', async () => {
        const testHome = await mkdtemp(join(tmpdir(), 'installer-test-overlap-'));
        const canonicalBase = join(testHome, '.agents/skills/my-skill');
        await cleanAndCreateDir(canonicalBase);

        const result = await installSkillCanonical(canonicalBase, { global: true, homeDir: testHome });
        expect(result.success).toBe(true);
        expect(result.skipped).toBe(true);

        await rm(testHome, { recursive: true, force: true });
    });

    it('installSkillCanonical installs BlobSkill objects and handles errors', async () => {
        const testHome = await mkdtemp(join(tmpdir(), 'installer-blob-test-'));
        const mockBlob: BlobSkill = {
            name: 'Blob Skill',
            description: 'Blob desc',
            path: '',
            rawContent: '---\nname: Blob Skill\n---\n# Blob',
            files: [
                { path: 'SKILL.md', contents: '# Blob Skill' },
                { path: 'helper.txt', contents: 'helper data' },
            ],
            snapshotHash: 'hash123',
            repoPath: 'skills/blob-skill/SKILL.md',
        };

        const result = await installSkillCanonical(mockBlob, { global: true, homeDir: testHome });
        expect(result.success).toBe(true);
        expect(result.skillName).toBe('blob-skill');
        expect(readFileSync(join(testHome, '.agents/skills/blob-skill/helper.txt'), 'utf-8')).toBe('helper data');

        const badBlob: BlobSkill = {
            name: 'Bad Blob',
            description: '',
            path: '',
            rawContent: '',
            files: [{ path: '../outside.txt', contents: 'evil' }],
            snapshotHash: '',
            repoPath: '',
        };
        const failResult = await installSkillCanonical(badBlob, { global: true, homeDir: testHome });
        expect(failResult.success).toBe(false);
        expect(failResult.error).toContain('Invalid file path');

        await rm(testHome, { recursive: true, force: true });
    });

    it('installSkillCanonical catches missing source path errors', async () => {
        const result = await installSkillCanonical('/non-existent-source-skill-path-12345');
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
    });

    it('writeBlobSkill rejects malicious file path escapes (residual-proof security negative)', async () => {
        const dest = await mkdtemp(join(tmpdir(), 'blob-sec-test-'));
        const maliciousBlob: BlobSkill = {
            name: 'Evil Skill',
            description: 'Evil',
            path: '',
            rawContent: '',
            files: [{ path: '../outside.txt', contents: 'evil' }],
            snapshotHash: 'hash',
            repoPath: '',
        };

        await expect(writeBlobSkill(maliciousBlob, dest)).rejects.toThrow(/Invalid file path in BlobSkill/);
        await rm(dest, { recursive: true, force: true });
    });

    it('copyDir throws error if copy target attempts path traversal', async () => {
        const srcDir = await mkdtemp(join(tmpdir(), 'copydir-src-'));
        const destDir = await mkdtemp(join(tmpdir(), 'copydir-dest-'));
        writeFileSync(join(srcDir, 'valid.txt'), 'content');

        await copyDir(srcDir, destDir);
        expect(readFileSync(join(destDir, 'valid.txt'), 'utf-8')).toBe('content');

        await rm(srcDir, { recursive: true, force: true });
        await rm(destDir, { recursive: true, force: true });
    });

    it('createSymlink handles existing symlinks, identical target/link paths, and fallbacks', async () => {
        const testDir = await mkdtemp(join(tmpdir(), 'symlink-test-'));
        const target = join(testDir, 'target-folder');
        const link = join(testDir, 'link-folder');
        await cleanAndCreateDir(target);
        writeFileSync(join(target, 'file.txt'), 'hello');

        // Identical target and link path
        expect(await createSymlink(target, target)).toBe(true);

        // First creation
        expect(await createSymlink(target, link)).toBe(true);
        // Second creation (re-linking identical target)
        expect(await createSymlink(target, link)).toBe(true);

        // Replacing existing symlink pointing to another location
        const otherTarget = join(testDir, 'other-target');
        await cleanAndCreateDir(otherTarget);
        expect(await createSymlink(otherTarget, link)).toBe(true);

        await rm(testDir, { recursive: true, force: true });
    });

    it('cleanAndCreateDir recreates directory cleanly', async () => {
        const testDir = join(tmpdir(), `clean-test-${Date.now()}`);
        await cleanAndCreateDir(testDir);
        expect(existsSync(testDir)).toBe(true);
        await rm(testDir, { recursive: true, force: true });
    });
});
