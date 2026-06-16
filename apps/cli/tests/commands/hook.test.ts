import { describe, expect, it } from 'bun:test';
import { Command } from 'commander';

describe('registerHook', () => {
    it('registers hook command without throwing', async () => {
        const { registerHook } = await import('../../src/commands/hook');
        expect(() => registerHook(new Command())).not.toThrow();
    });
});
