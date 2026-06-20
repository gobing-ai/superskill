import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';
import { type ContentType, DIMENSION_REGISTRY } from './dimensions';

// ── Types ────────────────────────────────────────────────────────────────────

/** Few-shot calibration anchors for the Scorer persona. */
export interface RubricAnchors {
    excellent?: string;
    poor?: string;
}

/** A single dimension entry in a rubric. */
export interface RubricDimension {
    name: string;
    weight: number;
    criterion: string;
    anchors?: RubricAnchors;
}

/** A loaded and validated rubric. The fitness function the quality brain scores against. */
export interface Rubric {
    version: number;
    type: ContentType;
    dimensions: RubricDimension[];
}

// ── Schema ───────────────────────────────────────────────────────────────────

const CONTENT_TYPES: ContentType[] = ['skill', 'command', 'agent', 'hook', 'magent'];

/** Zod schema for the rubric YAML shape. Validates structure; custom checks run post-parse. */
export const RubricSchema = z.object({
    version: z.number().int().min(1),
    type: z.enum(CONTENT_TYPES as [ContentType, ...ContentType[]]),
    dimensions: z
        .array(
            z.object({
                name: z.string().min(1),
                weight: z.number().min(0).max(1),
                criterion: z.string().min(1),
                anchors: z
                    .object({
                        excellent: z.string().optional(),
                        poor: z.string().optional(),
                    })
                    .optional(),
            }),
        )
        .min(1),
});

// ── Errors ───────────────────────────────────────────────────────────────────

/** Error thrown when a rubric fails load-time validation. Carries the offending field. */
export class RubricError extends Error {
    /** The field that failed validation (e.g. `dimensions[2].name`, `weights.sum`, `version`). */
    readonly field: string;
    /** The actual value that caused the failure, if applicable. */
    readonly actual?: unknown;

    constructor(field: string, message: string, actual?: unknown) {
        super(message);
        this.name = 'RubricError';
        this.field = field;
        if (actual !== undefined) {
            this.actual = actual;
        }
    }
}

// ── Resolution ───────────────────────────────────────────────────────────────

/** Options for {@link loadRubric}. */
export interface LoadRubricOptions {
    /** Explicit rubric file path (e.g. from `--rubric` flag). Highest priority. */
    path?: string;
}

/**
 * Resolve rubric file content for a content type.
 *
 * Resolution order (mirrors F007 scaffold template precedence — user → built-in):
 * 1. Explicit `opts.path` (from `--rubric` flag)
 * 2. User override `~/.superskill/rubrics/<type>.yaml`
 * 3. Dev: `src/rubrics/<type>.yaml` (relative to this module → `../rubrics/`)
 * 4. Prod: `rubrics/<type>.yaml` (relative to dist → `../../rubrics/`)
 *
 * @returns The raw YAML file content.
 * @throws {RubricError} If no rubric file is found at any resolution path.
 */
function resolveRubricContent(type: ContentType, opts?: LoadRubricOptions): string {
    // 1. Explicit path (highest priority)
    if (opts?.path) {
        if (!existsSync(opts.path)) {
            throw new RubricError('path', `Rubric file not found: ${opts.path}`, opts.path);
        }
        return readFileSync(opts.path, 'utf-8');
    }

    // 2. User override (~/.superskill/rubrics/<type>.yaml)
    const homeDir = process.env.HOME ?? homedir();
    const userPath = join(homeDir, '.superskill', 'rubrics', `${type}.yaml`);
    if (existsSync(userPath)) {
        return readFileSync(userPath, 'utf-8');
    }

    // 3. Dev: src/rubrics/<type>.yaml (this module is at src/quality/, so ../rubrics/)
    const devPath = join(import.meta.dir, '..', 'rubrics', `${type}.yaml`);
    if (existsSync(devPath)) {
        return readFileSync(devPath, 'utf-8');
    }

    // 4. Prod: rubrics/<type>.yaml (dist is at dist/quality/, so ../../rubrics/)
    const prodPath = join(import.meta.dir, '..', '..', 'rubrics', `${type}.yaml`);
    if (existsSync(prodPath)) {
        return readFileSync(prodPath, 'utf-8');
    }

    throw new RubricError(
        'path',
        `No rubric found for type "${type}". Searched: ${opts?.path ?? '(no explicit path)'}, ${userPath}, ${devPath}, ${prodPath}`,
        type,
    );
}

/** Tolerance for weight-sum validation (±0.001). */
const WEIGHT_SUM_TOLERANCE = 0.001;

// ── Loader ───────────────────────────────────────────────────────────────────

/**
 * Load and validate a rubric for a content type.
 *
 * Resolution order: explicit `opts.path` → user `~/.superskill/rubrics/<type>.yaml` →
 * package default. See {@link resolveRubricContent}.
 *
 * @param type  The content type to load a rubric for.
 * @param opts  Optional resolution overrides.
 * @returns     The loaded and validated {@link Rubric}.
 * @throws {RubricError} On any validation failure (unknown dimension, bad weights, missing version,
 *                       file not found). The `field` property names the offending field.
 */
export function loadRubric(type: ContentType, opts?: LoadRubricOptions): Rubric {
    const raw = resolveRubricContent(type, opts);

    let parsed: unknown;
    try {
        parsed = parse(raw);
    } catch (e) {
        throw new RubricError('yaml', `Failed to parse rubric YAML: ${e instanceof Error ? e.message : String(e)}`);
    }

    // zod validates shape: version (int≥1), type (enum), dimensions[] (non-empty)
    const result = RubricSchema.safeParse(parsed);
    if (!result.success) {
        const issue = result.error.issues[0];
        if (!issue) {
            throw new RubricError('root', 'Rubric schema validation failed with no issue reported.');
        }
        const field = issue.path.length > 0 ? issue.path.join('.') : 'root';
        throw new RubricError(field, `Rubric schema validation failed: ${issue.message}`);
    }

    const rubric = result.data as Rubric;

    // R7: every dimension name must be a DIMENSION_REGISTRY[type] key
    const allowed = DIMENSION_REGISTRY[rubric.type];
    for (const [i, dim] of rubric.dimensions.entries()) {
        if (!allowed.includes(dim.name)) {
            throw new RubricError(
                `dimensions[${i}].name`,
                `Unknown dimension name "${dim.name}" for type "${rubric.type}". Allowed: ${allowed.join(', ')}`,
                dim.name,
            );
        }
    }

    // R7: weights must sum to 1.0 (±0.001)
    const weightSum = rubric.dimensions.reduce((acc, d) => acc + d.weight, 0);
    if (Math.abs(weightSum - 1.0) > WEIGHT_SUM_TOLERANCE) {
        throw new RubricError(
            'weights.sum',
            `Dimension weights sum to ${weightSum}, expected 1.0 (±${WEIGHT_SUM_TOLERANCE}).`,
            weightSum,
        );
    }

    return rubric;
}
