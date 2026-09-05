import { describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ValidationResult } from '../../src/operations/validate';
import {
    _validateContent,
    checkPluginSkillLayout,
    formatValidationResult,
    isPluginSkillPath,
    validate,
} from '../../src/operations/validate';

function fm(name: string, extra: Record<string, unknown> = {}, body = 'Body content for testing.'): string {
    const lines = [`name: ${name}`];
    for (const [k, v] of Object.entries(extra)) {
        if (Array.isArray(v)) lines.push(`${k}:\n  - ${v.join('\n  - ')}`);
        else lines.push(`${k}: ${v}`);
    }
    return `---\n${lines.join('\n')}\n---\n\n${body}`;
}

function assertValid(result: ValidationResult): void {
    if (!result.valid) {
        const errors = result.findings.filter((f) => f.severity === 'error');
        throw new Error(`Expected valid but got ${errors.length} error(s): ${errors.map((e) => e.message).join('; ')}`);
    }
}

describe('_validateContent — Frontmatter presence', () => {
    it('accepts valid frontmatter', () => {
        const result = _validateContent('skill', fm('x', { description: 'd' }));
        assertValid(result);
    });

    it('reports error on missing frontmatter', () => {
        const result = _validateContent('skill', 'no frontmatter here');
        expect(result.valid).toBe(false);
        expect(result.findings).toHaveLength(1);
        expect(result.findings[0]?.field).toBe('frontmatter');
    });

    it('reports error on malformed YAML', () => {
        const result = _validateContent('skill', '---\nname: [unclosed\n---\nbody');
        expect(result.valid).toBe(false);
        expect(result.findings[0]?.message).toContain('YAML parse error');
    });

    it('handles empty content', () => {
        const result = _validateContent('skill', '---\n---');
        expect(result.valid).toBe(false);
        expect(result.findings[0]?.field).toBe('frontmatter');
    });
});

describe('_validateContent — Required fields', () => {
    it('passes when all required fields present', () => {
        const result = _validateContent('skill', fm('x', { description: 'd' }));
        assertValid(result);
    });

    it('reports missing description for skill', () => {
        const result = _validateContent('skill', fm('x'));
        expect(result.valid).toBe(false);
        expect(result.findings.some((f) => f.field === 'description' && f.severity === 'error')).toBe(true);
    });

    it('reports missing model for agent', () => {
        const result = _validateContent('agent', fm('x', { description: 'd' }));
        expect(result.valid).toBe(false);
        expect(result.findings.some((f) => f.field === 'model')).toBe(true);
    });

    it('passes hook with any fields (hooks are JSON-based, frontmatter not required)', () => {
        const result = _validateContent('hook', fm('x', { description: 'd' }));
        // REQUIRED_FIELDS.hook = [] (task 0051 — hooks evaluate hooks.json, not .md)
        expect(result.valid).toBe(true);
    });
    it('passes agent with all required fields', () => {
        const result = _validateContent(
            'agent',
            fm('x', { description: 'd', model: 'sonnet', tools: ['read', 'edit'] }),
        );
        assertValid(result);
    });

    it('reports missing tools for agent', () => {
        // Regression: H2 — tools is now in REQUIRED_FIELDS.agent
        const result = _validateContent('agent', fm('x', { description: 'd', model: 'sonnet' }));
        expect(result.valid).toBe(false);
        expect(result.findings.some((f) => f.field === 'tools')).toBe(true);
    });

    it('passes hook with all required fields', () => {
        const result = _validateContent('hook', fm('x', { description: 'd', event: 'PreToolUse' }));
        assertValid(result);
    });
});

