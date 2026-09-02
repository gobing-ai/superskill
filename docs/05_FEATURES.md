---
doc: 05_FEATURES
owns: STATUS — feature decomposition + state (✅ done / 🔶 partial / ⏳ planned / 💤 deferred)
authority: derived
version: 6.3.0
derived_from: [01_PRD, 02_ROADMAP]
owner: Robin Min
updated_at: 2026-09-01
read_before: finding a feature's state; edit when a feature's status changes
edit_rules: 99 §6.6
sync: [T4]
---

# Features

Status legend: ✅ done · 🔶 partial · ⏳ planned · 💤 deferred

> **Legacy ID conversion (2026-08-01).** The spur-managed feature tree
> ([docs/features/INDEX.md](features/INDEX.md)) is now the live feature structure. All F0xx IDs
> below were converted to tree nodes: F001–F006 → G11–G14/E2/F3 (install pipeline, Phase 1),
> F007–F015 → G21–G26/F4/F5/E3 (authoring, Phase 2), F016–F020 → H3–H6/I1 (plugin consolidation,
> Phase 3), F021–F026 → G31–G35/H7 (quality brain, Phase 4), F027–F032 → F6/H8/H9/G41–G43
> (hooks + restored verbs, Phase 5). The phase tables and graphs below use the new IDs; the
> narrative is preserved as historical record. Backticked task-plan names retain the original
> planning-era labels.

## Phase 1: Distribution — `superskill install`

Design: [design-doc-phase1.md](design/design-doc-phase1.md)

### Feature list

| ID | Feature | Deps | Status | Files |
|----|---------|------|--------|-------|
| G11 | [Target taxonomy + config schema](features/G11_target-taxonomy-config-schema.md) | — | ✅ | `targets.ts`, `config.ts` |
| G12 | [Plugin → .rulesync/ mapper](features/G12_plugin-rulesync-mapper.md) | — | ✅ | `mapper.ts` |
| G13 | [Conversion pipeline + rulesync integration](features/G13_conversion-pipeline-rulesync-integration.md) | G11 | ✅ | `pipeline/*`, `rulesync.ts` |
| F3 | [superskill install command + target dispatch](features/F3_superskill-install-command-marketplace-registration.md) | G11, G12, G13, G14 | ✅ | `commands/install.ts` |
| B | [Skill update notification — install manifest and update verb](features/B_skill-update-notification-install-manifest-and-update-verb.md) | F3 | ✅ | `operations/install-manifest.ts`, `operations/update.ts`, `commands/update.ts` |
| E2 | [Tests + verification](features/E2_tests-verification.md) | G11–F3, G14 | ✅ | `tests/*` |
| G14 | [Marketplace manifest resolver](features/G14_marketplace-manifest-resolver.md) | — | ✅ | `marketplace.ts` |

> **ADR-034 (2026-08-09, task 0113):** G14/F3 extended — `--marketplace` is now a **locator**
> (local dir, `.claude-plugin/`, GitHub URL, or `owner/repo` shorthand) with remote content cached
> at `~/.cache/superskill/marketplaces/<owner>/<repo>/<ref>/`; the installed package ships
> `plugins/`/`.claude-plugin/`/`magents/` and self-locates its own root. `--marketplace-source` is
> deprecated.

### Foundation (already done)

| Item | Status |
|------|--------|
| Project scaffold | ✅ |
| Biome + TypeScript gates | ✅ |
| bun:test suite (2 tests, 100%) | ✅ |
| Spur recommended rule catalog (33 pre-check + 3 post-check rules) | ✅ |
| Remove ts-base artifacts | ✅ |
| Documentation 00–05 | ✅ |

### Dependency graph

```
G11 ──┐
       ├──► G13 ──┐
G12 ──┘           ├──► F3 ──► E2
G14 ──────────────┘
(G11, G12, G14 have no deps — parallelizable)
```

## Task creation plan

Each feature becomes one task file. Recommended order and granularity:

| Order | Feature | Task | Size | Rationale |
|-------|---------|------|------|-----------|
| 1 | G11 | `F001-target-taxonomy-config` | S (1 file + tests) | Foundation — unblocks G13. Smallest possible increment. |
| 2 | G12 | `F002-plugin-mapper` | S (1 file + tests) | Independent of G11. Can run in parallel. |
| 3 | G14 | `F006-marketplace-resolver` | S (1 file + tests) | Independent. Resolves plugin roots; unblocks F3. |
| 4 | G13 | `F003-conversion-pipeline` | M (3–4 files + tests) | Depends on G11. Pipeline stages + rulesync wrapper. |
| 5 | F3 | `F004-install-command` | M (1–2 files + tests) | Depends on G11–G13 + G14. Integration point. |
| 6 | E2 | `F005-tests-verification` | S (test files) | Depends on F3. Covers everything. |

