import { describe, expect, it } from 'bun:test';

describe('cli', () => {
    it('createProgram returns a commander instance with an add command', async () => {
        const { createProgram } = await import('../src/cli');
        const program = createProgram();
        const addCmd = program.commands.find((c) => c.name() === 'add');
        expect(addCmd).toBeDefined();
    });

    it('add command runs without throwing', async () => {
        const origWrite = Bun.write;
        // biome-ignore lint/suspicious/noExplicitAny: suppressing test output to terminal
        Bun.write = (() => Promise.resolve(0)) as any;
        try {
            const { createProgram } = await import('../src/cli');
            const program = createProgram();
            expect(() => program.parse(['add', '3', '4'], { from: 'user' })).not.toThrow();
        } finally {
            Bun.write = origWrite;
        }
    });
});
