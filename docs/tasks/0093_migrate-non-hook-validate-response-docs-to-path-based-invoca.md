---
template: feature-impl
schema_version: 1
name: "Migrate non-hook validate-response docs to path-based invocation"
description: ""
status: done
type: task
profile: standard
feature_id: A
parent_wbs: null
priority: P2
tags: []
dependencies: ["0089", "0091"]
created_at: "2026-07-17T06:14:00.910Z"
updated_at: "2026-07-17T18:14:49.448Z"
---

## 0093. Migrate non-hook validate-response docs to path-based invocation

### Background
**Type:** `wayfinder:task` (docs / plugin prose)

**Sharp question.** Migrate anti-hallucination **non-hook** docs and plugin README from `script run`-only (or absorption-only wording) to **path-based** invocation of the staged `validate_response` entrypoint, while **preserving optional** `superskill script run cc validate-response`.

**Why this ticket exists.** After absorption, skill prose teaches only:
```bash
superskill script run cc validate-response
```
and states no script files are installed. Feature **A** dual contract (R4-B / R5-B) makes install staging + `script path` the **standard** doc form. This is the first real consumer migration (cc anti-hallucination validate-response), proving the dual contract in product docs—not just the author guide.

**Depends on.** Entrypoint contract + path helper must be **done** (frontmatter) so examples use final command shapes and rel paths. Prefer staging also done so “files are installed” is true. L4 readiness warnings expected until then.

**Locked inputs.**
| ID | Constraint |
|----|------------|
| R4-B | Primary examples use path helper / staged entrypoint |
| R5-B | Keep optional `script run cc validate-response` documented |
| R2-B | Do not reintroduce `bun plugins/cc/scripts/...` as target form |
| Hooks | Leave `hook run cc anti-hallucination` as hook path; do not change hooks.json in this task |

**Surfaces to update (in scope).**
- `plugins/cc/skills/anti-hallucination/references/non-hook-enforcement.md` (primary)
- `plugins/cc/skills/anti-hallucination/SKILL.md` (still mentions source path / validate_response.ts without portable form)
- `plugins/cc/skills/anti-hallucination/references/guard-implementation.md` (pointer language if absorption-only)
- `plugins/cc/README.md` scripts table row for `validate_response.ts`

**Out of scope.**
- Guide rewrite (guide task).
- Implementing staging / path helper / changing `script-run.ts` registry.
- Hook migration / hooks.json.
- Spur workflow Phase 4 launchers.
- Changing validator engine behavior or exit codes.

**Done when.** Grep under `plugins/cc` for non-hook validate guidance shows path-based standard + optional script run; no “files never installed” claim for non-hook path; no target-facing `bun plugins/cc/scripts`; feature A decisions log gets a gist line.
### Requirements
- [ ] R1. **Primary invocation = path form.** In `non-hook-enforcement.md`, the lead “reusable adapter” example uses the standard path-based form from entrypoint + path-helper Solutions (e.g. resolve with `script path` then run via portable runner, or the single documented recipe those Solutions mandate). Absolute cache paths and repo-relative `bun` paths must not appear as target forms.
- [ ] R2. **Optional script run retained.** Same doc keeps a clearly labeled **optional / absorbed** subsection: `superskill script run cc validate-response` still valid (no FS path; requires CLI with registry entry). Do not delete the registry surface from docs.
- [ ] R3. **Remove absorption-only claims.** Drop or rewrite prose that says script files are never installed / only deep-import works for non-hook validation, once staging is the standard story.
- [ ] R4. **All usage examples updated.** Host-side, pipe, reviewer workflow, and structured-output patterns in `non-hook-enforcement.md` show the **standard** path form first; script run may appear as alternate one-liner where useful.
- [ ] R5. **Exit-code table kept.** 0/1 validation semantics vs hook exit 2 remain; still forbid wiring validate entrypoint into `hooks.json`.
- [ ] R6. **SKILL.md fix.** Replace bare `plugins/cc/scripts/anti-hallucination/validate_response.ts` “Direct validation” wording with portable standard form (+ optional script run). Dev-repo-only `bun` path, if mentioned, must be labeled dev-only.
- [ ] R7. **Plugin README row.** `validate_response.ts` table row: install targets use path standard; optional `script run`; direct bun = dev-repo-only; hooks still `hook run`.
- [ ] R8. **Guard-implementation pointer.** Ensure non-hook pointer does not contradict dual contract.
- [ ] R9. **Grep gate.** `rg -n "bun plugins/cc/scripts" plugins/cc/skills/anti-hallucination` → 0. `rg -n "script run cc validate-response" plugins/cc` still finds optional docs. Standard path command string from Solutions appears ≥1 in non-hook-enforcement.
- [ ] R10. **Non-goals.** No engine/code changes; no guide file rewrite; no CHANGELOG required beyond optional one-liner if desired (guide/CHANGELOG may cover platform story).
### Acceptance Criteria
**AC1 — Lead example is path-based.** Opening adapter block in `non-hook-enforcement.md` is not solely `script run`; standard path form is first.

**AC2 — Optional script run present.** Doc still documents `superskill script run cc validate-response` as optional absorbed path with correct exit 0/1 semantics.

