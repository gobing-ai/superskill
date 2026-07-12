import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Structural invariants for the cc plugin (task 0070 R10):
 * - the README flow map lists every commands/*.md exactly once (AC7);
 * - the skill-engineering theory reference and glossary exist as single copies (AC1/AC8);
 * - the theory reference carries all six failure modes plus the two invocation loads (AC1);
 * - lifecycle skills reference cc:cc-skills by name, never by deep relative link (AC1).
 */

const PLUGIN_ROOT = join(import.meta.dir, '..');
const SKILLS_ROOT = join(PLUGIN_ROOT, 'skills');

function walkFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walkFiles(full));
        else out.push(full);
    }
    return out;
}

describe('cc plugin structure', () => {
    it('README flow map lists every commands/*.md exactly once', () => {
        const readme = readFileSync(join(PLUGIN_ROOT, 'README.md'), 'utf-8');
        const start = readme.indexOf('## Which Operation When');
        expect(start).toBeGreaterThan(-1);
        const rest = readme.slice(start);
        const end = rest.indexOf('\n## ', 1);
        const flowMap = end === -1 ? rest : rest.slice(0, end);

        const commandFiles = readdirSync(join(PLUGIN_ROOT, 'commands')).filter((f) => f.endsWith('.md'));
        expect(commandFiles.length).toBeGreaterThanOrEqual(17);

        for (const file of commandFiles) {
            const name = file.replace(/\.md$/, '');
            // The /cc: prefix keeps agent-* and magent-* tokens disjoint.
            const token = `/cc:${name}`;
            const count = flowMap.split(token).length - 1;
            expect(`${name}:${count}`).toBe(`${name}:1`);
        }
    });

    it('skill-engineering theory reference exists as a single copy', () => {
        const copies = walkFiles(SKILLS_ROOT).filter((f) => f.endsWith('skill-engineering-theory.md'));
        expect(copies).toHaveLength(1);
        expect(copies[0]).toContain(join('cc-skills', 'references'));
    });

    it('glossary exists as a single copy', () => {
        const copies = walkFiles(SKILLS_ROOT).filter((f) => f.endsWith('glossary.md'));
        expect(copies).toHaveLength(1);
        expect(copies[0]).toContain(join('cc-skills', 'references'));
    });

    it('theory reference names all six failure modes and both invocation loads', () => {
        const theory = readFileSync(
            join(SKILLS_ROOT, 'cc-skills', 'references', 'skill-engineering-theory.md'),
            'utf-8',
        ).toLowerCase();
        for (const term of [
            'sprawl',
            'sediment',
            'duplication',
            'no-op',
            'premature completion',
            'negation',
            'context load',
            'cognitive load',
        ]) {
            expect(theory).toContain(term);
        }
    });

    it('cc-skills SKILL.md links both the theory reference and the glossary', () => {
        const skill = readFileSync(join(SKILLS_ROOT, 'cc-skills', 'SKILL.md'), 'utf-8');
        expect(skill).toContain('references/skill-engineering-theory.md');
        expect(skill).toContain('references/glossary.md');
    });

    it('hooks.json declares the stdin/exit-2 guard contract floor (minCliVersion >= 0.2.19)', () => {
        // WHY (0077 R4): the Stop-hook runtime contract (stdin payload resolution + exit-2
        // block signal) shipped in CLI 0.2.19. Without a floor, an older CLI on PATH would
        // install hooks whose runtime contract it does not implement. The install-time gate
        // (hooksBlockedByCliVersion) only acts when this floor is declared.
        const hooks = JSON.parse(readFileSync(join(PLUGIN_ROOT, 'hooks', 'hooks.json'), 'utf-8'));
        const floor = String(hooks.minCliVersion ?? '');
        expect(floor).toMatch(/^\d+\.\d+\.\d+/);
        const [maj = 0, min = 0, pat = 0] = floor.split('.').map((n) => Number.parseInt(n, 10));
        expect(maj * 1_000_000 + min * 1_000 + pat).toBeGreaterThanOrEqual(2_019);
    });

    it('no lifecycle skill deep-links into cc-skills references (they name cc:cc-skills instead)', () => {
        const otherSkills = readdirSync(SKILLS_ROOT).filter((d) => d !== 'cc-skills');
        for (const dir of otherSkills) {
            const files = walkFiles(join(SKILLS_ROOT, dir)).filter((f) => f.endsWith('.md'));
            for (const file of files) {
                const content = readFileSync(file, 'utf-8');
                expect(content).not.toContain('cc-skills/references/');
            }
        }
    });
});
