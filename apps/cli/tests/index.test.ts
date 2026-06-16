import { describe, expect, it, spyOn } from 'bun:test';

describe('cli', () => {
    it('createProgram returns a commander instance with an add command', async () => {
        const { createProgram } = await import('../src/cli');
        const program = createProgram();
        const addCmd = program.commands.find((c) => c.name() === 'add');
        expect(addCmd).toBeDefined();
    });

    it('add command outputs correct sum', async () => {
        const writeSpy = spyOn(process.stdout, 'write').mockImplementation(() => true);
        try {
            const { createProgram } = await import('../src/cli');
            const program = createProgram();
            program.parse(['add', '3', '4'], { from: 'user' });
            expect(writeSpy).toHaveBeenCalled();
            const output = writeSpy.mock.calls.map((c) => c[0]).join('');
            expect(output).toContain('7');
        } finally {
            writeSpy.mockRestore();
        }
    });
});
