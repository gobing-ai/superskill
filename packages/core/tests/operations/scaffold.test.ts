import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scaffold } from '../../src/operations/scaffold';

describe('scaffold', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'superskill-scaffold-test-'));
    });

    afterEach(() => {
        if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
    });

    it('creates a skill directory with SKILL.md and substituted variables', async () => {
        const filePath = await scaffold('skill', 'my-skill', {
            description: 'A test skill',
            output: tmpDir,
        });

        // Skills are directory-based: <name>/SKILL.md
        expect(filePath).toBe(join(tmpDir, 'my-skill', 'SKILL.md'));
        expect(existsSync(filePath)).toBe(true);

        const content = readFileSync(filePath, 'utf-8');
        expect(content).toContain('name: my-skill');
        expect(content).toContain('description: A test skill');
        expect(content).toContain('# my-skill');
        // Verify <!-- NAME --> was replaced
        expect(content).not.toContain('<!-- NAME -->');
    });

    it('creates a command file with target substitution', async () => {
        const filePath = await scaffold('command', 'deploy', {
            description: 'Deploy command',
            target: 'codex',
            output: tmpDir,
        });

        const content = readFileSync(filePath, 'utf-8');
        expect(content).toContain('target: codex');
        // Name is substituted into a slash-syntax invocation block
        expect(content).toContain('/deploy');
        // Enriched default template ships argument-hint + allowed-tools (completeness signals)
        expect(content).toContain('argument-hint:');
        expect(content).toContain('allowed-tools:');
    });

    it('creates an agent file with model alias', async () => {
        const filePath = await scaffold('agent', 'reviewer', {
            description: 'Code reviewer',
            output: tmpDir,
        });

        const content = readFileSync(filePath, 'utf-8');
        expect(content).toContain('model: sonnet');
        expect(content).toContain('tools:');
    });

    it('creates a magent file with governance sections', async () => {
        const filePath = await scaffold('magent', 'my-agent', {
            description: 'My agent',
            output: tmpDir,
        });

        const content = readFileSync(filePath, 'utf-8');
        expect(content).toContain('## Project');
        expect(content).toContain('## Commands');
        expect(content).toContain('## Verification');
        expect(content).toContain('## Safety');
        expect(content).toContain('[CRITICAL]');
        expect(content).toContain('NEVER');
    });

    it('magent scaffold output scores PASS on evaluate', async () => {
        const { evaluate } = await import('../../src/quality/evaluate');
        const filePath = await scaffold('magent', 'my-agent', {
            description: 'My agent',
            output: tmpDir,
        });

        const content = readFileSync(filePath, 'utf-8');
        const report = evaluate('magent', content, filePath);
        expect(report.aggregate).toBeGreaterThanOrEqual(0.7);
    });

    it('throws when file exists without force', async () => {
        const skillDir = join(tmpDir, 'my-skill');
        mkdirSync(skillDir, { recursive: true });
        const filePath = join(skillDir, 'SKILL.md');
        writeFileSync(filePath, 'existing content');

        await expect(scaffold('skill', 'my-skill', { output: tmpDir })).rejects.toThrow('already exists');
    });
    it('overwrites when force is true', async () => {
        const skillDir = join(tmpDir, 'my-skill');
        mkdirSync(skillDir, { recursive: true });
        const filePath = join(skillDir, 'SKILL.md');
        writeFileSync(filePath, 'existing content');

        const result = await scaffold('skill', 'my-skill', {
            output: tmpDir,
            force: true,
        });

        const content = readFileSync(result, 'utf-8');
        expect(content).toContain('name: my-skill');
    });

    it('throws on unknown content type', async () => {
        await expect(scaffold('unknown' as 'skill', 'test', { output: tmpDir })).rejects.toThrow(
            'Unknown content type',
        );
    });

    // ── F1: path traversal rejection ──
    it('rejects "../escape" as path traversal', async () => {
        await expect(scaffold('skill', '../escape', { output: tmpDir })).rejects.toThrow(
            "Invalid content name '../escape': must be a single path segment",
        );
        // Verify no file escaped the output dir.
        expect(existsSync(join(tmpDir, '..', 'escape'))).toBe(false);
    });

    it('rejects "." as a name', async () => {
        await expect(scaffold('skill', '.', { output: tmpDir })).rejects.toThrow(
            "Invalid content name '.': must be a single path segment",
        );
    });

    it('rejects ".." as a name', async () => {
        await expect(scaffold('skill', '..', { output: tmpDir })).rejects.toThrow(
            "Invalid content name '..': must be a single path segment",
        );
    });

    it('rejects "a/b" (forward slash) as a name', async () => {
        await expect(scaffold('skill', 'a/b', { output: tmpDir })).rejects.toThrow(
            "Invalid content name 'a/b': must be a single path segment",
        );
    });

    it('rejects "a\\b" (backslash) as a name', async () => {
        await expect(scaffold('skill', 'a\\b', { output: tmpDir })).rejects.toThrow('must be a single path segment');
    });

    it('rejects name with NUL byte', async () => {
        await expect(scaffold('skill', 'a\0b', { output: tmpDir })).rejects.toThrow('must be a single path segment');
    });

    it('rejects empty name', async () => {
        await expect(scaffold('skill', '', { output: tmpDir })).rejects.toThrow('must be a single path segment');
    });

    it('uses user template override when it exists', async () => {
        const originalHome = process.env.HOME;
        process.env.HOME = tmpDir;
        const userTemplateDir = join(tmpDir, '.superskill', 'templates', 'skill');
        try {
            const { mkdirSync } = await import('node:fs');
            mkdirSync(userTemplateDir, { recursive: true });
            writeFileSync(
                join(userTemplateDir, 'default.md'),
                '---\nname: <!-- NAME -->\ndescription: <!-- DESCRIPTION -->\ncustom: true\n---\n\n# Custom <!-- NAME -->\n\nUser template body',
            );

            const filePath = await scaffold('skill', 'custom-skill', {
                output: tmpDir,
            });

            const content = readFileSync(filePath, 'utf-8');
            expect(content).toContain('custom: true');
            expect(content).toContain('User template body');
        } finally {
            rmSync(join(tmpDir, '.superskill', 'templates'), { recursive: true, force: true });
            if (originalHome === undefined) {
                delete process.env.HOME;
            } else {
                process.env.HOME = originalHome;
            }
        }
    });

    it('uses cwd as default output when no output specified', async () => {
        const filePath = await scaffold('skill', 'cwd-test', {
            output: tmpDir,
        });

        // File should be created in tmpDir (our explicit output)
        expect(existsSync(filePath)).toBe(true);
        expect(readFileSync(filePath, 'utf-8')).toContain('name: cwd-test');
    });
    // ── A5: template tier, --skills/--tools, and scaffold→evaluate regressions ──

    it('resolves a named template tier (--template specialist)', async () => {
        const filePath = await scaffold('agent', 'tiered-agent', {
            description: 'Specialist agent',
            output: tmpDir,
            template: 'specialist',
        });

        const content = readFileSync(filePath, 'utf-8');
        // specialist.md is the only tier that ships model: opus
        expect(content).toContain('model: opus');
        expect(content).toContain('Persona');
    });

    it('falls back to default.md when no --template is given', async () => {
        const filePath = await scaffold('agent', 'default-agent', {
            description: 'Default agent',
            output: tmpDir,
        });

        const content = readFileSync(filePath, 'utf-8');
        // default.md ships model: sonnet (same as standard, but distinct from specialist)
        expect(content).toContain('model: sonnet');
    });

    it('errors clearly on an unknown template tier', async () => {
        await expect(
            scaffold('agent', 'bad-tier', {
                description: 'x',
                output: tmpDir,
                template: 'nonexistent-tier',
            }),
        ).rejects.toThrow('Unknown template tier "nonexistent-tier"');
    });

    it('pre-populates frontmatter tools from --tools', async () => {
        const filePath = await scaffold('agent', 'tooled-agent', {
            description: 'Tooled agent',
            output: tmpDir,
            tools: 'Read,Write,Bash',
        });

        const content = readFileSync(filePath, 'utf-8');
        expect(content).toContain('tools: [Read, Write, Bash]');
    });

    it('accepts --tools as comma-separated or array', async () => {
        const filePath = await scaffold('agent', 'array-agent', {
            description: 'Array inputs',
            output: tmpDir,
            tools: ['Read', 'Write', ' Edit ', ''],
        });

        const content = readFileSync(filePath, 'utf-8');
        // Array path trims and drops empties
        expect(content).toContain('tools: [Read, Write, Edit]');
    });

    // ── F2: per-type tool field mapping ──
    it('maps --tools to tools: for agent', async () => {
        const filePath = await scaffold('agent', 'tools-agent', {
            description: 'Agent with tools',
            output: tmpDir,
            tools: 'Read,Write',
        });
        const content = readFileSync(filePath, 'utf-8');
        expect(content).toContain('tools: [Read, Write]');
        expect(content).not.toContain('allowed-tools:');
    });

    it('maps --tools to allowed-tools: for skill', async () => {
        const filePath = await scaffold('skill', 'tools-skill', {
            description: 'Skill with tools',
            output: tmpDir,
            tools: 'Read,Write',
        });
        const content = readFileSync(filePath, 'utf-8');
        expect(content).toContain('allowed-tools: [Read, Write]');
        expect(content).not.toContain('\ntools:');
    });

    it('maps --tools to allowed-tools: for command', async () => {
        const filePath = await scaffold('command', 'tools-cmd', {
            description: 'Command with tools',
            output: tmpDir,
            tools: 'Read,Write',
        });
        const content = readFileSync(filePath, 'utf-8');
        expect(content).toContain('allowed-tools: [Read, Write]');
        expect(content).not.toContain('\ntools:');
    });

    // ── F3: fence hardening ──
    it('does not misidentify --- HR in body as frontmatter fence (F3)', async () => {
        const tierDir = join(tmpDir, '.superskill', 'templates', 'skill');
        mkdirSync(tierDir, { recursive: true });
        writeFileSync(
            join(tierDir, 'default.md'),
            [
                '---',
                'name: <!-- NAME -->',
                'description: <!-- DESCRIPTION -->',
                'tools: [Read]',
                '---',
                '',
                '# <!-- NAME -->',
                '',
                '---',
                '',
                'A horizontal rule above this line.',
            ].join('\n'),
            'utf-8',
        );
        const originalHome = process.env.HOME;
        process.env.HOME = tmpDir;
        try {
            const filePath = await scaffold('skill', 'hr-skill', {
                output: tmpDir,
                tools: 'Write',
            });
            const content = readFileSync(filePath, 'utf-8');
            // tools override landed in frontmatter, not body
            expect(content).toContain('tools: [Write]');
            // Three --- fences total: opening, closing, body HR
            const fenceCount = (content.match(/^---$/gm) || []).length;
            expect(fenceCount).toBe(3);
            // Body HR text is preserved
            expect(content).toContain('A horizontal rule above this line.');
        } finally {
            process.env.HOME = originalHome;
        }
    });

    it('resolves a user-override template tier from ~/.superskill/templates', async () => {
        const originalHome = process.env.HOME;
        process.env.HOME = tmpDir;
        const userTierDir = join(tmpDir, '.superskill', 'templates', 'agent');
        try {
            mkdirSync(userTierDir, { recursive: true });
            writeFileSync(
                join(userTierDir, 'custom.md'),
                '---\nname: <!-- NAME -->\ndescription: <!-- DESCRIPTION -->\nmodel: haiku\ntools: [Read]\n---\n\ncustom-tier body skill: link\n',
            );

            const filePath = await scaffold('agent', 'custom-tier-agent', {
                description: 'Custom tier',
                output: tmpDir,
                template: 'custom',
            });

            const content = readFileSync(filePath, 'utf-8');
            expect(content).toContain('custom-tier body');
            expect(content).toContain('model: haiku');
        } finally {
            rmSync(join(tmpDir, '.superskill', 'templates'), { recursive: true, force: true });
            process.env.HOME = originalHome ?? '';
        }
    });

    it('passes its own evaluator for every agent tier (scaffold→evaluate ≥ 0.7)', async () => {
        const { evaluateAgent } = await import('../../src/quality/agent');
        const tiers = ['default', 'minimal', 'standard', 'specialist'] as const;
        for (const tier of tiers) {
            const filePath = await scaffold('agent', `eval-${tier}`, {
                description: `Evaluation target for ${tier} tier`,
                output: tmpDir,
                template: tier === 'default' ? undefined : tier,
                force: true,
            });
            const content = readFileSync(filePath, 'utf-8');
            const report = evaluateAgent(content, filePath);
            expect(report.aggregate).toBeGreaterThanOrEqual(0.7);
        }
    });

    it('resolves a named command template tier (--template workflow)', async () => {
        const filePath = await scaffold('command', 'tiered-command', {
            description: 'Workflow command',
            output: tmpDir,
            template: 'workflow',
        });

        const content = readFileSync(filePath, 'utf-8');
        // workflow.md ships 6 allowed-tools (includes Task + Skill); simple/plugin ship 4
        expect(content).toContain('Task');
        expect(content).toContain('orchestrates a multi-stage');
    });

    it('errors clearly on an unknown command template tier', async () => {
        await expect(
            scaffold('command', 'bad-cmd-tier', {
                description: 'x',
                output: tmpDir,
                template: 'nonexistent-tier',
            }),
        ).rejects.toThrow('Unknown template tier "nonexistent-tier"');
    });

    it('passes its own evaluator for every command tier (scaffold→evaluate ≥ 0.7)', async () => {
        const { evaluateCommand } = await import('../../src/quality/command');
        const tiers = ['default', 'simple', 'workflow', 'plugin'] as const;
        for (const tier of tiers) {
            const filePath = await scaffold('command', `cmd-eval-${tier}`, {
                description: `Evaluation target for ${tier} command tier`,
                output: tmpDir,
                template: tier === 'default' ? undefined : tier,
                force: true,
            });
            const content = readFileSync(filePath, 'utf-8');
            const report = evaluateCommand(content, 'claude');
            expect(report.aggregate).toBeGreaterThanOrEqual(0.7);
        }
    });
    // ── S3/S5: skill template tiers and scaffold→evaluate regressions ──

    it('resolves a named skill template tier (--template technique)', async () => {
        const filePath = await scaffold('skill', 'tiered-skill', {
            description: 'Technique skill',
            output: tmpDir,
            template: 'technique',
        });

        // Skills are directory-based
        expect(filePath).toBe(join(tmpDir, 'tiered-skill', 'SKILL.md'));
        const content = readFileSync(filePath, 'utf-8');
        expect(content).toContain('Template type**: technique');
        expect(content).toContain('## Workflow');
    });

    it('resolves the pattern skill template tier (--template pattern)', async () => {
        const filePath = await scaffold('skill', 'pattern-skill', {
            description: 'Pattern skill',
            output: tmpDir,
            template: 'pattern',
        });

        const content = readFileSync(filePath, 'utf-8');
        expect(content).toContain('Template type**: pattern');
        expect(content).toContain('## Core principles');
    });

    it('resolves the reference skill template tier (--template reference)', async () => {
        const filePath = await scaffold('skill', 'ref-skill', {
            description: 'Reference skill',
            output: tmpDir,
            template: 'reference',
        });

        const content = readFileSync(filePath, 'utf-8');
        expect(content).toContain('Template type**: reference');
        expect(content).toContain('## Quick reference');
    });

    it('errors clearly on an unknown skill template tier', async () => {
        await expect(
            scaffold('skill', 'bad-skill-tier', {
                description: 'x',
                output: tmpDir,
                template: 'nonexistent-tier',
            }),
        ).rejects.toThrow('Unknown template tier "nonexistent-tier"');
    });

    it('passes its own evaluator for every skill tier (scaffold→evaluate ≥ 0.7)', async () => {
        const { evaluateSkill } = await import('../../src/quality/skill');
        const tiers = ['default', 'technique', 'pattern', 'reference'] as const;
        for (const tier of tiers) {
            const filePath = await scaffold('skill', `skill-eval-${tier}`, {
                description: `Evaluation target for ${tier} skill tier`,
                output: tmpDir,
                template: tier === 'default' ? undefined : tier,
                force: true,
            });
            const content = readFileSync(filePath, 'utf-8');
            const report = evaluateSkill(content, `skill-eval-${tier}`);
            expect(report.aggregate).toBeGreaterThanOrEqual(0.7);
        }
    });

    it('resolveContentPath finds skill directory form after scaffold', async () => {
        const { resolveContentPath } = await import('../../src/content/identity');
        const filePath = await scaffold('skill', 'resolvable-skill', {
            description: 'Resolvable skill',
            output: tmpDir,
        });

        // The scaffolded path is <tmpDir>/resolvable-skill/SKILL.md
        expect(filePath).toBe(join(tmpDir, 'resolvable-skill', 'SKILL.md'));

        // Bare-name resolution from tmpDir should find the directory form
        const resolved = resolveContentPath('skill', 'resolvable-skill', { baseDir: tmpDir });
        expect(resolved).toBe(filePath);
    });
});