describe('_validateContent — Field types', () => {
    it('accepts string fields', () => {
        const result = _validateContent('skill', fm('x', { description: 'd' }));
        assertValid(result);
    });

    it('reports type error for array field given string', () => {
        const result = _validateContent('skill', fm('x', { description: 'd', 'allowed-tools': 'not-an-array' }));
        expect(result.valid).toBe(false);
        expect(result.findings.some((f) => f.field === 'allowed-tools')).toBe(true);
    });

    it('accepts array fields as arrays', () => {
        const result = _validateContent(
            'skill',
            fm('x', { description: 'd', 'allowed-tools': ['bash'] } as Record<string, unknown>),
        );
        assertValid(result);
    });

    it('accepts valid model alias', () => {
        for (const m of ['inherit', 'sonnet', 'opus', 'haiku']) {
            const result = _validateContent('agent', fm('x', { description: 'd', model: m, tools: ['read'] }));
            assertValid(result);
        }
    });

    it('accepts full claude-* model id', () => {
        const result = _validateContent(
            'agent',
            fm('x', { description: 'd', model: 'claude-sonnet-4', tools: ['read'] }),
        );
        assertValid(result);
    });

    it('reports error for unrecognized model value', () => {
        const result = _validateContent('agent', fm('x', { description: 'd', model: 'smol' }));
        expect(result.valid).toBe(false);
        expect(result.findings.some((f) => f.field === 'model')).toBe(true);
    });

    it('reports type error for non-array arguments field', () => {
        const result = _validateContent('command', fm('x', { description: 'd', arguments: 'not-array' }));
        expect(result.valid).toBe(false);
        expect(result.findings.some((f) => f.field === 'arguments')).toBe(true);
    });
});

describe('_validateContent — Format compliance', () => {
    it('warns on tools (plural) for pi target', () => {
        const result = _validateContent(
            'agent',
            fm('x', { description: 'd', model: 'sonnet', tools: ['bash'] } as Record<string, unknown>),
            { target: 'pi' },
        );
        expect(result.findings.some((f) => f.field === 'tools' && f.severity === 'warning')).toBe(true);
    });

    it('warns on leading / in command name for codex', () => {
        const result = _validateContent('command', fm('/deploy', { description: 'd' }), { target: 'codex' });
        expect(result.findings.some((f) => f.field === 'name' && f.severity === 'warning')).toBe(true);
    });

    it('no slash warning for codex without leading /', () => {
        const result = _validateContent('command', fm('deploy', { description: 'd' }), { target: 'codex' });
        expect(result.findings.some((f) => f.field === 'name')).toBe(false);
    });
});

describe('_validateContent — Link validity', () => {
    it('accepts known hook event', () => {
        const result = _validateContent('hook', fm('x', { description: 'd', event: 'PreToolUse' }));
        const eventWarnings = result.findings.filter((f) => f.field === 'event');
        expect(eventWarnings).toHaveLength(0);
    });

    it('warns on unknown hook event', () => {
        const result = _validateContent('hook', fm('x', { description: 'd', event: 'UnknownEvent' }));
        expect(result.findings.some((f) => f.field === 'event' && f.severity === 'warning')).toBe(true);
    });

    it('warns on invalid reference format', () => {
        const result = _validateContent('skill', fm('x', { description: 'd', skill: 'INVALID Name!' }));
        expect(result.findings.some((f) => f.field === 'skill' && f.severity === 'warning')).toBe(true);
    });

    it('warns when reference file not found on disk', () => {
        const refNotFound = (_refType: string, _refName: string) => false;
        const result = _validateContent('skill', fm('x', { description: 'd', skill: 'missing-ref' }), {
            referenceChecker: refNotFound,
        });
        const warnings = result.findings.filter((f) => f.field === 'skill' && f.severity === 'warning');
        expect(warnings.length).toBeGreaterThanOrEqual(1);
        expect(warnings.some((f) => f.message.includes('not found on disk'))).toBe(true);
    });

    it('accepts reference when file found on disk', () => {
        const refFound = (_refType: string, _refName: string) => true;
        const result = _validateContent('skill', fm('x', { description: 'd', skill: 'existing-ref' }), {
            referenceChecker: refFound,
        });
        const warnings = result.findings.filter((f) => f.field === 'skill');
        expect(warnings).toHaveLength(0);
    });

    it('format check still applies without referenceChecker', () => {
        const result = _validateContent('skill', fm('x', { description: 'd', skill: 'INVALID Name!' }));
        expect(result.findings.some((f) => f.field === 'skill' && f.severity === 'warning')).toBe(true);
    });

    it('accepts valid reference format', () => {
        const result = _validateContent('skill', fm('x', { description: 'd', skill: 'code-review' }));
        expect(result.findings.some((f) => f.field === 'skill')).toBe(false);
    });

    // R2 regression: skill/agent/command reference fields recognized for all content types (no "unknown field" warning)
    it('recognizes skill/agent/command reference fields without unknown-field warnings', () => {
        for (const field of ['skill', 'agent', 'command'] as const) {
            const result = _validateContent('command', fm('x', { description: 'd', [field]: 'code-review' }));
            const unknownWarning = result.findings.some(
                (f) => f.severity === 'warning' && f.message.toLowerCase().includes('unknown'),
            );
            expect(unknownWarning).toBe(false);
        }
    });
});

