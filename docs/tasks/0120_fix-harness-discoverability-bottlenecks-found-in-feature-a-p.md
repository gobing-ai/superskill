---
template: meta
schema_version: 1
name: "Fix harness discoverability bottlenecks found in feature A pipeline sessions"
description: ""
status: done
type: meta
profile: standard
feature_id: null
parent_wbs: null
priority: P2
tags: ["meta"]
dependencies: []
ac_numbering: task-local
created_at: "2026-08-13T21:07:33.341Z"
updated_at: "2026-08-13T21:56:20.126Z"
---

## 0120. Fix harness discoverability bottlenecks found in feature A pipeline sessions

### Background
Feature A (tasks 0115–0119) ran to completion with five PASS verdicts, but the pipeline consumed
**~96 minutes** of main-session wall time across 21 OMP session logs (1 main + 20 subagent:
Implement/Unit/Review/Verify × 5 tasks, 12 MB). Forensic analysis found **no** loop or compaction
waste — 0 compactions across all 21 sessions, and only 1 repeated-command candidate. The waste is
concentrated in a different failure class: **agents cannot discover the harness surface without
trial-and-error**, so they probe, guess, and hand-roll replacements for capabilities that either
already exist or should.

Measured across 876 tool calls / 417 bash invocations / 147 `spur` calls: 11 `--help` probes on
`spur task update` alone, 6 invocations of `spur task get` (**a verb that does not exist** —
`error: unknown command 'get'`), 4 `does not contain section` failures from guessed section names,
and 20 runs of throwaway `/tmp/**.ts` verification scripts across 7 independent subagent sessions.
The same three patterns recurred in the parallel Claude Code session doing the charting and refine
work, so these are agent-independent.

Estimated recoverable waste: **~60–95 minutes per feature of this size**, dominated by RC3
(hand-rolled scoring scripts). No topic filter was applied — this was a full-taxonomy scan.
Source: `omp`, confidence **High** (documented adapter, readable tool events).
### Requirements
- [x] **R1.** When an agent guesses a non-existent `spur` verb, the CLI must suggest the correct one.
      Trigger: `spur task get` returns bare `error: unknown command 'get'`; agents then build
      defensive fallback chains (`spur task show X --json || spur task get X --json || spur task
      list --json | jq ...`). Fix: enable Commander's `showSuggestionAfterError`, and add the
      near-miss aliases observed in logs (`get`→`show`) to the error text. Target: `spur-new: apps/cli/src/index.ts`. Measurable: `spur task get` names `show` in its output;
      `error: unknown` occurrences drop from 6 to 0 in a comparable run.
- [x] **R2.** Section names must be discoverable before a write is attempted, not after it fails.
      Trigger: 4 × `does not contain section` — agents guess a section, get rejected, then re-probe.
      Fix: the failure message already lists available sections; hoist that list into
      `spur task update --help` and into the `sp:spur-cli` task reference so it is readable without
      provoking a failure. Target: `sp:spur-cli` references + `task update` help text. Measurable:
      `does not contain section` drops to 0.
- [x] **R3.** Provide a first-class way to score a content file so sessions stop hand-rolling one.
      Trigger: 20 runs of `/tmp/**.ts` across 7 sessions (`bun /tmp/magent0119/verify-0119.ts` ×3,
      `/tmp/magent0117/verify-0117.ts` ×3); the parallel Claude session wrote its own `score.ts` for
      the same purpose. Root cause: `superskill <type> evaluate` is a two-call envelope seam
      (`--rubric --json` → persona → `--ingest`), with no one-shot deterministic path. Fix: add a
      single-call deterministic scoring flag that prints per-dimension + aggregate scores and accepts
      a `basePath`. Target: `apps/cli/src/commands/*.ts` + `packages/core/src/quality/evaluate.ts`.
      Measurable: zero `/tmp/**` scoring scripts in the next comparable pipeline run.
