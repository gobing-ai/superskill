---
template: standard
schema_version: 1
name: "Define portable entrypoint contract for staged plugin scripts"
description: ""
status: todo
type: task
profile: standard
feature_id: A
parent_wbs: null
priority: P2
tags: []
dependencies: []
created_at: "2026-07-17T06:13:55.464Z"
updated_at: "2026-07-17T06:45:27.914Z"
---

## 0089. Define portable entrypoint contract for staged plugin scripts

### Background
**Type:** `wayfinder:grilling`

**Sharp question.** What is the portable entrypoint contract for staged plugin scripts (allowed runtimes, shebang/node policy, forbidden invocation forms, and how skill docs must invoke them)?

**Why this ticket exists.** Feature **A** chose install-time staging (C) plus a portable runner contract (R2-B), path helper in docs (R4-B), and dual surface with optional `script run` (R5-B). Downstream work (**0090** staging shape, **0091** `script path` CLI, **0092** guide rewrite, **0093** validate-response migration, **0094** hook-path design) needs a written contract so they do not invent incompatible entrypoint rules. This ticket **decides and records** the contract; it does not implement staging or the path helper.

**Locked inputs from discovery (do not re-open unless Solution explicitly supersedes with rationale).**
| ID | Constraint on this contract |
|----|-----------------------------|
| R2-B | No Bun-required-on-targets as the portable story |
| R3-B | Files land at native plugin `scripts/` and/or `~/.agents/scripts/<plugin>/` (exact roots: research ticket) |
| R4-B | Skill docs use superskill-resolved paths — never repo-relative `bun plugins/...` or hard-coded cache paths |
| R5-B | Path-based invocation is **standard**; `superskill script run` registry remains **optional** for absorbed pure engines |
| R6-B | Hooks are in scope for the *eventual* path model, but **hook command rewrites** are owned by the hook-design ticket — this ticket only defines the entrypoint file contract hooks would call |

**In scope.**
- Classify files under `plugins/<plugin>/scripts/**`: **entrypoint** vs **library** (shared modules).
- Allowed runtimes / shebangs for staged entrypoints on install targets.
- Forbidden invocation patterns in skill docs, hooks.json, and guides.
- Canonical doc invocation form using the path helper (shape only; CLI flags owned by path-helper task).
- Exit-code semantics by class (validation CLI vs hook block — do not collapse them).
- Dual-contract rule: when to use path invocation vs optional `script run`.
- Anti-patterns table suitable for the guide rewrite.

**Out of scope.**
- Implementing install staging or copying files (staging task).
- Implementing `superskill script path` flags/JSON (path-helper task).
- Full hooks.json migration and emitter rewrites (hook-design task).
- Rewriting production skill docs (migrate task) or ADRs (ADR task) — only define the contract they must follow.
- Changing existing `script run` / `hook run` code in this WBS.

**Done when.** Solution holds a numbered **Entrypoint Contract v1** (normative bullets + anti-patterns + dual-contract decision table) that sibling tickets can cite; feature **A** `## Decisions so far` gets one gist line.
### Requirements
- [ ] R1. **Entrypoint vs library.** Define how plugin authors mark or recognize an install-target **entrypoint** vs a shared library file under `plugins/<plugin>/scripts/<feature>/` (naming, shebang, or convention). Libraries must not be documented as direct agent invocations.
- [ ] R2. **Allowed runtimes.** Specify which runtimes are portable on install targets for staged entrypoints (e.g. `node` with `.js` / `.mjs`, POSIX `sh`/`bash`, or install-emitted JS). Explicitly state that **requiring Bun on the target** is non-portable and not part of the standard contract (R2-B). Dev-repo-only `bun <source.ts>` may remain a developer convenience, never a skill-doc form.
- [ ] R3. **Shebang / file shape.** Specify required or recommended shebang and file extensions for staged entrypoints; what install may rewrite vs leave as-is (decision recorded even if "install does not rewrite" is the answer).
- [ ] R4. **Forbidden invocation forms.** Enumerate banned patterns for skill docs and cross-target hooks, including at least: repo-relative `bun plugins/...`; bare relative `scripts/foo.ts` without path resolution; `${CLAUDE_PLUGIN_ROOT}` as the *only* portable form for non-Claude targets. Note Claude-only exceptions if any (must be labeled non-portable).
- [ ] R5. **Canonical doc form.** Specify how skill docs must invoke staged entrypoints once the path helper exists (e.g. command substitution / documented env / fixed CLI shape). Reference path-helper task for CLI details; this task owns the **author-facing contract**, not the implementation.
- [ ] R6. **Exit-code classes.** Separate validation-CLI semantics (0 pass / 1 fail) from hook-block semantics (exit 2). Contract must forbid wiring a validation entrypoint into `hooks.json` as if it were a hook blocker.
- [ ] R7. **Dual contract (path vs script run).** Decision table: when authors use staged path invocation (default) vs optional `superskill script run <plugin> <id>` (registry absorption). State that adding a registry entry requires a CLI release (existing ADR-022 coupling) and is not required for every script.
- [ ] R8. **Deliverable placement.** Write **Entrypoint Contract v1** into Solution; append one gist line to feature **A** `## Decisions so far`. No product code changes under this WBS.
### Acceptance Criteria
**AC1 — Normative contract exists.** Solution contains a clearly titled Entrypoint Contract v1 with MUST/MUST NOT (or equivalent normative language) covering runtimes, forbidden forms, and doc invocation.

