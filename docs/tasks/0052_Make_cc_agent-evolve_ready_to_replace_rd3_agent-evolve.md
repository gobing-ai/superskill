---
name: Make cc agent-evolve ready to replace rd3 agent-evolve
description: Make cc agent-evolve ready to replace rd3 agent-evolve
status: WIP
created_at: 2026-06-21T20:55:48.410Z
updated_at: 2026-06-21T21:47:13.193Z
folder: docs/tasks
type: task
feature-id: ""
priority: high
tags: ["cc-agents","evolve","dogfood","migration","rd3-parity"]
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0052. Make cc agent-evolve ready to replace rd3 agent-evolve

### Background

Dogfood pair-run /cc:agent-evolve vs /rd3:agent-evolve on plugins/cc/agents/expert-agent.md (global superskill 0.1.8). THREE gaps found. G1 [P1]: cc evolve --propose-only writes a proposal with a trend table but EMPTY 'Proposed changes' — operations/evolve.ts:595 stepPropose ships changes:[] ('placeholder generation removed — changes come via --ingest'). generateChanges() (evolve.ts:197) exists and produces heuristic changes for declining/flat-low dims but is UNUSED in the interactive/propose-only path. rd3 --propose drafts refine-backed proposals directly. G2 [MAJOR]: cc evolve has NO --analyze flag ('error: unknown option --analyze'); rd3 --analyze emits a rich multi-source analysis (git-history/ci-results/user-feedback/memory-md/interaction-logs + pattern detection + weak-dim count). G3 [MAJOR]: cc evolve has NO --history / --rollback; rd3 has both. G4 [MAJOR/doc-drift]: the wrapper plugins/cc/commands/agent-evolve.md:11 CLAIMS 'rollback via saved version history' and ':16 backup and rollback support' that DO NOT EXIST, and the example ':36 --accept p1234' uses a fabricated id. Engine is type-agnostic (operations/evolve.ts shared by all 5 types), so G1/G2/G3 fixes land once and benefit every type. Agents are file-based (.md); no dir-resolution work.


### Requirements

DECISIONS (confirmed by operator): G1 = heuristic-seed + ingest (revive generateChanges in stepPropose for declining/flat-low dims; keep --ingest for agent-authored refinement). G2/G3 = build --analyze + --history + --rollback for full rd3 parity (backup/restore helpers already in evolve.ts). Apply to the SHARED operations/evolve.ts + register flags on the agent evolve subcommand (apps/cli/src/commands/agent.ts). Fix wrapper G4 drift: align claims to real capabilities, fix the --accept example. Gates: bun run lint, bun run test (no skips, add regression tests for seeded proposals + analyze/history/rollback), bun run build, git clean. Do NOT flip the /agent-evolve alias until parity confirmed AND global binary carries the build (shared deployment gap, coordinate with the others).

ENGINE-PATH NOTE (verified working tree): the evolve engine to edit is apps/cli/src/operations/evolve.ts (the real 41KB engine). It is NOT in packages/core — only scaffold lives there. stepAnalyze already exists internally (evolve.ts:546, called as Step 1 at :929); --analyze is a missing USER-FACING flag, so A2 reuses stepAnalyze rather than building analysis from scratch.

DOCS SYNC (CLAUDE.md mandate): the new flags (--analyze/--history/--rollback/--confirm) touch the CLI command/flag surface — update docs/04_DESIGN.md (and docs/design/design-doc-phase2.md, which owns the scaffold/validate/evaluate/refine/evolve surface) in the SAME commit as the flag registration.

EXECUTION ORDER (Gap 5): run the evolve SET (0052+0053+0054+0055) as ONE unit on one branch/PR — land the shared engine fix and wire ALL 5 subcommands + per-type wrinkles + all wrappers + all-type tests under a single gate, so the engine is proven against agent/command/magent/skill BEFORE merge (not agent-only). Cross-set order: run Add (0062-0065) FIRST, then Refine (0057-0060), then this Evolve set — because the skill evolve/refine slices resolve directory-based <name>/SKILL.md, which only exists once 0065's scaffold-dir fix has shipped. Hooks (0056/0061/0066) are independent, run anytime.


