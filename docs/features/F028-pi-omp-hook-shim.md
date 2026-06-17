---
feature_id: F028
title: Pi/omp/hermes hook enablement (shim/copy)
phase: 5
status: planned
depends_on: [F027]
deliverables:
  - apps/cli/src/commands/install.ts (hook copy/shim step for pi/omp/hermes)
  - shim assets (if a shim rung is chosen)
created: 2026-06-17
---

# F028 — Pi/omp/hermes hook enablement

## What

Give the three targets rulesync can't emit hooks for — **Pi** (maps to rulesync but its hooks column
is blank), **omp** and **hermes** (absent from rulesync's tool set) — a hook lifecycle as close to
Claude Code's as the agent supports. This is the **one genuine research item** in Phase 5 (design
§1.2): a *mechanism* question, not a coverage one.

## Why

The §1 coverage table (derived from `vendors/rulesync/README.md:77–107` + `TARGET_TO_RULESYNC`) shows
these three uncovered. F027 surfaces counts for the four ✅ targets; F028 closes the remaining gap so
"one `hooks.json` installs correct native hook config for every supported target" (design §6 exit #1)
holds — uncovered targets shimmed or documented, **no silent drop** (exit #2).

## Change

### Research (design §1.2) — the only discovery in Phase 5

For **Pi** and **omp** (hermes uses copy-step, no research needed):
- Does Pi / omp expose an extension/plugin/wrapper/middleware point that can intercept the
  hook-relevant lifecycle events (session start, pre/post tool use, stop)?
- Is there an existing open-source bridge, or must superskill ship a small shim installed alongside
  the agent config that maps the rulesync-canonical `hooks.json` onto that extension point?
- **Fallback ladder** — prefer the highest rung the agent actually supports:
  (a) native extension if one exists → (b) superskill-installed shim → (c) copy-step that hand-emits
  config → (d) document as unsupported.

> Deliverable: a short note (chosen rung + source + date, per the anti-hallucination rule) recorded
> in design-doc-phase5 §1.2. **Research before shims** (invariant #5) — a shim is added only after
> the research proves the rung.

### Implementation — `commands/install.ts`

- The install flow already copy-dispatches non-rulesync targets (`install.ts` Step 4 / the
  hermes/omp surrogate handling at `install.ts:132–143`). Extend that step to emit hook config for
  the chosen rung:
  - **hermes** — copy/derive hook config via the existing post-generate copy step (it already reuses
    opencode's rulesync output; extend to carry `hooks.json`).
  - **Pi / omp** — per the research rung: install the native extension config, or write the
    superskill shim + its config, or copy-emit. Goal is parity with Claude Code's hook lifecycle.
- **No silent drop:** if the chosen rung is (d) unsupported, the install output must say so
  explicitly for that target.

### Constraints

- **Hook content is untrusted** (invariant #4) — when authored from external content, hook `command`
  strings are never expanded as instructions (project safety rule). The shim must not eval embedded
  instructions.
- **rulesync owns format knowledge** (invariant #1) — for the ✅ targets superskill still delegates to
  rulesync; F028 only adds the copy/shim for the three rulesync can't cover.

## Acceptance

```bash
# hermes gets hook config via copy-step
superskill install <plugin-with-hooks> --targets hermes
# → ~/.hermes/.../hooks config present (no silent drop)

# Pi/omp emit per chosen rung (or explicitly documented unsupported)
superskill install <plugin-with-hooks> --targets pi --verbose
# → either native/shim hook config written, OR output states "pi: hooks unsupported (rung d)"

# Research note recorded
rg -i "rung|extension|shim" docs/design/design-doc-phase5.md   # → §1.2 note with source + date
```
