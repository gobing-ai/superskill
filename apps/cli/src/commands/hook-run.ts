import { readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { assertSafePathSegment, getEnvVars } from '@gobing-ai/superskill-core';
import { NodeProcessExecutor, type PipeProcess, type ProcessExecutor } from '@gobing-ai/ts-runtime';
import { echo, echoError } from '@gobing-ai/ts-utils';
import type { Command } from 'commander';
import { runStopGuard, type StopProfile } from '../../../../plugins/cc/scripts/anti-hallucination/ah_guard';
import {
    detectHookHost,
    hookEventOf,
    isPreToolUseAllow,
    neutralFromClaudePreToolUse,
    normalizeHookPayload,
    parseNeutralResult,
    preToolUseByExitCode,
    translateHookResult,
} from '../hook-host';
import { flattenCanonicalHookEntries, hookRunKey } from '../hooks';
import { readStdinNonBlocking } from '../stdin';
import { cliVersion } from '../version';

/**
 * `superskill hook run <plugin> <hook-id>` — the cross-agent hook runtime trigger.
 *
 * Installed hook configs call a stable PATH command (`superskill hook run …`) instead of a
 * plugin-checkout script path or a Claude-only `${CLAUDE_PLUGIN_ROOT}` reference. The dispatcher
 * holds no plugin-specific logic. It tries, in order:
 *
 * 1. A first-party built-in {@link HookRunner} compiled into the CLI (only this repo's own `cc`
 *    plugin registers one).
 * 2. The hook script the plugin ships — `hooks/<id>.{ts,mjs,js}` or `scripts/hooks/<id>.{ts,mjs,js}`
 *    under the installed plugin root ({@link resolveHookScript}). It runs under Bun with the host
 *    payload on stdin and its stdout, stderr and exit code are forwarded ({@link runHookScript}).
 * 3. Nothing found: fail **open** (exit 0 + stderr warning naming the hook and the installed CLI
 *    version). An unresolvable id is deployment skew, not a policy violation — blocking here turns
 *    skew into blocked Stops and agent loops.
 *
 * Runners signal: allow → exit 0 (empty stdout, or a Stop runner's canonical JSON). A block takes
 * the channel each host renders cleanly: stdout JSON at exit 0 (`decision:"block"` for
 * Claude/Codex/Hermes Stop, `decision:"deny"` for Gemini/Antigravity, `permissionDecision:"deny"`
 * for PreToolUse), or exit 2 + stderr. Claude Code treats exit 1 as a non-blocking error and honors
 * stdout JSON only at exit 0. A script answers host-neutrally (`{"decision":"deny","reason":"…"}`)
 * and the host adapter layer (`../hook-host`) renders that for Claude Code, Codex, omp or Pi.
 */

interface HookRunResult {
    /** JSON string written verbatim to stdout (empty string writes nothing). */
    output: string;
    /** Optional diagnostic written to stderr (a fail-open cause, or the script's own stderr). */
    stderr?: string;
    /** Process exit code; 0 for allow and for a JSON-carried block, 2 for an exit-code block. */
    exitCode: number;
}

interface HookRunner {
    run(env: NodeJS.ProcessEnv, stdinText: string, profile?: StopProfile): Promise<HookRunResult>;
}

/** Process execution port for hook scripts (no-direct-process-spawn: routed via ts-runtime). */
const hookProcessExecutor: ProcessExecutor = new NodeProcessExecutor();

// ── Plugin hook scripts: id → script resolution ─────────────────────────────

/** Where a plugin root candidate came from (reported in diagnostics and tests). */
export type PluginRootSource = 'env' | 'claude-plugin-root' | 'claude-cache' | 'omp-cache' | 'grok' | 'staged';

/** A resolved hook script. */
export interface ResolvedHookScript {
    /** Absolute path of the script file. */
    script: string;
    /** The plugin root it was found under (exported to the script as `SUPERSKILL_PLUGIN_ROOT`). */
    root: string;
    source: PluginRootSource;
}

/** Filesystem anchors for resolution; injectable for tests. */
export interface HookScriptLocation {
    /** User home (defaults to `HOME_DIR`, then the OS home). */
    home?: string;
    /** Project root (defaults to `CLAUDE_PROJECT_DIR`, then the process cwd). */
    cwd?: string;
}

/** Extensions tried for `<id>`, in order. Bun runs all three. */
const HOOK_SCRIPT_EXTENSIONS = ['.ts', '.mjs', '.js'] as const;
/** Directories under a plugin root that may hold hook entrypoints, in order. */
const HOOK_SCRIPT_DIRS = [['hooks'], ['scripts', 'hooks']] as const;

function isFile(path: string): boolean {
    try {
        return statSync(path).isFile();
    } catch {
        return false;
    }
}

function isDir(path: string): boolean {
    try {
        return statSync(path).isDirectory();
    } catch {
        return false;
    }
}

function listDir(path: string): string[] {
    try {
        return readdirSync(path);
    } catch {
        return [];
    }
}

/** Numeric compare for version dirs like `0.4.1` (non-numeric segments sort lowest). */
function compareVersions(a: string, b: string): number {
    const pa = a.split('.').map((p) => Number.parseInt(p, 10));
    const pb = b.split('.').map((p) => Number.parseInt(p, 10));
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const va = Number.isNaN(pa[i] ?? Number.NaN) ? -1 : (pa[i] as number);
        const vb = Number.isNaN(pb[i] ?? Number.NaN) ? -1 : (pb[i] as number);
        if (va !== vb) return va - vb;
    }
    return 0;
}

