import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chdir, cwd } from 'node:process';
import { createDbAdapter, type DbAdapter } from '@gobing-ai/ts-db';
import { computeAnchorHash, evolve } from '../../src/operations/evolve';
import { EvaluationDao } from '../../src/store/evaluations';
import { ProposalDao } from '../../src/store/proposals';
import { evaluations, proposals } from '../../src/store/schema';

/**
 * F024 — the double-loop gate. A proposal is accepted only if it passes the deterministic
 * gate (validate, 0 errors), the Δ-margin gate, the anchor gate, and the skeptic gate.
 * Failing any gate → the file is restored from the pre-apply backup and the proposal stays draft.
 */

/** A valid skill with a DON'T rule (so the baseline anchor carries a negative constraint). */
const SKILL = `---
name: widget
description: |
  A widget skill that manages widgets clearly and completely with actionable lifecycle steps.
  DON'T use this skill for non-widget tasks.
---

## When to Use
Trigger when the user asks to manage widgets, validate widget config, or inspect widget state.
`;

/** Baseline anchor hash recomputed exactly as the gate does (frontmatter + DON'T constraint). */
function baselineAnchorHash(): string {
    return computeAnchorHash({
        frontmatter: {
            name: 'widget',
            description:
                "A widget skill that manages widgets clearly and completely with actionable lifecycle steps.\nDON'T use this skill for non-widget tasks.\n",
        },
        rubric_criteria: '',
        negative_constraints: ["DON'T use this skill for non-widget tasks."],
    });
}

