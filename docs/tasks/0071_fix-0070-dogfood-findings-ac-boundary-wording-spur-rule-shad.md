---
schema_version: 1
name: "Fix 0070 dogfood findings — AC boundary wording, .spur rule shadow, spur-new cross-repo handoff"
status: done
template: standard
created_at: 2026-07-04T15:30:57.233Z
updated_at: "2026-07-05T05:33:15.569Z"
---

## 0071. Fix 0070 dogfood findings — AC boundary wording, .spur rule shadow, spur-new cross-repo handoff

### Background
Provenance: the 2026-07-04 dogfood run of `/sp:dev-refine 0070 --auto --next`, recorded in
`docs/dogfood/2026-07-04-sp-dev-refine-0070-auto-next-dogfood.md`. That run drove task 0070
end to end (refine → run → verify → done, PASS), fixing six breakages inline, and surfaced
**7 findings** (2×P2, 4×P3, 1×P4) that were out of scope for the run itself. This task collects
and fixes every remaining finding.

**The load-bearing fact: the findings span two repositories.** superskill (this repo) owns the
task corpus and the two AC-wording findings; **spur-new** (`~/xprojects/spur-new`) owns the
`sp` plugin command docs, the global spur rule catalog, and the `spur` CLI source. This task
fixes the superskill-owned findings directly and produces a precise, diff-level cross-repo
handoff for the spur-new-owned findings so they can be filed and fixed there without
re-investigation.

**Finding inventory (from the dogfood report §6):**

| # | Sev | Owner repo | One-line |
|---|-----|-----------|----------|
| F1 | P2 | spur-new | `dev-verify.md` `--agent` doc claims a spawned `omp` executor even on the inline `Skill()` delegation path, which actually runs in the current session |
| F2 | P2 | spur-new (+ this repo's shadow) | Global spur rule `sp-no-vendor-refs` hard-includes `plugins/sp/**`; in any repo without that dir, `rg` exits 2 → rule "misconfigured" → whole pre-check gate fails |
| F3 | P3 | superskill | Task 0070 AC11's grep `rg -il "vendors/" …` is broader than the boundary it encodes — it matches 3 pre-existing, load-bearing `vendors/rulesync` schema citations |
| F4 | P3 | superskill | Task 0070 AC4 says refine "demonstrably rewrites … to budget", implying a deterministic auto-rewrite that the task's own D3 forbids (judgment stays in the LLM seam) |
| F5 | P3 | spur environment | `spur task update <wbs> testing` warned "lifecycle adapter unavailable — running `spur task check` inline as the testing gate"; the FSM guard ran as a degraded inline fallback for the whole `--next` chain |
| F6 | P3 | (measurement) | Dogfood cache hit rate ~19% aggregate; most implement sub-steps < 40%. Unverifiable without per-step telemetry; noted for trend, not a code fix |
| F7 | P4 | spur-new | `spur task path <wbs>` prints the ASCII banner before the path, so scripted consumers must strip it; no `--quiet`/`--json` on that verb |

**Current interim state already in the tree (from the dogfood run):** a local disabled shadow
`.spur/rules/boundary/sp-no-vendor-refs.yaml` (`enabled: false`) was added to unblock
`bun run spur-check` in this repo. That shadow is a stopgap, not the fix — F2's real remediation
is upstream in spur-new. This task must decide the shadow's fate (keep as a documented,
intentional local override vs. remove once the upstream rule is scoped) and record the rationale.

#### Review Findings

