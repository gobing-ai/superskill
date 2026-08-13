---
template: feature-impl
schema_version: 1
name: "Make magent completeness disclosure-aware and correct the dimension drift"
description: ""
status: done
type: task
profile: standard
feature_id: A
parent_wbs: null
priority: P2
tags: []
dependencies: []
ac_numbering: task-local
created_at: "2026-08-13T18:34:31.176Z"
updated_at: "2026-08-13T19:35:40.779Z"
---

## 0115. Make magent completeness disclosure-aware and correct the dimension drift

### Background
`completeness` (weight 0.25, `packages/core/src/quality/magent.ts:26-39`) scores a magent config by
counting six `##` governance-section regex hits **in the single file body**. `conciseness`
(weight 0.15, `magent.ts:110` → `scoreLength(body, 1000, 8000)`) cannot outweigh it. The resulting
gradient points at one ~8000-char file carrying six headings — the "ball of mud" shape, and the
opposite of what `superskill magent refine --kind split` already recommends.

A correctly progressively-disclosed config (small root + `docs/*.md` tree) scores `completeness ≈
1/6` and loses 0.25-weighted ground it cannot recover, so the tool penalizes the structure it
recommends.

Separately, `plugins/cc/agents/expert-magent.md:140,244` and `plugins/cc/commands/magent-evaluate.md:2,11`
document six dimensions named `coverage, scoping, safety, portability, evidence, maintainability`.
The live scorer (`magent.ts:170-176`) and `rubrics/magent.yaml` v2 use **five**: `completeness`,
`platform-coverage`, `conciseness`, `tone-consistency`, `safety`. Stale docs poisoning agent context,
in our own agent config. Bundled here because it is the same evidence body — the magent dimension surface.

Ticket type: `wayfinder:task`. Map: feature A.
### Requirements
- **R1** — `scoreCompleteness` credits a governance area when it is satisfied **either** by a `##`
  heading match (current behavior) **or** by a markdown link from the config body whose link text or
  resolved target filename matches that area's keywords.
- **R2** — A link only counts when its target **resolves on disk**. Dangling links earn nothing.
  This is the guide's staleness claim, delivered as a side effect rather than a separate mechanism.
- **R3** — Credit is **additive and full**: a link-resolved area scores identically to an inline
  section (operator decision, 2026-08-13). No config that currently inlines everything may regress.
- **R4** — `evaluateMagent` accepts an optional `basePath` for link resolution. When absent, behavior
  is byte-identical to today — `packages/core/src/quality/` currently has no filesystem awareness, so
  every existing caller must keep working unchanged.
- **R5** — `packages/core/src/rubrics/magent.yaml` `completeness` criterion text states that
  link-resolved areas count, so the LLM Scorer seam and the deterministic scorer agree.
- **R6** — `plugins/cc/agents/expert-magent.md` (lines 140, 244) and
  `plugins/cc/commands/magent-evaluate.md` (frontmatter `description`, line 11) name the five real
  dimensions. No surface in the repo claims six.
### Acceptance Criteria
```gherkin
Feature: Disclosure-aware magent completeness

  Scenario: A link to an existing doc satisfies a governance area
    Given a magent config whose body has no "## Testing" section
    But which links to "docs/TESTING.md" and that file exists on disk
    When the config is evaluated with a basePath
    Then the verification governance area counts as covered
    And completeness scores it identically to an inline section

  Scenario: A dangling link earns no credit
    Given a magent config linking to "docs/TESTING.md" which does not exist on disk
    When the config is evaluated with a basePath
    Then the verification governance area does not count as covered

  Scenario: Existing callers are unaffected
    Given a magent config evaluated without a basePath
    When the config is evaluated
    Then the completeness score equals the pre-change score for the same content

  Scenario: No inlined config regresses
    Given a magent config that already carries all six governance sections inline
    When the config is evaluated after the change
    Then its completeness score is greater than or equal to its previous score

  Scenario: Documented dimensions match the scorer
    Given the shipped agent and command surfaces for magent evaluation
    When their documented dimension lists are compared to DIMENSION_REGISTRY.magent
    Then every surface names exactly completeness, platform-coverage, conciseness, tone-consistency, safety
```
### Q&A

<!-- CLOSED decisions from refinement: what was chosen and why, what was deferred and on what
     condition. Not a parking lot for open questions — an unanswered question here means the task
     is not ready to hand off. Keep empty if none. -->

### Design
**WHAT** — `scoreCompleteness` gains a second satisfaction path: a governance area counts when a
markdown link in the body resolves, on disk, to a file whose name or link text matches that area.

