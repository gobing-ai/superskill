import { existsSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseFrontmatter } from '../content/frontmatter';
import { resolveContentPath } from '../content/identity';
import type { ContentType } from '../content/types';
import { KNOWN_HOOK_EVENTS } from '../quality/hook';
import { REQUIRED_FIELDS } from '../quality/types';
import type { Target } from '../targets';

// ── Types ────────────────────────────────────────────────────────────────────

/** Options controlling validation strictness and target-aware checks. */
export interface ValidateOptions {
    /** Enable optional/warning-level checks (min lengths, best-practice patterns). */
    strict?: boolean;
    /** Validate against a specific agent's format requirements. */
    target?: Target;
    /** Optional disk-resolver for reference links (skill:, agent:, command:).
     *  Takes a reference content type and name; returns true when the file exists on disk. */
    referenceChecker?: (refType: ContentType, refName: string) => boolean;
}

/** A single validation finding with severity, affected field, and human-readable message. */
export interface Finding {
    severity: 'error' | 'warning';
    /** Frontmatter key, 'frontmatter' for parse failures, or '_file' for filesystem errors. */
    field: string;
    /** Human-readable sentence. */
    message: string;
}

/** Result of a validate() call: validity flag and list of findings. */
export interface ValidationResult {
    /** `false` when any finding has severity `'error'`. */
    valid: boolean;
    findings: Finding[];
}

// ── Schema Maps ──────────────────────────────────────────────────────────────

/** Agent-relative model aliases used in subagent frontmatter. */
const MODEL_ALIASES = ['inherit', 'sonnet', 'opus', 'haiku'] as const;
type ModelAlias = (typeof MODEL_ALIASES)[number];

interface FieldTypeDef {
    type: 'string' | 'array' | 'boolean' | 'enum';
    values?: readonly string[];
}

const FIELD_TYPES: Record<ContentType, Record<string, FieldTypeDef>> = {
    skill: {
        name: { type: 'string' },
        description: { type: 'string' },
        'allowed-tools': { type: 'array' },
    },
    command: {
        name: { type: 'string' },
        description: { type: 'string' },
        arguments: { type: 'array' },
    },
    agent: {
        name: { type: 'string' },
        description: { type: 'string' },
        model: { type: 'enum', values: MODEL_ALIASES },
        tools: { type: 'array' },
        platforms: { type: 'array' },
    },
    hook: {
        name: { type: 'string' },
        description: { type: 'string' },
        event: { type: 'string' },
    },
    magent: {
        name: { type: 'string' },
        description: { type: 'string' },
        platforms: { type: 'array' },
    },
};

/** Field names that are deprecated across all content types. */
const DEPRECATED_FIELDS: Record<string, string> = {
    tags: 'Use "labels" instead.',
    author: 'No longer used; remove.',
    version: 'Version is derived from the source repository.',
};

// ── Core ─────────────────────────────────────────────────────────────────────

/**
 * Structural + schema validation for a content file.
 *
 * Performs 7 check categories in order: file access, frontmatter presence,
 * required fields, field types, format compliance, link validity, strict checks.
 *
 * Never throws for validation failures — all issues become `Finding` entries.
 */
export async function validate(
    type: ContentType,
    nameOrPath: string,
    opts?: ValidateOptions,
): Promise<ValidationResult> {
    // 1. File access
    const resolvedPath = resolveContentPath(type, nameOrPath);
    if (!resolvedPath) {
        return sentinelResult(`File not found: ${nameOrPath}`);
    }
    if (!existsSync(resolvedPath)) {
        return sentinelResult(`File not found: ${resolvedPath}`);
    }

    let stat: ReturnType<typeof statSync>;
    try {
        stat = statSync(resolvedPath);
    } catch {
        return sentinelResult(`File not found: ${resolvedPath}`);
    }
    if (stat.isDirectory()) {
        return sentinelResult(`Path is a directory, not a file: ${resolvedPath}`);
    }
    if (stat.size === 0) {
        return {
            valid: false,
            findings: [{ severity: 'error', field: 'frontmatter', message: 'File is empty; no frontmatter found' }],
        };
    }

    let content: string;
    try {
        content = await Bun.file(resolvedPath).text();
    } catch {
        return sentinelResult(`Cannot read file: ${resolvedPath}`);
    }

    const baseDir = dirname(resolvedPath);
    return _validateContent(type, content, {
        ...opts,
        referenceChecker: (refType, refName) => resolveContentPath(refType, refName, { baseDir }) !== null,
    });
}

