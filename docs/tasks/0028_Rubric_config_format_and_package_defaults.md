---
name: Rubric config format and package defaults
description: Rubric config format and package defaults
status: Done
created_at: 2026-06-17T22:36:48.912Z
updated_at: 2026-06-18T05:09:29.821Z
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

- [x] **R1** — Unified rubric YAML shape → **MET** | `RubricSchema` rubric.ts:36-54
- [x] **R2** — Dimension names in DIMENSION_REGISTRY → **MET** | live check: all 5 = true
- [x] **R3** — Weights sum to 1.0 (±0.001) → **MET** | all 5 sum 1.0000, validated rubric.ts:184
- [x] **R4** — Five package-default rubrics (hook=4 dims) → **MET** | 5 YAMLs present
- [x] **R5** — RubricSchema + RubricError(field) → **MET** | rubric.ts:36,59
- [x] **R6** — loadRubric resolution explicit→user→default → **MET** | rubric.ts:95-128
- [x] **R7** — Load-time validation errors name field → **MET** | weights.sum / dimensions[N].name / version
- [x] **R8** — Heuristic path stays equal-weighted → **MET** | dimensions.ts unchanged (git)
- [x] **R9** — "rubrics/" in package.json files → **MET** | package.json:26 + prepublishOnly

**Acceptance:**
```bash
for t in agent skill command hook magent; do bun -e "import {loadRubric} from './apps/cli/src/quality/rubric'; loadRubric('$t')"; done  # → all succeed
```

**Out of scope:** scorer seam I/O (F022), generation briefs (F023).


### Q&A



### Design

**Design: Rubric config format + loader (F021)**