**WHY** — `completeness` (0.25) currently outweighs `conciseness` (0.15) and counts only `##`
headings in one body, so the scoring gradient rewards the monolith and punishes the disclosure tree
`refine --kind split` recommends.

**WHERE** — `packages/core/src/quality/magent.ts` (scorer), `packages/core/src/quality/evaluate.ts`
(dispatch signature), `packages/core/src/rubrics/magent.yaml` (criterion text),
`plugins/cc/agents/expert-magent.md` + `plugins/cc/commands/magent-evaluate.md` (drift).

**Frozen names**

- `export type Evaluator = (content: string, target: string, basePath?: string) => QualityReport;`
  — `evaluate.ts:10`, third param **optional**.
- `export function evaluate(type: ContentType, content: string, target: string, basePath?: string)`
  — `evaluate.ts:33`, forwards `basePath` to the dispatched evaluator.
- `evaluateMagent(content: string, target: string, basePath?: string)` — `magent.ts`.
- `scoreCompleteness(body: string, basePath?: string): DimensionScore` — `magent.ts:24`.
- The existing `MAGENT_SECTIONS` entries gain a `keywords: string[]` field used for link matching.
  Reuse each entry's existing `label` (`project`, `commands`, `verification`, `conventions`,
  `safety`, `docs`) as the area identity — do not introduce a parallel area enum.

**Algorithm (per area, first match wins)**

1. Heading path — the existing `re` matches the body. Unchanged behavior.
2. Link path — scan the body for `[text](target)` where `target` is relative (skip `http(s):`,
   `mailto:`, and anchor-only `#…`). An area matches when its `keywords` hit either the link text or
   the target's basename, **and** `existsSync(resolve(basePath, target))` is true.
3. Neither → area uncounted.

Score stays `found / MAGENT_SECTIONS.length`, so the dimension's range and weight are untouched.

**Precedence** — a heading match short-circuits; never double-count one area.

**Anti-patterns (do not implement)**

- Do **not** derive `basePath` from `target`. `target` is a display label in every test and some
  callers (`'magent/x.md'`, `'AGENTS-noisy.md'`); resolving against it would silently score
  against a directory that does not exist. Rejected in favor of the explicit optional param —
  "deterministic over implicit" (AGENTS.md § Design & scope).
- Do **not** follow links transitively. One hop only; multi-hop is in the map's fog
  (feature A § Not yet specified) pending evidence that real configs need it.
- Do **not** add a `staleness` dimension. Dangling-link detection is a *consequence* of R2, not a
  new dimension — the rubric stays at five.
- Do **not** widen `scoreLength`'s 1000–8000 window, and do **not** add an inline-length cap.
  Operator rejected the cap at charting (regresses stored evaluations).
- Do **not** touch `scoreSafety` — out of scope per feature A.

**Cross-task** — assumes nothing from deps. Leaves 0117 a scorer it can measure
`templates/magent/default.md` against; 0117 must not re-litigate this design.
### Plan
1. Widen `Evaluator` to `(content, target, basePath?)` in `packages/core/src/quality/evaluate.ts:10`
   and forward the param in `evaluate()` at `:33`. The other four evaluators ignore it — no edits.
2. Add `keywords: string[]` to each `MAGENT_SECTIONS` entry in `magent.ts` (project / commands /
   verification / conventions / safety / docs), reusing the existing `label` as area identity.
3. Add a private `resolvesOnDisk(basePath, target)` helper in `magent.ts`; import `existsSync` from
   `node:fs` and `resolve` from `node:path`. Note: `magent.ts` currently has **no** fs import
   (`rubric.ts` and `eval-cases.ts` do, but only for config/eval-case files, never the evaluated doc).
4. Extend `scoreCompleteness(body, basePath?)` with the link path; heading match short-circuits.
5. Thread `basePath` through `evaluateMagent` into `scoreCompleteness`.
6. Update the `completeness` criterion in `packages/core/src/rubrics/magent.yaml` to state that
   link-resolved areas count fully, so the LLM Scorer seam matches the deterministic scorer.
7. Fix the dimension drift: `plugins/cc/agents/expert-magent.md:140,244` and
   `plugins/cc/commands/magent-evaluate.md` (frontmatter `description` + line 11) → the five real
   dimensions from `DIMENSION_REGISTRY.magent` (`types.ts:62`): `completeness`, `platform-coverage`,
   `conciseness`, `tone-consistency`, `safety`. Also correct "6 dimensions" prose to "5".
