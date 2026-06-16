import { describe, expect, it } from 'bun:test';
import { exitFor, resolveTarget } from '../../src/commands/helpers';

describe('resolveTarget', () => {
    it('returns claude as default', () => {
        expect(resolveTarget({})).toBe('claude');
    });

    it('returns explicit target', () => {
        expect(resolveTarget({ target: 'codex' })).toBe('codex');
    });

    it('throws on unknown target', () => {
        expect(() => resolveTarget({ target: 'unknown' })).toThrow('Unknown target');
    });

    it('accepts all valid targets', () => {
        const targets = [
            'claude',
            'codex',
            'pi',
            'omp',
            'opencode',
            'antigravity-cli',
            'antigravity-ide',
            'hermes',
        ] as const;
        for (const t of targets) {
            expect(() => resolveTarget({ target: t })).not.toThrow();
        }
    });
});

describe('exitFor', () => {
    it('returns 2 for _file field', () => {
        expect(exitFor({ valid: false, findings: [{ field: '_file' }] })).toBe(2);
    });

    it('returns 1 for invalid with no _file', () => {
        expect(exitFor({ valid: false, findings: [{ field: 'name' }] })).toBe(1);
    });

    it('returns 0 for valid', () => {
        expect(exitFor({ valid: true, findings: [] })).toBe(0);
    });

    it('returns 0 for undefined valid', () => {
        expect(exitFor({ findings: [] })).toBe(0);
    });

    it('returns 2 when _file is present among multiple findings', () => {
        expect(exitFor({ valid: false, findings: [{ field: 'name' }, { field: '_file' }] })).toBe(2);
    });
});
