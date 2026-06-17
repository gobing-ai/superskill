---
name: Rubric config format and package defaults
description: Rubric config format and package defaults
status: Backlog
created_at: 2026-06-17T22:36:48.912Z
updated_at: 2026-06-17T22:36:48.912Z
folder: docs/tasks
type: task
feature-id: F021
priority: high
estimated_hours: 5
tags: ["phase4","rubric","quality","config"]
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0028. Rubric config format and package defaults

### Background

A versioned, upgradeable rubric config — config NOT CLI code — so scoring criteria iterate without re-releasing the binary (design §3, invariant #3). One unified YAML shape for all 5 types, package-default rubrics shipped with npm, user-overridable at ~/.superskill/rubrics/<type>.yaml. Plus a loader/validator module (quality/rubric.ts) and per-type dimension weights. The rubric is the FITNESS FUNCTION the quality brain scores against; both the scorer seam (F022) and generation seam (F023) read it. Must be data (rubric edit changes scores with no rebuild — §7 exit #2) and versioned (a rubric change must not look like a quality regression — invariant #4). Foundation for all of Phase 4. Design: design-doc-phase4.md §3. Owning feature: F021.


### Requirements

- [ ] **R1** — Unified rubric YAML shape (design §3.1): `version` (int), `type` (ContentType), `dimensions[]` each `{ name, weight, criterion, anchors? }`.
- [ ] **R2** — Every dimension `name` is a `DIMENSION_REGISTRY[type]` key (`quality/dimensions.ts:50`) — heuristic and rubric scores stay comparable.
- [ ] **R3** — Weights within a type sum to **1.0** (±0.001), validated at load.
- [ ] **R4** — Five package-default rubrics shipped: `agent`, `skill`, `command`, `hook` (4 dims), `magent`.
- [ ] **R5** — `RubricSchema` (zod) validates the shape; `RubricError` thrown with the offending field on failure.
- [ ] **R6** — `loadRubric(type, { path? })` resolution order: explicit `--rubric` → user `~/.superskill/rubrics/<type>.yaml` → package default. (Mirrors F007 template precedence.)
- [ ] **R7** — Load-time validation: unknown dimension name → `RubricError`; weights ≠ 1.0 → `RubricError`; missing `version` → `RubricError`.
- [ ] **R8** — Heuristic scoring path stays **equal-weighted**; rubric weights apply only to rubric-mode aggregate (the `scorer` marker disambiguates — F022).
- [ ] **R9** — `"rubrics"` added to `apps/cli/package.json` `files` so defaults ship.

**Acceptance:**
```bash
for t in agent skill command hook magent; do bun -e "import {loadRubric} from './apps/cli/src/quality/rubric'; loadRubric('$t')"; done  # → all succeed
# unknown-dim / bad-weights / missing-version rubric → RubricError naming the field
```

**Out of scope:** the scorer seam I/O (F022), generation briefs (F023).


### Q&A



### Design



### Solution

Mirror F007 scaffold's template-resolution precedence (user->built-in). Ship rubrics/<type>.yaml as package defaults. quality/rubric.ts exports RubricSchema, loadRubric, Rubric type. Prefer rubric-only weights (one source) — heuristic stays equal-weighted, the scorer:rubric store marker disambiguates aggregation (design §3.1). Validate every name against DIMENSION_REGISTRY[type].


### Plan



### Review



### Testing

Tests ship **in this task** (design rule: each task owns its tests — no separate pure-test task).

- [ ] `tests/quality/rubric.test.ts`: `loadRubric` resolution order (explicit → user → package default); validation errors each throw `RubricError` naming the field — unknown dimension name, weights ≠ 1.0 (±0.001), missing `version`; all 5 package defaults load + validate; every dimension name is a `DIMENSION_REGISTRY[type]` key.
- [ ] Coverage for `quality/rubric.ts` contributes to the aggregate **line ≥ 90% / function ≥ 90%** gate (`bunfig.toml`).
- [ ] No test skipped / `.skip`'d / commented-out to go green (R12).

`bun:test`, tests next to code (`apps/cli/tests/`). Hand-authored rubric fixtures (good + each invalid variant).


### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References

- Design: [design-doc-phase4.md](../design/design-doc-phase4.md) §3
- Feature: [F021](../features/F021-rubric-config.md)
- Code: apps/cli/src/quality/dimensions.ts:50 (DIMENSION_REGISTRY keys)
- Pattern ref: F007 scaffold template resolution (user -> built-in)

