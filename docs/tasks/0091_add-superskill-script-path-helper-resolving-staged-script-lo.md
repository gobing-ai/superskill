---
template: feature-impl
schema_version: 1
name: "Add superskill script path helper resolving staged script locations"
description: ""
status: todo
type: task
profile: standard
feature_id: A
parent_wbs: null
priority: P2
tags: []
dependencies: ["0090"]
created_at: "2026-07-17T06:13:58.016Z"
updated_at: "2026-07-17T06:49:15.085Z"
---

## 0091. Add superskill script path helper resolving staged script locations

### Background
**Type:** `wayfinder:task` (feature-impl)

**Sharp question.** What is the `superskill script path <plugin> <rel-or-id>` CLI contract (resolution order, `--json` shape, exit codes, global vs project root) so skill docs never hardcode cache or repo paths?

**Why this ticket exists.** Feature **A** locked R4-B: skill docs use a superskill-resolved path, not `bun plugins/...` or hard-coded `~/.claude/plugins/cache/...`. Staging (**0090**) puts files on disk; this task is the **author- and agent-facing resolver**. Downstream guide rewrite and non-hook doc migrate depend on a stable command shape.

**Depends on.** Staging must be **done** first (frontmatter → staging task). Also consume path inventory + entrypoint contract Solutions for exact roots and relative-path conventions. L4 readiness warnings are expected until those land. Do not implement while staging layout is still provisional.

**Locked inputs.**
| ID | Constraint |
|----|------------|
| R4-B | Docs use path helper; never hardcode cache/repo paths |
| R3-B | Resolution must understand native plugin `scripts/` and agents scripts root |
| R5-B | Path is **standard** invoker input; `script run` remains optional parallel surface |
| R2-B | Helper returns a filesystem path; it does not require Bun to resolve |

**In scope.**
- CLI: `superskill script path <plugin> <rel-or-id>` under the existing `script` parent (alongside `script run`).
- Resolution algorithm across candidate roots (project vs global; agents scripts root vs native plugin install roots when discoverable).
- Human stdout (absolute path, single line) and `--json` machine shape.
- Exit codes: found vs not found vs bad args (distinct from `script run` fail-open-on-unknown-id).
- Optional: bare `script path <plugin>` lists known relative entrypoints if registry/staging metadata allows; otherwise document "rel path required".
- Unit tests with injectable roots/fs; CHANGELOG note.

**Out of scope.**
- Implementing install staging (staging task).
- Rewriting skill docs / guide (migrate + guide tasks) — only ship the verb they will cite.
- Executing the script (`script run` or shelling out).
- Hook emitter rewrites to call `script path` (hook-design task).
- Registering new `ScriptRunner` entries.

**Done when.** From any cwd, with staged or native scripts present, `script path` prints a resolvable absolute path (or structured JSON); missing scripts fail closed with a clear error; tests green; feature A decisions log gets a gist line.
### Requirements
- [ ] R1. **Verb registration.** Add `path` subcommand under existing `script` group: `superskill script path <plugin> <rel-or-id>`. Export registration via the same `registerScriptRun` module **or** a focused sibling export that still satisfies `cli-register-pattern` (prefer extending `script-run.ts` / split `script-path.ts` wired from `cli.ts` — pick one in Design, keep one parent `script` command).
- [ ] R2. **Positional args.** `<plugin>` is the plugin name segment (e.g. `cc`). `<rel-or-id>` is a path relative to that plugin's scripts root (e.g. `anti-hallucination/validate_response.ts`) **or** a short id if Design defines an id→rel map; prefer relative path as the universal form so no CLI release is required per script (contrast with `script run` registry).
- [ ] R3. **Resolution order.** Document and implement a fixed search order, provisional default (adjust when inventory/staging Solutions land):
  1. Project agents scripts root: `<project>/.agents/scripts/<plugin>/<rel>`
  2. Global agents scripts root: `~/.agents/scripts/<plugin>/<rel>`
  3. Discoverable native plugin install roots (Claude/OMP/Grok cache or install path) if a reliable resolver already exists in install code; otherwise skip with documented "not probed" and rely on agents root after staging dual-write policy is settled.
  First existing file wins. Never search the monorepo `plugins/` tree on end-user machines as the primary hit.
- [ ] R4. **Stdout contract (default).** On success, print **one absolute path** and a trailing newline to stdout (no extra prose). Suitable for `$(superskill script path …)` / command substitution.
- [ ] R5. **`--json` shape.** On success, print a single JSON object, e.g. `{"plugin":"cc","rel":"…","path":"/abs/…","root":"project"|"global"|"native","source":"<root kind>"}`. On failure, JSON error object on stderr or stdout with non-zero exit — pick one channel in Design and test it; prefer stderr for errors + non-zero exit, stdout empty.
- [ ] R6. **Exit codes.** `0` = path found and is a file (or Design-allowed executable). `2` = not found after full search (fail **closed** — path resolution is not version-skew fail-open). `1` = usage/invalid args. Do not mirror `script run` unknown-id exit 0.
- [ ] R7. **Global vs project.** Prefer project root when a project scripts tree exists for that plugin+rel; else global. Optional flag `--global` / `--project` to force one root when both exist (recommended for multi-root machines — include if low cost).
- [ ] R8. **Safety.** Reject `rel` with `..` segments or absolute paths; plugin name must be a single path segment (same discipline as mapper plugin names).
- [ ] R9. **Tests.** Unit tests: hit project, hit global, miss → exit 2, `..` rejection, `--json` success shape, missing args → usage exit 1. Injectable home/cwd/fs seams — no dependency on real user cache.
- [ ] R10. **Docs.** CHANGELOG `[Unreleased]` entry; brief help text on the command. Full guide prose is the guide task; this task may add a one-liner to `docs/help` index or install/script section only if a tiny pointer is needed.
- [ ] R11. **Non-goals.** No execution of the resolved file; no skill markdown rewrites; no removing `script run`.
### Acceptance Criteria
**AC1 — Resolve from agents root.** Given a temp home with `~/.agents/scripts/cc/anti-hallucination/validate_response.ts`, `superskill script path cc anti-hallucination/validate_response.ts` exits 0 and prints that absolute path.

