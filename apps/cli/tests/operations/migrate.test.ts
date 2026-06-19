import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chdir, cwd } from 'node:process';
import { createDbAdapter, type DbAdapter } from '@gobing-ai/ts-db';
import type { ProposedChange } from '../../src/operations/evolve';
import { migrateSkills } from '../../src/operations/migrate';
import { EvaluationDao } from '../../src/store/evaluations';
import { evaluations, proposals } from '../../src/store/schema';

/** Fixture: a skill with clear, complete content. */
const SKILL_A = `---
name: skill-a
description: A skill for managing alpha widgets with clear lifecycle steps.
version: 1.0.0
tags:
  - alpha
  - widgets
type: technique
---

## When to Use

Trigger when the user asks to manage alpha widgets.

## Steps

1. Identify the alpha widget.
2. Configure the widget settings.
3. Validate the configuration.
`;

/** Fixture: a second skill with overlapping and distinct content. */
const SKILL_B = `---
name: skill-b
description: A skill for managing beta widgets with validation and reporting.
version: 1.0.0
tags:
  - beta
  - widgets
  - reporting
type: technique
license: MIT
---

## When to Use

Trigger when the user asks to manage beta widgets.

## Steps

1. Identify the beta widget.
2. Configure the widget settings.
3. Validate the configuration.
4. Generate a report.

## Reporting

Use the built-in reporter for output.
`;

/** Fixture: a skill with a DON'T rule (for negative-constraint extraction in refine path). */
const SKILL_WITH_CONSTRAINTS = `---
name: constrained-skill
description: |
  A focused skill for widget management.
  DON'T use this skill for non-widget tasks.
  NEVER modify widget config without approval.
version: 1.0.0
type: technique
---

## When to Use

Trigger when the user asks to manage widgets.
`;

