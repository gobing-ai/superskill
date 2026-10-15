import { getEnvVars } from '@gobing-ai/superskill-core';
import { NodeProcessExecutor, type PipeProcess, type ProcessExecutor } from '@gobing-ai/ts-runtime';
import { echo, echoError } from '@gobing-ai/ts-utils';
import type { Command } from 'commander';
import { runStopGuard, type StopProfile } from '../../../../plugins/cc/scripts/anti-hallucination/ah_guard';
import { parseCommandArgv } from '../command-argv';
import { readStdinNonBlocking } from '../stdin';
import { cliVersion } from '../version';

/**
 * `superskill hook run <plugin> <hook-id>` — the cross-agent hook runtime trigger.
 *
 * Installed hook configs call a stable PATH command (`superskill hook run …`) instead of a
 * plugin-checkout script path or a Claude-only `${CLAUDE_PLUGIN_ROOT}` reference. The dispatcher
 * resolves a known {@link HookRunner} from the registry, hands it stdin + the process env, writes
 * the runner's JSON to stdout, and exits with the runner's code. Unknown `<plugin>/<hook-id>`
 * fails **open** (exit 0 + stderr warning naming the hook and the installed CLI version): an
 * unknown id is a deployment skew (CLI too old for the plugin), not a policy violation — blocking
 * here turns version skew into blocked Stops and agent loops. Known guards keep their own exit
 * codes regardless.
 *
 * Runners signal: allow → exit 0 (empty stdout, or a Stop runner's canonical JSON). A block takes
 * the channel each host renders cleanly: stdout JSON at exit 0 (`decision:"block"` for
 * Claude/Codex/Hermes Stop, `decision:"deny"` for Gemini/Antigravity, `permissionDecision:"deny"`
 * for PreToolUse). Claude Code treats exit 1 as a non-blocking error and honors stdout JSON only at
 * exit 0, so a block that wants its JSON read must NOT use exit 2. `sp/*` runners delegate to
 * `spur self hook <id>`, which owns its host-shaped output ({@link spurDelegate}).
 */

interface HookRunResult {
    /** JSON string written verbatim to stdout (empty string writes nothing). */
    output: string;
    /** Optional diagnostic written to stderr (a fail-open cause, or the delegate's own stderr). */
    stderr?: string;
    /** Process exit code; 0 for allow and for a JSON-carried block (see the module comment). */
    exitCode: number;
}

interface HookRunner {
    run(env: NodeJS.ProcessEnv, stdinText: string, profile?: StopProfile): Promise<HookRunResult>;
}

/** Process execution port for hook runners that shell out (no-direct-process-spawn: routed via ts-runtime). */
const hookProcessExecutor: ProcessExecutor = new NodeProcessExecutor();

// ── sp/* → `spur self hook <id>` ─────────────────────────────────────────────
//
// The sp plugin's hook logic lives in the spur CLI (`spur self hook <id>`, spur script-absorption
// plan §5). superskill only transports the payload: spawn spur with the host payload on stdin,
// forward its stdout + exit code, and fail open on every transport failure. No fallback copy of
// the logic lives here — the plugin hard-requires spur, and a missing spur degrades to "no hook".

/** Kill deadline for guard ids (they gate a tool call, so a slow guard stalls the agent). */
export const SPUR_GUARD_TIMEOUT_MS = 5000;
/** Kill deadline for capture/delivery ids (ledger writes, fleet inbox delivery). */
export const SPUR_CAPTURE_TIMEOUT_MS = 10_000;

/** Per-id transport policy for {@link spurDelegate}. */
export interface SpurDelegateOptions {
    /** Kill spur and fail open after this many ms. */
    timeoutMs: number;
    /** Cheap in-process pre-filter: return false to skip the spawn (treated as a silent allow). */
    shouldSpawn?: (stdinText: string) => boolean;
    /** Process port; defaults to the shared ts-runtime executor. */
    executor?: ProcessExecutor;
}

