import { Command } from 'commander';
import { registerAgent } from './commands/agent';
import { registerCommand } from './commands/command';
import { registerHook } from './commands/hook';
import { registerInstall } from './commands/install';
import { registerMagent } from './commands/magent';
import { registerScriptPath } from './commands/script-path';
import { registerScriptRun } from './commands/script-run';
import { registerSkill } from './commands/skill';
import { cliVersion } from './version';

/** Create the superskill CLI program. */
export function createProgram(): Command {
    const program = new Command()
        .name('superskill')
        .description('Multi-agent skill/command/subagent sync and management')
        .version(cliVersion);

    registerInstall(program);

    registerAgent(program);
    registerSkill(program);
    registerCommand(program);
    registerHook(program);
    registerMagent(program);
    registerScriptRun(program);
    registerScriptPath(program);

    return program;
}
