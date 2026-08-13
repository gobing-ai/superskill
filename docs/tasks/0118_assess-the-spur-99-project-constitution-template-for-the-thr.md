---
template: feature-impl
schema_version: 1
name: "Assess the spur 99_PROJECT_CONSTITUTION template for the three AGENTS.md gaps"
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
created_at: "2026-08-13T18:34:31.675Z"
updated_at: "2026-08-13T20:04:16.733Z"
---

## 0118. Assess the spur 99_PROJECT_CONSTITUTION template for the three AGENTS.md gaps

### Background
`/Users/robin/xprojects/spur-new/config/templates/docs/99_PROJECT_CONSTITUTION.md` (460 lines) seeds
every new spur project, so a gap there propagates — and §6.8 rule 3 obliges propagating improvements
back to siblings once made.

The template is **already ahead of the guide** on its main axes: §6.0 rule 2 ("a fact lives once —
link or point") states progressive disclosure more precisely than the guide does, §6.0's preamble
already names token economy as a design goal, and §6.7 rule 1 ("factual blocks are regenerated from
code, never edited from memory") is a *stronger* answer than the guide's advice for command surfaces.
The template does not need the guide's methodology. It needs three specific things it lacks.

**Gap 1 — no instruction-budget ceiling. CONFIRMED.** Zero hits for any numeric bound. §6.0 asserts
token economy but sets no measurable ceiling, leaving "keep it lean" aspirational rather than
auditable. The guide cites ~150–200 instructions for frontier thinking models (sourced to Humanlayer;
treat as MEDIUM confidence — a secondary citation, not measured here).

**Gap 2 — no path-fragility rule. CONFIRMED, but narrower than the charting draft claimed.** The
template *does* have staleness machinery: §5 line 184 (unsynchronized success as the root cause),
§6.4 line 297 (stale module lists), §6.6 line 337 (status rows rotting). What is absent is the rule
that **file paths rot fastest and a stale path sends an agent confidently to the wrong place**.
§6.1 rule 8 (line 256) actually routes implementation file paths *into* `03`/`04` — a routing rule, not a
durability warning. The guide's "describe capabilities, not structure; domain concepts outlive file
paths" has no counterpart anywhere in the 460 lines.

**Gap 3 — §4.4 assumes a single root `AGENTS.md`. CONFIRMED.** Zero hits for monorepo, nested,
subdirectory, or package-level. Nothing states that subdirectory `AGENTS.md` files merge with the
root, or that each level stays scoped to its own concerns. Every monorepo spur initializes hits
this — `superskill` itself has `apps/`, `packages/`, `plugins/`.

**Premise correction from `--depth ready` verification (2026-08-13).** The charting draft asked
which siblings carry a copy, implying a small set. There are **13**: eight project copies
(`findegg`, `knowledge-kit`, `knowledge-kit-old`, `spur-new`, `superskill`, `surfdash`, `ts-base`,
`ts-libs`) and five template copies — including a **second** one inside spur-new at
`apps/cli/config/templates/`, plus installed `.spur/templates/` copies in three projects. They have
already diverged badly: line counts run 65 (`findegg`) to 575 (`spur-new`). "One constitution with N
copies" is aspirational, not the current state, and any propagation plan must account for that.

Ticket type: `wayfinder:research`. Map: feature A. Independent of 0115-0117.
### Requirements
- **R1** — Each of the three gaps above is re-checked against the template at implementation time and
  recorded as confirmed-with-section-reference or struck-with-the-section-that-covers-it. All three
  were confirmed on 2026-08-13; re-verify rather than trust this record.
- **R2** — For each confirmed gap, draft the **minimum** insertion, sited in the section that already
  owns the topic: Gap 1 and Gap 2 → §6.7 (`AGENTS.md` edit principles); Gap 3 → §4.4 (AGENTS.md
  synchronization). Additive only — §6.8 rule 2 puts structural change behind operator request.
- **R3** — Honor §1: no project facts in `99`. An instruction ceiling is a writing rule, not a project
  fact; confirm each draft passes that test. Where the budget number rests on a secondary citation,
  state the confidence inline rather than asserting it flatly.
- **R4** — Report the propagation surface as measured: **13 copies**, the two-template-copies-in-spur-new
  finding, and the 65-to-575-line divergence. Recommend a propagation order (seed template first,
  then which projects) and flag which copies have diverged too far for a clean apply.
- **R5** — Cross-repo. Produce the proposed diff for operator approval; write **nothing** to
  `spur-new` or to any sibling project in this ticket.
- **Out of scope** — reconciling the 13 diverged copies. That is a separate effort; this ticket
  measures the divergence and recommends, it does not repair.
### Acceptance Criteria
```gherkin
Feature: Constitution template gap assessment

  Scenario: Each gap is confirmed or struck with evidence
    Given the three candidate gaps identified at charting
    When the 99 template is read in full
    Then each gap is recorded as confirmed with a section reference, or struck with the section that already covers it

  Scenario: Insertions are minimal and correctly sited
    Given a confirmed gap
    When a closing insertion is drafted
    Then it is additive, sited in the section that already owns the topic, and carries no project facts

  Scenario: Propagation is assessed before any write
    When the assessment completes
    Then the set of sibling projects carrying a 99 copy is enumerated
    And a propagation recommendation is recorded

  Scenario: The cross-repo file is untouched
    When the ticket completes
    Then spur-new/config/templates/docs/99_PROJECT_CONSTITUTION.md is unmodified
    And a proposed diff awaits operator approval
```
### Q&A

<!-- CLOSED decisions from refinement: what was chosen and why, what was deferred and on what
     condition. Not a parking lot for open questions — an unanswered question here means the task
     is not ready to hand off. Keep empty if none. -->

### Design
**WHAT** — Three minimal, additive insertions into the spur `99` seed template, delivered as a
proposed diff for approval, plus a propagation assessment across the 13 copies.

**WHY** — The template governs how every spur project's docs are maintained. The guide's genuinely
new material reduces to three rules the template lacks; everything else it offers, §6.0 already
states better. Absorbing three rules is cheap and durable; rewriting is neither.

**WHERE (read-only in this ticket)** — `spur-new/config/templates/docs/99_PROJECT_CONSTITUTION.md`
§4.4 (line 143) and §6.7 (line 342). Assessment covers all 13 copies enumerated in Background.

**Siting rule** — each insertion goes in the section that already owns its topic, as a numbered item
in that section's existing list. No new sections, no renumbering of existing items (§6.0 rule 6:
headings and IDs are grep targets and cross-reference anchors).

- Gap 1 (instruction budget) → new item in §6.7, after the existing "keep it lean" rule it makes
  measurable.
- Gap 2 (path fragility) → new item in §6.7, adjacent to rule 1, which it complements: rule 1 says
  regenerate factual blocks from code; this says prefer not to write file structure at all.
- Gap 3 (monorepo nesting) → new bullet in §4.4, whose subject is already AGENTS.md scope.

**Anti-patterns (do not implement)**

- Do **not** restate progressive disclosure. §6.0 rule 2 already owns it; a second statement is a
  `duplication` finding against the very rule being restated.
- Do **not** import the guide's AGENTS.md-refactor prompt. Out of scope at feature A: §7 (drift
  control) and `sp:doc-evolve` own that ground.
