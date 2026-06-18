---
name: cc personas wiring and hide validate
description: cc personas wiring and hide validate
status: Done
created_at: 2026-06-17T22:37:43.652Z
updated_at: 2026-06-18T22:21:30.764Z
folder: docs/tasks
type: task
feature-id: F025
priority: high
estimated_hours: 5
dependencies: ["0029","0030","0031"]
tags: ["phase4","plugin","personas","spur","validate-hide"]
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0032. cc personas wiring and hide validate

### Background

Wire the cc:cc-<type> skill workflows (re-authored thin in Phase 3) to DRIVE the Phase 4 seams via four Spur agent personas — Scorer, Author, Skeptic, Judge — and remove the deterministic-only framing from SKILL.md. Also implement P4-D3: hide validate behind evaluate/refine/evolve — delete hook-validate.md, ensure no *-validate slash command exists, confirm operations gate on validate internally. F022-F024 added the CLI seams but the CLI does no scoring/generation itself (P4-D2); the cc skill is where the non-determinism is orchestrated. Without this wiring the seams have no driver. P4-D3 resolves the Phase 3 §3.3 validate-surface gap by HIDING it, not by adding four commands. Design: design-doc-phase4.md §1, §4, §5.1, D3. Owning feature: F025.


### Requirements

- [x] **R1** — Two-call seam pattern in all 5 SKILL.md → **MET** | evaluate --rubric --json + evolve --propose-only --json/--ingest (5 each)
- [x] **R2** — Four personas with exact I/O contracts → **MET** | Scorer/Author/Skeptic/Judge in 5 expert-*.md
- [x] **R3** — Deterministic-only framing removed → **MET** | seam is primary; heuristic = fallback
- [x] **R4** — Goal-anchor verbatim discipline → **MET** | 10 files; "do not summarize or compact"
- [x] **R5** — hook-validate.md deleted, no *-validate command → **MET** | git D; ls commands = 16
- [x] **R6** — validate is internal-only gate → **MET** | evolve.ts:314, refine.ts:248
- [x] **R7** — Command surface = 16 → **MET** | ls plugins/cc/commands/ = 16
- [x] **R8** — No invented flags/verbs → **MET** | only F022/F023 seam flags + existing verbs

**Acceptance:** all 6 grep commands pass. Phase 4 closing gate: 589 pass / 0 fail, 99.56%/98.32% coverage, zero model calls.

**Out of scope:** CLI seam/gate implementation (F022–F024).


### Q&A



### Design

- **Scope:** Plugin-side wiring only — rewrite 5 `cc:cc-<type>` SKILL.md evaluate/evolve workflows to the two-call seam pattern; define 4 personas (Scorer/Author/Skeptic/Judge) in the 5 `expert-*.md` agents; delete `hook-validate.md`. No CLI code changes (seams from F022–F024).
- **Key decision:** Personas defined in expert agents (not separate Spur prompt files) — keeps the persona knowledge co-located with the type specialist that invokes it. Each expert agent gains a `## Personas` section documenting the four roles and their I/O contracts.
- **Two-call seam pattern (R1):**
  - **Evaluate:** `superskill <type> evaluate <name> --rubric <file> --json` → Scorer persona scores offline → `superskill <type> evaluate <name> --ingest <scores.json> --save`
  - **Evolve:** `superskill <type> evolve <name> --propose-only --json` → Author persona rewrites from briefs → Skeptic persona refutes → Judge persona selects (if multiple candidates) → `superskill <type> evolve <name> --ingest <proposal.json> --accept <id>`
