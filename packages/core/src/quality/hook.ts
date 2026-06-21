import { clamp } from './heuristics';
import { computeAggregate, type DimensionScore, type QualityReport } from './types';

// ── Constants ─────────────────────────────────────────────────────────────────

/** The canonical set of hook event names. */
export const KNOWN_HOOK_EVENTS = [
    'PreToolUse',
    'PostToolUse',
    'Stop',
    'SubagentStop',
    'SessionStart',
    'SessionEnd',
    'UserPromptSubmit',
    'PreCompact',
    'Notification',
] as const;

/** Internal model: one hook entry parsed from hooks.json. */
interface HookEntry {
    event: string;
    matcher: string;
    command: string;
    type: string;
    timeout: number | undefined;
}

// ── JSON parser ───────────────────────────────────────────────────────────────

interface HooksJson {
    hooks: Record<
        string,
        Array<{ matcher: string; hooks: Array<{ type: string; command: string; timeout?: number }> }>
    >;
}

function parseHookEntries(raw: unknown): HookEntry[] | null {
    if (typeof raw !== 'object' || raw === null) return null;
    const data = raw as HooksJson;
    const hooks = data.hooks;
    if (typeof hooks !== 'object' || hooks === null) return null;

    const entries: HookEntry[] = [];
    for (const [event, matcherBlocks] of Object.entries(hooks)) {
        if (!Array.isArray(matcherBlocks)) continue;
        for (const block of matcherBlocks) {
            if (typeof block !== 'object' || block === null) continue;
            const subHooks = block.hooks;
            if (!Array.isArray(subHooks)) continue;
            for (const h of subHooks) {
                if (typeof h !== 'object' || h === null) continue;
                entries.push({
                    event,
                    matcher: typeof block.matcher === 'string' ? block.matcher : '',
                    command:
                        typeof (h as Record<string, unknown>).command === 'string'
                            ? ((h as Record<string, unknown>).command as string)
                            : '',
                    type:
                        typeof (h as Record<string, unknown>).type === 'string'
                            ? ((h as Record<string, unknown>).type as string)
                            : '',
                    timeout:
                        typeof (h as Record<string, unknown>).timeout === 'number'
                            ? ((h as Record<string, unknown>).timeout as number)
                            : undefined,
                });
            }
        }
    }
    return entries.length > 0 ? entries : null;
}

// ── Dimension scorers ─────────────────────────────────────────────────────────

/** correctness: command and type validity per entry. */
function scoreCorrectness(entries: HookEntry[]): DimensionScore {
    let valid = 0;
    for (const e of entries) {
        if (e.type === 'command' && e.command.length > 0 && e.matcher.length > 0) valid++;
    }
    const score = entries.length > 0 ? clamp(valid / entries.length) : 0;
    const note = `${valid}/${entries.length} entries valid`;
    return { score, note };
}

/** event-coverage: breadth of lifecycle events covered. */
function scoreEventCoverage(entries: HookEntry[]): DimensionScore {
    const events = new Set(entries.map((e) => e.event));
    const covered = KNOWN_HOOK_EVENTS.filter((e) => events.has(e)).length;
    const score = clamp(Math.min(events.size / 3, 1));
    const note = `${covered} of ${KNOWN_HOOK_EVENTS.length} known events covered (${events.size} total)`;
    return { score, note };
}

