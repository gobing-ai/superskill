import { describe, expect, it } from 'bun:test';
import {
    convertToPiSubagent,
    expandPiTool,
    extractSkillsFromBody,
    parseToolsList,
} from '../../src/pipeline/pi-subagent';

describe('expandPiTool', () => {
    it('maps Read → read', () => {
        expect(expandPiTool('Read')).toBe('read');
    });

    it('maps Glob → find, ls (expands to two tokens)', () => {
        expect(expandPiTool('Glob')).toBe('find, ls');
    });

    it('maps Agent → subagent', () => {
        expect(expandPiTool('Agent')).toBe('subagent');
    });

    it('maps Skill → empty (dropped)', () => {
        expect(expandPiTool('Skill')).toBe('');
    });

    it('maps WebSearch → web_search, fetch_content, get_search_content', () => {
        expect(expandPiTool('WebSearch')).toBe('web_search, fetch_content, get_search_content');
    });

    it('maps mcp__* wildcard → mcp', () => {
        expect(expandPiTool('mcp__github')).toBe('mcp');
    });

    it('maps mcp: prefix → mcp', () => {
        expect(expandPiTool('mcp:brave-search')).toBe('mcp');
    });

    it('returns empty for unknown tool', () => {
        expect(expandPiTool('UnknownTool')).toBe('');
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

describe('extractSkillsFromBody', () => {
    it('extracts colon-separated skill refs from prose', () => {
        const body = 'Use rd3:dev-run or wt:publish-to-x to complete the task.';
        const skills = extractSkillsFromBody(body);
        expect(skills).toContain('rd3-dev-run');
        expect(skills).toContain('wt-publish-to-x');
    });

    it('returns empty array when no skill refs found', () => {
        expect(extractSkillsFromBody('No skill references here.')).toEqual([]);
    });

    it('deduplicates references', () => {
        const skills = extractSkillsFromBody('rd3:dev-run and rd3:dev-run again');
        expect(skills).toEqual(['rd3-dev-run']);
    });
});

describe('convertToPiSubagent', () => {
    it('converts tools to Pi CSV with expansion', () => {
        const input = `---
name: test-agent
description: A test agent
tools: [Read, Glob, Bash]
model: inherit
---

You are a test agent.`;

        const result = convertToPiSubagent(input);
        expect(result).toContain('name: test-agent');
        expect(result).toContain('description: A test agent');
        expect(result).toContain('tools: read, find, ls, bash');
        expect(result).not.toContain('model: inherit');
    });

    it('keeps model when not inherit', () => {
        const input = `---
name: test-agent
tools: [Read]
model: haiku
---

Body`;

        const result = convertToPiSubagent(input);
        expect(result).toContain('model: haiku');
    });

    it('injects runtime notes for tools needing adaptation', () => {
        const input = `---
name: test-agent
tools: [Glob, WebSearch]
---

Body text.`;

        const result = convertToPiSubagent(input);
        expect(result).toContain('## Pi Runtime Adaptation');
        expect(result).toContain("Pi's `find` and `ls` tools");
    });

    it('does not inject runtime notes when no adaptation needed', () => {
        const input = `---
name: test-agent
tools: [Read, Write]
---

Body.`;

        const result = convertToPiSubagent(input);
        expect(result).not.toContain('## Pi Runtime Adaptation');
    });

    it('extracts skills from body when frontmatter has none', () => {
        const input = `---
name: test-agent
tools: [Read]
---

Use rd3:dev-run for task execution.`;

        const result = convertToPiSubagent(input);
        expect(result).toContain('skill: rd3-dev-run');
    });

    it('returns content unchanged when no frontmatter', () => {
        const input = 'Plain text without frontmatter.';
        expect(convertToPiSubagent(input)).toBe(input);
    });

    it('handles block-style YAML array for tools', () => {
        const input = `---
name: test-agent
description: A test agent
tools:
  - Read
  - Write
  - Bash
---

You are a test agent.`;

        const result = convertToPiSubagent(input);
        expect(result).toContain('tools: read, write, bash');
    });

    it('returns content unchanged when frontmatter is malformed', () => {
        const input = `---
name: test-agent
description: Missing closer`;
        expect(convertToPiSubagent(input)).toBe(input);
    });

    it('injects Skill runtime notes when Skill tool and skills present', () => {
        const input = `---
name: test-agent
tools: [Skill]
skills: [cc:cc-agents]
---

Body.`;
        const result = convertToPiSubagent(input);
        expect(result).toContain('## Pi Runtime Adaptation');
        expect(result).toContain('injected into this prompt');
    });

    it('injects Agent runtime notes when Agent tool present', () => {
        const input = `---
name: test-agent
tools: [Agent]
---

Body.`;
        const result = convertToPiSubagent(input);
        expect(result).toContain("Pi's `subagent` tool");
    });

    it('injects AskUserQuestion runtime notes when present', () => {
        const input = `---
name: test-agent
tools: [AskUserQuestion]
---

Body.`;
        const result = convertToPiSubagent(input);
        expect(result).toContain('AskUserQuestion-style step');
    });
});
