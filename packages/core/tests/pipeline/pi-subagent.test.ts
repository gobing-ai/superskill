import { describe, expect, it } from 'bun:test';
import { expandPiToolName, parseToolsList } from '../../src/pipeline/pi-tools';

describe('expandPiToolName', () => {
    it('maps Read → read', () => {
        expect(expandPiToolName('Read')).toBe('read');
    });

    it('maps Glob → find, ls (expands to two tokens)', () => {
        expect(expandPiToolName('Glob')).toBe('find, ls');
    });

    it('maps Agent → subagent', () => {
        expect(expandPiToolName('Agent')).toBe('subagent');
    });

    it('maps Skill → empty (dropped)', () => {
        expect(expandPiToolName('Skill')).toBe('');
    });

    it('maps WebSearch → web_search, fetch_content, get_search_content', () => {
        expect(expandPiToolName('WebSearch')).toBe('web_search, fetch_content, get_search_content');
    });

    it('maps mcp__* wildcard → mcp', () => {
        expect(expandPiToolName('mcp__github')).toBe('mcp');
    });

    it('maps mcp: prefix → mcp', () => {
        expect(expandPiToolName('mcp:brave-search')).toBe('mcp');
    });

    it('returns empty for unknown tool', () => {
        expect(expandPiToolName('UnknownTool')).toBe('');
    });
});

describe('parseToolsList', () => {
    it('parses [Read, Write, Bash]', () => {
        expect(parseToolsList('[Read, Write, Bash]')).toEqual(['Read', 'Write', 'Bash']);
    });

    it('returns empty for empty brackets', () => {
        expect(parseToolsList('[]')).toEqual([]);
    });

    it('handles surrounding whitespace', () => {
        expect(parseToolsList(' [Read] ')).toEqual(['Read']);
    });
});
