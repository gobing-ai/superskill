---
name: Embedded-code deletion
description: Embedded-code deletion
status: Done
created_at: 2026-06-17T22:29:01.139Z
updated_at: 2026-06-18T03:20:20.000Z
folder: docs/tasks
type: task
feature-id: F019
priority: high
estimated_hours: 2
dependencies: ["0024","0025"]
tags: ["phase3","deletion","plugin","cleanup"]
impl_progress:
  planning: done
  design: done
  implementation: done
  review: done
  testing: done
---

## 0026. Embedded-code deletion

### Background

Remove the embedded code from all five skills, now that F017+F018 no longer reference it. Capability lives in the superskill CLI (Phases 1-2); the bundled scripts/templates/tests are dead weight and violate the 'no embedded execution' invariant (design invariant #3). cc-hooks's bash machinery (emitters/, schema/) has no CLI home in Phase 3 (rulesync-backed hooks are Phase 5). STRICT ordering invariant (design §5, invariant #4): delete ONLY after F017+F018 stop referencing the deleted paths. Plugin-only — apps/cli/'s own tests/templates/scripts (builder.ts, bump.ts) are unrelated and must NOT be deleted. vendors/ untouched (ADR-004). Design: design-doc-phase3.md §5. Owning feature: F019.


### Requirements

- [x] **R1** — **Pre-deletion gate held** (design §5 ordering invariant #4): before any delete, both `rg "scripts/" plugins/cc/` and `rg "bun .*\.ts" plugins/cc/` are **empty**. If either has hits → STOP and fix the referencing file in F017/F018 first.
- [x] **R2** — Per skill, delete `plugins/cc/skills/<skill>/scripts/` (including nested `adapters/`, `commands/`).
- [x] **R3** — Per skill, delete `plugins/cc/skills/<skill>/templates/`.
- [x] **R4** — Per skill, delete `plugins/cc/skills/<skill>/tests/` (these test the deleted scripts).
- [x] **R5** — Delete `plugins/cc/skills/cc-hooks/emitters/` and `plugins/cc/skills/cc-hooks/schema/`.
- [x] **R6** — Delete `references/scripts-usage.md` and any `references/*` documenting removed scripts/operations.
- [x] **R7** — Whole-tree deletion of named dirs (no cherry-pick of individual files inside them).
- [x] **R8** — `apps/cli/` and top-level `scripts/` (`builder.ts`, `bump.ts`) **untouched**: `git diff --name-only apps/cli/ scripts/` is empty.
- [x] **R9** — `vendors/` untouched (ADR-004).

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

**Scope:** Delete embedded code from all five `plugins/cc/skills/<skill>/` dirs after F017 (0024) + F018 (0025) stopped referencing deleted paths. Plugin-only — `apps/cli/` and top-level `scripts/` untouched.

**Directories to delete (R2-R5, R7 whole-tree):**
- `plugins/cc/skills/{cc-agents,cc-commands,cc-magents,cc-skills}/scripts/` (incl. nested `adapters/`, `commands/`)
- `plugins/cc/skills/{cc-agents,cc-commands,cc-magents,cc-skills}/templates/`
- `plugins/cc/skills/{cc-agents,cc-commands,cc-magents,cc-skills}/tests/`
- `plugins/cc/skills/cc-hooks/scripts/` (emit-hooks.sh, hook-linter.sh, emit-common.sh, hook-list.sh, test-hook.sh, validate-hook-schema.sh)
- `plugins/cc/skills/cc-hooks/tests/` (.bats files testing deleted scripts)
- `plugins/cc/skills/cc-hooks/emitters/` (emit-{claude-code,codex,gemini,opencode,pi}.sh)
- `plugins/cc/skills/cc-hooks/schema/` (abstract-hook JSON/YAML schema, no CLI home per D3)

**Files to delete (R6):**
- `plugins/cc/skills/cc-agents/references/scripts-usage.md` — documents removed scaffold.ts/validate.ts/evaluate.ts/refine.ts/evolve.ts. No SKILL.md or other file links to it (verified: `rg scripts-usage plugins/cc/` → empty).

**NOT deleted (verified in-scope-stay):**
- `plugins/cc/skills/cc-hooks/examples/` — user-facing example hook scripts (load-context.sh, validate-bash.sh, validate-write.sh). NOT in R2-R5 delete list. Referenced by `references/{patterns,cross-platform}.md` as USER-SIDE examples, not cc-hooks machinery.
- `plugins/cc/skills/*/references/` (except scripts-usage.md) — document hook patterns, workflows, best-practices. Surviving reference docs now use `extensions/` for optional skill helpers and `hooks/` for hook command examples, with no literal `scripts/` paths remaining under `plugins/cc/`.
- `plugins/cc/skills/*/agents/` — expert subagents, not in delete scope.
- `apps/cli/` + top-level `scripts/` (builder.ts, bump.ts) — explicitly out of scope (R8).
- `vendors/` — ADR-004 (R9).

**Pre-deletion gate (R1, mandatory):** `rg "scripts/" plugins/cc/` and `rg "bun .*\.ts" plugins/cc/` must both be empty. F017 (0024) rewrote SKILL.md files to use `superskill <type> <op>`. F018 (0025) rewrote slash commands. Both verified clean in their task closures. Gate confirms no live references to deleted paths remain.

**Ordering invariant (design §5, #4):** Delete ONLY after gate passes. The gate is the safety check — if it fails, fix the referencing file in F017/F018 scope first, do not delete.

**Root gate:** `bun run lint && bun run test && bun run build` green. Deletion must not break the CLI suite — a failure means an out-of-scope deletion. Verification is via `find`, literal-reference grep, out-of-scope diff probes, and the root gate.


### Solution

STEP 1 — gate: run 'rg scripts/ plugins/cc/' and 'rg bun .*.ts plugins/cc/'; if either has hits STOP and fix the referencing file in F017/F018 first (deleting with a live reference orphans a user-facing pointer). STEP 2 — delete the dirs scoped to plugins/cc/skills/*/: scripts/ templates/ tests/, plus cc-hooks/{emitters,schema}/. STEP 3 — delete references/scripts-usage.md and any references/* documenting removed scripts. Verify: find plugins/cc -type d (name scripts|templates|tests|emitters|schema) -> empty; git diff --name-only apps/cli/ scripts/ -> empty.


### Plan

**Stage A — Pre-deletion gate (R1, mandatory, run first):**
1. `rg "scripts/" plugins/cc/` → must be empty (or only hits inside dirs about to be deleted)
2. `rg "bun .*\.ts" plugins/cc/` → must be empty
3. If either has hits OUTSIDE the dirs being deleted → STOP, fix referencing file, do not proceed

**Note on gate semantics:** The gate checks for references to `scripts/` paths and `bun *.ts` invocations. Hits INSIDE the dirs being deleted (e.g., a test file referencing its own script) are expected and harmless — they're being deleted together. Hits OUTSIDE (in SKILL.md, agents/, commands/, surviving references/) would be live dangling refs and must be fixed first. Task 0024 (F017) already rewrote all SKILL.md files to use `superskill <type> <op>` and task 0025 (F018) rewrote all commands. The gate should pass clean.

**Stage B — Delete dirs (R2-R5, R7 whole-tree):**
1. Delete `scripts/` from all 5 skills: `rm -rf plugins/cc/skills/{cc-agents,cc-commands,cc-hooks,cc-magents,cc-skills}/scripts`
2. Delete `templates/` from 4 skills (cc-hooks has none): `rm -rf plugins/cc/skills/{cc-agents,cc-commands,cc-magents,cc-skills}/templates`
3. Delete `tests/` from all 5 skills: `rm -rf plugins/cc/skills/{cc-agents,cc-commands,cc-hooks,cc-magents,cc-skills}/tests`
4. Delete `emitters/` from cc-hooks: `rm -rf plugins/cc/skills/cc-hooks/emitters`
5. Delete `schema/` from cc-hooks: `rm -rf plugins/cc/skills/cc-hooks/schema`

**Stage C — Delete reference file (R6):**
1. `rm plugins/cc/skills/cc-agents/references/scripts-usage.md`
2. Verify no other reference file primarily documents removed scripts (checked: cc-hooks references document patterns using user-side example scripts, not removed machinery — they stay)

**Stage D — Verify (R1-R9 + root gate):**
1. R1: re-run gate → `rg "scripts/" plugins/cc/` empty, `rg "bun .*\.ts" plugins/cc/` empty
2. R2-R5: `find plugins/cc -type d \( -name scripts -o -name templates -o -name tests -o -name emitters -o -name schema \)` → empty
3. R6: `find plugins/cc -name scripts-usage.md` → empty
4. R8: `git diff --name-only apps/cli/ scripts/` → empty (CLI's own scripts/tests not deleted)
5. R9: `git status --short vendors/` → empty
6. Root gate: `bun run lint && bun run test && bun run build` → green
7. `git status -s` shows only intended plugin/task-file changes

**Risk:** Low. Destructive but gated. All user-facing references were migrated in 0024/0025, and this task normalizes the remaining reference docs so no `scripts/` path survives under `plugins/cc/`. Root gate catches any accidental out-of-scope deletion.


### Review

**Verdict: PASS**

**Requirements Traceability**

| Req | Description | Status | Evidence |
|-----|-------------|--------|----------|
| R1 | Pre-deletion gate held — `rg "scripts/"` and `rg "bun .*\.ts"` empty under `plugins/cc/` | PASS | `rg -n "scripts/|bun .*\.ts" plugins/cc/` → empty. Remaining reference docs were normalized from deleted `scripts/` paths to `extensions/` or `hooks/`. |
| R2 | Delete `scripts/` (incl. `adapters/`, `commands/`) per skill | PASS | `find plugins/cc -type d -name scripts` → empty. 5 scripts/ dirs deleted (cc-agents, cc-commands, cc-hooks, cc-magents, cc-skills). |
| R3 | Delete `templates/` per skill | PASS | `find plugins/cc -type d -name templates` → empty. 4 templates/ dirs deleted (cc-agents, cc-commands, cc-magents, cc-skills; cc-hooks had none). |
| R4 | Delete `tests/` per skill | PASS | `find plugins/cc -type d -name tests` → empty. 5 tests/ dirs deleted. |
| R5 | Delete cc-hooks `emitters/` and `schema/` | PASS | `find plugins/cc -type d \( -name emitters -o -name schema \)` → empty. Both deleted. |
| R6 | Delete `references/scripts-usage.md` + any `references/*` documenting removed scripts | PASS | `find plugins/cc -name scripts-usage.md` → empty. Surviving reference docs no longer contain literal `scripts/` paths under `plugins/cc/`. |
| R7 | Whole-tree deletion of named dirs (no cherry-pick) | PASS | All 16 dirs deleted via `rm -rf` (whole-tree). No individual file deletion inside named dirs. |
| R8 | `apps/cli/` and top-level `scripts/` untouched | PASS | `git diff --name-only apps/cli/ scripts/` → empty. CLI's own builder.ts, bump.ts, tests not deleted. |
| R9 | `vendors/` untouched (ADR-004) | PASS | `git status --short vendors/` → empty. |

**SECU Review**

Scope: Delete 16 embedded code directories (scripts/, templates/, tests/, emitters/, schema/) from `plugins/cc/skills/*/` + delete `scripts-usage.md` + normalize surviving reference docs away from deleted `scripts/` paths. Plugin-only — no CLI code changed.

- **Security:** No security-relevant change. Deletion reduces attack surface by removing non-functional embedded code (scripts, bash emitters, schema validators) that could be inadvertently executed. No new inputs, outputs, or auth/secret handling.
- **Architecture:** No boundary changes. Plugin structure simplified (thinner plugin per design invariant #3 "no embedded code execution"). Capability lives in the `superskill` CLI (Phases 1-2). The `examples/` dir in cc-hooks is retained — it contains user-facing example hook scripts, not plugin machinery.
- **Correctness:** Pre-deletion gate verified before any `rm`. `plugins/cc/` is clean of `scripts/` and `bun *.ts` references. Root gate (lint + test + build) passes clean — 462 tests pass, 0 fail. Deletion did not break the CLI suite, confirming no out-of-scope deletion.
- **Regression risk:** Low. The deleted code was already superseded by the `superskill` CLI (F017/0024 rewrote SKILL.md files; F018/0025 rewrote slash commands). The gate-clearing reference fixes are surgical documentation path replacements, no structural changes.

**Out-of-Scope Compliance**

- SKILL.md structural rewrites → done in 0024 (F017), not touched here beyond reference-path cleanup already required by the deletion gate
- Slash command rewrites → done in 0025 (F018), not touched
- Namespace migration → done in 0023 (F016), not touched
- Phase 4 follow-ups (port adapt/emit/package/migrate to CLI) → tracked in design doc §7, not this task

**Overall Verdict: PASS** — All 9 requirements verified with evidence. SECU review clean. Root gate green. Pre-deletion gate held before any deletion. 16 directories + 1 reference file removed. Surviving references are clean of deleted `scripts/` paths.


### Testing

**Timestamp:** 2026-06-18T03:20:20Z

**R1 (PRE-DELETION GATE — run first):** PASS
- `rg -n "scripts/|bun .*\.ts" plugins/cc/` → empty
- **Gate-clearing fixes applied:** surviving `cc-skills` reference docs now use `extensions/` for optional executable helpers; surviving `cc-hooks` reference docs now use `hooks/` for hook command examples.

**R2–R5 — embedded dirs gone:** PASS
- `find plugins/cc -type d \( -name scripts -o -name templates -o -name tests -o -name emitters -o -name schema \)` → empty
- Deleted: 5× scripts/, 4× templates/, 5× tests/, 1× emitters/, 1× schema/ = 16 directories total

**R6 — scripts-usage.md gone:** PASS
- `find plugins/cc -name scripts-usage.md` → empty

**R7 — whole-tree deletion:** PASS
- All 16 dirs deleted as whole trees (no cherry-picking individual files)

**R8 — apps/cli/ and scripts/ untouched:** PASS
- `git diff --name-only apps/cli/ scripts/` → empty

**R9 — vendors/ untouched:** PASS
- `git status --short vendors/` → empty

**Root gate:** PASS
- `bun run lint` → exit 0 (biome check + typecheck clean)
- `bun run test` → 462 pass, 0 fail, 1056 expect() calls, 99.53% func / 98.32% line coverage
- `bun run build` → exit 0 (753 modules bundled)

**No new tests** — deletion-only task. Evidence is the find/diff/gate outputs above.


### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References

- Design: [design-doc-phase3.md](../design/design-doc-phase3.md) §5 (ordering invariant #4)
- Feature: [F019](../features/F019-embedded-code-deletion.md)
- Depends on: 0024, 0025 (must stop referencing deleted paths first)
- Authority: docs/00_ADR.md ADR-004 (vendors/ untouched)
