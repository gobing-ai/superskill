/**
 * GitHub API/raw-fetch primitives for skill acquisition: Trees/Commits API access,
 * bounded response reads, subtree materialization, and credential resolution.
 * Pure move out of fetch.ts (task 0146 R12); fetch.ts re-exports the surface that was
 * exported before the split. Helpers shared with fetch.ts/clone.ts are exported here
 * without being re-exported from fetch.ts.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { NodeProcessExecutor, type ProcessExecutor } from '@gobing-ai/ts-runtime';
import { getEnvVars } from '../env';
import { isGitHubHost } from './github-host';

/**
 * Default process execution port for git/gh invocations (no-direct-process-spawn:
 * all spawning routes through ts-runtime). Buffered: callers inspect stdout/stderr.
 */
export const defaultExecutor: ProcessExecutor = new NodeProcessExecutor();

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

/**
 * R9/F9 acquisition-bound violation: a repository's fetch fan-out or payload size
 * exceeded the hard caps. Thrown — never converted to a null/empty result — so callers
 * cannot mistake a bounded refusal for "nothing found" and fall back to an unbounded path.
 */
export class AcquisitionLimitError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AcquisitionLimitError';
    }
}

/** Maximum files materialized per materializeRepoSubdir call. Initial limit (task 0126 R9):
 * 2048; raised to 4096 when the spur marketplace corpus (~2.4k files) crossed it. Raise
 * again when a real marketplace trips it — the error names the limit and the source. */
export const MAX_MATERIALIZED_FILES = 4096;
/** Maximum concurrent outbound fetches across the blob/download/materialize fan-outs. */
export const MAX_CONCURRENT_FETCHES = 8;
/** Hard read caps (bytes): tree JSON, raw file text, download-manifest JSON, commit-SHA probe. */
const MAX_TREE_JSON_BYTES = 16 * 1024 * 1024;
/** Hard read cap (bytes) for a single raw file fetched from the repo tree. */
export const MAX_RAW_FILE_BYTES = 2 * 1024 * 1024;
/** Hard read cap (bytes) for the download-manifest JSON document. */
export const MAX_DOWNLOAD_JSON_BYTES = 32 * 1024 * 1024;
/** The `application/vnd.github.sha` response is the bare 40-char hash alone; 1 KiB is generous. */
const MAX_COMMIT_SHA_BYTES = 1024;
/** Whole commit-probe sequence (including default-ref fallback candidates) is bounded once. */
const COMMIT_PROBE_TIMEOUT_MS = 10_000;
/** A Git object SHA: exactly 40 hexadecimal characters. */
const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/i;
/**
 * Per-blob cap for a materialized repository subtree. Deliberately larger than
 * {@link MAX_RAW_FILE_BYTES}: that cap bounds text decoded into memory (SKILL.md), while a
 * marketplace repository legitimately ships multi-MB binary assets (images, `.wasm`) whose size
 * must not abort resolution. Still a bound (R9) — oversized blobs are rejected before download
 * via the tree entry's `size` when present.
 */
export const MAX_MATERIALIZED_BLOB_BYTES = 64 * 1024 * 1024;

/**
 * Map over `items` with at most `limit` in-flight workers (R9). Results keep input
 * order. On worker failure, all already-launched workers finish before the first
 * rejection propagates — callers may then clean up the output directory without
 * racing stragglers still writing into it.
 */
export async function mapWithConcurrency<T, R>(
    items: readonly T[],
    limit: number,
    worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
    const results = new Array<R>(items.length);
    let next = 0;
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
        for (;;) {
            const index = next++;
            if (index >= items.length) return;
            results[index] = await worker(items[index] as T, index);
        }
    });
    const settled = await Promise.allSettled(runners);
    const firstRejection = settled.find((s): s is PromiseRejectedResult => s.status === 'rejected');
    if (firstRejection) throw firstRejection.reason;
    return results;
}

/**
 * Stream a response body to text with a hard byte cap (R9): oversized payloads reject
 * with {@link AcquisitionLimitError} instead of allocating without bound.
 */
