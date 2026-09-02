import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import {
    assertSafePathSegment,
    buildUpdateCheckResult,
    compareBundledVersion,
    compareMarketplaceManifest,
    installManifestPath,
    listRegularFilesUnder,
    listResolvablePlugins,
    type PluginUpdateResult,
    readInstallManifest,
    resolvePlugin,
    snapshotFiles,
    TARGETS,
    type Target,
} from '@gobing-ai/superskill-core';
import { NodeProcessExecutor, type ProcessExecutor } from '@gobing-ai/ts-runtime';
import { echo } from '@gobing-ai/ts-utils';
import type { Command } from 'commander';
import { loadConfig } from '../config';
import {
    executeInstall,
    isRemoteMarketplaceLocator,
    parseTargets,
    readMarketplacePluginVersion,
    readPluginJsonVersion,
    resolveInstalledPackageRoot,
    resolveRemoteMarketplace,
} from './install';

const NPM_PACKAGE = '@gobing-ai/superskill';
const NPM_UPGRADE = `npm i -g ${NPM_PACKAGE}@latest`;

/** Options for one `superskill update` invocation. */
export interface UpdateOptions {
    check: boolean;
    global: boolean;
    marketplacePath?: string;
    outputRoot?: string;
}

/** Injectable seams for tests. */
export interface UpdateDependencies {
    executeInstall?: typeof executeInstall;
    processExecutor?: ProcessExecutor;
    npmLatest?: () => Promise<string>;
    /** Override bundled marketplace name listing (tests inject a frozen set). */
    listBundledPlugins?: () => string[];
}

/**
 * Register the `superskill update` subcommand.
 */
export function registerUpdate(program: Command): void {
    program
        .command('update')
        .description('Check installed plugins for upstream updates, or re-install stale marketplace plugins')
        .argument('[plugin]', 'Plugin name to check or update (default: all known candidates)')
        .option('--check', 'Report stale plugins without writing files', false)
        .option('--targets <list>', 'Comma-separated target agents (default: all configured)')
        .option(
            '--marketplace <locator>',
            'Override recorded marketplace locator (path, GitHub URL, or owner/repo shorthand)',
        )
        .option('--no-global', 'Scan project-level manifests instead of user-level global directories')
        .action(async (plugin: string | undefined, options) => {
            try {
                const config = loadConfig();
                const targets =
                    options.targets !== undefined
                        ? parseTargets(options.targets)
                        : config.targets.length > 0
                          ? [...config.targets]
                          : parseTargets(undefined);
                const code = await executeUpdate(plugin, targets, {
                    check: options.check === true,
                    global: options.global !== false,
                    marketplacePath: options.marketplace as string | undefined,
                });
                process.exit(code);
            } catch (err) {
                echo(`Error: ${err instanceof Error ? err.message : String(err)}`);
                process.exit(1);
            }
        });
}

/**
 * Discover candidates, compare against upstream, print one row per plugin, and
 * return the aggregate exit code. `--check` never writes. Mutating mode re-installs
 * stale marketplace plugins via {@link executeInstall} and prints the npm upgrade
 * command once for stale bundled plugins.
 */
