import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { assertSafePathSegment } from '@gobing-ai/superskill-core';
import { echo, echoError } from '@gobing-ai/ts-utils';
import type { Command } from 'commander';
import { diffScriptFiles, isCleanDiff, readScriptStamp, snapshotScriptRootFiles } from '../script-stamp';
import { resolveHomeDir } from './install';
import { UsageError } from './script-path';

/**
 * `superskill script verify <plugin> [--project|--global] [--json]` — check a staged plugin script
 * tree against the install stamp written beside it (task 0149 R3).
 *
 * Scope selection picks ONE complete tree: the project scripts root when that plugin directory
 * exists, otherwise the global one — the two roots are never merged (a per-file union would hide
 * exactly the skew this command exists to find). An explicit `--project` / `--global` has no
 * fallback: a missing root is reported, never silently redirected to the other scope.
 *
 * Exit codes: 0 clean, 2 any verification failure (drift, missing root/stamp, invalid stamp,
 * unreadable staged files), 1 usage error (conflicting scope flags, unsafe plugin name).
 */

/** Which scripts root a verification ran against. */
export type ScriptVerifySource = 'project' | 'global';

/** Outcome of one verification. `status` is the machine contract; the arrays are the evidence. */
export type ScriptVerifyStatus = 'ok' | 'drift' | 'missing_root' | 'missing_stamp' | 'invalid_stamp' | 'unreadable';

/** JSON result of `script verify --json`; arrays are empty whenever no valid baseline was read. */
export interface ScriptVerifyResult {
    plugin: string;
    source: ScriptVerifySource | null;
    status: ScriptVerifyStatus;
    added: string[];
    removed: string[];
    changed: string[];
    /**
     * Filesystem message naming the file that could not be read. Present only when `status` is
     * `unreadable` — the baseline is usable, the tree it is compared against is not.
     */
    error?: string;
}

/** Options controlling scope selection. `project`/`global` are mutually exclusive. */
export interface ScriptVerifyOptions {
    /** Force the project scripts root; no fallback when it is absent. */
    project?: boolean;
    /** Force the global scripts root; no fallback when it is absent. */
    global?: boolean;
    /** Override homedir for tests. */
    home?: string;
    /** Override project root for tests. */
    projectRoot?: string;
}

/** Selected scripts root plus the scope label reported in JSON/human output. */
export interface ScriptVerifySelection {
    source: ScriptVerifySource;
    root: string;
}

/**
 * Resolve the single scripts root to verify. Project directory existence wins by default; an
 * explicit scope flag returns that root even when it does not exist, so the caller reports
 * `missing_root` instead of verifying the other scope.
 *
 * @param plugin Plugin name segment (already validated by the caller).
 * @param opts Scope flags plus test overrides.
 * @returns The selected root, or null when neither default root exists.
 */
export function selectScriptVerifyRoot(plugin: string, opts: ScriptVerifyOptions = {}): ScriptVerifySelection | null {
    const projectRoot = join(opts.projectRoot ?? process.cwd(), '.agents', 'scripts', plugin);
    const globalRoot = join(opts.home ?? resolveHomeDir(), '.agents', 'scripts', plugin);
    if (opts.project) return { source: 'project', root: projectRoot };
    if (opts.global) return { source: 'global', root: globalRoot };
    if (existsSync(projectRoot)) return { source: 'project', root: projectRoot };
    if (existsSync(globalRoot)) return { source: 'global', root: globalRoot };
    return null;
}

/**
 * Verify one plugin's staged scripts against its stamp.
 *
 * @param plugin Plugin name segment (already validated by the caller).
 * @param opts Scope flags plus test overrides.
 */
