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
    TARGET_GLOBAL_SKILLS_RELDIR,
    TARGET_SKILLS_RELDIR,
    TARGET_TO_RULESYNC_HOOKS,
    TARGETS,
    type Target,
    translateSlashCommands,
} from '@gobing-ai/superskill-core';
import { echo } from '@gobing-ai/ts-utils';
import type { Command } from 'commander';
import { type EmitHooksResult, emitHermesHooks, emitPiStyleHooks, readCanonicalHooks } from '../hooks';
import { generateOmpHookModules, type OmpHookResult } from '../omp-hooks';
import { cliVersion } from '../version';

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
    /** Spawn `omp plugin marketplace add` + `omp plugin install`. Mockable for tests. */
    runOmpInstall?: (
        marketplaceRoot: string,
        marketplaceName: string,
        plugin: string,
        global: boolean,
    ) => Promise<void>;
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
    const runOmpInstallImpl = dependencies.runOmpInstall ?? defaultRunOmpInstall;

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
    // Compat gate: if the canonical hooks.json declares minCliVersion and the installed CLI is
    // older, skip ALL hook emission (pi shim, hermes copy, omp modules, rulesync hooks pass) but
    // still install skills/commands/subagents. Hooks reference `superskill hook run <id>`; an old
    // CLI that doesn't know <id> would warn + fail open at runtime, so emitting them adds noise
    // without enforcement. Skills/commands carry their own logic and need no CLI version.
    let hooksBlockedByCliVersion = false;
    if (mapResult.hooks) {
        const canonicalHooks = readCanonicalHooks(join(outputDir));
        const floor = canonicalHooks?.minCliVersion;
        if (floor) {
            if (compareSemver(cliVersion, floor) < 0) {
                hooksBlockedByCliVersion = true;
                echo(
                    `Warning: plugin requires superskill ≥ ${floor}; installed CLI is ${cliVersion}. ` +
                        `Hooks will be skipped (skills/commands/subagents install normally). ` +
                        `Upgrade: npm i -g @gobing-ai/superskill@latest`,
                );
            }
        }
    }

    // Step 3: Build target-specific rulesync inputs through the conversion pipeline.
    const targetInputRoots = new Map<Target, string>();
    for (const target of targets) {
        const targetInputRoot = prepareTargetRulesyncInput(outputDir, target, plugin);
        targetInputRoots.set(target, targetInputRoot);
    }

    // Step 4: Run rulesync for supported targets. omp is now installed natively
    // (marketplace add + plugin install — see dispatch loop); hermes reuses
    // opencode's rulesync output (see ADR-010).
    // Only request features the mapper actually produced — requesting 'mcp' when
    const rulesyncFeatures = ['skills', ...(mapResult.mcp ? (['mcp'] as const) : [])] as const;
    const rulesyncTargets = targets.filter((t) => t !== 'claude' && t !== 'hermes' && t !== 'omp');
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
            // Per-target summary in verbose mode. Surfaces the 5 rulesync-supported
            // targets (codex / pi / opencode / antigravity-cli / antigravity-ide) that
            // were previously silent on success — only the surrogate hooks for pi/omp/
            // hermes appeared. Helps the user verify with `ls` that each target's
            // skills landed in the directory its consumer reads.
            //
            // We count the actual entries on disk (directories containing SKILL.md)
            // rather than reporting the rulesync diff count, which is 0 on a no-op
            // re-install. The user wants to see "how many skills are at this path NOW",
            // not "how many files did this run touch". In dry-run mode the dir doesn't
            // exist yet, so we fall back to the diff count.
            if (options.verbose) {
                const reldir = options.global
                    ? (TARGET_GLOBAL_SKILLS_RELDIR[target] ?? TARGET_SKILLS_RELDIR[target])
                    : TARGET_SKILLS_RELDIR[target];
                if (reldir) {
                    const skillsDir = options.global ? join(resolveHomeDir(), reldir) : join(process.cwd(), reldir);
                    const total = options.dryRun ? result.skillsCount : countSkillsInDir(skillsDir);
                    echo(`  ${target}: ${total} skill(s) at ${skillsDir}`);
                }
            }
        }
        // Hooks-only pass: route through TARGET_TO_RULESYNC_HOOKS so Antigravity gets native hook
        // output. Only runs when the plugin actually produced a canonical hooks.json (mapResult.hooks).
        if (mapResult.hooks && !hooksBlockedByCliVersion) {
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
    const outputRoot = options.outputRoot ?? (options.global ? resolveHomeDir() : process.cwd());
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
                const cacheDir = join(resolveHomeDir(), '.claude', 'plugins', 'cache', marketplaceName);
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
            // Rung (c): copy-step — hermes hooks via canonical hooks.json copy (design §1.2, §2.1).
            // Skipped when the CLI is below the plugin's minCliVersion (hooks would fail-open at runtime).
            if (!hooksBlockedByCliVersion) {
                const hookResult = emitHermesHooks(
                    rulesyncSourceRoot(targetInputRoots.get(srcTarget), outputDir),
                    outputRoot,
                    { dryRun: options.dryRun, global: options.global },
                );
                hookEmitResults.push(hookResult);
                if (options.verbose) echo(`  ${hookResult.message}`);
            } else if (options.verbose) {
                echo('  Hermes hooks: skipped (CLI below plugin minCliVersion)');
            }
        }

        if (target === 'omp') {
            // OMP native install: omp supports Claude Code marketplace plugins directly
            // via its claude-plugins provider. We register the local marketplace, install
            // the plugin, then post-process the cached install path: copy the manifest,
            // generate JS hook modules (hooks/pre/ + hooks/post/), and translate slash
            // commands to OMP dialect. See task 0073.
            if (options.verbose) echo('OMP: registering marketplace and installing plugin...');
            if (!options.dryRun) {
                const marketplaceName = resolution.marketplaceName ?? 'superskill';
                const marketplaceRoot = resolution.marketplaceRoot ?? process.cwd();
                await runOmpInstallImpl(marketplaceRoot, marketplaceName, plugin, options.global);
                const installPath = resolveOmpInstallPath(marketplaceName, plugin, options.global);
                if (installPath) {
                    const hookResult = postInstallOmp(pluginRoot, installPath, outputDir, plugin, {
                        ...options,
                        skipHooks: hooksBlockedByCliVersion,
                    });
                    if (options.verbose) echo(`  ${hookResult.message}`);
                } else if (options.verbose) {
                    echo('  OMP install path not found in registry — skipping post-processing');
                }
            }
        }

        // Pi reaches generate() but rulesync emits no hooks for it (hooks column blank, §1 table).
        // Rung (b): superskill-installed shim — pi hooks via @vahor/pi-hooks format (design §1.2)
        if (target === 'pi') {
            if (!hooksBlockedByCliVersion) {
                const hookResult = emitPiStyleHooks(
                    rulesyncSourceRoot(targetInputRoots.get('pi'), outputDir),
                    outputRoot,
                    '.pi',
                    'pi',
                    { dryRun: options.dryRun, global: options.global },
                );
                hookEmitResults.push(hookResult);
                if (options.verbose) echo(`  ${hookResult.message}`);
            } else if (options.verbose) {
                echo('  Pi hooks: skipped (CLI below plugin minCliVersion)');
            }

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
    // in non-verbose mode. Verbose mode already echoes each result at the dispatch site
    // (the `if (options.verbose) echo(...)` blocks above for hermes/omp/pi), so we skip the
    // unconditional re-echo here when --verbose is on — otherwise pi/omp/hermes each appear
    // twice in the output.
    if (!options.verbose) {
        for (const result of hookEmitResults) {
            echo(result.message);
        }
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

// ── OMP native install helpers (task 0073) ──────────────────────────────────

/** Minimal OMP installed_plugins.json entry shape (see vendors/.../marketplace/types.ts). */
interface OmpPluginEntry {
    scope: 'user' | 'project';
    /** Absolute path to cached plugin directory. */
    installPath: string;
}

/** Minimal OMP registry shape — MUST match ClaudePluginsRegistry for parsing compatibility. */
interface OmpPluginsRegistry {
    version: number;
    plugins: Record<string, OmpPluginEntry[]>;
}

/**
 * Default OMP installer — clears the marketplace cache (idempotency), registers the local
 * marketplace, then installs the plugin. Exposed as a dependency so tests can mock the spawn
 * calls. Mirrors {@link defaultRunClaudeInstall} but adds the `global` flag for scope selection.
 */
export async function defaultRunOmpInstall(
    marketplaceRoot: string,
    marketplaceName: string,
    plugin: string,
    global: boolean,
): Promise<void> {
    // Clear the OMP plugin cache keyed on the marketplace name so re-installs pick up source
    // changes (omp caches by marketplace___plugin___version). Bound to the resolved name so
    // we never rm -rf the wrong directory.
    const cacheDir = join(resolveHomeDir(), '.omp', 'plugins', 'cache', marketplaceName);
    if (existsSync(cacheDir)) rmSync(cacheDir, { recursive: true, force: true });

    const addProc = Bun.spawn(['omp', 'plugin', 'marketplace', 'add', marketplaceRoot], {
        stdout: 'inherit',
        stderr: 'inherit',
    });
    await addProc.exited;

    const installArgs = ['omp', 'plugin', 'install', `${plugin}@${marketplaceName}`];
    if (!global) installArgs.push('--scope', 'project');
    const installProc = Bun.spawn(installArgs, { stdout: 'inherit', stderr: 'inherit' });
    await installProc.exited;
}

/**
 * Resolve the install path for a plugin from the OMP registry. Reads
 * `~/.omp/plugins/installed_plugins.json` (global) or
 * `.omp/plugins/installed_plugins.json` (project), keyed by `plugin@marketplace`.
 * Returns the first entry's `installPath`, or `undefined` when absent.
 */
export function resolveOmpInstallPath(marketplace: string, plugin: string, global: boolean): string | undefined {
    const registryDir = global ? join(resolveHomeDir(), '.omp', 'plugins') : join(process.cwd(), '.omp', 'plugins');
    const registryPath = join(registryDir, 'installed_plugins.json');
    if (!existsSync(registryPath)) return undefined;

    let registry: OmpPluginsRegistry;
    try {
        registry = JSON.parse(readFileSync(registryPath, 'utf-8')) as OmpPluginsRegistry;
    } catch {
        return undefined;
    }

    if (typeof registry.version !== 'number' || !registry.plugins) return undefined;
    const key = `${plugin}@${marketplace}`;
    const entries = registry.plugins[key];
    if (!Array.isArray(entries) || entries.length === 0) return undefined;
    return entries[0]?.installPath;
}

/**
 * Post-process an OMP-cached plugin install path: (R2) copy `plugin.json` into
 * `.claude-plugin/plugin.json` so the claude-plugins provider validates the manifest;
 * (R3) generate JS hook modules under `hooks/pre/` + `hooks/post/` from the canonical
 * hooks.json; (R4) translate slash command markdown to OMP dialect.
 */
export function postInstallOmp(
    pluginRoot: string,
    installPath: string,
    hooksSourceDir: string,
    plugin: string,
    options: { dryRun: boolean; verbose: boolean; skipHooks?: boolean },
): OmpHookResult {
    // R2: manifest copy — .claude-plugin/plugin.json
    const manifestDir = join(installPath, '.claude-plugin');
    const sourceManifest = join(pluginRoot, 'plugin.json');
    if (existsSync(sourceManifest)) {
        mkdirSync(manifestDir, { recursive: true });
        copyFileSync(sourceManifest, join(manifestDir, 'plugin.json'));
        if (options.verbose) echo(`  OMP manifest: copied plugin.json → ${join(manifestDir, 'plugin.json')}`);
    }

    // R3: generate hook modules from canonical hooks.json. Skipped when the CLI is below the
    // plugin's minCliVersion — the modules would call `superskill hook run <id>` the old CLI
    // doesn't know. R2 (manifest) and R4 (command translation) still run unconditionally.
    let hookResult: OmpHookResult;
    if (options.skipHooks) {
        if (options.verbose) echo('  OMP hooks: skipped (CLI below plugin minCliVersion)');
        hookResult = { count: 0, files: [], message: 'OMP hooks skipped (CLI below plugin minCliVersion)' };
    } else {
        hookResult = generateOmpHookModules(hooksSourceDir, installPath);
    }

    // R4: slash command dialect translation on installed commands/
    transformMarkdownDirectory(join(installPath, 'commands'), 'omp', plugin);
    return hookResult;
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

/**
 * Count the actual skill directories under a given path. A "skill" is a
 * directory containing a `SKILL.md` file (the format rulesync emits and
 * Antigravity / Codex / Pi / OMP / opencode all consume). This reflects the
 * user-visible inventory at the path, not a diff count.
 *
 * Returns 0 if the path does not exist (caller decides whether to fall back).
 */
/**
 * Mirror rulesync's `getHomeDirectory()` resolution: prefer the `HOME_DIR`
 * environment variable, fall back to `os.homedir()`. Both `countSkillsInDir`
 * and rulesync use this so the per-target count reflects what rulesync
 * actually wrote, even when the test process sets `HOME_DIR` to a sandbox.
 * (Node's `os.homedir()` honors `HOME`, not `HOME_DIR` — using it directly
 * would cause the verbose echo to inspect a different directory than
 * rulesync wrote to.)
 */
function resolveHomeDir(): string {
    return process.env.HOME_DIR ?? homedir();
}

function countSkillsInDir(skillsDir: string): number {
    if (!existsSync(skillsDir)) return 0;
    let count = 0;
    for (const entry of readdirSync(skillsDir)) {
        if (!statSync(join(skillsDir, entry)).isDirectory()) continue;
        if (existsSync(join(skillsDir, entry, 'SKILL.md'))) count++;
    }
    return count;
}

/**
 * Compare two version strings of the form `MAJOR.MINOR.PATCH[-prerelease]`.
 * Returns negative if `a < b`, zero if equal, positive if `a > b`. Non-numeric core segments
 * coerce to 0 (so a malformed floor like `garbage` reads as `0.0.0` — it won't block a real
 * CLI version, the safe default for a field the plugin author controls). This is a minimal
 * semver-ish compare — not a full semver implementation (no build metadata, no precedence rules
 * for mixed prerelease types), sufficient for the `minCliVersion` floor check where the plugin
 * author sets the floor.
 */
export function compareSemver(a: string, b: string): number {
    const parse = (v: string): { core: number[]; pre: string[] } => {
        const [head, ...rest] = v.split('-');
        const core = (head ?? '').split('.').map((n) => Number.parseInt(n, 10));
        const pre = rest
            .join('-')
            .split('.')
            .filter((s) => s.length > 0);
        return { core: core.map((n) => (Number.isFinite(n) ? n : 0)), pre };
    };
    const pa = parse(a);
    const pb = parse(b);
    for (let i = 0; i < 3; i++) {
        const diff = (pa.core[i] ?? 0) - (pb.core[i] ?? 0);
        if (diff !== 0) return diff;
    }
    // A version with no prerelease is greater than one with a prerelease (1.0.0 > 1.0.0-beta).
    if (pa.pre.length === 0 && pb.pre.length > 0) return 1;
    if (pa.pre.length > 0 && pb.pre.length === 0) return -1;
    for (let i = 0; i < Math.max(pa.pre.length, pb.pre.length); i++) {
        const sa = pa.pre[i] ?? '';
        const sb = pb.pre[i] ?? '';
        if (sa === sb) continue;
        const na = Number.parseInt(sa, 10);
        const nb = Number.parseInt(sb, 10);
        if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
        return sa < sb ? -1 : 1;
    }
    return 0;
}
