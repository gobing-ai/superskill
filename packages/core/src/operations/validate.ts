import { existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseFrontmatter } from '../content/frontmatter';
import { resolveContentPath } from '../content/identity';
import type { ContentType } from '../content/types';
import { descriptionTriggerRichness } from '../quality/heuristics';
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

interface FieldTypeDef {
    type: 'string' | 'array' | 'boolean' | 'enum';
    values?: readonly string[];
}

const FIELD_TYPES: Record<ContentType, Record<string, FieldTypeDef>> = {
    skill: {
        name: { type: 'string' },
        description: { type: 'string' },
        'allowed-tools': { type: 'array' },
        'disable-model-invocation': { type: 'boolean' },
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

/** Frontmatter keys that appear in shipped templates but are not in FIELD_TYPES.
 *  Known-optional fields never trigger unknown-key warnings under --strict. */
const KNOWN_OPTIONAL: Record<ContentType, string[]> = {
    skill: ['license', 'metadata'],
    command: ['argument-hint', 'allowed-tools', 'target'],
    agent: [],
    hook: [],
    magent: [],
};

// ── Core ─────────────────────────────────────────────────────────────────────
/**
 * Check markdown body links for integrity.
 * For every `[...](path)` in the body, resolves the file portion against `baseDir`
 * and flags non-existent targets. Skips external URLs (`http(s)://`, `mailto:`, any
 * `scheme:` link) and anchor-only `#...` links. Strips `#anchor` and `?query`
 * suffixes before resolving so `foo.md#section` checks `foo.md`.
 */
function checkBodyLinks(body: string, baseDir: string): Finding[] {
    const findings: string[] = [];
    const linkRe = /\[([^\]]*)\]\(([^)]+)\)/g;
    // Determine which line ranges are inside fenced code blocks so links
    // inside them are not flagged as broken (they are illustrative).
    const fencedLines = computeFencedLineSet(body);
    for (const match of body.matchAll(linkRe)) {
        const matchLine = (body.slice(0, match.index ?? 0).match(/\n/g)?.length ?? 0) + 1;
        if (fencedLines.has(matchLine)) continue;
        const linkText = match[1];
        const target = match[2];
        if (!target) continue;
        // Skip anchor-only links and any scheme-qualified URL (http:, https:, mailto:, etc.)
        if (/^#/.test(target)) continue;
        if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
        // Strip anchor (#...) and query (?...) suffixes before resolving the file path
        const filePart = target.split(/[#?]/)[0];
        if (!filePart) continue;
        const resolved = join(baseDir, filePart);
        if (!existsSync(resolved)) {
            findings.push(`Broken body link: [${linkText}](${target}) → target not found: ${resolved}`);
        }
    }
    return findings.map((message) => ({ severity: 'warning' as const, field: '_links', message }));
}

/**
 * Return the 1-indexed line numbers that fall inside fenced code blocks.
 * A fence opens at a line whose first non-space chars are 3+ backticks and
 * closes at the next such line. Tildes (~~~) are not treated as fences —
 * shipped content uses backticks exclusively.
 */
function computeFencedLineSet(body: string): Set<number> {
    const fenced = new Set<number>();
    const lines = body.split('\n');
    let inFence = false;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        const fenceMatch = line.match(/^\s*(`{3,})/);
        if (fenceMatch) {
            if (inFence) {
                fenced.add(i + 1); // closing fence line itself
                inFence = false;
            } else {
                fenced.add(i + 1); // opening fence line itself
                inFence = true;
            }
        } else if (inFence) {
            fenced.add(i + 1);
        }
    }
    return fenced;
}

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
    const result = _validateContent(type, content, {
        ...opts,
        referenceChecker:
            opts?.referenceChecker ??
            ((refType, refName) => resolveContentPath(refType, refName, { baseDir }) !== null),
    });

    // Body-link integrity check (E6): flag broken markdown links in the body.
    // Extract body using the same logic as parseFrontmatter to stay consistent.
    let bodyForLinks = content;
    try {
        const { body } = parseFrontmatter(content);
        bodyForLinks = body;
    } catch {
        // No parseable frontmatter — use full content for link checking.
    }
    const linkFindings = checkBodyLinks(bodyForLinks, baseDir);
    result.findings.push(...linkFindings);

    return result;
}

/**
 * Validate a content string directly (internal entry point for unit testing).
 * Skips file-resolution — callers handle file access separately.
 */
export function _validateContent(type: ContentType, content: string, opts?: ValidateOptions): ValidationResult {
    const findings: Finding[] = [];

    // 2. Frontmatter presence. Magents are frontmatter-OPTIONAL (AGENTS.md/CLAUDE.md/GEMINI.md are
    // plain markdown per task 0050); absence is tolerated. Malformed frontmatter (starts with `---`
    // but fails to parse) is still a real error for every type.
    let data: Record<string, unknown>;
    let body: string;
    const frontmatterPresent = content.startsWith('---\n') || content.startsWith('---\r\n');
    try {
        if (frontmatterPresent) {
            const parsed = parseFrontmatter(content);
            data = parsed.data;
            body = parsed.body;
        } else if (type === 'magent') {
            data = {};
            body = content;
        } else {
            findings.push({
                severity: 'error',
                field: 'frontmatter',
                message: 'YAML parse error: Missing frontmatter: content must start with ---',
            });
            return { valid: false, findings };
        }
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
        // 7b. Invocation-axis mode/description mismatch (R3/task 0070, skill only).
        // Advisory/heuristic like the other description-quality strict checks below —
        // gated behind --strict so it never surprises a caller checking only hard schema
        // validity (mirrors how "description too short" already behaves).
        if (type === 'skill') {
            findings.push(...checkInvocationModeMismatch(data));
        }
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
        if (!(KNOWN_HOOK_EVENTS as readonly string[]).includes(data.event)) {
            findings.push({
                severity: 'warning',
                field: 'event',
                message: `'${data.event}' is not a recognized hook event type. Known events: ${KNOWN_HOOK_EVENTS.join(', ')}`,
            });
        }
    }

    // Check model field for agents
    if (type === 'agent' && typeof data.model === 'string') {
        const valid = (MODEL_ALIASES as readonly string[]).includes(data.model) || /^claude-/.test(data.model);
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

// ── Invocation Axis ──────────────────────────────────────────────────────────

/** Trigger-richness score at or above this reads as "model-invoked shaped". */
const TRIGGER_RICH_THRESHOLD = 0.4;
/** Trigger-richness score at or below this reads as "one-line human-facing shaped". */
const ONE_LINE_THRESHOLD = 0.15;

/**
 * Flag a mismatch between the declared invocation mode (`disable-model-invocation`)
 * and the description's actual shape (R3/task 0070):
 * - `disable-model-invocation: true` (user-invoked) with a trigger-rich description
 *   wastes a branch-list on a reader who already picked this skill directly, and
 *   warns that a user-invoked skill cannot be fired by other skills/commands.
 * - Model-invoked (the default) with a bare one-line, non-trigger description gives
 *   the dispatching orchestrator no branch signal to select on.
 * Mid-range scores are ambiguous by design and are not flagged — this is a shape
 * proxy, not a semantic judge (consistent with D6: no heuristic overreach).
 */
function checkInvocationModeMismatch(data: Record<string, unknown>): Finding[] {
    const findings: Finding[] = [];
    const description = typeof data.description === 'string' ? data.description : '';
    if (!description) return findings;
    const userInvoked = data['disable-model-invocation'] === true;
    const richness = descriptionTriggerRichness(description);

    if (userInvoked && richness >= TRIGGER_RICH_THRESHOLD) {
        findings.push({
            severity: 'warning',
            field: 'invocation-mode',
            message:
                'disable-model-invocation is true (user-invoked) but the description reads ' +
                'trigger-rich (branch/dispatch phrasing). A user-invoked skill cannot be fired ' +
                'by other skills or commands — rewrite the description as a one-line, ' +
                'human-facing summary instead.',
        });
    } else if (!userInvoked && richness <= ONE_LINE_THRESHOLD) {
        findings.push({
            severity: 'warning',
            field: 'invocation-mode',
            message:
                'This skill is model-invoked (disable-model-invocation is absent/false) but the ' +
                'description reads like a bare one-liner with no trigger phrasing. The dispatching ' +
                'orchestrator needs distinct "use when" branches to select this skill reliably.',
        });
    }
    return findings;
}

// ── Strict Checks ────────────────────────────────────────────────────────────

function strictChecks(type: ContentType, data: Record<string, unknown>, body: string): Finding[] {
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

    // Single pass: deprecated fields, trailing whitespace, unknown keys.
    // Reference fields (skill:, agent:, command:) are validated as references
    // by checkLinkValidity, so they must be recognized here too — otherwise
    // --strict flags the very fields the validator checks.
    const REFERENCE_FIELDS = ['skill', 'agent', 'command'];
    const recognized = new Set([
        ...Object.keys(FIELD_TYPES[type] ?? {}),
        ...REQUIRED_FIELDS[type],
        ...(KNOWN_OPTIONAL[type] ?? []),
        ...REFERENCE_FIELDS,
    ]);
    for (const [key, value] of Object.entries(data)) {
        const replacement = DEPRECATED_FIELDS[key];
        if (replacement) {
            findings.push({
                severity: 'warning',
                field: key,
                message: `'${key}' is deprecated. ${replacement}`,
            });
        }
        if (typeof value === 'string' && value !== value.trimEnd()) {
            findings.push({
                severity: 'warning',
                field: key,
                message: `'${key}' has trailing whitespace`,
            });
        }
        if (!recognized.has(key) && DEPRECATED_FIELDS[key] === undefined) {
            findings.push({
                severity: 'warning',
                field: key,
                message: `Unknown frontmatter key '${key}'`,
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