### Q&A



### Design

Pair-run maturity assessment + fix plan for `/cc:agent-evolve` → `/rd3:agent-evolve`. Verified
2026-06-21 against global superskill **0.1.8** + the working tree. **This is the lead task of the
evolve set (0052–0056)** — it carries the SHARED, type-agnostic engine fix in
`apps/cli/src/operations/evolve.ts` that 0053/0054/0055 inherit. The per-type tasks only register
flags on their CLI subcommand, fix their wrapper, and add type-specific regression coverage.

---

## Pair-run evidence (executed both, same target)

Target: `plugins/cc/agents/expert-agent.md`. cc evolve needs history, so 2 evaluations were saved first.

**cc** (`superskill agent evolve <target> --propose-only`, after `agent evaluate --save` ×2):
```
Proposal written to: ~/.superskill/proposals/agent/expert-agent/2026-06-21-agent-evolve-...-001.md
```
The proposal file has a populated **Trend analysis** table (5 dims, all flat) but an **EMPTY
"## Proposed changes"** section. cc evolve `--analyze` / `--history` / `--rollback` all error
`unknown option`.

**rd3** (`bun <rd3-cache>/skills/cc-agents/scripts/evolve.ts <target> --analyze`):
```
=== Evolution Analysis ===
Target: expert-agent   Score: 94% (A)   Status: PASS
Available data sources: git-history ✓ · ci-results ✓ · user-feedback ✗ · memory-md ✗ · interaction-logs ✗
Patterns: [success] expert-agent is currently stable at 94%
```

**Read:** cc evolve runs and persists a proposal but proposes NOTHING actionable in the default path,
and lacks rd3's `--analyze`/`--history`/`--rollback` entirely. Not a like-for-like replacement yet.

---

## Root causes (verified against source)

### G1 [P1] — empty proposals in propose-only / interactive
`apps/cli/src/operations/evolve.ts:595` — `stepPropose` ships `const changes: ProposedChange[] = []`
with the comment "placeholder generation removed — changes come via --ingest". But
`generateChanges(report, trends)` (`evolve.ts:197`) already produces heuristic changes for
declining/flat-low (`< 0.7`) dimensions — it is simply **never called** in this path. So propose-only
and interactive mode always present an empty change set. rd3 `--propose` drafts changes directly.

### G2 [MAJOR] — no `--analyze`
The agent evolve subcommand (`apps/cli/src/commands/agent.ts:92` `agentEvolve`) registers
`--from/--propose-only/--accept/--reject/--json/--ingest/--margin` but **no `--analyze`**. rd3's
primary entry point is `--analyze` (trend + data-source inventory + pattern detection).

### G3 [MAJOR] — no `--history` / `--rollback`
No history/rollback flags on any cc evolve subcommand. `backupFile`/`restoreFromBackup` helpers exist
(used by the F024 gate) but there is no user-facing version history or rollback surface. rd3 has both.

### G4 [MAJOR/doc-drift] — wrapper lies about capability
`plugins/cc/commands/agent-evolve.md:11` claims "…and rollback via saved version history",
`:16` claims "backup and rollback support", and `:36` shows `--accept p1234` (a fabricated proposal id;
real ids are `agent-evolve-YYYY-MM-DD-NNN`). The doc advertises features that don't exist.

---

## Architecture context

| | rd3 | cc |
|--|-----|-----|
| Engine | per-skill `skills/cc-agents/scripts/evolve.ts` | shared `apps/cli/src/operations/evolve.ts` (type-agnostic; F022 version-aware trends, F023 envelope/ingest seam, F024 double-loop gate) |
| Entry points | `--analyze \| --propose \| --apply <id> \| --history \| --rollback <ver>` | `--from \| --propose-only \| --accept <id> \| --reject <id> \| --json \| --ingest \| --margin` |
| Proposal gen | refine-backed, drafted by `--propose` | `generateChanges` exists but unused; real changes via `--ingest` only |

