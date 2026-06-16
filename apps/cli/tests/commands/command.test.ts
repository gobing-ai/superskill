import { describe, expect, it } from 'bun:test';
import { Command } from 'commander';

describe('registerCommand', () => {
    it('registers command type without throwing', async () => {
        const { registerCommand } = await import('../../src/commands/command');
        expect(() => registerCommand(new Command())).not.toThrow();
    });
});
