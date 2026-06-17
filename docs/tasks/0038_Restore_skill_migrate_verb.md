---
name: Restore skill migrate verb
description: Restore skill migrate verb
status: Backlog
created_at: 2026-06-17T22:44:19.592Z
updated_at: 2026-06-17T22:44:19.592Z
folder: docs/tasks
type: task
feature-id: F031
priority: medium
estimated_hours: 5
dependencies: ["0037"]
tags: ["phase5","skill","migrate","verb-restore","cross-phase"]
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0038. Restore skill migrate verb

### Background

Restore 'superskill skill migrate <sources...> <dest>' — merge/migrate skills. DECISION LOCKED 2026-06-17: ship the DETERMINISTIC MERGE CORE first (no Phase 4 dep); the content-refinement layer (reconciling overlapping content) is non-deterministic and routes through the Phase 4 generation seam (F023 / task 0030) as a documented follow-on. skill migrate was deleted in Phase 3 §2.1 (D3); tracked for Phase 5 (§7). Unlike skill package, migrate's quality depends on intelligently reconciling content — exactly what the Phase 4 generation seam provides. CROSS-PHASE: the --refine path is gated on 0030 (F023); the merge core is not. Design permits shipping deterministic merge first, layering refinement after (design §3 NOTE). Hard dep: 0037 (skill package patterns). Soft dep: 0030 (F023, for --refine only). Design: design-doc-phase5.md §3, P5-D4. Owning feature: F031.


### Requirements

- [ ] **R1** — `superskill skill migrate <sources...> <dest> [--refine] [--ingest <proposal.json>]` registered on the `skill` command group.
- [ ] **R2** — `operations/migrate.ts` exports `migrateSkills(sources, dest, opts)`.
- [ ] **R3** — **Deterministic merge core (ships independent of Phase 4):** resolve sources via `resolveContentName`/`resolveContentPath` (F007); merge frontmatter (union of fields, **documented conflict policy**) + concatenate/dedupe bodies via `content/frontmatter.ts` + `content/edit.ts`; write the merged skill to `<dest>`. This alone is a usable migrate.
- [ ] **R4** — **Refinement layer (`--refine`, depends on F023 / task 0030):** merged draft → `skill evolve <dest> --propose-only --json` (generation briefs) → Author reconciles overlaps → `--ingest <proposal.json>` applies through the double-loop gate (F024) → a regressive merge is rejected + restored.
- [ ] **R5** — Without `--refine` (or before Phase 4 lands), the deterministic merge is the output. The two are decoupled (locked decision 2026-06-17: deterministic core first).
- [ ] **R6** — Missing source → exit 2.
- [ ] **R7** — CLI home (invariant #3); refinement is non-deterministic but the CLI makes no model call (Phase 4 invariant #1 carries).
- [ ] **R8** — Reuse content-IO + the generation seam — no bespoke merge-then-rewrite logic duplicating F023.

**Acceptance:**
```bash
superskill skill migrate skill-a skill-b ./merged.md          # → deterministic merge written, exit 0
superskill skill migrate skill-a skill-b ./merged.md --refine --ingest ./proposal.json  # → gated refine; regression rejected+restored
superskill skill migrate does-not-exist skill-b ./out.md      # → exit 2
```

**Dependency:** hard dep 0037 (skill package patterns); soft dep 0030 (F023) — `--refine` only. Merge core does not block on Phase 4.


### Q&A



### Design



### Solution

commands/skill.ts: register migrate subcommand. operations/migrate.ts: deterministic core merges frontmatter+bodies via content/frontmatter.ts + content/edit.ts, writes <dest> — usable alone. --refine path hands merged draft to the generation seam (evolve --propose-only --json -> Author -> --ingest through F024 gate). Conflict policy for frontmatter union documented. Ship + test the deterministic core first; the --refine test gates on 0030.


### Plan



### Review



### Testing

Tests ship **in this task** (design rule: each task owns its tests — no separate pure-test task).

- [ ] `tests/operations/skill-migrate.test.ts`:
  - **Deterministic merge core** (ships independent of Phase 4): two sources merge frontmatter (union + documented conflict policy) + bodies → `<dest>`; assert merged output. No model call.
  - Missing source → exit 2.
  - **Refined path** (`--refine --ingest`, gated on F023/0030): routes through the generation seam + double-loop gate; a regressive merge is rejected + restored (fixture-replay, **no model call**).
- [ ] The deterministic-core tests run **without** Phase 4; only the `--refine` test depends on 0030 (skip-guard it behind F023 availability, but do NOT `.skip` to pass — gate the assertion on the seam existing).
- [ ] Fixtures hand-authored: source skills + a `migrate` proposal fixture for the refined path.
- [ ] Coverage for `operations/migrate.ts` contributes to the ≥90% gate.
- [ ] No test skipped / `.skip`'d to go green (R12).

`tests/fixtures/phase5/`. Spy on `process.stdout.write`.


### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References

- Design: [design-doc-phase5.md](../design/design-doc-phase5.md) §3 (NOTE), P5-D4
- Feature: [F031](../features/F031-skill-migrate.md)
- Depends on: 0037 (hard); 0030/F023 generation seam (soft — --refine only)
- Code: apps/cli/src/content/{frontmatter,edit}.ts (reuse)

