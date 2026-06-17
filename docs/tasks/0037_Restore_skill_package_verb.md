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



### Solution

commands/skill.ts: register package subcommand. operations/package.ts: packageSkill resolves skill via content/identity.ts, gathers SKILL.md+references/+companions, writes a distributable bundle/archive to --output. Reuse content/frontmatter.ts, content/identity.ts, content/paths.ts. Read the deleted package.ts from git history to recover the original bundling intent, then map onto content-IO.


### Plan



### Review



### Testing

Tests ship **in this task** (design rule: each task owns its tests — no separate pure-test task).

- [ ] `tests/operations/skill-package.test.ts`:
  - `packageSkill` bundles `SKILL.md` + `references/` + companion configs; returns the bundle path.
  - `--include-companions` includes `metadata.openclaw` / `agents/openai.yaml`.
  - Missing skill → exit 2 (content-not-found convention).
  - Uses content-IO primitives (assert via the shared `content/*` helpers, not bespoke parsing).
- [ ] Deterministic — no model call in the tested path.
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

