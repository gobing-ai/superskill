import { describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveContentName, resolveContentPath } from '../../src/content/identity';

describe('resolveContentName', () => {
    it('strips directory and .md extension', () => {
        expect(resolveContentName('/a/b/foo.md')).toBe('foo');
    });

    it('returns parent dir name for SKILL.md', () => {
        expect(resolveContentName('/a/b/SKILL.md')).toBe('b');
    });

    it('returns parent dir name for SKILL.md at root-like path', () => {
        expect(resolveContentName('/skills/my-skill/SKILL.md')).toBe('my-skill');
    });

    it('strips directory when file has no .md extension', () => {
        expect(resolveContentName('/a/b/foo')).toBe('foo');
    });

    it('handles bare filename', () => {
        expect(resolveContentName('foo.md')).toBe('foo');
    });

    it('handles bare SKILL.md', () => {
        // basename(dirname('SKILL.md')) → '.'
        expect(resolveContentName('SKILL.md')).toBe('.');
    });
});

describe('resolveContentPath', () => {
    let tmpDir: string;

    function setup() {
        tmpDir = mkdtempSync(join(tmpdir(), 'superskill-identity-test-'));
    }

    function teardown() {
        if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
    }

    it('returns path when name is already an existing file path', () => {
        setup();
        try {
            const filePath = join(tmpDir, 'existing.md');
            writeFileSync(filePath, '---\nname: test\n---\n');
            const result = resolveContentPath('skill', filePath, { baseDir: tmpDir });
            expect(result).toBe(filePath);
        } finally {
            teardown();
        }
    });

    it('finds file directly in baseDir', () => {
        setup();
        try {
            const filePath = join(tmpDir, 'my-skill.md');
            writeFileSync(filePath, '---\nname: test\n---\n');
            const result = resolveContentPath('skill', 'my-skill', { baseDir: tmpDir });
            expect(result).toBe(filePath);
        } finally {
            teardown();
        }
    });

    it('finds skill in skills/ subdirectory', () => {
        setup();
        try {
            const skillsDir = join(tmpDir, 'skills');
            mkdirSync(skillsDir, { recursive: true });
            const filePath = join(skillsDir, 'my-skill.md');
            writeFileSync(filePath, '---\nname: test\n---\n');
            const result = resolveContentPath('skill', 'my-skill', { baseDir: tmpDir });
            expect(result).toBe(filePath);
        } finally {
            teardown();
        }
    });

    it('finds command in commands/ subdirectory', () => {
        setup();
        try {
            const cmdsDir = join(tmpDir, 'commands');
            mkdirSync(cmdsDir, { recursive: true });
            const filePath = join(cmdsDir, 'deploy.md');
            writeFileSync(filePath, '---\nname: test\n---\n');
            const result = resolveContentPath('command', 'deploy', { baseDir: tmpDir });
            expect(result).toBe(filePath);
        } finally {
            teardown();
        }
    });

    it('returns null when file not found', () => {
        setup();
        try {
            const result = resolveContentPath('skill', 'nonexistent', { baseDir: tmpDir });
            expect(result).toBeNull();
        } finally {
            teardown();
        }
    });

    it('resolves a skill directory to its SKILL.md', () => {
        setup();
        try {
            const skillDir = join(tmpDir, 'my-skill');
            mkdirSync(skillDir);
            writeFileSync(join(skillDir, 'SKILL.md'), '# My Skill');
            const result = resolveContentPath('skill', skillDir);
            expect(result).toBe(join(skillDir, 'SKILL.md'));
        } finally {
            teardown();
        }
    });

    it('returns null for a directory without SKILL.md', () => {
        setup();
        try {
            const emptyDir = join(tmpDir, 'empty-dir');
            mkdirSync(emptyDir);
            const result = resolveContentPath('skill', emptyDir);
            expect(result).toBeNull();
        } finally {
            teardown();
        }
    });

    // R1 regression: bare skill name resolves to skills/<name>/SKILL.md under baseDir
    it('resolves bare skill name to skills/<name>/SKILL.md under baseDir', () => {
        setup();
        try {
            const skillDir = join(tmpDir, 'skills', 'my-bare-skill');
            mkdirSync(skillDir, { recursive: true });
            writeFileSync(join(skillDir, 'SKILL.md'), '# Bare Skill');
            const result = resolveContentPath('skill', 'my-bare-skill', { baseDir: tmpDir });
            expect(result).toBe(join(skillDir, 'SKILL.md'));
        } finally {
            teardown();
        }
    });

    it('resolves a plain file path unchanged (non-skill type)', () => {
        setup();
        try {
            const filePath = join(tmpDir, 'my-command.md');
            writeFileSync(filePath, '# My Command');
            const result = resolveContentPath('command', filePath);
            expect(result).toBe(filePath);
        } finally {
            teardown();
        }
    });

    // M1 regression: bare name ending in .md resolves without double-extension
    it('resolves bare AGENTS.md in cwd when file exists', () => {
        setup();
        try {
            const filePath = join(tmpDir, 'AGENTS.md');
            writeFileSync(filePath, '## Project\nAgent config.\n');
            const result = resolveContentPath('magent', 'AGENTS.md', { baseDir: tmpDir });
            expect(result).toBe(filePath);
        } finally {
            teardown();
        }
    });

    // M1 regression: extension-less names still get .md appended
    it('still appends .md for extension-less names', () => {
        setup();
        try {
            const filePath = join(tmpDir, 'my-config.md');
            writeFileSync(filePath, '## Project\nAgent config.\n');
            const result = resolveContentPath('magent', 'my-config', { baseDir: tmpDir });
            expect(result).toBe(filePath);
        } finally {
            teardown();
        }
    });

    it('resolves multi-file magent package by bare name → magents/<name>/AGENTS.md', () => {
        setup();
        try {
            const pkg = join(tmpDir, 'magents', 'team-stark-children');
            mkdirSync(pkg, { recursive: true });
            const agents = join(pkg, 'AGENTS.md');
            writeFileSync(agents, '# ops\n');
            writeFileSync(join(pkg, 'IDENTITY.md'), '# id\n');
            expect(resolveContentPath('magent', 'team-stark-children', { baseDir: tmpDir })).toBe(agents);
            expect(resolveContentName(agents)).toBe('team-stark-children');
        } finally {
            teardown();
        }
    });

    it('resolves multi-file magent package directory path to AGENTS.md', () => {
        setup();
        try {
            const pkg = join(tmpDir, 'magents', 'team-stark-children');
            mkdirSync(pkg, { recursive: true });
            const agents = join(pkg, 'AGENTS.md');
            writeFileSync(agents, '# ops\n');
            expect(resolveContentPath('magent', pkg)).toBe(agents);
        } finally {
            teardown();
        }
    });
});
