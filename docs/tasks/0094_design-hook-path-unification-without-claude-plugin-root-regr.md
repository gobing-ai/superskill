---
template: brainstorm
schema_version: 1
name: "Design hook-path unification without CLAUDE_PLUGIN_ROOT regression"
description: ""
status: done
type: brainstorm
profile: standard
feature_id: A
parent_wbs: null
priority: P2
tags: []
dependencies: ["0088", "0089"]
created_at: "2026-07-17T06:14:02.191Z"
updated_at: "2026-07-17T22:28:31.405Z"
---

## 0094. Design hook-path unification without CLAUDE_PLUGIN_ROOT regression

### Background
**Type:** `wayfinder:grilling` (brainstorm template — design only, no product code)

**Sharp question.** How can `hooks.json` invoke staged script entrypoints on every supported target **without** reintroducing `${CLAUDE_PLUGIN_ROOT}` (or any Claude-only root) and **without** regressing `minCliVersion`, emitter portability (pi/hermes/omp/rulesync/grok), or ADR-020 fail-open skew semantics? (Discovery lock **R6-B**: hooks also use staged paths.)

**Why this ticket exists.** Non-hook path (staging + `script path`) can land without touching hooks. Hooks today are already portable via:
```text
superskill hook run cc anti-hallucination
```
(`plugins/cc/hooks/hooks.json`, `minCliVersion` gate in install). R6-B asked to **unify** on staged paths. That reopens the hardest portability surface: every emitter assumes a command string that works on PATH, not a per-machine absolute file path. This ticket **designs** the answer (or a staged rollback of R6-B); it does not implement emitters.

**Depends on.** Path inventory (roots per target) + entrypoint contract (runnable form). Do not invent absolute-path schemes until those Solutions exist.

**Current architecture (constraints, not optional).**
- Canonical command is PATH-based `superskill hook run <plugin> <hook-id>`; deep-import + compile into CLI (ADR-022 family).
- `minCliVersion` skips hook emission when CLI cannot satisfy registry (install.ts + hooks.ts).
- Emitters: pi-style merge, hermes merge, omp JS modules (`spawnSync('superskill', …)`), rulesync hooks pass, grok native Claude-format — all carry **command strings**, not resolved FS paths at authoring time.
- Unknown hook ids fail **open** (ADR-020).
- `${CLAUDE_PLUGIN_ROOT}` was explicitly retired for cross-target hooks.

**In scope.**
- Decision record: recommended hooks.json command form after unification (or dual-form policy).
- How install/emitters obtain a portable command for staged entrypoints (rewrite at emit time? wrapper via superskill? keep hook run?).
- Interaction with `minCliVersion` if hooks no longer call the CLI registry.
- Per-target matrix: what breaks if command becomes absolute path vs stays PATH.
- Explicit non-regression checklist (no Claude-only vars; multi-plugin merge still works).
- Follow-up task list if implementation is multi-PR.

**Out of scope.**
- Implementing emitter changes or rewriting hooks.json in this WBS.
- Non-hook path helper / staging implementation (sibling tasks).
- Removing `hook run` code unless Solution recommends deprecation with a plan.
- Third-party plugins outside superskill install (note only).

**Done when.** Solution holds a recommended direction with tradeoffs, a per-target feasibility note, non-regression checklist, and either (a) green-light implementation tasks or (b) a documented partial rollback/narrowing of R6-B; feature A decisions log gets a gist line.
### Requirements
- [x] R1. **Options analysis.** Evaluated four directions (Options 1-4) with portability/minCliVersion/emitter-churn/skew pros/cons in Solution options table.
- [x] R2. **No Claude-only roots.** Recommended form is PATH-resolved `superskill` binary — no `${CLAUDE_PLUGIN_ROOT}` dependency.
- [x] R3. **minCliVersion policy.** Stays unchanged; guarantees registry id resolution. Skew failure mode (stale-path crash) documented as the cost of rejected alternatives.
- [x] R4. **Emitter impact matrix.** All six classes (pi, hermes, omp, codex, opencode, antigravity-*, grok, claude) addressed — zero require changes.
- [x] R5. **Exit-code / block semantics.** Stop guard exit 2 preserved; validation-CLI entrypoints never wired as Stop blockers without `hook run` adapter.
- [x] R6. **Multi-plugin merge.** Pi/hermes dedup keys cited (`hooks.ts:174`, `hooks.ts:274`); both rely on command-string stability Option 1 preserves.
- [x] R7. **Recommendation + decision.** Option 1 primary; R6-B narrowed to "unify delivery, not runtime form" with explicit feature A amendment.
- [x] R8. **Follow-ups.** Proposed 0096 (`.js` twin); 0095 existing; no emitter changes.
- [x] R9. **Deliverable placement.** Full analysis in Solution; gist on feature A; no production code (AC6).
### Acceptance Criteria
**AC1 — Multi-option design.** Solution compares ≥3 options with explicit tradeoffs (portability, minCliVersion, emitter churn, skew).