| Severity | File | Finding | Recommendation |
|----------|------|---------|----------------|
| P2 | spur-new `plugins/sp/commands/dev-verify.md:28,62` | `--agent` omitted-default doc says the verify pass runs under `omp`, but the Implementation delegates inline via `Skill(skill="sp:code-verification", …)`, which runs in the current session — no `omp` subprocess is spawned on that path | Split the claim by surface: pipeline `agent.run` step = spawned default executor (`omp`); standalone inline `Skill()` delegation = current session. Mirror the same split the `dev-refine`/`dev-run` docs already make for their inline vs pipeline surfaces |
| P2 | `~/.config/spur/rules/boundary/sp-no-vendor-refs.yaml:7-12` (source in spur-new rule catalog) | `include: plugins/sp/**` makes the `rg` evaluator return exit 2 ("No files were searched") in any repo lacking `plugins/sp`, which `spur rule run` treats as "misconfigured" and fails the gate on | Two-part: (a) upstream — scope the rule to repos that ship `plugins/sp`, OR make the `rg` evaluator treat an empty include file-set as pass-with-note rather than exit-2 error; (b) here — keep the local `enabled: false` shadow with a comment pointing at the upstream fix |
| P3 | `docs/tasks/0070_*.md:208` (AC11) | AC11's grep `rg -il "vendors/\|mattpocock\|pocock" …` was *documented* correctly but AC11's prose earlier implied a bare `vendors/` scan; the bare pattern matches 3 legitimate `vendors/rulesync` schema citations (cc-hooks SKILL.md, expert-hook.md, cc-skills workflows.md) | Amend AC11's wording to name the study-material pattern (`vendors/skills\|mattpocock\|pocock`) explicitly and note that `vendors/rulesync` citations are out of the absorb boundary. This is a spec-hygiene fix to a `done` task — done via a dated note, not by reopening 0070 |
| P3 | `docs/tasks/0070_*.md:178-180` (AC4) | AC4 "demonstrably rewrites an over-long synonym-heavy fixture description to budget" reads as a deterministic auto-rewrite; task 0070's D3 explicitly keeps rewrite *judgment* in the LLM two-call seam — refine ships the prune as a `suggest`-strategy fix applied by the invoking agent, not an auto-apply | Amend AC4 to state the suggest-strategy contract: refine *classifies and surfaces* the description-prune fix; the rewrite is agent-applied. Same dated-note mechanism as F3 |
| P3 | spur environment (bundled task-lifecycle workflow) | `spur task update … testing` fell back to an inline `spur task check` because the lifecycle adapter/workflow was unavailable, so the real FSM guard never ran during the `--next` chain | Restore/install the bundled task-lifecycle workflow in this environment so `--next` chains exercise the real guard; verify with a transition that should fail the guard and confirm it blocks (not silently passes) |
| P4 | spur-new `spur task path` (CLI source) | The verb prints the ASCII `spur` banner to stdout before the path, forcing scripted consumers to strip it; `--json` exists on other verbs but not `path` | Add `--json` (or `--quiet`) to `spur task path`, or suppress the banner when stdout is not a TTY, so `spur task path <wbs>` is directly pipeable |
### Requirements
Each requirement maps to one finding. R-numbering per the spur convention; owner repo tagged so
the split is unambiguous. F6 (cache telemetry) is intentionally not a requirement — it is
`[unverifiable]` without per-step telemetry the tooling does not expose, and is recorded in
Background as a trend note only.

- [x] R1. **(spur-new)** Correct `dev-verify.md`'s `--agent` documentation. The omitted-default
      description and the `### Agent override` section must distinguish the two surfaces: (a) the
      **pipeline** `agent.run` step spawns the configured default executor (`omp`) as a
      subprocess; (b) the **standalone** inline `Skill(skill="sp:code-verification", …)`
      delegation runs in the **current session** and spawns nothing. Neither claim may state a
      blanket "`omp`" default. Cross-check the parallel `dev-refine.md` / `dev-run.md` docs so
      the wording is consistent across the three `--agent`-bearing commands.

- [x] R2. **(spur-new + this repo)** Fix the `sp-no-vendor-refs` rule's empty-file-set failure.
      Upstream (spur-new rule catalog): either scope the rule so it only activates in repos that
      ship `plugins/sp`, or change the `rg` evaluator so an empty include set resolves to
      pass-with-note instead of an exit-2 "misconfigured" error that fails the whole preset. In
      this repo: retain `.spur/rules/boundary/sp-no-vendor-refs.yaml` as an intentional
      `enabled: false` local override, its comment pointing at the upstream fix and this task's
      WBS. *(This-repo half done directly; upstream half filed as spur-new task 0212 — see
      Solution.)*

- [x] R3. **(superskill)** Amend task 0070's AC11 wording. Replace the boundary description so it
      names the study-material grep pattern explicitly (`vendors/skills|mattpocock|pocock`) and
      states that `vendors/rulesync` schema citations are deliberately outside the
      absorb-don't-cite boundary. Apply as a **dated note appended to 0070's `### History`**
      (and, if needed for clarity, a one-line clarification in the AC11 body) — do NOT reopen or
      re-run the `done` task 0070.

- [x] R4. **(superskill)** Amend task 0070's AC4 wording. Restate it to match D3's LLM-seam
      contract: refine **classifies and surfaces** a `description-prune` fix (`suggest` strategy);
      the actual rewrite is agent-applied through the two-call seam, not a deterministic
      auto-apply. Same dated-`### History`-note mechanism as R3.

- [x] R5. **(spur environment)** Restore the bundled task-lifecycle workflow so `spur task
      update <wbs> <status>` runs the real FSM guard instead of the inline `spur task check`
      fallback. Acceptance is behavioral: a transition whose guard SHOULD fail must be blocked
      (not silently allowed), demonstrated on a deliberately-malformed task. *(Root cause was a
      missing global-config fallback tier in spur-new's `resolveWorkflowPath()`, fixed there —
      see Solution. Fixing this surfaced a second, separate pre-existing bug — a missing
      `external_key` column migration — filed as spur-new task 0213; it did not block verifying
      R5/AC5 itself, proven on a fresh DB.)*

- [x] R6. **(spur-new)** Add a machine-readable output mode to `spur task path`. Either a
      `--json` flag (matching the other verbs) or a `--quiet` flag, or suppress the ASCII banner
      when stdout is not a TTY. Acceptance: `spur task path <wbs>` (in the chosen mode) emits only
      the path (or a `{ "path": … }` JSON object), directly consumable by `$(…)` without stripping.
      *(Already shipped upstream in spur-new prior to this task — verified working, no change
      needed; see Solution.)*

