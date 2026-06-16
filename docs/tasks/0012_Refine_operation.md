---
name: Refine operation
description: Evaluate → fix pipeline — classifies findings into auto-apply/suggest/flag strategies, applies structural fixes automatically or interactively, re-evaluates and shows score delta
status: Planned
created_at: 2026-06-16T00:00:00.000Z
updated_at: 2026-06-16T00:00:00.000Z
folder: docs/tasks
type: task
feature-id: F012
priority: high
estimated_hours: 5
tags: ["operations","quality","refinement","fix-strategy"]
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0012. Refine operation

### Background

The refine operation closes the fast-feedback loop of the Phase 2 quality pipeline. Instead of requiring the user to evaluate → manually fix → re-evaluate in separate steps, refine does it in one operation: evaluate the content, classify every finding into a fix strategy bucket, apply corrections, then re-evaluate to show the score delta. This makes the quality pipeline self-correcting for mechanical problems and tightens the authoring iteration cycle.

Three fix strategies govern what happens to each finding:
- **Auto-apply**: structural frontmatter fixes that can be applied deterministically — add missing fields, normalize array syntax, fix YAML indentation, correct field types. Applied silently in `--auto` mode; presented for confirmation in interactive mode.
- **Suggest**: content improvements that benefit from human review — rewrite ambiguous descriptions, de-duplicate trigger phrases, improve section naming. Shown in interactive mode; skipped in `--auto` mode.
- **Flag**: issues requiring human judgment beyond what the tool can decide — architecture-level changes, scope decisions, model selection. Always shown but never auto-applied; user must handle manually.

Refine calls `validate` (F010) first to catch structural problems that block evaluation, then `evaluate` (F011) for baseline scores, classifies findings, applies fixes via `applyChange` from `content/edit.ts` (F007), re-evaluates, and displays the score delta.

### Requirements

**R1** — Export `refine(type: ContentType, nameOrPath: string, opts?: RefineOptions): Promise<RefineResult>`. Runs the full evaluate → classify → fix → re-evaluate pipeline.

**R2** — `RefineOptions` type: `{ target?: Target, auto?: boolean, save?: boolean }`. `auto` applies only auto-apply fixes without user interaction. `save` persists both pre and post evaluation results. `target` forwards to both validate and evaluate.

**R3** — `RefineResult` type: `{ preScore: number, postScore: number, delta: number, fixesApplied: FixRecord[], fixesSkipped: FixRecord[] }`. `delta` = `postScore - preScore` (positive = improvement).

**R4** — `FixRecord` type: `{ severity: string, field: string, message: string, strategy: 'auto-apply' | 'suggest' | 'flag', applied: boolean }`. Records what was attempted and whether it was applied.

**R5** — **Fix strategy classification**: each finding from validate (F010) and each dimension note from evaluate (F011) is classified into one of three strategies:
- **Auto-apply**: structural issues — missing frontmatter fields, wrong field types (string→array, number→string), YAML indentation problems, missing required fields with known defaults
- **Suggest**: content quality issues — ambiguous/short descriptions, duplicate trigger phrases, poor section naming, lacking verification language
- **Flag**: architectural concerns — "merge this skill with sibling", scope expansions, model selection changes, decisions requiring domain context

Classification logic:
- Validate findings with `severity: 'error'` and field-type issues → `'auto-apply'`
- Validate findings about missing required fields → `'auto-apply'` (fields can be auto-added with placeholders)
- Evaluate dimension notes about content quality (clarity, conciseness, trigger-accuracy) → `'suggest'`
- Evaluate dimension notes about architecture (skill-linkage suggesting merge, tool-selection suggesting redesign) → `'flag'`

**R6** — **Auto-apply fix implementations**:
- **Missing frontmatter field**: locate the closing `---` delimiter in the content, insert the field before it with a placeholder value. Example: add `description: TODO` before `---`.
- **Wrong field type (string → array)**: if field should be an array but is a bare string, wrap it in YAML array syntax. Example: `allowed-tools: read` → `allowed-tools:\n  - read`.
- **Wrong field type (number → string)**: if field should be a string but is a number, quote it. Example: `description: 123` → `description: '123'`.
- **YAML indentation normalization**: re-serialize the frontmatter block via `yaml.stringify(yaml.parse(frontmatterRaw))` for clean, consistent formatting.
- **Missing required field with known default**: add the field with a sensible default. Example: missing `model` for agent → add `model: default`.

All auto-apply fixes mutate content through `applyChange` from `content/edit.ts` (F007). The change format for frontmatter edits is `{ kind: 'frontmatter', key: string, value: unknown }`. For body text edits, `{ kind: 'text', current: string, proposed: string }`. No bespoke string manipulation or regex replacements live in refine.ts — all mutation goes through `applyChange`.