**Parallelization**: G11, G12, and G14 have no shared dependencies — they can be implemented concurrently in separate sessions. G13 must wait for G11. F3 gates on G11+G12+G13+G14. E2 runs last.

**Size key**: S = ≤2 files + tests, completable in one session. M = 3–5 files + tests, may span sessions.

---

## Phase 2: Authoring + quality — `superskill <type> <op>`

Design: [design-doc-phase2.md](design/design-doc-phase2.md)

### Feature list

| ID | Feature | Deps | Size | Status | Files |
|----|---------|------|------|--------|-------|
| G21 | [Template + content-IO foundation + scaffold](features/G21_template-content-io-foundation-scaffold-operation.md) | — | M | ✅ | `content/*` (5), `templates/*/default.md` (5), `operations/scaffold.ts` |
| F4 | [SQLite data store (via @gobing-ai/ts-db)](features/F4_sqlite-data-store.md) | G21 | M | ✅ | `store/schema.ts`, `store/db.ts`, `store/evaluations.ts`, `store/proposals.ts` |
| G22 | [Quality dimension definitions](features/G22_quality-dimension-definitions.md) | G21 | M | ✅ | `quality/dimensions.ts` + 5 type-specific evaluators |
| G23 | [Validate operation](features/G23_validate-operation.md) | G21, G22 | S | ✅ | `operations/validate.ts` |
| G24 | [Evaluate operation](features/G24_evaluate-operation.md) | G21, F4, G22 | S | ✅ | `operations/evaluate.ts` |
| G25 | [Refine operation](features/G25_refine-operation.md) | G21, G23, G24 | S | ✅ | `operations/refine.ts` |
| G26 | [Evolve operation](features/G26_evolve-operation.md) | G21, F4, G24 | M | ✅ | `operations/evolve.ts` |
| F5 | [Five type command files](features/F5_five-type-command-files.md) | G21–G26 | M | ✅ | `commands/helpers.ts` + `commands/{agent,skill,command,hook,magent}.ts` + `cli.ts` |
| E3 | [Phase 2 tests](features/E3_phase-2-tests.md) | G21–F5 | M | ✅ | `apps/cli/tests/{content,scaffold,validate,evaluate,refine,evolve,store,commands}.test.ts` |
### Dependency graph

```
G21 (content-IO + templates + scaffold)   ← foundation; everything below imports content/*
  │
  ├──► F4 (SQLite store)      ─┐
  ├──► G22 (quality dims)      ─┤
  │                              ├──► G23 (validate) ──┐
  │                              ├──► G24 (evaluate) ──┤
  │                              │                       ├──► G25 (refine) ──┐
  │                              │                       ├──► G26 (evolve) ──┤
  │                              │                       │                    │
  └──────────────────────────────┴───────────────────────┴────────────────────┼──► F5 (commands) ──► E3 (tests)
```

G21 is no longer parallel with F4/G22 — it owns the shared `content/*` primitives (frontmatter parse/edit, name resolution, hashing, the single change-apply, data-root/path rules) that F4–G26 all import. F4 and G22 parallelize **after** G21 lands.

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
| 1 | G21 | `F007-template-scaffold` | **Foundation, must land first.** `content/*` primitives + templates + scaffold. F4–G26 import it. Adds the `yaml` dep (ADR-012). |
| 2 | F4 | `F008-sqlite-store` | Depends on G21 (`content/paths.ts`). DB open/migration, evaluations CRUD, proposals CRUD. Foundation for G24/G26. |
| 3 | G22 | `F009-quality-dimensions` | Depends on G21 (`parseFrontmatter`, `ContentType`, `REQUIRED_FIELDS`). Dimension schemas + scoring for all 5 types. Foundation for G23/G24. |
| 4 | G23 | `F010-validate-operation` | Depends on G21+G22. Pure structural validation (exit codes mapped in F5). First user-visible operation. |
| 5 | G24 | `F011-evaluate-operation` | Depends on G21+F4+G22. Quality scoring with `--json --save`; `operation`/`target_agent`/`file_hash` per ADR-013. |
| 6 | G25 | `F012-refine-operation` | Depends on G21+G23+G24. Evaluate → fix via shared `applyChange`. |
| 7 | G26 | `F013-evolve-operation` | Depends on G21+F4+G24. Longitudinal analysis + proposal workflow via shared `applyChange`/`getProposalsDir`. Most complex. |
| 8 | F5 | `F014-type-commands` | Depends on G21–G26. `helpers.ts` (exit-code mapping, `resolveTarget` default) + Commander wiring for 5 types × 5 ops. |
| 9 | E3 | `F015-phase2-tests` | Depends on G21–F5. `content.test.ts` + per-operation + integration tests, ≥90% line/function coverage. |

