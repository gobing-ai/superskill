---
schema_version: 1
name: Skill update check and honest summary
status: done
template: feature-impl
created_at: 2026-09-13T18:04:14.439Z
updated_at: "2026-09-13T20:27:19.785Z"
feature_id: F8
priority: P2
tags:
  - skills
  - update
  - core

---

## 0134. Skill update check and honest summary

### Background

Core seam for everything skill-related in F8. Today updateSkills (packages/core/src/skills-ecosystem/operations.ts:596) embeds a hash pre-check whose failures silently mean 'no update'; computeSourceSkillHash (operations.ts:700) returns undefined for both unsupported source types (git/gitlab/well-known) and real errors — indistinguishable. This task extracts checkSkills, makes the three outcomes explicit, and fixes the skill update CLI header lie (apps/cli/src/commands/skill.ts:378). Rubric: E3 D2 L2 C2 R2 = 11 → decomposed (force: R=high — touching the lock/SSOT hash path, errors silently change update semantics). Implements: F8 R6, R7, R18; the core half of R1, R2, R20 (checkSkills + hash outcome, consumed by task 0135). Existing injection seams: UpdateSkillsOptions already carries cwd/homeDir/fetchFn/cloneRepoFn (operations.ts:568-575 — cloneRepoFn is the last entry); skill-verbs.test.ts already drives handleSkillUpdate with those seams.

### Requirements

- [x] R1. Export a read-only skill check operation from packages/core/src/skills-ecosystem/operations.ts. checkSkills(names?: string[], options?: UpdateSkillsOptions): Promise<CheckSkillsResult> where CheckSkillsResult { success: boolean; rows: SkillCheckRow[]; error?: string } and SkillCheckRow { name: string; source: string; sourceType: ParsedSource['type']; status: 'stale' | 'current' | 'unchecked' | 'unavailable'; installedHash: string; upstreamHash?: string; reason?: string }. It reads the same lock/scope resolution updateSkills uses (global ~/.agents/.skill-lock.json by default; ./skills-lock.json when global:false — the caller owns the ADR-035 scope mapping), names undefined means every skill in that lock, an unknown name yields success:false with an error naming it, and it performs no writes to locks, skill directories, or caches.
- [x] R2. Make the source-hash outcome three-way. computeSourceSkillHash gains a distinct-outcome wrapper (or returns a tagged result): { hash } for a computed upstream hash, { unsupported: type } for source types with no read-only hash (git, gitlab, well-known), and { error: reason } for fetch/clone/parse failures. checkSkills maps these to stale (hashes differ), current (equal), unchecked (unsupported, reason names the source type), unavailable (error, reason carries the failure). A skill whose upstream cannot be hashed is never reported current.
- [x] R3. updateSkills reuses the pre-check. updateSkills gains precheck?: readonly SkillCheckRow[]; when provided it skips its own hash recomputation for covered names and never reclassifies an unchecked/unavailable row as up to date — such rows are reported as not updated with their reason. Without precheck, updateSkills behaves exactly as today (existing skill-verbs and operations tests pass unmodified).
- [x] R4. skill update --check is read-only. apps/cli/src/commands/skill.ts handleSkillUpdate gains check?: boolean: in check mode it calls checkSkills only, prints the same per-skill lines the update path would print for stale/current plus `unchecked: <reason>` / `unavailable: <reason>` rows, sets exit code 1 when any row is stale (0 otherwise; 2 on unavailable per the ADR-035 contract), and writes nothing. --check with --json emits { rows, summary } shaped consistently with the text output.
- [x] R5. The skill update header counts only changed skills. The text header becomes `Updated <u> skill(s), <c> up to date:` where u counts reinstalled skills and c counts skills verified current; unchecked/unavailable rows are listed with their reasons and counted in neither bucket. The current lie — header `Updated 2 skill(s)` when nothing changed — is removed.
- [x] R6. The -y/--yes help shows its default once. On skill add/remove/update, the option help is 'Non-interactive auto-confirm' with the default rendered exactly once by Commander (remove the hand-appended '(default: true)' from the description string).
- [x] R7. Leave focused regression evidence. New core tests cover checkSkills across local-source skills (stale/current), an unsupported source type (unchecked), and a fetch failure (unavailable) using the existing fetchFn/cloneRepoFn/homeDir seams; skill-verbs tests cover --check read-only behavior and exit codes, the new header, and the help text. bun run lint, bun run test, bun run build pass. docs/04_DESIGN.md's skill verb row gains --check in the same commit.

