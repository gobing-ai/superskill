import { describe, expect, it } from 'bun:test';

describe('cli', () => {
    it('createProgram returns a commander instance with an install command', async () => {
        const { createProgram } = await import('../src/cli');
        const program = createProgram();
        const installCmd = program.commands.find((c) => c.name() === 'install');
        expect(installCmd).toBeDefined();
    });

    it('install command has expected options', async () => {
        const { createProgram } = await import('../src/cli');
        const program = createProgram();
        const installCmd = program.commands.find((c) => c.name() === 'install');
        expect(installCmd).toBeDefined();
        // Verify key options exist
        const optionNames = installCmd?.options.map((o) => o.long);
        expect(optionNames).toContain('--targets');
        expect(optionNames).toContain('--global');
        expect(optionNames).toContain('--dry-run');
    });
});
