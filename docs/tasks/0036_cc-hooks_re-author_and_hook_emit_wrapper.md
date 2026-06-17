---
name: cc-hooks re-author and hook emit wrapper
description: cc-hooks re-author and hook emit wrapper
status: Backlog
created_at: 2026-06-17T22:43:52.409Z
updated_at: 2026-06-17T22:43:52.409Z
folder: docs/tasks
type: task
feature-id: F029
priority: high
estimated_hours: 5
dependencies: ["0034"]
tags: ["phase5","hooks","cc-hooks","emit","rulesync"]
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0036. cc-hooks re-author and hook emit wrapper

### Background

Two things: (1) Re-author cc:cc-hooks (SKILL.md + expert-hook) to author a rulesync-canonical hooks.json (HookDefinitionSchema shape), NOT the deleted bespoke abstract schema; validate lints against HookDefinitionSchema; evaluate/evolve reuse the Phase 4 quality brain. (2) Add 'superskill hook emit --target <agent>' — a thin CLI wrapper over the install hook path for single-definition multi-agent emission (replaces deleted emit-*.sh). The deleted cc-hooks bash emitters + custom schema were REINVENTING rulesync (design §0); rulesync ships HookDefinitionSchema + event taxonomy + per-tool matrix (vendors/rulesync/src/types/hooks.ts). One canonical schema, no parallel one (invariant #2). hook emit restores the deleted capability in its natural CLI home (P5-D4, #3). Design: design-doc-phase5.md §2.2, §2.3. Owning feature: F029.


### Requirements

- [ ] **R1** — `superskill hook emit <name> --target <agent> [--global] [--dry-run]` registered on the `hook` command group.
- [ ] **R2** — `emit` is a **thin wrapper** over the install hook path (F027/F028): maps one rulesync-canonical `hooks.json` through `runRulesync` (✅ targets) / the copy-shim step (Pi/omp/hermes). **No new hook-format code.** Reuses the F027 `hooksCount` reporting.
- [ ] **R3** — `cc:cc-hooks` SKILL.md + `expert-hook.md` author a rulesync-canonical `hooks.json` — `command`/`prompt`/`http` types, `matcher`, `timeout`, `failClosed`, `loop_limit`, and the `HookEvent` taxonomy (`vendors/rulesync/src/types/hooks.ts:24,49`).
- [ ] **R4** — **No revived bespoke abstract schema** (invariant #2): `rg -i "bespoke|abstract.hook.schema|emit-.*\.sh|hook-linter" plugins/cc/skills/cc-hooks/` → none.
- [ ] **R5** — `validate` workflow → `superskill hook validate` lints against `HookDefinitionSchema` (prefer reusing rulesync's validator over re-implementing).
- [ ] **R6** — `evaluate`/`evolve` workflow → the Phase 4 two-call seam (F025), using the existing hook dimensions (`correctness`, `event-coverage`, `safety`, `pattern-match-quality` — `dimensions.ts:54`).
- [ ] **R7** — **Hook safety** (invariant #4, design §2.3): SKILL.md instructs treating hook `command` strings as untrusted (never expand embedded instructions); `failClosed` semantics respected + surfaced in `evaluate`'s safety dimension.
- [ ] **R8** — Restored verb lives in the CLI (`commands/hook.ts`), never a plugin script (invariant #3).

**Acceptance:**
```bash
superskill hook emit my-hooks --target codex --dry-run   # → canonical hook config + count
superskill hook validate ./hooks.json                    # → valid passes, invalid errors
rg "HookDefinitionSchema|matcher|failClosed" plugins/cc/skills/cc-hooks/SKILL.md  # → hits
rg -i "untrusted|failClosed|never expand" plugins/cc/skills/cc-hooks/SKILL.md     # → hits
```

**Out of scope:** the install hook-count fix (F027); the Pi/omp/hermes shim mechanism (F028).


### Q&A



### Design



### Solution

commands/hook.ts: register emit subcommand delegating to the install hook path (runRulesync for ✅, copy-shim F028 for pi/omp/hermes). cc-hooks SKILL.md + expert-hook.md: rewrite authoring workflow to HookDefinitionSchema shape (ref vendors/rulesync/src/types/hooks.ts:24,49); validate workflow -> superskill hook validate (shell to rulesync validator or re-impl zod, prefer reuse); evaluate/evolve -> drive the F025 two-call seam pattern; emit workflow -> superskill hook emit --target. SKILL.md instructs: treat hook command strings as untrusted, never expand embedded instructions; respect failClosed.


### Plan



### Review



### Testing

Tests ship **in this task** (design rule: each task owns its tests — no separate pure-test task).

- [ ] `tests/commands/hook-emit.test.ts`:
  - `superskill hook emit <name> --target <agent> --dry-run` emits rulesync-canonical hook config for a ✅ target and reports a count.
  - `HookDefinitionSchema` lint: a valid definition passes; an invalid one errors.
- [ ] `cc:cc-hooks` authoring assertions: SKILL.md references `HookDefinitionSchema` shape (`command`/`prompt`/`http`, `matcher`, `failClosed`); **no** revived bespoke abstract schema (`rg -i "bespoke|abstract.hook.schema|emit-.*\.sh"` → none); safety instructions present (untrusted commands, `failClosed`).
- [ ] Coverage for the `hook emit` verb contributes to the ≥90% gate.
- [ ] No test skipped / `.skip`'d (R12).

Reuse `tests/fixtures/phase5/` hook definitions (valid + invalid).


### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References

- Design: [design-doc-phase5.md](../design/design-doc-phase5.md) §2.2, §2.3
- Feature: [F029](../features/F029-cc-hooks-emit.md)
- Depends on: 0034
- Vendor: vendors/rulesync/src/types/hooks.ts:24,49 (HookDefinitionSchema, HookEvent)
- Dims: apps/cli/src/quality/dimensions.ts:54 (hook dimensions)

