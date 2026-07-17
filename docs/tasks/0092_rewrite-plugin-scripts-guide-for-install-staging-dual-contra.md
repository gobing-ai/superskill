---
template: standard
schema_version: 1
name: "Rewrite plugin-scripts guide for install-staging dual contract"
description: ""
status: todo
type: task
profile: standard
feature_id: A
parent_wbs: null
priority: P2
tags: []
dependencies: ["0089", "0091"]
created_at: "2026-07-17T06:13:59.316Z"
updated_at: "2026-07-17T06:50:55.301Z"
---

## 0092. Rewrite plugin-scripts guide for install-staging dual contract

### Background
**Type:** `wayfinder:task` (docs)

**Sharp question.** Rewrite `docs/help/how_to_organize_scripts_for_plugin_development.md` for the **dual contract**: install staging + `superskill script path` as the **standard** way for plugin authors; `superskill script run` / registry absorption as **optional** for pure engines that need zero filesystem paths.

**Why this ticket exists.** The current guide (shipped with absorption task) states: *“Install targets never receive script files”* and *“script execution always goes through the superskill binary.”* Feature **A** reopened that model (C, R3-B, R4-B, R5-B). Plugin authors and the non-hook migrate task need an authoritative help page that matches the new install + path story without deleting the optional `script run` surface.

**Depends on.** Entrypoint contract grilling and path-helper feature must be **done** (frontmatter) so the guide cites real invocation shapes, exit codes, and roots — not provisional discovery text. L4 readiness warnings are expected until then. Do not publish a half-true guide while staging/path are unfinished.

**Locked inputs.**
| ID | Constraint for the guide |
|----|--------------------------|
| R3-B | Document native plugin `scripts/` + agents scripts root staging |
| R4-B | Skill docs use `script path` (or equivalent), not hard-coded cache/repo paths |
| R5-B | Dual: path = standard; `script run` = optional |
| R2-B | No “require Bun on every target” as the standard |
| R6-B | Hook **path** migration is a separate design ticket — guide may keep `hook run` as current recommended hook form until that lands; must not claim hooks.json must use staged paths until hook-design is done |

**In scope.**
- Full rewrite (or structural overhaul) of `docs/help/how_to_organize_scripts_for_plugin_development.md`.
- Update Status table, decision tree, anti-patterns, authoring steps for both contracts.
- Cross-link from `docs/help/index.md` if blurb is stale.
- Fix drift pointers in `docs/help/bundled_plugin.md` / `docs/04_DESIGN.md` **only if** they still say “copied on install” without mechanism — prefer one-line fixes or “see guide”; full ADR supersession is the ADR task.
- CHANGELOG docs note under `[Unreleased]`.

**Out of scope.**
- Implementing staging or `script path` CLI.
- Migrating anti-hallucination skill prose (non-hook migrate task).
- Completing hook-path unification design/implementation.
- Rewriting all plugin skill docs.

**Done when.** Guide accurately describes dual contract with examples; anti-patterns match new truth; Status table reflects shipped surfaces; index blurb consistent; feature A decisions log gets a gist line.
### Requirements
- [ ] R1. **Lead summary rewritten.** Opening “short version” no longer claims install targets never receive script files or that execution *always* goes only through binary absorption. New lead states dual contract in one paragraph.
- [ ] R2. **Layout convention kept.** Retain plugin-level `plugins/<plugin>/scripts/<feature>/` and prose-only skill folders (ADR-015); do not revive per-skill executable `scripts/`.
- [ ] R3. **Standard path: staging + path helper.** Document:
  - `superskill install` stages plugin-level scripts (native full tree for Claude/OMP/Grok; agents scripts root for rulesync/hermes per staging Solution).
  - Skill docs invoke via `superskill script path <plugin> <rel>` then the portable runner from entrypoint contract (cite concrete command forms from path-helper + entrypoint Solutions).
  - Path miss fails closed (exit semantics from path-helper Solution).
- [ ] R4. **Optional absorption: script run / hook run.** Document when to register a `ScriptRunner` / `HookRunner` (needs CLI release, pure engine, no FS path). Keep examples for `script run` and current `hook run` as valid optional/current hook form.
- [ ] R5. **Two-class model updated.** Hook vs non-hook remains; each class lists **standard** and **optional** runtime surfaces. Remove “there is no third class / only dispatchers” wording that forbids staged files.
- [ ] R6. **Decision tree updated.** Author path: host hook → (current) hook run until hook-design lands; agent CLI → prefer path helper + staged entrypoint; optional registry if absorption justified; repo-root scripts/ for build tooling.
- [ ] R7. **Anti-patterns table rewritten.** At minimum:
  - Still ban: `bun plugins/...` in skill docs; per-skill executable scripts; wiring validation CLI as hook block.
  - **Revise** former “never copy scripts” row: copying via install staging is now intended; ad-hoc copies and repo-relative paths remain wrong.
  - Add: hard-coded cache paths; assuming Bun on targets for standard contract.
