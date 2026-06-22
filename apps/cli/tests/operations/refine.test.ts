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

    it('skips unknown missing fields rather than inserting a TODO placeholder (R3)', () => {
        const c = generateAutoChange(
            { severity: 'error', field: 'unknown-field', message: 'Missing required field' },
            '---\nname: test\n---\n\nbody',
        );
        expect(c).toBeNull();
    });

    it('uses inherit as the model default (recognized alias, never the penalised "default")', () => {
        const c = generateAutoChange(
            { severity: 'error', field: 'model', message: 'Missing required field' },
            '---\nname: test\ndescription: d\n---\n\nbody',
        );
        expect((c as { value: unknown }).value).toBe('inherit');
    });

    it('uses an empty array for a missing tools field (unblocks validation, score-neutral)', () => {
        const c = generateAutoChange(
            { severity: 'error', field: 'tools', message: 'Missing required field' },
            '---\nname: test\ndescription: d\n---\n\nbody',
        );
        expect(Array.isArray((c as { value: unknown }).value)).toBe(true);
        expect((c as { value: unknown[] }).value).toHaveLength(0);
    });

    it('derives a description default from the name field (non-TODO, humanized)', () => {
        const c = generateAutoChange(
            { severity: 'error', field: 'description', message: 'Missing required field' },
            '---\nname: code-reviewer\n---\n\nbody',
        );
        expect((c as { value: unknown }).value).toBe('Code Reviewer');
    });

    it('derives a description default from the first body H1 when name is absent', () => {
        const c = generateAutoChange(
            { severity: 'error', field: 'description', message: 'Missing required field' },
            '---\n---\n\n# Code Reviewer\n\nbody',
        );
        expect((c as { value: unknown }).value).toBe('Code Reviewer');
    });

    it('skips a missing description when no name and no H1 are available (never TODO)', () => {
        const c = generateAutoChange(
            { severity: 'error', field: 'description', message: 'Missing required field' },
            '---\n---\n\nbody with no heading',
        );
        expect(c).toBeNull();
    });

    it('derives a missing name from the first body H1 (slugified)', () => {
        const c = generateAutoChange(
            { severity: 'error', field: 'name', message: 'Missing required field' },
            '---\ndescription: d\n---\n\n# Code Reviewer\n\nbody',
        );
        expect((c as { value: unknown }).value).toBe('code-reviewer');
    });

    it('skips a missing name when no H1 is available', () => {
        const c = generateAutoChange(
            { severity: 'error', field: 'name', message: 'Missing required field' },
            '---\ndescription: d\n---\n\nbody with no heading',
        );
        expect(c).toBeNull();
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

    it('fixes a missing-description skill instead of exiting early (R1+R3)', async () => {
        const file = createTempFile(MISSING_DESC, tmpDir);
        const r = await refine('skill', file, { auto: true });
        // R1: the auto-apply path is now reachable — a structural fix is applied,
        // not a pre-fix-loop early return with hollow zero scores.
        expect(r.fixesApplied.length).toBeGreaterThan(0);
        // R3: the inserted value is a real, schema-aware default — never TODO.
        const after = readFileSync(file, 'utf8');
        expect(after).toContain('description:');
        expect(after).not.toContain('TODO');
        // Refine is monotonic-or-neutral: the score never drops.
        expect(r.postScore).toBeGreaterThanOrEqual(r.preScore);
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

    it('raises the score on a missing-field agent (monotonic, delta > 0)', async () => {
        // Agent completeness is presence-based (no structure multiplier), so
        // inserting missing required fields strictly raises the aggregate —
        // exercising the score-changed delta display branch.
        const content = `---
name: code-reviewer
tools:
  - Read
  - Bash
---

# Code Reviewer

You are a code review specialist. You review code for quality and security.
`;
        const file = createTempFile(content, tmpDir);
        const r = await refine('agent', file, { auto: true });
        expect(r.fixesApplied.length).toBeGreaterThan(0);
        expect(r.postScore).toBeGreaterThan(r.preScore);
        expect(r.delta).toBeGreaterThan(0);
        const after = readFileSync(file, 'utf8');
        expect(after).toContain('model: inherit');
        expect(after).not.toContain('TODO');
    });

    it('aborts when unfixable validation errors remain after structural fixes', async () => {
        // Empty frontmatter with a heading-less body: name and description are
        // both required-and-missing, but neither has a derivable default (no
        // name, no H1), so generateAutoChange skips them. Re-validation still
        // fails → refine reports the remaining errors and aborts (R1: only bail
        // when errors REMAIN, never before).
        const content = `---
---

body with no heading`;
        const file = createTempFile(content, tmpDir);
        const r = await refine('skill', file, { auto: true });
        // Aborted before re-evaluation: post-score mirrors pre-score (no degradation).
        expect(r.postScore).toBe(r.preScore);
        expect(r.delta).toBe(0);
    });
});

// ── refine — dry-run ─────────────────────────────────────────────────────────

describe('refine — dry-run', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'superskill-refine-dry-'));
        spyOn(process.stdout, 'write').mockImplementation(() => true);
        spyOn(process.stderr, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
        if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
    });

    it('leaves the file byte-identical (writes nothing, no backup residue)', async () => {
        const file = createTempFile(MISSING_DESC, tmpDir);
        const before = readFileSync(file, 'utf8');
        const r = await refine('skill', file, { auto: true, dryRun: true });
        expect(readFileSync(file, 'utf8')).toBe(before);
        // No backup created in dry-run.
        expect(existsSync(`${file}.bak`)).toBe(false);
        // Nothing is applied; all findings surface as skipped in the preview.
        expect(r.fixesApplied).toHaveLength(0);
        expect(r.fixesSkipped.length).toBeGreaterThan(0);
    });

    it('classifies structural fixes as auto-apply even on an invalid file (R1 reachable in preview)', async () => {
        const file = createTempFile(MISSING_DESC, tmpDir);
        const r = await refine('skill', file, { auto: true, dryRun: true });
        const structural = r.fixesSkipped.filter((f) => f.field === 'description');
        expect(structural.length).toBeGreaterThan(0);
    });

    it('does not persist when --dry-run is combined with --save', async () => {
        const file = createTempFile(GOOD_SKILL, tmpDir);
        const before = readFileSync(file, 'utf8');
        await refine('skill', file, { auto: true, dryRun: true, save: true });
        // Dry-run short-circuits before the save step: file untouched.
        expect(readFileSync(file, 'utf8')).toBe(before);
    });
});

