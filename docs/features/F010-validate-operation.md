---
feature_id: F010
title: Validate operation
phase: 2
status: planned
depends_on: [F007, F009]
deliverables:
  - apps/cli/src/operations/validate.ts
created: 2026-06-16
---

# F010 — Validate operation

## What

Structural + schema validation for all 5 content types (skill, command, agent, hook, magent). Checks: frontmatter presence (YAML block exists, valid parse), required fields (`name`, `description` present; type-specific required fields), field types (`allowed-tools` is array, `model` is valid value, etc.), format compliance (matches target agent expected format), link validity (references to other skills/agents resolve). Exit codes: 0 = valid, 1 = validation errors, 2 = file not found/unreadable. Output: structured JSON or human-readable list of findings with severity (error/warning) and field/message.

## Why

The first quality gate. Every evolve/refine flow depends on knowing whether content is structurally valid before scoring quality. `validate` catches schema violations early so `evaluate` operates on well-formed input and `refine` knows what structural fixes to apply.

## Change

### `operations/validate.ts`

- Export `validate(type: ContentType, path: string, opts?: ValidateOptions): ValidationResult`
  - `ValidateOptions`: `{ strict?: boolean, target?: Target }`
  - `--strict` enables optional/warning-level checks (e.g. recommended minimum description length)
  - `--target` validates against a specific agent's format requirements (frontmatter structure, field naming conventions)
- Export `ValidationResult`: `{ valid: boolean, findings: Finding[] }`
- Export `Finding`: `{ severity: 'error' | 'warning', field: string, message: string }`
- Parse frontmatter via `parseFrontmatter` (F007) — a `FrontmatterError` becomes a single `error` finding on the `frontmatter` field (do not throw out of `validate`).
- Import `REQUIRED_FIELDS` and `ContentType` from F009 (`apps/cli/src/quality/dimensions.ts`) for the type-specific required-field lists — `validate` does not maintain its own field tables.
- `validate` is **pure**: it returns a `ValidationResult` and never calls `process.exit`. The command layer (F014) maps the result to the exit code. The "file not found / unreadable → 2" case is detected here (return a sentinel or throw a typed `FileAccessError`) and translated to exit 2 by F014.
- Validation checks per design doc §2.2:
  - **Frontmatter presence**: file reads successfully; YAML frontmatter delimited by `---` exists and parses without error (via `parseFrontmatter`)
  - **Required fields**: `name` and `description` for all types; type-specific fields from `REQUIRED_FIELDS` (e.g. `model` for agents, `event` for hooks)
  - **Field types**: `allowed-tools` must be an array; `model` must be a recognized value; boolean fields must be real booleans, not strings
  - **Format compliance**: validates against target agent's frontmatter schema (e.g. Pi uses `tool:` not `tools:`)
  - **Link validity** (warning-level): references to sibling skills/agents (e.g. `skill: rd3-code-review`) resolve to existing files
- Exit code mapping (applied by F014): 0 = no errors, 1 = ≥1 error finding, 2 = file not found or unreadable
- Output format when not JSON: one finding per line with `[ERROR]` / `[WARN]` prefix + field + message, written via `process.stdout.write`
- Output format when `--json`: `{ valid, findings: [{ severity, field, message }] }`

## Acceptance

```
# Passing
superskill skill validate my-skill.md
# → "Valid" → exit 0

# Failing
superskill skill validate broken-skill.md
# → Lists errors with severity/field/message → exit 1

# Not found
superskill skill validate nonexistent.md
# → "File not found" → exit 2

# Strict mode catches warnings
superskill skill validate my-skill.md --strict
# → Shows warnings for optional checks (short description, etc.)

# Target-specific validation
superskill agent validate my-agent.md --target pi
# → Validates against Pi's agent format requirements
```
