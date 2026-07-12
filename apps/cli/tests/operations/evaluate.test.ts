import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { QualityReport } from '@gobing-ai/superskill-core';
import { createDbAdapter } from '@gobing-ai/ts-db';
import { evaluate, formatEvaluationReport } from '../../src/operations/evaluate';
import { EvaluationDao } from '../../src/store/evaluations';
import { evaluations } from '../../src/store/schema';

/** Assert non-null for evaluate() calls in heuristic mode (always returns a report). */
function notNull<T>(val: T | null): T {
    if (val === null) throw new Error('expected QualityReport, got null');
    return val;
}

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

        const result = notNull(await evaluate('skill', file));
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

    it('throws with code 2 for path that resolves to nothing', async () => {
        // After B1, an empty directory without SKILL.md returns null from resolveContentPath → "File not found".
        const dir = join(tmpDir, 'subdir');
        mkdirSync(dir, { recursive: true });
        try {
            await evaluate('skill', dir);
            throw new Error('should have thrown');
        } catch (err: unknown) {
            const e = err as Error & { code?: number };
            expect(e.message).toContain('File not found');
            expect(e.code).toBe(2);
        }
    });

    it('resolves target from options', async () => {
        const file = createTempFile(GOOD_SKILL);
        const result = notNull(await evaluate('skill', file, { target: 'codex' }));
        expect(result.target).toBe('codex');
    });

    it('defaults target to claude', async () => {
        const file = createTempFile(GOOD_SKILL);
        const result = notNull(await evaluate('skill', file));
        expect(result.target).toBe('claude');
    });

    it('saves to store when --save is enabled', async () => {
        const adapter = await createDbAdapter({ driver: 'bun-sqlite', url: ':memory:' });
        await adapter.exec(evaluations.createTableSql);

        const file = createTempFile(GOOD_SKILL);
        const result = notNull(await evaluate('skill', file, { save: true, adapter }));

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
            const result = notNull(await evaluate('skill', file, { save: true, adapter }));
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
        const skill = notNull(await evaluate('skill', file));
        expect(skill.type).toBe('skill');

        // Command — minimal valid
        writeFileSync(file, '---\nname: deploy\ndescription: Deploy command\n---\n\n# /deploy\n\nRun the deployment.');
        const cmd = notNull(await evaluate('command', file));
        expect(cmd.type).toBe('command');

        // Agent
        writeFileSync(
            file,
            '---\nname: reviewer\ndescription: Code reviewer\nmodel: sonnet\n---\n\nYou are a code review specialist.',
        );
        const agent = notNull(await evaluate('agent', file));
        expect(agent.type).toBe('agent');

        // Hook
        writeFileSync(
            file,
            '---\nname: block-dangerous\ndescription: Blocks dangerous commands\nevent: PreToolUse\nenabled: true\n---\n\nHooks intercept.',
        );
        const hook = notNull(await evaluate('hook', file));
        expect(hook.type).toBe('hook');

        // Magent
        writeFileSync(
            file,
            '---\nname: dev-agent\ndescription: Dev agent\nplatforms:\n  - claude\n---\n\n## IDENTITY\n\nAgent.\n\n## SOUL\n\nTone.\n\n## AGENTS\n\nOps.\n\n## USER\n\nProfile.',
        );
        const magent = notNull(await evaluate('magent', file));
        expect(magent.type).toBe('magent');
    });

    it('--history with empty store prints an explicit empty-state line and returns null', async () => {
        const adapter = await createDbAdapter({ driver: 'bun-sqlite', url: ':memory:' });
        await adapter.exec(evaluations.createTableSql);
        const file = createTempFile(GOOD_SKILL);
        const writes: string[] = [];
        const stdout = spyOn(process.stdout, 'write').mockImplementation((data) => {
            writes.push(typeof data === 'string' ? data : data.toString());
            return true;
        });
        const result = await evaluate('skill', file, { history: true, adapter });
        stdout.mockRestore();
        expect(result).toBeNull();
        expect(writes.join('')).toContain('No evaluation history for');
    });

    it('--history with stored evaluations prints them', async () => {
        const adapter = await createDbAdapter({ driver: 'bun-sqlite', url: ':memory:' });
        await adapter.exec(evaluations.createTableSql);
        const dao = new EvaluationDao(adapter);
        await dao.insertEvaluation({
            content_type: 'skill',
            content_name: 'test-skill',
            target_agent: 'claude',
            operation: 'evaluate',
            aggregate: 0.89,
            dimensions: {},
        });
        await dao.insertEvaluation({
            content_type: 'skill',
            content_name: 'test-skill',
            target_agent: 'claude',
            operation: 'refine',
            aggregate: 0.67,
            dimensions: {},
            rubric_version: 1,
        });

        const stdoutLines: string[] = [];
        const origWrite = process.stdout.write;
        process.stdout.write = ((chunk: string) => {
            stdoutLines.push(String(chunk));
            return true;
        }) as typeof process.stdout.write;

        try {
            const file = createTempFile(GOOD_SKILL);
            const result = await evaluate('skill', file, { history: true, adapter });
            expect(result).toBeNull();
            const output = stdoutLines.join('');
            expect(output).toContain('Evaluation history');
            expect(output).toContain('2 entries');
            expect(output).toContain('PASS');
            expect(output).toContain('FAIL');
            expect(output).toContain('heuristic');
            expect(output).toContain('v1');
        } finally {
            process.stdout.write = origWrite;
        }
    });

    it('ingest mode throws when scores file is missing', async () => {
        const file = createTempFile(GOOD_SKILL);
        await expect(evaluate('skill', file, { ingest: '/nonexistent/scores.json' })).rejects.toThrow(
            'Cannot read scores file',
        );
    });

    it('ingest mode throws when scores file has invalid JSON', async () => {
        const file = createTempFile(GOOD_SKILL);
        const scoresFile = join(tmpDir, 'bad.json');
        writeFileSync(scoresFile, 'not json');
        await expect(evaluate('skill', file, { ingest: scoresFile })).rejects.toThrow('Invalid JSON');
    });
    it('envelope-out mode emits JSON and returns null', async () => {
        const rubricPath = join(tmpDir, 'skill.yaml');
        writeFileSync(
            rubricPath,
            `version: 1
type: skill
dimensions:
  - name: completeness
    weight: 0.5
    criterion: "c"
  - name: clarity
    weight: 0.5
    criterion: "c"
`,
        );
        const stdoutLines: string[] = [];
        const origWrite = process.stdout.write;
        process.stdout.write = ((chunk: string) => {
            stdoutLines.push(String(chunk));
            return true;
        }) as typeof process.stdout.write;

        try {
            const file = createTempFile(GOOD_SKILL);
            const result = await evaluate('skill', file, { rubric: rubricPath });
            expect(result).toBeNull();
            const output = stdoutLines.join('');
            expect(output).toContain('"type": "skill"');
            expect(output).toContain('"content_name"');
            expect(output).toContain('"rubric"');
            expect(output).toContain('"baseline"');
        } finally {
            process.stdout.write = origWrite;
        }
    });

    it('ingest mode throws on rubric_version mismatch', async () => {
        const file = createTempFile(GOOD_SKILL);
        const scoresFile = join(tmpDir, 'scores.json');
        writeFileSync(scoresFile, JSON.stringify({ rubric_version: 999, dimensions: {} }));
        await expect(evaluate('skill', file, { ingest: scoresFile })).rejects.toThrow('rubric_version mismatch');
    });

    it('throws on unreadable file', async () => {
        const file = join(tmpDir, 'unreadable.md');
        writeFileSync(file, '# test');
        // Make file unreadable
        const { chmodSync, statSync: fsStatSync } = await import('node:fs');
        const oldMode = fsStatSync(file).mode;
        try {
            chmodSync(file, 0o000);
            await expect(evaluate('skill', file)).rejects.toThrow(/Cannot read|File not found/);
        } finally {
            chmodSync(file, oldMode);
        }
    });

    it('ingest mode succeeds with valid scores and rubric dimensions', async () => {
        const adapter = await createDbAdapter({ driver: 'bun-sqlite', url: ':memory:' });
        await adapter.exec(evaluations.createTableSql);
        const file = createTempFile(GOOD_SKILL);
        const scoresFile = join(tmpDir, 'valid-scores.json');
        writeFileSync(
            scoresFile,
            JSON.stringify({
                rubric_version: 2,
                dimensions: {
                    completeness: { score: 0.9, note: 'ok' },
                    clarity: { score: 0.8, note: 'clear' },
                    'trigger-accuracy': { score: 0.7, note: 'ok' },
                    'anti-hallucination': { score: 0.6, note: 'ok' },
                    conciseness: { score: 0.5, note: 'verbose' },
                },
            }),
        );
        const result = notNull(await evaluate('skill', file, { ingest: scoresFile, adapter }));
        expect(result.type).toBe('skill');
        expect(result.aggregate).toBeGreaterThan(0);
        expect(result.dimensions.completeness?.score).toBe(0.9);
    });

    it('ingest mode throws on missing dimension', async () => {
        const file = createTempFile(GOOD_SKILL);
        const scoresFile = join(tmpDir, 'scores.json');
        writeFileSync(
            scoresFile,
            JSON.stringify({
                rubric_version: 2,
                dimensions: { completeness: { score: 0.5, note: 'ok' } },
            }),
        );
        await expect(evaluate('skill', file, { ingest: scoresFile })).rejects.toThrow('Missing dimension');
    });

    it('ingest mode throws on unexpected dimension', async () => {
        const file = createTempFile(GOOD_SKILL);
        const scoresFile = join(tmpDir, 'scores.json');
        writeFileSync(
            scoresFile,
            JSON.stringify({
                rubric_version: 2,
                dimensions: {
                    completeness: { score: 0.5, note: 'ok' },
                    clarity: { score: 0.5, note: 'ok' },
                    'trigger-accuracy': { score: 0.5, note: 'ok' },
                    'anti-hallucination': { score: 0.5, note: 'ok' },
                    conciseness: { score: 0.5, note: 'ok' },
                    'extra-dim': { score: 0.5, note: 'not in rubric' },
                },
            }),
        );
        await expect(evaluate('skill', file, { ingest: scoresFile })).rejects.toThrow('Unexpected dimension');
    });

    it('ingest mode throws on score out of range', async () => {
        const file = createTempFile(GOOD_SKILL);
        const scoresFile = join(tmpDir, 'scores.json');
        writeFileSync(
            scoresFile,
            JSON.stringify({
                rubric_version: 2,
                dimensions: {
                    completeness: { score: 1.5, note: 'too high' },
                    clarity: { score: 0.5, note: 'ok' },
                    'trigger-accuracy': { score: 0.5, note: 'ok' },
                    'anti-hallucination': { score: 0.5, note: 'ok' },
                    conciseness: { score: 0.5, note: 'ok' },
                },
            }),
        );
        await expect(evaluate('skill', file, { ingest: scoresFile })).rejects.toThrow('Score out of range');
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

    it('prints verdict and grade when present', () => {
        const report: QualityReport = {
            content: 'test',
            type: 'skill',
            target: 'claude',
            aggregate: 0.89,
            dimensions: { completeness: { score: 1, note: 'ok' } },
            verdict: 'PASS',
            grade: 'B',
        };
        const output = formatEvaluationReport(report, false);
        expect(output).toContain('Verdict: PASS');
        expect(output).toContain('Grade: B');
    });

    it('prints findings when dimensions have them', () => {
        const report: QualityReport = {
            content: 'test',
            type: 'skill',
            target: 'claude',
            aggregate: 0.5,
            dimensions: {
                completeness: { score: 0.3, note: 'incomplete', findings: ['Missing field: description'] },
                clarity: { score: 0.5, note: 'ok' },
            },
            verdict: 'FAIL',
            grade: 'D',
        };
        const output = formatEvaluationReport(report, false);
        expect(output).toContain('Findings:');
        expect(output).toContain('Missing field: description');
        expect(output).toContain('[completeness]');
    });

    it('prints recommendations when dimensions have them', () => {
        const report: QualityReport = {
            content: 'test',
            type: 'skill',
            target: 'claude',
            aggregate: 0.6,
            dimensions: {
                clarity: {
                    score: 0.4,
                    note: 'vague',
                    recommendations: ['Use more imperative verbs, fewer hedging terms'],
                },
            },
            verdict: 'FAIL',
            grade: 'C',
        };
        const output = formatEvaluationReport(report, false);
        expect(output).toContain('Recommendations:');
        expect(output).toContain('Use more imperative verbs');
        expect(output).toContain('[clarity]');
    });

    it('omits findings section when no findings exist', () => {
        const report: QualityReport = {
            content: 'test',
            type: 'skill',
            target: 'claude',
            aggregate: 0.9,
            dimensions: { completeness: { score: 1, note: 'ok' } },
            verdict: 'PASS',
            grade: 'A',
        };
        const output = formatEvaluationReport(report, false);
        expect(output).not.toContain('Findings:');
        expect(output).not.toContain('Recommendations:');
    });
});
