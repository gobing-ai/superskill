---
template: standard
schema_version: 1
name: "Supersede ADR-015 copied-on-install wording and extend ADR-022 scope"
description: ""
status: done
type: task
profile: standard
feature_id: A
parent_wbs: null
priority: P2
tags: []
dependencies: ["0089", "0090", "0091", "0094"]
created_at: "2026-07-17T06:14:03.790Z"
updated_at: "2026-07-17T22:51:02.264Z"
---

## 0095. Supersede ADR-015 copied-on-install wording and extend ADR-022 scope

### Background
**Type:** `wayfinder:task` (docs / ADR — no product code)

**Sharp question.** Supersede ADR-015’s ambiguous **“copied on install”** wording and amend/extend **ADR-022** so install-staging + dual invocation (path standard, optional deep-import registries) are authoritative; fix derived drift in `docs/04_DESIGN.md`, `docs/help/bundled_plugin.md`, and `AGENTS.md` blessed-exception note.

**Why this ticket exists.** After feature **A** redesign:
- ADR-015 says plugin scripts are “copied on install, deduped” but never defined how; 0087-era guide said scripts are **never** copied (absorption only). Both cannot stay.
- ADR-022 blesses only `hook-run.ts` → `plugins/cc/scripts/**`; `script-run.ts` is already a second consumer — written scope is stale.
- `04_DESIGN.md` and `bundled_plugin.md` still echo “copied on install” without staging/`script path`/`script run` dual contract.

**Depends on (frontmatter).** Entrypoint contract, staging, path helper, and hook-path design Solutions must be **done** so ADR text matches shipped decisions (including any R6-B narrowing from hook design). L4 readiness warnings expected until then. Do not author final ADR while those are still provisional.

**Constitution rules (binding).**
- `docs/00_ADR.md` is authoritative on decisions; add a **new dated entry** that supersedes conflicting ADR-015/022 clauses — do not silently edit history without supersession trail.
- Same-commit sync: derived docs (`04`, help, AGENTS) must not contradict the new ADR after this task.
- Full plugin-scripts author guide rewrite is primarily the guide task; this task owns **decision authority** + high-level surface docs drift, and may leave detailed authoring steps to the guide if already aligned.

**In scope.**
- New ADR entry (or two: delivery model + deep-import consumer scope) dated, Status Accepted, Why/Detail, supersedes pointers.
- Update ADR-015 and/or ADR-022 Status lines if project convention marks them Superseded in part (or leave Accepted with “amended by ADR-0XX” per local style).
- Sync: `docs/04_DESIGN.md` plugin-scripts section; `docs/help/bundled_plugin.md` “Plugin-level scripts”; `AGENTS.md` ADR-022 exception sentence.
- Grep-based drift check across `docs/` + `AGENTS.md` for leftover false claims.
- CHANGELOG docs note; feature A decisions gist.

**Out of scope.**
- Implementing install/path/hook code.
- Rewriting entire author guide (guide task) beyond a one-line consistency fix if guide already shipped.
- Migrating anti-hallucination skill prose (migrate task).
- New workspace package for guard engines (still rejected unless hook/path design reopened packaging).

**Done when.** ADR chain is unambiguous for dual contract; 04/bundled_plugin/AGENTS match; greps clean of contradictory “never staged” vs “copied on install” without mechanism; feature A gist line written.
### Requirements
- [x] R1. **New ADR entry (delivery model).** Add a dated ADR that states the dual contract:
  - Plugin-level source layout remains `plugins/<plugin>/scripts/<feature>/` (prose-only skills — keep ADR-015 layout intent).
  - **Delivery:** install stages plugin-level scripts for the rulesync/hermes class to a stable agents scripts root; native marketplace installs keep full plugin trees (cite inventory/staging Solutions).
  - **Invocation standard:** `script path` + portable entrypoint contract for skill docs.
  - **Invocation optional:** compile-time registry `script run` / `hook run` for absorbed pure engines (CLI release coupling intentional).
  - Supersedes ADR-015 phrase “copied on install” as underspecified; replaces absorption-only “never stage” interim docs.
