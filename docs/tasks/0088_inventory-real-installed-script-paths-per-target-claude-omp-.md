---
template: standard
schema_version: 1
name: "Inventory real installed script paths per target (Claude/OMP/Grok/rulesync)"
description: ""
status: todo
type: task
profile: standard
feature_id: A
parent_wbs: null
priority: P2
tags: []
dependencies: []
created_at: "2026-07-17T06:13:54.251Z"
updated_at: "2026-07-17T06:20:03.581Z"
---

## 0088. Inventory real installed script paths per target (Claude/OMP/Grok/rulesync)

### Background
**Type:** `wayfinder:research`

**Sharp question.** What are the real on-disk locations of `plugins/*/scripts` after `superskill install` for Claude, OMP, Grok, and each rulesync/hermes target — and does any target already receive **plugin-level** scripts today?

**Why this ticket exists.** Feature **A** redesigns portable plugin scripts around install-time staging (not CLI absorption alone). Downstream tickets (**0090** staging, **0091** `script path`, **0094** hook paths) cannot design destinations until this inventory is evidence-backed. Mapper today stages only skill-level support subdirs (`packages/core/src/mapper.ts:153-158`); plugin-level `scripts/` is intentionally unmapped for rulesync — confirm that and record the native-plugin exceptions.

**Scope of inventory (in).**
- Source of truth in this repo: `mapPluginToRulesync`, `executeInstall` dispatch loop, target path helpers, `docs/help/cmd_install.md`.
- Empirical check where CLIs exist: post-install paths for plugin `cc` (or documented cache/registry paths when dry-run cannot place files).
- Distinction: **plugin-level** `plugins/<p>/scripts/**` vs **skill-level** `skills/<name>/scripts/` (mapper already copies the latter).
- Targets from `packages/core/src/targets.ts`: `claude`, `codex`, `pi`, `omp`, `opencode`, `antigravity-cli`, `antigravity-ide`, `hermes`, `grok` (and note `openclaw` if documented as shared-root consumer).

**Out of scope.**
- Implementing staging or `script path` (0090/0091).
- Choosing the portable runner contract (0089).
- Rewriting skill docs or ADRs.
- Third-party plugins outside this monorepo (fog item on feature A — note only).

**Done when.** Solution section holds a per-target table with: install mechanism, skills root (if any), whether plugin-level `scripts/` is present after install, concrete path pattern(s) with file:line or observed path evidence; map feature **A** `## Decisions so far` gets one gist line.
### Requirements
- [ ] R1. **Code-path inventory table.** Produce a table covering every entry in `TARGETS` (`packages/core/src/targets.ts`) plus openclaw if install documents it, with columns: `target | install path class (native plugin / rulesync / surrogate copy) | skills or plugin root pattern | plugin-level scripts present? (yes/no/unknown) | evidence (file:line or observed path)`.
- [ ] R2. **Mapper staging fact.** Explicitly confirm whether `mapPluginToRulesync` stages `pluginRoot/scripts` (plugin-level) vs only skill-level support subdirs — cite `packages/core/src/mapper.ts` line range; list which skill support subdirs are copied today.
- [ ] R3. **Native plugin roots.** For Claude, OMP, and Grok: document where the full plugin tree (including `scripts/`) lands after install (cache/registry path patterns from code + help), and whether `scripts/anti-hallucination/` would be present without extra staging work.
- [ ] R4. **Rulesync / hermes roots.** For codex, pi, opencode, antigravity-*, hermes: document the global skills destination patterns from `docs/help/cmd_install.md` / install dispatch and confirm plugin-level scripts are **absent** after a map+dispatch (unless evidence shows otherwise).
- [ ] R5. **Project vs global.** Note how `--no-global` / `outputRoot` changes roots for at least one rulesync target and hermes (cite `executeInstall` outputRoot resolution).
- [ ] R6. **Deliverable placement.** Write the completed table + short conclusions into this task's **Solution** section; append one gist line to feature **A** `## Decisions so far` linking this task.
- [ ] R7. **Non-goals respected.** No production code changes; no edits to install behavior; research findings live in the task body only.
### Acceptance Criteria
**AC1 — Complete target coverage.** Solution table includes every `TARGETS` entry (and openclaw if documented); no target left blank without an explicit `unknown` + reason.

**AC2 — Plugin-level vs skill-level.** At least one paragraph states that skill-level `scripts/` can be copied by the mapper while plugin-level `plugins/<p>/scripts` is not (or is, with counter-evidence), with `mapper.ts` line citations.

