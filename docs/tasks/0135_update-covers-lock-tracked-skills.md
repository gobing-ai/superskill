---
schema_version: 1
name: Update covers lock-tracked skills
status: done
template: feature-impl
created_at: 2026-09-13T18:04:14.440Z
updated_at: "2026-09-13T21:27:00.833Z"
feature_id: F8
priority: P2
tags:
  - update
  - skills
  - cli

dependencies: ["0133", "0134"]
---

## 0135. Update covers lock-tracked skills

### Background

The feature's headline: superskill update aggregates checkSkills rows next to plugin rows in the same scope, applies stale skills via updateSkills(precheck), and gains a [name] positional filter. Depends on 0133 (UpdateRow) and 0134 (checkSkills/precheck). Cohesion note: the sibling plugin-rows task also edits apps/cli/src/commands/update.ts — the split is plugin-side vs skill-side concerns; execute in dependency order to keep reviews readable (review-order coupling only, no frontmatter dependency). Rubric: E3 D2 L1 C2 R2 = 10 → decomposed (force: R=high — exit-code contract and lock writes). Implements: F8 R1–R5, R20; 04_DESIGN.md update surface (line ~81 synopsis row: [name], --json, skill coverage).

### Requirements

- [x] R1. update aggregates skill rows from the ADR-028 locks. executeUpdate resolves skill scope to mirror manifest scope: default reads the global lock (~/.agents/.skill-lock.json); --no-global reads the project lock (./skills-lock.json). Each SkillCheckRow maps to an UpdateRow with kind: 'skill'; status unchecked survives as-is (exit-neutral), unavailable carries reason, and skill rows print in a `Skills:` group after the `Plugins:` group.
- [x] R2. The [name] positional filters both kinds. superskill update <name> restricts the run to the plugin or skill with that name; a name matching neither a manifest plugin nor a locked skill is an error naming the value and the searched scopes. Plugins and skills share one namespace per scope (a collision is reported as an error, not silently deduped).
- [x] R3. Bare update applies stale skills. After the plugin apply path, executeUpdate calls updateSkills with precheck limited to stale skill rows from this run's checkSkills result (so hashes are computed once); each reinstalled skill prints its updated row, and unchecked/unavailable skill rows are not reinstalled but are listed with their reasons. A failed skill reinstall contributes to exit code 1 as plugin failures do.
- [x] R4. --check --json emits the machine envelope. When both flags are present, stdout is exactly one JSON document: { scope, check: true, rows: UpdateRow[], summary: { stale, current, unchecked, legacy, unavailable }, exitCode } and no other stdout writes occur in that mode. --json without --check exits 1 with a usage error naming --check, because the apply path writes progress to stdout (install.ts:582, install.ts:701).
- [x] R5. Scope and exit semantics stay coherent. The 0/1/2 contract is unchanged: unavailable anywhere → 2; --check with any stale → 1; otherwise 0; unchecked never contributes to 1 or 2. --marketplace and --targets keep their plugin-only meaning and are documented as such in help.
- [x] R6. Leave focused regression evidence. CLI tests use the existing outputRoot/npmLatest/homeDir/fetchFn injection seams plus fixture locks: stale skill listed without writes (R1), current skill up to date (R2), apply records the new lock hash (R3), --no-global reads the project lock (R4), name filter (R5), skill --check exit codes including unavailable→2 and unchecked→0. docs/04_DESIGN.md's update surface row gains [name], --json, and the skill coverage sentence in the same commit. bun run lint, bun run test, bun run build pass.

### Acceptance Criteria

```gherkin
Scenario: R1 — Update check reports a stale lock-tracked skill without writing
  Given the global skill lock records last30days with a hash that differs from its current source hash
  When the operator runs `superskill update --check`
  Then the output lists last30days as a stale skill, the exit code is 1, and neither the lock file nor the skill directory changes

Scenario: R2 — Update check reports a current lock-tracked skill as up to date
  Given the global skill lock records last30days with a hash equal to its current source hash and no plugin is stale
  When the operator runs `superskill update --check`
  Then the output lists last30days as up to date and the exit code is 0

Scenario: R3 — Update applies a stale lock-tracked skill and records the new hash
  Given the global skill lock records a stale last30days
  When the operator runs `superskill update`
  Then last30days is reinstalled, its lock entry hash equals the current source hash, and the output reports last30days as updated

Scenario: R4 — Project-scope update reads the project skill lock
  Given ./skills-lock.json records skill demo-skill and the global lock records last30days
  When the operator runs `superskill update --check --no-global`
  Then the output lists demo-skill and does not list last30days

Scenario: R5 — Update with a skill name checks only that skill
  Given the global skill lock records last30days and gpt-image-2-style-library, and plugin kk has a manifest
  When the operator runs `superskill update last30days --check`
  Then the output lists only last30days

Scenario: R20 — An unhashable skill source is unavailable, never current
  Given the global skill lock records last30days and its source repository cannot be fetched
  When the operator runs `superskill update --check`
  Then last30days is reported unavailable with the fetch failure reason and the exit code is 2
```