Canonical files:
- Shared engine: `apps/cli/src/operations/evolve.ts` (`stepPropose`, `generateChanges`, `stepAnalyze`, backup/restore)
- Agent CLI subcommand: `apps/cli/src/commands/agent.ts` (`agentEvolve`)
- Wrapper: `plugins/cc/commands/agent-evolve.md`
- Rubric/trend: `computeTrends` (F022), `runGate` (F024) — reuse, do not rewrite

---

## Work Items

### A1 [P1] — Seed heuristic proposals in stepPropose (G1)
**File:** `apps/cli/src/operations/evolve.ts:stepPropose`.
**Fix:** call `generateChanges(baselineReport, trends)` to seed `changes` for declining/flat-low dims
(it already targets `trend === 'declining' || (flat && latest < 0.7)`). Pass `baselineReport` into
`stepPropose` (currently `_report` is unused). Keep `--ingest` as the path for agent-authored
refinement — seeding does not replace it, it makes propose-only useful standalone.
**Acceptance:** `agent evolve <target> --propose-only` on a sub-perfect agent writes a proposal with a
non-empty "Proposed changes" section naming the low dimension(s); a perfect agent yields no changes.

### A2 [MAJOR] — Add `--analyze` (G2)
**Files:** `apps/cli/src/operations/evolve.ts` (analyze formatter), `apps/cli/src/commands/agent.ts`.
**Fix:** add an analyze path that prints the trend table + baseline score/grade + a data-source
inventory (what cc can see: evaluation history count, git presence) + a one-line pattern summary
(stable / declining dims). Reuse `stepAnalyze`/`computeTrends`. Register `--analyze` on the subcommand.
**Acceptance:** `agent evolve <target> --analyze` prints a summary without writing a proposal or
mutating the file; works with ≥1 saved evaluation.

### A3 [MAJOR] — Add `--history` + `--rollback <ver>` (G3)
**Files:** `apps/cli/src/operations/evolve.ts`, `apps/cli/src/commands/agent.ts`.
**Fix:** `--history` lists applied proposals/versions from the store (accepted proposals + backup
timestamps). `--rollback <ver>` restores a prior version via the backup chain (`restoreFromBackup`),
gated behind `--confirm`. Persist enough on apply (backup path + version id) to make rollback real.
**Acceptance:** after an applied evolve, `--history` lists the version; `--rollback <ver> --confirm`
restores the file byte-identical and is reflected in history.

### A4 [MAJOR] — Fix wrapper drift (G4)
**File:** `plugins/cc/commands/agent-evolve.md`.
**Fix:** align the description/When-to-Use to REAL capabilities (now including analyze/history/rollback
once A2/A3 land); replace the fabricated `--accept p1234` example with a real id shape
(`agent-evolve-2026-06-21-001`); sync `argument-hint` to include `--analyze/--history/--rollback/--confirm`.
**Acceptance:** every capability the wrapper claims exists; examples use real id shapes.

### A5 [MINOR] — Regression tests
Seeded proposal (declining/flat-low dim → non-empty changes), `--analyze` output shape,
`--history` lists an applied version, `--rollback` restores byte-identical. In
`apps/cli/tests/` / `packages/core/tests/`.

---

## Policy decisions (operator-confirmed)
- **G1:** heuristic-seed + ingest (revive `generateChanges`; keep `--ingest`).
- **G2/G3:** build `--analyze` + `--history` + `--rollback` for full rd3 parity.
- **Shared engine:** A1/A2/A3 land in `operations/evolve.ts` ONCE; 0053/0054/0055 only register flags +
  fix wrappers + add type-specific tests.
