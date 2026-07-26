import { describe, expect, it } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * Structural invariants for the cc plugin (task 0070 R10):
 * - the README flow map lists every commands/*.md exactly once (AC7);
 * - the skill-engineering theory reference and glossary exist as single copies (AC1/AC8);
 * - the theory reference carries all six failure modes plus the two invocation loads (AC1);
 * - lifecycle skills reference cc:cc-skills by name, never by deep relative link (AC1).
 */

const PLUGIN_ROOT = join(import.meta.dir, '..');
const SKILLS_ROOT = join(PLUGIN_ROOT, 'skills');
const CLI_ENTRY = join(PLUGIN_ROOT, '..', '..', 'apps', 'cli', 'src', 'index.ts');

function walkFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walkFiles(full));
        else out.push(full);
    }
    return out;
}

interface MarkdownScan {
    unclosedFenceLine?: number;
    proseLines: Array<{ line: number; text: string }>;
}

function scanMarkdown(content: string): MarkdownScan {
    let open: { marker: string; length: number; line: number } | undefined;
    const proseLines: MarkdownScan['proseLines'] = [];
    for (const [index, line] of content.split('\n').entries()) {
        const match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
        if (match) {
            const run = match[1] ?? '';
            const marker = run[0] ?? '';
            const suffix = match[2] ?? '';
            if (!open) {
                open = { marker, length: run.length, line: index + 1 };
                continue;
            }
            if (marker === open.marker && run.length >= open.length && suffix.trim() === '') {
                open = undefined;
            }
            continue;
        }
        if (!open) proseLines.push({ line: index + 1, text: line });
    }
    return { unclosedFenceLine: open?.line, proseLines };
}

function findUnclosedFence(content: string): number | undefined {
    return scanMarkdown(content).unclosedFenceLine;
}