**AC2 — No CLAUDE_PLUGIN_ROOT regression.** Recommended approach does not depend on Claude-only plugin root variables for cross-target portability.

**AC3 — Emitter matrix.** At least pi, hermes, omp, one rulesync target, grok, claude are addressed (works / needs work / N/A).

**AC4 — minCliVersion answered.** Clear policy when hooks use or leave `hook run`.

**AC5 — Actionable close.** Either implementation follow-ups are listed, or R6-B is narrowed with rationale suitable for feature A Decisions so far.

**AC6 — No code required.** Task completes as design artifact only.
### Q&A
**Auto-refine synthesis**

| Topic | Decision | Rationale |
|-------|----------|-----------|
| Template | brainstorm / grilling | Design decision, not feature-impl |
| Structural check | PASS + L4 prereqs → synthesize | Placeholders only |
| Seed lean rec | Keep hook run; stage files for non-hook; reinterpret R6-B | Absolute-path hooks high regression risk |
| Operator override | Full path unify still in option set | R6-B literal must be analyzed not ignored |
| Code | None in this WBS | Follow-ups after recommendation |
### Design
**Method (grilling / design).**

1. **Load facts.** Inventory Solution (where scripts land); entrypoint contract (how to run a staged file); current hooks.json + emitPiStyleHooks / emitHermesHooks / omp modules / minCliVersion gate.
2. **Stress each option** against: Stop hook latency, missing file, old CLI, project vs global, multi-plugin merge, hosts without shell, hosts that only spawn argv arrays.
3. **Prefer least emitter churn that still honors R6-B intent.** R6-B’s *intent* may be “hooks don’t need a special second delivery system” — which **keep hook run** already satisfies if files are staged for non-hook. Full absolute-path unify may be net regression.
4. **Seed lean recommendation (challenge in execution):**
   - **Primary:** Keep `superskill hook run` for hooks.json (current portable form).
   - **Staging:** Still stage plugin scripts for non-hook path contract.
   - **R6-B reading:** “Unify delivery of script *source* via install; hooks keep PATH CLI invoker.” Amend if operator insists on hooks.json → file path.
   - **Only if absolute paths required:** install-time rewrite in emitters to `node <abs>` / host form, never author-time CLAUDE_PLUGIN_ROOT; minCliVersion may not apply — define fail modes carefully.
5. **Output shape (Solution):** options table → recommendation → emitter matrix → minCliVersion → non-regression checklist → follow-up tasks.

**Risks to call out.**
- Absolute paths break when home moves or plugin reinstalls without rewrite.
- Dropping hook run removes fail-open skew and forces every host to run raw JS/shell with correct cwd/env.
- OMP already generates JS that spawns superskill — rewriting to FS paths duplicates logic.
### Plan
1. [ ] Wait for inventory + entrypoint contract Solutions (or proceed with provisional roots if inventory already gist’d on feature A).
2. [ ] Claim `wip`; re-read hooks.ts emitters + install minCliVersion gate + sample hooks.json.
3. [ ] Draft options table + recommendation; stress-test against emitter matrix.
4. [ ] Write Solution; propose follow-up tasks or R6-B narrowing; feature A gist; done.
5. [ ] Stop — no emitter implementation in this session.
### Solution
**Grounding (facts observed in this session):**

- Canonical hooks form is `superskill hook run cc anti-hallucination` (`plugins/cc/hooks/hooks.json:10`) under `minCliVersion: "0.2.19"` (`hooks.json:2`).
- Install gate (`apps/cli/src/commands/install.ts:178-184`) sets `hooksBlockedByCliVersion = true` when installed CLI < `minCliVersion`; every emitter branch (rulesync hooks pass at `install.ts:287`, hermes at `install.ts:342`, omp via `skipHooks` at `install.ts:368,744-746`, pi at `install.ts:399`) honors it. OMP comment at `install.ts:740-742` states the rationale verbatim: "modules would call `superskill hook run <id>` the old CLI doesn't know."
- All emitters carry **command strings**, not resolved FS paths: pi/hermes write merged JSON (`hooks.ts:160-192`, `hooks.ts:261-297`); OMP generates JS that `spawnSync('superskill', [...])` (`omp-hooks.ts:128-141`); rulesync pass writes native-format hooks.json; grok/claude consume the canonical file verbatim. Dedup is by command-string signature (`hooks.ts:174-192` pi, `hooks.ts:274-296` hermes) — multi-plugin merge relies on the command being a stable, comparable string.
- Fail-open for unknown hook ids (`hook-run.ts:339-347`): warns loudly, exits 0. Comment is explicit that this is the version-skew safety valve, not a policy gap.
- Staging (task 0090) lands plugin scripts at `~/.agents/scripts/<plugin>/` (global) or `.agents/scripts/<plugin>/` (project) — `install.ts:921-946`. `needsSharedScriptsRoot` gate (`install.ts:450`) skips staging for the native class (claude/omp/grok) because their plugin install CLIs already deliver `scripts/`.
- Script-path helper (task 0091) resolves staged entrypoints: project first, then global; **exit 2 fail-closed on not-found**, exit 0 found, exit 1 invalid args. This is the crucial skew-safety lever — it does NOT silently invent a path.

