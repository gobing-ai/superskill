import { describe, expect, it } from 'bun:test';
import type { ValidationResult } from '../../src/operations/validate';
import { _validateContent, formatValidationResult, validate } from '../../src/operations/validate';

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

    it('reports missing event for hook', () => {
        const result = _validateContent('hook', fm('x', { description: 'd' }));
        expect(result.valid).toBe(false);
        expect(result.findings.some((f) => f.field === 'event')).toBe(true);
    });

    it('passes agent with all required fields', () => {
        const result = _validateContent('agent', fm('x', { description: 'd', model: 'sonnet' }));
        assertValid(result);
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
            const result = _validateContent('agent', fm('x', { description: 'd', model: m }));
            assertValid(result);
        }
    });

    it('accepts full claude-* model id', () => {
        const result = _validateContent('agent', fm('x', { description: 'd', model: 'claude-sonnet-4' }));
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

    it('no tool warning for pi target without tools', () => {
        const result = _validateContent('agent', fm('x', { description: 'd', model: 'sonnet' }), { target: 'pi' });
        expect(result.findings.some((f) => f.field === 'tools')).toBe(false);
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

    it('accepts valid reference format', () => {
        const result = _validateContent('skill', fm('x', { description: 'd', skill: 'code-review' }));
        expect(result.findings.some((f) => f.field === 'skill')).toBe(false);
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

describe('_validateContent — Content type coverage', () => {
    it('validates skill type', () => {
        assertValid(_validateContent('skill', fm('x', { description: 'd' })));
    });
    it('validates command type', () => {
        assertValid(_validateContent('command', fm('x', { description: 'd' })));
    });
    it('validates agent type', () => {
        assertValid(_validateContent('agent', fm('x', { description: 'd', model: 'sonnet' })));
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
});
