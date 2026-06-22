import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { rmSync } from 'node:fs';
import {
    bumpMarketplaceManifests,
    bumpPackageVersion,
    checkCitations,
    checkDimensionDrift,
    checkSkillCitations,
    computeTag,
    countRubricDimensions,
    diskRubricCount,
    type FileResolver,
    postbuild,
    validateVersion,
} from '../builder';

function $rmrf(path: string) {
    try {
        rmSync(path, { recursive: true, force: true });
    } catch {
        /* ok */
    }
}

/** In-memory resolver: any path in `present` exists with the given line count. */
function fakeFs(present: Record<string, number>): FileResolver {
    return {
        exists: (rel) => rel in present,
        lineCount: (rel) => present[rel] ?? 0,
    };
}

describe('checkCitations', () => {
    it('flags a citation whose file does not exist (the cc-hooks dead-path defect)', () => {
        const body = 'See `apps/cli/src/quality/dimensions.ts:54` for the dimensions.';
        const findings = checkCitations('SKILL.md', body, fakeFs({}));
        expect(findings).toHaveLength(1);
        expect(findings[0].message).toContain('apps/cli/src/quality/dimensions.ts');
        expect(findings[0].message).toContain('does not exist');
    });

    it('flags a citation whose line is past end of file', () => {
        const body = 'Schema at `packages/core/src/rubrics/command.yaml:9999`.';
        const fs = fakeFs({ 'packages/core/src/rubrics/command.yaml': 53 });
        const findings = checkCitations('SKILL.md', body, fs);
        expect(findings).toHaveLength(1);
        expect(findings[0].message).toContain('file has 53 lines');
    });

    it('passes when the file exists and the line is in range', () => {
        const body = 'Defined at `packages/core/src/quality/hook.ts:226`.';
        const fs = fakeFs({ 'packages/core/src/quality/hook.ts': 300 });
        expect(checkCitations('SKILL.md', body, fs)).toHaveLength(0);
    });

    it('ignores illustrative placeholder paths outside resolvable roots', () => {
        const body = 'Run `bash examples/validate.sh` and edit `agents/my-agent.md`.';
        // Neither path is under a resolvable prefix, so neither is checked.
        expect(checkCitations('SKILL.md', body, fakeFs({}))).toHaveLength(0);
    });
});

describe('checkDimensionDrift', () => {
    const rubricOf = (counts: Record<string, number>) => (t: string) => counts[t] ?? -1;

    it('flags a stale dimension count (the cc-commands "10 dimensions" defect)', () => {
        const body = 'Evaluate quality across 10 dimensions.';
        const findings = checkDimensionDrift('SKILL.md', body, 'cc-commands', rubricOf({ command: 5 }));
        expect(findings).toHaveLength(1);
        expect(findings[0].message).toContain('claims "10 dimensions"');
        expect(findings[0].message).toContain('command.yaml defines 5');
    });

    it('passes when the claimed count matches the rubric', () => {
        const body = 'Scored across 5 rubric dimensions.';
        expect(checkDimensionDrift('SKILL.md', body, 'cc-commands', rubricOf({ command: 5 }))).toHaveLength(0);
    });

    it('skips skills that document no rubric', () => {
        const body = 'This skill mentions 99 dimensions of nothing.';
        expect(checkDimensionDrift('SKILL.md', body, 'unmapped-skill', rubricOf({}))).toHaveLength(0);
    });

    it('skips when the rubric is absent (count <= 0)', () => {
        const body = 'Scored across 10 dimensions.';
        expect(checkDimensionDrift('SKILL.md', body, 'cc-agents', rubricOf({ agent: -1 }))).toHaveLength(0);
    });
});

describe('countRubricDimensions', () => {
    it('counts `- name:` entries regardless of indentation', () => {
        const yaml = ['dimensions:', '  - name: completeness', '  - name: clarity', '  - name: model-fit'].join('\n');
        expect(countRubricDimensions(yaml)).toBe(3);
    });

    it('returns 0 for a rubric with no dimensions', () => {
        expect(countRubricDimensions('version: 1\ntype: skill\n')).toBe(0);
    });
});

