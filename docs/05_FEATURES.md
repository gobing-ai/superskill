---
doc: 05_FEATURES
owns: STATUS — feature decomposition + state (✅ done / 🔶 partial / ⏳ planned / 💤 deferred)
authority: derived
version: 5.0.0
derived_from: [01_PRD, 02_ROADMAP]
owner: Robin Min
updated_at: 2026-06-23
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
| F001 | [Target taxonomy + config schema](features/F001-target-taxonomy-config.md) | — | ✅ | `targets.ts`, `config.ts` |
| F002 | [Plugin → .rulesync/ mapper](features/F002-plugin-mapper.md) | — | ✅ | `mapper.ts` |
| F003 | [Conversion pipeline + rulesync integration](features/F003-conversion-pipeline.md) | F001 | ✅ | `pipeline/*`, `rulesync.ts` |
| F004 | [superskill install command + target dispatch](features/F004-install-command.md) | F001, F002, F003, F006 | ✅ | `commands/install.ts` |
| F005 | [Tests + verification](features/F005-tests-verification.md) | F001–F004, F006 | ✅ | `tests/*` |
| F006 | [Marketplace manifest resolver](features/F006-marketplace-resolver.md) | — | ✅ | `marketplace.ts` |

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
| F007 | [Template + content-IO foundation + scaffold](features/F007-template-scaffold.md) | — | M | ✅ | `content/*` (5), `templates/*/default.md` (5), `operations/scaffold.ts` |
| F008 | [SQLite data store (via @gobing-ai/ts-db)](features/F008-sqlite-store.md) | F007 | M | ✅ | `store/schema.ts`, `store/db.ts`, `store/evaluations.ts`, `store/proposals.ts` |
| F009 | [Quality dimension definitions](features/F009-quality-dimensions.md) | F007 | M | ✅ | `quality/dimensions.ts` + 5 type-specific evaluators |
| F010 | [Validate operation](features/F010-validate-operation.md) | F007, F009 | S | ✅ | `operations/validate.ts` |
| F011 | [Evaluate operation](features/F011-evaluate-operation.md) | F007, F008, F009 | S | ✅ | `operations/evaluate.ts` |
| F012 | [Refine operation](features/F012-refine-operation.md) | F007, F010, F011 | S | ✅ | `operations/refine.ts` |
| F013 | [Evolve operation](features/F013-evolve-operation.md) | F007, F008, F011 | M | ✅ | `operations/evolve.ts` |
| F014 | [Five type command files](features/F014-type-commands.md) | F007–F013 | M | ✅ | `commands/helpers.ts` + `commands/{agent,skill,command,hook,magent}.ts` + `cli.ts` |
| F015 | [Phase 2 tests](features/F015-phase2-tests.md) | F007–F014 | M | ✅ | `apps/cli/tests/{content,scaffold,validate,evaluate,refine,evolve,store,commands}.test.ts` |
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
| `superskill install` command | ✅ |
| Harness-aware magent gold masters (tasks 0080/0084) — template + `plugins/cc/skills/cc-magents/references/main-agents/` (7 platforms, Grade A evaluate) | ✅ |

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

---

## Phase 3: Plugin adaptation & script consolidation — `plugins/cc/`

Design: [design-doc-phase3.md](design/design-doc-phase3.md)

Cleanup/consolidation only — touches `plugins/cc/`, not the CLI. Renames `rd3`→`cc`, repoints the plugin's skills/subagents/slash-commands at the global `superskill` binary, deletes embedded scripts/templates/tests, fixes the dangling `hooks.json`. Non-deterministic eval is Phase 4; cross-platform hooks + deleted-verb restoration are Phase 5.

### Feature list

