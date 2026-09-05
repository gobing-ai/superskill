import { createHash, randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NodeProcessExecutor, type ProcessExecutor } from '@gobing-ai/ts-runtime';
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
 * Runners signal: allow → exit 0 (PreToolUse with empty stdout, Stop with its canonical JSON). A
 * deny takes the channel each host renders cleanly: Stop → `decision:"block"` JSON at exit 0 (clean
 * feedback; the cc/anti-hallucination hook is Claude-Code-only); PreToolUse → `permissionDecision:
 * "deny"` JSON at exit 0 when Claude Code is the host (`CLAUDE_PROJECT_DIR` set), else exit 2 + stderr
 * for cross-agent hosts (Codex/omp) that don't parse that JSON. Claude Code treats exit 1 as a
 * non-blocking error, so 1 never blocks; and it honors stdout JSON only at exit 0, so a deny that
 * wants its JSON read must NOT use exit 2. Agents that cannot parse a runner's JSON shape fail open
 * (treat as allow), which is the intended cross-agent default.
 */

interface HookRunResult {
    /** JSON string written verbatim to stdout (empty string writes nothing). */
    output: string;
    /** Optional reason written to stderr (used by deny via exit 2; ignored on allow). */
    stderr?: string;
    /**
     * Process exit code. Allow → 0 (PreToolUse with empty stdout — both Claude Code and Codex treat
     * empty-output exit-0 as "continue normally"; Stop with canonical JSON). Deny → 0 with the
     * decision JSON on stdout when Claude Code is the host (it honors stdout JSON only at exit 0), or
     * → 2 with the reason on stderr for cross-agent hosts (Codex/omp) that key off the exit code.
     * Claude Code treats exit 1 as a non-blocking error, so 1 never blocks.
     */
    exitCode: number;
}

interface HookRunner {
    run(env: NodeJS.ProcessEnv, stdinText: string, profile?: StopProfile): Promise<HookRunResult>;
}

/** Process execution port for hook runners that shell out (no-direct-process-spawn: routed via ts-runtime). */
const hookProcessExecutor: ProcessExecutor = new NodeProcessExecutor();

// ── sp/task-write-guard ─────────────────────────────────────────────────────

interface ToolPayload {
    tool_name?: string;
    tool_input?: { file_path?: string };
}

type TaskOwnership = 'owned' | 'unowned' | 'unknown';
type ResolveTaskOwnership = (filePath: string, cwd: string) => Promise<TaskOwnership>;
/**
 * Build a PreToolUse decision. Allow → empty stdout + exit 0 (both Claude Code and Codex treat
 * empty-output exit-0 as "continue normally"; Codex rejects `permissionDecision:"allow"` JSON, so
 * allow emits nothing). Deny takes the channel each host renders cleanly: when Claude Code is the
 * host (`CLAUDE_PROJECT_DIR` set) emit `permissionDecision:"deny"` JSON at exit 0 (a clean deny,
 * not a "blocking error"); otherwise fall back to exit 2 + stderr — the universal block signal that
 * Codex/omp honor without parsing JSON. The host check keeps Codex off the JSON path that 418894e
 * broke (`unsupported permissionDecision`).
 */
function preToolUseDecision(decision: 'allow' | 'deny', reason?: string, env?: NodeJS.ProcessEnv): HookRunResult {
    if (decision === 'allow') return { output: '', exitCode: 0 };
    const blockReason = reason ?? 'blocked by PreToolUse hook';
    if (env?.CLAUDE_PROJECT_DIR) {
        return {
            output: JSON.stringify({
                hookSpecificOutput: {
                    hookEventName: 'PreToolUse',
                    permissionDecision: 'deny',
                    permissionDecisionReason: blockReason,
                },
            }),
            exitCode: 0,
        };
    }
    return { output: '', exitCode: 2, stderr: blockReason };
}

/**
 * Tokenize a `SPUR_BIN` override with quote-aware splitting so paths containing
 * spaces work when quoted (`"/opt/my tools/spur" --flag`). Unquoted spaces still
 * separate argv tokens. Single- and double-quoted runs preserve interior spaces.
 */
export const parseSpurBinSpec = parseCommandArgv;

/**
 * Resolve whether a file path is owned by a Spur task. Shells out to `spur task resolve --strict --json`:
 * exit 0 → owned, non-zero → unowned, spawn/timeout failure → unknown (fail open). Honors `SPUR_BIN`
 * for a custom binary (optional args; quote paths that contain spaces).
 */
