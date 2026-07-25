import { describe, expect, it } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    discoverSkills,
    filterSkills,
    getSkillDisplayName,
    isSubpathSafe,
    parseSkillMd,
    shouldInstallInternalSkills,
} from '../../src/skills-ecosystem/discovery';

describe('discovery.ts - SKILL.md discovery and path traversal safety', () => {
    it('isSubpathSafe prevents path traversal out of repo base path', () => {
        const basePath = join(tmpdir(), 'test-repo');
        expect(isSubpathSafe(basePath, 'skills/pdf')).toBe(true);
        expect(isSubpathSafe(basePath, './skills/react')).toBe(true);

        expect(isSubpathSafe(basePath, '../outside')).toBe(false);
        expect(isSubpathSafe(basePath, 'skills/../../outside')).toBe(false);
    });

    it('shouldInstallInternalSkills respects INSTALL_INTERNAL_SKILLS env variable', () => {
        expect(shouldInstallInternalSkills({ INSTALL_INTERNAL_SKILLS: '1' })).toBe(true);
        expect(shouldInstallInternalSkills({ INSTALL_INTERNAL_SKILLS: 'true' })).toBe(true);
        expect(shouldInstallInternalSkills({ INSTALL_INTERNAL_SKILLS: '0' })).toBe(false);
        expect(shouldInstallInternalSkills({})).toBe(false);
    });

    it('parseSkillMd validates frontmatter and filters internal skills when unrequested', async () => {
        const testDir = join(tmpdir(), `test-parse-skill-${Date.now()}`);
        mkdirSync(testDir, { recursive: true });

        const publicSkillMd = join(testDir, 'SKILL.md');
        writeFileSync(publicSkillMd, '---\nname: Public Skill\ndescription: Public description\n---\n# Public Content');

        const skill = await parseSkillMd(publicSkillMd);
        expect(skill).not.toBeNull();
        expect(skill?.name).toBe('Public Skill');
        expect(skill?.description).toBe('Public description');

        const internalSkillMd = join(testDir, 'INTERNAL_SKILL.md');
        writeFileSync(
            internalSkillMd,
            '---\nname: Internal Skill\ndescription: Internal description\nmetadata:\n  internal: true\n---\n# Internal',
        );

        const hiddenSkill = await parseSkillMd(internalSkillMd, { env: { INSTALL_INTERNAL_SKILLS: '0' } });
        expect(hiddenSkill).toBeNull();

        const shownSkill = await parseSkillMd(internalSkillMd, { includeInternal: true });
        expect(shownSkill).not.toBeNull();
        expect(shownSkill?.name).toBe('Internal Skill');

        // Non-existent file
        expect(await parseSkillMd(join(testDir, 'does-not-exist.md'))).toBeNull();

        // Invalid frontmatter missing description
        const invalidMd = join(testDir, 'invalid.md');
        writeFileSync(invalidMd, '---\nname: No Desc\n---\nBody');
        expect(await parseSkillMd(invalidMd)).toBeNull();
    });

    it('discoverSkills scans priority directories and catalog layouts', async () => {
        const repoDir = join(tmpdir(), `test-repo-discover-${Date.now()}`);
        const skillsCatDir = join(repoDir, 'skills', 'web', 'react-best-practices');
        mkdirSync(skillsCatDir, { recursive: true });

        writeFileSync(
            join(skillsCatDir, 'SKILL.md'),
            '---\nname: React Best Practices\ndescription: React guidelines\n---\n# React',
        );

        const discovered = await discoverSkills(repoDir);
        expect(discovered.length).toBe(1);
        expect(discovered[0]?.name).toBe('React Best Practices');
        expect(discovered[0] ? getSkillDisplayName(discovered[0]) : '').toBe('React Best Practices');
    });

    it('discoverSkills handles root SKILL.md and fullDepth option', async () => {
        const repoDir = join(tmpdir(), `test-repo-root-${Date.now()}`);
        mkdirSync(repoDir, { recursive: true });
        writeFileSync(join(repoDir, 'SKILL.md'), '---\nname: Root Skill\ndescription: Root skill desc\n---\n# Root');

        const subDir = join(repoDir, 'custom-folder', 'sub-skill');
        mkdirSync(subDir, { recursive: true });
        writeFileSync(join(subDir, 'SKILL.md'), '---\nname: Sub Skill\ndescription: Sub skill desc\n---\n# Sub');

        const defaultResult = await discoverSkills(repoDir);
        expect(defaultResult.length).toBe(1);
        expect(defaultResult[0]?.name).toBe('Root Skill');

        const fullDepthResult = await discoverSkills(repoDir, undefined, { fullDepth: true });
        expect(fullDepthResult.length).toBe(2);
    });

    it('discoverSkills ignores skills listed in local lock file under agent dirs', async () => {
        const repoDir = join(tmpdir(), `test-repo-locked-${Date.now()}`);
        const lockedSkillDir = join(repoDir, '.agents', 'skills', 'locked-skill');
        mkdirSync(lockedSkillDir, { recursive: true });
        writeFileSync(
            join(lockedSkillDir, 'SKILL.md'),
            '---\nname: Locked Skill\ndescription: Locked desc\n---\n# Locked',
        );

        // Add skills-lock.json with locked-skill
        writeFileSync(
            join(repoDir, 'skills-lock.json'),
            JSON.stringify({
                version: 1,
                skills: {
                    'locked-skill': {
                        source: 'owner/repo',
                        sourceType: 'github',
                        computedHash: 'abc',
                    },
                },
            }),
        );

        const discovered = await discoverSkills(repoDir);
        expect(discovered.length).toBe(0);
    });

    it('discoverSkills enforces subpath safety and throws on path traversal attempt', async () => {
        const repoDir = join(tmpdir(), `test-repo-subpath-${Date.now()}`);
        mkdirSync(repoDir, { recursive: true });

        await expect(discoverSkills(repoDir, '../outside')).rejects.toThrow(
            /Invalid subpath: "\.\.\/outside" resolves outside the repository directory/,
        );
    });

    it('filterSkills matches skills case-insensitively by name and display name', () => {
        const skills = [
            { name: 'React', description: 'React lib', path: '/p/react', rawContent: '' },
            { name: 'Vue', description: 'Vue lib', path: '/p/vue', rawContent: '' },
        ];

        const matched = filterSkills(skills, ['react']);
        expect(matched.length).toBe(1);
        expect(matched[0]?.name).toBe('React');
    });

    // Vendor parity (R4): case set mirrored from vercel-labs/skills
    // vendors/skills/tests/skill-matching.test.ts describe('filterSkills').
    describe('filterSkills vendor parity (skill-matching.test.ts)', () => {
        const skills = [
            { name: 'convex-best-practices', description: 'desc', path: '/tmp/skill', rawContent: '' },
            { name: 'Convex Best Practices', description: 'desc', path: '/tmp/skill', rawContent: '' },
            { name: 'simple-skill', description: 'desc', path: '/tmp/skill', rawContent: '' },
            { name: 'foo', description: 'desc', path: '/tmp/skill', rawContent: '' },
            { name: 'bar', description: 'desc', path: '/tmp/skill', rawContent: '' },
        ];

        it('matches exact name', () => {
            const result = filterSkills(skills, ['foo']);
            expect(result.length).toBe(1);
            expect(result[0]?.name).toBe('foo');
        });

        it('matches case insensitive', () => {
            const result = filterSkills(skills, ['FOO']);
            expect(result.length).toBe(1);
            expect(result[0]?.name).toBe('foo');
        });

        it('matches kebab-case skill name', () => {
            const result = filterSkills(skills, ['convex-best-practices']);
            expect(result.length).toBe(1);
            expect(result[0]?.name).toBe('convex-best-practices');
        });

        it('matches multiple skills', () => {
            const result = filterSkills(skills, ['foo', 'bar']);
            expect(result.length).toBe(2);
            expect(result.map((s) => s.name).sort()).toEqual(['bar', 'foo']);
        });

        it('matches quoted multi-word name', () => {
            const result = filterSkills(skills, ['Convex Best Practices']);
            expect(result.length).toBe(1);
            expect(result[0]?.name).toBe('Convex Best Practices');
        });

        it('matches quoted multi-word name case insensitive', () => {
            const result = filterSkills(skills, ['convex best practices']);
            expect(result.length).toBe(1);
            expect(result[0]?.name).toBe('Convex Best Practices');
        });

        it('does not match unquoted multi-word args', () => {
            expect(filterSkills(skills, ['Convex', 'Best', 'Practices']).length).toBe(0);
        });

        it('does not match partial words', () => {
            expect(filterSkills(skills, ['Convex', 'Best']).length).toBe(0);
        });

        it('returns empty array when no matches', () => {
            expect(filterSkills(skills, ['nonexistent']).length).toBe(0);
        });

        it('returns empty array for empty input', () => {
            expect(filterSkills(skills, []).length).toBe(0);
        });
    });
});
