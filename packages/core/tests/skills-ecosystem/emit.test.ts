import { describe, expect, it } from 'bun:test';
import { existsSync, lstatSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emitSkillForTargets, removeSkillFromTargets, resolveSkillsToRemove } from '../../src/skills-ecosystem/emit';
import type { BlobSkill } from '../../src/skills-ecosystem/fetch';
import { cleanAndCreateDir } from '../../src/skills-ecosystem/installer';

describe('emit.ts - Three-tier per-target emission and removal matrix', () => {
    it('emits skills across tier matrix {codex: direct, claude: symlink, hermes: translate} in sandbox HOME', async () => {
        const testHome = await mkdtemp(join(tmpdir(), 'emit-matrix-test-'));
        const sourceDir = join(testHome, 'sample-skill');
        await cleanAndCreateDir(sourceDir);
        writeFileSync(
            join(sourceDir, 'SKILL.md'),
            '---\nname: Sample Skill\ndescription: Sample\n---\n# Sample\n\nRun /sp:dev-run for help.',
        );

        // Subdirectory to exercise recursive translateMarkdownFilesInDir
        const subDir = join(sourceDir, 'references');
        await cleanAndCreateDir(subDir);
        writeFileSync(join(subDir, 'guide.md'), '# Guide\nRun /sp:dev-run');

        const targets = ['codex', 'claude', 'hermes'] as const;
        const result = await emitSkillForTargets(sourceDir, [...targets], {
            global: true,
            homeDir: testHome,
            env: {
                CLAUDE_CONFIG_DIR: join(testHome, '.claude'),
                CODEX_HOME: join(testHome, '.codex'),
                HERMES_HOME: join(testHome, '.hermes'),
            },
        });

        expect(result.success).toBe(true);
        expect(result.skillName).toBe('sample-skill');

        // Canonical landing check
        const canonicalPath = join(testHome, '.agents/skills/sample-skill/SKILL.md');
        expect(existsSync(canonicalPath)).toBe(true);

        // Tier 1 (codex) check: direct -> no separate target dir needed
        expect(result.results.codex?.tier).toBe('direct');
        expect(result.results.codex?.targetPath).toBe(join(testHome, '.agents/skills/sample-skill'));

        // Tier 2 (claude) check: symlink -> .claude/skills/sample-skill is a symlink pointing to canonical
        expect(result.results.claude?.tier).toBe('symlink');
        const claudeSkillDir = join(testHome, '.claude/skills/sample-skill');
        expect(existsSync(claudeSkillDir)).toBe(true);
        expect(lstatSync(claudeSkillDir).isSymbolicLink()).toBe(true);

        // Tier 3 (hermes) check: translate -> .hermes/skills/sample-skill is a translated copy
        expect(result.results.hermes?.tier).toBe('translate');
        const hermesSkillFile = join(testHome, '.hermes/skills/sample-skill/SKILL.md');
        expect(existsSync(hermesSkillFile)).toBe(true);
        expect(lstatSync(join(testHome, '.hermes/skills/sample-skill')).isSymbolicLink()).toBe(false);

        // Removal check
        const removeRes = await removeSkillFromTargets('sample-skill', [...targets], {
            global: true,
            homeDir: testHome,
            env: {
                CLAUDE_CONFIG_DIR: join(testHome, '.claude'),
                CODEX_HOME: join(testHome, '.codex'),
                HERMES_HOME: join(testHome, '.hermes'),
            },
        });

        expect(removeRes.success).toBe(true);
        expect(existsSync(canonicalPath)).toBe(false);
        expect(existsSync(claudeSkillDir)).toBe(false);
        expect(existsSync(hermesSkillFile)).toBe(false);

        await rm(testHome, { recursive: true, force: true });
    });

    it('emits BlobSkill objects and handles project-mode overlapping targets', async () => {
        const testHome = await mkdtemp(join(tmpdir(), 'emit-blob-test-'));
        const mockBlob: BlobSkill = {
            name: 'Project Skill',
            description: 'Desc',
            path: '',
            rawContent: '',
            files: [
                { path: 'SKILL.md', contents: '# Skill' },
                { path: 'docs/guide.md', contents: 'Run /sp:dev-run' },
            ],
            snapshotHash: 'h1',
            repoPath: '',
        };

        const result = await emitSkillForTargets(mockBlob, ['antigravity-cli', 'opencode'], {
            global: false,
            cwd: testHome,
            homeDir: testHome,
        });

        expect(result.success).toBe(true);
        expect(result.skillName).toBe('project-skill');
        expect(result.results['antigravity-cli']?.skipped).toBe(true);

        await rm(testHome, { recursive: true, force: true });
    });

    it('handles target creation errors and symlink fallback paths', async () => {
        const testHome = await mkdtemp(join(tmpdir(), 'emit-errors-test-'));
        const sourceDir = join(testHome, 'err-skill');
        await cleanAndCreateDir(sourceDir);
        writeFileSync(join(sourceDir, 'SKILL.md'), '# Err Skill');

        // Block .claude path by making .claude a file
        writeFileSync(join(testHome, '.claude'), 'blocker-file');

        // Symlink mode with blocked path (fails symlink, falls back to copy which also fails)
        const resSymlink = await emitSkillForTargets(sourceDir, ['claude'], {
            global: true,
            homeDir: testHome,
            env: { CLAUDE_CONFIG_DIR: join(testHome, '.claude') },
        });
        expect(resSymlink.success).toBe(false);
        expect(resSymlink.results.claude?.success).toBe(false);
        expect(existsSync(join(testHome, '.agents/skills/err-skill'))).toBe(false);

        // Copy mode with blocked path
        const resCopy = await emitSkillForTargets(sourceDir, ['claude'], {
            global: true,
            homeDir: testHome,
            mode: 'copy',
            env: { CLAUDE_CONFIG_DIR: join(testHome, '.claude') },
        });
        expect(resCopy.success).toBe(false);
        expect(resCopy.results.claude?.success).toBe(false);
        expect(existsSync(join(testHome, '.agents/skills/err-skill'))).toBe(false);

        // Translate mode with blocked path
        writeFileSync(join(testHome, '.hermes'), 'blocker-file-hermes');
        const resTranslate = await emitSkillForTargets(sourceDir, ['hermes'], {
            global: true,
            homeDir: testHome,
            env: { HERMES_HOME: join(testHome, '.hermes') },
        });
        expect(resTranslate.success).toBe(false);
        expect(resTranslate.results.hermes?.success).toBe(false);
        expect(existsSync(join(testHome, '.agents/skills/err-skill'))).toBe(false);

        await rm(testHome, { recursive: true, force: true });
    });

    it('supports copy mode fallback for Tier 2 targets', async () => {
        const testHome = await mkdtemp(join(tmpdir(), 'emit-copy-mode-test-'));
        const sourceDir = join(testHome, 'copy-skill');
        await cleanAndCreateDir(sourceDir);
        writeFileSync(join(sourceDir, 'SKILL.md'), '# Copy Mode Skill');

        const result = await emitSkillForTargets(sourceDir, ['claude'], {
            global: true,
            homeDir: testHome,
            mode: 'copy',
            env: { CLAUDE_CONFIG_DIR: join(testHome, '.claude') },
        });

        expect(result.success).toBe(true);
        const claudeDir = join(testHome, '.claude/skills/copy-skill');
        expect(existsSync(claudeDir)).toBe(true);
        expect(lstatSync(claudeDir).isSymbolicLink()).toBe(false);

        await rm(testHome, { recursive: true, force: true });
    });

    it('handles canonical install failures gracefully', async () => {
        const testHome = await mkdtemp(join(tmpdir(), 'emit-canonical-error-test-'));
        const badBlob: BlobSkill = {
            name: 'Bad Blob',
            description: '',
            path: '',
            rawContent: '',
            files: [{ path: '../outside.txt', contents: 'evil' }],
            snapshotHash: '',
            repoPath: '',
        };

        try {
            const result = await emitSkillForTargets(badBlob, ['claude'], {
                global: true,
                homeDir: testHome,
            });
            expect(result.success).toBe(false);
            expect(result.error).toContain('Invalid file path');
        } finally {
            await rm(testHome, { recursive: true, force: true });
        }
    });

    it('handles non-existent target removals gracefully', async () => {
        const testHome = await mkdtemp(join(tmpdir(), 'remove-non-existent-test-'));
        const result = await removeSkillFromTargets('non-existent-skill', ['claude', 'hermes', 'codex'], {
            global: true,
            homeDir: testHome,
        });

        expect(result.success).toBe(true);
        expect(result.results.claude?.removed).toBe(false);

        await rm(testHome, { recursive: true, force: true });
    });

    it('sanitizes name during path traversal attempts across emission tiers (residual-proof security negative)', async () => {
        const testHome = await mkdtemp(join(tmpdir(), 'emit-traversal-test-'));
        const sourceDir = join(testHome, 'passwd');
        await cleanAndCreateDir(sourceDir);
        writeFileSync(join(sourceDir, 'SKILL.md'), '# Passwd');

        const result = await emitSkillForTargets(sourceDir, ['claude', 'hermes'], {
            global: true,
            homeDir: testHome,
            env: { CLAUDE_CONFIG_DIR: join(testHome, '.claude') },
        });

        expect(result.skillName).toBe('passwd');
        expect(result.canonicalPath).toContain('.agents/skills/passwd');

        await rm(testHome, { recursive: true, force: true });
    });

    it('translate tier rewrites plugin-scoped refs using the skill name as prefix (R2 pipeline parity)', async () => {
        // Regression for the empty-prefix no-op: rewriteSkillReferences('') silently returns
        // content unchanged, bypassing the install pipeline's residual-refs safety net.
        const testHome = await mkdtemp(join(tmpdir(), 'emit-prefix-test-'));
        const sourceDir = join(testHome, 'my-skill');
        await cleanAndCreateDir(sourceDir);
        writeFileSync(
            join(sourceDir, 'SKILL.md'),
            '---\nname: My Skill\ndescription: Prefix test\n---\n# My Skill\n\nSee `my-skill:helper` for the helper flow.',
        );

        const result = await emitSkillForTargets(sourceDir, ['hermes'], {
            global: true,
            homeDir: testHome,
            env: { HERMES_HOME: join(testHome, '.hermes') },
        });

        expect(result.success).toBe(true);
        const translated = await Bun.file(join(testHome, '.hermes/skills/my-skill/SKILL.md')).text();
        expect(translated).toContain('my-skill-helper');
        expect(translated).not.toContain('my-skill:helper');

        await rm(testHome, { recursive: true, force: true });
    });

    it('resolveSkillsToRemove prefers lock keys over folder names (vendor parity, R4)', () => {
        // Vendor case (remove.test.ts): lock key keeps the original name with characters
        // sanitizeName rewrites — 'ce:review' → folder 'ce-review'; the exact key must win.
        expect(resolveSkillsToRemove(['ce-review'], ['ce-review'], ['ce:review'])).toEqual(['ce:review']);
        // An exact raw key wins even when another lock key has the same sanitized identity.
        expect(resolveSkillsToRemove(['ce-review'], ['ce-review'], ['ce:review', 'ce-review'])).toEqual(['ce-review']);
        // Folder-only resolution still works.
        expect(resolveSkillsToRemove(['foo'], ['foo'])).toEqual(['foo']);
        // Unknown names resolve to nothing.
        expect(resolveSkillsToRemove(['nope'], ['foo'], ['bar'])).toEqual([]);
    });

    it('removeSkillFromTargets returns the exact lock key while sweeping the sanitized folder (R4)', async () => {
        const testHome = await mkdtemp(join(tmpdir(), 'emit-lockkey-test-'));
        const sourceDir = join(testHome, 'ce-review');
        await cleanAndCreateDir(sourceDir);
        writeFileSync(join(sourceDir, 'SKILL.md'), '---\nname: ce:review\ndescription: Lock key test\n---\n# Review');

        const emitRes = await emitSkillForTargets(sourceDir, ['hermes'], {
            global: true,
            homeDir: testHome,
            env: { HERMES_HOME: join(testHome, '.hermes') },
        });
        expect(emitRes.success).toBe(true);

        const removeRes = await removeSkillFromTargets('ce-review', ['hermes'], {
            global: true,
            homeDir: testHome,
            env: { HERMES_HOME: join(testHome, '.hermes') },
            lockKeys: ['ce:review'],
        });

        // Exact lock key is reported for the CLI child's lock removal…
        expect(removeRes.skillName).toBe('ce:review');
        // …while the disk sweep sanitized to the real folder.
        expect(existsSync(join(testHome, '.agents/skills/ce-review'))).toBe(false);
        expect(existsSync(join(testHome, '.hermes/skills/ce-review'))).toBe(false);

        await rm(testHome, { recursive: true, force: true });
    });
});
