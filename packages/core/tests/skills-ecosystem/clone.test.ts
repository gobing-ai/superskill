/**
 * Behavior tests for the hardened clone stack split out of fetch.ts (task 0146 R12):
 * `GitCloneError` classification, the auth-fallback chain variants, the real spawn seam,
 * and `cleanupTempDir`. The https-slug fallback variant and transport hardening negatives
 * stay covered in fetch.test.ts through the re-exported surface.
 */
import { describe, expect, it } from 'bun:test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanupTempDir, cloneRepo, GitCloneError, spawnGh, spawnGit } from '../../src/skills-ecosystem/clone';

describe('GitCloneError', () => {
    it('carries the url plus timeout and auth classification flags', () => {
        const error = new GitCloneError('Authentication failed', 'https://github.com/owner/repo.git', false, true);
        expect(error.name).toBe('GitCloneError');
        expect(error.url).toBe('https://github.com/owner/repo.git');
        expect(error.isTimeout).toBe(false);
        expect(error.isAuthError).toBe(true);
        expect(new GitCloneError('timed out', 'https://github.com/owner/repo.git').isTimeout).toBe(false);
    });
});

describe('cloneRepo auth fallback chain', () => {
    it('clones through gh over SSH when gh reports ssh as its git operations protocol', async () => {
        const ghCalls: string[][] = [];
        const mockExecGit = async () => {
            throw new Error('remote: Authentication failed');
        };
        const mockExecGh = async (args: string[]) => {
            ghCalls.push(args);
            if (args[0] === 'auth') return { stdout: 'github.com\n  Git operations protocol: ssh\n', stderr: '' };
            const targetDir = args[3] as string; // ['repo', 'clone', cloneTarget, ghDir, '--', ...flags]
            mkdirSync(targetDir, { recursive: true });
            writeFileSync(join(targetDir, 'SKILL.md'), '# via ssh');
            return { stdout: '', stderr: '' };
        };
        const dir = await cloneRepo('https://github.com/owner/repo.git', undefined, {
            execGit: mockExecGit,
            execGh: mockExecGh,
        });
        try {
            expect(ghCalls[0]).toEqual(['auth', 'status', '-h', 'github.com']);
            expect(ghCalls[1]).toEqual([
                'repo',
                'clone',
                'git@github.com:owner/repo.git',
                expect.any(String),
                '--',
                '--depth=1',
            ]);
            expect(readFileSync(join(dir, 'SKILL.md'), 'utf-8')).toBe('# via ssh');
        } finally {
            await cleanupTempDir(dir);
        }
    });

    it('classifies a git timeout as non-auth and never triggers the gh/SSH fallback', async () => {
        let ghCalls = 0;
        const execGit = async () => {
            throw new Error('error: RPC failed; curl 28 Operation timed out');
        };
        const execGh = async () => {
            ghCalls++;
            return { stdout: '', stderr: '' };
        };
        try {
            await cloneRepo('https://github.com/owner/repo.git', undefined, { execGit, execGh });
            expect.unreachable();
        } catch (error) {
            expect(error).toBeInstanceOf(GitCloneError);
            expect((error as GitCloneError).isTimeout).toBe(true);
            expect((error as GitCloneError).isAuthError).toBe(false);
        }
        expect(ghCalls).toBe(0);
    });
});

describe('real spawn seam (spawnGit / spawnGh)', () => {
    it('spawnGit resolves with captured stdout for a real git subprocess', async () => {
        const { stdout } = await spawnGit(['--version'], {});
        expect(stdout).toContain('git version');
    });

    it('spawnGit rejects on nonzero exit with stderr carried in the rejection message', async () => {
        try {
            await spawnGit(['rev-parse', '--verify', 'definitely-not-a-ref-0146'], {});
            expect.unreachable();
        } catch (error) {
            expect((error as Error).message).toContain('definitely-not-a-ref-0146');
        }
    });

    it('spawnGh rejects when gh is absent or fails (either way it never resolves)', async () => {
        await expect(spawnGh(['auth', 'status', '-h', 'invalid.invalid'], {})).rejects.toThrow();
    });
});

describe('cleanupTempDir', () => {
    it('removes a nested temp tree and treats a missing path inside tmp as a no-op', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'skills-cleanup-'));
        const nested = join(dir, 'repo', 'sub');
        await mkdir(nested, { recursive: true });
        await expect(stat(dir)).resolves.toBeTruthy();
        await cleanupTempDir(dir);
        await expect(stat(dir)).rejects.toThrow();
        await expect(cleanupTempDir(join(tmpdir(), 'skills-does-not-exist-0146'))).resolves.toBeUndefined();
    });

    it('rejects cleanup of paths outside the temp root', async () => {
        await expect(cleanupTempDir(process.cwd())).rejects.toThrow(/outside of temp directory/);
    });
});
