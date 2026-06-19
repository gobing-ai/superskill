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
        expect(optionNames).toContain('--no-global');
        expect(optionNames).toContain('--dry-run');
    });

    it('package.json bin points to built dist/index.js', async () => {
        const { readFileSync } = await import('node:fs');
        const { resolve } = await import('node:path');
        const thisDir = resolve(import.meta.path, '..');
        const pkgPath = resolve(thisDir, '../package.json');
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        expect(pkg.bin?.superskill).toBe('dist/index.js');
    });

    it('program version matches package.json', async () => {
        const { readFileSync } = await import('node:fs');
        const { resolve } = await import('node:path');
        const { createProgram } = await import('../src/cli');
        const thisDir = resolve(import.meta.path, '..');
        const pkgPath = resolve(thisDir, '../package.json');
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

        expect(createProgram().version()).toBe(pkg.version);
    });
});
