---
schema_version: 1
name: Restore skill package verb
status: done
type: task
priority: P2
tags: [phase5,skill,package,verb-restore]
created_at: 2026-06-17T22:44:05.182Z
updated_at: "2026-08-01T02:25:15.155Z"
feature_id: G41
---

## 0037. Restore skill package verb

### Background
Restore 'superskill skill package <name>' — bundle a skill plus its companions for distribution. Re-spec the behavior of the deleted cc-skills/scripts/package.ts against the current content-IO layer (Phase 2 content/*). Deterministic — no model involvement, no Phase 4 dependency. skill package was deleted in Phase 3 §2.1 (D3) because the CLI had no package verb; tracked as a Phase 5 follow-up (§7). P5-D4 restores it in its natural CLI home, never as a revived plugin script (invariant #3). Design: design-doc-phase5.md §3, P5-D4. Owning feature: G41.
### Requirements
- [x] **R1** — `superskill skill package <name> [--output <dir>] [--include-companions]` registered on the `skill` command group.
- [x] **R2** — `operations/package.ts` exports `packageSkill(name, opts): Promise<string>` returning the bundle path.
- [x] **R3** — Re-spec the deleted `package.ts` intent (recover from git history) onto the current content-IO: resolve via `resolveContentPath` (G21); bundle `SKILL.md` + `references/` + companion configs (`metadata.openclaw`, `agents/openai.yaml`).
- [x] **R4** — **Reuse content-IO primitives** (`content/frontmatter.ts`, `content/identity.ts`, `content/paths.ts`) — no bespoke frontmatter parsing or path resolution.
- [x] **R5** — Output: bundle at `--output` (default cwd); path returned + printed via `process.stdout.write`.
- [x] **R6** — Missing skill → exit 2 (content-not-found convention).
- [x] **R7** — Deterministic: no model call, no Phase 4 dependency.
- [x] **R8** — CLI home (invariant #3): verb in `commands/skill.ts` / `operations/package.ts`, never a plugin script.

**Acceptance:**
```bash
superskill skill package my-skill --output ./dist            # → bundle (SKILL.md+references/+companions), path printed
superskill skill package my-skill --include-companions --output ./dist  # → companion configs present
superskill skill package does-not-exist                      # → exit 2
```

**Out of scope:** `skill migrate` (G42); refinement (Phase 4).
### Q&A



### Design

- **Scope:** `operations/package.ts` (new) + `commands/skill.ts` (package subcommand) + `tests/operations/skill-package.test.ts` (new)
- **Key decision:** Bundle as directory copy (not archive). `resolveContentPath` resolves skill path; `statSync` discriminates directory vs file to handle both name-based and path-based invocation.
- **Boundaries affected:** `commands/skill.ts` (registerSkill adds package subcommand), `content/identity.ts` (reused via resolveContentPath), `tests/commands/content-command-modules.test.ts` (updated subcommand list)
- **Risks:** none beyond normal regression risk

### Solution

commands/skill.ts: register package subcommand. operations/package.ts: packageSkill resolves skill via content/identity.ts, gathers SKILL.md+references/+companions, writes a distributable bundle/archive to --output. Reuse content/frontmatter.ts, content/identity.ts, content/paths.ts. Read the deleted package.ts from git history to recover the original bundling intent, then map onto content-IO.
### Plan
- [x] Review task requirements, design doc P5-D4, feature G41, and existing code patterns
- [x] Create `operations/package.ts` with `packageSkill(name, opts)` reusing `resolveContentPath`
- [x] Register `package` subcommand on `skill` command group with `--output` and `--include-companions`
- [x] Create `tests/operations/skill-package.test.ts` (7 tests, 100% coverage on package.ts)
- [x] Update `content-command-modules.test.ts` for new subcommand
- [x] Verify: lint, typecheck, 640 tests pass, build succeeds, CLI smoke test
### Review


---

**Re-verification (`dev-verify --force --fix all`, 2026-06-18):** PASS — re-confirmed.

- **Phase 7 SECU** (operations/package.ts, commands/skill.ts, package.test.ts): 0 findings. Deterministic file I/O (`cpSync`), no `any`, no secrets, no exec/spawn, no model/Phase-4 imports.
- **Phase 8 traceability:** R1–R8 all MET — R1 skill.ts:212 (`package <name>` registered), R2 package.ts:71 (`packageSkill → Promise<string>`), R3 SKILL.md+references/+companions (package.ts:78-90), R4 content-IO reuse via `resolveContentPath` package.ts:29 (no bespoke parsing), R5 path printed `echo(path)` skill.ts:173, R6 ENOENT→exit 2 (package.ts:31 + helpers.ts:79-81; live-verified exit_code=2), R7 deterministic (no model path), R8 CLI home (commands/skill.ts + operations/package.ts). 0 unmet, 0 partial.
- **Gate:** lint exit 0 · 640 pass / 0 fail · build exit 0 · spur 2/2 passed. Live acceptance: `skill package does-not-exist` → exit 2.
- **Fix-pass (--fix all):** cleaned up untracked `test-skill/` manual smoke-test fixture left in the working tree.


### Testing

- **Timestamp:** 2026-06-19T01:55Z
- **Command:** `bun test apps/cli/tests/operations/skill-package.test.ts` + full `bun run test`
- **Scope:** packageSkill core flow, --include-companions, missing-skill error, output path contract, determinism, graceful no-companion handling, default output
- **Result:** 7/7 pass, 640/640 full suite pass. `package.ts`: 100% func, 100% line coverage
- **Evidence:** `SKILL.md` + `references/` bundled correctly; companions included with flag; ENOENT→exit 2 verified
- **Next action:** none



### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |
| code | apps/cli/src/operations/package.ts | task-runner | 2026-06-19 |
| code | apps/cli/src/commands/skill.ts | task-runner | 2026-06-19 |
| test | apps/cli/tests/operations/package.test.ts | task-runner | 2026-06-19 |
| test | apps/cli/tests/commands/content-command-modules.test.ts | task-runner | 2026-06-19 |


### References
- Design: [design-doc-phase5.md](../design/design-doc-phase5.md) §3, P5-D4
- Feature: [G41](../features/G41_restore-skill-package.md)
- Code: apps/cli/src/content/{identity,frontmatter,paths}.ts (reuse); git history of deleted cc-skills/scripts/package.ts
### History

- Migrated from legacy format (2026-08-01)