export async function resolveSpurTaskOwnership(
    filePath: string,
    cwd: string,
    executor: ProcessExecutor = hookProcessExecutor,
): Promise<TaskOwnership> {
    const spurBin = process.env.SPUR_BIN || 'spur';
    const parts = parseSpurBinSpec(spurBin);
    const cmd = parts[0] ?? 'spur';
    const args = [...parts.slice(1), 'task', 'resolve', filePath, '--strict', '--json'];
    const result = await executor.run({ command: cmd, args, cwd, timeout: 8000 });
    if (result.exitCode === null) return 'unknown';
    return result.exitCode === 0 ? 'owned' : 'unowned';
}
/**
 * Cheap in-process check: could this path plausibly be a Spur task-corpus file?
 *
 * Exists purely to avoid a ~2.4 s `spur task resolve` subprocess on paths that cannot be task
 * files (Spur task 0398 R2). The guard used to spawn on every Write/Edit, so editing `src/foo.ts`
 * or `package.json` paid the same toll as editing a real task file — ~3.7 s per mutation once the
 * hook's own ~1.3 s startup is included, on every agent in every repo with the sp plugin installed.
 *
 * The convention encoded here is already fixed elsewhere in the corpus tooling (Spur's
 * `defaultVerdictRunDir` resolves the same `docs/tasks<N>` / flat-`tasks` layout pair): task files
 * are markdown living under a path segment named `tasks`, optionally digit-suffixed.
 *
 * **Fails toward the spawn.** Anything markdown-shaped naming a `tasks*` segment still goes to
 * `spur task resolve` and lets it decide. A false spawn only costs latency; a false skip would
 * silently disable the write guard.
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

/**
 * Deny a raw Write/Edit whose target path is owned by a Spur task (mutate task files through the
 * `spur task` CLI, never by hand). Pure delegation: ownership is decided by `spur task resolve`'s
 * exit code alone. Fail open on every other condition. `SPUR_WRITE_GUARD=off` short-circuits to allow.
 */
/** Run the Spur task write guard with an injectable resolver for deterministic tests. */
export async function runSpTaskWriteGuard(
    env: NodeJS.ProcessEnv,
    stdinText: string,
    resolveTaskOwnership: ResolveTaskOwnership = resolveSpurTaskOwnership,
): Promise<HookRunResult> {
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
    // Skip the ~2.4 s ownership spawn for paths that cannot be task files (0398 R2).
    if (!couldBeTaskCorpusPath(filePath)) return preToolUseDecision('allow');

    // Delegate ownership entirely to the globally installed `spur`: owned => deny,
    // unowned/unknown => fail open.
    const ownership = await resolveTaskOwnership(filePath, env.CLAUDE_PROJECT_DIR ?? process.cwd());
    if (ownership === 'owned') {
        return preToolUseDecision(
            'deny',
            `${filePath} is a task file owned by the spur corpus. Edit it through the spur CLI ` +
                '(e.g. `spur task update <wbs> --section <name> --from-file <file>`), not a raw ' +
                'Write/Edit. Set SPUR_WRITE_GUARD=off to bypass.',
            env,
        );
    }
    return preToolUseDecision('allow');
}

const spTaskWriteGuard: HookRunner = {
    // `profile` is irrelevant to this PreToolUse guard. Ignore it so the dispatcher's profile arg
    // is never mistaken for runSpTaskWriteGuard's test-injectable resolver (its 3rd parameter).
    run: (env, stdinText) => runSpTaskWriteGuard(env, stdinText),
};

// ── cc/anti-hallucination ───────────────────────────────────────────────────
/**
 * Stop hook: block the agent from stopping when its last message claims external facts without the
 * anti-hallucination protocol (source citations / confidence level / verification-tool evidence).
 * A thin adapter over {@link runStopGuard}: the Stop branch table (payload resolution → allow on
 * loop guard / unreadable input → verify → allow / block) lives there, single-sourced; this runner
 * only maps its {@link StopGuardResult} to a {@link HookRunResult} (`output` to stdout at exit 0 —
 * the `decision` field in that JSON is the allow/block signal; no stderr, no exit 2: this hook is
 * Claude-Code-only, and Claude Code discards stdout JSON at exit 2). Payload channels
 * (Claude Code `transcript_path` + `stop_hook_active` loop guard; omp `agent_end` `messages`; the
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

// ── sp/context-* hooks (indexed-context token ledger, all fail-open) ─────────

const OK: HookRunResult = { output: '', exitCode: 0 };

/** Resolve `.spur/context/` under the project dir the agent anchors to. */
function spurContextDir(env: NodeJS.ProcessEnv): string {
    return join(env.CLAUDE_PROJECT_DIR ?? process.cwd(), '.spur', 'context');
}

interface SpurSession {
    id: string;
    path: string;
}

/** Extract the stable host session identity carried by lifecycle/tool hook payloads. */
function payloadSessionIdentity(stdinText: string): string {
    try {
        const payload = JSON.parse(stdinText) as Record<string, unknown>;
        if (typeof payload.session_id === 'string' && payload.session_id.length > 0) return payload.session_id;
        if (typeof payload.transcript_path === 'string' && payload.transcript_path.length > 0) {
            return payload.transcript_path;
        }
    } catch {
        // Hooks without a payload use the single-session compatibility fallback below.
    }
    return '';
}

