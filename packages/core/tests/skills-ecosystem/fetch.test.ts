import { describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    AcquisitionLimitError,
    cleanupTempDir,
    cloneRepo,
    fetchRepoCommitSha,
    fetchRepoTree,
    findSkillMdPaths,
    GitCloneError,
    getGitHubToken,
    getSkillFolderHashFromTree,
    ghAuthTokenFromCli,
    isGitHubHttpsCloneUrl,
    MAX_MATERIALIZED_BLOB_BYTES,
    MAX_MATERIALIZED_FILES,
    materializeRepoSubdir,
    parseGitHubRepoUrl,
    spawnGh,
    spawnGit,
    toSkillSlug,
    tryBlobInstall,
} from '../../src/skills-ecosystem/fetch';

describe('fetch.ts - GitHub Trees/Blob fast path and hardened git clone', () => {
    it('toSkillSlug converts names to URL-safe slugs', () => {
        expect(toSkillSlug('React Best Practices')).toBe('react-best-practices');
        expect(toSkillSlug('PDF_Generator@v1')).toBe('pdf-generatorv1');
    });

    it('getGitHubToken resolves token from GITHUB_TOKEN or GH_TOKEN env', async () => {
        await expect(getGitHubToken({ GITHUB_TOKEN: 'ghp_secret123' })).resolves.toBe('ghp_secret123');
        await expect(getGitHubToken({ GH_TOKEN: 'gho_secret456' })).resolves.toBe('gho_secret456');
        await expect(getGitHubToken({})).resolves.toBeNull();
    });

    it('parseGitHubRepoUrl handles invalid URLs and path variations', () => {
        const parsedHttps = parseGitHubRepoUrl('https://github.com/vercel-labs/agent-skills.git');
        expect(parsedHttps).toEqual({
            owner: 'vercel-labs',
            repo: 'agent-skills',
            slug: 'vercel-labs/agent-skills',
            sshUrl: 'git@github.com:vercel-labs/agent-skills.git',
        });

        const parsedSsh = parseGitHubRepoUrl('git@github.com:owner/my-repo.git');
        expect(parsedSsh?.slug).toBe('owner/my-repo');

        expect(parseGitHubRepoUrl('https://gitlab.com/owner/repo')).toBeNull();
        expect(parseGitHubRepoUrl('https://github.com/')).toBeNull();
        expect(parseGitHubRepoUrl('not-a-valid-url')).toBeNull();
    });

    it('isGitHubHttpsCloneUrl identifies GitHub HTTPS URLs and catches invalid URLs', () => {
        expect(isGitHubHttpsCloneUrl('https://github.com/owner/repo')).toBe(true);
        expect(isGitHubHttpsCloneUrl('git@github.com:owner/repo.git')).toBe(false);
        expect(isGitHubHttpsCloneUrl('invalid-url-string')).toBe(false);
    });

    it('getSkillFolderHashFromTree extracts tree SHA for skill path with trailing slashes and skill.md extensions', () => {
        const mockTree = {
            sha: 'root-sha-123',
            branch: 'main',
            tree: [
                { path: 'skills/pdf', type: 'tree' as const, sha: 'folder-sha-456' },
                { path: 'skills/pdf/SKILL.md', type: 'blob' as const, sha: 'blob-sha-789' },
            ],
        };

        expect(getSkillFolderHashFromTree(mockTree, 'skills/pdf/SKILL.md')).toBe('folder-sha-456');
        expect(getSkillFolderHashFromTree(mockTree, 'skills/pdf/SKILL.md/')).toBe('folder-sha-456');
        expect(getSkillFolderHashFromTree(mockTree, 'SKILL.md')).toBe('root-sha-123');
        expect(getSkillFolderHashFromTree(mockTree, 'non-existent/SKILL.md')).toBeNull();
    });

    it('findSkillMdPaths discovers SKILL.md paths with subpaths, fallback deep paths, and container layouts', () => {
        const mockTree = {
            sha: 'tree-sha',
            branch: 'main',
            tree: [
                { path: 'skills/pdf/SKILL.md', type: 'blob' as const, sha: 's1' },
                { path: 'skills/web/react-best-practices/SKILL.md', type: 'blob' as const, sha: 's2' },
                { path: 'docs/ignore/SKILL.md', type: 'blob' as const, sha: 's3' },
            ],
        };

        const paths = findSkillMdPaths(mockTree);
        expect(paths).toContain('skills/pdf/SKILL.md');
        expect(paths).toContain('skills/web/react-best-practices/SKILL.md');

        const subpaths = findSkillMdPaths(mockTree, 'skills/pdf');
        expect(subpaths).toEqual(['skills/pdf/SKILL.md']);

        const nonPriorityTree = {
            sha: 'tree-sha-2',
            branch: 'main',
            tree: [{ path: 'custom/deep/path/SKILL.md', type: 'blob' as const, sha: 'np1' }],
        };
        const nonPriorityPaths = findSkillMdPaths(nonPriorityTree);
        expect(nonPriorityPaths).toEqual(['custom/deep/path/SKILL.md']);
    });

    it('fetchRepoTree uses injected fetchFn with token and handles network error throws', async () => {
        const mockFetch: typeof fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
            const authHeader = (init?.headers as Record<string, string>)?.Authorization;
            return new Response(
                JSON.stringify({
                    sha: authHeader ? 'auth-tree-sha' : 'test-tree-sha',
                    tree: [{ path: 'SKILL.md', type: 'blob', sha: 'b1' }],
                }),
                { status: 200 },
            );
        }) as unknown as typeof fetch;

        const tree = await fetchRepoTree('owner/repo', 'main', () => 'secret_token', mockFetch);
        expect(tree).not.toBeNull();
        expect(tree?.sha).toBe('auth-tree-sha');

        const throwingFetch: typeof fetch = (async () => {
            throw new Error('Network error');
        }) as unknown as typeof fetch;

        expect(await fetchRepoTree('owner/repo', 'main', undefined, throwingFetch)).toBeNull();
    });

    it('tryBlobInstall handles fetch exceptions and download 404s gracefully', async () => {
        const mockFetch: typeof fetch = (async (urlStr: string | URL | Request) => {
            const url = String(urlStr);
            if (url.includes('/git/trees/')) {
                return new Response(
                    JSON.stringify({
                        sha: 'tree-sha',
                        tree: [{ path: 'skills/fail-skill/SKILL.md', type: 'blob', sha: 'b1' }],
                    }),
                    { status: 200 },
                );
            }
            if (url.includes('raw.githubusercontent.com')) {
                return new Response('---\nname: Fail Skill\ndescription: Fail desc\n---\n# Fail', { status: 200 });
            }
            return new Response('Not found', { status: 404 });
        }) as unknown as typeof fetch;

        const result = await tryBlobInstall('owner/repo', { ref: 'main', fetchFn: mockFetch });
        expect(result).toBeNull();
    });

    it('tryBlobInstall resolves BlobSkills using folder-name skillFilter', async () => {
        const mockFetch: typeof fetch = (async (urlStr: string | URL | Request) => {
            const url = String(urlStr);
            if (url.includes('/git/trees/')) {
                return new Response(
                    JSON.stringify({
                        sha: 'tree-sha',
                        tree: [{ path: 'skills/test-skill/SKILL.md', type: 'blob', sha: 'b1' }],
                    }),
                    { status: 200 },
                );
            }
            if (url.includes('raw.githubusercontent.com')) {
                return new Response('---\nname: Test Skill\ndescription: A test skill\n---\n# Content', {
                    status: 200,
                });
            }
            if (url.includes('/api/download/')) {
                return new Response(
                    JSON.stringify({
                        files: [{ path: 'SKILL.md', contents: '# Content' }],
                        hash: 'snapshot-hash-123',
                    }),
                    { status: 200 },
                );
            }
            return new Response('Not found', { status: 404 });
        }) as unknown as typeof fetch;

        const result = await tryBlobInstall('owner/repo', {
            ref: 'main',
            skillFilter: 'test-skill',
            fetchFn: mockFetch,
        });

        expect(result).not.toBeNull();
        expect(result?.skills.length).toBe(1);
        expect(result?.skills[0]?.name).toBe('Test Skill');
    });

    it('tryBlobInstall includes internal skills when includeInternal option is set', async () => {
        const mockFetch: typeof fetch = (async (urlStr: string | URL | Request) => {
            const url = String(urlStr);
            if (url.includes('/git/trees/')) {
                return new Response(
                    JSON.stringify({
                        sha: 'tree-sha',
                        tree: [{ path: 'skills/internal-skill/SKILL.md', type: 'blob', sha: 'b1' }],
                    }),
                    { status: 200 },
                );
            }
            if (url.includes('raw.githubusercontent.com')) {
                return new Response(
                    '---\nname: Internal Skill\ndescription: Internal\nmetadata:\n  internal: true\n---\n# Internal',
                    { status: 200 },
                );
            }
            if (url.includes('/api/download/')) {
                return new Response(
                    JSON.stringify({
                        files: [{ path: 'SKILL.md', contents: '# Internal' }],
                        hash: 'hash-internal',
                    }),
                    { status: 200 },
                );
            }
            return new Response('Not found', { status: 404 });
        }) as unknown as typeof fetch;

        const result = await tryBlobInstall('owner/repo', {
            ref: 'main',
            includeInternal: true,
            fetchFn: mockFetch,
        });

        expect(result).not.toBeNull();
        expect(result?.skills[0]?.name).toBe('Internal Skill');
    });

    it('tryBlobInstall returns null when skillFilter matches no skills', async () => {
        const mockFetch: typeof fetch = (async (urlStr: string | URL | Request) => {
            const url = String(urlStr);
            if (url.includes('/git/trees/')) {
                return new Response(
                    JSON.stringify({
                        sha: 'tree-sha',
                        tree: [{ path: 'skills/other-skill/SKILL.md', type: 'blob', sha: 'b1' }],
                    }),
                    { status: 200 },
                );
            }
            if (url.includes('raw.githubusercontent.com')) {
                return new Response('---\nname: Other Skill\ndescription: Other skill desc\n---\n# Content', {
                    status: 200,
                });
            }
            return new Response('Not found', { status: 404 });
        }) as unknown as typeof fetch;

        const result = await tryBlobInstall('owner/repo', {
            ref: 'main',
            skillFilter: 'non-existent-skill',
            fetchFn: mockFetch,
        });

        expect(result).toBeNull();
    });

    it('tryBlobInstall computes snapshot hash on multi-file snapshot when hash is empty', async () => {
        const mockFetch: typeof fetch = (async (urlStr: string | URL | Request) => {
            const url = String(urlStr);
            if (url.includes('/git/trees/')) {
                return new Response(
                    JSON.stringify({
                        sha: 'tree-sha',
                        tree: [{ path: 'skills/multi/SKILL.md', type: 'blob', sha: 'b0' }],
                    }),
                    { status: 200 },
                );
            }
            if (url.includes('raw.githubusercontent.com')) {
                return new Response('---\nname: Multi Skill\ndescription: Multi skill desc\n---\n# Multi', {
                    status: 200,
                });
            }
            if (url.includes('/api/download/')) {
                return new Response(
                    JSON.stringify({
                        files: [
                            { path: 'SKILL.md', contents: '# Multi' },
                            { path: 'b_helper.txt', contents: 'helper b' },
                            { path: 'a_helper.txt', contents: 'helper a' },
                        ],
                        hash: '',
                    }),
                    { status: 200 },
                );
            }
            return new Response('Not found', { status: 404 });
        }) as unknown as typeof fetch;

        const result = await tryBlobInstall('owner/repo', {
            ref: 'main',
            fetchFn: mockFetch,
        });

        expect(result).not.toBeNull();
        expect(result?.skills.length).toBe(1);
        expect(result?.skills[0]?.name).toBe('Multi Skill');
        expect(result?.skills[0]?.files.length).toBe(3);
        expect(typeof result?.skills[0]?.snapshotHash).toBe('string');
        expect(result?.skills[0]?.snapshotHash.length).toBe(64);
    });

    it('cloneRepo rejects unsafe ext:: transport protocol (residual-proof security negative)', async () => {
        await expect(cloneRepo('ext::ssh -i id_rsa host')).rejects.toThrow(GitCloneError);
        await expect(cloneRepo('EXT::git-upload-pack /path')).rejects.toThrow(/Unsupported Git transport: ext/);
    });

    it('cloneRepo terminates Git options before an option-shaped repository argument', async () => {
        let capturedArgs: string[] = [];
        const cloned = await cloneRepo('--upload-pack=attacker-controlled', undefined, {
            execGit: async (args) => {
                capturedArgs = args;
                return { stdout: '', stderr: '' };
            },
        });

        const terminator = capturedArgs.indexOf('--');
        expect(terminator).toBeGreaterThan(-1);
        expect(capturedArgs[terminator + 1]).toBe('--upload-pack=attacker-controlled');
        expect(capturedArgs[terminator + 2]).toBe(cloned);
        await cleanupTempDir(cloned);
    });

    it('cloneRepo handles non-Error throwables and git runner errors', async () => {
        const mockStringGit = async () => {
            throw 'raw string error';
        };

        try {
            await cloneRepo('https://github.com/owner/repo.git', 'main', { execGit: mockStringGit });
        } catch (err: unknown) {
            expect(err).toBeInstanceOf(GitCloneError);
            expect((err as GitCloneError).message).toContain('raw string error');
        }

        const mockTimeoutGit = async () => {
            throw new Error('command timed out');
        };

        try {
            await cloneRepo('https://github.com/owner/repo.git', 'main', { execGit: mockTimeoutGit });
        } catch (err: unknown) {
            expect(err).toBeInstanceOf(GitCloneError);
            expect((err as GitCloneError).isTimeout).toBe(true);
        }

        const mockAuthGit = async () => {
            throw new Error('Authentication failed for url');
        };

        // Stub the gh fallback too — without it cloneRepo shells out to real `gh auth status`
        // and a real SSH clone, which is nondeterministic and trips the 5s test timeout.
        const mockGhUnavailable = async () => {
            throw new Error('gh: not available');
        };

        try {
            await cloneRepo('https://github.com/owner/repo.git', 'main', {
                execGit: mockAuthGit,
                execGh: mockGhUnavailable,
            });
        } catch (err: unknown) {
            expect(err).toBeInstanceOf(GitCloneError);
            expect((err as GitCloneError).isAuthError).toBe(true);
        }
    });

    it('cloneRepo executes injected git runner with security hardening environment flags', async () => {
        let capturedEnv: Record<string, string> = {};
        let capturedArgs: string[] = [];

        const mockExecGit = async (args: string[], env: Record<string, string>) => {
            capturedArgs = args;
            capturedEnv = env;
            const targetDir = args[args.length - 1];
            if (!targetDir) return { stdout: '', stderr: '' };
            mkdirSync(targetDir, { recursive: true });
            writeFileSync(join(targetDir, 'SKILL.md'), '# Test');
            return { stdout: '', stderr: '' };
        };

        const tempDir = await cloneRepo('https://github.com/owner/repo.git', 'main', {
            execGit: mockExecGit,
        });

        expect(capturedEnv.GIT_ALLOW_PROTOCOL).toBe('https:http:ssh:git:file');
        expect(capturedEnv.GIT_TERMINAL_PROMPT).toBe('0');
        expect(capturedEnv.GIT_LFS_SKIP_SMUDGE).toBe('1');
        expect(capturedArgs).toContain('--branch');
        expect(capturedArgs).toContain('main');

        await cleanupTempDir(tempDir);
    });

    it('cleanupTempDir successfully removes directory within temp dir and rejects outside paths', async () => {
        const validTempDir = await mkdtemp(join(tmpdir(), 'skills-test-clean-'));
        writeFileSync(join(validTempDir, 'test.txt'), 'data');
        await cleanupTempDir(validTempDir);
        expect(existsSync(validTempDir)).toBe(false);

        await expect(cleanupTempDir('/etc')).rejects.toThrow(
            /Attempted to clean up directory outside of temp directory/,
        );
        await expect(cleanupTempDir('/usr/bin')).rejects.toThrow(
            /Attempted to clean up directory outside of temp directory/,
        );
    });

    it('getGitHubToken invokes the gh fallback only when passed and env is empty (lazy)', async () => {
        let runnerCalls = 0;
        const runner = () => {
            runnerCalls++;
            return Promise.resolve('gh_cli_token');
        };

        // Env present → runner must NOT be consulted (explicit opt-in wins, never spawns gh).
        await expect(getGitHubToken({ GITHUB_TOKEN: 'env_token' }, runner)).resolves.toBe('env_token');
        expect(runnerCalls).toBe(0);

        // Env empty → lazy fallback resolves through the runner.
        await expect(getGitHubToken({}, runner)).resolves.toBe('gh_cli_token');
        expect(runnerCalls).toBe(1);

        // No runner → env-only behavior preserved.
        await expect(getGitHubToken({})).resolves.toBeNull();
    });

    it('ghAuthTokenFromCli never throws and returns a token string or null (real spawn seam)', async () => {
        // Environment-independent contract: gh may be absent or unauthenticated (null) or
        // authenticated (token string) — the seam must never throw either way.
        const token = await ghAuthTokenFromCli();
        expect(token === null || typeof token === 'string').toBe(true);
    });

    it('default process runners execute the spawn path (git always present; gh tolerated absent)', async () => {
        const git = await spawnGit(['--version'], {});
        expect(git.stdout).toContain('git version');
        // gh may be absent on the host — the seam must still have executed (and reject cleanly).
        await expect(spawnGh(['--version'], {}).catch(() => 'gh-unavailable')).resolves.toBeDefined();
    });

    it('tryBlobInstall handles a SKILL.md at the repository root (folder-less branch)', async () => {
        const mockFetch = (async (urlStr: string | URL | Request) => {
            const url = String(urlStr);
            if (url.includes('api.github.com')) {
                return new Response(
                    JSON.stringify({
                        sha: 'root-sha',
                        tree: [{ path: 'SKILL.md', type: 'blob', sha: 'b1' }],
                    }),
                    { status: 200 },
                );
            }
            if (url.includes('raw.githubusercontent.com')) {
                return new Response('---\nname: root-skill\ndescription: at root\n---\n# Root');
            }
            if (url.includes('/api/download/')) {
                return new Response(
                    JSON.stringify({
                        hash: '',
                        files: [
                            { path: 'SKILL.md', contents: '---\nname: root-skill\ndescription: at root\n---\n# Root' },
                            { path: 'other/extra.txt', contents: 'not part of a root skill' },
                        ],
                    }),
                );
            }
            return new Response('not found', { status: 404 });
        }) as unknown as typeof fetch;

        const result = await tryBlobInstall('owner/repo', { ref: 'main', fetchFn: mockFetch });
        expect(result).not.toBeNull();
        expect(result?.skills).toHaveLength(1);
        // Root skill keeps only the SKILL.md file, not the whole repo snapshot.
        expect(result?.skills[0]?.files).toHaveLength(1);
        expect(result?.skills[0]?.files[0]?.path).toBe('SKILL.md');
    });

    it('fetchRepoTree retries once with the lazy gh token only on a real rate-limit', async () => {
        const calls: Array<{ url: string; auth: string | undefined }> = [];
        const mockFetch = (async (url: string | URL | Request, init?: RequestInit) => {
            const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
            calls.push({ url: String(url), auth });
            if (!auth) {
                return new Response('rate limited', {
                    status: 403,
                    headers: { 'x-ratelimit-remaining': '0' },
                });
            }
            return new Response(JSON.stringify({ sha: 'authed-sha', tree: [] }), { status: 200 });
        }) as unknown as typeof fetch;

        let runnerCalls = 0;
        const tree = await fetchRepoTree('owner/repo', 'main', undefined, mockFetch, () => {
            runnerCalls++;
            return 'lazy_gh_token';
        });

        expect(tree?.sha).toBe('authed-sha');
        expect(runnerCalls).toBe(1);
        expect(calls).toHaveLength(2);
        expect(calls[0]?.auth).toBeUndefined();
        expect(calls[1]?.auth).toBe('Bearer lazy_gh_token');
    });

    it('fetchRepoTree does NOT invoke the lazy runner on a plain 403 (residual-proof: both halves required)', async () => {
        // 403 without X-RateLimit-Remaining: 0 is permission-denied, not rate-limit — the
        // vendor never invokes `gh auth token` for it, and neither do we.
        const mockFetch = (async () =>
            new Response('forbidden', {
                status: 403,
                headers: { 'x-ratelimit-remaining': '7' },
            })) as unknown as typeof fetch;

        let runnerCalls = 0;
        const tree = await fetchRepoTree('owner/repo', 'main', undefined, mockFetch, () => {
            runnerCalls++;
            return 'should_not_be_used';
        });

        expect(tree).toBeNull();
        expect(runnerCalls).toBe(0);
    });

    it('cloneRepo falls back https -> gh on auth failure and clones via gh', async () => {
        const ghCalls: string[][] = [];
        const mockExecGit = async () => {
            throw new Error('remote: Authentication failed');
        };
        const mockExecGh = async (args: string[]) => {
            ghCalls.push(args);
            if (args[0] === 'auth') return { stdout: 'github.com\n  Git operations protocol: https\n', stderr: '' };
            const targetDir = args[args.indexOf('clone') + 2];
            if (targetDir) {
                mkdirSync(targetDir, { recursive: true });
                writeFileSync(join(targetDir, 'SKILL.md'), '# Test');
            }
            return { stdout: '', stderr: '' };
        };

        const dir = await cloneRepo('https://github.com/owner/private.git', undefined, {
            execGit: mockExecGit,
            execGh: mockExecGh,
        });

        expect(existsSync(join(dir, 'SKILL.md'))).toBe(true);
        expect(ghCalls[0]).toEqual(['auth', 'status', '-h', 'github.com']);
        const cloneCall = ghCalls[1] ?? [];
        expect(cloneCall[0]).toBe('repo');
        expect(cloneCall).toContain('owner/private'); // https protocol -> repo slug, not sshUrl
        await cleanupTempDir(dir);
    });

    it('cloneRepo falls back to SSH with BatchMode when gh is unavailable', async () => {
        const gitCalls: Array<{ args: string[]; env: Record<string, string> }> = [];
        let attempt = 0;
        const mockExecGit = async (args: string[], env: Record<string, string>) => {
            gitCalls.push({ args, env });
            attempt++;
            if (attempt === 1) throw new Error('Permission denied (publickey).');
            const targetDir = args[args.length - 1];
            if (targetDir) {
                mkdirSync(targetDir, { recursive: true });
                writeFileSync(join(targetDir, 'SKILL.md'), '# Test');
            }
            return { stdout: '', stderr: '' };
        };
        const mockExecGh = async () => {
            throw new Error('gh: command not found');
        };

        const dir = await cloneRepo('https://github.com/owner/private.git', undefined, {
            execGit: mockExecGit,
            execGh: mockExecGh,
        });

        expect(existsSync(join(dir, 'SKILL.md'))).toBe(true);
        expect(gitCalls).toHaveLength(2);
        expect(gitCalls[1]?.args).toContain('git@github.com:owner/private.git');
        expect(gitCalls[1]?.env.GIT_SSH_COMMAND).toBe('ssh -o BatchMode=yes');
        await cleanupTempDir(dir);
    });

    it('cloneRepo does NOT attempt auth fallbacks on a non-auth failure (residual-proof)', async () => {
        let ghCalls = 0;
        const mockExecGit = async () => {
            throw new Error('fatal: unable to connect: Connection refused');
        };
        const mockExecGh = async () => {
            ghCalls++;
            return { stdout: '', stderr: '' };
        };

        await expect(
            cloneRepo('https://github.com/owner/repo.git', undefined, { execGit: mockExecGit, execGh: mockExecGh }),
        ).rejects.toThrow(GitCloneError);
        expect(ghCalls).toBe(0);
    });

    it('cloneRepo reports targeted auth guidance after all fallbacks fail', async () => {
        const authError = new Error('Authentication failed');
        const mockExecGit = async () => {
            throw authError;
        };
        const mockExecGh = async () => {
            throw new Error('gh not authenticated');
        };

        const failure = await cloneRepo('https://github.com/owner/private.git', undefined, {
            execGit: mockExecGit,
            execGh: mockExecGh,
        }).catch((e: unknown) => e);

        expect(failure).toBeInstanceOf(GitCloneError);
        expect((failure as GitCloneError).isAuthError).toBe(true);
        expect((failure as GitCloneError).message).toContain('git@github.com:owner/private.git');
    });
});

