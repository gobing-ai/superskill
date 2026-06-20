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