**AC2 — Project wins over global.** Given the same rel in both project and global agents scripts roots, default resolution returns the **project** path (unless `--global` forces global).

**AC3 — Not found fails closed.** Missing file after search exits **2** (not 0), with a stderr message naming plugin, rel, and roots searched (or equivalent clarity).

**AC4 — Path traversal rejected.** Rel containing `..` or absolute form exits **1** (usage/invalid); no filesystem escape.

**AC5 — JSON success.** `--json` success payload includes absolute `path` and enough fields for agents to parse without regexing prose.

**AC6 — Does not run the script.** Invoking `script path` never executes the target file (no spawn of node/bun on the path).

**AC7 — Gates.** Lint + unit tests for the new command pass; existing `script run` tests remain green.
### Q&A
**Auto-refine synthesis**

| Topic | Decision | Rationale |
|-------|----------|-----------|
| Structural check | PASS + L4 prereqs → synthesize content | Placeholders only |
| Implement when | After staging done | Needs real layout on disk |
| Fail closed | Exit 2 on miss | Path miss is not CLI skew |
| rel form | Relative path MVP | No per-script registry required |
| Dual contract | path standard; run optional | Locked R5-B |
| Native probe | Optional / deferred if helpers missing | Agents root is portable after staging |
### Design
**Approach (provisional on staging + inventory).**

1. **Surface.** Extend the existing Commander `script` group created by `registerScriptRun`:
   - Keep `script run` unchanged.
   - Add `script path <plugin> <rel>` with optional `--json`, optional `--global` / `--project`.
   - Prefer implementing pure `resolveScriptPath(opts) → { path, source } | null` in a small module for testability; CLI layer only formats and exits.

2. **Resolution algorithm (default).**
   ```
   candidates = []
   if not force_global: candidates << join(projectRoot, '.agents/scripts', plugin, rel)
   if not force_project: candidates << join(home, '.agents/scripts', plugin, rel)
   // native roots: only if inventory/staging define a reliable discovery function
   for c in candidates: if isFile(c): return c
   return not found
   ```
   Align `projectRoot` with install's project layout (`cwd` / `outputRoot` conventions from inventory).

3. **Fail closed vs script run fail open.** Different semantics by design: missing **path** breaks the caller's next step; missing **registry id** is version skew. Document in command description.

4. **rel-or-id.** Phase 1: treat argument as relative path only (simplest, no per-script CLI release). Short ids can be a later alias table if entrypoint contract introduces them — not required for MVP.

5. **Native plugin roots.** Optional phase-1 stretch: probe Claude cache / OMP / Grok install paths only when shared helpers already exist from install.ts; otherwise document "agents scripts root is the portable path after staging" and leave native probe as follow-up if dual-write is not used.

6. **Tests.** Mirror `script-run.test.ts` style: Commander program + pure resolver tests with temp dirs.

**Rejected.**
- Returning repo-relative `plugins/cc/scripts/...` (breaks install targets).
- Fail-open exit 0 on miss (hides broken docs).
- Auto-executing the path (blurs path vs run).
### Plan
1. [ ] Wait for staging task done; re-read inventory + entrypoint + staging Solutions for final roots and rel conventions.
2. [ ] Claim this task `wip`.
3. [ ] Implement pure `resolveScriptPath` + unit tests (project/global/miss/traversal).
4. [ ] Wire `script path` CLI (`--json`, force flags); tests for exit codes and stdout.
5. [ ] Confirm `script run` suite still green; CHANGELOG; fill Solution file:line map.
6. [ ] Feature A decisions gist; pipeline verify toward done.
### Solution

<!-- Filled during implementation: file:line change map and concise rationale. -->

### Testing

<!-- Filled during verification: commands run, outcomes, coverage claim or N/A. -->

### Review

<!-- Filled during review: P1-P4 findings, residual risk, and final disposition. -->

### References
- Feature map: `docs/features/A_portable-plugin-scripts-via-install-time-staging.md` (R4-B)
- Existing script group: `apps/cli/src/commands/script-run.ts` (`registerScriptRun`)
- CLI wire: `apps/cli/src/cli.ts`
- Tests pattern: `apps/cli/tests/commands/script-run.test.ts`
- Prerequisite staging: install staging task under feature A
- Upstream: path inventory research, entrypoint contract grilling
- Downstream: guide rewrite, non-hook doc migrate
### History