**R7** — **Suggest fix implementations**: generate proposed changes from dimension notes. The note text is the suggestion. Example: dimension note `"Trigger phrases overlap with rd3-code-review"` produces a suggestion: "Consider updating trigger phrases to be more specific and distinct from rd3-code-review". Suggestions are presented to the user (interactive mode) but never applied without confirmation. In `--auto` mode, suggestions are recorded in `fixesSkipped` but not applied.

**R8** — **Flag fix handling**: flag findings are always displayed to the user but never auto-applied. In both `--auto` and interactive modes, flag findings are recorded in `fixesSkipped` with `applied: false`. The user is expected to handle these manually after the refine session.

**R9** — **`--auto` mode**: applies only auto-apply category fixes without any user interaction. Steps:
1. Run validate to get structural findings
2. Run evaluate to get baseline scores
3. Classify all findings
4. Apply all auto-apply fixes via `applyChange`
5. Skip suggest and flag fixes (record in `fixesSkipped`)
6. Re-evaluate
7. Display score delta
8. If `--save`: persist the post-refine evaluation with `operation: 'refine'`

**R10** — **Interactive mode** (default): presents each finding to the user for accept/reject/skip. Implementation:
- Use `readline` (via `node:readline` or `bun:readline`) for prompting
- Display format: `[N/M] [STRATEGY] field: message` followed by `Apply? [(a)ccept, (r)eject, (s)kip, (q)uit]`
- Accept: apply the fix via `applyChange`, record in `fixesApplied`
- Reject: skip this fix, record in `fixesSkipped` with `applied: false`
- Skip: same as reject but implies "maybe later"
- Quit: exit interactive mode, restore content from backup (if any changes were made), discard remaining fixes
- Auto-apply fixes are shown but default to 'accept' (press Enter to confirm)
- Suggest fixes are shown but default to 'reject' (press Enter to skip)
- Flag fixes are shown with `(requires manual review)` note and only offer skip/quit

**R11** — **Content backup**: before making any edits, create a backup of the original file at `<original>.bak` using `Bun.write(backupPath, Bun.file(originalPath))` (effectively `fs.copyFileSync`). If the backup file already exists, append a timestamp: `<original>.bak.2026-06-16T120000`. The backup preserves the original content so the user can recover if refine makes unwanted changes.

**R12** — **Rollback on quit**: if the user presses `q` in interactive mode, restore the original content from the backup file and delete the backup. If no changes were made yet (user quit on first prompt), just delete the backup and exit cleanly.

**R13** — **Score delta display**: after re-evaluation, display the delta formatted as:
```
Score: 0.72 → 0.85 (+0.13, +18.1%)
```
The percentage is computed as `(delta / preScore) * 100`; if `preScore` is 0, omit the percentage. Output via `process.stdout.write`.

**R14** — **`--save` flag**: persists the post-refine evaluation. Calls evaluate's `--save` path by invoking `evaluate(type, resolvedPath, { target, save: true, operation: 'refine' })`. The `operation` value `'refine'` is passed through to `insertEvaluation` — the store never defaults it (see F008, F011). Does NOT separately save the pre-refine evaluation; only the post-refine result is persisted (the pre score is transient). If the user also wants the pre score stored, they should run `evaluate --save` before `refine`.

**R15** — **`--target` passthrough**: the target option is forwarded to both `validate(type, resolvedPath, { target })` and `evaluate(type, resolvedPath, { target, ... })`. This ensures target-specific validation rules and evaluation dimensions are applied.

**R16** — **Pipeline ordering**:
1. `validate()` → if errors exist, display them and exit (do not proceed to evaluate — structural problems must be fixed first). Exit with the validation failure message and return `{ preScore: 0, postScore: 0, delta: 0, fixesApplied: [], fixesSkipped: [] }` so the F014 layer can map to exit 1.
2. `evaluate()` → get baseline `QualityReport` with `preScore = report.aggregate`
3. Classify findings
4. Apply fixes (auto or interactive)
5. `evaluate()` again → get post-refine `QualityReport` with `postScore = report.aggregate`
6. Display delta
7. Optionally save

**R17** — **Content type coverage**: works for all 5 content types. The validate and evaluate dispatches handle type-specific logic internally; refine only orchestrates.

