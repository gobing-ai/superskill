import { Command } from 'commander';
import { registerInstall } from './commands/install';

/** Create the superskill CLI program. */
export function createProgram(): Command {
    const program = new Command()
        .name('superskill')
        .description('Multi-agent skill/command/subagent sync and management')
        .version('0.1.0');

    registerInstall(program);

    return program;
}
