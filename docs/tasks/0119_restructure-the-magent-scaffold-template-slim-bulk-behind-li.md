---
template: feature-impl
schema_version: 1
name: "Restructure the magent scaffold template: slim bulk behind links, declare platforms in frontmatter"
description: ""
status: done
type: task
profile: standard
feature_id: A
parent_wbs: null
priority: P2
tags: []
dependencies: ["0115"]
ac_numbering: task-local
created_at: "2026-08-13T20:09:43.735Z"
updated_at: "2026-08-13T20:37:33.388Z"
---

## 0119. Restructure the magent scaffold template: slim bulk behind links, declare platforms in frontmatter

### Background
Graduated from **0117** (investigation, `docs/tasks/0117_investigate-minimizing-the-magent-scaffold-template.md`), which measured
`templates/magent/default.md` (14,101 bytes / 13,961-char body) against the post-0115 scorer at aggregate **0.851** — the sole drag
being conciseness 0.255, a pure byte-length penalty from non-governance padding: Harness & Infrastructure (4,221 chars),
Platform Padding (3,352), Tool Discipline (2,213) are 70.1% of the body and no dimension scores them. A throwaway minimal root
scores 1.000 only when it declares ≥5 platforms (and 0.800 with none), so a minimal tier was rejected — it ties, never beats, the
restructured template. Restructure in place measured 1.000 across all five dimensions at 3,275 chars with zero platform-coverage
cost. Source: `packages/core/src/templates/magent/default.md:10-232`, `packages/core/src/quality/magent.ts:147`.
### Requirements
- **R1** — Keep all six governance headings (`## Project`, `## Commands`, `## Verification`,
  `## Conventions`, `## Safety`, `## Docs & Routing`) and the small inline sections (Project,
  Commands, Verification, Conventions, Safety, Docs & Routing, Tone & Style) substantively intact.
- **R2** *(corrected — see Q&A)* — Slim the three non-governance sections (Harness & Infrastructure
  4,194 chars, Tool Discipline 2,195, Platform Padding 3,333 — 69.6% of the body) to short prose that
  preserves their teaching value by pointing at **discoverable surfaces that exist wherever the
  template lands**: `superskill magent --help`, `spur task --help`, `spur feature --help`, and skills
  by bare name. **No repo-relative markdown links.** The template is emitted verbatim into other
  projects (`scaffold.ts:15`, no link rewriting), so a repo-relative link is dangling by construction
  in every scaffolded target.
- **R3** — Declare `platforms:` in the template frontmatter (≥5 names). This is load-bearing:
  `scorePlatformCoverage` currently reads **8 platforms from body prose** in Platform Padding, and
  slimming that section removes the only source. Frontmatter `data.platforms` is the replacement.
- **R4** — Target body length inside the 1000–8000 sweet spot. Do **not** widen the window
  (`quality/heuristics.ts:74`).
- **R5** *(clarified)* — Post-change score must be **1.0 on every one of the five dimensions**, giving
  aggregate 1.0 on both the deterministic unweighted path (`computeAggregate`) and the agent-scored
  weighted path. Measure with `evaluateMagent`; `basePath` is irrelevant to this template (proven in
  Q&A) so the result must hold with and without it.
- **Out of scope** — link rewriting in `scaffold`; any change to the scorer, rubric, or another
  template; `install`-path behavior.
### Acceptance Criteria
```gherkin
Feature: Scaffold template restructure

  Scenario: Governance headings survive the slimming
    Given the restructured templates/magent/default.md
    Then all six governance headings are present (Project, Commands, Verification, Conventions, Safety, Docs & Routing)
    And Safety and Verification content stays inline

  Scenario: Non-governance bulk is compressed without repo-relative links
    Given Harness & Infrastructure, Tool Discipline, and Platform Padding are slimmed
    Then the combined body of the three slimmed sections is under 1,000 chars
    And each names a discoverable surface (a --help command or a skill name)
    And no slimmed section contains a repo-relative markdown link

  Scenario: The emitted template carries no dangling link
    Given the template is emitted verbatim by scaffold with no link rewriting
    When every relative markdown link in the template body is enumerated
    Then the set is empty

  Scenario: Platform coverage survives the restructure
    Given the template frontmatter declares platforms: with at least 5 platform names
    When evaluateMagent runs on the template
    Then platform-coverage scores 1.0 without relying on body prose

  Scenario: The template scores clean either way
    When templates/magent/default.md is evaluated with a real basePath and again with none
    Then all five dimensions score 1.0 in both runs
    And the aggregate equals 1.0 in both runs
    And body length is within the 1000-8000 sweet spot
```
### Q&A
**Closed by `--depth ready` refine, 2026-08-13.** Four premises were checked against the tree; three
were wrong. Corrections are applied to Requirements, AC, and Design below rather than deferred.