export async function executeUpdate(
    plugin: string | undefined,
    targets: Target[],
    options: UpdateOptions,
    dependencies: UpdateDependencies = {},
): Promise<number> {
    if (plugin !== undefined) assertSafePathSegment(plugin, 'plugin name');
    const scopeRoot = options.outputRoot ?? (options.global ? resolveHomeDir() : process.cwd());
    const config = loadConfig();
    const candidates = collectCandidates(
        scopeRoot,
        plugin,
        config.plugins.map((entry) => entry.name),
        targets,
        dependencies.listBundledPlugins ?? listBundledMarketplacePlugins,
    );
    const rows: PluginUpdateResult[] = [];
    const marketplaceWork = new Map<string, Promise<MarketplaceUpstream | undefined>>();
    const marketplaceActions = new Map<string, MarketplaceInstallAction>();
    let bundledLatest: string | undefined;
    let bundledStale = false;
    const installImpl = dependencies.executeInstall ?? executeInstall;
    const npmLatest = dependencies.npmLatest ?? (() => fetchNpmLatest(dependencies.processExecutor));

    for (const candidate of candidates) {
        const manifests = readCandidateManifests(scopeRoot, candidate, targets);
        if (manifests.length === 0) {
            rows.push({ plugin: candidate, status: 'legacy' });
            continue;
        }
        for (const manifest of manifests) {
            if (manifest.channel === 'bundled') {
                try {
                    bundledLatest ??= await npmLatest();
                    const comparison = compareBundledVersion(candidate, manifest.upstreamVersion, bundledLatest);
                    rows.push(comparison);
                    if (comparison.status === 'stale') bundledStale = true;
                } catch {
                    rows.push({
                        plugin: candidate,
                        status: 'unavailable',
                        channel: 'bundled',
                        locator: NPM_PACKAGE,
                    });
                }
                continue;
            }
            const locator = options.marketplacePath ?? manifest.marketplaceLocator;
            if (!locator) {
                rows.push({ plugin: candidate, status: 'unavailable', channel: 'marketplace', locator: '' });
                continue;
            }
            const cacheKey = `${locator}::${candidate}`;
            let pending = marketplaceWork.get(cacheKey);
            if (!pending) {
                pending = resolveMarketplaceUpstream(candidate, locator);
                marketplaceWork.set(cacheKey, pending);
            }
            const upstream = await pending;
            if (!upstream) {
                rows.push({ plugin: candidate, status: 'unavailable', channel: 'marketplace', locator });
                continue;
            }
            const comparison = compareMarketplaceManifest(
                candidate,
                manifest.upstreamVersion,
                manifest.upstream,
                upstream.version,
                upstream.snapshot,
                locator,
            );
            rows.push(comparison);
            if (comparison.status === 'stale' && isTarget(manifest.target)) {
                const actionKey = JSON.stringify([candidate, locator]);
                const action = marketplaceActions.get(actionKey) ?? {
                    plugin: candidate,
                    locator,
                    targets: new Set<Target>(),
                };
                action.targets.add(manifest.target);
                marketplaceActions.set(actionKey, action);
            }
        }
    }

    const { results, exitCode } = buildUpdateCheckResult(rows, options.check);
    for (const row of results) echo(formatUpdateRow(row));

    if (!options.check) {
        if (bundledStale) echo(NPM_UPGRADE);
        for (const action of marketplaceActions.values()) {
            const locator = options.marketplacePath ?? action.locator;
            const pluginRootOnly = options.marketplacePath === undefined && isPluginRootOnlyLocator(locator);
            await installImpl(action.plugin, [...action.targets], {
                marketplacePath: pluginRootOnly ? undefined : locator,
                pluginPath: pluginRootOnly ? locator : undefined,
                global: options.global,
                dryRun: false,
                verbose: false,
                outputRoot: options.outputRoot,
            });
        }
    }

    return exitCode;
}

interface MarketplaceUpstream {
    version: string;
    snapshot: ReturnType<typeof snapshotFiles>;
}

interface MarketplaceInstallAction {
    plugin: string;
    locator: string;
    targets: Set<Target>;
}

function collectCandidates(
    scopeRoot: string,
    plugin: string | undefined,
    configured: string[],
    targets: Target[],
    listBundled: () => string[],
): string[] {
    const names = new Set<string>();
    if (plugin) names.add(plugin);
    for (const name of configured) {
        try {
            assertSafePathSegment(name, 'plugin name');
            names.add(name);
        } catch {
            // Ignore unsafe configured names rather than aborting the batch.
        }
    }
    for (const name of listManifestPlugins(scopeRoot, targets)) names.add(name);
    for (const name of listBundled()) names.add(name);
    if (plugin) return [...names].filter((name) => name === plugin).sort(utf8Sort);
    return [...names].sort(utf8Sort);
}

function listManifestPlugins(scopeRoot: string, targets: Target[]): string[] {
    const root = join(resolve(scopeRoot), '.superskill', 'manifests');
    if (!existsSync(root) || !statSync(root).isDirectory()) return [];
    const plugins = new Set<string>();
    const targetNames = targets.length > 0 ? targets.map(String) : safeDirents(root);
    for (const target of targetNames) {
        try {
            assertSafePathSegment(String(target), 'target name');
        } catch {
            continue;
        }
        const targetDir = join(root, String(target));
        if (!existsSync(targetDir) || !statSync(targetDir).isDirectory()) continue;
        for (const name of safeDirents(targetDir)) plugins.add(name);
    }
    return [...plugins];
}

function readCandidateManifests(
    scopeRoot: string,
    plugin: string,
    targets: Target[],
): Array<ReturnType<typeof readInstallManifest> & { target: string }> {
    const found: Array<ReturnType<typeof readInstallManifest> & { target: string }> = [];
    const root = join(resolve(scopeRoot), '.superskill', 'manifests');
    const targetNames = targets.length > 0 ? targets : safeDirents(root);
    for (const target of targetNames) {
        try {
            assertSafePathSegment(String(target), 'target name');
        } catch {
            continue;
        }
        const path = installManifestPath(scopeRoot, String(target), plugin);
        if (!existsSync(path)) continue;
        try {
            const manifest = readInstallManifest(path);
            if (manifest.plugin !== plugin || manifest.target !== String(target)) continue;
            found.push({ ...manifest, target: String(target) });
        } catch {
            // Corrupt/unsupported → skip this target file; caller treats zero readable as legacy.
        }
    }
    return found;
}

