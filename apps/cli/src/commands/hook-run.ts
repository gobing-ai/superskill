import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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
 * Runners signal via exit codes (cross-agent): PreToolUse allow → empty stdout + exit 0; deny →
 * exit 2 + reason on stderr; Stop → canonical JSON with 0/non-zero. Agents that cannot parse a
 * runner's JSON shape fail open (treat as allow), which is the intended cross-agent default.
 */

interface HookRunResult {
    /** JSON string written verbatim to stdout (empty string writes nothing). */
    output: string;
    /** Optional reason written to stderr (used by deny via exit 2; ignored on allow). */
    stderr?: string;
    /**
     * Process exit code. Cross-agent convention: PreToolUse allow → 0 with empty stdout (both Claude
     * Code and Codex treat empty-output exit-0 as "continue normally"); deny → 2 with the reason on
     * stderr (exit 2 is the universal block signal). Stop hooks keep 0 = allow / non-zero = block.
     */
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
/**
 * Build a PreToolUse decision. Cross-agent signal: allow → empty stdout + exit 0 (both Claude Code
 * and Codex treat empty-output exit-0 as "continue normally"); deny → exit 2 + reason on stderr
 * (exit 2 is the universal block signal, avoiding the JSON field divergence where Codex rejects
 * `permissionDecision: "allow"` and uses `permissionDecisionReason` instead of `systemMessage`).
 */
function preToolUseDecision(decision: 'allow' | 'deny', reason?: string): HookRunResult {
    if (decision === 'allow') return { output: '', exitCode: 0 };
    return { output: '', exitCode: 2, stderr: reason ?? 'blocked by PreToolUse hook' };
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

// ── sp/context-* hooks (indexed-context token ledger, all fail-open) ─────────

const OK: HookRunResult = { output: '', exitCode: 0 };

/** Resolve `.spur/context/` under the project dir the agent anchors to. */
function spurContextDir(env: NodeJS.ProcessEnv): string {
    return join(env.CLAUDE_PROJECT_DIR ?? process.cwd(), '.spur', 'context');
}

/** Read `.session.json` → session id, or '' when absent/unparseable. */
function readSpurSession(dir: string): string {
    const sessionFile = join(dir, '.session.json');
    if (!existsSync(sessionFile)) return '';
    try {
        const data = JSON.parse(readFileSync(sessionFile, 'utf-8'));
        if (typeof data === 'object' && data !== null && 'session' in data && typeof data.session === 'string') {
            return data.session;
        }
        return '';
    } catch {
        return '';
    }
}

/** PostToolUse (matcher Read|Write|Edit): append one token-estimate event to the ledger. */
const spContextPostTool: HookRunner = {
    run(env, stdinText) {
        const dir = spurContextDir(env);
        let payload: unknown;
        try {
            payload = JSON.parse(stdinText);
        } catch {
            return OK;
        }
        if (typeof payload !== 'object' || payload === null) return OK;
        const p = payload as Record<string, unknown>;

        const toolName = typeof p.tool_name === 'string' ? p.tool_name : '';
        if (toolName !== 'Read' && toolName !== 'Write' && toolName !== 'Edit') return OK;

        const toolInput = p.tool_input;
        const filePath =
            typeof toolInput === 'object' &&
            toolInput !== null &&
            'file_path' in toolInput &&
            typeof (toolInput as Record<string, unknown>).file_path === 'string'
                ? ((toolInput as Record<string, unknown>).file_path as string)
                : '';
        if (!filePath) return OK;

        const session = readSpurSession(dir);
        if (!session) return OK;

        const toolResponse = p.tool_response;
        const content =
            typeof toolResponse === 'object' &&
            toolResponse !== null &&
            'content' in toolResponse &&
            typeof (toolResponse as Record<string, unknown>).content === 'string'
                ? ((toolResponse as Record<string, unknown>).content as string)
                : '';
        const tokens = content ? Math.ceil(new TextEncoder().encode(content).length / 4) : 0;
        const ts = new Date().toISOString();
        const type = toolName === 'Read' ? 'read' : 'write';
        const action = toolName === 'Read' ? undefined : toolName === 'Write' ? 'create' : 'edit';

        const event: Record<string, unknown> = { ts, session, type, file: filePath, tokens };
        if (action) event.action = action;

        try {
            appendFileSync(join(dir, 'token-ledger.jsonl'), `${JSON.stringify(event)}\n`);
        } catch {
            // fail-open: a broken ledger must never wedge the agent
        }
        return OK;
    },
};

/** SessionStart: create `.spur/context/`, write `.session.json`, append `session_start`. */
const spContextSessionStart: HookRunner = {
    run(env) {
        const dir = spurContextDir(env);
        try {
            mkdirSync(dir, { recursive: true });
        } catch {
            return OK;
        }

        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, '0');
        const sessionId = `session-${now.toISOString().slice(0, 10)}-${pad(now.getHours())}${pad(now.getMinutes())}`;
        const ts = now.toISOString();

        try {
            writeFileSync(
                join(dir, '.session.json'),
                JSON.stringify({ session: sessionId, started: ts, reads: 0, writes: 0, tokens: 0 }),
            );
        } catch {
            return OK;
        }

        try {
            appendFileSync(
                join(dir, 'token-ledger.jsonl'),
                `${JSON.stringify({ ts, session: sessionId, type: 'session_start' })}\n`,
            );
        } catch {
            // fail-open
        }
        return OK;
    },
};

/** Stop: compute session rollup from the ledger, append `session_end`, clean up `.session.json`. */
const spContextSessionStop: HookRunner = {
    run(env) {
        const dir = spurContextDir(env);
        const sessionFile = join(dir, '.session.json');
        if (!existsSync(sessionFile)) return OK;

        let sessionId = '';
        try {
            const data = JSON.parse(readFileSync(sessionFile, 'utf-8'));
            if (typeof data === 'object' && data !== null && 'session' in data && typeof data.session === 'string') {
                sessionId = data.session;
            }
        } catch {
            return OK;
        }
        if (!sessionId) return OK;

        const ledgerPath = join(dir, 'token-ledger.jsonl');
        let reads = 0;
        let writes = 0;
        let tokens = 0;
        if (existsSync(ledgerPath)) {
            for (const line of readFileSync(ledgerPath, 'utf-8').split('\n')) {
                if (!line.trim()) continue;
                try {
                    const evt = JSON.parse(line);
                    if (
                        typeof evt !== 'object' ||
                        evt === null ||
                        (evt as Record<string, unknown>).session !== sessionId
                    )
                        continue;
                    const type = (evt as Record<string, unknown>).type;
                    if (type === 'read') reads++;
                    else if (type === 'write') writes++;
                    if (typeof (evt as Record<string, unknown>).tokens === 'number') {
                        tokens += (evt as Record<string, unknown>).tokens as number;
                    }
                } catch {
                    // skip unparseable lines
                }
            }
        }

        const event = {
            ts: new Date().toISOString(),
            session: sessionId,
            type: 'session_end',
            totals: { reads, writes, tokens },
        };
        try {
            appendFileSync(ledgerPath, `${JSON.stringify(event)}\n`);
        } catch {
            // fail-open
        }
        try {
            rmSync(sessionFile, { force: true });
        } catch {
            // cleanup is best-effort
        }
        return OK;
    },
};

// ── Registry + dispatcher ────────────────────────────────────────────────────

const HOOK_RUNNERS: Record<string, HookRunner> = {
    'sp/task-write-guard': spTaskWriteGuard,
    'sp/context-post-tool': spContextPostTool,
    'sp/context-session-start': spContextSessionStart,
    'sp/context-session-stop': spContextSessionStop,
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
