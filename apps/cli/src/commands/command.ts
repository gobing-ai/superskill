import { echo, echoError } from '@gobing-ai/ts-utils';
import type { Command } from 'commander';
import { evaluate, formatEvaluationReport } from '../operations/evaluate';
import { evolve } from '../operations/evolve';
import { refine } from '../operations/refine';
import { scaffold } from '../operations/scaffold';
import { formatValidationResult, validate } from '../operations/validate';
import {
    addAutoOption,
    addDryRunOption,
    addEvaluateOptions,
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

/** Scaffold a command definition and print the created path. */
export async function commandScaffold(opts: {
    name: string;
    description?: string;
    target?: string;
    output?: string;
    force?: boolean;
}): Promise<number | undefined> {
    const target = resolveTarget(opts);
    const createdPath = await scaffold('command', opts.name, {
        description: opts.description,
        target,
        output: opts.output,
        force: opts.force,
    });
    echo(`Created: ${createdPath}`);
    return undefined;
}

/** Validate a command definition and return the mapped exit code. */
export async function commandValidate(opts: {
    nameOrPath: string;
    target?: string;
    strict?: boolean;
    json?: boolean;
}): Promise<number | undefined> {
    const target = resolveTarget(opts);
    const result = await validate('command', opts.nameOrPath, { target, strict: opts.strict });
    const output = formatValidationResult(result, opts.json);
    if (output !== 'Valid') echoError(`${output}`);
    else echo(`${output}`);
    return exitFor(result);
}

/** Evaluate a command definition and print the report. */
export async function commandEvaluate(opts: {
    nameOrPath: string;
    target?: string;
    json?: boolean;
    save?: boolean;
    rubric?: string;
    ingest?: string;
}): Promise<number | undefined> {
    const target = resolveTarget(opts);
    const report = await evaluate('command', opts.nameOrPath, {
        target,
        save: opts.save,
        ...(opts.rubric ? { rubric: opts.rubric } : {}),
        ...(opts.ingest ? { ingest: opts.ingest } : {}),
    });
    if (report) {
        const output = formatEvaluationReport(report, opts.json);
        echo(`${output}`);
    }
    return undefined;
}

/** Refine a command definition with optional automatic fixes. */
export async function commandRefine(opts: {
    nameOrPath: string;
    target?: string;
    auto?: boolean;
    save?: boolean;
    dryRun?: boolean;
}): Promise<number | undefined> {
    const target = resolveTarget(opts);
    await refine('command', opts.nameOrPath, { target, auto: opts.auto, save: opts.save, dryRun: opts.dryRun });
    return undefined;
}

/** Evolve a command definition from saved evaluation history. */
export async function commandEvolve(opts: {
    name: string;
    target?: string;
    from?: string;
    proposeOnly?: boolean;
    accept?: string;
    reject?: string;
    json?: boolean;
    ingest?: string;
    margin?: number;
    analyze?: boolean;
    history?: boolean;
    rollback?: string;
    confirm?: boolean;
}): Promise<number | undefined> {
    const target = resolveTarget(opts);
    await evolve('command', opts.name, {
        target,
        from: opts.from,
        proposeOnly: opts.proposeOnly,
        acceptId: opts.accept,
        rejectId: opts.reject,
        json: opts.json,
        ingest: opts.ingest,
        margin: opts.margin,
        analyze: opts.analyze,
        history: opts.history,
        rollback: opts.rollback,
        confirm: opts.confirm,
    });
    return undefined;
}

/** Run command scaffold as a CLI action. */
export async function handleCommandScaffold(opts: {
    name: string;
    description?: string;
    target?: string;
    output?: string;
    force?: boolean;
}): Promise<void> {
    await runOperation(() => commandScaffold(opts));
}

/** Run command validate as a CLI action. */
export async function handleCommandValidate(opts: {
    nameOrPath: string;
    target?: string;
    strict?: boolean;
    json?: boolean;
}): Promise<void> {
    await runOperation(() => commandValidate(opts));
}

/** Run command evaluate as a CLI action. */
export async function handleCommandEvaluate(opts: {
    nameOrPath: string;
    target?: string;
    json?: boolean;
    save?: boolean;
    rubric?: string;
    ingest?: string;
}): Promise<void> {
    await runOperation(() => commandEvaluate(opts));
}

/** Run command refine as a CLI action. */
export async function handleCommandRefine(opts: {
    nameOrPath: string;
    target?: string;
    auto?: boolean;
    save?: boolean;
}): Promise<void> {
    await runOperation(() => commandRefine(opts));
}

/** Run command evolve as a CLI action. */
export async function handleCommandEvolve(opts: {
    name: string;
    target?: string;
    from?: string;
    proposeOnly?: boolean;
    accept?: string;
    reject?: string;
    json?: boolean;
    ingest?: string;
    margin?: number;
    analyze?: boolean;
    history?: boolean;
    rollback?: string;
    confirm?: boolean;
}): Promise<void> {
    await runOperation(() => commandEvolve(opts));
}

/** Register the command command group. */
export function registerCommand(program: Command): void {
    const cmd = program.command('command').description('Manage command definitions');

    addScaffoldOptions(cmd.command('scaffold <name>').description('Create a new command from template')).action(
        async (name: string, opts: { description?: string; target?: string; output?: string; force?: boolean }) => {
            await handleCommandScaffold({ name, ...opts });
        },
    );

    addStrictOption(
        addTargetOption(addJsonOption(cmd.command('validate <nameOrPath>').description('Validate a command file'))),
    ).action(async (nameOrPath: string, opts: { target?: string; strict?: boolean; json?: boolean }) => {
        await handleCommandValidate({ nameOrPath, ...opts });
    });

    addEvaluateOptions(
        addSaveOption(
            addTargetOption(
                addJsonOption(
                    cmd
                        .command('evaluate <nameOrPath>')
                        .description(
                            'Evaluate command quality (use --rubric --json for envelope, --ingest --save to persist scores)',
                        ),
                ),
            ),
        ),
    ).action(
        async (
            nameOrPath: string,
            opts: { target?: string; json?: boolean; save?: boolean; rubric?: string; ingest?: string },
        ) => {
            await handleCommandEvaluate({ nameOrPath, ...opts });
        },
    );

    addDryRunOption(
        addSaveOption(
            addTargetOption(
                addAutoOption(cmd.command('refine <nameOrPath>').description('Evaluate and auto-fix a command')),
            ),
        ),
    ).action(
        async (nameOrPath: string, opts: { target?: string; auto?: boolean; save?: boolean; dryRun?: boolean }) => {
            await handleCommandRefine({ nameOrPath, ...opts });
        },
    );

    addEvolveOptions(
        cmd.command('evolve <name>').description('Longitudinal improvement from evaluation history'),
    ).action(
        async (
            name: string,
            opts: {
                target?: string;
                from?: string;
                proposeOnly?: boolean;
                accept?: string;
                reject?: string;
                json?: boolean;
                ingest?: string;
                margin?: number;
                analyze?: boolean;
                history?: boolean;
                rollback?: string;
                confirm?: boolean;
            },
        ) => {
            await handleCommandEvolve({ name, ...opts });
        },
    );
}