describe('double-loop gate (F024)', () => {
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

    /** Write a proposal JSON file and return its path. */
    function writeProposal(name: string, body: unknown): string {
        const p = join(dir, name);
        writeFileSync(p, JSON.stringify(body, null, 2));
        return p;
    }

    beforeEach(async () => {
        prevCwd = cwd();
        dir = mkdtempSync(join(tmpdir(), 'superskill-gate-'));
        mkdirSync(join(dir, '.superskill'), { recursive: true });
        writeFileSync(join(dir, 'widget.md'), SKILL);
        chdir(dir);
        adapter = await makeAdapter();
        spyOn(process.stdout, 'write').mockImplementation(() => true);
        spyOn(process.stderr, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
        chdir(prevCwd);
        rmSync(dir, { recursive: true, force: true });
    });

    it('Δ-margin gate: a regressive proposal is rejected, file restored byte-identical, proposal stays draft', async () => {
        await seedHistory(adapter);
        const before = readFileSync(join(dir, 'widget.md'), 'utf-8');

        // A real change that will not raise the heuristic aggregate by the default 0.05 margin.
        const proposalPath = writeProposal('regressive.json', {
            proposal_id: 'skill-evolve-regressive-001',
            changes: [
                {
                    dimension: 'clarity',
                    location: 'frontmatter.description',
                    current: 'x',
                    proposed: 'noise',
                    reason: 'regressive change',
                },
            ],
        });

        const r = await evolve('skill', 'widget', {
            adapter,
            ingest: proposalPath,
            acceptId: 'skill-evolve-regressive-001',
            // default margin 0.05 applies
        });

        expect(r.rejected).toBe(true);
        expect(r.rejectionReason).toMatch(/Δ-margin gate failed/);
        expect(r.changesApplied).toBe(0);

        // File restored byte-identical to pre-apply.
        expect(readFileSync(join(dir, 'widget.md'), 'utf-8')).toBe(before);

        // Proposal stays draft (not accepted).
        const stored = (await new ProposalDao(adapter).getProposals('skill', 'widget'))[0];
        expect(stored?.status).toBe('draft');
    });

    it('deterministic gate: a proposal that breaks frontmatter validation is rejected, file restored', async () => {
        // Use an agent fixture: its `model` field validates against an enum, so an invalid value
        // is a deterministic validation error (skills have no such single-field enum to break cleanly).
        const AGENT = `---
name: my-agent
description: An agent that does helpful things across many tasks reliably and safely.
model: sonnet
tools: ['Read', 'Write']
---

You are a careful, helpful agent. Do tasks well, verify your work, and ask when unsure.
`;
        writeFileSync(join(dir, 'my-agent.md'), AGENT);
        const dao = new EvaluationDao(adapter);
        for (let i = 0; i < 3; i++) {
            const id = await dao.insertEvaluation({
                content_type: 'agent',
                content_name: 'my-agent',
                target_agent: 'claude',
                operation: 'evaluate',
                aggregate: 0.6 + i * 0.05,
                dimensions: { 'role-clarity': { score: 0.6 + i * 0.05, note: 'declining' } },
                file_hash: 'abc',
            });
            await adapter.exec(`UPDATE evaluations SET created_at = ${Date.UTC(2026, 5, 2, 0, 0, i)} WHERE id = ${id}`);
        }
        const before = readFileSync(join(dir, 'my-agent.md'), 'utf-8');

        // Set `model` to an invalid enum value → validate() yields an error finding.
        const proposalPath = writeProposal('invalid.json', {
            proposal_id: 'agent-evolve-invalid-001',
            changes: [
                {
                    dimension: 'model-fit',
                    location: 'frontmatter.model',
                    current: 'sonnet',
                    proposed: 'gpt-4-turbo',
                    reason: 'invalid model alias breaks validation',
                },
            ],
        });

        const r = await evolve('agent', 'my-agent', {
            adapter,
            ingest: proposalPath,
            acceptId: 'agent-evolve-invalid-001',
            margin: -1, // disable Δ-gate so the deterministic gate is the one that fires
        });

        expect(r.rejected).toBe(true);
        expect(r.rejectionReason).toMatch(/Deterministic gate failed/);
        expect(readFileSync(join(dir, 'my-agent.md'), 'utf-8')).toBe(before);

        const stored = (await new ProposalDao(adapter).getProposals('agent', 'my-agent'))[0];
        expect(stored?.status).toBe('draft');
    });

    it('anchor gate: a proposal whose anchor_hash mismatches the baseline is rejected, file restored', async () => {
        await seedHistory(adapter);
        const before = readFileSync(join(dir, 'widget.md'), 'utf-8');

        const proposalPath = writeProposal('anchor-tampered.json', {
            proposal_id: 'skill-evolve-anchor-001',
            anchor_hash: 'deadbeefdeadbeef', // does not match the baseline anchor
            changes: [
                {
                    dimension: 'clarity',
                    location: 'frontmatter.description',
                    current: 'x',
                    proposed: 'tampered',
                    reason: 'anchor was summarised',
                },
            ],
        });

        const r = await evolve('skill', 'widget', {
            adapter,
            ingest: proposalPath,
            acceptId: 'skill-evolve-anchor-001',
            margin: -1, // pass Δ so the anchor gate is the one that fires
        });

        expect(r.rejected).toBe(true);
        expect(r.rejectionReason).toMatch(/Anchor gate failed/);
        expect(readFileSync(join(dir, 'widget.md'), 'utf-8')).toBe(before);

        const stored = (await new ProposalDao(adapter).getProposals('skill', 'widget'))[0];
        expect(stored?.status).toBe('draft');
    });

    it('skeptic gate: a proposal vetoed by the Skeptic (ok=false) is rejected, file restored', async () => {
        await seedHistory(adapter);
        const before = readFileSync(join(dir, 'widget.md'), 'utf-8');

        const proposalPath = writeProposal('skeptic-veto.json', {
            proposal_id: 'skill-evolve-skeptic-001',
            skeptic: { ok: false, violations: ["drops the DON'T constraint"] },
            changes: [
                {
                    dimension: 'clarity',
                    location: 'frontmatter.description',
                    current: 'x',
                    proposed: 'rewrite',
                    reason: 'rewrite',
                },
            ],
        });

        const r = await evolve('skill', 'widget', {
            adapter,
            ingest: proposalPath,
            acceptId: 'skill-evolve-skeptic-001',
            margin: -1, // pass Δ so the skeptic gate is the one that fires
        });

        expect(r.rejected).toBe(true);
        expect(r.rejectionReason).toMatch(/Skeptic gate failed/);
        expect(r.rejectionReason).toContain("drops the DON'T constraint");
        expect(readFileSync(join(dir, 'widget.md'), 'utf-8')).toBe(before);

        const stored = (await new ProposalDao(adapter).getProposals('skill', 'widget'))[0];
        expect(stored?.status).toBe('draft');
    });

    it('pass: a good proposal applies, is marked accepted, and writes a post-eval verify row (R7)', async () => {
        await seedHistory(adapter);

        const proposalPath = writeProposal('good.json', {
            proposal_id: 'skill-evolve-good-001',
            anchor_hash: baselineAnchorHash(), // matches the baseline → anchor gate passes
            skeptic: { ok: true },
            changes: [
                {
                    dimension: 'clarity',
                    location: 'frontmatter.description',
                    current: 'x',
                    proposed: 'A precise widget skill with validated, well-documented lifecycle operations.',
                    reason: 'sharper, more complete description',
                },
            ],
        });

        const evalCountBefore = (await new EvaluationDao(adapter).getEvaluations('skill', 'widget')).length;

        const r = await evolve('skill', 'widget', {
            adapter,
            ingest: proposalPath,
            acceptId: 'skill-evolve-good-001',
            margin: -1, // isolate the anchor + skeptic + deterministic gates; Δ passes vacuously
        });

        // Applied, not rejected.
        expect(r.rejected).toBeUndefined();
        expect(r.changesApplied).toBeGreaterThanOrEqual(1);

        // Proposal marked accepted with a verify_id linkage (R7).
        const stored = (await new ProposalDao(adapter).getProposals('skill', 'widget'))[0];
        expect(stored?.status).toBe('accepted');
        expect(stored?.verify_id).toBeDefined();

        // Closed loop: a post-eval 'evolve' row was written (R7 — gate sits on top, does not bypass).
        const evalsAfter = await new EvaluationDao(adapter).getEvaluations('skill', 'widget');
        expect(evalsAfter.length).toBe(evalCountBefore + 1);
        expect(evalsAfter.some((e) => e.operation === 'evolve')).toBe(true);

        // The applied text is present (no backup residue).
        expect(readFileSync(join(dir, 'widget.md'), 'utf-8')).toContain('precise widget skill');
    });
});
