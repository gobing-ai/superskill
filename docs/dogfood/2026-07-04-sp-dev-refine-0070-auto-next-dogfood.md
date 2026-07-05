# Dogfood Report — `/sp:dev-refine 0070 --auto --next`

### 1. Testee

- **Command:** `/sp:dev-refine 0070 --auto --next`
- **Classification:** `slash command`
- **Exact invocation:** `Skill(skill="sp:spur-dev", args="refine 0070 --auto --next")`, chaining
  into `Skill(skill="sp:code-implementation", args="0070 --auto --next")` (dev-run implement mode)
  and `Skill(skill="sp:code-verification", args="verify 0070 --auto --next")` (dev-verify)
- **Testee agent:** omitted (testee runs in current session)
- **Mode:** fix (`--max-retry 2`)
- **Task under test:** 0070 — Enhance cc meta-plugin with skill-engineering theory — rubrics,
  invocation axis, pruning, dogfood

### 2. Execution Summary

- **Result:** PASS  `(6 fixed, 0 unresolved, 7 findings)`
- **Wall-clock:** ~130 min  `[~estimate]`
- **~Token cost:** ~77,900 total | ~14,600 cached (~19% hit rate)  `[~estimate]`
- **Steps:** 8 derived (7 refine/chain steps + 1 runtime chain link), 18 executed rows, 1 N/A
- **Fix attempts:** 6 — biome format; coverage gate (8 tests); rubric-v2 fixture pins;
  global-rule shadow; tsdoc exports; AC3 validate-fixture gap

Verdict grades the testee: the `refine → run → verify → done` chain ran end to end, every gate was
honored (no `--no-verify`, no `--no-lifecycle`), and the task reached `done` with a PASS verdict.
All six fixes were real working-tree/task-work fixes applied under the retry budget — none
weakened the testee.

### 3. Monitor Ledger

| Step | Attempts | Outcome | Fix Applied | Finding | Fresh Tokens | Cached Tokens | Cache % | Basis | Wall-clock |
|------|----------|---------|-------------|---------|--------------|---------------|---------|-------|------------|
| S1 load-task | 1 | PASS | — | banner pollutes `task path` output (P4) | ~700 | ~300 | 30% | spur path/show output + Phase-1 task read reused | ~5s |
| S2 analyze | 1 | PASS | — | — | ~100 | ~2000 | 95% | task Requirements/AC/Plan reused from context | ~2s |
| S3 question | 0 | N/A | — | skipped by design under `--auto` | ~0 | ~0 | — | no invocation | — |
| S4 skip-gate | 1 | PASS | — | SKIP emitted correctly incl. L4-advisory suffix | ~300 | ~200 | 40% | `task check --json` output + contract text reused | ~3s |
| S5 profile | 1 | PASS | — | — | ~0 | ~100 | 100% | frontmatter reused from context (no re-fetch) | ~1s |
| S6 next-transition | 1 | PASS | — | `wip ≥ todo` edge correctly skipped, chain continued | ~0 | ~200 | 100% | command-doc rule reused from context | ~1s |
| S7.1 gate-baseline | 2 | FIXED | `bun run format` (2 biome errors in quality/skill.ts) | pipe exit-code masked first gate read | ~1000 | ~300 | 23% | check log tails + diff stat | ~5m |
| S7.2 coverage-gate | 3 | FIXED | +8 tests (evaluators.test.ts invocation axis; scaffold.test.ts both modes) | untested R3 user-invocation paths were an R10 gap | ~7000 | ~1500 | 18% | source reads + generated tests + runs | ~12m |
| S7.3 R5 failure-mode | 1 | PASS | — (implementation work: evolve.ts + 2 tests) | — | ~5000 | ~800 | 14% | evolve.ts read + edits + test run | ~10m |
| S7.4 rubric-v2 bumps | 2 | FIXED | evaluate-ingest.test.ts pins 1→2 (6 sites) | version bump downstream: fixtures pin rubric versions | ~2500 | ~500 | 17% | failure traces + test file reads | ~8m |
| S7.5 R4/R6 doc wiring | 2 | PASS | — (magent-add needed a different anchor) | *-add docs lack uniform section skeleton | ~4500 | ~800 | 15% | template + command reads/writes | ~10m |
| S7.6 R5/R7 docs+router | 1 | PASS | — | — | ~4000 | ~600 | 13% | README + workflows reads/writes | ~8m |
| S7.7 structural tests | 1 | PASS | — | — | ~2200 | ~400 | 15% | new test file + first-try green run | ~4m |
| S7.8 before-sweep | 1 | PASS | — | — | ~1800 | ~200 | 10% | 28 evaluate outputs in HEAD worktree | ~6m |
| S7.9 pruning+collapses | 3 | PASS | — (2 extra trim iterations to reach −20% on 2 files) | — | ~21000 | ~2000 | 9% | 4 full SKILL.md reads + reference merges + edits | ~35m |
| S7.10 after-sweep | 1 | PASS | — | — | ~1200 | ~300 | 20% | 28 evaluate outputs, working tree | ~5m |
| S7.11 gates | 3 | FIXED | local shadow `.spur/rules/boundary/sp-no-vendor-refs.yaml`; JSDoc on 2 exports | global rule leak breaks unrelated repos' gates (P2) | ~2500 | ~400 | 14% | spur-check logs + rule catalog reads | ~8m |
| S7.12 sections+FSM | 1 | PASS | — | lifecycle adapter unavailable — guard ran as inline fallback (P3) | ~3500 | ~1500 | 30% | generated Solution/Testing bodies; score tables reused | ~8m |
| S8 dev-verify chain | 2 | FIXED | +4 validate mismatch fixture tests (AC3 gap) | doc says omitted `--agent` spawns `omp`, but Skill() path runs inline (P2) | ~6000 | ~2500 | 29% | verify contract read + evidence reuse + verdict write | ~15m |