/**
 * Cheap in-process check: could this path plausibly be a Spur task-corpus file?
 *
 * Exists purely to avoid a spur subprocess on paths that cannot be task files (Spur task 0398 R2):
 * editing `src/foo.ts` or `package.json` must not pay a spawn on every Write/Edit, on every agent
 * in every repo with the sp plugin installed.
 *
 * The convention encoded here is already fixed elsewhere in the corpus tooling (Spur's
 * `defaultVerdictRunDir` resolves the same `docs/tasks<N>` / flat-`tasks` layout pair): task files
 * are markdown living under a path segment named `tasks`, optionally digit-suffixed.
 *
 * **Fails toward the spawn.** Anything markdown-shaped naming a `tasks*` segment still goes to
 * spur and lets it decide. A false spawn only costs latency; a false skip would silently disable
 * the write guard.
 *
 * Known limitation: a project that relocates its corpus to a folder not named `tasks*` (via
 * `spur task create --folder`) is not matched, and its task files stop being guarded. That is the
 * same convention the rest of the corpus tooling already assumes; widening it needs a real config
 * surface rather than a guess, which this deliberately does not add.
 */
export function couldBeTaskCorpusPath(filePath: string): boolean {
    // Task corpus files are always markdown.
    if (!/\.md$/i.test(filePath)) return false;
    // ...living under a `tasks` / `tasks2` / `tasks3` … path segment. Segment match, not substring:
    // `docs/tasksfoo/x.md` and `docs/my-tasks/x.md` are NOT candidates.
    return filePath
        .replace(/\\/g, '/')
        .split('/')
        .some((segment) => /^tasks\d*$/i.test(segment));
}

/** Pre-filter for `task-write-guard`: spawn only when the payload's `tool_input.file_path` could be a task file. */
export function payloadCouldTouchTaskCorpus(stdinText: string): boolean {
    try {
        const payload = JSON.parse(stdinText) as { tool_input?: { file_path?: unknown } } | null;
        const filePath = payload?.tool_input?.file_path;
        return typeof filePath === 'string' && couldBeTaskCorpusPath(filePath);
    } catch {
        return false; // unparseable payload — spur would fail open on it too
    }
}

/** `--host` for spur: Claude Code exports `CLAUDE_PROJECT_DIR`; anything else lets spur decide. */
function spurHookHost(env: NodeJS.ProcessEnv): 'claude' | 'auto' {
    return env.CLAUDE_PROJECT_DIR ? 'claude' : 'auto';
}

function childEnv(env: NodeJS.ProcessEnv): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(env)) if (value !== undefined) out[key] = value;
    return out;
}

/**
 * Re-express a PreToolUse `permissionDecision` JSON through the exit-code channel for hosts other
 * than Claude Code. Codex rejects `permissionDecision:"allow"`/`"ask"` (it marks the hook run failed)
 * and omp's generated hook modules block only on exit 2, so off Claude Code: deny → exit 2 + the
 * reason on stderr, allow/ask → empty stdout at exit 0 (an unconfirmable ask fails open). Returns
 * null for any other output (Stop decisions, `updatedInput` rewrites, silence), which forwards as-is.
 */
export function preToolUseByExitCode(output: string): HookRunResult | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(output);
    } catch {
        return null;
    }
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { hookSpecificOutput: hso, systemMessage } = parsed as {
        hookSpecificOutput?: Record<string, unknown>;
        systemMessage?: unknown;
    };
    if (hso?.hookEventName !== 'PreToolUse' || hso.updatedInput !== undefined) return null;
    if (hso.permissionDecision !== 'deny') return { output: '', exitCode: 0 };
    const reason = [hso.permissionDecisionReason, systemMessage].find((r) => typeof r === 'string' && r.trim());
    return { output: '', exitCode: 2, stderr: (reason as string | undefined) ?? 'blocked by PreToolUse hook' };
}

/** Older spur builds reject `self hook` (Commander) or an id they do not ship (`spur self hook`). */
const SPUR_UNKNOWN = /unknown (command|option|hook id)/i;

/**
 * A {@link HookRunner} that delegates `<id>` to `${SPUR_BIN:-spur} self hook <id> --host <host>`.
 *
 * Success (spur exit 0, no unknown-id report) forwards spur's stdout and exit code — the
 * host-shaped decision is spur's to produce; off Claude Code a PreToolUse decision is re-expressed
 * as an exit code ({@link preToolUseByExitCode}). Every other outcome fails open: exit 0, no stdout, one
 * stderr line naming the hook and the cause (spur not found, timeout, non-zero exit — e.g. an older
 * spur without `self hook` — or an unknown id). `SPUR_BIN` may carry leading arguments; quote paths
 * containing spaces.
 */
