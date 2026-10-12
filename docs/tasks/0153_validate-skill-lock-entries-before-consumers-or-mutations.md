---
schema_version: 1
name: Validate skill lock entries before consumers or mutations
status: done
template: issue
created_at: 2026-10-12T16:36:53.942Z
updated_at: "2026-10-12T23:38:48.057Z"
feature_id: F2

ac_altitude: task-local
ac_numbering: task-local
priority: P2
estimate_hours: 3
done_forced: "false"
done_reason: unforced close; PASS artifact at .spur/memory/evidence/0153-verdict.json
---

## 0153. Validate skill lock entries before consumers or mutations

### Background

Review confirmed malformed per-skill lock entries bypass read validation and crash consumers. A temporary skills-lock.json containing {"version":1,"skills":{"bad":"invalid-entry"}} produced no readLocalLock warning, then checkSkills threw at the in operator. Evidence: packages/core/src/skills-ecosystem/locks.ts:456 and packages/core/src/skills-ecosystem/operations.ts:794. Global read uses the same unchecked record conversion at packages/core/src/skills-ecosystem/locks.ts:650; global crash parity remains to be verified with the planned fixture. Direct triage fixes already resolved malformed Stop parts and stale builder guidance; no lock changes have been applied.

**Refine corrections (2026-10-12)**
- Global sourceUrl required → supported vendor fixture at locks.test.ts:407 and 04_DESIGN.md:417 omit it; freeze runtime-optional sourceUrl in both schemas while validating non-undefined values.
- Reader-only validation assumed enough to prevent all lock writes → raw writer guard at locks.ts:235 has independent outer-only checks and both raw writers overwrote malformed-entry locks in this refine; include input and on-disk entry validation using the same helper.
- Global crash parity left as a hypothesis → reproduced global v3 primitive entry with isolated XDG_STATE_HOME; both schemas return no warning and checkSkills throws at operations.ts:794.
- File targets omitted authoritative validation wording → 04_DESIGN.md:417 currently says no runtime validation; include its same-change sync and limit update JSON AC to the unnamed command's existing contract.

### Requirements

- [x] R1. Validate supported local v1 and global v3 entries before returning typed skills. Both require a non-null non-array object with string source and sourceType; local requires string computedHash, global requires string skillFolderHash, installedAt and updatedAt. sourceUrl is optional in both runtime schemas, including global vendor fixtures. Validate optional ref/skillPath/sourceUrl as strings, local subagents as a string array and global pluginName as a string when non-undefined. Accept empty strings and unknown sourceType strings; preserve unknown entry fields and own special-name keys. Do not validate timestamp/hash formats.
- [x] R2. Reject any invalid supported-version entry as a corrupt whole lock using existing warning-bearing empty-state readers. Reuse the same entry validation in writeLocalLock/writeGlobalLock for caller input and in assertOnDiskVersionMatches for existing disk content; neither invalid input nor invalid disk entries may be written over. Preserve bytes and existing ENOENT, read-error and version-mismatch behavior. Existing add/remove/update must refuse before changing installed files or lock bytes.
- [x] R3. Add real filesystem regressions for both schemas, raw writers, mutation operations and unnamed update --check --json. Demonstrate structured checkSkills failure without throwing and exit-2 update JSON output. Keep vendor fixtures without sourceUrl and special-key interop passing; synchronize validation and compatibility wording in docs/04_DESIGN.md.

### Acceptance Criteria

```gherkin
Scenario: AC1 — Invalid entry values are rejected while vendor shapes remain valid (req: R1)
Given supported local and global locks with a primitive, null, array, missing required field or non-string source alongside a valid entry
When readers run
Then they return a corruption warning and empty skills without changing bytes
And valid global entries without sourceUrl, empty-string fields, unknown entry fields and own special-name keys remain accepted

Scenario: AC2 — Corruption cannot bypass raw writer or mutation guards (req: R2)
Given invalid caller entries or an on-disk supported lock with malformed entries and an installed-skill sentinel
When writeLocalLock/writeGlobalLock or add/remove/update runs
Then it refuses before changing lock bytes or installed files
And absent locks initialize normally, invalid JSON/read errors refuse, and unsupported versions retain their existing preservation behavior

Scenario: AC3 — Consumers return structured failures (req: R3)
Given isolated malformed local and global locks
When checkSkills and unnamed update --check --json run against the real lock readers
Then checkSkills returns success false with an empty rows array rather than throwing
And update emits one existing JSON envelope with exitCode 2 and preserves all lock and installed-file bytes
And focused valid-interop tests pass and docs/04_DESIGN.md reflects runtime validation with optional sourceUrl
```