**R18** — **Edit mechanism**: all content mutations go through `applyChange` from `content/edit.ts` (F007). The function signature is `applyChange(content: string, change: Change): string` where `Change` is `{ kind: 'frontmatter', key: string, value: unknown } | { kind: 'text', current: string, proposed: string }`. Frontmatter changes round-trip through `yaml.parseDocument` so comments and key order survive. Body text changes locate the nearest match of `current` and replace with `proposed`. Refine.ts uses only `applyChange` for all edits — no ad-hoc regex or string replacement.

### Q&A



### Design

**Module location**: `apps/cli/src/operations/refine.ts`.

**Imports**:
- `validate` from `operations/validate.ts` (F010) — structural validation
- `evaluate` from `operations/evaluate.ts` (F011) — quality scoring
- `applyChange`, `Change` from `content/edit.ts` (F007) — content mutation primitive
- `resolveContentPath`, `resolveContentName` from `content/identity.ts` (F007) — path resolution
- `ContentType` from `quality/dimensions.ts` (F009) — type union
- `Target` from `targets.ts` — target type
- `* as readline` from `node:readline` — interactive prompting

**Core function signature**:

```typescript
import type { ContentType } from '../quality/dimensions';
import type { Target } from '../targets';
import type { Finding } from './validate';

export interface RefineOptions {
    target?: Target;
    auto?: boolean;
    save?: boolean;
}

export interface FixRecord {
    severity: string;
    field: string;
    message: string;
    strategy: 'auto-apply' | 'suggest' | 'flag';
    applied: boolean;
}

export interface RefineResult {
    preScore: number;
    postScore: number;
    delta: number;
    fixesApplied: FixRecord[];
    fixesSkipped: FixRecord[];
}

export async function refine(
    type: ContentType,
    nameOrPath: string,
    opts?: RefineOptions,
): Promise<RefineResult>;
```

**Fix strategy classification function**:

```typescript
type FixStrategy = 'auto-apply' | 'suggest' | 'flag';

// Classification rules from design doc §2.4 and F012 feature spec
function classifyFix(finding: Finding): FixStrategy {
    // Structural errors → auto-apply
    if (finding.severity === 'error') {
        return 'auto-apply';
    }

    // Warning-level findings are content or architecture
    // Content quality: clarity, conciseness, description length, trigger phrases
    if (finding.field === 'description' ||
        finding.field === 'trigger-accuracy' ||
        finding.field === 'clarity' ||
        finding.field === 'conciseness') {
        return 'suggest';
    }

    // Architecture/scope: skill-linkage, tool-selection, model-fit, scope decisions
    if (finding.field === 'skill-linkage' ||
        finding.field === 'tool-selection' ||
        finding.field === 'model-fit' ||
        finding.field === 'platform-coverage') {
        return 'flag';
    }

    // Default: structural warnings → auto-apply
    return 'auto-apply';
}
```

**Auto-fix implementation functions**:

```typescript
import { applyChange } from '../content/edit';

// Generate a Change from a Finding for auto-apply fixes
function generateAutoChange(finding: Finding, content: string): Change | null {
    // Missing required field → add with placeholder
    if (finding.message.includes('missing')) {
        const field = finding.field;
        const defaultValue = getDefaultForField(field);
        return { kind: 'frontmatter', key: field, value: defaultValue };
    }

    // Wrong type: string → array
    if (finding.message.includes('must be an array')) {
        // parseFrontmatter to get current value, wrap in array
        const parsed = parseFrontmatter(content);
        if (parsed.data && parsed.data[finding.field]) {
            const newValue = Array.isArray(parsed.data[finding.field])
                ? parsed.data[finding.field]
                : [parsed.data[finding.field]];
            return { kind: 'frontmatter', key: finding.field, value: newValue };
        }
    }

    // Wrong type: number → string
    if (finding.message.includes('must be a string')) {
        const parsed = parseFrontmatter(content);
        if (parsed.data && parsed.data[finding.field] !== undefined) {
            return { kind: 'frontmatter', key: finding.field, value: String(parsed.data[finding.field]) };
        }
    }

    return null; // cannot auto-fix this specific finding
}

function getDefaultForField(field: string): string {
    const DEFAULTS: Record<string, string> = {
        'name': 'TODO',
        'description': 'TODO',
        'model': 'default',
    };
    return DEFAULTS[field] ?? 'TODO';
}
```

**Content backup and restore**:

```typescript
async function backupFile(filePath: string): Promise<string> {
    let backupPath = filePath + '.bak';
    // If backup already exists, use timestamped name
    if (await Bun.file(backupPath).exists()) {
        const ts = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
        backupPath = `${filePath}.bak.${ts}`;
    }
    await Bun.write(backupPath, Bun.file(filePath));
    return backupPath;
}

async function restoreFromBackup(backupPath: string, originalPath: string): Promise<void> {
    await Bun.write(originalPath, Bun.file(backupPath));
    // Clean up backup after successful restore
    // Note: Bun does not have a direct unlink; use node:fs or keep backup
}
```