/** Plugin names declared by the root's manifests (`plugin.json`, `.claude-plugin/plugin.json`). */
function manifestNames(root: string): string[] {
    const names: string[] = [];
    for (const manifest of [join(root, 'plugin.json'), join(root, '.claude-plugin', 'plugin.json')]) {
        try {
            const name = (JSON.parse(readFileSync(manifest, 'utf-8')) as { name?: unknown }).name;
            if (typeof name === 'string') names.push(name);
        } catch {
            // absent or unreadable manifest
        }
    }
    return names;
}

/**
 * True when `root` may serve `plugin`: it is a directory, and no manifest in it names a different
 * plugin. An env-provided root (`CLAUDE_PLUGIN_ROOT`, `SUPERSKILL_PLUGIN_ROOT`) is inherited by
 * child processes, so the name check keeps one plugin's root from serving another plugin's hooks.
 */
function rootServesPlugin(root: string, plugin: string): boolean {
    if (!isDir(root)) return false;
    const names = manifestNames(root);
    return names.length === 0 || names.includes(plugin);
}

/**
 * Ordered plugin-root candidates for `plugin`:
 *
 * 1. `SUPERSKILL_PLUGIN_ROOT` — explicit override (a dev checkout, tests).
 * 2. `CLAUDE_PLUGIN_ROOT` — set by Claude Code for plugin hook commands.
 * 3. Claude Code plugin cache `<CLAUDE_CONFIG_DIR|~/.claude>/plugins/cache/<marketplace>/<plugin>/<version>/`,
 *    newest version first.
 * 4. omp plugin cache `<project|home>/.omp/plugins/cache/plugins/<plugin>___<marketplace>___<version>/`.
 * 5. Grok `~/.grok/installed-plugins/<plugin>-<hash>/` (manifest name must match).
 * 6. Staged scripts roots `<project|home>/.agents/scripts/<plugin>/` (rulesync/hermes targets);
 *    only the `hooks/` subdirectory of a staged root is searched (see {@link resolveHookScript}).
 */