**Parallelization**: G21 must land first (it owns `content/*`). After G21, F4 and G22 parallelize. G23 and G24 run in parallel after G22/F4. G25 and G26 run in parallel after G23+G24.

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
| H3 | [Namespace migration (`rd3`→`cc`) + companion configs](features/H3_namespace-migration-rd3-cc-companion-configs.md) | — | M | ✅ | `plugins/cc/**` (~123 files w/ `rd3`) |
| H4 | [Skill + expert-subagent rewrite → `superskill`](features/H4_skill-expert-subagent-rewrite-superskill.md) | H3 | M | ✅ | `plugins/cc/skills/*/SKILL.md` (5), `plugins/cc/agents/expert-*.md` (5) |
| H5 | [Slash-command disposition + `hooks.json` fix](features/H5_slash-command-disposition-hooks-json-fix.md) | H3 | M | ✅ | `plugins/cc/commands/*.md` (17), `plugins/cc/hooks/hooks.json` |
| H6 | [Embedded-code deletion](features/H6_embedded-code-deletion.md) | H4, H5 | S | ✅ | delete `plugins/cc/skills/*/{scripts,templates,tests}/`, `cc-hooks/{emitters,schema}/`, `references/scripts-usage.md` |
| I1 | [Binary-on-PATH + Phase 3 verification](features/I1_binary-on-path-phase-3-verification.md) | H3–H6 | S | ✅ | `apps/cli/package.json` (verify bin), docs/runbook; no plugin code |
```
H3 (rename rd3→cc)   ← must land first; every ref-bearing file depends on the final names
  │
  ├──► H4 (SKILL.md + expert-*.md rewrite) ─┐
  ├──► H5 (commands + hooks.json)           ─┤
  │                                            ├──► H6 (delete embedded code) ──► I1 (binary + verify)
  └────────────────────────────────────────────┘
```

> **Ordering invariant (design §5):** H6 deletion runs **only after** H4+H5 stop referencing the deleted paths (`rg "scripts/" plugins/cc/` and `rg "bun .*\.ts" plugins/cc/` both empty). I1's PATH gate (`bun run build` + `bun link`) must be exercised before the rewritten commands are claimed functional.

### Foundation (carried forward)

| Item | Status |
|------|--------|
| `superskill <type> <op>` CLI (Phase 2) | ✅ (deps for the rewrite targets) |
| Documentation 00–05 | ✅ |

### Task creation plan

| Order | Feature | Task | Rationale |
|-------|---------|------|-----------|
| 1 | H3 | `F016-namespace-migration` | **Must land first.** Global `rd3`→`cc` string migration (skill dir names kept; refs → `cc:cc-*`). Companion configs (`metadata.openclaw`, `agents/openai.yaml`) renamed in lockstep. Invariant: `rg rd3 plugins/cc/` → 0. |
| 2 | H4 | `F017-skill-subagent-rewrite` | Depends on H3 (final names). Rewrite 5 `SKILL.md` + 5 `expert-*.md` to call bare `superskill <type> <op>`; fix hardcoded `plugins/rd3/...` paths; drop deleted-op rows. |
| 3 | H5 | `F018-command-disposition-hooks` | Depends on H3. Rewrite 17 commands → `superskill` verb; delete 8 orphans; strip dangling `hooks.json` entries (ship empty/minimal). Runs parallel to H4. |
| 4 | H6 | `F019-embedded-code-deletion` | Depends on H4+H5 (ordering invariant). Delete `scripts/`, `templates/`, `tests/`, `cc-hooks/{emitters,schema}/`, `references/scripts-usage.md`. Gate: zero `scripts/`/`bun .*.ts` refs. |
| 5 | I1 | `F020-binary-path-verification` | Depends on H3–H6. Establish + exercise `bun run build` + `bun link` (dev), document `npm i -g @gobing-ai/superskill` (consumers); run the §6 exit gate. |