/**
 * Validate a content string directly (internal entry point for unit testing).
 * Skips file-resolution — callers handle file access separately.
 */
export function _validateContent(type: ContentType, content: string, opts?: ValidateOptions): ValidationResult {
    const findings: Finding[] = [];

    // 2. Frontmatter presence
    let data: Record<string, unknown>;
    let body: string;
    try {
        const parsed = parseFrontmatter(content);
        data = parsed.data;
        body = parsed.body;
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        findings.push({ severity: 'error', field: 'frontmatter', message: `YAML parse error: ${msg}` });
        return { valid: false, findings };
    }

    // 3. Required fields
    const required = REQUIRED_FIELDS[type] ?? [];
    const presentKeys = Object.keys(data);
    for (const field of required) {
        if (!presentKeys.includes(field)) {
            findings.push({ severity: 'error', field, message: `Missing required field '${field}'` });
        }
    }

    // 4. Field types
    const typeMap = FIELD_TYPES[type];
    for (const [field, value] of Object.entries(data)) {
        const def = typeMap[field];
        if (!def) continue;
        const typeFinding = validateFieldType(field, value, def);
        if (typeFinding) findings.push(typeFinding);
    }

    // 5. Format compliance (target-aware)
    if (opts?.target) {
        findings.push(...checkFormatCompliance(type, data, opts.target));
    }

    // 6. Link validity
    findings.push(...checkLinkValidity(type, data, opts?.referenceChecker));

    // 7. Strict checks
    if (opts?.strict) {
        findings.push(...strictChecks(type, data, body));
    }

    const valid = !findings.some((f) => f.severity === 'error');
    return { valid, findings };
}

// ── Field Type Validation ────────────────────────────────────────────────────

function validateFieldType(field: string, value: unknown, def: FieldTypeDef): Finding | null {
    if (value === null || value === undefined) return null; // handled by required-fields check

    switch (def.type) {
        case 'string':
            if (typeof value !== 'string') {
                return typeError(field, 'a string', typeof value);
            }
            break;
        case 'array':
            if (!Array.isArray(value)) {
                return typeError(field, 'an array', typeof value);
            }
            break;
        case 'boolean':
            if (typeof value !== 'boolean') {
                return typeError(field, 'a boolean', typeof value);
            }
            break;
        case 'enum': {
            if (typeof value !== 'string') {
                return typeError(field, 'a string (enum value)', typeof value);
            }
            const values = def.values ?? [];
            if (!values.includes(value)) {
                // Also accept full claude-* ids for model field
                if (field === 'model' && /^claude-/.test(value)) {
                    return null;
                }
                return {
                    severity: 'error',
                    field,
                    message: `'${value}' is not a recognized value for '${field}'. Expected one of: ${values.join(', ')}`,
                };
            }
            break;
        }
    }
    return null;
}

function typeError(field: string, expected: string, got: string): Finding {
    return {
        severity: 'error',
        field,
        message: `'${field}' must be ${expected}, got ${got}`,
    };
}

// ── Format Compliance ────────────────────────────────────────────────────────

function checkFormatCompliance(type: ContentType, data: Record<string, unknown>, target: Target): Finding[] {
    const findings: Finding[] = [];

    if (target === 'pi') {
        // Pi uses singular 'tool:' not plural 'tools:'
        if ('tools' in data && type === 'agent') {
            findings.push({
                severity: 'warning',
                field: 'tools',
                message: "Pi uses 'tool:' (singular) instead of 'tools:' (plural) for agent tool references",
            });
        }
    }

    if (target === 'codex') {
        // Codex dialect: slash commands without leading /
        if (type === 'command' && typeof data.name === 'string') {
            if (data.name.startsWith('/')) {
                findings.push({
                    severity: 'warning',
                    field: 'name',
                    message: "Codex slash-commands should omit the leading '/' in the name field",
                });
            }
        }
    }

    return findings;
}

