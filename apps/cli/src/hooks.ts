import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { StopProfile } from '../../../plugins/cc/scripts/anti-hallucination/ah_guard';

/**
 * Canonical hook event names (camelCase) that map to Pi lifecycle events.
 *
 * Pi extensions subscribe via `pi.on(eventName, handler)`. The `@vahor/pi-hooks`
 * package exposes a declarative `.pi/hooks.json` that accepts snake_case event
 * names corresponding to Pi's lifecycle events.
 *
 * Source: https://pi.dev/packages/@vahor/pi-hooks (v0.0.11, 2026-05-23)
 *         https://pt-act-pi-mono.mintlify.app/api/coding-agent/hooks
 */
export const CANONICAL_HOOK_EVENTS: Partial<Record<string, string>> = {
    sessionStart: 'session_start',
    sessionEnd: 'session_shutdown',
    preToolUse: 'tool_call',
    postToolUse: 'tool_result',
    stop: 'agent_end',
    preCompact: 'session_before_compact',
};

/** Canonical event names that map to the `hooks/pre/` directory (vs `hooks/post/`). */
export const CANONICAL_PRE_TOOL_EVENTS: Record<string, true> = {
    preToolUse: true,
    sessionStart: true,
    preCompact: true,
};

/** OMP events whose handler can return `{ block: true, reason }` to prevent execution. */
export const BLOCKABLE_OMP_EVENTS: Record<string, true> = {
    tool_call: true,
};

/** One flattened hook entry emitted by {@link flattenCanonicalHookEntries}. */
export interface FlattenedCanonicalHookEntry {
    /** Matcher string (`*` when absent). Preserved for downstream regex synthesis. */
    matcher: string;
    type?: string;
    command?: string;
    timeout?: number;
}

/**
 * Walk canonical hook definitions and yield a flat stream, resolving the two on-disk
 * shapes (matcher-wrapped `hooks[]` vs flat `type/command`). This is the single source
 * of truth for nested-vs-flat handling used by Pi conversion, OMP conversion, and
 * Hermes merge deduplication.
 */
export function* flattenCanonicalHookEntries(
    definitions: CanonicalHookDefinition[],
): Generator<FlattenedCanonicalHookEntry> {
    for (const def of definitions) {
        const matcher = def.matcher ?? '*';
        const entries = Array.isArray(def.hooks) && def.hooks.length > 0 ? def.hooks : [def];
        for (const entry of entries) {
            yield { matcher, type: entry.type, command: entry.command, timeout: entry.timeout };
        }
    }
}

interface CanonicalHookEntry {
    type?: string;
    command?: string;
    timeout?: number;
    [k: string]: unknown;
}
interface CanonicalHookDefinition {
    matcher?: string;
    hooks?: CanonicalHookEntry[];
    type?: string;
    command?: string;
    timeout?: number;
    [k: string]: unknown;
}

interface CanonicalHooksConfig {
    version?: number;
    /**
     * Floor CLI version for these hooks. `superskill install` compares this against the installed
     * CLI version and, if the CLI is older, warns and skips hook emission entirely (skills/commands
     * still install) rather than emitting hooks that call a `superskill hook run <id>` the old CLI
     * treats as unknown. Semver-ish: missing/invalid = no floor; prerelease tags compared as-is.
     */
    minCliVersion?: string;
    hooks?: Record<string, CanonicalHookDefinition[]>;
}

type PiHookEntry = string | { command: string; timeout?: number };

/**
 * Convert rulesync-canonical hooks to `@vahor/pi-hooks` format.
 *
 * Canonical format: camelCase event names with `{ type, command, matcher }` entries.
 * `@vahor/pi-hooks` format: snake_case event names with string commands or
 * `{ command, timeout }` objects.
 *
 * Limitation: `@vahor/pi-hooks` fires `tool_call`/`tool_result` for all tools without
 * matcher filtering. Matchers are dropped; full matcher enforcement requires
 * `@hsingjui/pi-hooks` or a superskill-shipped extension (design §1.2, rung b).
 */
export function convertCanonicalToPiHooks(config: CanonicalHooksConfig): Record<string, PiHookEntry[]> {
    const piHooks: Record<string, PiHookEntry[]> = {};
    for (const [rawEvent, definitions] of Object.entries(config.hooks ?? {})) {
        const canonicalEvent = rawEvent.charAt(0).toLowerCase() + rawEvent.slice(1);
        const targetEvent = CANONICAL_HOOK_EVENTS[canonicalEvent];
        if (!targetEvent) continue;
        for (const { type, command, timeout } of flattenCanonicalHookEntries(definitions)) {
            if ((type && type !== 'command') || !command) continue;
            const entry: PiHookEntry = timeout ? { command, timeout } : command;
            if (!piHooks[targetEvent]) piHooks[targetEvent] = [];
            piHooks[targetEvent].push(entry);
        }
    }
    return piHooks;
}

