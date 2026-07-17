import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { echo, echoError } from '@gobing-ai/ts-utils';
import type { Command } from 'commander';
import { runStopGuard } from '../../../../plugins/cc/scripts/anti-hallucination/ah_guard';
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
 * Runners signal via exit codes (cross-agent): allow → exit 0 (PreToolUse with empty stdout, Stop
 * with its canonical JSON); deny → exit 2 + reason on stderr (the universal block signal — Claude
 * Code treats exit 1 as a non-blocking error, so 1 never blocks). Agents that cannot parse a
 * runner's JSON shape fail open (treat as allow), which is the intended cross-agent default.
 */

interface HookRunResult {
    /** JSON string written verbatim to stdout (empty string writes nothing). */
    output: string;
    /** Optional reason written to stderr (used by deny via exit 2; ignored on allow). */
    stderr?: string;
    /**
     * Process exit code. Cross-agent convention: allow → 0 (PreToolUse with empty stdout — both
     * Claude Code and Codex treat empty-output exit-0 as "continue normally"; Stop with canonical
     * JSON); deny → 2 with the reason on stderr (the universal block signal; Claude Code treats
     * exit 1 as a non-blocking error, so 1 never blocks).
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
 * Tokenize a `SPUR_BIN` override with quote-aware splitting so paths containing
 * spaces work when quoted (`"/opt/my tools/spur" --flag`). Unquoted spaces still
 * separate argv tokens. Single- and double-quoted runs preserve interior spaces.
 */
export function parseSpurBinSpec(spec: string): string[] {
    const tokens: string[] = [];
    let cur = '';
    let quote: '"' | "'" | null = null;
    for (let i = 0; i < spec.length; i++) {
        const c = spec[i];
        if (quote) {
            if (c === quote) {
                quote = null;
            } else {
                cur += c;
            }
            continue;
        }
        if (c === '"' || c === "'") {
            quote = c;
            continue;
        }
        if (c === ' ' || c === '\t') {
            if (cur.length > 0) {
                tokens.push(cur);
                cur = '';
            }
            continue;
        }
        cur += c;
    }
    if (cur.length > 0) tokens.push(cur);
    return tokens;
}

/**
 * Resolve whether a file path is owned by a Spur task. Shells out to `spur task resolve --strict --json`:
 * exit 0 → owned, non-zero → unowned, spawn/timeout failure → unknown (fail open). Honors `SPUR_BIN`
 * for a custom binary (optional args; quote paths that contain spaces).
 */
export function resolveSpurTaskOwnership(filePath: string, cwd: string): TaskOwnership {
    const spurBin = process.env.SPUR_BIN || 'spur';
    const parts = parseSpurBinSpec(spurBin);
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
/**
 * Stop hook: block the agent from stopping when its last message claims external facts without the
 * anti-hallucination protocol (source citations / confidence level / verification-tool evidence).
 * A thin adapter over {@link runStopGuard}: the Stop branch table (payload resolution → allow on
 * loop guard / unreadable input → verify → allow / block) lives there, single-sourced; this runner
 * only maps its {@link StopGuardResult} to a {@link HookRunResult} (`output` to stdout, `stderr`
 * to the exit-2 reason channel, `exitCode` as the cross-agent allow/block signal). Payload channels
 * (Claude Code `transcript_path` + `stop_hook_active` loop guard; omp `agent_end` `messages`; the
 * `ARGUMENTS` legacy/test channel) are resolved inside `runStopGuard` via `resolveStopContext`.
 * Fails open (allow stop) on empty/invalid payloads or missing content.
 */
const ccAntiHallucination: HookRunner = {
    run(env, stdinText) {
        const result = runStopGuard(env.ARGUMENTS, stdinText);
        return { output: result.output, exitCode: result.exitCode, stderr: result.stderr };
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

        // Keep running totals on .session.json so Stop is O(1) (no full ledger scan).
        try {
            const sessionPath = join(dir, '.session.json');
            const raw = JSON.parse(readFileSync(sessionPath, 'utf-8')) as Record<string, unknown>;
            if (typeof raw.session === 'string' && raw.session === session) {
                if (type === 'read') raw.reads = (typeof raw.reads === 'number' ? raw.reads : 0) + 1;
                else raw.writes = (typeof raw.writes === 'number' ? raw.writes : 0) + 1;
                raw.tokens = (typeof raw.tokens === 'number' ? raw.tokens : 0) + tokens;
                writeFileSync(sessionPath, JSON.stringify(raw));
            }
        } catch {
            // fail-open: missing counters fall back at Stop
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

/** Stop: read O(1) totals from `.session.json`, append `session_end`, clean up session file. */
const spContextSessionStop: HookRunner = {
    run(env) {
        const dir = spurContextDir(env);
        const sessionFile = join(dir, '.session.json');
        if (!existsSync(sessionFile)) return OK;

        let sessionId = '';
        let reads = 0;
        let writes = 0;
        let tokens = 0;
        try {
            const data = JSON.parse(readFileSync(sessionFile, 'utf-8')) as Record<string, unknown>;
            if (typeof data.session !== 'string' || data.session.length === 0) return OK;
            sessionId = data.session;
            // Prefer running counters maintained by PostToolUse (O(1)). Fall back to a
            // one-shot ledger scan only when counters are absent (legacy session files).
            if (typeof data.reads === 'number' || typeof data.writes === 'number' || typeof data.tokens === 'number') {
                reads = typeof data.reads === 'number' ? data.reads : 0;
                writes = typeof data.writes === 'number' ? data.writes : 0;
                tokens = typeof data.tokens === 'number' ? data.tokens : 0;
            } else {
                const ledgerPath = join(dir, 'token-ledger.jsonl');
                if (existsSync(ledgerPath)) {
                    for (const line of readFileSync(ledgerPath, 'utf-8').split('\n')) {
                        if (!line.trim()) continue;
                        try {
                            const evt = JSON.parse(line) as Record<string, unknown>;
                            if (evt.session !== sessionId) continue;
                            if (evt.type === 'read') reads++;
                            else if (evt.type === 'write') writes++;
                            if (typeof evt.tokens === 'number') tokens += evt.tokens;
                        } catch {
                            // skip unparseable lines
                        }
                    }
                }
            }
        } catch {
            return OK;
        }

        const ledgerPath = join(dir, 'token-ledger.jsonl');
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
                    stdinText = readFileSync(0, 'utf-8') as string;
                } catch {
                    stdinText = '';
                }
            }
            const code = hookRun(plugin, hookId, process.env, stdinText);
            process.exit(code);
        });
}