- **Deployment:** do NOT flip the `/agent-evolve` alias until parity confirmed AND the global binary
  carries the build (shared gap with 0053–0055).

## Do-not-drift guardrails
- Reuse `computeTrends` (F022) and `runGate` (F024) — do NOT rewrite the gate or trend logic.
- Seeding is additive: propose-only seeds heuristics; `--ingest` still overrides with agent-authored changes.
- `--rollback` and `--apply` stay gated behind `--confirm` (destructive).
- Keep changes type-agnostic in the shared engine; no per-type branching in `evolve.ts` beyond what
  `ContentType` already carries.


### Solution

Shared-engine fix landing in `apps/cli/src/operations/evolve.ts` + agent surface on `apps/cli/src/commands/agent.ts` + wrapper fix on `plugins/cc/commands/agent-evolve.md`.

- A1 (G1): revive `generateChanges(report, trends)` in `stepPropose` — rename `_report` → `report`, seed `changes` for declining/flat-low dims. `--ingest` override stays intact.
- A2 (G2): add `--analyze` path — reuse `stepAnalyze`/`computeTrends`, print trend table + score/grade + data-source inventory + pattern summary. No file mutation.
- A3 (G3): add `--history` (list applied proposals + backup timestamps) and `--rollback <ver>` (restore via `restoreFromBackup` behind `--confirm`). Persist backup path + version id on apply so rollback is real.
- A4 (G4): fix wrapper drift in `agent-evolve.md` — real capabilities, real id shape (`agent-evolve-YYYY-MM-DD-NNN`), synced `argument-hint`.
- A5: regression tests for seeded proposals, analyze shape, history listing, rollback byte-identical restore.
- Docs sync: `docs/04_DESIGN.md` + `docs/design/design-doc-phase2.md` updated in the same commit as flag registration.


### Plan

Lead task of the evolve set. Carries the shared-engine fix; 0053–0055 inherit it. Confirmed decisions:
G1 heuristic-seed+ingest; G2/G3 build analyze/history/rollback.

### Phase 1 — Shared engine (operations/evolve.ts)
1. **A1 seed proposals (G1):** pass `baselineReport` into `stepPropose`; call `generateChanges(report, trends)`
   to populate `changes` for declining/flat-low dims. Keep `--ingest` override intact.
2. **A2 --analyze (G2):** add analyze formatter (trend table + score/grade + data-source inventory +
   pattern summary); reuse `stepAnalyze`/`computeTrends`. No file mutation, no proposal write.
3. **A3 --history + --rollback (G3):** list applied versions from the store; restore via the backup
   chain (`restoreFromBackup`) behind `--confirm`. Persist backup path + version id on apply.

### Phase 2 — Agent surface
4. **Register flags** on `apps/cli/src/commands/agent.ts` (`agentEvolve`): `--analyze`, `--history`,
   `--rollback <ver>`, `--confirm`.
5. **A4 wrapper (G4):** fix `plugins/cc/commands/agent-evolve.md` — real capabilities, real id example,
   synced `argument-hint`.

### Phase 3 — Tests
6. **A5 regression:** seeded-proposal non-empty, analyze shape, history lists applied version, rollback
   byte-identical restore.

### Verification gate
- `bun run lint` clean; `bun run test` pass (no skips); `bun run build` PASS; `git status` clean.
- Functional: `agent evolve <target> --propose-only` → non-empty Proposed changes; `--analyze` prints
  summary; apply → `--history` lists it → `--rollback <ver> --confirm` restores byte-identical.
- Atomic commits: `feat(evolve): seed heuristic proposals`, `feat(evolve): add analyze/history/rollback`,
  `fix(cc-commands): align agent-evolve wrapper to real capabilities`.

### Do-not-drift
- Shared engine fix lands once; per-type tasks consume it. Reuse F022/F024. `--apply`/`--rollback` behind
  `--confirm`. Coordinate alias flip + deployment with 0053–0055.


### Review



### Testing



### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References


