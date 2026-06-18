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

// ── Inner Operation Functions ─────────────────────────────────────────────

async function scaffoldHook(
    name: string,
    opts: { description?: string; target?: string; output?: string; force?: boolean },
): Promise<string> {
    const target = resolveTarget(opts);
    return scaffold('hook', name, {
        description: opts.description,
        target,
        output: opts.output,
        force: opts.force,
    });
}

async function validateHook(nameOrPath: string, opts: { target?: string; strict?: boolean }) {
    const target = resolveTarget(opts);
    return validate('hook', nameOrPath, { target, strict: opts.strict });
}
async function evaluateHook(
    nameOrPath: string,
    opts: { target?: string; save?: boolean; rubric?: string; ingest?: string },
) {
    const target = resolveTarget(opts);
    return evaluate('hook', nameOrPath, {
        target,
        save: opts.save,
        ...(opts.rubric ? { rubric: opts.rubric } : {}),
        ...(opts.ingest ? { ingest: opts.ingest } : {}),
    });
}

async function refineHook(nameOrPath: string, opts: { target?: string; auto?: boolean; save?: boolean }) {
    const target = resolveTarget(opts);
    return refine('hook', nameOrPath, { target, auto: opts.auto, save: opts.save });
}

async function evolveHook(
    name: string,
    opts: { target?: string; from?: string; proposeOnly?: boolean; accept?: string; reject?: string },
) {
    const target = resolveTarget(opts);
    return evolve('hook', name, {
        target,
        from: opts.from,
        proposeOnly: opts.proposeOnly,
        acceptId: opts.accept,
        rejectId: opts.reject,
    });
}

// ── Exported Handler Functions ────────────────────────────────────────────

/** Scaffold a hook definition and print the created path. */
export async function hookScaffold(opts: {
    name: string;
    description?: string;
    target?: string;
    output?: string;
    force?: boolean;
}): Promise<number | undefined> {
    const createdPath = await scaffoldHook(opts.name, opts);
    echo(`Created: ${createdPath}`);
    return undefined;
}

/** Validate a hook definition and return the mapped exit code. */
export async function hookValidate(opts: {
    nameOrPath: string;
    target?: string;
    strict?: boolean;
    json?: boolean;
}): Promise<number | undefined> {
    const result = await validateHook(opts.nameOrPath, opts);
    const output = formatValidationResult(result, opts.json);
    if (output !== 'Valid') echoError(`${output}`);
    else echo(`${output}`);
    return exitFor(result);
}

/** Evaluate a hook definition and print the report. */
export async function hookEvaluate(opts: {
    nameOrPath: string;
    target?: string;
    json?: boolean;
    save?: boolean;
    rubric?: string;
    ingest?: string;
}): Promise<number | undefined> {
    const report = await evaluateHook(opts.nameOrPath, opts);
    if (report) {
        const output = formatEvaluationReport(report, opts.json);
        echo(`${output}`);
    }
    return undefined;
}

/** Refine a hook definition with optional automatic fixes. */
export async function hookRefine(opts: {
    nameOrPath: string;
    target?: string;
    auto?: boolean;
    save?: boolean;
}): Promise<number | undefined> {
    await refineHook(opts.nameOrPath, opts);
    return undefined;
}

/** Evolve a hook definition from saved evaluation history. */
export async function hookEvolve(opts: {
    name: string;
    target?: string;
    from?: string;
    proposeOnly?: boolean;
    accept?: string;
    reject?: string;
}): Promise<number | undefined> {
    await evolveHook(opts.name, opts);
    return undefined;
}

// ── Register Function ─────────────────────────────────────────────────────

/** Register the hook command group. */
export function registerHook(program: Command): void {
    const cmd = program.command('hook').description('Manage hook definitions');

    addScaffoldOptions(cmd.command('scaffold <name>').description('Create a new hook from template')).action(
        async (name: string, opts: { description?: string; target?: string; output?: string; force?: boolean }) => {
            await runOperation(() => hookScaffold({ name, ...opts }));
        },
    );

    addStrictOption(
        addTargetOption(addJsonOption(cmd.command('validate <nameOrPath>').description('Validate a hook file'))),
    ).action(async (nameOrPath: string, opts: { target?: string; strict?: boolean; json?: boolean }) => {
        await runOperation(() => hookValidate({ nameOrPath, ...opts }));
    });

    addEvaluateOptions(
        addSaveOption(
            addTargetOption(
                addJsonOption(
                    cmd
                        .command('evaluate <nameOrPath>')
                        .description(
                            'Evaluate hook quality (use --rubric --json for envelope, --ingest --save to persist scores)',
                        ),
                ),
            ),
        ),
    ).action(
        async (
            nameOrPath: string,
            opts: { target?: string; json?: boolean; save?: boolean; rubric?: string; ingest?: string },
        ) => {
            await runOperation(() => hookEvaluate({ nameOrPath, ...opts }));
        },
    );

    addSaveOption(
        addTargetOption(addAutoOption(cmd.command('refine <nameOrPath>').description('Evaluate and auto-fix a hook'))),
    ).action(async (nameOrPath: string, opts: { target?: string; auto?: boolean; save?: boolean }) => {
        await runOperation(() => hookRefine({ nameOrPath, ...opts }));
    });

    addEvolveOptions(
        cmd.command('evolve <name>').description('Longitudinal improvement from evaluation history'),
    ).action(
        async (
            name: string,
            opts: { target?: string; from?: string; proposeOnly?: boolean; accept?: string; reject?: string },
        ) => {
            await runOperation(() => hookEvolve({ name, ...opts }));
        },
    );
}
