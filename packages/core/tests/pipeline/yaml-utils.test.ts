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
});
