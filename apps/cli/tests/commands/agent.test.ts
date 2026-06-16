import { describe, expect, it } from 'bun:test';
import { Command } from 'commander';

describe('registerAgent', () => {
    it('registers agent command without throwing', async () => {
        const { registerAgent } = await import('../../src/commands/agent');
        expect(() => registerAgent(new Command())).not.toThrow();
    });
});
