---
name: Validate operation
description: Structural + schema validation for all 5 content types — frontmatter, required fields, field types, format compliance, link validity
status: Done
created_at: 2026-06-16T00:00:00.000Z
updated_at: 2026-06-16T21:15:58.799Z
folder: docs/tasks
type: task
feature-id: F010
priority: high
estimated_hours: 4
tags: ["operations","quality","validation"]
impl_progress:
  planning: done
  design: done
  implementation: done
  review: done
  testing: done
---

## 0010. Validate operation

### Background

The validate operation is the first quality gate in the Phase 2 authoring pipeline. It performs structural and schema validation on content files for all five content types (skill, command, agent, hook, magent). Every downstream operation — evaluate (F011), refine (F012), evolve (F013) — depends on knowing whether content is structurally valid before scoring quality or applying fixes. Validate catches schema violations early so evaluate operates on well-formed input and refine knows what structural fixes to apply.

Validate is a **pure function**: it reads a file, parses its YAML frontmatter, checks required fields, field types, format compliance, and link validity, then returns a `ValidationResult`. The operation never calls `process.exit` — exit code mapping is done by the F014 command layer (0 = no errors, 1 = one or more error findings, 2 = file not found or unreadable).

Output is either structured JSON (`--json`) or a human-readable list of findings, each with a severity (`error` | `warning`), affected field name, and human-readable message.

### Requirements

**R1** — Export `validate(type: ContentType, nameOrPath: string, opts?: ValidateOptions): Promise<ValidationResult>`. The function reads the resolved file path, parses frontmatter via `parseFrontmatter` (F007), and runs all check categories. It never throws for validation failures — all failures become `Finding` entries with `severity: 'error'`.

**R2** — `ValidateOptions` type: `{ strict?: boolean, target?: Target }`. `strict` enables optional/warning-level checks (recommended minimum field lengths, best-practice patterns). `target` validates against a specific agent's format requirements (e.g. Pi frontmatter structure).

**R3** — `ValidationResult` type: `{ valid: boolean, findings: Finding[] }`. `valid` is `false` when any finding has `severity: 'error'` (warnings alone do not make it invalid).

**R4** — `Finding` type: `{ severity: 'error' | 'warning', field: string, message: string }`. `field` is the frontmatter key or `'frontmatter'` for parse failures. `message` is a human-readable sentence.

**R5** — **Frontmatter presence check**: file reads successfully; YAML frontmatter delimited by `---` exists and parses without error. Uses `parseFrontmatter` from `content/frontmatter.ts` (F007). A `FrontmatterError` becomes a single `error` finding on `field: 'frontmatter'` — validate does not throw out.

**R6** — **Required fields check**: `name` and `description` are required for all content types. Type-specific required fields come from `REQUIRED_FIELDS: Record<ContentType, string[]>` in `quality/dimensions.ts` (F009). Examples: `agent` requires `['name', 'description', 'model']`; `hook` requires `['name', 'description', 'event']`; `skill` requires `['name', 'description']`. Each missing required field becomes an `error` finding.

**R7** — **Field type check**: validates that frontmatter values match expected types. `allowed-tools` must be an array (not a string or object). `model` must be a recognized value from a known-model list. `platforms` must be an array of valid `Target` strings. Boolean fields (`enabled`, `autoTrigger`) must be actual booleans, not `"true"` / `"false"` strings. Type mismatches generate `error` findings.

**R8** — **Format compliance check** (when `--target` is set): validates frontmatter structure against the target agent's expected format. Example: Pi uses `tool:` (singular) not `tools:` (plural). Codex expects a different slash-command convention. The initial implementation performs basic target-aware field-name validation; full per-target schema maps are extended over time. Non-compliant fields generate `warning` findings.

**R9** — **Link validity check** (warning-level): validates that references to sibling skills, agents, commands, or hooks resolve to existing files or known names. Examples: `skill: rd3-code-review` in an agent file should resolve to a skill file; `event: PreToolUse` in a hook file should be a recognized hook event type. Unresolvable references generate `warning` findings.

**R10** — **`--strict` mode**: enables additional optional checks beyond the baseline. Includes: minimum description length (≥ 40 characters recommended), minimum body content length after frontmatter, check for trailing whitespace issues in frontmatter values, check for deprecated field names. These generate `warning` findings only.