export function pluginRootCandidates(
    plugin: string,
    env: NodeJS.ProcessEnv,
    location: HookScriptLocation = {},
): Array<{ root: string; source: PluginRootSource }> {
    const home = location.home ?? env.HOME_DIR ?? homedir();
    const cwd = location.cwd ?? (env.CLAUDE_PROJECT_DIR || process.cwd());
    const out: Array<{ root: string; source: PluginRootSource }> = [];
    const add = (root: string, source: PluginRootSource) => {
        if (rootServesPlugin(root, plugin) && !out.some((c) => c.root === root)) out.push({ root, source });
    };

    if (env.SUPERSKILL_PLUGIN_ROOT) add(env.SUPERSKILL_PLUGIN_ROOT, 'env');
    if (env.CLAUDE_PLUGIN_ROOT) add(env.CLAUDE_PLUGIN_ROOT, 'claude-plugin-root');

    const claudeCache = join(env.CLAUDE_CONFIG_DIR ?? join(home, '.claude'), 'plugins', 'cache');
    const claudeHits: Array<{ version: string; root: string }> = [];
    for (const marketplace of listDir(claudeCache)) {
        for (const version of listDir(join(claudeCache, marketplace, plugin))) {
            claudeHits.push({ version, root: join(claudeCache, marketplace, plugin, version) });
        }
    }
    for (const hit of claudeHits.sort((a, b) => compareVersions(b.version, a.version))) add(hit.root, 'claude-cache');

    for (const scope of [...new Set([cwd, home])]) {
        const ompCache = join(scope, '.omp', 'plugins', 'cache', 'plugins');
        const prefix = `${plugin}___`;
        const hits = listDir(ompCache)
            .filter((name) => name.startsWith(prefix))
            .map((name) => ({ version: name.split('___')[2] ?? '', root: join(ompCache, name) }));
        for (const hit of hits.sort((a, b) => compareVersions(b.version, a.version))) add(hit.root, 'omp-cache');
    }

    const grokDir = join(home, '.grok', 'installed-plugins');
    for (const name of listDir(grokDir)) {
        const root = join(grokDir, name);
        if (name.startsWith(`${plugin}-`) && manifestNames(root).includes(plugin)) add(root, 'grok');
    }

    for (const scope of [...new Set([cwd, home])]) add(join(scope, '.agents', 'scripts', plugin), 'staged');
    return out;
}

/**
 * Resolve `<plugin>/<id>` to the hook script the plugin ships. Convention (no `hooks.json` field
 * needed, so hosts that read `hooks.json` verbatim never see an unknown key): the first regular file
 * among `hooks/<id>.ts|.mjs|.js`, then `scripts/hooks/<id>.ts|.mjs|.js`, under each root of
 * {@link pluginRootCandidates} in order. A staged scripts root already *is* the plugin's `scripts/`
 * directory, so only its `hooks/` subdirectory is searched. Returns null when nothing matches or
 * when `plugin`/`id` is not a single safe path segment.
 */
export function resolveHookScript(
    plugin: string,
    id: string,
    env: NodeJS.ProcessEnv,
    location: HookScriptLocation = {},
): ResolvedHookScript | null {
    try {
        assertSafePathSegment(plugin, 'plugin name');
        assertSafePathSegment(id, 'hook id');
    } catch {
        return null;
    }
    for (const { root, source } of pluginRootCandidates(plugin, env, location)) {
        const dirs = source === 'staged' ? [['hooks']] : HOOK_SCRIPT_DIRS;
        for (const dir of dirs) {
            for (const ext of HOOK_SCRIPT_EXTENSIONS) {
                const script = join(root, ...dir, `${id}${ext}`);
                if (isFile(script)) return { script, root, source };
            }
        }
    }
    return null;
}

// ── Plugin hook scripts: execution ──────────────────────────────────────────

/** Deadline when the plugin's `hooks.json` declares no timeout for the id. */
export const DEFAULT_HOOK_TIMEOUT_MS = 10_000;
/** Head start taken off a declared host timeout, so `hook run` fails open before the host kills it. */
export const HOOK_TIMEOUT_MARGIN_MS = 500;

/**
 * Kill deadline for `<plugin>/<id>`. `SUPERSKILL_HOOK_TIMEOUT_MS` (positive integer) wins. Otherwise
 * the smallest `timeout` (seconds) that the root's `hooks.json` (`hooks/hooks.json` or `hooks.json`)
 * declares for a `superskill hook run <plugin> <id>` entry, minus {@link HOOK_TIMEOUT_MARGIN_MS}
 * (floor 1 s) — the host kills the hook at that timeout, and a kill skips the fail-open path.
 * Otherwise {@link DEFAULT_HOOK_TIMEOUT_MS}.
 */
export function hookScriptTimeoutMs(root: string, plugin: string, id: string, env: NodeJS.ProcessEnv): number {
    const override = Number(env.SUPERSKILL_HOOK_TIMEOUT_MS);
    if (Number.isInteger(override) && override > 0) return override;
    let declared: number | undefined;
    for (const file of [join(root, 'hooks', 'hooks.json'), join(root, 'hooks.json')]) {
        let config: { hooks?: Record<string, unknown> };
        try {
            config = JSON.parse(readFileSync(file, 'utf-8')) as { hooks?: Record<string, unknown> };
        } catch {
            continue;
        }
        for (const defs of Object.values(config.hooks ?? {})) {
            if (!Array.isArray(defs)) continue;
            for (const entry of flattenCanonicalHookEntries(defs)) {
                if (hookRunKey(entry.command) !== `${plugin}/${id}`) continue;
                if (typeof entry.timeout === 'number' && entry.timeout > 0) {
                    declared = Math.min(declared ?? entry.timeout, entry.timeout);
                }
            }
        }
        break;
    }
    if (declared === undefined) return DEFAULT_HOOK_TIMEOUT_MS;
    return Math.max(declared * 1000 - HOOK_TIMEOUT_MARGIN_MS, 1000);
}