| ID | Feature | Deps | Size | Status | Files |
|----|---------|------|------|--------|-------|
| F016 | [Namespace migration (`rd3`→`cc`) + companion configs](features/F016-namespace-migration.md) | — | M | ✅ | `plugins/cc/**` (~123 files w/ `rd3`) |
| F017 | [Skill + expert-subagent rewrite → `superskill`](features/F017-skill-subagent-rewrite.md) | F016 | M | ✅ | `plugins/cc/skills/*/SKILL.md` (5), `plugins/cc/agents/expert-*.md` (5) |
| F018 | [Slash-command disposition + `hooks.json` fix](features/F018-command-disposition-hooks.md) | F016 | M | ✅ | `plugins/cc/commands/*.md` (17), `plugins/cc/hooks/hooks.json` |
| F019 | [Embedded-code deletion](features/F019-embedded-code-deletion.md) | F017, F018 | S | ✅ | delete `plugins/cc/skills/*/{scripts,templates,tests}/`, `cc-hooks/{emitters,schema}/`, `references/scripts-usage.md` |
| F020 | [Binary-on-PATH + Phase 3 verification](features/F020-binary-path-verification.md) | F016–F019 | S | ✅ | `apps/cli/package.json` (verify bin), docs/runbook; no plugin code |
```
F016 (rename rd3→cc)   ← must land first; every ref-bearing file depends on the final names
  │
  ├──► F017 (SKILL.md + expert-*.md rewrite) ─┐
  ├──► F018 (commands + hooks.json)           ─┤
  │                                            ├──► F019 (delete embedded code) ──► F020 (binary + verify)
  └────────────────────────────────────────────┘
```

> **Ordering invariant (design §5):** F019 deletion runs **only after** F017+F018 stop referencing the deleted paths (`rg "scripts/" plugins/cc/` and `rg "bun .*\.ts" plugins/cc/` both empty). F020's PATH gate (`bun run build` + `bun link`) must be exercised before the rewritten commands are claimed functional.

### Foundation (carried forward)

| Item | Status |
|------|--------|
| `superskill <type> <op>` CLI (Phase 2) | ✅ (deps for the rewrite targets) |
| Documentation 00–05 | ✅ |

### Task creation plan

| Order | Feature | Task | Rationale |
|-------|---------|------|-----------|
| 1 | F016 | `F016-namespace-migration` | **Must land first.** Global `rd3`→`cc` string migration (skill dir names kept; refs → `cc:cc-*`). Companion configs (`metadata.openclaw`, `agents/openai.yaml`) renamed in lockstep. Invariant: `rg rd3 plugins/cc/` → 0. |
| 2 | F017 | `F017-skill-subagent-rewrite` | Depends on F016 (final names). Rewrite 5 `SKILL.md` + 5 `expert-*.md` to call bare `superskill <type> <op>`; fix hardcoded `plugins/rd3/...` paths; drop deleted-op rows. |
| 3 | F018 | `F018-command-disposition-hooks` | Depends on F016. Rewrite 17 commands → `superskill` verb; delete 8 orphans; strip dangling `hooks.json` entries (ship empty/minimal). Runs parallel to F017. |
| 4 | F019 | `F019-embedded-code-deletion` | Depends on F017+F018 (ordering invariant). Delete `scripts/`, `templates/`, `tests/`, `cc-hooks/{emitters,schema}/`, `references/scripts-usage.md`. Gate: zero `scripts/`/`bun .*.ts` refs. |
| 5 | F020 | `F020-binary-path-verification` | Depends on F016–F019. Establish + exercise `bun run build` + `bun link` (dev), document `npm i -g @gobing-ai/superskill` (consumers); run the §6 exit gate. |

**Parallelization**: F016 first. After it, F017 and F018 parallelize. F019 gates on both. F020 last.

---

## Phase 4: The quality brain — non-deterministic evaluation & evolution

Design: [design-doc-phase4.md](design/design-doc-phase4.md)

Replaces the fake parts of the evaluate/evolve machinery with genuine LLM-driven scoring and content
generation, **without** coupling the CLI to a model provider. The CLI stays deterministic (machinery:
hashing, SQLite, proposal drafts, edits, verify, envelope/ingest I/O); the `cc` skill + Spur personas
drive the non-determinism through clean I/O seams (P4-D2). Touches the CLI (`operations/`, `quality/`,
`store/`) **and** the plugin (`cc:cc-*` wiring) — not the plugin-only cleanup of Phase 3.

