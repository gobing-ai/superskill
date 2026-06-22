import { describe, expect, it } from 'bun:test';
import { Command } from 'commander';

describe('registerHook', () => {
    it('registers hook command without throwing', async () => {
        const { registerHook } = await import('../../src/commands/hook');
        expect(() => registerHook(new Command())).not.toThrow();
    });
});

// Task 0056 decision C: hook evolve is analyze-only — no apply/history/rollback.
describe('hook evolve — analyze-only surface (0056)', () => {
    it('exposes --analyze but not --history/--rollback/--propose-only/--accept/--reject/--ingest', async () => {
        const { registerHook } = await import('../../src/commands/hook');
        const program = new Command();
        registerHook(program);
        const hookCmd = program.commands.find((c) => c.name() === 'hook');
        const evolveCmd = hookCmd?.commands.find((c) => c.name() === 'evolve');
        expect(evolveCmd).toBeDefined();
        const flagNames = evolveCmd?.options.map((o) => o.long).filter((v): v is string => v !== undefined) ?? [];
        // Allowed flags for hook evolve (analyze-only)
        expect(flagNames).toContain('--analyze');
        expect(flagNames).toContain('--target');
        expect(flagNames).toContain('--from');
        expect(flagNames).toContain('--json');
        // Forbidden flags — must NOT be registered
        expect(flagNames).not.toContain('--propose-only');
        expect(flagNames).not.toContain('--accept');
        expect(flagNames).not.toContain('--reject');
        expect(flagNames).not.toContain('--ingest');
        expect(flagNames).not.toContain('--margin');
        expect(flagNames).not.toContain('--history');
        expect(flagNames).not.toContain('--rollback');
        expect(flagNames).not.toContain('--confirm');
    });

    it('describes hook evolve as analyze-only', async () => {
        const { registerHook } = await import('../../src/commands/hook');
        const program = new Command();
        registerHook(program);
        const hookCmd = program.commands.find((c) => c.name() === 'hook');
        const evolveCmd = hookCmd?.commands.find((c) => c.name() === 'evolve');
        expect(evolveCmd?.description()).toContain('analyze-only');
    });
});