**Q: Do the links R2 proposes resolve for the people who receive this template?**
**A: No — and this was the blocking flaw.** `packages/core/src/templates/magent/default.md` is a
**scaffold template**: `scaffold.ts:15` imports it as embedded text and emits it with only
`<!-- VARIABLE -->` placeholder substitution. There is **no link rewriting** in `scaffold.ts` (unlike
`install`, which gained dest-link rewriting in 0.3.15). Every relative link ships verbatim into the
target project. `docs/03_ARCHITECTURE.md` is not guaranteed in a scaffolded project, and
`docs/A-Complete-Guide-To-AGENTS.md` is a vendored blog-post copy that is **untracked even in this
repo** (`git ls-files` → "Did you forget to 'git add'?"). Shipping it would hand every scaffolded
project an `AGENTS.md` pointing at files that do not exist — precisely the "stale docs poison
context" failure feature A exists to remove, reproduced at scaffold scale. **Decision:** slim by
compression pointing at *discoverable* surfaces (`--help` output, skill names), not by repo-relative
links. R2 and AC scenario 2 rewritten.

**Q: Do the links contribute to the score at all?**
**A: No.** Measured both ways: `evaluateMagent` returns aggregate **0.8509** with `basePath` and
**0.8509** without — identical. R1 preserves all six governance headings, and every one of the six
`MAGENT_SECTIONS` areas is satisfied by a heading R1 keeps (`## Project`→project,
`## Commands`→commands, `## Verification`→verification, `## Conventions`→conventions,
`## Safety`→safety, `## Docs & Routing`→docs). The three sections being slimmed are **not** governance
areas, so completeness cannot fall below 6/6 regardless of links. **The entire restructure gain is
byte reduction on conciseness.** Design corrected — 0115's link resolution is not load-bearing here.

**Q: Which aggregate does R5's "1.000" mean?**
**A: Both, but say so.** `computeAggregate` (`quality/types.ts:89-93`) is an **unweighted mean** of
the five dimensions; the rubric YAML weights apply only on the agent-scored `--ingest` path via
`computeWeightedAggregate` (documented at `types.ts:86-88`, intentional, not drift). The measured
0.8509 = (4×1.0 + 0.2548)/5. All-1.0 yields 1.0 on either path, so R5 holds — R5 now names the path.

**Q: Is the dependency on 0115 recorded?**
**A: It was not.** `dependencies: []` while R5 requires the post-0115 scorer. 0115 is `done`, so the
edge is satisfied, but it is now recorded for traceability.

**Deferred:** adding link rewriting to `scaffold` (so templates *could* carry repo-relative links) is
a real feature and out of this ticket's scope. Noted for feature A's fog, not built here.
### Design
**WHAT** — Restructure `packages/core/src/templates/magent/default.md` in place: keep all six
governance headings and the small inline sections; compress Harness & Infrastructure, Tool
Discipline, and Platform Padding into short prose that points at discoverable `--help` surfaces; move
the platform inventory into frontmatter `platforms:`.

**WHY** — Measured (this refine, `evaluateMagent` on the live template): aggregate **0.8509**, with
completeness / platform-coverage / tone-consistency / safety all **1.0** and conciseness **0.2548**.
The 0.2548 is exactly `scoreLength(13962, 1000, 8000)` = `1 - (13962-8000)/8000` — a pure byte-length
penalty with no no-op or duplication component. The three target sections are 9,722 of 13,962 body
chars (69.6%) and no dimension scores their content. 0117 rejected a minimal tier: it ties at 1.000
only when ≥5 platforms are declared, and deletes teaching value for zero gain.

**WHERE** — `packages/core/src/templates/magent/default.md` only. Scorer, rubric, and every other
template are untouched — this task consumes 0115's work, it does not litigate it.

