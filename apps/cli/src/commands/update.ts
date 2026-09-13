import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import {
    aggregateUpdateExit,
    assertSafePathSegment,
    BOT_SAND_DATA_ENV,
    checkSkills,
    compareBundledVersion,
    compareMarketplaceManifest,
    getGlobalLockPath,
    getLocalLockPath,
    type InstallTarget,
    installManifestPath,
    listRegularFilesUnder,
    listResolvablePlugins,
    mergePluginUpdateRows,
    readGlobalLock,
    readInstallManifest,
    readLocalLock,
    resolvePlugin,
    resolveSandRoot,
    type SandRootResolution,
    type SkillCheckRow,
    sanitizeName,
    snapshotFiles,
    TARGETS,
    type Target,
    type UpdateRow,
    type UpdateRowStatus,
    updateSkills,
} from '@gobing-ai/superskill-core';
import { NodeProcessExecutor, type ProcessExecutor } from '@gobing-ai/ts-runtime';
import { echo, echoError } from '@gobing-ai/ts-utils';
import type { Command } from 'commander';
import { loadConfig } from '../config';
import {
    executeInstall,
    isRemoteMarketplaceLocator,
    readMarketplacePluginVersion,
    readPluginJsonVersion,
    resolveInstalledPackageRoot,
    resolveInstallTargets,
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
    /** With `--check`, emit one JSON envelope instead of grouped text rows (R4). */
    json?: boolean;
}

/** Injectable seams for tests. */
export interface UpdateDependencies {
    executeInstall?: typeof executeInstall;
    processExecutor?: ProcessExecutor;
    npmLatest?: () => Promise<string>;
    /** Override bundled marketplace name listing (tests inject a frozen set). */
    listBundledPlugins?: () => string[];
    /** Read-only skill rows for the scope lock (tests inject fixture results). */
    checkSkills?: typeof checkSkills;
    /** Apply path for stale skill rows (tests inject). */
    updateSkills?: typeof updateSkills;
    /** Fetch implementation threaded into checkSkills/updateSkills (tests inject failures). */
    fetchFn?: typeof fetch;
}

/** `--check --json` envelope (R4); `exitCode` mirrors the process exit code so scripts read one value. */
export interface UpdateJsonEnvelope {
    scope: 'global' | 'project';
    check: true;
    rows: UpdateRow[];
    summary: { stale: number; current: number; unchecked: number; legacy: number; unavailable: number };
    exitCode: 0 | 1 | 2;
}

/**
 * Register the `superskill update` subcommand.
 */
export function registerUpdate(program: Command): void {
    program
        .command('update')
        .description(
            'Check installed plugins and lock-tracked skills for updates, or re-install stale marketplace plugins and skills',
        )
        .argument('[name]', 'Plugin or skill name to check or update (default: all known candidates)')
        .option('--check', 'Report stale plugins and skills without writing files', false)
        .option('--json', 'With --check, emit one JSON result envelope instead of text rows', false)
        .option('--targets <list>', 'Comma-separated target agents; plugins only (default: all configured)')
        .option(
            '--marketplace <locator>',
            'Override recorded marketplace locator; plugins only (path, GitHub URL, or owner/repo shorthand)',
        )
        .option(
            '--no-global',
            'Scan project-level manifests and the project skill lock instead of user-level global directories',
        )
        .action(async (name: string | undefined, options) => {
            try {
                const config = loadConfig();
                const resolved = resolveInstallTargets(options.targets, config.targets);
                if (resolved.botFiltered) {
                    echoError(
                        "Target 'grok-bot' is opt-in only: it is excluded from implicit selections — pass it explicitly via --targets grok-bot",
                    );
                }
                const targets = resolved.targets;
                const code = await executeUpdate(name, targets, {
                    check: options.check === true,
                    global: options.global !== false,
                    marketplacePath: options.marketplace as string | undefined,
                    json: options.json === true,
                });
                process.exit(code);
            } catch (err) {
                echo(`Error: ${err instanceof Error ? err.message : String(err)}`);
                process.exit(1);
            }
        });
}

/**
 * Discover plugin candidates, aggregate lock-tracked skill rows for the same scope, print
 * rows grouped by kind, and return the aggregate exit code. `--check` never writes. Mutating
 * mode re-installs stale marketplace plugins via {@link executeInstall}, applies stale skills
 * via `updateSkills(precheck)`, and prints the npm upgrade command once for stale bundled plugins.
 */
