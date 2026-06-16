---
doc: 05_FEATURES
owns: STATUS — feature decomposition + state (✅ done / 🔶 partial / ⏳ planned / 💤 deferred)
authority: derived
version: 4.2.0
derived_from: [01_PRD, 02_ROADMAP]
owner: Robin Min
updated_at: 2026-06-16
read_before: finding a feature's state; edit when a feature's status changes
edit_rules: 99 §6.6
sync: [T4]
---

# Features

Status legend: ✅ done · 🔶 partial · ⏳ planned · 💤 deferred

## Phase 1: Distribution — `superskill install`

Design: [design-doc-phase1.md](design/design-doc-phase1.md)

### Feature list

| ID | Feature | Deps | Status | Files |
|----|---------|------|--------|-------|
| F001 | [Target taxonomy + config schema](features/F001-target-taxonomy-config.md) | — | ⏳ | `targets.ts`, `config.ts` |
| F002 | [Plugin → .rulesync/ mapper](features/F002-plugin-mapper.md) | — | ⏳ | `mapper.ts` |
| F003 | [Conversion pipeline + rulesync integration](features/F003-conversion-pipeline.md) | F001 | ⏳ | `pipeline/*`, `rulesync.ts` |
| F004 | [superskill install command + target dispatch](features/F004-install-command.md) | F001, F002, F003, F006 | ⏳ | `commands/install.ts` |
| F005 | [Tests + verification](features/F005-tests-verification.md) | F001–F004, F006 | ⏳ | `tests/*` |
| F006 | [Marketplace manifest resolver](features/F006-marketplace-resolver.md) | — | ⏳ | `marketplace.ts` |

### Foundation (already done)

| Item | Status |
|------|--------|
| Project scaffold | ✅ |
| Biome + TypeScript gates | ✅ |
| bun:test suite (2 tests, 100%) | ✅ |
| Spur rule catalog (21 rules) | ✅ |
| Remove ts-base artifacts | ✅ |
| Documentation 00–05 | ✅ |

### Dependency graph

```
F001 ──┐
       ├──► F003 ──┐
F002 ──┘           ├──► F004 ──► F005
F006 ──────────────┘
(F001, F002, F006 have no deps — parallelizable)
```

## Task creation plan

Each feature becomes one task file. Recommended order and granularity:

| Order | Feature | Task | Size | Rationale |
|-------|---------|------|------|-----------|
| 1 | F001 | `F001-target-taxonomy-config` | S (1 file + tests) | Foundation — unblocks F003. Smallest possible increment. |
| 2 | F002 | `F002-plugin-mapper` | S (1 file + tests) | Independent of F001. Can run in parallel. |
| 3 | F006 | `F006-marketplace-resolver` | S (1 file + tests) | Independent. Resolves plugin roots; unblocks F004. |
| 4 | F003 | `F003-conversion-pipeline` | M (3–4 files + tests) | Depends on F001. Pipeline stages + rulesync wrapper. |
| 5 | F004 | `F004-install-command` | M (1–2 files + tests) | Depends on F001–F003 + F006. Integration point. |
| 6 | F005 | `F005-tests-verification` | S (test files) | Depends on F004. Covers everything. |

**Parallelization**: F001, F002, and F006 have no shared dependencies — they can be implemented concurrently in separate sessions. F003 must wait for F001. F004 gates on F001+F002+F003+F006. F005 runs last.

**Size key**: S = ≤2 files + tests, completable in one session. M = 3–5 files + tests, may span sessions.

---

## Phase 2: Authoring + quality — `superskill <type> <op>`

Design: [design-doc-phase2.md](design/design-doc-phase2.md)

### Feature list

| ID | Feature | Deps | Size | Status | Files |
|----|---------|------|------|--------|-------|
| F007 | [Template + content-IO foundation + scaffold](features/F007-template-scaffold.md) | — | M | ⏳ | `content/*` (5), `templates/*/default.md` (5), `operations/scaffold.ts` |
| F008 | [SQLite data store (via @gobing-ai/ts-db)](features/F008-sqlite-store.md) | F007 | M | ⏳ | `store/schema.ts`, `store/db.ts`, `store/evaluations.ts`, `store/proposals.ts` |
| F009 | [Quality dimension definitions](features/F009-quality-dimensions.md) | F007 | M | ⏳ | `quality/dimensions.ts` + 5 type-specific evaluators |
| F010 | [Validate operation](features/F010-validate-operation.md) | F007, F009 | S | ⏳ | `operations/validate.ts` |
| F011 | [Evaluate operation](features/F011-evaluate-operation.md) | F007, F008, F009 | S | ⏳ | `operations/evaluate.ts` |
| F012 | [Refine operation](features/F012-refine-operation.md) | F007, F010, F011 | S | ⏳ | `operations/refine.ts` |
| F013 | [Evolve operation](features/F013-evolve-operation.md) | F007, F008, F011 | M | ⏳ | `operations/evolve.ts` |
| F014 | [Five type command files](features/F014-type-commands.md) | F007–F013 | M | ⏳ | `commands/helpers.ts` + `commands/{agent,skill,command,hook,magent}.ts` + `cli.ts` |
| F015 | [Phase 2 tests](features/F015-phase2-tests.md) | F007–F014 | M | ⏳ | `apps/cli/tests/{content,scaffold,validate,evaluate,refine,evolve,store,commands}.test.ts` |

