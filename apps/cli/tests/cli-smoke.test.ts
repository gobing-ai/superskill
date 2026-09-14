import { describe, expect, it, spyOn } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createProgram } from '../src/cli';

describe('CLI program creation', () => {
    it('creates a program without errors', () => {
        const program = createProgram();
        expect(program.name()).toBe('superskill');
    });

    it('registers all 5 type commands', () => {
        const program = createProgram();
        const commands = program.commands.map((c) => c.name());
        expect(commands).toContain('agent');
        expect(commands).toContain('skill');
        expect(commands).toContain('command');
        expect(commands).toContain('hook');
        expect(commands).toContain('magent');
        expect(commands).toContain('install');
    });
});

describe('feature F CLI-surface invariants (task 0143)', () => {
    // Feature scenario: "Every CLI command is wired through Commander in apps/cli and
    // documented in 04_DESIGN." — the Commander tree is the enumeration of what is wired,
    // so every registered top-level command name must appear in the design doc.
    it('every Commander-registered top-level command is documented in 04_DESIGN', () => {
        const design = readFileSync(join(import.meta.dir, '../../../docs/04_DESIGN.md'), 'utf-8');
        const names = createProgram()
            .commands.map((c) => c.name())
            .filter((n) => n !== 'help');
        expect(names.length).toBeGreaterThan(0);
        for (const name of names) {
            expect(design).toContain(`superskill ${name}`);
        }
    });

    // Feature scenario: "CLI stdout output remains testable via process.stdout.write." —
    // a spy on process.stdout.write must capture the program's primary output with no
    // log-format coupling.
    it('program help output is captured by a process.stdout.write spy', async () => {
        let captured = '';
        const spy = spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
            captured += String(chunk);
            return true;
        });
        try {
            await createProgram()
                .exitOverride()
                .parseAsync(['--help'], { from: 'user' })
                .catch((e: { code?: string }) => {
                    if (e?.code !== 'commander.helpDisplayed') throw e;
                });
        } finally {
            spy.mockRestore();
        }
        expect(captured).toContain('Usage: superskill');
        expect(captured).toContain('install');
    });
});