describe('postbuild', () => {
    const tmp = '/tmp/superskill-postbuild-test.js';

    afterEach(async () => {
        try {
            await Bun.file(tmp).delete();
        } catch {
            /* ok */
        }
    });

    it('prepends a shebang when the file lacks one', async () => {
        await Bun.write(tmp, 'console.log("hi");\n');
        await postbuild(tmp);
        const content = await Bun.file(tmp).text();
        expect(content).toBe('#!/usr/bin/env bun\nconsole.log("hi");\n');
    });

    it('is idempotent — does not add a second shebang', async () => {
        await Bun.write(tmp, '#!/usr/bin/env bun\nconsole.log("ok");\n');
        await postbuild(tmp);
        const content = await Bun.file(tmp).text();
        expect(content).toBe('#!/usr/bin/env bun\nconsole.log("ok");\n');
    });

    it('prepends shebang to an empty file', async () => {
        await Bun.write(tmp, '');
        await postbuild(tmp);
        const content = await Bun.file(tmp).text();
        expect(content).toBe('#!/usr/bin/env bun\n');
    });
});

describe('diskRubricCount', () => {
    it('returns the real dimension count for an existing rubric', () => {
        // skill.yaml is a known rubric with 5 dimensions
        const count = diskRubricCount('skill');
        expect(count).toBeGreaterThan(0);
    });

    it('returns -1 for a non-existent rubric', () => {
        expect(diskRubricCount('nonexistent-xyz')).toBe(-1);
    });
});

describe('checkCitations — edge cases', () => {
    it('flags a citation without line number when the file does not exist', () => {
        const body = 'Import from `packages/core/src/missing.ts`.';
        const findings = checkCitations('SKILL.md', body, fakeFs({}));
        expect(findings).toHaveLength(1);
        expect(findings[0].message).toContain('does not exist');
    });

    it('passes a citation without line number when the file exists', () => {
        const body = 'See `packages/core/src/quality/hook.ts`.';
        expect(checkCitations('SKILL.md', body, fakeFs({ 'packages/core/src/quality/hook.ts': 300 }))).toHaveLength(0);
    });

    it('flags multiple dead citations independently', () => {
        const body = 'A: `apps/cli/src/a.ts:1` and B: `apps/cli/src/b.ts:2`.';
        const findings = checkCitations('SKILL.md', body, fakeFs({}));
        expect(findings).toHaveLength(2);
    });
});

describe('checkDimensionDrift — edge cases', () => {
    const rubricOf = (counts: Record<string, number>) => (t: string) => counts[t] ?? -1;

    it('flags all mismatched dimension claims in one body', () => {
        const body = 'First: 10 dimensions. Second: 7 dimensions.';
        const findings = checkDimensionDrift('SKILL.md', body, 'cc-commands', rubricOf({ command: 5 }));
        expect(findings).toHaveLength(2);
    });

    it('does not flag when no dimension claim exists', () => {
        const body = 'This skill has no dimension count claim at all.';
        expect(checkDimensionDrift('SKILL.md', body, 'cc-skills', rubricOf({ skill: 5 }))).toHaveLength(0);
    });
});

describe('countRubricDimensions — edge cases', () => {
    it('ignores non-name list entries like `- weight:`', () => {
        const yaml = ['dimensions:', '  - name: completeness', '  - weight: 0.25', '  - name: clarity'].join('\n');
        expect(countRubricDimensions(yaml)).toBe(2);
    });
});

describe('checkSkillCitations — integration', () => {
    const fixturesDir = '/tmp/superskill-citation-test';
    const skillPath = `${fixturesDir}/test-skill/SKILL.md`;
    let exitSpy: ReturnType<typeof mock>;
    const origExit = process.exit;

    beforeEach(async () => {
        // Ensure clean fixture dir using Bun file APIs
        try {
            await $rmrf(fixturesDir);
        } catch {
            /* ok */
        }
        await Bun.write(`${fixturesDir}/test-skill/.gitkeep`, '');
        // Mock process.exit so fail() throws instead of killing the runner
        exitSpy = mock(() => {
            throw new Error('process.exit mocked');
        });
        process.exit = exitSpy as unknown as typeof process.exit;
    });

    afterEach(() => {
        process.exit = origExit;
    });

    afterAll(async () => {
        try {
            await $rmrf(fixturesDir);
        } catch {
            /* ok */
        }
    });

    it('passes when the glob matches no files (empty findings)', () => {
        // Glob that matches nothing — no skill files to scan
        expect(() => checkSkillCitations(`${fixturesDir}/nonexistent-*/SKILL.md`)).not.toThrow();
        expect(exitSpy).not.toHaveBeenCalled();
    });

    it('detects a dead citation in a fixture skill and calls fail', async () => {
        // Write a fixture SKILL.md with a dead citation path
        const deadPath = 'packages/core/src/nonexistent-file-xyz.ts';
        await Bun.write(skillPath, `# Test Skill\n\nSee \`${deadPath}:42\` for details.\n`);
        expect(() => checkSkillCitations(`${fixturesDir}/*/SKILL.md`)).toThrow('process.exit mocked');
        expect(exitSpy).toHaveBeenCalledTimes(1);
        expect(exitSpy).toHaveBeenCalledWith(1);
    });
});

