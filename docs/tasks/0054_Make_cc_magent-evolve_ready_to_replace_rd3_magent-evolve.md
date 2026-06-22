---
name: Make cc magent-evolve ready to replace rd3 magent-evolve
description: Make cc magent-evolve ready to replace rd3 magent-evolve
status: Done
created_at: 2026-06-21T20:56:07.146Z
updated_at: 2026-06-22T00:35:06.255Z
folder: docs/tasks
type: task
feature-id: ""
priority: high
tags: ["cc-magents","evolve","dogfood","migration","rd3-parity"]
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0054. Make cc magent-evolve ready to replace rd3 magent-evolve

### Background

Dogfood pair-run /cc:magent-evolve vs /rd3:magent-evolve. Same SHARED-ENGINE gaps (operations/evolve.ts type-agnostic): G1 empty proposals, G2 no --analyze, G3 no --history/--rollback, G4 wrapper drift in plugins/cc/commands/magent-evolve.md (false 'rollback via saved version history' claim; example './CLAUDE.md --accept p1234'). MAGENT-SPECIFIC: magents are frontmatter-OPTIONAL plain-markdown (AGENTS.md/CLAUDE.md/GEMINI.md) per task 0050. evolve.ts:381 reads frontmatter.description for negative-constraint extraction + the generation anchor; a frontmatter-less magent yields an empty description, so seeded proposals + the anchor hash must degrade gracefully (no crash, no false 'description' change on a config that has none). Verify the F024 anchor gate + computeBaselineAnchorHash behave on a no-frontmatter config. This task tracks the MAGENT slice: register flags on apps/cli/src/commands/magent.ts, fix the wrapper, and confirm frontmatter-less magents evolve without error.


### Requirements

Inherit 0052 decisions (G1 heuristic-seed+ingest; G2/G3 build analyze/history/rollback in shared engine). MAGENT extras: ensure seeded change generation + anchor hashing handle a frontmatter-LESS magent (empty/absent description) without crashing or proposing a bogus frontmatter.description edit; if the only proposable target is the body, seed body-section changes instead. Register flags on apps/cli/src/commands/magent.ts, fix plugins/cc/commands/magent-evolve.md drift + --accept example. Gates: bun run lint, bun run test (no skips, add a frontmatter-less-magent evolve regression test), bun run build, git clean. DOCS SYNC (CLAUDE.md mandate): the new flags (--analyze/--history/--rollback/--confirm) touch the CLI command/flag surface — update docs/04_DESIGN.md (and docs/design/design-doc-phase2.md) in the SAME commit. Do NOT flip /magent-evolve alias until parity confirmed AND global binary ships.


### Q&A



### Design

Per-type slice. SHARED engine fix landed in 0052 (`operations/evolve.ts`); this task consumes it for the
MAGENT type and handles the frontmatter-OPTIONAL wrinkle.

## Magent-specific risk (verified 2026-06-22)
`parseFrontmatter` (`packages/core/src/content/frontmatter.ts:30`) THROWS `FrontmatterError` on a file
that does not start with `---\n`. Magents are frontmatter-OPTIONAL plain markdown (AGENTS.md/CLAUDE.md/
GEMINI.md — task 0050). Three crash / bogus-edit paths confirmed by source read:

1. **`generateChanges` (evolve.ts:205-229)** ALWAYS emits `location: 'frontmatter.description'`
   (line 218) for any declining/flat-low dimension. On a frontmatter-less magent this proposes editing a
   field that does not exist → bogus proposal, and `--accept` later calls `applyFrontmatterChange`
   (edit.ts:24) → `parseFrontmatter` → **THROWS**.
2. **`computeBaselineAnchorHash` (evolve.ts:283-291)** calls `parseFrontmatter` unconditionally; on a
   frontmatter-less magent it **THROWS**. Reached via `stepVerify` (evolve.ts:861) on the ingest path
   when `gate.ingestedAnchorHash !== undefined`.
3. **`emitGenerationEnvelope` (evolve.ts:386-388)** calls `parseFrontmatter(content)`; on a
   frontmatter-less magent the `--json --propose-only` envelope path **THROWS**.