**AC2 — R2-B honored.** Contract does not make Bun a required target runtime for the standard path; if Bun is mentioned, it is explicitly dev-repo-only or optional.

**AC3 — Dual contract table.** Solution includes a short table or bullets: path-based (standard) vs `script run` (optional), with at least one concrete example each (e.g. future staged validator vs current `cc/validate-response` registry entry).

**AC4 — Exit-code separation.** Validation CLI vs hook-block exit codes are distinguished; contract states validation entrypoints must not be used as hook block signals.

**AC5 — Downstream-citable.** Contract is specific enough that staging, path-helper, and guide tasks can implement without re-grilling the same questions (or lists open sub-questions deferred with owners).

**AC6 — Map updated.** Feature A `## Decisions so far` gets a gist line for this ticket after Solution is written (execution session — not part of refine).
### Q&A
**Auto-refine synthesis (session)**

| Topic | Decision | Rationale |
|-------|----------|-----------|
| Ticket type | Keep `wayfinder:grilling` — decision artifact only | Contract unblocks siblings; no code in this WBS |
| Structural check | PASS with empty sections → synthesize content | Same as inventory ticket: check gates presence, refine fills content |
| Relationship to inventory | Parallel frontier; may provisional-note path roots | Runner policy does not require finished path table |
| Bun | Explicitly non-portable for standard target contract | Locked R2-B |
| Hooks | Entrypoint file rules only; command migration separate | Hook-design ticket owns R6-B emitters |
| Dual contract | Path standard; `script run` optional | Locked R5-B |
### Design
**Method (grilling / decision — no product code).**

1. **Anchor on locked discovery.** Treat R2-B / R4-B / R5-B as constraints. Prefer the dual-contract model already locked over inventing a third surface.
2. **Ground in existing anti-patterns.** Reuse lessons from:
   - `docs/help/how_to_organize_scripts_for_plugin_development.md` (two-class model, anti-patterns)
   - anti-hallucination path failures (`bun plugins/cc/scripts/...`, `${CLAUDE_PLUGIN_ROOT}`)
   - `script run` / `hook run` exit-code semantics already shipped
3. **Decide, do not implement.** For each R-item, pick one normative rule. If a detail depends on path inventory research, write a provisional rule + "depends on path inventory" rather than blocking entirely — path roots and runner policy can be specified independently of exact cache paths.
4. **Output shape (Solution).**
   - Entrypoint Contract v1 (numbered MUST/MUST NOT)
   - Dual-contract decision table
   - Anti-patterns table (pattern / why wrong / do instead)
   - Deferred items (owned by staging / path-helper / hook-design) if any
5. **Do not** rewrite the guide or skill docs here — only define what they must later say.

**Recommended lean default (seed for execution; may adjust with evidence).**
- Standard: staged entrypoint is **Node-runnable JS** or **POSIX shell** with shebang; skill docs invoke via path helper output.
- Libraries: plain modules next to entrypoints; no direct doc invocation.
- Optional: pure TS engines may stay deep-imported via `script run` / `hook run` without being the doc-facing path for new scripts.
- Forbidden: `bun plugins/...` and cache-hardcoded paths in docs.
### Plan
1. [ ] Claim ticket: `spur task update 0089 wip`.
2. [ ] Re-read feature A locked decisions + current guide anti-patterns section.
3. [ ] Skim `script-run.ts` / `hook-run.ts` exit-code and fail-open notes for dual-contract language.
4. [ ] Draft Entrypoint Contract v1 answering R1–R7; mark any path-root-dependent clauses provisional.
5. [ ] Write dual-contract table + anti-patterns; fill Solution; tick Requirements.
6. [ ] Append gist to feature A `## Decisions so far`; set this ticket `done`.
7. [ ] Stop (wayfinder: one ticket per session) — do not implement staging or path helper here.
### Solution

<!-- Filled during implementation: file:line change map and concise rationale. -->

### Testing

<!-- Filled during verification: commands run, outcomes, coverage claim or N/A. -->

### Review

<!-- Filled during review: P1-P4 findings, residual risk, and final disposition. -->

### References
- Feature map: `docs/features/A_portable-plugin-scripts-via-install-time-staging.md` (R2-B, R4-B, R5-B)
- Guide (to be rewritten later): `docs/help/how_to_organize_scripts_for_plugin_development.md`
- Optional run surface: `apps/cli/src/commands/script-run.ts`
- Hook run surface: `apps/cli/src/commands/hook-run.ts`
- ADR-015 / ADR-022: `docs/00_ADR.md`
- Sibling inventory: path research ticket under feature A
- Downstream: staging, path helper, guide rewrite, non-hook migrate, hook-path design
### History