- [x] R2. **ADR-022 amendment.** New dated entry or amendment expands blessed deep-import consumers to the **script dispatcher family** under `apps/cli/src/commands/` that deep-imports `plugins/cc/scripts/**` (at minimum `hook-run.ts` and `script-run.ts`), still rejecting `packages/*` → `plugins/*` and unbounded third parties without a new ADR. Update constraint language that said “hook dispatcher only.”
- [x] R3. **AGENTS.md sync.** Conventions bullet for the blessed exception matches R2 (not hook-only).
- [x] R4. **04_DESIGN.md sync.** Plugin-level scripts surface section describes staging destinations + dual invocation; remove bare “copied on install, deduped” without mechanism.
- [x] R5. **bundled_plugin.md sync.** Same factual alignment as R4 (short table OK).
- [x] R6. **Drift grep.** After edits, no remaining claim in `docs/00_ADR.md` (current decision text), `04_DESIGN.md`, `bundled_plugin.md`, or `AGENTS.md` that:
  - scripts are only ever absorbed and never staged, **or**
  - scripts are “copied on install” with no path/mechanism, **or**
  - ADR-022 is hook-run-only while `script-run.ts` deep-imports remain.
  (Historical task Solutions may still describe past states — out of scope.)
- [x] R7. **Hook decision reflection.** ADR text matches hook-path design Solution (keep hook run vs path unify) — do not invent a third story.
- [x] R8. **CHANGELOG** `[Unreleased]` docs entry listing ADR + surface doc sync.
- [x] R9. **Non-goals.** No TypeScript changes; no skill-doc migration; guide deep rewrite only if still contradictory after guide task (prefer pointer to guide).
### Acceptance Criteria
**AC1 — ADR supersession trail.** `docs/00_ADR.md` contains a new dated entry (or entries) with clear supersedes/amends language for ADR-015 delivery wording and ADR-022 consumer scope.

**AC2 — Dual contract in ADR.** Entry states layout + install staging + path standard + optional registry absorption in decision-level language (not a full tutorial).

**AC3 — ADR-022 not hook-only.** Decision text no longer forbids `script-run.ts` as a second compile-time consumer of `plugins/cc/scripts/**`.

**AC4 — Derived docs aligned.** `04_DESIGN.md` and `bundled_plugin.md` match the new ADR on scripts delivery/invocation.

**AC5 — AGENTS.md aligned.** Blessed-exception sentence matches expanded consumer set.

**AC6 — Grep gate.** Targeted greps on the files in R6 show no contradictory “never stage” vs bare “copied on install” in those authoritative/surface docs.

**AC7 — No code diff.** `git diff` for this task is docs/AGENTS/CHANGELOG only (plus task Solution).
### Q&A
**Auto-refine synthesis**

| Topic | Decision | Rationale |
|-------|----------|-----------|
| Structural check | PASS + L4 prereqs → synthesize | Placeholders only |
| Authority | ADR first, then derived | Constitution content axis |
| ADR-015 | Supersede delivery wording only | Layout/migration intent still valid |
| ADR-022 | Expand consumers to script dispatcher family | script-run already deep-imports |
| Guide | Prefer guide task for author tutorial | This task owns decisions + surface drift |
| Code | None | Docs-only |
### Design
**Approach (constitution-compliant docs).**

1. **Wait for Solutions** from entrypoint, staging, path helper, hook design — paste facts, do not re-decide.
2. **Prefer one new ADR** titled e.g. “Plugin scripts dual contract: install staging + path invocation; optional CLI absorption” that:
   - Supersedes ADR-015 delivery sentence only (keep migration/layout rationale).
   - Amends ADR-022 consumer scope.
   Optionally two ADRs if the project prefers atomic decisions — either is fine if cross-linked.
3. **Do not rewrite ADR-015/022 bodies in place** without a supersession header; append new sections at end of `00_ADR.md` per existing style (Status/Date/Decision/Why/Detail).
4. **Minimal surface edits** in 04/bundled_plugin: replace the one-liner with mechanism + link to ADR + link to author guide.
5. **AGENTS.md:** one-sentence exception update.
6. **Guide:** if guide task already rewrote absorption-only thesis, only fix residual ADR refs; if guide not done, ADR still ships first (authority) and guide must not contradict once both done.

**Rejected.**
- Editing only 04 without ADR (constitution: ADR wins; would recreate drift).
- Promoting engines to workspace packages in this task.
- Silent deletion of historical ADR text.
### Plan
1. [ ] Confirm prereqs done; read Solutions + feature A Decisions so far.
2. [ ] Claim `wip`.
3. [ ] Draft and append new ADR entry(ies) to `docs/00_ADR.md`.
4. [ ] Sync AGENTS.md, 04_DESIGN.md, bundled_plugin.md; CHANGELOG.
5. [ ] Grep drift gate; fill Solution; feature A gist; done.
### Solution
**Decision authority landed.** Two new ADR entries appended to `docs/00_ADR.md`; three derived docs synced to match; drift greps clean for current decision text + surface docs. No code touched (R9/AC7).

> Grounding note: this is a `wayfinder:task` (decision artifact). "Implementation" = authoring decisions into `## Solution`, not writing product code. All file:line citations below are to the current working tree.