### Q&A

<!-- CLOSED decisions from refinement: what was chosen and why, what was deferred and on what
     condition. Not a parking lot for open questions — an unanswered question here means the task
     is not ready to hand off. Keep empty if none. -->

### Design

**Out of scope for this task:** anything not named in Requirements below — no speculative abstractions, no drive-by refactors (project rule).



Design D1, D4 (--json check-only), D5 ([name] positional). Aggregation happens in executeUpdate after plugin rows are built: checkSkills rows map 1:1 onto UpdateRow (name = skill name, kind = 'skill'), then the existing merge/exit aggregation runs over the union. Apply reuses this run's checkSkills output as updateSkills precheck — no second fetch. The envelope's rows serialize UpdateRow directly; exitCode mirrors the process exit code so scripts need one read.

### Plan

1. apps/cli/src/commands/update.ts: import checkSkills from @gobing-ai/superskill-core; add scope resolution mirroring manifest scope; map skill rows; [name] filter; apply via updateSkills(precheck); --check --json envelope; usage error for bare --json. 2. update.test.ts: new fixture-lock cases above. 3. docs/04_DESIGN.md update row sync. 4. bun run lint && bun run test && bun run build. The pre-batch-create quiz gate was auto-skipped under --auto; sizing recorded via rubric line in Background.

### Solution

Change-map (auto-generated — implement step did not record a Solution).
Each entry cites the first changed line per file (`file:line`).

| Change (`file:line`) |
|----------------------|
| `apps/cli/src/commands/skill.ts:433` |
| `apps/cli/src/commands/skill.ts:439` |
| `apps/cli/src/commands/update.ts:105` |
| `apps/cli/src/commands/update.ts:11` |
| `apps/cli/src/commands/update.ts:115` |
| `apps/cli/src/commands/update.ts:119` |
| `apps/cli/src/commands/update.ts:130` |
| `apps/cli/src/commands/update.ts:136` |
| `apps/cli/src/commands/update.ts:141` |
| `apps/cli/src/commands/update.ts:147` |
| `apps/cli/src/commands/update.ts:161` |
| `apps/cli/src/commands/update.ts:165` |
| `apps/cli/src/commands/update.ts:168` |
| `apps/cli/src/commands/update.ts:17` |
| `apps/cli/src/commands/update.ts:170` |
| `apps/cli/src/commands/update.ts:173` |
| `apps/cli/src/commands/update.ts:20` |
| `apps/cli/src/commands/update.ts:24` |
| `apps/cli/src/commands/update.ts:294` |
| `apps/cli/src/commands/update.ts:30` |
| `apps/cli/src/commands/update.ts:324` |
| `apps/cli/src/commands/update.ts:361` |
| `apps/cli/src/commands/update.ts:409` |
| `apps/cli/src/commands/update.ts:415` |
| `apps/cli/src/commands/update.ts:460` |
| `apps/cli/src/commands/update.ts:465` |
| `apps/cli/src/commands/update.ts:475` |
| `apps/cli/src/commands/update.ts:5` |
| `apps/cli/src/commands/update.ts:56` |
| `apps/cli/src/commands/update.ts:570` |
| `apps/cli/src/commands/update.ts:67` |
| `apps/cli/src/commands/update.ts:8` |
| `apps/cli/src/commands/update.ts:90` |
| `apps/cli/src/commands/update.ts:99` |
| `apps/cli/tests/commands/install-grok-bot.test.ts:306` |
| `apps/cli/tests/commands/install-grok-bot.test.ts:309` |
| `apps/cli/tests/commands/install-grok-bot.test.ts:312` |
| `apps/cli/tests/commands/skill-verbs.test.ts:329` |
| `apps/cli/tests/commands/skill-verbs.test.ts:6` |
| `apps/cli/tests/commands/update.test.ts:1` |
| `apps/cli/tests/commands/update.test.ts:113` |
| `apps/cli/tests/commands/update.test.ts:120` |
| `apps/cli/tests/commands/update.test.ts:124` |
| `apps/cli/tests/commands/update.test.ts:145` |
| `apps/cli/tests/commands/update.test.ts:16` |
| `apps/cli/tests/commands/update.test.ts:20` |
| `apps/cli/tests/commands/update.test.ts:218` |
| `apps/cli/tests/commands/update.test.ts:22` |
| `apps/cli/tests/commands/update.test.ts:220` |
| `apps/cli/tests/commands/update.test.ts:34` |
| `apps/cli/tests/commands/update.test.ts:41` |
| `apps/cli/tests/commands/update.test.ts:463` |
| `apps/cli/tests/commands/update.test.ts:47` |
| `apps/cli/tests/commands/update.test.ts:477` |
| `apps/cli/tests/commands/update.test.ts:6` |
| `apps/cli/tests/commands/update.test.ts:759` |
| `packages/core/src/skills-ecosystem/operations.ts:579` |
| `packages/core/src/skills-ecosystem/operations.ts:586` |
| `packages/core/src/skills-ecosystem/operations.ts:641` |
| `packages/core/src/skills-ecosystem/operations.ts:646` |
| `packages/core/src/skills-ecosystem/operations.ts:659` |
| `packages/core/src/skills-ecosystem/operations.ts:669` |
| `packages/core/src/skills-ecosystem/operations.ts:671` |
| `packages/core/src/skills-ecosystem/operations.ts:686` |
| `packages/core/src/skills-ecosystem/operations.ts:712` |
| `packages/core/src/skills-ecosystem/operations.ts:723` |
| `packages/core/src/skills-ecosystem/operations.ts:733` |
| `packages/core/src/skills-ecosystem/operations.ts:740` |
| `packages/core/src/skills-ecosystem/operations.ts:744` |
| `packages/core/src/skills-ecosystem/operations.ts:746` |
| `packages/core/src/skills-ecosystem/operations.ts:748` |
| `packages/core/tests/skills-ecosystem/operations.test.ts:833` |