describe('fetch.ts - fetchRepoCommitSha (task 0145 freshness probe)', () => {
    const COMMIT = '0123456789abcdef0123456789abcdef01234567';

    it('resolves an explicit ref to a trimmed 40-hex commit SHA via the sha media type', async () => {
        const calls: Array<{ url: string; headers: Record<string, string> }> = [];
        const sha = await fetchRepoCommitSha('owner/repo', 'v1.2.3', () => 'tok-123', (async (
            url: string,
            init?: RequestInit,
        ) => {
            calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
            // GitHub's application/vnd.github.sha response is the bare hash; surrounding
            // whitespace must be trimmed before validation.
            return new Response(`  ${COMMIT}  \n`, { status: 200 });
        }) as unknown as typeof fetch);
        expect(sha).toBe(COMMIT);
        expect(calls).toEqual([
            {
                url: 'https://api.github.com/repos/owner/repo/commits/v1.2.3',
                headers: {
                    Accept: 'application/vnd.github.sha',
                    'User-Agent': 'superskill-core',
                    Authorization: 'Bearer tok-123',
                },
            },
        ]);
    });

    it('omits the Authorization header when no token is available', async () => {
        let headers: Record<string, string> = {};
        await fetchRepoCommitSha('owner/repo', 'main', () => null, (async (_url: string, init?: RequestInit) => {
            headers = (init?.headers ?? {}) as Record<string, string>;
            return new Response(COMMIT, { status: 200 });
        }) as unknown as typeof fetch);
        expect(headers.Authorization).toBeUndefined();
        expect(headers.Accept).toBe('application/vnd.github.sha');
    });

    it('tries only the explicit ref: a 404 is a contextual failure, never a candidate walk', async () => {
        const urls: string[] = [];
        const probing = fetchRepoCommitSha('owner/repo', 'v1.2.3', undefined, (async (url: string) => {
            urls.push(url);
            return new Response('not found', { status: 404 });
        }) as unknown as typeof fetch);
        await expect(probing).rejects.toThrow('owner/repo@v1.2.3');
        await expect(probing).rejects.toThrow('HTTP 404');
        expect(urls).toEqual(['https://api.github.com/repos/owner/repo/commits/v1.2.3']);
    });

    it('walks HEAD, main, master in order on 404 only and returns the first hit', async () => {
        const urls: string[] = [];
        const sha = await fetchRepoCommitSha('owner/repo', undefined, undefined, (async (url: string) => {
            urls.push(url);
            if (url.endsWith('/commits/HEAD') || url.endsWith('/commits/main')) {
                return new Response('not found', { status: 404 });
            }
            return new Response(COMMIT, { status: 200 });
        }) as unknown as typeof fetch);
        expect(sha).toBe(COMMIT);
        expect(urls).toEqual([
            'https://api.github.com/repos/owner/repo/commits/HEAD',
            'https://api.github.com/repos/owner/repo/commits/main',
            'https://api.github.com/repos/owner/repo/commits/master',
        ]);
    });

    it('does NOT walk the default-ref candidates on a 403 rate limit (residual-proof: 404 walks, 403 must not)', async () => {
        const urls: string[] = [];
        const probing = fetchRepoCommitSha('owner/repo', undefined, undefined, (async (url: string) => {
            urls.push(url);
            return new Response('rate limited', { status: 403 });
        }) as unknown as typeof fetch);
        await expect(probing).rejects.toThrow('HTTP 403');
        expect(urls).toEqual(['https://api.github.com/repos/owner/repo/commits/HEAD']);
    });

    it('does NOT walk the default-ref candidates on a thrown network error (an outage is not ref-not-found)', async () => {
        let requests = 0;
        const probing = fetchRepoCommitSha('owner/repo', undefined, undefined, (async () => {
            requests += 1;
            throw new Error('getaddrinfo ENOTFOUND');
        }) as unknown as typeof fetch);
        await expect(probing).rejects.toThrow(/Commit probe for owner\/repo@HEAD.*ENOTFOUND/s);
        expect(requests).toBe(1);
    });

    it('rejects a malformed SHA body with a contextual error', async () => {
        const probing = fetchRepoCommitSha(
            'owner/repo',
            'main',
            undefined,
            (async () =>
                new Response('refs/heads/main does not look like a sha', { status: 200 })) as unknown as typeof fetch,
        );
        await expect(probing).rejects.toThrow('returned a malformed SHA');
        await expect(probing).rejects.toThrow('owner/repo@main');
    });

    it('rejects an oversized SHA body through the bounded read cap', async () => {
        const probing = fetchRepoCommitSha(
            'owner/repo',
            'main',
            undefined,
            (async () => new Response('a'.repeat(2048), { status: 200 })) as unknown as typeof fetch,
        );
        await expect(probing).rejects.toThrow(AcquisitionLimitError);
        await expect(probing).rejects.toThrow('1024-byte read cap');
    });

    it('passes a live abort signal and turns an abort-style rejection into a contextual probe failure (no real 10 s wait)', async () => {
        let observedSignal: AbortSignal | null | undefined;
        const probing = fetchRepoCommitSha('owner/repo', 'main', undefined, (async (
            _url: string,
            init?: RequestInit,
        ) => {
            observedSignal = init?.signal;
            // A timed-out fetch rejects with an abort error; simulate it immediately so the
            // test never sleeps for the real 10-second bound.
            throw new Error('The operation was aborted due to timeout');
        }) as unknown as typeof fetch);
        await expect(probing).rejects.toThrow(/Commit probe for owner\/repo@main.*aborted due to timeout/s);
        expect(observedSignal).toBeInstanceOf(AbortSignal);
        expect(observedSignal?.aborted).toBe(false);
    });

    it('fails naming all default candidates when every one answers 404', async () => {
        const probing = fetchRepoCommitSha('owner/repo', undefined, undefined, (async (url: string) =>
            url.includes('/commits/')
                ? new Response('not found', { status: 404 })
                : new Response('{}', { status: 200 })) as unknown as typeof fetch);
        await expect(probing).rejects.toThrow('tried HEAD, main, master');
    });
});

