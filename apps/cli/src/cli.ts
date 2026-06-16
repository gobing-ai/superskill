import { Command } from 'commander';
import { registerAgent } from './commands/agent';
import { registerCommand } from './commands/command';
import { registerHook } from './commands/hook';
import { registerInstall } from './commands/install';
import { registerMagent } from './commands/magent';
import { registerSkill } from './commands/skill';

/** Create the superskill CLI program. */
export function createProgram(): Command {
    const program = new Command()
        .name('superskill')
        .description('Multi-agent skill/command/subagent sync and management')
        .version('0.1.0');

    registerInstall(program);

    registerAgent(program);
    registerSkill(program);
    registerCommand(program);
    registerHook(program);
    registerMagent(program);

    return program;
}