function requiredPositionalsFromHint(hint: string): string[] {
    const prefix = hint.match(/^(.*?)(?=\s+\[--|$)/)?.[1] ?? '';
    return prefix.match(/<[^>]+>/g) ?? [];
}

function requiredPositionalsFromHelp(help: string): string[] {
    const usage = help.match(/^Usage:[^\n]+$/m)?.[0] ?? '';
    return usage.match(/<[^>]+>/g) ?? [];
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

    it('hooks.json declares the stdin/decision-output guard contract floor (minCliVersion >= 0.2.19)', () => {
        // WHY (0077 R4): the Stop-hook runtime contract (stdin payload resolution + canonical
        // decision output) shipped in CLI 0.2.19. Without a floor, an older CLI on PATH would
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

    it('keeps every plugin Markdown code fence balanced', () => {
        const files = walkFiles(PLUGIN_ROOT).filter((file) => file.endsWith('.md'));
        for (const file of files) {
            const unclosedAt = findUnclosedFence(readFileSync(file, 'utf-8'));
            expect(`${file}:unclosed-at:${unclosedAt ?? 'none'}`).toBe(`${file}:unclosed-at:none`);
        }
    });

    it('matches fence marker and minimum length instead of accepting an even fence count', () => {
        expect(findUnclosedFence('```ts\ncontent\n~~~~')).toBe(1);
        expect(findUnclosedFence('````md\n```ts\n```\n````')).toBeUndefined();
    });

    it('keeps live relative Markdown links resolvable', () => {
        const files = walkFiles(PLUGIN_ROOT).filter((file) => file.endsWith('.md'));
        for (const file of files) {
            for (const { line: lineNumber, text } of scanMarkdown(readFileSync(file, 'utf-8')).proseLines) {
                for (const match of text.matchAll(/\[[^\]]*]\(([^)]+)\)/g)) {
                    const destination = match[1]?.trim() ?? '';
                    if (
                        destination === '' ||
                        destination.startsWith('#') ||
                        destination.startsWith('/') ||
                        /^[a-z][a-z+.-]*:/i.test(destination) ||
                        /[<>]/.test(destination)
                    ) {
                        continue;
                    }
                    const path = destination.split('#', 1)[0];
                    expect(`${file}:${lineNumber}:${destination}:${existsSync(resolve(dirname(file), path))}`).toBe(
                        `${file}:${lineNumber}:${destination}:true`,
                    );
                }
            }
        }
    });

    it('keeps lifecycle wrapper argument hints aligned with Commander', () => {
        const wrappers = readdirSync(join(PLUGIN_ROOT, 'commands')).filter((file) =>
            /^(agent|command|hook|magent|skill)-(add|evaluate|refine|evolve)\.md$/.test(file),
        );

        for (const file of wrappers) {
            const [, family = '', wrapperVerb = ''] =
                file.match(/^(agent|command|hook|magent|skill)-(add|evaluate|refine|evolve)\.md$/) ?? [];
            const verb = wrapperVerb === 'add' ? 'scaffold' : wrapperVerb;
            const helpResult = Bun.spawnSync(['bun', CLI_ENTRY, family, verb, '--help'], {
                stdout: 'pipe',
                stderr: 'pipe',
            });
            expect(`${file}:help-exit:${helpResult.exitCode}`).toBe(`${file}:help-exit:0`);
            const help = helpResult.stdout.toString();

            const content = readFileSync(join(PLUGIN_ROOT, 'commands', file), 'utf-8');
            const hint = content.match(/^argument-hint:\s*["'](.+)["']\s*$/m)?.[1] ?? '';
            const documented = [...new Set(hint.match(/--[a-z][a-z-]*/g) ?? [])].sort();
            const argumentsSection = content.match(/## Arguments\n([\s\S]*?)(?=\n## )/)?.[1] ?? '';
            const tableOptions = [...new Set(argumentsSection.match(/--[a-z][a-z-]*/g) ?? [])].sort();
            const tablePositionals = [...argumentsSection.matchAll(/^\|\s*`(<[^>]+>)`\s*\|/gm)].map(
                (match) => match[1] ?? '',
            );
            const registered = [...new Set(help.match(/--[a-z][a-z-]*/g) ?? [])]
                .filter((option) => option !== '--help')
                .sort();
            const registeredPositionals = requiredPositionalsFromHelp(help);

            expect(`${file}:${documented.join(',')}`).toBe(`${file}:${registered.join(',')}`);
            expect(`${file}:table:${tableOptions.join(',')}`).toBe(`${file}:table:${registered.join(',')}`);
            expect(`${file}:hint-positionals:${requiredPositionalsFromHint(hint).join(',')}`).toBe(
                `${file}:hint-positionals:${registeredPositionals.join(',')}`,
            );
            expect(`${file}:table-positionals:${tablePositionals.join(',')}`).toBe(
                `${file}:table-positionals:${registeredPositionals.join(',')}`,
            );
        }
    });

    it('keeps anti-hallucination Stop documentation on the exit-zero JSON decision contract', () => {
        const guide = readFileSync(
            join(SKILLS_ROOT, 'anti-hallucination', 'references', 'guard-implementation.md'),
            'utf-8',
        );
        expect(guide).toContain('decision:"block"');
        expect(guide).toContain('| 0 | Always.');
        expect(guide).not.toMatch(/\|\s*[12]\s*\|\s*Deny stop/i);
    });

    it('contains no obsolete tasks update or cc:tasks lifecycle instructions', () => {
        for (const file of walkFiles(PLUGIN_ROOT).filter((entry) => entry.endsWith('.md'))) {
            const content = readFileSync(file, 'utf-8');
            expect(`${file}:tasks-update:${/\btasks\s+update\b/.test(content)}`).toBe(`${file}:tasks-update:false`);
            expect(`${file}:cc-tasks:${/\bcc:tasks\b/.test(content)}`).toBe(`${file}:cc-tasks:false`);
        }
    });
});
