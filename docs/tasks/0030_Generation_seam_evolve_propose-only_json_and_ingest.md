---
name: Generation seam evolve propose-only json and ingest
description: Generation seam evolve propose-only json and ingest
status: Done
created_at: 2026-06-17T22:37:16.802Z
updated_at: 2026-06-18T18:09:49.580Z
folder: docs/tasks
type: task
feature-id: F023
priority: high
estimated_hours: 6
dependencies: ["0028"]
tags: ["phase4","generation","evolve","seam","anti-drift"]
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0030. Generation seam evolve propose-only json and ingest

### Background

Replace the generateChanges placeholder (evolve.ts ~line 118, emits '[Improve <dim>]: review and enhance the description…') with a real generation seam. The CLI contributes envelope-out (evolve --propose-only --json) emitting per-dimension generation BRIEFS, and ingest-in (evolve --ingest <proposal.json>) accepting agent-authored ProposedChange[], persisting, and applying on accept through existing machinery. ProposedChange already carries {location,current,proposed,reason} and applyChange already does real text replacement — the ONLY fake part is where 'proposed' comes from (design §2.2). Today evolve runs a real loop around fake content (a TODO note prepended to the description). GOAL ANCHORING (anti-drift): every brief includes the IMMUTABLE goal anchor (original frontmatter + rubric criteria + DON'T rules) emitted VERBATIM; the CLI must not summarise/drop them. CLI never calls a model (invariant #1). Design: design-doc-phase4.md §2.2. Owning feature: F023.


### Requirements

- [x] **R1** — Envelope `{trends,baseline,rubric,briefs[]}` → **MET** | live: 5 briefs, correct shape
- [x] **R2** — Anchor verbatim (frontmatter+criteria+DON'T) → **MET** | live: anchor keys present, frontmatter verbatim
- [x] **R3** — Ingest authored ProposedChange[] → **MET** | ingestProposal evolve.ts:292
- [x] **R4** — Persist + apply on accept; invalid → reject → **MET** | live: real apply; empty proposed → code 1
- [x] **R5** — `[Improve` placeholder removed from output → **MET** | live: false in envelope + ingest
- [x] **R6** — stepApply applies authored proposed text → **MET** | live: AUTHORED-REAL-TEXT written
- [x] **R7** — --json + --ingest in addEvolveOptions → **MET** | helpers.ts:28-29, 5 commands wired
- [x] **R8** — No model API call → **MET** | live grep clean; rewrite enters as JSON only

**Acceptance:** `--propose-only --json | rg "\[Improve"` → no match; briefs[] verbatim anchor; ingest+accept → real text. All verified live.

**Out of scope:** gate decision (F024).


### Q&A



### Design

**Architecture** (design-doc-phase4.md §2.2, invariant #1 — CLI is deterministic, #6 — goal anchor immutable):

The generation seam replaces the fake `generateChanges` placeholder with two CLI I/O modes, mirroring the scorer seam (F022) pattern in `evaluate.ts:emitEnvelope` / `ingestScores`.

**New type: `GenerationBrief`**

```typescript
interface GenerationBrief {
    dimension: string;         // dimension name from QualityReport
    current_text: string;       // current frontmatter.description (or body excerpt)
    target_criterion: string;   // rubric criterion for this dimension (what "good" looks like)
    anchor: {                   // IMMUTABLE goal anchor — emitted verbatim, never summarised
        frontmatter: Record<string, unknown>;  // original frontmatter as parsed
        rubric_criteria: string;                // rubric.criterion for this dimension, verbatim
        negative_constraints: string[];         // DON'T rules from frontmatter (description-bound)
    };
}
```

**Envelope-out** — `evolve <name> --propose-only --json`:
- After stepAnalyze + baseline heuristic report, build briefs for every dimension in the report (not just declining ones — the Author persona decides what to rewrite).
- Load rubric via `loadRubric(type)` (F021) to get criteria per dimension.
- Parse frontmatter via `parseFrontmatter(content)` (existing) to get the verbatim anchor.
- Extract negative constraints: scan frontmatter for `description` DON'T rules (lines starting with "DON'T" or "NEVER" in the description). If none, empty array.
- Emit `{ trends, baseline, rubric, briefs: GenerationBrief[] }` as JSON to stdout. No DB write, no model call.

**Ingest-in** — `evolve <name> --ingest <proposal.json>`:
- Read + parse JSON file: `{ proposal_id?, changes: ProposedChange[] }`.
- Validate each `ProposedChange` has `{ dimension, location, current, proposed, reason }` with non-empty `proposed`.
- Persist via `ProposalDao.insertProposal` (existing) with the authored changes in `proposal_json`.
- On `--accept <id>`: load the ingested proposal from the store by `proposal_id`, apply via existing `stepApply` (which calls `applyChange`), run existing `stepVerify`. The `--ingest` + `--accept` combination enables: ingest first (persist), then accept (apply).
- Standalone `--ingest` without `--accept`: persist and exit (proposal is draft, awaiting review).

**Removing `generateChanges`** (R5):
- `generateChanges` stays exported (existing tests cover it) but is **removed from the default `evolve()` path**.
- `--propose-only` without `--json`: writes a proposal file with an empty changes array (the placeholder `[Improve` text must not appear). The proposal file is a draft awaiting authored input via `--ingest`.
- `--propose-only --json`: emits the envelope (briefs, not changes) to stdout.
- The `[Improve` placeholder string is unreachable on any evolve path.

**`stepApply`** (R6): unchanged — it already applies `change.proposed` text via `applyChange`. The only difference is that `proposed` now comes from authored JSON, not the placeholder. The `frontmatter.description` special-case (prepend instead of replace, line 430-436) stays — it's correct behavior for description improvements.

**`helpers.ts`** (R7): `addEvolveOptions` gains `.option('--json', ...)` and `.option('--ingest <file>', ...)`. All 5 command modules pass `json` and `ingest` through to `evolve()`.

**EvolveOptions** gains `json?: boolean` and `ingest?: string`.

**Invariants honored:**
- CLI makes no model API call (R8) — the rewrite enters only as ingested JSON.
- Goal anchor is immutable (#6) — frontmatter + rubric criteria + negative constraints emitted verbatim.

### Solution

evolve.ts: envelope path emits briefs (work orders), NOT changes. Build GenerationBrief = {dimension,current_text,target_criterion,anchor}; the anchor is emitted verbatim (the same data Skeptic/Judge receive in F024). Ingest path consumes authored ProposedChange[], persists proposal, on accept applies via applyChange (content/edit.ts) + runs stepVerify (the F024 gate plugs in here — F023 wires the path, F024 adds the decision). Remove generateChanges from default path; placeholder string must be unreachable. helpers.ts: ensure --json accepted on evolve + add --ingest <file>.

### Plan

**Step 1 — Add types to `evolve.ts`**
- `GenerationBrief` interface (dimension, current_text, target_criterion, anchor)
- `GenerationAnchor` interface (frontmatter, rubric_criteria, negative_constraints)
- Add `json?: boolean` and `ingest?: string` to `EvolveOptions`

**Step 2 — Implement `emitGenerationEnvelope` in `evolve.ts`**
- Build briefs for every dimension in the baseline report
- Load rubric via `loadRubric(type)` for criteria
- Parse frontmatter for the verbatim anchor
- Extract negative constraints from description (DON'T/NEVER lines)
- Emit `{ trends, baseline, rubric, briefs }` as JSON to stdout
- No DB write, no model call

**Step 3 — Implement `ingestProposal` in `evolve.ts`**
- Read + parse `{ proposal_id?, changes: ProposedChange[] }` from file
- Validate each change has non-empty `proposed`
- Persist via `ProposalDao.insertProposal`
- Return proposal ID + path

**Step 4 — Wire envelope/ingest into `evolve()` main function**
- After stepAnalyze + baseline report:
  - If `opts.json && opts.proposeOnly`: call `emitGenerationEnvelope` and return
  - If `opts.ingest`: call `ingestProposal`, then if `opts.acceptId` apply+verify, else exit
- Remove `generateChanges` from the default `--propose-only` path (stepPropose uses empty changes array)
- The `generateChanges` function stays exported but is not called from `evolve()`

**Step 5 — Update `helpers.ts`**
- Add `--json` and `--ingest <file>` to `addEvolveOptions`

**Step 6 — Update all 5 command modules** (`agent.ts`, `skill.ts`, `command.ts`, `hook.ts`, `magent.ts`)
- Add `json?: boolean` and `ingest?: string` to each `*Evolve` opts type
- Pass `json` and `ingest` through to `evolve()`

**Step 7 — Write tests** (`tests/operations/evolve-ingest.test.ts`)
- Envelope-out: `evolve --propose-only --json` emits briefs with verbatim anchor
- Ingest-in: authored proposal applies real text via applyChange, no placeholder
- Assert `[Improve` never appears on any path
- Fixture: `tests/fixtures/phase4/proposal-good.json`

**Step 8 — Verify**
- `bun run lint` (biome + typecheck)
- `bun run test` (all pass, coverage ≥90%)
- `bun run build` (exit 0)
- Acceptance: `--propose-only --json | rg "\[Improve"` → no match
- `git status -s` — only intentional changes

### Review

## Re-Verification — 2026-06-18 (--force --fix all)

**Status:** 1 P4 (accepted by design) + 1 staging-hygiene fix → verdict PASS
**Scope:** evolve.ts, helpers.ts, 5 command files, evolve.test.ts, +evolve-ingest.test.ts, proposal-good.json
**Mode:** verify (Phase 7 SECU + Phase 8 traceability, --focus all)
**Gate:** lint exit 0 · test 502 pass / 0 fail · build exit 0

### Phase 7 — SECU

| # | Title | Dimension | Location | P | Status |
|---|-------|-----------|----------|---|--------|
| 1 | `0041_*.md` (out-of-scope Backlog task) staged in index | — | git index | hygiene | **FIXED (unstaged)** |
| 2 | `generateChanges` (+`[Improve` string) retained, called only by tests | Maintainability | evolve.ts:174-198 | P4 | Accepted (design choice) |

**Hygiene fix:** An out-of-scope file (`docs/tasks/0041_…anti-hallucination…md`, status=Backlog, feature-id empty, unrelated to F023) was accidentally `git add`'d into the index. Unstaged via `git restore --staged` — it is not part of 0030's commit. Left untracked for its owning task.

**Finding 2 (P4, accepted):** `generateChanges` still defines the `[Improve <dim>]` placeholder, but it is **unreachable from `evolve()`** — the default path (`stepPropose`, evolve.ts:434) uses an empty changes array. The function is referenced only by 8 legacy unit tests. The task design explicitly chose to keep it exported ("stays exported, existing tests cover it"). R5's binding requirement ("placeholder must not appear in **any evolve output**") is satisfied — verified live: `--propose-only --json` and ingest output both have `[Improve = false`. Optional future cleanup: delete `generateChanges` + its tests if the legacy coverage is no longer wanted.

**Clean dimensions:** No secrets, no interpolated SQL, no empty catch, no `any`, no model API call (R8 — live grep clean). `--ingest` reads user-path via `readFileSync` (same trust boundary as any flag); JSON.parse try/caught → code 1. The lone `await import` (evolve.ts:374) is a pre-existing lazy store-load, lint-clean, not introduced here.

### Phase 8 — Requirements Traceability (live re-run)

| Req | Verdict | Evidence |
|-----|---------|----------|
| R1 | MET | live: envelope `{type,content_name,trends,baseline,rubric,briefs}`, 5 briefs each `{dimension,current_text,target_criterion,anchor}` |
| R2 | MET | live: anchor = `{frontmatter,rubric_criteria,negative_constraints}`, frontmatter present verbatim; extractNegativeConstraints evolve.ts:216 |
| R3 | MET | ingestProposal accepts `{proposal_id?,changes:ProposedChange[]}` evolve.ts:292 |
| R4 | MET | live: persist via ProposalDao.insertProposal; accept → stepApply+stepVerify; invalid (empty proposed) → code 1, no apply |
| R5 | MET | live: `[Improve = false` in envelope AND ingest output; generateChanges not called from evolve() |
| R6 | MET | live: authored "AUTHORED-REAL-TEXT" written to file, no placeholder; stepApply evolve.ts:593 |
| R7 | MET | addEvolveOptions helpers.ts:28-29 (--json + --ingest); wired in 5 command files |
| R8 | MET | no model call (live grep); rewrite enters only as ingested JSON |

12 ingest tests + 3 updated evolve tests pass.

**Fix-pass 2026-06-18:** 1 staging-hygiene fixed, 1 P4 accepted by design, 0 failed.


### Phase 7 — SECU (all dimensions)

- **Security:** No secrets/injection/dangerous sinks. `--ingest` path uses `readFileSync` on user-provided path (same trust boundary as any CLI flag); no shell exec, no traversal escalation. JSON.parse wrapped in try/catch → throw with code=1. Validation rejects missing required fields.
- **Efficiency:** Single file read + JSON parse for ingest; envelope builds briefs in O(dimensions) with no DB write. No hot-path or N+1 concern.
- **Correctness:** Envelope-out emits verbatim frontmatter + rubric criteria + negative constraints (goal anchor immutable, invariant #6). Ingest validates each ProposedChange has {dimension, location, proposed, reason} before persisting. `generateChanges` removed from default path — placeholder `[Improve` string unreachable. stepApply applies authored `proposed` text via existing `applyChange`. No `any` types.
- **Usability:** `--json` and `--ingest` compose with existing `--propose-only`/`--accept`/`--reject`/`--from`. All 5 content types (agent/skill/command/hook/magent) wired.

### Phase 8 — Requirements Traceability

| Req | Verdict | Evidence |
|-----|---------|---------|
| R1 | MET | `emitGenerationEnvelope` emits `{ trends, baseline, rubric, briefs: GenerationBrief[] }` where each brief = `{ dimension, current_text, target_criterion, anchor }` (evolve.ts:226-285) |
| R2 | MET | `GenerationAnchor` carries frontmatter (verbatim from parseFrontmatter), rubric_criteria (verbatim from loadRubric), negative_constraints (DON'T/NEVER lines verbatim) — evolve.ts:38-54, 248-262 |
| R3 | MET | `ingestProposal` accepts `{ proposal_id?, changes: ProposedChange[] }` JSON via `--ingest <file>` — evolve.ts:296-370 |
| R4 | MET | Ingested proposal persisted via `ProposalDao.insertProposal` (evolve.ts:338-343); on accept, applied via `stepApply` → `applyChange` (content/edit.ts) + `stepVerify` — evolve.ts:354-363 |
| R5 | MET | `stepPropose` uses empty changes array (evolve.ts:429); `generateChanges` not called from `evolve()`. Verified: `--propose-only --json` output contains no `[Improve`. Test: `evolve-ingest.test.ts` "never emits the [Improve placeholder" |
| R6 | MET | `stepApply` applies `change.proposed` from ingested JSON (evolve.ts:600-630). Test: `evolve.test.ts` "applies authored changes via --ingest + --accept" asserts authored text in file, no `[Improve` |
| R7 | MET | `addEvolveOptions` in helpers.ts:20-31 adds `--json` and `--ingest <file>`. All 5 command modules pass json/ingest through to evolve(). Verified: `skill evolve --help` shows both flags |
| R8 | MET | `evolve.ts` makes no model API call — only `loadRubric`, `parseFrontmatter`, `readFileSync`, `JSON.parse`, `echo`. The rewrite enters only as ingested JSON (invariant #1) |

### Testing
**Timestamp:** 2026-06-18T17:45:00Z


Tests ship **in this task** (design rule: each task owns its tests — no separate pure-test task).

- [x] `tests/operations/evolve-ingest.test.ts`:
  - Envelope-out (`evolve --propose-only --json`) emits briefs carrying the **verbatim** goal anchor (assert the anchor contains the original frontmatter + negative constraints unchanged).
  - Ingest-in: a recorded `proposal.json` applies real `proposed` text via `applyChange`; **no `[Improve` placeholder** appears anywhere in output.
  - Assert `evolve` never emits the old TODO placeholder on any path.
- [x] Fixture-replay only — `proposal.json` hand-authored, never live-generated.
- [x] Coverage for the generation-seam branches contributes to the ≥90% gate.
- [x] No test skipped / `.skip`'d (R12).

**Test suite:** 9 tests in `apps/cli/tests/operations/evolve-ingest.test.ts` + 3 updated tests in `evolve.test.ts`
- 3 envelope-out tests (briefs with verbatim anchor, no DB write, no [Improve placeholder)
- 5 ingest-in tests (persist, apply via --accept, invalid fields, empty changes, unreadable file)
- 1 placeholder removal test (--propose-only writes no [Improve)
- 3 updated evolve.test.ts tests (authored changes via --ingest+--accept, guard for missing current text, propose-only with no placeholder)

**Root gate:**
- `bun run lint` → exit 0 (biome + typecheck clean)
- `bun run test` → 502 pass, 0 fail, 99.46% function coverage, 98.20% line coverage
- `bun run build` → exit 0 (dist/index.js 3.18 MB)

Fixture: `apps/cli/tests/fixtures/phase4/proposal-good.json`. Spy on `process.stdout.write`.


### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References

- Design: [design-doc-phase4.md](../design/design-doc-phase4.md) §2.2
- Feature: [F023](../features/F023-generation-seam.md)
- Depends on: 0028
- Code: apps/cli/src/operations/evolve.ts (generateChanges ~118, stepApply ~377)

