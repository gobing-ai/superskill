import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { parseSkillFrontmatter } from './frontmatter';
import { readLocalLock } from './locks';
import { sanitizeMetadata } from './sanitize';
import { isSubpathSafe } from './source-parser';

export { isSubpathSafe };

/** Ignored directories when scanning for skills recursively. */
export const SKIP_DIRS = ['node_modules', '.git', 'dist', 'build', '__pycache__'];

/** Agent project skill directories scanned during priority discovery. */
export const AGENT_PROJECT_SKILL_DIRS = [
    '.agents/skills',
    '.claude/skills',
    '.cline/skills',
    '.codebuddy/skills',
    '.codex/skills',
    '.commandcode/skills',
    '.continue/skills',
    '.github/skills',
    '.goose/skills',
    '.grok/skills',
    '.iflow/skills',
    '.junie/skills',
    '.kilocode/skills',
    '.kimchi/skills',
    '.kiro/skills',
    '.mux/skills',
    '.neovate/skills',
    '.opencode/skills',
    '.openhands/skills',
    '.pi/skills',
    '.qoder/skills',
    '.roo/skills',
    '.trae/skills',
    '.windsurf/skills',
    '.zcode/skills',
    '.zencoder/skills',
];

/** Representation of a discovered skill. */
export interface Skill {
    name: string;
    description: string;
    path: string;
    rawContent: string;
    metadata?: Record<string, unknown>;
    pluginName?: string;
}

/** Options for skill discovery. */
export interface DiscoverSkillsOptions {
    /** Include internal skills (e.g. when explicitly requested). */
    includeInternal?: boolean;
    /** Search all subdirectories even when a root SKILL.md exists. */
    fullDepth?: boolean;
}

/**
 * Check if internal skills should be installed (INSTALL_INTERNAL_SKILLS=1 or true).
 */
export function shouldInstallInternalSkills(env?: Record<string, string | undefined>): boolean {
    const val = env?.INSTALL_INTERNAL_SKILLS ?? process.env.INSTALL_INTERNAL_SKILLS;
    return val === '1' || val === 'true';
}

function normalizeSkillName(name: string): string {
    return name.toLowerCase().replace(/[\s_]+/g, '-');
}

function normalizeRelativePath(path: string): string {
    return path.split('\\').join('/').replace(/\/+/g, '/');
}

async function hasSkillMd(dir: string): Promise<boolean> {
    try {
        const skillPath = join(dir, 'SKILL.md');
        const stats = await stat(skillPath);
        return stats.isFile();
    } catch {
        return false;
    }
}

/**
 * Parse a SKILL.md file and return a Skill object or null if invalid or hidden.
 */
export async function parseSkillMd(
    skillMdPath: string,
    options?: { includeInternal?: boolean; env?: Record<string, string | undefined> },
): Promise<Skill | null> {
    let content: string;
    try {
        content = await readFile(skillMdPath, 'utf-8');
    } catch {
        return null;
    }

    const parsed = parseSkillFrontmatter(content);
    if (!parsed) {
        return null;
    }

    const { data } = parsed;

    const metadata =
        typeof data.metadata === 'object' && data.metadata !== null && !Array.isArray(data.metadata)
            ? (data.metadata as Record<string, unknown>)
            : undefined;

    const isInternal = metadata?.internal === true;
    if (isInternal && !shouldInstallInternalSkills(options?.env) && !options?.includeInternal) {
        return null;
    }

    return {
        name: sanitizeMetadata(parsed.name),
        description: sanitizeMetadata(parsed.description),
        path: dirname(skillMdPath),
        rawContent: content,
        metadata,
    };
}

async function findSkillDirs(dir: string, depth = 0, maxDepth = 5): Promise<string[]> {
    if (depth > maxDepth) return [];

    try {
        const [hasSkill, entries] = await Promise.all([
            hasSkillMd(dir),
            readdir(dir, { withFileTypes: true }).catch(() => []),
        ]);

        const currentDir = hasSkill ? [dir] : [];

        const subDirResults = await Promise.all(
            entries
                .filter((entry) => entry.isDirectory() && !SKIP_DIRS.includes(entry.name))
                .map((entry) => findSkillDirs(join(dir, entry.name), depth + 1, maxDepth)),
        );

        return [...currentDir, ...subDirResults.flat()];
    } catch {
        return [];
    }
}

/**
 * Discover all valid skills under a directory path.
 */