/** safety: scan commands for dangerous patterns. */
function scoreSafety(entries: HookEntry[]): DimensionScore {
    const dangerousPatterns: Array<{ re: RegExp; label: string }> = [
        { re: /rm\s+-rf/i, label: 'rm -rf' },
        { re: /\b(?:curl|wget|fetch)\b.*\|\s*(?:ba|z)?sh\b/i, label: 'download pipe to shell' },
        { re: /--no-verify/i, label: '--no-verify bypass' },
        { re: /\beval\b/i, label: 'eval' },
        { re: /sudo\b/i, label: 'sudo' },
        { re: /chmod\s+777/i, label: 'chmod 777' },
        { re: /\$\([^)]*\)/, label: 'unquoted command substitution' },
        { re: /`[^`]+`/, label: 'backtick execution' },
    ];

    const findings: string[] = [];
    let dangerous = 0;
    for (const e of entries) {
        for (const { re, label } of dangerousPatterns) {
            if (re.test(e.command)) {
                dangerous++;
                findings.push(`[${e.event}] ${label}: ${e.command.slice(0, 60)}`);
            }
        }
    }

    const base = entries.length > 0 ? 1 - dangerous / (entries.length * 2) : 0;
    const score = clamp(Math.max(base, 0.1));
    const note = dangerous === 0 ? 'No dangerous command patterns found' : `${dangerous} dangerous pattern(s) found`;
    const recs =
        dangerous > 0 ? ['Replace dangerous patterns with safe alternatives; add explicit approval gates'] : undefined;

    return { score, note, findings: findings.length > 0 ? findings : undefined, recommendations: recs };
}

/** pattern-match-quality: matcher specificity, timeout presence, portability. */
function scorePatternMatchQuality(entries: HookEntry[]): DimensionScore {
    let specificMatchers = 0;
    let hasTimeout = 0;
    let portable = 0;

    for (const e of entries) {
        if (e.matcher !== '*' && e.matcher.length > 0) specificMatchers++;
        if (e.timeout !== undefined && e.timeout > 0) hasTimeout++;
        if (/\$\{CLAUDE_PLUGIN_ROOT\}/.test(e.command) || !/^\//.test(e.command.trim())) portable++;
    }

    const n = entries.length || 1;
    const matcherScore = specificMatchers / n;
    const timeoutScore = hasTimeout / n;
    const portableScore = portable / n;

    const score = clamp(0.3 * matcherScore + 0.4 * timeoutScore + 0.3 * portableScore);
    const noteParts: string[] = [];
    if (specificMatchers < n) noteParts.push(`${n - specificMatchers} broad matcher(s)`);
    if (hasTimeout < n) noteParts.push(`${n - hasTimeout} missing timeout`);
    if (portable < n) noteParts.push(`${n - portable} non-portable path(s)`);

    const findings = noteParts.length > 0 ? noteParts.map((p) => p) : undefined;
    const recs =
        noteParts.length > 0
            ? [
                  'Use specific matchers instead of *; add timeout to every hook; use CLAUDE_PLUGIN_ROOT env var for paths',
              ]
            : undefined;

    return {
        score,
        note: noteParts.length > 0 ? noteParts.join('; ') : 'All entries specific, timed, and portable',
        findings,
        recommendations: recs,
    };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Evaluate a hook definition for quality across 4 dimensions:
 * correctness, event-coverage, safety, and pattern-match-quality.
 *
 * Detects input format: JSON (hooks.json) or markdown frontmatter (legacy .md).
 * JSON input is parsed for event→matcher→command structure.
 */
export function evaluateHook(content: string, target: string): QualityReport {
    const isJson = target.endsWith('.json') || /^\s*\{/.test(content);

    if (isJson) {
        let parsed: unknown;
        try {
            parsed = JSON.parse(content);
        } catch {
            return {
                type: 'hook',
                target,
                content: '',
                aggregate: 0,
                dimensions: {
                    correctness: { score: 0, note: 'Invalid JSON: parse error' },
                    'event-coverage': { score: 0, note: 'Invalid JSON: parse error' },
                    safety: { score: 0, note: 'Invalid JSON: parse error' },
                    'pattern-match-quality': { score: 0, note: 'Invalid JSON: parse error' },
                },
            };
        }

        const entries = parseHookEntries(parsed);
        if (!entries || entries.length === 0) {
            return {
                type: 'hook',
                target,
                content: '',
                aggregate: 0,
                dimensions: {
                    correctness: { score: 0, note: 'No hook entries found in JSON' },
                    'event-coverage': { score: 0, note: 'No hook entries found in JSON' },
                    safety: { score: 0, note: 'No hook entries found in JSON' },
                    'pattern-match-quality': { score: 0, note: 'No hook entries found in JSON' },
                },
            };
        }

        const dimensions: Record<string, DimensionScore> = {
            correctness: scoreCorrectness(entries),
            'event-coverage': scoreEventCoverage(entries),
            safety: scoreSafety(entries),
            'pattern-match-quality': scorePatternMatchQuality(entries),
        };

        return {
            type: 'hook',
            target,
            content: '',
            aggregate: computeAggregate(dimensions),
            dimensions,
        };
    }

    // Legacy: markdown .md hook definitions not supported
    const dimensions: Record<string, DimensionScore> = {
        correctness: { score: 0, note: 'Markdown hook definitions not supported; use hooks.json' },
        'event-coverage': { score: 0, note: 'Markdown hook definitions not supported; use hooks.json' },
        safety: { score: 0, note: 'Markdown hook definitions not supported; use hooks.json' },
        'pattern-match-quality': { score: 0, note: 'Markdown hook definitions not supported; use hooks.json' },
    };

    return {
        type: 'hook',
        target,
        content: '',
        aggregate: computeAggregate(dimensions),
        dimensions,
    };
}