async function resolveMarketplaceUpstream(plugin: string, locator: string): Promise<MarketplaceUpstream | undefined> {
    try {
        if (!isRemoteMarketplaceLocator(locator) && isPluginRootOnlyLocator(locator)) {
            const version = readPluginJsonVersion(locator);
            if (!version) return undefined;
            const files = listRegularFilesUnder(locator);
            return { version, snapshot: snapshotFiles(locator, files) };
        }
        let marketplacePath = locator;
        if (isRemoteMarketplaceLocator(locator)) {
            const remote = await resolveRemoteMarketplace(locator);
            marketplacePath = remote.root;
        }
        const resolved = resolvePlugin(marketplacePath, plugin);
        if (!resolved) return undefined;
        const version =
            readMarketplacePluginVersion(resolved.marketplaceRoot, plugin) ??
            readPluginJsonVersion(resolved.pluginRoot);
        if (!version) return undefined;
        const files = listRegularFilesUnder(resolved.pluginRoot);
        return { version, snapshot: snapshotFiles(resolved.pluginRoot, files) };
    } catch {
        return undefined;
    }
}

async function fetchNpmLatest(executor?: ProcessExecutor): Promise<string> {
    const runner = executor ?? new NodeProcessExecutor();
    const result = await runner.run({ command: 'npm', args: ['view', NPM_PACKAGE, 'version'] });
    if (result.exitCode !== 0) {
        throw new Error(result.stderr || `npm view ${NPM_PACKAGE} version failed`);
    }
    const version = result.stdout.trim();
    if (!version) throw new Error(`npm view ${NPM_PACKAGE} version returned empty`);
    return version;
}

function formatUpdateRow(row: PluginUpdateResult): string {
    if (row.status === 'legacy') {
        return `${row.plugin}: installed before manifest support - reinstall to adopt`;
    }
    if (row.status === 'unavailable') {
        return `${row.plugin}: upstream unavailable (${row.locator ?? ''})`;
    }
    if (row.status === 'current') {
        return `${row.plugin}: up to date`;
    }
    if (row.channel === 'bundled') {
        return `${row.plugin}: stale: superskill <${row.upstreamVersion}> available (installed <${row.installedVersion}>)`;
    }
    const n = row.changedPaths?.length ?? 0;
    const delta =
        row.installedVersion && row.upstreamVersion ? `${row.installedVersion} → ${row.upstreamVersion}` : 'changed';
    if (n === 0) return `${row.plugin}: stale: ${delta}`;
    const paths = (row.changedPaths ?? []).join(', ');
    return `${row.plugin}: stale: ${delta} (${n} file(s) changed: ${paths})`;
}

const PLUGIN_ROOT_MARKERS = ['skills', 'commands', 'agents', 'hooks', 'hooks.json', 'plugin.json'];

function locatorHasMarketplaceManifest(locator: string): boolean {
    if (locator.endsWith('marketplace.json')) return existsSync(resolve(locator));
    const root = resolve(locator);
    return existsSync(join(root, 'marketplace.json')) || existsSync(join(root, '.claude-plugin', 'marketplace.json'));
}

function looksLikePluginRoot(path: string): boolean {
    try {
        if (!existsSync(path) || !statSync(path).isDirectory()) return false;
        return readdirSync(path).some((entry) => PLUGIN_ROOT_MARKERS.includes(entry));
    } catch {
        return false;
    }
}

function isPluginRootOnlyLocator(locator: string): boolean {
    return looksLikePluginRoot(locator) && !locatorHasMarketplaceManifest(locator);
}

function listBundledMarketplacePlugins(): string[] {
    try {
        const pkg = resolveInstalledPackageRoot();
        if (!pkg) return [];
        return listResolvablePlugins(join(pkg, '.claude-plugin', 'marketplace.json'));
    } catch {
        return [];
    }
}

function safeDirents(dir: string): string[] {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
    const names: string[] = [];
    for (const entry of readdirSync(dir)) {
        try {
            assertSafePathSegment(entry, 'path segment');
            names.push(entry);
        } catch {
            // skip
        }
    }
    return names;
}

function isTarget(value: string): value is Target {
    return (TARGETS as readonly string[]).includes(value);
}

function utf8Sort(a: string, b: string): number {
    return Buffer.compare(Buffer.from(a, 'utf-8'), Buffer.from(b, 'utf-8'));
}

function resolveHomeDir(): string {
    return process.env.HOME_DIR ?? homedir();
}
