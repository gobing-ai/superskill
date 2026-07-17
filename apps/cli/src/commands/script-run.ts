import { readFileSync } from 'node:fs';
import { echo, echoError } from '@gobing-ai/ts-utils';
import type { Command } from 'commander';
import { validateResponseText } from '../../../../plugins/cc/scripts/anti-hallucination/validate_response';
import { cliVersion } from '../version';

/**
 * Non-hook script dispatcher (task 0087) — the runtime command skill docs reference.
 *
 * Sibling to `hook-run.ts`: where `hook run` serves host hook events, `script run`
 * serves agent-invocable validation/utility CLIs whose source lives under
 * `plugins/<plugin>/scripts/`. Install targets never receive script files — the
 * CLI deep-imports the module at build time (ADR-022) and `bun build --compile`
 * bundles it, so `superskill script run cc validate-response` works from any cwd
 * on any machine with superskill on PATH.
 *
 * Unknown `<plugin>/<script-id>` fails **open** (exit 0 + stderr warning naming the
 * id and the installed CLI version): an unknown id is plugin/CLI version skew, not
 * a policy violation — blocking would turn a stale CLI into broken agent workflows.
 */

/** Input handed to a script runner. */
export interface ScriptRunInput {
    /** Piped stdin payload; `undefined` when interactive (TTY) or empty. */
    stdinText?: string;
    /** Process environment (runners read their config from env vars). */
    env: NodeJS.ProcessEnv;
}

/** Result a script runner returns: exact stdout bytes + process exit code. */
export interface ScriptRunResult {
    stdout: string;
    exitCode: number;
    stderr?: string;
}

/** A registered non-hook script: pure logic in, stdout + exit code out. */
export interface ScriptRunner {
    run(input: ScriptRunInput): ScriptRunResult;
}

// ── cc/validate-response ─────────────────────────────────────────────────────

/**
 * Thin adapter over the plugin's standalone validation CLI. Preserves
 * `validate_response.ts main()`'s contract byte-for-byte:
 * `RESPONSE_TEXT` env first, else stdin; empty input is a pass; stdout is the
 * `JSON.stringify({ok, reason, issues?})` result line; exit 0/1 (validation-CLI
 * semantics, NOT the hook exit-2 block signal).
 */
const ccValidateResponse: ScriptRunner = {
    run({ env, stdinText }) {
        const text = env.RESPONSE_TEXT ?? stdinText;
        const result = validateResponseText(text);
        return { stdout: JSON.stringify(result), exitCode: result.ok ? 0 : 1 };
    },
};

// ── Registry + dispatcher ────────────────────────────────────────────────────

const SCRIPT_RUNNERS: Record<string, ScriptRunner> = {
    'cc/validate-response': ccValidateResponse,
};

/** Resolve and run a script runner, writing its stdout and returning the exit code. */
export function scriptRun(plugin: string, scriptId: string, input: ScriptRunInput): number {
    const runner = SCRIPT_RUNNERS[`${plugin}/${scriptId}`];
    if (!runner) {
        // Fail open: an unknown script id signals plugin/CLI version skew (the skill doc
        // references a script the running CLI doesn't recognize), not a policy violation.
        // A validator that cannot run must not hard-fail the agent's workflow.
        echoError(
            `Warning: unknown script '${plugin} ${scriptId}' (superskill ${cliVersion}). ` +
                `This usually means the skill expects a newer CLI than the one on PATH. ` +
                `Known scripts: ${Object.keys(SCRIPT_RUNNERS).join(', ')}. Failing open (exit 0).`,
        );
        return 0;
    }
    const result = runner.run(input);
    // WHY conditional: echo('') writes '\n' (writeLine always appends a newline). A bare
    // newline on stdout is noise for callers parsing the result JSON. Only emit when non-empty.
    if (result.stdout) echo(result.stdout);
    if (result.stderr) echoError(result.stderr);
    return result.exitCode;
}

/** TTY-guarded default stdin reader — returns undefined on interactive terminals so the CLI never blocks waiting for EOF. */
function readStdinGuarded(): string | undefined {
    if (process.stdin.isTTY) return undefined;
    try {
        const input = readFileSync(0, 'utf-8') as string;
        return input.trim().length > 0 ? input : undefined;
    } catch {
        return undefined;
    }
}

/**
 * Register `superskill script run <plugin> <script-id>` on the program.
 * Creates the `script` parent group (mirroring how `hook.ts` creates the `hook`
 * group and attaches `registerHookRun`). `readInput` is injectable for tests.
 */
export function registerScriptRun(program: Command, readInput?: () => string | undefined): void {
    const group = program.command('script').description('Run registered non-hook plugin scripts');
    // Bare `superskill script` (no subcommand) lists registered ids instead of erroring —
    // agents discover the surface without a failed invocation.
    group.action(() => {
        echo(`Registered scripts: ${Object.keys(SCRIPT_RUNNERS).join(', ')}`);
        echo('Usage: superskill script run <plugin> <script-id>');
    });
    group
        .command('run <plugin> <script-id>')
        .description('Run a registered plugin script (the runtime command skill docs reference)')
        .action((plugin: string, scriptId: string) => {
            const stdinText = readInput ? readInput() : readStdinGuarded();
            const code = scriptRun(plugin, scriptId, { stdinText, env: process.env });
            process.exit(code);
        });
}
