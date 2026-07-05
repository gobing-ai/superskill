---
schema_version: 1
name: "Fix 0070 dogfood findings — AC boundary wording, .spur rule shadow, spur-new cross-repo handoff"
status: todo
template: standard
created_at: 2026-07-04T15:30:57.233Z
updated_at: "2026-07-04T15:33:49.383Z"
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

- [ ] R1. **(spur-new)** Correct `dev-verify.md`'s `--agent` documentation. The omitted-default
      description and the `### Agent override` section must distinguish the two surfaces: (a) the
      **pipeline** `agent.run` step spawns the configured default executor (`omp`) as a
      subprocess; (b) the **standalone** inline `Skill(skill="sp:code-verification", …)`
      delegation runs in the **current session** and spawns nothing. Neither claim may state a
      blanket "`omp`" default. Cross-check the parallel `dev-refine.md` / `dev-run.md` docs so
      the wording is consistent across the three `--agent`-bearing commands.

- [ ] R2. **(spur-new + this repo)** Fix the `sp-no-vendor-refs` rule's empty-file-set failure.
      Upstream (spur-new rule catalog): either scope the rule so it only activates in repos that
      ship `plugins/sp`, or change the `rg` evaluator so an empty include set resolves to
      pass-with-note instead of an exit-2 "misconfigured" error that fails the whole preset. In
      this repo: retain `.spur/rules/boundary/sp-no-vendor-refs.yaml` as an intentional
      `enabled: false` local override, its comment pointing at the upstream fix and this task's
      WBS.

- [ ] R3. **(superskill)** Amend task 0070's AC11 wording. Replace the boundary description so it
      names the study-material grep pattern explicitly (`vendors/skills|mattpocock|pocock`) and
      states that `vendors/rulesync` schema citations are deliberately outside the
      absorb-don't-cite boundary. Apply as a **dated note appended to 0070's `### History`**
      (and, if needed for clarity, a one-line clarification in the AC11 body) — do NOT reopen or
      re-run the `done` task 0070.

- [ ] R4. **(superskill)** Amend task 0070's AC4 wording. Restate it to match D3's LLM-seam
      contract: refine **classifies and surfaces** a `description-prune` fix (`suggest` strategy);
      the actual rewrite is agent-applied through the two-call seam, not a deterministic
      auto-apply. Same dated-`### History`-note mechanism as R3.

- [ ] R5. **(spur environment)** Restore the bundled task-lifecycle workflow so `spur task
      update <wbs> <status>` runs the real FSM guard instead of the inline `spur task check`
      fallback. Acceptance is behavioral: a transition whose guard SHOULD fail must be blocked
      (not silently allowed), demonstrated on a deliberately-malformed task.

- [ ] R6. **(spur-new)** Add a machine-readable output mode to `spur task path`. Either a
      `--json` flag (matching the other verbs) or a `--quiet` flag, or suppress the ASCII banner
      when stdout is not a TTY. Acceptance: `spur task path <wbs>` (in the chosen mode) emits only
      the path (or a `{ "path": … }` JSON object), directly consumable by `$(…)` without stripping.

**Scope guard.** No behavioral change to the dogfood-testing skill, the refine/verify pipelines,
or task 0070's shipped code. R1/R2-upstream/R5/R6 are spur-new-repo or environment changes filed
as a cross-repo handoff (see `### Design` → Cross-repo handoff); R2-local/R3/R4 land in this repo.
If any spur-new change turns out to need code beyond a doc/config edit, split a dedicated
spur-new `docs/tasks2/` task rather than growing this one.

### Acceptance Criteria

Each AC ties to one requirement with a checkable, deterministic done-condition. Cross-repo ACs
name the exact verification even though the change lands in another repo.

- [ ] AC1. (R1) — MET when `dev-verify.md`'s `--agent` row and `### Agent override` section each
      state both surfaces explicitly: pipeline step → spawned `omp`; inline `Skill()` delegation →
      current session, no subprocess. Verify by grepping the file for the phrase "current session"
      appearing in the `--agent` documentation, and confirming no unconditional "(configured
      default — `omp`)" claim remains without the inline-surface caveat. Consistency check:
      `dev-refine.md`, `dev-run.md`, `dev-verify.md` describe their inline-vs-pipeline `--agent`
      behavior in mutually consistent terms.

- [ ] AC2. (R2) — MET when: (a) running the pre-check preset in a repo **without** `plugins/sp`
      no longer reports `sp-no-vendor-refs` as "misconfigured" (the upstream fix); AND (b) this
      repo's `.spur/rules/boundary/sp-no-vendor-refs.yaml` remains present with `enabled: false`
      and a comment citing the upstream fix + this task WBS. Verify (b) with
      `spur rule run --preset recommended-pre-check` exiting 0 in this repo and the shadow file's
      `enabled: false` line intact.

