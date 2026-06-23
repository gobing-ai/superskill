import type { RuleJudge } from './eval-cases';

// ── Exact-Match Scorer ────────────────────────────────────────────────────────

/**
 * Score an agent output against an exact-match reference.
 *
 * Normalization: trim, case-fold to lowercase, collapse internal whitespace.
 * A match is either an exact equality OR a substring match (the reference
 * appears anywhere in the output, case-insensitively).
 *
 * @returns `1.0` on match, `0.0` otherwise.
 */
export function scoreExact(output: string, reference: string): number {
    const normOut = normalize(output);
    const normRef = normalize(reference);
    if (normOut === normRef) return 1.0;
    if (normOut.includes(normRef)) return 1.0;
    return 0.0;
}

// ── Rule-Judge Scorer ─────────────────────────────────────────────────────────

/**
 * Score an agent output against a rule judge. All checks must pass for `1.0`.
 * Deterministic — no model calls, no I/O.
 *
 * Supported ops:
 * - `contains` — output contains `arg` (case-insensitive)
 * - `regex` — output matches the regular expression `arg`
 * - `equals` — normalized output equals `arg` exactly
 * - `not_contains` — output does NOT contain `arg` (case-insensitive)
 * - `tool_called` — `arg` appears in `toolsCalled` array
 *
 * @param output       The agent's text output.
 * @param judge        The rule judge to apply.
 * @param toolsCalled  Optional list of tool names the agent invoked.
 * @returns `1.0` when all checks pass, `0.0` otherwise.
 */
export function scoreRule(output: string, judge: RuleJudge, toolsCalled?: string[]): number {
    for (const check of judge.checks) {
        if (!evaluateCheck(output, check.op, check.arg, toolsCalled)) return 0.0;
    }
    return 1.0;
}

// ── Aggregate ─────────────────────────────────────────────────────────────────

/**
 * Aggregate individual case scores into a mean over a split.
 * Empty split → `0.0`.
 */
export function aggregateHard(scores: number[]): number {
    if (scores.length === 0) return 0.0;
    const sum = scores.reduce((acc, s) => acc + s, 0);
    return sum / scores.length;
}

// ── Internal ──────────────────────────────────────────────────────────────────

/** Normalize text: trim, case-fold to lowercase, collapse internal whitespace. */
function normalize(text: string): string {
    return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

function evaluateCheck(output: string, op: string, arg: string, toolsCalled?: string[]): boolean {
    switch (op) {
        case 'contains':
            return output.toLowerCase().includes(arg.toLowerCase());
        case 'regex': {
            try {
                return new RegExp(arg).test(output);
            } catch {
                return false;
            }
        }
        case 'equals':
            return normalize(output) === normalize(arg);
        case 'not_contains':
            return !output.toLowerCase().includes(arg.toLowerCase());
        case 'tool_called':
            return (toolsCalled ?? []).includes(arg);
        default:
            return false;
    }
}