### Q&A

<!-- Clarifications and triage decisions. Keep empty if none. -->

#### Q&A entry — 2026-10-12T16:39:53.074Z

All decisions closed under --auto: preserve existing APIs and dependencies; reject invalid identities or lock entry shapes at the owning boundary. No upstream dependencies or dependent tasks. Reproduction and file scope are frozen in Background and Design. Larger shared-write fixes remain in this task; direct fixes to Stop parsing and builder diagnostics are already complete.

#### Q&A entry — 2026-10-12T16:47:19.003Z

Ready audit 2026-10-12: corrections accepted under --auto. Preserve runtime-optional global sourceUrl; validate reader, caller input and on-disk writer boundaries using one private helper; unnamed update JSON only. No open design questions or task dependencies. Existing priority/estimate remain unchanged; task already todo, so no status promotion. No implementation requested.

### Design

No new public API, schema version or dependency. Add one private lockEntriesError(skills: unknown, kind: 'local' | 'global'): string | null in locks.ts that validates an own-key entry dictionary and returns the first invalid key/field reason; no field filtering or coercion. Freeze runtime field rules to Requirements R1, based on current entry interfaces plus the existing supported vendor omission of global sourceUrl. Optional undefined is accepted for caller-constructed TypeScript entries; unknown entry fields are preserved. Apply it after existing version mismatch handling in readLocalLock/readGlobalLock; use corruptLocalLock/corruptGlobalLock for invalid supported entries and keep null-prototype skills records. Invoke the same helper from raw writers on input and from assertOnDiskVersionMatches after the on-disk version check, before writeLockAtomically. Reader-only validation is insufficient: raw writers accept fresh caller-constructed locks independently of reads. Existing mutation operations already check warning, including an authoritative add re-read under the mutation guard; do not change that protocol or add per-consumer catches. Existing checkSkills returns success:false/rows:[] on warning; unnamed executeUpdate emits the existing JSON envelope with exitCode:2. Named update lookup semantics are out of scope. Primary files: packages/core/src/skills-ecosystem/locks.ts and its locks.test.ts; operation refusal tests in packages/core/tests/skills-ecosystem/operations.test.ts; JSON integration in apps/cli/tests/commands/update.test.ts; docs/04_DESIGN.md for validation wording. Do not change GlobalSkillLockEntry.sourceUrl's published type in this task; runtime vendor compatibility is explicitly tested independently of that stricter interface. No task dependencies or concurrent implementation ownership: only main worktree, no wip tasks. Out of scope: source grammar, remote hashing, mutation-guard changes, lock auto-repair, hash/date formats, top-level optional metadata validation, and named update behavior.

### Plan

- [x] R1: Add lockEntriesError with the frozen local/global fields, optional sourceUrl/undefined compatibility, own-key traversal and first-invalid-field diagnostics.
- [x] R1/R2: Integrate supported-version readers, writer input validation and the existing on-disk writer guard; preserve current version mismatch ordering and corruption return/throw contracts.
- [x] R1/R3: Add local/global malformed-entry matrices and valid vendor/special-key fixtures, including sourceUrl omission, empty strings and unknown entry fields. Assert original disk bytes remain identical on every invalid read/write.
- [x] R2/R3: Test add/remove/update refusal with isolated installed-skill sentinels and valid local acquisition input; test raw writes of valid fresh objects over corrupt entry dictionaries and invalid caller input over absent/valid disk state.
- [x] R3: Exercise checkSkills and unnamed executeUpdate --check --json using real locks and no mocks of lock readers or skills checking; stub only unrelated external plugin discovery. Verify structured failure, exit 2 and byte preservation.
- [x] R3: Sync docs/04_DESIGN.md and any directly obsolete compatibility test comment, then run focused lock/operation/update tests, bun run spur-check and bun run build.

### Root Cause

