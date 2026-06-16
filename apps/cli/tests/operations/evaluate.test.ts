import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDbAdapter, type DbAdapter } from '@gobing-ai/ts-db';
import type { QualityReport } from '../../src/quality/dimensions';
import { evaluate, formatEvaluationReport } from '../../src/operations/evaluate';
import { evaluations } from '../../src/store/schema';
import { EvaluationDao } from '../../src/store/evaluations';

/** Create a temp content file with frontmatter. */
function createTempFile(content: string): string {
    const dir = mkdtempSync(join(tmpdir(), 'superskill-eval-'));
    const file = join(dir, 'test-skill.md');
    writeFileSync(file, content);
    return file;
}

/** Full skill content for a well-formed evaluation. */
const GOOD_SKILL = `---
name: code-reviewer
description: Reviews code for quality issues and security vulnerabilities
---

## Overview
This skill must be used when the user asks to review code. You should never skip
verification steps. Always verify findings with at least two sources before reporting.
Provide clear, actionable feedback with citations.

## When to Use
Trigger this skill when the user mentions code review, PR review, quality check,
or security audit. For quick syntax checks, prefer the linter skill instead.
`;

describe('evaluate', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'superskill-eval-test-'));
    });

    afterEach(() => {
        if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
    });

    it('returns QualityReport for valid skill', async () => {
        const file = join(tmpDir, 'code-reviewer.md');
        writeFileSync(file, GOOD_SKILL);

        const result = await evaluate('skill', file);
        expect(result.type).toBe('skill');
        expect(result.content).toBe('code-reviewer');
        expect(result.target).toBe('claude');
        expect(result.aggregate).toBeGreaterThan(0);
        expect(result.aggregate).toBeLessThanOrEqual(1);
        expect(Object.keys(result.dimensions)).toHaveLength(5);
    });

    it('throws with code 2 for non-existent file', async () => {
        try {
            await evaluate('skill', '/nonexistent/file.md');
            throw new Error('should have thrown');
        } catch (err: unknown) {
            const e = err as Error & { code?: number };
            expect(e.message).toContain('File not found');
            expect(e.code).toBe(2);
        }
    });

    it('throws with code 2 for unreadable file', async () => {
        const dir = join(tmpDir, 'subdir');
        mkdirSync(dir, { recursive: true });
        try {
            await evaluate('skill', dir);
            throw new Error('should have thrown');
        } catch (err: unknown) {
            const e = err as Error & { code?: number };
            expect(e.message).toContain('Cannot read');
            expect(e.code).toBe(2);
        }
    });

    it('resolves target from options', async () => {
        const file = createTempFile(GOOD_SKILL);
        const result = await evaluate('skill', file, { target: 'codex' });
        expect(result.target).toBe('codex');
    });

    it('defaults target to claude', async () => {
        const file = createTempFile(GOOD_SKILL);
        const result = await evaluate('skill', file);
        expect(result.target).toBe('claude');
    });

    it('saves to store when --save is enabled', async () => {
        const adapter = await createDbAdapter({ driver: 'bun-sqlite', url: ':memory:' });
        await adapter.exec(evaluations.createTableSql);

        const file = createTempFile(GOOD_SKILL);
        const result = await evaluate('skill', file, { save: true, adapter });

        const dao = new EvaluationDao(adapter);
        const rows = await dao.getEvaluations('skill', 'test-skill');
        expect(rows).toHaveLength(1);
        expect(rows[0]?.aggregate).toBe(result.aggregate);
        expect(rows[0]?.operation).toBe('evaluate');
    });

    it('handles save failure without throwing', async () => {
        const file = createTempFile(GOOD_SKILL);
        // Pass adapter: undefined to trigger dynamic import of store but it still needs openStore
        // Actually, just test with an adapter that will fail on insert
        const adapter = await createDbAdapter({ driver: 'bun-sqlite', url: ':memory:' });
        // Don't create table — insert will fail
        const stderrCalls: string[] = [];
        const origWrite = process.stderr.write;
        process.stderr.write = ((chunk: string) => {
            stderrCalls.push(String(chunk));
            return true;
        }) as typeof process.stderr.write;

        try {
            const result = await evaluate('skill', file, { save: true, adapter });
            // Should still return result despite save failure
            expect(result.type).toBe('skill');
            expect(result.aggregate).toBeGreaterThan(0);
            expect(stderrCalls.some((c) => c.includes('Warning: failed to save'))).toBe(true);
        } finally {
            process.stderr.write = origWrite;
        }
    });

    it('uses custom operation string', async () => {
        const adapter = await createDbAdapter({ driver: 'bun-sqlite', url: ':memory:' });
        await adapter.exec(evaluations.createTableSql);

        const file = createTempFile(GOOD_SKILL);
        await evaluate('skill', file, { save: true, adapter, operation: 'refine' });

        const dao = new EvaluationDao(adapter);
        const rows = await dao.getEvaluations('skill', 'test-skill');
        expect(rows[0]?.operation).toBe('refine');
    });

    it('dispatches to correct evaluator for each content type', async () => {
        const file = createTempFile(GOOD_SKILL);
        // Skill
        const skill = await evaluate('skill', file);
        expect(skill.type).toBe('skill');

        // Command — minimal valid
        writeFileSync(file, '---\nname: deploy\ndescription: Deploy command\n---\n\n# /deploy\n\nRun the deployment.');
        const cmd = await evaluate('command', file);
        expect(cmd.type).toBe('command');

        // Agent
        writeFileSync(file, '---\nname: reviewer\ndescription: Code reviewer\nmodel: sonnet\n---\n\nYou are a code review specialist.');
        const agent = await evaluate('agent', file);
        expect(agent.type).toBe('agent');

        // Hook
        writeFileSync(file, '---\nname: block-dangerous\ndescription: Blocks dangerous commands\nevent: PreToolUse\nenabled: true\n---\n\nHooks intercept.');
        const hook = await evaluate('hook', file);
        expect(hook.type).toBe('hook');

        // Magent
        writeFileSync(file, '---\nname: dev-agent\ndescription: Dev agent\nplatforms:\n  - claude\n---\n\n## IDENTITY\n\nAgent.\n\n## SOUL\n\nTone.\n\n## AGENTS\n\nOps.\n\n## USER\n\nProfile.');
        const magent = await evaluate('magent', file);
        expect(magent.type).toBe('magent');
    });
});