// ── invocation axis (task 0070 R3) ────────────────────────────────────────────

describe('scaffold invocation axis', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'superskill-scaffold-inv-test-'));
    });

    afterEach(() => {
        if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
    });

    it('user mode emits disable-model-invocation and one-line description guidance', async () => {
        const filePath = await scaffold('skill', 'user-mode', {
            invocationMode: 'user',
            output: tmpDir,
        });

        const content = readFileSync(filePath, 'utf-8');
        expect(content).toContain('disable-model-invocation: true');
        expect(content).toContain('description: # One-line, human-facing');
    });

    it('user mode preserves an explicit description', async () => {
        const filePath = await scaffold('skill', 'user-desc', {
            invocationMode: 'user',
            description: 'Run the release checklist',
            output: tmpDir,
        });

        const content = readFileSync(filePath, 'utf-8');
        expect(content).toContain('disable-model-invocation: true');
        expect(content).toContain('description: Run the release checklist');
    });

    it('model mode (default) emits trigger-rich description guidance and no disable key', async () => {
        const filePath = await scaffold('skill', 'model-mode', { output: tmpDir });

        const content = readFileSync(filePath, 'utf-8');
        expect(content).not.toContain('disable-model-invocation');
        expect(content).toContain('description: # Trigger-rich');
    });

    it('user mode replaces an existing disable-model-invocation key instead of duplicating it', async () => {
        const originalHome = process.env.HOME;
        try {
            process.env.HOME = tmpDir;
            const templateDir = join(tmpDir, '.superskill', 'templates', 'skill');
            mkdirSync(templateDir, { recursive: true });
            writeFileSync(
                join(templateDir, 'default.md'),
                '---\nname: <!-- NAME -->\ndescription: <!-- DESCRIPTION -->\ndisable-model-invocation: false\n---\n\n# <!-- NAME -->\n',
            );

            const filePath = await scaffold('skill', 'override-mode', {
                invocationMode: 'user',
                description: 'Run the checklist',
                output: tmpDir,
            });

            const content = readFileSync(filePath, 'utf-8');
            expect(content).toContain('disable-model-invocation: true');
            expect(content).not.toContain('disable-model-invocation: false');
        } finally {
            process.env.HOME = originalHome;
        }
    });

    it('invocation mode is skill-only: non-skill types never emit the disable key', async () => {
        const filePath = await scaffold('command', 'user-cmd', {
            invocationMode: 'user',
            description: 'A command',
            output: tmpDir,
        });

        const content = readFileSync(filePath, 'utf-8');
        expect(content).not.toContain('disable-model-invocation');
    });
});
