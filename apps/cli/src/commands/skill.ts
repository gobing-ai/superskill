import { addSkills, listSkills, removeSkills, type Target, updateSkills } from '@gobing-ai/superskill-core';
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
    parseMargin,
    resolveTarget,
    runOperation,
} from './helpers';

/** Validate a raw --invocation-mode CLI value; throws on anything but 'user' / 'model'. */
function parseInvocationMode(value?: string): 'user' | 'model' | undefined {
    if (value === undefined) return undefined;
    if (value === 'user' || value === 'model') return value;
    throw new Error(`Invalid --invocation-mode "${value}". Expected 'user' or 'model'.`);
}

/** Scaffold a skill definition and print the created path. */
export async function skillScaffold(opts: {
    name: string;
    description?: string;
    target?: string;
    output?: string;
    force?: boolean;
    template?: string;
    tools?: string;
    invocationMode?: string;
}): Promise<number | undefined> {
    const target = resolveTarget(opts);
    const createdPath = await scaffold('skill', opts.name, {
        description: opts.description,
        target,
        output: opts.output,
        force: opts.force,
        template: opts.template,
        tools: opts.tools,
        invocationMode: parseInvocationMode(opts.invocationMode),
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
    evalGate?: boolean;
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
        evalGate: opts.evalGate,
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
        tools?: string;
        invocationMode?: string;
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
        evalGate?: boolean;
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

/** Run skill add as a CLI action. */
export async function handleSkillAdd(
    source: string,
    opts: {
        skill?: string[];
        agent?: string[];
        global?: boolean;
        copy?: boolean;
        yes?: boolean;
        list?: boolean;
        dryRun?: boolean;
        json?: boolean;
        homeDir?: string;
    },
): Promise<void> {
    await runOperation(async () => {
        let targets: Target[] | undefined;
        if (opts.agent && opts.agent.length > 0) {
            targets = opts.agent.flatMap((a) => a.split(',')).map((t) => t.trim() as Target);
        }

        const res = await addSkills(source, {
            skills: opts.skill,
            targets,
            global: opts.global,
            mode: opts.copy ? 'copy' : 'symlink',
            listOnly: opts.list,
            dryRun: opts.dryRun,
            homeDir: opts.homeDir,
        });

        if (opts.json) {
            echo(JSON.stringify(res, null, 2));
            return res.success ? undefined : 1;
        }

        if (!res.success) {
            echoError(res.error || 'Failed to add skills');
            return 1;
        }

        if (res.listOnly && res.discovered) {
            echo(`Discovered ${res.discovered.length} skill(s) in ${source}:`);
            for (const item of res.discovered) {
                echo(`  - ${item.name} (${item.path}): ${item.description}`);
            }
            return undefined;
        }

        if (res.installed) {
            const prefix = res.dryRun ? '[dry-run] Would install' : 'Installed';
            echo(`${prefix} ${res.installed.length} skill(s):`);
            for (const item of res.installed) {
                echo(`  - ${item.name} -> ${item.canonicalPath}`);
            }
        }
        return undefined;
    });
}

/** Run skill list as a CLI action. */
export async function handleSkillList(opts: { global?: boolean; json?: boolean; homeDir?: string }): Promise<void> {
    await runOperation(async () => {
        const res = await listSkills({ global: opts.global, homeDir: opts.homeDir });
        if (opts.json) {
            echo(JSON.stringify(res, null, 2));
            return undefined;
        }

        if (res.skills.length === 0) {
            echo(`No ${res.scope} skills installed.`);
            return undefined;
        }

        echo(`Installed ${res.scope} skills (${res.skills.length}):`);
        for (const item of res.skills) {
            echo(`  - ${item.name} [${item.source}] (${item.hash.substring(0, 12)})`);
        }
        return undefined;
    });
}

/** Run skill remove as a CLI action. */
export async function handleSkillRemove(
    names: string[],
    opts: { global?: boolean; yes?: boolean; json?: boolean; homeDir?: string },
): Promise<void> {
    await runOperation(async () => {
        const res = await removeSkills(names, { global: opts.global, homeDir: opts.homeDir });
        if (opts.json) {
            echo(JSON.stringify(res, null, 2));
            return res.success ? undefined : 1;
        }

        if (!res.success) {
            echoError('Failed to remove skills');
            return 1;
        }

        echo(`Removed ${res.removed.length} skill(s):`);
        for (const name of res.removed) {
            echo(`  - ${name}`);
        }
        return undefined;
    });
}

/** Run skill update as a CLI action. */
export async function handleSkillUpdate(
    names: string[],
    opts: { global?: boolean; yes?: boolean; json?: boolean; homeDir?: string },
): Promise<void> {
    await runOperation(async () => {
        const res = await updateSkills(names.length > 0 ? names : undefined, {
            global: opts.global,
            homeDir: opts.homeDir,
        });
        if (opts.json) {
            echo(JSON.stringify(res, null, 2));
            return res.success ? undefined : 1;
        }

        if (!res.success) {
            echoError('Failed to update skills');
            return 1;
        }

        echo(`Updated ${res.updated.length} skill(s):`);
        for (const item of res.updated) {
            const status = item.updated ? 'Updated' : 'Up to date';
            echo(`  - ${item.name}: ${status} (${item.reason})`);
        }
        return undefined;
    });
}

/** Register the skill command group. */
export function registerSkill(program: Command): void {
    const cmd = program.command('skill').description('Manage skill definitions');

    cmd.command('add <source>')
        .description('Install skills from a local directory or GitHub repository slug/URL')
        .option('-s, --skill <name...>', 'Specific skill name(s) to install')
        .option('-a, --agent <targets...>', 'Target agent(s) to emit to (comma-separated or multiple)')
        .option('-g, --global', 'Install to user-level global directory instead of project-level')
        .option('--copy', 'Force copy mode instead of relative symlinking')
        .option('-y, --yes', 'Non-interactive auto-confirm (default: true)', true)
        .option('--list', 'List discovered skills without installing')
        .option('--dry-run', 'Preview installation without writing files')
        .option('--json', 'Output structured JSON envelope')
        .action(handleSkillAdd);

    cmd.command('list')
        .description('List installed skills')
        .option('-g, --global', 'List user-level global skills instead of project-level')
        .option('--json', 'Output structured JSON envelope')
        .action(handleSkillList);

    cmd.command('remove <names...>')
        .alias('rm')
        .description('Remove installed skill(s) across all targets and lock files')
        .option('-g, --global', 'Remove from user-level global directories')
        .option('-y, --yes', 'Non-interactive auto-confirm (default: true)', true)
        .option('--json', 'Output structured JSON envelope')
        .action(handleSkillRemove);

    cmd.command('update [names...]')
        .description('Update installed skill(s) from their source repositories')
        .option('-g, --global', 'Update user-level global skills')
        .option('-y, --yes', 'Non-interactive auto-confirm (default: true)', true)
        .option('--json', 'Output structured JSON envelope')
        .action(handleSkillUpdate);

    addScaffoldOptions(cmd.command('scaffold <name>').description('Create a new skill from template'), true).action(
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
        .option('--margin <n>', 'Δ-margin gate threshold (default 0.05)', parseMargin, 0.05)
        .action(handleSkillMigrate);
}