### Feature list

| ID | Feature | Deps | Size | Status | Files |
|----|---------|------|------|--------|-------|
| F021 | [Rubric config format + package defaults + override resolution](features/F021-rubric-config.md) | — | M | ✅ | `quality/rubric.ts`, `rubrics/<type>.yaml` (5), `quality/dimensions.ts` (weights) |
| F022 | [Scorer seam (`evaluate --rubric`/`--ingest`)](features/F022-scorer-seam.md) | F021 | M | ✅ | `operations/evaluate.ts`, `store/schema.ts` (rubric_version), `commands/helpers.ts` |
| F023 | [Generation seam (`evolve --propose-only --json`/`--ingest`)](features/F023-generation-seam.md) | F021 | M | ✅ | `operations/evolve.ts` (replace `generateChanges` placeholder), `commands/helpers.ts` |
| F024 | [Double-loop gate (validate + Δ-margin + anchor)](features/F024-double-loop-gate.md) | F022, F023 | M | ✅ | `operations/evolve.ts` (gate on ingest), `operations/validate.ts` (precondition) |
| F025 | [`cc` skill + Spur personas + hide `validate` (P4-D3)](features/F025-cc-personas-hide-validate.md) | F022, F023, F024 | M | ✅ | `plugins/cc/skills/cc-*/SKILL.md`, `plugins/cc/agents/expert-*.md`, delete `commands/hook-validate.md` |
| F026 | [Empirical behavior gate (`evolve --eval-gate`)](features/F026-empirical-behavior-gate.md) | F024 | M | ✅ | `quality/eval-cases.ts`, `quality/replay.ts`, `operations/{replay-runner,pairwise-judge,noise-floor}.ts`, `operations/evolve.ts` (gate + persistence), `commands/helpers.ts` |
```
F021 (rubric config)   ← fitness function; both seams read it
  │
  ├──► F022 (scorer seam)     ─┐
  ├──► F023 (generation seam) ─┤
  │                            ├──► F024 (double-loop gate) ──► F025 (cc skill + personas + phase gate)
  └─────────────────────────────┘
```