export function spurDelegate(id: string, options: SpurDelegateOptions): HookRunner {
    const executor = options.executor ?? hookProcessExecutor;
    const failOpen = (cause: string): HookRunResult => ({
        output: '',
        exitCode: 0,
        stderr: `superskill hook run sp ${id}: ${cause}; failing open (exit 0).`,
    });
    return {
        async run(env, stdinText) {
            if (options.shouldSpawn && !options.shouldSpawn(stdinText)) return { output: '', exitCode: 0 };
            const parts = parseCommandArgv(env.SPUR_BIN?.trim() || 'spur');
            const command = parts[0] ?? 'spur';
            const args = [...parts.slice(1), 'self', 'hook', id, '--host', spurHookHost(env)];
            let child: PipeProcess;
            try {
                child = executor.runStreaming({ command, args, env: childEnv(env), envMode: 'replace' });
            } catch (error) {
                const code = (error as NodeJS.ErrnoException).code;
                return failOpen(
                    code === 'ENOENT' ? `'${command}' not found (install spur or set SPUR_BIN)` : `spawn failed`,
                );
            }
            try {
                child.writeStdin(stdinText);
                child.endStdin();
            } catch {
                // spur may exit before reading stdin; its exit status decides below
            }
            let timer: ReturnType<typeof setTimeout> | undefined;
            const deadline = new Promise<'timeout'>((resolve) => {
                timer = setTimeout(() => resolve('timeout'), options.timeoutMs);
            });
            const finished = Promise.all([
                child.exited,
                child.stdout ? new Response(child.stdout).text() : Promise.resolve(''),
                child.stderr ? new Response(child.stderr).text() : Promise.resolve(''),
            ]);
            const outcome = await Promise.race([finished, deadline]);
            clearTimeout(timer);
            if (outcome === 'timeout') {
                child.kill('SIGKILL');
                return failOpen(`spur timed out after ${options.timeoutMs} ms`);
            }
            const [exitCode, stdout, stderr] = outcome;
            if (exitCode !== 0 || SPUR_UNKNOWN.test(stderr)) {
                const why = SPUR_UNKNOWN.test(stderr)
                    ? `spur does not know 'self hook ${id}' (upgrade spur)`
                    : `spur exited ${exitCode ?? 'by signal'}`;
                return failOpen(why);
            }
            const output = stdout.replace(/\n+$/, '');
            const adapted = env.CLAUDE_PROJECT_DIR ? null : preToolUseByExitCode(output);
            if (adapted) return adapted;
            const trimmedErr = stderr.trim();
            return { output, exitCode, ...(trimmedErr ? { stderr: trimmedErr } : {}) };
        },
    };
}

/**
 * sp hook ids served by spur, mirroring `spur self hook list` and the sp plugin's `hooks.json`.
 * Only the transport policy is known here: guards get the short deadline, and the write guard keeps
 * its spawn-avoiding pre-filter. Adding an id is one line; its behavior lives entirely in spur.
 */
const SP_SPUR_HOOKS: Record<string, Omit<SpurDelegateOptions, 'executor'>> = {
    'task-write-guard': { timeoutMs: SPUR_GUARD_TIMEOUT_MS, shouldSpawn: payloadCouldTouchTaskCorpus },
    'careful-guard': { timeoutMs: SPUR_GUARD_TIMEOUT_MS },
    'context-post-tool': { timeoutMs: SPUR_CAPTURE_TIMEOUT_MS },
    'context-session-start': { timeoutMs: SPUR_CAPTURE_TIMEOUT_MS },
    'context-session-stop': { timeoutMs: SPUR_CAPTURE_TIMEOUT_MS },
    // Detached `spur agent report`; hooks.json gives it a 5 s host timeout, so match it.
    'agent-lifecycle': { timeoutMs: SPUR_GUARD_TIMEOUT_MS },
    'fleet-guest-stop': { timeoutMs: SPUR_CAPTURE_TIMEOUT_MS },
};