export async function readBodyBounded(response: Response, limitBytes: number, label: string): Promise<string> {
    const body = response.body;
    if (!body) {
        const text = await response.text();
        if (Buffer.byteLength(text) > limitBytes) {
            throw new AcquisitionLimitError(`${label} exceeds the ${limitBytes}-byte read cap`);
        }
        return text;
    }
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
            total += value.byteLength;
            if (total > limitBytes) {
                try {
                    await reader.cancel();
                } catch {
                    // cancel failures are non-fatal; the cap error below is what propagates
                }
                throw new AcquisitionLimitError(`${label} exceeds the ${limitBytes}-byte read cap`);
            }
            chunks.push(value);
        }
    }
    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf-8');
}

/**
 * Stream a response body into `destPath` byte-for-byte under a hard byte cap (R9). Oversized
 * payloads reject with {@link AcquisitionLimitError} and the partial destination file is removed.
 * Unlike {@link readBodyBounded} this never decodes to text: repository blobs include binary
 * assets (images, fonts, `.wasm`) that a UTF-8 round-trip would silently corrupt.
 */
async function writeBodyToFileBounded(
    response: Response,
    destPath: string,
    limitBytes: number,
    label: string,
): Promise<void> {
    const body = response.body;
    if (!body) {
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.byteLength > limitBytes) {
            throw new AcquisitionLimitError(`${label} exceeds the ${limitBytes}-byte read cap`);
        }
        await writeFile(destPath, buffer);
        return;
    }
    const writer = Bun.file(destPath).writer();
    const reader = body.getReader();
    let total = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
                total += value.byteLength;
                if (total > limitBytes) {
                    try {
                        await reader.cancel();
                    } catch {
                        // cancel failures are non-fatal; the cap error below is what propagates
                    }
                    throw new AcquisitionLimitError(`${label} exceeds the ${limitBytes}-byte read cap`);
                }
                writer.write(value);
            }
        }
        await writer.end();
    } catch (error) {
        try {
            await writer.end();
        } catch {
            // best-effort flush; the partial file is removed below regardless
        }
        try {
            await rm(destPath, { force: true });
        } catch {
            // best-effort cleanup; the original error is what propagates
        }
        throw error;
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
 * Get a GitHub token. Env vars first (`GITHUB_TOKEN`, `GH_TOKEN` — the user has explicitly
 * opted in). The `gh auth token` CLI fallback is NEVER invoked eagerly: callers pass
 * `ghAuthToken` only after an unauthenticated request hit a rate limit (R1; vendor
 * skill-lock.ts getGitHubToken semantics).
 */
export async function getGitHubToken(
    env?: Record<string, string | undefined>,
    ghAuthToken?: () => Promise<string | null>,
): Promise<string | null> {
    const environ = env ?? getEnvVars();
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
                const treeJson = await readBodyBounded(
                    response,
                    MAX_TREE_JSON_BYTES,
                    `repository tree for ${ownerRepo}`,
                );
                const data = JSON.parse(treeJson) as { sha: string; tree: TreeEntry[]; truncated?: boolean };
                // R3/F3: a truncated Trees API listing silently omits entries; treating it as
                // complete would install a partial skill set. Refuse with a bounded error.
                if (data.truncated === true) {
                    throw new AcquisitionLimitError(
                        `GitHub tree listing for ${ownerRepo} is truncated (repository too large for the Trees API); refusing a partial skill set`,
                    );
                }
                return { sha: data.sha, branch, tree: data.tree };
            }
        } catch (error) {
            // R9/F9: an acquisition limit is a bounded refusal, not "branch not found" —
            // never swallow it into the next-branch loop (which would end in a clone
            // fallback that repeats the same unbounded acquisition).
            if (error instanceof AcquisitionLimitError) throw error;
            // try next branch or fail
        }
    }
    return null;
}

/**
 * Resolve a ref to its current immutable commit SHA via the GitHub Commits API
 * (`Accept: application/vnd.github.sha` returns the bare hash). This is the freshness
 * probe behind marketplace cache reuse (task 0145): compare the probed commit against a
 * cache marker instead of trusting a warm snapshot's age.
 *
 * Ref semantics mirror {@link fetchRepoTree}'s candidates: an explicit ref tries only
 * itself; an undefined ref tries HEAD, main, master in that order, continuing the walk
 * on 404 only — rate-limit (403/429) and outage responses fail immediately rather than
 * burning fallback candidates. Any thrown fetch error propagates (an unreachable network
 * is not "ref not found"). One {@link AbortSignal.timeout} bounds the whole sequence.
 *
 * Rejects with a contextual error on non-success HTTP, an oversized body, or a body that
 * is not a trimmed 40-character hexadecimal SHA.
 */