/**
 * Read the canonical `hooks.json` from the given `.rulesync` directory.
 * Returns `null` when the file is absent or unparseable.
 *
 * @param rulesyncDir - Path to the `.rulesync` directory (the one containing `hooks.json`)
 */
export function readCanonicalHooks(rulesyncDir: string): CanonicalHooksConfig | null {
    const hooksPath = join(rulesyncDir, 'hooks.json');
    if (!existsSync(hooksPath)) return null;
    try {
        return JSON.parse(readFileSync(hooksPath, 'utf-8')) as CanonicalHooksConfig;
    } catch {
        return null;
    }
}

// ── Per-target hook gating (which targets a hook enforces on) ─────────────────
/**
 * Per-target emit policy for hooks that cannot run on every target. Keyed by `<plugin>/<hookId>`,
 * parsed from the canonical command `superskill hook run <plugin> <hookId> …`. A hook listed here
 * emits ONLY to the named targets (each with its prevent-stop {@link StopProfile}); a target not
 * listed for a policyed hook is dropped. A hook with NO policy entry emits everywhere (the
 * backward-compatible default). Kept here — not in `hooks.json` — so native consumers (Claude/Grok)
 * that read `hooks/hooks.json` verbatim never see an unknown field.
 */
export const HOOK_TARGET_POLICY: Record<string, Record<string, { profile: StopProfile }>> = {
    // cc/anti-hallucination (Stop): only targets that can prevent stop. OpenCode/omp/pi/Grok
    // cannot (architectural), so they are absent and emit nothing. Antigravity/Gemini use
    // `decision:"deny"` (AfterAgent); Claude/Codex/Hermes use `decision:"block"`.
    'cc/anti-hallucination': {
        claude: { profile: 'block' },
        codex: { profile: 'block' },
        'antigravity-cli': { profile: 'deny' },
        'antigravity-ide': { profile: 'deny' },
        hermes: { profile: 'block' },
    },
};

const HOOK_RUN_PREFIX = ['superskill', 'hook', 'run'] as const;

/** Derive `<plugin>/<hookId>` from a `superskill hook run <plugin> <hookId> …` command, else ''. */
export function hookRunKey(command: unknown): string {
    if (typeof command !== 'string') return '';
    const tokens = command.trim().split(/\s+/);
    if (
        tokens.length < 5 ||
        tokens[0] !== HOOK_RUN_PREFIX[0] ||
        tokens[1] !== HOOK_RUN_PREFIX[1] ||
        tokens[2] !== HOOK_RUN_PREFIX[2]
    )
        return '';
    return `${tokens[3]}/${tokens[4]}`;
}

/**
 * Filter + transform canonical hooks for `target` per {@link HOOK_TARGET_POLICY}. Drops hooks whose
 * policy excludes the target; appends `--profile <p>` when the target's profile isn't the default
 * `block`. Hooks with no policy entry pass through unchanged. Returns a NEW config; both the
 * matcher-wrapped (`{ matcher, hooks: [...] }`) and flat entry shapes are preserved.
 */
export function applyHookTargetPolicy(config: CanonicalHooksConfig, target: string): CanonicalHooksConfig {
    if (!config.hooks) return config;
    const out: Record<string, CanonicalHookDefinition[]> = {};
    for (const [event, defs] of Object.entries(config.hooks)) {
        const keptDefs: CanonicalHookDefinition[] = [];
        for (const def of defs) {
            const wrapped = def.hooks !== undefined && def.hooks.length > 0;
            const entries: CanonicalHookEntry[] = def.hooks && def.hooks.length > 0 ? def.hooks : [def];
            const keptEntries: CanonicalHookEntry[] = [];
            for (const entry of entries) {
                const policy = HOOK_TARGET_POLICY[hookRunKey(entry.command)];
                if (!policy) {
                    keptEntries.push(entry); // no policy → emit everywhere
                    continue;
                }
                const t = policy[target];
                if (!t) continue; // target not allowed → drop
                if (t.profile !== 'block' && typeof entry.command === 'string') {
                    keptEntries.push({ ...entry, command: `${entry.command} --profile ${t.profile}` });
                } else {
                    keptEntries.push(entry);
                }
            }
            if (keptEntries.length > 0) {
                keptDefs.push(
                    wrapped
                        ? ({ ...def, hooks: keptEntries } as CanonicalHookDefinition)
                        : (keptEntries[0] as CanonicalHookDefinition),
                );
            }
        }
        if (keptDefs.length > 0) out[event] = keptDefs;
    }
    return { ...config, hooks: out };
}

