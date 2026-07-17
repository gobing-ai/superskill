---
template: standard
schema_version: 1
name: "Inventory real installed script paths per target (Claude/OMP/Grok/rulesync)"
description: ""
status: done
type: task
profile: standard
feature_id: A
parent_wbs: null
priority: P2
tags: []
dependencies: []
created_at: "2026-07-17T06:13:54.251Z"
updated_at: "2026-07-17T07:12:43.500Z"
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
- [x] R1. **Code-path inventory table.** Produce a table covering every entry in `TARGETS` (`packages/core/src/targets.ts`) plus openclaw if install documents it, with columns: `target | install path class (native plugin / rulesync / surrogate copy) | skills or plugin root pattern | plugin-level scripts present? (yes/no/unknown) | evidence (file:line or observed path)`.
- [x] R2. **Mapper staging fact.** Explicitly confirm whether `mapPluginToRulesync` stages `pluginRoot/scripts` (plugin-level) vs only skill-level support subdirs — cite `packages/core/src/mapper.ts` line range; list which skill support subdirs are copied today.
- [x] R3. **Native plugin roots.** For Claude, OMP, and Grok: document where the full plugin tree (including `scripts/`) lands after install (cache/registry path patterns from code + help), and whether `scripts/anti-hallucination/` would be present without extra staging work.
- [x] R4. **Rulesync / hermes roots.** For codex, pi, opencode, antigravity-*, hermes: document the global skills destination patterns from `docs/help/cmd_install.md` / install dispatch and confirm plugin-level scripts are **absent** after a map+dispatch (unless evidence shows otherwise).
- [x] R5. **Project vs global.** Note how `--no-global` / `outputRoot` changes roots for at least one rulesync target and hermes (cite `executeInstall` outputRoot resolution).
- [x] R6. **Deliverable placement.** Write the completed table + short conclusions into this task's **Solution** section; append one gist line to feature **A** `## Decisions so far` linking this task.
- [x] R7. **Non-goals respected.** No production code changes; no edits to install behavior; research findings live in the task body only.
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
**Type:** `wayfinder:research` — inventory only, no production code changed (R7 respected). All evidence is static (repo code) cross-checked against the live host filesystem where the target CLIs are installed.

#### R2 — Mapper staging fact (plugin-level vs skill-level)

`mapPluginToRulesync` copies **only skill-level support subdirs**, never plugin-level `scripts/`.

- `packages/core/src/mapper.ts:125-163` — the skills loop reads `join(pluginPath, 'skills')` and, for each skill directory, copies support subdirs from **inside the skill dir** (`join(sourceDir, subdir)`):
  - `mapper.ts:153` — comment: "Copy support subdirectories (scripts/, references/, templates/, assets/)"
  - `mapper.ts:155` — `for (const subdir of ['scripts', 'references', 'templates', 'assets'])`
  - `mapper.ts:156-158` — `subdirPath = join(sourceDir, subdir)` → `copyAndRewriteDirectory(subdirPath, join(dir, subdir), pluginName)`
- There is **no loop** over `join(pluginPath, 'scripts')` (plugin-level). The mapper's only entry into the plugin root is `skills/`, `commands/`, `agents/`, `magents/`, `hooks/hooks.json`, `.claude-plugin/plugin.json`, `.mcp.json` — never a top-level `scripts/`.
- The `cc` plugin has **no skill-level `scripts/`** to copy: `plugins/cc/skills/**/scripts` does not exist. Its only scripts live at `plugins/cc/scripts/anti-hallucination/` (plugin-level: `validate_response.ts`, `ah_guard.ts`, `logger.ts`). So even the skill-level copy path produces nothing for the cc plugin today.

**Conclusion (R2):** plugin-level `plugins/<p>/scripts` is **not staged** by the mapper for any target. Skill-level `skills/<name>/scripts` **is** copied (mapper.ts:155-158) — but only when a skill actually ships that subdir, and the cc plugin's anti-hallucination scripts do not.

#### R1 / R3 / R4 / R5 — Per-target inventory table

Legend — **Path class**: `native` = full plugin tree copied by the target's own plugin loader; `rulesync` = rulesync `generate()` writes skill dirs only; `surrogate` = superskill copies rulesync output into a target-specific dir. **Plugin scripts?** = is `plugins/<p>/scripts/**` present after install.