describe('migrateSkills — deterministic merge core', () => {
    let dir: string;
    let prevCwd: string;

    beforeEach(() => {
        prevCwd = cwd();
        dir = mkdtempSync(join(tmpdir(), 'superskill-migrate-'));
        mkdirSync(join(dir, 'skills'), { recursive: true });
        writeFileSync(join(dir, 'skills', 'skill-a.md'), SKILL_A);
        writeFileSync(join(dir, 'skills', 'skill-b.md'), SKILL_B);
        chdir(dir);
        spyOn(process.stderr, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
        chdir(prevCwd);
        rmSync(dir, { recursive: true, force: true });
    });

    it('merges two sources into a destination file (exit 0 equivalent)', async () => {
        const dest = join(dir, 'merged.md');

        const result = await migrateSkills(['skill-a', 'skill-b'], dest);

        expect(result.dest).toBe(dest);
        expect(result.envelopeOut).toBe(false);
        expect(existsSync(dest)).toBe(true);

        const content = readFileSync(dest, 'utf-8');
        expect(content.startsWith('---\n')).toBe(true);

        // Frontmatter: name is dest-derived
        const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
        expect(fmMatch).not.toBeNull();
        const fm = fmMatch?.[1] ?? '';
        expect(fm).toContain('name: merged');
        // Array union: tags from both sources, deduped
        expect(fm).toContain('alpha');
        expect(fm).toContain('beta');
        expect(fm).toContain('widgets');
        expect(fm).toContain('reporting');
        // Scalar conflict: first source wins (version, type from skill-a)
        expect(fm).toContain('version: 1.0.0');
        expect(fm).toContain('type: technique');
        // Non-conflicting keys appear (license from skill-b)
        expect(fm).toContain('license: MIT');

        // Body: both sources' content present
        expect(content).toContain('alpha widgets');
        expect(content).toContain('beta widgets');
        expect(content).toContain('Generate a report.');
    });

    it('frontmatter conflict policy: first source wins for scalars, union for arrays', async () => {
        const dest = join(dir, 'merged.md');

        await migrateSkills(['skill-a', 'skill-b'], dest);

        const content = readFileSync(dest, 'utf-8');
        // description: first source (skill-a) wins — skill-b's description is NOT the description
        expect(content).toContain('A skill for managing alpha widgets with clear lifecycle steps.');
        // The skill-b description appears in the body (concatenated), not as the frontmatter description
        const fmSection = content.split('---')[1] ?? '';
        expect(fmSection).toContain('alpha widgets');
        expect(fmSection).not.toContain('beta widgets');
    });

    it('body dedupe: identical lines collapsed to first occurrence', async () => {
        const dest = join(dir, 'merged.md');

        await migrateSkills(['skill-a', 'skill-b'], dest);

        const content = readFileSync(dest, 'utf-8');
        const body = content.split('---\n')[2] ?? '';

        // These lines appear in both skills — should appear only once
        const configureCount = (body.match(/Configure the widget settings\./g) || []).length;
        expect(configureCount).toBe(1);
        const validateCount = (body.match(/Validate the configuration\./g) || []).length;
        expect(validateCount).toBe(1);
        // "## Steps" appears in both — deduped to one
        const stepsHeaderCount = (body.match(/## Steps/g) || []).length;
        expect(stepsHeaderCount).toBe(1);
    });

    it('throws ENOENT for missing source (exit 2)', () => {
        const dest = join(dir, 'out.md');
        expect(migrateSkills(['does-not-exist', 'skill-b'], dest)).rejects.toThrow('Skill not found: does-not-exist');
    });

    it('single source copies to destination', async () => {
        const dest = join(dir, 'copy.md');

        const result = await migrateSkills(['skill-a'], dest);

        expect(result.dest).toBe(dest);
        expect(existsSync(dest)).toBe(true);

        const content = readFileSync(dest, 'utf-8');
        // Name is dest-derived
        expect(content).toContain('name: copy');
        // Body content preserved
        expect(content).toContain('alpha widgets');
    });

    it('is deterministic — no model calls in the execution path', async () => {
        const dest = join(dir, 'merged.md');

        const result1 = await migrateSkills(['skill-a', 'skill-b'], dest);
        const content1 = readFileSync(dest, 'utf-8');

        const dest2 = join(dir, 'merged2.md');
        const result2 = await migrateSkills(['skill-a', 'skill-b'], dest2);
        const content2 = readFileSync(dest2, 'utf-8');

        // Both results are deterministic merges (names differ by dest)
        expect(result1.envelopeOut).toBe(false);
        expect(result2.envelopeOut).toBe(false);
        // Bodies are identical (only the name field differs)
        const body1 = content1.split('---\n')[2] ?? '';
        const body2 = content2.split('---\n')[2] ?? '';
        expect(body1).toBe(body2);
    });

    it('throws on empty sources array', () => {
        const dest = join(dir, 'out.md');
        expect(migrateSkills([], dest)).rejects.toThrow('at least one source');
    });
});

describe('migrateSkills — refine path (F023 generation seam)', () => {
    let dir: string;
    let prevCwd: string;
    let adapter: DbAdapter;

    async function makeAdapter(): Promise<DbAdapter> {
        const a = await createDbAdapter({ driver: 'bun-sqlite', url: ':memory:' });
        await a.exec(evaluations.createTableSql);
        await a.exec(proposals.createTableSql);
        return a;
    }

    async function seedHistory(a: DbAdapter, contentName: string): Promise<void> {
        const dao = new EvaluationDao(a);
        for (let i = 0; i < 3; i++) {
            const id = await dao.insertEvaluation({
                content_type: 'skill',
                content_name: contentName,
                target_agent: 'claude',
                operation: 'evaluate',
                aggregate: 0.6 + i * 0.05,
                dimensions: { clarity: { score: 0.6 + i * 0.05, note: 'declining' } },
                file_hash: 'abc',
            });
            await a.exec(`UPDATE evaluations SET created_at = ${Date.UTC(2026, 5, 1, 0, 0, i)} WHERE id = ${id}`);
        }
    }

    beforeEach(async () => {
        prevCwd = cwd();
        dir = mkdtempSync(join(tmpdir(), 'superskill-migrate-refine-'));
        mkdirSync(join(dir, 'skills'), { recursive: true });
        mkdirSync(join(dir, '.superskill'), { recursive: true });
        writeFileSync(join(dir, 'skills', 'constrained-a.md'), SKILL_WITH_CONSTRAINTS);
        writeFileSync(join(dir, 'skills', 'constrained-b.md'), SKILL_B);
        chdir(dir);
        adapter = await makeAdapter();
        spyOn(process.stderr, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
        chdir(prevCwd);
        rmSync(dir, { recursive: true, force: true });
    });

    it('--refine (envelope-out): emits generation briefs as JSON to stdout', async () => {
        await seedHistory(adapter, 'merged');

        const dest = join(dir, 'merged.md');
        const stdoutCalls: string[] = [];
        const origWrite = process.stdout.write;
        process.stdout.write = ((chunk: string) => {
            stdoutCalls.push(chunk);
            return true;
        }) as typeof process.stdout.write;

        try {
            const result = await migrateSkills(['constrained-a', 'constrained-b'], dest, { refine: true, adapter });
            expect(result.envelopeOut).toBe(true);
        } finally {
            process.stdout.write = origWrite;
        }

        const output = stdoutCalls.join('');
        const envelope = JSON.parse(output);
        expect(envelope.type).toBe('skill');
        expect(envelope.content_name).toBe('merged');
        expect(Array.isArray(envelope.briefs)).toBe(true);
        expect(envelope.briefs.length).toBeGreaterThan(0);
        // Goal anchor: frontmatter emitted verbatim
        const brief = envelope.briefs[0];
        expect(brief.anchor).toBeDefined();
        expect(brief.anchor.frontmatter).toBeDefined();
    });

    it('--refine --ingest: regressive proposal is rejected and file restored (no model call)', async () => {
        await seedHistory(adapter, 'merged');

        const dest = join(dir, 'merged.md');

        // First: deterministic merge (writes the baseline file)
        const mergeResult = await migrateSkills(['constrained-a', 'constrained-b'], dest, { adapter });
        expect(mergeResult.envelopeOut).toBe(false);

        // Capture the merged content for restoration assertion
        const mergedContent = readFileSync(dest, 'utf-8');

        // A regressive proposal: prepend 'noise' to the description (lowers clarity score)
        const regressiveProposal = {
            proposal_id: 'skill-migrate-regressive-001',
            changes: [
                {
                    dimension: 'clarity',
                    location: 'frontmatter.description',
                    current: 'x',
                    proposed: 'noise',
                    reason: 'regressive change',
                },
            ] satisfies ProposedChange[],
        };
        const proposalPath = join(dir, 'proposal.json');
        writeFileSync(proposalPath, JSON.stringify(regressiveProposal, null, 2));

        // Suppress stdout (evolve prints messages)
        const stdoutSpy = spyOn(process.stdout, 'write').mockImplementation(() => true);

        const result = await migrateSkills(['constrained-a', 'constrained-b'], dest, {
            refine: true,
            ingest: proposalPath,
            adapter,
        });

        stdoutSpy.mockRestore();

        // The double-loop gate rejected the regressive proposal
        expect(result.rejected).toBe(true);
        expect(result.rejectionReason).toMatch(/Δ-margin gate failed/);

        // File restored byte-identical to the deterministic merge
        expect(readFileSync(dest, 'utf-8')).toBe(mergedContent);
    });
});
