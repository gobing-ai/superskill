---
name: Restore skill migrate verb
description: Restore skill migrate verb
status: Done
created_at: 2026-06-17T22:44:19.592Z
updated_at: 2026-06-19T06:57:46.043Z
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

**Deterministic merge core** (ships independent of Phase 4 — locked decision 2026-06-17):

- `operations/migrate.ts` exports `migrateSkills(sources: string[], dest: string, opts?: MigrateOptions): Promise<string>`.
- Resolve each source via `resolveContentPath('skill', source)` (F007 / content/identity.ts). Missing source → `Object.assign(new Error(...), { code: 'ENOENT' })` → `runOperation` maps to exit 2 (R6).
- Parse each source via `parseFrontmatter` (content/frontmatter.ts).
- **Frontmatter conflict policy** (documented): union of all keys across sources. Array values → union with dedup (preserving first-source order). Scalar conflicts → first source wins (sources are ordered). `name` → dest-derived canonical name via `resolveContentName(dest)`.
- **Body merge**: concatenate bodies in source order, separated by `\n\n`. Dedupe identical non-empty lines (first occurrence kept, order preserved). Collapse runs of ≥2 blank lines to one.
- Serialize as `---\n<yaml>---\n<body>` via `yaml.stringify` for the frontmatter block.
- Write to `<dest>` (create parent dir if missing). Return dest path.

**Refinement layer** (`--refine`, routes through F023 generation seam — no bespoke rewrite, R8):

- `--refine` alone → `evolve('skill', dest, { proposeOnly: true, json: true, target })` → envelope-out (generation briefs to stdout). No model call (R7).
- `--refine --ingest <file>` → `evolve('skill', dest, { ingest: file, target, margin })` → ingest-in through the double-loop gate (F024). A regressive merge is rejected + the file restored by evolve's existing backup/restore path.
- Decoupled (R5): without `--refine`, the deterministic merge is the complete output.

**Command surface** (commands/skill.ts): `superskill skill migrate <sources...> <dest>` — variadic; Commander captures all-but-last as sources, last as dest. Options: `--refine`, `--ingest <file>`, `-t/--target <agent>`, `--margin <n>`. Registered on the `skill` command group (R1).


### Solution

commands/skill.ts: register migrate subcommand. operations/migrate.ts: deterministic core merges frontmatter+bodies via content/frontmatter.ts + content/edit.ts, writes <dest> — usable alone. --refine path hands merged draft to the generation seam (evolve --propose-only --json -> Author -> --ingest through F024 gate). Conflict policy for frontmatter union documented. Ship + test the deterministic core first; the --refine test gates on 0030.


### Plan

1. Create `apps/cli/src/operations/migrate.ts` — `MigrateOptions` interface + `migrateSkills()` (deterministic core + `--refine` delegation to `evolve()`).
2. Register `migrate <sources...> <dest>` subcommand in `commands/skill.ts` (`registerSkill`): add `handleSkillMigrate` + `skillMigrate` handlers, wire options (`--refine`, `--ingest`, `--target`, `--margin`).
3. Write `apps/cli/tests/operations/migrate.test.ts` — deterministic merge core (frontmatter union + conflict policy, body dedupe, dest name), missing source → exit 2, `--refine` fixture-replay (gated on seam existing, no model call, regression rejected+restored).
4. Run `bun run lint` + `bun run test` + `bun run build`; iterate to green.
5. Update task Review + Artifacts sections; run verification + post-flight gates.


### Review

**Verdict: PASS**

**Requirements traceability:**

- **R1** ✅ — `migrate <sources...> <dest>` registered on `skill` command group with `--refine`, `--ingest`, `--target`, `--margin` options (`commands/skill.ts:250-256`).
- **R2** ✅ — `operations/migrate.ts` exports `migrateSkills(sources, dest, opts)`.
- **R3** ✅ — Deterministic merge core: resolves sources via `resolveContentPath` (F007/content/identity.ts), parses via `parseFrontmatter` (content/frontmatter.ts), merges frontmatter (union + documented conflict policy: arrays union+dedup, scalars first-wins, name=dest-derived), concatenates/dedupes bodies, writes to `<dest>`. Ships independent of Phase 4.
- **R4** ✅ — `--refine` alone → `evolve('skill', dest, { proposeOnly: true, json: true })` (envelope-out generation briefs). `--refine --ingest <file>` → `evolve('skill', dest, { ingest, acceptId, margin })` applies through double-loop gate (F024). Regressive merge rejected + restored (tested, fixture-replay, no model call).
- **R5** ✅ — Without `--refine`, deterministic merge is the complete output. Decoupled from Phase 4.
- **R6** ✅ — Missing source → ENOENT → exit 2 (tested + smoke-tested).
- **R7** ✅ — CLI makes no model call. Deterministic merge is pure. Refinement delegates to evolve (envelope-out emits briefs, ingest-in applies agent-authored changes — neither calls a model).
- **R8** ✅ — Reuses content-IO (`resolveContentPath`, `parseFrontmatter`) + generation seam (`evolve()`). No bespoke merge-then-rewrite logic.