/** Read `<rulesyncDir>/hooks.json`, apply {@link applyHookTargetPolicy} for `target`, write it back. */
export function writeHooksForTarget(rulesyncDir: string, target: string): void {
    const config = readCanonicalHooks(rulesyncDir);
    if (!config?.hooks) return;
    writeFileSync(
        join(rulesyncDir, 'hooks.json'),
        `${JSON.stringify(applyHookTargetPolicy(config, target), null, 4)}\n`,
    );
}

/** Options controlling how {@link emitPiStyleHooks} and {@link emitHermesHooks} write hooks. */
export interface EmitHooksOptions {
    dryRun: boolean;
    global: boolean;
}

/** Outcome of an emit operation — what was written (or would be, in dry-run). */
export interface EmitHooksResult {
    target: string;
    emitted: boolean;
    count: number;
    message: string;
    /** Path where hooks were written (or would be in dry-run). */
    path?: string;
}

/**
 * Merge new Pi-style hooks into an existing hooks.json with plugin ownership reconciliation.
 *
 * Reconciles the installing plugin's generated state: entries previously generated for `plugin`
 * are removed across all events before new hooks are merged. Events that become empty are removed.
 * Deduplicated by command string so re-installing the same plugin is idempotent.
 * Unowned/user entries and other plugins' entries are preserved.
 *
 * Returns the merged `{ event: PiHookEntry[] }` map ready to write back.
 */
function mergePiHooks(
    hooksPath: string,
    newHooks: Record<string, PiHookEntry[]>,
    plugin: string,
): Record<string, PiHookEntry[]> {
    let existing: Record<string, PiHookEntry[]> = {};
    if (existsSync(hooksPath)) {
        try {
            const raw = JSON.parse(readFileSync(hooksPath, 'utf-8'));
            if (raw && typeof raw.hooks === 'object' && raw.hooks !== null) {
                existing = raw.hooks as Record<string, PiHookEntry[]>;
            }
        } catch {
            // Corrupt or unparseable hooks.json — start fresh rather than crash.
            existing = {};
        }
    }

    const commandOf = (entry: PiHookEntry): string => (typeof entry === 'string' ? entry : entry.command);

    // Prune existing entries owned by `plugin` across all events
    const pruned: Record<string, PiHookEntry[]> = {};
    for (const [event, entries] of Object.entries(existing)) {
        if (!Array.isArray(entries)) continue;
        const kept = entries.filter((entry) => {
            const cmd = commandOf(entry);
            const key = hookRunKey(cmd);
            return !key.startsWith(`${plugin}/`);
        });
        if (kept.length > 0) {
            pruned[event] = kept;
        }
    }

    const merged: Record<string, PiHookEntry[]> = { ...pruned };
    for (const [event, entries] of Object.entries(newHooks)) {
        if (!Array.isArray(entries)) continue;
        const ex = merged[event] ?? [];
        const seen = new Set<string>();
        const acc: PiHookEntry[] = [];
        for (const entry of [...ex, ...entries]) {
            const cmd = commandOf(entry);
            if (seen.has(cmd)) continue;
            seen.add(cmd);
            acc.push(entry);
        }
        if (acc.length > 0) merged[event] = acc;
    }
    return merged;
}

/**
 * Emit hooks for Pi or omp (both use the `@vahor/pi-hooks` format).
 *
 * Rung (b): superskill emits the config; `@vahor/pi-hooks` (installed by the user)
 * is the shim that reads it. The install output documents this dependency.
 *
 * @param rulesyncDir - Path to the `.rulesync` directory (containing `hooks.json`)
 * @param outputRoot - The output root (project dir or homedir)
 * @param targetDir  - The target's config directory (`.pi` or `.omp`)
 * @param targetName - Human-readable target name for messages
 * @param options    - Dry-run and global installation options
 * @param plugin     - Installing plugin identifier for ownership reconciliation
 */
