import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { Command } from 'commander';
// Spy on the real operation exports rather than mock.module(): Bun's
// mock.module() is process-global and cannot be reverted (mock.restore() does
// not undo it), so it leaks into later test files and shadows the real modules,
// failing them in CI under a different file-discovery order. spyOn() on the live
// ESM namespace bindings is fully reverted by mock.restore() in afterEach.
import * as evaluateOp from '../../src/operations/evaluate';
import * as evolveOp from '../../src/operations/evolve';
import * as refineOp from '../../src/operations/refine';
import * as scaffoldOp from '../../src/operations/scaffold';
import * as validateOp from '../../src/operations/validate';

// --- spies ---
let stdoutWrite: ReturnType<typeof spyOn<typeof process.stdout, 'write'>>;
let stderrWrite: ReturnType<typeof spyOn<typeof process.stderr, 'write'>>;

beforeEach(() => {
    stdoutWrite = spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrWrite = spyOn(process.stderr, 'write').mockImplementation(() => true);

    spyOn(scaffoldOp, 'scaffold').mockResolvedValue('/test/output/my-command.md');
    spyOn(validateOp, 'validate').mockResolvedValue({ valid: true, findings: [] });
    spyOn(validateOp, 'formatValidationResult').mockReturnValue('Valid');
    spyOn(evaluateOp, 'evaluate').mockResolvedValue({
        content: 'my-command',
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
});

afterEach(() => {
    // mock.restore() reverts spyOn overrides (it does NOT revert mock.module()).
    mock.restore();
});

describe('commandScaffold', () => {
    it('creates a command and echoes the output path', async () => {
        const { commandScaffold } = await import('../../src/commands/command');
        const result = await commandScaffold({ name: 'my-command', description: 'desc', target: 'claude' });
        expect(result).toBeUndefined();
        expect(stdoutWrite).toHaveBeenCalled();
    });

    it('resolves target default when omitted', async () => {
        const { commandScaffold } = await import('../../src/commands/command');
        const result = await commandScaffold({ name: 'my-command' });
        expect(result).toBeUndefined();
    });

    it('passes optional force flag', async () => {
        const { commandScaffold } = await import('../../src/commands/command');
        const result = await commandScaffold({ name: 'my-command', force: true });
        expect(result).toBeUndefined();
    });
});

describe('commandValidate', () => {
    it('echos Valid for a passing validation', async () => {
        const { commandValidate } = await import('../../src/commands/command');
        const result = await commandValidate({ nameOrPath: 'my-command' });
        expect(result).toBe(0);
        expect(stdoutWrite).toHaveBeenCalled();
    });

    it('returns exit code 1 for invalid', async () => {
        spyOn(validateOp, 'validate').mockResolvedValue({
            valid: false,
            findings: [{ field: 'description', severity: 'error', message: 'Missing' }],
        });
        spyOn(validateOp, 'formatValidationResult').mockReturnValue('[ERROR] description: Missing');
        const { commandValidate } = await import('../../src/commands/command');
        const result = await commandValidate({ nameOrPath: 'bad-command', strict: true });
        expect(result).toBe(1);
        expect(stderrWrite).toHaveBeenCalled();
    });

    it('returns exit code 2 for file-not-found', async () => {
        spyOn(validateOp, 'validate').mockResolvedValue({
            valid: false,
            findings: [{ field: '_file', severity: 'error', message: 'File not found' }],
        });
        spyOn(validateOp, 'formatValidationResult').mockReturnValue('[ERROR] _file: File not found');
        const { commandValidate } = await import('../../src/commands/command');
        const result = await commandValidate({ nameOrPath: 'nope' });
        expect(result).toBe(2);
    });
});

describe('commandEvaluate', () => {
    it('echoes evaluation report', async () => {
        const { commandEvaluate } = await import('../../src/commands/command');
        const result = await commandEvaluate({ nameOrPath: 'my-command', json: true });
        expect(result).toBeUndefined();
        expect(stdoutWrite).toHaveBeenCalled();
    });

    it('passes save option through', async () => {
        const { commandEvaluate } = await import('../../src/commands/command');
        const result = await commandEvaluate({ nameOrPath: 'my-command', save: true });
        expect(result).toBeUndefined();
    });
});

describe('commandRefine', () => {
    it('refines a command and returns undefined', async () => {
        const { commandRefine } = await import('../../src/commands/command');
        const result = await commandRefine({ nameOrPath: 'my-command', auto: true });
        expect(result).toBeUndefined();
    });

    it('passes save option through', async () => {
        const { commandRefine } = await import('../../src/commands/command');
        const result = await commandRefine({ nameOrPath: 'my-command', save: true });
        expect(result).toBeUndefined();
    });
});

describe('commandEvolve', () => {
    it('evolves a command and returns undefined', async () => {
        const { commandEvolve } = await import('../../src/commands/command');
        const result = await commandEvolve({ name: 'my-command' });
        expect(result).toBeUndefined();
    });

    it('passes proposeOnly and accept/reject options', async () => {
        const { commandEvolve } = await import('../../src/commands/command');
        const result = await commandEvolve({ name: 'my-command', proposeOnly: true, accept: 'abc', reject: 'def' });
        expect(result).toBeUndefined();
    });

    it('passes analyze/history/rollback/confirm options through to evolve (C1)', async () => {
        const { commandEvolve } = await import('../../src/commands/command');
        // evolveOp.evolve is already spied in beforeEach; verify the new flags reach it.
        const result = await commandEvolve({
            name: 'my-command',
            analyze: true,
            history: true,
            rollback: 'command-evolve-2026-06-21-001',
            confirm: true,
            ingest: '/tmp/p.json',
            margin: 0.1,
            json: true,
        });
        expect(result).toBeUndefined();
        expect(evolveOp.evolve).toHaveBeenCalledWith(
            'command',
            'my-command',
            expect.objectContaining({
                analyze: true,
                history: true,
                rollback: 'command-evolve-2026-06-21-001',
                confirm: true,
                ingest: '/tmp/p.json',
                margin: 0.1,
                json: true,
            }),
        );
    });
});

describe('registerCommand', () => {
    it('registers command type with all 5 subcommands', async () => {
        const { registerCommand } = await import('../../src/commands/command');
        const program = new Command();
        registerCommand(program);
        const commandCmd = program.commands.find((c: Command) => c.name() === 'command');
        expect(commandCmd).toBeDefined();
        const names = commandCmd?.commands.map((c: Command) => c.name());
        expect(names).toContain('scaffold');
        expect(names).toContain('validate');
        expect(names).toContain('evaluate');
        expect(names).toContain('refine');
        expect(names).toContain('evolve');
    });

    it('scaffold subcommand has a description', async () => {
        const { registerCommand } = await import('../../src/commands/command');
        const program = new Command();
        registerCommand(program);
        const commandCmd = program.commands.find((c: Command) => c.name() === 'command');
        const scaffoldCmd = commandCmd?.commands.find((c: Command) => c.name() === 'scaffold');
        expect(scaffoldCmd?.description()).toBeTruthy();
    });

    it('dispatches scaffold action (mocked operations + exit)', async () => {
        const exit = spyOn(process, 'exit').mockImplementation(() => undefined as never);
        try {
            const { registerCommand } = await import('../../src/commands/command');
            const program = new Command();
            registerCommand(program);

            await program.parseAsync(['command', 'scaffold', 'test', '-d', 'desc'], {
                from: 'user',
            });
            expect(exit).toHaveBeenCalled();
        } finally {
            exit.mockRestore();
            process.exitCode = 0;
        }
    });

    it('dispatches validate action (mocked operations + exit)', async () => {
        const exit = spyOn(process, 'exit').mockImplementation(() => undefined as never);
        try {
            const { registerCommand } = await import('../../src/commands/command');
            const program = new Command();
            registerCommand(program);

            await program.parseAsync(['command', 'validate', 'test'], {
                from: 'user',
            });
            expect(exit).toHaveBeenCalled();
        } finally {
            exit.mockRestore();
            process.exitCode = 0;
        }
    });

    it('dispatches evaluate action (mocked operations + exit)', async () => {
        const exit = spyOn(process, 'exit').mockImplementation(() => undefined as never);
        try {
            const { registerCommand } = await import('../../src/commands/command');
            const program = new Command();
            registerCommand(program);

            await program.parseAsync(['command', 'evaluate', 'test'], {
                from: 'user',
            });
            expect(exit).toHaveBeenCalled();
        } finally {
            exit.mockRestore();
            process.exitCode = 0;
        }
    });

    it('dispatches refine action (mocked operations + exit)', async () => {
        const exit = spyOn(process, 'exit').mockImplementation(() => undefined as never);
        try {
            const { registerCommand } = await import('../../src/commands/command');
            const program = new Command();
            registerCommand(program);

            await program.parseAsync(['command', 'refine', 'test'], {
                from: 'user',
            });
            expect(exit).toHaveBeenCalled();
        } finally {
            exit.mockRestore();
            process.exitCode = 0;
        }
    });

    it('dispatches evolve action (mocked operations + exit)', async () => {
        const exit = spyOn(process, 'exit').mockImplementation(() => undefined as never);
        try {
            const { registerCommand } = await import('../../src/commands/command');
            const program = new Command();
            registerCommand(program);

            await program.parseAsync(['command', 'evolve', 'test'], {
                from: 'user',
            });
            expect(exit).toHaveBeenCalled();
        } finally {
            exit.mockRestore();
            process.exitCode = 0;
        }
    });

    it('registers evolve subcommand with analyze/history/rollback/confirm flags (C1)', async () => {
        const { registerCommand } = await import('../../src/commands/command');
        const program = new Command();
        registerCommand(program);
        const commandCmd = program.commands.find((c: Command) => c.name() === 'command');
        const evolveCmd = commandCmd?.commands.find((c: Command) => c.name() === 'evolve');
        expect(evolveCmd).toBeDefined();
        const flagNames = (evolveCmd?.options ?? []).map((o) => o.long);
        expect(flagNames).toContain('--analyze');
        expect(flagNames).toContain('--history');
        expect(flagNames).toContain('--rollback');
        expect(flagNames).toContain('--confirm');
    });
});
