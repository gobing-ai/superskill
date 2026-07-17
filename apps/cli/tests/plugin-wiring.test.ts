import { describe, expect, it } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const PLUGIN_ROOT = join(import.meta.dir, '../../../plugins/cc');

/**
 * Task 0032 — Plugin-side wiring assertions.
 *
 * Verifies the cc plugin is wired to drive the Phase 4 seams via four
 * agent personas (Scorer, Author, Skeptic, Judge), that deterministic-only
 * framing is removed, that the goal anchor is passed verbatim, and that
 * `validate` is hidden (P4-D3).
 */
describe('task 0032 — cc personas wiring and hide validate', () => {
    const SKILLS_DIR = join(PLUGIN_ROOT, 'skills');
    const COMMANDS_DIR = join(PLUGIN_ROOT, 'commands');
    const AGENTS_DIR = join(PLUGIN_ROOT, 'agents');

    const SKILL_TYPES = ['cc-agents', 'cc-commands', 'cc-hooks', 'cc-magents', 'cc-skills'];
    const EXPERT_AGENTS = [
        'expert-agent.md',
        'expert-command.md',
        'expert-hook.md',
        'expert-magent.md',
        'expert-skill.md',
    ];

    // R5 — hook-validate.md deleted
    it('deletes hook-validate.md (P4-D3)', () => {
        const path = join(COMMANDS_DIR, 'hook-validate.md');
        expect(existsSync(path)).toBe(false);
    });

    // R7 — command surface = 16
    // R7 — command surface = 17 (added hook-evaluate in task 0051)
    it('has exactly 17 slash commands', () => {
        const commands = readdirSync(COMMANDS_DIR).filter((f) => f.endsWith('.md'));
        expect(commands.length).toBe(17);
    });

    // R5/R6 — no *-validate slash command for any type
    it('has no *-validate slash command', () => {
        const commands = readdirSync(COMMANDS_DIR).filter((f) => f.endsWith('.md'));
        const validateCommands = commands.filter((f) => f.includes('validate'));
        expect(validateCommands).toEqual([]);
    });

    // R1 — SKILL.md drives the two-call seam: evaluate --rubric --json
    describe.each(SKILL_TYPES)('%s SKILL.md drives the scorer seam', (type) => {
        const skillFile = join(SKILLS_DIR, type, 'SKILL.md');

        it('contains evaluate --rubric --json (envelope-out)', () => {
            expect(existsSync(skillFile)).toBe(true);
            const content = readFileSync(skillFile, 'utf-8');
            expect(content).toMatch(/evaluate.*--rubric.*--json/s);
        });

        it('contains evaluate --ingest (ingest-in)', () => {
            const content = readFileSync(skillFile, 'utf-8');
            expect(content).toMatch(/evaluate.*--ingest/s);
        });
    });

    // R1 — SKILL.md drives the two-call seam: evolve --propose-only --json
    describe.each(SKILL_TYPES)('%s SKILL.md drives the generation seam', (type) => {
        const skillFile = join(SKILLS_DIR, type, 'SKILL.md');

        it('contains evolve --propose-only --json (envelope-out)', () => {
            const content = readFileSync(skillFile, 'utf-8');
            expect(content).toMatch(/evolve.*--propose-only.*--json/s);
        });

        it('contains evolve --ingest (ingest-in)', () => {
            const content = readFileSync(skillFile, 'utf-8');
            expect(content).toMatch(/evolve.*--ingest/s);
        });
    });

    // R2 — Four personas defined in expert agents
    describe.each(EXPERT_AGENTS)('%s defines four personas', (agentFile) => {
        const agentPath = join(AGENTS_DIR, agentFile);

        it('exists', () => {
            expect(existsSync(agentPath)).toBe(true);
        });

        it('mentions Scorer', () => {
            const content = readFileSync(agentPath, 'utf-8').toLowerCase();
            expect(content).toContain('scorer');
        });

        it('mentions Author', () => {
            const content = readFileSync(agentPath, 'utf-8').toLowerCase();
            expect(content).toContain('author');
        });

        it('mentions Skeptic', () => {
            const content = readFileSync(agentPath, 'utf-8').toLowerCase();
            expect(content).toContain('skeptic');
        });

        it('mentions Judge', () => {
            const content = readFileSync(agentPath, 'utf-8').toLowerCase();
            expect(content).toContain('judge');
        });
    });

    // R4 — Goal-anchor verbatim discipline in SKILL.md + agents
    describe('goal-anchor verbatim discipline', () => {
        it.each(SKILL_TYPES)('%s SKILL.md mentions verbatim anchor discipline', (type) => {
            const content = readFileSync(join(SKILLS_DIR, type, 'SKILL.md'), 'utf-8').toLowerCase();
            const hasVerbatimDiscipline =
                content.includes('verbatim') ||
                content.includes('do not summari') ||
                (content.includes('immutable') && content.includes('anchor'));
            expect(hasVerbatimDiscipline).toBe(true);
        });

        it.each(EXPERT_AGENTS)('%s mentions verbatim anchor discipline', (agentFile) => {
            const content = readFileSync(join(AGENTS_DIR, agentFile), 'utf-8').toLowerCase();
            const hasVerbatimDiscipline =
                content.includes('verbatim') ||
                content.includes('do not summari') ||
                (content.includes('immutable') && content.includes('anchor'));
            expect(hasVerbatimDiscipline).toBe(true);
        });
    });

    // R8 — No invented CLI verbs. The 5 type commands (agent/skill/command/hook/magent)
    // are the only CLI verbs; SKILL.md files must not reference new top-level verbs.
    it('does not invent new CLI verbs in SKILL.md files', () => {
        const VALID_VERBS = ['agent', 'skill', 'command', 'hook', 'magent', 'install', 'superskill'];
        for (const type of SKILL_TYPES) {
            const content = readFileSync(join(SKILLS_DIR, type, 'SKILL.md'), 'utf-8');
            // Same-line only: `[ \t]+` (not `\s+`) so YAML frontmatter like
            // `author: superskill\n  version: "3.0.0"` is not a false-positive CLI verb.
            const verbMatches = content.matchAll(/superskill[ \t]+([a-z][a-z-]*)/g);
            for (const m of verbMatches) {
                const verb = m[1];
                if (verb && !VALID_VERBS.includes(verb)) {
                    throw new Error(`Invented CLI verb "${verb}" in ${type}/SKILL.md`);
                }
            }
        }
    });
});
