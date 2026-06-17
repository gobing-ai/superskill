---
name: Phase 5 tests
description: Phase 5 tests
status: Canceled
created_at: 2026-06-17T22:44:45.234Z
updated_at: 2026-06-17T23:20:56.235Z
folder: docs/tasks
type: task
feature-id: F032
priority: high
estimated_hours: 5
dependencies: ["0034","0035","0036","0037","0038","0039"]
tags: ["phase5","tests","fixtures","coverage"]
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0040. Phase 5 tests

### Background

Tests for the Phase 5 deliverables: install hook-count reporting + per-target hook emission (fixtures), hook emit wrapper, skill package, skill migrate (deterministic core + refined path), and the adapt gap closure. Maintain >=90% line/function coverage; gates green (design §6 exit #6). Each Phase 5 feature restores or fixes user-visible surface; without regression tests they rot (constitution lessons). Hook-emission tests must prove 'one hooks.json installs correct native hook config for every rulesync-supported target' (§6 exit #1) from fixtures, per target. Design: design-doc-phase5.md §4.1, §6. Owning feature: F033.


### Requirements

- [ ] **R1** — `tests/commands/install-hooks.test.ts` (F027/F028): `hooksCount > 0` + verbose prints it for a ✅ target; per-target fixture asserts hook config at the expected native location (design §6 exit #1); Pi/omp/hermes emitted per rung **or** explicit unsupported (no silent drop, exit #2); `rulesync.ts` unchanged.
- [ ] **R2** — `tests/commands/hook-emit.test.ts` (F029): `hook emit --target --dry-run` emits canonical config + reports a count; `HookDefinitionSchema` lint (valid passes, invalid errors).
- [ ] **R3** — `tests/operations/skill-package.test.ts` (F030): `packageSkill` bundles `SKILL.md` + `references/` + companions, returns path; missing → exit 2; uses content-IO primitives.
- [ ] **R4** — `tests/operations/skill-migrate.test.ts` (F031): deterministic merge of 2 sources → `<dest>` (no Phase 4); missing source → exit 2; refined path (`--refine --ingest`) routes through the generation seam + gate, a regressive merge rejected + restored (fixture-replay, **no model call**).
- [ ] **R5** — `adapt` (F032): forward conversion for all targets still applies the expected slash/colon/frontmatter/Pi transforms (no missing adapter transform).
- [ ] **R6** — Fixtures in `tests/fixtures/phase5/`: hooks-bearing sample plugin, per-target expected hook outputs, a `migrate` proposal fixture — hand-authored; the `migrate --refine` test replays fixture JSON (no live model).
- [ ] **R7** — Coverage gate maintained: **line ≥ 90% and function ≥ 90%** aggregate (`bunfig.toml`); `operations/package.ts`, `operations/migrate.ts`, the `hook emit` verb, install hook-count branches all covered.
- [ ] **R8** — No test skipped, `.skip`'d, or commented out to go green (R12 / project gate).

**Acceptance:**
```bash
bun run test                          # → all pass, none skipped
bun run test 2>&1 | rg "%|coverage"   # → line ≥ 90%, function ≥ 90%
bun run lint && bun run build         # → green
git status -s                         # → only intentional changes
```

**Dependency:** gates on 0034–0039. Runs last in Phase 5.


### Q&A



### Design



### Solution

bun:test, tests next to code. fixtures/phase5/: hooks-bearing sample plugin, per-target expected hook outputs, migrate proposal fixture. migrate --refine test replays fixture JSON (no live model). Spy process.stdout.write for CLI output. Cover operations/package.ts, operations/migrate.ts, hook emit verb, install hook-count branches. Run bun run lint/test/build green + git status clean.


### Plan



### Review



### Testing



### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References