describe('fetch.ts - materializeRepoSubdir (T2/R3 shared fetch primitive)', () => {
    it('materializes a subdir via tree + per-file raw fetches', async () => {
        const tree = {
            sha: 'abc',
            branch: 'main',
            tree: [
                { path: '.claude-plugin/marketplace.json', type: 'blob' as const, sha: 'm1' },
                { path: '.claude-plugin/other.txt', type: 'blob' as const, sha: 'o1' },
                { path: 'ignored/deep.txt', type: 'blob' as const, sha: 'i1' },
            ],
        };
        const contentByPath: Record<string, string> = {
            '.claude-plugin/marketplace.json': '{"name":"mp"}',
            '.claude-plugin/other.txt': 'hello',
        };
        const fetchFn = (async (url: string) => {
            if (url.includes('/git/trees/')) {
                return new Response(JSON.stringify(tree), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                });
            }
            // raw.githubusercontent fetch
            for (const [path, content] of Object.entries(contentByPath)) {
                if (url.endsWith(`/${path}`)) {
                    return new Response(content, { status: 200 });
                }
            }
            return new Response('not found', { status: 404 });
        }) as unknown as typeof fetch;

        const destDir = await mkdtemp(join(tmpdir(), 'superskill-materialize-'));
        try {
            const materialized = await materializeRepoSubdir('owner/repo', '.claude-plugin', destDir, { fetchFn });
            expect(materialized.sha).toBe('abc');

            expect(existsSync(join(destDir, 'marketplace.json'))).toBe(true);
            expect(existsSync(join(destDir, 'other.txt'))).toBe(true);
            expect(existsSync(join(destDir, 'ignored', 'deep.txt'))).toBe(false);
            expect(readFileSync(join(destDir, 'marketplace.json'), 'utf-8')).toBe('{"name":"mp"}');
        } finally {
            await rm(destDir, { recursive: true, force: true });
        }
    });

    it('throws naming the tree endpoint when the tree cannot be fetched', async () => {
        const fetchFn = (async () => new Response('nope', { status: 500 })) as unknown as typeof fetch;
        const destDir = await mkdtemp(join(tmpdir(), 'superskill-materialize-'));
        try {
            await expect(materializeRepoSubdir('owner/repo', '', destDir, { fetchFn })).rejects.toThrow(
                /Could not fetch repository tree for owner\/repo/,
            );
        } finally {
            await rm(destDir, { recursive: true, force: true });
        }
    });

    it('throws when the subdir has no blobs', async () => {
        const tree = {
            sha: 'abc',
            branch: 'main',
            tree: [{ path: 'unrelated.txt', type: 'blob' as const, sha: 'u1' }],
        };
        const fetchFn = (async (url: string) => {
            if (url.includes('/git/trees/')) {
                return new Response(JSON.stringify(tree), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                });
            }
            return new Response('nope', { status: 404 });
        }) as unknown as typeof fetch;
        const destDir = await mkdtemp(join(tmpdir(), 'superskill-materialize-'));
        try {
            await expect(materializeRepoSubdir('owner/repo', '.claude-plugin', destDir, { fetchFn })).rejects.toThrow(
                /No files found under '.claude-plugin'/,
            );
        } finally {
            await rm(destDir, { recursive: true, force: true });
        }
    });

    // Regression: materialization used to read every blob as text, so a binary asset
    // (image/wasm) reached the cache UTF-8-mangled even when it fit the size cap.
    it('materializes a binary blob byte-for-byte instead of UTF-8 decoded text', async () => {
        const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0xc3, 0x28, 0xff, 0xfe, 0x00, 0x01]);
        const tree = {
            sha: 'abc',
            branch: 'main',
            tree: [{ path: 'skills/x/logo.png', type: 'blob' as const, sha: 'p1', size: bytes.byteLength }],
        };
        const fetchFn = (async (urlStr: string | URL | Request) => {
            const url = String(urlStr);
            if (url.includes('/git/trees/')) return new Response(JSON.stringify(tree), { status: 200 });
            if (url.includes('raw.githubusercontent.com')) return new Response(bytes, { status: 200 });
            return new Response('not found', { status: 404 });
        }) as unknown as typeof fetch;

        const destDir = await mkdtemp(join(tmpdir(), 'superskill-materialize-bin-'));
        try {
            await materializeRepoSubdir('owner/repo', 'skills', destDir, { fetchFn });
            const written = new Uint8Array(readFileSync(join(destDir, 'x', 'logo.png')));
            expect(Array.from(written)).toEqual(Array.from(bytes));
        } finally {
            await rm(destDir, { recursive: true, force: true });
        }
    });

    // Residual-proof (R9): the declared-size precheck has both halves — at the cap the blob is
    // fetched and written, one byte over is a terminal error and no download is attempted.
    it('rejects a blob declared at the cap + 1 byte from tree metadata without fetching it', async () => {
        const tree = {
            sha: 'abc',
            branch: 'main',
            tree: [
                {
                    path: 'homepage/big.gif',
                    type: 'blob' as const,
                    sha: 'big',
                    size: MAX_MATERIALIZED_BLOB_BYTES + 1,
                },
            ],
        };
        let rawFetches = 0;
        const fetchFn = (async (urlStr: string | URL | Request) => {
            const url = String(urlStr);
            if (url.includes('/git/trees/')) return new Response(JSON.stringify(tree), { status: 200 });
            if (url.includes('raw.githubusercontent.com')) rawFetches++;
            return new Response('x', { status: 200 });
        }) as unknown as typeof fetch;

        const destDir = await mkdtemp(join(tmpdir(), 'superskill-materialize-big-'));
        try {
            const failure = await materializeRepoSubdir('owner/repo', '', destDir, { fetchFn }).catch((e) => e);
            expect(failure).toBeInstanceOf(AcquisitionLimitError);
            expect((failure as Error).message).toMatch(/blob homepage\/big\.gif in owner\/repo \(\d+ bytes\)/);
            expect((failure as Error).message).toMatch(
                new RegExp(`exceeds the ${MAX_MATERIALIZED_BLOB_BYTES}-byte read cap`),
            );
            expect(rawFetches).toBe(0);
            expect(readdirSync(destDir)).toEqual([]);
        } finally {
            await rm(destDir, { recursive: true, force: true });
        }
    });

    it('fetches a blob declared exactly at the materialization cap', async () => {
        const tree = {
            sha: 'abc',
            branch: 'main',
            tree: [
                { path: 'homepage/exact.gif', type: 'blob' as const, sha: 'exact', size: MAX_MATERIALIZED_BLOB_BYTES },
            ],
        };
        let rawFetches = 0;
        const fetchFn = (async (urlStr: string | URL | Request) => {
            const url = String(urlStr);
            if (url.includes('/git/trees/')) return new Response(JSON.stringify(tree), { status: 200 });
            if (url.includes('raw.githubusercontent.com')) {
                rawFetches++;
                return new Response('ok', { status: 200 });
            }
            return new Response('not found', { status: 404 });
        }) as unknown as typeof fetch;

        const destDir = await mkdtemp(join(tmpdir(), 'superskill-materialize-exact-'));
        try {
            await materializeRepoSubdir('owner/repo', '', destDir, { fetchFn });
            expect(rawFetches).toBe(1);
            expect(readFileSync(join(destDir, 'homepage', 'exact.gif'), 'utf-8')).toBe('ok');
        } finally {
            await rm(destDir, { recursive: true, force: true });
        }
    });

    // Residual-proof (R9): with no declared size the streamed guard is the only bound — the
    // partial file must be removed rather than left truncated in the cache.
    it('caps a streamed blob with no declared tree size and removes the partial file', async () => {
        const tree = {
            sha: 'abc',
            branch: 'main',
            tree: [{ path: 'homepage/undeclared.gif', type: 'blob' as const, sha: 'u1' }],
        };
        const chunk = new Uint8Array(1024 * 1024);
        let sent = 0;
        const fetchFn = (async (urlStr: string | URL | Request) => {
            const url = String(urlStr);
            if (url.includes('/git/trees/')) return new Response(JSON.stringify(tree), { status: 200 });
            if (url.includes('raw.githubusercontent.com')) {
                return new Response(
                    new ReadableStream({
                        pull(controller) {
                            if (sent > MAX_MATERIALIZED_BLOB_BYTES) {
                                controller.close();
                                return;
                            }
                            sent += chunk.byteLength;
                            controller.enqueue(chunk);
                        },
                    }),
                    { status: 200 },
                );
            }
            return new Response('not found', { status: 404 });
        }) as unknown as typeof fetch;

        const destDir = await mkdtemp(join(tmpdir(), 'superskill-materialize-stream-'));
        try {
            await expect(materializeRepoSubdir('owner/repo', '', destDir, { fetchFn })).rejects.toThrow(
                new RegExp(
                    `blob homepage/undeclared\\.gif in owner/repo exceeds the ${MAX_MATERIALIZED_BLOB_BYTES}-byte read cap`,
                ),
            );
            expect(existsSync(join(destDir, 'homepage', 'undeclared.gif'))).toBe(false);
        } finally {
            await rm(destDir, { recursive: true, force: true });
        }
    }, 20000);
});