**Parallelization**: H3 first. After it, H4 and H5 parallelize. H6 gates on both. I1 last.

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
| G31 | [Rubric config format + package defaults + override resolution](features/G31_rubric-config-format-package-defaults-override-resolution.md) | — | M | ✅ | `quality/rubric.ts`, `rubrics/<type>.yaml` (5), `quality/dimensions.ts` (weights) |
| G32 | [Scorer seam (`evaluate --rubric`/`--ingest`)](features/G32_scorer-seam-evaluate-rubric-ingest.md) | G31 | M | ✅ | `operations/evaluate.ts`, `store/schema.ts` (rubric_version), `commands/helpers.ts` |
| G33 | [Generation seam (`evolve --propose-only --json`/`--ingest`)](features/G33_generation-seam-evolve-propose-only-json-ingest.md) | G31 | M | ✅ | `operations/evolve.ts` (replace `generateChanges` placeholder), `commands/helpers.ts` |
| G34 | [Double-loop gate (validate + Δ-margin + anchor)](features/G34_double-loop-gate-adversarial-safeguards.md) | G32, G33 | M | ✅ | `operations/evolve.ts` (gate on ingest), `operations/validate.ts` (precondition) |
| H7 | [`cc` skill + Spur personas + hide `validate` (P4-D3)](features/H7_cc-skill-spur-personas-hide-validate-p4-d3.md) | G32, G33, G34 | M | ✅ | `plugins/cc/skills/cc-*/SKILL.md`, `plugins/cc/agents/expert-*.md`, delete `commands/hook-validate.md` |
| G35 | [Empirical behavior gate (`evolve --eval-gate`)](features/G35_empirical-behavior-gate-evolve-eval-gate.md) | G34 | M | ✅ | `quality/eval-cases.ts`, `quality/replay.ts`, `operations/{replay-runner,pairwise-judge,noise-floor}.ts`, `operations/evolve.ts` (gate + persistence), `commands/helpers.ts` |
```
G31 (rubric config)   ← fitness function; both seams read it
  │
  ├──► G32 (scorer seam)     ─┐
  ├──► G33 (generation seam) ─┤
  │                            ├──► G34 (double-loop gate) ──► H7 (cc skill + personas + phase gate)
  └─────────────────────────────┘
```

