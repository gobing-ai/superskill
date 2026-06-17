---
feature_id: F030
title: Restore skill package
phase: 5
status: planned
depends_on: []
deliverables:
  - apps/cli/src/commands/skill.ts (package verb)
  - apps/cli/src/operations/package.ts
created: 2026-06-17
---

# F030 — Restore `skill package`

## What

Restore `superskill skill package <name>` — bundle a skill plus its companions for distribution.
Re-spec the behavior of the deleted `cc-skills/scripts/package.ts` against the current content-IO
layer (Phase 2 `content/*`). Deterministic — no model involvement.

## Why

`skill package` was deleted in Phase 3 §2.1 (D3) because the CLI had no `package` verb; its slash
command (`skill-package`) was removed and the capability tracked as a Phase 5 follow-up (design §7).
P5-D4 restores it in its natural CLI home — never as a revived plugin script (invariant #3). It's
deterministic, so it has no Phase 4 dependency.

## Change

### `superskill skill package <name>` — `commands/skill.ts` + `operations/package.ts`

- Register a `package` subcommand on the `skill` command group: `superskill skill package <name>
  [--output <dir>] [--include-companions]`.
- `operations/package.ts` exports `packageSkill(name, opts): Promise<string>` returning the bundle
  path.
- **Re-spec against the deleted `package.ts`** — read the original behavior from git history / the
  deleted file's intent, then map it onto the current content-IO layer:
  - Resolve the skill via `resolveContentPath` (F007 `content/identity.ts`).
  - Bundle the `SKILL.md` + its `references/` + companion configs (`metadata.openclaw`,
    `agents/openai.yaml`) into a distributable archive/dir.
  - Use the shared content-IO primitives — **no** bespoke frontmatter parsing or path resolution
    (reuse `content/frontmatter.ts`, `content/identity.ts`, `content/paths.ts`).
- Output: a packaged bundle at `--output` (default cwd), path returned + printed via
  `process.stdout.write`.

### Constraints

- **Deterministic** — no model call, no Phase 4 dependency.
- **Reuse content-IO** — do not re-implement frontmatter/identity/path logic that F007 owns.
- **CLI home** (invariant #3) — the verb lives in `commands/skill.ts`/`operations/package.ts`, never
  as a plugin script.

## Acceptance

```bash
# Package a skill + companions
superskill skill package my-skill --output ./dist
# → bundle written under ./dist containing SKILL.md + references/ + companion configs
# → path printed → exit 0

# Companion configs included
superskill skill package my-skill --include-companions --output ./dist
# → metadata.openclaw / agents/openai.yaml present in the bundle

# Missing skill → exit 2 (content-not-found convention)
superskill skill package does-not-exist
# → exit 2
```