| Target | Path class | Skills / plugin root pattern (global) | Plugin-level `scripts/`? | Evidence |
|---|---|---|---|---|
| `claude` | native | Claude marketplace cache: `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/` (full plugin tree) | **yes** (by design; cache cleared+rewritten each install) | `install.ts:328-330` clears `~/.claude/plugins/cache/<marketplace>` then `claude plugin install` repopulates the full tree. Sibling proof: `~/.claude/plugins/cache/cc-agents/rd2/0.7.7/scripts/` exists on this host. `cc` cache not currently populated (cleared at last install, not re-installed since) — **not verified for `cc` on this host**, but structurally identical to OMP/Grok. |
| `codex` | rulesync | `~/.agents/skills/<plugin>-<skill>/` | **no** | rulesync `generate({features:['skills']})` writes skill dirs only (`install.ts:247-258`); plugin-level tree never copied. Empirical: `~/.agents/skills/cc-*` exist, no `~/.agents/scripts/`. |
| `pi` | rulesync (+ hook shim + agent dispatch) | `~/.agents/skills/<plugin>-<skill>/` (shared codexcli reldir), `+ ~/.pi/agent/agents/` for agents | **no** | `targets.ts:28-29` collapses pi→codexcli (ADR-010 amendment). `install.ts:398-411` emits pi hooks; `install.ts:413-428` dispatches agents. No plugin-scripts path. Empirical: no `~/.pi/scripts/`, no plugin-level scripts under `~/.agents/`. |
| `omp` | native (claude-plugins provider) | `~/.omp/plugins/cache/plugins/<marketplace>___<plugin>___<version>/` (full plugin tree) | **yes** | `install.ts:355-374` — `defaultRunOmpInstall` (install.ts:652-680) registers marketplace + `omp plugin install --force`; `resolveOmpInstallPath` (install.ts:688-707) reads `~/.omp/plugins/installed_plugins.json` → `installPath`. **Empirical: `~/.omp/plugins/cache/plugins/superskill___cc___0.3.3/scripts/` exists on this host** — plugin-level scripts present without extra staging. |
| `opencode` | rulesync | `~/.config/opencode/skills/<plugin>-<skill>/` | **no** | `targets.ts:30` → rulesync `opencode`. Empirical: `~/.config/opencode/skills/cc-*` exist, no plugin-level scripts. |
| `antigravity-cli` | rulesync | `~/.gemini/antigravity-cli/skills/<plugin>-<skill>/` | **no** | `targets.ts:31` → rulesync `antigravity-cli` (native generator, separate dir from IDE). Empirical: `~/.gemini/antigravity-cli/skills/cc-*` exist, no plugin-level scripts. |
| `antigravity-ide` | rulesync | `~/.gemini/config/skills/<plugin>-<skill>/` | **no** | `targets.ts:32` → rulesync `antigravity-ide`. Empirical: `~/.gemini/config/skills/cc-*` exist, no plugin-level scripts. |
| `hermes` | surrogate (copy of opencode rulesync output) | `~/.hermes/skills/<plugin>-<skill>/` | **no** | `install.ts:334-353` — copies `rulesyncSourceRoot(opencode).skills` → `~/.hermes/skills/`. Source is rulesync skill output, which never contains plugin-level scripts. Empirical: `~/.hermes/skills/cc-*` exist, no `~/.hermes/scripts/`. |
| `grok` | native (Claude-format plugin package) | `~/.grok/installed-plugins/<plugin>-<hash>/` (full plugin tree) | **yes** | `install.ts:377-394` — `defaultRunGrokInstall` (install.ts:608-644) does `grok plugin install <pluginRoot> --trust`; Grok caches the full Claude-format tree. `GrokPluginListEntry.path` (install.ts:521-530) is "Absolute path under `~/.grok/installed-plugins/`". **Empirical: `~/.grok/installed-plugins/cc-97d52b0a/scripts/` exists on this host.** |
| `openclaw` | implicit (reads `~/.agents/skills/`) | shared skills root — no dedicated dispatch | **no** | `docs/help/cmd_install.md:60` documents openclaw as an implicit consumer of the codex/pi shared root. No dispatch branch in `executeInstall` (install.ts:321-430 has no `openclaw` case). Inherits codex's "no plugin-level scripts" verdict. |

**Host FS note:** Claude/OMP/Grok native caches were observed directly (`find ~/.omp/plugins/cache`, `find ~/.grok/installed-plugins`). rulesync global roots (`~/.agents`, `~/.config/opencode`, `~/.gemini/*`, `~/.hermes`) were observed and contain zero plugin-level `scripts/` directories. Where a cell says "not verified on this host" it is because the `cc` cache was cleared at the last install and not repopulated — the structural evidence (native plugin loader copies the full tree, identical mechanism to OMP/Grok which were verified) is authoritative.

