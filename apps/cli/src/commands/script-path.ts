import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { assertSafePathSegment } from '@gobing-ai/superskill-core';
import { echo, echoError } from '@gobing-ai/ts-utils';
import type { Command } from 'commander';

/**
 * `superskill script path <plugin> <rel>` — resolve a staged plugin entrypoint to an absolute
 * filesystem path for command substitution (`$(superskill script path ...)`).
 *
 * Sibling to `script run`: where `script run` executes an in-binary ScriptRunner (exit 0/1
 * validation), `script path` resolves a staged entrypoint file so the caller can invoke it
 * directly via shebang. Resolution searches project `.agents/scripts/<plugin>/` first, then
 * global `~/.agents/scripts/<plugin>/`. Staging (task 0090) puts the files at these roots.
 *
 * Fail-closed: unlike `script run` (which fails open on unknown ids — version skew), a missing
 * staged path breaks the caller's next step so we exit 2. Usage errors exit 1.
 */

/** Describes where a resolved script path was found. */
type ScriptSource = 'project' | 'global';

/** Successful resolution: absolute path + source. */
export interface ResolvedScriptPath {
    path: string;
    source: ScriptSource;
}

/** Options controlling resolution. */
export interface ScriptPathOptions {
    /** Plugin name segment (e.g. "cc"). */
    plugin: string;
    /** Relative path from the plugin's scripts root (e.g. "anti-hallucination/validate_response.ts"). */
    rel: string;
    /** Override homedir for tests. */
    home?: string;
    /** Override project root for tests. */
    projectRoot?: string;
    /** Force global resolution only (skip project root). */
    forceGlobal?: boolean;
    /** Force project resolution only (skip global root). */
    forceProject?: boolean;
}

/**
 * Resolve a staged plugin entrypoint to an absolute filesystem path.
 *
 * Search order:
 * 1. Project agents root: `<project>/.agents/scripts/<plugin>/<rel>`
 * 2. Global agents root: `~/.agents/scripts/<plugin>/<rel>`
 *
 * Returns the first existing file, or null when not found.
 * Rejects `rel` containing `..` segments or absolute paths.
 */
export function resolveScriptPath(opts: ScriptPathOptions): ResolvedScriptPath | null {
    assertSafePathSegment(opts.plugin, 'plugin name');

    // Reject path traversal and absolute paths in rel
    if (opts.rel.startsWith('/') || opts.rel.includes('..')) {
        throw new UsageError(
            `Invalid relative path: "${opts.rel}". Must be a plain relative path without ".." segments.`,
        );
    }

    const home = opts.home ?? homedir();
    const projectRoot = opts.projectRoot ?? process.cwd();

    const candidates: Array<{ path: string; source: ScriptSource }> = [];

    if (!opts.forceGlobal) {
        candidates.push({
            path: join(projectRoot, '.agents', 'scripts', opts.plugin, opts.rel),
            source: 'project',
        });
    }

    if (!opts.forceProject) {
        candidates.push({
            path: join(home, '.agents', 'scripts', opts.plugin, opts.rel),
            source: 'global',
        });
    }

    for (const candidate of candidates) {
        if (existsSync(candidate.path)) {
            return candidate;
        }
    }

    return null;
}

/** Thrown for usage/input errors (exit 1). */
export class UsageError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'UsageError';
    }
}

/**
 * Run the script path CLI action with an injectable exit function for tests.
 */
export function runScriptPathAction(
    plugin: string,
    rel: string,
    options: { json?: boolean; global?: boolean; project?: boolean },
    exitFn: (code: number) => never,
    overrides?: { home?: string; projectRoot?: string },
): void {
    let result: ResolvedScriptPath | null;
    try {
        result = resolveScriptPath({
            plugin,
            rel,
            forceGlobal: options.global,
            forceProject: options.project,
            home: overrides?.home,
            projectRoot: overrides?.projectRoot,
        });
    } catch (err) {
        if (err instanceof UsageError) {
            if (options.json) {
                echo(JSON.stringify({ error: 'invalid_args', message: err.message }));
            }
            echoError(err.message);
            exitFn(1);
        }
        throw err;
    }

    if (!result) {
        const searched: string[] = [];
        if (!options.global) searched.push('<project>/.agents/scripts');
        if (!options.project) searched.push('~/.agents/scripts');
        const msg = `Script not found: "${plugin}/${rel}". Searched: ${searched.join(', ')}.`;
        if (options.json) {
            echo(JSON.stringify({ error: 'not_found', plugin, rel, searched }));
        }
        echoError(msg);
        exitFn(2);
    }

    if (options.json) {
        echo(JSON.stringify({ plugin, rel, path: result.path, source: result.source }));
    } else {
        echo(result.path);
    }
    exitFn(0);
}

/**
 * Register `superskill script path <plugin> <rel>` on the program.
 * Attaches to the existing `script` group (created by `registerScriptRun`).
 * @param ci  Inject the exit function for tests — defaults to `process.exit`.
 */
export function registerScriptPath(program: Command, ci?: { exit(code: number): never }): void {
    const exitFn =
        ci?.exit ??
        ((code: number) => {
            process.exit(code);
        });
    // Look up the existing `script` group or create it if `registerScriptRun` wasn't called.
    let group = program.commands.find((c) => c.name() === 'script');
    if (!group) {
        group = program.command('script').description('Plugin script utilities (run, path)');
    }

    group
        .command('path <plugin> <rel>')
        .description('Resolve a staged plugin entrypoint to an absolute path (for command substitution)')
        .option('--json', 'Output as JSON object instead of plain path')
        .option('--global', 'Resolve only from the global scripts root (~/.agents/scripts/)')
        .option('--project', 'Resolve only from the project scripts root')
        .action((plugin: string, rel: string, options: { json?: boolean; global?: boolean; project?: boolean }) => {
            runScriptPathAction(plugin, rel, options, exitFn);
        });
}