**Recommendation: Option 1 (keep `hook run` for hooks.json) as primary; reject absolute-path rewrite for hooks; narrow R6-B.**


| Option | Portability | minCliVersion churn | Emitter churn | Skew safety | Verdict |
|--------|-------------|---------------------|---------------|-------------|---------|
| **1. Keep `hook run` as the only hooks.json form** | ✅ PATH-resolved `superskill` binary is the one portable assumption; works on every target today | ✅ unchanged — floor stays, gate unchanged | ✅ none | ✅ ADR-020 fail-open preserved; old CLIs warn, new CLIs enforce | **PRIMARY** |
| 2. Install-time command rewrite (emitters emit `node <abs>` / `<abs>.sh` per target) | ⚠️ host-shell-dependent; absolute paths break on home move or reinstall without rewrite | ⚠️ minCliVersion loses meaning for hook layer; gate must be repurposed or dropped | ❌ high — every emitter (pi merge, hermes merge, omp JS gen, rulesync pass, grok, claude) gains a path-rewrite step; merge dedup keys change from command-string to (plugin, path) pair | ❌ stale path after partial reinstall → hard failure (no fail-open valve); minCliVersion can no longer protect against missing hook semantics | REJECTED |
| 3. PATH wrapper `superskill hook exec <plugin> <rel>` that resolves staged path then execs | ✅ still PATH-portable | ⚠️ needs new subcommand on every CLI that should enforce — raises floor | ⚠️ emitters swap `hook run <id>` → `hook exec <rel>`, but command-string shape preserved so merge dedup still works | ⚠️ loses the registry/fail-open story unless `hook exec` also implements unknown-path fail-open | DEFERRED — net complexity over Option 1 with no real win until staged files carry semantics `hook run` cannot reach |
| 4. Hybrid (registry hooks on `hook run`; simple shell hooks on staged paths where host guarantees root) | ⚠️ two mental models; "simple" is ill-defined across emitters | ⚠️ per-hook policy needs declaration in canonical hooks.json | ❌ emitters must classify each hook and pick a branch; classification surface is new | ❌ mixed fail modes per hook — operator cannot reason about a single Stop pipeline | REJECTED |


R6-B's literal text — "Hooks also invoke staged script paths (unify; largest risk)" — names **unify** as the goal. But the *intent* of unification, read against the discovery notes in feature A, is "hooks should not require a special second delivery system distinct from the rest of the plugin." Option 1 already satisfies that intent:

- **Delivery is unified at install.** `superskill install` is the single delivery mechanism for *everything* — skills, commands, agents, hooks registry, AND now staged scripts (tasks 0090/0091). Hooks no longer need a special path; they share the install pipeline with every other artifact.
- **What hooks reference at runtime is the CLI, not a path.** That is a feature, not a regression: it is what makes `minCliVersion` meaningful (the floor guarantees the registry id resolves), what makes multi-plugin merge deterministic (command strings are comparable across plugins), and what makes skew fail-open (unknown id → warn + exit 0, not a stale-path crash).
- **Staged files still exist for the non-hook path** and are inspectable/debuggable at `~/.agents/scripts/<plugin>/`. Hooks *could* be rewritten to call them — but doing so discards the three properties above for a literal reading of "unify" that the intent does not require.

**R6-B is therefore narrowed:** "unify" = unify *delivery* (install staging), not *runtime invocation form*. Hooks keep `superskill hook run <plugin> <id>`; staged paths are the standard surface for non-hook callers (skill docs, `validate-response` direct invocation, future third-party tooling) per tasks 0092/0093.