export function verifyScriptStamp(plugin: string, opts: ScriptVerifyOptions = {}): ScriptVerifyResult {
    const empty = { added: [], removed: [], changed: [] };
    const selection = selectScriptVerifyRoot(plugin, opts);
    if (!selection) {
        return { plugin, source: null, status: 'missing_root', ...empty };
    }
    const { source, root } = selection;
    if (!existsSync(root)) {
        return { plugin, source, status: 'missing_root', ...empty };
    }
    const read = readScriptStamp(root, plugin);
    if (read.status === 'missing') {
        return { plugin, source, status: 'missing_stamp', ...empty };
    }
    if (read.status === 'invalid') {
        return { plugin, source, status: 'invalid_stamp', ...empty };
    }
    // The fresh snapshot reads every staged file, so a filesystem failure (unreadable file, a file
    // removed between the walk and the read) belongs to the verification contract — `unreadable`
    // with its exit code and JSON result — not to the caller's stack.
    let current: Record<string, string>;
    try {
        current = snapshotScriptRootFiles(root);
    } catch (err) {
        return {
            plugin,
            source,
            status: 'unreadable',
            ...empty,
            error: err instanceof Error ? err.message : String(err),
        };
    }
    const diff = diffScriptFiles(read.stamp.files, current);
    return { plugin, source, status: isCleanDiff(diff) ? 'ok' : 'drift', ...diff };
}

/**
 * Run the `script verify` action with an injectable exit function for tests.
 *
 * @param plugin Plugin name to verify.
 * @param options Commander options bag.
 * @param exitFn Process exit (throws in tests).
 * @param overrides Home / project-root overrides for tests.
 */
export function runScriptVerifyAction(
    plugin: string,
    options: { json?: boolean; global?: boolean; project?: boolean },
    exitFn: (code: number) => never,
    overrides?: { home?: string; projectRoot?: string },
): void {
    try {
        assertSafePathSegment(plugin, 'plugin name');
        if (options.global === true && options.project === true) {
            throw new UsageError('Conflicting scope flags: --project and --global are mutually exclusive.');
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (options.json) echo(JSON.stringify({ error: 'invalid_args', message: msg }));
        echoError(msg);
        exitFn(1);
    }

    const result = verifyScriptStamp(plugin, {
        project: options.project === true,
        global: options.global === true,
        home: overrides?.home,
        projectRoot: overrides?.projectRoot,
    });

    if (options.json) echo(JSON.stringify(result));
    if (result.status === 'ok') {
        if (!options.json) echo(`Script stamp verified: '${plugin}' (${result.source})`);
        exitFn(0);
    }

    // Failure diagnostics go to stderr in both modes, so stdout stays either a clean JSON result or
    // a clean human line (same split as `script path`).
    const scope = result.source ?? 'default';
    const reason =
        result.status === 'missing_root'
            ? 'no staged plugin script root'
            : result.status === 'missing_stamp'
              ? 'no script stamp'
              : result.status === 'invalid_stamp'
                ? 'an invalid script stamp'
                : result.status === 'unreadable'
                  ? 'staged script files could not be read'
                  : `${result.changed.length} changed, ${result.added.length} added, ${result.removed.length} removed`;
    echoError(`Script verification failed for '${plugin}': ${reason} (${scope} scope).`);
    if (result.error !== undefined) echoError(`  ${result.error}`);
    for (const rel of result.changed) echoError(`  changed ${rel}`);
    for (const rel of result.added) echoError(`  added ${rel}`);
    for (const rel of result.removed) echoError(`  removed ${rel}`);
    echoError(
        result.status === 'drift'
            ? `Reinstall to refresh the staged scripts: superskill install ${plugin}`
            : result.status === 'unreadable'
              ? `Fix the unreadable staged file, or reinstall: superskill install ${plugin}`
              : `Reinstall to write a usable stamp: superskill install ${plugin}`,
    );
    exitFn(2);
}

/**
 * Register `superskill script verify <plugin>` on the program. Attaches to the existing `script`
 * group (created by `registerScriptRun`).
 * @param ci  Inject the exit function for tests — defaults to `process.exit`.
 */
export function registerScriptVerify(program: Command, ci?: { exit(code: number): never }): void {
    const exitFn = ci?.exit ?? process.exit;
    const existing = program.commands.find((c) => c.name() === 'script');
    const group = existing ?? program.command('script').description('Plugin script utilities (run, path, verify)');

    group
        .command('verify <plugin>')
        .description('Verify staged plugin scripts against the install stamp beside them')
        .option('--json', 'Output as JSON object')
        .option('--global', 'Verify only the global scripts root (~/.agents/scripts/)')
        .option('--project', 'Verify only the project scripts root')
        .action((plugin: string, options: { json?: boolean; global?: boolean; project?: boolean }) => {
            runScriptVerifyAction(plugin, options, exitFn);
        });
}
