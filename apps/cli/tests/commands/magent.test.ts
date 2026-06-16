import { describe, expect, it } from 'bun:test';
import { Command } from 'commander';

describe('registerMagent', () => {
    it('registers magent command without throwing', async () => {
        const { registerMagent } = await import('../../src/commands/magent');
        expect(() => registerMagent(new Command())).not.toThrow();
    });
});