| Target | Emitter | Recommended form works unchanged? | Notes |
|--------|---------|-----------------------------------|-------|
| **pi** | `emitPiStyleHooks` (`hooks.ts:205`) → `@vahor/pi-hooks` config | ✅ works | Command string `superskill hook run …` is what pi's shim execs; no path rewrite needed. Multi-plugin merge (`mergePiHooks` `hooks.ts:160`) keyed on command string — preserved. |
| **hermes** | `emitHermesHooks` (`hooks.ts:307`) → `.hermes/hooks.json` (opencode surrogate) | ✅ works | Canonical format; merge keyed on `(matcher, command)` signature (`hooks.ts:274`). Absolute paths would force a new signature dimension. |
| **omp** | `generateOmpHookModules` (`omp-hooks.ts:156`) → `hooks/pre\|post/*.js` | ✅ works | Generated JS shells out to `superskill hook run` via `spawnSync` (`omp-hooks.ts:128-141`); the CLI is already a runtime dep. Rewrite to FS path would duplicate the spawn logic per hook. |
| **codex** (rulesync) | `runRulesyncImpl` hooks pass at `install.ts:287` | ✅ works | Writes native-format hooks referencing the PATH binary. |
| **opencode** (rulesync) | same | ✅ works | Same. |
| **antigravity-\*** (rulesync) | same | ✅ works | Same. |
| **grok** | native Claude-format package install | ✅ works | Consumes canonical `hooks.json` verbatim — no emitter transform. |
| **claude** | native plugin install (cache) | ✅ works | Reads canonical `hooks.json` from plugin cache; `${CLAUDE_PLUGIN_ROOT}` was already retired for cross-target hooks and stays retired (R2 honored). |

**Zero emitters require changes.** That is the decisive portability argument.


**Stays as-is, unchanged in role.** When hooks keep `hook run`:

- `minCliVersion` (e.g. `0.2.19` in `hooks.json:2`) guarantees the installed CLI recognizes the hook id (`anti-hallucination`) and enforces it. An older CLI skips ALL hook emission (`install.ts:178-184`) so the user gets skills/commands without a broken Stop pipeline.
- If hooks moved to staged FS paths (Options 2/3/4), `minCliVersion` could not enforce hook *semantics* — only file presence. A stale path after partial reinstall would crash with no version-skew safety valve. That is the decisive skew argument for keeping Option 1.
- **Skew failure mode (documented):** unknown hook id → `hook-run.ts:339-347` warns loudly + exits 0 (fail-open, ADR-020). This is intentional: version skew must not wedge agent Stops. Hooks on FS paths would replace this with hard `ENOENT` failures.


Preserved unchanged. The Stop guard returns exit 2 to block (`hook-run.ts:62`); validation-CLI entrypoints (exit 0/1) are NEVER wired as Stop blockers without the registry adapter that `hook run` provides. Entrypoint Contract v1 (task 0089) explicitly reserves exit 2 for hook blocks and exit 0/1 for validation CLIs — that contract is honored precisely *because* hooks route through `hook run` (the adapter), not through raw staged-path invocation.


Preserved unchanged. Pi dedups by command string (`hooks.ts:174-192`); hermes by `(matcher, command)` signature (`hooks.ts:274-296`). Both rely on the command being a stable comparable string — which `superskill hook run <plugin> <id>` is. Absolute-path rewrite (Options 2/4) would change the dedup key to `(plugin, abs_path)`, breaking last-installed-wins semantics for unrelated entries and requiring a per-plugin namespacing pass.


- [x] **No `${CLAUDE_PLUGIN_ROOT}` / `$CLAUDE_PLUGIN_ROOT` / rulesync `$PLUGIN_ROOT`** as the sole portable mechanism. Recommended form is PATH-resolved `superskill` binary — a single assumption shared by every emitter today.
- [x] **No `minCliVersion` regression** — floor stays, gate stays, role unchanged.
- [x] **No emitter rewrite** — all six emitter classes work unchanged.
- [x] **Multi-plugin merge preserved** — dedup keys unchanged.
- [x] **Fail-open preserved** — ADR-020 unknown-id behavior intact.
- [x] **No new host-shell assumptions** — PATH binary + `spawnSync` already assumed by omp; no shell-required invocation introduced.
- [x] **R6-B intent satisfied** — delivery unified at install (staging lands for non-hook; hooks share the install pipeline); only the runtime invocation form stays CLI-mediated, by design.


**Primary: Option 1 — keep `superskill hook run` as the sole hooks.json command form.**

**R6-B amendment (feature A Decisions so far):** reinterpret "unify" as unify *delivery* (install staging for scripts; hooks already share the install pipeline), NOT unify *runtime invocation form*. Hooks stay PATH-based CLI invocations; staged script paths are the standard surface for non-hook callers only. This closes R6-B at the intent level without the high-regression absolute-path rewrite.