describe('_validateContent — Strict checks', () => {
    it('warns on short description', () => {
        const result = _validateContent('skill', fm('x', { description: 'short' }, 'body'), { strict: true });
        expect(result.findings.some((f) => f.field === 'description' && f.severity === 'warning')).toBe(true);
    });

    it('no warning for adequate description', () => {
        const result = _validateContent('skill', fm('x', { description: 'A'.repeat(40) }, 'body'), { strict: true });
        expect(result.findings.some((f) => f.field === 'description')).toBe(false);
    });

    it('warns on short body', () => {
        const result = _validateContent('skill', fm('x', { description: 'd' }, 'ab'), { strict: true });
        expect(result.findings.some((f) => f.field === 'body')).toBe(true);
    });

    it('no short body warning without strict', () => {
        const result = _validateContent('skill', fm('x', { description: 'short' }, 'ab'), { strict: false });
        expect(result.findings.some((f) => f.field === 'body')).toBe(false);
    });

    it('warns on deprecated field', () => {
        const result = _validateContent('skill', fm('x', { description: 'd', tags: 'old' }, 'body'), { strict: true });
        expect(result.findings.some((f) => f.field === 'tags' && f.severity === 'warning')).toBe(true);
    });

    it('strict checks are only warnings', () => {
        const result = _validateContent('skill', fm('x', { description: 'ab', tags: 'x' }, 'short'), { strict: true });
        expect(result.valid).toBe(true);
        expect(result.findings.every((f) => f.severity === 'warning')).toBe(true);
    });
});

describe('_validateContent — ValidationResult.valid', () => {
    it('valid is true when no findings', () => {
        const result = _validateContent('skill', fm('x', { description: 'd' }));
        expect(result.valid).toBe(true);
        expect(result.findings).toHaveLength(0);
    });

    it('valid is true when only warnings', () => {
        const result = _validateContent('skill', fm('x', { description: 'd', event: 'UnknownEvent' }, 'body'), {
            strict: true,
        });
        expect(result.valid).toBe(true);
    });

    it('valid is false when any error', () => {
        const result = _validateContent('skill', fm('x'));
        expect(result.valid).toBe(false);
    });
});

// ── F4: strict unknown-key warning ──
it('warns on unknown frontmatter key under --strict', () => {
    const result = _validateContent('skill', fm('x', { description: 'd', foo: 'bar' }), { strict: true });
    expect(result.findings.some((f) => f.field === 'foo' && f.severity === 'warning')).toBe(true);
    expect(result.valid).toBe(true); // warning, not error
});

it('does not warn on unknown key without --strict', () => {
    const result = _validateContent('skill', fm('x', { description: 'd', foo: 'bar' }), { strict: false });
    expect(result.findings.some((f) => f.field === 'foo')).toBe(false);
});

it('does not warn on known-optional fields', () => {
    // command allowed-tools: is KNOWN_OPTIONAL
    const result = _validateContent('command', fm('x', { description: 'd', 'allowed-tools': ['read'] }), {
        strict: true,
    });
    expect(result.findings.some((f) => f.field === 'allowed-tools')).toBe(false);
});

