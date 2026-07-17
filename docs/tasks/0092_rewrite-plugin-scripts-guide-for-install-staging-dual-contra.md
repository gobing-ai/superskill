---
template: standard
schema_version: 1
name: "Rewrite plugin-scripts guide for install-staging dual contract"
description: ""
status: done
type: task
profile: standard
feature_id: A
parent_wbs: null
priority: P2
tags: []
dependencies: ["0089", "0091"]
created_at: "2026-07-17T06:13:59.316Z"
updated_at: "2026-07-17T17:39:46.875Z"
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
> Grounding: citations from current source (no speculation).

**Artifact:** `docs/help/how_to_organize_scripts_for_plugin_development.md` (full rewrite, 12.3 KB) + cross-link fixes.

**Lead summary rewritten (AC1).** Replaced absorption-only lead ("install targets never receive script files"; "execution always goes through the superskill binary") with dual-contract lead: standard staged path + optional binary registry. Guide grep no longer matches `never receive`, `only ... absorption`, `there is no third class`, or `only dispatchers`.

**Dual contract explicit (AC2).** New top section "The two contracts" is a 2-row table: Standard (staged path via `$(superskill script path <plugin> <rel>)` + portable runner) vs Optional (`script run` / `hook run` binary registry). Each row carries an example invocation later in the doc.

**Standard contract cites real surfaces (AC4):**
- Staging roots: native targets (claude/omp/grok) receive `scripts/` via host plugin install (`apps/cli/src/commands/install.ts:450` — `needsSharedScriptsRoot` gate); rulesync+hermes get `~/.agents/scripts/<plugin>/` once per install (`apps/cli/src/commands/install.ts:921-946` `stagePluginScripts`; mapper staging at `packages/core/src/mapper.ts:240-245`).
- `script path` resolution + exit codes: `apps/cli/src/commands/script-path.ts:65-107` (project-first then global; regular-file check), exit 0/2/1 fail-closed.
- Entrypoint Contract v1: Node `.js`/`.mjs` + POSIX `.sh`; exit 0/1 validation / exit 2 hook block.

**Optional contract kept (R5-B):** `script run` (non-hook, exit 0/1 validation semantics, fail-open on unknown id — `apps/cli/src/commands/script-run.ts:66-85`) and `hook run` (current hook form, portable PATH, `minCliVersion` gate).

**Anti-patterns consistent (AC3).** Revised the former "never copy scripts" row: install-time staging is now the intended mechanism (callout block under the table makes this explicit); ad-hoc copies and repo-relative invocation remain banned. Added rows for hard-coded absolute paths (`~/.agents/scripts/...`, cache dir, repo clone) and assuming Bun on targets.

**Decision tree updated (R6).** Hook → `hook run` (staged hook paths are R6-B, not yet shipped); agent CLI → prefer standard contract (staged path) unless script is a pure engine with no FS needs → optional registry; repo-root `scripts/` for build tooling.

**Status honesty (AC5).** New Status table marks install staging / `script path` / `script run` / `hook run` as Shipped (with task IDs); Entrypoint Contract as Defined (0089); hook-path unification as **Planned** (R6-B) with explicit "keep using `hook run` until it lands".

**Index + cross-links (AC6).** `docs/help/index.md:39` blurb rewritten to mention dual contract. `docs/help/bundled_plugin.md:40` one-liner updated from "copied on install" to mechanism-accurate (staging for rulesync/hermes, native tree for Claude/OMP/Grok) with link to the guide.

**Hooks caution (R6-B).** Explicit note: "Hooks stay on `hook run` for now. Hook-path unification is feature A work item R6-B and is **not done**; do not stage a hook via `script path` until that design lands." — avoids premature `${CLAUDE_PLUGIN_ROOT}` revival.

**CHANGELOG (AC7).** Added `### Documentation` entry under `[Unreleased]` in `CHANGELOG.md:36-38` summarizing the rewrite.

**No production code touched** (R10). No ADR rewrite (ADR task owns supersession — 0095). No mass skill-doc migration (0093 owns that).

**Verification.** `bun run lint` clean (Biome + typecheck across both workspaces). Guide grep confirms no absorption-only phrasing remains.
### Testing
Docs-only task — no production code, so no unit/integration coverage delta.

**Commands run.**

