import { echo, echoError } from '@gobing-ai/ts-utils';
import type { Command } from 'commander';
import { evaluate, formatEvaluationReport } from '../operations/evaluate';
import { evolve } from '../operations/evolve';
import { refine } from '../operations/refine';
import { scaffold } from '../operations/scaffold';
import { formatValidationResult, validate } from '../operations/validate';
import {
    addAutoOption,
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

/** Scaffold a magent definition and print the created path. */
export async function magentScaffold(opts: {
    name: string;
    description?: string;
    target?: string;
    output?: string;
    force?: boolean;
}): Promise<number | undefined> {
    const target = resolveTarget(opts);
    const createdPath = await scaffold('magent', opts.name, {
        description: opts.description,
        target,
        output: opts.output,
        force: opts.force,
    });
    echo(`Created: ${createdPath}`);
    return undefined;
}

/** Validate a magent definition and return the mapped exit code. */
export async function magentValidate(opts: {
    nameOrPath: string;
    target?: string;
    strict?: boolean;
    json?: boolean;
}): Promise<number | undefined> {
    const target = resolveTarget(opts);
    const result = await validate('magent', opts.nameOrPath, { target, strict: opts.strict });
    const output = formatValidationResult(result, opts.json);
    if (output !== 'Valid') echoError(`${output}`);
    else echo(`${output}`);
    return exitFor(result);
}

/** Evaluate a magent definition and print the report. */
export async function magentEvaluate(opts: {
    nameOrPath: string;
    target?: string;
    json?: boolean;
    save?: boolean;
    rubric?: string;
    ingest?: string;
}): Promise<number | undefined> {
    const target = resolveTarget(opts);
    const report = await evaluate('magent', opts.nameOrPath, {
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

/** Refine a magent definition with optional automatic fixes. */
export async function magentRefine(opts: {
    nameOrPath: string;
    target?: string;
    auto?: boolean;
    save?: boolean;
}): Promise<number | undefined> {
    const target = resolveTarget(opts);
    await refine('magent', opts.nameOrPath, { target, auto: opts.auto, save: opts.save });
    return undefined;
}

/** Evolve a magent definition from saved evaluation history. */
export async function magentEvolve(opts: {
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
    await evolve('magent', opts.name, {
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

/** Run magent scaffold as a CLI action. */
export async function handleMagentScaffold(opts: {
    name: string;
    description?: string;
    target?: string;
    output?: string;
    force?: boolean;
}): Promise<void> {
    await runOperation(() => magentScaffold(opts));
}

/** Run magent validate as a CLI action. */
export async function handleMagentValidate(opts: {
    nameOrPath: string;
    target?: string;
    strict?: boolean;
    json?: boolean;
}): Promise<void> {
    await runOperation(() => magentValidate(opts));
}

/** Run magent evaluate as a CLI action. */
export async function handleMagentEvaluate(opts: {
    nameOrPath: string;
    target?: string;
    json?: boolean;
    save?: boolean;
    rubric?: string;
    ingest?: string;
}): Promise<void> {
    await runOperation(() => magentEvaluate(opts));
}

/** Run magent refine as a CLI action. */
export async function handleMagentRefine(opts: {
    nameOrPath: string;
    target?: string;
    auto?: boolean;
    save?: boolean;
}): Promise<void> {
    await runOperation(() => magentRefine(opts));
}

/** Run magent evolve as a CLI action. */
export async function handleMagentEvolve(opts: {
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
    await runOperation(() => magentEvolve(opts));
}

/** Register the magent command group. */
export function registerMagent(program: Command): void {
    const cmd = program.command('magent').description('Manage magent definitions');

    addScaffoldOptions(cmd.command('scaffold <name>').description('Create a new magent from template')).action(
        async (name: string, opts: { description?: string; target?: string; output?: string; force?: boolean }) => {
            await handleMagentScaffold({ name, ...opts });
        },
    );

    addStrictOption(
        addTargetOption(addJsonOption(cmd.command('validate <nameOrPath>').description('Validate a magent file'))),
    ).action(async (nameOrPath: string, opts: { target?: string; strict?: boolean; json?: boolean }) => {
        await handleMagentValidate({ nameOrPath, ...opts });
    });

    addEvaluateOptions(
        addSaveOption(
            addTargetOption(
                addJsonOption(
                    cmd
                        .command('evaluate <nameOrPath>')
                        .description(
                            'Evaluate magent quality (use --rubric --json for envelope, --ingest --save to persist scores)',
                        ),
                ),
            ),
        ),
    ).action(
        async (
            nameOrPath: string,
            opts: { target?: string; json?: boolean; save?: boolean; rubric?: string; ingest?: string },
        ) => {
            await handleMagentEvaluate({ nameOrPath, ...opts });
        },
    );

    addSaveOption(
        addTargetOption(
            addAutoOption(cmd.command('refine <nameOrPath>').description('Evaluate and auto-fix a magent')),
        ),
    ).action(async (nameOrPath: string, opts: { target?: string; auto?: boolean; save?: boolean }) => {
        await handleMagentRefine({ nameOrPath, ...opts });
    });

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
            await handleMagentEvolve({ name, ...opts });
        },
    );
}