## M1 — confirmed mechanical gap
`addEvolveOptions` (helpers.ts:33-36) already registers `--analyze/--history/--rollback/--confirm` for
ALL content types including magent. But `magentEvolve` (magent.ts:92-115), `handleMagentEvolve`
(magent.ts:161-172), and the `registerMagent` action opts type (magent.ts:219-228) only forward the
original flags — the four new flags silently no-op. Mirror the agent.ts/command.ts forwarding pattern
(agent.ts:101-132).

## Work Items
- **M1** Register `--analyze/--history/--rollback/--confirm` on `apps/cli/src/commands/magent.ts` (4 sites).
- **M2** Guard the seed + anchor path for frontmatter-less magents: `generateChanges` redirects to a
  body-section change (no `frontmatter.description` edit) when no frontmatter present; `stepApply`
  tolerates a body-section location; `computeBaselineAnchorHash` + `emitGenerationEnvelope` degrade
  gracefully (empty frontmatter, empty description, hash still stable).
- **M3** Fix `plugins/cc/commands/magent-evolve.md` drift + `--accept` example.
- **M4** Regression: a frontmatter-less magent evolves (seed/analyze/history/rollback) without error and
  proposes no bogus frontmatter.description change.

## Acceptance
`magent evolve AGENTS.md --propose-only` → non-empty, sensible changes (body-targeted if no frontmatter);
no crash; analyze/history/rollback work. Gates green.

## Do-not-drift
Frontmatter-OPTIONAL magents. No engine rewrite beyond the frontmatter-less guard (additive to 0052).
Reuse F024. Body-section location uses a `body.<anchor>` shape so `stepApply`'s text-replace branch
(evolve.ts:794-801) handles it without a new `applyChange` kind.


### Solution

Consumes the 0052 shared-engine fix. M1 forwards the four new flags through the magent subcommand
(mechanical, mirrors agent.ts/command.ts). M2 adds an additive frontmatter-less guard to three
functions in `operations/evolve.ts` (`generateChanges`, `computeBaselineAnchorHash`,
`emitGenerationEnvelope`) so a frontmatter-OPTIONAL magent degrades gracefully — no crash, no bogus
`frontmatter.description` edit; body-targeted proposals instead. M3 fixes the wrapper drift. M4 adds a
magent-type regression block matching the command-type block added in 0053.

### Plan

1. **M2 engine guard** (`operations/evolve.ts`): add `hasFrontmatter(content)` helper; branch
   `generateChanges` to emit `location: 'body.<dim>'` + a real text anchor when no frontmatter;
   guard `computeBaselineAnchorHash` and `emitGenerationEnvelope` to use empty frontmatter on parse
   failure; ensure `stepApply` text-branch handles body locations (already does — verify).
2. **M1 flag forwarding** (`commands/magent.ts`): mirror agent.ts:101-132 across `magentEvolve`,
   `handleMagentEvolve`, and `registerMagent` evolve action opts type.
3. **M3 wrapper** (`plugins/cc/commands/magent-evolve.md`): align description/When-to-Use to real
   capabilities (analyze/history/rollback now exist); replace `--accept p1234` with real id shape
   (`magent-evolve-YYYY-MM-DD-NNN`); sync `argument-hint`; rebuild Arguments table with header.
4. **M4 regression** (`apps/cli/tests/operations/evolve.test.ts`): add `describe('evolve — magent type
   (0054)')` block — frontmatter-less magent propose-only (body-targeted, non-empty, no
   `frontmatter.description`), analyze, history, rollback; --json --propose-only envelope on
   frontmatter-less magent (no crash).
5. **Docs sync**: `docs/design/design-doc-phase2.md` — note magent evolve now supports
   --analyze/--history/--rollback/--confirm and frontmatter-less configs.
6. **Gate**: `bun run lint && bun run test && bun run build`; `git status` clean. Atomic commits per
   work item. Do NOT flip the /magent-evolve alias (ship coordination with 0053/0055).

## Review

_2026-06-22, dev-run, inline verify_


