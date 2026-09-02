import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, normalize, resolve, sep } from 'node:path';
import { NodeProcessExecutor, type ProcessExecutor } from '@gobing-ai/ts-runtime';
import { parseSkillFrontmatter } from './frontmatter';
import { isGitHubHost } from './github-host';
import { computeStructuredContentHash } from './locks';
import { sanitizeMetadata } from './sanitize';

/**
 * Default process execution port for git/gh invocations (no-direct-process-spawn:
 * all spawning routes through ts-runtime). Buffered: callers inspect stdout/stderr.
 */
const defaultExecutor: ProcessExecutor = new NodeProcessExecutor();

/** Default clone timeout in milliseconds (5 minutes). */
export const DEFAULT_CLONE_TIMEOUT_MS = 300_000;

/** Allowed Git protocols for security hardening. */
export const ALLOWED_GIT_PROTOCOLS = 'https:http:ssh:git:file';

/** Default base URL for the skills.sh download API; `SKILLS_DOWNLOAD_URL` overrides per call. */
export const DEFAULT_DOWNLOAD_BASE_URL = 'https://skills.sh';

/** A single file entry within a skill snapshot. */
export interface SkillSnapshotFile {
    path: string;
    contents: string;
}

/** Response shape from the skills download API. */
export interface SkillDownloadResponse {
    files: SkillSnapshotFile[];
    hash: string;
}

/** A skill resolved from blob storage carrying in-memory file snapshots. */
export interface BlobSkill {
    name: string;
    description: string;
    path: string;
    rawContent: string;
    metadata?: Record<string, unknown>;
    files: SkillSnapshotFile[];
    snapshotHash: string;
    repoPath: string;
}

/** Entry within a GitHub repository tree. */
export interface TreeEntry {
    path: string;
    type: 'blob' | 'tree';
    sha: string;
    size?: number;
}

/** Full recursive repository tree from GitHub Trees API. */
export interface RepoTree {
    sha: string;
    branch: string;
    tree: TreeEntry[];
}

/** Result from a successful blob-based skill installation. */
export interface BlobInstallResult {
    skills: BlobSkill[];
    tree: RepoTree;
}

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

/** Info extracted from a GitHub repository URL. */
export interface GitHubRepoInfo {
    owner: string;
    repo: string;
    slug: string;
    sshUrl: string;
}

/**
 * Convert a skill name to a URL-safe slug.
 */