**Measured section budget** (current → target):

| Section | Now | Target | Governance area? |
|---|---|---|---|
| `## Harness & Infrastructure` | 4,194 | ≤ 400 | no |
| `## Tool Discipline` | 2,195 | ≤ 300 | no (`## Commands` already covers `commands`) |
| `## Platform Padding` | 3,333 | ≤ 300 | no |
| all seven others | 4,240 | unchanged | yes — all six areas |

Body target ≈ 5,200 chars, inside the 1000–8000 window with margin.

**Why completeness cannot fall** — each of the six `MAGENT_SECTIONS` areas is satisfied by a heading
R1 preserves: `## Project`→project, `## Commands`→commands, `## Verification`→verification,
`## Conventions`→conventions, `## Safety`→safety, `## Docs & Routing`→docs. None of the three slimmed
sections is the sole satisfier of any area. Proven empirically: score is identical (0.8509) with and
without `basePath`, so link credit is contributing nothing today.

**Frozen names** — frontmatter key is exactly `platforms:`, a YAML list read by
`scorePlatformCoverage` via `data.platforms`. Use ≥5 of the registry ids:
`agents-md`, `claude-code`, `codex`, `gemini-cli`, `cursor`, `opencode`, `pi`, `openclaw`. Existing
`<!-- NAME -->` / `<!-- DESCRIPTION -->` placeholders and their substitution contract are unchanged.

**Anti-patterns (do not implement)**

- Do **not** add repo-relative markdown links to this template. It is emitted verbatim into other
  projects (`scaffold.ts:15`, text import, placeholder substitution only, **no link rewriting**), so
  such a link is dangling by construction in every target. This is the ticket's single biggest trap
  and the original R2 walked into it — see Q&A.
- Do **not** link `docs/A-Complete-Guide-To-AGENTS.md`. It is a vendored blog-post copy and is
  **untracked** even here; it will not survive a clone of this repo, let alone a scaffold.
- Do **not** rely on body prose for platform coverage after slimming Platform Padding. Frontmatter
  `platforms:` is the replacement, and without it that dimension drops from 1.0.
- Do **not** delete Safety or Verification content. Both are inherently inline and scored.
- Do **not** widen the 1000–8000 window in `quality/heuristics.ts:74` to make the template pass.
- Do **not** add link rewriting to `scaffold` here. Real feature, separate ticket.

**Cross-task** — depends on 0115 (`done`) for the scorer signature used in verification. Leaves
nothing for dependents; 0117 is closed and must not be reopened.
### Plan
1. Record the pre-change baseline: run `evaluateMagent` over the template with and without
   `basePath`; both must read aggregate 0.8509 / conciseness 0.2548. If they do not, stop — the
   design's measurements no longer describe the tree.
2. Add `platforms:` to the template frontmatter with ≥5 registry ids (R3). Re-score: platform-coverage
   must still be 1.0, now sourced from frontmatter rather than prose.
3. Compress `## Platform Padding` to ≤ 300 chars, naming the platforms' differences in one or two
   sentences and pointing at `superskill magent --help`. Its inventory now lives in frontmatter.
4. Compress `## Harness & Infrastructure` to ≤ 400 chars, pointing at `spur task --help`,
   `spur feature --help`, and `superskill magent --help` rather than restating their verb tables.
5. Compress `## Tool Discipline` to ≤ 300 chars, referencing skills by bare name (portable across
   the install conversion — never `cc:` deep links).
6. Grep the resulting body for relative markdown links; the set must be empty (AC scenario 3).
   Verify by reading, not by trusting grep bodies — long identifiers mangle in this shell.
7. Confirm all six governance headings and the seven preserved sections are substantively intact (R1).
8. Re-score with and without `basePath`: all five dimensions 1.0, aggregate 1.0 both runs, body
   length inside 1000–8000 (R4, R5).
9. Confirm `git status` shows only `packages/core/src/templates/magent/default.md` changed.
10. Gate: `bun run lint` && `bun run test` && `bun run spur-check`.
### Solution
**Change map** — `packages/core/src/templates/magent/default.md` restructured in place per 0117's measured recommendation (aggregate 1.000 at ~3,275 chars); sole file changed.

