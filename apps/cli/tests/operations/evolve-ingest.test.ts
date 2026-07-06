import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chdir, cwd } from 'node:process';
import { createDbAdapter, type DbAdapter } from '@gobing-ai/ts-db';
import type { ProposedChange } from '../../src/operations/evolve';
import { evolve } from '../../src/operations/evolve';
import { EvaluationDao } from '../../src/store/evaluations';
import { ProposalDao } from '../../src/store/proposals';
import { evaluations, proposals } from '../../src/store/schema';

/** Skill content with a DON'T rule for negative-constraint extraction. */
const SKILL_WITH_CONSTRAINTS = `---
name: widget
description: |
  A widget skill that does widget things.
  DON'T use this skill for non-widget tasks.
  NEVER modify the widget configuration without user approval.
---

## When to Use
Trigger when the user asks to manage widgets.
`;

/** A well-formed authored proposal with real proposed text (no placeholder). */
const AUTHORED_PROPOSAL = {
    proposal_id: 'skill-evolve-test-001',
    changes: [
        {
            dimension: 'clarity',
            location: 'frontmatter.description',
            current: 'clarity score: 0.60',
            proposed:
                'A focused widget skill for creating, validating, and managing widgets with clear lifecycle steps.',
            reason: 'Score: 0.60 (trend: declining). Description is vague.',
        },
    ] satisfies ProposedChange[],
};

