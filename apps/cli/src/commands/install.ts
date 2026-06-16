import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { echo } from '@gobing-ai/ts-utils';
import type { Command } from 'commander';
import { mapPluginToRulesync } from '../mapper';
import { listResolvablePlugins, resolvePlugin } from '../marketplace';
import { runRulesync } from '../rulesync';
import type { Target } from '../targets';
import { TARGETS } from '../targets';

/**
 * Register the `superskill install` subcommand on the given Commander program.
 */
export function registerInstall(program: Command): void {
    program
        .command('install')
        .description(
            "Install a Claude Code plugin's skills, commands, subagents, hooks, and MCP config to target coding agents",
        )
        .argument('<plugin>', 'Plugin name to install')
        .option('--marketplace <path>', 'Path to .claude-plugin/marketplace.json or its containing directory')
        .option('--targets <list>', 'Comma-separated target agents (default: all configured)')
        .option('--global', 'Install to user-level global directories (default: true)', true)
        .option('--dry-run', 'Preview without writing files', false)
        .option('--verbose', 'Print each step and file copy', false)
        .action(async (plugin, options) => {
            const targets = parseTargets(options.targets);
            const global = options.global !== false;
            const dryRun = options.dryRun === true;
            const verbose = options.verbose === true;

            try {
                await executeInstall(plugin, targets, {
                    marketplacePath: options.marketplace,
                    global,
                    dryRun,
                    verbose,
                });
            } catch (err) {
                echo(`Error: ${err instanceof Error ? err.message : String(err)}`);
                process.exit(1);
            }
        });
}

interface InstallOptions {
    marketplacePath?: string;
    global: boolean;
    dryRun: boolean;
    verbose: boolean;
}

interface InstallDependencies {
    runRulesync?: typeof runRulesync;
}

/** Execute the full install flow: resolve → map → pipeline → rulesync → dispatch. */
export async function executeInstall(
    plugin: string,
    targets: Target[],
    options: InstallOptions,
    dependencies: InstallDependencies = {},
): Promise<void> {
    const runRulesyncImpl = dependencies.runRulesync ?? runRulesync;

    if (options.verbose) echo(`Resolving plugin '${plugin}'...`);

    // Step 1: Resolve plugin root
    let pluginRoot: string;
    const resolved = resolvePlugin(options.marketplacePath, plugin);
    if (resolved) {
        pluginRoot = resolved.pluginRoot;
    } else {
        // Fallback: scan plugins/<name>/
        const fallback = join('plugins', plugin);
        if (existsSync(join(fallback, 'plugin.json'))) {
            pluginRoot = fallback;
        } else {
            const available = listResolvablePlugins(options.marketplacePath);
            const msg =
                available.length > 0
                    ? `Available: ${available.join(', ')}`
                    : 'No marketplace manifest found and no plugins/<name>/ directory.';
            throw new Error(`Plugin '${plugin}' not found. ${msg}`);
        }
    }

    if (options.verbose) echo(`Plugin root: ${pluginRoot}`);

    // Step 2: Map plugin → .rulesync/ canonical
    const outputDir = '.rulesync';
    if (options.verbose) echo('Mapping plugin to .rulesync/ canonical layout...');
    const mapResult = mapPluginToRulesync(pluginRoot, plugin, outputDir);
    if (options.verbose) {
        echo(
            `  Skills: ${mapResult.skills}, Commands: ${mapResult.commands}, Subagents: ${mapResult.subagents}, Hooks: ${mapResult.hooks}, MCP: ${mapResult.mcp}`,
        );
    }

    // Step 3: Run rulesync for supported targets
    const rulesyncFeatures = ['skills', 'commands', 'subagents', 'hooks', 'mcp'] as const;
    const rulesyncTargets = targets.filter((t) => t !== 'claude' && t !== 'hermes' && t !== 'omp');

    if (rulesyncTargets.length > 0) {
        if (options.verbose) echo(`Running rulesync for ${rulesyncTargets.join(', ')}...`);
        const result = await runRulesyncImpl(rulesyncTargets, [...rulesyncFeatures], outputDir, {
            global: options.global,
            dryRun: options.dryRun,
            verbose: options.verbose,
        });
        if (options.verbose) {
            echo(
                `  Skills written: ${result.skillsCount}, Commands: ${result.commandsCount}, Subagents: ${result.subagentsCount}`,
            );
        }
    }

    // Step 4: Dispatch non-rulesync targets
    const outputRoot = options.global ? homedir() : process.cwd();

    for (const target of targets) {
        if (target === 'claude') {
            if (options.verbose) echo('Claude Code: plugin marketplace update...');
            if (!options.dryRun) {
                const proc = Bun.spawn(['claude', 'plugin', 'install', `${plugin}@local`, '--path', pluginRoot], {
                    stdout: 'inherit',
                    stderr: 'inherit',
                });
                await proc.exited;
            }
        }

        if (target === 'hermes') {
            if (options.verbose) echo(`Copying to Hermes: ${join(outputRoot, '.hermes', 'skills')}...`);
        }

        if (target === 'omp') {
            if (options.verbose) echo(`Copying to omp: ${join(outputRoot, '.omp', 'agent', 'skills')}...`);
        }
    }

    if (options.dryRun) {
        echo('[DRY-RUN] No files were written.');
    } else {
        echo(`Installed '${plugin}' to ${targets.length} target(s).`);
    }
}

/** Parse a comma-separated targets string. Returns all targets when undefined or "all". Throws on unknown targets. */
export function parseTargets(raw: string | undefined): Target[] {
    if (!raw) return [...TARGETS];
    if (raw === 'all') return [...TARGETS];
    const requested = raw.split(',').map((t) => t.trim());
    for (const t of requested) {
        if (!(TARGETS as readonly string[]).includes(t)) {
            throw new Error(`Unknown target '${t}'. Valid targets: ${TARGETS.join(', ')}`);
        }
    }
    return requested as Target[];
}
