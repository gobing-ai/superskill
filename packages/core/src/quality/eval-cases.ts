import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';

// ── Types ────────────────────────────────────────────────────────────────────

/** Allowed reference kinds for eval-case scoring. */
export type ReferenceKind = 'exact' | 'rule' | 'rubric';

/** Check operators for the rule judge (ports SkillOpt `score_rule_judge` shape deterministically). */
export type RuleCheckOp = 'contains' | 'regex' | 'equals' | 'not_contains' | 'tool_called';

/** A single check entry in a rule judge. */
export interface RuleCheck {
    op: RuleCheckOp;
    arg: string;
}

/** Rule-judge reference: all checks must pass for the case to score 1.0. */
export interface RuleJudge {
    checks: RuleCheck[];
}

/** Rubric reference for open-ended LLM-judged cases. Mirrors `anchors` in rubrics/skill.yaml. */
export interface RubricRef {
    criterion: string;
    excellent?: string;
    poor?: string;
}

/** A single evaluation case. */
export interface EvalCase {
    id: string;
    split: 'train' | 'holdout';
    prompt: string;
    reference_kind: ReferenceKind;
    /** Exact-match string or a rule-judge object. */
    reference: string | RuleJudge | RubricRef;
    tags?: string[];
}

/** The loaded and validated eval-case set from a cases.yaml file. */
export interface EvalCaseSet {
    version: number;
    cases: EvalCase[];
}

function isRuleJudge(value: unknown): value is RuleJudge {
    return typeof value === 'object' && value !== null && 'checks' in value && Array.isArray(value.checks);
}

function isRubricRef(value: unknown): value is RubricRef {
    return (
        typeof value === 'object' &&
        value !== null &&
        'criterion' in value &&
        typeof value.criterion === 'string' &&
        !('checks' in value)
    );
}

// ── Schema ───────────────────────────────────────────────────────────────────

const RuleCheckSchema: z.ZodType<RuleCheck> = z.object({
    op: z.enum(['contains', 'regex', 'equals', 'not_contains', 'tool_called'] as [RuleCheckOp, ...RuleCheckOp[]]),
    arg: z.string().min(1),
});

const RubricRefSchema: z.ZodType<RubricRef> = z.object({
    criterion: z.string().min(1),
    excellent: z.string().optional(),
    poor: z.string().optional(),
});
const RuleJudgeSchema: z.ZodType<RuleJudge> = z.object({
    checks: z.array(RuleCheckSchema).min(1),
});

const EvalCaseSchema: z.ZodType<EvalCase> = z
    .object({
        id: z.string().min(1),
        split: z.enum(['train', 'holdout']),
        prompt: z.string().min(1),
        reference_kind: z.enum(['exact', 'rule', 'rubric']),
        reference: z.union([z.string().min(1), RuleJudgeSchema, RubricRefSchema]),
        tags: z.array(z.string().min(1)).optional(),
    })
    .refine(
        (c) => {
            if (c.reference_kind === 'exact' && typeof c.reference !== 'string') {
                return false;
            }
            if (c.reference_kind === 'rule' && !isRuleJudge(c.reference)) {
                return false;
            }
            if (c.reference_kind === 'rubric' && !isRubricRef(c.reference)) {
                return false;
            }
            return true;
        },
        {
            message:
                'reference must match reference_kind: string for "exact", RuleJudge for "rule", RubricRef for "rubric"',
        },
    );

/** Zod schema for the cases.yaml shape. */
export const EvalCaseSetSchema = z.object({
    version: z.literal(1),
    cases: z.array(EvalCaseSchema).min(1),
});

// ── Errors ───────────────────────────────────────────────────────────────────

/** Error thrown when a cases.yaml fails load-time validation. */
export class EvalCaseError extends Error {
    constructor(
        public readonly file: string,
        public readonly caseId: string | null,
        message: string,
    ) {
        const prefix = caseId ? `${file}: case "${caseId}" — ` : `${file}: `;
        super(`${prefix}${message}`);
        this.name = 'EvalCaseError';
    }
}

// ── Resolution ───────────────────────────────────────────────────────────────