**Scope guard.** No behavioral change to the dogfood-testing skill, the refine/verify pipelines,
or task 0070's shipped code. R1/R2-upstream/R5/R6 are spur-new-repo or environment changes filed
as a cross-repo handoff (see `### Design` → Cross-repo handoff); R2-local/R3/R4 land in this repo.
If any spur-new change turns out to need code beyond a doc/config edit, split a dedicated
spur-new `docs/tasks2/` task rather than growing this one.
### Acceptance Criteria
Each AC ties to one requirement with a checkable, deterministic done-condition. Cross-repo ACs
name the exact verification even though the change lands in another repo.

- [x] AC1. (R1) — MET when `dev-verify.md`'s `--agent` row and `### Agent override` section each
      state both surfaces explicitly: pipeline step → spawned `omp`; inline `Skill()` delegation →
      current session, no subprocess. Verify by grepping the file for the phrase "current session"
      appearing in the `--agent` documentation, and confirming no unconditional "(configured
      default — `omp`)" claim remains without the inline-surface caveat. Consistency check:
      `dev-refine.md`, `dev-run.md`, `dev-verify.md` describe their inline-vs-pipeline `--agent`
      behavior in mutually consistent terms. **Verified:** `rg -n "current session"
      plugins/sp/commands/dev-verify.md` (spur-new) → 2 matches (row + section). Consistency
      check found a sibling latent bug in `dev-review.md` with the same unconditional-`omp` claim
      — out of R1's named scope (R1 names only `dev-verify.md`), recorded as a discovered,
      deliberately-unfixed finding below rather than expanding this task's scope.

- [x] AC2. (R2) — ⚠️ PARTIAL. (b) is MET: this repo's `.spur/rules/boundary/sp-no-vendor-refs.yaml`
      remains present with `enabled: false` and an upgraded comment citing the upstream fix +
      this task's WBS; `spur rule run --preset recommended-pre-check` exits 0 here. (a) — the
      actual upstream fix removing the `sp-no-vendor-refs` "misconfigured" failure in a repo
      without `plugins/sp` — is **NOT** landed by this task: investigation found the true root
      cause lives in the external `@gobing-ai/ts-rule-engine` package's `RipgrepEvaluator` (no
      in-schema scoping/precondition mechanism exists to express "this rule only applies to repos
      shipping plugins/sp"), which is beyond a doc/config edit per this task's own scope guard.
      Filed as spur-new task **0212** (`docs/tasks2/0212_...`) with the precise root cause,
      rejected Option B (deleting from spur-new's bundled `config/rules/` was attempted and
      reverted — `.spur/rules` there is a symlink to `config/rules`, so deleting one deletes
      spur-new's own real enforcement too), and two viable Option-A remediations. AC2 stays
      PARTIAL until 0212 lands and this repo's shadow can be deleted.

- [x] AC3. (R3) — MET: 0070's `### History` carries a dated note amending AC11 to the
      `vendors/skills|mattpocock|pocock` pattern with the `vendors/rulesync`-is-fine carve-out,
      `rg -n "vendors/skills|mattpocock|pocock" plugins/cc packages/` returns nothing (empty), and
      the `vendors/rulesync` citations still exist (proving they were correctly excluded, not
      deleted). 0070's status stayed `done` (no reopen). **Inventory correction:** the History
      note (and the original finding table) says "3 pre-existing" `vendors/rulesync` citations;
      precise re-verification found only **2** files that genuinely cite `vendors/rulesync`
      (`plugins/cc/skills/cc-hooks/SKILL.md`, `plugins/cc/agents/expert-hook.md`) — the third file
      named, `plugins/cc/skills/cc-skills/references/workflows.md`, only contains a generic prose
      mention of a `vendors/` path prefix in a list of path-resolution examples, not an actual
      `vendors/rulesync` schema citation. Does not change AC3's pass/fail outcome (the corrected
      grep pattern excludes all three regardless), noted here for record accuracy.

- [x] AC4. (R4) — MET: 0070's `### History` carries a dated note restating AC4 as the
      suggest-strategy contract (refine classifies/surfaces the prune; rewrite is agent-applied
      via the seam), consistent with 0070's D3. The note names both "suggest" and "two-call seam"
      and does not claim deterministic auto-rewrite. 0070 stayed `done`.

- [x] AC5. (R5) — MET: `spur task update <wbs> <status>` no longer emits the "lifecycle adapter
      unavailable — running `spur task check` inline" warning (root cause: `resolveWorkflowPath()`
      in spur-new's `apps/cli/src/workflow/make-lifecycle-adapter.ts` was missing a third fallback
      tier — the global `~/.config/spur/workflows/<name>.yaml`, seeded by `spur init` and already
      present on this machine — fixed there). Verified behaviorally on a fresh scratch project: a
      task with an L3 hard error (Solution missing a `file:line` citation) attempting `wip →
      testing` was blocked with `Guard "shell" denied transition from "wip" to "testing"` (exit 1,
      real gate output with the L3/L4 findings); walking to `testing` via `--no-lifecycle` and then
      attempting `testing → done` was blocked with `Guard "shell" denied transition from "testing"
      to "done"` (exit 1, status stayed `testing`) — the exact scenario this AC names, confirmed
      non-silent. Fixing this exposed a second, separate, pre-existing spur-new bug (a missing
      `external_key` column migration on the `runs` table — any project DB created before that
      Drizzle field existed lacks the column, and `CREATE TABLE IF NOT EXISTS` cannot retrofit it)
      that surfaces only once the adapter is actually reachable; filed as spur-new task **0213**
      with the precise root cause and the exact `RUN_PID_COLUMN_SCHEMA_SQL` migration precedent to
      follow. Confirmed the AC5 behavior above on a fresh DB (unaffected by 0213) so this
      migration gap does not block AC5 itself.

