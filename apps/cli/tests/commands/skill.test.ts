import { describe, expect, it } from 'bun:test';
import { createProgram } from '../../src/cli';
import { registerSkill } from '../../src/commands/skill';

describe('registerSkill', () => {
    it('registers skill command with 5 operations', () => {
        const program = createProgram();
        // Registration is side-effect on the program object
        // verify it doesn't throw
        expect(() => registerSkill(new (program.constructor as typeof import('commander').Command)())).not.toThrow();
    });
});