**ADR-023 — Plugin scripts dual contract (delivery model).** `docs/00_ADR.md:303-309` (append, Status Accepted). Supersedes ADR-015's delivery sentence ("copied on install, deduped") as underspecified — explicitly names the staging destination (`~/.agents/scripts/<plugin>/<feature>/` or `<cwd>/.agents/scripts/<plugin>/<feature>/` for rulesync/hermes targets) and the dual invocation standard (Entrypoint Contract v1 via `$(superskill script path <plugin> <rel>)` for skill docs; optional compile-time registry `script run` / `hook run` for absorbed pure engines). Layout intent (prose-only skills, single-source engines in `plugins/<plugin>/scripts/<feature>/`) carried forward from ADR-015 unchanged. The 0087-era interim "never stage, absorb only" thesis is explicitly superseded.

**ADR-024 — ADR-022 deep-import scope amended (consumer scope).** `docs/00_ADR.md:313-317` (append, Status Accepted). Amends ADR-022's blessed deep-import exception from "hook dispatcher only" to the **script dispatcher family** under `apps/cli/src/commands/` — currently `hook-run.ts` + `script-run.ts`. Both deep-import `plugins/cc/scripts/anti-hallucination/**` and are bundled into the CLI binary by `bun build --compile`. Future dispatchers joining the family are in-scope without a new ADR provided they: (1) live in `apps/cli/src/commands/`, (2) use the registry pattern, (3) are bundled by the compile step. `packages/*` → `plugins/*` and unbounded third consumers remain rejected (ADR-022 unchanged on that axis).

**Derived docs synced.**
- `AGENTS.md:135` — Conventions bullet updated: blessed exception now reads "script dispatcher family (`hook-run.ts`, `script-run.ts`)" with ADR-022 amended by ADR-024.
- `docs/04_DESIGN.md:51` — Plugin-scripts section replaced bare "copied on install, deduped" with staging mechanism: native marketplace installs keep full trees; rulesync/hermes targets stage to `~/.agents/scripts/<plugin>/`; invocation per Entrypoint Contract v1.
- `docs/help/bundled_plugin.md:40` — Verified already aligned to staging destinations + dual contract (no edit needed; R5/AC4 satisfied by inspection).

**CHANGELOG entry.** `CHANGELOG.md:39` — `## [Unreleased]` → `### Documentation` bullet summarizing ADR-023 + ADR-024 + surface doc sync, citing `#0095`.

**Drift grep (R6 / AC6).** Surface docs (`04_DESIGN.md`, `bundled_plugin.md`, `AGENTS.md`): zero hits for `copied on install` or `never (stage|cop|absorb)`. `docs/00_ADR.md` residual hits are confined to historical ADR-015 (line 203) and ADR-022 (lines 287, 291) bodies, which preserve superseded wording per the append-only ADR discipline (`docs/99_PROJECT_CONSTITUTION.md` §content axis); current decision text (ADR-023/024) explicitly revises both. Gate passes.

**Hook-path reflection (R7).** ADR-023 carries forward the R6-B narrowing from task 0094: "unify" = unify *delivery* (install staging), not *runtime invocation form*. Hooks stay CLI-mediated (`superskill hook run <plugin> <id>`); staged paths are for non-hook callers only. No third story introduced.

**Non-goals honored (R9).** No TypeScript changes; no skill-doc prose migration; author guide not deep-rewritten (already aligned post-0092). Code facts cited, not changed: `apps/cli/src/commands/script-run.ts`, `apps/cli/src/commands/hook-run.ts`, `packages/core/src/.../mapper.ts`.
### Testing
**Verify date:** 2026-07-17 (`--force --focus all --fix all`)

**Coverage:** N/A (documentation / ADR-only; no runtime code path).

**Commands run (this pass):**

| Command | Outcome |
|---|---|
| `rg -n "copied on install" docs/04_DESIGN.md docs/help/bundled_plugin.md AGENTS.md` | **0 hits** (AC6 surface) |
| ADR-023 / ADR-024 present in `docs/00_ADR.md` | L295–319 (AC1–AC3) |
| `AGENTS.md:135` script dispatcher family + ADR-024 | MET (AC5) |
| `docs/04_DESIGN.md:51-56` dual contract + staging | MET (AC4) |
| `docs/help/bundled_plugin.md:40` staging + dual contract | MET (AC4) |
| `CHANGELOG.md:39` #0095 Documentation entry | MET (R8) |
| `bun run lint` | clean |
| `spur task check 0095 --strict-core --json` | pass |
| Commit `a51ba6d` file list | docs/AGENTS/CHANGELOG/task only (AC7) |

**Residual fixes (`--fix all`):**
1. Feature A **Decisions so far** was missing 0095 gist — added.
2. Feature A open item on staged entrypoint runtimes marked resolved by 0089 + ADR-023.