/**
 * Resolve the path to a skill's eval cases file.
 *
 * Resolution order:
 * 1. Explicit `opts.path` (highest priority)
 * 2. `skills/<name>/eval/cases.yaml` relative to CWD
 *
 * @returns The absolute path, or null when the file does not exist.
 */
function resolveEvalCasesPath(name: string, opts?: LoadEvalCasesOptions): string | null {
    // 1. Explicit path
    if (opts?.path) {
        if (!existsSync(opts.path)) return null;
        return opts.path;
    }

    // 2. Co-located with skill: skills/<name>/eval/cases.yaml
    const coLocated = join(process.cwd(), 'skills', name, 'eval', 'cases.yaml');
    if (existsSync(coLocated)) return coLocated;

    return null;
}

// ── Options ──────────────────────────────────────────────────────────────────

/** Options for {@link loadEvalCases}. */
export interface LoadEvalCasesOptions {
    /** Explicit path to a cases.yaml file (e.g. from a flag). */
    path?: string;
}

// ── Loader ───────────────────────────────────────────────────────────────────

/**
 * Load and validate eval cases for a skill.
 *
 * Returns `null` when no cases.yaml file exists (skip-when-absent). Throws
 * {@link EvalCaseError} on malformed input — the error names the file, case
 * id, and field.
 *
 * @param name  The skill name to load eval cases for.
 * @param opts  Optional resolution overrides.
 * @returns     The validated {@link EvalCaseSet}, or `null` when absent.
 * @throws {EvalCaseError} On any validation failure.
 */
export function loadEvalCases(name: string, opts?: LoadEvalCasesOptions): EvalCaseSet | null {
    const resolvedPath = resolveEvalCasesPath(name, opts);
    if (!resolvedPath) return null;

    const raw: string = readFileSync(resolvedPath, 'utf-8');

    let parsed: unknown;
    try {
        parsed = parse(raw);
    } catch (e) {
        throw new EvalCaseError(
            resolvedPath,
            null,
            `Failed to parse YAML: ${e instanceof Error ? e.message : String(e)}`,
        );
    }

    const result = EvalCaseSetSchema.safeParse(parsed);
    if (!result.success) {
        const issue = result.error.issues[0];
        if (!issue) {
            throw new EvalCaseError(resolvedPath, null, 'Schema validation failed with no issue reported.');
        }
        // Try to extract the case id from the path for a better error message
        const caseId = extractCaseIdFromPath(issue.path, parsed);
        const field = issue.path.length > 0 ? issue.path.join('.') : 'root';
        throw new EvalCaseError(resolvedPath, caseId, `Schema validation failed at "${field}": ${issue.message}`);
    }

    const caseSet = result.data as EvalCaseSet;

    // Validate case ids are unique
    const seen = new Set<string>();
    for (const c of caseSet.cases) {
        if (seen.has(c.id)) {
            throw new EvalCaseError(resolvedPath, c.id, `Duplicate case id "${c.id}"`);
        }
        seen.add(c.id);
    }

    return caseSet;
}

/**
 * Try to extract a case id from a Zod issue path.
 * Issue paths like ['cases', 2, 'id'] → extract the case id from the parsed data
 * by looking at the parent object. Since we don't have the parsed data at this
 * point, we extract the array index and format it.
 */
function extractCaseIdFromPath(path: (string | number)[], parsed: unknown): string | null {
    const casesIdx = path.indexOf('cases');
    if (casesIdx >= 0 && path.length > casesIdx + 1 && typeof path[casesIdx + 1] === 'number') {
        const caseIndex = path[casesIdx + 1] as number;
        if (
            typeof parsed === 'object' &&
            parsed !== null &&
            'cases' in parsed &&
            Array.isArray((parsed as { cases?: unknown }).cases)
        ) {
            const candidate = (parsed as { cases: unknown[] }).cases[caseIndex];
            if (
                typeof candidate === 'object' &&
                candidate !== null &&
                'id' in candidate &&
                typeof (candidate as { id?: unknown }).id === 'string'
            ) {
                return (candidate as { id: string }).id;
            }
        }
        return `cases[${caseIndex}]`;
    }
    return null;
}
