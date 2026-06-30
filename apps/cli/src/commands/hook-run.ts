import { spawnSync } from 'node:child_process';
import { echo, echoError } from '@gobing-ai/ts-utils';
import type { Command } from 'commander';
import {
    buildStopOutput,
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

type TaskOwnership = 'owned' | 'unowned' | 'unknown';
type ResolveTaskOwnership = (filePath: string, cwd: string) => TaskOwnership;

/** Build a PreToolUse decision payload (always exit 0 — the decision rides in the JSON). */
function preToolUseDecision(decision: 'allow' | 'deny', reason?: string): HookRunResult {
    const out: Record<string, unknown> = {
        hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: decision },
    };
    if (reason !== undefined) out.systemMessage = reason;
    return { output: JSON.stringify(out), exitCode: 0 };
}

/**
 * Resolve whether a file path is owned by a Spur task. Shells out to `spur task resolve --strict --json`:
 * exit 0 → owned, non-zero → unowned, spawn/timeout failure → unknown (fail open). Honors `SPUR_BIN`
 * for a custom binary (args allowed, space-separated).
 */
export function resolveSpurTaskOwnership(filePath: string, cwd: string): TaskOwnership {
    const spurBin = process.env.SPUR_BIN || 'spur';
    const parts = spurBin.split(' ');
    const cmd = parts[0] ?? 'spur';
    const args = [...parts.slice(1), 'task', 'resolve', filePath, '--strict', '--json'];
    const res = spawnSync(cmd, args, {
        cwd,
        encoding: 'utf-8',
        timeout: 8000,
    });
    if (res.error || typeof res.status !== 'number') return 'unknown';
    return res.status === 0 ? 'owned' : 'unowned';
}

/**
 * Deny a raw Write/Edit whose target path is owned by a Spur task (mutate task files through the
 * `spur task` CLI, never by hand). Pure delegation: ownership is decided by `spur task resolve`'s
 * exit code alone. Fail open on every other condition. `SPUR_WRITE_GUARD=off` short-circuits to allow.
 */
/** Run the Spur task write guard with an injectable resolver for deterministic tests. */
export function runSpTaskWriteGuard(
    env: NodeJS.ProcessEnv,
    stdinText: string,
    resolveTaskOwnership: ResolveTaskOwnership = resolveSpurTaskOwnership,
): HookRunResult {
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

    // Delegate ownership entirely to the globally installed `spur`: owned => deny,
    // unowned/unknown => fail open.
    const ownership = resolveTaskOwnership(filePath, env.CLAUDE_PROJECT_DIR ?? process.cwd());
    if (ownership === 'owned') {
        return preToolUseDecision(
            'deny',
            `${filePath} is a task file owned by the spur corpus. Edit it through the spur CLI ` +
                '(e.g. `spur task update <wbs> --section <name> --from-file <file>`), not a raw ' +
                'Write/Edit. Set SPUR_WRITE_GUARD=off to bypass.',
        );
    }
    return preToolUseDecision('allow');
}

const spTaskWriteGuard: HookRunner = {
    run: runSpTaskWriteGuard,
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
 * Stop JSON via {@link buildStopOutput} (allow → bare `hookSpecificOutput.hookEventName`, no feedback;
 * block → top-level `decision:"block"` + `reason`), and exits 0 (allow) / 1 (block).
 * Fails open (allow stop) on empty/invalid `ARGUMENTS` or missing content.
 */
const ccAntiHallucination: HookRunner = {
    run(env) {
        const argumentsJson = env.ARGUMENTS ?? '{}';
        const allowStop = (feedback: string, ok: boolean): HookRunResult => ({
            output: buildStopOutput({ ok, reason: feedback }),
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

/** Resolve and run a hook runner, writing its output to stdout and returning the exit code. */
export function hookRun(plugin: string, hookId: string, env: NodeJS.ProcessEnv, stdinText: string): number {
    const runner = HOOK_RUNNERS[`${plugin}/${hookId}`];
    if (!runner) {
        echoError(`Error: unknown hook '${plugin} ${hookId}'. Known hooks: ${Object.keys(HOOK_RUNNERS).join(', ')}`);
        return 2;
    }
    const result = runner.run(env, stdinText);
    echo(result.output);
    return result.exitCode;
}

/** Register `superskill hook run <plugin> <hook-id>` under the hook command group. */
export function registerHookRun(cmd: Command, readInput?: () => string): void {
    cmd.command('run <plugin> <hook-id>')
        .description('Run a registered plugin hook runner (the runtime command installed hook configs call)')
        .action((plugin: string, hookId: string) => {
            let stdinText = '';
            if (readInput) {
                stdinText = readInput();
            } else {
                try {
                    stdinText = require('node:fs').readFileSync(0, 'utf-8') as string;
                } catch {
                    stdinText = '';
                }
            }
            const code = hookRun(plugin, hookId, process.env, stdinText);
            process.exit(code);
        });
}