// ── refine — command type regression (task 0058) ──────────────────────────────

describe('refine — command type', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'superskill-refine-command-'));
        spyOn(process.stdout, 'write').mockImplementation(() => true);
        spyOn(process.stderr, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
        if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
    });

    it('fixes a missing-description command with a real default, not TODO (C3, R1+R3)', async () => {
        // Command's required field set is ['description']. A command missing
        // description but with a body H1 gets a humanized default derived from
        // the heading — never a TODO placeholder, and refine is monotonic.
        const content = `---
name: deploy
---

# Deploy Command

You are a deployment specialist. Wrap the deploy workflow.
`;
        const file = createTempFile(content, tmpDir);
        const r = await refine('command', file, { auto: true });
        // R1: structural auto-apply is reachable — a real fix is applied.
        expect(r.fixesApplied.length).toBeGreaterThan(0);
        // R3: the inserted value is schema-aware, never TODO.
        const after = readFileSync(file, 'utf8');
        expect(after).toContain('description:');
        expect(after).not.toContain('TODO');
        // Monotonic-or-neutral: score never drops.
        expect(r.postScore).toBeGreaterThanOrEqual(r.preScore);
    });

    it('--dry-run leaves a command file byte-identical and writes no backup (C3, R2)', async () => {
        const content = `---
name: deploy
---

# Deploy Command

You are a deployment specialist. Wrap the deploy workflow.
`;
        const file = createTempFile(content, tmpDir);
        const before = readFileSync(file, 'utf8');
        await refine('command', file, { auto: true, dryRun: true });
        expect(readFileSync(file, 'utf8')).toBe(before);
        expect(existsSync(`${file}.bak`)).toBe(false);
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
