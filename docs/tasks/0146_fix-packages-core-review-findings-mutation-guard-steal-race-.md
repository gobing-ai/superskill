---
schema_version: 1
name: "Fix packages/core review findings: mutation-guard steal race, binary-safe grok-bot, truncated tree, canonical-path check, copyDir race, lock helpers, SKILL.md match, identity/containment consolidation"
status: done
template: issue
created_at: 2026-09-24T00:24:12.380Z
updated_at: "2026-09-24T05:37:55.923Z"

priority: P1
ac_numbering: task-local
ac_altitude: task-local
estimate_hours: 14
---

## 0146. Fix packages/core review findings: mutation-guard steal race, binary-safe grok-bot, truncated tree, canonical-path check, copyDir race, lock helpers, SKILL.md match, identity/containment consolidation

### Background

This task came out of an advisory `/sp:dev-review packages --agent inline --focus all` run (2026-09-23): a SECUA review plus an architecture review (`sp:code-improvement`) of `packages/`. That review was path mode, so it made no fixes and wrote no task sections. Every finding below was re-verified against `main@09ad0cd` with exact `file:line` anchors. S4 was also reproduced with `bun -e`.

Everything is in `packages/core/src/` unless the text says otherwise. The review confirmed these areas are sound, and they are **out of scope**: marketplace lexical and realpath containment (`targets/marketplace.ts:153-196`), fetch byte caps and concurrency limits, blocking of the git `ext::` transport, git args placed after `--`, `writeBlobSkill` and `copyDir` containment, lock read/write that fails closed, and null-prototype lock records.

| ID | Req | Severity | Area | One-line finding |
|----|-----|----------|------|------------------|
| S1 | R1 | major | `skills-ecosystem/locks.ts:337-377` | A stale-lock takeover can rename away a *live* guard, so two processes hold the mutation guard at once and each deletes the other's guard |
| S2 | R2 | major | `operations/grok-bot.ts:309,534,842` | Skill resources are read and written as UTF-8 strings, which silently corrupts binary files (PNG, PDF, fonts). Marker hashes don't match the on-disk bytes |
| S3 | R3 | major | `skills-ecosystem/fetch.ts:507-508` | The GitHub Trees API `truncated: true` flag is ignored, so skills in large repos silently go missing or install incomplete |
| S4 | R4 | minor | `skills-ecosystem/locks.ts:102-118` | `isCanonicalSkillPath` matches substrings, so a valid path under a parent directory named `translated/` or `.grok/` is rejected |
| S5 | R5 | minor | `skills-ecosystem/installer.ts:149-196` | `copyDir` uses `Promise.all`. When one entry fails, sibling copies keep running and race `FilesystemTransaction.rollback` |
| S6 | R6 | minor | `skills-ecosystem/locks.ts:520-727` | The exported lock add/remove helpers do read-modify-write without the mutation guard |
| S7 | R7 | minor | `skills-ecosystem/fetch.ts:338-341,395,711-715` | `endsWith('skill.md')` also matches `myskill.md` and `reskill.md` |
| S8 | R8 | minor | `skills-ecosystem/fetch.ts:956` | The auth-failure hint tells users to run `npx skills add`, which is another product's CLI |
| C1 | R9 | minor | `installer.ts:41`, `source-parser.ts:139-144`, `fetch.ts:995-1004` | Lexical path containment is written out 3 times, and the `startsWith(base + sep)` form fails when base is `/` |
| C2 | R10 | minor | `installer.ts:29` vs `sanitize.ts:90` | There are two copies of `sanitizeName`, and different callers import different copies |
| C3 | R11 | minor | `fetch.ts:605-610,672` vs `operations.ts:205-218` | The blob path filters with `toSkillSlug` and operations filters with `sanitizeName`, so `my_skill` passes one filter and fails the other |
| C4 | R12 | advisory | `skills-ecosystem/fetch.ts` (1004 lines) | GitHub API, clone and blob install live in one module. Split it with pure moves |
| C5 | R13 | advisory | `operations/grok-bot.ts` (1185 lines) | Marker, receipt and hash logic is mixed in with resolution and handoff. Extract it with pure moves |
| C6 | R14 | advisory | `skills-ecosystem/fetch.ts:682-731` | The skills.sh download snapshot is never checked against the GitHub tree that was inspected (`download.hash` and `item.content` are ignored) |

Delegation notes:
- Each item is independent unless the Plan says otherwise. Implement in the phase order in `### Plan`, one atomic conventional commit per phase.
- C4 and C5 go last because they move code the earlier fixes touch.
- The defaults in `### Q&A` are binding unless the operator overrides them. Do not re-open them during implementation.

### Requirements