**Cache calculation:** aggregate cache% = round((sum(Cached) / sum(Fresh + Cached)) × 100) =
round(14,600 / 77,900 × 100) = **19%** `[~estimate]`.

### 4. What We Did

1. **Planned** — classified the testee, derived 7 steps from `dev-refine.md`'s workflow, loaded the
   ledger/report contracts, read task 0070 (`docs/tasks/0070_*.md`).
2. **Ran refine S1–S6** — `spur task path/check` resolved and gated; the pre-synthesis SKIP gate
   fired correctly (zero L3 findings on Background/Requirements/Plan; 1 L4 advisory listed in the
   SKIP line); profile idempotent; `wip ≥ todo` transition skipped per the idempotent-edge rule;
   chain continued into dev-run per "SKIP short-circuits synthesis, not `--next`".
3. **dev-run resolved to implement mode** (`--next` forces it; no warning owed since `--mode full`
   wasn't passed) and dispatched `sp:code-implementation`.
4. **Assessed task state** — Waves 0–2 + CLI side of Wave 3 were already in the working tree;
   completed the rest: R5 failure-mode taxonomy in `evolve.ts` (validated + persisted + tested),
   R4 description rules in all 8 skill templates, R6 grill-discovery single copy + 4 command
   pointers, R4/R5 fix-type docs in workflows.md + 4 refine commands, R5 tag docs in 4 evolve
   commands, R7 flow map in `plugins/cc/README.md`, R10 structural tests
   (`plugins/cc/tests/structure.test.ts`, 6 pass).
5. **R9 dogfood** — before-sweep of all 28 cc artifacts in a HEAD worktree; pruned the four
   largest skill bodies ≥ 20% each with disclosure moves into existing references
   (cc-hooks 396→277, cc-agents 383→285, anti-hallucination 325→259, cc-commands 321→255);
   after-sweep: all 28 artifacts grade ≥ B (cc-hooks 0.60 D → 0.83 B; cc-skills 0.71 C → 0.89 B).
6. **Fixed six breakages along the way** (see Issues) — all root-cause fixes, no gate bypasses.
7. **Gates** — `bun run check` (1251 pass / 0 fail; coverage 99.73% fn / 98.67% ln),
   `bun run spur-check` (24+3 rules green), `bun run build` green.
8. **Wrote the corpus** — `## Solution` (change map + R8 diff evidence + documented deviations),
   `## Testing` (gates + 28-artifact before/after + R/AC traceability tables), `## Review`
   (SECUA P-table) via `spur task update --section`; verdict artifact
   `.spur/run/0070-verdict.json`.
9. **Verify chain (S8)** — requirements R1–R10 MET, AC1–AC11 MET (AC4/AC11 with documented
   interpretations), design D1–D7 conformant, SECUA 0 blockers/majors → **PASS** →
   `testing → done` through the `--strict-core` guard. Chain terminated at `done`.

### 5. Issues

#### Fixed

1. **Biome format errors blocked the lint gate** — 2 errors in `packages/core/src/quality/skill.ts`.
   - Root cause: unformatted edits left in the working tree by the prior (pre-session) work.
   - Fix: `bun run format` (sanctioned autofix); gate re-run green.
2. **Coverage gate breach (per-file < 90% lines)** — `operations/scaffold.ts` 82.86%,
   `quality/skill.ts` 88.32%.
   - Root cause: the R3 user-invocation paths (`mergeFrontmatterScalar`, user-mode emission,
     `scoreUserInvokedDescription`, >10-branch overload) had no tests — a genuine R10 gap.
   - Fix: `packages/core/tests/quality/evaluators.test.ts` +3 tests,
     `packages/core/tests/operations/scaffold.test.ts` +5 tests; both files ≥ 98% after.
3. **Mirror-rubric version bump broke 5 seam tests** — `rubric_version mismatch: scores has 1, rubric has 2`.
   - Root cause: `apps/cli/tests/operations/evaluate-ingest.test.ts` pins the agent rubric version
     in fixtures; bumping agent.yaml to v2 (required by D2 once scorer semantics changed) is a
     breaking change for pinned fixtures.
   - Fix: 6 pin sites updated 1 → 2; 12 pass.
4. **`bun run spur-check` failed on a misconfigured global rule** — `sp-no-vendor-refs` (from
   `~/.config/spur/rules/boundary/`, authored for spur-new's plugins/sp) searches `plugins/sp/**`,
   which doesn't exist here; rg exits 2 → rule "misconfigured" → gate fails.
   - Root cause: repo-specific rule leaked into the global layered catalog.
   - Fix: `.spur/rules/boundary/sp-no-vendor-refs.yaml` — local shadow with `enabled: false`
     (upstream fix filed as finding).
5. **tsdoc-export post-check errors on new exports** — `FailureMode`, `ProposedChange`.
   - Root cause: new/moved exports lacked JSDoc.
   - Fix: doc comments at `apps/cli/src/operations/evolve.ts:110,113`.
6. **AC3 evidence gap found by the verify step** — `checkInvocationModeMismatch` implemented but
   no fixture test ("validate flags a mode/description mismatch on a fixture").
   - Root cause: validate-side R3 landed pre-session without its R10 test.
   - Fix: `packages/core/tests/operations/validate.test.ts` +4 tests (both mismatch directions,
     matched pair, strict-only gating); 67 pass.

#### Unresolved

- (none)

### 6. Findings

- **P2** — dev-verify's `--agent` doc says an omitted flag runs the verify pass "under the
  configured default executor (`omp`)" as a spawned step, but the command's own Implementation
  delegates inline via `Skill(skill="sp:code-verification", ...)` — a standalone (non-pipeline)
  invocation runs in the current session and never spawns `omp`. → **Action:** in
  `dev-verify.md` (and the skill §Step 1 flags), split the claim by surface: pipeline = spawned
  default executor; inline Skill() delegation = current session.  (`plugins/sp/commands/dev-verify.md:29`, ~15min)  `[feasible]`
- **P2** — the global spur rule `sp-no-vendor-refs` hard-includes `plugins/sp/**` and fails the
  whole pre-check gate (rg exit 2 = "misconfigured") in every repo that lacks that directory.
  → **Action:** upstream in spur-new: keep the rule repo-local, or make the rg evaluator treat an
  empty include set as pass-with-note.  (`~/.config/spur/rules/boundary/sp-no-vendor-refs.yaml:7`, ~30min)  `[feasible]`
- **P3** — task 0070's AC11 grep (`rg -il "vendors/" ...`) is broader than the boundary it
  encodes: 3 pre-existing, load-bearing `vendors/rulesync` schema citations match it.
  → **Action:** future boundary ACs should target the study material
  (`vendors/skills|mattpocock|pocock`); deviation documented in the task's Solution.  (`docs/tasks/0070_*.md:209`, ~5min)  `[feasible]`
- **P3** — AC4's "demonstrably rewrites ... to budget" implies a deterministic auto-rewrite that
  the task's own D3 forbids (judgment never in heuristic code); the prune ships as a
  suggest-strategy fix applied by the invoking agent. → **Action:** align AC wording with the
  suggest-strategy contract when drafting refine-related ACs.  (`docs/tasks/0070_*.md:178`, ~5min)  `[feasible]`
- **P3** — `spur task update <wbs> testing` warned "lifecycle adapter unavailable — running
  `spur task check` inline as the testing gate. Restore the bundled task-lifecycle workflow to
  re-enable the real guard." The FSM guard ran as a degraded inline fallback for the whole chain.
  → **Action:** restore/install the bundled task-lifecycle workflow in this environment so `--next`
  chains exercise the real guard.  (spur environment config, ~15min)  `[feasible]`
- **P3** — cache health: aggregate ~19% (< 50% floor) and most implement sub-steps < 40%. The
  driver reused context where possible (task file, score tables, contract text), but a
  10-requirement implement chain is inherently fresh-token dominated; there is no per-step
  telemetry to verify improvements. → **Action:** none actionable inside the testee; note that
  `dev-refine --auto --next` on a well-specified `wip` task is effectively "run the whole
  pipeline" — operators wanting refinement only should drop `--next` (the command doc already
  warns this).  (ledger above)  `[unverifiable]`
- **P4** — `spur task path` prints the ASCII banner before the path, so scripted consumers must
  strip it; `--json` on other verbs avoids this but `path` has no quiet mode. → **Action:** add
  `--quiet`/`--json` to `spur task path` or suppress the banner when stdout is not a TTY.
  (spur CLI, ~15min)  `[feasible]`

── Dogfood Summary ──
Result: PASS   (6 fixed, 0 unresolved, 7 findings)
Tokens: ~77,900 total  |  ~14,600 cached (~19% hit rate)  [~estimate]

Fixed issues:
  • biome format errors in pre-existing working-tree edits (bun run format)
  • coverage-gate breach — 8 tests for untested R3 invocation paths
  • rubric-v2 bump broke 5 seam-test fixture pins — pins updated
  • global sp-no-vendor-refs rule failed spur-check — local disabled shadow
  • tsdoc-export post-check — JSDoc on FailureMode / ProposedChange
  • AC3 validate-fixture gap found by verify — 4 mismatch tests added

Unresolved issues:
  • (none)

Findings (P1+P2):
  • P2 — dev-verify --agent doc claims spawned omp for the inline Skill() path
  • P2 — global spur rule sp-no-vendor-refs breaks gates in repos without plugins/sp

Findings (P3+P4, --full):
  • P3 — AC11 vendors/ grep broader than its boundary (pre-existing rulesync refs)
  • P3 — AC4 "demonstrably rewrites" conflicts with D3's suggest-strategy contract
  • P3 — lifecycle adapter unavailable; FSM guard ran as inline fallback
  • P3 — low cache hit rate (~19% aggregate; most implement sub-steps < 40%)
  • P4 — spur task path banner pollutes scripted output (no --quiet/--json)

[Report: docs/dogfood/2026-07-04-sp-dev-refine-0070-auto-next-dogfood.md]
