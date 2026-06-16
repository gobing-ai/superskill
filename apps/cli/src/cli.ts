import { echo } from '@gobing-ai/ts-utils';
import { Command } from 'commander';

/** Create a Commander CLI program. */
export function createProgram(): Command {
    const program = new Command()
        .name('superskill')
        .description('Multi-agent skill/command/subagent sync and management')
        .version('0.1.0');

    const parseIntArg = (v: string): number => Number.parseInt(v, 10);

    program
        .command('add')
        .description('Add two numbers')
        .argument('<a>', 'first number', parseIntArg)
        .argument('<b>', 'second number', parseIntArg)
        .action((a, b) => {
            echo(`${a + b}`);
        });

    return program;
}
