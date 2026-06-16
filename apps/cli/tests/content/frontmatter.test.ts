import { describe, expect, it } from 'bun:test';
import { applyFrontmatterChange, FrontmatterError, parseFrontmatter } from '../../src/content/frontmatter';

describe('parseFrontmatter', () => {
    it('parses valid frontmatter and returns data, body, raw', () => {
        const content = '---\nname: test\nversion: 1\n---\n\n# Body\nSome text';
        const result = parseFrontmatter(content);
        expect(result.data).toEqual({ name: 'test', version: 1 });
        expect(result.body).toBe('\n\n# Body\nSome text');
        expect(result.raw).toBe('name: test\nversion: 1');
    });

    it('throws FrontmatterError when content does not start with ---', () => {
        expect(() => parseFrontmatter('no frontmatter here')).toThrow(FrontmatterError);
        expect(() => parseFrontmatter('no frontmatter here')).toThrow('Missing frontmatter');
    });

    it('throws FrontmatterError when no closing --- delimiter', () => {
        expect(() => parseFrontmatter('---\nname: test')).toThrow(FrontmatterError);
        expect(() => parseFrontmatter('---\nname: test')).toThrow('Missing frontmatter closing');
    });

    it('throws FrontmatterError when frontmatter is empty', () => {
        expect(() => parseFrontmatter('---\n\n---')).toThrow(FrontmatterError);
        expect(() => parseFrontmatter('---\n\n---')).toThrow('Frontmatter is empty');
    });

    it('throws FrontmatterError on unparseable YAML', () => {
        expect(() => parseFrontmatter('---\n: [ bad yaml\n---\nbody')).toThrow(FrontmatterError);
        expect(() => parseFrontmatter('---\n: [ bad yaml\n---\nbody')).toThrow('Failed to parse');
    });

    it('throws FrontmatterError when frontmatter is not a mapping', () => {
        expect(() => parseFrontmatter('---\n- item1\n- item2\n---\nbody')).toThrow(FrontmatterError);
        expect(() => parseFrontmatter('---\n- item1\n- item2\n---\nbody')).toThrow('must be a YAML mapping');
    });

    it('parses empty body correctly', () => {
        const result = parseFrontmatter('---\nname: x\n---');
        expect(result.data).toEqual({ name: 'x' });
        expect(result.body).toBe('');
    });

    it('handles frontmatter with numeric and boolean values', () => {
        const content = '---\nname: test\nversion: 2\nenabled: true\n---\nbody';
        const result = parseFrontmatter(content);
        expect(result.data).toEqual({ name: 'test', version: 2, enabled: true });
    });
});

describe('applyFrontmatterChange', () => {
    it('mutates an existing key and preserves comments', () => {
        const content = '---\nname: old\n# keep this comment\nversion: 1\n---\n\nbody';
        const result = applyFrontmatterChange(content, (doc) => {
            doc.set('name', 'new');
        });
        expect(result).toContain('name: new');
        expect(result).toContain('# keep this comment');
        expect(result).toContain('version: 1');
        expect(result).toContain('\n\nbody');
    });

    it('adds a new key while preserving existing keys', () => {
        const content = '---\nname: test\n---\n\nbody';
        const result = applyFrontmatterChange(content, (doc) => {
            doc.set('description', 'added');
        });
        expect(result).toContain('name: test');
        expect(result).toContain('description: added');
    });

    it('preserves key order after mutation', () => {
        const content = '---\nname: first\ndescription: second\nversion: third\n---\nbody';
        const result = applyFrontmatterChange(content, (doc) => {
            doc.set('name', 'renamed');
        });
        const lines = result.split('\n');
        const nameIdx = lines.findIndex((l) => l.startsWith('name:'));
        const descIdx = lines.findIndex((l) => l.startsWith('description:'));
        const verIdx = lines.findIndex((l) => l.startsWith('version:'));
        expect(nameIdx).toBeLessThan(descIdx);
        expect(descIdx).toBeLessThan(verIdx);
    });
});

describe('FrontmatterError', () => {
    it('is an instance of Error', () => {
        const err = new FrontmatterError('test');
        expect(err).toBeInstanceOf(Error);
        expect(err).toBeInstanceOf(FrontmatterError);
        expect(err.name).toBe('FrontmatterError');
    });

    it('stores cause when provided', () => {
        const cause = new Error('root');
        const err = new FrontmatterError('test', cause);
        expect(err.cause).toBe(cause);
    });
});
