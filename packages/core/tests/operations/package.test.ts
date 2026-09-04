import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { packageSkill } from '../../src/operations/package';

/** Fixture: a minimal SKILL.md with valid frontmatter. */
const SKILL_MD = `---
name: test-skill
description: A test skill for packaging
license: MIT
version: 1.0.0
type: technique
---

# test-skill

Skill body for testing.
`;

/** Fixture: a reference file. */
const REF_CONTENT = '# Reference\n\nSome reference content.\n';

/** Fixture: an OpenClaw metadata companion. */
const OPENCLAW_META = JSON.stringify({ id: 'test-skill', version: '1.0.0' });

/** Fixture: an OpenAI agent config. */
const OPENAI_YAML = 'model: gpt-4\nsystem: You are a test agent.\n';

describe('packageSkill', () => {
    let tmpDir: string;
    let skillDir: string;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'superskill-package-test-'));
        skillDir = join(tmpDir, 'skills', 'test-skill');
        mkdirSync(skillDir, { recursive: true });
        // Core files
        writeFileSync(join(skillDir, 'SKILL.md'), SKILL_MD);
        mkdirSync(join(skillDir, 'references'), { recursive: true });
        writeFileSync(join(skillDir, 'references', 'guide.md'), REF_CONTENT);
        // Companion configs
        writeFileSync(join(skillDir, 'metadata.openclaw'), OPENCLAW_META);
        mkdirSync(join(skillDir, 'agents'), { recursive: true });
        writeFileSync(join(skillDir, 'agents', 'openai.yaml'), OPENAI_YAML);
    });

    afterEach(() => {
        if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
    });

    it('bundles SKILL.md and references/ into output directory', async () => {
        const outputDir = join(tmpDir, 'dist');
        mkdirSync(outputDir, { recursive: true });

        // resolveContentPath uses cwd to find skills/, so we look from tmpDir
        const bundlePath = await packageSkill(skillDir, { output: outputDir });

        expect(bundlePath).toBe(join(outputDir, 'test-skill'));
        expect(existsSync(bundlePath)).toBe(true);

        // Core files present
        expect(existsSync(join(bundlePath, 'SKILL.md'))).toBe(true);
        expect(readFileSync(join(bundlePath, 'SKILL.md'), 'utf-8')).toBe(SKILL_MD);

        expect(existsSync(join(bundlePath, 'references', 'guide.md'))).toBe(true);
        expect(readFileSync(join(bundlePath, 'references', 'guide.md'), 'utf-8')).toBe(REF_CONTENT);

        // Companions NOT included by default
        expect(existsSync(join(bundlePath, 'metadata.openclaw'))).toBe(false);
        expect(existsSync(join(bundlePath, 'agents'))).toBe(false);
    });

    it('includes companion configs when includeCompanions is set', async () => {
        const outputDir = join(tmpDir, 'dist');
        mkdirSync(outputDir, { recursive: true });

        const bundlePath = await packageSkill(skillDir, {
            output: outputDir,
            includeCompanions: true,
        });

        expect(bundlePath).toBe(join(outputDir, 'test-skill'));

        // Core still present
        expect(existsSync(join(bundlePath, 'SKILL.md'))).toBe(true);
        expect(existsSync(join(bundlePath, 'references', 'guide.md'))).toBe(true);

        // Companions present
        expect(existsSync(join(bundlePath, 'metadata.openclaw'))).toBe(true);
        expect(readFileSync(join(bundlePath, 'metadata.openclaw'), 'utf-8')).toBe(OPENCLAW_META);

        expect(existsSync(join(bundlePath, 'agents', 'openai.yaml'))).toBe(true);
        expect(readFileSync(join(bundlePath, 'agents', 'openai.yaml'), 'utf-8')).toBe(OPENAI_YAML);
    });

    it('throws ENOENT for missing skill', () => {
        expect(packageSkill('nonexistent-skill')).rejects.toThrow('Skill not found');
    });

    it('returns the output path via the returned string', async () => {
        const outputDir = join(tmpDir, 'dist');
        mkdirSync(outputDir, { recursive: true });

        const result = await packageSkill(skillDir, { output: outputDir });
        expect(typeof result).toBe('string');
        expect(result).toContain('test-skill');
    });

    it('uses cwd as output default when no output option given', async () => {
        // chdir into the temp dir so the default-output bundle lands inside
        // tmpDir (cleaned by afterEach) instead of polluting the repo root.
        const originalCwd = process.cwd();
        process.chdir(tmpDir);
        try {
            const result = await packageSkill(skillDir);
            expect(result).toStartWith(process.cwd());
            expect(result).toEndWith('test-skill');
        } finally {
            process.chdir(originalCwd);
        }
    });

    it('is deterministic — no model calls in the execution path', async () => {
        const outputDir = join(tmpDir, 'dist');
        mkdirSync(outputDir, { recursive: true });

        // Run twice; both should produce identical output
        const path1 = await packageSkill(skillDir, { output: join(outputDir, 'run1') });
        const path2 = await packageSkill(skillDir, { output: join(outputDir, 'run2') });

        const files1 = readdirSync(path1, { recursive: true }).sort();
        const files2 = readdirSync(path2, { recursive: true }).sort();
        expect(files1).toEqual(files2);
    });

    it('refuses an output whose bundle dir resolves onto the source skill dir (would delete the source)', async () => {
        // output = parent of the skill dir → outputDir === skillDir → the clean
        // step would rm -rf the source before copying from it.
        await expect(packageSkill(skillDir, { output: join(tmpDir, 'skills') })).rejects.toThrow('overlaps the source');
        // Source must survive the refused call.
        expect(existsSync(join(skillDir, 'SKILL.md'))).toBe(true);
        expect(existsSync(join(skillDir, 'references', 'guide.md'))).toBe(true);
    });

    it('refuses an output directory inside the source skill dir', async () => {
        await expect(packageSkill(skillDir, { output: skillDir })).rejects.toThrow('overlaps the source');
        expect(existsSync(join(skillDir, 'SKILL.md'))).toBe(true);
    });

    it('packages a flat .md beside sibling skills without sweeping the shared parent', async () => {
        // Flat-layout skill (R8/F8): skills/flat.md → name='flat' (filename-derived),
        // dir=skills/. External output bundles to <output>/flat — a sibling tree of
        // skills/ — so the shared parent and every sibling skill survive untouched.
        writeFileSync(join(tmpDir, 'skills', 'flat.md'), SKILL_MD);

        const bundleDir = await packageSkill(join(tmpDir, 'skills', 'flat.md'), { output: tmpDir });
        expect(bundleDir).toBe(join(tmpDir, 'flat'));
        expect(readdirSync(bundleDir).sort()).toEqual(['SKILL.md']);
        expect(existsSync(join(tmpDir, 'skills', 'flat.md'))).toBe(true);
        expect(existsSync(join(skillDir, 'SKILL.md'))).toBe(true);
    });

    it('refuses an output that is an ancestor of a flat source whose parent dir name equals the file stem', async () => {
        // Residual flat ancestor case (R8): x/flat/flat.md packaged to output x
        // derives the bundle dir <x>/flat — the source's own parent directory. The
        // clean step would delete the shared parent (and the source with it); refuse.
        const flatDir = join(tmpDir, 'flat');
        mkdirSync(flatDir, { recursive: true });
        writeFileSync(join(flatDir, 'flat.md'), SKILL_MD);

        await expect(packageSkill(join(flatDir, 'flat.md'), { output: tmpDir })).rejects.toThrow('overlaps the source');
        expect(existsSync(join(flatDir, 'flat.md'))).toBe(true);
        expect(existsSync(join(skillDir, 'SKILL.md'))).toBe(true);
    });

    it('cleans stale output from a previous package before repackaging', async () => {
        // R8: output cleanup is required so artifacts of a prior package cannot leak
        // into the new bundle (the rmSync arm of the clean step).
        const outputDir = join(tmpDir, 'dist');
        const stale = join(outputDir, 'test-skill');
        mkdirSync(stale, { recursive: true });
        writeFileSync(join(stale, 'stale-artifact.txt'), 'old package contents');

        await packageSkill(skillDir, { output: outputDir });

        expect(existsSync(join(outputDir, 'test-skill', 'stale-artifact.txt'))).toBe(false);
        expect(existsSync(join(outputDir, 'test-skill', 'SKILL.md'))).toBe(true);
    });

    it('fails before output cleanup when the resolved SKILL.md is a bare directory (defensive dir-form, R8)', async () => {
        // resolveContentPath treats an existing <dir>/SKILL.md as canonical even when
        // SKILL.md is itself a directory; the defensive dir-form branch then resolves
        // the primary entry to a nested path that does not exist. The missing-entry
        // ENOENT must fire BEFORE the clean step — a previous good bundle survives.
        const badDir = join(tmpDir, 'skills', 'bad-skill');
        mkdirSync(join(badDir, 'SKILL.md'), { recursive: true });
        const outputDir = join(tmpDir, 'dist');
        const prevBundle = join(outputDir, 'bad-skill');
        mkdirSync(prevBundle, { recursive: true });
        writeFileSync(join(prevBundle, 'SKILL.md'), 'previous good package');

        await expect(packageSkill(badDir, { output: outputDir })).rejects.toThrow('is missing');
        expect(readFileSync(join(prevBundle, 'SKILL.md'), 'utf-8')).toBe('previous good package');
    });

    it('fails loudly when the resolved primary entry is not a regular file (R8)', async () => {
        // Nested SKILL.md directory: entry resolves through the defensive dir-form
        // branch to <bad>/SKILL.md/SKILL.md; the isFile stat must reject it before
        // any output is created.
        const badDir = join(tmpDir, 'skills', 'bad-skill');
        mkdirSync(join(badDir, 'SKILL.md', 'SKILL.md'), { recursive: true });

        await expect(packageSkill(badDir, { output: join(tmpDir, 'dist') })).rejects.toThrow('is not a regular file');
        expect(existsSync(join(tmpDir, 'dist', 'bad-skill'))).toBe(false);
    });

    it('handles skill without companions gracefully', async () => {
        // Create a minimal skill without companions
        const minDir = join(tmpDir, 'skills', 'min-skill');
        mkdirSync(minDir, { recursive: true });
        writeFileSync(join(minDir, 'SKILL.md'), SKILL_MD);

        const outputDir = join(tmpDir, 'dist');
        mkdirSync(outputDir, { recursive: true });

        const bundlePath = await packageSkill(minDir, {
            output: outputDir,
            includeCompanions: true,
        });

        expect(existsSync(join(bundlePath, 'SKILL.md'))).toBe(true);
        // No companions to include — should not error
        expect(existsSync(join(bundlePath, 'metadata.openclaw'))).toBe(false);
    });
});