export function toSkillSlug(name: string): string {
    return name
        .toLowerCase()
        .replace(/[\s_]+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

/**
 * Get a GitHub token. Env vars first (`GITHUB_TOKEN`, `GH_TOKEN` — the user has explicitly
 * opted in). The `gh auth token` CLI fallback is NEVER invoked eagerly: callers pass
 * `ghAuthToken` only after an unauthenticated request hit a rate limit (R1; vendor
 * skill-lock.ts getGitHubToken semantics).
 */
export async function getGitHubToken(
    env?: Record<string, string | undefined>,
    ghAuthToken?: () => Promise<string | null>,
): Promise<string | null> {
    const environ = env ?? process.env;
    if (environ.GITHUB_TOKEN?.trim()) return environ.GITHUB_TOKEN.trim();
    if (environ.GH_TOKEN?.trim()) return environ.GH_TOKEN.trim();
    return ghAuthToken ? ghAuthToken() : null;
}

/** Lazy credential fallback: spawn `gh auth token` (vendor parity; injectable via `getGitHubToken`). */
export async function ghAuthTokenFromCli(executor: ProcessExecutor = defaultExecutor): Promise<string | null> {
    try {
        const result = await executor.run({ command: 'gh', args: ['auth', 'token'] });
        if (result.exitCode !== 0) return null;
        const token = result.stdout.trim();
        return token || null;
    } catch {
        // gh not installed or not authenticated.
        return null;
    }
}

/**
 * Parse a GitHub repository URL into owner, repo, slug, and SSH URL.
 */
export function parseGitHubRepoUrl(url: string): GitHubRepoInfo | null {
    const sshMatch = url.match(/^git@([^:]+):([^/]+)\/([^/]+?)(?:\.git)?$/i);
    if (sshMatch?.[1] && sshMatch[2] && sshMatch[3] && isGitHubHost(sshMatch[1])) {
        const host = sshMatch[1];
        const owner = sshMatch[2];
        const repo = sshMatch[3];
        return {
            owner,
            repo,
            slug: `${owner}/${repo}`,
            sshUrl: `git@${host}:${owner}/${repo}.git`,
        };
    }

    try {
        const parsed = new URL(url);
        if (!isGitHubHost(parsed.host)) return null;

        const match = parsed.pathname.match(/^\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
        if (!match?.[1] || !match[2]) return null;

        const owner = match[1];
        const repo = match[2];
        return {
            owner,
            repo,
            slug: `${owner}/${repo}`,
            sshUrl: `git@${parsed.host}:${owner}/${repo}.git`,
        };
    } catch {
        return null;
    }
}

/**
 * Check if a URL is a GitHub HTTPS clone URL.
 */
export function isGitHubHttpsCloneUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:' && isGitHubHost(parsed.host);
    } catch {
        return false;
    }
}

/**
 * Extract tree SHA for a specific skill path from a RepoTree.
 */
export function getSkillFolderHashFromTree(tree: RepoTree, skillPath: string): string | null {
    let folderPath = skillPath.replace(/\\/g, '/');
    if (folderPath.endsWith('/')) {
        folderPath = folderPath.slice(0, -1);
    }

    if (folderPath.toLowerCase().endsWith('/skill.md')) {
        folderPath = folderPath.slice(0, -9);
    } else if (folderPath.toLowerCase().endsWith('skill.md')) {
        folderPath = folderPath.slice(0, -8);
    }
    if (folderPath.endsWith('/')) {
        folderPath = folderPath.slice(0, -1);
    }

    if (!folderPath) {
        return tree.sha;
    }

    const entry = tree.tree.find((e) => e.type === 'tree' && e.path === folderPath);
    return entry?.sha ?? null;
}

/** Priority directories where SKILL.md files are commonly located. */
export const PRIORITY_PREFIXES = [
    '',
    'skills/',
    'skills/.curated/',
    'skills/.experimental/',
    'skills/.system/',
    '.agents/skills/',
    '.claude/skills/',
    '.cline/skills/',
    '.codebuddy/skills/',
    '.codex/skills/',
    '.commandcode/skills/',
    '.continue/skills/',
    '.github/skills/',
    '.goose/skills/',
    '.grok/skills/',
    '.iflow/skills/',
    '.junie/skills/',
    '.kilocode/skills/',
    '.kimchi/skills/',
    '.kiro/skills/',
    '.mux/skills/',
    '.neovate/skills/',
    '.opencode/skills/',
    '.openhands/skills/',
    '.pi/skills/',
    '.qoder/skills/',
    '.roo/skills/',
    '.trae/skills/',
    '.windsurf/skills/',
    '.zcode/skills/',
    '.zencoder/skills/',
];

/**
 * Find all SKILL.md file paths in a RepoTree with priority directory matching.
 */
export function findSkillMdPaths(tree: RepoTree, subpath?: string): string[] {
    const allSkillMds = tree.tree
        .filter((e) => e.type === 'blob' && e.path.toLowerCase().endsWith('skill.md'))
        .map((e) => e.path);

    const prefix = subpath ? (subpath.endsWith('/') ? subpath : `${subpath}/`) : '';
    const filtered = prefix
        ? allSkillMds.filter((p) => p.startsWith(prefix) || p === `${prefix}SKILL.md`)
        : allSkillMds;

    if (filtered.length === 0) return [];

    const priorityResults: string[] = [];
    const seen = new Set<string>();
    const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '__pycache__']);
    const lowerSkillMdSet = new Set(filtered.map((p) => p.toLowerCase()));

    for (const priorityPrefix of PRIORITY_PREFIXES) {
        const fullPrefix = prefix + priorityPrefix;
        const isContainer = priorityPrefix !== '';

        for (const skillMd of filtered) {
            if (!skillMd.startsWith(fullPrefix)) continue;
            const rest = skillMd.slice(fullPrefix.length);

            if (rest.toLowerCase() === 'skill.md') {
                if (!seen.has(skillMd)) {
                    priorityResults.push(skillMd);
                    seen.add(skillMd);
                }
                continue;
            }

            const parts = rest.split('/');
            if (parts.length === 2 && parts[1]?.toLowerCase() === 'skill.md') {
                if (!seen.has(skillMd)) {
                    priorityResults.push(skillMd);
                    seen.add(skillMd);
                }
                continue;
            }

            const p0 = parts[0];
            const p1 = parts[1];
            if (
                isContainer &&
                parts.length === 3 &&
                parts[2]?.toLowerCase() === 'skill.md' &&
                p0 &&
                p1 &&
                !SKIP_DIRS.has(p0) &&
                !SKIP_DIRS.has(p1)
            ) {
                const parentSkillMd = `${fullPrefix}${p0}/SKILL.md`.toLowerCase();
                if (!lowerSkillMdSet.has(parentSkillMd) && !seen.has(skillMd)) {
                    priorityResults.push(skillMd);
                    seen.add(skillMd);
                }
            }
        }
    }

    if (priorityResults.length > 0) return priorityResults;

    return filtered.filter((p) => p.split('/').length <= 6);
}

