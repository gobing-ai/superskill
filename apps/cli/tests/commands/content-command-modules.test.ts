import { afterAll, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { Command } from 'commander';

mock.module('../../src/operations/scaffold', () => ({
    scaffold: mock().mockResolvedValue('/test/output/item.md'),
}));

mock.module('../../src/operations/validate', () => ({
    validate: mock().mockResolvedValue({ valid: true, findings: [] }),
    formatValidationResult: mock().mockReturnValue('Valid'),
}));

mock.module('../../src/operations/evaluate', () => ({
    evaluate: mock().mockResolvedValue({ aggregate: { score: 0.95 }, dimensions: [] }),
    formatEvaluationReport: mock().mockReturnValue('Score: 0.95'),
}));

mock.module('../../src/operations/refine', () => ({
    refine: mock().mockResolvedValue({ fixesApplied: [] }),
}));

mock.module('../../src/operations/evolve', () => ({
    evolve: mock().mockResolvedValue({ baselineScore: 0.7, postScore: 0.85, delta: 0.15, changesApplied: [] }),
}));

afterAll(() => {
    mock.restore();
});
beforeEach(() => {
    spyOn(process.stdout, 'write').mockImplementation(() => true);
    spyOn(process.stderr, 'write').mockImplementation(() => true);
});

describe('agent command module', () => {
    it('runs direct operations and registers subcommands', async () => {
        const { agentScaffold, agentValidate, agentEvaluate, agentRefine, agentEvolve, registerAgent } = await import(
            '../../src/commands/agent'
        );

        expect(await agentScaffold({ name: 'reviewer', description: 'desc', target: 'codex' })).toBeUndefined();
        expect(await agentValidate({ nameOrPath: 'reviewer', strict: true })).toBe(0);
        expect(await agentEvaluate({ nameOrPath: 'reviewer', json: true, save: true })).toBeUndefined();
        expect(await agentRefine({ nameOrPath: 'reviewer', auto: true, save: true })).toBeUndefined();
        expect(await agentEvolve({ name: 'reviewer', proposeOnly: true, accept: 'a', reject: 'b' })).toBeUndefined();

        const program = new Command();
        registerAgent(program);
        expect(program.commands.find((cmd) => cmd.name() === 'agent')?.commands.map((cmd) => cmd.name())).toEqual([
            'scaffold',
            'validate',
            'evaluate',
            'refine',
            'evolve',
        ]);

        const exit = spyOn(process, 'exit').mockImplementation(() => undefined as never);
        try {
            await program.parseAsync(['agent', 'scaffold', 'reviewer'], { from: 'user' });
            await program.parseAsync(['agent', 'validate', 'reviewer'], { from: 'user' });
            await program.parseAsync(['agent', 'evaluate', 'reviewer'], { from: 'user' });
            await program.parseAsync(['agent', 'refine', 'reviewer'], { from: 'user' });
            await program.parseAsync(['agent', 'evolve', 'reviewer'], { from: 'user' });
            expect(exit).toHaveBeenCalled();
        } finally {
            exit.mockRestore();
            process.exitCode = 0;
        }
    });
});

describe('hook command module', () => {
    it('runs direct operations and registers subcommands', async () => {
        const { hookScaffold, hookValidate, hookEvaluate, hookRefine, hookEvolve, registerHook } = await import(
            '../../src/commands/hook'
        );

        expect(await hookScaffold({ name: 'pre-tool', description: 'desc', target: 'codex' })).toBeUndefined();
        expect(await hookValidate({ nameOrPath: 'pre-tool', strict: true })).toBe(0);
        expect(await hookEvaluate({ nameOrPath: 'pre-tool', json: true, save: true })).toBeUndefined();
        expect(await hookRefine({ nameOrPath: 'pre-tool', auto: true, save: true })).toBeUndefined();
        expect(await hookEvolve({ name: 'pre-tool', proposeOnly: true, accept: 'a', reject: 'b' })).toBeUndefined();

        const program = new Command();
        registerHook(program);
        expect(program.commands.find((cmd) => cmd.name() === 'hook')?.commands.map((cmd) => cmd.name())).toEqual([
            'scaffold',
            'validate',
            'evaluate',
            'refine',
            'evolve',
        ]);

        const exit = spyOn(process, 'exit').mockImplementation(() => undefined as never);
        try {
            await program.parseAsync(['hook', 'scaffold', 'pre-tool'], { from: 'user' });
            await program.parseAsync(['hook', 'validate', 'pre-tool'], { from: 'user' });
            await program.parseAsync(['hook', 'evaluate', 'pre-tool'], { from: 'user' });
            await program.parseAsync(['hook', 'refine', 'pre-tool'], { from: 'user' });
            await program.parseAsync(['hook', 'evolve', 'pre-tool'], { from: 'user' });
            expect(exit).toHaveBeenCalled();
        } finally {
            exit.mockRestore();
            process.exitCode = 0;
        }
    });
});

describe('magent command module', () => {
    it('runs direct operations and registers subcommands', async () => {
        const { magentScaffold, magentValidate, magentEvaluate, magentRefine, magentEvolve, registerMagent } =
            await import('../../src/commands/magent');

        expect(await magentScaffold({ name: 'main', description: 'desc', target: 'codex' })).toBeUndefined();
        expect(await magentValidate({ nameOrPath: 'main', strict: true })).toBe(0);
        expect(await magentEvaluate({ nameOrPath: 'main', json: true, save: true })).toBeUndefined();
        expect(await magentRefine({ nameOrPath: 'main', auto: true, save: true })).toBeUndefined();
        expect(await magentEvolve({ name: 'main', proposeOnly: true, accept: 'a', reject: 'b' })).toBeUndefined();

        const program = new Command();
        registerMagent(program);
        expect(program.commands.find((cmd) => cmd.name() === 'magent')?.commands.map((cmd) => cmd.name())).toEqual([
            'scaffold',
            'validate',
            'evaluate',
            'refine',
            'evolve',
        ]);

        const exit = spyOn(process, 'exit').mockImplementation(() => undefined as never);
        try {
            await program.parseAsync(['magent', 'scaffold', 'main'], { from: 'user' });
            await program.parseAsync(['magent', 'validate', 'main'], { from: 'user' });
            await program.parseAsync(['magent', 'evaluate', 'main'], { from: 'user' });
            await program.parseAsync(['magent', 'refine', 'main'], { from: 'user' });
            await program.parseAsync(['magent', 'evolve', 'main'], { from: 'user' });
            expect(exit).toHaveBeenCalled();
        } finally {
            exit.mockRestore();
            process.exitCode = 0;
        }
    });
});

describe('skill command module', () => {
    it('runs direct operations and registers subcommands', async () => {
        const { skillScaffold, skillValidate, skillEvaluate, skillRefine, skillEvolve, registerSkill } = await import(
            '../../src/commands/skill'
        );

        expect(await skillScaffold({ name: 'writer', description: 'desc', target: 'codex' })).toBeUndefined();
        expect(await skillValidate({ nameOrPath: 'writer', strict: true })).toBe(0);
        expect(await skillEvaluate({ nameOrPath: 'writer', json: true, save: true })).toBeUndefined();
        expect(await skillRefine({ nameOrPath: 'writer', auto: true, save: true })).toBeUndefined();
        expect(await skillEvolve({ name: 'writer', proposeOnly: true, accept: 'a', reject: 'b' })).toBeUndefined();

        const program = new Command();
        registerSkill(program);
        expect(program.commands.find((cmd) => cmd.name() === 'skill')?.commands.map((cmd) => cmd.name())).toEqual([
            'scaffold',
            'validate',
            'evaluate',
            'refine',
            'evolve',
        ]);

        const exit = spyOn(process, 'exit').mockImplementation(() => undefined as never);
        try {
            await program.parseAsync(['skill', 'scaffold', 'writer'], { from: 'user' });
            await program.parseAsync(['skill', 'validate', 'writer'], { from: 'user' });
            await program.parseAsync(['skill', 'evaluate', 'writer'], { from: 'user' });
            await program.parseAsync(['skill', 'refine', 'writer'], { from: 'user' });
            await program.parseAsync(['skill', 'evolve', 'writer'], { from: 'user' });
            expect(exit).toHaveBeenCalled();
        } finally {
            exit.mockRestore();
            process.exitCode = 0;
        }
    });
});
