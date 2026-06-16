import { rmSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { echo, echoError } from '@gobing-ai/ts-utils';
import { applyChange, type Change } from '../content/edit';
import { parseFrontmatter } from '../content/frontmatter';
import { resolveContentPath } from '../content/identity';
import type { ContentType, DimensionScore } from '../quality/dimensions';
import type { Target } from '../targets';
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

function getDefaultForField(field: string): string {
    const DEFAULTS: Record<string, string> = {
        name: 'TODO',
        description: 'TODO',
        model: 'default',
    };
    return DEFAULTS[field] ?? 'TODO';
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
    // Missing required field → add with placeholder
    if (finding.message.toLowerCase().includes('missing')) {
        return { kind: 'frontmatter', key: finding.field, value: getDefaultForField(finding.field) };
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

    return null;
}

// ── Backup / Restore ─────────────────────────────────────────────────────────

async function backupFile(filePath: string): Promise<string> {
    let backupPath = `${filePath}.bak`;
    if (await Bun.file(backupPath).exists()) {
        const ts = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
        backupPath = `${filePath}.bak.${ts}`;
    }
    await Bun.write(backupPath, Bun.file(filePath));
    return backupPath;
}

async function restoreFromBackup(backupPath: string, originalPath: string): Promise<void> {
    await Bun.write(originalPath, Bun.file(backupPath));
    // R12: delete the backup after a successful restore so quit leaves no residue.
    rmSync(backupPath, { force: true });
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

// ── Core ─────────────────────────────────────────────────────────────────────

/**
 * Refine content quality by evaluating, classifying findings, applying fixes,
 * and re-evaluating to measure improvement.
 *
 * Pipeline:
 * 1. Validate → if structural errors exist, exit early
 * 2. Evaluate → get baseline score
 * 3. Classify findings into auto-apply / suggest / flag
 * 4. Apply fixes (auto mode or interactive)
 * 5. Re-evaluate → get post score
 * 6. Display delta
 * 7. Optionally save
 */
export async function refine(type: ContentType, nameOrPath: string, opts?: RefineOptions): Promise<RefineResult> {
    const resolvedPath = resolveContentPath(type, nameOrPath);
    const resolvedTarget = opts?.target ?? 'claude';

    // Step 1: Validate
    const validation = await validate(type, resolvedPath ?? nameOrPath, { target: resolvedTarget });
    if (!validation.valid) {
        for (const f of validation.findings) {
            if (f.severity === 'error') {
                echoError(`[ERROR] ${f.field}: ${f.message}`);
            }
        }
        echoError('Fix validation errors before refining.');
        return { preScore: 0, postScore: 0, delta: 0, fixesApplied: [], fixesSkipped: [] };
    }

    // Step 2: Evaluate baseline
    let preScore: number;
    let preDimensions: Record<string, DimensionScore>;
    try {
        const report = await evaluate(type, resolvedPath ?? nameOrPath, { target: resolvedTarget });
        preScore = report.aggregate;
        preDimensions = report.dimensions;
    } catch {
        echoError('Cannot evaluate: file not found or unreadable.');
        return { preScore: 0, postScore: 0, delta: 0, fixesApplied: [], fixesSkipped: [] };
    }
    const findings: { finding: Finding; strategy: FixStrategy }[] = [];

    // From validate
    for (const f of validation.findings) {
        findings.push({ finding: f, strategy: classifyFix(f) });
    }

    // From evaluate: dimension notes
    for (const [dimName, dimScore] of Object.entries(preDimensions)) {
        if (dimScore.note?.trim()) {
            const finding: Finding = {
                severity: dimScore.score < 0.7 ? 'error' : 'warning',
                field: dimName,
                message: dimScore.note,
            };
            findings.push({ finding, strategy: classifyFix(finding) });
        }
    }

    // No findings → early exit
    if (findings.length === 0) {
        echo(`No issues found. Score: ${preScore.toFixed(2)}`);
        return { preScore, postScore: preScore, delta: 0, fixesApplied: [], fixesSkipped: [] };
    }

    // Step 4: Read current content
    let content: string;
    try {
        content = await Bun.file(resolvedPath ?? nameOrPath).text();
    } catch {
        echoError('Cannot read content file for editing.');
        return { preScore, postScore: preScore, delta: 0, fixesApplied: [], fixesSkipped: [] };
    }

    // Step 5: Backup
    const backupPath = await backupFile(resolvedPath ?? nameOrPath);

    // Step 6: Apply fixes
    let fixesApplied: FixRecord[] = [];
    let fixesSkipped: FixRecord[] = [];

    try {
        if (opts?.auto) {
            for (const { finding, strategy } of findings) {
                if (strategy === 'auto-apply') {
                    const change = generateAutoChange(finding, content);
                    if (change) {
                        content = applyChange(content, change);
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
            await Bun.write(resolvedPath ?? nameOrPath, content);
        } else {
            const result = await runInteractive(findings, content, resolvedPath ?? nameOrPath, backupPath);
            fixesApplied = result.fixesApplied;
            fixesSkipped = result.fixesSkipped;
        }
    } catch (err) {
        if (err instanceof RefineAbortedError) {
            return { preScore, postScore: preScore, delta: 0, fixesApplied, fixesSkipped };
        }
        throw err;
    }

    // Step 7: Re-evaluate
    let postScore: number;
    try {
        postScore = (await evaluate(type, resolvedPath ?? nameOrPath, { target: resolvedTarget })).aggregate;
    } catch {
        echoError('Cannot re-evaluate after fixes.');
        return { preScore, postScore: preScore, delta: 0, fixesApplied, fixesSkipped };
    }
    const delta = postScore - preScore;

    // Step 8: Display delta
    if (delta === 0 && preScore === postScore) {
        echo(`Score: ${preScore.toFixed(2)} (no change)`);
    } else {
        const pctStr = preScore > 0 ? `, +${((delta / preScore) * 100).toFixed(1)}%` : '';
        echo(
            `Score: ${preScore.toFixed(2)} → ${postScore.toFixed(2)} (${delta >= 0 ? '+' : ''}${delta.toFixed(2)}${pctStr})`,
        );
    }

    // Step 9: Optionally save
    if (opts?.save) {
        try {
            await evaluate(type, resolvedPath ?? nameOrPath, {
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