**Per-Requirement Traceability**

| Req | Status | Evidence |
|-----|--------|----------|
| R1 Delivery ADR | MET | `docs/00_ADR.md:295-305` ADR-023 dual contract |
| R2 ADR-022 amendment | MET | `docs/00_ADR.md:309-319` ADR-024 script dispatcher family |
| R3 AGENTS.md | MET | `AGENTS.md:135` |
| R4 04_DESIGN | MET | `docs/04_DESIGN.md:51-56` |
| R5 bundled_plugin | MET | `docs/help/bundled_plugin.md:40` |
| R6 Drift grep | MET | surface greps 0; historical ADR-015/022 bodies by design |
| R7 Hook decision | MET | ADR-023 Detail cites 0094 R6-B; hooks stay hook run |
| R8 CHANGELOG | MET | `CHANGELOG.md:39` #0095 |
| R9 Non-goals | MET | no TS in a51ba6d |

**Acceptance Criteria Verification**

| AC | Status | Evidence Type | Evidence |
|----|--------|---------------|----------|
| AC1 ADR supersession trail | MET | static-ref | ADR-023 supersedes ADR-015 wording; ADR-024 amends ADR-022 |
| AC2 Dual contract in ADR | MET | static-ref | ADR-023 Decision: layout + staging + path + optional registry |
| AC3 Not hook-only | MET | static-ref | ADR-024 + script-run.ts:4 deep-import |
| AC4 Derived docs | MET | static-ref | 04_DESIGN + bundled_plugin |
| AC5 AGENTS aligned | MET | static-ref | AGENTS.md:135 |
| AC6 Grep gate | MET | command | surface greps empty this pass |
| AC7 No code | MET | command | a51ba6d docs/AGENTS/CHANGELOG/task only |

**Design conformance:** DONE. **SECUA:** docs-only; residual feature-A gist gap fixed.
### Review
Self-review against AC1-AC7. Docs/decision task; findings table below uses bare severity values per FSM guard contract.

| Severity | Finding | Status |
|----------|---------|--------|
| P1 | ADR-023 staging destination must match shipped code (mapper writes to `~/.agents/scripts/<plugin>/<rel>`) | DONE — verified against task 0090 Solution; staging root cited in ADR-023 §Decision |
| P1 | ADR-024 must not silently revoke ADR-022's rejection of `packages/*` → `plugins/*` | DONE — ADR-024 §Decision explicitly carries forward: "ADR-022 unchanged on that axis" |
| P2 | Surface docs must not contradict ADR after this commit (R6/AC6) | DONE — grep gate: 0 hits in `04_DESIGN.md`/`bundled_plugin.md`/`AGENTS.md` |
| P2 | CHANGELOG entry must exist under `[Unreleased]` (R8) | DONE — `CHANGELOG.md:39` Documentation bullet citing `#0095` |
| P3 | ADR-015/022 historical bodies must remain intact (append-only discipline) | DONE — line 203 (ADR-015) and lines 287/291 (ADR-022) untouched; supersession trail in ADR-023/024 |
| P3 | Hook-path decision (0094 R6-B) must be reflected, not contradicted | DONE — ADR-023 carries forward "unify delivery, not invocation form"; hooks stay CLI-mediated |
| P4 | AGENTS.md exception sentence should cross-reference amending ADR | DONE — line 135 reads "...amended by ADR-024" |

**Residual risk:** None blocking. ADR-015/022 historical bodies retain superseded wording by design (constitution content axis); future grep-based audits must scope to "current decision text" not "any ADR mention" — flagged in CHANGELOG entry via "Grep drift gate clean for authoritative/surface docs" qualifier.

**Disposition:** PASS — all ACs satisfied; drift gate clean; no code touched (AC7 honored). Ready for `testing → done`.
### References
- ADR: `docs/00_ADR.md` (ADR-015, ADR-022; new entry TBD)
- Process: `docs/99_PROJECT_CONSTITUTION.md` (ADR wins; same-commit sync)
- Surfaces: `docs/04_DESIGN.md`, `docs/help/bundled_plugin.md`, `AGENTS.md`
- Author guide: `docs/help/how_to_organize_scripts_for_plugin_development.md` (guide rewrite task)
- Feature map: `docs/features/A_portable-plugin-scripts-via-install-time-staging.md`
- Prerequisites: entrypoint contract, staging, path helper, hook-path design
- Code facts (cite, don’t change): `script-run.ts`, `hook-run.ts`, `mapper.ts`
### History
- 2026-07-17T22:29:29.070Z todo → wip (system)
- 2026-07-17T22:33:10.474Z wip → testing (system)
- 2026-07-17T22:33:46.402Z testing → done (system)
