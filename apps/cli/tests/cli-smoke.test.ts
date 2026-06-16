import { describe, expect, it } from 'bun:test';
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