it('does not double-report deprecated keys as unknown', () => {
    const result = _validateContent('skill', fm('x', { description: 'd', tags: 'old' }), { strict: true });
    // deprecated tag should only appear once
    const tagFindings = result.findings.filter((f) => f.field === 'tags');
    expect(tagFindings.length).toBe(1);
    expect(tagFindings[0]?.message).toContain('deprecated');
});

describe('_validateContent — Content type coverage', () => {
    it('validates skill type', () => {
        assertValid(_validateContent('skill', fm('x', { description: 'd' })));
    });
    it('validates command type', () => {
        assertValid(_validateContent('command', fm('x', { description: 'd' })));
    });
    it('validates agent type', () => {
        assertValid(_validateContent('agent', fm('x', { description: 'd', model: 'sonnet', tools: ['read'] })));
    });
    it('validates hook type', () => {
        assertValid(_validateContent('hook', fm('x', { description: 'd', event: 'PreToolUse' })));
    });
    it('validates magent type', () => {
        assertValid(_validateContent('magent', fm('x', { description: 'd' })));
    });
});

describe('formatValidationResult', () => {
    it('returns "Valid" for empty findings', () => {
        const result: ValidationResult = { valid: true, findings: [] };
        expect(formatValidationResult(result)).toBe('Valid');
    });

    it('formats findings as [SEVERITY] field: message', () => {
        const result: ValidationResult = {
            valid: false,
            findings: [{ severity: 'error', field: 'name', message: 'Missing required field' }],
        };
        const output = formatValidationResult(result);
        expect(output).toContain('[ERROR]');
        expect(output).toContain('name:');
        expect(output).toContain('Missing required field');
    });

    it('formats warnings as [WARNING]', () => {
        const result: ValidationResult = {
            valid: true,
            findings: [{ severity: 'warning', field: 'body', message: 'Too short' }],
        };
        expect(formatValidationResult(result)).toContain('[WARNING]');
    });

    it('JSON mode returns parseable JSON', () => {
        const result: ValidationResult = {
            valid: false,
            findings: [{ severity: 'error', field: 'x', message: 'm' }],
        };
        const json = formatValidationResult(result, true);
        const parsed = JSON.parse(json);
        expect(parsed.valid).toBe(false);
        expect(parsed.findings).toHaveLength(1);
    });

    it('joins multiple findings with newlines', () => {
        const result: ValidationResult = {
            valid: false,
            findings: [
                { severity: 'error', field: 'a', message: 'm1' },
                { severity: 'warning', field: 'b', message: 'm2' },
            ],
        };
        const output = formatValidationResult(result);
        expect(output).toContain('\n');
        expect(output.split('\n')).toHaveLength(2);
    });
});

