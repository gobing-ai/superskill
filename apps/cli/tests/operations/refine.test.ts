import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    applyAutoFixes,
    classifyFix,
    generateAutoChange,
    RefineAbortedError,
    refine,
    runInteractive,
} from '../../src/operations/refine';
import type { Finding } from '../../src/operations/validate';

const GOOD_SKILL = `---
name: code-reviewer
description: Reviews code for quality issues and security vulnerabilities
---

## Overview
This skill must be used when the user asks to review code. You should never skip
verification steps. Always verify findings with at least two sources before reporting.

## When to Use
Trigger this skill when the user mentions code review, PR review, quality check,
or security audit. For quick syntax checks, prefer the linter skill instead.
`;

const MISSING_DESC = `---
name: test-skill
---


Minimal body.`;

function createTempFile(content: string, dir?: string): string {
    if (!dir) dir = mkdtempSync(join(tmpdir(), 'superskill-refine-'));
    const file = join(dir, 'test-skill.md');
    writeFileSync(file, content);
    return file;
}

// ── classifyFix ──────────────────────────────────────────────────────────────

describe('classifyFix', () => {
    it('classifies error severity as auto-apply', () => {
        const f: Finding = { severity: 'error', field: 'description', message: 'Missing required field' };
        expect(classifyFix(f)).toBe('auto-apply');
    });
    it('classifies description warnings as suggest', () => {
        expect(classifyFix({ severity: 'warning', field: 'description', message: 'Too short' })).toBe('suggest');
    });
    it('classifies trigger-accuracy as suggest', () => {
        expect(classifyFix({ severity: 'warning', field: 'trigger-accuracy', message: 'overlap' })).toBe('suggest');
    });
    it('classifies clarity as suggest', () => {
        expect(classifyFix({ severity: 'warning', field: 'clarity', message: 'vague' })).toBe('suggest');
    });
    it('classifies conciseness as suggest', () => {
        expect(classifyFix({ severity: 'warning', field: 'conciseness', message: 'verbose' })).toBe('suggest');
    });
    it('classifies skill-linkage as flag', () => {
        expect(classifyFix({ severity: 'warning', field: 'skill-linkage', message: 'merge' })).toBe('flag');
    });
    it('classifies tool-selection as flag', () => {
        expect(classifyFix({ severity: 'warning', field: 'tool-selection', message: 'redesign' })).toBe('flag');
    });
    it('classifies model-fit as flag', () => {
        expect(classifyFix({ severity: 'warning', field: 'model-fit', message: 'change model' })).toBe('flag');
    });
    it('classifies platform-coverage as flag', () => {
        expect(classifyFix({ severity: 'warning', field: 'platform-coverage', message: 'missing' })).toBe('flag');
    });
    it('defaults warning to auto-apply for unrecognized fields', () => {
        expect(classifyFix({ severity: 'warning', field: 'unknown', message: 'unknown' })).toBe('auto-apply');
    });
});

// ── generateAutoChange ───────────────────────────────────────────────────────

describe('generateAutoChange', () => {
    it('generates frontmatter change for missing field', () => {
        const c = generateAutoChange(
            { severity: 'error', field: 'description', message: 'Missing required field' },
            '---\nname: test\n---\n\nbody',
        );
        expect(c?.kind).toBe('frontmatter');
        expect((c as { key: string }).key).toBe('description');
    });

    it('generates array change for wrong type', () => {
        const c = generateAutoChange(
            { severity: 'error', field: 'allowed-tools', message: 'must be an array, got string' },
            '---\nname: test\ndescription: d\nallowed-tools: read\n---\n\nbody',
        );
        expect(Array.isArray((c as { value: unknown }).value)).toBe(true);
    });

    it('generates string change for wrong type', () => {
        const c = generateAutoChange(
            { severity: 'error', field: 'description', message: 'must be a string, got number' },
            '---\nname: test\ndescription: 42\n---\n\nbody',
        );
        expect((c as { value: unknown }).value).toBe('42');
    });

    it('returns null for unrecognized finding message', () => {
        expect(
            generateAutoChange(
                { severity: 'error', field: 'something', message: 'Unknown problem' },
                '---\nname: test\n---\n\n',
            ),
        ).toBeNull();
    });

    it('returns null when frontmatter parse fails (array message)', () => {
        expect(
            generateAutoChange(
                { severity: 'error', field: 'field', message: 'must be an array, got string' },
                'not valid frontmatter',
            ),
        ).toBeNull();
    });

    it('returns null when frontmatter parse fails (string message)', () => {
        expect(
            generateAutoChange(
                { severity: 'error', field: 'field', message: 'must be a string, got number' },
                'not valid frontmatter',
            ),
        ).toBeNull();
    });

    it('returns TODO default for unknown missing field', () => {
        const c = generateAutoChange(
            { severity: 'error', field: 'unknown-field', message: 'Missing required field' },
            '---\nname: test\n---\n\nbody',
        );
        expect((c as { value: unknown }).value).toBe('TODO');
    });

    it('generates trim change for trailing whitespace', () => {
        const c = generateAutoChange(
            { severity: 'warning', field: 'name', message: "'name' has trailing whitespace" },
            '---\nname: test   \ndescription: d\n---\n\nbody',
        );
        expect(c?.kind).toBe('frontmatter');
        expect((c as { key: string }).key).toBe('name');
        expect((c as { value: unknown }).value).toBe('test');
    });
});