// ── cc/anti-hallucination ───────────────────────────────────────────────────
/**
 * Stop hook: block the agent from stopping when its last message claims external facts without the
 * anti-hallucination protocol (source citations / confidence level / verification-tool evidence).
 * A thin adapter over {@link runStopGuard}: the Stop branch table (payload resolution → allow on
 * loop guard / unreadable input → verify → allow / block) lives there, single-sourced; this runner
 * only maps its {@link StopGuardResult} to a {@link HookRunResult} (`output` to stdout at exit 0 —
 * the `decision` field in that JSON is the allow/block signal; no stderr, no exit 2).
 * Payload channels (Claude/Codex `last_assistant_message`, legacy Claude `transcript_path`,
 * `stop_hook_active` loop guard; omp `agent_end` `messages`; the
 * `ARGUMENTS` legacy/test channel) are resolved inside `runStopGuard` via `resolveStopContext`.
 * Fails open (allow stop) on empty/invalid payloads or missing content.
 */
const ccAntiHallucination: HookRunner = {
    async run(env, stdinText, profile) {
        const result = runStopGuard(env.ARGUMENTS, stdinText, profile);
        // The guard blocks via the profiled `decision` JSON in `output` at exit 0 — the clean
        // feedback channel for every profiled host (block: Claude/Codex/Hermes; deny:
        // Gemini/Antigravity). No stderr: at exit 2 hosts discard that JSON and surface stderr as a
        // "blocking error" instead of feeding the reason back as feedback.
        return { output: result.output, exitCode: result.exitCode };
    },
};

// ── Registry + dispatcher ────────────────────────────────────────────────────

const HOOK_RUNNERS: Record<string, HookRunner> = {
    ...Object.fromEntries(Object.entries(SP_SPUR_HOOKS).map(([id, opts]) => [`sp/${id}`, spurDelegate(id, opts)])),
    'cc/anti-hallucination': ccAntiHallucination,
};

/** Resolve and run a hook runner, writing its output to stdout and returning the exit code. */
export async function hookRun(
    plugin: string,
    hookId: string,
    env: NodeJS.ProcessEnv,
    stdinText: string,
    profile?: StopProfile,
): Promise<number> {
    const runner = HOOK_RUNNERS[`${plugin}/${hookId}`];
    if (!runner) {
        // Fail open: an unknown hook id signals plugin/CLI version skew (the installed plugin
        // emits a hook the running CLI doesn't recognize), not a policy violation. Blocking here
        // would turn version skew into blocked Stops and stuck agent loops. Warn loudly and allow.
        echoError(
            `Warning: unknown hook '${plugin} ${hookId}' (superskill ${cliVersion}). ` +
                `This usually means the installed plugin expects a newer CLI than the one on PATH. ` +
                `Known hooks: ${Object.keys(HOOK_RUNNERS).join(', ')}. Failing open (exit 0).`,
        );
        return 0;
    }
    const result = await runner.run(env, stdinText, profile);
    // WHY conditional: echo('') writes '\n' (writeLine always appends a newline). A bare newline
    // on stdout makes Codex try to parse it as JSON and fail open noisily. Only emit when non-empty.
    if (result.output) echo(result.output);
    if (result.stderr) echoError(result.stderr);
    return result.exitCode;
}

/** Register `superskill hook run <plugin> <hook-id>` under the hook command group. */
export function registerHookRun(cmd: Command, readInput?: () => string): void {
    cmd.command('run <plugin> <hook-id>')
        .description('Run a registered plugin hook runner (the runtime command installed hook configs call)')
        .option(
            '--profile <block|deny>',
            'prevent-stop output profile (block: Claude/Codex/Hermes; deny: Gemini/Antigravity)',
            'block',
        )
        .action(async (plugin: string, hookId: string, options: { profile: string }) => {
            let stdinText = '';
            if (readInput) {
                stdinText = readInput();
            } else {
                stdinText = (await readStdinNonBlocking()) ?? '';
            }
            const profile: StopProfile = options.profile === 'deny' ? 'deny' : 'block';
            const code = await hookRun(plugin, hookId, getEnvVars(), stdinText, profile);
            process.exit(code);
        });
}
