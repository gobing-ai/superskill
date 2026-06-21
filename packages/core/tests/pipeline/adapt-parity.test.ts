import { describe, expect, it } from 'bun:test';
import { normalizeFrontmatter } from '../../src/pipeline/frontmatter';
import { convertToPiSubagent } from '../../src/pipeline/pi-subagent';
import { rewriteSkillReferences } from '../../src/pipeline/rewrite-references';
import { translateSlashCommands } from '../../src/pipeline/slash-command';
import type { Target } from '../../src/targets';

/**
 * Adapt parity test — confirms the install conversion pipeline covers all
 * transforms the deleted `adapt.ts` + `adapters/` performed (task 0039 / F032).
 *
 * The deleted adapters (cc-{agents,commands,skills}/scripts/adapt.ts) were
 * removed in Phase 3 §2.1 with disposition "fold into superskill install
 * conversion pipeline." This test asserts that the 4 pipeline stages —
 * rewriteSkillReferences (scoped), translateSlashCommands, normalizeFrontmatter,
 * convertToPiSubagent — fully cover the deleted-adapter behavior.
 *
 * Wiring (commands/install.ts transformMarkdownDirectory):
 * - skills:    translateSlashCommands → rewriteSkillReferences(content, plugin)
 * - commands:  normalizeFrontmatter → translateSlashCommands → rewriteSkillReferences (via mapper + per-target pass)
 * - subagents: normalizeFrontmatter → rewriteSkillReferences → convertToPiSubagent (pi/omp only)
 *
 * Reference rewriting is now plugin-scoped (task 0045 R4): rewriteSkillReferences
 * only rewrites `<plugin>:<name>` for the plugin currently being installed,
 * so `node:fs`, `bun:test`, and other-plugin refs survive untouched. The legacy
 * hardcoded `/(rd3|wt):/` rewriter was deleted.
 */

/** The plugin prefix these parity tests install under. */
const PLUGIN = 'rd3';

/** Simulate the install pipeline wiring for a command file. */
function applyCommandPipeline(content: string, name: string, target: Target): string {
    let result = normalizeFrontmatter(content, name);
    result = translateSlashCommands(result, target);
    result = rewriteSkillReferences(result, PLUGIN);
    return result;
}

/** Simulate the install pipeline wiring for a subagent file (pi/omp). */
function applySubagentPipeline(content: string, name: string, target: Target): string {
    let result = normalizeFrontmatter(content, name);
    result = rewriteSkillReferences(result, PLUGIN);
    if (target === 'pi' || target === 'omp') {
        result = convertToPiSubagent(result);
    }
    return result;
}

/** Simulate the install pipeline wiring for a skill file. */
function applySkillPipeline(content: string): string {
    return rewriteSkillReferences(content, PLUGIN);
}

