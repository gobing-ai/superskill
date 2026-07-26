import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanAndCreateDir } from '../../src/skills-ecosystem/installer';
import { getGlobalLockPath, readGlobalLock, writeGlobalLock } from '../../src/skills-ecosystem/locks';
import { addSkills, listSkills, removeSkills, updateSkills } from '../../src/skills-ecosystem/operations';

/** Minimal valid skill fixture: discovery requires frontmatter name + description. */
function skillMd(name: string, heading?: string): string {
    return `---\nname: ${name}\ndescription: test fixture\n---\n# ${heading ?? name}`;
}

async function makeSource(dir: string, body: string): Promise<void> {
    await cleanAndCreateDir(dir);
    writeFileSync(join(dir, 'SKILL.md'), body);
}

async function makeHome(prefix: string): Promise<string> {
    return mkdtemp(join(tmpdir(), prefix));
}

/** fetch mock serving the GitHub trees/raw endpoints and the skills.sh download API. */
function mockGitHubFetch(
    files: Array<{ path: string; contents: string }>,
    skillMdPath: string,
    frontmatter: string,
): typeof fetch {
    return (async (urlStr: string | URL | Request) => {
        const url = String(urlStr);
        if (url.includes('/git/trees/')) {
            return new Response(
                JSON.stringify({ sha: 'tree-sha', tree: [{ path: skillMdPath, type: 'blob', sha: 'b1' }] }),
                {
                    status: 200,
                },
            );
        }
        if (url.includes('raw.githubusercontent.com')) {
            return new Response(frontmatter, { status: 200 });
        }
        if (url.includes('/api/download/')) {
            return new Response(JSON.stringify({ files }), { status: 200 });
        }
        return new Response('Not found', { status: 404 });
    }) as unknown as typeof fetch;
}

