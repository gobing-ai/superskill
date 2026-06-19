import {
    copyFileSync,
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    rmSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { echo } from '@gobing-ai/ts-utils';
import type { Command } from 'commander';
import { type EmitHooksResult, emitHermesHooks, emitPiStyleHooks } from '../hooks';
import { mapPluginToRulesync } from '../mapper';
import { listResolvablePlugins, resolvePlugin } from '../marketplace';
import { normalizeFrontmatter } from '../pipeline/frontmatter';
import { convertToPiSubagent } from '../pipeline/pi-subagent';
import { rewriteColonRefs } from '../pipeline/rewrite-colons';
import { translateSlashCommands } from '../pipeline/slash-command';
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
        .option('--no-global', 'Install to project-level instead of user-level global directories')
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
    outputRoot?: string;
}

interface InstallDependencies {
    runRulesync?: typeof runRulesync;
}

interface InstallResultCounts {
    skillsCount: number;
    commandsCount: number;
    subagentsCount: number;
    hooksCount: number;
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

    // Step 3: Build target-specific rulesync inputs through the conversion pipeline.
    const targetInputRoots = new Map<Target, string>();
    for (const target of targets) {
        const targetInputRoot = prepareTargetRulesyncInput(outputDir, target);
        targetInputRoots.set(target, targetInputRoot);
    }

    // Step 3: Run rulesync for supported targets. Include surrogate targets:
    // omp reuses pi's rulesync output, hermes reuses opencode's (see ADR-010).
    const rulesyncFeatures = ['skills', 'commands', 'subagents', 'hooks', 'mcp'] as const;
    const rulesyncTargets = targets.filter((t) => t !== 'claude' && t !== 'hermes' && t !== 'omp');
    if (targets.includes('omp') && !targets.includes('pi')) {
        if (!targetInputRoots.has('pi')) {
            targetInputRoots.set('pi', prepareTargetRulesyncInput(outputDir, 'pi'));
        }
        rulesyncTargets.push('pi');
    }
    if (targets.includes('hermes') && !targets.includes('opencode')) {
        if (!targetInputRoots.has('opencode')) {
            targetInputRoots.set('opencode', prepareTargetRulesyncInput(outputDir, 'opencode'));
        }
        rulesyncTargets.push('opencode');
    }
    const resultCounts: InstallResultCounts = { skillsCount: 0, commandsCount: 0, subagentsCount: 0, hooksCount: 0 };

    if (rulesyncTargets.length > 0) {
        if (options.verbose) echo(`Running rulesync for ${rulesyncTargets.join(', ')}...`);
        for (const target of rulesyncTargets) {
            const result = await runRulesyncImpl(
                [target],
                [...rulesyncFeatures],
                targetInputRoots.get(target) ?? outputDir,
                {
                    global: options.global,
                    dryRun: options.dryRun,
                    verbose: options.verbose,
                },
            );
            resultCounts.skillsCount += result.skillsCount;
            resultCounts.commandsCount += result.commandsCount;
            resultCounts.subagentsCount += result.subagentsCount;
            resultCounts.hooksCount += result.hooksCount;
        }
        if (options.verbose) {
            echo(
                `  Skills written: ${resultCounts.skillsCount}, Commands: ${resultCounts.commandsCount}, Subagents: ${resultCounts.subagentsCount}, Hooks: ${resultCounts.hooksCount}`,
            );
        }
    }