// ── Link Validity ────────────────────────────────────────────────────────────

function checkLinkValidity(
    type: ContentType,
    data: Record<string, unknown>,
    referenceChecker?: (refType: ContentType, refName: string) => boolean,
): Finding[] {
    const findings: Finding[] = [];

    // Check event field for hooks
    if (type === 'hook' && typeof data.event === 'string') {
        if (!KNOWN_HOOK_EVENTS.includes(data.event as (typeof KNOWN_HOOK_EVENTS)[number])) {
            findings.push({
                severity: 'warning',
                field: 'event',
                message: `'${data.event}' is not a recognized hook event type. Known events: ${KNOWN_HOOK_EVENTS.join(', ')}`,
            });
        }
    }

    // Check model field for agents
    if (type === 'agent' && typeof data.model === 'string') {
        const valid = MODEL_ALIASES.includes(data.model as ModelAlias) || /^claude-/.test(data.model);
        if (!valid) {
            findings.push({
                severity: 'warning',
                field: 'model',
                message: `'${data.model}' is not a recognized model alias. Expected one of: ${MODEL_ALIASES.join(', ')} or a full claude-* id`,
            });
        }
    }

    // Reference fields (skill:, agent:, command:) — format check + optional disk resolution
    for (const refField of ['skill', 'agent', 'command']) {
        const val = data[refField];
        if (typeof val === 'string' && val.length > 0) {
            // Format check: reference should be lowercase alphanumeric with dashes
            if (!/^[a-z][a-z0-9-]*$/.test(val)) {
                findings.push({
                    severity: 'warning',
                    field: refField,
                    message: `'${val}' does not match expected reference format (lowercase alphanumeric with dashes)`,
                });
            } else if (referenceChecker) {
                // Disk resolution: verify the referenced file exists
                const refType = refField as ContentType;
                if (!referenceChecker(refType, val)) {
                    findings.push({
                        severity: 'warning',
                        field: refField,
                        message: `'${val}' references a ${refField} file that was not found on disk`,
                    });
                }
            }
        }
    }

    return findings;
}

// ── Strict Checks ────────────────────────────────────────────────────────────

function strictChecks(_type: ContentType, data: Record<string, unknown>, body: string): Finding[] {
    const findings: Finding[] = [];

    // Description length ≥ 40 chars recommended
    const desc = data.description;
    if (typeof desc === 'string' && desc.length < 40) {
        findings.push({
            severity: 'warning',
            field: 'description',
            message: `Description is too short (${desc.length} chars). Recommended minimum is 40 characters.`,
        });
    }

    // Body content after frontmatter ≥ 20 chars
    const trimmedBody = body.trim();
    if (trimmedBody.length < 20) {
        findings.push({
            severity: 'warning',
            field: 'body',
            message: `Body content is too short (${trimmedBody.length} chars). Recommended minimum is 20 characters.`,
        });
    }

    // Deprecated field names
    for (const key of Object.keys(data)) {
        const replacement = DEPRECATED_FIELDS[key];
        if (replacement) {
            findings.push({
                severity: 'warning',
                field: key,
                message: `'${key}' is deprecated. ${replacement}`,
            });
        }
    }

    // Trailing whitespace in frontmatter string values
    for (const [field, value] of Object.entries(data)) {
        if (typeof value === 'string' && value !== value.trimEnd()) {
            findings.push({
                severity: 'warning',
                field,
                message: `'${field}' has trailing whitespace`,
            });
        }
    }

    return findings;
}

// ── Output ───────────────────────────────────────────────────────────────────

/**
 * Format a ValidationResult for display.
 * - Without `--json`: each finding as `[SEVERITY] field: message`, or `'Valid'` if no findings.
 * - With `--json`: full result as JSON string.
 */
export function formatValidationResult(result: ValidationResult, json?: boolean): string {
    if (json) {
        return JSON.stringify(result);
    }
    if (result.findings.length === 0) {
        return 'Valid';
    }
    return result.findings.map((f) => `[${f.severity.toUpperCase()}] ${f.field}: ${f.message}`).join('\n');
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function sentinelResult(message: string): ValidationResult {
    return {
        valid: false,
        findings: [{ severity: 'error', field: '_file', message }],
    };
}