- [x] **R4.** Correct the OMP tool-call field map in `sp:issue-finding`'s own reference.
      Trigger: `references/session-formats.md` documents `input.command` for OMP; the actual path is
      `arguments.command`. Following the reference produced `test=0, spur=0` — a **silently wrong**
      "no test-loop waste" conclusion. Fix: correct the field map and add a self-check note that a
      zero tool-command count means the field map is wrong, not that the sessions were idle.
      Target: `spur-new: plugins/sp/skills/issue-finding/references/session-formats.md` (spur repo).
      Measurable: a re-run against this session set reports non-zero `test` and `spur` counts.
- [x] **R5.** Recalibrate the `section-write` bottleneck heuristic. Trigger: the rule fires when
      `--section` calls exceed 2× task count; this run wrote 38 sections for 5 tasks (7.6/task) and
      would be flagged, but `feature-impl` tasks legitimately carry ~9 sections. Fix: express the
      threshold per *section slot* rather than per task. Target:
      `spur-new: plugins/sp/skills/issue-finding/SKILL.md` IDENTIFY table. Measurable: a one-write-per-section
      run does not trip the heuristic.
### Acceptance Criteria
```gherkin
Feature: Harness discoverability

  Scenario: An unknown spur verb suggests the real one
    Given an agent runs "spur task get 0119"
    When the CLI rejects the command
    Then the error names "show" as the likely intended verb
    And the agent does not need a fallback chain to read a task

  Scenario: Section names are readable without provoking a failure
    Given an agent intends to write a task section
    When it reads "spur task update --help" or the sp:spur-cli task reference
    Then the valid section names are listed there
    And no "does not contain section" failure is needed to discover them

  Scenario: Scoring a file needs no throwaway script
    Given an agent must score a magent config against its rubric
    When it uses the documented deterministic scoring path with a basePath
    Then per-dimension and aggregate scores print in one call
    And no /tmp script is written

  Scenario: The OMP field map yields non-zero tool commands
    Given the corrected session-formats reference
    When sp:issue-finding analyzes the feature A session set
    Then the extracted spur-call and test-run counts are both greater than zero

  Scenario: A one-write-per-section run does not trip the heuristic
    Given a feature-impl task batch where each section is written exactly once
    When the section-write heuristic is applied
    Then no section-write bottleneck is reported
```
### Q&A
**Q: Why is this not a test-loop or compaction problem, like most pipeline slowdowns?**
A: Measured and ruled out. 0 compactions across all 21 sessions; 1 repeated-command candidate total
(`Implement0119`). 40 test runs across 21 sessions is ~2/session — no spinning. The waste is
discovery, not repetition.

**Q: Why fix the CLI rather than tell agents to read the docs first?**
A: Both agents in this run *did* have `sp:spur-cli` available and still probed `--help` 11 times.
A guidance fix that competes with a one-line shell probe loses; the probe is cheaper than opening a
reference. Making the CLI answer the question at the point of failure removes the round trip.

**Q: Is R3 worth CLI work, or should agents just be told to use the evaluate seam?**
A: The seam is a two-call envelope (`--rubric --json` → persona scores → `--ingest --save`) built
for LLM scoring. Seven sessions independently concluded a throwaway script was cheaper for a
deterministic read. When seven independent agents route around a surface, the surface is missing an
affordance, not the agents' discipline.

**Q: Are the time estimates measured or inferred?**
A: **Inferred.** Session durations are measured from log timestamps (96m main, 8–14m per subagent);
the per-incident waste multipliers (~1 min/probe, ~2 min/section failure, 5–10 min/script) are the
skill's standard estimates, not instrumented. Treat the ~60–95 min figure as an order-of-magnitude
claim, not a measurement.

**Q: Why is R4 in a performance task rather than a docs task?**
A: Because it silently corrupts this exact analysis. Following the stale field map returned
`test=0, spur=0`, which reads as "no test-loop waste" — a clean bill of health that is simply
false. A forensic tool that fails open is worse than one that fails loudly.

