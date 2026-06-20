import { describe, expect, it } from 'bun:test';
import { normalizeFrontmatter } from '../../src/pipeline/frontmatter';

describe('normalizeFrontmatter', () => {
    it('injects a missing name field into existing frontmatter', () => {
        const input = `---
argument-hint: <task>
---

Run a task.`;

        expect(normalizeFrontmatter(input, 'rd3-run')).toBe(`---
name: rd3-run
argument-hint: <task>
---

Run a task.`);
    });

    it('does not duplicate an existing name field', () => {
        const input = `---
name: rd3-run
argument-hint: <task>
---

Run a task.`;

        expect(normalizeFrontmatter(input, 'other')).toBe(input);
    });

    it('creates frontmatter when content has none', () => {
        expect(normalizeFrontmatter('Run a task.', 'rd3-run')).toBe(`---
name: rd3-run
---

Run a task.`);
    });

    it('leaves malformed frontmatter unchanged', () => {
        const input = `---
argument-hint: <task>
Run a task.`;

        expect(normalizeFrontmatter(input, 'rd3-run')).toBe(input);
    });
});