toOwnKeyRecord casts untrusted values to entry types. Both readers validate the outer dictionary but not entries. checkSkills then assumes sourceInfo is an object at operations.ts:794. Separately, assertOnDiskVersionMatches validates only outer shape/version, so raw writeLocalLock/writeGlobalLock can replace a supported malformed-entry lock when supplied a fresh valid object. Both schema consumer crashes and both raw-writer overwrites were reproduced in isolated temp paths during this refine.

### Solution

One private `lockEntriesError(skills, kind)` validates an own-key entry dictionary, and every reader/writer boundary reuses it; no public API, schema version or dependency changed.

| File:line | Change |
| --- | --- |
| `packages/core/src/skills-ecosystem/locks.ts:475` | `GLOBAL_REQUIRED_FIELDS` — the global required-string field list, in diagnostic order |
| `packages/core/src/skills-ecosystem/locks.ts:491` | `function lockEntriesError(skills: unknown, kind: 'local' \| 'global'): string \| null` — returns the first invalid key/field reason; frozen R1 rules (non-null non-array object, required strings, optional strings, local `subagents` string array, runtime-optional `sourceUrl` in both kinds) |
| `packages/core/src/skills-ecosystem/locks.ts:280` | `assertOnDiskVersionMatches`: after the on-disk version check, an on-disk supported lock with malformed entries is refused before `writeLockAtomically` |
| `packages/core/src/skills-ecosystem/locks.ts:581` | `readLocalLock`: after the version-mismatch branches, malformed v1 entries return `corruptLocalLock` (warning + empty null-prototype skills) |
| `packages/core/src/skills-ecosystem/locks.ts:613` | `writeLocalLock`: caller-constructed input is validated before any bytes are touched |
| `packages/core/src/skills-ecosystem/locks.ts:740` | `readGlobalLock`: same supported-version entry validation, returning `corruptGlobalLock` (global parity) |
| `packages/core/src/skills-ecosystem/locks.ts:779` | `writeGlobalLock`: caller-constructed input is validated before any bytes are touched |
| `packages/core/tests/skills-ecosystem/locks.test.ts:713` | new describe `locks.ts - entry validation before consumers or mutations (R1/R2)`: local/global malformed-entry matrices plus writer and mutation refusals; every invalid read and write asserts identical on-disk bytes |
| `packages/core/tests/skills-ecosystem/locks.test.ts:783` | valid-interop case: empty strings, unknown `sourceType`, unknown entry field, `__proto__`/`constructor` own keys accepted and round-tripped without field filtering |
| `packages/core/tests/skills-ecosystem/operations.test.ts:756` | `checkSkills` returns `success:false` with `rows: []` (no throw) for an isolated malformed local lock |
| `packages/core/tests/skills-ecosystem/operations.test.ts:772` | the same structured failure for an isolated malformed global lock |
| `packages/core/tests/skills-ecosystem/operations.test.ts:789` | `addSkills`/`removeSkills`/`updateSkills` refuse a malformed-entry lock without touching the lock bytes or the installed-skill sentinel |
| `apps/cli/tests/commands/update.test.ts:1501` | unnamed `executeUpdate --check --json` emits one exit-2 JSON envelope for a malformed lock entry and preserves lock and installed-file bytes |
| `docs/04_DESIGN.md:415` | local lock entry contract restated as required/optional string shapes |
| `docs/04_DESIGN.md:417` | global entry contract plus the runtime entry-validation wording, with `sourceUrl` runtime-optional in both kinds while published `GlobalSkillLockEntry.sourceUrl` stays required |

Unchanged by design: the published `GlobalSkillLockEntry.sourceUrl` type, `corruptLocalLock`/`corruptGlobalLock`, the null-prototype skills records, the newer/older version-mismatch ordering, and the existing mutation protocol (warning check plus the authoritative add re-read). `checkSkills` and unnamed `executeUpdate` are unmodified — they already carried the warning branches this change now feeds, so no per-consumer catch was added.

### Testing

**Pipeline verify results**

- Verdict: PASS (from verdict artifact)
- Confidence: HIGH