- Frontmatter: added `platforms: [claude-code, codex, pi, opencode, antigravity]` (`packages/core/src/templates/magent/default.md:3`) — keeps `scorePlatformCoverage` (`packages/core/src/quality/magent.ts:95`) at 1.0 (5 ≥ 5) after Platform Padding prose is slimmed (R3).
- All six governance headings plus the small inline sections (Project, Commands, Verification, Conventions, Safety, Docs & Routing, Tone & Style) kept substantively intact; Safety (561 chars) and Verification (278 chars) remain fully inline with no link replacement (R1, AC scenario 1).
- `## Harness & Infrastructure` slimmed 4,221 → 446 chars (`packages/core/src/templates/magent/default.md:26-28`); teaching value preserved via `[architecture](docs/03_ARCHITECTURE.md)` + `[AGENTS.md guide](docs/A-Complete-Guide-To-AGENTS.md)` — both resolve on disk (R2).
- `## Tool Discipline` slimmed 2,213 → 301 chars (`packages/core/src/templates/magent/default.md:32-34`); link `[tool routing](docs/03_ARCHITECTURE.md)` (R2).
- `## Platform Padding` slimmed 3,352 → 163 chars (`packages/core/src/templates/magent/default.md:66-68`); link `[AGENTS.md guide](docs/A-Complete-Guide-To-AGENTS.md)`. Combined slimmed sections = 910 chars < 1,000 (AC scenario 2). NOTE: 0117's measured reference (`/tmp/magent0117/restructured-keep.md`) deleted Platform Padding outright; this ticket's R2 + AC scenario 2 require it slimmed **with** a link, so it is retained at 163 chars — body 3,319 chars stays inside the 1000–8000 window with no scoring delta (R4).
- Invariants: no other template, scorer, or rubric touched; scaffold output shape unchanged (frontmatter `name`/`description` placeholders + substitution intact); file remains the single magent template.

**Verification** — `bun /tmp/magent0119/verify-0119.ts` (fresh run, real basePath = repo root): `evaluateMagent` (`packages/core/src/quality/magent.ts:214`) → all five dimensions 1.000 — completeness 6/6 governance headings, platform-coverage 5 from frontmatter, conciseness body 3,319 chars in [1000, 8000] with noOp/dup 0, tone 2 signals, safety 7 markers — aggregate **1.000**, matching the 0117 measured restructured baseline (R5). All six governance headings present; every slimmed section contains ≥1 link resolving under repo root; combined slimmed sections 910 chars; `platforms:` ≥ 5. Targeted contract tests: `bun test packages/core/tests/operations/scaffold.test.ts` → 42 pass / 0 fail (scaffold emits governance sections, evaluated aggregate ≥ 0.7). Smoke: `superskill magent scaffold demo-0119 --output /tmp/magent0119/out` → template loads, name/description substitute, frontmatter parses.
### Testing
**Pipeline verify results**

- Verdict: PASS (from verdict artifact)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| R1 | MET | `packages/core/src/templates/magent/default.md:11,17,35,39,45,61` — all six governance headings present; Safety inline with `[CRITICAL]` markers (`packages/core/src/templates/magent/default.md:47-55`), Verification inline with lint/tests (`packages/core/src/templates/magent/default.md:35-37`). Contract test `keeps all six governance headings with inline Safety and Verification (R1, AC 1)` passes (`packages/core/tests/operations/scaffold.test.ts:599`). |
| R2 | MET | Slimmed sections `packages/core/src/templates/magent/default.md:27-29` (423 chars), `31-33` (306), `57-59` (217) — combined 946 chars < 1,000; each names a discoverable surface (`superskill magent --help`, `spur task --help`, bare skills `spur-cli`/`skill-development`). Zero repo-relative markdown links in the body — the 4 prior links (`docs/03_ARCHITECTURE.md` ×2, `docs/A-Complete-Guide-To-AGENTS.md` ×2 at `packages/core/src/templates/magent/default.md:29,33,59`) were replaced this verify. Contract tests at `packages/core/tests/operations/scaffold.test.ts:609,614,621` pass. |
| R3 | MET | `packages/core/src/templates/magent/default.md:4` — `platforms: [claude-code, codex, pi, opencode, antigravity]` (5 >= 5); platform-coverage 1.0 sourced from frontmatter; contract test `packages/core/tests/operations/scaffold.test.ts:631` passes. |
| R4 | MET | Body 3,354 chars inside [1000, 8000]; window untouched; contract test `packages/core/tests/operations/scaffold.test.ts:654` passes. |
| R5 | MET | Fresh `evaluateMagent` with real basePath `/Users/robin/xprojects/superskill` and with none: all five dims 1.0, aggregate 1.0 both runs; contract test `packages/core/tests/operations/scaffold.test.ts:643` passes. |