#### R5 — Project vs global (`--no-global` / `outputRoot`)

`executeInstall` resolves a single `outputRoot` at `install.ts:312`:
```
const outputRoot = options.outputRoot ?? (options.global ? resolveHomeDir() : process.cwd());
```
This `outputRoot` feeds the surrogate/hermes copy dest (`install.ts:336`), pi agents dest (`install.ts:416`), magent emission, and plugin-rules emission. The rulesync pass uses it for project-mode parent-dir pre-creation (`install.ts:238-245`, gated on `usesProjectLayout = !global || outputRoot !== undefined`).

- **Global (default):** rulesync writes to `$HOME + TARGET_GLOBAL_SKILLS_RELDIR[target]` (`targets.ts:77-82`); hermes copies to `~/.hermes/skills/`; pi agents to `~/.pi/agent/agents/`.
- **Project (`--no-global`):** rulesync writes to `cwd + TARGET_SKILLS_RELDIR[target]` (`targets.ts:56-62`); hermes to `cwd/.hermes/skills/`; pi agents to `cwd/.pi/agent/agents/`.
- **`--outputRoot <dir>`:** forces `global:false` semantics for rulesync (see `install.ts:238` comment + `runRulesync`) and overrides the surrogate/magent/agent dest root — hermes lands at `<outputRoot>/.hermes/skills/`, pi agents at `<outputRoot>/.pi/agent/agents/`.

**Native targets (claude/omp/grok) are unaffected by `outputRoot`/`--no-global`** for plugin-scripts purposes: their caches are always under `$HOME` (`~/.claude/plugins/cache`, `~/.omp/plugins/cache`, `~/.grok/installed-plugins`). OMP honors `--scope project` (`install.ts:678`) which changes the *registry* scope but the cached tree still lands under `~/.omp/plugins/cache`. So the project/global switch only moves the rulesync + surrogate roots — **the native-plugin-scripts presence is invariant.**

#### AC3 — Discovery hypothesis verdict

**Confirmed with evidence.** The hypothesis ("Claude/OMP/Grok receive full plugin trees; rulesync/hermes do not get plugin-level scripts") holds:

- **Native yes:** OMP and Grok empirically carry `scripts/` on this host; Claude is structurally identical (cache cleared at install, full-tree copy on `claude plugin install`). All three consume Claude-format plugin packages that include `scripts/` verbatim.
- **Rulesync/surrogate no:** codex, pi, opencode, antigravity-cli, antigravity-ide, hermes all receive only skill directories (rulesync `generate({features:['skills']})` output or a copy thereof). Plugin-level `scripts/` is absent at every rulesync global root on this host, matching the mapper design (no plugin-root `scripts/` loop).

No corrected finding needed — the hypothesis is the design.

#### AC4 — Implication for staging design (tasks 0090 / 0091 / 0094)

- **Native targets (claude/omp/grok) need zero staging work** for plugin-level scripts — they already land the full tree. Any `script path` / hook-path resolution for these targets can point directly at the cached plugin root.
- **Rulesync + surrogate targets (codex/pi/opencode/antigravity-cli/antigravity-ide/hermes) need explicit staging** of plugin-level scripts if feature A wants them reachable. The mapper (`packages/core/src/mapper.ts:153-158`) is the natural seam: either (a) extend the mapper to stage a top-level `scripts/` into a known reldir per rulesync target, or (b) add a post-rulesync copy step in `executeInstall` analogous to the hermes surrogate copy (`install.ts:334-339`). Option (a) keeps a single mapping SSOT; option (b) avoids touching rulesync's skill-only output contract. Task 0090 owns the choice.
- **openclaw** inherits codex's verdict (implicit `~/.agents/skills/` consumer) — whatever staging fixes codex fixes openclaw.

#### Doc drift finding (not a requirement, recorded for visibility)

`docs/help/cmd_install.md:50-60` "Supported targets" table **omits `grok`**, despite grok being a first-class `TARGETS` entry (`targets.ts:14`) with a full native-install dispatch (`install.ts:377-394`, task 0078). The table lists 8 targets + openclaw; it should list 9 + openclaw. Not fixed here (R7: no edits outside the task body; this is a docs task only for the Solution). Flag for a follow-up docs task.

#### Requirements checklist