describe('fetch.ts - bounded acquisition (R9/F9)', () => {
    function treeFetch(tree: Array<{ path: string; type: string; sha: string }>): typeof fetch {
        return (async (urlStr: string | URL | Request) => {
            const url = String(urlStr);
            if (url.includes('/git/trees/')) {
                return new Response(JSON.stringify({ sha: 'tree-sha', branch: 'main', tree }), { status: 200 });
            }
            return new Response('not found', { status: 404 });
        }) as unknown as typeof fetch;
    }

    it('throws naming the candidate cap before fetching any SKILL.md at 257 candidates', async () => {
        const tree = Array.from({ length: 257 }, (_, i) => ({
            path: `skills/skill-${i}/SKILL.md`,
            type: 'blob',
            sha: `s${i}`,
        }));
        let rawFetches = 0;
        const fetchFn = (async (urlStr: string | URL | Request) => {
            if (String(urlStr).includes('raw.githubusercontent.com')) rawFetches++;
            return treeFetch(tree)(urlStr);
        }) as unknown as typeof fetch;

        await expect(tryBlobInstall('owner/repo', { ref: 'main', fetchFn })).rejects.toThrow(AcquisitionLimitError);
        await expect(tryBlobInstall('owner/repo', { ref: 'main', fetchFn })).rejects.toThrow(/over the 256 cap/);
        expect(rawFetches).toBe(0);
    });

    it('accepts exactly 256 candidates and keeps raw fetches within the 8-way concurrency cap', async () => {
        const count = 256;
        const tree = Array.from({ length: count }, (_, i) => ({
            path: `skills/skill-${i}/SKILL.md`,
            type: 'blob',
            sha: `s${i}`,
        }));
        let inFlight = 0;
        let peak = 0;
        const fetchFn = (async (urlStr: string | URL | Request) => {
            const url = String(urlStr);
            if (url.includes('/git/trees/')) {
                return new Response(JSON.stringify({ sha: 'tree-sha', branch: 'main', tree }), { status: 200 });
            }
            if (url.includes('raw.githubusercontent.com')) {
                inFlight++;
                peak = Math.max(peak, inFlight);
                const i = Number(url.match(/skill-(\d+)\//)?.[1] ?? 0);
                const body = `---\nname: Skill ${i}\ndescription: fixture ${i}\n---\n# Skill ${i}`;
                await new Promise((resolve) => setTimeout(resolve, 5));
                inFlight--;
                return new Response(body, { status: 200 });
            }
            if (url.includes('/api/download/')) {
                const slug = decodeURIComponent(url.split('/api/download/owner/repo/')[1] ?? '');
                return new Response(
                    JSON.stringify({ files: [{ path: 'SKILL.md', contents: `# ${slug}` }], hash: `h-${slug}` }),
                    { status: 200 },
                );
            }
            return new Response('not found', { status: 404 });
        }) as unknown as typeof fetch;

        const result = await tryBlobInstall('owner/repo', { ref: 'main', fetchFn });
        expect(result?.skills.length).toBe(count);
        expect(peak).toBeGreaterThan(1);
        expect(peak).toBeLessThanOrEqual(8);
    }, 20000);

    it('throws naming the materialization cap before writing any file at cap + 1 blobs', async () => {
        const tree = Array.from({ length: MAX_MATERIALIZED_FILES + 1 }, (_, i) => ({
            path: `.claude-plugin/file-${i}.txt`,
            type: 'blob',
            sha: `b${i}`,
        }));
        let rawFetches = 0;
        const fetchFn = (async (urlStr: string | URL | Request) => {
            if (String(urlStr).includes('raw.githubusercontent.com')) rawFetches++;
            return treeFetch(tree)(urlStr);
        }) as unknown as typeof fetch;

        const destDir = await mkdtemp(join(tmpdir(), 'superskill-matcap-'));
        try {
            await expect(materializeRepoSubdir('owner/repo', '.claude-plugin', destDir, { fetchFn })).rejects.toThrow(
                /over the \d+ materialization cap/,
            );
            expect(rawFetches).toBe(0);
            expect(readdirSync(destDir)).toEqual([]);
        } finally {
            await rm(destDir, { recursive: true, force: true });
        }
    });

    it('accepts exactly the materialization cap of files', async () => {
        const count = MAX_MATERIALIZED_FILES;
        const tree = Array.from({ length: count }, (_, i) => ({
            path: `.claude-plugin/file-${i}.txt`,
            type: 'blob',
            sha: `b${i}`,
        }));
        const fetchFn = (async (urlStr: string | URL | Request) => {
            if (String(urlStr).includes('/git/trees/')) return treeFetch(tree)(urlStr);
            return new Response('x', { status: 200 });
        }) as unknown as typeof fetch;

        const destDir = await mkdtemp(join(tmpdir(), 'superskill-matcap-exact-'));
        try {
            await materializeRepoSubdir('owner/repo', '.claude-plugin', destDir, { fetchFn });
            expect(readdirSync(destDir)).toHaveLength(count);
        } finally {
            await rm(destDir, { recursive: true, force: true });
        }
    }, 20000);

    it('caps an individual raw read: a 2 MiB + 1 byte SKILL.md throws without materializing', async () => {
        const tree = [{ path: 'skills/big/SKILL.md', type: 'blob', sha: 'big' }];
        const oversized = 'x'.repeat(2 * 1024 * 1024 + 1);
        const fetchFn = (async (urlStr: string | URL | Request) => {
            const url = String(urlStr);
            if (url.includes('/git/trees/')) {
                return new Response(JSON.stringify({ sha: 'tree-sha', branch: 'main', tree }), { status: 200 });
            }
            if (url.includes('raw.githubusercontent.com')) {
                return new Response(oversized, { status: 200 });
            }
            return new Response('not found', { status: 404 });
        }) as unknown as typeof fetch;

        await expect(tryBlobInstall('owner/repo', { ref: 'main', fetchFn })).rejects.toThrow(/byte read cap/);
    });

    it('accepts a SKILL.md at exactly the 2 MiB raw cap', async () => {
        const tree = [{ path: 'skills/exact/SKILL.md', type: 'blob', sha: 'exact' }];
        const head = '---\nname: Exact\ndescription: at cap\n---\n';
        const exact = head + 'x'.repeat(2 * 1024 * 1024 - Buffer.byteLength(head));
        expect(Buffer.byteLength(exact)).toBe(2 * 1024 * 1024);
        const fetchFn = (async (urlStr: string | URL | Request) => {
            const url = String(urlStr);
            if (url.includes('/git/trees/')) {
                return new Response(JSON.stringify({ sha: 'tree-sha', branch: 'main', tree }), { status: 200 });
            }
            if (url.includes('raw.githubusercontent.com')) {
                return new Response(exact, { status: 200 });
            }
            if (url.includes('/api/download/')) {
                return new Response(
                    JSON.stringify({ files: [{ path: 'SKILL.md', contents: '# Exact' }], hash: 'h-exact' }),
                    { status: 200 },
                );
            }
            return new Response('not found', { status: 404 });
        }) as unknown as typeof fetch;

        const result = await tryBlobInstall('owner/repo', { ref: 'main', fetchFn });
        expect(result?.skills.length).toBe(1);
    });

    // Residual-proof (R9/F9): the tree-response cap has both halves — exactly-at parses,
    // just-over is a terminal error naming the cap. Without these, a widened limit or a
    // dropped bounded read would regress silently.
    it('caps the tree response: 16 MiB + 1 byte throws naming the cap, exactly 16 MiB parses', async () => {
        const buildTreeJson = (padBytes: number) => {
            const head = '{"sha":"tree-sha","branch":"main","tree":[],"pad":"';
            return `${head}${'x'.repeat(padBytes)}"}`;
        };
        const base = Buffer.byteLength(buildTreeJson(0));

        const exact = buildTreeJson(16 * 1024 * 1024 - base);
        expect(Buffer.byteLength(exact)).toBe(16 * 1024 * 1024);
        const exactFetch = (async (urlStr: string | URL | Request) => {
            if (String(urlStr).includes('/git/trees/')) return new Response(exact, { status: 200 });
            return new Response('not found', { status: 404 });
        }) as unknown as typeof fetch;
        const ok = await fetchRepoTree('owner/repo', 'main', () => null, exactFetch);
        expect(ok?.tree).toEqual([]);

        const over = buildTreeJson(16 * 1024 * 1024 - base + 1);
        const overFetch = (async (urlStr: string | URL | Request) => {
            if (String(urlStr).includes('/git/trees/')) return new Response(over, { status: 200 });
            return new Response('not found', { status: 404 });
        }) as unknown as typeof fetch;
        await expect(fetchRepoTree('owner/repo', 'main', () => null, overFetch)).rejects.toThrow(
            /repository tree for owner\/repo exceeds the 16777216-byte read cap/,
        );
    });

    it('caps the download manifest: 32 MiB + 1 byte throws naming the cap, exactly 32 MiB installs', async () => {
        const tree = [{ path: 'skills/dl/SKILL.md', type: 'blob', sha: 'dl' }];
        const buildDownloadJson = (padBytes: number) => {
            const head = '{"files":[{"path":"SKILL.md","contents":"# Dl"}],"hash":"h","pad":"';
            return `${head}${'x'.repeat(padBytes)}"}`;
        };
        const base = Buffer.byteLength(buildDownloadJson(0));
        const rawSkill = '---\nname: Dl\ndescription: dl\n---\n# Dl';
        const fetchWith = (downloadJson: string) =>
            (async (urlStr: string | URL | Request) => {
                const url = String(urlStr);
                if (url.includes('/git/trees/')) {
                    return new Response(JSON.stringify({ sha: 'tree-sha', branch: 'main', tree }), { status: 200 });
                }
                if (url.includes('raw.githubusercontent.com')) return new Response(rawSkill, { status: 200 });
                if (url.includes('/api/download/')) return new Response(downloadJson, { status: 200 });
                return new Response('not found', { status: 404 });
            }) as unknown as typeof fetch;

        const over = buildDownloadJson(32 * 1024 * 1024 - base + 1);
        await expect(tryBlobInstall('owner/repo', { ref: 'main', fetchFn: fetchWith(over) })).rejects.toThrow(
            /download manifest for .* exceeds the 33554432-byte read cap/,
        );

        const exact = buildDownloadJson(32 * 1024 * 1024 - base);
        expect(Buffer.byteLength(exact)).toBe(32 * 1024 * 1024);
        const result = await tryBlobInstall('owner/repo', { ref: 'main', fetchFn: fetchWith(exact) });
        expect(result?.skills.length).toBe(1);
    });
});