**Size key**: S = ≤2 files, completable in one session. M = 3–6 files, may span sessions.

### Dependency graph

```
F007 (content-IO + templates + scaffold)   ← foundation; everything below imports content/*
  │
  ├──► F008 (SQLite store)      ─┐
  ├──► F009 (quality dims)      ─┤
  │                              ├──► F010 (validate) ──┐
  │                              ├──► F011 (evaluate) ──┤
  │                              │                       ├──► F012 (refine) ──┐
  │                              │                       ├──► F013 (evolve) ──┤
  │                              │                       │                    │
  └──────────────────────────────┴───────────────────────┴────────────────────┼──► F014 (commands) ──► F015 (tests)
```

F007 is no longer parallel with F008/F009 — it owns the shared `content/*` primitives (frontmatter parse/edit, name resolution, hashing, the single change-apply, data-root/path rules) that F008–F013 all import. F008 and F009 parallelize **after** F007 lands.

### Foundation (carried forward from Phase 1)

| Item | Status |
|------|--------|
| Project scaffold + tooling | ✅ |
| Spur rule catalog (21 rules) | ✅ |
| Documentation 00–05 | ✅ |
| `superskill install` command | 🔶 |

### Task creation plan

| Order | Feature | Task | Rationale |
|-------|---------|------|-----------|
| 1 | F007 | `F007-template-scaffold` | **Foundation, must land first.** `content/*` primitives + templates + scaffold. F008–F013 import it. Adds the `yaml` dep (ADR-012). |
| 2 | F008 | `F008-sqlite-store` | Depends on F007 (`content/paths.ts`). DB open/migration, evaluations CRUD, proposals CRUD. Foundation for F011/F013. |
| 3 | F009 | `F009-quality-dimensions` | Depends on F007 (`parseFrontmatter`, `ContentType`, `REQUIRED_FIELDS`). Dimension schemas + scoring for all 5 types. Foundation for F010/F011. |
| 4 | F010 | `F010-validate-operation` | Depends on F007+F009. Pure structural validation (exit codes mapped in F014). First user-visible operation. |
| 5 | F011 | `F011-evaluate-operation` | Depends on F007+F008+F009. Quality scoring with `--json --save`; `operation`/`target_agent`/`file_hash` per ADR-013. |
| 6 | F012 | `F012-refine-operation` | Depends on F007+F010+F011. Evaluate → fix via shared `applyChange`. |
| 7 | F013 | `F013-evolve-operation` | Depends on F007+F008+F011. Longitudinal analysis + proposal workflow via shared `applyChange`/`getProposalsDir`. Most complex. |
| 8 | F014 | `F014-type-commands` | Depends on F007–F013. `helpers.ts` (exit-code mapping, `resolveTarget` default) + Commander wiring for 5 types × 5 ops. |
| 9 | F015 | `F015-phase2-tests` | Depends on F007–F014. `content.test.ts` + per-operation + integration tests, ≥90% line/function coverage. |

**Parallelization**: F007 must land first (it owns `content/*`). After F007, F008 and F009 parallelize. F010 and F011 run in parallel after F009/F008. F012 and F013 run in parallel after F010+F011.

### Content type to quality dimensions

Each type has 5 dimensions scored 0.0–1.0 (see design §3):

| Type | Dimension 1 | Dimension 2 | Dimension 3 | Dimension 4 | Dimension 5 |
|------|------------|------------|------------|------------|------------|
| Skill | completeness | clarity | trigger-accuracy | anti-hallucination | conciseness |
| Command | completeness | clarity | argument-hints | tool-references | slash-syntax |
| Agent | completeness | role-clarity | tool-selection | skill-linkage | model-fit |
| Hook | correctness | event-coverage | safety | pattern-match-quality | — |
| Magent | completeness | platform-coverage | conciseness | tone-consistency | safety |
