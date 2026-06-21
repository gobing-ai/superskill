import { createInterface } from 'node:readline';
import {
    applyChange,
    backupFile,
    type Change,
    type ContentType,
    type DimensionScore,
    evaluate as evaluateContent,
    parseFrontmatter,
    resolveContentPath,
    restoreFromBackup,
    type Target,
} from '@gobing-ai/superskill-core';
import { echo, echoError } from '@gobing-ai/ts-utils';
import { evaluate } from './evaluate';
import type { Finding } from './validate';
import { validate } from './validate';

// ── Types ────────────────────────────────────────────────────────────────────

/** Options for the refine operation. */
export interface RefineOptions {
    /** Target agent (defaults to 'claude'). */
    target?: Target;
    /** Apply only auto-apply fixes without user interaction. */
    auto?: boolean;
    /** Persist the post-refine evaluation to the SQLite store. */
    save?: boolean;
    /** Preview classified fixes and a projected score delta without writing. */
    dryRun?: boolean;
}

/** A single fix attempt recorded during refine. */
export interface FixRecord {
    severity: string;
    field: string;
    message: string;
    strategy: 'auto-apply' | 'suggest' | 'flag';
    applied: boolean;
}

/** Result of a refine() call. */
export interface RefineResult {
    preScore: number;
    postScore: number;
    delta: number;
    fixesApplied: FixRecord[];
    fixesSkipped: FixRecord[];
}

/** Thrown when the user quits interactive mode. */
export class RefineAbortedError extends Error {
    constructor(message = 'User quit interactive mode') {
        super(message);
        this.name = 'RefineAbortedError';
    }
}

// ── Fix Classification ───────────────────────────────────────────────────────

type FixStrategy = 'auto-apply' | 'suggest' | 'flag';

/**
 * Classify a validation finding into a fix strategy.
 *
 * - `error` severity → `'auto-apply'` (structural)
 * - Content quality fields (description, clarity, conciseness, trigger-accuracy) → `'suggest'`
 * - Architecture fields (skill-linkage, tool-selection, model-fit, platform-coverage) → `'flag'`
 * - Everything else → `'auto-apply'`
 */
export function classifyFix(finding: Finding): FixStrategy {
    if (finding.severity === 'error') {
        return 'auto-apply';
    }

    if (['description', 'trigger-accuracy', 'clarity', 'conciseness'].includes(finding.field)) {
        return 'suggest';
    }

    if (['skill-linkage', 'tool-selection', 'model-fit', 'platform-coverage'].includes(finding.field)) {
        return 'flag';
    }

    return 'auto-apply';
}

// ── Auto-Fix Generation ──────────────────────────────────────────────────────

/**
 * Produce a schema-aware, content-derived default for a missing required field.
 *
 * Never inserts a placeholder (`TODO`/`default`): those are penalised by the
 * evaluators (e.g. `model: default` scores 0.0 in model-fit) and so would lower
 * the score — violating refine's monotonic-or-neutral guarantee. When no
 * sensible default can be derived, returns `null` so the caller SKIPS the fix
 * rather than inserting a value the evaluator will punish.
 *
 * - `model` → `'inherit'` (a recognized alias; scores 1.0 in model-fit).
 * - `tools` → `[]` (a valid empty array; unblocks validation, score-neutral).
 * - `description` → humanized from the `name` field, else the first body H1.
 * - `name` → slugified from the first body H1.
 * - anything else → `null` (skip).
 */
function getDefaultForField(field: string, content: string): unknown | null {
    if (field === 'model') return 'inherit';
    if (field === 'tools') return [];

    const name = readFrontmatterName(content);
    const h1 = extractFirstHeading(content);

    if (field === 'description') {
        if (name) return humanize(name);
        if (h1) return h1;
        return null;
    }
    if (field === 'name') {
        if (h1) return slugify(h1);
        return null;
    }

    return null;
}

/** Read the `name` field from frontmatter, or `null` if absent/unreadable. */
function readFrontmatterName(content: string): string | null {
    try {
        const parsed = parseFrontmatter(content);
        const name = parsed.data.name;
        return typeof name === 'string' && name.trim() ? name.trim() : null;
    } catch {
        return null;
    }
}