/**
 * Fetch a GitHub repository tree via GitHub Trees API.
 */
export async function fetchRepoTree(
    ownerRepo: string,
    ref?: string,
    getToken?: () => string | null,
    fetchFn: typeof fetch = fetch,
    ghTokenRunner?: () => string | null,
): Promise<RepoTree | null> {
    const branches = ref ? [ref] : ['HEAD', 'main', 'master'];
    const token = getToken ? getToken() : null;

    for (const branch of branches) {
        try {
            const url = `https://api.github.com/repos/${ownerRepo}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
            const headers: Record<string, string> = {
                Accept: 'application/vnd.github.v3+json',
                'User-Agent': 'superskill-core',
            };
            if (token) {
                headers.Authorization = `Bearer ${token}`;
            }

            let response = await fetchFn(url, { headers });

            // Rate-limit (vendor blob.ts): 403/429 with X-RateLimit-Remaining: 0. Only now
            // may the lazy `gh auth token` fallback run — never eagerly (R1) — then retry
            // this branch once with the resolved credential.
            const rateLimited =
                !response.ok &&
                (response.status === 403 || response.status === 429) &&
                response.headers.get('x-ratelimit-remaining') === '0';
            if (rateLimited && ghTokenRunner) {
                const lazyToken = ghTokenRunner();
                if (lazyToken) {
                    headers.Authorization = `Bearer ${lazyToken}`;
                    response = await fetchFn(url, { headers });
                }
            }

            if (response.ok) {
                const data = (await response.json()) as { sha: string; tree: TreeEntry[] };
                return { sha: data.sha, branch, tree: data.tree };
            }
        } catch {
            // try next branch or fail
        }
    }
    return null;
}

/**
 * Attempt to install skills via GitHub Trees/Blob API fast path.
 */
export async function tryBlobInstall(
    ownerRepo: string,
    options: {
        subpath?: string;
        skillFilter?: string;
        ref?: string;
        getToken?: () => string | null;
        includeInternal?: boolean;
        fetchFn?: typeof fetch;
        ghTokenRunner?: () => string | null;
    } = {},
): Promise<BlobInstallResult | null> {
    const fetchFn = options.fetchFn ?? fetch;
    const tree = await fetchRepoTree(ownerRepo, options.ref, options.getToken, fetchFn, options.ghTokenRunner);
    if (!tree) return null;

    let skillMdPaths = findSkillMdPaths(tree, options.subpath);
    if (skillMdPaths.length === 0) return null;

    if (options.skillFilter) {
        const filterSlug = toSkillSlug(options.skillFilter);
        const filtered = skillMdPaths.filter((p) => {
            const parts = p.split('/');
            if (parts.length < 2) return false;
            const folderName = parts[parts.length - 2];
            return folderName ? toSkillSlug(folderName) === filterSlug : false;
        });
        if (filtered.length > 0) {
            skillMdPaths = filtered;
        }
    }

    const mdFetches = await Promise.all(
        skillMdPaths.map(async (mdPath) => {
            try {
                const url = `https://raw.githubusercontent.com/${ownerRepo}/${tree.branch}/${mdPath}`;
                const res = await fetchFn(url);
                if (!res.ok) return null;
                const text = await res.text();
                return { mdPath, content: text };
            } catch {
                return null;
            }
        }),
    );

    const parsedSkills: Array<{
        mdPath: string;
        name: string;
        description: string;
        content: string;
        slug: string;
        metadata?: Record<string, unknown>;
    }> = [];

    for (const item of mdFetches) {
        if (!item?.content) continue;
        const parsed = parseSkillFrontmatter(item.content);
        if (!parsed) continue;
        const { data } = parsed;

        const isInternal = (data.metadata as Record<string, unknown>)?.internal === true;
        if (isInternal && !options.includeInternal) continue;

        const safeName = sanitizeMetadata(parsed.name);
        const safeDescription = sanitizeMetadata(parsed.description);

        parsedSkills.push({
            mdPath: item.mdPath,
            name: safeName,
            description: safeDescription,
            content: item.content,
            slug: toSkillSlug(safeName),
            metadata: data.metadata as Record<string, unknown> | undefined,
        });
    }

    if (parsedSkills.length === 0) return null;

    let filteredSkills = parsedSkills;
    if (options.skillFilter) {
        const filterSlug = toSkillSlug(options.skillFilter);
        const nameFiltered = parsedSkills.filter((s) => s.slug === filterSlug);
        if (nameFiltered.length > 0) {
            filteredSkills = nameFiltered;
        } else {
            return null;
        }
    }

    const source = ownerRepo.toLowerCase();
    const downloads = await Promise.all(
        filteredSkills.map(async (skill) => {
            try {
                const [owner, repo] = source.split('/');
                if (!owner || !repo) return null;
                const downloadBase = process.env.SKILLS_DOWNLOAD_URL?.trim() || DEFAULT_DOWNLOAD_BASE_URL;
                const url = `${downloadBase}/api/download/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(skill.slug)}`;
                const res = await fetchFn(url);
                if (!res.ok) return null;
                const downloadData = (await res.json()) as SkillDownloadResponse;
                return { skill, download: downloadData };
            } catch {
                return null;
            }
        }),
    );

    if (downloads.some((d) => !d?.download)) return null;

    const blobSkills: BlobSkill[] = [];
    for (const item of downloads) {
        if (!item?.download) continue;
        const skill = item.skill;
        const download = item.download;
        const mdPathLower = skill.mdPath.toLowerCase();
        const folderPath = mdPathLower.endsWith('/skill.md')
            ? skill.mdPath.slice(0, -9)
            : mdPathLower === 'skill.md'
              ? ''
              : skill.mdPath.slice(0, -(1 + 'SKILL.md'.length));

        const files = folderPath ? download.files : download.files.filter((f) => f.path.toLowerCase() === 'skill.md');

        blobSkills.push({
            name: skill.name,
            description: skill.description,
            path: '',
            rawContent: skill.content,
            metadata: skill.metadata,
            files,
            snapshotHash: computeSnapshotHash(files),
            repoPath: skill.mdPath,
        });
    }

    return { skills: blobSkills, tree };
}