**Q: Should this task be decomposed?**
A: R1/R2 are spur-repo CLI changes; R4/R5 are spur-repo skill-doc changes; R3 is a superskill-repo
CLI feature. R3 is the only one with real design surface and should split out if it is picked up.
### Design
Evidence is drawn from 21 OMP session JSONL files under one pipeline run. Field map used:
`message.content[].type == "toolCall"`, name at `.name`, shell command at **`.arguments.command`**
(not `.input.command` — see R4). Counts are exact; time costs are estimates (see Q&A).

**Aggregate metrics**

| Metric | Value |
| --- | --- |
| Sessions | 21 (1 main + 20 subagent) |
| Main-session wall time | ~96 min |
| Tool calls | 876 |
| Bash invocations | 417 |
| `spur` calls | 147 |
| Test runs | 40 |
| Compactions | **0** |
| Repeated-command candidates | **1** |

**Tool mix:** bash=417, read=232, grep=56, edit=52, write=37, hub=22, yield=20, task=20.

**`spur` verb distribution:** `task update` 53 · `task show` 32 · `task check` 13 · `task verdict` 13
· **`task get` 6 (invalid)** · `task run-link` 5 · `task record` 4 · `task create` 2 · others 19.

**`spur task update` breakdown:** `--section` write 38 · **`--help` 11** · status transition 11 ·
other 1.

**RC1 — Verb discovery by trial (R1).** `spur task get` invoked 6×; the verb does not exist
(`spur task get 0119` → `error: unknown command 'get'`, reproduced live). Agents wrote defensive
chains: `spur task show 0118 --json 2>/dev/null || spur task get 0118 --json 2>/dev/null || spur
task list --json | jq ...`. Raw error floor across the set: `error: unknown` ×6, `unknown option` ×1,
`Did you mean` ×1, `command not found` ×1. Cost ≈ 6 failed calls + fallback authoring ≈ 10–15 min.
Severity **S1**.

**RC2 — Section names discovered by failing (R2).** `does not contain section` ×4. The rejection
message *does* list valid sections — the information exists but only after a failed write. Cost
≈ 4 × ~2 min ≈ 8 min. Severity **S2**.

**RC3 — Hand-rolled scoring scripts (R3).** 20 `/tmp/**.{ts,js,py,sh}` runs across 7 sessions:
Verify0119 ×5, Implement0117 ×3, Implement0119 ×3, Unit0119 ×3, Review0117 ×2, Unit0117 ×2,
Verify0117 ×2. Repeated invocations of the same script (`bun /tmp/magent0119/verify-0119.ts` ×3,
`/tmp/magent0117/verify-0117.ts` ×3) indicate iterative debugging of the throwaway itself. The
parallel Claude Code session independently wrote an equivalent `score.ts`. Cost ≈ 5–10 min × 7
sessions ≈ **35–70 min** — the dominant finding. Severity **S1**, plausibly **S0**.

**RC4 — Stale OMP field map in this skill's own reference (R4).**
`references/session-formats.md` documents `input.command`; the live OMP shape is
`arguments.command` (verified: toolCall block keys are `['arguments','id','intent','name',
'partialArgs','streamIndex','type']`). The first analysis pass therefore reported `test=0, spur=0`.
Cost ~5 min here; unbounded elsewhere, because it fails silently toward "nothing is wrong".
Severity **S2** on time, high on correctness.

**RC5 — Miscalibrated section-write heuristic (R5).** IDENTIFY fires `section-write` when
`--section` calls exceed 2× task count. This run: 38 writes / 5 tasks = 7.6 per task, well over the
threshold of 10 total — yet `feature-impl` tasks carry ~9 canonical sections, so one write per
section is correct behavior. The heuristic assumes ~2 sections per task. Severity **S2**.

