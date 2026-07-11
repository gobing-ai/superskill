/**
 * Generate native OMP hook modules from canonical hooks.json.
 *
 * OMP's plugin providers (`omp-plugins`, `claude-plugins`) only load `.ts`/`.js`
 * files from `hooks/pre/` and `hooks/post/` — no `hooks.json` support. This
 * generator reads the canonical hooks.json (Claude Code format) from a plugin
 * install path and emits one `.js` CommonJS module per hook entry, each calling
 * into `superskill hook run <plugin> <hook-id>` via `spawnSync`.
 *
 * Event mapping (CANONICAL_TO_PI_EVENT):
 *   preToolUse → tool_call      (hooks/pre/)
 *   postToolUse → tool_result   (hooks/post/)
 *   stop → agent_end            (hooks/post/)
 *   sessionStart → session_start (hooks/pre/)
 *   sessionEnd → session_shutdown (hooks/post/)
 *   preCompact → session_before_compact (hooks/pre/)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CANONICAL_TO_PI_EVENT, type CanonicalHooksConfig } from './hooks';

/** Canonical events that map to the `hooks/pre/` directory. */
const PRE_TOOL_EVENTS: Record<string, true> = {
    preToolUse: true,
    sessionStart: true,
    preCompact: true,
};

/** OMP events whose handler can return `{ block: true, reason }` to prevent execution. */
const BLOCKABLE_OMP_EVENTS: Record<string, true> = {
    tool_call: true,
};

/** Result of hook module generation. */
export interface OmpHookResult {
    /** Number of hook modules written. */
    count: number;
    /** Paths of written files (empty in dry-run: still lists would-be paths). */
    files: string[];
    /** Human-readable summary for install output. */
    message: string;
}

/** Parsed hook entry extracted from canonical hooks.json. */
interface ParsedHook {
    ompEvent: string;
    matcher: string;
    command: string;
    timeout?: number;
    /** Filename stem derived from the hook command (e.g. `anti-hallucination`). */
    name: string;
    /** Directory: `pre` or `post`. */
    level: 'pre' | 'post';
}

/**
 * Parse canonical hooks.json into individual hook entries, mapping events to OMP
 * lifecycle event names. Entries with unmappable events are silently dropped.
 */
function parseCanonicalHooks(config: CanonicalHooksConfig): ParsedHook[] {
    const parsed: ParsedHook[] = [];
    const hooks = config.hooks ?? {};

    for (const [canonicalEvent, definitions] of Object.entries(hooks)) {
        const normalized = canonicalEvent.charAt(0).toLowerCase() + canonicalEvent.slice(1);
        const ompEvent = CANONICAL_TO_PI_EVENT[normalized];
        if (!ompEvent) continue;

        const level: 'pre' | 'post' = PRE_TOOL_EVENTS[normalized] ? 'pre' : 'post';

        for (const def of definitions) {
            // Claude Code format: matcher wraps a nested hooks array
            const matcher = def.matcher ?? '*';
            const entries = def.hooks ?? [def];
            for (const entry of entries) {
                if (entry.type && entry.type !== 'command') continue;
                if (!entry.command) continue;
                parsed.push({
                    ompEvent,
                    matcher,
                    command: entry.command,
                    timeout: entry.timeout,
                    name: deriveHookName(entry.command),
                    level,
                });
            }
        }
    }

    return parsed;
}

/** Extract a filename-safe stem from a hook command (e.g. `anti-hallucination`). */
function deriveHookName(command: string): string {
    const parts = command.trim().split(/\s+/);
    const last = parts[parts.length - 1] ?? 'hook';
    return last.replace(/[^a-zA-Z0-9_-]/g, '');
}

/**
 * Build the generated module body for a single hook.
 *
 * For `tool_call` (preToolUse) events, the handler returns `{ block: true, reason }`
 * when the hook command exits with code 2. For all other events, the handler
 * runs the command fire-and-forget.
 */
