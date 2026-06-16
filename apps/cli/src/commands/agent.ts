import { echo, echoError } from '@gobing-ai/ts-utils';
import type { Command } from 'commander';
import { evaluate, formatEvaluationReport } from '../operations/evaluate';
import { evolve } from '../operations/evolve';
import { refine } from '../operations/refine';
import { scaffold } from '../operations/scaffold';
import { formatValidationResult, validate } from '../operations/validate';
import {
    addAutoOption,
    addEvolveOptions,
    addJsonOption,
    addSaveOption,
    addScaffoldOptions,
    addStrictOption,
    addTargetOption,
    exitFor,
    resolveTarget,
    runOperation,
} from './helpers';

export function registerAgent(program: Command): void {
    const cmd = program.command('agent').description('Manage agent definitions');

    // scaffold
    addScaffoldOptions(cmd.command('scaffold <name>').description('Create a new agent from template')).action(
        async (name: string, opts: { description?: string; target?: string; output?: string; force?: boolean }) => {
            await runOperation(async () => {
                const target = resolveTarget(opts);
                const createdPath = await scaffold('agent', name, {
                    description: opts.description,
                    target,
                    output: opts.output,
                    force: opts.force,
                });
                echo(`Created: ${createdPath}`);
            });
        },
    );

    // validate
    addStrictOption(
        addTargetOption(addJsonOption(cmd.command('validate <nameOrPath>').description('Validate an agent file'))),
    ).action(async (nameOrPath: string, opts: { target?: string; strict?: boolean; json?: boolean }) => {
        await runOperation(async () => {
            const target = resolveTarget(opts);
            const result = await validate('agent', nameOrPath, { target, strict: opts.strict });
            const output = formatValidationResult(result, opts.json);
            if (output !== 'Valid') echoError(`${output}`);
            else echo(`${output}`);
            return exitFor(result);
        });
    });

    // evaluate
    addSaveOption(
        addTargetOption(addJsonOption(cmd.command('evaluate <nameOrPath>').description('Evaluate agent quality'))),
    ).action(async (nameOrPath: string, opts: { target?: string; json?: boolean; save?: boolean }) => {
        await runOperation(async () => {
            const target = resolveTarget(opts);
            const report = await evaluate('agent', nameOrPath, { target, save: opts.save });
            const output = formatEvaluationReport(report, opts.json);
            echo(`${output}`);
        });
    });

    // refine
    addSaveOption(
        addTargetOption(
            addAutoOption(cmd.command('refine <nameOrPath>').description('Evaluate and auto-fix an agent')),
        ),
    ).action(async (nameOrPath: string, opts: { target?: string; auto?: boolean; save?: boolean }) => {
        await runOperation(async () => {
            const target = resolveTarget(opts);
            await refine('agent', nameOrPath, { target, auto: opts.auto, save: opts.save });
        });
    });

    // evolve
    addEvolveOptions(
        cmd.command('evolve <name>').description('Longitudinal improvement from evaluation history'),
    ).action(
        async (
            name: string,
            opts: { target?: string; from?: string; proposeOnly?: boolean; accept?: string; reject?: string },
        ) => {
            await runOperation(async () => {
                const target = resolveTarget(opts);
                await evolve('agent', name, {
                    target,
                    from: opts.from,
                    proposeOnly: opts.proposeOnly,
                    acceptId: opts.accept,
                    rejectId: opts.reject,
                });
            });
        },
    );
}
