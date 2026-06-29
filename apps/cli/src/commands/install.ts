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
import { join } from 'node:path';
import {
    adaptSubagentToPi,
    listResolvablePlugins,
    mapPluginToRulesync,
    resolvePlugin,
    rewriteSkillReferences,
    runRulesync,
    TARGET_SKILLS_RELDIR,
    TARGET_TO_RULESYNC_HOOKS,
    TARGETS,
    type Target,
    translateSlashCommands,
} from '@gobing-ai/superskill-core';
import { echo } from '@gobing-ai/ts-utils';
import type { Command } from 'commander';
import { type EmitHooksResult, emitHermesHooks, emitPiStyleHooks } from '../hooks';

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
    /** Spawn `claude plugin marketplace add` + `claude plugin install`. Mockable for tests. */
    runClaudeInstall?: (marketplaceRoot: string, marketplaceName: string, plugin: string) => Promise<void>;
}

interface InstallResultCounts {
    skillsCount: number;
    commandsCount: number;
    subagentsCount: number;
    hooksCount: number;
}

/** Result of plugin resolution — includes marketplace metadata for Claude target. */
export interface PluginResolution {
    pluginRoot: string;
    marketplaceRoot?: string;
    marketplaceName?: string;
}

/** Execute the full install flow: resolve → map → pipeline → rulesync → dispatch. */
export async function executeInstall(
    plugin: string,
    targets: Target[],
    options: InstallOptions,
    dependencies: InstallDependencies = {},
): Promise<void> {
    const runRulesyncImpl = dependencies.runRulesync ?? runRulesync;
    const runClaudeInstallImpl = dependencies.runClaudeInstall ?? defaultRunClaudeInstall;

    if (options.verbose) echo(`Resolving plugin '${plugin}'...`);

    // Step 1: Resolve plugin root (+ marketplace metadata for Claude target)
    const resolution = resolvePluginRoot(plugin, options.marketplacePath);
    const pluginRoot = resolution.pluginRoot;

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
        const targetInputRoot = prepareTargetRulesyncInput(outputDir, target, plugin);
        targetInputRoots.set(target, targetInputRoot);
    }

    // Step 4: Run rulesync for supported targets. Include surrogate targets:
    // omp reuses pi's rulesync output, hermes reuses opencode's (see ADR-010).
    // Only request features the mapper actually produced — requesting 'mcp' when
    // the plugin has no mcp.json makes rulesync log a per-target ENOENT for the
    // missing .rulesync/mcp.json on every install.
    // Hooks are routed in a SEPARATE pass through TARGET_TO_RULESYNC_HOOKS so Antigravity reaches
    // its native hook generator (.agents/hooks.json) instead of sharing 'codexcli' with skills. The
    // main pass carries everything except hooks; the hooks-only pass carries just 'hooks'.
    const rulesyncFeatures = ['skills', ...(mapResult.mcp ? (['mcp'] as const) : [])] as const;
    const rulesyncTargets = targets.filter((t) => t !== 'claude' && t !== 'hermes' && t !== 'omp');
    if (targets.includes('omp') && !targets.includes('pi')) {
        if (!targetInputRoots.has('pi')) {
            targetInputRoots.set('pi', prepareTargetRulesyncInput(outputDir, 'pi', plugin));
        }
        rulesyncTargets.push('pi');
    }
    if (targets.includes('hermes') && !targets.includes('opencode')) {
        if (!targetInputRoots.has('opencode')) {
            targetInputRoots.set('opencode', prepareTargetRulesyncInput(outputDir, 'opencode', plugin));
        }
        rulesyncTargets.push('opencode');
    }
    const resultCounts: InstallResultCounts = { skillsCount: 0, commandsCount: 0, subagentsCount: 0, hooksCount: 0 };

    if (rulesyncTargets.length > 0) {
        // R2: pre-create per-target skills parent dirs before rulesync writes.
        // rulesync mkdirs the leaf non-recursively; in project mode from a clean
        // cwd the parent may not exist → ENOENT. TARGET_SKILLS_RELDIR holds the
        // PROJECT-mode reldirs, so this only applies when rulesync uses the
        // project-mode layout: real project installs (!global), or any install
        // with an explicit outputRoot override (which forces rulesync global:false,
        // see runRulesync). A real global install writes to $HOME with different
        // global reldirs where parents already exist — skip it there to avoid
        // creating empty junk dirs. Non-dry-run only (dry-run writes nothing).
        const usesProjectLayout = !options.global || options.outputRoot !== undefined;
        if (!options.dryRun && usesProjectLayout) {
            const rulesyncRoot = options.outputRoot ?? process.cwd();
            for (const target of rulesyncTargets) {
                const reldir = TARGET_SKILLS_RELDIR[target];
                if (reldir) mkdirSync(join(rulesyncRoot, reldir), { recursive: true });
            }
        }
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
                    outputRoot: options.outputRoot,
                },
            );
            resultCounts.skillsCount += result.skillsCount;
            resultCounts.commandsCount += result.commandsCount;
            resultCounts.subagentsCount += result.subagentsCount;
            resultCounts.hooksCount += result.hooksCount;
        }
        // Hooks-only pass: route through TARGET_TO_RULESYNC_HOOKS so Antigravity gets native hook
        // output. Only runs when the plugin actually produced a canonical hooks.json (mapResult.hooks).
        if (mapResult.hooks) {
            for (const target of rulesyncTargets) {
                if (!TARGET_TO_RULESYNC_HOOKS[target]) continue; // pi handled via surrogate shim below
                const hookResult = await runRulesyncImpl(
                    [target],
                    ['hooks'],
                    targetInputRoots.get(target) ?? outputDir,
                    {
                        global: options.global,
                        dryRun: options.dryRun,
                        verbose: options.verbose,
                        outputRoot: options.outputRoot,
                        targetMap: TARGET_TO_RULESYNC_HOOKS,
                    },
                );
                resultCounts.hooksCount += hookResult.hooksCount;
            }
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
            if (options.verbose) echo('Claude Code: registering marketplace and installing plugin...');
            if (!options.dryRun) {
                const marketplaceName = resolution.marketplaceName ?? 'superskill';
                const marketplaceRoot = resolution.marketplaceRoot ?? process.cwd();
                // Clear the plugin cache keyed on the resolved marketplace name (Refinement #5).
                // marketplace add is idempotent, so this is defensive — but bound it to the
                // correct name so we never rm -rf the wrong directory.
                const cacheDir = join(homedir(), '.claude', 'plugins', 'cache', marketplaceName);
                if (existsSync(cacheDir)) rmSync(cacheDir, { recursive: true, force: true });
                await runClaudeInstallImpl(marketplaceRoot, marketplaceName, plugin);
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
            // Skills: omp reads from ~/.agents/skills/ natively (shared with codex/pi/antigravity).
            // Hooks only — emitted via @vahor/pi-hooks format (design §1.2).
            const hookResult = emitPiStyleHooks(
                rulesyncSourceRoot(targetInputRoots.get('pi'), outputDir),
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

            // Pi native agent dispatch: adapt each subagent to Pi format → ~/.pi/agent/agents/
            const agentsDir = join(pluginRoot, 'agents');
            if (existsSync(agentsDir) && !options.dryRun) {
                const piAgentsDir = join(outputRoot, '.pi', 'agent', 'agents');
                mkdirSync(piAgentsDir, { recursive: true });
                for (const entry of readdirSync(agentsDir)) {
                    if (!entry.endsWith('.md')) continue;
                    const agentName = entry.replace(/\.md$/, '');
                    const expectedName = `${plugin}-${agentName}`;
                    const source = readFileSync(join(agentsDir, entry), 'utf-8');
                    const skillExists = (bare: string) => existsSync(join(pluginRoot, 'skills', bare));
                    const adapted = adaptSubagentToPi(source, expectedName, plugin, skillExists);
                    writeFileSync(join(piAgentsDir, `${expectedName}.md`), adapted);
                }
                if (options.verbose) echo(`  Pi agents: dispatched to ${piAgentsDir}`);
            }
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

/**
 * Default Claude Code installer — registers the local marketplace then installs
 * the plugin. Exposed as a dependency so tests can mock the spawn calls.
 */
async function defaultRunClaudeInstall(
    marketplaceRoot: string,
    marketplaceName: string,
    plugin: string,
): Promise<void> {
    // Register the local marketplace (idempotent — if already registered,
    // claude CLI exits 0 with a notice).
    const addProc = Bun.spawn(['claude', 'plugin', 'marketplace', 'add', marketplaceRoot], {
        stdout: 'inherit',
        stderr: 'inherit',
    });
    await addProc.exited;

    // Install the plugin from the registered marketplace.
    const installProc = Bun.spawn(['claude', 'plugin', 'install', `${plugin}@${marketplaceName}`], {
        stdout: 'inherit',
        stderr: 'inherit',
    });
    await installProc.exited;
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

/**
 * Resolve a plugin to its root directory and marketplace metadata.
 *
 * Tries the marketplace manifest first (via {@link resolvePlugin}), then falls
 * back to `plugins/<name>/plugin.json`. Throws when neither resolves.
 *
 * Returns {@link PluginResolution} which includes `marketplaceRoot` and
 * `marketplaceName` when resolved via a marketplace manifest — needed by the
 * Claude target to register the local marketplace before installing.
 */
export function resolvePluginRoot(plugin: string, marketplacePath?: string): PluginResolution {
    const resolved = resolvePlugin(marketplacePath, plugin);
    if (resolved) {
        const manifestRoot = resolved.marketplaceRoot;
        const manifestPath = join(manifestRoot, '.claude-plugin', 'marketplace.json');
        let marketplaceName: string | undefined;
        if (existsSync(manifestPath)) {
            try {
                const raw = readFileSync(manifestPath, 'utf-8');
                const parsed = JSON.parse(raw) as { name?: string };
                marketplaceName = parsed.name;
            } catch {
                // Non-fatal — fallback to 'superskill' in executeInstall
            }
        }
        return { pluginRoot: resolved.pluginRoot, marketplaceRoot: manifestRoot, marketplaceName };
    }

    const fallback = join('plugins', plugin);
    if (
        existsSync(fallback) &&
        readdirSync(fallback).some((d) => ['skills', 'commands', 'agents', 'hooks', 'hooks.json'].includes(d))
    )
        return { pluginRoot: fallback };

    const available = listResolvablePlugins(marketplacePath);
    const msg =
        available.length > 0
            ? `Available: ${available.join(', ')}`
            : 'No marketplace manifest found and no plugins/<name>/ directory.';
    throw new Error(`Plugin '${plugin}' not found. ${msg}`);
}

/** Prepares a target-transformed rulesync input layout — copies source into
 * `$sourceRoot/.targets/$target/.rulesync` and applies markdown transforms.
 * Returns the target root path consumed by {@link runRulesync}.
 *
 * @param pluginName  Plugin prefix (e.g. `cc`) for scoped colon-reference
 *                   rewriting (`pluginName:foo` → `pluginName-foo`). */
export function prepareTargetRulesyncInput(sourceRoot: string, target: Target, pluginName: string): string {
    const targetRoot = join(sourceRoot, '.targets', target);
    const targetRulesyncRoot = join(targetRoot, '.rulesync');
    rmSync(targetRoot, { recursive: true, force: true });
    copyDirectory(sourceRoot, targetRulesyncRoot, { skipDirectoryNames: new Set(['.targets']) });
    transformRulesyncMarkdown(targetRulesyncRoot, target, pluginName);
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

function transformRulesyncMarkdown(root: string, target: Target, pluginName: string): void {
    // Only skills/ exists now — commands and subagents are adapted into skill
    // directories by the mapper. Slash-command dialect translation and scoped
    // reference rewriting apply on the per-target pass.
    transformMarkdownDirectory(join(root, 'skills'), target, pluginName);
}

function transformMarkdownDirectory(dir: string, target: Target, pluginName: string): void {
    if (!existsSync(dir)) return;

    for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        const stats = statSync(path);
        if (stats.isDirectory()) {
            transformMarkdownDirectory(path, target, pluginName);
            continue;
        }
        if (!entry.endsWith('.md')) continue;

        const content = readFileSync(path, 'utf-8');
        // Translate slash commands to the target dialect, then apply scoped
        // reference rewriting as a safety net (the mapper already rewrites most
        // refs; this catches any residual `plugin:name` colons). Frontmatter
        // adaptation is already applied by the mapper.
        const slashTranslated = translateSlashCommands(content, target);
        const transformed = rewriteSkillReferences(slashTranslated, pluginName);
        writeFileSync(path, transformed);
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