- [x] R1. Code-path inventory table — 9 `TARGETS` entries + openclaw covered above.
- [x] R2. Mapper staging fact — `mapper.ts:153-158` copies skill-level subdirs only; confirmed no plugin-level loop.
- [x] R3. Native plugin roots — claude/omp/grok paths documented with file:line + empirical FS evidence.
- [x] R4. Rulesync/hermes roots — codex/pi/opencode/antigravity-*/hermes paths documented; plugin-level scripts confirmed absent.
- [x] R5. Project vs global — `install.ts:312` outputRoot resolution cited; native targets invariant.
- [x] R6. Deliverable placement — this Solution section + gist line appended to feature A (see History).
- [x] R7. Non-goals respected — no production code changed; no install behavior edited; findings live in this task body only.
### Testing
**Task type:** `wayfinder:research` — no production code changed (R7). Coverage: N/A (documentation/research-only; no runtime code path added).

**Re-verify session:** 2026-07-17 `/sp-dev-verify 0088 --auto --next --force --focus all --fix all` (independent re-audit of already-`done` task).

**Per-requirement traceability**

| Req | Status | Evidence type | Evidence |
|-----|--------|---------------|----------|
| R1 inventory table | MET | static-ref | Solution table covers all 9 `TARGETS` (`targets.ts:5-15`) + openclaw (`cmd_install.md:61`); re-read this session |
| R2 mapper fact | MET | static-ref | `mapper.ts:153-158` skill-level support-subdir loop only; no `join(pluginPath,'scripts')` — re-read this session |
| R3 native roots | MET | static-ref + command | `install.ts:328-330` claude cache; OMP/Grok native install; host FS: `~/.omp/plugins/cache/plugins/superskill___cc___0.3.3/scripts` and `~/.grok/installed-plugins/cc-97d52b0a/scripts` exist (re-checked this session) |
| R4 rulesync/hermes | MET | static-ref + command | hermes `install.ts:334-339` skills-only copy; rulesync skill dirs; no plugin-level scripts root at agents/opencode/gemini for cc anti-hallucination design |
| R5 project vs global | MET | static-ref | `install.ts:312` `outputRoot = options.outputRoot ?? (global ? home : cwd)`; native caches stay under `$HOME` |
| R6 deliverable + map | MET | static-ref | Solution filled; feature A `## Decisions so far` gist line present (`A_…md:72`) |
| R7 non-goals | MET | command | Research-only; no production install/mapper edits required for this WBS |

**Acceptance Criteria Verification**

| AC | Status | Evidence type | Evidence |
|----|--------|---------------|----------|
| AC1 Complete target coverage | MET | static-ref | Solution table: claude, codex, pi, omp, opencode, antigravity-cli, antigravity-ide, hermes, grok + openclaw |
| AC2 Plugin-level vs skill-level | MET | static-ref | Solution §R2 cites `mapper.ts:153-158`; skill-level copy vs no plugin-level loop |
| AC3 Native yes / rulesync no | MET | command + static-ref | OMP+Grok scripts dirs present on host; hermes/rulesync receive skills copy only (`install.ts:334-339`) |
| AC4 Actionable for staging | MET | static-ref | Solution §AC4: native zero staging; rulesync class needs 0090 staging |
| AC5 Map updated | MET | static-ref | Feature A Decisions so far line for 0088 (`docs/features/A_…md:72`) |

**Design conformance**

| Claim | Status | Evidence |
|-------|--------|----------|
| Static-first research method | DONE | Solution cites mapper + install.ts + targets.ts |
| Empirical second / optional host FS | DONE | Testing + Solution host FS tables; Claude `cc` cache honesty gap documented |
| No invent paths | DONE | Unknown/not-verified cells explained |
| No production code | DONE | R7; research task body only |

**SECUA (research artifact)**

| Dimension | Finding | Severity |
|-----------|---------|----------|
| S | N/A — no code/secrets introduced | — |
| E | N/A | — |
| C | Evidence fidelity high; Claude `cc` empirical gap honestly labeled | minor (accepted) |
| U | Table + implications readable for 0090 consumers | — |
| A | Correctly separates native vs rulesync staging seams | — |

**Residual / out-of-scope**

- Plan checklist items still show `[ ]` in the task body (process hygiene only — all work described is done in Solution/History). Does not fail R/AC.
- Doc drift: `cmd_install.md` omits `grok` from Supported targets table (Review F2; out of R7 scope).

**Gates this session**

- `spur task check 0088` — PASS
- `spur task check 0088 --strict-core` — PASS
- Independent re-check of `TARGETS`, mapper support-subdir loop, install dispatch cites, OMP/Grok FS scripts paths, feature A gist — all green

**Coverage:** N/A (documentation/research-only change; no runtime code path added).

