---
schema_version: 1
name: Skill update check and honest summary
status: todo
template: feature-impl
created_at: 2026-09-13T18:04:14.439Z
updated_at: "2026-09-13T18:41:48.249Z"
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

- [ ] R1. Export a read-only skill check operation from packages/core/src/skills-ecosystem/operations.ts. checkSkills(names?: string[], options?: UpdateSkillsOptions): Promise<CheckSkillsResult> where CheckSkillsResult { success: boolean; rows: SkillCheckRow[]; error?: string } and SkillCheckRow { name: string; source: string; sourceType: ParsedSource['type']; status: 'stale' | 'current' | 'unchecked' | 'unavailable'; installedHash: string; upstreamHash?: string; reason?: string }. It reads the same lock/scope resolution updateSkills uses (global ~/.agents/.skill-lock.json by default; ./skills-lock.json when global:false — the caller owns the ADR-035 scope mapping), names undefined means every skill in that lock, an unknown name yields success:false with an error naming it, and it performs no writes to locks, skill directories, or caches.
- [ ] R2. Make the source-hash outcome three-way. computeSourceSkillHash gains a distinct-outcome wrapper (or returns a tagged result): { hash } for a computed upstream hash, { unsupported: type } for source types with no read-only hash (git, gitlab, well-known), and { error: reason } for fetch/clone/parse failures. checkSkills maps these to stale (hashes differ), current (equal), unchecked (unsupported, reason names the source type), unavailable (error, reason carries the failure). A skill whose upstream cannot be hashed is never reported current.
- [ ] R3. updateSkills reuses the pre-check. updateSkills gains precheck?: readonly SkillCheckRow[]; when provided it skips its own hash recomputation for covered names and never reclassifies an unchecked/unavailable row as up to date — such rows are reported as not updated with their reason. Without precheck, updateSkills behaves exactly as today (existing skill-verbs and operations tests pass unmodified).
- [ ] R4. skill update --check is read-only. apps/cli/src/commands/skill.ts handleSkillUpdate gains check?: boolean: in check mode it calls checkSkills only, prints the same per-skill lines the update path would print for stale/current plus `unchecked: <reason>` / `unavailable: <reason>` rows, sets exit code 1 when any row is stale (0 otherwise; 2 on unavailable per the ADR-035 contract), and writes nothing. --check with --json emits { rows, summary } shaped consistently with the text output.
- [ ] R5. The skill update header counts only changed skills. The text header becomes `Updated <u> skill(s), <c> up to date:` where u counts reinstalled skills and c counts skills verified current; unchecked/unavailable rows are listed with their reasons and counted in neither bucket. The current lie — header `Updated 2 skill(s)` when nothing changed — is removed.
- [ ] R6. The -y/--yes help shows its default once. On skill add/remove/update, the option help is 'Non-interactive auto-confirm' with the default rendered exactly once by Commander (remove the hand-appended '(default: true)' from the description string).
- [ ] R7. Leave focused regression evidence. New core tests cover checkSkills across local-source skills (stale/current), an unsupported source type (unchecked), and a fetch failure (unavailable) using the existing fetchFn/cloneRepoFn/homeDir seams; skill-verbs tests cover --check read-only behavior and exit codes, the new header, and the help text. bun run lint, bun run test, bun run build pass. docs/04_DESIGN.md's skill verb row gains --check in the same commit.

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

<!-- Filled during implementation: file:line change map and concise rationale. -->

### Testing

<!-- Filled during verification: commands run, outcomes, coverage claim or N/A. -->

### Review

<!-- Filled during review: P1-P4 findings, residual risk, and final disposition. -->

### References

<!-- Links to the parent feature, design docs, related tasks, or external references. -->

### History
