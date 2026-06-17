---
feature_id: F032
title: Confirm/close adapt gap inside install
phase: 5
status: planned
depends_on: []
deliverables:
  - apps/cli/src/pipeline/convert.ts (add only the missing transform, if any)
created: 2026-06-17
---

# F032 — Confirm/close the `adapt` gap inside `install`

## What

Confirm that the cross-platform `adapt` capability deleted in Phase 3 §2.1 (the
`cc-{agents,commands,skills}/scripts/adapt.ts` + `scripts/adapters/`) is already covered by the
`superskill install` conversion pipeline (`pipeline/convert.ts`), and **add only what's missing**.
There is **no separate `adapt` verb** — the pipeline is its documented home (Phase 3 §2 note, ADR).

## Why

`adapt` was deleted in Phase 3 with the disposition "fold into `superskill install` conversion
pipeline" (design §2.1, P5-D4). The forward conversion path (Claude → all targets) already does
slash-dialect, colon→hyphen, frontmatter normalization, and Pi subagent conversion
(`pipeline/{convert,slash-command,rewrite-colons,frontmatter,pi-subagent}.ts`). This feature is a
**gap-closing audit**, not a rebuild: confirm parity vs. the deleted adapters, add the missing
transform if one exists, and close the Phase 3 deletion debt (design §6 exit #5).

## Change

### Audit (the bulk of this feature)

- Read the deleted `adapt.ts` + `adapters/` intent (git history) and enumerate the transforms they
  performed per target.
- Diff against the current `pipeline/` stages (`convert.ts` orchestration + the four stage modules).
  The conversion rules already documented (03 §Conversion rules):
  - `rewriteColonRefs` — `plugin:command` → `plugin-command`.
  - `translateSlashCommand` — `/plugin:cmd` → per-agent dialect (via ts-ai-runner).
  - `normalizeFrontmatter` — inject `name:`, normalize `allowed-tools:`.
  - `convertToPiSubagent` — Skills 2.0 → Pi native agent YAML.
- Produce a parity table: deleted-adapter transform × covered-by-pipeline? × gap.

### Implementation — `pipeline/convert.ts` (only if a gap exists)

- For each genuine gap, add the missing transform as a **pure pipeline stage** (invariant: pipeline
  stages are pure functions `(content, target, opts?) => string`, no side effects, no FS — 03
  invariant #5). Wire it into `convert.ts`.
- If the audit finds **no gap**, the deliverable is the parity table recorded in the design/plans doc
  + a confirming test (in this feature's task) — and an explicit "gap closed, nothing to add" note.

### Tests + phase closing gate (in this feature's task)

Tests ship **in this feature's task** — there is no pure-test feature. This feature's task also owns
the **Phase 5 closing gate** (it is independent and lands late): full suite green across F027–F031's
tests, ≥90% line/function coverage, `bun run lint/build` green, `git status` clean.

### Constraints

- **No `adapt` verb** — the capability stays inside `install`'s pipeline (ADR; design §3 table).
- **Pure stages** (03 invariant #5) — any added transform is a pure function, no FS access.
- **rulesync owns format knowledge** (invariant #1) — superskill's pipeline only adds the
  cc-agents-specific transforms; per-target file format stays with rulesync.

## Acceptance

```bash
# Parity table recorded (audit done)
rg -i "adapt|parity|deleted adapter" docs/design/design-doc-phase5.md   # → audit note present

# Any added stage is pure + wired
rg "export function|pipeline stage" apps/cli/src/pipeline/convert.ts

# Forward conversion still correct for all targets (regression — design §6 exit #5)
superskill install <plugin> --targets all --dry-run
# → slash/colon/frontmatter/Pi conversions applied per target; no missing adapter transform
```
