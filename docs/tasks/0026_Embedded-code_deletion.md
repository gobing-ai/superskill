---
name: Embedded-code deletion
description: Embedded-code deletion
status: Backlog
created_at: 2026-06-17T22:29:01.139Z
updated_at: 2026-06-17T22:29:01.139Z
folder: docs/tasks
type: task
feature-id: F019
priority: high
estimated_hours: 2
dependencies: ["0024","0025"]
tags: ["phase3","deletion","plugin","cleanup"]
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0026. Embedded-code deletion

### Background

Remove the embedded code from all five skills, now that F017+F018 no longer reference it. Capability lives in the superskill CLI (Phases 1-2); the bundled scripts/templates/tests are dead weight and violate the 'no embedded execution' invariant (design invariant #3). cc-hooks's bash machinery (emitters/, schema/) has no CLI home in Phase 3 (rulesync-backed hooks are Phase 5). STRICT ordering invariant (design §5, invariant #4): delete ONLY after F017+F018 stop referencing the deleted paths. Plugin-only — apps/cli/'s own tests/templates/scripts (builder.ts, bump.ts) are unrelated and must NOT be deleted. vendors/ untouched (ADR-004). Design: design-doc-phase3.md §5. Owning feature: F019.


### Requirements

- [ ] **R1** — **Pre-deletion gate held** (design §5 ordering invariant #4): before any delete, both `rg "scripts/" plugins/cc/` and `rg "bun .*\.ts" plugins/cc/` are **empty**. If either has hits → STOP and fix the referencing file in F017/F018 first.
- [ ] **R2** — Per skill, delete `plugins/cc/skills/<skill>/scripts/` (including nested `adapters/`, `commands/`).
- [ ] **R3** — Per skill, delete `plugins/cc/skills/<skill>/templates/`.
- [ ] **R4** — Per skill, delete `plugins/cc/skills/<skill>/tests/` (these test the deleted scripts).
- [ ] **R5** — Delete `plugins/cc/skills/cc-hooks/emitters/` and `plugins/cc/skills/cc-hooks/schema/`.
- [ ] **R6** — Delete `references/scripts-usage.md` and any `references/*` documenting removed scripts/operations.
- [ ] **R7** — Whole-tree deletion of named dirs (no cherry-pick of individual files inside them).
- [ ] **R8** — `apps/cli/` and top-level `scripts/` (`builder.ts`, `bump.ts`) **untouched**: `git diff --name-only apps/cli/ scripts/` is empty.
- [ ] **R9** — `vendors/` untouched (ADR-004).

**Acceptance commands:**
```bash
# gate (must have been empty before deleting)
rg "scripts/" plugins/cc/          # → none
rg "bun .*\.ts" plugins/cc/        # → none
# dirs gone
find plugins/cc -type d \( -name scripts -o -name templates -o -name tests \
   -o -name emitters -o -name schema \)    # → empty
find plugins/cc -name scripts-usage.md     # → empty
# nothing out of scope touched
git diff --name-only apps/cli/ scripts/    # → empty
```

**Out of scope:** any SKILL.md/agent/command edit (those land in F017/F018; if the gate fails, fix there).


### Q&A



### Design



### Solution

STEP 1 — gate: run 'rg scripts/ plugins/cc/' and 'rg bun .*.ts plugins/cc/'; if either has hits STOP and fix the referencing file in F017/F018 first (deleting with a live reference orphans a user-facing pointer). STEP 2 — delete the dirs scoped to plugins/cc/skills/*/: scripts/ templates/ tests/, plus cc-hooks/{emitters,schema}/. STEP 3 — delete references/scripts-usage.md and any references/* documenting removed scripts. Verify: find plugins/cc -type d (name scripts|templates|tests|emitters|schema) -> empty; git diff --name-only apps/cli/ scripts/ -> empty.


### Plan



### Review



### Testing

Verification gate for this task (run all; each maps to a Requirement). Destructive deletion — the **pre-deletion gate (R1) is mandatory** and must pass BEFORE any `rm`.

- [ ] **R1 (PRE-DELETION GATE — run first):** both `rg "scripts/" plugins/cc/` and `rg "bun .*\.ts" plugins/cc/` are **empty**. If either has hits → STOP, fix the referencing file in F017/F018 (0024/0025), do not delete.
- [ ] **R2–R5** — embedded dirs gone: `find plugins/cc -type d \( -name scripts -o -name templates -o -name tests -o -name emitters -o -name schema \)` → empty.
- [ ] **R6** — `find plugins/cc -name scripts-usage.md` → empty.
- [ ] **R8** — out-of-scope untouched: `git diff --name-only apps/cli/ scripts/` → empty (CLI's own scripts/tests not deleted).
- [ ] **R9** — `git status --short vendors/` → empty (ADR-004).
- [ ] Root gate: `bun run lint && bun run test && bun run build` green (deletion must not break the CLI suite — a failure means an out-of-scope deletion); `git status -s` shows only intended deletions under `plugins/cc/skills/*/`.

No new automated tests (deletion only). Record the pre-deletion gate output + the find/diff outputs as evidence.


### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References

- Design: [design-doc-phase3.md](../design/design-doc-phase3.md) §5 (ordering invariant #4)
- Feature: [F019](../features/F019-embedded-code-deletion.md)
- Depends on: 0024, 0025 (must stop referencing deleted paths first)
- Authority: docs/00_ADR.md ADR-004 (vendors/ untouched)