describe('validate — file access', () => {
    it('returns sentinel for non-existent file', async () => {
        const result = await validate('skill', '/nonexistent/path/nope.md');
        expect(result.valid).toBe(false);
        expect(result.findings[0]?.field).toBe('_file');
        expect(result.findings[0]?.message).toContain('File not found');
    });

    it('reports file-not-found for empty skill directory (B1: dir→SKILL.md, no SKILL.md present)', async () => {
        const { mkdtempSync, rmSync } = await import('node:fs');
        const { tmpdir } = await import('node:os');
        const dir = mkdtempSync(`${tmpdir()}/superskill-validate-`);
        try {
            const result = await validate('skill', dir);
            expect(result.valid).toBe(false);
            expect(result.findings[0]?.field).toBe('_file');
            expect(result.findings[0]?.message).toMatch(/not found|directory/);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('reports error for empty file', async () => {
        const { mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
        const { tmpdir } = await import('node:os');
        const dir = mkdtempSync(`${tmpdir()}/superskill-validate-`);
        try {
            const file = `${dir}/empty.md`;
            writeFileSync(file, '');
            const result = await validate('skill', file);
            expect(result.valid).toBe(false);
            expect(result.findings[0]?.field).toBe('frontmatter');
            expect(result.findings[0]?.message).toContain('empty');
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('successfully validates a real file', async () => {
        const { mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
        const { tmpdir } = await import('node:os');
        const dir = mkdtempSync(`${tmpdir()}/superskill-validate-`);
        try {
            const file = `${dir}/valid.md`;
            writeFileSync(file, '---\nname: test\ndescription: A valid test skill\n---\n\nBody content.');
            const result = await validate('skill', file);
            expect(result.valid).toBe(true);
            expect(result.findings).toHaveLength(0);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});

describe('_validateContent — Additional type branches', () => {
    it('reports error when string field has non-string value', () => {
        // Parse YAML where name is an integer
        const result = _validateContent('skill', '---\nname: 123\ndescription: d\n---\n\nBody.');
        expect(result.findings.some((f) => f.field === 'name' && f.severity === 'error')).toBe(true);
    });

    it('reports error when enum field has non-string value', () => {
        // model as integer
        const result = _validateContent('agent', '---\nname: x\ndescription: d\nmodel: 42\n---\n\nBody.');
        expect(result.findings.some((f) => f.field === 'model' && f.message.includes('must be a string'))).toBe(true);
    });
});

describe('validate — body-link integrity', () => {
    it('flags broken relative markdown link', async () => {
        const { mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
        const { tmpdir } = await import('node:os');
        const dir = mkdtempSync(`${tmpdir()}/superskill-link-`);
        try {
            writeFileSync(
                `${dir}/SKILL.md`,
                '---\nname: link-test\ndescription: Tests body links\n---\n\nSee [Broken](does-not-exist.md).',
            );
            const result = await validate('skill', dir);
            const linkFinding = result.findings.find((f) => f.field === '_links');
            expect(linkFinding).toBeDefined();
            expect(linkFinding?.message).toContain('does-not-exist.md');
            expect(linkFinding?.severity).toBe('warning');
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('skips external http links', async () => {
        const { mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
        const { tmpdir } = await import('node:os');
        const dir = mkdtempSync(`${tmpdir()}/superskill-link-`);
        try {
            writeFileSync(
                `${dir}/SKILL.md`,
                '---\nname: link-test\ndescription: Tests body links\n---\n\nSee [External](https://example.com).',
            );
            const result = await validate('skill', dir);
            expect(result.findings.filter((f) => f.field === '_links')).toHaveLength(0);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('skips anchor-only links', async () => {
        const { mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
        const { tmpdir } = await import('node:os');
        const dir = mkdtempSync(`${tmpdir()}/superskill-link-`);
        try {
            writeFileSync(
                `${dir}/SKILL.md`,
                '---\nname: link-test\ndescription: Tests body links\n---\n\nSee [Anchor](#section).',
            );
            const result = await validate('skill', dir);
            expect(result.findings.filter((f) => f.field === '_links')).toHaveLength(0);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('does not flag valid relative link', async () => {
        const { mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
        const { tmpdir } = await import('node:os');
        const dir = mkdtempSync(`${tmpdir()}/superskill-link-`);
        try {
            writeFileSync(
                `${dir}/SKILL.md`,
                '---\nname: link-test\ndescription: Tests body links\n---\n\nSee [Valid](existing.md).',
            );
            writeFileSync(`${dir}/existing.md`, '# Exists');
            const result = await validate('skill', dir);
            expect(result.findings.filter((f) => f.field === '_links')).toHaveLength(0);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('strips #anchor before resolving so foo.md#section checks foo.md', async () => {
        const { mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
        const { tmpdir } = await import('node:os');
        const dir = mkdtempSync(`${tmpdir()}/superskill-link-`);
        try {
            writeFileSync(
                `${dir}/SKILL.md`,
                '---\nname: link-test\ndescription: Tests body links\n---\n\nSee [Section](existing.md#part-two).',
            );
            writeFileSync(`${dir}/existing.md`, '# Exists');
            const result = await validate('skill', dir);
            expect(result.findings.filter((f) => f.field === '_links')).toHaveLength(0);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('skips mailto: and other scheme-qualified links', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'superskill-link-'));
        try {
            writeFileSync(
                `${dir}/SKILL.md`,
                '---\nname: link-test\ndescription: Tests body links\n---\n\nContact [us](mailto:dev@example.com).',
            );
            const result = await validate('skill', dir);
            expect(result.findings.filter((f) => f.field === '_links')).toHaveLength(0);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    // R4 regression: links inside fenced code blocks are not checked
    it('ignores markdown links inside fenced code blocks', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'validate-fenced-'));
        try {
            writeFileSync(
                `${dir}/SKILL.md`,
                '---\nname: link-test\ndescription: Tests fenced links\n---\n\nText.\n\n```ts\nconst x = "[Broken](does-not-exist.md)";\n```\n',
            );
            const result = await validate('skill', dir);
            expect(result.findings.filter((f) => f.field === '_links')).toHaveLength(0);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    // Residual-proof (F10/R10): each valid-destination fixture pairs the normalized
    // form against a file that exists ONLY under the normalized name — a validator
    // that treats angle brackets/titles/encodings as filename bytes fails the compound
    // half even if it still passes plain links (the bare half).
    it('does not flag an angle-bracket destination containing spaces when the file exists', async () => {
        const { mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
        const { tmpdir } = await import('node:os');
        const dir = mkdtempSync(`${tmpdir()}/superskill-link-`);
        try {
            writeFileSync(`${dir}/guide file.md`, '# Guide');
            writeFileSync(
                `${dir}/SKILL.md`,
                '---\nname: link-test\ndescription: Tests angle links\n---\n\nSee [Guide](<guide file.md>).',
            );
            const result = await validate('skill', dir);
            expect(result.findings.filter((f) => f.field === '_links')).toHaveLength(0);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('reports a missing angle-bracket destination by its normalized name', async () => {
        const { mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
        const { tmpdir } = await import('node:os');
        const dir = mkdtempSync(`${tmpdir()}/superskill-link-`);
        try {
            writeFileSync(
                `${dir}/SKILL.md`,
                '---\nname: link-test\ndescription: Tests angle links\n---\n\nSee [Guide](<missing file.md>).',
            );
            const result = await validate('skill', dir);
            const linkFinding = result.findings.find((f) => f.field === '_links');
            expect(linkFinding).toBeDefined();
            expect(linkFinding?.message).toContain('missing file.md');
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('accepts an unquoted destination followed by an optional title', async () => {
        const { mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
        const { tmpdir } = await import('node:os');
        const dir = mkdtempSync(`${tmpdir()}/superskill-link-`);
        try {
            writeFileSync(`${dir}/setup.md`, '# Setup');
            writeFileSync(
                `${dir}/SKILL.md`,
                '---\nname: link-test\ndescription: Tests titled links\n---\n\nSee [Setup](setup.md "Setup Guide").',
            );
            const result = await validate('skill', dir);
            expect(result.findings.filter((f) => f.field === '_links')).toHaveLength(0);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('decodes percent-encoded local path characters before the filesystem check', async () => {
        const { mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
        const { tmpdir } = await import('node:os');
        const dir = mkdtempSync(`${tmpdir()}/superskill-link-`);
        try {
            writeFileSync(`${dir}/my notes.md`, '# Notes');
            writeFileSync(
                `${dir}/SKILL.md`,
                '---\nname: link-test\ndescription: Tests encoded links\n---\n\nSee [Notes](my%20notes.md).',
            );
            const result = await validate('skill', dir);
            expect(result.findings.filter((f) => f.field === '_links')).toHaveLength(0);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('keeps percent-encoded query and fragment separators as filename characters', async () => {
        const dir = mkdtempSync(`${tmpdir()}/superskill-link-`);
        try {
            writeFileSync(`${dir}/hash#notes.md`, '# Hash');
            writeFileSync(`${dir}/query?notes.md`, '# Query');
            writeFileSync(
                `${dir}/SKILL.md`,
                '---\nname: link-test\ndescription: Tests encoded separators\n---\n\n' +
                    'See [Hash](hash%23notes.md) and [Query](query%3Fnotes.md).',
            );
            const result = await validate('skill', dir);
            expect(result.findings.filter((f) => f.field === '_links')).toHaveLength(0);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('strips query and fragment before resolving a destination', async () => {
        const { mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
        const { tmpdir } = await import('node:os');
        const dir = mkdtempSync(`${tmpdir()}/superskill-link-`);
        try {
            writeFileSync(`${dir}/spec.md`, '# Spec');
            writeFileSync(
                `${dir}/SKILL.md`,
                '---\nname: link-test\ndescription: Tests query links\n---\n\nSee [Spec](spec.md?v=2#intro).',
            );
            const result = await validate('skill', dir);
            expect(result.findings.filter((f) => f.field === '_links')).toHaveLength(0);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('falls back to the raw path on invalid percent-encoding instead of throwing', async () => {
        const { mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
        const { tmpdir } = await import('node:os');
        const dir = mkdtempSync(`${tmpdir()}/superskill-link-`);
        try {
            writeFileSync(`${dir}/raw%zzpath.md`, '# Raw');
            writeFileSync(
                `${dir}/SKILL.md`,
                '---\nname: link-test\ndescription: Tests invalid encoding\n---\n\nSee [Raw](raw%zzpath.md).',
            );
            const result = await validate('skill', dir);
            expect(result.findings.filter((f) => f.field === '_links')).toHaveLength(0);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});

describe('_validateContent — invocation-mode mismatch (strict)', () => {
    // (task 0070 R3) — invocation axis: mode/description mismatch
    const richDescription =
        '"Use when releasing, deploying, or tagging; triggers on release requests, deploy requests, whenever a version bump lands"';

    it('flags a user-invoked skill with a trigger-rich description and warns about the dispatch break', () => {
        const content = fm('x', { description: richDescription, 'disable-model-invocation': true });
        const result = _validateContent('skill', content, { strict: true });
        const finding = result.findings.find((f) => f.field === 'invocation-mode');
        expect(finding?.severity).toBe('warning');
        expect(finding?.message).toContain('cannot be fired by other skills');
    });

    it('flags a model-invoked skill whose description has no trigger phrasing', () => {
        const content = fm('x', { description: 'Runs checks' });
        const result = _validateContent('skill', content, { strict: true });
        const finding = result.findings.find((f) => f.field === 'invocation-mode');
        expect(finding?.severity).toBe('warning');
        expect(finding?.message).toContain('model-invoked');
    });

    it('does not flag a matched pair (user-invoked + one-line description)', () => {
        const content = fm('x', {
            description: 'Run the release checklist end to end',
            'disable-model-invocation': true,
        });
        const result = _validateContent('skill', content, { strict: true });
        expect(result.findings.filter((f) => f.field === 'invocation-mode')).toHaveLength(0);
    });

    it('never fires outside --strict', () => {
        const content = fm('x', { description: richDescription, 'disable-model-invocation': true });
        const result = _validateContent('skill', content);
        expect(result.findings.filter((f) => f.field === 'invocation-mode')).toHaveLength(0);
    });
});

describe('isPluginSkillPath', () => {
    it('matches plugins/<plugin>/skills/<name>/SKILL.md', () => {
        expect(isPluginSkillPath('/repo/plugins/cc/skills/pdf-editor/SKILL.md')).toBe(true);
        expect(isPluginSkillPath('plugins/cc/skills/pdf-editor/SKILL.md')).toBe(true);
    });

    it('normalizes Windows separators', () => {
        expect(isPluginSkillPath('C:\\repo\\plugins\\cc\\skills\\pdf-editor\\SKILL.md')).toBe(true);
    });

    it('rejects standalone and non-SKILL.md paths', () => {
        expect(isPluginSkillPath('/tmp/skills/pdf-editor/SKILL.md')).toBe(false);
        expect(isPluginSkillPath('/repo/plugins/cc/skills/pdf-editor/references/SKILL.md')).toBe(false);
        expect(isPluginSkillPath('/repo/plugins/cc/README.md')).toBe(false);
    });

    it('collapses .. segments before matching', () => {
        expect(isPluginSkillPath('/repo/plugins/cc/skills/foo/../pdf-editor/SKILL.md')).toBe(true);
    });

    it('residual-proof: plugins/../skills/ is not a plugin skill after collapse', () => {
        // Compound-carrying negative: the raw string contains plugins/, skills/, and SKILL.md,
        // plus a `..` coupler — after collapse it is /repo/skills/pdf-editor/SKILL.md.
        expect(isPluginSkillPath('/repo/plugins/../skills/pdf-editor/SKILL.md')).toBe(false);
    });
});

describe('validate — plugin-skill layout (ADR-015)', () => {
    const skillBody =
        '---\nname: pdf-editor\ndescription: Rotate and merge PDF files\n---\n\nBody content for testing.';

    function pluginSkillDir(): { root: string; skillDir: string; skillMd: string } {
        const root = mkdtempSync(join(tmpdir(), 'superskill-layout-'));
        const skillDir = join(root, 'plugins', 'demo', 'skills', 'pdf-editor');
        mkdirSync(skillDir, { recursive: true });
        const skillMd = join(skillDir, 'SKILL.md');
        writeFileSync(skillMd, skillBody);
        return { root, skillDir, skillMd };
    }

    it('errors when a plugin skill contains scripts/', async () => {
        const { root, skillDir } = pluginSkillDir();
        try {
            mkdirSync(join(skillDir, 'scripts'));
            const result = await validate('skill', skillDir);
            const layout = result.findings.filter((f) => f.field === '_layout');
            expect(result.valid).toBe(false);
            expect(layout).toHaveLength(1);
            expect(layout[0]?.severity).toBe('error');
            expect(layout[0]?.message).toContain('scripts/');
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    it('errors when a plugin skill contains retired extensions/', async () => {
        const { root, skillDir } = pluginSkillDir();
        try {
            mkdirSync(join(skillDir, 'extensions'));
            const result = await validate('skill', skillDir);
            expect(result.valid).toBe(false);
            expect(result.findings.some((f) => f.field === '_layout' && f.message.includes('extensions/'))).toBe(true);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    it('does not flag a plugin skill without executable subdirs', async () => {
        const { root, skillDir } = pluginSkillDir();
        try {
            const result = await validate('skill', skillDir);
            expect(result.findings.filter((f) => f.field === '_layout')).toHaveLength(0);
            expect(result.valid).toBe(true);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    it('residual-proof: standalone skill-local scripts/ is allowed', async () => {
        // Compound-carrying negative: a real scripts/ dir exists AND the path looks like a
        // skill, but it is not under plugins/*/skills/ so the layout gate must not fire.
        const root = mkdtempSync(join(tmpdir(), 'superskill-layout-standalone-'));
        try {
            const skillDir = join(root, 'skills', 'pdf-editor');
            mkdirSync(join(skillDir, 'scripts'), { recursive: true });
            writeFileSync(join(skillDir, 'SKILL.md'), skillBody);
            const result = await validate('skill', skillDir);
            expect(result.findings.filter((f) => f.field === '_layout')).toHaveLength(0);
            expect(checkPluginSkillLayout(join(skillDir, 'SKILL.md'))).toHaveLength(0);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    it('does not treat a file named scripts as a banned directory', async () => {
        const { root, skillDir, skillMd } = pluginSkillDir();
        try {
            writeFileSync(join(skillDir, 'scripts'), 'not a directory');
            expect(checkPluginSkillLayout(skillMd)).toHaveLength(0);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    it('still flags scripts/ when the SKILL.md path contains .. segments', async () => {
        const { root, skillDir } = pluginSkillDir();
        try {
            mkdirSync(join(skillDir, 'scripts'));
            // Concatenate so join() cannot collapse `..` for us.
            const sneaky = `${skillDir}/../pdf-editor/SKILL.md`;
            const layout = checkPluginSkillLayout(sneaky).filter((f) => f.field === '_layout');
            expect(layout).toHaveLength(1);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});