**What worked well — preserve these.** Zero compactions across 21 sessions. One loop candidate in
876 tool calls. `spur task check` ran 13× for 5 tasks (2.6/task), under the 3-per-task guard
threshold — the batch-write-then-single-check protocol was followed. The Implement/Unit/Review/Verify
four-phase split held cleanly for all five tasks.
### Plan
1. R4 first — correct the OMP field map in `session-formats.md` and add the fail-loud note. Every
   later measurement in this task depends on the analyzer being right; fixing it first means the
   before/after comparison is trustworthy.
2. R5 — restate the `section-write` threshold per section slot in the IDENTIFY table.
3. R1 — enable `showSuggestionAfterError` on the spur Commander root; add the `get`→`show` near-miss.
   Verify `spur task get 0119` names `show`.
4. R2 — hoist the valid-section list into `spur task update --help` and the `sp:spur-cli` task
   reference.
5. R3 — design and add the one-shot deterministic scoring path (`basePath`-aware). Split into its
   own task if the design surface grows beyond a flag.
6. Re-run `/sp:dev-find-issue --sessions <this session set>` and confirm: non-zero test/spur counts,
   `error: unknown` at 0, `does not contain section` at 0, no `section-write` finding.
7. Gates: `bun run lint` && `bun run test` && `bun run spur-check` in each repo touched.
### Solution
**R3 — DONE** (this repo). The gap was narrower than the finding assumed: `evaluate` already ran a
deterministic heuristic mode by default (`apps/cli/src/operations/evaluate.ts:138`); what it could
not do was pass a `basePath`, so CLI scoring never resolved links — which is precisely why seven
sessions hand-rolled scripts. Fix was a threaded option, not a new command.

- `apps/cli/src/operations/evaluate.ts:2` — import `dirname`.
- `apps/cli/src/operations/evaluate.ts:41-47` — `EvaluateOptions.basePath?: string`.
- `apps/cli/src/operations/evaluate.ts:123` — `resolvedBasePath = opts?.basePath ?? dirname(resolvedPath)`.
  Defaulting is safe because link credit is **monotonic**: `scoreCompleteness`
  (`packages/core/src/quality/magent.ts:74-78`) short-circuits on a heading match and only *adds* on
  a link match, so no stored score can regress.
- `apps/cli/src/operations/evaluate.ts:138` — pass `resolvedBasePath` to `evaluateContent`.
- `apps/cli/src/operations/evaluate.ts:226` — same default in `emitEnvelope`'s baseline, so the
  Scorer's deltas stay comparable (its own comment at `:222-226` requires this).
- `apps/cli/src/commands/magent.ts:62-83` — `basePath` on `magentEvaluate`.
- `apps/cli/src/commands/magent.ts:229-256` — `--base-path <dir>` flag + action typing.
- `plugins/cc/commands/magent-evaluate.md:3,28` — argument-hint + Arguments row. Required: the
  `keeps lifecycle wrapper argument hints aligned with Commander` guard
  (`plugins/cc/tests/structure.test.ts:222`) failed until the doc matched the flag.
- `apps/cli/tests/operations/evaluate.test.ts` — 3 tests: default basePath credits a live link,
  dangling link earns none, explicit override resolves elsewhere.

**Verified:** `superskill magent evaluate packages/core/src/templates/magent/default.md --json`
returns all five dimensions + aggregate 1.0 in one call — identical numbers to the throwaway
`score.ts` it replaces. Gates: lint clean, **2050 pass / 0 fail**, spur-check 3/3.

**R1, R2, R4, R5 — routed to the spur repo** as task `0534`
(`/Users/robin/xprojects/spur-new/docs/tasks4/0534_fix-harness-discoverability-defects-found-by-feature-a-sessi.md`),
refined to implement-ready. Two of those findings were **wrong as originally written** and are
corrected in 0534: R1's `showSuggestionAfterError` is already enabled and working
(`spur task shwo` → `(Did you mean show?)`) so the fix is a `get`→`show` alias; and R2's section
list is already computed by the existing `spur task sections <wbs> list`, so the fix is a
cross-reference, not a hoist.
### Testing
**Independent re-verification** (`/sp:dev-verify 0120 --force --focus all --fix all`, 2026-08-13).
Re-ran every requirement and AC scenario from scratch rather than trusting the prior pipeline
verdict. All five requirements now MET — the four routed to spur landed there while this repo's half
was being built.