- [x] R1. (S1, major) `withSkillMutationGuard` (`packages/core/src/skills-ecosystem/locks.ts:337-377`) must never take over a guard directory that is held by a live owner. The "owner is dead" decision (`mutationGuardOwnerIsDead`, `locks.ts:315-329`) and the takeover `rename(guardDir, stolen)` (`locks.ts:355`) must be atomic with respect to other stealing waiters. No waiter may rename or remove `guardDir` based on a probe that another waiter's steal-and-reacquire has already made stale. At most one takeover attempt per waiter (the existing `staleRecovered` budget). The 10 s bound (`MUTATION_GUARD_MAX_WAIT_MS`, `locks.ts:296`), the 50 ms retry (`locks.ts:297`), the `SkillMutationContentionError` on timeout and the existing dead-owner recovery (`packages/core/tests/skills-ecosystem/locks.test.ts:494-509`) stay unchanged. Current failure: waiters A and B both probe a dead pid. B renames the stale guard away, runs `mkdir` and writes its owner file. A, still acting on its old "dead" probe, renames away B's *live* guard, deletes it (`locks.ts:357`) and runs `mkdir`. Now A and B run `fn()` at the same time, and B's `finally rm(guardDir)` (`locks.ts:375`) later deletes A's guard, which lets a third process in as well.
- [x] R2. (S2, major) The grok-bot catalog must be binary-safe from end to end. `BotSkillEntry.files` (`packages/core/src/operations/grok-bot.ts:260-268`) becomes `Map<string, Buffer>`. The read at `grok-bot.ts:309` reads raw bytes (no `'utf-8'` argument). The write in `writeTree` at `grok-bot.ts:842` writes raw bytes. `hashEntry` (`grok-bot.ts:532-535`) hashes resource bytes, so the marker hashes equal `sha256File(<installed file>)` (`grok-bot.ts:251`). `SKILL.md` stays text (it goes through `applyGrokBotDialect`). In the registration handoff (`grok-bot.ts:513`, `resources: Object.fromEntries(entry.files)`), the schemaVersion 1 contract `resources: Record<string,string>` (`grok-bot.ts:389`) stays unchanged: only resources that decode as strict UTF-8 (`new TextDecoder('utf-8', { fatal: true })`) go into `resources`. Non-UTF-8 resources are still written to disk beside the recipe and are left out of `resources`. Every other consumer of `entry.files` (`grok-bot.ts:974`, `grok-bot.ts:978`, and `apps/cli/src/commands/install-post-actions.ts`, which imports `BotSkillEntry`) must compile and behave the same.
- [x] R3. (S3, major) `fetchRepoTree` (`packages/core/src/skills-ecosystem/fetch.ts`, parse at lines 507-508) must detect `truncated: true` in the GitHub Trees API response. It must throw `AcquisitionLimitError`, naming the repo and that the tree listing was truncated, rather than returning a partial tree. The existing `if (error instanceof AcquisitionLimitError) throw error;` (`fetch.ts:514`) already propagates it past the branch loop. The callers `tryBlobInstall` (`fetch.ts:585`) and `materializeRepoSubdir` (`fetch.ts:757`) must then fail visibly instead of producing a partial skill set. A response without `truncated`, or with `truncated: false`, behaves as today.
- [x] R4. (S4, minor) `isCanonicalSkillPath` (`packages/core/src/skills-ecosystem/locks.ts:102-118`) must decide by *path segments*, not substrings. A path is non-canonical only when a marker segment (`.hermes`, `.grok`, `translated`) appears **after** the last `.agents/skills` segment pair, or when there is no `.agents/skills` pair and a marker segment exists at all. So a marker that is part of the project or home prefix no longer disqualifies a canonical path. Both `/` and `\` separators are handled (the existing `split('\\').join('/')` normalization stays). The existing expectations in `packages/core/tests/skills-ecosystem/locks.test.ts:26-33` must still hold unchanged. Reproduced failures that must become `true`: `getCanonicalSkillsDir(false, '/Users/x/translated/proj') + '/foo'` and `'/Users/x/.grok/work/.agents/skills/foo'`.
- [x] R5. (S5, minor) `copyDir` (`packages/core/src/skills-ecosystem/installer.ts:149-196`) must not return or reject while any sibling entry copy is still in flight. Replace `Promise.all(entries.map(...))` (`installer.ts:161`) with `Promise.allSettled`, then rethrow the *first* rejection. This mirrors `mapWithConcurrency` (`fetch.ts:131-149`). Recursive calls get this for free because they go through the same function. Behavior on success is unchanged. On failure, the thrown error is still the first failing entry's error (same message text as today).
- [x] R6. (S6, minor) The exported lock-file mutators must serialize through the per-lock mutation guard: `addSkillToLocalLock` (`locks.ts:520`), `removeSkillFromLocalLock` (`locks.ts:543`), `addSkillToGlobalLock` (`locks.ts:682`) and `removeSkillFromGlobalLock` (`locks.ts:712`), plus their aliases `addSkillToLock` (`locks.ts:707`) and `removeSkillFromLock` (`locks.ts:727`), which inherit the fix. Wrap each read-modify-write body in `withSkillMutationGuard(<that function's lock path>, async () => …)`. Signatures and return values are unchanged. Each JSDoc must say that the guard is **not reentrant**: calling these helpers from inside `withSkillMutationGuard` on the same lock path deadlocks until `SkillMutationContentionError`. The implementer must re-confirm that no internal caller does that (`rg -n "addSkillTo|removeSkillFrom" packages apps plugins`). As of review, the only internal guard users are `operations.ts:349` and `:497`, and neither calls these helpers.
- [x] R7. (S7, minor) Any match for a skill manifest file must match the basename exactly: `SKILL.md`, case-insensitive, at the repo root or after a `/`. Use `/(^|\/)skill\.md$/i` in `findSkillMdPaths` (`fetch.ts:395`), in the folder-slicing branch of `getSkillFolderHashFromTree` (`fetch.ts:338-341`; the second `endsWith('skill.md')` arm must go) and in the `tryBlobInstall` folder slicing (`fetch.ts:711-715`). `myskill.md`, `docs/reskill.md` and `SKILL.md.bak` must not be treated as skill manifests.
- [x] R8. (S8, minor) The auth-failure hint in `fetch.ts:956` must recommend this product's own command, `superskill skill add ${repo.sshUrl}` (the command is registered at `apps/cli/src/commands/skill.ts:449-451`: `skill` → `add <source>`), instead of `npx skills add`. The other lines of the hint are unchanged.
- [x] R9. (C1, minor) Lexical path containment must have one implementation. Add an exported `isLexicallyContained(base: string, target: string): boolean` to `packages/core/src/content/paths.ts`. It is `isContainedRelative(relative(resolve(base), resolve(target)))` with a same-root check, reusing the existing private `isContainedRelative` (`content/paths.ts:85-92`), and it does **no** realpath and no fs I/O. Route these through it: `isPathSafe` (`installer.ts:41-46`, kept as the exported name and delegating), `isSubpathSafe` (`source-parser.ts:139-144`) and the check in `cleanupTempDir` (`fetch.ts:995-1004`). `pathIsOrUnder` (`content/paths.ts:72`) stays as it is; it is the realpath-canonicalizing variant with different semantics. Behavior may change only where the old `startsWith(base + sep)` form was wrong: a base of `/` or a drive root now contains its children.
- [x] R10. (C2, minor) `sanitizeName` must have exactly one definition, the one in `packages/core/src/skills-ecosystem/sanitize.ts:90`. Delete the copy at `installer.ts:29-36`. `installer.ts` imports it from `./sanitize`. `emit.ts:15` and `operations.ts:15`, which currently import it from `./installer`, import it from `./sanitize`. The public barrel keeps exporting exactly one `sanitizeName` (through `index.ts:83` `export * from './skills-ecosystem/sanitize'`), and `apps/cli/src/commands/update.ts:28` keeps compiling unchanged. The two bodies are identical today (verified), so this changes no behavior.
- [x] R11. (C3, minor) The skill **filter** comparison must use one identity function on both the blob path and the clone/operations path, so the same `--skill` filter selects the same skills either way. The identity is `sanitizeName`, the lock-key identity. Use it for the filter comparisons at `fetch.ts:605-610` and `fetch.ts:672` (both `toSkillSlug(options.skillFilter)` comparisons). `operations.ts:205-206` and `:217-218` already use `sanitizeName`. `toSkillSlug` remains **only** where it builds the skills.sh download URL slug (`fetch.ts:663` `slug:`, used at `fetch.ts:687`), because that is the external API contract. Current failure: a skill named `my_skill` with filter `my-skill` passes the blob filter (`toSkillSlug` turns `_` into `-`) and then fails `operations.ts:205-206` (`sanitizeName` keeps `_`) with "No skills found". The reverse also fails: filter `my_skill` misses on the blob path.
- [x] R12. (C4, advisory) Split `packages/core/src/skills-ecosystem/fetch.ts` (1004 lines) with **pure moves**: GitHub REST access (tree, commit-sha and raw-content fetches with their byte caps, `readBodyBounded`, `AcquisitionLimitError`) goes to `skills-ecosystem/github-api.ts`, and the hardened git clone plus `cleanupTempDir` go to `skills-ecosystem/clone.ts`. `fetch.ts` re-exports every symbol it exports today, so no import site anywhere changes and the public barrel surface stays byte-identical in name set. No logic edits in the same commit.
- [x] R13. (C5, advisory) Extract the grok-bot origin-marker, receipt and hash helpers (`sha256File`/`sha256Text` at `operations/grok-bot.ts:251-257`, `hashEntry` at `:532`, `buildMarker` at `:538`, `readOriginMarker` at `:566`, `markerHashesCurrent` at `:613`) into `operations/grok-bot-marker.ts` as a **pure move**. `grok-bot.ts` keeps its exported symbol set unchanged (re-export what was exported). No logic edits in the same commit.
- [x] R14. (C6, advisory) `tryBlobInstall` (`fetch.ts:682-731`) must tie the skills.sh download snapshot to the GitHub tree it inspected. For each downloaded skill, the downloaded `SKILL.md` file (the `download.files` entry whose path is `SKILL.md`, case-insensitive) must be byte-equal to `skill.content`, the SKILL.md already fetched from GitHub for that tree (`fetch.ts:662`). If it is missing or differs, treat that skill's download as failed. The existing rule `if (downloads.some((d) => !d?.download)) return null;` (`fetch.ts:703`) then sends the whole install to the clone fallback. No new network calls.
- [x] R15. (docs and gates) The surface docs must stay in sync in the same commit as the code: `docs/04_DESIGN.md:51-53` (grok-bot handoff `resources`: text-only, binaries on disk only) and `plugins/cc/skills/grok-bot-register/SKILL.md:148` (`resources` example and note). All project gates must pass on the final tree: `bun run lint`, `bun run test` (coverage ≥ 90% lines and functions), `bun run build` and `bun run spur-check`. `git status` must show only intentional changes.

### Acceptance Criteria

- [x] AC1 — A steal never takes over a live guard (req: R1). Residual-proof unit test in `packages/core/tests/skills-ecosystem/locks.test.ts`: create `guardDir` with an owner file for a dead pid (from `Bun.spawnSync(['true']).pid`). Replace it with an owner file for the live `process.pid`, as another waiter's steal and reacquire would. Then call the steal step. It returns "not stolen", `guardDir` still exists and its `owner` file is byte-identical to the live one. The test is labeled residual-proof: it carries both trigger halves (an earlier dead-owner state and a guard that exists at steal time).
- [x] AC2 — Concurrent waiters on a stale guard never overlap (req: R1). Stress test: seed a dead-owner guard and start 8 concurrent `withSkillMutationGuard(lockPath, fn)` calls. Each `fn` increments an `active` counter, records `max(active)`, awaits a 20 ms sleep, then decrements. Assert that `max(active) === 1`, all 8 resolve, and `guardDir` plus any `${guardDir}.steal` directory are gone afterward.
- [x] AC3 — Existing guard behavior is preserved (req: R1). The existing tests in `describe('locks.ts - per-scope mutation guard (R3/F3)')` (`locks.test.ts:418` onward) pass unmodified: serialization, dead-owner steal and cleanup (`:494`), and the contention timeout.
- [x] AC4 — Binary resources round-trip byte-identical (req: R2). Test in `packages/core/tests/operations/grok-bot.test.ts`, using the fixture style of `describe('plan + emit (R4/R5)')` (`:242`). A staged skill has `assets/logo.png` containing the bytes `89 50 4E 47 0D 0A 1A 0A 00 FF FE 80`. After `emitGrokBotInstall` (`packages/core/src/operations/grok-bot.ts:870`), the installed file equals the source `Buffer` exactly (`Buffer.compare(...) === 0`) for both the bridge and full modes that the fixture exercises.
- [x] AC5 — Marker hashes match on-disk bytes (req: R2). For the AC4 install, the origin-marker hash recorded for `assets/logo.png` equals `sha256File(<installed path>)`, and `markerHashesCurrent(marker, dir)` (`grok-bot.ts:613`) returns `true` right after the install. The test fails against the current UTF-8 `sha256Text` path.
- [x] AC6 — The handoff keeps schemaVersion 1 and leaves out binaries (req: R2, R15). `buildBotRegisterHandoff` (`grok-bot.ts:478`) for a skill with `notes.txt` (UTF-8, including a multi-byte character such as `é`) and `assets/logo.png` (AC4 bytes) emits `resources` with exactly `{ 'notes.txt': <exact text> }`, typed `Record<string,string>`. The handoff `schemaVersion` is unchanged.
- [x] AC7 — Other consumers are unaffected (req: R2). `bun run lint` (typecheck across workspaces, including `apps/cli/src/commands/install-post-actions.ts`) passes. The existing `grok-bot.test.ts` suites pass unmodified apart from the `files` type (`Map<string, Buffer>`) in any test that builds a `BotSkillEntry` by hand.
- [x] AC8 — A truncated tree fails loudly (req: R3). A `fetchRepoTree` test with a stub `fetchFn` that returns `{ sha, tree: [...], truncated: true }` rejects with `AcquisitionLimitError`, whose message names the `owner/repo` and the word "truncated". A sibling test with `truncated: false` and one with no `truncated` field still resolve to the tree. `tryBlobInstall` against the truncated stub rejects with `AcquisitionLimitError` and does not return a partial skill list.
- [x] AC9 — Canonical path detection is segment-aware (req: R4). `locks.test.ts:26-33` passes unchanged. New cases return `true`: `/Users/x/translated/proj/.agents/skills/foo` and `/Users/x/.grok/work/.agents/skills/foo`, plus the Windows form `C:\\Users\\x\\translated\\p\\.agents\\skills\\foo`. New cases return `false`: `/p/.agents/skills/translated/foo` (marker after the pair) and `/p/.grok/skills/foo` (marker, no pair). With the first `true` case as `canonicalSkillDir`, `addSkillToGlobalLock` (guard at `locks.ts:687`) and `computeCanonicalSkillFolderHash` (guard at `locks.ts:158`) no longer throw `Lock operations accept only canonical skill folder paths`.
- [x] AC10 — `copyDir` failure waits for every sibling (req: R5). Test in `packages/core/tests/skills-ecosystem/installer.test.ts`: the source tree has one symlink entry, which triggers the existing rejection (see `:145-157`), and a sibling subdirectory with 50 files. After `copyDir` rejects, record a directory listing of `dest`, wait 50 ms and list it again. The two listings are identical, so no copy was still in flight. The rejection message is still `Refusing to copy symbolic link: …`.
- [x] AC11 — Rollback after a failed copy restores the backup (req: R5). A `FilesystemTransaction` that backed up an existing destination, followed by a failing `copyDir` and `rollback()`, ends with the destination equal to the original contents and no `Filesystem rollback failed` error.
- [x] AC12 — Exported lock mutators serialize (req: R6). Twenty concurrent `addSkillToLocalLock` calls with distinct skill names on one temp project produce a local lock that contains all 20 entries (no lost update). The same test runs for `addSkillToGlobalLock` against a temp global lock path (isolated via `env: { XDG_STATE_HOME: <tmp> }`, as in `locks.test.ts:187`). A remove-then-add interleave keeps a consistent final state. Each of the 4 functions has a JSDoc stating that the guard is not reentrant.
- [x] AC13 — Only exact SKILL.md basenames match (req: R7). The `findSkillMdPaths` test (`packages/core/tests/skills-ecosystem/fetch.test.ts:79` area) with a tree containing `SKILL.md`, `a/skill.md`, `b/SKILL.MD`, `c/myskill.md`, `d/reskill.md` and `e/SKILL.md.bak` returns exactly `SKILL.md`, `a/skill.md` and `b/SKILL.MD`. `getSkillFolderHashFromTree` for `c/myskill.md` doesn't slice `c/my` into a folder.
- [x] AC14 — The auth hint names superskill (req: R8). A `cloneRepo` auth-failure test (existing git-failure stub pattern in `fetch.test.ts`) asserts that the `GitCloneError` message contains `superskill skill add git@` and does not contain `npx skills`.
- [x] AC15 — One lexical containment helper (req: R9). `rg -n "startsWith\(normalized\w* \+ sep\)" packages/core/src` returns no matches. `isLexicallyContained` unit tests cover: equal paths, a child, a sibling sharing a prefix (`/a/bc` vs `/a/b` gives false), a `..` escape, base `/` containing `/x` (true, whereas the old form returned false) and cross-root on win32-style inputs. The existing `isPathSafe`, `isSubpathSafe` (`packages/core/tests/skills-ecosystem/subpath-traversal.test.ts`, `source-parser.test.ts`) and `cleanupTempDir` tests pass unchanged.
- [x] AC16 — One `sanitizeName` (req: R10). `rg -n "export function sanitizeName" packages/core/src` returns exactly one hit (`skills-ecosystem/sanitize.ts`). `sanitize-name.test.ts` and `sanitize.test.ts` pass unchanged. `apps/cli` typechecks.
- [x] AC17 — Both install paths agree on the filter (req: R11). For a skill whose frontmatter name is `my_skill`: `tryBlobInstall` with `skillFilter: 'my_skill'` selects it and with `'my-skill'` does not, matching the result of `operations.ts:205-206` filtering on the same inputs. A test asserts that the skills.sh download URL for `My Skill` still uses the `toSkillSlug` slug `my-skill` (`fetch.ts:687`).
- [x] AC18 — The `fetch.ts` split is a pure move (req: R12). The set of names exported from `@<scope>/superskill-core` is identical before and after: record `Object.keys(await import('packages/core/src/index.ts')).sort()` before, compare after, in the commit description or a test. The phase commit shows no changes outside moved blocks, imports and re-exports. All `fetch.test.ts` tests pass unmodified.
- [x] AC19 — The `grok-bot.ts` extraction is a pure move (req: R13). Same export-set equality check as AC18 for `grok-bot.ts`. All `grok-bot.test.ts` tests pass unmodified.
- [x] AC20 — A snapshot mismatch falls back to clone (req: R14). A `tryBlobInstall` test whose stubbed download manifest has a `SKILL.md` that differs from the GitHub raw SKILL.md returns `null`. A matching manifest still returns the blob skills. A manifest with no `SKILL.md` entry returns `null`.
- [x] AC21 — The docs are in sync (req: R15). `docs/04_DESIGN.md` (grok-bot handoff paragraph, currently `:51-53`) states that `resources` carries only UTF-8 text resources and that binary resources are present on disk beside the recipe. `plugins/cc/skills/grok-bot-register/SKILL.md` (`:148` example) carries the same note. Both land in the same commit as R2.
- [x] AC22 — All gates pass (req: R15). `bun run lint`, `bun run test` (coverage ≥ 90% lines and functions per `bunfig.toml`), `bun run build` and `bun run spur-check` all pass on the final tree. No test is skipped, `.skip`'d or weakened. `git status` shows only files named in `### Plan`.

### Q&A

These defaults are binding for implementation. The operator may override them before the task moves to `wip`.

**Q1. S2: should the registration handoff carry binary resources?**
A: No. Keep `schemaVersion` 1 and `resources: Record<string,string>` (`grok-bot.ts:389`), with UTF-8-decodable resources only. Binaries are still installed on disk beside the recipe, where the Bot resolves them by path. A schemaVersion 2 with base64 `binaryResources` would need a new ADR plus updates to `grok-bot-register/SKILL.md` and to consumers. That is deferred until a Bot consumer needs inline binaries.

**Q2. S1: why a steal lock instead of compare-and-rename-back?**
A: Renaming back can overwrite an empty guard that another waiter has just `mkdir`'d, because POSIX `rename` onto an empty directory succeeds. That recreates the double hold. A steal lock (`mkdir ${guardDir}.steal`) serializes thieves, so the re-probe and the rename see the same directory. See D1.

**Q3. S1: should the ownerless-guard window (a crash between `mkdir` and the owner write, `locks.ts:368-372`) or a stale `.steal` directory be recovered automatically?**
A: Not in this task. Both fail safe: waiters get `SkillMutationContentionError` after 10 s and the error names the lock path. Record each as a `ponytail:` comment. If they show up in practice, a follow-up can add mtime-based expiry.

**Q4. S6: could guarding the exported lock helpers deadlock existing callers?**
A: No internal caller invokes them inside `withSkillMutationGuard`. Re-check with `rg -n "addSkillTo|removeSkillFrom" packages apps plugins` during P2. The guard is not reentrant, so document that in each JSDoc. External callers get a behavior improvement only.

**Q5. C3: why not switch everything to `toSkillSlug`?**
A: `sanitizeName` is the lock-key and on-disk identity used across `operations.ts`, `emit.ts` and the lock files. Changing it would re-key existing installs, which is a breaking change. `toSkillSlug` remains only for the skills.sh download URL (`fetch.ts:663`, `:687`), which is that API's contract.

**Q6. C1: why not reuse `pathIsOrUnder`?**
A: It realpaths (`content/paths.ts:99-107`), does sync I/O and changes semantics for macOS `tmpdir()` (`/var` → `/private/var`) and for not-yet-existing destinations. The call sites being consolidated are lexical by design.

**Q7. C4/C5: can the refactors change behavior?**
A: No. They are pure moves with re-exports, the public export set must equal the P0 baseline, and test files are not edited. Any logic change needed along the way goes in a separate follow-up.

**Q8. C6: what happens on a snapshot mismatch?**
A: The whole blob install returns `null` and falls back to the hardened clone, which is the existing fallback path (`fetch.ts:703`). No error surfaces to the user, because the clone path is authoritative.

**Q9. Is an ADR entry required?**
A: No. None of these changes alters a recorded decision: the ADR-036 grok-bot scope is unchanged and the handoff schema is unchanged. `docs/04_DESIGN.md` gets the R2 surface clarification in the same commit, per AGENTS.md.

### Design

**Scope guard:** every change stays inside `packages/core/src/**`, its tests, `docs/04_DESIGN.md` (R2 only) and `plugins/cc/skills/grok-bot-register/SKILL.md` (R2 only). `apps/cli` must compile without edits. If it does not, stop and report. No new dependencies, no ADR change (nothing here diverges from `docs/00_ADR.md`; R2 keeps the handoff schemaVersion 1 contract), and nothing under `vendors/` is touched.

#### D1 — S1 mutation-guard steal (R1)
Chosen approach: a **steal lock**, a sibling directory `${guardDir}.steal` taken with an exclusive `mkdir`. This makes "probe the owner, then rename" atomic among stealing waiters. Normal acquisition (`mkdir(guardDir)`) is unchanged.
- Extract `async function tryStealStaleMutationGuard(guardDir: string): Promise<boolean>` from the inline block at `locks.ts:350-361`, and export it with a TSDoc `@internal` note so tests can drive it. `index.ts` re-exports locks with `export *`, so the tsdoc-export rule applies; the JSDoc must sit directly above the export.
  1. `mkdir(`${guardDir}.steal`)`. On `EEXIST`, return `false` (another thief is mid-steal) and keep waiting. Rethrow any other error.
  2. While holding it, **re-probe** with `mutationGuardOwnerIsDead(guardDir)`. If the owner is not dead, or there is no owner file, or `guardDir` is gone, return `false`.
  3. `rename(guardDir, `${guardDir}.stale-${randomUUID()}`)`, then `rm` the stale copy with `.catch(() => {})`. Return `true`.
  4. `finally`: `rm(`${guardDir}.steal`, { recursive: true, force: true })`.
- Loop change in `withSkillMutationGuard`: replace the inline block with `if (!staleRecovered && (await tryStealStaleMutationGuard(guardDir))) { staleRecovered = true; continue; }`. When the steal returns false, fall through to the 50 ms sleep so a held steal lock doesn't become a hot spin. Nothing else in the loop changes.
- Why it's sound: between the thief's re-probe and its rename, `guardDir` can only be removed by (a) its holder's `finally rm`, but the holder is dead, or (b) another thief, which the steal lock excludes. So the renamed directory is exactly the dead-owner directory that was probed. A newly acquired guard with no owner file yet reads as "live" (the `catch → false` at `locks.ts:326-327`), so it is never stolen.
- Rejected alternative: compare the owner file after the rename and rename it back on mismatch. The rename-back can clobber an *empty*, freshly `mkdir`'d guard (POSIX `rename` over an empty directory succeeds), which recreates the double-hold. Rejected.
- Known ceilings (document these; don't fix them here; see Q&A):
  - A thief that crashes while holding `.steal` blocks stale recovery for that lock. Waiters then time out with `SkillMutationContentionError`, which fails safe. Add a `ponytail:` comment naming the manual cleanup path.
  - A crash between `mkdir(guardDir)` and the owner write (`locks.ts:368-372`) leaves an ownerless guard that is treated as live. This is pre-existing and fails safe.

#### D2 — S2 binary-safe grok-bot (R2, R15)
- `BotSkillEntry.files: Map<string, Buffer>` (`grok-bot.ts:260-268`); update its JSDoc to "raw bytes".
- `grok-bot.ts:309`: `files.set(rel, readFileSync(join(skillDir, rel)))`.
- `writeTree` (`grok-bot.ts:842`): `writeFileSync(abs, content)` with no encoding.
- `hashEntry` (`grok-bot.ts:534`): `hashes[rel] = sha256Bytes(content)`, where `sha256Bytes(b: Buffer) => createHash('sha256').update(b).digest('hex')`. If `sha256File` (`:251`) is `readFileSync` plus the same digest, make `sha256File` call `sha256Bytes` so there is one digest path. `SKILL.md` keeps `sha256Text(entry.skillMd)`; UTF-8 text hashes the same as its bytes, so existing markers stay valid for text resources.
- Handoff (`grok-bot.ts:513`): `resources: textResources(entry.files)`. This small local helper tries `new TextDecoder('utf-8', { fatal: true }).decode(buf)` on each entry, keeps the ones that decode, and skips the rest. Add a `ponytail:` comment: binaries are on disk but not in `resources`; move to schema v2 with base64 if the Bot ever needs them inline.
- Consumers at `grok-bot.ts:974` and `:978` use only `.keys()`, so they don't change. `apps/cli/src/commands/install-post-actions.ts` only passes entries through, so it only needs to typecheck.
- Docs, in the same commit: `docs/04_DESIGN.md:51-53` and `plugins/cc/skills/grok-bot-register/SKILL.md:148`. See AC21 for the wording.

#### D3 — S3 truncated tree (R3)
At `fetch.ts:507`, parse as `{ sha: string; tree: TreeEntry[]; truncated?: boolean }`. If `data.truncated === true`, throw `new AcquisitionLimitError(`GitHub tree listing for ${ownerRepo} is truncated (repository too large for the Trees API); refusing a partial skill set`)`. Match the constructor signature in `fetch.ts`; if the class takes structured args, pass the same fields its other throw sites pass. The catch at `fetch.ts:514` already rethrows it. Callers need no change.

#### D4 — S4 segment-aware canonical check (R4)
Replace the substring loop at `locks.ts:104-117`:
```ts
const segs = path.split('\\').join('/').split('/').filter(Boolean);
let pairEnd = -1; // index just past the last `.agents/skills` pair
for (let i = segs.length - 2; i >= 0; i--) {
    if (segs[i] === '.agents' && segs[i + 1] === 'skills') { pairEnd = i + 2; break; }
}
const MARKERS = new Set(['.hermes', '.grok', 'translated']);
for (let i = Math.max(pairEnd, 0); i < segs.length; i++) if (MARKERS.has(segs[i] as string)) return false;
return true;
```
Checked against the fixtures: `/project/skills/my-skill` has no pair and no marker, so it returns true. `/project/.hermes/skills/x` has no pair and a marker, so false. `/project/translated/skills/my-skill` also has no pair and a marker, so false. The new `true` cases have their marker before the pair. Put `MARKERS` at module level. Keep the JSDoc above the export and add the "marker must follow the canonical pair" rule to it.

#### D5 — S5 settle before rethrow (R5)
In `copyDir` (`installer.ts:161`): `const settled = await Promise.allSettled(entries.map(...)); const firstRejection = settled.find((s): s is PromiseRejectedResult => s.status === 'rejected'); if (firstRejection) throw firstRejection.reason;`. This copies `fetch.ts:145-147`. Don't extract a shared helper for two call sites.

#### D6 — S6 guard the exported mutators (R6)
Wrap each body: `return withSkillMutationGuard(<lockPath>, async () => { …existing body… });`. The lock path is whatever the matching `read*Lock` and `write*Lock` resolve: the local lock path for `(cwd)`, and `getGlobalLockPath(opts?.env, opts?.homeDir)` for the global lock. Check the exact helper names in `locks.ts`. The canonical-path precondition at `:687` stays **outside** the guard, so it fails fast. JSDoc line: "Acquires the per-lock mutation guard; not reentrant — never call from inside `withSkillMutationGuard` on the same lock."

#### D7 — S7 exact basename (R7)
Add a module constant `const SKILL_MD_RE = /(^|\/)skill\.md$/i;` in `fetch.ts`.
- `fetch.ts:395`: `.filter((e) => e.type === 'blob' && SKILL_MD_RE.test(e.path))`.
- `fetch.ts:338-341`: `if (SKILL_MD_RE.test(folderPath)) folderPath = folderPath.replace(SKILL_MD_RE, '');`. This removes the loose second arm.
- `fetch.ts:711-715`: `const folderPath = skill.mdPath.replace(SKILL_MD_RE, '');`. The result is identical for valid paths: `a/SKILL.md` gives `a` and `SKILL.md` gives `''`.

#### D8 — S8 hint (R8)
`fetch.ts:956`: change `npx skills add` to `superskill skill add`. One string edit.

#### D9 — C1 lexical containment (R9)
In `content/paths.ts`, add an export next to `pathIsOrUnder`:
```ts
/** Lexical (no fs, no realpath) containment: `target` equals `base` or lies beneath it. */
export function isLexicallyContained(base: string, target: string): boolean {
    const rb = resolve(base);
    const rt = resolve(target);
    if (parse(rb).root !== parse(rt).root) return false;
    return isContainedRelative(relative(rb, rt));
}
```
- `installer.ts:41-46` `isPathSafe` → `return isLexicallyContained(basePath, targetPath);`, keeping the export and its JSDoc.
- `source-parser.ts:139-144` `isSubpathSafe` → `return isLexicallyContained(basePath, join(basePath, subpath));`.
- `fetch.ts:995-1004` `cleanupTempDir` → `if (!isLexicallyContained(tmpdir(), dir)) throw …`, with the message unchanged.
- Import through the relative module path, since this is within one package. Drop the `normalize`/`sep` imports that become unused (Biome will flag them).
- Do **not** reuse `pathIsOrUnder`: its realpath canonicalization breaks macOS `tmpdir()` (`/var` → `/private/var`) comparisons against lexical inputs, and it does sync I/O.

#### D10 — C2 single `sanitizeName` (R10)
Delete `installer.ts:26-36` (JSDoc and function). Add `import { sanitizeName } from './sanitize';` to `installer.ts` if it still uses it. Repoint `emit.ts:15` and `operations.ts:15` to import `sanitizeName` from `./sanitize`. `index.ts:70-80` doesn't list `sanitizeName` from installer, so it stays unchanged.

#### D11 — C3 one filter identity (R11)
At `fetch.ts:605-610` (soft folder-name pre-filter; it narrows only on a match), compare `sanitizeName(folderName) === sanitizeName(options.skillFilter)`. At `fetch.ts:672-673` (strict name filter; returns `null`, meaning clone fallback, at `:676-678` on a miss), use `parsedSkills.filter((s) => sanitizeName(s.name) === sanitizeName(options.skillFilter))`. This compares the frontmatter name, exactly like `operations.ts:205-206`. Import `sanitizeName` from `./sanitize`, after D10. Leave `slug: toSkillSlug(safeName)` at `fetch.ts:663` alone, because it feeds the download URL at `:687`. Add a one-line comment there: `slug` is the skills.sh API identity, while `sanitizeName` is the lock and filter identity.

#### D12 — C4 split `fetch.ts` (R12), pure move
New files `skills-ecosystem/github-api.ts` and `skills-ecosystem/clone.ts`. `fetch.ts` keeps discovery and blob install, and ends with `export { … } from './github-api'; export { … } from './clone';` listing every previously exported name. Private helpers shared across the new files (for example `readBodyBounded` or `mapWithConcurrency`) are exported from their new home without being added to the `fetch.ts` re-export list unless they were exported before. Verify with AC18. No test file edits.

#### D13 — C5 extract grok-bot marker (R13), pure move
Create `operations/grok-bot-marker.ts` containing `sha256File`, `sha256Text` (and `sha256Bytes` from D2), `hashEntry`, `buildMarker`, `readOriginMarker`, `markerHashesCurrent`, and the `GrokBotOriginMarker` interface (`grok-bot.ts:60`). `grok-bot.ts` imports them and re-exports those that were exported before. Verify with AC19.

#### D14 — C6 snapshot binding (R14)
In the `mapWithConcurrency` worker at `fetch.ts:682-701`, after `JSON.parse` into `SkillDownloadResponse` (`fetch.ts:33-36`; files are `SkillSnapshotFile { path; contents: string }`, `fetch.ts:27-30`), look up `const md = downloadData.files.find((f) => f.path.toLowerCase() === 'skill.md')`. If `!md || md.contents !== skill.content`, `return null`. The existing `fetch.ts:703` rule then sends the whole install to the clone fallback. Add a comment explaining why: this ties the third-party snapshot to the GitHub tree that was inspected. Leave `download.hash` alone; its algorithm is unspecified.

### Plan

Each phase is one atomic conventional commit on a feature branch (never on `main`). Write the failing test first, then the fix. After each phase, run the focused tests (`bun test packages/core/tests/skills-ecosystem/<file>.test.ts`) and `bun run lint`. Before starting, read `.spur/context/pitfalls.md` and `.spur/context/buglog.md`, and re-read every `file:line` anchor in this task, since earlier phases shift line numbers in later ones.

- [x] P0. Setup: `git switch -c fix/0146-core-review-findings`, then `spur task update 0146 --status wip`. Record the baseline export set: `bun -e "console.log(Object.keys(await import('./packages/core/src/index.ts')).sort().join('\n'))" > /tmp/0146-exports.before` (needed for AC18/AC19).
- [x] P1. `fetch.ts` small fixes (R3, R7, R8, R14). Tests first in `packages/core/tests/skills-ecosystem/fetch.test.ts` (AC8, AC13, AC14, AC20), then D3, D7, D8 and D14. Commit `fix(core): reject truncated GitHub trees, exact SKILL.md match, bind blob snapshot to tree`.
- [x] P2. `locks.ts` (R4, R1, R6). Tests first in `packages/core/tests/skills-ecosystem/locks.test.ts` (AC9, then AC1–AC3, then AC12). Implement D4, then D1, then D6. D6 depends on D1 because the helpers go through the fixed guard. Commit `fix(core): atomic stale-guard steal, segment-aware canonical paths, guarded lock mutators`.
- [x] P3. `installer.ts` and dedupe (R5, R10, R9). Tests first (AC10, AC11, AC15, AC16), then D5, D10 and D9. `content/paths.ts` gets `isLexicallyContained`; `source-parser.ts` and `fetch.ts` `cleanupTempDir` delegate to it; `emit.ts` and `operations.ts` switch their imports. Commit `fix(core): settle copyDir siblings before rethrow; single sanitizeName and lexical containment`.
- [x] P4. Filter identity (R11). Test AC17, then D11 in `fetch.ts`. Commit `fix(core): unify skill filter identity on sanitizeName across blob and clone paths`.
- [x] P5. Grok-bot binary safety (R2, R15). Tests first in `packages/core/tests/operations/grok-bot.test.ts` (AC4–AC7), then D2. Update `docs/04_DESIGN.md:51-53` and `plugins/cc/skills/grok-bot-register/SKILL.md:148` in the same commit (AC21). Commit `fix(core): binary-safe grok-bot resources; handoff carries text resources only`.
- [x] P6. Split `fetch.ts` as a pure move (R12, D12). Compare the export set with the P0 baseline (AC18). Commit `refactor(core): split fetch.ts into github-api and clone modules`.
- [x] P7. Extract the grok-bot marker as a pure move (R13, D13). Compare the export set with the baseline (AC19). Commit `refactor(core): extract grok-bot marker and hash helpers`.
- [x] P8. Full gates (AC22): `bun run lint && bun run test && bun run build && bun run spur-check`, then `git status`. If coverage drops below 90%, add behavior tests. Never lower the threshold.
- [x] P9. Bookkeeping:
  - Update `.spur/context/anatomy.md` for the new files (`github-api.ts`, `clone.ts`, `grok-bot-marker.ts`).
  - Append S1 and S2 to `.spur/context/buglog.md` (root cause, fix, tags `lock`, `race`, `binary`, `encoding`), and add a `pitfalls.md` do-not-repeat entry for "rename-steal guarded only by a pre-rename probe".
  - Append to `.spur/context/memory.md`.
  - Fill `### Solution` (a per-phase summary and any deviation from Design, with reason) and let `/sp:dev-verify 0146` produce `### Testing`.

Stop and ask the operator if any of these happens:
- `apps/cli` needs a source edit.
- A pure-move phase needs a logic change.
- The public export set changes outside the additions `isLexicallyContained` and `tryStealStaleMutationGuard`.
- A Q&A default turns out to be infeasible.

### Root Cause

- **S1 (R1):** The stale-guard steal (`locks.ts:350-361`) decides with a probe (`mutationGuardOwnerIsDead`, `locks.ts:315-329`) and acts later with `rename(guardDir, …)` (`locks.ts:355`). Nothing prevents a second waiter from finishing its own steal and re-acquiring in between. The rename is atomic, but the check-then-act pair is not, so the directory that gets renamed away can be a *different, live* guard. It is a classic TOCTOU race. The comment "rename first so a competing waiter can never delete a freshly (re)acquired guard" is true only if the probe and the rename refer to the same directory, and the code never enforces that.
- **S2 (R2):** `BotSkillEntry.files` is typed `Map<string, string>` (`grok-bot.ts:260-268`), so resources are forced through UTF-8 at read time (`grok-bot.ts:309`). Invalid sequences become U+FFFD, and bytes are lost for good before `writeTree` (`:842`) re-encodes them. `hashEntry` (`:534`) hashes the lossy string, so the marker agrees with the corrupted output and drift checks can't notice. The design treated "skill support files" as text because the handoff contract (`:389`) is a string map.
- **S3 (R3):** `fetch.ts:507` casts the Trees API JSON to `{ sha; tree }` and drops the documented `truncated` flag. The Trees API returns at most about 100k entries or 7 MB with `truncated: true`, so large monorepos silently yield a partial tree. `findSkillMdPaths` then under-discovers skills, and `materializeRepoSubdir` can materialize an incomplete subtree.
- **S4 (R4):** `isCanonicalSkillPath` (`locks.ts:102-118`) tests `normalized.includes('/translated/')` and similar strings anywhere in the absolute path, including the user's own project or home prefix. Canonical-ness depends on the part of the path *after* the install root, but the check scans the whole string.
- **S5 (R5):** `copyDir` fans out with `Promise.all` (`installer.ts:161`), which rejects on the first failure while the other sibling promises keep running. The caller's `FilesystemTransaction.rollback` (`installer.ts:290-307`) then runs `rm(destination)` while a sibling can still `mkdir(dest, { recursive: true })` (`:158`) or write files. Rollback's `rename(backup → destination)` then fails, or leaves a mixed tree. `mapWithConcurrency` (`fetch.ts:145-147`) already solved this with `allSettled`, but that fix was never applied to `copyDir`.
- **S6 (R6):** The guard was introduced in `operations.ts` (`:349`, `:497`) around higher-level flows. The low-level exported mutators (`locks.ts:520/543/682/712`) predate it and were never wrapped, so external callers of the public API get an unserialized read-modify-write and lost updates.
- **S7 (R7):** `endsWith('skill.md')` is a suffix test on the whole path, not a basename test (`fetch.ts:338-341`, `:395`, `:711-715`).
- **S8 (R8):** The string was ported from the vendored upstream (`vercel-labs/skills`) without being rebranded (`fetch.ts:956`).
- **C1 (R9):** Each module that needed a containment check wrote its own `normalize` + `startsWith(base + sep)` (`installer.ts:45`, `source-parser.ts:143`, `fetch.ts:999`) instead of reusing `content/paths.ts`. The `+ sep` form also mishandles a root base (`/` + `/` = `//`).
- **C2 (R10):** `sanitizeName` was copied into `installer.ts:29` when the installer was ported, and later also defined in `sanitize.ts:90`. Import sites split between the two copies.
- **C3 (R11):** The blob fast path was ported with upstream's `toSkillSlug` identity (`fetch.ts:242-249`: `_` becomes `-`, `.` is stripped). The lock and operations layer uses `sanitizeName` (keeps `.` and `_`). The two filters run in sequence on the same `--skill` input and disagree.
- **C4 / C5 (R12, R13):** Both files grew as features were added, which leaves weak locality. `fetch.ts` has three responsibilities (GitHub API, clone, blob install) and `grok-bot.ts` has four (resolution, plan, emit, marker/receipt).
- **C6 (R14):** `tryBlobInstall` trusts the skills.sh download response wholesale (`fetch.ts:682-731`). The GitHub SKILL.md that is already in hand (`fetch.ts:662`) is never compared, so a stale or divergent snapshot installs silently. This is the same as upstream behavior, which is why it is only advisory.

### Solution

All 15 review items fixed in `packages/core` (+2 doc files). Pure-move restructures (R12, R13) preserve the public export surface byte-identically: `fetch.ts` still exports the same 24 names (re-exporting from the new `github-api.ts`/`clone.ts`), `operations/grok-bot.ts` the same 28 (re-exporting from `grok-bot-marker.ts`); the package barrel gained only the two sanctioned additions `isLexicallyContained` and `tryStealStaleMutationGuard`.

| Item | Fix | Where |
|---|---|---|
| R1/S1 steal race | Two-phase steal protocol: exclusive `mkdir(${guard}.steal)` thief lock → re-probe dead-owner → `rename` to `.stale-<uuid>` → rm, thief lock always released; one takeover attempt per waiter | `packages/core/src/skills-ecosystem/locks.ts:357` (`tryStealStaleMutationGuard`), wired at `locks.ts:410` |
| R9/C1 lexical containment | New purely lexical `isLexicallyContained` (resolve+relative, component-aware, no realpath); `isPathSafe`, `isSubpathSafe`, `cleanupTempDir` all delegate to it | `packages/core/src/content/paths.ts:86`; `installer.ts:32`; `source-parser.ts:141`; `clone.ts:220` |
| R3/F3 truncated tree | `fetchRepoTree` throws `AcquisitionLimitError` naming the repo when the Trees API reports `truncated: true` — no partial skill sets | `packages/core/src/skills-ecosystem/github-api.ts:314` |
| R4 segment gate | `isCanonicalSkillPath` only rejects translated markers (`.hermes`/`.grok`/`translated`) at or below the last `.agents/skills` boundary; identical markers above stay canonical | `packages/core/src/skills-ecosystem/locks.ts:110` |
| R5/C5 copy race | `copyDir` walks children via `Promise.allSettled`, then throws the first rejection — every sibling finishes before failure surfaces | `packages/core/src/skills-ecosystem/installer.ts:153` |
| R6 guard wrap | All four lock mutators run their read-modify-write inside `withSkillMutationGuard`; hash computation and the canonical-path precondition stay outside (cheap fail-fast); each documents non-reentrancy | `locks.ts:571,598,742,776`; guard at `locks.ts:389` |
| R7/D11 basename | `SKILL_MD_RE = /(^|\/)skill\.md$/i` used by `findSkillMdPaths`, `getSkillFolderHashFromTree`, and blob folder derivation — exact basename, never suffix | `packages/core/src/skills-ecosystem/fetch.ts:83` (uses: `fetch.ts` discovery + `tryBlobInstall`) |
| R8 auth hint | Clone auth-failure message says `superskill skill add <ssh-url>`; legacy `npx skills` wording removed | `packages/core/src/skills-ecosystem/clone.ts:179` |
| Adjacent hardening — fan-out cap | >256 candidate SKILL.md paths is a terminal `AcquisitionLimitError` before any raw fetch | `packages/core/src/skills-ecosystem/fetch.ts:80` (enforced in `tryBlobInstall`) |
| R10/C2 dedupe | Installer's private `sanitizeName` copy deleted; installer/emit/operations import the single `./sanitize` implementation | `installer.ts:20`, `emit.ts:16`, `operations.ts:20` |
| R11/C3 filter identity | Blob path filters by `sanitizeName(folder) === wanted` (lock identity), while the download URL keeps `toSkillSlug` (skills.sh identity); both namespaces documented at the `slug` assignment | `packages/core/src/skills-ecosystem/fetch.ts` (`tryBlobInstall` filters + slug comment) |
| R12/D12 split | `fetch.ts` (1016 lines) split pure-move into `github-api.ts` (API/raw primitives, bounded reads, tree/commit fetch, materialization) + `clone.ts` (hardened clone + `cleanupTempDir`) + `fetch.ts` (discovery/blob install); fetch re-exports the prior 24-name surface | new `skills-ecosystem/github-api.ts`, `skills-ecosystem/clone.ts`; `fetch.ts` re-export footer |
| R13/D13 split | Marker helpers (hashing, `buildMarker`, `readOriginMarker`, `markerHashesCurrent`, `GrokBotOriginMarker`, `listRegularFilesRel`) moved to `grok-bot-marker.ts`; grok-bot re-exports `sha256File`/`readOriginMarker`/`markerHashesCurrent`/`GrokBotOriginMarker` | new `packages/core/src/operations/grok-bot-marker.ts`; imports/re-exports at `grok-bot.ts` header |
| R14/C6 snapshot binding | Manifest `SKILL.md` entry must byte-match the raw SKILL.md fetched from the inspected tree; missing or mismatched → install refused (null), not silently wrong content | `packages/core/src/skills-ecosystem/fetch.ts:345` |
| R2/S2 binary fidelity | `BotSkillEntry.files` is `Map<string, Buffer>`; staged bytes are hashed (`sha256Bytes`) and written verbatim; register-handoff `resources` stay UTF-8-text-only (binary omitted, `schemaVersion` 1) | `grok-bot.ts:258,457`; `grok-bot-marker.ts:37`; docs `04_DESIGN.md` + `plugins/cc/skills/grok-bot-register/SKILL.md` |
| R15 — docs and gates | Same-commit surface sync: handoff `resources` reworded to the text-only contract in both surface docs; `schemaVersion` stays 1 | `docs/04_DESIGN.md:53`; `plugins/cc/skills/grok-bot-register/SKILL.md:154`; `grok-bot.ts:514` |

#### Tests

New/updated regression coverage (all in the worktree diff):

- `packages/core/tests/skills-ecosystem/locks.test.ts` — residual-proof AC1 steal (real dead pid fires; live `process.pid` with every other trigger present leaves the guard byte-identical, no `.steal` residue); AC2 eight concurrent waiters, max-active 1; AC9 segment-awareness cases + global add under a translated-marker ancestor; AC12 20-concurrent local and global adds. Existing "guard composition" union test updated to the R6 self-guarding contract (it previously hand-wrapped the guard around now-self-guarding mutators, which would self-deadlock by design).
- `packages/core/tests/skills-ecosystem/fetch.test.ts` — AC8 truncated-tree rejection; AC13 exact-basename matching incl. `c/myskill.md` decoy; R8 auth message contains `superskill skill add git@…` and not `npx skills`; AC17 filter `my_skill` selects while `my-skill` does not and the download URL keeps slug `my-skill`; AC20 manifest byte-binding (mismatch → null, missing → null, identical → installs). Existing blob-install fixtures made contract-honest under R14 (manifests now embed the exact raw SKILL.md bytes).
- `packages/core/tests/skills-ecosystem/installer.test.ts` — AC10 copyDir settles 50 siblings + symlink before rejecting, destination listing stable; AC11 `FilesystemTransaction.rollback` restores the pre-transaction destination; `sanitizeName` import repointed to `./sanitize`.
- `packages/core/tests/content/paths.test.ts` — AC15 `isLexicallyContained`: equal, child, sibling-prefix `/x…` trap, `..` escape, cross-root, purely-lexical (no filesystem access).
- `packages/core/tests/operations/grok-bot.test.ts` — AC4 exact PNG magic bytes round-trip through bridge and full installs; AC5 marker hash equals `sha256File` of the installed file and `markerHashesCurrent` passes; AC6 handoff resources text-only (`é` preserved), binary omitted, `schemaVersion` 1. `entry()` fixtures updated to the `Map<string, Buffer>` contract.
- `apps/cli/tests/commands/install-post-actions.test.ts` — fixture entries updated to `Map<string, Buffer>` (type fallout of R15).

#### Checks

- `bun run lint` — PASS (Biome check + `turbo run typecheck`, all workspaces exit 0)
- `bun test packages/core` — PASS (1216 tests, 0 fail)
- `bun test plugins/cc` — PASS (135 tests, 0 fail)
- `bun test apps/cli` — PASS (1023 tests, 0 fail)
- Export surface: fetch 24 names identical, grok-bot 28 identical, barrel delta = {isLexicallyContained, tryStealStaleMutationGuard} only.

#### Notes

- `docs/04_DESIGN.md` was edited directly as the T3 same-commit surface sync: the register-handoff `resources` field is a documented surface (DTO) whose contract changed under R15/D8 (text-only UTF-8 resources; binary files materialize on disk but no longer appear in the JSON handoff). The edit is one paragraph rewording in the handoff schema description. `plugins/cc/skills/grok-bot-register/SKILL.md` got the matching consumer-facing resources paragraph.
- Known ceilings documented in code: a thief crashing between steal-lock create and release leaves a stale `.steal` dir blocking auto-recovery for that lock (`locks.ts` ponytail note); an ownerless guard (crash between guard mkdir and owner write) is treated as live until the bounded deadline (same file).

### Testing

**Pipeline verify results**

- Verdict: PASS (from verdict artifact)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| R1 | MET | locks.ts:357-380 two-phase steal; locks.test.ts:775-827 residual-proof AC1/AC2 |
| R2 | MET | grok-bot.ts:258,297,457-465 Map<string,Buffer> + fatal TextDecoder; grok-bot.test.ts:1138-1174 AC4/AC5/AC6 |
| R3 | MET | github-api.ts:328-331 truncated -> AcquisitionLimitError; fetch.test.ts:1222-1237 AC8 |
| R4 | MET | locks.ts:103-129 segment/boundary gate; locks.test.ts:834-849 incl. Windows form |
| R5 | MET | installer.ts:150-187 Promise.allSettled then rethrow; installer.test.ts:242-265 AC10, :267-283 AC11 |
| R6 | MET | locks.ts:571,598,742,776 self-guarding mutators, non-reentrant JSDoc; operations.ts:343,491 op-level; locks.test.ts:465-482, :881-894 AC12 |
| R7 | MET | fetch.ts:83 /(^\|\/)/skill\.md$/i; fetch.test.ts:1253-1269 decoy AC13 |
| R8 | MET | clone.ts:179 superskill skill add hint; fetch.test.ts:1286-1287 not-contains npx skills |
| R9 | MET | paths.ts:86 isLexicallyContained routed installer.ts:33/source-parser.ts:142/clone.ts:221; paths.test.ts:97-122 AC15 |
| R10 | MET | sanitize.ts:90 sole definition; importers installer.ts:20, emit.ts:16, operations.ts:20, fetch.ts:19 |
| R11 | MET | fetch.ts:249,318-319 sanitizeName filter identity, slug only for URL; fetch.test.ts:1290-1325 AC17 |
| R12 | MET | github-api.ts + clone.ts pure moves; fetch.ts:21-44 re-exports prior 24-name surface |
| R13 | MET | grok-bot-marker.ts pure move; re-exports grok-bot.ts:39-41; marker fail-never-overwrite hardening |
| R14 | MET | fetch.ts:347-350 md.contents !== skill.content -> null; fetch.test.ts:1326-1378 AC20; 5 fixtures contract-honest |
| R15 | MET | docs/04_DESIGN.md:53-55 + SKILL.md:154-155 text-only resources; schemaVersion 1 at grok-bot.ts:514 |
- Coverage: N/A (verdict-based; verify pipeline does not measure code coverage)

### Review

<!-- spur:record-review -->

**SECU findings** (pipeline verify step — verdict: PASS)

| Priority | Dimension | Location | Finding |
|----------|-----------|----------|----------|
| P4 | — | — | No P1–P3 findings; verify verdict PASS |

### References

- Origin: the advisory `/sp:dev-review packages --agent inline --focus all` run on 2026-09-23 (SECUA via `sp:code-verification` in review mode, plus architecture via `sp:code-improvement`), path mode, on `main@09ad0cd`.
- Source anchors (re-verified 2026-09-23):
  - `packages/core/src/skills-ecosystem/locks.ts:102-118,158,296-297,310-377,520,543,682-727`
  - `packages/core/src/skills-ecosystem/fetch.ts:27-36,91-96,131-149,242-249,336-342,393-396,463,505-516,585,603-681,682-731,757,868,950-960,995-1004`
  - `packages/core/src/skills-ecosystem/installer.ts:26-46,149-196,290-307`
  - `packages/core/src/skills-ecosystem/sanitize.ts:90-105`
  - `packages/core/src/skills-ecosystem/source-parser.ts:139-144`
  - `packages/core/src/skills-ecosystem/operations.ts:14-15,205-218,349,497,868,906`
  - `packages/core/src/skills-ecosystem/emit.ts:15`
  - `packages/core/src/content/paths.ts:72-107`
  - `packages/core/src/operations/grok-bot.ts:60,249-268,280-311,389,441,478-513,528-613,836-844,870,974,978`
  - `packages/core/src/index.ts:70-83`
- Consumers to keep compiling unchanged: `apps/cli/src/commands/install-post-actions.ts:10,29` (`BotSkillEntry`), `apps/cli/src/commands/update.ts:28` (`sanitizeName`), `apps/cli/src/commands/skill.ts:449-451` (the `skill add` command named in R8).
- Tests to extend:
  - `packages/core/tests/skills-ecosystem/locks.test.ts:26-33` (canonical path), `:187` (XDG isolation), `:418` onward (guard suite), `:494-509` (dead-owner steal)
  - `packages/core/tests/skills-ecosystem/fetch.test.ts:79` (`findSkillMdPaths`), `:106`/`:482` (`fetchRepoTree`), `:307`/`:335` (`GitCloneError`), `:756` (`materializeRepoSubdir`), `:976` (bounded acquisition)
  - `packages/core/tests/skills-ecosystem/installer.test.ts:133,145-157` (`copyDir`)
  - `packages/core/tests/operations/grok-bot.test.ts:164,242,828`
  - `packages/core/tests/skills-ecosystem/{sanitize,sanitize-name,subpath-traversal,source-parser}.test.ts`
- Docs: `docs/04_DESIGN.md:49-55` (grok-bot handoff), `plugins/cc/skills/grok-bot-register/SKILL.md:140-151`, `docs/00_ADR.md` ADR-036 (grok-bot scope, `:665`), ADR-037 (post-install actions, `:729`).
- Conventions:
  - `AGENTS.md` § Testing: residual-proof negatives carry every trigger half and are labeled honestly (applies to AC1 and AC9).
  - `.spur/context/pitfalls.md`: no `mock.module` in core tests (use real temp-directory fixtures), JSDoc sits directly above its export, and `file:line` anchors must be re-read.
- External: GitHub REST "Get a tree", where `truncated` is set when the recursive listing exceeds its limits (https://docs.github.com/en/rest/git/trees#get-a-tree); `TextDecoder` `fatal` option (https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder/fatal).

### History

- 2026-09-24T04:30:19.535Z todo → wip (system)
- 2026-09-24T05:36:54.374Z wip → testing (system)
- 2026-09-24T05:37:55.923Z testing → done (system)

