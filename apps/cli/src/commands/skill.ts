import { echo, echoError } from '@gobing-ai/ts-utils';
import type { Command } from 'commander';
import { evaluate, formatEvaluationReport } from '../operations/evaluate';
import { evolve } from '../operations/evolve';
import { migrateSkills } from '../operations/migrate';
import { packageSkill } from '../operations/package';
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

/** Scaffold a skill definition and print the created path. */
export async function skillScaffold(opts: {
    name: string;
    description?: string;
    target?: string;
    output?: string;
    force?: boolean;
    template?: string;
    skills?: string;
    tools?: string;
}): Promise<number | undefined> {
    const target = resolveTarget(opts);
    const createdPath = await scaffold('skill', opts.name, {
        description: opts.description,
        target,
        output: opts.output,
        force: opts.force,
        template: opts.template,
        skills: opts.skills,
        tools: opts.tools,
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
    history?: boolean;
}): Promise<number | undefined> {
    const target = resolveTarget(opts);
    const report = await evaluate('skill', opts.nameOrPath, {
        target,
        save: opts.save,
        history: opts.history,
        ...(opts.rubric ? { rubric: opts.rubric } : {}),
        ...(opts.ingest ? { ingest: opts.ingest } : {}),
    });
    if (report && !opts.history) {
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
    dryRun?: boolean;
}): Promise<number | undefined> {
    const target = resolveTarget(opts);
    await refine('skill', opts.nameOrPath, { target, auto: opts.auto, save: opts.save, dryRun: opts.dryRun });
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
    analyze?: boolean;
    history?: boolean;
    rollback?: string;
    confirm?: boolean;
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
        analyze: opts.analyze,
        history: opts.history,
        rollback: opts.rollback,
        confirm: opts.confirm,
    });
    return undefined;
}

/** Run skill scaffold as a CLI action. */
export async function handleSkillScaffold(
    name: string,
    opts: {
        description?: string;
        target?: string;
        output?: string;
        force?: boolean;
        template?: string;
        skills?: string;
        tools?: string;
    },
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
    opts: { target?: string; json?: boolean; save?: boolean; rubric?: string; ingest?: string; history?: boolean },
): Promise<void> {
    await runOperation(() => skillEvaluate({ nameOrPath, ...opts }));
}
/** Run skill refine as a CLI action. */
export async function handleSkillRefine(
    nameOrPath: string,
    opts: { target?: string; auto?: boolean; save?: boolean; dryRun?: boolean },
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
        margin?: number;
        analyze?: boolean;
        history?: boolean;
        rollback?: string;
        confirm?: boolean;
    },
): Promise<void> {
    await runOperation(() => skillEvolve({ name, ...opts }));
}

/** Run skill package as a CLI action. */
export async function handleSkillPackage(
    name: string,
    opts: { output?: string; includeCompanions?: boolean },
): Promise<void> {
    await runOperation(async () => {
        const path = await packageSkill(name, opts);
        echo(path);
        return undefined;
    });
}

/** Options for the skill migrate command. */
interface SkillMigrateOptions {
    refine?: boolean;
    ingest?: string;
    target?: string;
    margin?: number;
}

/** Run skill migrate as a CLI action. */
export async function handleSkillMigrate(sourcesAndDest: string[], opts: SkillMigrateOptions): Promise<void> {
    const dest = sourcesAndDest[sourcesAndDest.length - 1];
    const sources = sourcesAndDest.slice(0, -1);
    if (!dest || sources.length === 0) {
        echoError('migrate requires at least one source and a destination');
        process.exit(1);
    }
    const target = resolveTarget(opts);
    await runOperation(async () => {
        const result = await migrateSkills(sources, dest, {
            refine: opts.refine,
            ingest: opts.ingest,
            target,
            margin: opts.margin,
        });
        if (!result.envelopeOut) {
            echo(result.dest);
        }
        return undefined;
    });
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
                        )
                        .option('--history', 'Show prior evaluation rows from the store'),
                ),
            ),
        ),
    ).action(handleSkillEvaluate);
    addDryRunOption(
        addSaveOption(
            addTargetOption(
                addAutoOption(cmd.command('refine <nameOrPath>').description('Evaluate and auto-fix a skill')),
            ),
        ),
    ).action(handleSkillRefine);

    addEvolveOptions(
        cmd.command('evolve <name>').description('Longitudinal improvement from evaluation history'),
    ).action(handleSkillEvolve);

    cmd.command('package <name>')
        .description('Package a skill for distribution')
        .option('-o, --output <dir>', 'Output directory (default: cwd)')
        .option('--include-companions', 'Include companion configs (metadata.openclaw, agents/)')
        .action(handleSkillPackage);
    cmd.command('migrate <sources...>')
        .description('Merge/migrate skills into a destination')
        .option('--refine', 'Route through the generation seam (F023) for content refinement')
        .option('--ingest <file>', 'Agent-authored proposal JSON (apply through the double-loop gate)')
        .option('-t, --target <agent>', 'Target agent platform', 'claude')
        .option('--margin <n>', 'Δ-margin gate threshold (default 0.05)', Number.parseFloat, 0.05)
        .action(handleSkillMigrate);
}