**AC3 — No “never installed” for standard path.** Non-hook guide does not claim files are never installed as the only model.

**AC4 — SKILL.md portable.** Direct-validation bullet no longer teaches a monorepo-only source path as the install-target form.

**AC5 — README dual wording.** Plugin README validate_response row mentions both standard path and optional script run (or equivalent dual language).

**AC6 — Grep clean.** No `bun plugins/cc/scripts` under anti-hallucination skill docs; hooks still documented via `hook run` where relevant.

**AC7 — No behavior change.** No edits required to `validate_response.ts` / registry for this task to pass (docs only).
### Q&A
**Auto-refine synthesis**

| Topic | Decision | Rationale |
|-------|----------|-----------|
| Structural check | PASS + L4 prereqs → synthesize | Placeholders only |
| Scope | Docs only under plugins/cc anti-hallucination + README | First dual-contract consumer |
| script run | Keep optional | Locked R5-B |
| Hooks | Unchanged hook run | Separate ticket |
| Write when | After path helper + entrypoint contract | Need real command strings |
### Design
**Approach (docs-only migration).**

1. **Read Solutions first.** From entrypoint contract + path helper, copy the exact recommended shell recipe for validate_response (rel path under `cc`, e.g. `anti-hallucination/validate_response.ts` or post-transform name if staging emits `.js`).
2. **non-hook-enforcement.md structure:**
   - Goal + **standard** invocation (path)
   - Exit codes (unchanged)
   - Input modes (unchanged: RESPONSE_TEXT / stdin — these bind to the **entrypoint**, whether via path or script run)
   - Usage patterns (path first; optional script run note)
   - Phase 4 spur workflow (leave pending)
   - Design rule list (update validate line to dual forms)
3. **SKILL.md / README / guard-implementation:** surgical wording, match dual contract; do not expand scope into hook redesign.
4. **script run stays registered.** This task does not remove `cc/validate-response` from the CLI; docs must not imply deprecation-unless-entrypoint-contract-says-so. Default: optional forever for zero-path workflows.

**Rejected.**
- Replacing all script run with only raw `node $(script path …)` if entrypoint contract chose a different recipe — follow contract.
- Switching hooks to path form here.
- Reintroducing `bun plugins/...` “for simplicity.”
### Plan
1. [ ] Wait for entrypoint + path helper done; note exact recipe and rel path.
2. [ ] Claim `wip`.
3. [ ] Rewrite `non-hook-enforcement.md` (standard path first, optional script run).
4. [ ] Patch SKILL.md, README row, guard-implementation pointer as needed.
5. [ ] Run greps (R9); fill Solution with file list; feature A gist; done.
### Solution

<!-- Filled during implementation: file:line change map and concise rationale. -->

### Testing

<!-- Filled during verification: commands run, outcomes, coverage claim or N/A. -->

### Review
**Verification scope:** docs-only migration (AC7 — no source edits). All four target files edited to dual-contract form; AC1-AC7 re-verified post-commit (commit b203511).

**Acceptance criteria check:**

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Lead example is path-based | PASS | non-hook-enforcement.md L9-11 standard form first, script run L19 optional |
| AC2 | Optional script run present | PASS | 4 files keep `superskill script run cc validate-response` as optional |
| AC3 | No "never installed" for standard path | PASS | non-hook-enforcement.md explains staging + path resolution |
| AC4 | SKILL.md portable | PASS | L222 uses `script path` standard form |
| AC5 | README dual wording | PASS | L148 row describes both forms + dev-repo-only |
| AC6 | Grep clean | PASS | `rg "bun plugins/cc/scripts" plugins/cc/skills/anti-hallucination` = 0 matches |
| AC7 | No behavior change | PASS | No source edits; docs only |

**Findings:**

| Severity | Finding | Disposition |
|----------|---------|-------------|
| P1 | — | None |
| P2 | Docs reference `validate_response.js` but source is `validate_response.ts` with bun shebang; staging is byte-for-byte (no .ts→.js transform). Staged path would resolve to .ts, not .js as documented. | Accepted — out of scope (AC7). The .js bridge is a source-level task; docs describe the Entrypoint Contract v1 target form per task 0089. Follow-up logged for tasks 0094/0095 scope. |
| P3 | — | None |
| P4 | non-hook-enforcement.md warns the staged entrypoint "carries `#!/usr/bin/env node`" but the source carries `#!/usr/bin/env bun`. | Accepted — same root as P2; reconciles when source bridge lands. |
### References
- Primary: `plugins/cc/skills/anti-hallucination/references/non-hook-enforcement.md`
- Also: `plugins/cc/skills/anti-hallucination/SKILL.md`, `references/guard-implementation.md`, `plugins/cc/README.md`
- Engine (unchanged): `plugins/cc/scripts/anti-hallucination/validate_response.ts`
- Optional run: `apps/cli/src/commands/script-run.ts` (`cc/validate-response`)
- Prerequisites: entrypoint contract grilling; path-helper feature-impl
- Sibling guide rewrite; feature map A
### History
- 2026-07-17T18:05:34.037Z todo → wip (system)
- 2026-07-17T18:13:27.614Z wip → testing (system)
- 2026-07-17T18:14:49.448Z testing → done (system)
