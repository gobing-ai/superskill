---
feature_id: F007
title: Template + content-IO foundation + scaffold operation
phase: 2
status: planned
depends_on: []
deliverables:
  - apps/cli/src/content/frontmatter.ts
  - apps/cli/src/content/identity.ts
  - apps/cli/src/content/hash.ts
  - apps/cli/src/content/edit.ts
  - apps/cli/src/content/paths.ts
  - apps/cli/src/templates/skill/default.md
  - apps/cli/src/templates/command/default.md
  - apps/cli/src/templates/agent/default.md
  - apps/cli/src/templates/magent/default.md
  - apps/cli/src/operations/scaffold.ts
created: 2026-06-16
---

# F007 — Template + content-IO foundation + scaffold operation

## What

Two things, both foundational for the rest of Phase 2:

1. **Shared content-IO foundation** (`content/*`) — frontmatter parse/edit, content-name resolution, file hashing, the single change-apply primitive, and store/proposal path resolution. F009–F013 consume these instead of each re-implementing them (see design §9, ADR-012, ADR-013).
2. **Template resolution + `scaffold` operation** — built-in templates shipped with the npm package at `templates/<type>/`, overridable by user templates at `~/.superskill/templates/<type>/`. Templates are Markdown with `<!-- VARIABLE -->` placeholders. Resolution order: user template → built-in `default.md`. Scaffold creates new content files with `--description`, `--target`, `--output`, `--force`.

## Why

Every other Phase 2 command depends on (a) creating content from templates and (b) reading/mutating/locating that content through one consistent set of primitives. Building these primitives once here prevents four divergent frontmatter parsers and inconsistent `content_name` derivation when F009–F013 are implemented in parallel.

## Change

### `content/frontmatter.ts`

- Export `parseFrontmatter(content: string): { data: Record<string, unknown>, body: string, raw: string }` — splits the `---`-delimited block; `data` = `yaml.parse(raw)`, `body` = text after the closing `---`, `raw` = the frontmatter source text. Throws `FrontmatterError` (exported) on a missing/malformed block.
- Export `applyFrontmatterChange(content: string, mutate: (doc: Document) => void): string` — round-trips via `yaml.parseDocument` so comments and key order survive serialization.
- Uses the `yaml` package (`^2.9.0`, ADR-012). **Do not** reuse `pipeline/frontmatter.ts` (Phase 1 regex injector — distribution-only, cannot parse to an object).

### `content/identity.ts`

- Export `resolveContentName(path: string): string` — strips directory and `.md`; `SKILL.md` → parent directory name. This is the canonical `content_name` used by the store, evolve queries, and proposal paths.
- Export `resolveContentPath(type: ContentType, name: string, opts: { target?: Target }): string` — name → file path; looks in cwd then target-specific locations; if `name` is already a path to an existing file, returns it unchanged.

### `content/hash.ts`

- Export `hashContent(filePath: string): string` — SHA-256 hex of the file bytes (`Bun.CryptoHasher` or `node:crypto`). Single source of `file_hash`.

### `content/edit.ts`

- Export `type Change = { kind: 'frontmatter', key: string, value: unknown } | { kind: 'text', current: string, proposed: string }`.
- Export `applyChange(content: string, change: Change): string` — the **one** mutation primitive shared by refine (F012) and evolve (F013). `frontmatter` changes route through `applyFrontmatterChange`; `text` changes locate the nearest match of `current` and replace it with `proposed`.

### `content/paths.ts`

- Export `getDataRoot(opts?: { projectRoot?: string }): string` — `projectRoot` if given; else `cwd` when `<cwd>/.superskill/` exists; else `homedir()` (ADR-013).
- Export `getDBPath(opts?): string` → `<dataRoot>/.superskill/evaluations.db`.
- Export `getProposalsDir(opts?): string` → `<dataRoot>/.superskill/proposals`.

### Dependency

- Add `"yaml": "^2.9.0"` to `apps/cli/package.json` dependencies (already present transitively via rulesync — no new package in the resolved tree; ADR-012).
- Add `"templates"` to the `apps/cli/package.json` `"files"` array so built-in templates ship with the package.

### `templates/skill/default.md`

- YAML frontmatter with `name` and `description` fields using `<!-- NAME -->` and `<!-- DESCRIPTION -->` placeholders.
- Body: level-1 heading with `<!-- NAME -->`, followed by `<!-- TODO: skill body -->`.
- Follows the format from design doc §5.

### `templates/command/default.md`

- YAML frontmatter with `name`, `description`, `arguments` (empty array), and `target` fields.
- Body: usage examples and `<!-- TODO: command body -->`.

### `templates/agent/default.md`

- YAML frontmatter with `name`, `description`, `tools` (empty array), `model` (default), and `agentType` fields.
- Body: `<!-- TODO: agent system prompt and configuration -->`.

### `templates/hook/default.md` — REMOVED (task 0066)

Hooks are hand-authored in `hooks.json` (JSON config, not markdown). The scaffold path emitted the wrong artifact type and was removed; `'hook'` is no longer in `scaffold.ts` `validTypes`. `ContentType` retains `'hook'` for validate/evaluate/refine/evolve. See `04_DESIGN.md` "Hook divergence".

### `templates/magent/default.md`

- YAML frontmatter with `name`, `description`, and `platforms` fields.
- Body: four section stubs (IDENTITY, SOUL, AGENTS, USER) matching the magent config structure from design doc §3.

### `operations/scaffold.ts`

- Export `scaffold(type, name, opts): Promise<string>` function.
- `type`: `'skill' | 'command' | 'agent' | 'hook' | 'magent'`
- `opts`: `{ description?: string, target?: Target, output?: string, force?: boolean }`
- Template resolution: `~/.superskill/templates/<type>/default.md` → `<pkg>/templates/<type>/default.md`. The built-in `default.md` always exists, so resolution never falls through.
- Variable substitution: replaces `<!-- NAME -->`, `<!-- DESCRIPTION -->`, `<!-- TARGET -->`, `<!-- BODY -->` placeholders with provided values or sensible defaults.
- Output: writes to `<output>/<name>.md` (default output = cwd) and returns the created file path.
- **Overwrite guard**: if the target file already exists and `--force` is not set, throws so the CLI can report `<path> already exists — pass --force to overwrite`. With `--force`, overwrites.
- Returns the resolved path to the created file.

## Acceptance

```
superskill skill scaffold my-skill --description "Does X"
# → writes ./my-skill.md with valid frontmatter and placeholder body
# → exit 0

superskill agent scaffold my-agent --target codex
# → writes ./my-agent.md with agent template, target-aware if templates differ
# → exit 0

# Overwrite guard
superskill skill scaffold my-skill
# → "my-skill.md already exists — pass --force to overwrite" → exit 1
superskill skill scaffold my-skill --force
# → overwrites ./my-skill.md → exit 0

# Foundation utilities are importable
import { parseFrontmatter } from '../content/frontmatter';
import { resolveContentName } from '../content/identity';
resolveContentName('/a/b/my-skill.md');   // → 'my-skill'
resolveContentName('/a/b/SKILL.md');       // → 'b'
```
