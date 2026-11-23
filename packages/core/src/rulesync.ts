import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Feature, GenerateResult, ToolTarget } from 'rulesync';
import { generate as rulesyncGenerate } from 'rulesync';
import type { Target } from './targets';
import { TARGET_TO_RULESYNC } from './targets';

/**
 * Global `mcp_config.json` paths Antigravity rulesync targets read —
 * `<root>/.gemini/<subdir>/mcp_config.json`. Both shipped shapes are seeded:
 * rulesync 8.29.0 puts the CLI and the IDE in `config`, 8.32.0 moved the IDE to
 * `antigravity`. A blank file is only repaired, never created. Project mode uses
 * one shared `<root>/.agents/mcp_config.json` for either target.
 */
const ANTIGRAVITY_TARGETS: readonly Target[] = ['antigravity-cli', 'antigravity-ide'];

/**
 * Seed a blank Antigravity `mcp_config.json` with `{}` before rulesync reads it.
 *
 * rulesync's Antigravity MCP adapter merges the existing file through
 * `readFileContentOrNull() ?? '{"mcpServers":{}}'`, and `??` keeps the empty string a
 * zero-byte file yields, so `JSON.parse('')` aborts the whole install with
 * `JSON Parse error: Unexpected EOF`. Antigravity itself creates that file empty on a
 * fresh profile, so an MCP-bearing plugin (sp) installs skills for codex/pi/opencode and
 * then dies before the remaining targets. Nothing is written under `--dry-run`.
 */
function seedBlankAntigravityMcpConfigs(targets: Target[], root: string, global: boolean): void {
    if (!targets.some((target) => ANTIGRAVITY_TARGETS.includes(target))) return;
    const files = global
        ? [join(root, '.gemini', 'config', 'mcp_config.json'), join(root, '.gemini', 'antigravity', 'mcp_config.json')]
        : [join(root, '.agents', 'mcp_config.json')];
    for (const file of files) {
        if (!existsSync(file) || readFileSync(file, 'utf8').trim() !== '') continue;
        writeFileSync(file, '{}\n');
    }
}

/** Options for the rulesync generate call. */
export interface RulesyncOptions {
    global: boolean;
    dryRun: boolean;
    verbose: boolean;
    /** Override the root rulesync writes into. When omitted, falls back to the
     *  ADR-010 derivation: global → homedir(), project → process.cwd(). */
    outputRoot?: string;
    /** Override the superskill `Target` → rulesync `ToolTarget` map. Defaults to
     *  {@link TARGET_TO_RULESYNC}. The hooks feature pass passes `TARGET_TO_RULESYNC_HOOKS`
     *  so Antigravity reaches its native hook generator instead of sharing `codexcli`. */
    targetMap?: Partial<Record<Target, ToolTarget>>;
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
 *
 * IMPORTANT: rulesync's own `global: true` IGNORES `outputRoots` and forces
 * `$HOME` (verified against rulesync 8.29.0). So when an explicit `outputRoot`
 * override is given, we MUST pass `global: false` to rulesync so the override
 * is honored — otherwise the skill payload leaks to the real `$HOME` (task 0045
 * R1 regression). The override is only used for test isolation / a future
 * `--output` flag; production global installs pass no `outputRoot` and keep
 * `global: true` → `$HOME`, which is correct.
 */
export async function runRulesync(
    targets: Target[],
    features: Feature[],
    inputRoot: string,
    options: RulesyncOptions,
): Promise<GenerateResult> {
    const targetMap = options.targetMap ?? TARGET_TO_RULESYNC;
    const mappedTargets: ToolTarget[] = [];
    for (const target of targets) {
        const rt = targetMap[target];
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
    // When an explicit outputRoot is set, force global:false so rulesync honors
    // outputRoots (its global:true ignores them and writes to $HOME). The
    // project-mode relative layout under the override root is what callers want.
    const rulesyncGlobal = options.outputRoot ? false : options.global;
    if (!options.dryRun && features.includes('mcp')) {
        seedBlankAntigravityMcpConfigs(targets, root, rulesyncGlobal);
    }
    return rulesyncGenerate({
        targets: mappedTargets,
        features,
        inputRoot,
        outputRoots: [root],
        global: rulesyncGlobal,
        dryRun: options.dryRun,
        verbose: options.verbose,
        delete: false,
    });
}