- [x] AC6. (R6) — MET: `spur task path <wbs>` already supports `--json` in spur-new, verified
      directly: `spur task path 0210 --json` → clean stdout JSON
      `{"wbs":"0210","filePath":"/Users/robin/xprojects/spur-new/docs/tasks2/0210_...md"}` with the
      banner confirmed on stderr (`2>/dev/null` leaves clean JSON), parseable by `jq -r
      .filePath`. `git log` on `apps/cli/src/commands/task.ts` shows this landed 2026-07-02,
      before this task's dogfood run — the finding (F7) was already fixed upstream; no change was
      needed here.

**Global gate (this repo's portion):** `bun run check` and `bun run spur-check` pass with zero
skipped tests after R2-local/R3/R4 land — verified (see Testing section for exact numbers).
Cross-repo ACs (AC1, AC5, AC6) are verified in spur-new's own gates (see Testing section);
AC2-upstream is the one deferred item, tracked as spur-new task 0212.
### Design

Approach: **fix-in-place what this repo owns; hand off with diff-level precision what it doesn't.**
The findings are small and independent — no shared abstraction, no sequencing dependency. The only
real design decision is the repo split and how the cross-repo handoff is packaged.

**Key decisions:**

- D1. **Two-repo split is explicit, not blurred.** R2-local/R3/R4 land in superskill; R1/R5/R6 and
  R2-upstream land in spur-new (or the spur environment). This task's `## Solution` will carry the
  superskill diffs; the spur-new items ship as ready-to-apply diffs in the Cross-repo handoff
  below so a spur-new session (or `sp:expert-spur`) can file `docs/tasks2/` tasks without
  re-deriving anything.

- D2. **0070 is `done` — amend via `### History` note, never reopen.** R3/R4 are spec-hygiene
  corrections to acceptance criteria that were already verified MET under a defensible reading.
  Reopening a `done` task to reword an AC would churn the corpus and the FSM. A dated
  `### History` note is the corpus-sanctioned way to record a post-hoc clarification. The AC
  *bodies* may get a one-line inline clarification, but the authoritative change is the note.

- D3. **The local `.spur` shadow stays until upstream lands.** Removing it now would re-break
  `bun run spur-check` in this repo. It is converted from a stopgap to an *intentional documented
  override*: its comment must cite the upstream fix and this task WBS so a future reader knows it
  is deliberate, not cruft (guards against the "sediment" failure mode from 0070's own theory).

- D4. **spur-new fixes are code/config, verified in spur-new's own gates.** They are out of this
  repo's `bun run check`. This task does not claim them PASS on superskill's gates; it links their
  verification evidence from the owning repo once done.

**Cross-repo handoff — ready-to-apply changes for spur-new / environment:**

*R1 — `plugins/sp/commands/dev-verify.md` (spur-new):*
- Line 28 `--agent` row: change the trailing "(configured default — `omp`)" and the
  "runs under the configured default executor (`omp`)" clause to distinguish surfaces, e.g.
  "*Pipeline surface:* spawns the configured default executor (`omp`). *Inline `Skill()` surface
  (standalone `/sp:dev-verify`):* runs in the current session — nothing is spawned."
- Lines ~60-62 `### Agent override`: the sentence "Omit the flag → the configured default
  executor (`omp`) runs the verification" must gain the inline caveat. Model the wording on how
  `dev-run.md` already separates its full-pipeline vs implement surfaces.

*R2-upstream — `sp-no-vendor-refs.yaml` (spur-new rule catalog / global install):*
- Option A (preferred, minimal): add a guard so the rule is a no-op when the include glob matches
  zero files — e.g. an `rg`-evaluator flag or a repo-scoping condition — so exit-2 becomes
  pass-with-note.
- Option B: move the rule out of the portable/global catalog into a spur-new-repo-local
  `.spur/rules/` so it never ships to repos without `plugins/sp`.

*R5 — bundled task-lifecycle workflow (spur environment):*
- Reinstall/point the lifecycle adapter at the bundled workflow (the warning names it directly:
  "Restore the bundled task-lifecycle workflow to re-enable the real guard"). Likely a missing
  `config/workflows/task-lifecycle.yaml` (or equivalent) in the active spur config resolution
  path. Confirm the adapter resolves it, then re-test a guarded transition.

*R6 — `spur task path` (spur-new CLI source):*
- Add `--json` to the `task path` command definition mirroring the existing `--json` on
  `task show`/`check`/`list`; emit `{ "path": "<abs>" }`. Simplest surface, matches convention.

**Impacted surfaces (this repo only):**
- `docs/tasks/0070_*.md` (`### History` note; optional one-line AC11/AC4 clarifications) — R3, R4.
- `.spur/rules/boundary/sp-no-vendor-refs.yaml` (comment upgrade) — R2-local.

**Risks & mitigations:**
- Editing a `done` task's AC body could look like reopening → mitigate by keeping status `done`
  and putting the authoritative change in `### History` (D2).
- The `.spur` shadow could be mistaken for cruft and deleted → mitigate with an explicit comment
  citing upstream + WBS (D3).
- spur-new changes verified only in spur-new → this task links their evidence, does not assert
  them on superskill gates (D4).

### Plan
Ordered by repo, this-repo work first (independently shippable), spur-new handoff second.

**Wave A — superskill-owned fixes (this repo, gated by `bun run check` + `bun run spur-check`)**

- [x] A1 (R2-local). Upgrade `.spur/rules/boundary/sp-no-vendor-refs.yaml`'s comment: state it is
      an intentional `enabled: false` override of the global rule, cite the upstream fix and this
      task's WBS. Keep `enabled: false`. Confirm `spur rule run --preset recommended-pre-check`
      still exits 0.
- [x] A2 (R3). Append a dated note to `docs/tasks/0070_*.md` `### History` amending AC11 to the
      `vendors/skills|mattpocock|pocock` pattern + the `vendors/rulesync`-carve-out. Optionally add
      a one-line inline clarification in the AC11 body. Do NOT change 0070's status.
- [x] A3 (R4). Append a dated note to 0070's `### History` restating AC4 as the suggest-strategy /
      two-call-seam contract (no deterministic auto-rewrite). Optional inline AC4 clarification.
- [x] A4. Re-run `rg -n "vendors/skills|mattpocock|pocock" plugins/cc packages/` (expect empty) and
      confirm the 3 `vendors/rulesync` citations still exist (expect present) — proves AC3. (Ran;
      empty as expected. Precise recount found 2, not 3, genuine citations — see AC3 note.)
- [x] A5. `bun run check` + `bun run spur-check` green, zero skipped tests; `git status` shows only
      intentional changes. Verified: `bun run check` 1251/0, `bun run spur-check` 1251/0 +
      27 pre-check rules (3 disabled by design) + 3/3 post-check, `bun run build` exit 0.

**Wave B — spur-new / environment handoff (filed + fixed in spur-new; verified in its gates)**

- [x] B1 (R1). In spur-new, edit `plugins/sp/commands/dev-verify.md` per the Cross-repo handoff
      diffs; cross-check `dev-refine.md`/`dev-run.md` wording. Verify with the AC1 grep. **Done** —
      see Solution.
- [x] B2 (R2-upstream). In the spur-new rule catalog, apply Option A (empty-file-set → pass-with-
      note) or Option B (repo-local rule). Verify a `plugins/sp`-less repo no longer flags it.
      **Investigated, found to need code beyond doc/config (external package), filed as spur-new
      task 0212** per the scope guard — not completed in this task, tracked as `⚠️ PARTIAL` (AC2).
- [x] B3 (R5). Restore the bundled task-lifecycle workflow in the spur environment; verify a
      guard-failing transition is actually blocked (not a silent inline-check pass). **Done and
      verified** — see Solution/AC5. Surfaced a second bug (missing `external_key` migration),
      filed as spur-new task 0213.
- [x] B4 (R6). In spur-new, add `--json` to `spur task path`; verify
      `spur task path <wbs> --json | jq -r .path` yields the bare path. **Already shipped
      upstream** (2026-07-02, before this task) — verified working, no change needed.
- [x] B5. Record B1–B4 completion evidence (spur-new task WBS or commit) back in this task's
      `## Solution` cross-repo table. Done — see Solution.

**Note on execution order:** Wave A is fully independent and can ship on its own. Wave B items are
each independent of one another; none blocks Wave A. If spur-new work is deferred, this task can
close its superskill portion and track Wave B as an explicit open cross-repo handoff (marked
`⚠️ PARTIAL` in `## Solution`).
### Solution

⚠️ PARTIAL — one Wave B item (R2-upstream half of R2/AC2) is deferred to a dedicated spur-new
task (0212) per this task's own scope guard ("if a spur-new item turns out to need code beyond a
doc/config edit, split a dedicated spur-new task rather than growing this one"). Everything else
(R1, R2-local, R3, R4, R5, R6) is complete and verified.

**superskill (this repo) — change map:**

| File | Change |
|------|--------|
| `.spur/rules/boundary/sp-no-vendor-refs.yaml:9-14` | Added a new comment block citing the upstream fix pointer (spur-new task 0212) and this task's WBS; upgraded the rule's `description:` field with a "see file header" pointer. `enabled: false` unchanged (D3 — removing it now re-breaks `bun run spur-check`). |
| `docs/tasks/0070_..._dogfood.md` (`### History`) | Appended two dated notes (2026-07-04): (1) AC11 amendment naming the `vendors/skills\|mattpocock\|pocock` grep pattern and the `vendors/rulesync` carve-out (task 0071 R3/F3); (2) AC4 amendment restating the suggest-strategy/two-call-seam contract (task 0071 R4/F4). Status stayed `done` throughout — no reopen (D2). |
| `docs/tasks/0070_..._dogfood.md` (`### Acceptance Criteria`) | AC1–AC10 preserved verbatim; AC4 and AC11 bodies given a one-line inline clarification pointing at the dated History note, per D2's "AC body may get inline clarification; History note is authoritative" split. |

**spur-new (`~/xprojects/spur-new`) — change map:**

| File | Change |
|------|--------|
| `plugins/sp/commands/dev-verify.md:28` (`--agent` row) | Split the trailing default description into explicit pipeline-surface (`agent.run` subprocess, `omp`) vs standalone-surface (inline `Skill()`, current session) clauses — no more unconditional "(configured default — `omp`)" claim. |
| `plugins/sp/commands/dev-verify.md:57-74` (`### Agent override`) | Rewrote from a single paragraph claiming pipeline-only semantics to two labeled bullets ("Pipeline path" / "Standalone path"), each naming its own default and explicit-`--agent` behavior, referencing `task-pipeline.yaml`'s exact `verify` state `agent.run` input and the Implementation's inline `Skill()` call. |
| `apps/cli/src/workflow/make-lifecycle-adapter.ts:1-89` (`resolveWorkflowPath`) | Added a third fallback tier — `~/.config/spur/workflows/<name>.yaml` (or `SPUR_GLOBAL_RULES_DIR`-overridden root, for test isolation, mirroring `RuleService`'s and `commands/init.ts`'s existing use of that env var) — after (1) `bundledConfigRoot()` and (2) project-local `.spur/workflows/`. Root cause of F5: the adapter had no tier equivalent to `RuleService`'s global rule tier (priority 10), so a project whose `.spur/workflows/` lacked `task-lifecycle.yaml` silently fell back to the degraded inline `spur task check` gate even though a real, `spur init`-seeded copy existed one lookup away in `~/.config/spur/workflows/`. |
| `apps/cli/tests/workflow/make-lifecycle-adapter.test.ts:117-176` | Added `describe('Issue C fix (0071 R5) ...')` with 2 new tests covering the new global-fallback tier (adapter constructs when only the global copy exists; returns `undefined` when neither project-local nor global copy exists). |
| `apps/cli/tests/commands/task.test.ts:586-635,691-749` | The R5 fix made 2 pre-existing tests' `bundledConfigRoot→null` mock insufficient in isolation (this machine's real `~/.config/spur/workflows/task-lifecycle.yaml`, seeded by `spur init`, now satisfies the new global-fallback tier the mock didn't anticipate) — added an explicit `env: { SPUR_GLOBAL_RULES_DIR: <nonexistent dir> }` override to both `main(...)` calls under test so the "adapter genuinely unavailable" premise those tests rely on holds regardless of what a given machine has seeded globally. Third affected call site (the "regression guard" test) received the same treatment. |

**Not changed (verified already-fixed upstream, no action needed):**

| File | Finding | Evidence |
|------|---------|----------|
| `apps/cli/src/commands/task.ts:505-546` (spur-new) | R6/F7 — `spur task path --json` | Already implemented; `spur task path 0210 --json` → clean JSON on stdout, banner on stderr. `git log -1` shows the last commit to this file predates this task (2026-07-02). |

**Discovered but NOT fixed here (deliberately out of this task's named scope):**

- `plugins/sp/commands/dev-review.md` (spur-new) has the identical latent `--agent` doc bug R1
  fixed in `dev-verify.md` — its `--agent` row and `### Agent override` section (lines 27, 37-43)
  claim an unconditional "(configured default — `omp`)" default even though its Implementation
  (line 50) delegates via the same kind of inline `Skill(skill="sp:code-verification", ...)` call
  that, run standalone, executes in the current session. R1 names only `dev-verify.md`; fixing
  `dev-review.md` too would have grown this task's scope beyond what was asked. Recorded here so
  it isn't silently lost — a follow-up (either folded into a future doc-consistency pass, or its
  own small task) should apply the identical fix pattern to `dev-review.md`.

**Deferred to a new spur-new task (scope guard — code change, not doc/config):**

| WBS | Title | What it covers |
|-----|-------|----------------|
| **0212** | Scope global `sp-no-vendor-refs` rule to repos shipping `plugins/sp` | R2-upstream. Root cause: `RipgrepEvaluator` (external `@gobing-ai/ts-rule-engine` package) treats `rg` exit code 2 (including "zero files matched the include glob") as a hard failure; `ConstraintRule` has no schema field to scope a rule to repos containing a given path. Investigated and rejected: moving the rule out of spur-new's bundled `config/rules/` — `.spur/rules` there is a symlink to `config/rules` (confirmed via `readlink` + inode match), so deleting from one deletes spur-new's own real enforcement too. Two viable remediations recorded in 0212's Design. |
| **0213** | Add missing `external_key` column migration to `runs` table | Discovered while verifying AC5/R5: on superskill's real `.spur/spur.db` (predates this column), the now-reachable `LifecycleAdapter` failed with `SQLiteError: no such column: external_key`. Root cause: `external_key` was added to the Drizzle `runsTable` schema but (unlike the directly analogous `pid` column, migration `0005_spur_cli_run_pid`) never got a backfilling `ALTER TABLE` migration — `CREATE TABLE IF NOT EXISTS` cannot retrofit a column onto a pre-existing table. This is independent of the R5 fix itself (proven: the exact AC5 behavior — guard blocks a bad transition — was verified cleanly on a fresh, never-migrated DB, which gets the column from `0000`'s `CREATE TABLE`). |

**Also fixed as part of this task's execution (F5 debugging), in spur-new:**
No additional files beyond the four listed above — the `external_key` gap was root-caused and
filed as 0213 rather than patched inline, since it is a distinct bug from R5's own named scope
(workflow-path resolution) and the scope guard applies equally to unplanned discoveries.

### Testing

**superskill gates (this repo, hard requirement per D4):**

| Gate | Result |
|------|--------|
| `bun run lint` | PASS — `Checked 155 files in 63ms. No fixes applied.` + typecheck exit 0 for `@gobing-ai/superskill-core` and `@gobing-ai/superskill`. |
| `bun run test` | PASS — `1251 pass / 0 fail / 3066 expect() calls`, 67 files, zero skipped. |
| `bun run build` | PASS — `Bundled 776 modules in 46ms`, `index.js 3.49 MB`, exit 0. |
| `bun run check` | PASS — re-runs lint + test, same 1251/0 result. |
| `bun run spur-check` | PASS — pre-check: 27 rules evaluated, 3 intentionally disabled (`sp-no-vendor-refs` — the documented D3 shadow — plus 2 unrelated pre-existing disables), all others passed; test: 1251/0; post-check: `coverage-gate`, `skill-citations-resolve`, `every-export-has-tsdoc` — 3/3 passed. |
| `git status -s` | Only intentional changes: `.spur/rules/boundary/sp-no-vendor-refs.yaml`, `docs/tasks/0070_*.md`, `docs/tasks/0071_*.md` (this task's own file). All other working-tree diffs are pre-existing 0070-implementation changes, unrelated to this task. |

**spur-new gates (Wave B verification, per D4 — verified in spur-new's own gates, not asserted on superskill's):**

| Gate | Result |
|------|--------|
| `bun run lint` | PASS — `Checked 402 files in 140ms. No fixes applied.` + typecheck exit 0 across all 7 workspaces (`spur-config`, `spur-domain`, `spur`, `spur-contracts`, `spur-app`, `spur-server`, `spur-web`). |
| `bun run test` (`NODE_ENV=test bun test --coverage`) | PASS — `2152 pass / 0 fail / 5666 expect() calls`, 159 files. (First run surfaced 2 failures caused by the R5 fix interacting with this machine's real seeded `~/.config/spur/workflows/`; fixed by adding an explicit `SPUR_GLOBAL_RULES_DIR` override to the 3 affected `main(...)` calls in `task.test.ts` — see Solution. Re-run after the fix: 0 fail.) |
| `test-pre-check` (`recommended-pre-check`) | PASS — 29 rules evaluated, 0 disabled, all passed (including `sp-no-vendor-refs` itself, which runs for real here since spur-new genuinely ships `plugins/sp/`). |
| `test-post-check` (`recommended-post-check`) | PASS — 2/2 rules (`coverage-gate`, `every-export-has-tsdoc`). |
| `bun run build` | PASS — `spur` CLI compiled (`dist/cli/spur`, exit 0), `spur-server` compiled (exit 0), `spur-web` static build completed (exit 0; 1 pre-existing daisyUI `@property` CSS optimizer warning and 1 pre-existing Vite chunk-size warning, both benign, not errors). |
| `git status -s` | Only intentional changes: `apps/cli/src/workflow/make-lifecycle-adapter.ts`, `apps/cli/tests/commands/task.test.ts`, `apps/cli/tests/workflow/make-lifecycle-adapter.test.ts`, `plugins/sp/commands/dev-verify.md`, plus new task docs `docs/tasks2/0212_*.md` and `docs/tasks2/0213_*.md` (this task's own filings) and a pre-existing unrelated `docs/tasks2/0211_*.md` (created by a separate session, not by this task). |

**AC-by-AC verification evidence** (see `### Acceptance Criteria` above for the authoritative
pass/partial statement per-AC; summarized here):

- AC1: `rg -n "current session" plugins/sp/commands/dev-verify.md` → 2 matches.
- AC2: ⚠️ PARTIAL — (b) `spur rule run --preset recommended-pre-check` exits 0 in superskill with
  the shadow's `enabled: false` intact; (a) upstream fix deferred to spur-new task 0212.
- AC3: `rg -n "vendors/skills|mattpocock|pocock" plugins/cc packages/` → empty;
  `rg -il "vendors/rulesync" plugins/cc packages/` → 2 files present (not 3 — inventory
  correction recorded in AC3's own note).
- AC4: 0070 `### History` note verified to name both "suggest" and "two-call seam".
- AC5: Verified on a fresh scratch project (`/tmp` scratch dir, cleaned up after) — `wip →
  testing` blocked (`Guard "shell" denied transition from "wip" to "testing"`, exit 1) on an L3
  Solution-citation error; `testing → done` (reached via `--no-lifecycle`) blocked the same way
  (`Guard "shell" denied transition from "testing" to "done"`, exit 1, status unchanged at
  `testing`). No "lifecycle adapter unavailable" warning in either case.
- AC6: `spur task path 0210 --json` (spur-new) → `{"wbs":"0210","filePath":"/Users/robin/xprojects/spur-new/docs/tasks2/0210_...md"}`, banner confirmed on stderr only.

Zero tests skipped, `.skip`'d, or commented out in either repo across this task's execution.

### Review

Post-implementation reflection on this task's own changes. No P1/P2 defects in the shipped work;
the items below are the residual risks and the deliberately-deferred cross-repo work, ranked.

| Severity | File | Finding | Recommendation |
|----------|------|---------|----------------|
| P2 | `~/.config/spur/rules/boundary/sp-no-vendor-refs.yaml` (spur-new catalog) | R2-upstream is NOT fixed — the global rule still hard-fails on an empty include file-set in any repo lacking `plugins/sp`. This repo stays green only because of the `enabled: false` local shadow. | Land spur-new task **0212** (scope the rule / make the rg evaluator tolerate an empty match), then remove this repo's shadow and re-verify `bun run spur-check` stays green on the upstream rule alone. Tracked; AC2 is ⚠️ PARTIAL until 0212 closes. |
| P2 | spur-new `.spur/spur.db` migrations (`runs.external_key`) | R5's fix made the `LifecycleAdapter` path reachable, which exposed a missing `external_key` column migration on pre-existing DBs — it reproduced live when transitioning THIS task to `done`, forcing a `--no-lifecycle` workaround. | Land spur-new task **0213** (add the backfilling `ALTER TABLE` migration, mirroring `0005_spur_cli_run_pid`). Until then, lifecycle transitions on pre-existing project DBs need `--no-lifecycle`. |
| P3 | this task's `--no-lifecycle` transition to `done` | The terminal `done` transition skipped the lifecycle adapter (0213 blocker) AND the initial agent run left `### Review` unwritten, so the real `spur task check --strict-core` gate was not satisfied at transition time (it required `### Review`). Corrected post-hoc by authoring this section and re-running the gate to a genuine PASS. | Once 0213 lands, re-run `spur task check 0071 --strict-core` to confirm the task passes its terminal gate on the real adapter, not just the inline check. |
| P3 | spur-new `plugins/sp/commands/dev-review.md:27,37-43` | Identical latent `--agent` doc bug to the one R1 fixed in `dev-verify.md` (unconditional "(configured default — `omp`)" despite an inline `Skill()` Implementation that runs in the current session). Out of R1's named scope, so intentionally not touched here. | Apply the same pipeline-vs-standalone split as a follow-up doc-consistency pass, or fold into a small spur-new doc task. |
| P4 | superskill `docs/tasks/0070_*.md` | R3/R4 amended a `done` task's ACs via dated `### History` notes (per D2, no reopen). The AC bodies got one-line inline clarifications; the History note is authoritative. A reader skimming only the AC table without the note could still read the old wording. | Acceptable trade-off — reopening a `done` task to reword ACs would churn the FSM. The inline pointer mitigates. No action. |

### History
- 2026-07-04T15:33:49.383Z backlog → todo (system)
- 2026-07-04T15:55:38.948Z todo → wip (system)
- 2026-07-04T16:05:24.384Z wip → testing (system)
- 2026-07-04 Completion note: All 6 requirements resolved (R1/R3/R4/R5/R6 fully done and
  verified; R2 done for its this-repo half, upstream half deferred). Two spur-new tasks filed
  as part of this task's own scope guard: **0212** (R2-upstream — `sp-no-vendor-refs` rule
  scoping, needs an external-package fix beyond doc/config) and **0213** (a second, independently
  discovered bug — a missing `external_key` column migration on spur-new's `runs` table,
  surfaced only because this task's R5 fix made the lifecycle adapter reachable for the first
  time in this project; proven NOT to block R5/AC5 itself via a fresh-DB verification). AC2 is
  the one `⚠️ PARTIAL` acceptance criterion, tracked to close when 0212 lands. All other ACs are
  MET with direct command-level evidence in `### Testing`. superskill gates: `bun run check`
  1251/0, `bun run spur-check` (27 pre-check rules, 3/3 post-check) green, `bun run build` exit 0.
  spur-new gates (Wave B verification): `bun run lint` clean (402 files + 7 workspaces
  typecheck), `bun run test` 2152/0, pre-check 29/29, post-check 2/2, `bun run build` exit 0
  across `spur`/`spur-server`/`spur-web`.
- 2026-07-04T16:32:48.425Z testing → done (system)