- **Goal-anchor discipline (R4):** SKILL.md workflow text instructs the agent to pass original frontmatter + negative constraints **verbatim** to Skeptic/Judge; no compaction. The CLI gate (F024) enforces via `anchor_hash` — the skill must not strip it pre-call.
- **Boundaries affected:** `plugins/cc/skills/cc-{agents,commands,hooks,magents,skills}/SKILL.md`, `plugins/cc/agents/expert-{agent,command,hook,magent,skill}.md`, `plugins/cc/commands/hook-validate.md` (deleted).
- **Risks:** SKILL.md restructuring must stay additive (extend workflow sections, don't restructure per Solution). Persona definitions must match the exact I/O contracts the CLI seams expect (Scorer → `{ rubric_version, dimensions }`, Author → `ProposedChange[]` + `anchor_hash`, Skeptic → `{ ok, violations[] }`, Judge → pairwise selector).


### Solution

Per cc:cc-<type>: rewrite evaluate->'<type> evaluate --rubric --json' (Scorer) then '--ingest --save'; evolve->'<type> evolve --propose-only --json' (Author from briefs -> Skeptic refutes -> Judge selects if multiple) then '--ingest --accept' (CLI gate F024 decides). Define personas in expert-*.md or referenced Spur prompts. Remove heuristic-only framing. Persona prompts pass original instructions + negative constraints verbatim (CLI gate enforces via anchor_hash but skill must not strip pre-call). Delete hook-validate.md. Match Phase 3 thin SKILL.md structure — extend workflow sections, don't restructure.


### Plan

- [x] Delete `plugins/cc/commands/hook-validate.md` (R5)
- [x] Verify command surface = 16 (R7)
- [x] Rewrite evaluate workflow in all 5 SKILL.md files to two-call seam pattern (R1, R3)
- [x] Rewrite evolve workflow in all 5 SKILL.md files to two-call seam pattern (R1, R3)
- [x] Add `## Personas` section to all 5 expert agents defining Scorer/Author/Skeptic/Judge with I/O contracts (R2)
- [x] Add goal-anchor verbatim discipline text to SKILL.md + expert agents (R4)
- [x] Confirm `validate` is internal-only — no `*-validate` slash command remains (R5, R6)
- [x] Write plugin-side wiring test assertions (acceptance commands from task)
- [x] Run Phase 4 closing gate: `bun run test`, coverage ≥90%, zero model API calls, `bun run lint && bun run build`


### Review

## Re-Verification — 2026-06-18 (--force --fix all)

**Verdict: PASS** — confirms prior verdict. 0 findings. Phase 4 closing gate holds.

**Scope:** 5 SKILL.md + 5 expert-*.md (plugin wiring), hook-validate.md deleted, +2 test files.
**Mode:** verify (Phase 7 SECU + Phase 8 traceability, --focus all)
**Gate:** lint exit 0 · test 589 pass / 0 fail (99.56% func / 98.32% line) · build exit 0

### Phase 7 — SECU

Plugin-side markdown + tests only — no code execution, no secrets, no network. Hiding `validate` reduces user-facing surface. The 2 test files run real CLI paths in-memory; no child_process/shell/secrets. **No findings.**

### Phase 8 — Requirements Traceability (live re-run)

| Req | Verdict | Evidence (this run) |
|-----|---------|---------------------|
| R1 | MET | All 5 SKILL.md: `evaluate --rubric --json` (5 files) + `evolve --propose-only --json`/`--ingest` (5 files) |
| R2 | MET | All 5 expert-*.md carry exact persona I/O contracts: Scorer→`{rubric_version,dimensions{name{score,note}}}`, Author→`ProposedChange[]`+`anchor_hash`, Skeptic→`{ok,violations[]}`, Judge→pairwise selector |
| R3 | MET | SKILL.md: two-call seam is "the primary workflow"; heuristic path demoted to explicit "fallback" |
| R4 | MET | 10 files (5 skills + 5 agents) carry verbatim/no-compaction anchor discipline; explicit "do not summarize or compact" |
| R5 | MET | `hook-validate.md` deleted (git: `D`); no `*-validate` slash command remains |
| R6 | MET | `validate()` internal gate: evolve.ts:314 (F024 deterministic gate), refine.ts:248 |
| R7 | MET | `ls plugins/cc/commands/ \| wc -l` → 16 (17 − hook-validate) |
| R8 | MET | Only F022/F023 seam flags referenced (--rubric/--ingest/--json/--propose-only/--accept/--reject/--save/--margin); only existing verbs (evaluate/evolve/refine/scaffold/validate) — none invented |

### Phase 4 Closing Gate (owned by this task)

- Full suite: **589 pass / 0 fail** across 44 files; none skipped/.skip'd.
- Coverage: 99.56% func / 98.32% line (≥90% threshold).
- Invariant #1: zero model/network calls in `operations/` + `quality/` (grep-clean).
- plugin-wiring.test.ts (72) + phase4-closing-gate.test.ts (22) pass.

**Phase 4 (F021–F025) is COMPLETE.** No fixes applied (--fix all): verdict PASS, 0 findings.


### Testing

Tests ship **in this task** (design rule: each task owns its tests — no separate pure-test task). Last run: 2026-06-18T18:45:00Z.

- [x] Plugin-side wiring assertions (the §Acceptance commands in this task): `hook-validate.md` deleted; command surface = 16; SKILL.md drives the two-call seam; personas defined; goal anchor passed verbatim. — `apps/cli/tests/plugin-wiring.test.ts` (72 tests, 0 fail)
- [x] **Phase-4 closing gate** (this is the last Phase-4 impl task, so it owns the whole-phase checks):
  - `bun run test` — all Phase 4 tests (rubric / evaluate-ingest / evolve-ingest / gate, each owned by tasks 0028–0031) pass; **none** skipped / `.skip`'d / commented out. — 589 pass, 0 fail across 44 files
  - Aggregate coverage **line ≥ 90% / function ≥ 90%** (`bunfig.toml`). — 99.56% funcs, 98.32% lines
  - **CLI makes zero model API calls** (invariant #1): assert no model/provider/network call is reachable from the tested paths — `rg -i "anthropic|openai|fetch\(|http" apps/cli/src/operations/ apps/cli/src/quality/` → none. — `apps/cli/tests/phase4-closing-gate.test.ts` (22 tests, 0 fail); rg confirms zero hits
- [x] `bun run lint && bun run build` green; `git status` shows only intentional changes. — lint clean, typecheck clean, build OK (3.18 MB bundle)

**Test files added:**
- `apps/cli/tests/plugin-wiring.test.ts` — 72 tests asserting R1/R2/R4/R5/R6/R7/R8
- `apps/cli/tests/phase4-closing-gate.test.ts` — 22 tests asserting invariant #1 (zero model API calls)

**Full suite:** `bun test --coverage` → 589 pass, 0 fail, 1456 expect() calls, 99.56% funcs / 98.32% lines aggregate.

This task carries the cross-feature gate the dissolved pure-test feature (former F026) used to hold; per-feature tests live in 0028–0031.


### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References

- Design: [design-doc-phase4.md](../design/design-doc-phase4.md) §1, §4, §5.1, P4-D3
- Feature: [F025](../features/F025-cc-personas-hide-validate.md)
- Depends on: 0029, 0030, 0031
- Owns: Phase 4 closing gate (full suite + >=90% coverage + zero model calls)
- Carries the gate formerly held by canceled task 0033