describe('adapt parity — deleted adapter transforms covered by pipeline', () => {
    describe('colon reference rewriting (all targets, all content types)', () => {
        it('rewrites rd3: colon refs to hyphenated form, preserves other-plugin refs (scoped)', () => {
            const skill = 'Use rd3:dev-run and wt:publish-to-x for distribution.';
            // Plugin is 'rd3' (PLUGIN const) — rd3: rewritten, wt: preserved (scoped, not allowlist)
            expect(applySkillPipeline(skill)).toBe('Use rd3-dev-run and wt:publish-to-x for distribution.');
        });

        it('rewrites colon refs in commands after name injection and slash translation', () => {
            const cmd = `---
description: Run rd3:dev-run
---

/rd3:dev-run`;
            const result = applyCommandPipeline(cmd, 'runner', 'codex');
            expect(result).toContain('rd3-dev-run');
            expect(result).not.toContain('rd3:dev-run');
        });
    });

    describe('slash command dialect translation (commands)', () => {
        it('translates /rd3:cmd to codex dialect ($rd3-cmd)', () => {
            const cmd = `---
description: Run a task.
---

/rd3:dev-run docs/tasks/0001.md`;
            const result = applyCommandPipeline(cmd, 'runner', 'codex');
            expect(result).toContain('$rd3-dev-run');
        });

        it('translates /rd3:cmd to pi dialect (/skill:rd3-cmd)', () => {
            const cmd = `---
description: Run a task.
---

/rd3:dev-run 0001`;
            const result = applyCommandPipeline(cmd, 'runner', 'pi');
            expect(result).toContain('/skill:rd3-dev-run');
        });

        it('translates /rd3:cmd to omp (omp speaks pi slash dialect)', () => {
            const cmd = `---
description: Run a task.
---

/rd3:dev-run 0001`;
            const result = applyCommandPipeline(cmd, 'runner', 'omp');
            expect(result).toContain('/skill:rd3-dev-run');
        });

        it('uses default slash dialect for antigravity/hermes', () => {
            const cmd = `---
description: Run a task.
---

/rd3:dev-run 0001`;
            const result = applyCommandPipeline(cmd, 'runner', 'hermes');
            expect(result).toContain('/rd3-dev-run');
        });
    });

    describe('frontmatter name injection (commands, subagents)', () => {
        it('injects missing name into command frontmatter', () => {
            const cmd = `---
description: A command.
---

Run the thing.`;
            const result = applyCommandPipeline(cmd, 'my-cmd', 'codex');
            expect(result).toContain('name: my-cmd');
        });

        it('preserves existing name in command frontmatter', () => {
            const cmd = `---
name: existing-name
description: A command.
---

Run the thing.`;
            const result = applyCommandPipeline(cmd, 'my-cmd', 'codex');
            expect(result).toContain('name: existing-name');
            expect(result).not.toContain('name: my-cmd');
        });

        it('injects missing name into subagent frontmatter', () => {
            const subagent = `---
description: A subagent.
---

You are a helper.`;
            const result = applySubagentPipeline(subagent, 'helper', 'codex');
            expect(result).toContain('name: helper');
        });
    });

    describe('Pi subagent conversion (pi/omp subagents only)', () => {
        it('converts a Skills 2.0 subagent to Pi native agent YAML for pi target', () => {
            const subagent = `---
name: researcher
description: Research specialist.
tools: [Read, WebSearch]
---

You are a research specialist.`;
            const result = applySubagentPipeline(subagent, 'researcher', 'pi');
            // Pi subagent format uses YAML with different structure
            expect(result).toContain('read');
            expect(result).toContain('web_search');
        });

        it('converts a Skills 2.0 subagent to Pi native agent YAML for omp target', () => {
            const subagent = `---
name: researcher
description: Research specialist.
tools: [Read]
---

You are a research specialist.`;
            const result = applySubagentPipeline(subagent, 'researcher', 'omp');
            expect(result).toContain('read');
        });

        it('does NOT convert to Pi format for non-pi targets', () => {
            const subagent = `---
name: researcher
description: Research specialist.
---

You are a research specialist.`;
            const result = applySubagentPipeline(subagent, 'researcher', 'codex');
            // Should remain markdown, not Pi YAML
            expect(result).toContain('---');
            expect(result).toContain('You are a research specialist.');
        });
    });

    describe('full pipeline ordering — all transforms applied in sequence', () => {
        it('applies name injection → slash translation → colon rewrite for commands', () => {
            const cmd = `---
description: Run rd3:dev-run
---

/rd3:dev-run docs/tasks/0001.md
See wt:publish-to-x for publishing.`;
            const result = applyCommandPipeline(cmd, 'runner', 'codex');

            // Name injected
            expect(result).toContain('name: runner');
            // Slash translated (codex dialect)
            expect(result).toContain('$rd3-dev-run');
            // Colon refs rewritten in prose (scoped to PLUGIN='rd3')
            expect(result).toContain('rd3-dev-run');
            // wt: refs are NOT rewritten when installing rd3 plugin (scoped behavior, task 0045 R4)
            expect(result).toContain('wt:publish-to-x');
            // rd3: colon refs do not remain
            expect(result).not.toContain('rd3:dev-run');
        });

        it('applies name injection → colon rewrite → Pi conversion for pi subagents', () => {
            const subagent = `---
description: Uses rd3:dev-run
tools: [Read]
---

You are a helper. Use rd3:dev-run.`;
            const result = applySubagentPipeline(subagent, 'helper', 'pi');

            // Pi format (YAML, not markdown frontmatter)
            expect(result).toContain('read');
            // Colon refs rewritten
            expect(result).not.toMatch(/rd3:dev-run/);
        });
        it('all 4 pipeline stages exist and are pure functions', () => {
            // This test documents the parity: the 4 stages cover all deleted adapter transforms.
            // If any stage is removed, this test fails — surfacing the gap.
            expect(typeof rewriteSkillReferences).toBe('function');
            expect(typeof translateSlashCommands).toBe('function');
            expect(typeof normalizeFrontmatter).toBe('function');
            expect(typeof convertToPiSubagent).toBe('function');

            // Pure: same input → same output, no side effects
            const input = 'Use rd3:dev-run';
            expect(rewriteSkillReferences(input, PLUGIN)).toBe(rewriteSkillReferences(input, PLUGIN));
            expect(normalizeFrontmatter(input, 'test')).toBe(normalizeFrontmatter(input, 'test'));
        });
    });

    describe('new Skills 2.0 architecture — mapper-level adaptation (task 0044)', () => {
        it('adaptCommandToSkill, adaptSubagentToSkill, rewriteSkillReferences are pure functions', async () => {
            const { adaptCommandToSkill } = await import('../../src/pipeline/adapt-command');
            const { adaptSubagentToSkill } = await import('../../src/pipeline/adapt-subagent');
            const { rewriteSkillReferences } = await import('../../src/pipeline/rewrite-references');

            expect(typeof adaptCommandToSkill).toBe('function');
            expect(typeof adaptSubagentToSkill).toBe('function');
            expect(typeof rewriteSkillReferences).toBe('function');

            // Pure: same input → same output
            const cmd = '---\nargument-hint: <task>\n---\nUse cc:cc-skills';
            expect(adaptCommandToSkill(cmd, 'cc-test', 'cc')).toBe(adaptCommandToSkill(cmd, 'cc-test', 'cc'));
            expect(rewriteSkillReferences('cc:foo', 'cc')).toBe(rewriteSkillReferences('cc:foo', 'cc'));
        });

        it('rewriteSkillReferences is plugin-scoped (not hardcoded allowlist)', async () => {
            const { rewriteSkillReferences } = await import('../../src/pipeline/rewrite-references');
            // cc: refs rewritten when installing cc plugin
            expect(rewriteSkillReferences('cc:cc-agents', 'cc')).toBe('cc-cc-agents');
            // rd3: refs NOT rewritten when installing cc plugin (scoped, not allowlist)
            expect(rewriteSkillReferences('rd3:dev-run', 'cc')).toBe('rd3:dev-run');
            // node:fs preserved (Refinement #1)
            expect(rewriteSkillReferences("import 'node:fs'", 'cc')).toBe("import 'node:fs'");
        });
    });
});