> **Invariant (design §8 #1, carried from ADR/03):** the CLI **never** calls a model API. G32/G33
> add envelope-out / ingest-in seams; intelligence enters only as ingested JSON. The fixture-replay
> tests (record agent score/proposal JSON, replay through CLI ingest — written per-feature) are how
> the non-deterministic layer is tested with **zero** live model calls.

### Foundation (carried forward)

| Item | Status |
|------|--------|
| `evaluate`/`evolve` machinery (G24/G26) | ✅ (the seams extend these, not replace) |
| `ProposedChange`/`applyChange`/`computeTrends`/`stepVerify` | ✅ (reused by G33/G34) |
| SQLite store + DAOs (F4) | ✅ (G32 adds `rubric_version` stamping) |
| Phase 3 thin `cc` plugin | ✅ (H7 re-wires its SKILL.md to drive the seams) |

### Task creation plan

| Order | Feature | Task | Rationale |
|-------|---------|------|-----------|
| 1 | G31 | `F021-rubric-config` | **Foundation.** Versioned, user-overridable rubric YAML (unified shape) + 5 package defaults + override resolution. Dimension names reuse `DIMENSION_REGISTRY` keys; weights make rubric aggregate weighted. |
| 2 | G32 | `F022-scorer-seam` | Depends on G31. `evaluate --rubric <file> --json` emits the score envelope; `evaluate --ingest <scores.json> --save` validates against rubric schema + persists with `scorer: rubric` marker + `rubric_version`. Trends compare same-version only. |
| 3 | G33 | `F023-generation-seam` | Depends on G31. Replace `generateChanges` placeholder; `evolve --propose-only --json` emits per-dimension generation briefs (with immutable goal anchor); `evolve --ingest <proposal.json>` accepts authored `ProposedChange[]`. Parallel to G32. |
| 4 | G34 | `F024-double-loop-gate` | Depends on G32+G33. Gate on ingest: validate-zero-errors **and** post-aggregate − baseline ≥ Δ (default 0.05) **and** no anchor violation → else proposal stays `draft`, file restored. Extends `stepVerify`. |
| 5 | H7 | `F025-cc-personas-hide-validate` | Depends on G32–G34. Wire `cc:cc-<type>` SKILL.md to drive Scorer/Author/Skeptic/Judge personas through the seams; remove deterministic-only framing; **hide `validate`** (P4-D3) — delete `hook-validate.md`, no `*-validate` command. Also owns the **phase closing gate** (full suite + ≥90% coverage + zero model calls). |

> Per-feature tests live in each task's `### Testing` section (fixture-replay, no model calls); there
> is **no** standalone test task.

**Parallelization**: G31 first. After it, G32 and G33 parallelize. G34 gates on both seams. H7 is last (skill wiring + the phase closing gate). Each feature's tests ship in its own task.

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
| F6 | [Surface hook counts in install + validation checklist](features/F6_surface-hook-counts-in-install-validation-checklist.md) | — | S | ✅ | `commands/install.ts` (`InstallResultCounts` + accumulate) |
| H8 | [Pi/omp/hermes hook enablement (shim/copy)](features/H8_pi-omp-hermes-hook-enablement.md) | F6 | M | ✅ | `commands/install.ts` (copy/shim step), shim assets |
| H9 | [`cc:cc-hooks` re-author + `hook emit` wrapper](features/H9_cc-cc-hooks-re-author-hook-emit-wrapper.md) | F6 | M | ✅ | `commands/hook.ts` (`emit`), `plugins/cc/skills/cc-hooks/SKILL.md`, `plugins/cc/agents/expert-hook.md` |
| G41 | [Restore `skill package`](features/G41_restore-skill-package.md) | — | M | ✅ | `commands/skill.ts` (`package`), `operations/package.ts` |
| G42 | [Restore `skill migrate` (refinement via Phase 4)](features/G42_restore-skill-migrate.md) | G33, G41 | M | ✅ | `commands/skill.ts` (`migrate`), `operations/migrate.ts` |
| G43 | [Confirm/close `adapt` gap inside `install`](features/G43_confirm-close-the-adapt-gap-inside-install.md) | — | S | ✅ | `pipeline/convert.ts` (add only what's missing) |

**Size key**: S = ≤2 files + tests, one session. M = 3–6 files + tests, may span sessions.

> **Tests live inside each feature** (design rule — no pure-test feature/task). Per-feature tests:
> `install-hooks.test.ts` split across F6 (✅-target counts) + H8 (Pi/omp/hermes shim);
> `hook-emit.test.ts` in H9; `skill-package.test.ts` in G41; `skill-migrate.test.ts` in G42;
> the `adapt` parity test in G43. The whole-phase closing gate (full suite green, ≥90% coverage) is
> owned by **G43** (independent, lands late).

### Dependency graph

```
F6 (surface hook counts) ──► H8 (Pi/omp/hermes shim)
        └───────────────────► H9 (cc:cc-hooks re-author + hook emit)

G41 (skill package) ──► G42 (skill migrate)  ◄── G33 (Phase 4 generation seam)

G43 (adapt gap + phase closing gate) ── independent
```

> **Cross-phase dependency:** G42 (`skill migrate`)'s content refinement is non-deterministic →
> routes through the **Phase 4 generation seam (G33)**. It cannot ship its refinement layer before
> Phase 4; a deterministic merge core can land first, refinement layered after (design §3 NOTE).

> **Invariants (design §7):** rulesync owns hook format knowledge — superskill never hardcodes a
> target's hook file format (#1); one canonical `.rulesync/hooks.json` (`HookDefinitionSchema`), no
> parallel abstract schema (#2); restored verbs live in the CLI, never as plugin scripts (#3); hook
> content is untrusted (#4); coverage is evidenced from the vendor matrix, shims only for proven gaps (#5).

### Foundation (carried forward)

| Item | Status |
|------|--------|
| Phase 4 generation seam (G33) | ✅ (G42 refinement depends on it) |
| rulesync `HookDefinitionSchema` + per-tool matrix | ✅ (vendored; H9 authors against it) |
| Phase 3 thin `cc:cc-hooks` skill | ✅ (H9 re-authors it) |

### Task creation plan

| Order | Feature | Task | Rationale |
|-------|---------|------|-----------|
| 1 | F6 | `F027-install-hook-counts` | **Smallest, foundational.** Add `hooksCount` to `InstallResultCounts`, accumulate `result.hooksCount`, print it. Validation checklist (event-name fidelity for 4 ✅ targets). No `rulesync.ts` change. |
| 2 | G43 | `F032-adapt-gap` | Independent + small. Confirm the deleted `adapt` adapters' behavior is covered by `pipeline/convert.ts`; add only the missing transform. Closes a Phase 3 deletion debt. |
| 3 | G41 | `F030-skill-package` | Independent. Restore `superskill skill package <name>` — re-spec the deleted `package.ts` against the content-IO layer. Deterministic. |
| 4 | H8 | `F028-pi-omp-hook-shim` | Depends on F6. Research the Pi/omp extension/shim mechanism (§1.2 — the one genuine research item), implement the chosen rung; hermes via copy-step. |
| 5 | H9 | `F029-cc-hooks-emit` | Depends on F6. Re-author `cc:cc-hooks` SKILL.md + expert-hook against `HookDefinitionSchema`; add `superskill hook emit --target` thin wrapper over the install hook path. |
| 6 | G42 | `F031-skill-migrate` | Depends on G41 + G33 (Phase 4). Restore `superskill skill migrate <sources...> <dest>` — deterministic merge core; refinement routes through the generation seam. |

> Per-feature tests live in each task's `### Testing` section (per-target hook-emission fixtures,
> verb-restoration tests); there is **no** standalone test task. The phase closing gate (full suite +
> ≥90% coverage) is owned by G43.

**Parallelization**: F6, G41, G43 are independent and can start together. H8/H9 follow F6. G42 follows G41 **and** Phase 4's G33.

## Cross-repo: anti-hallucination migration (task 0041)

| ID | Feature | Status | Files |
|----|---------|--------|-------|
| AH1 | Engine + prose relocated to superskill | ✅ | `plugins/cc/scripts/anti-hallucination/`, `plugins/cc/skills/anti-hallucination/` |
| AH2 | Claude Stop-hook re-homed | ✅ | `plugins/cc/hooks/hooks.json` |
| AH3 | Delete from Spur + dedup logger | 💤 | Blocked by AH4 (enforcement gap) |
| AH4 | Cross-agent enforcement as `spur workflow` + `spur agent` | 💤 | Blocked: Spur data-threading gap (ADR-015) |
| AH5 | Single-source seam + full governance | 💤 | Blocked by AH4 |

See ADR-015 for the decision and the Phase 4 blocker. Spur companion task: spur-new#0087 (Done, but acceptance claim unverified by executable test).

---

## Phase 6: Skills-ecosystem interop (`vercel-labs/skills` port)

Design: [04_DESIGN.md § Skills-ecosystem module surface](04_DESIGN.md#skills-ecosystem-module-surface-packagescoresrcskills-ecosystem)

### Feature list

| ID | Feature | Deps | Size | Status | Files |
|----|---------|------|------|--------|-------|
| F2 | [Skills-ecosystem interop: `npx skills` parity](features/F2_skills-ecosystem-compatibility-npx-skills-add-interop.md) | — | L | ✅ | `packages/core/src/skills-ecosystem/*`, `apps/cli/src/commands/skill.ts`, `packages/core/tests/skills-ecosystem/*` |

Tasks: 0097 (scaffold), 0098 (source-parser/sanitize/frontmatter), 0099 (agents/locks), 0100 (fetch/discovery), 0101 (installer/emit), 0102 (cli verbs), 0103 (round-trip interop verification & docs sync).

---

## Repository quality

| ID | Feature | Status | Files |
|----|---------|--------|-------|
| H2 | [CC plugin security and contract integrity](features/H2_cc-plugin-security-and-contract-integrity.md) | ✅ | `plugins/cc/**`, `plugins/cc/tests/*` |

---

## Phase 7: Codex native agent dual-emit (absorbed by F3; task 0111)

Design: [04_DESIGN.md § Phase 1 install surface](04_DESIGN.md#phase-1-install-surface)

This extension is part of [F3](features/F3_superskill-install-command-marketplace-registration.md), not a separate feature. F3 is ✅ after Spur refreshed tasks 0111–0113 and passed its lifecycle gate. Task 0111 dispatches plugin subagents natively to Codex as `~/.codex/agents/<plugin>-<agent>.toml`; ADR-033 and [04_DESIGN.md § Phase 1 install surface](04_DESIGN.md#phase-1-install-surface) own the decision and concrete shape.
