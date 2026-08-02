import { afterEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFrontmatter } from '../../src/content/frontmatter';
import {
    adaptSubagentToCodex,
    adaptSubagentToPi,
    adaptSubagentToSkill,
    CODEX_MODEL_TIERS,
} from '../../src/pipeline/adapt-subagent';

describe('adaptSubagentToSkill', () => {
    it('injects name into subagent frontmatter', () => {
        const source = '---\ndescription: An expert agent\ntools: [Read, Glob]\nmodel: inherit\n---\n\nBody.';
        const result = adaptSubagentToSkill(source, 'cc-expert-agent', 'cc');

        expect(result).toContain('name: cc-expert-agent');
    });

    it('does NOT set disable-model-invocation (Refinement #6)', () => {
        const source = '---\ndescription: Agent\n---\n\nBody.';
        const result = adaptSubagentToSkill(source, 'cc-test', 'cc');

        expect(result).not.toContain('disable-model-invocation');
    });

    it('preserves description, tools, model, skills fields', () => {
        const source =
            '---\ndescription: Expert\ntools: [Read, Glob]\nmodel: inherit\ncolor: azure\nskills: [cc:cc-agents]\n---\n\nBody.';
        const result = adaptSubagentToSkill(source, 'cc-expert-agent', 'cc');

        expect(result).toContain('description: Expert');
        expect(result).toContain('tools: [Read, Glob]');
        expect(result).toContain('model: inherit');
        expect(result).toContain('color: azure');
        // skills reference rewritten
        expect(result).toContain('cc-cc-agents');
    });

    it('rewrites plugin:skill references', () => {
        const source = '---\ndescription: Uses cc:cc-skills\n---\n\nDelegates to cc:cc-skills.';
        const result = adaptSubagentToSkill(source, 'cc-test', 'cc');

        expect(result).toContain('cc-cc-skills');
        expect(result).not.toContain('cc:cc-skills');
    });

    it('generates stub frontmatter when source has none', () => {
        const source = '# Expert Agent\n\nAn agent.';
        const result = adaptSubagentToSkill(source, 'cc-expert', 'cc');

        expect(result).toContain('name: cc-expert');
        expect(result).toContain('description:');
    });
});

