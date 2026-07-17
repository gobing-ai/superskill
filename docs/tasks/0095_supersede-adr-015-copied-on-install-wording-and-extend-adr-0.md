---
template: standard
schema_version: 1
name: "Supersede ADR-015 copied-on-install wording and extend ADR-022 scope"
description: ""
status: todo
type: task
profile: standard
feature_id: A
parent_wbs: null
priority: P2
tags: []
dependencies: ["0089", "0090", "0091", "0094"]
created_at: "2026-07-17T06:14:03.790Z"
updated_at: "2026-07-17T06:57:41.605Z"
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
- [ ] R1. **New ADR entry (delivery model).** Add a dated ADR that states the dual contract:
  - Plugin-level source layout remains `plugins/<plugin>/scripts/<feature>/` (prose-only skills — keep ADR-015 layout intent).
  - **Delivery:** install stages plugin-level scripts for the rulesync/hermes class to a stable agents scripts root; native marketplace installs keep full plugin trees (cite inventory/staging Solutions).
  - **Invocation standard:** `script path` + portable entrypoint contract for skill docs.
  - **Invocation optional:** compile-time registry `script run` / `hook run` for absorbed pure engines (CLI release coupling intentional).
  - Supersedes ADR-015 phrase “copied on install” as underspecified; replaces absorption-only “never stage” interim docs.
- [ ] R2. **ADR-022 amendment.** New dated entry or amendment expands blessed deep-import consumers to the **script dispatcher family** under `apps/cli/src/commands/` that deep-imports `plugins/cc/scripts/**` (at minimum `hook-run.ts` and `script-run.ts`), still rejecting `packages/*` → `plugins/*` and unbounded third parties without a new ADR. Update constraint language that said “hook dispatcher only.”
- [ ] R3. **AGENTS.md sync.** Conventions bullet for the blessed exception matches R2 (not hook-only).
- [ ] R4. **04_DESIGN.md sync.** Plugin-level scripts surface section describes staging destinations + dual invocation; remove bare “copied on install, deduped” without mechanism.
- [ ] R5. **bundled_plugin.md sync.** Same factual alignment as R4 (short table OK).
- [ ] R6. **Drift grep.** After edits, no remaining claim in `docs/00_ADR.md` (current decision text), `04_DESIGN.md`, `bundled_plugin.md`, or `AGENTS.md` that:
  - scripts are only ever absorbed and never staged, **or**
  - scripts are “copied on install” with no path/mechanism, **or**
  - ADR-022 is hook-run-only while `script-run.ts` deep-imports remain.
  (Historical task Solutions may still describe past states — out of scope.)
- [ ] R7. **Hook decision reflection.** ADR text matches hook-path design Solution (keep hook run vs path unify) — do not invent a third story.
- [ ] R8. **CHANGELOG** `[Unreleased]` docs entry listing ADR + surface doc sync.
- [ ] R9. **Non-goals.** No TypeScript changes; no skill-doc migration; guide deep rewrite only if still contradictory after guide task (prefer pointer to guide).
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

<!-- Filled during implementation: file:line change map and concise rationale. -->

### Testing

<!-- Filled during verification: commands run, outcomes, coverage claim or N/A. -->

### Review

<!-- Filled during review: P1-P4 findings, residual risk, and final disposition. -->

### References
- ADR: `docs/00_ADR.md` (ADR-015, ADR-022; new entry TBD)
- Process: `docs/99_PROJECT_CONSTITUTION.md` (ADR wins; same-commit sync)
- Surfaces: `docs/04_DESIGN.md`, `docs/help/bundled_plugin.md`, `AGENTS.md`
- Author guide: `docs/help/how_to_organize_scripts_for_plugin_development.md` (guide rewrite task)
- Feature map: `docs/features/A_portable-plugin-scripts-via-install-time-staging.md`
- Prerequisites: entrypoint contract, staging, path helper, hook-path design
- Code facts (cite, don’t change): `script-run.ts`, `hook-run.ts`, `mapper.ts`
### History
