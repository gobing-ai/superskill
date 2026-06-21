import { homedir } from 'node:os';
import type { Feature, GenerateResult, ToolTarget } from 'rulesync';
import { generate as rulesyncGenerate } from 'rulesync';
import type { Target } from './targets';
import { TARGET_TO_RULESYNC } from './targets';

/** Options for the rulesync generate call. */
export interface RulesyncOptions {
    global: boolean;
    dryRun: boolean;
    verbose: boolean;
    /** Override the root rulesync writes into. When omitted, falls back to the
     *  ADR-010 derivation: global → homedir(), project → process.cwd(). */
    outputRoot?: string;
}

/**
 * Run `rulesync.generate()` via the programmatic API — NOT the CLI.
 *
 * Maps superskill `Target` values to rulesync `ToolTarget` strings via
 * `TARGET_TO_RULESYNC`. Targets without a rulesync mapping (claude, omp,
 * hermes) are skipped.
 *
 * `outputRoots` is MANDATORY (ADR-010). rulesync writes to
 * `<outputRoot>/<relativeDirPath>`; the `global` flag only swaps the
 * relative subdir. When `options.outputRoot` is set it overrides the root;
 * otherwise the root derives from `global` (→ homedir) vs project (→ cwd).
 */
export async function runRulesync(
    targets: Target[],
    features: Feature[],
    inputRoot: string,
    options: RulesyncOptions,
): Promise<GenerateResult> {
    const mappedTargets: ToolTarget[] = [];
    for (const target of targets) {
        const rt = TARGET_TO_RULESYNC[target];
        if (rt) mappedTargets.push(rt as ToolTarget);
    }

    if (mappedTargets.length === 0) {
        return {
            rulesCount: 0,
            rulesPaths: [],
            ignoreCount: 0,
            ignorePaths: [],
            mcpCount: 0,
            mcpPaths: [],
            commandsCount: 0,
            commandsPaths: [],
            subagentsCount: 0,
            subagentsPaths: [],
            skillsCount: 0,
            skillsPaths: [],
            hooksCount: 0,
            hooksPaths: [],
            permissionsCount: 0,
            permissionsPaths: [],
            skills: [],
            hasDiff: false,
        };
    }

    const root = options.outputRoot ?? (options.global ? homedir() : process.cwd());
    return rulesyncGenerate({
        targets: mappedTargets,
        features,
        inputRoot,
        outputRoots: [root],
        global: options.global,
        dryRun: options.dryRun,
        verbose: options.verbose,
        delete: false,
    });
}