function computeSnapshotHash(files: SkillSnapshotFile[]): string {
    return computeStructuredContentHash(files);
}

/**
 * Materialize every blob under `subdir` of a GitHub repo into `destDir` via the
 * Trees API + per-file raw fetches (the tree+blob path, matching {@link tryBlobInstall}).
 * Built on the shared auth/tree primitives ({@link fetchRepoTree}, {@link getGitHubToken}) so
 * `install` needs no parallel GitHub client (R3).
 *
 * Consumer boundary (task 0113 T2, "used by both `install` and, *where applicable*, `skill add`"):
 * `install` uses this helper; `skill add` deliberately does not. It materializes blobs through
 * `res.text()`, so it is text-only and GitHub-only — substituting it for {@link cloneRepo} in
 * `skill add` would UTF-8-mangle binary skill assets, drop non-GitHub git sources, and lose
 * git-credential auth for private repos. `skill add` therefore keeps {@link tryBlobInstall}
 * (selective SKILL.md discovery returning in-memory {@link BlobSkill}s) and {@link cloneRepo}
 * (full-fidelity fallback); both sit on the same shared auth/tree layer, which is what R3 requires.
 *
 * Rejects when the tree cannot be fetched or `subdir` contains no blobs. The caller asserts any
 * locator-derived path segments before the first mkdir.
 *
 * @returns The fetched {@link RepoTree} (callers may ignore it; install records `sha` as `resolvedRef`).
 */
