---
name: Pi omp hermes hook enablement shim
description: Pi omp hermes hook enablement shim
status: Backlog
created_at: 2026-06-17T22:43:35.628Z
updated_at: 2026-06-17T22:43:35.628Z
folder: docs/tasks
type: task
feature-id: F028
priority: medium
estimated_hours: 5
dependencies: ["0034"]
tags: ["phase5","hooks","pi","omp","hermes","shim","research"]
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0035. Pi omp hermes hook enablement shim

### Background

Give the 3 targets rulesync can't emit hooks for — Pi (maps to rulesync but hooks column blank), omp + hermes (absent from rulesync tool set) — a hook lifecycle as close to Claude Code's as the agent supports. THE ONE GENUINE RESEARCH ITEM in Phase 5 (design §1.2): a mechanism question, not coverage. The §1 coverage table (from vendors/rulesync/README.md:77-107 + TARGET_TO_RULESYNC) shows these uncovered. Closes the gap so 'one hooks.json installs correct native hook config for every supported target' (§6 exit #1) holds — shimmed or documented, NO silent drop (#2). Research before shims (invariant #5). Design: design-doc-phase5.md §1.2, §2.1. Owning feature: F028.


### Requirements

- [ ] **R1** — Research note recorded in design §1.2 (chosen rung + source + date, per anti-hallucination rule) for **Pi** and **omp** — does an extension/plugin/wrapper/middleware point intercept session start, pre/post tool use, stop?
- [ ] **R2** — Fallback ladder honored, highest rung the agent supports: (a) native extension → (b) superskill-installed shim → (c) copy-step → (d) documented unsupported.
- [ ] **R3** — `install.ts` copy/shim step extended:
  - **hermes** — hook config via the existing post-generate copy step (extend the opencode-surrogate reuse at `install.ts:138–143` to carry `hooks.json`).
  - **Pi / omp** — emit per the chosen rung (native extension config | superskill shim + config | copy-emit).
- [ ] **R4** — **No silent drop** (design §6 exit #2): if a target lands on rung (d), the install output **explicitly states** it's unsupported for that target.
- [ ] **R5** — **Hook content untrusted** (invariant #4): the shim never evaluates embedded instructions from external content (project safety rule).
- [ ] **R6** — rulesync still owns format for the ✅ targets (invariant #1) — F028 adds copy/shim only for the 3 rulesync can't cover.

**Acceptance:**
```bash
superskill install <plugin-with-hooks> --targets hermes        # → hooks config present, no silent drop
superskill install <plugin-with-hooks> --targets pi --verbose  # → native/shim config OR "pi: hooks unsupported (rung d)"
rg -i "rung|extension|shim" docs/design/design-doc-phase5.md    # → §1.2 note w/ source + date
```

**Out of scope:** the 4 ✅ targets (already emit — F027); the `hook emit` verb (F029).


### Q&A



### Design



### Solution

Research Pi/omp extension/plugin/wrapper/middleware points that can intercept session start, pre/post tool use, stop. Record the rung. Extend install.ts Step 4 / surrogate handling (install.ts:132-143): hermes via copy-step (extend the opencode-surrogate reuse to carry hooks.json); Pi/omp per rung (native extension config | superskill shim+config | copy-emit). Goal = Claude-Code hook-lifecycle parity. If rung d, output states unsupported for that target.


### Plan



### Review



### Testing

Tests ship **in this task** (design rule: each task owns its tests — no separate pure-test task).

- [ ] `tests/commands/install-hooks.test.ts` (the Pi/omp/hermes half):
  - hermes → hook config emitted via the copy-step (assert present at the expected hermes location).
  - Pi / omp → hook config emitted per the chosen rung (F028 research) **or** the output explicitly states unsupported (rung d) — **no silent drop** (design §6 exit #2).
  - The shim never evaluates embedded instructions from external content (invariant #4) — assert a hook `command` carrying instruction-like text is treated as data, not executed/expanded.
- [ ] Fixtures: the shared `tests/fixtures/phase5/` hooks-bearing plugin + expected per-target output for the chosen rung.
- [ ] Coverage for the copy/shim branch contributes to the ≥90% gate.
- [ ] No test skipped / `.skip`'d (R12).

(The ✅-target hook-count assertions live in 0034.)


### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References

- Design: [design-doc-phase5.md](../design/design-doc-phase5.md) §1.2, §2.1
- Feature: [F028](../features/F028-pi-omp-hook-shim.md)
- Depends on: 0034
- Code: apps/cli/src/commands/install.ts:132-143 (surrogate/copy step)
- Research note destination: design-doc-phase5 §1.2

