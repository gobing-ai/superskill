---
feature_id: F021
title: Rubric config format + package defaults + override resolution
phase: 4
status: planned
depends_on: []
deliverables:
  - apps/cli/src/quality/rubric.ts
  - apps/cli/src/rubrics/agent.yaml
  - apps/cli/src/rubrics/skill.yaml
  - apps/cli/src/rubrics/command.yaml
  - apps/cli/src/rubrics/hook.yaml
  - apps/cli/src/rubrics/magent.yaml
  - apps/cli/src/quality/dimensions.ts (add per-type weights)
created: 2026-06-17
---

# F021 — Rubric config format + package defaults + override resolution

## What

A **versioned, upgradeable** rubric config — config, **not** CLI code — so scoring criteria iterate
without re-releasing the binary (design §3, invariant #3). One unified YAML shape for all five types,
package-default rubrics shipped with the npm package, user-overridable at
`~/.superskill/rubrics/<type>.yaml`. Plus a loader/validator module and per-type dimension weights.

## Why

The rubric is the **fitness function** the Phase 4 quality brain scores against. Both the scorer seam
(F022) and the generation seam (F023) read it. It must be data (so a rubric edit changes scores with
no rebuild — design §7 exit #2) and versioned (so a rubric change doesn't masquerade as a quality
regression — invariant #4).

## Change

### Unified rubric shape (design §3.1) — `rubrics/<type>.yaml`

```yaml
# .superskill/rubrics/<type>.yaml   (user-overridable; package ships defaults)
version: 1
type: agent
dimensions:
  - name: role-clarity            # MUST be a DIMENSION_REGISTRY key (dimensions.ts:50)
    weight: 0.25
    criterion: >
      Does the body define a specific, non-generic persona with a clear scope?
      Penalize "helpful assistant" framing and vague responsibilities.
    anchors:                      # few-shot calibration for the Scorer persona
      excellent: "…example of a 0.9–1.0 body…"
      poor: "…example of a 0.2–0.4 body…"
  - name: trigger-accuracy
    weight: 0.20
    criterion: …
```

Constraints:
- **Dimension `name`s reuse the existing `DIMENSION_REGISTRY` keys** (`quality/dimensions.ts:50`,
  e.g. agent → `completeness`, `role-clarity`, `tool-selection`, `skill-linkage`, `model-fit`) so
  heuristic and rubric scores are directly comparable in the store.
- **Same four conceptual columns everywhere** — Dimension, Weight, Score, Note/Rationale — so users
  learn one structure across all five types.
- `weight`s within a type **sum to 1.0** (validate this in the loader).
- Ship one default per type: `agent`, `skill`, `command`, `hook` (4 dims), `magent`.

### `quality/rubric.ts` (loader/validator)

- `RubricSchema` (zod) — validates the YAML shape: `version` (int), `type` (ContentType),
  `dimensions[]` with `name`/`weight`/`criterion`/optional `anchors`.
- `loadRubric(type: ContentType, opts?: { path?: string }): Rubric` — resolution order:
  explicit `--rubric <file>` → user `~/.superskill/rubrics/<type>.yaml` → package default
  `rubrics/<type>.yaml`. Mirrors the F007 scaffold template-resolution precedence (user → built-in).
- Validation on load: every `name` is a `DIMENSION_REGISTRY[type]` key; weights sum to 1.0
  (±0.001); `version` present. Throw a typed `RubricError` with the offending field on failure.
- `Rubric` type exported for F022/F023 to consume.

### `quality/dimensions.ts` (add weights)

- Add a per-type weight map (or fold weights into the rubric only — **decide at impl time**, prefer
  rubric-only to keep one source). The heuristic path stays **equal-weighted**; the `scorer: rubric`
  marker on the store row disambiguates which aggregation produced a score (design §3.1).

### Packaging

- Add `"rubrics"` to `apps/cli/package.json` `files` (like `"templates"`) so defaults ship.

## Acceptance

```bash
# Loader resolves package default
bun -e 'import {loadRubric} from "./apps/cli/src/quality/rubric"; console.log(loadRubric("agent").version)'  # → 1

# User override wins
mkdir -p ~/.superskill/rubrics && cp custom-agent.yaml ~/.superskill/rubrics/agent.yaml
# loadRubric("agent") resolves the user file, not the package default

# Validation rejects bad rubric
# - unknown dimension name → RubricError naming the dimension
# - weights summing ≠ 1.0 → RubricError naming the sum
# - missing version → RubricError

# Every default rubric loads + validates
for t in agent skill command hook magent; do bun -e "import {loadRubric} from './apps/cli/src/quality/rubric'; loadRubric('$t')"; done  # → all succeed
```