// ── applyAutoFixes ───────────────────────────────────────────────────────────

describe('applyAutoFixes', () => {
    it('applies auto-apply fixes and returns modified content', () => {
        const content = '---\nname: "test   "\ndescription: d\n---\n\nbody';
        const findings = [
            {
                finding: { severity: 'warning', field: 'name', message: "'name' has trailing whitespace" } as Finding,
                strategy: 'auto-apply' as const,
            },
        ];
        const result = applyAutoFixes(findings, content);
        expect(result.fixesApplied.length).toBe(1);
        expect(result.fixesSkipped.length).toBe(0);
        expect(result.content).not.toContain('test   ');
    });

    it('skips auto-apply findings when generateAutoChange returns null', () => {
        const content = '---\nname: test\ndescription: d\n---\n\nbody';
        const findings = [
            {
                finding: {
                    severity: 'warning',
                    field: 'tags',
                    message: '\'tags\' is deprecated. Use "labels" instead.',
                } as Finding,
                strategy: 'auto-apply' as const,
            },
        ];
        const result = applyAutoFixes(findings, content);
        expect(result.fixesApplied.length).toBe(0);
        expect(result.fixesSkipped.length).toBe(1);
    });

    it('skips suggest and flag findings', () => {
        const content = '---\nname: test\ndescription: d\n---\n\nbody';
        const findings = [
            {
                finding: { severity: 'warning', field: 'description', message: 'Too short' } as Finding,
                strategy: 'suggest' as const,
            },
            {
                finding: { severity: 'warning', field: 'skill-linkage', message: 'merge' } as Finding,
                strategy: 'flag' as const,
            },
        ];
        const result = applyAutoFixes(findings, content);
        expect(result.fixesApplied.length).toBe(0);
        expect(result.fixesSkipped.length).toBe(2);
    });
});

// ── runInteractive ────────────────────────────────────────────────────────────

