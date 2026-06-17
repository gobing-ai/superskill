---
feature_id: F019
title: Embedded-code deletion
phase: 3
status: planned
depends_on: [F017, F018]
deliverables:
  - delete plugins/cc/skills/*/scripts/ (incl. adapters/, commands/)
  - delete plugins/cc/skills/*/templates/
  - delete plugins/cc/skills/*/tests/
  - delete plugins/cc/skills/cc-hooks/{emitters,schema}/
  - delete plugins/cc/skills/*/references/scripts-usage.md (and other removed-script refs)
created: 2026-06-17
---

# F019 — Embedded-code deletion

## What

Remove the embedded code from all five skills, now that F017+F018 no longer reference it. The
capability lives in the `superskill` CLI (Phases 1–2); the bundled scripts/templates/tests are dead
weight and violate the "no embedded execution" invariant (design invariant #3).

## Why

Phase 3's goal is a **thin** plugin that delegates to the CLI. Embedded `scripts/*.ts`,
`templates/`, and `tests/` (which test the deleted scripts) are obsolete once the skills/commands
delegate. `cc-hooks`'s bash machinery (`emitters/`, `schema/`) has no CLI home in Phase 3 (the
rulesync-backed hook system is Phase 5). Leaving them risks a future agent invoking dead code paths.

## Change

### Directories to delete (per skill, where present) — design §5.1

- `plugins/cc/skills/<skill>/scripts/` (including nested `adapters/`, `commands/`)
- `plugins/cc/skills/<skill>/templates/`
- `plugins/cc/skills/<skill>/tests/` — these test the deleted scripts; dead after removal.
- `plugins/cc/skills/cc-hooks/emitters/` and `plugins/cc/skills/cc-hooks/schema/` — bash /
  JSON-schema machinery with no CLI home (D3).

### Files / references to delete — design §5.2

- `plugins/cc/skills/<skill>/references/scripts-usage.md` and any `references/*` documenting removed
  scripts/operations.
- Any remaining `references/` link line inside a `SKILL.md` pointing at a removed file. (F017 should
  have removed these; if `rg` still finds one, fix it in F017's files — do not orphan a link.)

### Ordering invariant (design §5, invariant #4) — STRICT

Delete embedded code **only after** F017+F018 rewrites no longer reference it. **Gate before any
deletion:**

```bash
rg "scripts/" plugins/cc/          # must be empty (no remaining script-path reference)
rg "bun .*\.ts" plugins/cc/        # must be empty (no remaining embedded-execution reference)
```

If either returns hits, **stop** — the referencing file (a SKILL.md, agent, or command) must be
fixed in F017/F018 first. Deleting while a reference survives leaves a dangling pointer in a
user-facing prompt.

### Constraints

- **Plugin-only.** Nothing under `apps/cli/` is touched. The CLI's own `tests/`, `templates/`,
  `scripts/` (e.g. `scripts/builder.ts`, `scripts/bump.ts`) are unrelated and must not be deleted —
  the deletion glob is scoped to `plugins/cc/skills/*/`.
- **Whole-tree deletion** of the named dirs; do not cherry-pick files inside them.
- **`vendors/` is untouched** (ADR-004) — not in scope, just stated to prevent over-reach.

## Acceptance

```bash
# Pre-deletion gate held (no references remain)
rg "scripts/" plugins/cc/          # → no output
rg "bun .*\.ts" plugins/cc/        # → no output

# Embedded dirs gone (design §6 #3)
find plugins/cc -type d \( -name scripts -o -name templates -o -name tests \
   -o -name emitters -o -name schema \)                          # → empty

# No removed-script reference files survive
find plugins/cc -name scripts-usage.md                          # → empty

# CLI source untouched
git diff --name-only apps/cli/ scripts/                         # → empty
```