- Do **not** adopt the symlink advice. Operator ruled it out at charting.
- Do **not** write to any of the 13 copies, including this project's own
  `superskill/docs/99_PROJECT_CONSTITUTION.md`. Diff for approval only.
- Do **not** propose reconciling the divergence. Measure it, report it, stop.
- Do **not** state the ~150–200 figure as measured fact. It is a secondary citation (Humanlayer via
  the guide) — mark it MEDIUM confidence inline, per AGENTS.md § Confidence & claims.

**Cross-task** — fully independent. Assumes nothing, leaves nothing.
### Plan
1. Re-read §4.4, §6.0, and §6.7 of the seed template; re-confirm or strike each of the three gaps
   (R1). A struck gap is deleted from the proposal, not worked around.
2. Draft the §6.7 instruction-budget item, with the confidence marker on the cited figure (R3).
3. Draft the §6.7 path-fragility item: prefer capabilities and domain concepts over file structure;
   domain vocabulary outlives paths. Keep it to the template's declarative register (§6.0 rule 1).
4. Draft the §4.4 monorepo bullet: subdirectory `AGENTS.md` files merge with the root; each level
   stays scoped to its own concerns; do not overload any level.
5. Check each draft against §1 (no project facts) and §6.0 rule 2 (not a restatement of §6.0 or of
   each other). Discard any draft that fails either.
