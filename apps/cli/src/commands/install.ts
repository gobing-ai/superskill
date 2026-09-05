import {
    copyFileSync,
    existsSync,
    lstatSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    realpathSync,
    rmSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import {
    adaptMagentForTarget,
    adaptSubagentToCodex,
    adaptSubagentToPi,
    assembleMagentContent,
    assertSafePathSegment,
    CLAUDE_PACKAGE_FILES,
    getGitHubToken,
    type InstallManifestV1,
    isClaudeImportStyle,
    listRegularFilesUnder,
    listResolvablePlugins,
    listRuleMarkdownFiles,
    type MapFeature,
    type MarketplaceRegistration,
    type MarketplaceSource,
    magentGlobalDir,
    magentOutputFilename,
    magentRulesRelDir,
    mapPluginToRulesync,
    materializeRepoSubdir,
    parseGitHubRepoUrl,
    resolveMarketplaceRegistration,
    resolvePlugin,
    rewriteSkillReferences,
    runRulesync,
    snapshotFiles,
    stageMagentsFromDir,
    TARGET_GLOBAL_SKILLS_RELDIR,
    TARGET_SKILLS_RELDIR,
    TARGET_TO_RULESYNC_HOOKS,
    TARGETS,
    type Target,
    translateSlashCommands,
    writeInstallManifest,
} from '@gobing-ai/superskill-core';
import { NodeProcessExecutor, type ProcessExecutor } from '@gobing-ai/ts-runtime';
import { echo, echoError } from '@gobing-ai/ts-utils';
import type { Command } from 'commander';
import { loadConfig } from '../config';
import {
    type EmitHooksResult,
    emitHermesHooks,
    emitPiStyleHooks,
    readCanonicalHooks,
    writeHooksForTarget,
} from '../hooks';
import { generateOmpHookModules, type OmpHookResult } from '../omp-hooks';
import { cliVersion } from '../version';

/**
 * Register the `superskill install` subcommand on the given Commander program.
 */
export function registerInstall(program: Command): void {
    program
        .command('install')
        .description(
            "Install a Claude Code plugin's skills, commands, subagents, magents, hooks, and MCP config to target coding agents",
        )
        .argument('<plugin>', 'Plugin name to install')
        .option(
            '--marketplace <locator>',
            'Marketplace locator: a path to marketplace.json or its containing directory, a GitHub repo URL, or owner/repo shorthand. ' +
                'Local-first: an existing path is local; only a non-existent owner/repo is GitHub shorthand; https:// and git@ are always remote.',
        )
        .option('--targets <list>', 'Comma-separated target agents (default: all configured)')
        .option('--no-global', 'Install to project-level instead of user-level global directories')
        .option(
            '--magent <name>',
            'Select a specific magent (main-agent config) to install; auto-selects when exactly one exists',
        )
        .option(
            '--marketplace-source <mode>',
            'DEPRECATED: Marketplace registration source (directory or github); removal planned. Prefer --marketplace with a GitHub URL or owner/repo.',
        )
        .option('--dry-run', 'Preview without writing files', false)
        .option('--verbose', 'Print each step and file copy', false)
        .option(
            '--prune',
            'Remove leftover dest skill dirs matching <plugin>-* on flattened skills dests (shared root safe)',
            false,
        )
        .action(async (plugin, options) => {
            try {
                const config = loadConfig();
                const targets =
                    options.targets !== undefined
                        ? parseTargets(options.targets)
                        : config.targets.length > 0
                          ? [...config.targets]
                          : parseTargets(undefined);
                const global = options.global !== false;
                const dryRun = options.dryRun === true;
                const verbose = options.verbose === true;
                const prune = options.prune === true;
                const marketplaceSource = options.marketplaceSource as MarketplaceSource | undefined;
                const configuredPlugin = config.plugins.find((entry) => entry.name === plugin);
                await executeInstall(plugin, targets, {
                    marketplacePath: options.marketplace,
                    pluginPath:
                        options.marketplace === undefined && configuredPlugin
                            ? resolve(configuredPlugin.path)
                            : undefined,
                    features: config.features,
                    global,
                    dryRun,
                    verbose,
                    prune,
                    magent: options.magent as string | undefined,
                    marketplaceSource,
                });
            } catch (err) {
                echo(`Error: ${err instanceof Error ? err.message : String(err)}`);
                process.exit(1);
            }
        });
}

/** Resolved execution options for one plugin installation. */
export interface InstallOptions {
    marketplacePath?: string;
    /** Direct plugin root from `superskill.jsonc`; explicit `--marketplace` takes precedence. */
    pluginPath?: string;
    /** Configured artifact classes; omitted means all. */
    features?: readonly MapFeature[];
    global: boolean;
    dryRun: boolean;
    verbose: boolean;
    outputRoot?: string;
    /** Select a specific magent by directory name; undefined auto-selects when exactly one magent exists. */
    magent?: string;
    /** Marketplace registration source: directory (local path, default) or github (owner/repo slug). */
    marketplaceSource?: MarketplaceSource;
    /** Remove or replace only dest skill dirs matching `<plugin>-*` on flattened skills dests (R4/R5). */
    prune?: boolean;
}

interface InstallDependencies {
    runRulesync?: typeof runRulesync;
    /** Spawn `claude plugin marketplace add` + `claude plugin install`. Mockable for tests. */
    runClaudeInstall?: (
        registration: MarketplaceRegistration,
        marketplaceName: string,
        plugin: string,
        global: boolean,
    ) => Promise<void>;
    /** Spawn `omp plugin marketplace add` + `omp plugin install`. Mockable for tests. */
    runOmpInstall?: (
        registration: MarketplaceRegistration,
        marketplaceName: string,
        plugin: string,
        global: boolean,
    ) => Promise<void>;
    /**
     * Spawn `grok plugin marketplace add` + `grok plugin install <pluginRoot> --trust`.
     * Grok 0.2.93 installs from git URL / GitHub shorthand / local path — not
     * `plugin@marketplace`. Mockable for tests.
     */
    runGrokInstall?: (
        registration: MarketplaceRegistration,
        marketplaceName: string,
        plugin: string,
        pluginRoot: string,
    ) => Promise<void>;
    /** Process execution port behind the default native installers; tests inject a recording fake. */
    processExecutor?: ProcessExecutor;
    /**
     * Provenance writer. Production uses the core atomic writer; tests inject a
     * recording/throwing fake so manifest-write failure is observable without FS races.
     */
    writeInstallManifest?: typeof writeInstallManifest;
    /** Frozen ISO-8601 UTC timestamp for the manifest `installedAt` field. */
    nowIso?: string;
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
    /** How the plugin was resolved — bundled package vs marketplace/local locator. */
    channel: 'bundled' | 'marketplace';
    /** Marketplace entry version, else plugin.json version, else `cliVersion` for bundled. */
    upstreamVersion: string;
    /** Re-resolvable locator: explicit `--marketplace` verbatim, else an absolute local root. */
    marketplaceLocator?: string;
}

/** Remote marketplace cache root plus optional Git tree SHA from cold-cache materialization. */
export interface RemoteMarketplaceResolution {
    root: string;
    resolvedRef?: string;
}

/** Per-target install inventory used to write one provenance manifest. */
interface TargetInstallReceipt {
    target: Target;
    scopeRoot: string;
    files: string[];
}

// ── Remote marketplace locators (R2/R3/R4/T3) ───────────────────────────────

/** Parsed GitHub marketplace locator from `--marketplace`. */
export interface RemoteMarketplaceLocator {
    owner: string;
    repo: string;
    ref: string;
    /** Optional `/tree/<ref>/<subpath>` subdir inside the repo; '' = whole repo. */
    subdir?: string;
}

/** Parse a GitHub URL (`https://github.com/owner/repo[/tree/<ref>[/subpath]]`) or `owner/repo` shorthand. */
export function parseRemoteMarketplaceLocator(locator: string): RemoteMarketplaceLocator | null {
    const treeMatch = locator.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/tree\/([^/]+)(?:\/(.*))?$/);
    if (treeMatch?.[1] && treeMatch[2] && treeMatch[3]) {
        return { owner: treeMatch[1], repo: treeMatch[2], ref: treeMatch[3], subdir: treeMatch[4] };
    }
    const gh = parseGitHubRepoUrl(locator);
    if (gh) return { owner: gh.owner, repo: gh.repo, ref: 'HEAD' };
    // owner/repo shorthand
    const shorthand = locator.match(/^([\w.-]+)\/([\w.-]+)$/);
    if (shorthand?.[1] && shorthand[2]) {
        return { owner: shorthand[1], repo: shorthand[2], ref: 'HEAD' };
    }
    return null;
}

/**
 * Local-first disambiguation (R2): an existing local path is local; only a
 * non-existent `<X>` matching `^[\w.-]+/[\w.-]+$` is GitHub shorthand; any
 * `https://`/`git@` form is always remote.
 */
export function isRemoteMarketplaceLocator(locator: string): boolean {
    if (locator.startsWith('https://') || locator.startsWith('git@')) return true;
    if (existsSync(locator)) return false;
    return /^[\w.-]+\/[\w.-]+$/.test(locator);
}