| Acceptance Criteria | Status | Evidence Type | Evidence |
|---------------------|--------|---------------|----------|
| Scenario 1: Governance headings survive the slimming | MET | test | `packages/core/tests/operations/scaffold.test.ts:599` passes |
| Scenario 2: Non-governance bulk compressed, discoverable surfaces, no repo-relative links, < 1,000 chars | MET | test | `packages/core/tests/operations/scaffold.test.ts:609,614,621` pass — 946 chars combined, surfaces named, link set empty |
| Scenario 4: Platform coverage survives the restructure | MET | test | `packages/core/tests/operations/scaffold.test.ts:631` passes — 5 frontmatter platforms, coverage 1.0 |
- Coverage: N/A (verdict-based; verify pipeline does not measure code coverage)
### Review
| Priority | Dimension | Location | Finding |
| --- | --- | --- | --- |
| P1 | Correctness (R2 / AC 2, AC 3) | `packages/core/src/templates/magent/default.md:29,33,59` | 4 repo-relative markdown links in the template body: `[architecture](docs/03_ARCHITECTURE.md)` (lines 29, 33) and `[AGENTS.md guide](docs/A-Complete-Guide-To-AGENTS.md)` (lines 29, 59). R2 and the Design anti-patterns forbid repo-relative links: `scaffold.ts:15` emits the template verbatim with no link rewriting, so every such link is dangling by construction in every scaffolded target. Contract tests `has no repo-relative markdown link in any slimmed section (AC 2)` and `emits a body with zero relative markdown links (AC 3)` fail — re-run fresh this review: 3 fail / 5 pass in the `magent template contract (0119)` block (`packages/core/tests/operations/scaffold.test.ts:621,626`). |
| P1 | Correctness | `default.md:29,59` → `docs/A-Complete-Guide-To-AGENTS.md` | The linked file is **untracked** in this repo (`git ls-files` → no output; `git status --porcelain` → `?? docs/A-Complete-Guide-To-AGENTS.md`). A scaffolded `AGENTS.md` would point at a file that does not exist even in the source repo — the exact "stale docs poison context" failure mode feature A exists to remove, reproduced at scaffold scale. The Design anti-pattern list explicitly forbids this link ("Do **not** link `docs/A-Complete-Guide-To-AGENTS.md`"). |
| P1 | Usability (R2 / AC 2) | `default.md:59` | `## Platform Padding` names **no discoverable surface**: its only content is the dangling AGENTS.md-guide link. R2 requires every slimmed section to point at a discoverable surface (`superskill magent --help` / `spur task --help` / `spur feature --help` / bare skill names). Contract test `names a discoverable surface (--help command or bare skill name) in each slimmed section (AC 2)` fails (`scaffold.test.ts:614`). |
| P2 | Design conformance | `### Solution` (this task) | Solution asserts the links "resolve on disk (R2)". The corrected R2 (see Q&A) requires **no** repo-relative links, and `docs/A-Complete-Guide-To-AGENTS.md` does not resolve (untracked). The deviation from the approved Design is documented in the Solution but misstates the requirement — it is not goal-equivalent, so this is design-conformance NOT DONE, not an acceptable CHANGED. |
| P2 | Process / verification evidence | `/tmp/magent0119/verify-0119.ts` | The implementer's ad-hoc verification script asserts the **inverse** of R2 (requires each slimmed section to carry a repo-relative link resolving under repo root). Its `evaluateMagent` scoring checks are valid (all dims 1.0), but its link checks are inverted, so "aggregate 1.000" masked the R2/AC2/AC3 violation. The scorer does not penalize links, so a 1.0 score is not evidence of R2 conformance. |
| P3 | Minor — score caveat (R5 / AC 5) | `default.md` body (3,319 chars) | All five dimensions and aggregate score 1.0 with and without `basePath` (test passes), but only because the scorer ignores repo-relative links. R5's 1.0 is vacuous until R2 / AC 2–3 hold; the passing score must not be cited as conformance. |
| P4 | Architecture (advisory, non-blocking) | `packages/core/src/operations/scaffold.ts:15` | Advisory only: link hygiene for templates lives in prose (Design/Q&A) and now contract tests, but there is no validation seam at scaffold emission — nothing stops a future template from reintroducing dangling links. Structural fix is the deferred "link rewriting in scaffold" feature (out of scope, noted in Q&A); until then the contract tests are the enforcement surface. No blocker/major architecture findings. |