/** Extract the text of the first `# ` heading in the body, or `null`. */
function extractFirstHeading(content: string): string | null {
    const bodyStart = content.indexOf('---', 3);
    const body = bodyStart === -1 ? content : content.slice(bodyStart + 3);
    const match = /^\s*#\s+(.+?)\s*$/m.exec(body);
    return match?.[1] ? match[1].trim() : null;
}

/** Turn a slug (`code-reviewer`) into a readable label (`Code reviewer`). */
function humanize(slug: string): string {
    return slug
        .replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .trim();
}

/** Turn a label (`Code Reviewer`) into a slug (`code-reviewer`). */
function slugify(label: string): string {
    return label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/**
 * Generate a `Change` from a `Finding` for auto-apply fixes.
 *
 * - Missing required field → insert field with default value
 * - Wrong type (array expected) → wrap single value in array
 * - Wrong type (string expected) → convert value to string
 *
 * Returns `null` when the finding cannot be auto-fixed by this function.
 */
export function generateAutoChange(finding: Finding, content: string): Change | null {
    // Missing required field → add a schema-aware default; skip if none exists
    // (never insert a TODO/placeholder the evaluator would penalise).
    if (finding.message.toLowerCase().includes('missing')) {
        const value = getDefaultForField(finding.field, content);
        if (value === null) return null;
        return { kind: 'frontmatter', key: finding.field, value };
    }

    // Wrong type: must be an array
    if (finding.message.includes('must be an array')) {
        let currentValue: unknown;
        try {
            const parsed = parseFrontmatter(content);
            currentValue = parsed.data[finding.field];
        } catch {
            return null;
        }
        const newValue = Array.isArray(currentValue) ? currentValue : [currentValue];
        return { kind: 'frontmatter', key: finding.field, value: newValue };
    }

    // Wrong type: must be a string
    if (finding.message.includes('must be a string')) {
        let currentValue: unknown;
        try {
            const parsed = parseFrontmatter(content);
            currentValue = parsed.data[finding.field];
        } catch {
            return null;
        }
        if (currentValue !== undefined) {
            return { kind: 'frontmatter', key: finding.field, value: String(currentValue) };
        }
    }

    // Trailing whitespace in frontmatter value → trim it
    if (finding.message.includes('trailing whitespace')) {
        let currentValue: unknown;
        try {
            const parsed = parseFrontmatter(content);
            currentValue = parsed.data[finding.field];
        } catch {
            return null;
        }
        if (typeof currentValue === 'string') {
            return { kind: 'frontmatter', key: finding.field, value: currentValue.trimEnd() };
        }
    }

    return null;
}

// ── Interactive Mode ─────────────────────────────────────────────────────────

/**
 * Present each classified finding to the user for accept/reject/skip/quit
 * via a readline interface. Flag findings are shown but skipped automatically.
 *
 * @param findings  Classified findings to process.
 * @param content   Current file content string.
 * @param filePath  Path to the original file (written back on completion).
 * @param backupPath  Path to the backup file (restored on quit).
 * @param _createRl  Injectable readline factory for testing.
 * @returns  Updated content and fix records.
 */
export async function runInteractive(
    findings: { finding: Finding; strategy: FixStrategy }[],
    content: string,
    filePath: string,
    backupPath: string,
    _createRl: typeof createInterface = createInterface,
): Promise<{ newContent: string; fixesApplied: FixRecord[]; fixesSkipped: FixRecord[] }> {
    const rl = _createRl({ input: process.stdin, output: process.stdout });
    const question = (prompt: string): Promise<string> => new Promise((resolve) => rl.question(prompt, resolve));
    const fixesApplied: FixRecord[] = [];
    const fixesSkipped: FixRecord[] = [];
    let currentContent = content;
    for (let i = 0; i < findings.length; i++) {
        const item = findings[i];
        if (!item) continue;
        const { finding, strategy } = item;
        const label = `[${i + 1}/${findings.length}]`;

        if (strategy === 'flag') {
            echo(`${label} [FLAG] ${finding.field}: ${finding.message}`);
            echo('  (requires manual review — cannot auto-apply)');
            fixesSkipped.push({
                severity: finding.severity,
                field: finding.field,
                message: finding.message,
                strategy: 'flag',
                applied: false,
            });
            continue;
        }

        const defaultChoice = strategy === 'auto-apply' ? 'a' : 'r';
        const prompt =
            `${label} [${strategy.toUpperCase()}] ${finding.field}: ${finding.message}\n` +
            `  Apply? [(a)ccept, (r)eject, (s)kip, (q)uit] (default: ${defaultChoice}): `;

        const answer = (await question(prompt)).trim().toLowerCase() || defaultChoice;

        if (answer === 'q') {
            await restoreFromBackup(backupPath, filePath);
            rl.close();
            throw new RefineAbortedError();
        }

        if (answer === 'a') {
            const change = generateAutoChange(finding, currentContent);
            if (change) {
                currentContent = applyChange(currentContent, change);
                fixesApplied.push({
                    severity: finding.severity,
                    field: finding.field,
                    message: finding.message,
                    strategy,
                    applied: true,
                });
            } else {
                fixesSkipped.push({
                    severity: finding.severity,
                    field: finding.field,
                    message: finding.message,
                    strategy,
                    applied: false,
                });
            }
        } else {
            fixesSkipped.push({
                severity: finding.severity,
                field: finding.field,
                message: finding.message,
                strategy,
                applied: false,
            });
        }
    }

    rl.close();
    await Bun.write(filePath, currentContent);
    return { newContent: currentContent, fixesApplied, fixesSkipped };
}

/**
 * Apply all auto-apply strategy findings without user interaction.
 *
 * Suggest/flag findings are recorded as skipped. For auto-apply findings,
 * {@link generateAutoChange} is called; if it returns a change, it's applied
 * to the content and recorded in `fixesApplied`. Otherwise it's skipped.
 *
 * @returns Updated content (with fixes applied) and fix records.
 */
export function applyAutoFixes(
    findings: { finding: Finding; strategy: FixStrategy }[],
    content: string,
): { content: string; fixesApplied: FixRecord[]; fixesSkipped: FixRecord[] } {
    let currentContent = content;
    const fixesApplied: FixRecord[] = [];
    const fixesSkipped: FixRecord[] = [];

    for (const { finding, strategy } of findings) {
        if (strategy === 'auto-apply') {
            const change = generateAutoChange(finding, currentContent);
            if (change) {
                currentContent = applyChange(currentContent, change);
                fixesApplied.push({
                    severity: finding.severity,
                    field: finding.field,
                    message: finding.message,
                    strategy,
                    applied: true,
                });
            } else {
                fixesSkipped.push({
                    severity: finding.severity,
                    field: finding.field,
                    message: finding.message,
                    strategy,
                    applied: false,
                });
            }
        } else {
            fixesSkipped.push({
                severity: finding.severity,
                field: finding.field,
                message: finding.message,
                strategy,
                applied: false,
            });
        }
    }

    return { content: currentContent, fixesApplied, fixesSkipped };
}

// ── Core ─────────────────────────────────────────────────────────────────────

/**
 * Refine content quality by evaluating, classifying findings, applying fixes,
 * and re-evaluating to measure improvement.
 *
 * Pipeline:
 * 1. Validate → collect findings (structural errors included)
 * 2. Evaluate → baseline score (heuristic scorers are presence-based, so a
 *    missing-field file still scores — its completeness is 0, not a throw)
 * 3. Classify findings into auto-apply / suggest / flag
 * 4. Apply fixes (auto / interactive / dry-run) — runs BEFORE any
 *    validation-error early-return, so structural auto-apply fixes are reachable
 * 5. Re-validate only bails when errors REMAIN after the structural fixes
 * 6. Re-evaluate → post score (monotonic-or-neutral: never below baseline)
 * 7. Optionally save
 */
export async function refine(type: ContentType, nameOrPath: string, opts?: RefineOptions): Promise<RefineResult> {
    const resolvedPath = resolveContentPath(type, nameOrPath);
    const resolvedTarget = opts?.target ?? 'claude';
    const filePath = resolvedPath ?? nameOrPath;

    // Step 1: Validate
    const validation = await validate(type, filePath, {
        target: resolvedTarget,
        strict: opts?.auto === true,
    });

    // Step 2: Evaluate baseline on the ORIGINAL file. The heuristic evaluators
    // score missing fields at 0 (presence-based) rather than throwing, so this
    // captures an honest pre-score even when validation reports errors.
    let preScore = 0;
    let preDimensions: Record<string, DimensionScore> = {};
    try {
        const report = await evaluate(type, filePath, { target: resolvedTarget });
        if (report) {
            preScore = report.aggregate;
            preDimensions = report.dimensions;
        }
    } catch {
        // Unreadable file: pre-score stays 0. Structural fixes cannot help an
        // unreadable file; the content read below will surface the same failure.
    }

    // Step 3: Read content (needed for classify/apply + dry-run projection)
    let content: string;
    try {
        content = await Bun.file(filePath).text();
    } catch {
        echoError('Cannot read content file for editing.');
        return { preScore, postScore: preScore, delta: 0, fixesApplied: [], fixesSkipped: [] };
    }

    // Step 4: Classify findings (from validation + low-scoring dimensions)
    const findings: { finding: Finding; strategy: FixStrategy }[] = [];
    for (const f of validation.findings) {
        findings.push({ finding: f, strategy: classifyFix(f) });
    }
    for (const [dimName, dimScore] of Object.entries(preDimensions)) {
        if (dimScore.score < 0.7 && dimScore.note?.trim()) {
            findings.push({
                finding: { severity: 'warning', field: dimName, message: dimScore.note },
                strategy: 'suggest',
            });
        }
    }

    // Step 5: --dry-run → preview classified fixes + projected delta, write nothing.
    if (opts?.dryRun) {
        return dryRunPreview(type, content, resolvedTarget, findings);
    }

    // No findings → nothing to do.
    if (findings.length === 0) {
        echo(`No issues found. Score: ${preScore.toFixed(2)}`);
        return { preScore, postScore: preScore, delta: 0, fixesApplied: [], fixesSkipped: [] };
    }

    // Step 6: Backup + apply fixes (auto or interactive). The apply phase runs
    // BEFORE any validation-error early-return, so structural auto-apply fixes
    // (missing required fields) are reachable — the "fix in one step" promise.
    const backupPath = await backupFile(filePath);
    let fixesApplied: FixRecord[] = [];
    let fixesSkipped: FixRecord[] = [];

    try {
        if (opts?.auto) {
            const result = applyAutoFixes(findings, content);
            fixesApplied = result.fixesApplied;
            fixesSkipped = result.fixesSkipped;
            if (fixesApplied.length > 0) {
                await Bun.write(filePath, result.content);
            }
        } else {
            const result = await runInteractive(findings, content, filePath, backupPath);
            fixesApplied = result.fixesApplied;
            fixesSkipped = result.fixesSkipped;
        }
    } catch (err) {
        if (err instanceof RefineAbortedError) {
            return { preScore, postScore: preScore, delta: 0, fixesApplied, fixesSkipped };
        }
        throw err;
    }

    // Step 7: If the file was invalid, re-validate. Only bail when errors REMAIN
    // after the structural fixes — never before (R1).
    if (!validation.valid) {
        const revalidation = await validate(type, filePath, {
            target: resolvedTarget,
            strict: opts?.auto === true,
        });
        if (!revalidation.valid) {
            for (const f of revalidation.findings) {
                if (f.severity === 'error') echoError(`[ERROR] ${f.field}: ${f.message}`);
            }
            echoError('Validation errors remain after structural fixes; refine aborted.');
            return { preScore, postScore: preScore, delta: 0, fixesApplied, fixesSkipped };
        }
    }

    // Step 8: Re-evaluate and enforce the monotonic-or-neutral guarantee.
    let postScore: number;
    try {
        const postReport = await evaluate(type, filePath, { target: resolvedTarget });
        if (!postReport) throw new Error('evaluate returned null in heuristic mode');
        postScore = postReport.aggregate;
    } catch {
        echoError('Cannot re-evaluate after fixes.');
        return { preScore, postScore: preScore, delta: 0, fixesApplied, fixesSkipped };
    }

    // Monotonic guard: refine must NEVER lower the score. With schema-aware
    // defaults (never TODO/placeholder) this branch is unreachable, but restore
    // the backup defensively if a fix somehow regressed the score.
    if (postScore < preScore) {
        await restoreFromBackup(backupPath, filePath);
        echo('Refine skipped: changes would have lowered the score; original restored.');
        // The applied fixes were rolled back — record them honestly as skipped
        // so the result never claims success for a change that was reverted.
        for (const f of fixesApplied) fixesSkipped.push({ ...f, applied: false });
        fixesApplied = [];
        postScore = preScore;
    }

    const delta = postScore - preScore;

    // Step 9: Display delta
    if (delta === 0 && preScore === postScore) {
        echo(`Score: ${preScore.toFixed(2)} (no change)`);
    } else {
        const pctStr = preScore > 0 ? `, +${((delta / preScore) * 100).toFixed(1)}%` : '';
        echo(
            `Score: ${preScore.toFixed(2)} → ${postScore.toFixed(2)} (${delta >= 0 ? '+' : ''}${delta.toFixed(2)}${pctStr})`,
        );
    }

    // Step 10: Optionally save
    if (opts?.save) {
        try {
            await evaluate(type, filePath, {
                target: resolvedTarget,
                save: true,
                operation: 'refine',
            });
        } catch {
            echoError('Warning: failed to save evaluation results.');
        }
    }

    return { preScore, postScore, delta, fixesApplied, fixesSkipped };
}

/**
 * Preview classified fixes and a projected score delta WITHOUT writing.
 *
 * Uses the in-memory content evaluator ({@link evaluateContent}) so both the
 * baseline and the projection share one scorer — the delta is internally
 * consistent and no file I/O occurs. Nothing is applied; all findings are
 * recorded as skipped for the preview.
 */
function dryRunPreview(
    type: ContentType,
    content: string,
    target: string,
    findings: { finding: Finding; strategy: FixStrategy }[],
): RefineResult {
    let preScore = 0;
    try {
        preScore = evaluateContent(type, content, target).aggregate;
    } catch {
        // Unparseable content: keep pre-score 0; projection stays equal.
    }

    const autoFindings = findings.filter((f) => f.strategy === 'auto-apply');
    const projected = applyAutoFixes(autoFindings, content);
    let projectedPost = preScore;
    try {
        projectedPost = evaluateContent(type, projected.content, target).aggregate;
    } catch {
        // Keep preScore if the projection cannot be scored.
    }

    echo('Dry run — no changes written.');
    if (findings.length === 0) {
        echo(`No issues found. Score: ${preScore.toFixed(2)}`);
    } else {
        for (const { finding, strategy } of findings) {
            const tag = strategy.toUpperCase();
            const change = strategy === 'auto-apply' ? generateAutoChange(finding, content) : null;
            const proposed =
                change && change.kind === 'frontmatter'
                    ? ` → would set ${change.key} = ${formatValue(change.value)}`
                    : '';
            echo(`[${tag}] ${finding.field}: ${finding.message}${proposed}`);
        }
        const delta = projectedPost - preScore;
        const pctStr = preScore > 0 ? `, +${((delta / preScore) * 100).toFixed(1)}%` : '';
        echo(
            `Projected: ${preScore.toFixed(2)} → ${projectedPost.toFixed(2)} (${delta >= 0 ? '+' : ''}${delta.toFixed(2)}${pctStr})`,
        );
    }

    const fixesSkipped: FixRecord[] = findings.map(({ finding, strategy }) => ({
        severity: finding.severity,
        field: finding.field,
        message: finding.message,
        strategy,
        applied: false,
    }));
    return { preScore, postScore: projectedPost, delta: projectedPost - preScore, fixesApplied: [], fixesSkipped };
}

/** Render a projected frontmatter value for dry-run display. */
function formatValue(value: unknown): string {
    if (Array.isArray(value)) return value.length === 0 ? '[]' : `[${value.join(', ')}]`;
    return String(value);
}
