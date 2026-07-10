import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

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
const CANONICAL_TO_PI_EVENT: Partial<Record<string, string>> = {
    sessionStart: 'session_start',
    sessionEnd: 'session_shutdown',
    preToolUse: 'tool_call',
    postToolUse: 'tool_result',
    stop: 'agent_end',
    preCompact: 'session_before_compact',
};

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
    const canonicalHooks = config.hooks ?? {};

    for (const [canonicalEvent, definitions] of Object.entries(canonicalHooks)) {
        const normalized = canonicalEvent.charAt(0).toLowerCase() + canonicalEvent.slice(1);
        const piEvent = CANONICAL_TO_PI_EVENT[normalized];
        if (!piEvent) continue;

        const commands: PiHookEntry[] = [];
        for (const def of definitions) {
            // Claude Code format: matcher wraps a nested hooks array
            if (def.hooks) {
                for (const entry of def.hooks) {
                    if (entry.type && entry.type !== 'command') continue;
                    if (!entry.command) continue;
                    commands.push(entry.timeout ? { command: entry.command, timeout: entry.timeout } : entry.command);
                }
            } else {
                // Flat canonical format: type/command/timeout directly on the definition
                if (def.type && def.type !== 'command') continue;
                if (!def.command) continue;
                commands.push(def.timeout ? { command: def.command, timeout: def.timeout } : def.command);
            }
        }

        if (commands.length > 0) {
            piHooks[piEvent] = commands;
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
 * Emit hooks for Pi or omp (both use the `@vahor/pi-hooks` format).
 *
 * Rung (b): superskill emits the config; `@vahor/pi-hooks` (installed by the user)
 * is the shim that reads it. The install output documents this dependency.
 *
 * @param rulesyncDir - Path to the `.rulesync` directory (containing `hooks.json`)
 * @param outputRoot - The output root (project dir or homedir)
 * @param targetDir  - The target's config directory (`.pi` or `.omp`)
 * @param targetName - Human-readable target name for messages
 */
export function emitPiStyleHooks(
    rulesyncDir: string,
    outputRoot: string,
    targetDir: string,
    targetName: string,
    options: EmitHooksOptions,
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

    const piHooks = convertCanonicalToPiHooks(config);
    const hookCount = Object.values(piHooks).reduce((sum, cmds) => sum + cmds.length, 0);

    if (hookCount === 0) {
        return {
            target: targetName,
            emitted: false,
            count: 0,
            message: `${targetName}: no mappable hooks (events not supported by Pi lifecycle)`,
        };
    }

    // Project: <outputRoot>/<targetDir>/hooks.json
    // Global:  <outputRoot>/<targetDir>/agent/hooks.json (matches Pi's layout)
    const hooksDir = options.global ? join(outputRoot, targetDir, 'agent') : join(outputRoot, targetDir);
    const hooksPath = join(hooksDir, 'hooks.json');

    if (!options.dryRun) {
        mkdirSync(hooksDir, { recursive: true });
        writeFileSync(hooksPath, `${JSON.stringify({ hooks: piHooks }, null, 2)}\n`);
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
 * Emit hooks for hermes by copying the canonical hooks.json.
 *
 * Rung (c): copy-step. Hermes uses opencode as a surrogate; the canonical
 * hooks.json is copied to `.hermes/hooks.json` (project) or `~/.hermes/hooks.json` (global).
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

    const hookCount = Object.values(config.hooks).reduce((sum, defs) => sum + defs.length, 0);
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
        copyFileSync(join(rulesyncDir, 'hooks.json'), hooksPath);
    }

    return {
        target: 'hermes',
        emitted: true,
        count: hookCount,
        path: hooksPath,
        message: `hermes: ${hookCount} hook(s) copied (rung c — copy-step)`,
    };
}

export type { CanonicalHookDefinition, CanonicalHooksConfig, PiHookEntry };
export { CANONICAL_TO_PI_EVENT };