export function emitPiStyleHooks(
    rulesyncDir: string,
    outputRoot: string,
    targetDir: string,
    targetName: string,
    options: EmitHooksOptions,
    plugin: string,
): EmitHooksResult {
    const config = readCanonicalHooks(rulesyncDir);
    if (!config?.hooks) {
        return {
            target: targetName,
            emitted: false,
            count: 0,
            message: `${targetName}: no hooks in plugin`,
        };
    }

    const piHooks = convertCanonicalToPiHooks(applyHookTargetPolicy(config, targetName));
    const hookCount = Object.values(piHooks).reduce((sum, cmds) => sum + cmds.length, 0);

    // Project: <outputRoot>/<targetDir>/hooks.json
    // Global:  <outputRoot>/<targetDir>/agent/hooks.json (matches Pi's layout)
    const hooksDir = options.global ? join(outputRoot, targetDir, 'agent') : join(outputRoot, targetDir);
    const hooksPath = join(hooksDir, 'hooks.json');

    if (!options.dryRun) {
        mkdirSync(hooksDir, { recursive: true });
        const merged = mergePiHooks(hooksPath, piHooks, plugin);
        writeFileSync(hooksPath, `${JSON.stringify({ hooks: merged }, null, 2)}\n`);
    }

    if (hookCount === 0) {
        return {
            target: targetName,
            emitted: false,
            count: 0,
            path: hooksPath,
            message: `${targetName}: 0 hooks emitted after reconciliation`,
        };
    }

    return {
        target: targetName,
        emitted: true,
        count: hookCount,
        path: hooksPath,
        message: `${targetName}: ${hookCount} hook(s) emitted (rung b — @vahor/pi-hooks config; install with: pi install npm:@vahor/pi-hooks)`,
    };
}

/**
 * Merge new canonical hooks into an existing `.hermes/hooks.json`.
 *
 * Same problem as {@link mergePiHooks}: installing sp after cc must not drop
 * cc's hooks. Canonical entries are deduplicated by the (matcher, command)
 * pair so re-installing the same plugin is idempotent.
 */
function mergeCanonicalHooks(hooksPath: string, newConfig: CanonicalHooksConfig): CanonicalHooksConfig {
    let existingHooks: Record<string, CanonicalHookDefinition[]> = {};
    if (existsSync(hooksPath)) {
        try {
            const raw = JSON.parse(readFileSync(hooksPath, 'utf-8'));
            if (raw && typeof raw.hooks === 'object' && raw.hooks !== null) {
                existingHooks = raw.hooks as Record<string, CanonicalHookDefinition[]>;
            }
        } catch {
            existingHooks = {};
        }
    }

    const signatureOf = (def: CanonicalHookDefinition): string => {
        const entries = [...flattenCanonicalHookEntries([def])].map(
            ({ type, command, timeout }) => `${type ?? ''}:${command ?? ''}:${timeout ?? ''}`,
        );
        return `${def.matcher ?? '*'}|${entries.sort().join('||')}`;
    };

    const merged: CanonicalHooksConfig['hooks'] = {};
    const allEvents = new Set([...Object.keys(existingHooks), ...Object.keys(newConfig.hooks ?? {})]);
    for (const event of allEvents) {
        const ex = existingHooks[event] ?? [];
        const nx = newConfig.hooks?.[event] ?? [];
        const seen = new Set<string>();
        const acc: CanonicalHookDefinition[] = [];
        for (const def of [...ex, ...nx]) {
            const sig = signatureOf(def);
            if (seen.has(sig)) continue;
            seen.add(sig);
            acc.push(def);
        }
        if (acc.length > 0) merged[event] = acc;
    }
    return { hooks: merged };
}

/**
 * Emit hooks for hermes by merging into the canonical hooks.json.
 *
 * Rung (c): copy-step (now merge-step). Hermes uses opencode as a surrogate;
 * the canonical hooks.json is merged into `.hermes/hooks.json` (project) or
 * `~/.hermes/hooks.json` (global) so multiple plugins accumulate rather than
 * overwrite.
 */
export function emitHermesHooks(rulesyncDir: string, outputRoot: string, options: EmitHooksOptions): EmitHooksResult {
    const config = readCanonicalHooks(rulesyncDir);
    if (!config?.hooks) {
        return {
            target: 'hermes',
            emitted: false,
            count: 0,
            message: 'hermes: no hooks in plugin',
        };
    }

    const applicable = applyHookTargetPolicy(config, 'hermes');
    const hookCount = Object.values(applicable.hooks ?? {}).reduce((sum, defs) => sum + defs.length, 0);
    if (hookCount === 0) {
        return {
            target: 'hermes',
            emitted: false,
            count: 0,
            message: 'hermes: no hooks to install',
        };
    }

    const hooksDir = join(outputRoot, '.hermes');
    const hooksPath = join(hooksDir, 'hooks.json');

    if (!options.dryRun) {
        mkdirSync(hooksDir, { recursive: true });
        const merged = mergeCanonicalHooks(hooksPath, applicable);
        writeFileSync(hooksPath, `${JSON.stringify(merged, null, 2)}\n`);
    }

    return {
        target: 'hermes',
        emitted: true,
        count: hookCount,
        path: hooksPath,
        message: `hermes: ${hookCount} hook(s) merged (rung c — copy-step)`,
    };
}

export type { CanonicalHookDefinition, CanonicalHooksConfig, PiHookEntry };