/**
 * The Bun runtime that executes a hook script. superskill itself runs under Bun: the npm bundle via
 * its `bun` shebang, the standalone binary as an embedded Bun. A plain Bun process reuses its own
 * executable; a standalone binary prefers `bun` on `PATH`, else re-enters itself as Bun
 * (`BUN_BE_BUN=1`).
 */
export function hookScriptRuntime(env: NodeJS.ProcessEnv): { command: string; env: Record<string, string> } {
    if (!process.versions.bun) return { command: 'bun', env: {} };
    const compiled = import.meta.path.startsWith('/$bunfs/') || import.meta.path.includes('~BUN');
    if (!compiled) return { command: process.execPath, env: {} };
    const onPath = Bun.which('bun', { PATH: env.PATH ?? '' });
    return onPath ? { command: onPath, env: {} } : { command: process.execPath, env: { BUN_BE_BUN: '1' } };
}

function childEnv(env: NodeJS.ProcessEnv, extra: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(env)) if (value !== undefined) out[key] = value;
    return { ...out, ...extra };
}

/** Options for {@link runHookScript}. */
export interface RunHookScriptOptions {
    plugin: string;
    id: string;
    resolved: ResolvedHookScript;
    timeoutMs: number;
    profile?: StopProfile;
    executor?: ProcessExecutor;
}

/**
 * Run a resolved plugin hook script: `bun <script>` in the host's cwd, with the normalized payload
 * on stdin ({@link normalizeHookPayload}) and `SUPERSKILL_PLUGIN_ROOT` (the root it resolved under),
 * `SUPERSKILL_HOOK_ID`, `SUPERSKILL_HOOK_HOST`, `SUPERSKILL_HOOK_EVENT` and `SUPERSKILL_HOOK_PROFILE`
 * in its environment.
 *
 * - exit 0 + a host-neutral `{"decision",…}` on stdout → rendered for the host
 *   ({@link translateHookResult}); exit 0 + Claude-native JSON → verbatim on Claude Code (a bare
 *   PreToolUse allow is dropped — {@link isPreToolUseAllow}), PreToolUse decisions re-expressed elsewhere ({@link preToolUseByExitCode}); exit 0 + anything else → forwarded.
 * - exit 2 → the block signal: stdout, stderr and exit 2 forwarded.
 * - spawn failure, deadline hit (child killed), or any other exit status → fail open: exit 0, no
 *   stdout, one stderr line naming the hook and the cause, then the script's own stderr.
 */
