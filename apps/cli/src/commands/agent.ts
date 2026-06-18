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

/** Scaffold an agent definition and print the created path. */
export async function agentScaffold(opts: {
    name: string;
    description?: string;
    target?: string;
    output?: string;
    force?: boolean;
}): Promise<number | undefined> {
    const target = resolveTarget(opts);
    const createdPath = await scaffold('agent', opts.name, {
        description: opts.description,
        target,
        output: opts.output,
        force: opts.force,
    });
    echo(`Created: ${createdPath}`);
    return undefined;
}

/** Validate an agent definition and return the mapped exit code. */
export async function agentValidate(opts: {
    nameOrPath: string;
    target?: string;
    strict?: boolean;
    json?: boolean;
}): Promise<number | undefined> {
    const target = resolveTarget(opts);
    const result = await validate('agent', opts.nameOrPath, { target, strict: opts.strict });
    const output = formatValidationResult(result, opts.json);
    if (output !== 'Valid') echoError(`${output}`);
    else echo(`${output}`);
    return exitFor(result);
}

/** Evaluate an agent definition and print the report. */
export async function agentEvaluate(opts: {
    nameOrPath: string;
    target?: string;
    json?: boolean;
    save?: boolean;
    rubric?: string;
    ingest?: string;
}): Promise<number | undefined> {
    const target = resolveTarget(opts);
    const report = await evaluate('agent', opts.nameOrPath, {
        target,
        save: opts.save,
        ...(opts.rubric ? { rubric: opts.rubric } : {}),
        ...(opts.ingest ? { ingest: opts.ingest } : {}),
    });
    // Envelope-out mode returns null (envelope already written to stdout)
    if (report) {
        const output = formatEvaluationReport(report, opts.json);
        echo(`${output}`);
    }
    return undefined;
}

/** Refine an agent definition with optional automatic fixes. */
export async function agentRefine(opts: {
    nameOrPath: string;
    target?: string;
    auto?: boolean;
    save?: boolean;
}): Promise<number | undefined> {
    const target = resolveTarget(opts);
    await refine('agent', opts.nameOrPath, { target, auto: opts.auto, save: opts.save });
    return undefined;
}

/** Evolve an agent definition from saved evaluation history. */
export async function agentEvolve(opts: {
    name: string;
    target?: string;
    from?: string;
    proposeOnly?: boolean;
    accept?: string;
    reject?: string;
    json?: boolean;
    ingest?: string;
}): Promise<number | undefined> {
    const target = resolveTarget(opts);
    await evolve('agent', opts.name, {
        target,
        from: opts.from,
        proposeOnly: opts.proposeOnly,
        acceptId: opts.accept,
        rejectId: opts.reject,
        json: opts.json,
        ingest: opts.ingest,
    });
    return undefined;
}

/** Run agent scaffold as a CLI action. */
export async function handleAgentScaffold(opts: {
    name: string;
    description?: string;
    target?: string;
    output?: string;
    force?: boolean;
}): Promise<void> {
    await runOperation(() => agentScaffold(opts));
}

/** Run agent validate as a CLI action. */
export async function handleAgentValidate(opts: {
    nameOrPath: string;
    target?: string;
    strict?: boolean;
    json?: boolean;
}): Promise<void> {
    await runOperation(() => agentValidate(opts));
}

/** Run agent evaluate as a CLI action. */
export async function handleAgentEvaluate(opts: {
    nameOrPath: string;
    target?: string;
    json?: boolean;
    save?: boolean;
    rubric?: string;
    ingest?: string;
}): Promise<void> {
    await runOperation(() => agentEvaluate(opts));
}

/** Run agent refine as a CLI action. */
export async function handleAgentRefine(opts: {
    nameOrPath: string;
    target?: string;
    auto?: boolean;
    save?: boolean;
}): Promise<void> {
    await runOperation(() => agentRefine(opts));
}
/** Run agent evolve as a CLI action. */
export async function handleAgentEvolve(opts: {
    name: string;
    target?: string;
    from?: string;
    proposeOnly?: boolean;
    accept?: string;
    reject?: string;
    json?: boolean;
    ingest?: string;
}): Promise<void> {
    await runOperation(() => agentEvolve(opts));
}

/** Register the agent command group. */
export function registerAgent(program: Command): void {
    const cmd = program.command('agent').description('Manage agent definitions');

    addScaffoldOptions(cmd.command('scaffold <name>').description('Create a new agent from template')).action(
        async (name: string, opts: { description?: string; target?: string; output?: string; force?: boolean }) => {
            await handleAgentScaffold({ name, ...opts });
        },
    );

    addStrictOption(
        addTargetOption(addJsonOption(cmd.command('validate <nameOrPath>').description('Validate an agent file'))),
    ).action(async (nameOrPath: string, opts: { target?: string; strict?: boolean; json?: boolean }) => {
        await handleAgentValidate({ nameOrPath, ...opts });
    });

    addEvaluateOptions(
        addSaveOption(
            addTargetOption(
                addJsonOption(
                    cmd
                        .command('evaluate <nameOrPath>')
                        .description(
                            'Evaluate agent quality (use --rubric --json for envelope, --ingest --save to persist scores)',
                        ),
                ),
            ),
        ),
    ).action(
        async (
            nameOrPath: string,
            opts: { target?: string; json?: boolean; save?: boolean; rubric?: string; ingest?: string },
        ) => {
            await handleAgentEvaluate({ nameOrPath, ...opts });
        },
    );

    addSaveOption(
        addTargetOption(
            addAutoOption(cmd.command('refine <nameOrPath>').description('Evaluate and auto-fix an agent')),
        ),
    ).action(async (nameOrPath: string, opts: { target?: string; auto?: boolean; save?: boolean }) => {
        await handleAgentRefine({ nameOrPath, ...opts });
    });

    addEvolveOptions(
        cmd.command('evolve <name>').description('Longitudinal improvement from evaluation history'),
    ).action(
        async (
            name: string,
            opts: { target?: string; from?: string; proposeOnly?: boolean; accept?: string; reject?: string },
        ) => {
            await handleAgentEvolve({ name, ...opts });
        },
    );
}