8. Tests in `packages/core/tests/quality/evaluators.test.ts`: live link credits, dangling link does
   not, no-`basePath` call is byte-identical to pre-change, fully-inlined config does not regress.
   Write a real temp dir for the live-link case — do not mock `existsSync`.
9. Gate: `bun run lint` && `bun run test` && `bun run spur-check`.
### Solution
**Change map (task 0115)**

- `packages/core/src/quality/evaluate.ts:13-17` — `Evaluator` widened to `(content, target, basePath?)`; `evaluate()` (`:37-40`) forwards the optional `basePath` to the dispatched evaluator. Other evaluators ignore it.
- `packages/core/src/quality/magent.ts:1-2` — added `existsSync` (`node:fs`) and `resolve` (`node:path`) imports (file previously had no fs imports).
- `packages/core/src/quality/magent.ts:15-24` — each `MAGENT_SECTIONS` entry gained `keywords: string[]` (`project`/`stack`, `command`/`tool`, `verification`/`verify`/`test`/`gate`, `convention`/`style`/`boundary`, `safety`/`security`/`critical`, `doc`/`reference`/`routing`); `label` remains the area identity (no parallel enum).
- `packages/core/src/quality/magent.ts:29-36` — `resolvesOnDisk(basePath, target)`: `existsSync(resolve(basePath, target))`; absent `basePath` → `false`, so the no-basePath path is byte-identical and never touches fs (R4).
- `packages/core/src/quality/magent.ts:38-53` — `linkMatchesArea(body, keywords, basePath)`: scans `[text](target)` links, skips `http(s):`/`mailto:`/anchor-only targets, strips `#fragment`, requires the target to resolve on disk, matches keywords case-insensitively against link text + target basename (R1+R2, one hop only).
- `packages/core/src/quality/magent.ts:56-78` — `scoreCompleteness(body, basePath?)`: heading match short-circuits per area (never double-counts); otherwise the link path credits the area, additively and fully (R3). Score stays `found / MAGENT_SECTIONS.length`.
- `packages/core/src/quality/magent.ts:199,209` — `evaluateMagent(content, target, basePath?)` threads `basePath` into `scoreCompleteness`.
- `packages/core/src/rubrics/magent.yaml` (completeness criterion) — states inline **or** link-resolved areas count fully; a link to a nonexistent file earns no credit (R5).
- `plugins/cc/agents/expert-magent.md:131,140,191,210,244-252,326-335` — dimension drift fixed to the five real dimensions (`completeness`, `platform-coverage`, `conciseness`, `tone-consistency`, `safety`) in the evaluate section header/body, confidence example, competency list, §5.3 Quality Assessment, and the §8 example output; old names (`coverage`, `scoping`, `portability`, `evidence`, `maintainability`) and "6 dimensions" prose removed (R6).
- `plugins/cc/commands/magent-evaluate.md:2,11` — description and body now say 5 dimensions (R6).

**Tests** — new `evaluateMagent disclosure-aware completeness (0115)` block in `packages/core/tests/quality/evaluators.test.ts`: live-link credit (real temp dir, no `existsSync` mock), link-resolved area scores identically to an inline section, dangling link earns no credit, no-`basePath` call equals explicit-`undefined` (`toEqual` — byte-identical), fully-inlined config does not regress (score ≥ previous, still 1.0), `evaluate()` dispatch forwards `basePath` to the magent evaluator.

