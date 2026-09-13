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
    type ResolvedPlugin,
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
    summary: UpdateSummaryCounts;
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
        .option('--json', 'Emit one JSON result envelope instead of text rows (requires --check)', false)
        .option('--targets <list>', 'Comma-separated target agents; plugins only (default: all configured)')
        .option(
            '--marketplace <locator>',
            'Override recorded marketplace locator; plugins only (path, GitHub URL, or owner/repo shorthand)',
        )
        .option(
            '--no-global',
            'Scan project-level manifests and the project skill lock instead of user-level global directories',
        )
        .addHelpText(
            'after',
            '\nExit codes: 0 nothing stale, 1 stale under --check or an apply failure, 2 an unavailable upstream.',
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
    const marketplaceWork = new Map<string, Promise<MarketplaceUpstream>>();
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
                } catch (err) {
                    rows.push({
                        kind: 'plugin',
                        name: candidate,
                        status: 'unavailable',
                        channel: 'bundled',
                        target: manifest.target,
                        locator: NPM_PACKAGE,
                        reason:
                            err instanceof Error && err.message.length > 0 ? err.message : 'npm registry lookup failed',
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
                    reason: 'no marketplace locator recorded in the install manifest',
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
            if (!upstream.ok) {
                rows.push({
                    kind: 'plugin',
                    name: candidate,
                    status: 'unavailable',
                    channel: 'marketplace',
                    target: manifest.target,
                    locator,
                    reason: upstream.reason,
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
            rows.push({
                ...comparison,
                target: manifest.target,
                ...(upstream.versionMismatch !== undefined ? { versionMismatch: upstream.versionMismatch } : {}),
            });
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
        // R8: check output ends with per-status counts and the one next command; an empty
        // candidate set has no groups and no statuses to count.
        if (options.check && allRows.length > 0) echo(formatUpdateSummary(allRows));
    }

    if (skillLockError !== undefined) {
        echoError(skillLockError);
        return 2;
    }

    let skillApplyFailed = false;
    if (!options.check) {
        if (bundledStale) echo(`To upgrade superskill and its bundled plugins, run: ${NPM_UPGRADE}`);
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

/** Per-status counts over a row set; shared by the text footer and the `--json` envelope summary. */
export interface UpdateSummaryCounts {
    stale: number;
    current: number;
    unchecked: number;
    legacy: number;
    unavailable: number;
}

/** Count rows per status — the single source for both summary surfaces (R8). */
export function summarizeUpdateRows(rows: readonly UpdateRow[]): UpdateSummaryCounts {
    const counts: UpdateSummaryCounts = { stale: 0, current: 0, unchecked: 0, legacy: 0, unavailable: 0 };
    for (const row of rows) counts[row.status] += 1;
    return counts;
}

/**
 * Text summary footer (R8): counts every status present and, when at least one row is
 * stale, names the one next command — bare `superskill update`.
 */
export function formatUpdateSummary(rows: readonly UpdateRow[]): string {
    const counts = summarizeUpdateRows(rows);
    const parts: string[] = [];
    if (counts.stale > 0) parts.push(`${counts.stale} stale`);
    if (counts.current > 0) parts.push(`${counts.current} up to date`);
    if (counts.unchecked > 0) parts.push(`${counts.unchecked} not checked`);
    if (counts.legacy > 0) parts.push(`${counts.legacy} legacy`);
    if (counts.unavailable > 0) parts.push(`${counts.unavailable} unavailable`);
    const run = counts.stale > 0 ? ' Run: superskill update' : '';
    return `Summary: ${parts.join(', ')}.${run}`;
}

/** Build the R4 `--check --json` envelope. */
function buildUpdateEnvelope(
    options: UpdateOptions,
    rows: readonly UpdateRow[],
    exitCode: 0 | 1 | 2,
): UpdateJsonEnvelope {
    return {
        scope: options.global ? 'global' : 'project',
        check: true,
        rows: [...rows],
        summary: summarizeUpdateRows(rows),
        exitCode,
    };
}

/** Successful upstream resolution; `version` keeps marketplace-first precedence. */
interface ResolvedMarketplaceUpstream {
    ok: true;
    version: string;
    snapshot: ReturnType<typeof snapshotFiles>;
    /** Set when marketplace.json and plugin.json declare different versions (R4). */
    versionMismatch?: { marketplace: string; pluginJson: string };
}

/** Failed upstream resolution; `reason` surfaces on the unavailable row (R5). */
interface FailedMarketplaceUpstream {
    ok: false;
    reason: string;
}

type MarketplaceUpstream = ResolvedMarketplaceUpstream | FailedMarketplaceUpstream;

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

/**
 * Resolve one marketplace locator to its current upstream snapshot (R4/R5). Failures are
 * typed and carry a specific reason for the unavailable row: a missing locator directory,
 * a manifest/parse failure, or a network/registry failure. The compare version keeps
 * marketplace-first precedence; when the marketplace entry and plugin.json declare
 * different versions, `versionMismatch` names both without changing which one wins.
 */
async function resolveMarketplaceUpstream(plugin: string, locator: string): Promise<MarketplaceUpstream> {
    const fail = (reason: string): FailedMarketplaceUpstream => ({ ok: false, reason });
    const cause = (err: unknown, fallback: string): string =>
        err instanceof Error && err.message.length > 0 ? err.message : fallback;
    try {
        if (!isRemoteMarketplaceLocator(locator) && isPluginRootOnlyLocator(locator)) {
            const version = readPluginJsonVersion(locator);
            if (!version) return fail(`plugin.json at '${locator}' declares no version`);
            const files = listRegularFilesUnder(locator);
            return { ok: true, version, snapshot: snapshotFiles(locator, files) };
        }
        let marketplacePath = locator;
        if (isRemoteMarketplaceLocator(locator)) {
            try {
                const remote = await resolveRemoteMarketplace(locator);
                marketplacePath = remote.root;
            } catch (err) {
                return fail(cause(err, 'marketplace fetch failed'));
            }
        } else if (!existsSync(resolve(locator))) {
            // R21: a gone local locator directory is named as such on the row.
            return fail('locator path missing');
        }
        let resolved: ResolvedPlugin | null;
        try {
            resolved = resolvePlugin(marketplacePath, plugin);
        } catch (err) {
            return fail(cause(err, 'marketplace manifest unreadable'));
        }
        if (!resolved) return fail(`plugin '${plugin}' not found in the marketplace manifest`);
        const marketplaceVersion = readMarketplacePluginVersion(resolved.marketplaceRoot, plugin);
        const pluginJsonVersion = readPluginJsonVersion(resolved.pluginRoot);
        const version = marketplaceVersion ?? pluginJsonVersion;
        if (!version) return fail(`no version declared for plugin '${plugin}'`);
        const files = listRegularFilesUnder(resolved.pluginRoot);
        return {
            ok: true,
            version,
            snapshot: snapshotFiles(resolved.pluginRoot, files),
            ...(marketplaceVersion !== undefined &&
            pluginJsonVersion !== undefined &&
            marketplaceVersion !== pluginJsonVersion
                ? { versionMismatch: { marketplace: marketplaceVersion, pluginJson: pluginJsonVersion } }
                : {}),
        };
    } catch (err) {
        return fail(cause(err, 'upstream lookup failed'));
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

/** Text rows name at most this many changed paths; longer lists get `+N more` (R11). */
const MAX_TEXT_CHANGED_PATHS = 5;

/** `note: …` suffix naming both sides of a marketplace.json/plugin.json disagreement (R9). */
function declarationNote(row: UpdateRow): string {
    const mismatch = row.versionMismatch;
    return mismatch !== undefined
        ? ` (note: marketplace.json declares ${mismatch.marketplace}, plugin.json declares ${mismatch.pluginJson})`
        : '';
}

/** Version delta for a marketplace stale row; equal versions are content drift (R8). */
function staleDelta(row: UpdateRow): string {
    if (row.installedVersion === undefined || row.upstreamVersion === undefined) return 'changed';
    if (row.installedVersion === row.upstreamVersion)
        return `content changed, version ${row.installedVersion} unchanged`;
    return `${row.installedVersion} → ${row.upstreamVersion}`;
}

/**
 * Render one update row for text output. Equal installed/upstream versions on a stale row
 * are named as content drift; a version bump keeps the `<old> → <new>` form. Text caps the
 * changed-path list at {@link MAX_TEXT_CHANGED_PATHS} entries with `+N more` — the row and
 * the `--json` envelope always carry every path. Merged rows with staleTargets append
 * `[stale on: <targets>]`; unavailable rows append their cause after the locator.
 */
export function formatUpdateRow(row: UpdateRow): string {
    if (row.status === 'legacy') {
        return `${row.name}: installed before manifest support - run \`superskill install ${row.name}\` to adopt`;
    }
    if (row.status === 'unavailable' || row.status === 'unchecked') {
        // Skill rows have no upstream locator; they name the status and reason directly.
        if (row.kind === 'skill') {
            return `${row.name}: ${row.status}: ${row.reason ?? 'unknown failure'}`;
        }
        const head = row.locator
            ? `${row.name}: upstream unavailable (${row.locator})`
            : `${row.name}: upstream unavailable`;
        return row.reason !== undefined ? `${head}: ${row.reason}` : head;
    }
    if (row.status === 'current') {
        const head =
            row.installedVersion !== undefined
                ? `${row.name}: ${row.installedVersion} up to date`
                : `${row.name}: up to date`;
        return `${head}${declarationNote(row)}`;
    }
    if (row.channel === 'bundled') {
        return `${row.name}: stale: superskill <${row.upstreamVersion}> available (installed <${row.installedVersion}>)`;
    }
    const staleTargets =
        row.staleTargets !== undefined && row.staleTargets.length > 0
            ? ` [stale on: ${row.staleTargets.join(', ')}]`
            : '';
    const n = row.changedPaths?.length ?? 0;
    if (n === 0) return `${row.name}: stale: ${staleDelta(row)}${staleTargets}${declarationNote(row)}`;
    const paths = row.changedPaths ?? [];
    const shown = paths.slice(0, MAX_TEXT_CHANGED_PATHS);
    const more = paths.length > shown.length ? ` +${paths.length - shown.length} more` : '';
    return `${row.name}: stale: ${staleDelta(row)} (${n} files changed: ${shown.join(', ')}${more})${staleTargets}${declarationNote(row)}`;
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