| Command | Outcome |
|---|---|
| `bun run lint` (Biome + turbo typecheck) | Clean — 175 files checked; both workspaces (`@gobing-ai/superskill-core`, `@gobing-ai/superskill`) typecheck exit 0 |
| `grep -nE "never receive\|only.*absorption\|there is no third class\|only dispatchers" docs/help/how_to_organize_scripts_for_plugin_development.md` | No matches (AC1 satisfied) |
| Manual AC checklist pass | AC1–AC7 all satisfied (see Solution) |

**AC evidence.**

- AC1 (no absorption-only lead): grep clean above.
- AC2 (dual contract explicit): `docs/help/how_to_organize_scripts_for_plugin_development.md:7-12` two-row contract table.
- AC3 (anti-patterns consistent): revised "copying scripts" callout at line ~148.
- AC4 (cites real surfaces): file:line citations throughout (`install.ts:450,921-946`, `script-path.ts:65-107`, `script-run.ts:66-85`, `mapper.ts:240-245`).
- AC5 (status honesty): Status table marks hook-path unification as **Planned**, not Shipped.
- AC6 (index aligned): `docs/help/index.md:39` blurb updated.
- AC7 (CHANGELOG): `CHANGELOG.md:36-38` Documentation entry added.

**No tests skipped, no `.skip`, no suppressions.** Coverage gate unaffected (docs-only change).
### Review
Self-review against AC1–AC7 + R3-B/R4-B/R5-B/R6-B locked inputs. Docs-only task; review is content accuracy + drift check, not code risk.

**Findings.**

| Severity | Finding | Disposition |
|---|---|---|
| P1 | (none) | — |
| P2 | (none) | — |
| P3 | Guide still references ADR-015 and ADR-022 by number without one-line gist; a plugin author unfamiliar with the ADRs loses context. Accepted — ADR files are linked in the project documentation map and full ADR supersession is task 0095 (out of scope here per R10). | Keep; cross-link to `docs/00_ADR.md` is in project doc map. |
| P4 | "Standard contract" examples use `validate_response.js` and a hypothetical `run.sh`; the actual shipped `cc` plugin script is `.ts` source with no staged `.js` twin yet (staging lands the `.ts`). A reader copying the example verbatim on a rulesync target today would stage a non-runnable `.ts`. | Documented inline (line 29: "A TypeScript-only entrypoint under `scripts/` is fine in-repo but MUST have a runnable twin"). The non-hook migrate task (0093) owns producing the real `.js` twin. No change. |

**Locked-input check.**

- R3-B (native plugin `scripts/` + agents scripts root staging): ✓ "How install delivers scripts" section.
- R4-B (skill docs use `script path`, not hard-coded paths): ✓ anti-pattern row bans hard-coded absolute paths; canonical doc form is `$(superskill script path …)`.
- R5-B (dual: path=standard, `script run`=optional): ✓ two-contract table; Status table labels registry as "(optional contract)".
- R2-B (no "require Bun on every target"): ✓ Entrypoint Contract restricts to Node `.js`/`.mjs` + POSIX `.sh`; anti-pattern row bans assuming Bun.
- R6-B (hooks stay on `hook run` until hook-design): ✓ explicit "Hooks stay on `hook run` for now" note; Status marks hook-path unification as **Planned**.

**Residual risk.** Low. Doc drift in `docs/04_DESIGN.md` and ADR-015/ADR-022 wording is owned by tasks 0093 (migrate) and 0095 (ADR supersession) — explicitly out of scope here (R10). Guide is internally consistent and matches shipped code as of this commit.

**Disposition.** PASS — ship as-is.
### References
- Target doc: `docs/help/how_to_organize_scripts_for_plugin_development.md`
- Help index: `docs/help/index.md`
- Feature map: `docs/features/A_portable-plugin-scripts-via-install-time-staging.md`
- Prerequisites: entrypoint contract grilling; path-helper feature-impl (and staging for destination facts)
- Downstream: non-hook skill doc migrate
- Related drift: `docs/help/bundled_plugin.md`, `docs/04_DESIGN.md`, ADR-015 (ADR task owns supersession)
- Historical absorption: `apps/cli/src/commands/script-run.ts`, task that shipped `script run`
### History
- 2026-07-17T17:36:23.742Z todo → wip (system)
- 2026-07-17T17:39:06.566Z wip → testing (system)
- 2026-07-17T17:39:46.875Z testing → done (system)