function sessionPathForIdentity(dir: string, identity: string): string {
    const key = createHash('sha256').update(identity).digest('hex').slice(0, 16);
    return join(dir, `.session-${key}.json`);
}

function existingSessionPaths(dir: string): string[] {
    try {
        return readdirSync(dir)
            .filter((name) => /^\.session-[a-f0-9]{16}\.json$/.test(name))
            .sort()
            .map((name) => join(dir, name));
    } catch {
        return [];
    }
}

/** Resolve the payload's session, falling back only when exactly one session is active. */
function readSpurSession(dir: string, stdinText: string): SpurSession | null {
    const identity = payloadSessionIdentity(stdinText);
    const existingSessions = identity ? [] : existingSessionPaths(dir);
    const sessionFile = identity ? sessionPathForIdentity(dir, identity) : existingSessions[0];
    if (!sessionFile || (!identity && existingSessions.length !== 1) || !existsSync(sessionFile)) return null;
    try {
        const data = JSON.parse(readFileSync(sessionFile, 'utf-8'));
        if (typeof data === 'object' && data !== null && 'session' in data && typeof data.session === 'string') {
            return { id: data.session, path: sessionFile };
        }
        return null;
    } catch {
        return null;
    }
}

/** PostToolUse (matcher Read|Write|Edit): append one token-estimate event to the ledger. */
const spContextPostTool: HookRunner = {
    async run(env, stdinText) {
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

        const session = readSpurSession(dir, stdinText);
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

        const event: Record<string, unknown> = { ts, session: session.id, type, file: filePath, tokens };
        if (action) event.action = action;

        try {
            appendFileSync(join(dir, 'token-ledger.jsonl'), `${JSON.stringify(event)}\n`);
        } catch {
            // fail-open: a broken ledger must never wedge the agent
        }

        // F4 (task 0127 R4): the ledger append above is the only bookkeeping here. The former
        // read-modify-write of running counters on the session JSON lost increments under
        // concurrent PostToolUse processes; Stop now aggregates the ledger instead.
        return OK;
    },
};

/** SessionStart: create a payload-scoped session file and append `session_start`. */
const spContextSessionStart: HookRunner = {
    async run(env, stdinText) {
        const dir = spurContextDir(env);
        try {
            mkdirSync(dir, { recursive: true });
        } catch {
            return OK;
        }

        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, '0');
        const identity = payloadSessionIdentity(stdinText);
        const sessionId =
            identity ||
            `session-${now.toISOString().slice(0, 10)}-${pad(now.getHours())}${pad(now.getMinutes())}-${randomUUID().slice(0, 8)}`;
        const sessionFile = sessionPathForIdentity(dir, identity || sessionId);
        const ts = now.toISOString();

        try {
            // F4 (task 0127 R4): identity/start marker only — running counters were removed.
            // Totals are computed by Stop from the append-only ledger.
            writeFileSync(sessionFile, JSON.stringify({ session: sessionId, started: ts }));
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

/** Stop: aggregate totals from the append-only ledger, append `session_end`, then clean up. */
const spContextSessionStop: HookRunner = {
    async run(env, stdinText) {
        const dir = spurContextDir(env);
        const session = readSpurSession(dir, stdinText);
        if (!session) return OK;
        const sessionFile = session.path;

        let sessionId = '';
        try {
            const data = JSON.parse(readFileSync(sessionFile, 'utf-8')) as Record<string, unknown>;
            if (typeof data.session !== 'string' || data.session.length === 0) return OK;
            sessionId = data.session;
        } catch {
            return OK;
        }

        // F4 (task 0127 R4): the append-only ledger is the sole source for totals. One bounded
        // scan per session replaces the removed running counters (which concurrent PostToolUse
        // writers corrupted). Only parseable read/write events whose session exactly matches
        // count; malformed lines, unrelated sessions, and non-event rows are skipped.
        let reads = 0;
        let writes = 0;
        let tokens = 0;
        const ledgerPath = join(dir, 'token-ledger.jsonl');
        if (existsSync(ledgerPath)) {
            for (const line of readFileSync(ledgerPath, 'utf-8').split('\n')) {
                if (!line.trim()) continue;
                try {
                    const evt = JSON.parse(line) as Record<string, unknown>;
                    if (evt.session !== sessionId) continue;
                    if (evt.type === 'read') reads++;
                    else if (evt.type === 'write') writes++;
                    else continue;
                    if (typeof evt.tokens === 'number') tokens += evt.tokens;
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
            const code = await hookRun(plugin, hookId, process.env, stdinText, profile);
            process.exit(code);
        });
}