### Acceptance Criteria

```gherkin
Scenario: R6 — Skill update check reports staleness without writing
  Given the project skill lock records a stale demo-skill
  When the operator runs `superskill skill update --check`
  Then the output lists demo-skill as stale, the exit code is 1, and the lock file is unchanged

Scenario: R7 — Skill update summary counts only skills that changed
  Given the project skill lock records two skills whose hashes equal their source hashes
  When the operator runs `superskill skill update`
  Then the output reports 0 skills updated and 2 up to date, and never reports "Updated 2 skill(s)"

Scenario: R18 — Skill update help shows the --yes default once
  When the operator runs `superskill skill update --help`
  Then the `-y, --yes` line contains `(default: true)` exactly once

Scenario: R20 — An unhashable skill source is unavailable, never current (core half)
  Given the global skill lock records last30days and its source repository cannot be fetched
  When checkSkills runs against that lock
  Then its row status is unavailable with the fetch failure reason, and updateSkills with that precheck does not report it as up to date

Scenario: R1 — checkSkills is read-only and scoped (core half of update coverage)
  Given a lock recording one stale and one current local-source skill
  When checkSkills() runs with no names
  Then both rows carry correct statuses and hashes, and neither the lock file nor any skill directory changed
```

### Q&A

<!-- CLOSED decisions from refinement: what was chosen and why, what was deferred and on what
     condition. Not a parking lot for open questions — an unanswered question here means the task
     is not ready to hand off. Keep empty if none. -->

### Design

**Out of scope for this task:** anything not named in Requirements below — no speculative abstractions, no drive-by refactors (project rule).



Design D1 (locks stay SSOT, read via checkSkills) and D2 (unchecked is exit-neutral; unsupported types never exit 2). The hash seam is a pure extraction of the pre-check already inside updateSkills: same lock reads, same computeSourceSkillHash, same EXCLUDE sets — only the outcome encoding changes (undefined splits into unsupported vs error). updateSkills(precheck) is additive; the default path is untouched. CLI scope: skill update keeps its project default (D6); check mode reuses the command's existing global/cwd/homeDir resolution.

### Plan

1. operations.ts: tag the computeSourceSkillHash outcome; implement checkSkills on the updateSkills lock-resolution path; add precheck to updateSkills. 2. skill.ts: --check flag on the update verb, check-mode branch in handleSkillUpdate, header rewrite, -y help string fix on add/remove/update. 3. Tests: core checkSkills suite + skill-verbs additions. 4. docs/04_DESIGN.md skill row: --check. 5. bun run lint && bun run test && bun run build. The pre-batch-create quiz gate was auto-skipped under --auto; sizing recorded via rubric line in Background.

### Solution

Change-map (auto-generated — implement step did not record a Solution).
Each entry cites the first changed line per file (`file:line`).

| Change (`file:line`) |
|----------------------|
| `apps/cli/src/commands/skill.ts:1` |
| `apps/cli/src/commands/skill.ts:366` |
| `apps/cli/src/commands/skill.ts:395` |
| `apps/cli/src/commands/skill.ts:398` |
| `apps/cli/src/commands/skill.ts:433` |
| `apps/cli/src/commands/skill.ts:455` |
| `apps/cli/src/commands/skill.ts:471` |
| `apps/cli/src/commands/skill.ts:478` |
| `apps/cli/src/commands/skill.ts:480` |
| `apps/cli/tests/commands/skill-verbs.test.ts:2` |
| `apps/cli/tests/commands/skill-verbs.test.ts:254` |
| `apps/cli/tests/commands/skill-verbs.test.ts:7` |
| `packages/core/src/skills-ecosystem/operations.ts:575` |
| `packages/core/src/skills-ecosystem/operations.ts:595` |
| `packages/core/src/skills-ecosystem/operations.ts:647` |
| `packages/core/src/skills-ecosystem/operations.ts:676` |
| `packages/core/src/skills-ecosystem/operations.ts:681` |
| `packages/core/src/skills-ecosystem/operations.ts:739` |
| `packages/core/src/skills-ecosystem/operations.ts:835` |
| `packages/core/src/skills-ecosystem/operations.ts:844` |
| `packages/core/src/skills-ecosystem/operations.ts:852` |
| `packages/core/src/skills-ecosystem/operations.ts:856` |
| `packages/core/src/skills-ecosystem/operations.ts:867` |
| `packages/core/src/skills-ecosystem/operations.ts:871` |
| `packages/core/src/skills-ecosystem/operations.ts:874` |
| `packages/core/src/skills-ecosystem/operations.ts:883` |
| `packages/core/tests/skills-ecosystem/operations.test.ts:629` |
| `packages/core/tests/skills-ecosystem/operations.test.ts:9` |