describe('adaptSubagentToPi', () => {
    let tmpPluginDir: string;

    afterEach(() => {
        if (tmpPluginDir) rmSync(tmpPluginDir, { recursive: true, force: true });
    });

    function setupPluginWithSkills(skillNames: string[]): (bareName: string) => boolean {
        tmpPluginDir = mkdtempSync('superskill-pi-test-');
        const skillsDir = join(tmpPluginDir, 'skills');
        for (const name of skillNames) {
            mkdirSync(join(skillsDir, name), { recursive: true });
            writeFileSync(join(skillsDir, name, 'SKILL.md'), `---\nname: ${name}\n---\nbody`);
        }
        return (bareName: string) => existsSync(join(skillsDir, bareName));
    }

    it('produces Pi-native YAML with pinned field order: name, description, tools, model, skill', () => {
        const skillExists = setupPluginWithSkills(['cc-agents']);
        const source = [
            '---',
            'name: expert-agent',
            'description: Expert subagent',
            'tools: [Read, Glob]',
            'model: sonnet',
            'skills: [cc:cc-agents]',
            '---',
            '',
            'Body text.',
        ].join('\n');

        const result = adaptSubagentToPi(source, 'cc-expert-agent', 'cc', skillExists);

        // Field order: name before description before tools before model before skill
        const nameIdx = result.indexOf('name:');
        const descIdx = result.indexOf('description:');
        const toolsIdx = result.indexOf('tools:');
        const modelIdx = result.indexOf('model:');
        const skillIdx = result.indexOf('skill:');

        expect(nameIdx).toBeLessThan(descIdx);
        expect(descIdx).toBeLessThan(toolsIdx);
        expect(toolsIdx).toBeLessThan(modelIdx);
        expect(modelIdx).toBeLessThan(skillIdx);
    });

    it('normalizes tools to Pi format (Read→read, Glob→find, ls)', () => {
        const skillExists = setupPluginWithSkills([]);
        const source = '---\nname: test\ndescription: Test\ntools: [Read, Glob]\nmodel: sonnet\n---\n\nBody.';
        const result = adaptSubagentToPi(source, 'cc-test', 'cc', skillExists);

        expect(result).toContain('tools: read, find, ls');
    });

    it('drops model: inherit', () => {
        const skillExists = setupPluginWithSkills([]);
        const source = '---\nname: test\ndescription: Test\ntools: [Read]\nmodel: inherit\n---\n\nBody.';
        const result = adaptSubagentToPi(source, 'cc-test', 'cc', skillExists);

        expect(result).not.toContain('model:');
    });

    it('filters body-discovered skills to existing skill dirs for skill: field (Refinement #4)', () => {
        // Only cc-agents exists; cc-nonexistent does not
        const skillExists = setupPluginWithSkills(['cc-agents']);
        const source = [
            '---',
            'name: expert-agent',
            'description: Expert',
            'tools: [Read]',
            '---',
            '',
            'Uses cc:cc-agents and cc:cc-nonexistent.',
        ].join('\n');

        const result = adaptSubagentToPi(source, 'cc-expert-agent', 'cc', skillExists);

        // skill: field should only contain existing skills (cc-cc-agents, not cc-cc-nonexistent)
        const skillLine = result.split('\n').find((l) => l.startsWith('skill:'));
        expect(skillLine).toBeDefined();
        expect(skillLine).toContain('cc-cc-agents');
        expect(skillLine).not.toContain('cc-nonexistent');
        // Note: body text refs are rewritten by rewriteSkillReferences regardless of existence
    });

    it('emits no phantom skill: entries when no skills exist (Refinement #4)', () => {
        const skillExists = setupPluginWithSkills([]); // no skills at all
        const source = [
            '---',
            'name: expert-agent',
            'description: Expert',
            'tools: [Read]',
            '---',
            '',
            'References cc:cc-agents but no skill dir exists.',
        ].join('\n');

        const result = adaptSubagentToPi(source, 'cc-expert-agent', 'cc', skillExists);

        expect(result).not.toContain('skill:');
    });

    it('rewrites plugin:skill references in body text', () => {
        const skillExists = setupPluginWithSkills(['cc-agents']);
        const source =
            '---\nname: test\ndescription: Uses cc:cc-agents\ntools: [Read]\n---\n\nDelegates to cc:cc-agents.';
        const result = adaptSubagentToPi(source, 'cc-test', 'cc', skillExists);

        expect(result).toContain('cc-cc-agents');
        expect(result).not.toMatch(/\bcc:cc-agents\b/);
    });

    it('includes Pi Runtime Adaptation section when relevant tools present', () => {
        const skillExists = setupPluginWithSkills([]);
        const source = '---\nname: test\ndescription: Test\ntools: [Read, Glob, Agent]\n---\n\nBody.';
        const result = adaptSubagentToPi(source, 'cc-test', 'cc', skillExists);

        expect(result).toContain('## Pi Runtime Adaptation');
        expect(result).toContain('subagent'); // Agent → subagent mapping note
    });

    it('includes Skill notes when Skill tool and skills present', () => {
        const skillExists = setupPluginWithSkills(['cc-agents']);
        const source = '---\nname: test\ndescription: Test\ntools: [Skill]\nskills: [cc:cc-agents]\n---\n\nBody.';
        const result = adaptSubagentToPi(source, 'cc-test', 'cc', skillExists);
        expect(result).toContain('injected into this prompt');
    });

    it('includes Task notes when Task tool present', () => {
        const skillExists = setupPluginWithSkills([]);
        const source = '---\nname: test\ndescription: Test\ntools: [Task]\n---\n\nBody.';
        const result = adaptSubagentToPi(source, 'cc-test', 'cc', skillExists);
        expect(result).toContain('Task tool reference');
    });

    it('includes WebSearch notes when WebSearch tool present', () => {
        const skillExists = setupPluginWithSkills([]);
        const source = '---\nname: test\ndescription: Test\ntools: [WebSearch]\n---\n\nBody.';
        const result = adaptSubagentToPi(source, 'cc-test', 'cc', skillExists);
        expect(result).toContain('web-access style tools');
    });

    it('includes WebSearch notes when mcp__ tool present', () => {
        const skillExists = setupPluginWithSkills([]);
        const source = '---\nname: test\ndescription: Test\ntools: [mcp__github]\n---\n\nBody.';
        const result = adaptSubagentToPi(source, 'cc-test', 'cc', skillExists);
        expect(result).toContain('web-access style tools');
    });

    it('includes AskUserQuestion notes when present', () => {
        const skillExists = setupPluginWithSkills([]);
        const source = '---\nname: test\ndescription: Test\ntools: [AskUserQuestion]\n---\n\nBody.';
        const result = adaptSubagentToPi(source, 'cc-test', 'cc', skillExists);
        expect(result).toContain('AskUserQuestion-style step');
    });

    it('handles malformed frontmatter gracefully', () => {
        const skillExists = setupPluginWithSkills([]);
        const source = 'Plain text with no frontmatter at all.';
        const result = adaptSubagentToPi(source, 'cc-test', 'cc', skillExists);
        expect(result).toContain('name: cc-test');
    });

    it('skillExists=()=>true keeps a body-discovered skill (zero filesystem, R3)', () => {
        const source = [
            '---',
            'name: expert-agent',
            'description: Expert',
            'tools: [Read]',
            '---',
            '',
            'Uses cc:cc-agents here.',
        ].join('\n');
        const result = adaptSubagentToPi(source, 'cc-expert-agent', 'cc', () => true);
        const skillLine = result.split('\n').find((l) => l.startsWith('skill:'));
        expect(skillLine).toBeDefined();
        expect(skillLine).toContain('cc-cc-agents');
    });

    it('skillExists=()=>false drops body-discovered skills (zero filesystem, R3)', () => {
        const source = [
            '---',
            'name: expert-agent',
            'description: Expert',
            'tools: [Read]',
            '---',
            '',
            'Uses cc:cc-agents here.',
        ].join('\n');
        const result = adaptSubagentToPi(source, 'cc-expert-agent', 'cc', () => false);
        expect(result).not.toContain('skill:');
    });

    it('emits parseable YAML for multi-line descriptions (Claude Code <example> convention)', () => {
        // Claude Code agents conventionally embed multi-line <example> blocks in the
        // description. The emitted Pi frontmatter must stay parseable — a literal line
        // break inside the quoted scalar makes the whole agent file unloadable.
        const source = [
            '---',
            'name: reviewer',
            'description: |',
            '  Use PROACTIVELY for code review.',
            '',
            '  <example>',
            '  user: "Review this"',
            '  </example>',
            'model: sonnet',
            'tools: [Read, Grep]',
            '---',
            '',
            'You are a reviewer.',
        ].join('\n');
        const result = adaptSubagentToPi(source, 'cc-reviewer', 'cc', () => true);
        const parsed = parseFrontmatter(result);
        expect(parsed.data.name).toBe('cc-reviewer');
        expect(String(parsed.data.description)).toContain('Use PROACTIVELY for code review.');
        expect(String(parsed.data.description)).toContain('<example>');
    });
});