export async function materializeRepoSubdir(
    ownerRepo: string,
    subdir: string,
    destDir: string,
    options: {
        ref?: string;
        getToken?: () => string | null;
        fetchFn?: typeof fetch;
        ghTokenRunner?: () => string | null;
    } = {},
): Promise<RepoTree> {
    const fetchFn = options.fetchFn ?? fetch;
    const tree = await fetchRepoTree(ownerRepo, options.ref, options.getToken, fetchFn, options.ghTokenRunner);
    if (!tree) {
        throw new Error(
            `Could not fetch repository tree for ${ownerRepo}${options.ref ? `@${options.ref}` : ''} ` +
                `(https://api.github.com/repos/${ownerRepo}/git/trees/)`,
        );
    }
    const prefix = subdir ? (subdir.endsWith('/') ? subdir : `${subdir}/`) : '';
    const blobs = tree.tree.filter((e) => e.type === 'blob' && e.path.startsWith(prefix));
    if (blobs.length === 0) {
        throw new Error(`No files found under '${subdir || '/'}' in ${ownerRepo}`);
    }
    const token = options.getToken ? options.getToken() : null;
    await Promise.all(
        blobs.map(async (blob) => {
            const rel = blob.path.slice(prefix.length);
            if (!rel) return;
            const url = `https://raw.githubusercontent.com/${ownerRepo}/${tree.branch}/${blob.path}`;
            const headers: Record<string, string> = { 'User-Agent': 'superskill-core' };
            if (token) headers.Authorization = `Bearer ${token}`;
            const res = await fetchFn(url, { headers });
            if (!res.ok) {
                throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
            }
            const text = await res.text();
            const dest = join(destDir, rel);
            await mkdir(dirname(dest), { recursive: true });
            await writeFile(dest, text);
        }),
    );
    return tree;
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
        ...(process.env as Record<string, string>),
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
                        GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND ?? 'ssh -o BatchMode=yes',
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
                    (repo ? `  - Retry with SSH: npx skills add ${repo.sshUrl}\n` : '') +
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
 */
export async function cleanupTempDir(dir: string): Promise<void> {
    const normalizedDir = normalize(resolve(dir));
    const normalizedTmpDir = normalize(resolve(tmpdir()));

    if (!normalizedDir.startsWith(normalizedTmpDir + sep) && normalizedDir !== normalizedTmpDir) {
        throw new Error('Attempted to clean up directory outside of temp directory');
    }

    await rm(dir, { recursive: true, force: true });
}