describe('formatEvaluationReport', () => {
    const sampleReport: QualityReport = {
        content: 'test-skill',
        type: 'skill',
        target: 'claude',
        aggregate: 0.82,
        dimensions: {
            completeness: { score: 0.85, note: 'Missing error-handling guidance' },
            clarity: { score: 0.9, note: 'Well-structured sections' },
            'trigger-accuracy': { score: 0.75, note: 'Trigger phrases overlap' },
            'anti-hallucination': { score: 0.8, note: 'Missing verification step' },
            conciseness: { score: 0.8, note: 'Some redundant examples' },
        },
    };

    it('outputs JSON when json is true', () => {
        const output = formatEvaluationReport(sampleReport, true);
        const parsed = JSON.parse(output);
        expect(parsed.aggregate).toBe(0.82);
        expect(parsed.type).toBe('skill');
        expect(Object.keys(parsed.dimensions)).toHaveLength(5);
    });

    it('outputs human-readable table', () => {
        const output = formatEvaluationReport(sampleReport, false);
        expect(output).toContain('completeness');
        expect(output).toContain('0.85');
        expect(output).toContain('Missing error-handling guidance');
        expect(output).toContain('AGGREGATE');
        expect(output).toContain('0.82');
    });

    it('includes separator line and aggregate row', () => {
        const output = formatEvaluationReport(sampleReport, false);
        expect(output).toContain('─');
        expect(output).toContain('AGGREGATE');
    });

    it('aligns columns', () => {
        const output = formatEvaluationReport(sampleReport, false);
        const lines = output.split('\n');
        // All dimension lines should start with same padding
        const dimLines = lines.filter((l) => !l.includes('─') && !l.includes('AGGREGATE'));
        for (const line of dimLines) {
            expect(line.startsWith('  ')).toBe(true);
        }
    });

    it('handles empty dimensions gracefully', () => {
        const emptyReport: QualityReport = {
            content: 'empty',
            type: 'skill',
            target: 'claude',
            aggregate: 0,
            dimensions: {},
        };
        const output = formatEvaluationReport(emptyReport, false);
        expect(output).toContain('AGGREGATE');
    });
});
