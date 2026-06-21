import { describe, expect, it } from 'bun:test';
import {
    expandPiToolName,
    normalizePiToolList,
    parseToolsList,
    rewriteAllowedToolsForPi,
} from '../../src/pipeline/pi-tools';

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

    it('maps mcp__* wildcard → mcp', () => {
        expect(expandPiToolName('mcp__github')).toBe('mcp');
    });

    it('returns empty for unknown tool', () => {
        expect(expandPiToolName('UnknownTool')).toBe('');
    });
});

describe('parseToolsList', () => {
    it('parses flow-style array [Read, Write]', () => {
        expect(parseToolsList('[Read, Write]')).toEqual(['Read', 'Write']);
    });

    it('parses bare CSV', () => {
        expect(parseToolsList('Read, Write, Bash')).toEqual(['Read', 'Write', 'Bash']);
    });

    it('returns empty for empty string', () => {
        expect(parseToolsList('')).toEqual([]);
    });
});

describe('normalizePiToolList', () => {
    it('normalizes and deduplicates a tool list', () => {
        expect(normalizePiToolList('[Read, Glob, Find]')).toBe('read, find, ls');
    });

    it('drops unmapped tools', () => {
        expect(normalizePiToolList('[Read, UnknownTool]')).toBe('read');
    });

    it('deduplicates Glob+Find overlap (both produce find)', () => {
        const result = normalizePiToolList('[Glob, Find]');
        // Glob → find, ls; Find → find → dedup → find, ls
        expect(result).toBe('find, ls');
    });
});

describe('rewriteAllowedToolsForPi', () => {
    it('normalizes allowed-tools in frontmatter', () => {
        const content = '---\nallowed-tools: [Read, Glob]\n---\nbody';
        const result = rewriteAllowedToolsForPi(content);
        expect(result).toContain('allowed-tools: read, find, ls');
    });

    it('leaves body content untouched', () => {
        const content = '---\nallowed-tools: [Read]\n---\nsome body text';
        const result = rewriteAllowedToolsForPi(content);
        expect(result).toContain('some body text');
    });

    it('handles content without allowed-tools field', () => {
        const content = '---\nname: test\n---\nbody';
        expect(rewriteAllowedToolsForPi(content)).toBe(content);
    });
});