/** Base dir for materialized remote marketplaces: `~/.cache/superskill/marketplaces`. */
export function marketplaceCacheRoot(): string {
    return join(resolveHomeDir(), '.cache', 'superskill', 'marketplaces');
}

/**
 * Resolve a remote marketplace locator to a local cache root, materializing
 * plugin content on a cold cache (R4/R9). Warm cache resolves offline with no
 * network call; a failed cold-cache fetch throws an actionable error naming
 * the fetch target and the cache path. Every locator-derived path segment is
 * asserted before the first mkdir (AC6).
 */
export async function resolveRemoteMarketplace(
    locator: string,
    deps: { fetchFn?: typeof fetch } = {},
): Promise<RemoteMarketplaceResolution> {
    const parsed = parseRemoteMarketplaceLocator(locator);
    if (!parsed) {
        throw new Error(
            `Unrecognized --marketplace locator '${locator}'. Expected a local path, GitHub URL, or 'owner/repo'.`,
        );
    }
    for (const seg of [parsed.owner, parsed.repo, parsed.ref]) {
        assertSafePathSegment(seg, 'marketplace locator');
    }
    const cacheRoot = join(marketplaceCacheRoot(), parsed.owner, parsed.repo, parsed.ref);

    // Warm cache: resolve offline, zero network calls (R9).
    if (
        existsSync(join(cacheRoot, 'marketplace.json')) ||
        existsSync(join(cacheRoot, '.claude-plugin', 'marketplace.json'))
    ) {
        return { root: cacheRoot };
    }

    const token = await getGitHubToken();
    try {
        const tree = await materializeRepoSubdir(`${parsed.owner}/${parsed.repo}`, parsed.subdir ?? '', cacheRoot, {
            ref: parsed.ref === 'HEAD' ? undefined : parsed.ref,
            getToken: () => token,
            fetchFn: deps.fetchFn,
        });
        return { root: cacheRoot, resolvedRef: tree.sha };
    } catch (err) {
        throw new Error(
            `Failed to resolve marketplace '${locator}' from ${parsed.owner}/${parsed.repo}` +
                `${parsed.ref !== 'HEAD' ? `@${parsed.ref}` : ''}` +
                ` into cache ${cacheRoot}: ${err instanceof Error ? err.message : String(err)}`,
        );
    }
}