### Testing

**Pipeline verify results**

- Verdict: PASS (from verdict artifact)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| R1 | MET | packages/core/src/skills-ecosystem/operations.ts:747 (export, signature), :596-611 (SkillCheckRow/CheckSkillsResult), :748-763 (same lock/scope resolution, names→all lock keys), :769-777 + :812-819 (unknown name → success:false naming it); no writes proven by byte-identical lock/canonical in operations.test.ts:654-664 |
| R2 | MET | operations.ts:831 (three-way outcome union), :866-869 (git/gitlab/well-known → unsupported), :797-810 (stale/current/unchecked/unavailable mapping); never-current structural guarantee + tests operations.test.ts:685-750 |
| R3 | MET | operations.ts:576 (precheck option), :647-669 (non-stale rows skip recompute, unchecked/unavailable never reclassified); operations.test.ts:752-838 (drift-marker no-op, stale reinstall, unchecked/unavailable preserved, lock unchanged); 2330 pass / 0 fail .spur/run/0134-test-gate.log |
| R4 | MET | apps/cli/src/commands/skill.ts:480 (--check flag), :398-417 (exit 1 stale / 0 else / 2 unavailable), :366-373 (unchecked/unavailable lines), :404 (--json {rows, summary}); read-only + exit-code tests skill-verbs.test.ts:256-327 |
| R5 | MET | skill.ts:434-436 (header counts only updated / 'Already up to date'); skill-verbs.test.ts:329-353 asserts Updated 0 skill(s), 2 up to date: and not.toContain('Updated 2 skill(s)') |
| R6 | MET | skill.ts:455,471,478 ('Non-interactive auto-confirm' + Commander default true, no hand-appended (default: true)); skill-verbs.test.ts:355-371 exactly one (default: true) per add/remove/update help line |
| R7 | MET | operations.test.ts:630-838 + skill-verbs.test.ts:255-371; docs/04_DESIGN.md:178,:120 same commit; .spur/run/0134-test-gate.log (lint+typecheck+2330/0+pre/post rules, digest match) and .spur/run/0134-build.log (exit 0) |

| Acceptance Criteria | Status | Evidence Type | Evidence |
|---------------------|--------|---------------|----------|
| R6 — Skill update check reports staleness without writing | MET | test | apps/cli/tests/commands/skill-verbs.test.ts:256-278 (stale listed, exit 1, lock + canonical byte-identical); project-lock half operations.test.ts:631-664 |
| R7 — Skill update summary counts only skills that changed | MET | test | apps/cli/tests/commands/skill-verbs.test.ts:329-353 |
| R18 — Skill update help shows the --yes default once | MET | test | apps/cli/tests/commands/skill-verbs.test.ts:355-371 (regex match count 1 per verb) |
| R20 — An unhashable skill source is unavailable, never current (core half) | MET | test | packages/core/tests/skills-ecosystem/operations.test.ts:725-750 (failing fetchFn → unavailable, success:false) + :788-830 (precheck consumption, lock byte-identical) |
| R1 — checkSkills is read-only and scoped (core half of update coverage) | MET | test | packages/core/tests/skills-ecosystem/operations.test.ts:631-664 (statuses/hashes asserted, lock + skill dir byte-identical) |
- Coverage: N/A (verdict-based; verify pipeline does not measure code coverage)

### Review

<!-- spur:record-review -->

**SECU findings** (pipeline verify step — verdict: PASS)

| Priority | Dimension | Location | Finding |
|----------|-----------|----------|----------|
| P4 | spur task check | — | task check passed |
| P4 | evidence-rule-pass | — | All behavior-bearing AC rows have executable evidence or are explicitly non-behavioral. |
| P4 | proof-input-digest | — | sha256:9e50ba95283629e696f05898fc44c84e5436b22a737437209c19603a35925b85 |

### References

<!-- Links to the parent feature, design docs, related tasks, or external references. -->

### History

- 2026-09-13T19:47:10.066Z todo → wip (system)
- 2026-09-13T20:27:18.694Z wip → testing (system)
- 2026-09-13T20:27:19.785Z testing → done (system)

