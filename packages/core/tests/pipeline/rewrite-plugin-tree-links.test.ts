import { describe, expect, it } from 'bun:test';
import { rewritePluginTreeMarkdownLinks } from '../../src/pipeline/rewrite-plugin-tree-links';

describe('rewritePluginTreeMarkdownLinks', () => {
    describe('R1 — flattened dest rewrites plugin-tree markdown links', () => {
        it('rewrites ../skills/<name>/… → ../<plugin>-<name>/…', () => {
            const content = 'See [flag glossary](../skills/spur-dev/references/flag-glossary.md) for flags.';
            expect(rewritePluginTreeMarkdownLinks(content, 'sp')).toBe(
                'See [flag glossary](../sp-spur-dev/references/flag-glossary.md) for flags.',
            );
        });

        it('rewrites a bare path reference without markdown brackets', () => {
            expect(rewritePluginTreeMarkdownLinks('load ../skills/spur-dev/references/x.md', 'sp')).toBe(
                'load ../sp-spur-dev/references/x.md',
            );
        });

        it('rewrites plugins/<plugin>/skills/<name>/… → ../<plugin>-<name>/…', () => {
            const content = 'Root doc: [ref](plugins/sp/skills/spur-dev/references/flag-glossary.md).';
            expect(rewritePluginTreeMarkdownLinks(content, 'sp')).toBe(
                'Root doc: [ref](../sp-spur-dev/references/flag-glossary.md).',
            );
        });

        it('handles a path that ends at the skill name (no trailing file)', () => {
            expect(rewritePluginTreeMarkdownLinks('wrap: ../skills/spur-dev)', 'sp')).toBe('wrap: ../sp-spur-dev)');
        });

        it('rewrites multiple links on one line', () => {
            const content = 'see ../skills/a/x.md and ../skills/b/y.md';
            expect(rewritePluginTreeMarkdownLinks(content, 'sp')).toBe('see ../sp-a/x.md and ../sp-b/y.md');
        });

        it('rewrites across multiple lines', () => {
            const content = 'line1: ../skills/spur-dev/x.md\nline2: plugins/sp/skills/foo/y.md';
            const out = rewritePluginTreeMarkdownLinks(content, 'sp');
            expect(out).toContain('line1: ../sp-spur-dev/x.md');
            expect(out).toContain('line2: ../sp-foo/y.md');
        });

        it('only matches sibling skills/<name>, not arbitrary skills words', () => {
            expect(rewritePluginTreeMarkdownLinks('the skills directory is shared', 'sp')).toBe(
                'the skills directory is shared',
            );
        });
    });

    describe('R2 — preserves unrelated paths and tokens (native exemption is structural)', () => {
        it('preserves node:fs protocol colons', () => {
            const content = "import { readFileSync } from 'node:fs';";
            expect(rewritePluginTreeMarkdownLinks(content, 'cc')).toBe(content);
        });

        it('preserves bun:test protocol colons', () => {
            const content = "import { it } from 'bun:test';";
            expect(rewritePluginTreeMarkdownLinks(content, 'cc')).toBe(content);
        });

        it('preserves plugin:name colon refs (owned by rewriteSkillReferences)', () => {
            expect(rewritePluginTreeMarkdownLinks('invoke sp:dogfood-testing', 'sp')).toBe('invoke sp:dogfood-testing');
        });

        it('preserves already-dest ../<plugin>-<name>/… paths', () => {
            const content = 'See [ref](../sp-spur-dev/references/flag-glossary.md).';
            expect(rewritePluginTreeMarkdownLinks(content, 'sp')).toBe(content);
        });

        it('does NOT rewrite plugins/<other>/skills/… for a different plugin', () => {
            const content = 'See [ref](plugins/cc/skills/foo/references/x.md).';
            expect(rewritePluginTreeMarkdownLinks(content, 'sp')).toBe(content);
        });

        it('returns content unchanged when pluginName is empty', () => {
            expect(rewritePluginTreeMarkdownLinks('../skills/foo/x.md', '')).toBe('../skills/foo/x.md');
        });

        it('returns empty string unchanged', () => {
            expect(rewritePluginTreeMarkdownLinks('', 'cc')).toBe('');
        });
    });

    describe('edge cases', () => {
        it('escapes regex metacharacters in the plugin name', () => {
            // A plugin name with a `.` must not match any character.
            const content = 'See plugins/v2/skills/foo/x.md and plugins/vX/skills/foo/x.md';
            const out = rewritePluginTreeMarkdownLinks(content, 'v2');
            expect(out).toContain('../v2-foo/x.md');
            expect(out).not.toContain('../vX-foo/x.md');
        });

        it('preserves the tail token after the path (quote, hash, backtick)', () => {
            expect(rewritePluginTreeMarkdownLinks('ref "../skills/foo/x.md"', 'sp')).toBe('ref "../sp-foo/x.md"');
            expect(rewritePluginTreeMarkdownLinks('see ../skills/foo/x#anchor', 'sp')).toBe('see ../sp-foo/x#anchor');
        });
    });
});