| Req | Status | Evidence |
|-----|--------|----------|
| R1 | **MET** | `spur task get 0120 --json` **resolves** and returns task 0120 (was 6× bare `error: unknown command 'get'`). Non-regression confirmed: `spur task shwo 0120` still emits `(Did you mean show?)`, so the lexical suggester is intact. Landed via spur task 0534. |
| R2 | **MET** | `spur task update --help` now prints ``Valid section names (no failed write): `spur task sections <wbs> list` ``. Points at the existing computed list rather than duplicating it. Landed via spur 0534. |
| R3 | **MET** | `superskill magent evaluate <path> --json` returns 5 dimensions + aggregate in **one call**, no `/tmp` script. `--base-path <dir>` present in `--help`. Code: `apps/cli/src/operations/evaluate.ts:47,123,136,226`; `apps/cli/src/commands/magent.ts:69,77,236,251`. |
| R4 | **MET** | `session-formats.md` OMP row now reads `arguments.command`; fail-loud rule added at `:56-57`. Proven by re-run over the analyzed session set: **417 tool-commands / 147 spur / 40 test**, versus **0** matches under the old `input.command` path. Landed via spur 0534. |
| R5 | **MET** | spur-new `plugins/sp/skills/issue-finding/SKILL.md` line 205 — threshold rewritten to per-section-slot: `> 1.5×` the canonical section count for the variant/status matrix entry, with the feature-impl worked example. Landed via spur 0534. |

**AC scenarios — 5/5 verified against live behavior**

| Scenario | Result |
|---|---|
| Unknown spur verb suggests/resolves | PASS — `task get` resolves; `shwo` still suggests |
| Section names readable without failing | PASS — pointer in `task update --help` |
| Scoring needs no throwaway script | PASS — one call, aggregate 1.0 |
| OMP field map yields non-zero commands | PASS — 147 spur / 40 test (was 0/0) |
| One-write-per-section does not trip heuristic | PASS — threshold now per section slot |

**Gates:** `bun run lint` clean (biome + typecheck, exit 0) · `bun run test` **2053 pass / 0 fail** ·
`bun run spur-check` 3/3 rules · `04_DESIGN.md:67,73` carries `--base-path` (same-commit flag
obligation met).

**Verdict: PASS.** Shippable: **N/A** (`feature_id: null` — cross-cutting harness task, deliberately
unlinked).
### Review
| Priority | Dimension | Location | Finding |
| --- | --- | --- | --- |
| P4 | Maintainability | `apps/cli/src/operations/evaluate.ts:79-88` | **FIXED this verify.** The `basePath` default was computed in two places (heuristic path + `emitEnvelope` baseline); parity was documented but unenforced, so a future edit to one would silently diverge the envelope baseline from the default report and skew every Scorer delta. Extracted `resolveBasePath(resolvedPath, opts)` as the single source; both call sites now route through it. |
| P4 | Correctness (nit) | `apps/cli/src/operations/evaluate.ts:79-88` | **FIXED this verify.** The empty-string `--base-path ""` fallback was implicit. Now explicit: the helper uses `||` and its TSDoc states that an empty string is meaningless as a directory and deliberately falls back to the default. Locked by a test. |
| P4 | Test quality | `apps/cli/tests/operations/evaluate.test.ts` | **FIXED this verify.** The original three tests asserted only the completeness count (`6/6` vs `5/6`), so a wrong-area keyword match could pass. Added `does not fill the verification gap with a link to an unrelated area` — a live link pointing at `conventions` (already inline) must not be credited against the missing `verification` area; asserts `5/6`. Plus an empty-`--base-path` fallback test. |