**R11** — **File path resolution** via `resolveContentPath(type, nameOrPath, opts?)` from `content/identity.ts` (F007). Logic: if `nameOrPath` is a bare name (no extension, no path separator `/` or `\`), look for `<nameOrPath>.md` in cwd; if it contains `.md` extension, treat as a path; if it contains `/` or `\`, treat as a path. If the resolved path does not exist or is unreadable, validate must signal this to the caller so F014 can map it to exit code 2. The recommended design: return a sentinel `ValidationResult` with `valid: false` and a single finding with `field: '_file'` and `message` indicating the file was not found — the F014 command layer checks for this specific pattern and emits exit 2.

**R12** — **Content type coverage**: works for all 5 content types. The `REQUIRED_FIELDS` map and schema definitions in `quality/dimensions.ts` (F009) are the single source of truth — validate imports them, never duplicates.

**R13** — **Output formatting**: without `--json`, each finding is printed as `[SEVERITY] field: message` via `process.stdout.write`. With `--json`, the full `ValidationResult` is `JSON.stringify`-ed. The output function is exported separately (`formatValidationResult(result, json?)`) so the CLI layer can call it without re-implementing formatting.

### Q&A



### Design

**Module location**: `apps/cli/src/operations/validate.ts`.

**Imports**:
- `parseFrontmatter` from `content/frontmatter.ts` (F007) — for YAML frontmatter extraction
- `resolveContentPath` from `content/identity.ts` (F007) — for file path resolution
- `ContentType`, `REQUIRED_FIELDS` from `quality/dimensions.ts` (F009) — type definitions and required field lists
- `Target` from `targets.ts` — for `--target` option type
- `yaml` (`^2.9.0`, ADR-012) — for re-parsing frontmatter to validate YAML structure beyond what `parseFrontmatter` returns

**Schema map design**: Define inline in `validate.ts` (not a separate file — it's the operation's domain knowledge):

```typescript
import type { ContentType, Target } from '../quality/dimensions';

// Field-type expectations per content type
// Keys are frontmatter field names; values are the expected JS type or valid enum values
// NOTE: model enum values below are the agent-relative aliases actually used in
// subagent frontmatter — `inherit | sonnet | opus | haiku` (plus tolerating a full
// `claude-*` id as a plausible-format pass). Do NOT invent values like 'smol'/'slow'.
// `model` is an AGENT field only — skills/commands/magents have no `model` frontmatter,
// so it must not appear in their FIELD_TYPES (else valid files get false errors).
const MODEL_ALIASES = ['inherit', 'sonnet', 'opus', 'haiku'] as const;

const FIELD_TYPES: Record<ContentType, Record<string, { type: 'string' | 'array' | 'boolean' | 'enum', values?: readonly string[] }>> = {
    skill: {
        'name': { type: 'string' },
        'description': { type: 'string' },
        'allowed-tools': { type: 'array' },
    },
    command: {
        'name': { type: 'string' },
        'description': { type: 'string' },
        'arguments': { type: 'array' },
    },
    agent: {
        'name': { type: 'string' },
        'description': { type: 'string' },
        'model': { type: 'enum', values: MODEL_ALIASES },  // also accept a full claude-* id as plausible
        'tools': { type: 'array' },
        'platforms': { type: 'array' },
    },
    hook: {
        'name': { type: 'string' },
        'description': { type: 'string' },
        'event': { type: 'string' },
    },
    magent: {
        'name': { type: 'string' },
        'description': { type: 'string' },
        'platforms': { type: 'array' },
    },
};

// Recognized hook event types for link-validity check
const KNOWN_HOOK_EVENTS = [
    'PreToolUse', 'PostToolUse', 'Stop', 'SubagentStop',
    'SessionStart', 'SessionEnd', 'UserPromptSubmit', 'PreCompact',
    'Notification',
] as const;
```

**Core function signature**:

```typescript
export interface ValidateOptions {
    strict?: boolean;
    target?: Target;
}

export interface Finding {
    severity: 'error' | 'warning';
    field: string;
    message: string;
}

export interface ValidationResult {
    valid: boolean;
    findings: Finding[];
}

export async function validate(
    type: ContentType,
    nameOrPath: string,
    opts?: ValidateOptions,
): Promise<ValidationResult>;
```

**Internal helper — file reading**: The function reads the file via `Bun.file(resolvedPath).text()`. If the file does not exist (`Bun.file()` does not throw; check with `await file.exists()` or catch the `.text()` error), return a sentinel result with a `'_file'` finding. If the file is a directory, return a sentinel. If the file is empty (zero bytes), return a finding about missing content but do not crash.

**Internal helper — `validateFieldType(value: unknown, expected: FieldTypeDef): Finding | null`**: Checks a single field against its expected type definition. Uses `typeof` for primitives, `Array.isArray` for arrays, and `.includes()` for enums. Returns a `Finding` on mismatch, `null` on success.

**Check categories**, executed in order:

1. **File access** — resolve path, check existence and readability. If file not found/unreadable → return sentinel `{ valid: false, findings: [{ severity: 'error', field: '_file', message: 'File not found: <path>' }] }`.

2. **Frontmatter presence** — call `parseFrontmatter(content)`. On `FrontmatterError` → add one finding on `field: 'frontmatter'` and skip remaining checks (no frontmatter to validate against). On success → proceed with `data` and `body`.

3. **Required fields** — iterate `REQUIRED_FIELDS[type]`. For each required field not present in `data` → add `error` finding.

4. **Field types** — for each field in `data` that has a type definition in `FIELD_TYPES[type]`, call `validateFieldType`. Type mismatches → `error` finding.

5. **Format compliance** (only when `opts?.target` is set) — check target-specific field naming conventions. For `target: 'pi'`: warn if `tools:` (plural) is used instead of `tool:` (singular). For `target: 'codex'`: check slash-command dialect conventions. Initial implementation handles Pi `tool:`/`tools:` distinction and warns on unrecognized target-specific patterns; full per-target schema maps are deferred. Findings here are `warning` severity.

6. **Link validity** — scan `data` for reference fields (`skill:`, `agent:`, `command:`) and check if the referenced name corresponds to an existing file or known identifier. For hooks, check `event` value against `KNOWN_HOOK_EVENTS`. Unresolvable references → `warning` finding.

7. **Strict checks** (only when `opts?.strict` is true) — description length < 40 chars → `warning`; body content (after frontmatter) < 20 chars → `warning`; deprecated field names present → `warning`.

Edge cases:
- **Empty file** (0 bytes): `field: 'frontmatter'`, message: 'File is empty; no frontmatter found'.
- **No frontmatter delimiters**: `field: 'frontmatter'`, message: 'No YAML frontmatter found (expected --- delimiters)'.
- **Malformed YAML**: `field: 'frontmatter'`, message: 'YAML parse error: <error message>'.
- **Binary file**: `Bun.file().text()` may produce garbage; not explicitly handled in v1 — if the first 4 bytes suggest binary, return a finding. Defer full binary detection.
- **Directory path**: `Bun.file(dirPath).text()` throws — catch and return sentinel with `'_file'` finding.
- **Frontmatter with only whitespace**: treat as missing frontmatter — the `---`/`---` block with no content inside is not valid.

**Output formatter**:

```typescript
export function formatValidationResult(result: ValidationResult, json?: boolean): string {
    if (json) {
        return JSON.stringify(result);
    }
    if (result.findings.length === 0) {
        return 'Valid';
    }
    return result.findings
        .map(f => `[${f.severity.toUpperCase()}] ${f.field}: ${f.message}`)
        .join('\n');
}
```

### Solution

- `apps/cli/src/operations/validate.ts` — exports `validate()`, `formatValidationResult()`, and types `ValidateOptions`, `Finding`, `ValidationResult`
- Imports `parseFrontmatter` from `content/frontmatter.ts` (F007), `resolveContentPath` from `content/identity.ts` (F007), `ContentType` and `REQUIRED_FIELDS` from `quality/dimensions.ts` (F009), `Target` from `targets.ts`
- Schema definitions (`FIELD_TYPES`, `KNOWN_HOOK_EVENTS`) are inline in `validate.ts` — not duplicating F009, but extending it with type-check metadata that is validate's domain
- Pure function design: validate returns a `ValidationResult` without side effects; file I/O is internal but the function is testable by mocking `Bun.file` or by passing pre-read content via an internal parameter (for unit testing, expose a `_validateContent(type, content, opts?)` internal function that takes a string instead of a path)
- Exit code mapping is NOT in this module — F014's command layer (`commands/helpers.ts`) maps `ValidationResult` to exit codes

### Plan

1. Add `yaml` dependency to `apps/cli/package.json` if not already present (per ADR-012; check if it's already in the tree via `bun.lock`)
2. Create `apps/cli/src/operations/validate.ts` with the full `validate()` function
3. Define `FIELD_TYPES` map and `KNOWN_HOOK_EVENTS` inline
4. Implement `validateFieldType()` helper for type checking
5. Implement file-reading with error handling for missing/unreadable files
6. Implement 6 check categories in order: file access, frontmatter presence, required fields, field types, format compliance, link validity
7. Implement `--strict` checks (description length, body length, deprecated fields)
8. Implement `formatValidationResult()` for both JSON and human-readable output
9. Handle edge cases: empty file, no frontmatter, malformed YAML, binary content, directory path
10. Export internal `_validateContent(type, content, opts?)` for unit-testability
11. Run `bun run lint` and verify typecheck passes


### Review

**Verdict:** PASS

#### Re-verification — 2026-06-16 (`/rd3:dev-verify 0010 --force --fix all`)

**Verdict:** PASS — Phase 7 (SECU, all dimensions) + Phase 8 (R1–R13 traceability).

- Gate: `bun run lint` clean (Biome + typecheck, 68 files). `bun test validate.test.ts` → 50 pass / 0 fail; validate.ts 100% funcs / 95.51% lines.
- Phase 7: 0×P1, 0×P2, 0×P3, 1×P4 (cosmetic, see below). Pure read-only validation — no injection/secrets/auth surface; linear scans only; anchored regexes (no ReDoS).
- Phase 8: 13/13 requirements MET, no scope drift, no untraced code.
- Working-tree delta since recorded run: +5 tests covering file-access integration paths (directory/empty/real file) and two type-branch edge cases → validate.ts line coverage 87.27% → 95.51%.
- Fix pass: no-op (verdict PASS; the lone P4 is cosmetic — left unchanged to avoid risk on green code).

**P4 — Suggestions (re-verification)**
| # | Title | Dimension | Location | Recommendation |
|---|-------|-----------|----------|----------------|
| 1 | Generic "YAML parse error:" prefix for non-YAML frontmatter failures | Usability | apps/cli/src/operations/validate.ts:160 | Optionally branch on `FrontmatterError` subtype to surface "Missing frontmatter" vs "YAML parse error" distinctly. Cosmetic. |

- **R1–R4 (API):** `validate(type, nameOrPath, opts?)`, `_validateContent(type, content, opts?)`, `formatValidationResult(result, json?)`, `ValidateOptions`, `Finding`, `ValidationResult` — all exported.
- **R5 (Frontmatter):** Uses `parseFrontmatter` from F007. `FrontmatterError` becomes `error` finding on `field: 'frontmatter'` — never throws.
- **R6 (Required fields):** Imports `REQUIRED_FIELDS` from F009. Each missing required field → `error` finding.
- **R7 (Field types):** `FIELD_TYPES` map + `validateFieldType()` checks string/array/enum/boolean with meaningful error messages. Model accepts aliases + claude-* full ids.
- **R8 (Format compliance):** Pi target warns on `tools:` (plural vs singular). Codex target warns on leading `/` in command names.
- **R9 (Link validity):** `KNOWN_HOOK_EVENTS` validate hook events. Model alias validation. Reference format check (lowercase alphanumeric + dashes).
- **R10 (Strict mode):** Description < 40 chars, body < 20 chars, deprecated field detection — all `warning` severity only.
- **R11 (File path):** Delegates to `resolveContentPath` (F007). Returns sentinel `{ valid: false, field: '_file' }` on missing/unreadable files.
- **R12 (Content types):** All 5 types validated. `REQUIRED_FIELDS` is SSOT.
- **R13 (Output):** `formatValidationResult` — text mode (`[SEVERITY] field: message`) or JSON mode.

### Testing

- **Command:** `bun run test`
- **Executed:** 2026-06-16 (re-verified)
- **Scope:** 50 tests in validate.test.ts covering all 7 check categories, edge cases, content type coverage, format validation, and file-access integration paths (directory / empty file / real file)
- **Result:** 318 pass, 0 fail across 26 files (full suite); validate.test.ts → 50 pass, 0 fail
- **Coverage:** 99.66% funcs, 97.98% lines aggregate (validate.ts 100% funcs, 95.51% lines — remaining uncovered lines are defensive filesystem catch branches)
- **Evidence:** `apps/cli/tests/operations/validate.test.ts`
- **Next action:** None — all gates pass.


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


### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References

- `docs/features/F010-validate-operation.md` — feature spec
- `docs/design/design-doc-phase2.md` §2.2 — validate operation design
- `docs/design/design-doc-phase2.md` §9 — shared foundation (F007 content/* modules)
- `docs/features/F009-quality-dimensions.md` — REQUIRED_FIELDS, ContentType
- `docs/features/F007-template-scaffold.md` — parseFrontmatter, resolveContentPath
- `docs/design/design-doc-phase2.md` §7 — yaml dependency (ADR-012)
- `apps/cli/src/pipeline/frontmatter.ts` — existing frontmatter parser (to be superseded by F007's content/frontmatter.ts)
- `apps/cli/src/targets.ts` — Target type