export async function executeUpdate(
    name: string | undefined,
    targets: readonly InstallTarget[],
    options: UpdateOptions,
    dependencies: UpdateDependencies = {},
): Promise<number> {
    // R4: the apply path writes progress to stdout, so --json is only valid with --check.
    if (options.json && !options.check) {
        throw new Error('superskill update --json requires --check (the apply path writes progress to stdout)');
    }
    if (name !== undefined) assertSafePathSegment(name, 'name');
    const scopeRoot = options.outputRoot ?? (options.global ? resolveHomeDir() : process.cwd());
    const homeDir = resolveHomeDir();
    // Skills mirror the manifest scope: project scope reads ./skills-lock.json, global scope
    // reads ~/.agents/.skill-lock.json (resolved through the homeDir seam).
    const skillCwd = options.outputRoot ?? process.cwd();
    const config = loadConfig();
    // grok-bot receipts live under the Sand data root (ADR-036), not the normal scope root.
    const botRequested = targets.includes('grok-bot');
    const botRoot = botRequested ? tryResolveSandRoot() : null;
    if (botRequested && botRoot === null) {
        echoError(
            `Unable to resolve a Grok Bot Sand data root (${BOT_SAND_DATA_ENV} or $HOME/sand-data) — skipping grok-bot manifest scan`,
        );
    }
    const execTargets = targets.filter((t): t is Target => t !== 'grok-bot');
    const listBundled = dependencies.listBundledPlugins ?? listBundledMarketplacePlugins;
    const knownPlugins = [
        ...new Set([
            ...collectCandidates(
                scopeRoot,
                config.plugins.map((entry) => entry.name),
                execTargets,
                listBundled,
            ),
            ...(botRoot !== null ? collectCandidates(botRoot.dataRoot, [], ['grok-bot'], () => []) : []),
        ]),
    ].sort(utf8Sort);
    const candidates = name !== undefined ? knownPlugins.filter((candidate) => candidate === name) : knownPlugins;

    // R2: plugins and skills share one namespace per scope — an explicit name must match
    // exactly one kind, and one matching neither is an error naming the value and the scopes.
    let skillNamesArg: string[] | undefined;
    let skillsActive = true;
    if (name !== undefined) {
        const scopeLock = options.global ? await readGlobalLock(process.env, homeDir) : await readLocalLock(skillCwd);
        const matchesSkill = sanitizeName(name) in scopeLock.skills;
        const matchesPlugin = knownPlugins.includes(name);
        const scopeLabel = options.global ? 'global' : 'project';
        if (matchesSkill && matchesPlugin) {
            throw new Error(
                `'${name}' matches both a plugin and a lock-tracked skill in the ${scopeLabel} scope; ` +
                    'plugins and skills share one namespace',
            );
        }
        if (!matchesSkill && !matchesPlugin) {
            const lockPath = options.global ? getGlobalLockPath(process.env, homeDir) : getLocalLockPath(skillCwd);
            throw new Error(
                `no plugin or skill named '${name}' in the ${scopeLabel} scope ` +
                    `(manifests: ${join(resolve(scopeRoot), '.superskill', 'manifests')}; skills lock: ${lockPath})`,
            );
        }
        skillsActive = matchesSkill;
        if (matchesSkill) skillNamesArg = [name];
    }
    const rows: UpdateRow[] = [];
    const marketplaceWork = new Map<string, Promise<MarketplaceUpstream | undefined>>();
    const marketplaceActions = new Map<string, MarketplaceInstallAction>();
    let bundledLatest: string | undefined;
    let bundledStale = false;
    const installImpl = dependencies.executeInstall ?? executeInstall;
    const npmLatest = dependencies.npmLatest ?? (() => fetchNpmLatest(dependencies.processExecutor));

    for (const candidate of candidates) {
        const manifests = [
            ...readCandidateManifests(scopeRoot, candidate, execTargets),
            ...(botRoot !== null ? readCandidateManifests(botRoot.dataRoot, candidate, ['grok-bot']) : []),
        ];
        if (manifests.length === 0) {
            rows.push({ kind: 'plugin', name: candidate, status: 'legacy' });
            continue;
        }
        for (const manifest of manifests) {
            if (manifest.channel === 'bundled') {
                try {
                    bundledLatest ??= await npmLatest();
                    const comparison = compareBundledVersion(candidate, manifest.upstreamVersion, bundledLatest);
                    rows.push({ ...comparison, target: manifest.target });
                    if (comparison.status === 'stale') bundledStale = true;
                } catch {
                    rows.push({
                        kind: 'plugin',
                        name: candidate,
                        status: 'unavailable',
                        channel: 'bundled',
                        target: manifest.target,
                        locator: NPM_PACKAGE,
                    });
                }
                continue;
            }
            const locator = options.marketplacePath ?? manifest.marketplaceLocator;
            if (!locator) {
                rows.push({
                    kind: 'plugin',
                    name: candidate,
                    status: 'unavailable',
                    channel: 'marketplace',
                    target: manifest.target,
                    locator: '',
                });
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
                rows.push({
                    kind: 'plugin',
                    name: candidate,
                    status: 'unavailable',
                    channel: 'marketplace',
                    target: manifest.target,
                    locator,
                });
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
            rows.push({ ...comparison, target: manifest.target });
            if (comparison.status === 'stale' && (isTarget(manifest.target) || manifest.target === 'grok-bot')) {
                const actionKey = JSON.stringify([candidate, locator]);
                const action = marketplaceActions.get(actionKey) ?? {
                    plugin: candidate,
                    locator,
                    targets: new Set<InstallTarget>(),
                };
                action.targets.add(manifest.target);
                if (manifest.target === 'grok-bot') {
                    // R7: thread the recorded materialization mode into the Bot
                    // reinstall; a receipt without it gets explicit reinstall
                    // guidance, never a guessed mode.
                    if (manifest.grokBot) action.botMaterialize = manifest.grokBot.materialize;
                }
                marketplaceActions.set(actionKey, action);
            }
        }
    }

    // R1: aggregate lock-tracked skill rows from the ADR-028 lock for the same scope after
    // the plugin rows; unchecked rows survive as-is and stay exit-neutral (R5).
    let skillCheckRows: SkillCheckRow[] = [];
    let skillRows: UpdateRow[] = [];
    let skillLockError: string | undefined;
    if (skillsActive) {
        const checkImpl = dependencies.checkSkills ?? checkSkills;
        const check = await checkImpl(skillNamesArg, {
            global: options.global,
            cwd: skillCwd,
            homeDir,
            env: process.env,
            ...(dependencies.fetchFn ? { fetchFn: dependencies.fetchFn } : {}),
        });
        skillCheckRows = check.rows;
        skillRows = check.rows.map(toSkillUpdateRow);
        if (!check.success && check.rows.length === 0) skillLockError = check.error ?? 'Failed to check skills';
    }

    const pluginResults = mergePluginUpdateRows(rows);
    const allRows = [...pluginResults, ...skillRows];
    // R5: one 0/1/2 contract across kinds — unavailable anywhere → 2, --check stale → 1.
    const exitCode = skillLockError !== undefined ? 2 : aggregateUpdateExit(allRows, options.check);

    if (options.json) {
        echo(JSON.stringify(buildUpdateEnvelope(options, allRows, exitCode), null, 2));
    } else {
        printGroupedRows(allRows);
    }

    if (skillLockError !== undefined) {
        echoError(skillLockError);
        return 2;
    }

    let skillApplyFailed = false;
    if (!options.check) {
        if (bundledStale) echo(NPM_UPGRADE);
        for (const action of marketplaceActions.values()) {
            const locator = options.marketplacePath ?? action.locator;
            const pluginRootOnly = options.marketplacePath === undefined && isPluginRootOnlyLocator(locator);
            let targets: InstallTarget[] = [...action.targets];
            let materialize: 'bridge' | 'full' | undefined;
            if (targets.includes('grok-bot')) {
                if (action.botMaterialize === undefined) {
                    // R4/R7: never guess the mode — a silent bridge reinstall would
                    // switch a full-mode catalog. Guide an explicit reinstall instead.
                    targets = targets.filter((target) => target !== 'grok-bot');
                    echoError(
                        `grok-bot: receipt for '${action.plugin}' has no recorded materialization mode — ` +
                            `reinstall explicitly: superskill install ${action.plugin} --targets grok-bot --materialize <bridge|full>`,
                    );
                } else {
                    materialize = action.botMaterialize;
                }
            }
            if (targets.length === 0) continue;
            await installImpl(action.plugin, targets, {
                marketplacePath: pluginRootOnly ? undefined : locator,
                pluginPath: pluginRootOnly ? locator : undefined,
                global: options.global,
                dryRun: false,
                verbose: false,
                outputRoot: options.outputRoot,
                materialize,
            });
        }

        // R3: apply stale skills with this run's check rows as precheck — hashes are computed
        // once; unchecked/unavailable rows are never reinstalled and keep their listed reasons.
        const staleCheckRows = skillCheckRows.filter((row) => row.status === 'stale');
        if (staleCheckRows.length > 0) {
            const updateImpl = dependencies.updateSkills ?? updateSkills;
            const apply = await updateImpl(
                staleCheckRows.map((row) => row.name),
                {
                    global: options.global,
                    cwd: skillCwd,
                    homeDir,
                    env: process.env,
                    precheck: staleCheckRows,
                    ...(dependencies.fetchFn ? { fetchFn: dependencies.fetchFn } : {}),
                },
            );
            for (const item of apply.updated) {
                if (item.updated) echo(`${item.name}: updated`);
                else if (item.status === 'current') echo(`${item.name}: up to date`);
                else echoError(`${item.name}: ${item.reason ?? 'update failed'}`);
            }
            // R3: a failed skill reinstall contributes to exit 1, as plugin failures do.
            skillApplyFailed = apply.updated.some((item) => item.status === 'failed' || item.status === 'unavailable');
        }
    }

    return !options.check && skillApplyFailed && exitCode !== 2 ? 1 : exitCode;
}

/** Map one checkSkills row onto the unified row model (R1). */
function toSkillUpdateRow(row: SkillCheckRow): UpdateRow {
    return {
        kind: 'skill',
        name: row.name,
        status: row.status,
        ...(row.reason !== undefined ? { reason: row.reason } : {}),
    };
}

/** Text rows grouped by kind: `Plugins:` first, then `Skills:` (R1). */
function printGroupedRows(rows: readonly UpdateRow[]): void {
    const plugins = rows.filter((row) => row.kind === 'plugin');
    const skills = rows.filter((row) => row.kind === 'skill');
    if (plugins.length > 0) {
        echo('Plugins:');
        for (const row of plugins) echo(formatUpdateRow(row));
    }
    if (skills.length > 0) {
        echo('Skills:');
        for (const row of skills) echo(formatUpdateRow(row));
    }
}

/** Build the R4 `--check --json` envelope. */
function buildUpdateEnvelope(
    options: UpdateOptions,
    rows: readonly UpdateRow[],
    exitCode: 0 | 1 | 2,
): UpdateJsonEnvelope {
    const count = (status: UpdateRowStatus): number => rows.filter((row) => row.status === status).length;
    return {
        scope: options.global ? 'global' : 'project',
        check: true,
        rows: [...rows],
        summary: {
            stale: count('stale'),
            current: count('current'),
            unchecked: count('unchecked'),
            legacy: count('legacy'),
            unavailable: count('unavailable'),
        },
        exitCode,
    };
}

interface MarketplaceUpstream {
    version: string;
    snapshot: ReturnType<typeof snapshotFiles>;
}

interface MarketplaceInstallAction {
    plugin: string;
    locator: string;
    targets: Set<InstallTarget>;
    /** Recorded grok-bot materialization mode from the Bot receipt (R7). */
    botMaterialize?: 'bridge' | 'full';
}

/** Resolve the Sand data root for Bot receipt scans; null when this host has none. */
function tryResolveSandRoot(): SandRootResolution | null {
    try {
        return resolveSandRoot({ sandData: process.env.SAND_DATA, homeDir: resolveHomeDir() });
    } catch {
        return null;
    }
}

function collectCandidates(
    scopeRoot: string,
    configured: string[],
    targets: readonly InstallTarget[],
    listBundled: () => string[],
): string[] {
    const names = new Set<string>();
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
    return [...names].sort(utf8Sort);
}

function listManifestPlugins(scopeRoot: string, targets: readonly InstallTarget[]): string[] {
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
    targets: readonly InstallTarget[],
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

/**
 * Render one update row for text output. Unavailable rows append the row's reason
 * after the locator when one is set; without a reason the line is byte-identical
 * to the pre-UpdateRow formatter.
 */
export function formatUpdateRow(row: UpdateRow): string {
    if (row.status === 'legacy') {
        return `${row.name}: installed before manifest support - reinstall to adopt`;
    }
    if (row.status === 'unavailable' || row.status === 'unchecked') {
        // Skill rows have no upstream locator; they name the status and reason directly.
        if (row.kind === 'skill') {
            return `${row.name}: ${row.status}: ${row.reason ?? 'unknown failure'}`;
        }
        const unavailable = `${row.name}: upstream unavailable (${row.locator ?? ''})`;
        return row.reason !== undefined ? `${unavailable}: ${row.reason}` : unavailable;
    }
    if (row.status === 'current') {
        return row.installedVersion !== undefined
            ? `${row.name}: ${row.installedVersion} up to date`
            : `${row.name}: up to date`;
    }
    if (row.channel === 'bundled') {
        return `${row.name}: stale: superskill <${row.upstreamVersion}> available (installed <${row.installedVersion}>)`;
    }
    const n = row.changedPaths?.length ?? 0;
    const delta =
        row.installedVersion && row.upstreamVersion ? `${row.installedVersion} → ${row.upstreamVersion}` : 'changed';
    if (n === 0) return `${row.name}: stale: ${delta}`;
    const paths = (row.changedPaths ?? []).join(', ');
    return `${row.name}: stale: ${delta} (${n} file(s) changed: ${paths})`;
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
