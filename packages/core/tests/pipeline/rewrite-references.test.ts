import { describe, expect, it } from 'bun:test';
import { rewriteSkillReferences } from '../../src/pipeline/rewrite-references';

describe('rewriteSkillReferences', () => {
    it('rewrites plugin:name → plugin-name when scoped to the plugin prefix', () => {
        expect(rewriteSkillReferences('use cc:cc-agents here', 'cc')).toBe('use cc-cc-agents here');
    });

    it('rewrites cc:anti-hallucination → cc-anti-hallucination', () => {
        expect(rewriteSkillReferences('invoke cc:anti-hallucination', 'cc')).toBe('invoke cc-anti-hallucination');
    });

    it('handles multiple refs in one string', () => {
        expect(rewriteSkillReferences('run cc:cc-agents then cc:cc-skills', 'cc')).toBe(
            'run cc-cc-agents then cc-cc-skills',
        );
    });

    it('does NOT rewrite refs from a different plugin prefix', () => {
        // When installing the cc plugin, rd3: refs must survive (not our plugin)
        expect(rewriteSkillReferences('use rd3:dev-run to start', 'cc')).toBe('use rd3:dev-run to start');
    });

    // Refinement #1 — critical test: node:fs, bun:test, ts:* must survive
    it('preserves node:fs references (Refinement #1)', () => {
        const content = "import { readFileSync } from 'node:fs';";
        expect(rewriteSkillReferences(content, 'cc')).toBe(content);
    });

    it('preserves bun:test references (Refinement #1)', () => {
        const content = "import { describe, it } from 'bun:test';";
        expect(rewriteSkillReferences(content, 'cc')).toBe(content);
    });

    it('preserves ts:* references (Refinement #1)', () => {
        const content = 'import { echo } from "@gobing-ai/ts-utils";';
        expect(rewriteSkillReferences(content, 'cc')).toBe(content);
    });

    it('preserves placeholder plugin:command colons (Refinement #1)', () => {
        const content = 'Invoke via Skill(skill="plugin:command")';
        expect(rewriteSkillReferences(content, 'cc')).toBe(content);
    });

    it('returns content unchanged when pluginPrefix is empty', () => {
        expect(rewriteSkillReferences('use cc:foo', '')).toBe('use cc:foo');
    });

    it('returns empty string unchanged', () => {
        expect(rewriteSkillReferences('', 'cc')).toBe('');
    });

    it('matches case-insensitively', () => {
        expect(rewriteSkillReferences('CC:CC-AGENTS', 'cc')).toBe('CC-CC-AGENTS');
    });

    it('does not modify already-hyphenated refs', () => {
        expect(rewriteSkillReferences('use cc-cc-agents', 'cc')).toBe('use cc-cc-agents');
    });

    it('handles plugin prefixes with digits (e.g. rd3)', () => {
        expect(rewriteSkillReferences('run rd3:dev-run', 'rd3')).toBe('run rd3-dev-run');
    });

    it('rewrites in frontmatter fields AND body markdown (A3)', () => {
        const content = '---\nskills: [cc:cc-agents]\n---\n\nUse cc:cc-skills for scaffolding.';
        const result = rewriteSkillReferences(content, 'cc');
        expect(result).toContain('cc-cc-agents');
        expect(result).toContain('cc-cc-skills');
    });

    // R1 (task 0296): version-pinned protocol strings must survive the rewrite.
    it('preserves version-pinned sp:dogfood-testing@1.2 verbatim (R1)', () => {
        const content = 'protocol: sp:dogfood-testing@1.2';
        expect(rewriteSkillReferences(content, 'sp')).toBe(content);
    });

    it('still flattens sp:dogfood-testing without a version suffix in the same document (R1)', () => {
        const content = 'See sp:dogfood-testing for details.\nprotocol: sp:dogfood-testing@1.2';
        const result = rewriteSkillReferences(content, 'sp');
        expect(result).toContain('sp-dogfood-testing for details');
        expect(result).toContain('protocol: sp:dogfood-testing@1.2');
    });

    it('preserves a version-pinned sp:foo@1.0 token inside prose (R1)', () => {
        const content = 'The contract is sp:foo@1.0 compliant.';
        expect(rewriteSkillReferences(content, 'sp')).toBe(content);
    });
});
