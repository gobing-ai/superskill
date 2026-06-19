import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Command } from 'commander';
import { registerAgent } from './commands/agent';
import { registerCommand } from './commands/command';
import { registerHook } from './commands/hook';
import { registerInstall } from './commands/install';
import { registerMagent } from './commands/magent';
import { registerSkill } from './commands/skill';

let packageVersion: string | undefined;

function getPackageVersion(): string {
    if (packageVersion) return packageVersion;

    const packageJsonPath = join(import.meta.dir, '..', 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as { version?: unknown };
    if (typeof packageJson.version !== 'string' || packageJson.version.length === 0) {
        throw new Error(`Invalid package version in ${packageJsonPath}`);
    }

    packageVersion = packageJson.version;
    return packageVersion;
}

/** Create the superskill CLI program. */
export function createProgram(): Command {
    const program = new Command()
        .name('superskill')
        .description('Multi-agent skill/command/subagent sync and management')
        .version(getPackageVersion());

    registerInstall(program);

    registerAgent(program);
    registerSkill(program);
    registerCommand(program);
    registerHook(program);
    registerMagent(program);

    return program;
}