export async function fetchRepoCommitSha(
    ownerRepo: string,
    ref?: string,
    getToken?: () => string | null,
    fetchFn: typeof fetch = fetch,
): Promise<string> {
    const candidates = ref ? [ref] : ['HEAD', 'main', 'master'];
    const signal = AbortSignal.timeout(COMMIT_PROBE_TIMEOUT_MS);
    for (const candidate of candidates) {
        const url = `https://api.github.com/repos/${ownerRepo}/commits/${encodeURIComponent(candidate)}`;
        const headers: Record<string, string> = {
            Accept: 'application/vnd.github.sha',
            'User-Agent': 'superskill-core',
        };
        const token = getToken ? getToken() : null;
        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }
        let response: Response;
        try {
            response = await fetchFn(url, { headers, signal });
        } catch (error) {
            throw new Error(
                `Commit probe for ${ownerRepo}@${candidate} (${url}) failed: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
        // Only "ref not found" walks the default candidates; rate limits and outages do not.
        if (response.status === 404 && !ref) continue;
        if (!response.ok) {
            throw new Error(
                `Could not fetch commit SHA for ${ownerRepo}@${candidate} (${url}): HTTP ${response.status}`,
            );
        }
        const sha = (
            await readBodyBounded(response, MAX_COMMIT_SHA_BYTES, `commit SHA for ${ownerRepo}@${candidate}`)
        ).trim();
        if (!COMMIT_SHA_PATTERN.test(sha)) {
            throw new Error(`Commit probe for ${ownerRepo}@${candidate} returned a malformed SHA`);
        }
        return sha;
    }
    throw new Error(
        `Could not resolve ${ownerRepo} to a commit (no default ref responded: tried ${candidates.join(', ')})`,
    );
}

/**
 * Materialize every blob under `subdir` of a GitHub repo into `destDir` via the
 * Trees API + per-file raw fetches (the tree+blob path, matching {@link tryBlobInstall}).
 * Built on the shared auth/tree primitives ({@link fetchRepoTree}, {@link getGitHubToken}) so
 * `install` needs no parallel GitHub client (R3).
 *
 * Consumer boundary (task 0113 T2, "used by both `install` and, *where applicable*, `skill add`"):
 * `install` uses this helper; `skill add` deliberately does not. Since task 0139 it streams blobs
 * byte-exact, but it stays GitHub-only, offers no selective SKILL.md discovery, and has no
 * git-credential auth — substituting it for {@link cloneRepo} in `skill add` would drop non-GitHub
 * git sources and private-repo auth. `skill add` therefore keeps {@link tryBlobInstall}
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
    const materializable = blobs.filter((blob) => blob.path.slice(prefix.length) !== '');
    if (materializable.length === 0) {
        throw new Error(`No files found under '${subdir || '/'}' in ${ownerRepo}`);
    }
    // R9/F9: bound the materialized-file fan-out before any mkdir/write.
    if (materializable.length > MAX_MATERIALIZED_FILES) {
        throw new AcquisitionLimitError(
            `Subdir '${subdir || '/'}' in ${ownerRepo} contains ${materializable.length} files, over the ${MAX_MATERIALIZED_FILES} materialization cap`,
        );
    }
    const token = options.getToken ? options.getToken() : null;
    await mapWithConcurrency(materializable, MAX_CONCURRENT_FETCHES, async (blob) => {
        const rel = blob.path.slice(prefix.length);
        // R9: reject an oversized blob from tree metadata before spending the download.
        if (blob.size !== undefined && blob.size > MAX_MATERIALIZED_BLOB_BYTES) {
            throw new AcquisitionLimitError(
                `blob ${blob.path} in ${ownerRepo} (${blob.size} bytes) exceeds the ${MAX_MATERIALIZED_BLOB_BYTES}-byte read cap`,
            );
        }
        const url = `https://raw.githubusercontent.com/${ownerRepo}/${tree.branch}/${blob.path}`;
        const headers: Record<string, string> = { 'User-Agent': 'superskill-core' };
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetchFn(url, { headers });
        if (!res.ok) {
            throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
        }
        const dest = join(destDir, rel);
        await mkdir(dirname(dest), { recursive: true });
        await writeBodyToFileBounded(res, dest, MAX_MATERIALIZED_BLOB_BYTES, `blob ${blob.path} in ${ownerRepo}`);
    });
    return tree;
}
