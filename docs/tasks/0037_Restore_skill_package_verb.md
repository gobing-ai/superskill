---
name: Restore skill package verb
description: Restore skill package verb
status: Backlog
created_at: 2026-06-17T22:44:05.182Z
updated_at: 2026-06-17T22:44:05.182Z
folder: docs/tasks
type: task
feature-id: F030
priority: medium
estimated_hours: 4
tags: ["phase5","skill","package","verb-restore"]
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0037. Restore skill package verb

### Background

Restore 'superskill skill package <name>' — bundle a skill plus its companions for distribution. Re-spec the behavior of the deleted cc-skills/scripts/package.ts against the current content-IO layer (Phase 2 content/*). Deterministic — no model involvement, no Phase 4 dependency. skill package was deleted in Phase 3 §2.1 (D3) because the CLI had no package verb; tracked as a Phase 5 follow-up (§7). P5-D4 restores it in its natural CLI home, never as a revived plugin script (invariant #3). Design: design-doc-phase5.md §3, P5-D4. Owning feature: F030.


### Requirements

- [ ] **R1** — `superskill skill package <name> [--output <dir>] [--include-companions]` registered on the `skill` command group.
- [ ] **R2** — `operations/package.ts` exports `packageSkill(name, opts): Promise<string>` returning the bundle path.
- [ ] **R3** — Re-spec the deleted `package.ts` intent (recover from git history) onto the current content-IO: resolve via `resolveContentPath` (F007); bundle `SKILL.md` + `references/` + companion configs (`metadata.openclaw`, `agents/openai.yaml`).
- [ ] **R4** — **Reuse content-IO primitives** (`content/frontmatter.ts`, `content/identity.ts`, `content/paths.ts`) — no bespoke frontmatter parsing or path resolution.
- [ ] **R5** — Output: bundle at `--output` (default cwd); path returned + printed via `process.stdout.write`.
- [ ] **R6** — Missing skill → exit 2 (content-not-found convention).
- [ ] **R7** — Deterministic: no model call, no Phase 4 dependency.
- [ ] **R8** — CLI home (invariant #3): verb in `commands/skill.ts` / `operations/package.ts`, never a plugin script.

**Acceptance:**
```bash
superskill skill package my-skill --output ./dist            # → bundle (SKILL.md+references/+companions), path printed
superskill skill package my-skill --include-companions --output ./dist  # → companion configs present
superskill skill package does-not-exist                      # → exit 2
```

**Out of scope:** `skill migrate` (F031); refinement (Phase 4).


### Q&A



### Design

- **Scope:** `operations/package.ts` (new) + `commands/skill.ts` (package subcommand) + `tests/operations/skill-package.test.ts` (new)
- **Key decision:** Bundle as directory copy (not archive). `resolveContentPath` resolves skill path; `statSync` discriminates directory vs file to handle both name-based and path-based invocation.
- **Boundaries affected:** `commands/skill.ts` (registerSkill adds package subcommand), `content/identity.ts` (reused via resolveContentPath), `tests/commands/content-command-modules.test.ts` (updated subcommand list)
- **Risks:** none beyond normal regression risk

### Solution

commands/skill.ts: register package subcommand. operations/package.ts: packageSkill resolves skill via content/identity.ts, gathers SKILL.md+references/+companions, writes a distributable bundle/archive to --output. Reuse content/frontmatter.ts, content/identity.ts, content/paths.ts. Read the deleted package.ts from git history to recover the original bundling intent, then map onto content-IO.
### Plan

- [x] Review task requirements, design doc P5-D4, feature F030, and existing code patterns
- [x] Create `operations/package.ts` with `packageSkill(name, opts)` reusing `resolveContentPath`
- [x] Register `package` subcommand on `skill` command group with `--output` and `--include-companions`
- [x] Create `tests/operations/skill-package.test.ts` (7 tests, 100% coverage on package.ts)
- [x] Update `content-command-modules.test.ts` for new subcommand
- [x] Verify: lint, typecheck, 640 tests pass, build succeeds, CLI smoke test


### Review

- **Verdict:** PASS
- **SECU:** No security concerns — deterministic file I/O, no external calls, no user input beyond paths
- **Correctness:** All acceptance criteria met: bundle SKILL.md+references, --include-companions, missing-skill→exit 2, path printed
- **Traceability:** R1–R8 all satisfied; content-IO reused (R4); CLI home (R8); deterministic (R7)
- **Coverage:** package.ts 100% func/line; full suite 640/640 pass



### Testing

- **Command:** `bun test apps/cli/tests/operations/skill-package.test.ts` + full `bun run test`
- **Scope:** packageSkill core flow, --include-companions, missing-skill error, output path contract, determinism, graceful no-companion handling, default output
- **Result:** 7/7 pass, 640/640 full suite pass. `package.ts`: 100% func, 100% line coverage
- **Evidence:** `SKILL.md` + `references/` bundled correctly; companions included with flag; ENOENT→exit 2 verified
- **Next action:** none
- [ ] Coverage for `operations/package.ts` contributes to the ≥90% gate.
- [ ] No test skipped / `.skip`'d (R12).

`bun:test`, `apps/cli/tests/operations/`. A sample skill-with-companions fixture.


### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References

- Design: [design-doc-phase5.md](../design/design-doc-phase5.md) §3, P5-D4
- Feature: [F030](../features/F030-skill-package.md)
- Code: apps/cli/src/content/{identity,frontmatter,paths}.ts (reuse); git history of deleted cc-skills/scripts/package.ts

