import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { exitFor, resolveTarget, runOperation } from '../../src/commands/helpers';

afterEach(() => {
    mock.restore();
    process.exitCode = 0;
});

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

describe('runOperation', () => {
    it('catches thrown error and maps to exit code', async () => {
        const exit = spyOn(process, 'exit').mockImplementation(() => undefined as never);
        spyOn(process.stderr, 'write').mockImplementation(() => true);

        await runOperation(() => Promise.reject(new Error('File not found: /nope')));
        expect(process.exit).toHaveBeenCalledWith(2);
        exit.mockRestore();
    });

    it('catches ENOENT error and exits 2', async () => {
        const exit = spyOn(process, 'exit').mockImplementation(() => undefined as never);
        spyOn(process.stderr, 'write').mockImplementation(() => true);

        const err = new Error('ENOENT: no such file');
        (err as { code?: string }).code = 'ENOENT';
        await runOperation(() => Promise.reject(err));
        expect(process.exit).toHaveBeenCalledWith(2);
        exit.mockRestore();
    });

    it('catches generic error and exits 1', async () => {
        const exit = spyOn(process, 'exit').mockImplementation(() => undefined as never);
        spyOn(process.stderr, 'write').mockImplementation(() => true);

        await runOperation(() => Promise.reject(new Error('Something broke')));
        expect(process.exit).toHaveBeenCalledWith(1);
        exit.mockRestore();
    });
});