describe('runInteractive', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'superskill-refine-int-'));
        spyOn(process.stdout, 'write').mockImplementation(() => true);
        spyOn(process.stderr, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
        if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
    });

    function fakeRl(answers: string[]) {
        let idx = 0;
        return () => ({
            question: (_p: string, cb: (ans: string) => void) => {
                cb(idx < answers.length ? (answers[idx++] as string) : 'q');
            },
            close: () => {},
        });
    }

    it('applies auto-apply fix when user accepts', async () => {
        const file = join(tmpDir, 'test.md');
        writeFileSync(file, '---\nname: test\n---\n\nbody');
        const findings = [
            {
                finding: { severity: 'error' as const, field: 'description', message: 'Missing required field' },
                strategy: 'auto-apply' as const,
            },
        ];
        const mock = fakeRl(['a']) as unknown as typeof import('node:readline').createInterface;
        const r = await runInteractive(findings, '---\nname: test\n---\n\nbody', file, `${file}.bak`, mock);
        expect(r.fixesApplied).toHaveLength(1);
        expect(r.fixesApplied[0]?.applied).toBe(true);
        expect(r.fixesSkipped).toHaveLength(0);
    });

    it('skips when user rejects', async () => {
        const file = join(tmpDir, 'test.md');
        writeFileSync(file, '---\nname: test\n---\n\nbody');
        const findings = [
            {
                finding: { severity: 'error' as const, field: 'description', message: 'Missing required field' },
                strategy: 'auto-apply' as const,
            },
        ];
        const mock = fakeRl(['r']) as unknown as typeof import('node:readline').createInterface;
        const r = await runInteractive(findings, '---\nname: test\n---\n\nbody', file, `${file}.bak`, mock);
        expect(r.fixesApplied).toHaveLength(0);
        expect(r.fixesSkipped).toHaveLength(1);
    });

    it('skips suggest fixes by default (empty answer)', async () => {
        const file = join(tmpDir, 'test.md');
        writeFileSync(file, '---\nname: test\ndescription: d\n---\n\nbody');
        const findings = [
            {
                finding: { severity: 'warning' as const, field: 'description', message: 'Missing required field' },
                strategy: 'suggest' as const,
            },
        ];
        const mock = fakeRl(['']) as unknown as typeof import('node:readline').createInterface;
        const r = await runInteractive(
            findings,
            '---\nname: test\ndescription: d\n---\n\nbody',
            file,
            `${file}.bak`,
            mock,
        );
        expect(r.fixesSkipped).toHaveLength(1);
    });

    it('shows flag findings without prompting and skips', async () => {
        const file = join(tmpDir, 'test.md');
        writeFileSync(file, '---\nname: test\ndescription: d\n---\n\nbody');
        const findings = [
            {
                finding: { severity: 'warning' as const, field: 'skill-linkage', message: 'merge needed' },
                strategy: 'flag' as const,
            },
        ];
        const mock = fakeRl([]) as unknown as typeof import('node:readline').createInterface;
        const r = await runInteractive(
            findings,
            '---\nname: test\ndescription: d\n---\n\nbody',
            file,
            `${file}.bak`,
            mock,
        );
        expect(r.fixesSkipped).toHaveLength(1);
        expect(r.fixesSkipped[0]?.strategy).toBe('flag');
    });

    it('user can accept suggest fix that has a valid change', async () => {
        const file = join(tmpDir, 'test.md');
        writeFileSync(file, '---\nname: test\ndescription: short\n---\n\nbody');
        const findings = [
            {
                finding: { severity: 'warning' as const, field: 'description', message: 'Missing required field' },
                strategy: 'suggest' as const,
            },
        ];
        const mock = fakeRl(['a']) as unknown as typeof import('node:readline').createInterface;
        const r = await runInteractive(
            findings,
            '---\nname: test\ndescription: short\n---\n\nbody',
            file,
            `${file}.bak`,
            mock,
        );
        expect(r.fixesApplied).toHaveLength(1);
        expect(r.fixesApplied[0]?.strategy).toBe('suggest');
    });

    it('quits, restores original content, and removes the backup on q (R12)', async () => {
        const file = join(tmpDir, 'test.md');
        const original = '---\nname: original\n---\n\noriginal body';
        writeFileSync(file, original);
        const backup = `${file}.bak`;
        writeFileSync(backup, original);
        const findings = [
            {
                finding: { severity: 'error' as const, field: 'description', message: 'Missing required field' },
                strategy: 'auto-apply' as const,
            },
        ];
        const mock = fakeRl(['q']) as unknown as typeof import('node:readline').createInterface;
        await expect(runInteractive(findings, original, file, backup, mock)).rejects.toThrow(RefineAbortedError);
        // R12: original content is restored and the backup leaves no residue on disk.
        expect(readFileSync(file, 'utf8')).toBe(original);
        expect(existsSync(backup)).toBe(false);
    });

    it('skips when generateAutoChange returns null', async () => {
        const file = join(tmpDir, 'test.md');
        writeFileSync(file, '---\nname: test\ndescription: d\n---\n\nbody');
        const findings = [
            {
                finding: { severity: 'error' as const, field: 'something', message: 'Unknown problem' },
                strategy: 'auto-apply' as const,
            },
        ];
        const mock = fakeRl(['a']) as unknown as typeof import('node:readline').createInterface;
        const r = await runInteractive(
            findings,
            '---\nname: test\ndescription: d\n---\n\nbody',
            file,
            `${file}.bak`,
            mock,
        );
        expect(r.fixesApplied).toHaveLength(0);
        expect(r.fixesSkipped).toHaveLength(1);
    });
});

// ── refine — auto mode ───────────────────────────────────────────────────────