**Interactive mode implementation**:

```typescript
async function runInteractive(
    findings: { finding: Finding, strategy: FixStrategy }[],
    content: string,
    filePath: string,
    backupPath: string,
): Promise<{ newContent: string, fixesApplied: FixRecord[], fixesSkipped: FixRecord[] }> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    const question = (prompt: string): Promise<string> =>
        new Promise(resolve => rl.question(prompt, resolve));

    const fixesApplied: FixRecord[] = [];
    const fixesSkipped: FixRecord[] = [];
    let currentContent = content;

    for (let i = 0; i < findings.length; i++) {
        const { finding, strategy } = findings[i];
        const label = `[${i + 1}/${findings.length}]`;

        if (strategy === 'flag') {
            process.stdout.write(`${label} [FLAG] ${finding.field}: ${finding.message}\n`);
            process.stdout.write('  (requires manual review — cannot auto-apply)\n');
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
        const prompt = `${label} [${strategy.toUpperCase()}] ${finding.field}: ${finding.message}\n` +
            `  Apply? [(a)ccept, (r)eject, (s)kip, (q)uit] (default: ${defaultChoice}): `;

        const answer = (await question(prompt)).trim().toLowerCase() || defaultChoice;

        if (answer === 'q') {
            // Restore from backup and exit
            await restoreFromBackup(backupPath, filePath);
            rl.close();
            throw new RefineAbortedError('User quit interactive mode');
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

    // Write final content back to file
    await Bun.write(filePath, currentContent);

    return { newContent: currentContent, fixesApplied, fixesSkipped };
}
```

**Main pipeline flow**:

```typescript
export async function refine(
    type: ContentType,
    nameOrPath: string,
    opts?: RefineOptions,
): Promise<RefineResult> {
    const resolvedPath = resolveContentPath(type, nameOrPath, opts);
    const resolvedTarget = opts?.target ?? 'claude';

    // Step 1: Validate
    const validation = await validate(type, resolvedPath, { target: resolvedTarget });
    if (!validation.valid) {
        // Display validation errors to user
        for (const f of validation.findings) {
            if (f.severity === 'error') {
                process.stderr.write(`[ERROR] ${f.field}: ${f.message}\n`);
            }
        }
        process.stderr.write('Fix validation errors before refining.\n');
        return { preScore: 0, postScore: 0, delta: 0, fixesApplied: [], fixesSkipped: [] };
    }

    // Step 2: Evaluate baseline
    const preReport = await evaluate(type, resolvedPath, { target: resolvedTarget });
    const preScore = preReport.aggregate;

    // Step 3: Collect and classify findings
    const findings: { finding: Finding, strategy: FixStrategy }[] = [];

    // From validate: structural findings
    for (const f of validation.findings) {
        findings.push({ finding: f, strategy: classifyFix(f) });
    }

    // From evaluate: dimension notes as findings
    for (const [dimName, dimScore] of Object.entries(preReport.dimensions)) {
        if (dimScore.note && dimScore.note.trim()) {
            const finding: Finding = {
                severity: dimScore.score < 0.7 ? 'error' : 'warning',
                field: dimName,
                message: dimScore.note,
            };
            findings.push({ finding, strategy: classifyFix(finding) });
        }
    }

    // Step 4: Read current content
    let content = await Bun.file(resolvedPath).text();

    // Step 5: Backup
    const backupPath = await backupFile(resolvedPath);

    // Step 6: Apply fixes
    let fixesApplied: FixRecord[] = [];
    let fixesSkipped: FixRecord[] = [];

    try {
        if (opts?.auto) {
            // --auto mode: apply only auto-apply fixes
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
            // Write back
            await Bun.write(resolvedPath, content);
        } else {
            // Interactive mode
            const result = await runInteractive(findings, content, resolvedPath, backupPath);
            fixesApplied = result.fixesApplied;
            fixesSkipped = result.fixesSkipped;
        }
    } catch (err) {
        if (err instanceof RefineAbortedError) {
            // Backup was already restored in runInteractive
            // Return partial result
            return { preScore, postScore: preScore, delta: 0, fixesApplied, fixesSkipped };
        }
        throw err;
    }

    // Step 7: Re-evaluate
    const postReport = await evaluate(type, resolvedPath, { target: resolvedTarget });
    const postScore = postReport.aggregate;
    const delta = postScore - preScore;

    // Step 8: Display delta
    if (delta === 0 && preScore === postScore) {
        process.stdout.write(`Score: ${preScore.toFixed(2)} (no change)\n`);
    } else {
        const pctStr = preScore > 0 ? `, +${(delta / preScore * 100).toFixed(1)}%` : '';
        process.stdout.write(`Score: ${preScore.toFixed(2)} → ${postScore.toFixed(2)} (${delta >= 0 ? '+' : ''}${delta.toFixed(2)}${pctStr})\n`);
    }

    // Step 9: Optionally save
    if (opts?.save) {
        await evaluate(type, resolvedPath, {
            target: resolvedTarget,
            save: true,
            operation: 'refine',
        });
    }

    return { preScore, postScore, delta, fixesApplied, fixesSkipped };
}
```