- [ ] R8. **Status table.** Rows for: install staging of plugin scripts; `script path`; `script run` (optional); `hook run` (current hooks). States match reality at ship time of this doc task (done vs planned — no false “shipped” for unfinished work).
- [ ] R9. **Index / cross-links.** `docs/help/index.md` description for this guide matches dual contract. Fix any one-liner in bundled_plugin that contradicts (minimal).
- [ ] R10. **Non-goals.** No production code; no full ADR rewrite (ADR task); no mass skill-doc migration (migrate task).
### Acceptance Criteria
**AC1 — No absorption-only lead.** Grep of the guide does not claim that install targets never receive plugin-level scripts, or that the only portable surface is binary absorption.

**AC2 — Dual contract explicit.** Guide has a clearly titled section (or table) distinguishing standard (stage + path) vs optional (`script run` registry), with at least one example each.

**AC3 — Anti-patterns consistent.** Table does not list “copying scripts on install” as universally wrong; it forbids the old broken patterns (`bun plugins/...`, per-skill scripts, cache hardcoding).

**AC4 — Cites real surfaces.** Examples use command forms that match path-helper and entrypoint Solutions (or are marked TBD only if a dependency is not done — prefer waiting for deps over shipping TBD examples).

**AC5 — Status honesty.** Status table does not mark unfinished features as shipped.

**AC6 — Index aligned.** Help index blurb for this guide mentions staging/path dual contract (not only script run).

**AC7 — CHANGELOG.** Unreleased docs entry notes the guide rewrite.
### Q&A
**Auto-refine synthesis**

| Topic | Decision | Rationale |
|-------|----------|-----------|
| Structural check | PASS + L4 prereqs → synthesize | Placeholders only |
| Write when | After entrypoint + path helper done | Avoid documenting vapor commands |
| Dual contract | Path standard; run optional | Locked R5-B |
| Hooks in guide | Keep hook run until hook-design | Avoid premature CLAUDE_PLUGIN_ROOT revival |
| ADR files | Out of scope | Separate ADR task |
### Design
**Approach (docs-only).**

1. **Wait for sources of truth.** Before writing final prose, copy normative bullets from:
   - Entrypoint Contract v1 (grilling Solution)
   - `script path` CLI shape (path-helper Solution)
   - Staging destinations (staging Solution + inventory table)
2. **Structure rewrite** (recommended outline):
   - Short version (dual contract)
   - Physical layout (plugin-level scripts, prose-only skills)
   - How install delivers scripts (native vs agents root)
   - Standard invocation (path helper + runner)
   - Optional absorption (`script run` / `hook run`)
   - Decision tree
   - Anti-patterns
   - Testing / coverage (keep registry + plugin scripts tests notes; update “CLI release required” to apply to **registry** scripts only)
   - Status
3. **Hooks caution.** Until hook-design is done, keep recommending `superskill hook run` for hooks.json; add a short “future: staged hook paths” note pointing at feature A fog/hook ticket — do not document a broken path form.
4. **Tone.** Guide is for plugin authors, not a diary of the redesign. Prefer MUST/MUST NOT + examples over feature-A ID soup (IDs may appear once in Status/References).

**Rejected.**
- Deleting `script run` documentation entirely (still optional standard surface).
- Leaving “never copy” as the thesis with a footnote (misleading).
- Rewriting ADRs inside this task.
### Plan
1. [ ] Wait until entrypoint contract + path helper (and preferably staging) are done; read their Solutions.
2. [ ] Claim this task `wip`.
3. [ ] Rewrite guide body per Design outline; update Status table honestly.
4. [ ] Update help index blurb; minimal drift fixes on bundled_plugin one-liner if needed.
5. [ ] CHANGELOG docs note; grep guide for banned claims (`never receive`, sole absorption).
6. [ ] Feature A decisions gist; mark done.
### Solution

<!-- Filled during implementation: file:line change map and concise rationale. -->

### Testing

<!-- Filled during verification: commands run, outcomes, coverage claim or N/A. -->

### Review

<!-- Filled during review: P1-P4 findings, residual risk, and final disposition. -->

### References
- Target doc: `docs/help/how_to_organize_scripts_for_plugin_development.md`
- Help index: `docs/help/index.md`
- Feature map: `docs/features/A_portable-plugin-scripts-via-install-time-staging.md`
- Prerequisites: entrypoint contract grilling; path-helper feature-impl (and staging for destination facts)
- Downstream: non-hook skill doc migrate
- Related drift: `docs/help/bundled_plugin.md`, `docs/04_DESIGN.md`, ADR-015 (ADR task owns supersession)
- Historical absorption: `apps/cli/src/commands/script-run.ts`, task that shipped `script run`
### History