export async function runHookScript(
    env: NodeJS.ProcessEnv,
    stdinText: string,
    options: RunHookScriptOptions,
): Promise<HookRunResult> {
    const { plugin, id, resolved, timeoutMs } = options;
    const executor = options.executor ?? hookProcessExecutor;
    const failOpen = (cause: string, detail = ''): HookRunResult => ({
        output: '',
        exitCode: 0,
        stderr: `superskill hook run ${plugin} ${id}: ${cause}; failing open (exit 0).${detail ? `\n${detail}` : ''}`,
    });
    const runtime = hookScriptRuntime(env);
    const host = detectHookHost(env);
    const payload = normalizeHookPayload(stdinText, env);
    const event = hookEventOf(payload, env);
    const extra: Record<string, string> = {
        ...runtime.env,
        SUPERSKILL_PLUGIN_ROOT: resolved.root,
        SUPERSKILL_HOOK_ID: id,
        SUPERSKILL_HOOK_HOST: host,
        SUPERSKILL_HOOK_PROFILE: options.profile ?? 'block',
        ...(event ? { SUPERSKILL_HOOK_EVENT: event } : {}),
    };
    let child: PipeProcess;
    try {
        child = executor.runStreaming({
            command: runtime.command,
            args: [resolved.script],
            env: childEnv(env, extra),
            envMode: 'replace',
        });
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        return failOpen(code === 'ENOENT' ? `runtime '${runtime.command}' not found (install bun)` : 'spawn failed');
    }
    try {
        child.writeStdin(payload);
        child.endStdin();
    } catch {
        // the script may exit before reading stdin; its exit status decides below
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => resolve('timeout'), timeoutMs);
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
        return failOpen(`${resolved.script} timed out after ${timeoutMs} ms`);
    }
    const [exitCode, stdout, stderr] = outcome;
    const trimmedErr = stderr.trim();
    if (exitCode !== 0 && exitCode !== 2) {
        return failOpen(`${resolved.script} exited ${exitCode ?? 'by signal'}`, trimmedErr.slice(0, 2000));
    }
    const output = stdout.replace(/\n+$/, '');
    const withScriptErr = (r: HookRunResult): HookRunResult => {
        const err = [r.stderr, trimmedErr].filter(Boolean).join('\n');
        return err ? { ...r, stderr: err } : { output: r.output, exitCode: r.exitCode };
    };
    if (exitCode === 0) {
        const neutral = parseNeutralResult(output) ?? (host === 'pi' ? neutralFromClaudePreToolUse(output) : null);
        if (neutral) return withScriptErr(translateHookResult(neutral, host, event, options.profile));
        // Legacy: Claude-native JSON. Verbatim on Claude Code, minus a bare PreToolUse allow (it
        // would auto-approve the call); elsewhere re-express the PreToolUse decision as an exit code.
        if (host === 'claude' && isPreToolUseAllow(output)) return withScriptErr({ output: '', exitCode: 0 });
        const adapted = host === 'claude' ? null : preToolUseByExitCode(output);
        if (adapted) return withScriptErr(adapted);
    }
    return withScriptErr({ output, exitCode });
}

// ── cc/anti-hallucination (first-party built-in) ────────────────────────────
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

/**
 * First-party built-in runners, compiled into the CLI (ADR-022). Only this repo's own plugin
 * registers here; every other plugin's hooks resolve to the scripts the plugin ships.
 */
const HOOK_RUNNERS: Record<string, HookRunner> = {
    'cc/anti-hallucination': ccAntiHallucination,
};

/** Resolve and run a hook, writing its output to stdout and returning the exit code. */
export async function hookRun(
    plugin: string,
    hookId: string,
    env: NodeJS.ProcessEnv,
    stdinText: string,
    profile?: StopProfile,
    location: HookScriptLocation = {},
): Promise<number> {
    let result: HookRunResult;
    const runner = HOOK_RUNNERS[`${plugin}/${hookId}`];
    if (runner) {
        result = await runner.run(env, stdinText, profile);
    } else {
        const resolved = resolveHookScript(plugin, hookId, env, location);
        if (!resolved) {
            // Fail open: no built-in runner and no hook script means plugin/CLI skew or an
            // incomplete install, not a policy violation. Blocking here would turn skew into
            // blocked Stops and stuck agent loops. Warn loudly and allow.
            echoError(
                `Warning: unknown hook '${plugin} ${hookId}' (superskill ${cliVersion}): no built-in runner ` +
                    `and no hooks/${hookId}.{ts,mjs,js} or scripts/hooks/${hookId}.{ts,mjs,js} under an ` +
                    `installed '${plugin}' plugin root (set SUPERSKILL_PLUGIN_ROOT to point at one). ` +
                    `Built-in hooks: ${Object.keys(HOOK_RUNNERS).join(', ')}. Failing open (exit 0).`,
            );
            return 0;
        }
        result = await runHookScript(env, stdinText, {
            plugin,
            id: hookId,
            resolved,
            timeoutMs: hookScriptTimeoutMs(resolved.root, plugin, hookId, env),
            profile,
        });
    }
    // WHY conditional: echo('') writes '\n' (writeLine always appends a newline). A bare newline
    // on stdout makes Codex try to parse it as JSON and fail open noisily. Only emit when non-empty.
    if (result.output) echo(result.output);
    if (result.stderr) echoError(result.stderr);
    return result.exitCode;
}

/** Register `superskill hook run <plugin> <hook-id>` under the hook command group. */
export function registerHookRun(cmd: Command, readInput?: () => string): void {
    cmd.command('run <plugin> <hook-id>')
        .description("Run a plugin hook: a built-in runner, else the plugin's own hooks/<hook-id> script")
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