**Architecture** (design-doc-phase4.md §3, invariant #3 — rubric is config, not code):

The rubric is a **data file** (YAML), not CLI code. It's the fitness function the quality brain scores against. The CLI loads/validates it; the agent/Spur personas read it to judge content. A rubric edit changes scores without a CLI rebuild.

**Unified YAML shape** (all 5 types, design §3.1):

```yaml
version: 1
type: agent
dimensions:
  - name: role-clarity          # MUST be a DIMENSION_REGISTRY[type] key
    weight: 0.25                # weights within a type sum to 1.0 (±0.001)
    criterion: >
      Does the body define a specific, non-generic persona?
    anchors:                    # optional few-shot calibration
      excellent: "…0.9–1.0 example…"
      poor: "…0.2–0.4 example…"
```

**Resolution order** (`loadRubric(type, { path? })`), mirroring F007 scaffold template precedence:
1. Explicit `--rubric <file>` (opts.path) — highest priority
2. User override `~/.superskill/rubrics/<type>.yaml`
3. Dev: `src/rubrics/<type>.yaml` (relative to quality/rubric.ts → `../rubrics/`)
4. Prod: `rubrics/<type>.yaml` (relative to dist → `../../rubrics/`)

**Module: `apps/cli/src/quality/rubric.ts`**

Exports:
- `RubricSchema` (zod) — validates `{ version: int≥1, type: ContentType, dimensions[]: { name, weight, criterion, anchors? } }`
- `loadRubric(type, opts?)` — resolves + validates + returns `Rubric`
- `Rubric` type — `{ version: number; type: ContentType; dimensions: RubricDimension[] }`
- `RubricDimension` type — `{ name: string; weight: number; criterion: string; anchors?: { excellent?: string; poor?: string } }`
- `RubricError` class — extends Error, carries `field` property naming the offending field

**Load-time validation** (R7):
1. Parse YAML → validate against `RubricSchema` (zod catches shape errors)
2. Every `dimensions[].name` must be in `DIMENSION_REGISTRY[type]` → else `RubricError(field: 'dimensions[N].name')`
3. Weights sum to 1.0 ± 0.001 → else `RubricError(field: 'weights.sum', actual: <sum>)`
4. `version` present → enforced by zod schema (int ≥ 1)

**Heuristic path stays equal-weighted** (R8): `computeAggregate` in dimensions.ts is unchanged. Rubric weights apply ONLY to rubric-mode aggregate (the `scorer:rubric` store marker disambiguates — F022's concern, not this task). This task ships the rubric data + loader; the scorer seam (F022) consumes it.

**Package defaults** (R4): 5 YAML files in `apps/cli/src/rubrics/`:
- `agent.yaml` — 5 dims: completeness(0.20), role-clarity(0.25), tool-selection(0.20), skill-linkage(0.20), model-fit(0.15)
- `skill.yaml` — 5 dims: completeness(0.25), clarity(0.25), trigger-accuracy(0.20), anti-hallucination(0.15), conciseness(0.15)
- `command.yaml` — 5 dims: completeness(0.25), clarity(0.25), argument-hints(0.20), tool-references(0.15), slash-syntax(0.15)
- `hook.yaml` — 4 dims: correctness(0.30), event-coverage(0.30), safety(0.25), pattern-match-quality(0.15)
- `magent.yaml` — 5 dims: completeness(0.25), platform-coverage(0.25), conciseness(0.15), tone-consistency(0.20), safety(0.15)

All weights sum to exactly 1.0. Dimension names match `DIMENSION_REGISTRY` keys exactly.

**Packaging** (R9): Add `"rubrics/"` to `apps/cli/package.json` `files` array (alongside `"templates/"`). Update `prepublishOnly` to copy `src/rubrics` → `rubrics/` (mirrors the templates copy step).

**Out of scope:** scorer seam I/O (F022), generation briefs (F023), rubric version stamping on evaluation rows (F022), trend version-boundary logic (F022).


### Solution

Mirror F007 scaffold's template-resolution precedence (user->built-in). Ship rubrics/<type>.yaml as package defaults. quality/rubric.ts exports RubricSchema, loadRubric, Rubric type. Prefer rubric-only weights (one source) — heuristic stays equal-weighted, the scorer:rubric store marker disambiguates aggregation (design §3.1). Validate every name against DIMENSION_REGISTRY[type].


### Plan

**Plan**

**Step 1 — Create rubric YAML defaults** (`apps/cli/src/rubrics/<type>.yaml`)
- 5 files: agent.yaml, skill.yaml, command.yaml, hook.yaml, magent.yaml
- Each: `version: 1`, `type: <type>`, `dimensions[]` with name/weight/criterion/anchors
- Weights sum to 1.0; names match DIMENSION_REGISTRY keys

**Step 2 — Create `apps/cli/src/quality/rubric.ts`**
- Import: `zod`, `yaml` (parse), `DIMENSION_REGISTRY` + `ContentType` from dimensions.ts, `existsSync`/`readFileSync`/`join`/`homedir` from node modules
- `RubricDimension` interface, `Rubric` interface
- `RubricSchema` (zod): version (z.number().int().min(1)), type (z.enum of 5), dimensions (z.array of objects)
- `RubricError` class: extends Error, `field: string`, `actual?: unknown`
- `resolveRubricPath(type, opts)`: explicit path → user home → dev src → prod, returns file content
- `loadRubric(type, opts?)`: resolve → parse YAML → zod validate → custom validations (names in registry, weights sum) → return Rubric
- Validation throws `RubricError` with field name on each R7 failure mode

**Step 3 — Update `apps/cli/package.json`**
- Add `"rubrics/"` to `files` array (R9)
- Update `prepublishOnly`: add `&& cp -r src/rubrics rubrics` (mirror templates copy)

**Step 4 — Write tests** (`apps/cli/tests/quality/rubric.test.ts`)
- Resolution order: explicit path → user home (mock HOME) → package default
- Validation: unknown dimension name → RubricError(field='dimensions[N].name'); weights ≠ 1.0 → RubricError(field='weights.sum'); missing version → RubricError
- All 5 package defaults load + validate successfully
- Every dimension name in each default is a DIMENSION_REGISTRY[type] key
- Coverage contribution to ≥90% line/function aggregate

**Step 5 — Verify**
- `bun run lint` (biome + typecheck)
- `bun run test` (462+ tests pass, coverage ≥90%)
- `bun run build` (exit 0)
- Acceptance script: `for t in agent skill command hook magent; do bun -e "...loadRubric('$t')"; done`
- `git status -s` — only intentional changes

**Files to create:**
- `apps/cli/src/quality/rubric.ts` (loader/validator)
- `apps/cli/src/rubrics/agent.yaml`
- `apps/cli/src/rubrics/skill.yaml`
- `apps/cli/src/rubrics/command.yaml`
- `apps/cli/src/rubrics/hook.yaml`
- `apps/cli/src/rubrics/magent.yaml`
- `apps/cli/tests/quality/rubric.test.ts`

**Files to modify:**
- `apps/cli/package.json` (files array + prepublishOnly)

**No changes to:** dimensions.ts (heuristic path unchanged — R8), evaluate.ts, evolve.ts (those are F022/F023).


### Review

## Re-Verification — 2026-06-17 (--force --fix all)

**Status:** 0 findings (PASS — confirms prior verdict)
**Scope:** apps/cli/src/quality/rubric.ts, apps/cli/src/rubrics/*.yaml (5), apps/cli/package.json, rubric.test.ts
**Mode:** verify (Phase 7 SECU + Phase 8 traceability, --focus all)
**Channel:** current (inline)
**Gate:** lint exit 0 · test 482 pass / 0 fail (rubric.ts 100%/100%) · build exit 0

### Phase 7 — SECU (all dimensions)

No P1/P2/P3/P4 findings.

- **Security:** No secrets/injection/dangerous sinks. `--rubric` path uses `existsSync`/`readFileSync` on user's own filesystem (same trust boundary as any CLI flag); no shell exec, no traversal escalation. The `../../` references are fixed package-relative `join()` calls (prod resolution) + JSDoc, not user-controlled.
- **Efficiency:** Load-once file read + zod parse; no hot-path or N+1 concern.
- **Correctness:** YAML parse wrapped in try/catch → `RubricError(field='yaml')` (`rubric.ts:153`); zod shape validation; explicit registry-key + weight-sum checks. No swallowed errors, no `any`.
- **Usability:** Full JSDoc on public API; `RubricError.field` names the offending field for actionable errors.

### Phase 8 — Requirements Traceability (live re-run)

| Req | Verdict | Evidence (this run) |
|-----|---------|---------------------|
| R1 | MET | `RubricSchema` (`rubric.ts:36-54`) validates version/type/dimensions shape |
| R2 | MET | All 5 defaults: every dim name in `DIMENSION_REGISTRY[type]` (live check = true) |
| R3 | MET | All 5 sum to 1.0000; loadRubric enforces ±0.001 (`rubric.ts:184`) |
| R4 | MET | 5 YAMLs; dim counts agent/skill/command/magent=5, hook=4 |
| R5 | MET | `RubricSchema` + `RubricError{field,actual}` exported (`rubric.ts:36,59`) |
| R6 | MET | 4-tier resolution `resolveRubricContent` (`rubric.ts:95-128`): explicit → user → dev → prod |
| R7 | MET | Live: bad-weights→field=weights.sum actual=0.5; unknown-dim→field=dimensions[0].name; missing-version→field=version |
| R8 | MET | `dimensions.ts` UNCHANGED (git confirms) — heuristic path equal-weighted |
| R9 | MET | `"rubrics/"` in files array; prepublishOnly copies src/rubrics → rubrics |

### Phase 4 Foundation

Rubric loader + 5 defaults shipped as config (not code), versioned, user-overridable. F022/F023 consume `loadRubric()`. Confirmed complete.

**No fixes applied (--fix all):** verdict PASS, 0 findings.


### Testing

**Testing**

**Timestamp:** 2026-06-18T03:10:00Z

**Acceptance script** (from task file):
```bash
for t in agent skill command hook magent; do bun -e "import {loadRubric} from './apps/cli/src/quality/rubric'; loadRubric('$t')"; done
```
Result: all 5 succeed. Each loads with version=1, correct dimension count (agent/skill/command/magent=5, hook=4), weights sum=1.0000.

**Requirements verification:**

| Req | Check | Result |
|-----|-------|--------|
| R1 | Unified rubric YAML shape: version (int), type (ContentType), dimensions[] with { name, weight, criterion, anchors? } | PASS — RubricSchema (zod) validates this shape; all 5 defaults conform |
| R2 | Every dimension name is a DIMENSION_REGISTRY[type] key | PASS — verified programmatically: all 5 defaults have names matching registry keys exactly, same length |
| R3 | Weights within a type sum to 1.0 (±0.001) | PASS — all 5 defaults sum to exactly 1.0000; loadRubric validates at load time |
| R4 | Five package-default rubrics shipped: agent, skill, command, hook (4 dims), magent | PASS — 5 YAML files in apps/cli/src/rubrics/; hook has 4 dims, others have 5 |
| R5 | RubricSchema (zod) validates shape; RubricError thrown with offending field | PASS — RubricSchema exported; RubricError class with `field` + `actual` properties; 20 tests cover shape validation |
| R6 | loadRubric(type, { path? }) resolution: explicit → user → package default | PASS — 4 resolution tests: explicit path wins, explicit over user, user over default, not-found throws |
| R7 | Load-time validation: unknown dim → RubricError; weights ≠ 1.0 → RubricError; missing version → RubricError | PASS — 5 validation tests: unknown dim (field=dimensions[N].name), bad weights (field=weights.sum, actual=0.8), missing version (field=version), within-tolerance accepted, malformed YAML (field=yaml) |
| R8 | Heuristic scoring path stays equal-weighted; rubric weights apply only to rubric-mode | PASS — dimensions.ts computeAggregate unchanged; rubric.ts does not modify dimensions.ts; no coupling to heuristic path |
| R9 | "rubrics" added to apps/cli/package.json files | PASS — `"rubrics/"` added to files array; prepublishOnly updated to copy src/rubrics → rubrics |

**Test suite:** 20 tests in `apps/cli/tests/quality/rubric.test.ts`
- 7 package-default tests (5 per-type load + registry-key match + weight-sum check)
- 4 resolution-order tests (explicit priority, explicit-over-user, not-found, user-over-default)
- 5 validation-error tests (unknown dim, bad weights, missing version, within-tolerance, malformed YAML)
- 4 RubricSchema tests (valid shape, version 0 rejected, unknown type rejected, empty dimensions rejected)

**Root gate:**
- `bun run lint` → exit 0 (biome + typecheck clean)
- `bun run test` → 482 pass, 0 fail, 99.55% function coverage, 98.36% line coverage (rubric.ts: 100%/100%)
- `bun run build` → exit 0 (dist/index.js 3.17 MB)

**git status -s:**
- Modified: `apps/cli/package.json` (files array + prepublishOnly), `docs/tasks/0028_*.md` (task file)
- Untracked: `apps/cli/src/quality/rubric.ts`, `apps/cli/src/rubrics/` (5 YAMLs), `apps/cli/tests/quality/rubric.test.ts`
- All changes intentional. No CLI source regression. No test skipped.


### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References

- Design: [design-doc-phase4.md](../design/design-doc-phase4.md) §3
- Feature: [F021](../features/F021-rubric-config.md)
- Code: apps/cli/src/quality/dimensions.ts:50 (DIMENSION_REGISTRY keys)
- Pattern ref: F007 scaffold template resolution (user -> built-in)