**AC3 — Native yes / rulesync no (or revised).** Either confirms the discovery hypothesis (Claude/OMP/Grok receive full plugin trees; rulesync/hermes do not get plugin-level scripts) with evidence, or records a corrected finding that supersedes the hypothesis.

**AC4 — Actionable for staging design.** Table ends with a one-line implication for the install-staging task (e.g. must add staging of plugin-level scripts for the rulesync class only).

**AC5 — Map updated.** Feature A `## Decisions so far` contains a gist line for this research ticket after Solution is filled (execution session — not part of refine).
### Q&A

| Topic | Decision | Rationale |
|-------|----------|-----------|
| Ticket type | Keep `wayfinder:research` — no production code | Inventory only; unblocks 0090/0091/0094 |
| Skip gate | Structural `spur task check` PASS with empty requiredSections; content still placeholder → synthesize | Planning Step 6: check gates presence not content; refine fills Design/Plan/AC |
| Target set | All `TARGETS` + openclaw note from install help | Matches install surface |
| Empirical depth | Static required; host FS optional | Avoid blocking research on missing CLIs |
| Out of scope | No staging implementation, no runner contract | Owned by 0089/0090 |
### Design
**Method (research only — no product code).**

1. **Static first (authoritative for what install is designed to do).**
   - Read `packages/core/src/mapper.ts` skill support-subdir loop — answer R2 without installing.
   - Read `apps/cli/src/commands/install.ts` dispatch: `claude` cache + marketplace install; `omp`/`grok` native install; `hermes` skills copy; rulesync path resolution; `outputRoot` / `--no-global`.
   - Cross-check `docs/help/cmd_install.md` target table against code (flag drift).

2. **Empirical second (authoritative for where files land when CLIs exist).**
   - Prefer `superskill install cc --targets <one> --dry-run --verbose` when dry-run is faithful.
   - Where dry-run cannot show native plugin trees (external CLIs), use code + registry/cache path comments (`~/.claude/plugins/cache/<marketplace>/…`, OMP `installed_plugins.json`, Grok `~/.grok/installed-plugins/`) and, only if already installed, `ls` those roots for `scripts/`.
   - Do not require a full multi-target install as a gate if static evidence answers R3/R4; mark empirical cells `not verified on this host` when CLIs are missing.

3. **Output shape (Solution section).**
   - Markdown table (R1 columns).
   - Short "Implications for 0090/0091" bullet list (AC4).
   - Explicit unknowns for feature A fog (do not invent paths).

**Invariants.**
- Cite repo paths as `file:line` when claiming mapper/install behavior.
- Distinguish design intent (code) from observed FS (empirical).
- Do not change install code under this WBS.
### Plan
1. [ ] Claim ticket: `spur task update 0088 wip`.
2. [ ] Read `packages/core/src/targets.ts` + `packages/core/src/mapper.ts` skill loop — draft R2 answer.
3. [ ] Read `apps/cli/src/commands/install.ts` dispatch branches for claude / omp / grok / hermes / rulesync — draft R1/R3/R4/R5 path patterns with line cites.
4. [ ] Reconcile with `docs/help/cmd_install.md` target table; note any doc drift in Solution.
5. [ ] Optional empirical: dry-run or `ls` existing cache/registry for `cc` plugin `scripts/` presence; record host findings.
6. [ ] Write Solution table + implications; tick Requirements checkboxes.
7. [ ] Append gist to feature A `## Decisions so far`; set 0088 `done`.
8. [ ] Stop (wayfinder: one ticket per session) — do not start 0090 in the same session.
### Solution

<!-- Filled during implementation: file:line change map and concise rationale. -->

### Testing

<!-- Filled during verification: commands run, outcomes, coverage claim or N/A. -->

### Review

<!-- Filled during review: P1-P4 findings, residual risk, and final disposition. -->

### References
- Feature map: `docs/features/A_portable-plugin-scripts-via-install-time-staging.md`
- Install help: `docs/help/cmd_install.md` (target to output location table)
- Mapper: `packages/core/src/mapper.ts` (skill support subdirs)
- Install dispatch: `apps/cli/src/commands/install.ts` (`executeInstall`, claude/omp/grok/hermes branches)
- Targets: `packages/core/src/targets.ts`
- Sibling: `docs/tasks/0089_define-portable-entrypoint-contract-for-staged-plugin-script.md`
- Downstream: 0090 staging, 0091 script path, 0094 hook-path design
- Prior absorption (historical): task 0087 / `apps/cli/src/commands/script-run.ts`
### History
