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

/** Scaffold a skill definition and print the created path. */
export async function skillScaffold(opts: {
    name: string;
    description?: string;
    target?: string;
    output?: string;
    force?: boolean;
}): Promise<number | undefined> {
    const target = resolveTarget(opts);
    const createdPath = await scaffold('skill', opts.name, {
        description: opts.description,
        target,
        output: opts.output,
        force: opts.force,
    });
    echo(`Created: ${createdPath}`);
    return undefined;
}

/** Validate a skill definition and return the mapped exit code. */
export async function skillValidate(opts: {
    nameOrPath: string;
    target?: string;
    strict?: boolean;
    json?: boolean;
}): Promise<number | undefined> {
    const target = resolveTarget(opts);
    const result = await validate('skill', opts.nameOrPath, { target, strict: opts.strict });
    const output = formatValidationResult(result, opts.json);
    if (output !== 'Valid') echoError(`${output}`);
    else echo(`${output}`);
    return exitFor(result);
}

/** Evaluate a skill definition and print the report. */
export async function skillEvaluate(opts: {
    nameOrPath: string;
    target?: string;
    json?: boolean;
    save?: boolean;
    rubric?: string;
    ingest?: string;
}): Promise<number | undefined> {
    const target = resolveTarget(opts);
    const report = await evaluate('skill', opts.nameOrPath, {
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

/** Refine a skill definition with optional automatic fixes. */
export async function skillRefine(opts: {
    nameOrPath: string;
    target?: string;
    auto?: boolean;
    save?: boolean;
}): Promise<number | undefined> {
    const target = resolveTarget(opts);
    await refine('skill', opts.nameOrPath, { target, auto: opts.auto, save: opts.save });
    return undefined;
}

/** Evolve a skill definition from saved evaluation history. */
export async function skillEvolve(opts: {
    name: string;
    target?: string;
    from?: string;
    proposeOnly?: boolean;
    accept?: string;
    reject?: string;
    json?: boolean;
    ingest?: string;
    margin?: number;
}): Promise<number | undefined> {
    const target = resolveTarget(opts);
    await evolve('skill', opts.name, {
        target,
        from: opts.from,
        proposeOnly: opts.proposeOnly,
        acceptId: opts.accept,
        rejectId: opts.reject,
        json: opts.json,
        ingest: opts.ingest,
        margin: opts.margin,
    });
    return undefined;
}

/** Run skill scaffold as a CLI action. */
export async function handleSkillScaffold(
    name: string,
    opts: { description?: string; target?: string; output?: string; force?: boolean },
): Promise<void> {
    await runOperation(() => skillScaffold({ name, ...opts }));
}

/** Run skill validate as a CLI action. */
export async function handleSkillValidate(
    nameOrPath: string,
    opts: { target?: string; strict?: boolean; json?: boolean },
): Promise<void> {
    await runOperation(() => skillValidate({ nameOrPath, ...opts }));
}

/** Run skill evaluate as a CLI action. */
export async function handleSkillEvaluate(
    nameOrPath: string,
    opts: { target?: string; json?: boolean; save?: boolean; rubric?: string; ingest?: string },
): Promise<void> {
    await runOperation(() => skillEvaluate({ nameOrPath, ...opts }));
}

/** Run skill refine as a CLI action. */
export async function handleSkillRefine(
    nameOrPath: string,
    opts: { target?: string; auto?: boolean; save?: boolean },
): Promise<void> {
    await runOperation(() => skillRefine({ nameOrPath, ...opts }));
}

/** Run skill evolve as a CLI action. */
export async function handleSkillEvolve(
    name: string,
    opts: {
        target?: string;
        from?: string;
        proposeOnly?: boolean;
        accept?: string;
        reject?: string;
        json?: boolean;
        ingest?: string;
    },
): Promise<void> {
    await runOperation(() => skillEvolve({ name, ...opts }));
}

/** Register the skill command group. */
export function registerSkill(program: Command): void {
    const cmd = program.command('skill').description('Manage skill definitions');

    addScaffoldOptions(cmd.command('scaffold <name>').description('Create a new skill from template')).action(
        handleSkillScaffold,
    );

    addStrictOption(
        addTargetOption(addJsonOption(cmd.command('validate <nameOrPath>').description('Validate a skill file'))),
    ).action(handleSkillValidate);

    addEvaluateOptions(
        addSaveOption(
            addTargetOption(
                addJsonOption(
                    cmd
                        .command('evaluate <nameOrPath>')
                        .description(
                            'Evaluate skill quality (use --rubric --json for envelope, --ingest --save to persist scores)',
                        ),
                ),
            ),
        ),
    ).action(handleSkillEvaluate);

    addSaveOption(
        addTargetOption(addAutoOption(cmd.command('refine <nameOrPath>').description('Evaluate and auto-fix a skill'))),
    ).action(handleSkillRefine);

    addEvolveOptions(
        cmd.command('evolve <name>').description('Longitudinal improvement from evaluation history'),
    ).action(handleSkillEvolve);
}
