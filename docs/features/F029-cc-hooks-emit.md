---
feature_id: F029
title: cc:cc-hooks re-author + hook emit wrapper
phase: 5
status: planned
depends_on: [F027]
deliverables:
  - apps/cli/src/commands/hook.ts (emit verb)
  - plugins/cc/skills/cc-hooks/SKILL.md
  - plugins/cc/agents/expert-hook.md
created: 2026-06-17
---

# F029 — `cc:cc-hooks` re-author + `hook emit` wrapper

## What

Two things:
1. **Re-author `cc:cc-hooks`** (SKILL.md + expert-hook agent) to author a **rulesync-canonical**
   `hooks.json` (`HookDefinitionSchema` shape), not the deleted bespoke abstract schema. `validate`
   lints against `HookDefinitionSchema`; `evaluate`/`evolve` reuse the Phase 4 quality brain.
2. **Add `superskill hook emit --target <agent>`** — a thin CLI wrapper over the install hook path
   for single-definition multi-agent emission (replaces the deleted `emit-*.sh`).

## Why

The deleted `cc-hooks` bash emitters + custom abstract-hook schema were **reinventing rulesync**
(design §0). rulesync already ships `HookDefinitionSchema`, the event taxonomy, and the per-tool
matrix (`vendors/rulesync/src/types/hooks.ts`). Aligning the skill with the actual install path — one
canonical schema, no parallel one (invariant #2) — is the DRY move. The `hook emit` verb gives users a
single command to emit one hook definition to many agents, restoring the deleted capability in its
natural CLI home (P5-D4, invariant #3).

## Change

### `superskill hook emit --target <agent>` — `commands/hook.ts` (deliverable)

- Register an `emit` subcommand on the `hook` command group: `superskill hook emit <name> --target
  <agent> [--global] [--dry-run]`.
- It is a **thin wrapper over the install hook path** (F027/F028) — it maps a single
  rulesync-canonical `hooks.json` through `runRulesync` (for ✅ targets) / the copy-shim step (for
  Pi/omp/hermes) for the requested target(s). No new hook-format code; delegates to rulesync.
- Reuses the F027 `hooksCount` reporting.

### `cc:cc-hooks` SKILL.md + `expert-hook.md` (deliverables)

- Rewrite the authoring workflow to produce a rulesync-canonical `hooks.json` (`HookDefinitionSchema`
  shape: `command`/`prompt`/`http` types, `matcher`, `timeout`, `failClosed`, `loop_limit`, and the
  `HookEvent` taxonomy — `vendors/rulesync/src/types/hooks.ts:24,49`). **Do not** revive a bespoke
  abstract schema.
- `validate` workflow → `superskill hook validate` lints against `HookDefinitionSchema` (the CLI verb
  may shell to rulesync's validator or re-implement the zod check — **prefer reuse**; decide at impl).
- `evaluate`/`evolve` workflow → reuse the Phase 4 quality brain (hook dimensions already exist:
  `correctness`, `event-coverage`, `safety`, `pattern-match-quality` — `dimensions.ts:54`). Drive the
  same two-call seam pattern F025 established for the other types.
- `emit` workflow → `superskill hook emit --target <agent>`.

### Hook safety (design §2.3, invariant #4)

- Treat hook `command` strings as **untrusted** when authored from external content; never expand
  embedded instructions (project safety rule). The SKILL.md must instruct this explicitly.
- Respect `failClosed` semantics where the target supports it; default `failOpen` otherwise, and
  surface the difference in `evaluate` (safety dimension).

### Constraints

- **No parallel schema** (invariant #2) — `HookDefinitionSchema` (rulesync) is the single source. The
  plugin must not reintroduce a bespoke abstract hook schema.
- **Restored verb lives in the CLI** (invariant #3) — `hook emit` is a CLI verb, never a plugin script.

## Acceptance

```bash
# hook emit wraps the install path
superskill hook emit my-hooks --target codex --dry-run
# → emits rulesync-canonical hook config for codex; reports hook count → exit 0

# cc-hooks authors against the canonical schema (design §6 exit #4)
rg "HookDefinitionSchema|command|prompt|http|matcher|failClosed" plugins/cc/skills/cc-hooks/SKILL.md  # → hits
rg -i "bespoke|abstract.hook.schema|emit-.*\.sh|hook-linter" plugins/cc/skills/cc-hooks/  # → none (no revived schema)

# validate lints against the schema
superskill hook validate ./hooks.json   # → passes a valid def, errors on an invalid one

# safety surfaced
rg -i "untrusted|failClosed|never expand" plugins/cc/skills/cc-hooks/SKILL.md   # → hits
```