**Verification (targeted probes only — full project gate belongs to the pipeline's test hop)** — `bun run --filter @gobing-ai/superskill-core typecheck` clean; `bun test packages/core/tests/quality/evaluators.test.ts packages/core/tests/quality/evaluate.test.ts packages/core/tests/operations/scaffold.test.ts` → 120 pass; `bun run --filter @gobing-ai/superskill typecheck` (CLI consumer) clean; `bun test plugins/cc/tests/structure.test.ts` → 14 pass; `bun test apps/cli/tests/operations/evaluate.test.ts apps/cli/tests/operations/evaluate-ingest.test.ts` → 42 pass. Remaining "6 platform" hits in `plugins/cc` are cc-agents platform counts, not magent dimensions.
### Testing
**Pipeline verify results**

- Verdict: PASS (from verdict artifact)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| R1 | MET | `packages/core/src/quality/magent.ts:42-53` — `linkMatchesArea` matches area keywords against link text + target basename; `packages/core/src/quality/magent.ts:56-76` — heading OR link credits the area; test `packages/core/tests/quality/evaluators.test.ts:1014-1024` live link → completeness 3/6 |
| R2 | MET | `packages/core/src/quality/magent.ts:34-40` — `resolvesOnDisk` = `existsSync(resolve(basePath, target))`; test `packages/core/tests/quality/evaluators.test.ts:1041-1049` dangling link → 2/6 (no credit) |
| R3 | MET | `packages/core/src/quality/magent.ts:71-76` — additive full credit per area regardless of satisfaction path; tests `packages/core/tests/quality/evaluators.test.ts:1026-1039` link-resolved ≡ inline (4/6 both) and `:1071-1078` fully-inlined config still 1.0 |
| R4 | MET | `packages/core/src/quality/magent.ts:199,214` — optional `basePath?` threaded into `scoreCompleteness`; `packages/core/src/quality/evaluate.ts:13-15,38-41` — `Evaluator` widened and `evaluate()` forwards; `resolvesOnDisk` returns false on absent basePath (no fs touch); test `packages/core/tests/quality/evaluators.test.ts:1064-1069` `toEqual` byte-identical; CLI callers pass no basePath — `bun test apps/cli/tests/operations/evaluate.test.ts apps/cli/tests/operations/evaluate-ingest.test.ts` → 42 pass / 0 fail |
| R5 | MET | `packages/core/src/rubrics/magent.yaml:6-16` — completeness criterion states inline-or-link coverage, link-resolved areas count fully, a link to a nonexistent file earns no credit |
| R6 | MET | `plugins/cc/agents/expert-magent.md:140,210,244-246,329-336` — five real dimensions in evaluate header, competency list, §5.3, example output; `plugins/cc/commands/magent-evaluate.md:2,11` — "5 quality dimensions"; `packages/core/src/quality/types.ts:62` — `DIMENSION_REGISTRY.magent` = `completeness, platform-coverage, conciseness, tone-consistency, safety`; `bun test plugins/cc/tests/structure.test.ts` → 14 pass / 0 fail; repo-wide grep for `scoping\ |

| Acceptance Criteria | Status | Evidence Type | Evidence |
|---------------------|--------|---------------|----------|
| Scenario: A link to an existing doc satisfies a governance area | MET | test | `packages/core/tests/quality/evaluators.test.ts:1014-1024` — `[Testing](docs/TESTING.md)` resolving on disk → completeness 3/6 |
| Scenario: A dangling link earns no credit | MET | test | `packages/core/tests/quality/evaluators.test.ts:1041-1049` — `docs/` exists, `TESTING.md` absent → 2/6 |
| Scenario: Existing callers are unaffected | MET | test | `packages/core/tests/quality/evaluators.test.ts:1064-1069` — no-`basePath` ≡ explicit `undefined` (`toEqual`); CLI suites 42 pass / 0 fail |
| Scenario: No inlined config regresses | MET | test | `packages/core/tests/quality/evaluators.test.ts:1071-1078` — fully-inlined six-section config ≥ previous, still 1.0 |
| Scenario: Documented dimensions match the scorer | MET | test | `plugins/cc/tests/structure.test.ts` → 14 pass / 0 fail; `packages/core/src/quality/types.ts:62` registry ≡ doc surfaces at `plugins/cc/agents/expert-magent.md:140,244` and `plugins/cc/commands/magent-evaluate.md:2,11` |
- Coverage: N/A (verdict-based; verify pipeline does not measure code coverage)
### Review
| Priority | Dimension | Location | Finding |
| --- | --- | --- | --- |
| P4 | Correctness | `packages/core/src/quality/magent.ts:63-66` | Keyword matching is substring-based: `gate` ⊂ "aggregate", `test` ⊂ "latest", `doc` ⊂ "documentation". A docs/ link whose basename contains a keyword substring can credit an area heuristically. Same looseness class as the existing heading regexes; acceptable for a heuristic scorer — revisit with word-boundary matching only if precision becomes a requirement. |
| P4 | Security | `packages/core/src/quality/magent.ts:45-52` | `resolve(basePath, target)` allows `../` traversal, but the only effect is a read-only `existsSync` on a caller-supplied basePath in a local scoring tool — no file read, no elevation. The catch is unreachable under Bun (verified: Bun `resolve` returns a string for NUL-byte targets, `existsSync` → false) and is a legitimate Node-portability guard — the Testing coverage-skip annotation is accurate. |
| P4 | Architecture | `plugins/cc/agents/expert-magent.md`, `plugins/cc/commands/magent-evaluate.md` → untracked install copies | Tracked surfaces are fixed (R6), but untracked generated copies (`.rulesync/.targets/**`, `.pi/`, `.opencode/` — 33 files) still claim six dimensions / stale names until re-emitted by install/rulesync. Re-emit in the release flow so installed agents stop reading stale dimension text. |
| P4 | — | — | No P1–P3 findings; functional verdict PASS |

**Functional traceability (sp-functional-review)**

| Req | Status | Evidence |
| --- | --- | --- |
| R1 | MET | `magent.ts:55-68` — `linkMatchesArea` matches area keywords against link text + target basename; `magent.ts:71-79` — heading OR link credits the area; test `evaluators.test.ts:1016-1024` live link → completeness 3/6 |
| R2 | MET | `magent.ts:45-52` — `resolvesOnDisk` = `existsSync(resolve(basePath, target))`; test `evaluators.test.ts:1040-1049` dangling link → 2/6 (no credit) |
| R3 | MET | `magent.ts:74-78` — additive full credit per area regardless of satisfaction path; tests `evaluators.test.ts:1026-1039` link-resolved ≡ inline (4/6 both), `:1071-1078` fully-inlined config still 1.0 |
| R4 | MET | `magent.ts:214` — optional `basePath?`; `evaluate.ts:15,40-41` — `Evaluator` widened and `evaluate()` forwards; `resolvesOnDisk` returns false on absent basePath (no fs touch); test `evaluators.test.ts:1063-1069` `toEqual` byte-identical; CLI callers (`apps/cli/src/commands/magent.ts:71` via `operations/evaluate.ts:89`) pass no basePath — `bun test apps/cli/tests/operations/evaluate.test.ts apps/cli/tests/operations/evaluate-ingest.test.ts` → 42 pass / 0 fail |
| R5 | MET | `rubrics/magent.yaml:6-16` — criterion states inline-or-link coverage, link-resolved areas count fully, a link to a nonexistent file earns no credit |
| R6 | MET | `expert-magent.md:131,140,191,210,244-252,323-335` — five real dimensions in evaluate header, scored-dimensions line, confidence example, §5.3, example output; `magent-evaluate.md:2,11` — "5 quality dimensions"; `DIMENSION_REGISTRY.magent` (`types.ts:62`) = `completeness, platform-coverage, conciseness, tone-consistency, safety`; `bun test plugins/cc/tests/structure.test.ts` → 14 pass / 0 fail |

**Acceptance Criteria cross-check** — all 5 Gherkin scenarios map to passing executable tests: live-link credits (scenario 1 → test `evaluators.test.ts:1016-1024`), dangling earns nothing (scenario 2 → `:1040-1049`), no-basePath unchanged (scenario 3 → `:1063-1069`), no inline regression (scenario 4 → `:1071-1078`), documented dimensions match scorer (scenario 5 → structure test + `types.ts:62`).

**SECUA review (sp-code-verification)** — no P1–P3 findings. S: no injection/secrets; read-only fs check. E: link scan only when basePath given; ≤6 regex passes. C: heading short-circuit prevents double-count; `http(s):`/`mailto:`/anchor targets skipped; fragment stripped; one hop only (anti-pattern honored); NUL-byte robustness tested. U: optional param, JSDoc at both layers, zero caller churn. A: fs boundary isolated in `resolvesOnDisk`; `basePath` explicit, never derived from `target` (design anti-pattern honored).

**Architecture depth (sp-code-improvement)** — no blocker/major candidates. Five-lens scan: no shallow module, no tight coupling, no wrong seam, no weak locality; test surface strong (real temp dirs, no `existsSync` mock). Advisory only: C1 `magent.ts:49-50` defensive catch unreachable under Bun (Node-portability guard — documented skip accurate); C2 substring keyword fuzz (P4 above); C3 regenerate install copies (P4 above).

**Evidence (run this turn)** — `bun test packages/core/tests/quality/evaluators.test.ts` → 72 pass / 0 fail (magent.ts 100% funcs / 97.73% lines); `bun test apps/cli/tests/operations/evaluate.test.ts apps/cli/tests/operations/evaluate-ingest.test.ts` → 42 pass / 0 fail; `bun test plugins/cc/tests/structure.test.ts` → 14 pass / 0 fail.

Review Verdict: PASS (no P1–P3 findings)
Functional Verdict: PASS (R1–R6 all MET)
### References

A

<!-- Links to the parent feature, design docs, related tasks, or external references. -->

### History
- 2026-08-13T19:27:43.794Z todo → wip (system)
- 2026-08-13T19:35:40.469Z wip → testing (system)
- 2026-08-13T19:35:40.779Z testing → done (system)