**Edge cases**:
- **File modified externally during interactive session**: after each edit, the content is re-read? No — we work on an in-memory copy and write back at the end. If the file changed on disk after our read, our write will overwrite the external changes. This is acceptable for v1; a future enhancement could check `mtime` before writing.
- **Read-only files**: `Bun.write` will fail with a permission error. Catch the error, report to user, suggest `chmod`.
- **Binary content**: validate should catch this and return errors before refine proceeds. If validate somehow passes, `parseFrontmatter` will fail — handled by the evaluate step producing low scores.
- **No findings to fix**: if both validate and evaluate produce zero findings, display "No issues found. Score: X.XX" and exit with delta 0. This is a valid success case.
- **User quits on first prompt**: restore backup, return `preScore` for both pre and post, delta 0, empty fix arrays.
- **Concurrent refine sessions**: no locking mechanism in v1. Two concurrent refine sessions on the same file may produce interleaved writes. Acceptable for v1; warn in docs.

### Solution

- `apps/cli/src/operations/refine.ts` — exports `refine()`, `classifyFix()`, `generateAutoChange()`, `RefineOptions`, `FixRecord`, `RefineResult`
- Orchestrates validate (F010) + evaluate (F011) in a pipeline with fix classification and application
- All content mutations go through `applyChange` from `content/edit.ts` (F007) — no ad-hoc string manipulation
- Backup/restore for safety: original saved to `<file>.md.bak` before any edits
- Interactive mode via `node:readline` with accept/reject/skip/quit per finding
- `--auto` mode applies structural fixes silently, skips suggest and flag
- `--save` persists post-refine evaluation with `operation: 'refine'`
- Score delta displayed as absolute change and percentage

### Plan

1. Create `apps/cli/src/operations/refine.ts` with the full `refine()` function
2. Implement `classifyFix()` — classification of findings into auto-apply/suggest/flag
3. Implement `generateAutoChange()` — generate `Change` objects from findings for auto-apply fixes
4. Implement `backupFile()` and `restoreFromBackup()` for content safety
5. Implement `--auto` mode: apply auto-apply fixes silently, skip suggest/flag
6. Implement interactive mode with readline: display findings, accept/reject/skip/quit per item
7. Implement score delta calculation and display
8. Wire `--save` for post-refine evaluation persistence with `operation: 'refine'`
9. Wire `--target` passthrough to validate and evaluate
10. Handle edge cases: external file modification, read-only files, no findings, user quit, binary content
11. Run `bun run lint` and verify typecheck passes


### Review



### P1 — Blockers
| # | Title | Dimension | Location | Recommendation |
|---|-------|-----------|----------|----------------|
| _none_ | | | | |

### P2 — Warnings
| # | Title | Dimension | Location | Recommendation |
|---|-------|-----------|----------|----------------|
| _none_ | | | | |

### P3 — Info
| # | Title | Dimension | Location | Recommendation |
|---|-------|-----------|----------|----------------|
| _none_ | | | | |

### P4 — Suggestions
| # | Title | Dimension | Location | Recommendation |
|---|-------|-----------|----------|----------------|
| _none_ | | | | |


### Testing



### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References

- `docs/features/F012-refine-operation.md` — feature spec
- `docs/design/design-doc-phase2.md` §2.4 — refine operation design
- `docs/design/design-doc-phase2.md` §9 — shared foundation (F007 content/*, especially `content/edit.ts` `applyChange`)
- `docs/design/design-doc-phase2.md` §10 — storage + identity conventions (ADR-013)
- `docs/features/F010-validate-operation.md` — validate (structural findings source)
- `docs/features/F011-evaluate-operation.md` — evaluate (quality scoring, --save with operation override)
- `docs/features/F007-template-scaffold.md` — applyChange, resolveContentPath, resolveContentName
- `docs/features/F009-quality-dimensions.md` — ContentType, dimension names for classification
- `apps/cli/src/targets.ts` — Target type