describe('generation seam — envelope-out (F023)', () => {
    let dir: string;
    let prevCwd: string;
    let adapter: DbAdapter;

    async function makeAdapter(): Promise<DbAdapter> {
        const a = await createDbAdapter({ driver: 'bun-sqlite', url: ':memory:' });
        await a.exec(evaluations.createTableSql);
        await a.exec(proposals.createTableSql);
        return a;
    }

    async function seedHistory(a: DbAdapter): Promise<void> {
        const dao = new EvaluationDao(a);
        for (let i = 0; i < 3; i++) {
            const id = await dao.insertEvaluation({
                content_type: 'skill',
                content_name: 'widget',
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
        dir = mkdtempSync(join(tmpdir(), 'superskill-gen-seam-'));
        mkdirSync(join(dir, '.superskill'), { recursive: true });
        writeFileSync(join(dir, 'widget.md'), SKILL_WITH_CONSTRAINTS);
        chdir(dir);
        adapter = await makeAdapter();
        spyOn(process.stderr, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
        chdir(prevCwd);
        rmSync(dir, { recursive: true, force: true });
    });

    it('emits briefs with verbatim goal anchor via stdout (--propose-only --json)', async () => {
        await seedHistory(adapter);

        const stdoutCalls: string[] = [];
        const origWrite = process.stdout.write;
        process.stdout.write = ((chunk: string) => {
            stdoutCalls.push(chunk);
            return true;
        }) as typeof process.stdout.write;

        try {
            await evolve('skill', 'widget', {
                adapter,
                proposeOnly: true,
                json: true,
            });
        } finally {
            process.stdout.write = origWrite;
        }

        const envelope = JSON.parse(stdoutCalls.join(''));
        expect(envelope.type).toBe('skill');
        expect(envelope.content_name).toBe('widget');
        expect(Array.isArray(envelope.trends)).toBe(true);
        expect(envelope.baseline).toBeDefined();
        expect(envelope.rubric).toBeDefined();
        expect(envelope.rubric.version).toBe(2);
        expect(envelope.rubric.type).toBe('skill');
        expect(Array.isArray(envelope.briefs)).toBe(true);
        expect(envelope.briefs.length).toBeGreaterThan(0);

        const brief = envelope.briefs[0];
        expect(brief.dimension).toBeDefined();
        expect(typeof brief.current_text).toBe('string');
        expect(typeof brief.target_criterion).toBe('string');
        expect(brief.anchor).toBeDefined();

        // Goal anchor: frontmatter emitted verbatim
        expect(brief.anchor.frontmatter).toBeDefined();
        expect(brief.anchor.frontmatter.name).toBe('widget');

        // Goal anchor: rubric criterion verbatim
        expect(typeof brief.anchor.rubric_criteria).toBe('string');
        expect(brief.anchor.rubric_criteria.length).toBeGreaterThan(0);

        // Goal anchor: negative constraints extracted verbatim
        expect(Array.isArray(brief.anchor.negative_constraints)).toBe(true);
        const constraints = brief.anchor.negative_constraints as string[];
        expect(constraints.length).toBeGreaterThanOrEqual(2);
        expect(constraints.some((c: string) => c.includes("DON'T"))).toBe(true);
        expect(constraints.some((c: string) => c.includes('NEVER'))).toBe(true);
    });

    it('does not write to the store in envelope-out mode', async () => {
        await seedHistory(adapter);

        const origWrite = process.stdout.write;
        process.stdout.write = (() => true) as typeof process.stdout.write;
        try {
            await evolve('skill', 'widget', { adapter, proposeOnly: true, json: true });
        } finally {
            process.stdout.write = origWrite;
        }

        const proposalDao = new ProposalDao(adapter);
        const rows = await proposalDao.getProposals('skill', 'widget');
        expect(rows).toHaveLength(0);
    });

    it('never emits the [Improve placeholder on any path', async () => {
        await seedHistory(adapter);

        const stdoutCalls: string[] = [];
        const origWrite = process.stdout.write;
        process.stdout.write = ((chunk: string) => {
            stdoutCalls.push(chunk);
            return true;
        }) as typeof process.stdout.write;

        try {
            await evolve('skill', 'widget', { adapter, proposeOnly: true, json: true });
        } finally {
            process.stdout.write = origWrite;
        }

        const output = stdoutCalls.join('');
        expect(output).not.toContain('[Improve');
    });
});

describe('generation seam — ingest-in (F023)', () => {
    let dir: string;
    let prevCwd: string;
    let adapter: DbAdapter;

    async function makeAdapter(): Promise<DbAdapter> {
        const a = await createDbAdapter({ driver: 'bun-sqlite', url: ':memory:' });
        await a.exec(evaluations.createTableSql);
        await a.exec(proposals.createTableSql);
        return a;
    }

    async function seedHistory(a: DbAdapter): Promise<void> {
        const dao = new EvaluationDao(a);
        for (let i = 0; i < 3; i++) {
            const id = await dao.insertEvaluation({
                content_type: 'skill',
                content_name: 'widget',
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
        dir = mkdtempSync(join(tmpdir(), 'superskill-ingest-'));
        mkdirSync(join(dir, '.superskill'), { recursive: true });
        writeFileSync(join(dir, 'widget.md'), SKILL_WITH_CONSTRAINTS);
        chdir(dir);
        adapter = await makeAdapter();
        spyOn(process.stdout, 'write').mockImplementation(() => true);
        spyOn(process.stderr, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
        chdir(prevCwd);
        rmSync(dir, { recursive: true, force: true });
    });

    it('ingests authored proposal and persists it via ProposalDao', async () => {
        await seedHistory(adapter);

        const proposalPath = join(dir, 'proposal.json');
        writeFileSync(proposalPath, JSON.stringify(AUTHORED_PROPOSAL, null, 2));

        const result = await evolve('skill', 'widget', { adapter, ingest: proposalPath });

        expect(result.changesApplied).toBe(0); // no --accept, so not applied
        expect(result.proposalPath).toContain('skill-evolve-test-001');

        const proposalDao = new ProposalDao(adapter);
        const stored = await proposalDao.getProposals('skill', 'widget');
        expect(stored.length).toBeGreaterThanOrEqual(1);

        const json =
            typeof stored[0]?.proposal_json === 'string'
                ? JSON.parse(stored[0].proposal_json)
                : stored[0]?.proposal_json;
        expect(json.proposal_id).toBe('skill-evolve-test-001');
        expect(json.changes[0].proposed).toContain('focused widget skill');
        // No placeholder text in the stored proposal
        expect(JSON.stringify(json)).not.toContain('[Improve');
    });

    it('applies authored proposed text via --ingest + --accept (no placeholder)', async () => {
        await seedHistory(adapter);

        const proposalPath = join(dir, 'proposal.json');
        writeFileSync(proposalPath, JSON.stringify(AUTHORED_PROPOSAL, null, 2));

        const result = await evolve('skill', 'widget', {
            adapter,
            ingest: proposalPath,
            acceptId: 'skill-evolve-test-001',
            margin: -1, // gate disabled — test probes apply mechanics, not Δ
        });

        // The proposal was applied — changesApplied should be >= 1
        expect(result.changesApplied).toBeGreaterThanOrEqual(1);

        // The file should now contain the authored proposed text, not a placeholder
        const fileContent = readFileSync(join(dir, 'widget.md'), 'utf-8');
        expect(fileContent).toContain('focused widget skill');
        expect(fileContent).not.toContain('[Improve');
    });

    it('throws on invalid proposal (missing required fields)', async () => {
        await seedHistory(adapter);

        const badProposal = {
            proposal_id: 'bad-001',
            changes: [{ dimension: 'clarity' }], // missing location, proposed, reason
        };
        const proposalPath = join(dir, 'bad-proposal.json');
        writeFileSync(proposalPath, JSON.stringify(badProposal));

        await expect(evolve('skill', 'widget', { adapter, ingest: proposalPath })).rejects.toThrow(
            /missing required field/,
        );
    });

    it('persists a failure_mode tag through ingest into proposal history (task 0070 R5)', async () => {
        await seedHistory(adapter);

        const tagged = {
            proposal_id: 'skill-evolve-tagged-001',
            changes: [
                {
                    dimension: 'conciseness',
                    location: 'description',
                    current: 'old text',
                    proposed: 'tight one-line description',
                    reason: 'Collapse duplicated description restatement',
                    failure_mode: 'duplication',
                },
            ],
        };
        const proposalPath = join(dir, 'tagged-proposal.json');
        writeFileSync(proposalPath, JSON.stringify(tagged));

        await evolve('skill', 'widget', { adapter, ingest: proposalPath });

        const stored = await new ProposalDao(adapter).getProposals('skill', 'widget');
        const json =
            typeof stored[0]?.proposal_json === 'string'
                ? JSON.parse(stored[0].proposal_json)
                : stored[0]?.proposal_json;
        expect(json.changes[0].failure_mode).toBe('duplication');
    });

    it('rejects an unknown failure_mode tag (task 0070 R5)', async () => {
        await seedHistory(adapter);

        const badTag = {
            proposal_id: 'skill-evolve-badtag-001',
            changes: [
                {
                    dimension: 'conciseness',
                    location: 'description',
                    current: 'old',
                    proposed: 'new',
                    reason: 'why',
                    failure_mode: 'bloat',
                },
            ],
        };
        const proposalPath = join(dir, 'badtag-proposal.json');
        writeFileSync(proposalPath, JSON.stringify(badTag));

        await expect(evolve('skill', 'widget', { adapter, ingest: proposalPath })).rejects.toThrow(
            /Invalid failure_mode "bloat"/,
        );
    });

    it('throws on empty changes array', async () => {
        await seedHistory(adapter);

        const emptyProposal = { proposal_id: 'empty-001', changes: [] };
        const proposalPath = join(dir, 'empty-proposal.json');
        writeFileSync(proposalPath, JSON.stringify(emptyProposal));

        await expect(evolve('skill', 'widget', { adapter, ingest: proposalPath })).rejects.toThrow(
            /non-empty changes array/,
        );
    });

    it('throws on invalid JSON (parse failure)', async () => {
        await seedHistory(adapter);

        const proposalPath = join(dir, 'malformed.json');
        writeFileSync(proposalPath, '{broken json');

        await expect(evolve('skill', 'widget', { adapter, ingest: proposalPath })).rejects.toThrow(
            /Invalid JSON in proposal file/,
        );
    });

    it('throws on unreadable file', async () => {
        await seedHistory(adapter);

        await expect(evolve('skill', 'widget', { adapter, ingest: join(dir, 'nonexistent.json') })).rejects.toThrow(
            /Cannot read proposal file/,
        );
    });
});

describe('generation seam — placeholder removal (R5)', () => {
    let dir: string;
    let prevCwd: string;
    let adapter: DbAdapter;

    async function makeAdapter(): Promise<DbAdapter> {
        const a = await createDbAdapter({ driver: 'bun-sqlite', url: ':memory:' });
        await a.exec(evaluations.createTableSql);
        await a.exec(proposals.createTableSql);
        return a;
    }

    async function seedHistory(a: DbAdapter): Promise<void> {
        const dao = new EvaluationDao(a);
        for (let i = 0; i < 3; i++) {
            const id = await dao.insertEvaluation({
                content_type: 'skill',
                content_name: 'widget',
                target_agent: 'claude',
                operation: 'evaluate',
                aggregate: 0.5 + i * 0.05,
                dimensions: { clarity: { score: 0.5 + i * 0.05, note: 'needs improvement' } },
                file_hash: 'abc',
            });
            await a.exec(`UPDATE evaluations SET created_at = ${Date.UTC(2026, 5, 1, 0, 0, i)} WHERE id = ${id}`);
        }
    }

    beforeEach(async () => {
        prevCwd = cwd();
        dir = mkdtempSync(join(tmpdir(), 'superskill-no-placeholder-'));
        mkdirSync(join(dir, '.superskill'), { recursive: true });
        writeFileSync(join(dir, 'widget.md'), SKILL_WITH_CONSTRAINTS);
        chdir(dir);
        adapter = await makeAdapter();
        spyOn(process.stdout, 'write').mockImplementation((chunk: string) => {
            // Capture stdout to assert no placeholder leaks
            if (chunk.includes('[Improve')) {
                throw new Error('[Improve placeholder leaked into stdout');
            }
            return true;
        });
        spyOn(process.stderr, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
        chdir(prevCwd);
        rmSync(dir, { recursive: true, force: true });
    });

    it('--propose-only (no --json) writes a proposal with no [Improve placeholder', async () => {
        await seedHistory(adapter);

        const result = await evolve('skill', 'widget', { adapter, proposeOnly: true });

        expect(result.proposalPath).toBeDefined();
        expect(result.proposalPath.length).toBeGreaterThan(0);

        // The proposal file should exist and not contain the placeholder
        const proposalContent = readFileSync(result.proposalPath, 'utf-8');
        expect(proposalContent).not.toContain('[Improve');
    });
});
