---
feature_id: F031
title: Restore skill migrate (refinement via Phase 4)
phase: 5
status: planned
depends_on: [F023, F030]
deliverables:
  - apps/cli/src/commands/skill.ts (migrate verb)
  - apps/cli/src/operations/migrate.ts
created: 2026-06-17
---

# F031 — Restore `skill migrate`

## What

Restore `superskill skill migrate <sources...> <dest>` — merge/migrate skills. The **deterministic
merge core** lands first; the **content-refinement** layer (reconciling overlapping content into a
coherent merged skill) is non-deterministic and routes through the **Phase 4 generation seam (F023)**
— agent-authored, not a deterministic merge alone (design §3, P5-D4).

## Why

`skill migrate`/merge was deleted in Phase 3 §2.1 (D3); its slash command (`skill-migrate`) removed,
the capability tracked for Phase 5 (design §7). Unlike `skill package`, migrate's quality depends on
intelligently reconciling content — which is exactly what the Phase 4 generation seam provides. This
is the **cross-phase dependency**: F031's refinement cannot ship before Phase 4 (F023). The design
permits shipping the deterministic merge first and layering refinement after (design §3 NOTE).

## Change

### `superskill skill migrate <sources...> <dest>` — `commands/skill.ts` + `operations/migrate.ts`

- Register a `migrate` subcommand: `superskill skill migrate <sources...> <dest> [--refine]
  [--ingest <proposal.json>]`.
- `operations/migrate.ts` exports `migrateSkills(sources, dest, opts)`.

**Deterministic merge core (ships independent of Phase 4):**
- Resolve each source skill via `resolveContentName`/`resolveContentPath` (F007).
- Merge frontmatter (union of fields, conflict policy documented) + concatenate/dedupe bodies via the
  shared content-IO primitives. Reuse `content/frontmatter.ts`, `content/edit.ts`.
- Write the merged skill to `<dest>`. This alone is a usable migrate.

**Refinement layer (depends on F023 — Phase 4 generation seam):**
- With `--refine`, the merged draft is handed to the generation seam: `superskill skill evolve
  <dest> --propose-only --json` emits generation briefs over the merged content; the Author persona
  reconciles overlaps/contradictions; `--ingest <proposal.json>` applies the refinement through the
  **double-loop gate (F024)** — so a regressive merge is rejected and restored.
- Without `--refine` (or before Phase 4 lands), the deterministic merge is the output.

### Constraints

- **CLI home** (invariant #3) — verb in `commands/skill.ts`/`operations/migrate.ts`, never a plugin
  script.
- **Refinement is non-deterministic** — it routes through F023/F024, the CLI itself makes no model
  call (Phase 4 invariant #1 carries).
- **Reuse content-IO + the generation seam** — no bespoke merge-then-rewrite logic that duplicates
  F023.

## Acceptance

```bash
# Deterministic merge (no Phase 4 needed)
superskill skill migrate skill-a skill-b ./merged-skill.md
# → merged frontmatter + bodies written to ./merged-skill.md → exit 0

# Refined merge (routes through Phase 4 generation seam + gate)
superskill skill migrate skill-a skill-b ./merged-skill.md --refine --ingest ./proposal.json
# → Author-reconciled content applied through the double-loop gate; regression rejected + restored

# Missing source → exit 2
superskill skill migrate does-not-exist skill-b ./out.md   # → exit 2
```