> **Invariant (design §8 #1, carried from ADR/03):** the CLI **never** calls a model API. F022/F023
> add envelope-out / ingest-in seams; intelligence enters only as ingested JSON. The fixture-replay
> tests (record agent score/proposal JSON, replay through CLI ingest — written per-feature) are how
> the non-deterministic layer is tested with **zero** live model calls.

### Foundation (carried forward)

| Item | Status |
|------|--------|
| `evaluate`/`evolve` machinery (F011/F013) | ✅ (the seams extend these, not replace) |
| `ProposedChange`/`applyChange`/`computeTrends`/`stepVerify` | ✅ (reused by F023/F024) |
| SQLite store + DAOs (F008) | ✅ (F022 adds `rubric_version` stamping) |
| Phase 3 thin `cc` plugin | ✅ (F025 re-wires its SKILL.md to drive the seams) |

### Task creation plan

| Order | Feature | Task | Rationale |
|-------|---------|------|-----------|
| 1 | F021 | `F021-rubric-config` | **Foundation.** Versioned, user-overridable rubric YAML (unified shape) + 5 package defaults + override resolution. Dimension names reuse `DIMENSION_REGISTRY` keys; weights make rubric aggregate weighted. |
| 2 | F022 | `F022-scorer-seam` | Depends on F021. `evaluate --rubric <file> --json` emits the score envelope; `evaluate --ingest <scores.json> --save` validates against rubric schema + persists with `scorer: rubric` marker + `rubric_version`. Trends compare same-version only. |
| 3 | F023 | `F023-generation-seam` | Depends on F021. Replace `generateChanges` placeholder; `evolve --propose-only --json` emits per-dimension generation briefs (with immutable goal anchor); `evolve --ingest <proposal.json>` accepts authored `ProposedChange[]`. Parallel to F022. |
| 4 | F024 | `F024-double-loop-gate` | Depends on F022+F023. Gate on ingest: validate-zero-errors **and** post-aggregate − baseline ≥ Δ (default 0.05) **and** no anchor violation → else proposal stays `draft`, file restored. Extends `stepVerify`. |
| 5 | F025 | `F025-cc-personas-hide-validate` | Depends on F022–F024. Wire `cc:cc-<type>` SKILL.md to drive Scorer/Author/Skeptic/Judge personas through the seams; remove deterministic-only framing; **hide `validate`** (P4-D3) — delete `hook-validate.md`, no `*-validate` command. Also owns the **phase closing gate** (full suite + ≥90% coverage + zero model calls). |

> Per-feature tests live in each task's `### Testing` section (fixture-replay, no model calls); there
> is **no** standalone test task.

**Parallelization**: F021 first. After it, F022 and F023 parallelize. F024 gates on both seams. F025 is last (skill wiring + the phase closing gate). Each feature's tests ship in its own task.

---

## Phase 5: Universal hooks & deterministic verb restoration

Design: [design-doc-phase5.md](design/design-doc-phase5.md)

Deliver one canonical hook definition that installs across every supported agent — by **leveraging
`rulesync`'s native hook feature** (not a bespoke abstraction) — and restore the deterministic verbs
deleted in Phase 3. **Corrected scope (2026-06-17):** hooks **already emit** for the 4 rulesync-hook
targets (codex, opencode, antigravity-cli/ide) — `runRulesync` already forwards `'hooks'` to
`generate()`. The real install work is **surfacing** the dropped `hooksCount`, not "un-stubbing
`rulesync.ts`." The only hook *coverage* gaps are Pi/omp/hermes.

### Feature list

| ID | Feature | Deps | Size | Status | Files |
|----|---------|------|------|--------|-------|
| F027 | [Surface hook counts in install + validation checklist](features/F027-install-hook-counts.md) | — | S | ✅ | `commands/install.ts` (`InstallResultCounts` + accumulate) |
| F028 | [Pi/omp/hermes hook enablement (shim/copy)](features/F028-pi-omp-hook-shim.md) | F027 | M | ✅ | `commands/install.ts` (copy/shim step), shim assets |
| F029 | [`cc:cc-hooks` re-author + `hook emit` wrapper](features/F029-cc-hooks-emit.md) | F027 | M | ✅ | `commands/hook.ts` (`emit`), `plugins/cc/skills/cc-hooks/SKILL.md`, `plugins/cc/agents/expert-hook.md` |
| F030 | [Restore `skill package`](features/F030-skill-package.md) | — | M | ✅ | `commands/skill.ts` (`package`), `operations/package.ts` |
| F031 | [Restore `skill migrate` (refinement via Phase 4)](features/F031-skill-migrate.md) | F023, F030 | M | ✅ | `commands/skill.ts` (`migrate`), `operations/migrate.ts` |
| F032 | [Confirm/close `adapt` gap inside `install`](features/F032-adapt-gap.md) | — | S | ✅ | `pipeline/convert.ts` (add only what's missing) |

**Size key**: S = ≤2 files + tests, one session. M = 3–6 files + tests, may span sessions.

> **Tests live inside each feature** (design rule — no pure-test feature/task). Per-feature tests:
> `install-hooks.test.ts` split across F027 (✅-target counts) + F028 (Pi/omp/hermes shim);
> `hook-emit.test.ts` in F029; `skill-package.test.ts` in F030; `skill-migrate.test.ts` in F031;
> the `adapt` parity test in F032. The whole-phase closing gate (full suite green, ≥90% coverage) is
> owned by **F032** (independent, lands late).

### Dependency graph

```
F027 (surface hook counts) ──► F028 (Pi/omp/hermes shim)
        └───────────────────► F029 (cc:cc-hooks re-author + hook emit)

F030 (skill package) ──► F031 (skill migrate)  ◄── F023 (Phase 4 generation seam)

F032 (adapt gap + phase closing gate) ── independent
```

> **Cross-phase dependency:** F031 (`skill migrate`)'s content refinement is non-deterministic →
> routes through the **Phase 4 generation seam (F023)**. It cannot ship its refinement layer before
> Phase 4; a deterministic merge core can land first, refinement layered after (design §3 NOTE).

> **Invariants (design §7):** rulesync owns hook format knowledge — superskill never hardcodes a
> target's hook file format (#1); one canonical `.rulesync/hooks.json` (`HookDefinitionSchema`), no
> parallel abstract schema (#2); restored verbs live in the CLI, never as plugin scripts (#3); hook
> content is untrusted (#4); coverage is evidenced from the vendor matrix, shims only for proven gaps (#5).

### Foundation (carried forward)

| Item | Status |
|------|--------|
| Phase 4 generation seam (F023) | ✅ (F031 refinement depends on it) |
| rulesync `HookDefinitionSchema` + per-tool matrix | ✅ (vendored; F029 authors against it) |
| Phase 3 thin `cc:cc-hooks` skill | ✅ (F029 re-authors it) |

### Task creation plan

| Order | Feature | Task | Rationale |
|-------|---------|------|-----------|
| 1 | F027 | `F027-install-hook-counts` | **Smallest, foundational.** Add `hooksCount` to `InstallResultCounts`, accumulate `result.hooksCount`, print it. Validation checklist (event-name fidelity for 4 ✅ targets). No `rulesync.ts` change. |
| 2 | F032 | `F032-adapt-gap` | Independent + small. Confirm the deleted `adapt` adapters' behavior is covered by `pipeline/convert.ts`; add only the missing transform. Closes a Phase 3 deletion debt. |
| 3 | F030 | `F030-skill-package` | Independent. Restore `superskill skill package <name>` — re-spec the deleted `package.ts` against the content-IO layer. Deterministic. |
| 4 | F028 | `F028-pi-omp-hook-shim` | Depends on F027. Research the Pi/omp extension/shim mechanism (§1.2 — the one genuine research item), implement the chosen rung; hermes via copy-step. |
| 5 | F029 | `F029-cc-hooks-emit` | Depends on F027. Re-author `cc:cc-hooks` SKILL.md + expert-hook against `HookDefinitionSchema`; add `superskill hook emit --target` thin wrapper over the install hook path. |
| 6 | F031 | `F031-skill-migrate` | Depends on F030 + F023 (Phase 4). Restore `superskill skill migrate <sources...> <dest>` — deterministic merge core; refinement routes through the generation seam. |

> Per-feature tests live in each task's `### Testing` section (per-target hook-emission fixtures,
> verb-restoration tests); there is **no** standalone test task. The phase closing gate (full suite +
> ≥90% coverage) is owned by F032.

**Parallelization**: F027, F030, F032 are independent and can start together. F028/F029 follow F027. F031 follows F030 **and** Phase 4's F023.

## Cross-repo: anti-hallucination migration (task 0041)

| ID | Feature | Status | Files |
|----|---------|--------|-------|
| AH1 | Engine + prose relocated to superskill | ✅ | `plugins/cc/scripts/anti-hallucination/`, `plugins/cc/skills/anti-hallucination/` |
| AH2 | Claude Stop-hook re-homed | ✅ | `plugins/cc/hooks/hooks.json` |
| AH3 | Delete from Spur + dedup logger | 💤 | Blocked by AH4 (enforcement gap) |
| AH4 | Cross-agent enforcement as `spur workflow` + `spur agent` | 💤 | Blocked: Spur data-threading gap (ADR-015) |
| AH5 | Single-source seam + full governance | 💤 | Blocked by AH4 |

See ADR-015 for the decision and the Phase 4 blocker. Spur companion task: spur-new#0087 (Done, but acceptance claim unverified by executable test).