6. Re-enumerate the copies at implementation time (`find /Users/robin/xprojects -name
   99_PROJECT_CONSTITUTION.md -not -path '*/node_modules/*'`) — the 13-copy count is dated
   2026-08-13. Record line counts to re-measure divergence.
7. Recommend a propagation order and name the copies too diverged for a clean apply (`findegg` at 65
   lines is the obvious outlier). Flag the duplicate seed at `spur-new/apps/cli/config/templates/`
   as its own question — two seeds mean the next `spur init` may not get the improvement.
8. Emit the proposed diff into `## Solution` for operator approval. Verify `git status` in this repo
   is clean of doc changes and that nothing under `spur-new` was written (R5).
### Solution
Target file read in full at implementation time: `spur-new/config/templates/docs/99_PROJECT_CONSTITUTION.md` (460 lines, seed, `version 1.3.0`). Insertion sites: `spur-new/config/templates/docs/99_PROJECT_CONSTITUTION.md:143-150` (§4.4) and `spur-new/config/templates/docs/99_PROJECT_CONSTITUTION.md:342-351` (§6.7). All three gaps re-checked against the live text; all three **confirmed** with section references.

**R1 — gap re-verification**

| Gap | Verdict | Evidence (seed line refs) |
| --- | --- | --- |
| 1. No instruction-budget ceiling | **CONFIRMED** | §6.0 preamble (line 202-204) names token economy as a design goal but sets no measurable bound; §6.7 rule 2 (line 347-348) says "keep it lean … first 30 seconds" — aspirational, not auditable. Zero numeric ceilings anywhere in the 460 lines. |
| 2. No path-fragility rule | **CONFIRMED**, narrow as Background predicted | Staleness machinery exists (§5 line 184, §6.4 rule 4 line 297, §6.6 rule 4 line 337) but none of it covers paths. §6.7 rule 1 (line 344-346) regenerates the workspace-layout block from code — that answers *how to refresh paths*, not *prefer not to write file structure at all*. Nothing in the 460 lines says capabilities/domain concepts outlive file paths. |
| 3. §4.4 assumes a single root `AGENTS.md` | **CONFIRMED** | §4.4 (line 143-150) and §9 step 8 (lines 457-458) reference only a root `AGENTS.md`. Zero hits for monorepo / nested / subdirectory / package-level in the full read. |

**R2/R3 — draft insertions (additive, sited in owning sections)**

Siting per Design: no new sections, no renumbering of existing items (§6.0 rule 6) — decimal sub-items follow the template's own insertion pattern (§6.3 rule 5: "Insert sub-phases (`1.5`) rather than renumbering"). All three drafts pass §1 (writing rules, no project facts) and §6.0 rule 2 (none restates progressive disclosure or each other; each adds a claim the template lacks).

**Gap 3 → §4.4** (new bullet after line 150, `AGENTS.md` synchronization):

```diff
@@ -150,2 +150,5 @@
   contradiction, the numbered doc wins — fix `AGENTS.md`.
+- In monorepos, subdirectory `AGENTS.md` files (e.g. `apps/`, `packages/`) merge with the root:
+  an agent reads root first, then the subdirectory file for that package's scope. Each level stays
+  scoped to its own concerns — never overload any level with another level's facts.
```