| WBS (proposed) | Title | Dependency |
|----------------|-------|------------|
| **0095** (existing) | Supersede ADR-015 "copied on install" wording + extend ADR-022 scope to cover staging | 0094 (this) |
| **0096 (new, proposed)** | Author `.js` twin for `validate_response.ts` + `ah_guard.ts` — replace `Bun.env` with `process.env`, `import.meta.main` with `process.argv[1]` check; bring cc plugin into Entrypoint Contract v1 compliance for the non-hook path | 0093 (done), 0094 (this) |
| (none — design only) | No emitter changes follow from this recommendation | — |

The `.js` twin (proposed 0096) was flagged as a P2 finding in task 0093's review. It is the natural follow-up to 0093/0094: it closes the interim-honesty gap documented in commit `9ca2d13` and brings the cc plugin's own scripts into contract compliance. It does NOT touch hooks — hooks stay on `hook run`.

**No deprecation of `hook run` is recommended.** `hook run` remains the canonical, portable, fail-open-safe hooks.json form for the foreseeable future.

### Testing
N/A — design artifact only (AC6). All citations are `file:line` references read in this session against the current working tree (`b669837` + `9ca2d13`); no code was executed.

Verification of non-regression claims was by code inspection:
- `hooks.ts:174-192` — pi dedup by command string (confirmed).
- `hooks.ts:274-296` — hermes dedup by `(matcher, command)` signature (confirmed).
- `omp-hooks.ts:128-141` — generated module shells out to `superskill` binary (confirmed).
- `install.ts:178-184,287,342,368,399,744-746` — `hooksBlockedByCliVersion` honored across every emitter branch (confirmed).
- `hook-run.ts:339-347` — unknown id fail-open with loud warning (confirmed).
- `install.ts:921-946` — `stagePluginScripts` lands at `~/.agents/scripts/<plugin>/` (confirmed, task 0090).
- `install.ts:450` — `needsSharedScriptsRoot` native-class skip gate (confirmed).

### Review
| Severity | Finding | Status |
|----------|---------|--------|
| P1 | Recommendation keeps `hook run` — does this leave R6-B literally unmet? | DONE — R6-B intent reinterpreted (unify = delivery, not runtime form); explicit amendment on feature A Decisions so far closes the literal reading with rationale. |
| P2 | `minCliVersion` policy: is the floor still required if staging always lands files? | DONE — floor unchanged; it guarantees registry id resolution, not file presence. Stale-path crash mode documented as the cost of the rejected alternatives. |
| P2 | Multi-plugin merge under Option 1: confirm dedup keys survive unchanged. | DONE — pi/hermes dedup keys (`hooks.ts:174`, `hooks.ts:274`) cited; both rely on command-string stability which Option 1 preserves. |
| P3 | Option 3 (`hook exec <rel>`) was rejected but could be a future migration path if registry semantics ever become a bottleneck. | OPEN → none — noted as a deferred alternative in the options table; no follow-up task warranted until a concrete need surfaces. |
| P3 | The `.js` twin gap (commit `9ca2d13`) is not closed by this task. | OPEN → 0096 (proposed) — new task proposed in follow-ups; this task's scope is hook-path design only. |
| P4 | Reviewer should sanity-check that no skill doc or emitter was silently edited (AC6: no code required). | DONE — working tree clean post-`9ca2d13`; this task writes only to `## Solution` / `## Testing` / `## Review` and to feature A Decisions so far. |

**Outcome:** design artifact complete; R6-B closed at intent level; one new follow-up (proposed 0096) identified.
### References
- Feature map: `docs/features/A_portable-plugin-scripts-via-install-time-staging.md` (R6-B)
- Canonical hooks: `plugins/cc/hooks/hooks.json` (`hook run`, minCliVersion)
- Emitters: `apps/cli/src/hooks.ts` (emitPiStyleHooks, emitHermesHooks, readCanonicalHooks)
- Install gate: `apps/cli/src/commands/install.ts` (minCliVersion / hooksBlockedByCliVersion)
- Hook run + fail-open: `apps/cli/src/commands/hook-run.ts`, ADR-020/021/022 in `docs/00_ADR.md`
- Prerequisites: path inventory research; entrypoint contract grilling
- Related: staging, path helper (non-hook standard path)
### History
- 2026-07-17T22:26:29.046Z todo → wip (system)
- 2026-07-17T22:26:56.904Z wip → testing (system)
- 2026-07-17T22:28:31.405Z testing → done (system)