**Residual risk — Low.** The R3 surface is one flag plus one threaded option, now with a single
default helper. Default-on `basePath` is **monotonic**: `scoreCompleteness`
(`packages/core/src/quality/magent.ts:74-78`) short-circuits on a heading match and only *adds* link
credit, so no re-evaluation can lower a stored score. Verified empirically — the template scores
identically with and without `basePath`.

**Cross-repo note.** R1/R2/R4/R5 were implemented in the spur repo under task 0534 (`wip` at the
time of this verify). This verification confirms their **observable behavior** from the consuming
side — CLI output, help text, corrected reference, and a re-run of the analyzer — not their internal
code quality, which 0534's own review owns.

**No blockers found.** All three prior findings were P4 advisories and are now closed; no new
findings at P1–P3.
### References
- Session set (source `omp`, High fidelity):
  `~/.omp/agent/sessions/-xprojects-superskill/2026-08-13T19-20-21-538Z_019ffc91-7f22-7000-8aa3-ee5ea7eb7168/`
  — 20 subagent JSONL (`Implement|Unit|Review|Verify` × `0115`–`0119`) plus the main session file
  `…-ee5ea7eb7168.jsonl`; 12 MB total.
- Parallel session (source `claude`, Medium fidelity), same work window:
  `~/.claude/projects/-Users-robin-xprojects-superskill/070ae380-aae2-4a8c-accb-31d516f7ad1f.jsonl`
- Feature under analysis: `docs/features/A_absorb-agents-md-guide-into-magent-quality-surfaces.md`
  (tasks 0115–0119, all `done` / PASS).
- Analyzer skill + stale reference (R4):
  `plugins/sp/skills/issue-finding/references/session-formats.md` § OMP deep dive (spur repo).
- Heuristic table (R5): `plugins/sp/skills/issue-finding/SKILL.md` § Phase 3 IDENTIFY.
- Scoring seam (R3): `packages/core/src/quality/evaluate.ts:15,40`;
  `packages/core/src/quality/magent.ts` (`evaluateMagent`).
### History
- 2026-08-13T21:34:13.742Z backlog → wip (system)
- 2026-08-13T21:43:51.540Z wip → testing (system)
- 2026-08-13T21:44:02.808Z testing → done (system)
### Notes

**Scope note.** R1, R2, R4, R5 land in the **spur** repo (`/Users/robin/xprojects/spur-new`); R3
lands in **superskill**. This task lives in superskill's corpus because the analysis ran here; the
cross-repo split is called out in Plan so it is not discovered mid-implementation.

**Severity ledger** (S0 >2h · S1 30m–2h · S2 <30m, per skill thresholds):

| RC | Finding | Category | Severity | Est. waste |
| --- | --- | --- | --- | --- |
| RC3 | Hand-rolled scoring scripts | (no existing id — closest: tooling-gap) | S1 (→S0 at scale) | 35–70 min |
| RC1 | Verb discovery by trial | `guard` | S1 | 10–15 min |
| RC2 | Section names found by failing | `section-write` | S2 | ~8 min |
| RC4 | Stale OMP field map | (analyzer defect) | S2 time / high correctness | ~5 min |
| RC5 | Miscalibrated heuristic | (analyzer defect) | S2 | 0 (false-positive risk) |

**Cross-session recurrence.** RC1, RC2, and RC3 each appeared in **both** the OMP pipeline sessions
and the parallel Claude Code session. Per the skill's PROPOSE phase, an anti-pattern seen in ≥2
independent sessions is a candidate for codification — consider a handoff to `/sp:rule-scan` for
RC1/RC2 after these fixes land. No rule is invented here.

**Confidence.** Source `omp`, fidelity **High** (documented adapter, readable tool events, exact
counts). Counts are measured. Wall-clock durations are measured from log timestamps. **Per-incident
waste multipliers are estimates**, not instrumented — the ~60–95 min total is order-of-magnitude.

