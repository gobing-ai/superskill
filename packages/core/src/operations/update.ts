import type { InstallSnapshot } from './install-manifest';

/** Outcome of one plugin's update comparison. */
export type PluginUpdateStatus = 'stale' | 'current' | 'legacy' | 'unavailable';

/** One deterministic row in an update check or mutating run. */
export interface PluginUpdateResult {
    plugin: string;
    status: PluginUpdateStatus;
    channel?: 'bundled' | 'marketplace';
    installedVersion?: string;
    upstreamVersion?: string;
    changedPaths?: string[];
    locator?: string;
}

/** Aggregated comparison for a candidate set. */
export interface UpdateCheckResult {
    results: PluginUpdateResult[];
    exitCode: 0 | 1 | 2;
}

/**
 * UTF-8-byte-sorted relative paths whose per-file hashes differ between two snapshots.
 *
 * @param recorded Previously stored path → hash map.
 * @param current Fresh upstream path → hash map.
 */
export function diffChangedPaths(
    recorded: Readonly<Record<string, string>>,
    current: Readonly<Record<string, string>>,
): string[] {
    const names = new Set([...Object.keys(recorded), ...Object.keys(current)]);
    const changed: string[] = [];
    for (const name of names) {
        if (recorded[name] !== current[name]) changed.push(name);
    }
    return changed.sort((a, b) => Buffer.compare(Buffer.from(a, 'utf-8'), Buffer.from(b, 'utf-8')));
}

/**
 * Compare a recorded marketplace manifest against a freshly resolved upstream snapshot.
 * Version is compared first; equal versions fall through to the upstream canonical hash.
 *
 * @param plugin Plugin id (safe path identity, never from untrusted JSON).
 * @param recordedVersion Version stored at install.
 * @param recordedUpstream Snapshot stored at install.
 * @param currentVersion Version currently advertised by the locator.
 * @param currentUpstream Fresh source snapshot.
 */
export function compareMarketplaceManifest(
    plugin: string,
    recordedVersion: string,
    recordedUpstream: InstallSnapshot,
    currentVersion: string,
    currentUpstream: InstallSnapshot,
    locator?: string,
): PluginUpdateResult {
    const changedPaths = diffChangedPaths(recordedUpstream.files, currentUpstream.files);
    if (recordedVersion !== currentVersion || recordedUpstream.canonicalHash !== currentUpstream.canonicalHash) {
        return {
            plugin,
            status: 'stale',
            channel: 'marketplace',
            installedVersion: recordedVersion,
            upstreamVersion: currentVersion,
            changedPaths,
            ...(locator !== undefined ? { locator } : {}),
        };
    }
    return {
        plugin,
        status: 'current',
        channel: 'marketplace',
        installedVersion: recordedVersion,
        upstreamVersion: currentVersion,
        ...(locator !== undefined ? { locator } : {}),
    };
}

/**
 * Compare a bundled-channel recorded version against the latest published npm version.
 *
 * @param plugin Plugin id.
 * @param recordedVersion Version stored at install (`cliVersion`).
 * @param latestVersion Result of `npm view @gobing-ai/superskill version`.
 */
export function compareBundledVersion(
    plugin: string,
    recordedVersion: string,
    latestVersion: string,
): PluginUpdateResult {
    if (recordedVersion !== latestVersion) {
        return {
            plugin,
            status: 'stale',
            channel: 'bundled',
            installedVersion: recordedVersion,
            upstreamVersion: latestVersion,
        };
    }
    return {
        plugin,
        status: 'current',
        channel: 'bundled',
        installedVersion: recordedVersion,
        upstreamVersion: latestVersion,
    };
}

/**
 * Collapse per-target rows into one row per plugin. Rank is stale > unavailable >
 * current > legacy so a mixed-channel plugin still re-installs. {@link buildUpdateCheckResult}
 * computes the exit code from the unmerged rows so a sibling unavailable still yields 2.
 *
 * @param rows Rows that may repeat a plugin across targets.
 */
export function mergePluginUpdateRows(rows: readonly PluginUpdateResult[]): PluginUpdateResult[] {
    const rank: Record<PluginUpdateStatus, number> = {
        stale: 3,
        unavailable: 2,
        current: 1,
        legacy: 0,
    };
    const byPlugin = new Map<string, PluginUpdateResult>();
    for (const row of rows) {
        const existing = byPlugin.get(row.plugin);
        if (!existing) {
            byPlugin.set(row.plugin, {
                ...row,
                changedPaths: row.changedPaths ? [...row.changedPaths] : undefined,
            });
            continue;
        }
        const next: PluginUpdateResult = rank[row.status] >= rank[existing.status] ? { ...row } : { ...existing };
        const paths = new Set([...(existing.changedPaths ?? []), ...(row.changedPaths ?? [])]);
        if (paths.size > 0) {
            next.changedPaths = [...paths].sort((a, b) =>
                Buffer.compare(Buffer.from(a, 'utf-8'), Buffer.from(b, 'utf-8')),
            );
        }
        if (rank[row.status] >= rank[existing.status]) {
            next.installedVersion = row.installedVersion ?? existing.installedVersion;
            next.upstreamVersion = row.upstreamVersion ?? existing.upstreamVersion;
            next.locator = row.locator ?? existing.locator;
            next.channel = row.channel ?? existing.channel;
        }
        byPlugin.set(row.plugin, next);
    }
    return [...byPlugin.values()].sort((a, b) =>
        Buffer.compare(Buffer.from(a.plugin, 'utf-8'), Buffer.from(b.plugin, 'utf-8')),
    );
}

/**
 * Aggregate exit code: any unavailable → 2; else check-mode stale → 1; else 0.
 * Legacy/current rows never fail the command.
 *
 * @param results Merged per-plugin rows.
 * @param checkMode When false, stale rows do not force exit 1 (mutating mode exits 0 after action).
 */
export function aggregateUpdateExit(results: readonly PluginUpdateResult[], checkMode: boolean): 0 | 1 | 2 {
    if (results.some((row) => row.status === 'unavailable')) return 2;
    if (checkMode && results.some((row) => row.status === 'stale')) return 1;
    return 0;
}

/**
 * Build the structured check result from merged rows.
 *
 * @param results Merged per-plugin rows.
 * @param checkMode Whether `--check` is active.
 */
export function buildUpdateCheckResult(results: readonly PluginUpdateResult[], checkMode: boolean): UpdateCheckResult {
    const merged = mergePluginUpdateRows(results);
    return { results: merged, exitCode: aggregateUpdateExit(results, checkMode) };
}
