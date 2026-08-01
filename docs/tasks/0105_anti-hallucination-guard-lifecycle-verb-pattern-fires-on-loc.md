---
template: issue
schema_version: 1
name: "anti-hallucination guard: lifecycle-verb pattern fires on local-change talk, blocking nearly every Stop"
description: ""
status: done
type: issue
profile: standard
feature_id: H1
parent_wbs: null
priority: P2
tags: ["bug"]
dependencies: []
created_at: "2026-07-25T05:35:25.883Z"
updated_at: "2026-08-01T00:24:29.745Z"
---

## 0105. anti-hallucination guard: lifecycle-verb pattern fires on local-change talk, blocking nearly every Stop

### Background
The `cc/anti-hallucination` Stop hook blocked a completed work report with
`Add verification for: confidence level (HIGH/MEDIUM/LOW)`. The report contained no external claim —
it summarized commands run in-session and their output.

Diagnosed against the live transcript rather than a reconstruction: extracting the blocked assistant
message from the session JSONL and replaying it through `verifyAntiHallucinationProtocol` reproduced
the block exactly, and pattern-level instrumentation named the trigger.
### Requirements
- R1 — A lifecycle verb with no external subject must not require verification.
- R2 — A lifecycle verb with an external subject must still require verification (no regression in
  detection power).
- R3 — Regression fixtures must be residual-proof: each negative carries the verb half that used to
  fire bare, and still asserts "does not fire".
### Acceptance Criteria
- AC1 (R1) — the 5 local-change sentences in the root-cause table return `false`.
- AC2 (R2) — the 3 external sentences in that table return `true`, and every pre-existing
  positive assertion in `ah_guard.test.ts` still passes.
- AC3 (R3) — the new negative fixtures each carry a lifecycle verb and are labelled residual-proof.
- AC4 — replaying the real blocked transcript message yields `ok:true`.
- AC5 — full gate green (`bun run autofix && bun run spur-check`, EXIT_CODE=0).
### Q&A

<!-- Clarifications and triage decisions. Keep empty if none. -->

### Design

<!-- Fix approach and tradeoffs. Keep this short unless the issue changes architecture. -->

### Plan

<!-- Ordered debugging/fix checklist. Fill before moving to todo/wip. -->

### Root Cause
`STRONG_CLAIM_PATTERNS` carried a bare lifecycle-verb regex:

    /\b(?:was|were|is|are)\s+(?:introduced|added|deprecated|removed|renamed|released)\b/i

STRONG patterns fire alone — no coupler, no external subject required. The blocked sentence was
"…the truncation regression tests, which fail loudly if the re-arm **is removed**." That is a
statement about local test behavior, and it demanded citations for the agent's own edits.

The class is not rare, which is what makes it severe: `was added` / `were removed` / `is renamed` is
the most common sentence shape in a coding summary. Measured before the fix — 5 of 5 ordinary
local-change sentences falsely required verification:

| Sentence | Before | After |
| --- | --- | --- |
| A regression test was added for the truncation case. | fires | passes |
| The rule exclusion was removed and the gate covers it. | fires | passes |
| The tests fail loudly if the re-arm is removed. | fires | passes |
| The helper is renamed to readPipedStdin. | fires | passes |
| Two fixtures were added under the rules folder. | fires | passes |
| The API was deprecated in v2 and removed in v3. | fires | fires |
| This library was introduced in release 4.1. | fires | fires |
| According to the changelog the endpoint was renamed. | fires | fires |

This is the same lesson as 0077 R1 ("bare vocabulary must not trigger"), which was applied to the
weak *noun* half while the *verb* half kept its bare STRONG form.
### Solution
`plugins/cc/scripts/anti-hallucination/ah_guard.ts:321` — removed the lifecycle-verb regex from
`STRONG_CLAIM_PATTERNS`; `plugins/cc/scripts/anti-hallucination/ah_guard.ts:351` defines it as
`LIFECYCLE_VERB_PATTERN` and `plugins/cc/scripts/anti-hallucination/ah_guard.ts:363` couples it to external vocabulary,
mirroring the existing capability-coupler design:

    return WEAK_KEYWORD_PATTERN.test(text) &&
        (CLAIM_COUPLER_PATTERN.test(text) || LIFECYCLE_VERB_PATTERN.test(text));

A weak keyword (`api|library|framework|sdk|package|endpoint|documentation`) now needs either a
capability coupler ("the API **returns**…") or a lifecycle verb ("the endpoint **was deprecated**").
Neither half alone fires.

Detection power is preserved: every pre-existing positive assertion still holds. The three cases in
the existing `detects lifecycle assertions about external artifacts` test each already carry an
external artifact (`endpoint`, `according to`, `documentation`) — the test's own title states the
intent this fix restores. The version/URL/`according to`/`recent update`/`documentation says`
STRONG patterns are untouched and still fire alone.
### Testing
**Per-Requirement Traceability** (verify run 2026-07-24, second pass; every `file:line` re-read this run)

| Req | Status | Evidence |
| --- | --- | --- |
| R1 lifecycle verb without external subject must not fire | MET | `plugins/cc/scripts/anti-hallucination/ah_guard.ts:363` couples the verb to `WEAK_KEYWORD_PATTERN`; 8-case root-cause matrix re-run this run → `8 cases, 0 mismatches` (5 local sentences `false`); test `residual-proof: passes local-change talk carrying a lifecycle verb` (`tests/ah_guard.test.ts:218`) |
| R2 lifecycle verb with external subject must still fire | MET | same matrix: 3 external sentences remain `true`; test `still fires when a lifecycle verb has an external subject` (`tests/ah_guard.test.ts:232`) proves the pure coupling path (weak keyword ∧ verb, no STRONG trigger); pre-existing `detects lifecycle assertions about external artifacts` (`:212`) passes in the 81/81 suite |
| R3 residual-proof fixtures | MET | `tests/ah_guard.test.ts:218` — 5 negatives, each carrying the lifecycle verb half that used to fire bare, all asserting `false`; title + comment labelled RESIDUAL-PROOF (compound-carrying), not baseline |