/** Execute the full install flow: resolve → map → pipeline → rulesync → dispatch. */
export async function executeInstall(
    plugin: string,
    targets: Target[],
    options: InstallOptions,
    dependencies: InstallDependencies = {},
): Promise<void> {
    const runRulesyncImpl = dependencies.runRulesync ?? runRulesync;
    const executor = dependencies.processExecutor ?? defaultProcessExecutor;
    const runClaudeInstallImpl =
        dependencies.runClaudeInstall ?? ((r, m, p, g) => defaultRunClaudeInstall(r, m, p, g, executor));
    const runOmpInstallImpl =
        dependencies.runOmpInstall ?? ((r, m, p, g) => defaultRunOmpInstall(r, m, p, g, executor));
    const runGrokInstallImpl =
        dependencies.runGrokInstall ?? ((r, m, p, root) => defaultRunGrokInstall(r, m, p, root, executor));
    const configuredFeatures = new Set<MapFeature>(
        options.features ?? ['skills', 'commands', 'subagents', 'hooks', 'mcp'],
    );
    const hasAllFeatures = (['skills', 'commands', 'subagents', 'hooks', 'mcp'] as const).every((feature) =>
        configuredFeatures.has(feature),
    );
    // --marketplace-source is deprecated (T6/R7): one-line stderr warning,
    // behavior unchanged. Removal is planned for a future release.
    if (options.marketplaceSource !== undefined) {
        echoError(
            `Warning: --marketplace-source is deprecated and will be removed in a future release. ` +
                `Use --marketplace with a GitHub URL or 'owner/repo' instead.`,
        );
    }

    const incompatibleNativeTargets = targets.filter(
        (target) => target === 'claude' || target === 'omp' || target === 'grok',
    );
    if (!hasAllFeatures && incompatibleNativeTargets.length > 0) {
        throw new Error(
            `Feature filtering is not supported by native plugin targets: ${incompatibleNativeTargets.join(', ')}. ` +
                'Use all features or select rulesync/hermes/pi targets.',
        );
    }

    if (options.verbose) echo(`Resolving plugin '${plugin}'...`);

    // Step 1: Resolve plugin root (+ marketplace metadata for Claude target).
    // A remote `--marketplace` locator (GitHub URL / owner/repo shorthand) is
    // materialized into a local cache root first (R2/R4); the cache root then
    // feeds the unchanged local resolve flow.
    const originalMarketplaceLocator = options.marketplacePath;
    let marketplacePath = options.marketplacePath;
    let resolvedRef: string | undefined;
    if (marketplacePath && isRemoteMarketplaceLocator(marketplacePath)) {
        if (options.verbose) echo(`Resolving remote marketplace '${marketplacePath}'...`);
        const remote = await resolveRemoteMarketplace(marketplacePath);
        marketplacePath = remote.root;
        resolvedRef = remote.resolvedRef;
    }
    const resolution = resolvePluginRoot(plugin, marketplacePath, options.pluginPath);
    if (originalMarketplaceLocator) {
        resolution.marketplaceLocator = originalMarketplaceLocator;
    }
    const pluginRoot = resolution.pluginRoot;
    const outputRoot = options.outputRoot ?? (options.global ? resolveHomeDir() : process.cwd());
    const receipts = new Map<Target, TargetInstallReceipt>();
    const addReceiptFiles = (target: Target, files: readonly string[]): void => {
        let receipt = receipts.get(target);
        if (!receipt) {
            receipt = { target, scopeRoot: outputRoot, files: [] };
            receipts.set(target, receipt);
        }
        receipt.files.push(...files);
    };

    if (options.verbose) echo(`Plugin root: ${pluginRoot}`);

    // Step 2: Map plugin → invocation-local .rulesync/ canonical (F2, task 0127 R2).
    // `.rulesync/` is an internal canonical intermediate representation, not a working-directory
    // artifact or output contract. Every invocation owns a unique mkdtemp parent holding its own
    // `.rulesync/`, so concurrent installs in the same cwd can never delete, read, transform, or
    // emit from each other's staging. It is removed in `finally` after success AND after a thrown
    // dependency/dispatch error; target outputs and receipts are unchanged.
    const stageParent = mkdtempSync(join(tmpdir(), 'superskill-install-'));
    try {
        const outputDir = join(stageParent, '.rulesync');
        if (options.verbose) echo('Mapping plugin to .rulesync/ canonical layout...');
        const mapResult = mapPluginToRulesync(pluginRoot, plugin, outputDir, { features: options.features });
        const mappedSkillNames = readMappedSkillNames(outputDir, plugin);
        if (options.verbose) {
            echo(
                `  Skills: ${mapResult.skills}, Commands: ${mapResult.commands}, Subagents: ${mapResult.subagents}, Magents: ${mapResult.magents}, Hooks: ${mapResult.hooks}, MCP: ${mapResult.mcp}, Scripts: ${mapResult.scripts}`,
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

        // Step 4: Run rulesync for supported targets. omp and grok install natively
        // (marketplace add + plugin install — see dispatch loop); hermes reuses
        // opencode's rulesync output (see ADR-010).
        // Only request features the mapper actually produced — requesting 'mcp' when
        const rulesyncFeatures: Array<'skills' | 'mcp'> = [];
        if (mapResult.skills + mapResult.commands + mapResult.subagents > 0) rulesyncFeatures.push('skills');
        if (mapResult.mcp) rulesyncFeatures.push('mcp');
        const rulesyncTargets = targets.filter((t) => t !== 'claude' && t !== 'hermes' && t !== 'omp' && t !== 'grok');
        if (targets.includes('hermes') && !targets.includes('opencode')) {
            if (!targetInputRoots.has('opencode')) {
                targetInputRoots.set('opencode', prepareTargetRulesyncInput(outputDir, 'opencode', plugin));
            }
            rulesyncTargets.push('opencode');
        }
        const resultCounts: InstallResultCounts = {
            skillsCount: 0,
            commandsCount: 0,
            subagentsCount: 0,
            hooksCount: 0,
        };

        // R4/R5 (task 0114): plugin-scoped --prune on flattened skills dests — runs BEFORE
        // rulesync writes so it is true clean-before-write. Removes orphaned `<plugin>-*`
        // dest skill dirs and replaces remaining ones so intra-dir leftovers disappear.
        // Native dests (claude/omp/grok) own their own trees (pruned by host plugin CLIs).
        // Shared skills roots stay multi-plugin: only dirs matching `^<plugin>-` are touched.
        if (options.prune) {
            const outputRootPre = options.outputRoot ?? (options.global ? resolveHomeDir() : process.cwd());
            prunePluginDestSkills(outputDir, plugin, targets, outputRootPre, options);
        }

        // R6 dual-path hygiene: Grok loads both native plugins (/plugin:cmd) and
        // ~/.agents skills (/plugin-cmd). Warn when both land in the same install.
        const dualPathRulesyncTargets = targets.filter(
            (t) =>
                t === 'codex' || t === 'pi' || t === 'opencode' || t === 'antigravity-cli' || t === 'antigravity-ide',
        );
        if (options.verbose && targets.includes('grok') && dualPathRulesyncTargets.length > 0) {
            echo(
                'Warning: installing both grok (native plugin slash /plugin:cmd) and rulesync targets ' +
                    'that adapt commands into ~/.agents/skills (slash /plugin-cmd). Grok scans both; prefer ' +
                    'colon form for plugin commands.',
            );
        }

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
            if (rulesyncFeatures.length > 0) {
                for (const target of rulesyncTargets) {
                    const result = await runRulesyncImpl(
                        [target],
                        rulesyncFeatures,
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
                    addReceiptFiles(
                        target,
                        expandInstallPaths(outputRoot, [
                            ...result.skillsPaths,
                            ...result.commandsPaths,
                            ...result.subagentsPaths,
                            ...result.hooksPaths,
                            ...result.mcpPaths,
                            ...result.rulesPaths,
                        ]),
                    );
                    // Per-target summary surfaces the targets that were previously silent on success.
                    // Count actual installed skills outside dry-run; rulesync's diff count can be zero on reinstall.
                    if (options.verbose) {
                        const reldir = options.global
                            ? (TARGET_GLOBAL_SKILLS_RELDIR[target] ?? TARGET_SKILLS_RELDIR[target])
                            : TARGET_SKILLS_RELDIR[target];
                        if (reldir) {
                            const skillsDir = options.global
                                ? join(resolveHomeDir(), reldir)
                                : join(process.cwd(), reldir);
                            const total = options.dryRun ? result.skillsCount : countSkillsInDir(skillsDir);
                            echo(`  ${target}: ${total} skill(s) at ${skillsDir}`);
                        }
                    }
                }
            }
            // Hooks-only pass: route through TARGET_TO_RULESYNC_HOOKS so Antigravity gets native hook
            // output. Only runs when the plugin actually produced a canonical hooks.json (mapResult.hooks).
            if (mapResult.hooks && !hooksBlockedByCliVersion) {
                for (const target of rulesyncTargets) {
                    if (!TARGET_TO_RULESYNC_HOOKS[target]) continue; // pi handled via surrogate shim below
                    // Per-target gate: drop hooks this target can't enforce (e.g. the cc/anti-hallucination
                    // Stop hook on opencode) and append `--profile <p>` for non-default profiles
                    // (antigravity-cli/ide → deny). Hooks with no target policy pass through unchanged.
                    writeHooksForTarget(rulesyncSourceRoot(targetInputRoots.get(target), outputDir), target);
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
                    addReceiptFiles(target, expandInstallPaths(outputRoot, hookResult.hooksPaths));
                }
            }
            if (options.verbose) {
                echo(
                    `  Skills written: ${resultCounts.skillsCount}, Commands: ${resultCounts.commandsCount}, Subagents: ${resultCounts.subagentsCount}, Hooks: ${resultCounts.hooksCount}`,
                );
            }
        }
        // Step 4: Dispatch non-rulesync targets + emit hooks for uncovered targets
        const marketplaceName = resolution.marketplaceName ?? 'superskill';
        const marketplaceRoot = resolution.marketplaceRoot ?? process.cwd();
        const registration = resolveMarketplaceRegistration(
            marketplaceRoot,
            marketplaceName,
            options.marketplaceSource ?? 'directory',
        );
        const hookEmitResults: EmitHooksResult[] = [];
        for (const target of targets) {
            if (target === 'claude') {
                if (options.verbose) echo('Claude Code: registering marketplace and installing plugin...');
                if (!options.dryRun) {
                    // Clear the plugin cache keyed on the resolved marketplace name (Refinement #5).
                    // marketplace add is idempotent, so this is defensive — but bound it to the
                    // correct name so we never rm -rf the wrong directory.
                    const cacheDir = join(resolveHomeDir(), '.claude', 'plugins', 'cache', marketplaceName);
                    if (existsSync(cacheDir)) rmSync(cacheDir, { recursive: true, force: true });
                    await runClaudeInstallImpl(registration, marketplaceName, plugin, options.global);
                    for (const root of new Set([resolveHomeDir(), outputRoot])) {
                        const claudeCache = join(root, '.claude', 'plugins', 'cache', marketplaceName, plugin);
                        if (existsSync(claudeCache)) addReceiptFiles(target, listRegularFilesUnder(claudeCache));
                    }
                    const claudeScoped = join(outputRoot, '.claude', 'plugins');
                    if (existsSync(claudeScoped)) addReceiptFiles(target, pluginPrefixedEntries(claudeScoped, plugin));
                }
            }

            if (target === 'hermes') {
                const srcTarget = 'opencode';
                const dest = join(outputRoot, '.hermes', 'skills');
                if (options.verbose) echo(`Copying to Hermes (via opencode rulesync): ${dest}...`);
                if (!options.dryRun) {
                    const copied = copyDirectory(
                        join(rulesyncSourceRoot(targetInputRoots.get(srcTarget), outputDir), 'skills'),
                        dest,
                    );
                    addReceiptFiles(
                        target,
                        copied.filter((file) => isPluginOwnedPath(file, plugin)),
                    );
                }
                // Rung (c): copy-step — hermes hooks via canonical hooks.json copy (design §1.2, §2.1).
                // Skipped when the CLI is below the plugin's minCliVersion (hooks would fail-open at runtime).
                if (!hooksBlockedByCliVersion) {
                    const hookResult = emitHermesHooks(
                        rulesyncSourceRoot(targetInputRoots.get(srcTarget), outputDir),
                        outputRoot,
                        { dryRun: options.dryRun, global: options.global },
                        plugin,
                    );
                    hookEmitResults.push(hookResult);
                    if (hookResult.path) addReceiptFiles(target, expandInstallPaths(outputRoot, [hookResult.path]));
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
                    await runOmpInstallImpl(registration, marketplaceName, plugin, options.global);
                    const installPath = resolveOmpInstallPath(marketplaceName, plugin, options.global);
                    if (installPath) {
                        const hookResult = postInstallOmp(pluginRoot, installPath, outputDir, plugin, {
                            ...options,
                            skipHooks: hooksBlockedByCliVersion,
                        });
                        addReceiptFiles(target, listRegularFilesUnder(installPath));
                        addReceiptFiles(target, hookResult.files);
                        if (options.verbose) echo(`  ${hookResult.message}`);
                    } else if (options.verbose) {
                        echo('  OMP install path not found in registry — skipping post-processing');
                    }
                }
            }

            if (target === 'grok') {
                // Grok native install (task 0078): Claude-format plugin package via
                // `grok plugin marketplace add` + `grok plugin install <path> --trust`.
                // No command→skill adapt, no slash-dialect rewrite, no OMP hook JS —
                // Grok consumes hooks/hooks.json and /plugin:command natively.
                if (options.verbose) echo('Grok: registering marketplace and installing plugin...');
                if (!options.dryRun) {
                    await runGrokInstallImpl(registration, marketplaceName, plugin, pluginRoot);
                    const grokInstallPath = await resolveGrokInstallPath(plugin, executor);
                    if (grokInstallPath) addReceiptFiles(target, listRegularFilesUnder(grokInstallPath));
                    if (options.verbose) {
                        if (grokInstallPath) {
                            echo(`  Grok install path: ${grokInstallPath}`);
                        } else {
                            echo('  Grok install path not found via plugin list — install may still have succeeded');
                        }
                    }
                }
            }

            // Pi reaches generate() but rulesync emits no hooks for it (hooks column blank, §1 table).
            // Rung (b): pi extensions from plugin.json or @vahor/pi-hooks format (design §1.2)
            if (target === 'pi') {
                // Try reading platform extensions from plugin.json first
                // Format: { "extensions": { "pi": ["./hooks/pi/guard-extension.ts"], ... } }
                const pluginManifestPath = join(pluginRoot, 'plugin.json');
                let piExtensions: string[] | undefined;
                if (existsSync(pluginManifestPath)) {
                    try {
                        const manifest = JSON.parse(readFileSync(pluginManifestPath, 'utf-8')) as Record<
                            string,
                            unknown
                        >;
                        const platformExtensions = manifest.extensions as Record<string, unknown> | undefined;
                        if (platformExtensions?.pi && Array.isArray(platformExtensions.pi)) {
                            piExtensions = platformExtensions.pi as string[];
                        }
                    } catch {
                        // Unparseable plugin.json — ignore, fall through to emitPiStyleHooks
                    }
                }

                if (piExtensions && piExtensions.length > 0) {
                    // Install Pi extensions natively — no @vahor/pi-hooks dependency
                    const piPluginsDir = join(outputRoot, '.pi', 'agent', 'plugins', plugin);
                    if (!options.dryRun) {
                        mkdirSync(piPluginsDir, { recursive: true });
                        // Bundle each extension into a single self-contained file.
                        // Pi loads extensions as single files; a raw copy drops sibling
                        // modules referenced via relative imports (e.g. ../agent-hint)
                        // and the import dangles at runtime. Bundling inlines relative
                        // imports while keeping the Pi host SDK and node builtins external.
                        // Output keeps the declared basename (naming: '[name].ts') so the
                        // generated package.json ref stays valid and Bun loads it as ESM
                        // (.ts is always ESM under Bun, regardless of package.json "type").
                        for (const ext of piExtensions) {
                            const source = join(pluginRoot, ext);
                            if (!existsSync(source)) continue;
                            const result = await Bun.build({
                                entrypoints: [source],
                                target: 'bun',
                                format: 'esm',
                                outdir: piPluginsDir,
                                naming: '[name].ts',
                                external: ['@earendil-works/pi-coding-agent'],
                            });
                            if (!result.success) {
                                const logs = result.logs.map(String).join('\n');
                                throw new Error(`Failed to bundle Pi extension ${ext}${logs ? `:\n${logs}` : ''}`);
                            }
                        }
                        // Create package.json for Pi to load the extension
                        const pkgJson = {
                            name: plugin,
                            version: '0.1.0',
                            private: true,
                            pi: { extensions: piExtensions.map((e) => `./${basename(e)}`) },
                        };
                        writeFileSync(join(piPluginsDir, 'package.json'), `${JSON.stringify(pkgJson, null, 2)}\n`);
                        addReceiptFiles(target, listRegularFilesUnder(piPluginsDir));
                        // Register in Pi's settings.json packages
                        const piSettingsPath = join(outputRoot, '.pi', 'agent', 'settings.json');
                        try {
                            const existing = existsSync(piSettingsPath)
                                ? (JSON.parse(readFileSync(piSettingsPath, 'utf-8')) as Record<string, unknown>)
                                : {};
                            const packages = (existing.packages as string[]) ?? [];
                            const piAgentDir = join(outputRoot, '.pi', 'agent');
                            const packageRef = relative(piAgentDir, piPluginsDir);
                            if (!packages.includes(packageRef)) {
                                packages.push(packageRef);
                                existing.packages = packages;
                                writeFileSync(piSettingsPath, `${JSON.stringify(existing, null, 2)}\n`);
                            }
                        } catch {
                            // settings.json read/write failure — non-fatal
                        }
                        if (options.verbose) echo(`  Pi extensions: installed to ${piPluginsDir}`);
                    }
                } else if (!hooksBlockedByCliVersion) {
                    // Fallback: emit hooks for @vahor/pi-hooks format
                    const hookResult = emitPiStyleHooks(
                        rulesyncSourceRoot(targetInputRoots.get('pi'), outputDir),
                        outputRoot,
                        '.pi',
                        'pi',
                        { dryRun: options.dryRun, global: options.global },
                        plugin,
                    );
                    hookEmitResults.push(hookResult);
                    if (hookResult.path) addReceiptFiles(target, expandInstallPaths(outputRoot, [hookResult.path]));
                    if (options.verbose) echo(`  ${hookResult.message}`);
                } else if (options.verbose) {
                    echo('  Pi hooks: skipped (CLI below plugin minCliVersion)');
                }

                // Pi native agent dispatch: adapt each subagent to Pi format → ~/.pi/agent/agents/
                const agentsDir = join(pluginRoot, 'agents');
                if (configuredFeatures.has('subagents') && existsSync(agentsDir) && !options.dryRun) {
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
                        addReceiptFiles(target, [join(piAgentsDir, `${expectedName}.md`)]);
                    }
                    if (options.verbose) echo(`  Pi agents: dispatched to ${piAgentsDir}`);
                }
            }

            // Codex native agent dispatch: adapt each subagent to Codex TOML -> ~/.codex/agents/
            // Mirrors the Pi dual-emit (task 0111). Discovery of the ~/.codex/agents dir
            // convention is verified on codex-cli 0.147.0 (task 0112 - scratch-home probe).
            if (target === 'codex') {
                const agentsDir = join(pluginRoot, 'agents');
                if (configuredFeatures.has('subagents') && existsSync(agentsDir) && !options.dryRun) {
                    const codexAgentsDir = join(outputRoot, '.codex', 'agents');
                    mkdirSync(codexAgentsDir, { recursive: true });
                    for (const entry of readdirSync(agentsDir)) {
                        if (!entry.endsWith('.md')) continue;
                        const agentName = entry.replace(/\.md$/, '');
                        const expectedName = `${plugin}-${agentName}`;
                        const source = readFileSync(join(agentsDir, entry), 'utf-8');
                        const adapted = adaptSubagentToCodex(source, expectedName, plugin);
                        writeFileSync(join(codexAgentsDir, `${expectedName}.toml`), adapted);
                        addReceiptFiles(target, [join(codexAgentsDir, `${expectedName}.toml`)]);
                    }
                    if (options.verbose) echo(`  Codex agents: dispatched to ${codexAgentsDir}`);
                }
            }
        }

        // Step 5: Magents (main-agent configs).
        // Mutable authoring SSOT: marketplace-root `magents/` (sibling to plugins/),
        // not process.cwd() alone — cwd may be a test harness or unrelated project.
        // Plugin-shipped magents were already staged by mapPluginToRulesync.
        if (resolution.marketplaceRoot) {
            const projectMagents = join(resolution.marketplaceRoot, 'magents');
            const n = stageMagentsFromDir(projectMagents, plugin, outputDir, { nameMode: 'bare' });
            if (n > 0 && options.verbose) {
                echo(`  Project magents staged: ${n} from ${projectMagents}`);
            }
        }
        // Magents optional: plugins without magents/ (and no --magent) no-op cleanly.
        const magentFiles = emitMagents(plugin, targets, outputDir, outputRoot, options);
        for (const [target, files] of magentFiles) {
            addReceiptFiles(target, files);
        }
        // Plugin-level rules optional: plugins without rules/ no-op cleanly.
        const ruleFilesWritten = emitPluginRules(pluginRoot, targets, outputRoot, options);
        for (const [target, files] of ruleFilesWritten) {
            addReceiptFiles(target, files);
        }
        // Plugin-level scripts → shared agents scripts root for rulesync + hermes only.
        // Native class (claude/omp/grok) already receives scripts/ via host plugin install (R3-B / R6);
        // do not invent ~/.agents/scripts as a required second tree for native-only installs (AC5).
        const needsSharedScriptsRoot = targets.some((t) => t !== 'claude' && t !== 'omp' && t !== 'grok');
        if (needsSharedScriptsRoot) {
            const scriptCount = stagePluginScripts(outputDir, plugin, outputRoot, options, mapResult.scripts);
            if (scriptCount > 0 && !options.dryRun) {
                const scriptDest = join(outputRoot, '.agents', 'scripts', plugin);
                const scriptFiles = listRegularFilesUnder(scriptDest);
                for (const target of targets) {
                    if (target !== 'claude' && target !== 'omp' && target !== 'grok') {
                        addReceiptFiles(target, scriptFiles);
                    }
                }
            }
        } else if (options.verbose && mapResult.scripts > 0) {
            echo('  Plugin scripts: native targets include scripts/ via host plugin install (no shared-root stage)');
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
            // F2 (task 0127 R2): dry-run suppresses target writes. The isolated staging tree is an
            // internal intermediate that is always cleaned up — it is never left refreshed on disk.
            echo('[DRY-RUN] No files were written to install targets.');
        } else {
            writeInstallProvenance({
                plugin,
                targets,
                outputRoot,
                pluginRoot,
                resolution,
                resolvedRef,
                receipts,
                addReceiptFiles,
                mappedSkillNames,
                useGlobalSkillsLayout: options.global && options.outputRoot === undefined,
                writer: dependencies.writeInstallManifest ?? writeInstallManifest,
                nowIso: dependencies.nowIso ?? new Date().toISOString(),
            });
            echo(`Installed '${plugin}' to ${targets.length} target(s).`);
        }
    } finally {
        rmSync(stageParent, { recursive: true, force: true });
    }
}

/**
 * Default process execution port for native install steps (no-direct-process-spawn:
 * all spawning routes through ts-runtime). The stream policy preserves the old
 * `stdout/stderr: 'inherit'` behavior for checked steps; capture sites pass
 * `forceBuffered: true` per call.
 */
const defaultProcessExecutor: ProcessExecutor = new NodeProcessExecutor({ output: { mode: 'stream', isTTY: true } });

/**
 * Spawn a CLI step and fail loudly on a non-zero exit. A swallowed failure here
 * would let `executeInstall` report "Installed" for a target that never installed.
 */
export async function runCheckedCommand(
    argv: [string, ...string[]],
    label: string,
    executor: ProcessExecutor = defaultProcessExecutor,
): Promise<void> {
    const result = await executor.run({ command: argv[0], args: argv.slice(1), label });
    if (result.exitCode !== 0) {
        const why =
            result.exitCode === null
                ? `no exit code (${result.signal ?? 'spawn failure'})`
                : `exit code ${result.exitCode}`;
        throw new Error(`${label} failed with ${why}: ${argv.join(' ')}`);
    }
}

/**
 * Default Claude Code installer — registers the marketplace then installs
 * the plugin. Uses `registration.source` so `--marketplace-source github`
 * spawns `claude plugin marketplace add gobing-ai/superskill` instead of
 * a local absolute path. Exposed as a dependency so tests can mock spawns.
 */
async function defaultRunClaudeInstall(
    registration: MarketplaceRegistration,
    marketplaceName: string,
    plugin: string,
    global: boolean,
    executor: ProcessExecutor = defaultProcessExecutor,
): Promise<void> {
    // Same defense as grok/omp install helpers: marketplace + plugin key the
    // `plugin@marketplace` address and must be single path segments.
    assertSafePathSegment(marketplaceName, 'marketplace name');
    assertSafePathSegment(plugin, 'plugin name');

    // marketplace add is idempotent — if already registered, claude CLI exits 0
    // with a notice. source is either an absolute path (directory mode) or an
    // `owner/repo` slug (github mode).
    await runCheckedCommand(
        ['claude', 'plugin', 'marketplace', 'add', registration.source],
        'claude plugin marketplace add',
        executor,
    );

    // Install the plugin from the registered marketplace.
    await runCheckedCommand(
        ['claude', 'plugin', 'install', `${plugin}@${marketplaceName}`, '--scope', global ? 'user' : 'project'],
        'claude plugin install',
        executor,
    );
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

// ── Grok native install helpers (task 0078) ─────────────────────────────────

/** Minimal entry from `grok plugin list --json` (verified Grok 0.2.93). */
export interface GrokPluginListEntry {
    status?: string;
    name: string;
    repo_key?: string;
    version?: string;
    /** Absolute path under `~/.grok/installed-plugins/`. */
    path: string;
    source?: string;
    marketplace?: string | null;
}

/**
 * Parse `grok plugin list --json` output into install entries. Returns an empty
 * array when the payload is not a JSON array (malformed / empty).
 */
export function parseGrokPluginListJson(json: string): GrokPluginListEntry[] {
    let parsed: unknown;
    try {
        parsed = JSON.parse(json) as unknown;
    } catch {
        return [];
    }
    if (!Array.isArray(parsed)) return [];
    const out: GrokPluginListEntry[] = [];
    for (const item of parsed) {
        if (!item || typeof item !== 'object') continue;
        const rec = item as Record<string, unknown>;
        if (typeof rec.name !== 'string' || typeof rec.path !== 'string') continue;
        out.push({
            status: typeof rec.status === 'string' ? rec.status : undefined,
            name: rec.name,
            repo_key: typeof rec.repo_key === 'string' ? rec.repo_key : undefined,
            version: typeof rec.version === 'string' ? rec.version : undefined,
            path: rec.path,
            source: typeof rec.source === 'string' ? rec.source : undefined,
            marketplace: rec.marketplace === null || typeof rec.marketplace === 'string' ? rec.marketplace : undefined,
        });
    }
    return out;
}

/**
 * Resolve an installed Grok plugin path from already-parsed list entries.
 * Prefers `status === 'installed'` when multiple rows share a name.
 */
export function resolveGrokInstallPathFromList(
    entries: readonly GrokPluginListEntry[],
    plugin: string,
): string | undefined {
    const matches = entries.filter((e) => e.name === plugin);
    if (matches.length === 0) return undefined;
    const installed = matches.find((e) => e.status === 'installed');
    return (installed ?? matches[0])?.path;
}

/**
 * Resolve the install path Grok is using for `plugin` via `grok plugin list --json`.
 * Falls back to `undefined` when the binary is missing, the list is empty, or the
 * name is absent — callers must not treat Claude-compat paths as success criteria.
 */
export async function resolveGrokInstallPath(
    plugin: string,
    executor: ProcessExecutor = defaultProcessExecutor,
): Promise<string | undefined> {
    try {
        const result = await executor.run({ command: 'grok', args: ['plugin', 'list', '--json'], forceBuffered: true });
        if (result.exitCode !== 0) return undefined;
        return resolveGrokInstallPathFromList(parseGrokPluginListJson(result.stdout), plugin);
    } catch {
        return undefined;
    }
}

/**
 * Default Grok installer (Grok Build ≥ 0.2.93).
 *
 * Live CLI contract (verified 2026-07-12):
 * - `grok plugin marketplace add <path|url>` — exit 1 with "already configured" on re-add
 * - `grok plugin install <source> --trust` — source is git URL / GitHub shorthand / **local path**
 *   (NOT `plugin@marketplace`); exit 1 with "already installed" on re-install
 * - Idempotency: tolerate marketplace re-add; best-effort `uninstall --confirm` then install
 *
 * No slash-dialect translation and no post-install hook rewrite — Grok loads Claude-format
 * plugins natively. `pluginRoot` is the install source (path), not a rulesync staging dir.
 */
export async function defaultRunGrokInstall(
    registration: MarketplaceRegistration,
    marketplaceName: string,
    plugin: string,
    pluginRoot: string,
    executor: ProcessExecutor = defaultProcessExecutor,
): Promise<void> {
    assertSafePathSegment(marketplaceName, 'marketplace name');
    assertSafePathSegment(plugin, 'plugin name');

    const add = await executor.run({
        command: 'grok',
        args: ['plugin', 'marketplace', 'add', registration.source],
        forceBuffered: true,
    });
    if (add.exitCode !== 0) {
        const combined = `${add.stdout}\n${add.stderr}`;
        if (!/already configured/i.test(combined)) {
            throw new Error(
                `grok plugin marketplace add failed with exit code ${add.exitCode}: grok plugin marketplace add ${registration.source}\n${combined.trim()}`,
            );
        }
    }

    // Re-install is non-idempotent without remove: "repo '…' already installed".
    // Best-effort uninstall (exit non-zero when absent — first install).
    await executor.run({ command: 'grok', args: ['plugin', 'uninstall', plugin, '--confirm'], forceBuffered: true });

    // Install from the plugin directory path (Claude-format layout). Do NOT pass
    // plugin@marketplace — Grok 0.2.93 does not accept that addressing form.
    await runCheckedCommand(['grok', 'plugin', 'install', pluginRoot, '--trust'], 'grok plugin install', executor);
}

/**
 * Default OMP installer — registers the marketplace then installs the plugin.
 * Uses `registration.source` for github/directory mode parity with Claude.
 * Exposed as a dependency so tests can mock the spawn calls. Mirrors
 * {@link defaultRunClaudeInstall} but adds the `global` flag for scope selection.
 */
export async function defaultRunOmpInstall(
    registration: MarketplaceRegistration,
    marketplaceName: string,
    plugin: string,
    global: boolean,
    executor: ProcessExecutor = defaultProcessExecutor,
): Promise<void> {
    // The name flows into omp CLI args and the registry key; a manifest name like `..`
    // or `a/b` would corrupt the `<plugin>@<marketplace>` addressing downstream.
    // Plugin is the left half of `plugin@marketplace` — same segment rule as grok.
    assertSafePathSegment(marketplaceName, 'marketplace name');
    assertSafePathSegment(plugin, 'plugin name');

    // Idempotent re-registration: `omp plugin marketplace add` exits 1 when the marketplace
    // is already registered (omp 16.x; `--force` does not bypass the check), so remove it
    // first. The remove exits 1 when the marketplace is absent — the expected first-install
    // case — so it is best-effort with output suppressed.
    await executor.run({
        command: 'omp',
        args: ['plugin', 'marketplace', 'remove', marketplaceName],
        forceBuffered: true,
    });

    await runCheckedCommand(
        ['omp', 'plugin', 'marketplace', 'add', registration.source],
        'omp plugin marketplace add',
        executor,
    );

    // --force: reinstall over an existing registry entry AND refresh the cached plugin dir
    // (verified against omp 16.4.2: a plain install exits 1 with "already installed" and
    // never refreshes the cache, so stale source would survive a re-install without it).
    const installArgs: [string, ...string[]] = ['omp', 'plugin', 'install', `${plugin}@${marketplaceName}`, '--force'];
    if (!global) installArgs.push('--scope', 'project');
    await runCheckedCommand(installArgs, 'omp plugin install', executor);
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
    const preferredScope = global ? 'user' : 'project';
    const scoped = entries.find((e) => e.scope === preferredScope);
    return (scoped ?? entries[0])?.installPath;
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
        hookResult = generateOmpHookModules(hooksSourceDir, installPath, plugin);
    }

    // R4: slash command dialect translation on installed commands/
    transformMarkdownDirectory(join(installPath, 'commands'), 'omp', plugin);
    return hookResult;
}

/**
 * Per-target magent emission from staged `.rulesync/magents/`.
 *
 * - **Claude import-style** (`CLAUDE.md` with `@IDENTITY.md` etc.): copy package
 *   layer files + CLAUDE.md into the dest dir so Claude expands `@` at session start.
 * - **Other targets / non-import packages:** assemble (concat or single-file) + shim.
 * Plugin rules (`plugins/<plugin>/rules/`) are emitted separately via
 * {@link emitPluginRules} — not from the magent package.
 */
export function emitMagents(
    plugin: string,
    targets: Target[],
    outputDir: string,
    outputRoot: string,
    options: InstallOptions,
): Map<Target, string[]> {
    const written = new Map<Target, string[]>();
    const stagedRoot = join(outputDir, 'magents');
    if (!existsSync(stagedRoot)) return written;
    const staged = readdirSync(stagedRoot).filter((e) => {
        const stat = lstatSync(join(stagedRoot, e));
        return stat.isDirectory();
    });
    if (staged.length === 0) return written;

    // Selection policy (plugins without magents must no-op cleanly):
    // - --magent <name> → require a match (plugin-prefixed or bare marketplace name).
    // - no --magent → auto-select only when exactly one *plugin-owned* package is staged
    //   (`<plugin>-*`). Marketplace-root packages (bare names under monorepo `magents/`)
    //   always require --magent so `install sp` never overwrites AGENTS.md just because
    //   the marketplace happens to ship a persona package next to the plugins.
    // - zero staged → silent no-op (verbose note).
    let selected: string[];
    if (options.magent) {
        const wanted = options.magent;
        const match = staged.find((s) => s === wanted || s === `${plugin}-${wanted}` || s.endsWith(`-${wanted}`));
        if (!match) {
            throw new Error(
                `Magent '${wanted}' not found. Staged magents: ${staged.join(', ') || '(none)'}. ` +
                    `Use the bare name (e.g. 'team-stark-children') or '<plugin>-<name>'. ` +
                    `Omit --magent when the plugin has no main-agent package.`,
            );
        }
        selected = [match];
    } else {
        const pluginOwned = staged.filter((s) => s === plugin || s.startsWith(`${plugin}-`));
        if (pluginOwned.length === 1) {
            const [only] = pluginOwned;
            if (!only) return written;
            selected = [only];
        } else if (pluginOwned.length === 0 && staged.length === 0) {
            if (options.verbose) {
                echo(`  Magents: none staged for '${plugin}' — skipping main-agent emission`);
            }
            return written;
        } else {
            if (options.verbose) {
                echo(
                    `  Magents: ${staged.length} staged (${pluginOwned.length} plugin-owned); ` +
                        `pass --magent <name> to install. Staged: ${staged.join(', ')}`,
                );
            }
            return written;
        }
    }

    let emitted = 0;
    for (const target of targets) {
        for (const magentDir of selected) {
            const sourceDir = join(stagedRoot, magentDir);
            const destDir = options.global ? (magentGlobalDir(target, resolveHomeDir()) ?? outputRoot) : outputRoot;

            // Claude Code: prefer modular package + @ imports when CLAUDE.md uses them.
            if (target === 'claude' && isClaudeImportStyle(sourceDir)) {
                if (options.verbose) {
                    echo(`  ${target}: magent ${magentDir} → ${join(destDir, 'CLAUDE.md')} (Claude @import package)`);
                }
                if (!options.dryRun) {
                    mkdirSync(destDir, { recursive: true });
                    const destFiles = written.get(target) ?? [];
                    for (const name of CLAUDE_PACKAGE_FILES) {
                        const src = join(sourceDir, name);
                        if (!existsSync(src)) continue;
                        const raw = readFileSync(src, 'utf-8');
                        const destPath = join(destDir, name);
                        writeFileSync(destPath, adaptMagentForTarget(raw, plugin, target));
                        destFiles.push(destPath);
                    }
                    written.set(target, destFiles);
                }
                emitted++;
                continue;
            }

            const assembly = assembleMagentContent(sourceDir, target);
            if (!assembly) {
                if (options.verbose) {
                    echo(`  ${target}: no magent content in ${magentDir}/ — skipping`);
                }
                continue;
            }
            const outName = magentOutputFilename(target);
            const destPath = join(destDir, outName);
            if (options.verbose) {
                const agentsSource = assembly.sources.find((s) => /(?:^|\/)(?:AGENTS|CLAUDE)(?:\.[^/]+)?\.md$/.test(s));
                const primary = agentsSource ?? assembly.sources[assembly.sources.length - 1] ?? sourceDir;
                const relSource = primary.replace(`${process.cwd()}/`, '');
                echo(`  ${target}: magent ${magentDir} → ${destPath} (from ${relSource})`);
            }
            if (!options.dryRun) {
                const adapted = adaptMagentForTarget(assembly.content, plugin, target);
                mkdirSync(destDir, { recursive: true });
                writeFileSync(destPath, adapted);
                const destFiles = written.get(target) ?? [];
                destFiles.push(destPath);
                written.set(target, destFiles);
            }
            emitted++;
        }
    }
    if (options.verbose && emitted > 0) {
        echo(`  Magents emitted: ${emitted}`);
    }
    return written;
}

/**
 * Copy plugin-level `plugins/<plugin>/rules/*.md` into each target's rules
 * directory when supported. Independent of magent selection — rules are
 * distribution constraints for the plugin, not persona layers.
 */
export function emitPluginRules(
    pluginRoot: string,
    targets: Target[],
    outputRoot: string,
    options: InstallOptions,
): Map<Target, string[]> {
    const written = new Map<Target, string[]>();
    const rulesDir = join(pluginRoot, 'rules');
    const ruleFiles = listRuleMarkdownFiles(rulesDir);
    if (ruleFiles.length === 0) return written;

    for (const target of targets) {
        const rel = magentRulesRelDir(target);
        if (!rel) {
            if (options.verbose) {
                echo(`  ${target}: ${ruleFiles.length} plugin rule(s) skipped (no rules directory for this target)`);
            }
            continue;
        }
        const destRoot = options.global ? (magentGlobalDir(target, resolveHomeDir()) ?? outputRoot) : outputRoot;
        const rulesDest = join(destRoot, rel);
        if (options.verbose) {
            echo(`  ${target}: plugin rules → ${rulesDest} (${ruleFiles.length} file(s))`);
        }
        if (options.dryRun) continue;
        mkdirSync(rulesDest, { recursive: true });
        const destFiles: string[] = [];
        for (const src of ruleFiles) {
            const name = src.split(/[/\\]/).pop() ?? 'rule.md';
            const destPath = join(rulesDest, name);
            copyFileSync(src, destPath);
            destFiles.push(destPath);
        }
        written.set(target, destFiles);
    }
    return written;
}

/**
 * Stage plugin-level scripts from the canonical .rulesync/scripts/<plugin>/ tree
 * to the shared agents scripts root (~/.agents/scripts/<plugin>/ or project twin).
 *
 * Called once per install when the target set includes rulesync or hermes — not per
 * target (dedup when installing `--targets all`). Native-only installs never call this
 * (caller gates on target class). File count comes from {@link MapResult.scripts} so
 * we do not re-walk the tree (mapper already counted).
 *
 * @param outputDir  The .rulesync/ staging root produced by {@link mapPluginToRulesync}.
 * @param pluginName The plugin prefix (e.g. "cc").
 * @param outputRoot The global home dir or project cwd/outputRoot override.
 * @param options    Install options for dryRun/verbose gating.
 * @param stagedFileCount Mapper-reported file count for verbose logging.
 * @returns Number of files staged, or 0 when no plugin-level scripts exist.
 */
function stagePluginScripts(
    outputDir: string,
    pluginName: string,
    outputRoot: string,
    options: InstallOptions,
    stagedFileCount: number,
): number {
    // pluginName is the leaf of a recursive rmSync target under .agents/scripts/.
    assertSafePathSegment(pluginName, 'plugin name');
    const stagedSource = join(outputDir, 'scripts', pluginName);
    if (!existsSync(stagedSource)) return 0;

    const dest = join(outputRoot, '.agents', 'scripts', pluginName);

    if (options.verbose) {
        echo(`  Plugin scripts: staging ${stagedFileCount} file(s) to ${dest}`);
    }

    if (options.dryRun) return stagedFileCount;

    // Replace only <plugin>/ subdir — never the entire .agents/scripts/ tree (other plugins).
    if (existsSync(dest)) {
        rmSync(dest, { recursive: true, force: true });
    }
    copyDirectory(stagedSource, dest);

    return stagedFileCount;
}

/** Flattened skills targets whose dest is a shared/own skills root (not a native plugin tree). */
const FLATTENED_PRUNE_TARGETS: readonly Target[] = [
    'codex',
    'pi',
    'opencode',
    'antigravity-cli',
    'antigravity-ide',
    'hermes',
];

/**
 * Plugin-scoped `--prune` on flattened skills dests (R4/R5, task 0114).
 *
 * For each flattened skills dest this run writes, in two phases:
 *
 * 1. **Replace** dest dirs whose name is in the mapped set (clean-before-write) so
 *    intra-dir leftovers from a prior install disappear. The current install then
 *    rewrites them; callers run this before rulesync would re-write, so we only
 *    delete — the mapped content is already on disk in `.rulesync/`.
 * 2. **Remove** dest dirs matching `^<plugin>-` that are NOT in the mapped set
 *    (orphans: renamed/deleted source entities).
 *
 * Dest dirs not starting with `<plugin>-` (other plugins) are never touched. Native
 * plugin-tree dests (claude/omp/grok) own their own trees and are pruned by their
 * host plugin CLIs, not here.
 *
 * @param outputDir   `.rulesync/` staging root holding the mapped `<plugin>-*` name set.
 * @param plugin      Plugin prefix (e.g. `sp`).
 * @param targets     Requested install targets (prune only applies to flattened ones).
 * @param outputRoot  Global `$HOME` or project cwd/outputRoot override.
 * @param options     Install options for dryRun/verbose gating.
 */
function prunePluginDestSkills(
    outputDir: string,
    plugin: string,
    targets: Target[],
    outputRoot: string,
    options: InstallOptions,
): void {
    // plugin is the leaf prefix of a recursive rmSync target under a shared skills root.
    assertSafePathSegment(plugin, 'plugin name');

    const mappedNames = readMappedSkillNames(outputDir, plugin);
    if (mappedNames.size === 0) {
        if (options.verbose) echo(`  --prune: no mapped skills for '${plugin}' — nothing to prune`);
        return;
    }

    // Build the deduped set of dest dirs this install touches (by absolute path).
    // codex & pi share `~/.agents/skills` via the codexcli target; hermes writes
    // `~/.hermes/skills` via an opencode copy. Dedupe by resolved path.
    const destDirs = new Set<string>();
    const flattened = targets.filter((t) => (FLATTENED_PRUNE_TARGETS as readonly string[]).includes(t));
    const home = resolveHomeDir();
    for (const target of flattened) {
        const reldir = options.global
            ? (TARGET_GLOBAL_SKILLS_RELDIR[target] ?? TARGET_SKILLS_RELDIR[target])
            : TARGET_SKILLS_RELDIR[target];
        if (!reldir) continue;
        // hermes is project-mode-only in practice but the reldir map covers both; resolve against outputRoot.
        const base = options.outputRoot ?? (options.global ? home : process.cwd());
        destDirs.add(resolve(base, reldir));
        if (target === 'hermes') destDirs.add(resolve(outputRoot, '.hermes', 'skills'));
    }
    if (destDirs.size === 0) return;

    const prefix = `${plugin}-`;
    let removed = 0;
    let replaced = 0;
    for (const destDir of destDirs) {
        if (!existsSync(destDir)) continue;
        for (const entry of readdirSync(destDir)) {
            if (!entry.startsWith(prefix)) continue; // other plugins' dest dirs are untouchable
            const target = join(destDir, entry);
            if (!statSync(target).isDirectory()) continue;
            if (options.dryRun) {
                if (mappedNames.has(entry)) replaced++;
                else removed++;
                continue;
            }
            // Replace OR remove — both delete first; mapped dirs are re-written by the current install.
            rmSync(target, { recursive: true, force: true });
            if (mappedNames.has(entry)) replaced++;
            else removed++;
        }
    }
    if (options.verbose) {
        echo(`  --prune: removed ${removed} orphan dir(s), replaced ${replaced} dir(s) for '${plugin}'`);
    }
}

/** Read the `<plugin>-*` skill dir names this install mapped into `.rulesync/skills/`. */
function readMappedSkillNames(outputDir: string, plugin: string): Set<string> {
    assertSafePathSegment(plugin, 'plugin name');
    const skillsStaging = join(outputDir, 'skills');
    const names = new Set<string>();
    if (!existsSync(skillsStaging)) return names;
    const prefix = `${plugin}-`;
    for (const entry of readdirSync(skillsStaging)) {
        if (entry.startsWith(prefix) && statSync(join(skillsStaging, entry)).isDirectory()) {
            names.add(entry);
        }
    }
    return names;
}

/** Parse a comma-separated targets string. Returns all targets when undefined or "all". Throws on unknown targets. */
export function parseTargets(raw: string | undefined): Target[] {
    if (!raw) return [...TARGETS];
    if (raw === 'all') return [...TARGETS];
    const requested = raw
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
    for (const t of requested) {
        if (!(TARGETS as readonly string[]).includes(t)) {
            throw new Error(`Unknown target '${t}'. Valid targets: ${TARGETS.join(', ')}`);
        }
    }
    return requested as Target[];
}

/**
 * Locate the CLI's own installed package root for self-location (R6/T5).
 *
 * In `bun build --target bun` output, `import.meta.dir` is the real `dist/`
 * path (already symlink-resolved), so its parent is the package root. A
 * `--compile` binary reports the virtual `/$bunfs/root`, and a dev-repo run
 * points at `apps/cli` — both must fall through silently (return null), never
 * throw ENOENT from `realpathSync`. Accepts explicit `candidates` for tests.
 */
export function resolveInstalledPackageRoot(candidates?: string[]): string | null {
    const roots: string[] = candidates ?? [];
    if (!candidates) {
        if (import.meta.dir) {
            roots.push(resolve(import.meta.dir, '..'));
        }
        // Defensive fallback: argv[1] is already real-path'd under bun, so the
        // realpath is belt-and-braces for a future node-hosted bin.
        if (process.argv[1]) {
            try {
                roots.push(resolve(realpathSync(process.argv[1]), '..'));
            } catch {
                // virtual/non-existent path (--compile) — skip silently
            }
        }
    }
    for (const root of roots) {
        if (root.startsWith('/$bunfs')) continue; // --compile virtual root
        try {
            if (existsSync(root) && statSync(root).isDirectory()) return root;
        } catch {}
    }
    return null;
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
export function resolvePluginRoot(
    plugin: string,
    marketplacePath?: string,
    configuredPluginPath?: string,
): PluginResolution {
    // Fail before any FS probe: join('plugins', plugin) normalizes `../x` out of
    // plugins/ and would resolve a sibling/ancestor tree that happens to look like
    // a plugin. mapPluginToRulesync also asserts, but resolvePluginRoot is public
    // and must not return an escaped pluginRoot on its own.
    assertSafePathSegment(plugin, 'plugin name');
    if (configuredPluginPath && !marketplacePath) {
        const pluginRoot = resolve(configuredPluginPath);
        if (
            existsSync(pluginRoot) &&
            statSync(pluginRoot).isDirectory() &&
            readdirSync(pluginRoot).some((entry) =>
                ['skills', 'commands', 'agents', 'hooks', 'hooks.json', 'plugin.json'].includes(entry),
            )
        ) {
            return withSourceMeta(plugin, { pluginRoot }, 'marketplace');
        }
        throw new Error(`Configured path for plugin '${plugin}' is not a plugin directory: ${pluginRoot}`);
    }
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
            // The name keys recursive cache deletes under $HOME (.claude/.omp plugin caches).
            // A hostile manifest name like `../../..` would resolve those deletes to $HOME
            // itself — reject anything that is not a single path segment, loudly (outside
            // the parse catch so it is never swallowed as "no name").
            if (marketplaceName !== undefined) {
                assertSafePathSegment(marketplaceName, 'marketplace name');
            }
        }
        return withSourceMeta(
            plugin,
            { pluginRoot: resolved.pluginRoot, marketplaceRoot: manifestRoot, marketplaceName },
            'marketplace',
        );
    }

    // Step 4: installed package root self-location (R6/T5). Probes the bundled
    // package for `.claude-plugin/marketplace.json` then `plugins/<name>`, so a
    // registry install works from any CWD with zero flags. Falls through
    // silently for --compile binaries (/bunfs virtual root) and dev-repo runs.
    const installedRoot = resolveInstalledPackageRoot();
    if (installedRoot) {
        const pkgManifest = join(installedRoot, '.claude-plugin', 'marketplace.json');
        if (existsSync(pkgManifest)) {
            const pkgResolved = resolvePlugin(pkgManifest, plugin);
            if (pkgResolved) {
                return withSourceMeta(
                    plugin,
                    { pluginRoot: pkgResolved.pluginRoot, marketplaceRoot: pkgResolved.marketplaceRoot },
                    'bundled',
                );
            }
        }
        const pkgFallback = join(installedRoot, 'plugins', plugin);
        if (
            existsSync(pkgFallback) &&
            readdirSync(pkgFallback).some((d) => ['skills', 'commands', 'agents', 'hooks', 'hooks.json'].includes(d))
        ) {
            return withSourceMeta(plugin, { pluginRoot: pkgFallback }, 'bundled');
        }
    }

    const fallback = join('plugins', plugin);
    if (
        existsSync(fallback) &&
        readdirSync(fallback).some((d) => ['skills', 'commands', 'agents', 'hooks', 'hooks.json'].includes(d))
    )
        return withSourceMeta(plugin, { pluginRoot: resolve(fallback) }, 'marketplace');

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

function withSourceMeta(
    plugin: string,
    base: { pluginRoot: string; marketplaceRoot?: string; marketplaceName?: string },
    channel: 'bundled' | 'marketplace',
): PluginResolution {
    const upstreamVersion =
        channel === 'bundled'
            ? cliVersion
            : (readMarketplacePluginVersion(base.marketplaceRoot, plugin) ??
              readPluginJsonVersion(base.pluginRoot) ??
              cliVersion);
    return {
        ...base,
        channel,
        upstreamVersion,
        ...(channel === 'marketplace' ? { marketplaceLocator: resolve(base.marketplaceRoot ?? base.pluginRoot) } : {}),
    };
}

/** Read a plugin version from either supported local marketplace-manifest path. */
export function readMarketplacePluginVersion(marketplaceRoot: string | undefined, plugin: string): string | undefined {
    if (!marketplaceRoot) return undefined;
    for (const candidate of [
        join(marketplaceRoot, '.claude-plugin', 'marketplace.json'),
        join(marketplaceRoot, 'marketplace.json'),
    ]) {
        if (!existsSync(candidate)) continue;
        try {
            const parsed = JSON.parse(readFileSync(candidate, 'utf-8')) as {
                plugins?: Array<{ name?: string; version?: string }>;
            };
            const version = parsed.plugins?.find((entry) => entry.name === plugin)?.version;
            if (typeof version === 'string' && version.length > 0) return version;
        } catch {
            // Unparseable marketplace file — try the next candidate.
        }
    }
    return undefined;
}

/** Read the optional version from a plugin root's `plugin.json`. */
export function readPluginJsonVersion(pluginRoot: string): string | undefined {
    const manifestPath = join(pluginRoot, 'plugin.json');
    if (!existsSync(manifestPath)) return undefined;
    try {
        const parsed = JSON.parse(readFileSync(manifestPath, 'utf-8')) as { version?: string };
        if (typeof parsed.version === 'string' && parsed.version.length > 0) return parsed.version;
    } catch {
        return undefined;
    }
    return undefined;
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
    plugin: string,
): EmitHooksResult | null {
    if (target === 'pi') {
        return emitPiStyleHooks(rulesyncSourceDir, outputRoot, '.pi', 'pi', options, plugin);
    }
    if (target === 'omp') {
        return emitPiStyleHooks(rulesyncSourceDir, outputRoot, '.omp', 'omp', options, plugin);
    }
    if (target === 'hermes') {
        return emitHermesHooks(rulesyncSourceDir, outputRoot, options, plugin);
    }
    return null;
}

function transformRulesyncMarkdown(root: string, target: Target, pluginName: string): void {
    // Only skills/ exists now - commands and subagents are adapted into skill
    // directories by the mapper. Slash-command dialect translation and scoped
    // reference rewriting apply on the per-target pass. Pi and Codex additionally
    // receive native agent files (TOML/MD) via the dual-emit dispatch above.
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

/** Recursively copy a directory while ignoring symlinks and configured directory names. */
export function copyDirectory(
    source: string,
    destination: string,
    options: { skipDirectoryNames?: Set<string> } = {},
): string[] {
    if (!existsSync(source)) return [];

    mkdirSync(destination, { recursive: true });
    const written: string[] = [];
    for (const entry of readdirSync(source)) {
        if (options.skipDirectoryNames?.has(entry)) continue;

        const sourcePath = join(source, entry);
        const destinationPath = join(destination, entry);
        const stat = lstatSync(sourcePath);
        if (stat.isSymbolicLink()) continue;
        if (stat.isDirectory()) {
            written.push(...copyDirectory(sourcePath, destinationPath, options));
        } else {
            copyFileSync(sourcePath, destinationPath);
            written.push(destinationPath);
        }
    }
    return written;
}

function expandInstallPaths(scopeRoot: string, paths: readonly string[]): string[] {
    const files: string[] = [];
    for (const p of paths) {
        const abs = isAbsolute(p) ? p : join(scopeRoot, p);
        if (!existsSync(abs)) continue;
        const st = lstatSync(abs);
        if (st.isSymbolicLink()) continue;
        if (st.isDirectory()) {
            files.push(...listRegularFilesUnder(abs));
            continue;
        }
        if (st.isFile()) files.push(abs);
    }
    return files;
}

function isPluginOwnedPath(absPath: string, plugin: string): boolean {
    const base = basename(absPath);
    if (base === plugin || base.startsWith(`${plugin}-`)) return true;
    const parts = absPath.split(/[/\\]/);
    return parts.some((part) => part === plugin || part.startsWith(`${plugin}-`));
}

function enumeratePluginOwnedDests(
    target: Target,
    plugin: string,
    scopeRoot: string,
    mappedSkillNames: ReadonlySet<string>,
    useGlobalSkillsLayout: boolean,
): string[] {
    const files: string[] = [];
    const skillsRel = useGlobalSkillsLayout
        ? (TARGET_GLOBAL_SKILLS_RELDIR[target] ?? TARGET_SKILLS_RELDIR[target])
        : TARGET_SKILLS_RELDIR[target];
    if (skillsRel) {
        const skillsDir = join(scopeRoot, skillsRel);
        for (const name of mappedSkillNames) {
            const dest = join(skillsDir, name);
            if (existsSync(dest)) files.push(...listRegularFilesUnder(dest));
        }
    }
    if (target === 'hermes') {
        files.push(...pluginPrefixedEntries(join(scopeRoot, '.hermes', 'skills'), plugin));
    }
    if (target === 'pi') {
        files.push(...pluginPrefixedEntries(join(scopeRoot, '.pi', 'agent', 'agents'), plugin));
        const piPluginDir = join(scopeRoot, '.pi', 'agent', 'plugins', plugin);
        if (existsSync(piPluginDir)) files.push(...listRegularFilesUnder(piPluginDir));
    }
    if (target === 'codex') {
        files.push(...pluginPrefixedEntries(join(scopeRoot, '.codex', 'agents'), plugin));
    }
    if (target === 'claude') {
        const claudeRoot = join(scopeRoot, '.claude', 'plugins');
        files.push(...pluginPrefixedEntries(claudeRoot, plugin));
    }
    if (target === 'omp') {
        const ompRoot = join(scopeRoot, '.omp', 'plugins');
        files.push(...pluginPrefixedEntries(ompRoot, plugin));
    }
    if (target === 'grok') {
        const grokRoot = join(scopeRoot, '.grok');
        if (existsSync(grokRoot)) files.push(...pluginPrefixedEntries(grokRoot, plugin));
    }
    const scriptsDir = join(scopeRoot, '.agents', 'scripts', plugin);
    if (existsSync(scriptsDir) && target !== 'claude' && target !== 'omp' && target !== 'grok') {
        files.push(...listRegularFilesUnder(scriptsDir));
    }
    return files;
}

function pluginPrefixedEntries(dir: string, plugin: string): string[] {
    if (!existsSync(dir)) return [];
    const files: string[] = [];
    for (const entry of readdirSync(dir)) {
        if (entry !== plugin && !entry.startsWith(`${plugin}-`)) continue;
        const full = join(dir, entry);
        const st = lstatSync(full);
        if (st.isSymbolicLink()) continue;
        if (st.isDirectory()) files.push(...listRegularFilesUnder(full));
        else if (st.isFile()) files.push(full);
    }
    return files;
}

function writeInstallProvenance(args: {
    plugin: string;
    targets: Target[];
    outputRoot: string;
    pluginRoot: string;
    resolution: PluginResolution;
    resolvedRef?: string;
    receipts: Map<Target, TargetInstallReceipt>;
    addReceiptFiles: (target: Target, files: readonly string[]) => void;
    mappedSkillNames: ReadonlySet<string>;
    useGlobalSkillsLayout: boolean;
    writer: typeof writeInstallManifest;
    nowIso: string;
}): void {
    const upstreamFiles = listRegularFilesUnder(args.pluginRoot);
    if (upstreamFiles.length === 0) {
        throw new Error(`Install provenance inventory is empty for upstream plugin root: ${args.pluginRoot}`);
    }
    const upstream = snapshotFiles(args.pluginRoot, upstreamFiles);
    for (const target of args.targets) {
        args.addReceiptFiles(
            target,
            enumeratePluginOwnedDests(
                target,
                args.plugin,
                args.outputRoot,
                args.mappedSkillNames,
                args.useGlobalSkillsLayout,
            ),
        );
        const collected = args.receipts.get(target)?.files ?? [];
        const unique: string[] = [];
        const seen = new Set<string>();
        const scopeRoot = resolve(args.outputRoot);
        for (const file of collected) {
            const abs = resolve(file);
            if (seen.has(abs) || !existsSync(abs)) continue;
            const st = lstatSync(abs);
            if (st.isSymbolicLink() || !st.isFile()) continue;
            // Host install trees can sit under $HOME while project scopeRoot is cwd.
            const rel = relative(scopeRoot, abs);
            if (rel.startsWith('..') || rel === '' || isAbsolute(rel)) continue;
            seen.add(abs);
            unique.push(abs);
        }
        if (unique.length === 0) {
            throw new Error(
                `Install provenance inventory did not resolve any installed files for plugin '${args.plugin}' target '${target}'`,
            );
        }
        const installed = snapshotFiles(args.outputRoot, unique);
        const manifest: InstallManifestV1 = {
            schemaVersion: 1,
            plugin: args.plugin,
            target,
            channel: args.resolution.channel,
            upstreamVersion: args.resolution.upstreamVersion,
            ...(args.resolution.marketplaceLocator !== undefined
                ? { marketplaceLocator: args.resolution.marketplaceLocator }
                : {}),
            ...(args.resolvedRef !== undefined ? { resolvedRef: args.resolvedRef } : {}),
            installedAt: args.nowIso,
            superskillVersion: cliVersion,
            installed,
            upstream,
        };
        args.writer(args.outputRoot, target, args.plugin, manifest);
    }
}

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

/** Count skill directories (dirs containing `SKILL.md`) under `skillsDir`. */
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
