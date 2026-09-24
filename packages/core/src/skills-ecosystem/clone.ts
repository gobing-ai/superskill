/**
 * Hardened git clone with auth fallback chain, plus temp-dir cleanup.
 * Pure move out of fetch.ts (task 0146 R12); fetch.ts re-exports the surface that was
 * exported before the split.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isLexicallyContained } from '../content/paths';
import { getEnvVar, getEnvVars } from '../env';
import { defaultExecutor, type GitHubRepoInfo, isGitHubHttpsCloneUrl, parseGitHubRepoUrl } from './github-api';

/** Default clone timeout in milliseconds (5 minutes). */
export const DEFAULT_CLONE_TIMEOUT_MS = 300_000;

/** Allowed Git protocols for security hardening. */
export const ALLOWED_GIT_PROTOCOLS = 'https:http:ssh:git:file';

/** Error thrown when git clone or transport validation fails. */
export class GitCloneError extends Error {
    readonly url: string;
    readonly isTimeout: boolean;
    readonly isAuthError: boolean;

    constructor(message: string, url: string, isTimeout = false, isAuthError = false) {
        super(message);
        this.name = 'GitCloneError';
        this.url = url;
        this.isTimeout = isTimeout;
        this.isAuthError = isAuthError;
    }
}

/**
 * Run a git/gh subprocess and mirror execFile semantics: resolve with captured output on
 * exit 0, reject otherwise. The rejection message carries stderr (auth-pattern probing in
 * {@link cloneRepo} reads it) and marks signal kills as "timed out" so the clone timeout
 * classifier keeps working.
 */
async function runChecked(
    binary: 'git' | 'gh',
    args: string[],
    env: Record<string, string>,
    timeoutMs?: number,
): Promise<{ stdout: string; stderr: string }> {
    const result = await defaultExecutor.run({
        command: binary,
        args,
        env,
        ...(timeoutMs !== undefined ? { timeout: timeoutMs } : {}),
    });
    if (result.exitCode !== 0) {
        const why =
            result.exitCode === null
                ? result.signal !== undefined
                    ? `timed out (signal ${result.signal})`
                    : 'failed to start'
                : `exit code ${result.exitCode}`;
        const detail = result.stderr || result.stdout;
        throw new Error(`Command failed: ${binary} ${args.join(' ')} (${why})${detail ? `\n${detail}` : ''}`);
    }
    return { stdout: result.stdout, stderr: result.stderr };
}

/** Default git process runner — the DI seam behind `cloneRepo` `options.execGit`. */
export function spawnGit(
    args: string[],
    env: Record<string, string>,
    timeoutMs?: number,
): Promise<{ stdout: string; stderr: string }> {
    return runChecked('git', args, env, timeoutMs);
}

/** Default gh CLI process runner — the DI seam behind `cloneRepo` `options.execGh`. */
export function spawnGh(
    args: string[],
    env: Record<string, string>,
    timeoutMs?: number,
): Promise<{ stdout: string; stderr: string }> {
    return runChecked('gh', args, env, timeoutMs);
}

/**
 * Hardened clone function that checks transport rules and clones into a temporary directory.
 *
 * Auth fallback chain (R1, vendor git.ts cloneRepo): when the primary HTTPS clone of a
 * GitHub URL fails with an auth error, retry via the `gh` CLI (which carries the user's
 * GitHub credentials), then via SSH (`GIT_SSH_COMMAND`, BatchMode default). Non-auth
 * failures never trigger the fallback.
 */
