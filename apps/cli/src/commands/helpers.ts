import { TARGETS, type Target } from '@gobing-ai/superskill-core';
import { echoError } from '@gobing-ai/ts-utils';
import type { Command } from 'commander';

/** Add --target <agent> option (common to all operations). */
export function addTargetOption(cmd: Command): Command {
    return cmd.option('-t, --target <agent>', 'Target agent platform', 'claude');
}

/** Add scaffold-specific options. */
export function addScaffoldOptions(cmd: Command): Command {
    return cmd
        .option('-d, --description <text>', 'Content description')
        .option('-t, --target <agent>', 'Target agent platform', 'claude')
        .option('-o, --output <dir>', 'Output directory (default: cwd)')
        .option('--force', 'Overwrite existing file if present');
}

/** Add evolve-specific options (F023: --json/--ingest; F024: --margin; G2/G3: --analyze/--history/--rollback/--confirm). */
export function addEvolveOptions(cmd: Command): Command {
    return cmd
        .option('-t, --target <agent>', 'Target agent platform', 'claude')
        .option('--from <date>', 'Analyze evaluations since date (ISO 8601)')
        .option('--propose-only', 'Generate proposal without applying')
        .option('--accept <id>', 'Accept a specific proposal by ID')
        .option('--reject <id>', 'Reject a specific proposal')
        .option('--json', 'Output machine-readable JSON (envelope-out with --propose-only)')
        .option('--ingest <file>', 'Agent-authored proposal JSON (ingest-in mode)')
        .option('--margin <n>', 'Δ-margin gate threshold for accept (default 0.05)', Number.parseFloat, 0.05)
        .option('--analyze', 'Print analysis summary (trends, score, data sources) without writing a proposal')
        .option('--history', 'List applied proposal versions from the store')
        .option('--rollback <id>', 'Rollback to a prior version by proposal_id (requires --confirm)')
        .option('--confirm', 'Confirm a destructive operation (required for --rollback)');
}

/** Add --json option. */
export function addJsonOption(cmd: Command): Command {
    return cmd.option('--json', 'Output machine-readable JSON');
}

/** Add --save option. */
export function addSaveOption(cmd: Command): Command {
    return cmd.option('--save', 'Persist result to data store');
}

/** Add evaluate-specific options (--rubric, --ingest) for the scorer seam (F022). */
export function addEvaluateOptions(cmd: Command): Command {
    return cmd
        .option('--rubric <file>', 'Rubric file path (envelope-out mode with --json: emit scoring work order)')
        .option('--ingest <file>', 'Scores JSON path (ingest-in mode with --save: persist agent-scored results)');
}

/** Add --strict option (validate). */
export function addStrictOption(cmd: Command): Command {
    return cmd.option('--strict', 'Enable all optional checks');
}

/** Add --auto option (refine). */
export function addAutoOption(cmd: Command): Command {
    return cmd.option('--auto', 'Apply low-risk fixes automatically');
}

/** Resolve --target against TARGETS, defaulting to 'claude'. */
export function resolveTarget(opts: { target?: string }): Target {
    const raw = opts.target || 'claude';
    if (!TARGETS.includes(raw as Target)) {
        throw new Error(`Unknown target: ${raw}. Valid targets: ${TARGETS.join(', ')}`);
    }
    return raw as Target;
}

/**
 * Run an async operation and map its outcome to a process exit code.
 * Thrown errors with ENOENT → exit 2, others → exit 1.
 */
export async function runOperation(fn: () => Promise<number | undefined>): Promise<void> {
    try {
        const code = ((await fn()) as number | undefined) ?? 0;
        process.exit(code);
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        const notFound = (err as { code?: string })?.code === 'ENOENT' || /File not found|no such file/i.test(msg);
        echoError(`Error: ${msg}`);
        process.exit(notFound ? 2 : 1);
    }
}

/**
 * Map a validation result to an exit code:
 * - `_file` field → exit 2 (file not found)
 * - `valid === false` → exit 1 (validation errors)
 * - Otherwise → 0
 */
export function exitFor(result: { valid?: boolean; findings?: Array<{ field: string }> }): number {
    if (result.findings?.some((f) => f.field === '_file')) return 2;
    if (result.valid === false) return 1;
    return 0;
}