describe('refine — auto mode', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'superskill-refine-auto-'));
        spyOn(process.stdout, 'write').mockImplementation(() => true);
        spyOn(process.stderr, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
        if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
    });

    it('refines a skill without errors', async () => {
        const file = createTempFile(GOOD_SKILL, tmpDir);
        const r = await refine('skill', file, { auto: true });
        expect(r.preScore).toBeGreaterThan(0);
        expect(r.postScore).toBeGreaterThan(0);
        expect(typeof r.delta).toBe('number');
    });

    it('exits early with zero scores on validation error', async () => {
        const file = createTempFile(MISSING_DESC, tmpDir);
        const r = await refine('skill', file, { auto: true });
        expect(r.preScore).toBe(0);
        expect(r.postScore).toBe(0);
        expect(r.delta).toBe(0);
    });

    it('runs with --save flag', async () => {
        const file = createTempFile(GOOD_SKILL, tmpDir);
        const r = await refine('skill', file, { auto: true, save: true });
        expect(r.preScore).toBeGreaterThan(0);
    });

    it('runs with custom target', async () => {
        const file = createTempFile(GOOD_SKILL, tmpDir);
        const r = await refine('skill', file, { auto: true, target: 'codex' });
        expect(r.preScore).toBeGreaterThan(0);
    });

    it('captures low-scoring dimension notes as suggestions', async () => {
        const content = `---
name: minimal
description: ok
---

This is a short skill body that is long enough to pass strict checks.`;
        const file = createTempFile(content, tmpDir);
        const r = await refine('skill', file, { auto: true });
        expect(r.preScore).toBeGreaterThan(0);
        expect(r.fixesApplied.length + r.fixesSkipped.length).toBeGreaterThan(0);
        // Regression: no dimension-derived findings should be auto-apply
        const autoApplySkipped = r.fixesSkipped.filter((f) => f.strategy === 'auto-apply');
        expect(autoApplySkipped.length).toBe(0);
    });

    it('handles delta display when no change', async () => {
        const content = `---
name: perfect-skill
description: A very detailed and comprehensive description of this skill for evaluating purposes
---

## Overview
This is a thorough skill body with excellent documentation covering all dimensions.
It uses clear, imperative language with must, should, never, and always keywords.
`;
        const file = createTempFile(content, tmpDir);
        const r = await refine('skill', file, { auto: true });
        expect(r.preScore).toBeGreaterThanOrEqual(0);
    });

    it('handles backup collision when .bak exists', async () => {
        const file = createTempFile(GOOD_SKILL, tmpDir);
        // Pre-create a .bak file to trigger the collision path
        writeFileSync(`${file}.bak`, 'stale backup');
        const r = await refine('skill', file, { auto: true });
        expect(r.preScore).toBeGreaterThan(0);
    });

    it('classifies deprecated field warnings as auto-apply in --auto mode', async () => {
        const content = `---
name: deprecated-test
description: A skill that uses a deprecated field for testing auto-apply classification
tags: [review]
---

## Overview
This skill uses the deprecated 'tags' field, which should be classified as auto-apply.
`;
        const file = createTempFile(content, tmpDir);
        const r = await refine('skill', file, { auto: true });
        expect(r.preScore).toBeGreaterThan(0);
        // The deprecated 'tags' field warning is classified as auto-apply but
        // generateAutoChange returns null (no handler for deprecated fields),
        // so it's recorded as skipped, not applied.
        expect(r.fixesApplied.length + r.fixesSkipped.length).toBeGreaterThan(0);
        const autoApplyFindings = [...r.fixesApplied, ...r.fixesSkipped].filter((f) => f.strategy === 'auto-apply');
        expect(autoApplyFindings.length).toBeGreaterThan(0);
    });
});
// ── refine — file not found ──────────────────────────────────────────────────

describe('refine — file not found', () => {
    beforeEach(() => {
        spyOn(process.stdout, 'write').mockImplementation(() => true);
        spyOn(process.stderr, 'write').mockImplementation(() => true);
    });

    it('exits with zero scores for non-existent file', async () => {
        const r = await refine('skill', '/nonexistent/file.md', { auto: true });
        expect(r.preScore).toBe(0);
        expect(r.postScore).toBe(0);
        expect(r.delta).toBe(0);
    });
});

// ── RefineAbortedError ───────────────────────────────────────────────────────

describe('RefineAbortedError', () => {
    it('is an instance of Error', () => {
        const err = new RefineAbortedError();
        expect(err).toBeInstanceOf(Error);
        expect(err).toBeInstanceOf(RefineAbortedError);
    });

    it('has descriptive message', () => {
        expect(new RefineAbortedError('User quit').message).toBe('User quit');
    });

    it('defaults to User quit message', () => {
        expect(new RefineAbortedError().message).toBe('User quit interactive mode');
    });
});
