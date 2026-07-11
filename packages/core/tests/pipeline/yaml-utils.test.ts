import { describe, expect, it } from 'bun:test';
import { quoteYaml } from '../../src/pipeline/yaml-utils';

describe('quoteYaml', () => {
    it('wraps a plain string in double quotes', () => {
        expect(quoteYaml('hello')).toBe('"hello"');
    });

    it('preserves spaces without quoting issues', () => {
        expect(quoteYaml('hello world')).toBe('"hello world"');
    });

    it('escapes embedded double quotes', () => {
        expect(quoteYaml('say "hi"')).toBe('"say \\"hi\\""');
    });

    it('escapes backslashes', () => {
        expect(quoteYaml('C:\\Users\\robin')).toBe('"C:\\\\Users\\\\robin"');
    });

    it('escapes both backslashes and quotes together', () => {
        expect(quoteYaml('path\\"to')).toBe('"path\\\\\\"to"');
    });

    it('returns empty quoted string for empty input', () => {
        expect(quoteYaml('')).toBe('""');
    });

    it('escapes newlines so the result stays a single-line YAML scalar', () => {
        // A literal line break inside the quotes breaks the `key: value` frontmatter
        // line the adapters emit — multi-line agent descriptions must survive.
        expect(quoteYaml('line one\nline two')).toBe('"line one\\nline two"');
        expect(quoteYaml('crlf\r\nnext')).toBe('"crlf\\r\\nnext"');
        expect(quoteYaml('tab\there')).toBe('"tab\\there"');
        expect(quoteYaml('multi\nline')).not.toContain('\n');
    });
});