- [ ] AC3. (R3) — MET when 0070's `### History` carries a dated note amending AC11 to the
      `vendors/skills|mattpocock|pocock` pattern with the `vendors/rulesync`-is-fine carve-out,
      AND `rg -n "vendors/skills|mattpocock|pocock" plugins/cc packages/` still returns nothing
      (the real boundary holds), AND the 3 `vendors/rulesync` citations still exist (proving they
      were correctly excluded, not deleted). 0070's status stays `done` (no reopen).

- [ ] AC4. (R4) — MET when 0070's `### History` carries a dated note restating AC4 as the
      suggest-strategy contract (refine classifies/surfaces the prune; rewrite is agent-applied
      via the seam), consistent with 0070's D3. Verify the note names both "suggest" and
      "two-call seam" and does not claim deterministic auto-rewrite. 0070 stays `done`.

- [ ] AC5. (R5) — MET when `spur task update <wbs> <status>` no longer emits the "lifecycle
      adapter unavailable — running `spur task check` inline" warning, AND a transition whose FSM
      guard should fail is actually blocked. Verify by attempting a guarded transition on a
      deliberately-malformed fixture task and confirming it stops (exit non-zero / status
      unchanged), not a silent pass.

- [ ] AC6. (R6) — MET when `spur task path <wbs>` supports a machine-readable mode whose stdout is
      exactly the path (or `{ "path": … }`), with no banner. Verify:
      `test "$(spur task path <wbs> --json | jq -r .path)" = "<expected absolute path>"` (or the
      `--quiet`/TTY-detection equivalent) succeeds with no post-processing.

**Global gate (this repo's portion):** `bun run check` and `bun run spur-check` pass with zero
skipped tests after R2-local/R3/R4 land. Cross-repo ACs (AC1, AC2-upstream, AC5, AC6) are verified
in their owning repo/environment and their evidence linked back here.

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

- [ ] A1 (R2-local). Upgrade `.spur/rules/boundary/sp-no-vendor-refs.yaml`'s comment: state it is
      an intentional `enabled: false` override of the global rule, cite the upstream fix and this
      task's WBS. Keep `enabled: false`. Confirm `spur rule run --preset recommended-pre-check`
      still exits 0.
- [ ] A2 (R3). Append a dated note to `docs/tasks/0070_*.md` `### History` amending AC11 to the
      `vendors/skills|mattpocock|pocock` pattern + the `vendors/rulesync`-carve-out. Optionally add
      a one-line inline clarification in the AC11 body. Do NOT change 0070's status.
- [ ] A3 (R4). Append a dated note to 0070's `### History` restating AC4 as the suggest-strategy /
      two-call-seam contract (no deterministic auto-rewrite). Optional inline AC4 clarification.
- [ ] A4. Re-run `rg -n "vendors/skills|mattpocock|pocock" plugins/cc packages/` (expect empty) and
      confirm the 3 `vendors/rulesync` citations still exist (expect present) — proves AC3.
- [ ] A5. `bun run check` + `bun run spur-check` green, zero skipped tests; `git status` shows only
      intentional changes.

**Wave B — spur-new / environment handoff (filed + fixed in spur-new; verified in its gates)**

- [ ] B1 (R1). In spur-new, edit `plugins/sp/commands/dev-verify.md` per the Cross-repo handoff
      diffs; cross-check `dev-refine.md`/`dev-run.md` wording. Verify with the AC1 grep.
- [ ] B2 (R2-upstream). In the spur-new rule catalog, apply Option A (empty-file-set → pass-with-
      note) or Option B (repo-local rule). Verify a `plugins/sp`-less repo no longer flags it.
- [ ] B3 (R5). Restore the bundled task-lifecycle workflow in the spur environment; verify a
      guard-failing transition is actually blocked (not a silent inline-check pass).
- [ ] B4 (R6). In spur-new, add `--json` to `spur task path`; verify
      `spur task path <wbs> --json | jq -r .path` yields the bare path.
- [ ] B5. Record B1–B4 completion evidence (spur-new task WBS or commit) back in this task's
      `## Solution` cross-repo table.

**Note on execution order:** Wave A is fully independent and can ship on its own. Wave B items are
each independent of one another; none blocks Wave A. If spur-new work is deferred, this task can
close its superskill portion and track Wave B as an explicit open cross-repo handoff (marked
`⚠️ PARTIAL` in `## Solution`).

### History
- 2026-07-04T15:33:49.383Z backlog → todo (system)
