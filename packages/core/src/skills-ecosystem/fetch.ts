/**
 * Skill acquisition: GitHub blob-install fast path (discovery, slug identity, in-memory
 * skill snapshots). GitHub API/raw-fetch primitives live in ./github-api, git clone in
 * ./clone; both are re-exported below so the package surface is unchanged (R12 pure move).
 */
import { getEnvVar } from '../env';
import { parseSkillFrontmatter } from './frontmatter';
import {
    AcquisitionLimitError,
    fetchRepoTree,
    MAX_CONCURRENT_FETCHES,
    MAX_DOWNLOAD_JSON_BYTES,
    MAX_RAW_FILE_BYTES,
    mapWithConcurrency,
    type RepoTree,
    readBodyBounded,
} from './github-api';
import { computeStructuredContentHash } from './locks';
import { sanitizeMetadata, sanitizeName } from './sanitize';

export {
    ALLOWED_GIT_PROTOCOLS,
    cleanupTempDir,
    cloneRepo,
    DEFAULT_CLONE_TIMEOUT_MS,
    GitCloneError,
    spawnGh,
    spawnGit,
} from './clone';
export {
    AcquisitionLimitError,
    fetchRepoCommitSha,
    fetchRepoTree,
    type GitHubRepoInfo,
    getGitHubToken,
    ghAuthTokenFromCli,
    isGitHubHttpsCloneUrl,
    MAX_MATERIALIZED_BLOB_BYTES,
    MAX_MATERIALIZED_FILES,
    materializeRepoSubdir,
    parseGitHubRepoUrl,
    type RepoTree,
    type TreeEntry,
} from './github-api';

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

/** Result from a successful blob-based skill installation. */
export interface BlobInstallResult {
    skills: BlobSkill[];
    tree: RepoTree;
}

/** Maximum candidate SKILL.md paths fetched per tryBlobInstall call. */
export const MAX_CANDIDATE_SKILL_PATHS = 256;
/** Exact `SKILL.md` basename at any depth (R7): never a suffix like `reskill.md` or a
 * `SKILL.md.bak` leftover. Case-insensitive to match case-only filesystem variants. */
const SKILL_MD_RE = /(^|\/)skill\.md$/i;

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
 * Extract tree SHA for a specific skill path from a RepoTree.
 */
export function getSkillFolderHashFromTree(tree: RepoTree, skillPath: string): string | null {
    let folderPath = skillPath.replace(/\\/g, '/');
    if (folderPath.endsWith('/')) {
        folderPath = folderPath.slice(0, -1);
    }

    if (SKILL_MD_RE.test(folderPath)) {
        folderPath = folderPath.replace(SKILL_MD_RE, '');
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
    const allSkillMds = tree.tree.filter((e) => e.type === 'blob' && SKILL_MD_RE.test(e.path)).map((e) => e.path);

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
        // R11: filter with the lock identity (`sanitizeName`), not the skills.sh slug —
        // a lock key like `my_skill` must stay reachable without slug round-tripping.
        const wanted = sanitizeName(options.skillFilter);
        const filtered = skillMdPaths.filter((p) => {
            const parts = p.split('/');
            if (parts.length < 2) return false;
            const folderName = parts[parts.length - 2];
            return folderName ? sanitizeName(folderName) === wanted : false;
        });
        if (filtered.length > 0) {
            skillMdPaths = filtered;
        }
    }

    // R9/F9: bound the SKILL.md fan-out before launching any fetches.
    if (skillMdPaths.length > MAX_CANDIDATE_SKILL_PATHS) {
        throw new AcquisitionLimitError(
            `Repository ${ownerRepo} exposes ${skillMdPaths.length} candidate SKILL.md paths, over the ${MAX_CANDIDATE_SKILL_PATHS} cap`,
        );
    }

    const mdFetches = await mapWithConcurrency(skillMdPaths, MAX_CONCURRENT_FETCHES, async (mdPath) => {
        try {
            const url = `https://raw.githubusercontent.com/${ownerRepo}/${tree.branch}/${mdPath}`;
            const res = await fetchFn(url);
            if (!res.ok) return null;
            const text = await readBodyBounded(res, MAX_RAW_FILE_BYTES, `SKILL.md at ${mdPath} in ${ownerRepo}`);
            return { mdPath, content: text };
        } catch (error) {
            if (error instanceof AcquisitionLimitError) throw error;
            return null;
        }
    });

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
            // `slug` is the skills.sh download-API identity; `sanitizeName` stays the lock
            // and filter identity (R11) — the two namespaces are intentionally distinct.
            slug: toSkillSlug(safeName),
            metadata: data.metadata as Record<string, unknown> | undefined,
        });
    }

    if (parsedSkills.length === 0) return null;

    let filteredSkills = parsedSkills;
    if (options.skillFilter) {
        const wanted = sanitizeName(options.skillFilter);
        const nameFiltered = parsedSkills.filter((s) => sanitizeName(s.name) === wanted);
        if (nameFiltered.length > 0) {
            filteredSkills = nameFiltered;
        } else {
            return null;
        }
    }

    const source = ownerRepo.toLowerCase();
    const downloads = await mapWithConcurrency(filteredSkills, MAX_CONCURRENT_FETCHES, async (skill) => {
        try {
            const [owner, repo] = source.split('/');
            if (!owner || !repo) return null;
            const downloadBase = getEnvVar('SKILLS_DOWNLOAD_URL')?.trim() || DEFAULT_DOWNLOAD_BASE_URL;
            const url = `${downloadBase}/api/download/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(skill.slug)}`;
            const res = await fetchFn(url);
            if (!res.ok) return null;
            const downloadJson = await readBodyBounded(
                res,
                MAX_DOWNLOAD_JSON_BYTES,
                `download manifest for ${skill.slug} in ${ownerRepo}`,
            );
            const downloadData = JSON.parse(downloadJson) as SkillDownloadResponse;
            // R14/F14: bind the third-party snapshot to the GitHub tree that was inspected.
            // The skills.sh manifest must describe this exact skill — anchor on the raw
            // SKILL.md bytes fetched from the tree, not just the slug in the URL.
            const md = downloadData.files.find((f) => f.path.toLowerCase() === 'skill.md');
            if (!md || md.contents !== skill.content) return null;
            return { skill, download: downloadData };
        } catch (error) {
            if (error instanceof AcquisitionLimitError) throw error;
            return null;
        }
    });

    if (downloads.some((d) => !d?.download)) return null;

    const blobSkills: BlobSkill[] = [];
    for (const item of downloads) {
        if (!item?.download) continue;
        const skill = item.skill;
        const download = item.download;
        const folderPath = skill.mdPath.replace(SKILL_MD_RE, '');

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
