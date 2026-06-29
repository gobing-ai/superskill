import { spawnSync } from 'node:child_process';
import type { Command } from 'commander';
import {
    extractLastAssistantMessage,
    verifyAntiHallucinationProtocol,
} from '../../../../plugins/cc/scripts/anti-hallucination/ah_guard';

/**
 * `superskill hook run <plugin> <hook-id>` — the cross-agent hook runtime trigger.
 *
 * Installed hook configs call a stable PATH command (`superskill hook run …`) instead of a
 * plugin-checkout script path or a Claude-only `${CLAUDE_PLUGIN_ROOT}` reference. The dispatcher
 * resolves a known {@link HookRunner} from the registry, hands it stdin + the process env, writes
 * the runner's JSON to stdout, and exits with the runner's code. Unknown `<plugin>/<hook-id>` exits
 * non-zero with a clear error (this never fails open — an unknown hook id is a config bug, not a
 * runtime payload).
 *
 * Runners emit Claude canonical hook JSON (PreToolUse permission decision / Stop `allowStop`). Agents
 * that cannot parse that shape fail open (treat as allow), which is the intended cross-agent default.
 */

interface HookRunResult {
    /** JSON string written verbatim to stdout. */
    output: string;
    /** Process exit code: 0 for PreToolUse always; for Stop, 0 = allow, non-zero = block. */
    exitCode: number;
}

interface HookRunner {
    run(env: NodeJS.ProcessEnv, stdinText: string): HookRunResult;
}

// ── sp/task-write-guard ─────────────────────────────────────────────────────

interface ToolPayload {
    tool_name?: string;
    tool_input?: { file_path?: string };
}

/** Build a PreToolUse decision payload (always exit 0 — the decision rides in the JSON). */
function preToolUseDecision(decision: 'allow' | 'deny', reason?: string): HookRunResult {
    const out: Record<string, unknown> = {
        hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: decision },
    };
    if (reason !== undefined) out.systemMessage = reason;
    return { output: JSON.stringify(out), exitCode: 0 };
}

/**
 * Deny a raw Write/Edit whose target path is owned by a Spur task (mutate task files through the
 * `spur task` CLI, never by hand). Pure delegation: ownership is decided by `spur task resolve`'s
 * exit code alone. Fail open on every other condition. `SPUR_WRITE_GUARD=off` short-circuits to allow.
 */
const spTaskWriteGuard: HookRunner = {
    run(env, stdinText) {
        if (env.SPUR_WRITE_GUARD === 'off') return preToolUseDecision('allow');

        let payload: ToolPayload;
        try {
            payload = JSON.parse(stdinText) as ToolPayload;
        } catch {
            return preToolUseDecision('allow'); // unparseable payload — fail open
        }

        const toolName = payload.tool_name ?? '';
        if (toolName !== 'Write' && toolName !== 'Edit') return preToolUseDecision('allow');

        const filePath = payload.tool_input?.file_path ?? '';
        if (filePath === '') return preToolUseDecision('allow');

        // Delegate ownership entirely to the globally installed `spur`: exit 0 = owned by a task,
        // non-zero = not owned. `--strict` matches ONLY the exact corpus path. `spur task resolve`
        // is cwd-sensitive (it locates the corpus relative to its working dir), so run it in the
        // project dir the hook fired in — CLAUDE_PROJECT_DIR is the standard env var carrying that.
        // Any spawn failure (spur not on PATH, timeout, unexpected error) fails open.
        const res = spawnSync('spur', ['task', 'resolve', filePath, '--strict', '--json'], {
            cwd: env.CLAUDE_PROJECT_DIR ?? process.cwd(),
            encoding: 'utf-8',
            timeout: 8000,
        });
        if (res.error || typeof res.status !== 'number') return preToolUseDecision('allow');

        if (res.status === 0) {
            return preToolUseDecision(
                'deny',
                `${filePath} is a task file owned by the spur corpus. Edit it through the spur CLI ` +
                    '(e.g. `spur task update <wbs> --section <name> --from-file <file>`), not a raw ' +
                    'Write/Edit. Set SPUR_WRITE_GUARD=off to bypass.',
            );
        }
        return preToolUseDecision('allow');
    },
};

// ── cc/anti-hallucination ───────────────────────────────────────────────────

interface HookContext {
    messages?: { role: string; content: string | Array<{ type: string; text?: string }> }[];
    last_message?: string;
}

/**
 * Stop hook: block the agent from stopping when its last message claims external facts without the
 * anti-hallucination protocol (source citations / confidence level / verification-tool evidence).
 * Reads the payload from the `ARGUMENTS` env var (Claude Stop-hook convention), emits the canonical
 * Stop shape `{ hookSpecificOutput: { allowStop, feedback } }`, and exits 0 (allow) / 1 (block).
 * Fails open (allow stop) on empty/invalid `ARGUMENTS` or missing content.
 */
const ccAntiHallucination: HookRunner = {
    run(env) {
        const argumentsJson = env.ARGUMENTS ?? '{}';
        const allowStop = (feedback: string, ok: boolean): HookRunResult => ({
            output: JSON.stringify({ hookSpecificOutput: { allowStop: ok, feedback } }),
            exitCode: ok ? 0 : 1,
        });

        let context: HookContext;
        try {
            context = JSON.parse(argumentsJson) as HookContext;
        } catch {
            return allowStop('Task is complete (invalid context ignored)', true);
        }

        const content = extractLastAssistantMessage(context);
        if (content === undefined) return allowStop('No content to verify', true);

        const result = verifyAntiHallucinationProtocol(content);
        return allowStop(result.reason, result.ok);
    },
};

// ── Registry + dispatcher ────────────────────────────────────────────────────

const HOOK_RUNNERS: Record<string, HookRunner> = {
    'sp/task-write-guard': spTaskWriteGuard,
    'cc/anti-hallucination': ccAntiHallucination,
};

/** Read all of stdin (blocking) for the dispatcher. Empty string when no stdin is piped. */
function readStdin(): string {
    try {
        return require('node:fs').readFileSync(0, 'utf-8') as string;
    } catch {
        return '';
    }
}

/** Resolve and run a hook runner, writing its output to stdout and returning the exit code. */
export function hookRun(plugin: string, hookId: string, env: NodeJS.ProcessEnv, stdinText: string): number {
    const runner = HOOK_RUNNERS[`${plugin}/${hookId}`];
    if (!runner) {
        process.stderr.write(
            `Error: unknown hook '${plugin} ${hookId}'. Known hooks: ${Object.keys(HOOK_RUNNERS).join(', ')}\n`,
        );
        return 2;
    }
    const result = runner.run(env, stdinText);
    process.stdout.write(result.output);
    return result.exitCode;
}

/** Register `superskill hook run <plugin> <hook-id>` under the hook command group. */
export function registerHookRun(cmd: Command): void {
    cmd.command('run <plugin> <hook-id>')
        .description('Run a registered plugin hook runner (the runtime command installed hook configs call)')
        .action((plugin: string, hookId: string) => {
            const code = hookRun(plugin, hookId, process.env, readStdin());
            process.exit(code);
        });
}
