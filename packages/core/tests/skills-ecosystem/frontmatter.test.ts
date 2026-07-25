/**
 * Tests for the YAML-only SKILL.md frontmatter parser and the
 * name+description contract validator (skills-ecosystem/frontmatter.ts).
 */
import { describe, expect, it } from 'bun:test';
import { parseFrontmatter, parseSkillFrontmatter } from '../../src/skills-ecosystem/frontmatter';

describe('parseFrontmatter', () => {
    it('parses a YAML frontmatter block', () => {
        const raw = '---\nname: my-skill\ndescription: Does things\n---\n# Body\n';
        const { data, content } = parseFrontmatter(raw);
        expect(data.name).toBe('my-skill');
        expect(data.description).toBe('Does things');
        expect(content).toBe('# Body\n');
    });

    it('handles CRLF line endings', () => {
        const raw = '---\r\nname: my-skill\r\ndescription: Does things\r\n---\r\nBody\r\n';
        const { data, content } = parseFrontmatter(raw);
        expect(data.name).toBe('my-skill');
        expect(content).toBe('Body\r\n');
    });

    it('returns empty data and the raw input when there is no frontmatter block', () => {
        const raw = '# Just markdown\n';
        const { data, content } = parseFrontmatter(raw);
        expect(data).toEqual({});
        expect(content).toBe(raw);
    });

    it('does not treat an empty frontmatter block as frontmatter (vendor parity)', () => {
        // The vendor regex requires a newline before the closing ---; an empty
        // block does not match, so the raw input is returned untouched.
        const raw = '---\n---\nBody\n';
        const { data, content } = parseFrontmatter(raw);
        expect(data).toEqual({});
        expect(content).toBe(raw);
    });
});

describe('parseSkillFrontmatter', () => {
    it('returns name, description, data, and content for a valid SKILL.md', () => {
        const raw = '---\nname: my-skill\ndescription: Does things\nextra: 42\n---\nBody\n';
        const result = parseSkillFrontmatter(raw);
        expect(result).not.toBeNull();
        expect(result?.name).toBe('my-skill');
        expect(result?.description).toBe('Does things');
        expect(result?.data.extra).toBe(42);
        expect(result?.content).toBe('Body\n');
    });

    it('returns null when name is missing', () => {
        expect(parseSkillFrontmatter('---\ndescription: x\n---\n')).toBeNull();
    });

    it('returns null when description is missing', () => {
        expect(parseSkillFrontmatter('---\nname: x\n---\n')).toBeNull();
    });

    it('returns null when name or description are not strings', () => {
        expect(parseSkillFrontmatter('---\nname: 42\ndescription: x\n---\n')).toBeNull();
        expect(parseSkillFrontmatter('---\nname: x\ndescription:\n  - a\n  - b\n---\n')).toBeNull();
    });

    it('returns null when there is no frontmatter at all', () => {
        expect(parseSkillFrontmatter('# Markdown only\n')).toBeNull();
    });
});