**Acceptance Criteria Verification**

| AC | Status | Evidence Type | Evidence |
| --- | --- | --- | --- |
| AC1 five local sentences return false | MET | command | 8-case matrix via `bun -e` → `8 cases, 0 mismatches` |
| AC2 three external sentences return true + no regression | MET | command + test | same matrix; `bun test .../ah_guard.test.ts` → 81 pass / 0 fail |
| AC3 negatives labelled residual-proof | MET | static-ref | `tests/ah_guard.test.ts:218` title and comment state compound-carrying, not bare-half |
| AC4 real blocked message now passes | MET | command | replay of the blocked report's claim-bearing sentences (all 5 local-change shapes, >50 chars) → `{"ok":true,"reason":"Task is complete (internal discussion)"}`; was `ok:false` demanding `confidence level` |
| AC5 full gate green | MET | command | `bun run spur-check` EXIT=0: Biome clean, pre-check 31/31, 1757 pass / 0 fail, coverage 99.86% functions / 99.00% lines, post-check 3/3; `bun run build` EXIT=0 |

**Design conformance** — `### Design` is a bare placeholder (standard-profile bug fix); classified against `### Solution`: 5/5 claims DONE. Lifecycle regex absent from `STRONG_CLAIM_PATTERNS` (`ah_guard.ts:321`, re-read: array holds version/URL/recent/`according to`/`documentation says` only); `LIFECYCLE_VERB_PATTERN` defined at `:351`; coupled predicate at `:363` mirrors the capability-coupler shape exactly; untouched STRONG patterns confirmed present.

**Detection power preserved.** Narrowing is confined to the lifecycle-verb half. The pure coupling path (weak keyword ∧ lifecycle verb, no independent STRONG trigger) is proven by `tests/ah_guard.test.ts:232` (`The package was removed from the registry.` / `That SDK is deprecated.` → `true`). The version, URL, `according to`, `recent update`, and `documentation says` STRONG patterns are untouched and still fire alone.

**Findings (SECUA, --focus all)** — no blockers, no majors. Advisory only:

- (advisory, detection residual) A local-change sentence that happens to contain a weak keyword plus a lifecycle verb still fires (e.g. `The package.json was added.` — `\bpackage\b` matches). Pre-existing keyword-coupling class residual, not introduced by this change; the cost is a verification nag, not a block of clean talk.
- (advisory, scope) Commit bd85c5c mixes this task's hunks with 0104's (`04_DESIGN` stdin section, `index.ts` parseAsync) and skills-ecosystem re-exports. All 0105-relevant hunks (`ah_guard.ts` lifecycle coupling, `ah_guard.test.ts` fixtures) map to R/AC items.

Coverage: `ah_guard.ts` 100% functions / 98.42% lines; suite aggregate 99.86% functions / 99.00% lines (gate >=90%). No new branch introduced — the change is inside an existing covered predicate.
### Review
**Review Findings** (review pass 2026-07-24, SECUA all dimensions, 0105-relevant hunks of bd85c5c: `ah_guard.ts` lifecycle coupling + `ah_guard.test.ts` fixtures)

| Priority | Dimension | Location | Finding | Disposition |
| --- | --- | --- | --- | --- |
| P1 | Security | — | None — detection narrowing is coupled (weak keyword ∧ verb still required); pure coupling path proven by `tests/ah_guard.test.ts:232`; untouched STRONG patterns re-read at `ah_guard.ts:321-330` | Clean |
| P2 | Correctness | — | None — predicate logic `WEAK ∧ (COUPLER ∨ LIFECYCLE)` verified by 8-case matrix (0 mismatches) and 81/81 suite | Clean |
| P3 | Efficiency | — | None — one extra regex evaluated only when a weak keyword is present | Clean |
| P4 | Correctness | `ah_guard.ts:340` (`WEAK_KEYWORD_PATTERN`) | Residual false-positive class: local-change talk containing a weak keyword + lifecycle verb still fires (e.g. `The package.json was added.`) | Advisory / Accepted (pre-existing coupling class; cost is a nag, not a block) |
| P4 | Architecture | commit bd85c5c | Mixed-scope commit: 0105 hunks share it with 0104 (`04_DESIGN` stdin section, `index.ts` parseAsync) and skills-ecosystem re-exports | Advisory / Informational (all 0105 hunks map to R/AC) |

No blocker or major SECUA findings. Functional traceability: R1–R3 MET, AC1–AC5 MET with
executable evidence on every behavior-bearing row (see `## Testing`, verdict artifact
`.spur/run/0105-verdict.json` → PASS). The fix applies the 0077 R1 lesson to the verb half and
the residual-proof fixture labelling matches the project's honesty convention for heuristic gates.
### References

<!-- Links to failing logs, related issues, tasks, docs, or external references. -->

### History
- 2026-07-25T05:37:29.708Z todo → wip (system)
- 2026-07-25T05:37:31.270Z wip → testing (system)
- 2026-07-25T06:21:22.337Z testing → done (system)
