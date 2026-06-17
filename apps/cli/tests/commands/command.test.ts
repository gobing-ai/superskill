// Dynamic import used throughout — required by mock.module pattern in Bun tests.
import { afterAll, afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { Command } from 'commander';

// --- mock module registrations (before dynamic import per Bun pattern) ---
mock.module('../../src/operations/scaffold', () => ({
    scaffold: mock().mockResolvedValue('/test/output/my-command.md'),
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

// --- spies ---
let stdoutWrite: ReturnType<typeof spyOn<typeof process.stdout, 'write'>>;
let stderrWrite: ReturnType<typeof spyOn<typeof process.stderr, 'write'>>;

beforeEach(() => {
    stdoutWrite = spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrWrite = spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => {
    stdoutWrite.mockRestore();
    stderrWrite.mockRestore();
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
        mock.module('../../src/operations/validate', () => ({
            validate: mock().mockResolvedValue({
                valid: false,
                findings: [{ field: 'description', severity: 'error', message: 'Missing' }],
            }),
            formatValidationResult: mock().mockReturnValue('[ERROR] description: Missing'),
        }));
        const { commandValidate } = await import('../../src/commands/command');
        const result = await commandValidate({ nameOrPath: 'bad-command', strict: true });
        expect(result).toBe(1);
        expect(stderrWrite).toHaveBeenCalled();
    });

    it('returns exit code 2 for file-not-found', async () => {
        mock.module('../../src/operations/validate', () => ({
            validate: mock().mockResolvedValue({
                valid: false,
                findings: [{ field: '_file', severity: 'error', message: 'File not found' }],
            }),
            formatValidationResult: mock().mockReturnValue('[ERROR] _file: File not found'),
        }));
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
});
