---
doc: 05_FEATURES
owns: STATUS — feature decomposition + state (✅ done / 🔶 partial / ⏳ planned / 💤 deferred)
authority: derived
version: 4.1.0
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

## Phase 2: Authoring + quality

Design: [design-doc-phase2.md](design/design-doc-phase2.md)

| Feature | Origin | Status |
|---------|--------|--------|
| `superskill agent` | `cc-agents` | 💤 |
| `superskill skill` | `cc-skills` | 💤 |
| `superskill command` | `cc-commands` | 💤 |
| `superskill hook` | `cc-hooks` | 💤 |
| `superskill magent` | `cc-magents` | 💤 |

Phase 2 features will be decomposed when Phase 1 exits.
