import { describe, expect, it } from 'bun:test';
import { applyChange, type Change } from '../../src/content/edit';

describe('applyChange', () => {
    describe('kind: frontmatter', () => {
        it('modifies an existing frontmatter key', () => {
            const content = '---\nname: old\n---\n\nbody';
            const change: Change = { kind: 'frontmatter', key: 'name', value: 'new' };
            const result = applyChange(content, change);
            expect(result).toContain('name: new');
            expect(result).toContain('\n\nbody');
        });

        it('adds a new frontmatter key', () => {
            const content = '---\nname: test\n---\n\nbody';
            const change: Change = { kind: 'frontmatter', key: 'description', value: 'A description' };
            const result = applyChange(content, change);
            expect(result).toContain('name: test');
            expect(result).toContain('description: A description');
        });

        it('preserves comments in frontmatter', () => {
            const content = '---\n# a comment\nname: test\n---\nbody';
            const change: Change = { kind: 'frontmatter', key: 'name', value: 'renamed' };
            const result = applyChange(content, change);
            expect(result).toContain('# a comment');
        });
    });

    describe('kind: text', () => {
        it('replaces the first occurrence of current with proposed', () => {
            const content = '---\nname: test\n---\n\nHello world, hello again';
            const change: Change = { kind: 'text', current: 'Hello world', proposed: 'Goodbye world' };
            const result = applyChange(content, change);
            expect(result).toContain('Goodbye world, hello again');
        });

        it('replaces only the first occurrence when text appears multiple times', () => {
            const content = '---\nname: test\n---\n\nfoo bar foo';
            const change: Change = { kind: 'text', current: 'foo', proposed: 'baz' };
            const result = applyChange(content, change);
            expect(result).toBe('---\nname: test\n---\n\nbaz bar foo');
        });

        it('throws when current text is not found', () => {
            const content = '---\nname: test\n---\n\nsome body';
            const change: Change = { kind: 'text', current: 'not found', proposed: 'x' };
            expect(() => applyChange(content, change)).toThrow('Text change target not found');
        });

        it('replaces exact match case-sensitively', () => {
            const content = '---\nname: test\n---\n\nFoo bar';
            const change: Change = { kind: 'text', current: 'Foo', proposed: 'Baz' };
            const result = applyChange(content, change);
            expect(result).toContain('Baz bar');
        });
    });
});