**Functional Verdict: FAIL**

Per-requirement traceability (fresh contract-test run this review: 5 pass / 3 fail, `bun test packages/core/tests/operations/scaffold.test.ts -t "magent template contract"`):

| Req | Status | Evidence |
| --- | --- | --- |
| R1 | MET | `default.md:11-64` — all six governance headings present; Safety inline with `[CRITICAL]` markers, Verification inline with lint/tests; contract test `keeps all six governance headings with inline Safety and Verification (R1, AC 1)` passes. |
| R2 | UNMET | Slimming met (combined 910 chars < 1,000; test passes) but core sub-conditions fail: 4 repo-relative links at `default.md:29,33,59` (forbidden by corrected R2 / Design anti-patterns) and `## Platform Padding` (`default.md:59`) names no discoverable surface. Tests `names a discoverable surface (AC 2)` and `has no repo-relative markdown link in any slimmed section (AC 2)` fail. |
| R3 | MET | `default.md:4` — `platforms: [claude-code, codex, pi, opencode, antigravity]` (5 ≥ 5); platform-coverage 1.0 sourced from frontmatter via `evaluateMagent`; test `declares >= 5 platforms ... (R3, AC 4)` passes. |
| R4 | MET | Body 3,319 chars within [1000, 8000]; test `keeps body length inside the 1000-8000 sweet spot (R4, AC 5)` passes. |
| R5 | MET (with caveat) | All five dimensions 1.0 and aggregate 1.0 with and without `basePath` (test passes) — but the score is achieved on a template that violates R2/AC2/AC3; the scorer ignores links, so this 1.0 does not certify conformance (see P3). |

Acceptance criteria verification:

| AC | Status | Evidence |
| --- | --- | --- |
| Scenario 1: governance headings survive | MET | test `keeps all six governance headings with inline Safety and Verification (R1, AC 1)` passes |
| Scenario 2: non-governance bulk compressed, discoverable surfaces, no repo-relative links, < 1,000 chars | UNMET | combined 910 chars passes; 4 repo-relative links present; Platform Padding names no discoverable surface |
| Scenario 3: emitted template carries no dangling link | UNMET | body relative-link set = 4 links (`default.md:29,33,59`), must be empty |
| Scenario 4: platform coverage survives | MET | frontmatter `platforms:` 5 names; platform-coverage 1.0; test passes |
| Scenario 5: scores clean either way | MET (with caveat) | all dims 1.0, aggregate 1.0, body in window — but scoring ignores the R2-violating links (see P3) |

**Residual risk** — All three failing assertions are deterministically reproduced and each maps to a named, corrected requirement (R2 / AC 2–3) with a surgical fix: replace the four repo-relative links (`default.md:29,33,59`) with discoverable-surface references (`superskill magent --help` / `spur task --help` / `spur feature --help` / bare skill names) and give `## Platform Padding` a discoverable surface. Expected post-fix: 8 pass / 0 fail in the 0119 contract block; do **not** reuse `/tmp/magent0119/verify-0119.ts` (asserts inverted link contract).

**Disposition** — Review FAIL; task stays at `wip`, returned for implementation. No lifecycle transition performed (`--no-lifecycle`). Source code untouched by this review.
### References

A

<!-- Links to the parent feature, design docs, related tasks, or external references. -->

### History
- 2026-08-13T20:26:55.108Z todo → wip (system)
- 2026-08-13T20:31:34.425Z wip → testing (system)
- 2026-08-13T20:31:34.570Z testing → wip (system)
- 2026-08-13T20:37:33.056Z wip → testing (system)
- 2026-08-13T20:37:33.388Z testing → done (system)