function buildModuleContent(hook: ParsedHook): string {
    const parts = hook.command
        .split(/\s+/)
        .map((p) => `'${p}'`)
        .join(', ');
    const timeoutMs = hook.timeout ? hook.timeout * 1000 : undefined;
    const timeoutArg = timeoutMs ? `, timeout: ${timeoutMs}` : '';

    // OMP tool names are lowercase ("write", "edit", "read", "bash") while
    // canonical matchers are PascalCase regex ("Write|Edit"). Use a
    // case-insensitive regex test so both semantics work: alternation (`|`),
    // anchors, and the case gap all resolve correctly.
    const matcherGuard =
        hook.matcher !== '*' && BLOCKABLE_OMP_EVENTS[hook.ompEvent] === true
            ? `  if (!new RegExp(${JSON.stringify(hook.matcher)}, 'i').test(event.toolName)) return;\n`
            : '';

    const blockLogic =
        BLOCKABLE_OMP_EVENTS[hook.ompEvent] === true
            ? `    if (result.status === 2) {\n` +
              `      return { block: true, reason: String(result.stderr || 'Blocked by ${hook.name}') };\n` +
              `    }\n`
            : '';

    return `const { spawnSync } = require('node:child_process');

// Generated by superskill install — do not edit manually.
// Event: ${hook.ompEvent} (from canonical ${hook.matcher === '*' ? 'all tools' : hook.matcher})
// Command: ${hook.command}
module.exports = (pi) => {
  pi.on('${hook.ompEvent}', (event) => {
${matcherGuard}    const result = spawnSync(${parts}, {
      input: JSON.stringify(event),
      encoding: 'utf-8'${timeoutArg},
    });
${blockLogic}  });
};
`;
}

/**
 * Generate OMP native hook modules from canonical hooks.
 *
 * Reads `<hooksSourceDir>/hooks.json` (canonical format), maps each entry to an
 * OMP lifecycle event, and writes `.js` modules into `<installPath>/hooks/pre/`
 * or `<installPath>/hooks/post/`. OMP providers load only `.ts`/`.js` files
 * from those directories — no `hooks.json` support.
 *
 * @param hooksSourceDir - Directory containing canonical `hooks.json` (e.g. `.rulesync/`)
 * @param installPath    - OMP plugin cache directory where `hooks/pre/` + `hooks/post/` are written
 * @returns {@link OmpHookResult} with count, file paths, and message.
 */
export function generateOmpHookModules(hooksSourceDir: string, installPath: string): OmpHookResult {
    const hooksJsonPath = join(hooksSourceDir, 'hooks.json');
    if (!existsSync(hooksJsonPath)) {
        return { count: 0, files: [], message: 'omp hooks: no hooks.json in plugin' };
    }

    let config: CanonicalHooksConfig;
    try {
        config = JSON.parse(readFileSync(hooksJsonPath, 'utf-8')) as CanonicalHooksConfig;
    } catch {
        return { count: 0, files: [], message: 'omp hooks: failed to parse hooks.json' };
    }

    const parsed = parseCanonicalHooks(config);
    if (parsed.length === 0) {
        return { count: 0, files: [], message: 'omp hooks: no mappable hooks' };
    }

    const files: string[] = [];
    const preDir = join(installPath, 'hooks', 'pre');
    const postDir = join(installPath, 'hooks', 'post');

    // Deduplicate names per level to prevent file collisions
    const usedNames = new Set<string>();
    for (const hook of parsed) {
        const dir = hook.level === 'pre' ? preDir : postDir;
        mkdirSync(dir, { recursive: true });

        let name = hook.name;
        while (usedNames.has(`${dir}/${name}`)) {
            name = `${name}-${Math.random().toString(36).slice(2, 6)}`;
        }
        usedNames.add(`${dir}/${name}`);

        const filePath = join(dir, `${name}.js`);
        writeFileSync(filePath, buildModuleContent(hook));
        files.push(filePath);
    }

    return {
        count: files.length,
        files,
        message: `omp hooks: ${files.length} module(s) generated`,
    };
}