export async function discoverSkills(
    basePath: string,
    subpath?: string,
    options?: DiscoverSkillsOptions,
): Promise<Skill[]> {
    if (subpath && !isSubpathSafe(basePath, subpath)) {
        throw new Error(
            `Invalid subpath: "${subpath}" resolves outside the repository directory. Subpath must not contain ".." segments that escape the base path.`,
        );
    }

    const searchPath = subpath ? join(basePath, subpath) : basePath;
    const skills: Skill[] = [];
    const seenNames = new Set<string>();
    const parsedSkillPaths = new Set<string>();
    const localLock = await readLocalLock(basePath);
    const lockedSkillNames = new Set(Object.keys(localLock.skills).map(normalizeSkillName));

    const isInstalledProjectSkill = (skill: Skill): boolean => {
        if (lockedSkillNames.size === 0) return false;

        const relativeDir = normalizeRelativePath(relative(basePath, skill.path));
        const isAgentSkillPath = AGENT_PROJECT_SKILL_DIRS.some(
            (dir) => relativeDir === dir || relativeDir.startsWith(`${dir}/`),
        );
        if (!isAgentSkillPath) return false;

        const skillName = normalizeSkillName(skill.name);
        const directoryName = normalizeSkillName(basename(skill.path));
        return lockedSkillNames.has(skillName) || lockedSkillNames.has(directoryName);
    };

    const parseSkillAt = async (skillDir: string): Promise<Skill | null> => {
        const skillMdPath = resolve(skillDir, 'SKILL.md');
        if (parsedSkillPaths.has(skillMdPath)) return null;
        parsedSkillPaths.add(skillMdPath);
        return parseSkillMd(skillMdPath, options);
    };

    if (await hasSkillMd(searchPath)) {
        const skill = await parseSkillAt(searchPath);
        if (skill && !isInstalledProjectSkill(skill)) {
            skills.push(skill);
            seenNames.add(skill.name);
            if (!options?.fullDepth) {
                return skills;
            }
        }
    }

    const prioritySearchDirs = [
        searchPath,
        join(searchPath, 'skills'),
        join(searchPath, 'skills/.curated'),
        join(searchPath, 'skills/.experimental'),
        join(searchPath, 'skills/.system'),
        ...AGENT_PROJECT_SKILL_DIRS.map((dir) => join(searchPath, dir)),
    ];

    const deepContainerDirs = new Set(prioritySearchDirs.slice(1));

    const tryAddSkillAt = async (skillDir: string): Promise<boolean> => {
        if (!(await hasSkillMd(skillDir))) return false;
        const skill = await parseSkillAt(skillDir);
        if (!skill || seenNames.has(skill.name)) return true;
        if (isInstalledProjectSkill(skill)) return true;
        skills.push(skill);
        seenNames.add(skill.name);
        return true;
    };

    for (const dir of prioritySearchDirs) {
        const walkDeep = deepContainerDirs.has(dir);

        try {
            const entries = await readdir(dir, { withFileTypes: true });

            for (const entry of entries) {
                if (!entry.isDirectory()) continue;

                const childDir = join(dir, entry.name);
                const foundAtChild = await tryAddSkillAt(childDir);

                if (foundAtChild || !walkDeep) continue;
                if (SKIP_DIRS.includes(entry.name)) continue;

                try {
                    const grandEntries = await readdir(childDir, { withFileTypes: true });
                    for (const grand of grandEntries) {
                        if (!grand.isDirectory() || SKIP_DIRS.includes(grand.name)) continue;
                        await tryAddSkillAt(join(childDir, grand.name));
                    }
                } catch {
                    // ignore unreadable subdirs
                }
            }
        } catch {
            // ignore missing dirs
        }
    }

    if (skills.length === 0 || options?.fullDepth) {
        const allSkillDirs = await findSkillDirs(searchPath);

        for (const skillDir of allSkillDirs) {
            const skill = await parseSkillAt(skillDir);
            if (skill && !seenNames.has(skill.name) && !isInstalledProjectSkill(skill)) {
                skills.push(skill);
                seenNames.add(skill.name);
            }
        }
    }

    return skills;
}

/**
 * Get display name for a skill (falling back to folder name if missing).
 */
export function getSkillDisplayName(skill: Skill): string {
    return skill.name || basename(skill.path);
}

/**
 * Filter a list of skills by direct name/display-name matching against input string array.
 */
export function filterSkills(skills: Skill[], inputNames: string[]): Skill[] {
    const normalizedInputs = inputNames.map((n) => n.toLowerCase());

    return skills.filter((skill) => {
        const name = skill.name.toLowerCase();
        const displayName = getSkillDisplayName(skill).toLowerCase();

        return normalizedInputs.some((input) => input === name || input === displayName);
    });
}