### Testing

**Pipeline verify results**

- Verdict: PASS (from verdict artifact)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| R1 | MET | update.ts:293-310 (skill rows after plugin rows from scope lock), :330-336 (toSkillUpdateRow kind:'skill', reason carried), :340-355 (Skills: group); tests update.test.ts:781,810 |
| R2 | MET | update.ts:174-199 (both-kinds filter, collision :184-189, neither-match :190-196); tests update.test.ts:928,970,218-229,463-479 (unknown → exit 1) |
| R3 | MET | update.ts:364-388 (stale-only apply via precheck from this run's checkSkills; failed/unavailable → exit 1 :384,:388); tests update.test.ts:836-869 + operations.test.ts:752-830 |
| R4 | MET | update.ts:144-146 (bare --json rejects), :316-321 + :359-381 (envelope {scope,check,rows,summary,exitCode}); test update.test.ts:897-926 (entire stdout JSON.parses = exactly one doc) |
| R5 | MET | update.ts:316 + core operations/update.ts:178-186 (unavailable→2, stale→1, else 0, unchecked neutral); plugins-only flags update.ts:96-100 + 04_DESIGN.md:105; tests update.test.ts:983,781 + skill-verbs.test.ts:319-355 |
| R6 | MET | update.test.ts:781,810,836,871,928 + skill-verbs.test.ts:319-355; 0134 carried fixes in (UpdatedSkillStatus :580-596, failed-only aggregation :759-771, renderer skill.ts:433-444); docs/04_DESIGN.md:81,101-105,108,111-113 synced; gate 2341/0 + build exit 0 with digest match |

| Acceptance Criteria | Status | Evidence Type | Evidence |
|---------------------|--------|---------------|----------|
| R1 — Update check reports a stale lock-tracked skill without writing | MET | test | update.test.ts:781-809 — exit 1, Skills: + stale line, lock + SKILL.md byte-identical |
| R2 — Update check reports a current lock-tracked skill as up to date | MET | test | update.test.ts:810-834 — exit 0, up to date, Plugins: before Skills: |
| R3 — Update applies a stale lock-tracked skill and records the new hash | MET | test | update.test.ts:836-869 — exit 0, updated, follow-up checkSkills = current |
| R4 — Project-scope update reads the project skill lock | MET | test | update.test.ts:871-895 — --no-global reads ./skills-lock.json, exit 0 |
| R5 — Update with a skill name checks only that skill | MET | test | update.test.ts:928-968 — only the named skill listed; plugin name → no Skills: group |
| R20 — An unhashable skill source is unavailable, never current | MET | test | update.test.ts:983-1013 — fetch failure → unavailable line, exit 2 |
- Coverage: N/A (verdict-based; verify pipeline does not measure code coverage)

### Review

<!-- spur:record-review -->

**SECU findings** (pipeline verify step — verdict: PASS)

| Priority | Dimension | Location | Finding |
|----------|-----------|----------|----------|
| P4 | spur task check | — | task check passed |
| P4 | evidence-rule-pass | — | All behavior-bearing AC rows have executable evidence or are explicitly non-behavioral. |
| P4 | proof-input-digest | — | sha256:970e39dd150f5efd61bf36c45109a93ff23fbc082369548e6270d976cb5459fa |
| P4 | proof-input-digest | — | sha256:970e39dd150f5efd61bf36c45109a93ff23fbc082369548e6270d976cb5459fa |

### References

<!-- Links to the parent feature, design docs, related tasks, or external references. -->

### History

- 2026-09-13T20:27:47.477Z todo → wip (system)
- 2026-09-13T21:26:59.652Z wip → testing (system)
- 2026-09-13T21:27:00.833Z testing → done (system)

