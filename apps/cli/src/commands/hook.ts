import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
    listResolvablePlugins,
    mapPluginToRulesync,
    resolvePlugin,
    runRulesync,
    type Target,
} from '@gobing-ai/superskill-core';
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
import { emitHooksForSurrogateTarget, prepareTargetRulesyncInput } from './install';

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
    opts: {
        target?: string;
        from?: string;
        proposeOnly?: boolean;
        accept?: string;
        reject?: string;
        json?: boolean;
        ingest?: string;
        margin?: number;
    },
) {
    const target = resolveTarget(opts);
    return evolve('hook', name, {
        target,
        from: opts.from,
        proposeOnly: opts.proposeOnly,
        acceptId: opts.accept,
        rejectId: opts.reject,
        json: opts.json,
        ingest: opts.ingest,
        margin: opts.margin,
    });
}

/**
 * Emit hooks for a single target by resolving a plugin to its canonical
 * `.rulesync/hooks.json` and dispatching through the install hook path:
 * `runRulesync` for rulesync-supported targets (codex/opencode/antigravity/
 * claude) and {@link emitHooksForSurrogateTarget} for pi/omp/hermes.
 *
 * Surrogate-source selection: `omp` reuses the pi rulesync output, `hermes`
 * reuses the opencode output (see ADR-010).
 */
async function emitHook(
    name: string,
    opts: { target?: string; global?: boolean; dryRun?: boolean },
): Promise<{ count: number; message: string }> {
    const target = resolveTarget(opts);
    const global = opts.global !== false;
    const dryRun = opts.dryRun === true;
    const outputRoot = global ? homedir() : process.cwd();

    // Step 1: Resolve plugin root (same path as `superskill install`)
    let pluginRoot: string;
    const resolved = resolvePlugin(undefined, name);
    if (resolved) {
        pluginRoot = resolved.pluginRoot;
    } else {
        const fallback = join('plugins', name);
        if (existsSync(join(fallback, 'plugin.json'))) {
            pluginRoot = fallback;
        } else {
            const available = listResolvablePlugins(undefined);
            const msg =
                available.length > 0
                    ? `Available: ${available.join(', ')}`
                    : 'No marketplace manifest found and no plugins/<name>/ directory.';
            throw new Error(`Plugin '${name}' not found. ${msg}`);
        }
    }

    // Step 2: Map plugin → .rulesync/ canonical (single shared input)
    const outputDir = '.rulesync';
    mapPluginToRulesync(pluginRoot, name, outputDir);

    // Step 3: Rulesync-supported targets — prepareTargetRulesyncInput lays down
    // <outputDir>/.targets/<target>/.rulesync with target-transformed markdown,
    // then runRulesync writes native hook config and returns hooksCount.
    // Surrogates (pi/omp/hermes) are handled below.
    if (target !== 'pi' && target !== 'omp' && target !== 'hermes') {
        const targetInputRoot = prepareTargetRulesyncInput(outputDir, target);
        const result = await runRulesync([target], ['hooks'], targetInputRoot, { global, dryRun, verbose: false });
        return {
            count: result.hooksCount,
            message:
                result.hooksCount > 0
                    ? `Emitted ${result.hooksCount} hook(s) to ${target}.`
                    : `No hooks emitted to ${target} (plugin has no mappable hooks).`,
        };
    }

    // Step 4: Surrogate targets — pi/omp/hermes read the canonical hooks.json
    // directly. omp reuses pi's mapped input; hermes reuses opencode's (ADR-010).
    // prepareTargetRulesyncInput transforms the markdown for the surrogate source.
    const surrogateSourceTarget: Target = target === 'hermes' ? 'opencode' : 'pi';
    const surrogateInputRoot = prepareTargetRulesyncInput(outputDir, surrogateSourceTarget);
    const surrogateSourceDir = join(surrogateInputRoot, '.rulesync');
    const hookResult = emitHooksForSurrogateTarget(target, surrogateSourceDir, outputRoot, { dryRun, global });
    if (!hookResult) {
        return { count: 0, message: `Target '${target}' does not use the hook emit path.` };
    }
    return { count: hookResult.count, message: hookResult.message };
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

/** Evolve a hook definition with optional propose-only/ingest generation seam. */
export async function hookEvolve(opts: {
    name: string;
    target?: string;
    from?: string;
    proposeOnly?: boolean;
    accept?: string;
    reject?: string;
    json?: boolean;
    ingest?: string;
}): Promise<number | undefined> {
    await evolveHook(opts.name, opts);
    return undefined;
}

/** Emit a hook definition to a single target. Thin wrapper over the install hook path. */
export async function hookEmit(opts: {
    name: string;
    target?: string;
    global?: boolean;
    dryRun?: boolean;
}): Promise<number | undefined> {
    const result = await emitHook(opts.name, opts);
    echo(result.message);
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
    addTargetOption(
        cmd
            .command('emit <name>')
            .description('Emit a hook definition to a single target agent (thin wrapper over the install hook path)'),
    )
        .option('--global', 'Install to user-level global directory (default)', true)
        .option('--dry-run', 'Preview without writing files', false)
        .action(async (name: string, opts: { target?: string; global?: boolean; dryRun?: boolean }) => {
            await runOperation(() => hookEmit({ name, ...opts }));
        });
}