**Gap 2 → §6.7 item 1.1** (insert after rule 1, line 346 — complements rule 1: it says regenerate factual blocks from code; this says prefer not to write file structure at all):

```diff
@@ -346,2 +346,5 @@
   (e.g. list the CLI's registered nouns/verbs) before writing the block.
+1.1 File structure is the most fragile surface: paths rot fastest, and a stale path sends an agent
+    confidently to the wrong place. Prefer capabilities and domain concepts — domain vocabulary
+    outlives file paths — and regenerate concrete paths from code (rule 1).
```

**Gap 1 → §6.7 item 2.1** (insert after rule 2, line 348 — makes the "keep it lean" rule measurable):

```diff
@@ -348,2 +348,5 @@
   what an agent needs in the first 30 seconds of a session.
+2.1 Cap the instruction budget: stay under ~150–200 instructions (~150–200 lines) — beyond that,
+    agents stop loading the file whole (MEDIUM confidence: secondary citation, not measured here).
+    When over budget, cut, or move detail to the owning doc and link (rule 2).
```

R3 note: the ~150–200 figure is a secondary citation (Humanlayer via the guide, per Background); the MEDIUM confidence marker is inline in the draft, and the draft asserts the figure as a target, not as measured fact.

**R4 — propagation surface (re-measured at implementation time)**

`find /Users/robin/xprojects -name 99_PROJECT_CONSTITUTION.md -not -path '*/node_modules/*'` → **13 copies**, divergence **65–575 lines** (matches Background; both the count and the range re-verified live):