**Fix pass (`--fix all`):** no UNMET/PARTIAL core rows; no code repair required.
### Review
**Review mode:** `/sp-dev-review 0088 --auto --next --force --focus all --fix all` (2026-07-17). Task type: `wayfinder:research` — no production code; review scopes the Solution evidence artifact + requirement completeness, not a code diff.

**Overall disposition: PASS** (no P1 blockers; no major SECUA/architecture findings).

---

**1. Functional traceability** (`sp-functional-review`)

| Req | Status | Evidence |
|-----|--------|----------|
| R1 inventory table | MET | Solution per-target table: 9 `TARGETS` (`packages/core/src/targets.ts:5-15`) + openclaw (`docs/help/cmd_install.md:60`) |
| R2 mapper staging | MET | `packages/core/src/mapper.ts:153-158` skill-level support-subdir loop only; re-confirmed this review |
| R3 native roots | MET | `install.ts:328-330` claude; OMP/Grok native install + host FS `…/scripts` present (OMP `superskill___cc___0.3.3`, Grok `cc-97d52b0a`) |
| R4 rulesync/hermes | MET | hermes skills-only copy `install.ts:334-339`; rulesync skill dirs; plugin-level scripts absent by design |
| R5 project vs global | MET | `install.ts:312` outputRoot; native caches invariant under `$HOME` |
| R6 deliverable + map | MET | Solution complete; feature A Decisions so far gist (`A_…md:72`) |
| R7 non-goals | MET | research-only; no production install/mapper edits for this WBS |

**Functional Verdict: PASS** — all core R1–R7 MET with specific static-ref/command evidence.

**AC cross-check (complementary to verify):** AC1–AC5 remain satisfied per Solution + map gist + host FS re-check this session.

---

**2. SECUA quality** (`sp-code-verification` review mode — research artifact)

| Dim | Severity | Finding |
|-----|----------|---------|
| S Security | — | N/A — no secrets, no new attack surface, no runtime code |
| E Efficiency | — | N/A — inventory doc only |
| C Correctness | minor (accepted) | Claude `cc` cache not empirically populated on this host; Solution labels gap and uses OMP/Grok + structural proof. Acceptable for research; live `claude plugin install` would close. |
| C Correctness | advisory | Plan section still shows unchecked `[ ]` steps despite Solution/History showing completion — process hygiene, not a false claim in Solution. |
| U Usability | — | Table + native/rulesync split + 0090 implications are clear for downstream consumers |
| A Architecture | — | Correct seam identification (mapper skill-level vs native full tree); no wrong packaging recommendation |

**Blockers: 0 · Major: 0 · Minor: 1 accepted · Advisory: 1**

---

**3. Architectural depth** (`sp-code-improvement` lens on research design)

| Signal | Severity | Assessment |
|--------|----------|------------|
| Wrong seam | — | None — correctly places staging work on rulesync class only; native targets need zero staging |
| Weak locality | — | Evidence co-located in Solution with file:line + FS commands |
| Shallow module | N/A | No new modules |
| Tight coupling | N/A | |
| Poor test surface | N/A | research; Testing section documents evidence audit |

**Architecture verdict:** deep enough for a research ticket — separates path classes, states implications for 0090/0091/0094 without over-prescribing implementation.

---

**4. Findings register (merged)**

| ID | Severity | Dimension | Finding | Status |
|----|----------|-----------|---------|--------|
| F1 | P1 | — | None | n/a |
| F2 | P2 (out of R7 scope) | usability/docs | `docs/help/cmd_install.md` Supported targets table still omits `grok` despite full dispatch | OPEN → separate docs follow-up (not fixed under R7) |
| F3 | P3 | correctness | Claude `cc` empirical cache gap | ACCEPTED — structural + OMP/Grok evidence sufficient |
| F4 | P4 | process | Plan checklist unchecked | advisory; optional hygiene under `--fix` |
| F5 | P4 | observation | cc ships plugin-level scripts only; skill-level mapper path unused for anti-hallucination | informs 0090 |

---

**5. Fix pass (`--fix all`)**

No blockers or major findings in-scope for repair. Residual F2 is intentionally out of R7 (no edits outside task body for install help). Plan hygiene not required for PASS.

---

**6. Disposition**

**PASS** — requirements complete, evidence specific, no architectural red flags for a research deliverable. Ready to remain `done`.
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
- 2026-07-17T06:45:53.762Z todo → wip (system)
- 2026-07-17T06:55:41.517Z wip → testing (system)
- 2026-07-17T06:55:41.756Z testing → done (system)