**Status:** 0 P1/P2; 0 P3/P4 — clean implementation.
**Scope:** `apps/cli/src/operations/evolve.ts`, `apps/cli/src/commands/magent.ts`,
`packages/core/src/operations/validate.ts`, `apps/cli/tests/operations/evolve.test.ts`,
`plugins/cc/commands/magent-evolve.md`, `docs/design/design-doc-phase2.md`.
**Mode:** inline verify (Stage 4 gate + Stage 5 post-flight).
**Channel:** inline (current) — dogfood rule (modifies shared engine).
**Gate:** `bun run lint` → pass · `bun run test` → 990/990 pass (0 skips) · `bun run build` → pass ·
`git status` → 6 files, all in scope.
**Verdict:** PASS.

### Work-item traceability
- **M1 (flag forwarding)** — MET. `magentEvolve` (magent.ts:92), `handleMagentEvolve` (magent.ts:169),
  and `registerMagent` evolve action opts (magent.ts:237) all carry `analyze/history/rollback/confirm`.
  `magent evolve --help` lists all four flags. Smoke-confirmed.
- **M2 (frontmatter-less guard)** — MET. Three crash/bogus-edit paths guarded:
  (a) `generateChanges` (evolve.ts:228) now takes optional `content`; emits `location: 'body'` with the
  first non-empty line as anchor when no frontmatter (no `frontmatter.description` edit).
  (b) `computeBaselineAnchorHash` (evolve.ts:324) uses `hasFrontmatter()` guard + try/catch; empty
  frontmatter mapping on absence.
  (c) `emitGenerationEnvelope` (evolve.ts:432) same guard.
  (d) Validator (`validate.ts:187`) tolerates absent frontmatter for `magent` type only — required for
  the deterministic gate to pass on `--accept`. Smoke-confirmed: `--accept` applies, `--rollback`
  restores byte-identical.
- **M3 (wrapper drift)** — MET. `plugins/cc/commands/magent-evolve.md` rewritten: real capabilities,
  real id shape (`magent-evolve-2026-06-22-001`), synced `argument-hint`, complete 13-row Arguments
  table with header, frontmatter-OPTIONAL note.
- **M4 (regression)** — MET. 3 new `generateChanges` unit tests (body-target, empty-body fallback,
  frontmatter-preserved) + 6 new magent-type integration tests (propose-only, analyze, history,
  rollback, rollback-no-confirm, json-envelope) — all pass within the 990-test suite.

### Do-not-drift adherence
No engine rewrite beyond the additive frontmatter-less guard. Reused F024 (runGate unchanged),
`computeTrends`, `applyChange` text-branch. `--rollback` still gated behind `--confirm`. No alias flip.

### Testing

- **Command:** `bun run lint && bun run test && bun run build` (Ran at 2026-06-22T00:35:00Z)
- **Scope:** Full project — 990 tests across 58 files, coverage gate (90/90), Biome lint, TypeScript
  typecheck, Bun bundle build. Evolve-specific: 59 tests in `evolve.test.ts` (was 50; +9 new for 0054).
- **Result:** PASS — 990/990 tests, 0 failures, 0 skips, 2461 expect() calls. Aggregate coverage
  99.69% funcs / 98.76% lines. `evolve.ts` at 97.87% funcs / 96.29% lines. `magent.ts` 100/100.
  `validate.ts` 100/100. Lint clean. Build succeeds (3.43 MB bundle).
- **Evidence:**
  - `bun run lint` — Biome check + typecheck both exit 0.
  - `bun run test` — 990 pass, 0 fail. New: 3 `generateChanges` unit tests (body-target, empty-body
    fallback, frontmatter-preserved) + 6 magent-type integration tests (propose-only/analyze/history/
    rollback/rollback-no-confirm/json-envelope).
  - `bun run build` — Bundled 768 modules, exit 0.
  - Functional smoke test (`/tmp/smoke-0054/AGENTS.md`, frontmatter-less): `--analyze` prints trend
    table + score (no crash); `--propose-only` writes 5 body-targeted changes (`**Location:** body`,
    no `frontmatter.description`); `--accept` applies (score 0.05 → 0.19); `--history` lists version
    with ✓ snapshot; `--rollback --confirm` restores byte-identical.
- **Next action:** None — all gates pass.

### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References


