import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classifyFix, generateAutoChange, RefineAbortedError, refine } from '../../src/operations/refine';
import type { Finding } from '../../src/operations/validate';
import { parseFrontmatter } from '../../src/content/frontmatter';

/** Good skill content with all required fields and decent body. */
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

/** Skill with missing description — structural error. */
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

describe('classifyFix', () => {
    it('classifies error severity as auto-apply', () => {
        const finding: Finding = { severity: 'error', field: 'description', message: 'Missing required field' };
        expect(classifyFix(finding)).toBe('auto-apply');
    });

    it('classifies description warnings as suggest', () => {
        const finding: Finding = { severity: 'warning', field: 'description', message: 'Too short' };
        expect(classifyFix(finding)).toBe('suggest');
    });

    it('classifies trigger-accuracy as suggest', () => {
        const finding: Finding = { severity: 'warning', field: 'trigger-accuracy', message: 'overlap' };
        expect(classifyFix(finding)).toBe('suggest');
    });

    it('classifies clarity as suggest', () => {
        const finding: Finding = { severity: 'warning', field: 'clarity', message: 'vague' };
        expect(classifyFix(finding)).toBe('suggest');
    });

    it('classifies conciseness as suggest', () => {
        const finding: Finding = { severity: 'warning', field: 'conciseness', message: 'verbose' };
        expect(classifyFix(finding)).toBe('suggest');
    });

    it('classifies skill-linkage as flag', () => {
        const finding: Finding = { severity: 'warning', field: 'skill-linkage', message: 'merge' };
        expect(classifyFix(finding)).toBe('flag');
    });

    it('classifies tool-selection as flag', () => {
        const finding: Finding = { severity: 'warning', field: 'tool-selection', message: 'redesign' };
        expect(classifyFix(finding)).toBe('flag');
    });

    it('classifies model-fit as flag', () => {
        const finding: Finding = { severity: 'warning', field: 'model-fit', message: 'change model' };
        expect(classifyFix(finding)).toBe('flag');
    });

    it('classifies platform-coverage as flag', () => {
        const finding: Finding = { severity: 'warning', field: 'platform-coverage', message: 'missing' };
        expect(classifyFix(finding)).toBe('flag');
    });

    it('defaults warning to auto-apply for unrecognized fields', () => {
        const finding: Finding = { severity: 'warning', field: 'unknown', message: 'unknown issue' };
        expect(classifyFix(finding)).toBe('auto-apply');
    });
});

describe('generateAutoChange', () => {
    it('generates frontmatter change for missing field', () => {
        const finding: Finding = { severity: 'error', field: 'description', message: 'Missing required field' };
        const content = `---\nname: test\n---\n\nbody`;
        const change = generateAutoChange(finding, content);
        expect(change).not.toBeNull();
        expect(change?.kind).toBe('frontmatter');
        expect((change as { key: string }).key).toBe('description');
    });

    it('generates array change for wrong type (string→array)', () => {
        const finding: Finding = { severity: 'error', field: 'allowed-tools', message: 'must be an array, got string' };
        const content = `---\nname: test\ndescription: d\nallowed-tools: read\n---\n\nbody`;
        const change = generateAutoChange(finding, content);
        expect(change).not.toBeNull();
        expect(change?.kind).toBe('frontmatter');
        const key = (change as { key: string }).key;
        expect(key).toBe('allowed-tools');
        const value = (change as { value: unknown }).value;
        expect(Array.isArray(value)).toBe(true);
    });

    it('generates string change for wrong type (number→string)', () => {
        const finding: Finding = { severity: 'error', field: 'description', message: 'must be a string, got number' };
        const content = `---\nname: test\ndescription: 42\n---\n\nbody`;
        const change = generateAutoChange(finding, content);
        expect(change).not.toBeNull();
        expect(change?.kind).toBe('frontmatter');
        const value = (change as { value: unknown }).value;
        expect(value).toBe('42');
    });

    it('returns null for unrecognized finding message', () => {
        const finding: Finding = { severity: 'error', field: 'something', message: 'Unknown problem' };
        const change = generateAutoChange(finding, '---\nname: test\n---\n\n');
        expect(change).toBeNull();
    });

    it('returns null when frontmatter parse fails', () => {
        const finding: Finding = { severity: 'error', field: 'field', message: 'must be an array, got string' };
        const change = generateAutoChange(finding, 'not valid frontmatter');
        expect(change).toBeNull();
    });
});

describe('refine — auto mode', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'superskill-refine-auto-'));
    });

    afterEach(() => {
        if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
    });

    it('refines a skill without errors', async () => {
        const file = createTempFile(GOOD_SKILL, tmpDir);
        const result = await refine('skill', file, { auto: true });
        expect(result.preScore).toBeGreaterThan(0);
        expect(result.postScore).toBeGreaterThan(0);
        expect(typeof result.delta).toBe('number');
        expect(Array.isArray(result.fixesApplied)).toBe(true);
        expect(Array.isArray(result.fixesSkipped)).toBe(true);
    });

    it('exits early with zero scores on validation error', async () => {
        const file = createTempFile(MISSING_DESC, tmpDir);
        const result = await refine('skill', file, { auto: true });
        expect(result.preScore).toBe(0);
        expect(result.postScore).toBe(0);
        expect(result.delta).toBe(0);
    });
});

describe('refine — file not found', () => {
    it('exits with zero scores for non-existent file', async () => {
        const result = await refine('skill', '/nonexistent/file.md', { auto: true });
        expect(result.preScore).toBe(0);
        expect(result.postScore).toBe(0);
        expect(result.delta).toBe(0);
    });
});

describe('RefineAbortedError', () => {
    it('is an instance of Error', () => {
        const err = new RefineAbortedError();
        expect(err).toBeInstanceOf(Error);
        expect(err).toBeInstanceOf(RefineAbortedError);
    });

    it('has descriptive message', () => {
        const err = new RefineAbortedError('User quit');
        expect(err.message).toBe('User quit');
    });

    it('defaults to User quit message', () => {
        const err = new RefineAbortedError();
        expect(err.message).toBe('User quit interactive mode');
    });
});