**SECU review:**

- **Security (S):** No untrusted content expansion. Sources are local files. Proposal JSON parsed with proper `in` narrowing (no inline casts). No eval/exec/shell. PASS.
- **Correctness (E):** Frontmatter union + documented conflict policy (arrays dedup, scalars first-wins, name=dest-derived). Body exact-line dedupe (deterministic, lossless for distinct content). Missing source → exit 2. Empty sources → error. Single source → valid copy. Dest dir auto-created. PASS.
- **Code quality (C):** Follows `package.ts` pattern. No `any`, no `biome-ignore`, no non-null assertions. JSDoc documents conflict policy. Uses F007 content-IO. PASS.
- **Architecture (U):** Deterministic core decoupled from `--refine` layer. Delegates to generation seam (evolve) — no duplication of F023. Operation owns merge + refine delegation; command handler owns arg splitting + output. PASS.

**Testing evidence:**

- 9 tests in `tests/operations/migrate.test.ts`: deterministic merge (2 sources, conflict policy, body dedupe, missing source ENOENT, single source, determinism, empty sources) + refine path (envelope-out JSON, regressive ingest rejected+restored).
- Updated `tests/commands/content-command-modules.test.ts` to include `migrate` in registered subcommands.
- Full suite: 650 pass, 0 fail. Lint clean. Typecheck clean. Build succeeds.
- Smoke test: `skill migrate skill-a skill-b ./merged.md` → exit 0, merged file correct. `skill migrate does-not-exist skill-b ./out.md` → exit 2.

**Coverage:** `operations/migrate.ts` — 100% functions, 99.14% lines.


### Testing

Tests shipped in this task (design rule: each task owns its tests).

**`tests/operations/migrate.test.ts`** (9 tests, all passing):

- **Deterministic merge core** (ships independent of Phase 4):
  - `merges two sources into a destination file` — frontmatter union (tags from both, deduped), body concatenation, name=dest-derived. No model call.
  - `frontmatter conflict policy: first source wins for scalars, union for arrays` — description from skill-a, tags unioned, license from skill-b.
  - `body dedupe: identical lines collapsed to first occurrence` — duplicate "## Steps", "Configure the widget settings.", "Validate the configuration." each appear once.
  - `throws ENOENT for missing source (exit 2)` — missing source → "Skill not found" error.
  - `single source copies to destination` — valid degenerate case (1 source → copy).
  - `is deterministic — no model calls` — two merges produce identical bodies (only name differs by dest).
  - `throws on empty sources array` — empty sources → error.

- **Refined path** (`--refine`, gated on F023/0030 — seam exists, test runs):
  - `--refine (envelope-out): emits generation briefs as JSON to stdout` — envelope has type, content_name, briefs with goal anchor. No model call.
  - `--refine --ingest: regressive proposal is rejected and file restored` — regressive proposal (prepends 'noise' to description) rejected by Δ-margin gate, file restored byte-identical to deterministic merge. Fixture-replay, no model call.

**`tests/commands/content-command-modules.test.ts`** — updated to include `migrate` in registered subcommands list.

No test `.skip`'d to pass (R12). The `--refine` test gates on the seam existing (F023/0030 is Done, so it runs). Fixtures hand-authored: SKILL_A, SKILL_B, SKILL_WITH_CONSTRAINTS, and a regressive proposal fixture.

Coverage for `operations/migrate.ts`: 100% functions, 99.14% lines (contributes to ≥90% gate).
Full suite: 650 pass, 0 fail.
Test execution timestamp: 2026-06-19T04:10:00Z.


### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |
| code | apps/cli/src/operations/migrate.ts | Main | 2026-06-19 |
| code | apps/cli/src/commands/skill.ts (migrate registration) | Main | 2026-06-19 |
| test | apps/cli/tests/operations/migrate.test.ts | Main | 2026-06-19 |
| test | apps/cli/tests/commands/content-command-modules.test.ts (migrate subcommand) | Main | 2026-06-19 |
| commit | a04865a | Main | 2026-06-19 |


### References

- Design: [design-doc-phase5.md](../design/design-doc-phase5.md) §3 (NOTE), P5-D4
- Feature: [F031](../features/F031-skill-migrate.md)
- Depends on: 0037 (hard); 0030/F023 generation seam (soft — --refine only)
- Code: apps/cli/src/content/{frontmatter,edit}.ts (reuse)