describe('validateVersion', () => {
    it('returns null for valid semver', () => {
        expect(validateVersion('0.1.0')).toBeNull();
        expect(validateVersion('1.2.3')).toBeNull();
        expect(validateVersion('0.2.0-beta.1')).toBeNull();
    });

    it('returns error for non-semver strings', () => {
        const err = validateVersion('not-a-version');
        expect(err).not.toBeNull();
        expect(err).toContain('Invalid version');
        expect(err).toContain('not-a-version');
    });

    it('returns error for partial semver', () => {
        expect(validateVersion('1.0')).not.toBeNull();
        expect(validateVersion('v1.0.0')).not.toBeNull();
    });
});

describe('computeTag', () => {
    it('returns the scoped tag name', () => {
        expect(computeTag('0.2.0')).toBe('@gobing-ai/superskill-v0.2.0');
    });

    it('handles pre-release versions', () => {
        expect(computeTag('0.2.0-beta.1')).toBe('@gobing-ai/superskill-v0.2.0-beta.1');
    });
});

describe('bumpMarketplaceManifests', () => {
    const marketplaceJson = `${JSON.stringify(
        {
            name: 'superskill',
            plugins: [{ name: 'cc', version: '0.1.8', source: './plugins/cc' }],
        },
        null,
        4,
    )}\n`;

    it('returns null marketplace for null input', () => {
        const result = bumpMarketplaceManifests(null, '0.2.0');
        expect(result.marketplace).toBeNull();
        expect(result.paths).toEqual([]);
    });

    it('updates all plugin entry versions and returns paths', () => {
        const result = bumpMarketplaceManifests(marketplaceJson, '0.2.0');
        expect(result.marketplace).not.toBeNull();
        const parsed = JSON.parse(result.marketplace as string);
        expect(parsed.plugins[0].version).toBe('0.2.0');
        expect(result.paths).toEqual(['./plugins/cc/plugin.json']);
    });

    it('returns original text when version already matches', () => {
        const already = `${JSON.stringify(
            {
                name: 'superskill',
                plugins: [{ name: 'cc', version: '0.2.0', source: './plugins/cc' }],
            },
            null,
            4,
        )}\n`;
        const result = bumpMarketplaceManifests(already, '0.2.0');
        expect(result.marketplace).toBe(already);
    });

    it('handles marketplace with no plugins array', () => {
        const empty = `${JSON.stringify({ name: 'superskill' }, null, 4)}\n`;
        const result = bumpMarketplaceManifests(empty, '0.2.0');
        expect(result.marketplace).toBe(empty);
        expect(result.paths).toEqual([]);
    });
});

describe('bumpPackageVersion', () => {
    const original = `${JSON.stringify({ name: '@gobing-ai/superskill', version: '0.1.8' }, null, 4)}\n`;

    it('returns the updated JSON with new version and old version', () => {
        const { updated, oldVer } = bumpPackageVersion(original, '0.2.0');
        expect(oldVer).toBe('0.1.8');
        const parsed = JSON.parse(updated);
        expect(parsed.version).toBe('0.2.0');
    });

    it('preserves other fields in the package.json', () => {
        const withExtra = `${JSON.stringify({ name: 'test', version: '1.0.0', description: 'hello' }, null, 4)}\n`;
        const { updated } = bumpPackageVersion(withExtra, '2.0.0');
        const parsed = JSON.parse(updated);
        expect(parsed.description).toBe('hello');
        expect(parsed.name).toBe('test');
    });
});