| Requirement | Status | Evidence |
|-------------|--------|----------|
| R1 | MET | `packages/core/src/skills-ecosystem/locks.ts:491` lockEntriesError enforces the frozen local/global required strings, optional strings, local subagents string array, runtime-optional sourceUrl, no coercion; applied after version handling in the local reader at `packages/core/src/skills-ecosystem/locks.ts:581` and global reader at `packages/core/src/skills-ecosystem/locks.ts:740`. Valid-interop test at `packages/core/tests/skills-ecosystem/locks.test.ts:783` passes. |
| R2 | MET | Writer input validation at `packages/core/src/skills-ecosystem/locks.ts:613` and `packages/core/src/skills-ecosystem/locks.ts:779`; on-disk guard at `packages/core/src/skills-ecosystem/locks.ts:280`. Fresh probe this run: writeLocalLock with a valid fresh object over an on-disk v1 lock holding a primitive entry was refused and shasum unchanged. Mutation refusal test at `packages/core/tests/skills-ecosystem/operations.test.ts:789` passes. |
| R3 | MET | Matrices at `packages/core/tests/skills-ecosystem/locks.test.ts:713`, consumer tests at `packages/core/tests/skills-ecosystem/operations.test.ts:756` and `packages/core/tests/skills-ecosystem/operations.test.ts:772`, update JSON at `apps/cli/tests/commands/update.test.ts:1501`; doc at `docs/04_DESIGN.md:417`. Fresh gate this run (receipt @superskill `.spur/run/verifyall-20261012/status` line 1): lint+typecheck exit 0; bun test 2585 pass / 0 fail, 99.61% funcs / 98.89% lines; build exit 0; spur-check 39 pre-check + 3 post-check rules pass. |

| Acceptance Criteria | Status | Evidence Type | Evidence |
|---------------------|--------|---------------|----------|
| AC1 — Invalid entry values are rejected while vendor shapes remain valid (req: R1) | MET | test | `packages/core/tests/skills-ecosystem/locks.test.ts:713` local/global malformed matrices assert warning, empty skills and identical bytes; `packages/core/tests/skills-ecosystem/locks.test.ts:783` accepts empty strings, unknown sourceType/fields and own special-name keys; executed in the fresh suite. |
| AC2 — Corruption cannot bypass raw writer or mutation guards (req: R2) | MET | test | `packages/core/tests/skills-ecosystem/operations.test.ts:789` add/remove/update refuse with lock and installed sentinel bytes intact; fresh raw-writer probe refused over a malformed on-disk v1 lock with bytes unchanged. |
| AC3 — Consumers return structured failures (req: R3) | MET | command | Fresh probe with real readers: checkSkills on an isolated local v1 lock with a string entry and an isolated global v3 lock (XDG_STATE_HOME) with a numeric entry both returned success false with rows [] and no throw; both files byte-identical after. Update JSON exit 2 at `apps/cli/tests/commands/update.test.ts:1501` passes in the fresh suite. |
- Coverage: N/A (verdict-based; verify pipeline does not measure code coverage)

### Review

<!-- spur:record-review -->

**SECU findings** (pipeline verify step — verdict: PASS)

| Priority | Dimension | Location | Finding |
|----------|-----------|----------|----------|
| P4 | — | — | No findings (verify verdict PASS) |

### References

- packages/core/src/skills-ecosystem/locks.ts:456 — unchecked record conversion.
- packages/core/src/skills-ecosystem/locks.ts:235 — raw on-disk writer guard requires entry validation too.
- packages/core/src/skills-ecosystem/locks.ts:538 — local raw writer.
- packages/core/src/skills-ecosystem/locks.ts:690 — global raw writer.
- packages/core/src/skills-ecosystem/operations.ts:794 — crashing checkSkills assumption.
- packages/core/tests/skills-ecosystem/locks.test.ts:407 — supported global vendor sourceUrl omission.
- docs/04_DESIGN.md:417 — runtime omission contract and stale no-runtime-validation wording to update when implementation ships.
- docs/00_ADR.md — ADR-028 dual-schema vendor parity; ADR-030 atomic mutation/compatible lock boundary.
- Concurrency audit 2026-10-12: main worktree only; no wip tasks; no out-of-set dependencies.

### History

- 2026-10-12T18:09:00.463Z todo → wip (system)
- 2026-10-12T18:19:40.921Z wip → testing (system)
- 2026-10-12T18:21:33.995Z testing → done (system)