describe('operations.ts - Skill ecosystem domain operations (add, list, remove, update)', () => {
    it('adds local directory skills under the declared name and updates the scoped lock', async () => {
        const testHome = await makeHome('ops-add-test-');
        const sourceDir = join(testHome, 'my-source-skill');
        // Basename intentionally differs from the frontmatter name: the declared name wins.
        await makeSource(sourceDir, skillMd('Ops Source Skill'));

        const addRes = await addSkills(sourceDir, {
            global: true,
            homeDir: testHome,
            env: {},
        });

        expect(addRes.success).toBe(true);
        expect(addRes.installed?.length).toBe(1);
        expect(addRes.installed?.[0]?.name).toBe('ops-source-skill');
        expect(existsSync(join(testHome, '.agents/skills/ops-source-skill/SKILL.md'))).toBe(true);
        expect(existsSync(join(testHome, '.agents/.skill-lock.json'))).toBe(true);

        const lock = await readGlobalLock({}, testHome);
        expect(lock.skills['ops-source-skill']).toBeDefined();

        const listRes = await listSkills({ global: true, homeDir: testHome, env: {} });
        expect(listRes.success).toBe(true);
        expect(listRes.skills.map((s) => s.name)).toContain('ops-source-skill');

        await rm(testHome, { recursive: true, force: true });
    });

    it('previews skill installation when dryRun option is set and writes nothing', async () => {
        const testHome = await makeHome('ops-dryrun-test-');
        const sourceDir = join(testHome, 'dry-skill');
        await makeSource(sourceDir, skillMd('Dry Skill'));

        const addRes = await addSkills(sourceDir, {
            global: true,
            homeDir: testHome,
            dryRun: true,
        });

        expect(addRes.success).toBe(true);
        expect(addRes.dryRun).toBe(true);
        expect(existsSync(join(testHome, '.agents/skills/dry-skill'))).toBe(false);
        expect(existsSync(join(testHome, '.agents/.skill-lock.json'))).toBe(false);

        await rm(testHome, { recursive: true, force: true });
    });

    it('lists discovered skills when listOnly option is set', async () => {
        const testHome = await makeHome('ops-listonly-test-');
        const sourceDir = join(testHome, 'list-skill');
        await makeSource(sourceDir, skillMd('List Skill'));

        const addRes = await addSkills(sourceDir, {
            global: true,
            homeDir: testHome,
            listOnly: true,
        });

        expect(addRes.success).toBe(true);
        expect(addRes.listOnly).toBe(true);
        expect(addRes.discovered?.length).toBe(1);

        await rm(testHome, { recursive: true, force: true });
    });

    it('removes skills across all tiers and updates locks', async () => {
        const testHome = await makeHome('ops-remove-test-');
        const sourceDir = join(testHome, 'rm-skill');
        await makeSource(sourceDir, skillMd('Rm Skill'));

        await addSkills(sourceDir, {
            global: true,
            homeDir: testHome,
        });
        expect(existsSync(join(testHome, '.agents/skills/rm-skill'))).toBe(true);

        const rmRes = await removeSkills(['rm-skill'], {
            global: true,
            homeDir: testHome,
        });

        expect(rmRes.success).toBe(true);
        expect(rmRes.removed).toContain('rm-skill');
        expect(existsSync(join(testHome, '.agents/skills/rm-skill'))).toBe(false);

        const lock = await readGlobalLock({}, testHome);
        expect(lock.skills['rm-skill']).toBeUndefined();

        await rm(testHome, { recursive: true, force: true });
    });

    it('reports no-op and does not re-emit when the source hash is unchanged', async () => {
        const testHome = await makeHome('ops-update-noop-');
        const sourceDir = join(testHome, 'up-skill');
        await makeSource(sourceDir, skillMd('Up Skill', 'Up Skill v1'));

        await addSkills(sourceDir, {
            global: true,
            homeDir: testHome,
        });
        const lockBefore = await readGlobalLock({}, testHome);
        const storedHash = lockBefore.skills['up-skill']?.skillFolderHash;
        expect(storedHash).toBeDefined();

        // Drift the canonical copy; a true no-op leaves it untouched (proves no re-emit).
        const driftMarker = join(testHome, '.agents/skills/up-skill/DRIFT.md');
        writeFileSync(driftMarker, 'local drift');

        const res = await updateSkills(['up-skill'], {
            global: true,
            homeDir: testHome,
        });

        expect(res.success).toBe(true);
        expect(res.updated[0]?.updated).toBe(false);
        expect(res.updated[0]?.reason).toBe('Already up to date');
        expect(existsSync(driftMarker)).toBe(true);

        const lockAfter = await readGlobalLock({}, testHome);
        expect(lockAfter.skills['up-skill']?.skillFolderHash).toBe(storedHash);

        await rm(testHome, { recursive: true, force: true });
    });

    it('reinstalls and re-emits when the source hash changed', async () => {
        const testHome = await makeHome('ops-update-change-');
        const sourceDir = join(testHome, 'ch-skill');
        await makeSource(sourceDir, skillMd('Ch Skill', 'Ch Skill v1'));

        await addSkills(sourceDir, {
            global: true,
            homeDir: testHome,
        });
        const lockBefore = await readGlobalLock({}, testHome);
        const oldHash = lockBefore.skills['ch-skill']?.skillFolderHash;

        writeFileSync(join(sourceDir, 'SKILL.md'), skillMd('Ch Skill', 'Ch Skill v2'));

        const res = await updateSkills(['ch-skill'], {
            global: true,
            homeDir: testHome,
        });

        expect(res.success).toBe(true);
        expect(res.updated[0]?.updated).toBe(true);
        expect(res.updated[0]?.newHash).not.toBe(oldHash);
        expect(readFileSync(join(testHome, '.agents/skills/ch-skill/SKILL.md'), 'utf-8')).toContain('Ch Skill v2');

        const lockAfter = await readGlobalLock({}, testHome);
        expect(lockAfter.skills['ch-skill']?.skillFolderHash).toBe(res.updated[0]?.newHash);

        await rm(testHome, { recursive: true, force: true });
    });

    it('lists on-disk global skills missing from the lock via disk scan', async () => {
        const testHome = await makeHome('ops-list-scan-');
        await cleanAndCreateDir(join(testHome, '.agents/skills/orphan-skill'));
        writeFileSync(join(testHome, '.agents/skills/orphan-skill/SKILL.md'), skillMd('Orphan Skill'));

        const res = await listSkills({ global: true, homeDir: testHome, env: {} });

        expect(res.success).toBe(true);
        const orphan = res.skills.find((s) => s.name === 'orphan-skill');
        expect(orphan?.source).toBe('disk-scan');
        expect(orphan?.scope).toBe('global');

        await rm(testHome, { recursive: true, force: true });
    });

    it('adds skills from a GitHub source via blob install with injected fetch', async () => {
        const testHome = await makeHome('ops-add-remote-');
        const fetchFn = mockGitHubFetch(
            [{ path: 'SKILL.md', contents: '# Remote body' }],
            'skills/remote-skill/SKILL.md',
            '---\nname: Remote Skill\ndescription: remote\n---\n# Remote body',
        );

        const res = await addSkills('owner/repo', { global: true, homeDir: testHome, env: {}, fetchFn });

        expect(res.success).toBe(true);
        expect(res.installed?.[0]?.name).toBe('remote-skill');
        expect(existsSync(join(testHome, '.agents/skills/remote-skill/SKILL.md'))).toBe(true);

        const lock = await readGlobalLock({}, testHome);
        expect(lock.skills['remote-skill']?.sourceType).toBe('github');

        await rm(testHome, { recursive: true, force: true });
    });

    it('routes GitHub shorthand skill filters through parseSource without corrupting the repository slug', async () => {
        const testHome = await makeHome('ops-add-filtered-');
        const requests: string[] = [];
        const fetchFn = (async (urlInput: string | URL | Request) => {
            const url = String(urlInput);
            requests.push(url);
            if (url.includes('/git/trees/')) {
                return new Response(
                    JSON.stringify({
                        sha: 'tree-sha',
                        tree: [
                            { path: 'skills/wanted/SKILL.md', type: 'blob', sha: 'w1' },
                            { path: 'skills/bar/SKILL.md', type: 'blob', sha: 'b1' },
                        ],
                    }),
                    { status: 200 },
                );
            }
            if (url.includes('/skills/wanted/SKILL.md')) {
                return new Response(skillMd('Wanted'), { status: 200 });
            }
            if (url.includes('/api/download/owner/repo/wanted')) {
                return new Response(JSON.stringify({ files: [{ path: 'SKILL.md', contents: skillMd('Wanted') }] }), {
                    status: 200,
                });
            }
            return new Response('Not found', { status: 404 });
        }) as unknown as typeof fetch;

        const result = await addSkills('owner/repo@wanted', {
            global: true,
            homeDir: testHome,
            env: {},
            fetchFn,
        });

        expect(result.success).toBe(true);
        expect(result.installed?.map((item) => item.name)).toEqual(['wanted']);
        expect(requests.some((url) => url.includes('repo@wanted'))).toBe(false);
        expect(existsSync(join(testHome, '.agents/skills/bar'))).toBe(false);

        await rm(testHome, { recursive: true, force: true });
    });

    it('passes parsed refs and subpaths to the clone fallback', async () => {
        const testHome = await makeHome('ops-add-clone-');
        const cloneDir = await makeHome('ops-clone-source-');
        await makeSource(join(cloneDir, 'skills/wanted'), skillMd('Wanted'));
        let cloneCall: { url: string; ref?: string } | undefined;
        const cloneRepoFn = async (url: string, ref?: string): Promise<string> => {
            cloneCall = { url, ref };
            return cloneDir;
        };
        const fetchFn = (async () => new Response('Not found', { status: 404 })) as unknown as typeof fetch;

        const result = await addSkills('https://gitlab.com/acme/repo/-/tree/release/skills/wanted', {
            global: true,
            homeDir: testHome,
            env: {},
            fetchFn,
            cloneRepoFn,
        });

        expect(result.success).toBe(true);
        expect(result.installed?.map((item) => item.name)).toEqual(['wanted']);
        expect(cloneCall).toEqual({ url: 'https://gitlab.com/acme/repo.git', ref: 'release' });

        await rm(testHome, { recursive: true, force: true });
    });

    it('update is a no-op for an unchanged GitHub-sourced skill via snapshot hash', async () => {
        const testHome = await makeHome('ops-up-remote-');
        const fetchFn = mockGitHubFetch(
            [{ path: 'SKILL.md', contents: '# Remote body' }],
            'skills/remote-skill/SKILL.md',
            '---\nname: Remote Skill\ndescription: remote\n---\n# Remote body',
        );
        await addSkills('owner/repo', { global: true, homeDir: testHome, env: {}, fetchFn });

        const res = await updateSkills(['remote-skill'], { global: true, homeDir: testHome, fetchFn });

        expect(res.success).toBe(true);
        expect(res.updated[0]?.updated).toBe(false);
        expect(res.updated[0]?.reason).toBe('Already up to date');

        await rm(testHome, { recursive: true, force: true });
    });

    it('fails cleanly when the source contains no skills', async () => {
        const testHome = await makeHome('ops-empty-');
        const sourceDir = join(testHome, 'empty-src');
        await cleanAndCreateDir(sourceDir);

        const res = await addSkills(sourceDir, { global: true, homeDir: testHome });

        expect(res.success).toBe(false);
        expect(res.error).toContain('No skills found');

        await rm(testHome, { recursive: true, force: true });
    });

    it('reports emit failures when the canonical root is not writable', async () => {
        const testHome = await makeHome('ops-emit-fail-');
        const sourceDir = join(testHome, 'src-skill');
        await makeSource(sourceDir, skillMd('Emit Fail Skill'));
        // .agents as a plain file: the canonical mkdir underneath it fails.
        writeFileSync(join(testHome, '.agents'), 'blocker');

        const res = await addSkills(sourceDir, { global: true, homeDir: testHome, env: {} });

        expect(res.success).toBe(false);
        expect(res.error).toContain('Failed to emit skill');

        await rm(testHome, { recursive: true, force: true });
    });

    it('supports project-scope add, list, update, and remove via the local lock', async () => {
        const projectDir = await makeHome('ops-local-');
        const sourceDir = join(projectDir, 'src-skill');
        await makeSource(sourceDir, skillMd('Local Skill'));

        const addRes = await addSkills(sourceDir, { cwd: projectDir });
        expect(addRes.success).toBe(true);
        expect(existsSync(join(projectDir, '.agents/skills/local-skill/SKILL.md'))).toBe(true);

        const listRes = await listSkills({ cwd: projectDir });
        expect(listRes.skills.map((s) => s.name)).toContain('local-skill');

        const upRes = await updateSkills(['local-skill'], { cwd: projectDir });
        expect(upRes.updated[0]?.updated).toBe(false);

        const rmRes = await removeSkills(['local-skill'], { cwd: projectDir });
        expect(rmRes.success).toBe(true);
        expect(existsSync(join(projectDir, '.agents/skills/local-skill'))).toBe(false);

        await rm(projectDir, { recursive: true, force: true });
    });

    it('removes the exact raw lock identity while deleting its sanitized folders', async () => {
        const testHome = await makeHome('ops-remove-identity-');
        const now = new Date().toISOString();
        await mkdir(join(testHome, '.agents/skills/ce-review'), { recursive: true });
        writeFileSync(join(testHome, '.agents/skills/ce-review/SKILL.md'), skillMd('ce:review'));
        await mkdir(join(testHome, '.hermes/skills/ce-review'), { recursive: true });
        await writeGlobalLock(
            {
                version: 3,
                skills: {
                    'ce:review': {
                        source: '/source',
                        sourceType: 'local',
                        sourceUrl: '/source',
                        skillFolderHash: 'hash',
                        installedAt: now,
                        updatedAt: now,
                    },
                },
            },
            {},
            testHome,
        );

        const result = await removeSkills(['ce-review'], {
            global: true,
            homeDir: testHome,
            env: { HERMES_HOME: join(testHome, '.hermes') },
            targets: ['hermes'],
        });

        expect(result.success).toBe(true);
        expect(result.removed).toEqual(['ce:review']);
        expect((await readGlobalLock({}, testHome)).skills['ce:review']).toBeUndefined();
        expect(existsSync(join(testHome, '.agents/skills/ce-review'))).toBe(false);
        expect(existsSync(join(testHome, '.hermes/skills/ce-review'))).toBe(false);

        await rm(testHome, { recursive: true, force: true });
    });

    it('rolls removal back and retains the lock when any target cannot be staged', async () => {
        const testHome = await makeHome('ops-remove-rollback-');
        const sourceDir = join(testHome, 'source');
        await makeSource(sourceDir, skillMd('Rollback Skill'));
        await addSkills(sourceDir, { global: true, homeDir: testHome, env: {}, targets: [] });
        const blocker = join(testHome, 'hermes-blocker');
        writeFileSync(blocker, 'not a directory');

        const result = await removeSkills(['rollback-skill'], {
            global: true,
            homeDir: testHome,
            env: { HERMES_HOME: blocker },
            targets: ['hermes'],
        });

        expect(result.success).toBe(false);
        expect(existsSync(join(testHome, '.agents/skills/rollback-skill/SKILL.md'))).toBe(true);
        expect((await readGlobalLock({}, testHome)).skills['rollback-skill']).toBeDefined();

        await rm(testHome, { recursive: true, force: true });
    });

    it('rejects incompatible locks before mutating the canonical store', async () => {
        const testHome = await makeHome('ops-version-preflight-');
        const sourceDir = join(testHome, 'source');
        await makeSource(sourceDir, skillMd('Version Guard'));
        await mkdir(join(testHome, '.agents'), { recursive: true });
        writeFileSync(getGlobalLockPath({}, testHome), '{"version":4,"skills":{"existing":{}}}\n');

        const result = await addSkills(sourceDir, { global: true, homeDir: testHome, env: {}, targets: [] });

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/lock version/i);
        expect(existsSync(join(testHome, '.agents/skills/version-guard'))).toBe(false);
        expect(readFileSync(getGlobalLockPath({}, testHome), 'utf-8')).toContain('"version":4');

        await rm(testHome, { recursive: true, force: true });
    });

    it('rolls installation back when the lock cannot be written', async () => {
        const testHome = await makeHome('ops-lock-rollback-');
        const sourceDir = join(testHome, 'source');
        await makeSource(sourceDir, skillMd('Lock Rollback'));
        const existingCanonical = join(testHome, '.agents/skills/lock-rollback');
        await makeSource(existingCanonical, skillMd('Lock Rollback', 'previous installation'));
        const existingTarget = join(testHome, '.hermes/skills/lock-rollback');
        await makeSource(existingTarget, skillMd('Lock Rollback', 'previous target'));
        const stateBlocker = join(testHome, 'state-blocker');
        writeFileSync(stateBlocker, 'not a directory');

        const result = await addSkills(sourceDir, {
            global: true,
            homeDir: testHome,
            env: { HERMES_HOME: join(testHome, '.hermes'), XDG_STATE_HOME: stateBlocker },
            targets: ['hermes'],
        });

        expect(result.success).toBe(false);
        expect(readFileSync(join(existingCanonical, 'SKILL.md'), 'utf-8')).toContain('previous installation');
        expect(readFileSync(join(existingTarget, 'SKILL.md'), 'utf-8')).toContain('previous target');

        await rm(testHome, { recursive: true, force: true });
    });

    it('stores global local sources as absolute paths so updates are independent of cwd', async () => {
        const testHome = await makeHome('ops-global-source-');
        const projectDir = join(testHome, 'project');
        const otherDir = join(testHome, 'other');
        const sourceDir = join(projectDir, 'src');
        await makeSource(sourceDir, skillMd('Portable Update'));
        await mkdir(otherDir, { recursive: true });

        const addResult = await addSkills('./src', {
            global: true,
            cwd: projectDir,
            homeDir: testHome,
            env: {},
            targets: [],
        });
        const lock = await readGlobalLock({}, testHome);
        expect(addResult.success).toBe(true);
        expect(lock.skills['portable-update']?.source).toBe(sourceDir);

        const updateResult = await updateSkills(['portable-update'], {
            global: true,
            cwd: otherDir,
            homeDir: testHome,
            env: {},
        });
        expect(updateResult.updated[0]?.reason).toBe('Already up to date');

        await rm(testHome, { recursive: true, force: true });
    });

    it('updates from one parsed plan while preserving lock-stored clone ref and SKILL.md subpath', async () => {
        const testHome = await makeHome('ops-update-lock-metadata-');
        const cloneDir = await makeHome('ops-update-lock-clone-');
        await makeSource(join(cloneDir, 'skills/wanted'), skillMd('Wanted', 'Wanted v2'));
        const now = new Date().toISOString();
        await writeGlobalLock(
            {
                version: 3,
                skills: {
                    wanted: {
                        source: 'https://gitlab.com/acme/repo.git',
                        sourceType: 'gitlab',
                        sourceUrl: 'https://gitlab.com/acme/repo.git',
                        ref: 'release',
                        skillPath: 'skills/wanted/SKILL.md',
                        skillFolderHash: 'old-hash',
                        installedAt: now,
                        updatedAt: now,
                    },
                },
            },
            {},
            testHome,
        );
        let cloneCall: { url: string; ref?: string } | undefined;
        const cloneRepoFn = async (url: string, ref?: string): Promise<string> => {
            cloneCall = { url, ref };
            return cloneDir;
        };

        const result = await updateSkills(['wanted'], {
            global: true,
            homeDir: testHome,
            env: {},
            cloneRepoFn,
        });

        expect(result.success).toBe(true);
        expect(result.updated[0]?.updated).toBe(true);
        expect(cloneCall).toEqual({ url: 'https://gitlab.com/acme/repo.git', ref: 'release' });
        expect(readFileSync(join(testHome, '.agents/skills/wanted/SKILL.md'), 'utf-8')).toContain('Wanted v2');
        const lock = await readGlobalLock({}, testHome);
        expect(lock.skills.wanted?.ref).toBe('release');
        expect(lock.skills.wanted?.skillPath).toBe('skills/wanted/SKILL.md');

        await rm(testHome, { recursive: true, force: true });
    });

    it('reports not-found and unresolvable sources during update', async () => {
        const testHome = await makeHome('ops-up-fail-');

        const missing = await updateSkills(['ghost-skill'], { global: true, homeDir: testHome });
        expect(missing.success).toBe(false);
        expect(missing.updated[0]?.reason).toBe('Not found in lock file');
        expect(missing.error).toContain('ghost-skill: Not found in lock file');

        const sourceDir = join(testHome, 'gone-src');
        await makeSource(sourceDir, skillMd('Gone Skill'));
        await addSkills(sourceDir, { global: true, homeDir: testHome, env: {} });
        // Upstream renamed the skill: the locked name no longer resolves from the source.
        writeFileSync(join(sourceDir, 'SKILL.md'), skillMd('Renamed Skill'));

        const res = await updateSkills(['gone-skill'], { global: true, homeDir: testHome });

        expect(res.success).toBe(false);
        expect(res.updated[0]?.updated).toBe(false);
        expect(res.updated[0]?.reason).toContain('No skills found in source');
        expect(res.error).toContain('gone-skill: No skills found in source');

        await rm(testHome, { recursive: true, force: true });
    });
});
