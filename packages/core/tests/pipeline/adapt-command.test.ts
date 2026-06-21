import { describe, expect, it } from 'bun:test';
import { adaptCommandToSkill } from '../../src/pipeline/adapt-command';

describe('adaptCommandToSkill', () => {
    it('injects name and disable-model-invocation into command frontmatter', () => {
        const source = '---\nargument-hint: <task>\ndescription: Run a task\n---\n\nRun a task.';
        const result = adaptCommandToSkill(source, 'cc-skill-add', 'cc');

        expect(result).toContain('name: cc-skill-add');
        expect(result).toContain('disable-model-invocation: true');
    });

    it('normalizes argument-hint to double-quoted YAML', () => {
        const source = '---\nargument-hint: <name> [--force]\n---\n\nBody.';
        const result = adaptCommandToSkill(source, 'cc-test', 'cc');

        expect(result).toContain('argument-hint: "<name> [--force]"');
    });

    it('normalizes bare CSV allowed-tools to YAML array', () => {
        const source = '---\nallowed-tools: Read, Write, Bash\n---\n\nBody.';
        const result = adaptCommandToSkill(source, 'cc-test', 'cc');

        expect(result).toContain('allowed-tools: [Read, Write, Bash]');
    });

    it('preserves existing array-format allowed-tools', () => {
        const source = '---\nallowed-tools: [Read, Write]\n---\n\nBody.';
        const result = adaptCommandToSkill(source, 'cc-test', 'cc');

        expect(result).toContain('allowed-tools: [Read, Write]');
    });

    it('rewrites plugin:skill references in body and frontmatter', () => {
        const source = '---\ndescription: Wraps cc:cc-skills\n---\n\nDelegates to cc:cc-skills.';
        const result = adaptCommandToSkill(source, 'cc-skill-add', 'cc');

        expect(result).toContain('cc-cc-skills');
        expect(result).not.toContain('cc:cc-skills');
    });

    it('generates stub frontmatter when source has none', () => {
        const source = '# Run\n\nRun a task command.';
        const result = adaptCommandToSkill(source, 'cc-run', 'cc');

        expect(result).toContain('name: cc-run');
        expect(result).toContain('disable-model-invocation: true');
        expect(result).toContain('description:');
    });

    it('replaces existing name field with expected name', () => {
        const source = '---\nname: old-name\ndescription: Test\n---\n\nBody.';
        const result = adaptCommandToSkill(source, 'cc-new-name', 'cc');

        expect(result).toContain('name: cc-new-name');
        expect(result).not.toMatch(/^name: old-name/m);
    });
});