| Lines | Copy | Lineage |
| --- | --- | --- |
| 575 | `spur-new/docs/99_PROJECT_CONSTITUTION.md` | live — **outgrown its own seed** (seed is 460); drift signal |
| 522 | `knowledge-kit-old/docs/…` | live — older fork, manual merge |
| 512 | `surfdash/docs/…` | live — older fork, manual merge |
| 461 | `ts-libs/docs/…` | live — near seed, clean apply expected |
| 461 | `knowledge-kit/docs/…` | live — near seed, clean apply expected |
| 460 | `spur-new/config/templates/docs/…` | **seed** (this ticket's target) |
| 460 | `spur-new/apps/cli/config/templates/docs/…` | **second seed** — duplicate-template finding confirmed |
| 458 | `knowledge-kit/.spur/templates/docs/…` | installed template — near seed, clean apply expected |
| 454 | `superskill/docs/…` | live — near seed, clean apply expected |
| 441 | `ts-base/docs/…` | live — near seed, clean apply expected |
| 65 | `findegg/docs/…` | skeleton — re-seed, not diff |
| 65 | `findegg/.spur/templates/docs/…` | installed template — skeleton, re-seed |
| 65 | `knowledge-kit-old/.spur/templates/docs/…` | installed template — skeleton, re-seed |

**Recommended propagation order** (for the operator-approved diff):

1. **Resolve the duplicate-seed question first**: confirm which of `spur-new/config/templates/…` vs `spur-new/apps/cli/config/templates/…` `spur init` actually reads — if both are live, apply the diff to both in one change, or the next `spur init` may not get the improvement. This is the flag from Background, now confirmed present.
2. Seed template(s) in `spur-new` (config/templates, then apps/cli/config/templates if live).
3. Near-lineage installed template + live copies (clean apply expected): `knowledge-kit/.spur/templates` (458), `ts-base` (441), `superskill` (454), `knowledge-kit` (461), `ts-libs` (461).
4. Manual merge / re-seed, **not** clean apply: the three 65-line skeletons (`findegg/docs`, `findegg/.spur/templates`, `knowledge-kit-old/.spur/templates` — regenerate from the updated seed), and the longer forks `knowledge-kit-old/docs` (522), `surfdash` (512), `spur-new/docs` (575 — also flag: a live copy outgrowing its seed is itself drift under §1/§6.8 rule 3).

Reconciling the 13 copies is out of scope (Background): measured and recommended here, repaired separately.

**R5 — cross-repo boundary**

Proposed diff above **awaits operator approval**. Nothing written to `spur-new` or any sibling project — only this task file's `## Solution` was updated, via `spur task update` (CLI-gated corpus write). `git status` verified: no changes to any numbered doc, `99`, or `AGENTS.md` in this repo; the task file edit is the sanctioned deliverable channel. `spur-new/config/templates/docs/99_PROJECT_CONSTITUTION.md` unmodified.
### Testing
**Pipeline verify results**

- Verdict: PASS (from verdict artifact)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| R1 | MET | Live re-verification of the 460-line seed `spur-new/config/templates/docs/99_PROJECT_CONSTITUTION.md` this run: `grep -inE 'instruction |
| R2 | MET | Three additive hunks in `## Solution` sited in owning sections; apply contexts verified verbatim this run: §4.4 tail line 150, §6.7 rule 1 tail line 346, §6.7 rule 2 tail line 348; decimal sub-item precedent §6.3 rule 5 verified at line 285; no renumbering, no new sections. |
| R3 | MET | Drafts are writing rules, not project facts — pass §1 (verified §1 lines 15-18 "zero project-specific facts"); draft 2.1 carries "(MEDIUM confidence: secondary citation, not measured here)" inline; ~150–200 presented as target, not measured fact; no draft restates §6.0 rule 2 (line 210) or each other. |
| R4 | MET | `find /Users/robin/xprojects -name 99_PROJECT_CONSTITUTION.md -not -path '*/node_modules/*'` re-run this turn → 13 copies, 65–575 lines, all 13 line counts match the Solution table exactly; duplicate seed at `spur-new/apps/cli/config/templates/docs/…` (460) confirmed present; propagation order + over-diverged flags recorded. |
| R5 | MET | `git status --porcelain` this turn: superskill — no changes to `docs/99_PROJECT_CONSTITUTION.md` or `AGENTS.md`; spur-new — only `docs/tasks4/0532…` modified; `git diff --stat` on both seed templates → empty. Proposed diff awaits operator approval in `## Solution`; nothing written to any of the 13 copies. |

| Acceptance Criteria | Status | Evidence Type | Evidence |
|---------------------|--------|---------------|----------|
| Scenario: Each gap is confirmed or struck with evidence | MET | command | R1 grep evidence — all three gaps re-confirmed this run with section references read at cited lines |
| Scenario: Propagation is assessed before any write | MET | command | R4: 13 copies enumerated with lineage + recommendation recorded before any write |
| Scenario: The cross-repo file is untouched | MET | command | Both seed templates clean in spur-new; superskill `99` untouched; diff-for-approval in `## Solution` |
- Coverage: N/A (verdict-based; verify pipeline does not measure code coverage)
### Review
| Priority | Dimension | Location | Finding |
| --- | --- | --- | --- |
| P4 | Correctness | Solution R1 "§9 step 8 (line 446)" | Line anchor off by 11: step 8 ("Create root `AGENTS.md`") is at lines 457-458; line 446 is step 4. Section reference (step 8) correct; self-reported in Testing; no verdict impact. |
| P4 | Correctness | Background "§6.2 line 256" | Charting-era mis-citation: the file-paths-into-`03`/`04` routing rule is §6.1 rule 8 (line 256); the §6.2 heading is at line 260. Not repeated in the Solution's R1 table; cosmetic. |

No P1-P3 findings. All three gap verdicts, the insertion sites, and the 13-copy enumeration re-verified against live files this review.

**Functional traceability (R1-R5)**

| Req | Status | Evidence |
| --- | --- | --- |
| R1 | MET | Live re-verification of the 460-line seed: `grep -iE 'instruction|budget|ceiling|~?150|~?200'` → zero hits (Gap 1); path-rot/domain-concept/outlive → zero hits (Gap 2); monorepo/nested/subdirector/package-level → zero hits (Gap 3). Section refs verified verbatim: §6.0 preamble 202-204, §6.7 rules 1-2 at 344-348, §4.4 at 143-150, staleness anchors §5:184 / §6.4:297 / §6.6:337. |
| R2 | MET | Three additive hunks sited in owning sections; sequential apply simulation (context resolved against current state) confirms each lands immediately after its unique context: §4.4 tail line 150, §6.7 rule 1 tail line 346, §6.7 rule 2 tail line 348. Decimal sub-item precedent §6.3 rule 5 (line 285) honored; no renumbering, no new sections. |
| R3 | MET | Drafts are writing rules, not project facts — pass §1 ("byte-identical across projects" contract verified). ~150-200 figure carries "(MEDIUM confidence: secondary citation, not measured here)" inline in draft 2.1; none of the drafts restates §6.0 rule 2 (line 210) or each other. |
| R4 | MET | `find /Users/robin/xprojects -name 99_PROJECT_CONSTITUTION.md -not -path '*/node_modules/*'` → 13 copies, 65-575 lines; all 13 line counts match the Solution table exactly; duplicate seed at `spur-new/apps/cli/config/templates/docs/…` (460) confirmed present. Propagation order and over-diverged flags (65-line skeletons; 512/522/575 forks) present. |
| R5 | MET | `git status --porcelain`: superskill — no `docs/99_PROJECT_CONSTITUTION.md` or `AGENTS.md` changes (only sanctioned task/feature corpus + sibling feature-A work); spur-new — only `docs/tasks4/0532…` modified; `git diff --stat` on both seed templates → empty. |

**Acceptance criteria**

| AC | Status | Evidence |
| --- | --- | --- |
| Each gap confirmed or struck with evidence | MET | All three confirmed with section references; re-verified live this review |
| Insertions minimal and correctly sited | MET | 9 added lines total, apply-verified at unique contexts; additive only, no project facts |
| Propagation assessed before any write | MET | R4: 13 copies enumerated with lineage; propagation recommendation recorded |
| Cross-repo file untouched | MET | Both seed templates clean in spur-new; superskill `99` untouched; proposed diff awaits operator approval in ## Solution |

**SECUA quality**

- Security / Efficiency: N/A — documentation-only deliverable, no code paths, no secrets.
- Correctness: all substantive anchors verified accurate this review; two P4 citation cosmetics (table above), both self-reported in Testing and confirmed on re-read.
- Usability: drafts match the template's declarative register (§6.0 rule 1, verified line 205); draft 2.1 correctly presents the citation as a target with confidence marker, not measured fact.
- Architecture: siting honors §6.3 rule 5; drafts complement their owning rules (1.1 extends rule 1's regenerate-from-code with prefer-not-to-write-paths; 2.1 makes rule 2's keep-it-lean measurable).

**Architecture depth (advisory only)**

- C1 advisory — wrong-seam candidate: duplicate seed `spur-new/apps/cli/config/templates/docs/…` (460) vs `config/templates/docs/…` (460): if `spur init` reads the apps/cli copy, an approved diff to the primary seed won't reach new projects. Correctly flagged as R4 step 1; resolution deferred per out-of-scope. Revisit when the operator approves the diff.
- C2 advisory — drift signal: `spur-new/docs` (575) has outgrown its own seed (460); flagged in R4. Confirms the 13-copy divergence is live drift, not measurement noise.
- No shallow-module / tight-coupling / weak-locality / poor-test-surface candidates — not applicable to a read-only docs assessment.

**Verdict: PASS** — functional traceability 5/5 MET, 4/4 AC MET, no P1-P3 findings; two P4 citation cosmetics (self-reported, no verdict impact); architecture advisory-only.
### References

A

<!-- Links to the parent feature, design docs, related tasks, or external references. -->

### History
- 2026-08-13T19:52:08.817Z todo → wip (system)
- 2026-08-13T20:04:16.465Z wip → testing (system)
- 2026-08-13T20:04:16.733Z testing → done (system)