    // Step 4: Dispatch non-rulesync targets + emit hooks for uncovered targets
    const outputRoot = options.outputRoot ?? (options.global ? homedir() : process.cwd());
    const hookEmitResults: EmitHooksResult[] = [];
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
            const srcTarget = 'opencode';
            const dest = join(outputRoot, '.hermes', 'skills');
            if (options.verbose) echo(`Copying to Hermes (via opencode rulesync): ${dest}...`);
            if (!options.dryRun)
                copyDirectory(join(rulesyncSourceRoot(targetInputRoots.get(srcTarget), outputDir), 'skills'), dest);
            // Rung (c): copy-step — hermes hooks via canonical hooks.json copy (design §1.2, §2.1)
            const hookResult = emitHermesHooks(
                rulesyncSourceRoot(targetInputRoots.get(srcTarget), outputDir),
                outputRoot,
                { dryRun: options.dryRun, global: options.global },
            );
            hookEmitResults.push(hookResult);
            if (options.verbose) echo(`  ${hookResult.message}`);
        }

        if (target === 'omp') {
            const srcTarget = 'pi';
            const dest = join(outputRoot, '.omp', 'agent', 'skills');
            if (options.verbose) echo(`Copying to omp (via pi rulesync): ${dest}...`);
            if (!options.dryRun)
                copyDirectory(join(rulesyncSourceRoot(targetInputRoots.get(srcTarget), outputDir), 'skills'), dest);
            // Rung (b): superskill-installed shim — omp hooks via @vahor/pi-hooks format (design §1.2)
            const hookResult = emitPiStyleHooks(
                rulesyncSourceRoot(targetInputRoots.get(srcTarget), outputDir),
                outputRoot,
                '.omp',
                'omp',
                { dryRun: options.dryRun, global: options.global },
            );
            hookEmitResults.push(hookResult);
            if (options.verbose) echo(`  ${hookResult.message}`);
        }

        // Pi reaches generate() but rulesync emits no hooks for it (hooks column blank, §1 table).
        // Rung (b): superskill-installed shim — pi hooks via @vahor/pi-hooks format (design §1.2)
        if (target === 'pi') {
            const hookResult = emitPiStyleHooks(
                rulesyncSourceRoot(targetInputRoots.get('pi'), outputDir),
                outputRoot,
                '.pi',
                'pi',
                { dryRun: options.dryRun, global: options.global },
            );
            hookEmitResults.push(hookResult);
            if (options.verbose) echo(`  ${hookResult.message}`);
        }
    }

    // No silent drop (design §6 exit #2): surface hook emission results for uncovered targets
    for (const result of hookEmitResults) {
        echo(result.message);
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

/** Prepares a target-transformed rulesync input layout — copies source into
 * `$sourceRoot/.targets/$target/.rulesync` and applies markdown transforms.
 * Returns the target root path consumed by {@link runRulesync}. */
export function prepareTargetRulesyncInput(sourceRoot: string, target: Target): string {
    const targetRoot = join(sourceRoot, '.targets', target);
    const targetRulesyncRoot = join(targetRoot, '.rulesync');
    rmSync(targetRoot, { recursive: true, force: true });
    copyDirectory(sourceRoot, targetRulesyncRoot, { skipDirectoryNames: new Set(['.targets']) });
    transformRulesyncMarkdown(targetRulesyncRoot, target);
    return targetRoot;
}

function rulesyncSourceRoot(inputRoot: string | undefined, fallbackRoot: string): string {
    if (!inputRoot) return fallbackRoot;
    return join(inputRoot, '.rulesync');
}

/**
 * Emit hooks for a single surrogate target (pi/omp/hermes) — the post-rulesync
 * shim path. Factored from the install loop so `superskill hook emit` can reuse
 * it for single-target emission without re-running the full install pipeline.
 *
 * Returns the {@link EmitHooksResult} from the underlying emit function. For
 * non-surrogate targets (codex/opencode/antigravity/claude) returns `null` —
 * those go through {@link runRulesync} directly.
 */
export function emitHooksForSurrogateTarget(
    target: Target,
    rulesyncSourceDir: string,
    outputRoot: string,
    options: { dryRun: boolean; global: boolean },
): EmitHooksResult | null {
    if (target === 'pi') {
        return emitPiStyleHooks(rulesyncSourceDir, outputRoot, '.pi', 'pi', options);
    }
    if (target === 'omp') {
        return emitPiStyleHooks(rulesyncSourceDir, outputRoot, '.omp', 'omp', options);
    }
    if (target === 'hermes') {
        return emitHermesHooks(rulesyncSourceDir, outputRoot, options);
    }
    return null;
}

function transformRulesyncMarkdown(root: string, target: Target): void {
    transformMarkdownDirectory(join(root, 'skills'), target);
    transformMarkdownDirectory(join(root, 'commands'), target, { normalizeName: true, translateSlash: true });
    transformMarkdownDirectory(join(root, 'subagents'), target, {
        normalizeName: true,
        piSubagent: target === 'pi' || target === 'omp',
    });
}

function transformMarkdownDirectory(
    dir: string,
    target: Target,
    options: { normalizeName?: boolean; translateSlash?: boolean; piSubagent?: boolean } = {},
): void {
    if (!existsSync(dir)) return;

    for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        const stats = statSync(path);
        if (stats.isDirectory()) {
            transformMarkdownDirectory(path, target, options);
            continue;
        }
        if (!entry.endsWith('.md')) continue;

        const name = entry === 'SKILL.md' ? basename(dir) : entry.replace(/\.md$/, '');
        let content = readFileSync(path, 'utf-8');
        if (options.normalizeName) content = normalizeFrontmatter(content, name);
        if (options.translateSlash) content = translateSlashCommands(content, target);
        content = rewriteColonRefs(content);
        if (options.piSubagent) content = convertToPiSubagent(content);
        writeFileSync(path, content);
    }
}

function copyDirectory(source: string, destination: string, options: { skipDirectoryNames?: Set<string> } = {}): void {
    if (!existsSync(source)) return;

    mkdirSync(destination, { recursive: true });
    for (const entry of readdirSync(source)) {
        if (options.skipDirectoryNames?.has(entry)) continue;

        const sourcePath = join(source, entry);
        const destinationPath = join(destination, entry);
        if (statSync(sourcePath).isDirectory()) {
            copyDirectory(sourcePath, destinationPath, options);
        } else {
            copyFileSync(sourcePath, destinationPath);
        }
    }
}