describe('adaptSubagentToCodex', () => {
    it('produces TOML with pinned key order: name, description, model, model_reasoning_effort, developer_instructions', () => {
        const source = '---\nname: test\ndescription: Test agent\n---\n\nBody text.';
        const result = adaptSubagentToCodex(source, 'cc-test', 'cc');

        const keys = result
            .split('\n')
            .filter((l) => /^[a-z_]+ = /.test(l))
            .map((l) => l.split(' = ')[0]);
        expect(keys).toEqual(['name', 'description', 'model', 'model_reasoning_effort', 'developer_instructions']);
    });

    it('uses execution tier by default (absent model-tier)', () => {
        const source = '---\nname: test\ndescription: Test\n---\n\nBody.';
        const result = adaptSubagentToCodex(source, 'cc-test', 'cc');

        expect(result).toContain(`model = "${CODEX_MODEL_TIERS.execution.model}"`);
        expect(result).toContain(`model_reasoning_effort = "${CODEX_MODEL_TIERS.execution.model_reasoning_effort}"`);
    });

    it('uses judgment tier when model-tier: judgment is declared', () => {
        const source = '---\nname: test\ndescription: Test\nmodel-tier: judgment\n---\n\nBody.';
        const result = adaptSubagentToCodex(source, 'cc-test', 'cc');

        expect(result).toContain(`model = "${CODEX_MODEL_TIERS.judgment.model}"`);
        expect(result).toContain(`model_reasoning_effort = "${CODEX_MODEL_TIERS.judgment.model_reasoning_effort}"`);
    });

    it('uses execution tier when model-tier: execution is declared', () => {
        const source = '---\nname: test\ndescription: Test\nmodel-tier: execution\n---\n\nBody.';
        const result = adaptSubagentToCodex(source, 'cc-test', 'cc');

        expect(result).toContain(`model = "${CODEX_MODEL_TIERS.execution.model}"`);
    });

    it('throws on unknown model-tier value', () => {
        const source = '---\nname: test\ndescription: Test\nmodel-tier: bogus\n---\n\nBody.';
        expect(() => adaptSubagentToCodex(source, 'cc-test', 'cc')).toThrow(
            /Agent "cc-test" declares unknown model-tier "bogus"/,
        );
    });

    it('never forwards raw Claude model: value', () => {
        const source = '---\nname: test\ndescription: Test\nmodel: sonnet\n---\n\nBody.';
        const result = adaptSubagentToCodex(source, 'cc-test', 'cc');

        expect(result).not.toContain('sonnet');
        expect(result).not.toContain('model: sonnet');
        // Should contain the execution-tier model, not sonnet
        expect(result).toContain(`model = "${CODEX_MODEL_TIERS.execution.model}"`);
    });

    it('rewrites plugin:skill references in developer_instructions', () => {
        const source = '---\nname: test\ndescription: Test\n---\n\nUses cc:cc-agents and cc:cc-nonexistent.';
        const result = adaptSubagentToCodex(source, 'cc-test', 'cc');

        expect(result).toContain('cc-cc-agents');
        expect(result).toContain('cc-cc-nonexistent');
        expect(result).not.toContain('cc:cc-agents');
        expect(result).not.toContain('cc:cc-nonexistent');
    });

    it('uses literal block string for developer_instructions when body has no triple-single-quotes', () => {
        const source = '---\nname: test\ndescription: Test\n---\n\nLine one.\nLine two.';
        const result = adaptSubagentToCodex(source, 'cc-test', 'cc');

        expect(result).toContain("developer_instructions = '''");
        expect(result).toContain('Line one.\nLine two.');
    });

    it('falls back to multiline basic string when body contains triple-single-quotes', () => {
        const source = "---\nname: test\ndescription: Test\n---\n\nBody with ''' quotes.";
        const result = adaptSubagentToCodex(source, 'cc-test', 'cc');

        expect(result).toContain('developer_instructions = """');
        expect(result).not.toContain("developer_instructions = '''");
    });

    it('synthesizes description from first body line when frontmatter has none', () => {
        const source = '---\nname: test\n---\n\nFirst line is description.\nSecond line is body.';
        const result = adaptSubagentToCodex(source, 'cc-test', 'cc');

        expect(result).toContain('description = "First line is description."');
    });

    it('backfills empty body from description', () => {
        const source = '---\nname: test\ndescription: Generated description\n---\n';
        const result = adaptSubagentToCodex(source, 'cc-test', 'cc');

        const match = result.match(/developer_instructions = '''\n([\s\S]*?)\n'''/);
        expect(match).toBeDefined();
        expect(match?.[1]).toBe('Generated description');
    });

    it('handles malformed frontmatter gracefully (no frontmatter delimiters)', () => {
        const source = 'Just plain text, no frontmatter.';
        const result = adaptSubagentToCodex(source, 'cc-test', 'cc');

        expect(result).toContain('name = "cc-test"');
        expect(result).toContain('developer_instructions');
    });

    it('escapes double quotes in description', () => {
        const source = '---\nname: test\ndescription: Has "quotes" inside\n---\n\nBody.';
        const result = adaptSubagentToCodex(source, 'cc-test', 'cc');

        expect(result).toContain('description = "Has \\"quotes\\" inside"');
    });

    it('uses expectedName as TOML name, not frontmatter name', () => {
        const source = '---\nname: original\ndescription: Test\n---\n\nBody.';
        const result = adaptSubagentToCodex(source, 'cc-test', 'cc');

        expect(result).toContain('name = "cc-test"');
        expect(result).not.toContain('name = "original"');
    });

    it('escapes control characters incl. DEL (U+007F) in basic strings', () => {
        const source = '---\nname: test\ndescription: Bell\u0007 and \u007f here\n---\n\nBody.';
        const result = adaptSubagentToCodex(source, 'cc-test', 'cc');

        // TOML basic strings must escape C0 controls and U+007F (spec-valid; Codex's
        // Rust/serde parser accepts these). Bun.TOML.parse rejects spec-valid \uXXXX
        // C0 escapes (Bun parser limitation, probed 2026-08-02), so no round-trip here.
        expect(result).toContain('\\u0007');
        expect(result).toContain('\\u007f');
    });

    it('round-trips through Bun.TOML.parse with description newlines and backslashes', () => {
        const source = '---\nname: test\ndescription: Line1\\nLine2 with \\ backslash\n---\n\nBody.';
        const result = adaptSubagentToCodex(source, 'cc-test', 'cc');

        const parsed = Bun.TOML.parse(result) as { description: string };
        expect(parsed.description).toBe('Line1\\nLine2 with \\ backslash');
    });
});
