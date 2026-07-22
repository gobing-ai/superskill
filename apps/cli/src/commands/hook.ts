import { homedir } from 'node:os';
import { join } from 'node:path';
import { mapPluginToRulesync, runRulesync, type Target } from '@gobing-ai/superskill-core';
import { echo, echoError } from '@gobing-ai/ts-utils';
import type { Command } from 'commander';
import { evaluate, formatEvaluationReport } from '../operations/evaluate';
import { evolve } from '../operations/evolve';
import { refine } from '../operations/refine';
import { formatValidationResult, validate } from '../operations/validate';
import {
    addEvaluateOptions,
    addHookEvolveOptions,
    addHookRefineOptions,
    addJsonOption,
    addSaveOption,
    addStrictOption,
    addTargetOption,
    exitFor,
    resolveTarget,
    runOperation,
} from './helpers';
import { registerHookRun } from './hook-run';
import { emitHooksForSurrogateTarget, prepareTargetRulesyncInput, resolvePluginRoot } from './install';

// ── Inner Operation Functions ─────────────────────────────────────────────

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

async function refineHook(nameOrPath: string, opts: { target?: string; dryRun?: boolean }) {
    // Task 0061 decision C: hook refine is suggest-only — no auto-apply, no save.
    const target = resolveTarget(opts);
    return refine('hook', nameOrPath, { target, dryRun: opts.dryRun });
}

async function evolveHook(
    name: string,
    opts: {
        target?: string;
        from?: string;
        json?: boolean;
        analyze?: boolean;
    },
) {
    const target = resolveTarget(opts);
    return evolve('hook', name, {
        target,
        from: opts.from,
        json: opts.json,
        analyze: opts.analyze,
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

    // Step 1: Resolve plugin root (shared with `superskill install`)
    const pluginRoot = resolvePluginRoot(name).pluginRoot;

    // Step 2: Map plugin → .rulesync/ canonical (single shared input)
    const outputDir = '.rulesync';
    mapPluginToRulesync(pluginRoot, name, outputDir);

    // Step 3: Rulesync-supported targets — prepareTargetRulesyncInput lays down
    // <outputDir>/.targets/<target>/.rulesync with target-transformed markdown,
    // then runRulesync writes native hook config and returns hooksCount.
    // Surrogates (pi/omp/hermes) are handled below.
    if (target !== 'pi' && target !== 'omp' && target !== 'hermes') {
        const targetInputRoot = prepareTargetRulesyncInput(outputDir, target, name);
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
    const surrogateInputRoot = prepareTargetRulesyncInput(outputDir, surrogateSourceTarget, name);
    const surrogateSourceDir = join(surrogateInputRoot, '.rulesync');
    const hookResult = emitHooksForSurrogateTarget(target, surrogateSourceDir, outputRoot, { dryRun, global }, name);
    if (!hookResult) {
        return { count: 0, message: `Target '${target}' does not use the hook emit path.` };
    }
    return { count: hookResult.count, message: hookResult.message };
}

// ── Exported Handler Functions ────────────────────────────────────────────

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

/** Refine a hook definition — suggest-only (task 0061 decision C). No auto-apply, no save. */
export async function hookRefine(opts: {
    nameOrPath: string;
    target?: string;
    dryRun?: boolean;
}): Promise<number | undefined> {
    await refineHook(opts.nameOrPath, opts);
    return undefined;
}

/** Evolve a hook definition — analyze-only (task 0056 decision C). No apply/history/rollback. */
export async function hookEvolve(opts: {
    name: string;
    target?: string;
    from?: string;
    json?: boolean;
    analyze?: boolean;
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

    addHookRefineOptions(
        cmd
            .command('refine <nameOrPath>')
            .description('Surface hook quality findings as suggestions (suggest-only, no auto-apply)'),
    ).action(async (nameOrPath: string, opts: { target?: string; dryRun?: boolean }) => {
        await runOperation(() => hookRefine({ nameOrPath, ...opts }));
    });

    addHookEvolveOptions(
        cmd.command('evolve <name>').description('Analyze hook evaluation trends (analyze-only, no apply)'),
    ).action(async (name: string, opts: { target?: string; from?: string; analyze?: boolean; json?: boolean }) => {
        await runOperation(() => hookEvolve({ name, ...opts }));
    });
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

    registerHookRun(cmd);
}