export async function cloneRepo(
    url: string,
    ref?: string,
    options?: {
        timeoutMs?: number;
        execGit?: (
            args: string[],
            env: Record<string, string>,
            timeoutMs?: number,
        ) => Promise<{ stdout: string; stderr: string }>;
        execGh?: (
            args: string[],
            env: Record<string, string>,
            timeoutMs?: number,
        ) => Promise<{ stdout: string; stderr: string }>;
    },
): Promise<string> {
    if (/^ext::/i.test(url)) {
        throw new GitCloneError('Unsupported Git transport: ext', url);
    }

    const timeoutMs = options?.timeoutMs ?? DEFAULT_CLONE_TIMEOUT_MS;
    const cloneFlags = ref ? ['clone', '--depth', '1', '--branch', ref] : ['clone', '--depth', '1'];
    const gitEnv: Record<string, string> = {
        ...(getEnvVars() as Record<string, string>),
        GIT_TERMINAL_PROMPT: '0',
        GIT_ALLOW_PROTOCOL: ALLOWED_GIT_PROTOCOLS,
        GIT_LFS_SKIP_SMUDGE: '1',
    };
    const runGit = options?.execGit ?? spawnGit;
    const runGh = options?.execGh ?? spawnGh;

    const tempDir = await mkdtemp(join(tmpdir(), 'skills-'));
    try {
        await runGit(['-c', 'filter.lfs.required=false', ...cloneFlags, '--', url, tempDir], gitEnv, timeoutMs);
        return tempDir;
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        const isTimeout = msg.includes('timeout') || msg.includes('timed out');
        const isAuth = isGitAuthFailure(msg);
        const repo = parseGitHubRepoUrl(url);

        if (!isTimeout && isAuth && repo && isGitHubHttpsCloneUrl(url)) {
            const host = repo.sshUrl.match(/^git@([^:]+):/)?.[1] || 'github.com';

            // Fallback 1 — gh CLI carries the user's GitHub credentials. When gh's git
            // protocol is ssh, clone the SSH URL through gh; otherwise the repo slug.
            let ghDir: string | undefined;
            try {
                const status = await runGh(['auth', 'status', '-h', host], gitEnv, 5000);
                const cloneTarget = /Git operations protocol:\s+ssh/i.test(`${status.stdout}${status.stderr}`)
                    ? repo.sshUrl
                    : repo.slug;
                ghDir = await mkdtemp(join(tmpdir(), 'skills-'));
                const ghFlags = ref ? ['--depth=1', '--branch', ref] : ['--depth=1'];
                await runGh(['repo', 'clone', cloneTarget, ghDir, '--', ...ghFlags], gitEnv, timeoutMs);
                await rmQuiet(tempDir);
                return ghDir;
            } catch {
                if (ghDir) await rmQuiet(ghDir);
                // Fall through to the SSH retry.
            }

            // Fallback 2 — plain SSH with interactive prompts disabled.
            let sshDir: string | undefined;
            try {
                sshDir = await mkdtemp(join(tmpdir(), 'skills-'));
                await runGit(
                    ['-c', 'filter.lfs.required=false', ...cloneFlags, '--', repo.sshUrl, sshDir],
                    {
                        ...gitEnv,
                        GIT_SSH_COMMAND: getEnvVar('GIT_SSH_COMMAND') ?? 'ssh -o BatchMode=yes',
                    },
                    timeoutMs,
                );
                await rmQuiet(tempDir);
                return sshDir;
            } catch {
                if (sshDir) await rmQuiet(sshDir);
                // Fall through to the targeted auth error below.
            }
        }

        await rmQuiet(tempDir);
        if (isAuth) {
            throw new GitCloneError(
                `Authentication failed for ${url}.\n` +
                    '  - For private repos, ensure you have access\n' +
                    (repo ? `  - Retry with SSH: superskill skill add ${repo.sshUrl}\n` : '') +
                    `  - Check access with: gh auth status -h ${repoHost(repo)} or ssh -T git@${repoHost(repo)}`,
                url,
                false,
                true,
            );
        }
        throw new GitCloneError(`Failed to clone ${url}: ${msg}`, url, isTimeout, false);
    }
}

/** Vendor-parity auth-failure patterns (git.ts isAuthFailure). */
function isGitAuthFailure(message: string): boolean {
    return (
        message.includes('Authentication failed') ||
        message.includes('could not read Username') ||
        message.includes('Permission denied') ||
        message.includes('Repository not found') ||
        message.includes('requested URL returned error: 403') ||
        /SSO|saml/i.test(message)
    );
}

function repoHost(repo: GitHubRepoInfo | null): string {
    return repo?.sshUrl.match(/^git@([^:]+):/)?.[1] ?? 'github.com';
}

/** Best-effort recursive remove — cleanup must never mask the real clone error. */
async function rmQuiet(dir: string): Promise<void> {
    try {
        await rm(dir, { recursive: true, force: true });
    } catch {
        // Best effort: a failed cleanup leaves a temp dir, never a wrong error.
    }
}

/**
 * Clean up temporary directories created by cloneRepo, ensuring they remain inside system temp.
 * Delegates to the shared lexical containment predicate (R2/C1) — purely lexical, no
 * realpath, so a symlinked temp ancestor cannot flip the verdict.
 */
export async function cleanupTempDir(dir: string): Promise<void> {
    if (!isLexicallyContained(tmpdir(), dir)) {
        throw new Error('Attempted to clean up directory outside of temp directory');
    }

    await rm(dir, { recursive: true, force: true });
}
