import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { Command } from 'commander';
// Spy on the real operation exports rather than mock.module(): Bun's
// mock.module() is process-global and cannot be reverted (mock.restore() does
// not undo it), so it leaks into later test files and shadows the real modules,
// failing them in CI under a different file-discovery order. spyOn() on the live
// ESM namespace bindings is fully reverted by mock.restore() in afterEach.
import * as evaluateOp from '../../src/operations/evaluate';
import * as evolveOp from '../../src/operations/evolve';
import * as migrateOp from '../../src/operations/migrate';
import * as packageOp from '../../src/operations/package';
import * as refineOp from '../../src/operations/refine';
import * as scaffoldOp from '../../src/operations/scaffold';
import * as validateOp from '../../src/operations/validate';

beforeEach(() => {
    spyOn(process.stdout, 'write').mockImplementation(() => true);
    spyOn(process.stderr, 'write').mockImplementation(() => true);

    spyOn(scaffoldOp, 'scaffold').mockResolvedValue('/test/output/item.md');
    spyOn(validateOp, 'validate').mockResolvedValue({ valid: true, findings: [] });
    spyOn(validateOp, 'formatValidationResult').mockReturnValue('Valid');
    spyOn(evaluateOp, 'evaluate').mockResolvedValue({
        content: 'item',
        type: 'command',
        target: 'claude',
        aggregate: 0.95,
        dimensions: {},
    });
    spyOn(evaluateOp, 'formatEvaluationReport').mockReturnValue('Score: 0.95');
    spyOn(refineOp, 'refine').mockResolvedValue({
        preScore: 0.7,
        postScore: 0.85,
        delta: 0.15,
        fixesApplied: [],
        fixesSkipped: [],
    });
    spyOn(evolveOp, 'evolve').mockResolvedValue({
        baselineScore: 0.7,
        postScore: 0.85,
        delta: 0.15,
        changesApplied: 0,
        proposalPath: '',
    });
    spyOn(packageOp, 'packageSkill').mockResolvedValue('/test/output/skill.zip');
    spyOn(migrateOp, 'migrateSkills').mockResolvedValue({
        dest: '/test/output/merged.md',
        envelopeOut: false,
    });
});

afterEach(() => {
    // mock.restore() reverts spyOn overrides (it does NOT revert mock.module()).
    mock.restore();
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
        expect(await hookRefine({ nameOrPath: 'pre-tool', dryRun: true })).toBeUndefined();
        expect(await hookEvolve({ name: 'pre-tool', analyze: true })).toBeUndefined();

        const program = new Command();
        registerHook(program);
        expect(program.commands.find((cmd) => cmd.name() === 'hook')?.commands.map((cmd) => cmd.name())).toEqual([
            'scaffold',
            'validate',
            'evaluate',
            'refine',
            'evolve',
            'emit',
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

    it('forwards magent scaffold template, skills, and tools options (task 0064)', async () => {
        const { magentScaffold, registerMagent } = await import('../../src/commands/magent');

        expect(
            await magentScaffold({
                name: 'main',
                description: 'desc',
                target: 'codex',
                template: 'standard',
                skills: 'cc:cc-magents,rd3-dev-verify',
                tools: 'Read,Write,Bash',
                output: 'out',
                force: true,
            }),
        ).toBeUndefined();
        expect(scaffoldOp.scaffold).toHaveBeenLastCalledWith('magent', 'main', {
            description: 'desc',
            target: 'codex',
            output: 'out',
            force: true,
            template: 'standard',
            skills: 'cc:cc-magents,rd3-dev-verify',
            tools: 'Read,Write,Bash',
        });

        const program = new Command();
        registerMagent(program);
        const exit = spyOn(process, 'exit').mockImplementation(() => undefined as never);
        try {
            await program.parseAsync(
                [
                    'magent',
                    'scaffold',
                    'main',
                    '--template',
                    'standard',
                    '--skills',
                    'cc:cc-magents',
                    '--tools',
                    'Read,Write',
                    '--force',
                ],
                { from: 'user' },
            );
            expect(scaffoldOp.scaffold).toHaveBeenLastCalledWith(
                'magent',
                'main',
                expect.objectContaining({
                    template: 'standard',
                    skills: 'cc:cc-magents',
                    tools: 'Read,Write',
                    force: true,
                }),
            );
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
            'package',
            'migrate',
        ]);

        const exit = spyOn(process, 'exit').mockImplementation(() => undefined as never);
        try {
            await program.parseAsync(['skill', 'scaffold', 'writer'], { from: 'user' });
            await program.parseAsync(['skill', 'validate', 'writer'], { from: 'user' });
            await program.parseAsync(['skill', 'evaluate', 'writer'], { from: 'user' });
            await program.parseAsync(['skill', 'refine', 'writer'], { from: 'user' });
            await program.parseAsync(['skill', 'evolve', 'writer'], { from: 'user' });
            await program.parseAsync(['skill', 'package', 'writer'], { from: 'user' });
            await program.parseAsync(['skill', 'migrate', 'skill-a', 'skill-b', './merged.md'], { from: 'user' });
            expect(exit).toHaveBeenCalled();
        } finally {
            exit.mockRestore();
            process.exitCode = 0;
        }
    });

    it('exits when migrate has no destination', async () => {
        const { registerSkill } = await import('../../src/commands/skill');
        const program = new Command();
        registerSkill(program);
        const exit = spyOn(process, 'exit').mockImplementation(() => undefined as never);
        const stderr = spyOn(process.stderr, 'write').mockImplementation(() => true);
        try {
            await program.parseAsync(['skill', 'migrate', 'skill-a'], { from: 'user' });
            expect(stderr).toHaveBeenCalled();
            expect(exit).toHaveBeenCalledWith(1);
        } finally {
            exit.mockRestore();
            stderr.mockRestore();
            process.exitCode = 0;
        }
    });
});
