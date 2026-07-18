/**
 * Generate native OMP hook modules from canonical hooks.json.
 *
 * OMP's plugin providers (`omp-plugins`, `claude-plugins`) only load `.ts`/`.js`
 * files from `hooks/pre/` and `hooks/post/` — no `hooks.json` support. This
 * generator reads the canonical hooks.json (Claude Code format) from a plugin
 * install path and emits one `.js` ESM module per hook entry (omp's extension
 * loader requires a `default` factory export; CommonJS `module.exports` is
 * rejected with "does not export a valid factory function", omp 16.4.2), each
 * calling into `superskill hook run <plugin> <hook-id>` via `spawnSync`.
 *
 * Event mapping (CANONICAL_HOOK_EVENTS):
 *   preToolUse → tool_call      (hooks/pre/)
 *   postToolUse → tool_result   (hooks/post/)
 *   stop → agent_end            (hooks/post/)
 *   sessionStart → session_start (hooks/pre/)
 *   sessionEnd → session_shutdown (hooks/post/)
 *   preCompact → session_before_compact (hooks/pre/)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    applyHookTargetPolicy,
    BLOCKABLE_OMP_EVENTS,
    CANONICAL_HOOK_EVENTS,
    CANONICAL_PRE_TOOL_EVENTS,
    type CanonicalHooksConfig,
    flattenCanonicalHookEntries,
} from './hooks';

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
 * lifecycle event names via the shared {@link flattenCanonicalHookEntries} walk.
 * Entries with unmappable events are silently dropped by the iterator.
 */
function parseCanonicalHooks(config: CanonicalHooksConfig): ParsedHook[] {
    const parsed: ParsedHook[] = [];
    for (const [rawEvent, definitions] of Object.entries(config.hooks ?? {})) {
        const canonicalEvent = rawEvent.charAt(0).toLowerCase() + rawEvent.slice(1);
        const ompEvent = CANONICAL_HOOK_EVENTS[canonicalEvent];
        if (!ompEvent) continue;
        for (const entry of flattenCanonicalHookEntries(definitions)) {
            if ((entry.type && entry.type !== 'command') || !entry.command) continue;
            parsed.push({
                ompEvent,
                matcher: entry.matcher,
                command: entry.command,
                timeout: entry.timeout,
                name: deriveHookName(entry.command),
                level: CANONICAL_PRE_TOOL_EVENTS[canonicalEvent] ? 'pre' : 'post',
            });
        }
    }
    return parsed;
}

/** Extract a filename-safe stem from a hook command (e.g. `anti-hallucination`). */
function deriveHookName(command: string): string {
    const parts = command.trim().split(/\s+/);
    const last = parts[parts.length - 1] ?? 'hook';
    // The strip runs after the ?? fallback, so a token with no alphanumerics (a trailing
    // glob, a redirect) would otherwise yield '' and write a hidden module named `.js`.
    return last.replace(/[^a-zA-Z0-9_-]/g, '') || 'hook';
}

/**
 * Build the generated module body for a single hook.
 *
 * For `tool_call` (preToolUse) events, the handler returns `{ block: true, reason }`
 * when the hook command exits with code 2. For all other events, the handler
 * runs the command fire-and-forget.
 */
function buildModuleContent(hook: ParsedHook): string {
    // JSON.stringify each token: a naive '${p}' wrap breaks the generated JS on any
    // command containing a quote (e.g. `bash -c 'echo hi'` → syntax error module).
    // spawnSync takes (command, args[], options) — the args MUST be one array literal;
    // spreading tokens as positional arguments throws ERR_INVALID_ARG_TYPE at runtime.
    const tokens = hook.command.trim().split(/\s+/);
    const commandLiteral = JSON.stringify(tokens[0] ?? 'true');
    const argsLiteral = `[${tokens
        .slice(1)
        .map((p) => JSON.stringify(p))
        .join(', ')}]`;
    // Comment interpolations must stay on one line — a newline smuggled through
    // command/matcher would escape the `//` comment into executable module code.
    const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ');
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

    return `import { spawnSync } from 'node:child_process';

// Generated by superskill install — do not edit manually.
// Event: ${hook.ompEvent} (from canonical ${hook.matcher === '*' ? 'all tools' : oneLine(hook.matcher)})
// Command: ${oneLine(hook.command)}
export default (pi) => {
  pi.on('${hook.ompEvent}', (event) => {
${matcherGuard}    const result = spawnSync(${commandLiteral}, ${argsLiteral}, {
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
export function generateOmpHookModules(hooksSourceDir: string, installPath: string, target = 'omp'): OmpHookResult {
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

    const parsed = parseCanonicalHooks(applyHookTargetPolicy(config, target));
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
