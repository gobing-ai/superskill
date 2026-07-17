---
template: brainstorm
schema_version: 1
name: "Design hook-path unification without CLAUDE_PLUGIN_ROOT regression"
description: ""
status: todo
type: brainstorm
profile: standard
feature_id: A
parent_wbs: null
priority: P2
tags: []
dependencies: ["0088", "0089"]
created_at: "2026-07-17T06:14:02.191Z"
updated_at: "2026-07-17T06:54:16.547Z"
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
- [ ] R1. **Options analysis.** Evaluate at least three directions with pros/cons:
  1. **Keep `hook run` as the only hooks.json form** (R6-B satisfied by “staged files exist for inspection/debug only”).
  2. **Install-time command rewrite:** emitters rewrite each hook command to a target-local absolute path (or host-native relative) under staged/native scripts roots.
  3. **PATH wrapper that resolves then execs:** e.g. `superskill hook exec <plugin> <rel>` or `superskill script path` + shell — still PATH-portable, may still need minCliVersion.
  4. (Optional fourth) Hybrid: registry hooks stay on `hook run`; simple shell hooks may use staged paths where host guarantees root.
- [ ] R2. **No Claude-only roots.** Recommended form MUST NOT require `${CLAUDE_PLUGIN_ROOT}`, `$CLAUDE_PLUGIN_ROOT`, or rulesync `$PLUGIN_ROOT` as the sole portable mechanism for multi-target plugins.
- [ ] R3. **minCliVersion policy.** State what happens when hooks stop calling `hook run`: is minCliVersion still required, repurposed, or only for residual registry hooks? Document skew failure mode (fail-open vs broken Stop).
- [ ] R4. **Emitter impact matrix.** For pi, hermes, omp, rulesync (codex/opencode/antigravity), grok, claude: state whether recommended form works with **existing** emitters unchanged, needs rewrite, or is unsupported.
- [ ] R5. **Exit-code / block semantics.** Hook block remains exit 2 (or host equivalent). Staged entrypoints that are validation-CLI (exit 0/1) MUST NOT be recommended as Stop blockers without an adapter. Preserve ADR-020 intent for unknown registry ids if `hook run` remains.
- [ ] R6. **Multi-plugin merge.** Pi/hermes merge into shared hooks.json must still allow multiple plugins’ hooks without path collisions or last-writer-wins on unrelated entries.
- [ ] R7. **Recommendation + decision.** Pick one primary direction; if R6-B full unify is high-risk, recommend phased approach (e.g. keep hook run for Stop guards; stage files for non-hook only) and explicitly amend feature A fog/R6-B interpretation.
- [ ] R8. **Follow-ups.** List concrete implementation tasks (or “none — design only closes R6-B as keep hook run”) with suggested dependency order.
- [ ] R9. **Deliverable placement.** Write full analysis in Solution; gist on feature A; no production code.
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

<!-- Final synthesized recommendation or output from the brainstorm. -->

### Testing

<!-- Validation performed for claims, links, or feasibility. Use N/A when not applicable. -->

### Review

<!-- Risks, open concerns, and follow-up review notes. -->

### References
- Feature map: `docs/features/A_portable-plugin-scripts-via-install-time-staging.md` (R6-B)
- Canonical hooks: `plugins/cc/hooks/hooks.json` (`hook run`, minCliVersion)
- Emitters: `apps/cli/src/hooks.ts` (emitPiStyleHooks, emitHermesHooks, readCanonicalHooks)
- Install gate: `apps/cli/src/commands/install.ts` (minCliVersion / hooksBlockedByCliVersion)
- Hook run + fail-open: `apps/cli/src/commands/hook-run.ts`, ADR-020/021/022 in `docs/00_ADR.md`
- Prerequisites: path inventory research; entrypoint contract grilling
- Related: staging, path helper (non-hook standard path)
### History
