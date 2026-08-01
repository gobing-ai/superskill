---
template: review
schema_version: 1
name: Fix skills-ecosystem SECUA and architecture review findings
description: ""
status: done
type: task
profile: standard
feature_id: F2
parent_wbs: null
priority: P2
tags: [review]
dependencies: []
created_at: 2026-07-26T00:26:35.312Z
updated_at: 2026-08-01T00:24:29.583Z
---

## 0106. Fix skills-ecosystem SECUA and architecture review findings

### Background
The standalone `sp-dev-review packages --focus all` found six reproducible defects in the
skills-ecosystem install path. Robin explicitly requested fixing all findings and both architectural
deepening candidates.

#### Review Findings

| Severity | File | Finding | Recommendation |
| -------- | ---- | ------- | -------------- |
| P1 | `packages/core/src/skills-ecosystem/installer.ts` | `copyDir` follows source symlinks and can copy arbitrary readable host files. | Reject symbolic links and non-regular filesystem entries before reading. |
| P2 | `packages/core/src/skills-ecosystem/locks.ts` | Folder hashing concatenates path/content without framing, so distinct trees collide structurally. | Length-frame every path and byte payload before hashing. |
| P2 | `packages/core/src/skills-ecosystem/operations.ts` | Add/update bypass `parseSource`, dropping `@skill`, `#ref`, and subpath semantics. | Parse once into a typed source plan and thread it through blob/clone/discovery. |
| P2 | `packages/core/src/skills-ecosystem/operations.ts` | Removal sanitizes away exact lock identities, discards target failures, and always reports success. | Resolve lock-key-first, stage removals, and propagate residual failures. |
| P2 | `packages/core/src/skills-ecosystem/operations.ts` | Filesystem emission happens before lock-version compatibility is known, leaving partial state after rejection. | Preflight the lock and keep filesystem changes reversible until lock persistence succeeds. |
| P2 | `packages/core/src/skills-ecosystem/operations.ts` | Global relative local sources are persisted relative to the install cwd and break updates from another cwd. | Persist resolved absolute local paths in global locks. |

Architectural candidates included with the findings:

- C1: make `parseSource` the sole source-resolution boundary for add and update.
- C2: introduce one reversible filesystem mutation transaction used by installation and removal.
### Requirements
- R1. Reject source symlinks and special files before canonical or target copying; ordinary files and directories retain mode/content behavior.
- R2. Canonical and snapshot hashes frame path and content boundaries so distinct file trees cannot produce the same preimage by concatenation ambiguity.
- R3. Add and update consume `parseSource` output and honor local paths, GitHub shorthand, `@skill`, `#ref`, subpaths, and clone refs through one resolution seam.
- R4. Removal preserves raw lock identities, returns failure on any canonical/target deletion failure, and retains recoverable lock state until all removals are staged.
- R5. Add/remove mutations are reversible until the compatible lock is written; version mismatch or lock-write failure leaves canonical and target state unchanged.
- R6. Global local-source entries persist an absolute source path so update behavior is independent of invocation cwd.
- R7. Existing direct/symlink/translate behavior, lock schemas, source-parser public compatibility, and npx interop remain intact.
### Acceptance Criteria
1. A source skill containing an absolute or relative symlink is rejected, and the linked bytes never appear in canonical or target output.
2. Trees `{a: "bc"}` and `{ab: "c"}` produce different canonical hashes; equivalent trees remain deterministic.
3. `owner/repo@wanted` selects only `wanted`; `#ref` and subpath values reach both blob and clone/discovery paths.
4. Removing a lock key such as `ce:review` deletes that exact entry; an injected filesystem failure returns `success: false` and does not discard the lock.
5. Adding against an unsupported lock version or an injected lock-write failure leaves canonical and target paths byte-for-byte unchanged.
6. A global install from `./src` stores an absolute source and updates successfully from a different cwd.
7. Focused regression tests, full lint, full tests, build, strict task check, and `spur-check` pass.
### Q&A

<!-- Clarifications, false positives, accepted risk, and triage decisions. -->

### Design
**Implementation shape.**

- C1 — source seam: `operations.ts` parses every source with `parseSource` and derives a typed
  resolution plan (`localPath`, canonical clone URL, source type, ref, subpath, skill filter).
  Add and update share the plan; `fetch.ts` remains the GitHub fast-path/clone adapter.
- C2 — mutation seam: a small filesystem transaction stages same-parent replacements/removals,
  records backups, and exposes `commit`/`rollback`. Emission prepares canonical and target changes
  but does not discard backups until the owning operation persists the lock. Public direct emission
  and removal helpers remain convenience wrappers that prepare and immediately commit.
- Lock writers retain their on-disk version guard. Operations validate warned locks before mutation;
  a concurrent version change is caught by the writer and triggers transaction rollback.
- Hash input uses explicit byte-length framing for each relative path and content payload. The
  schema fields and SHA-256 algorithm remain unchanged.
- Global local sources store their resolved absolute path. Project-local locks may retain relative
  paths because their lock cwd is the resolution anchor.

**Tradeoff.** Cross-filesystem atomicity is impossible. Same-parent rename plus retained backups
provides reversible publication; if backup cleanup fails after a successful lock write, the current
state remains valid and cleanup is best-effort.
### Plan
- [x] Add residual-proof regressions for symlink copying and structural hash collision.
- [x] Wire `parseSource` into add/update and cover filters, refs, subpaths, clone fallback metadata, and global relative sources.
- [x] Add reversible replace/remove transaction primitives and prepare/commit emission APIs.
- [x] Make add/remove preflight and persist one scoped lock mutation before transaction commit.
- [x] Re-run focused tests, full gates, and a SECUA/architecture re-review.
### Solution
- `packages/core/src/skills-ecosystem/installer.ts:149` rejects symlink roots, symlink entries,
  and special files, opens regular files with `O_NOFOLLOW`, and preserves file/directory modes.
  `FilesystemTransaction` at line 240 stages same-parent backups and exposes commit/rollback.
- `packages/core/src/skills-ecosystem/locks.ts:123` length-frames path/content fields and sorts
  encoded paths by UTF-8 bytes. Raw writers at lines 281 and 391 reject every unsupported caller
  version before creating or replacing a lock.
- `packages/core/src/skills-ecosystem/operations.ts:32` makes parsed source plans the sole add/update
  resolution seam. `resolveLockedSource` at line 46 merges persisted ref, `skillPath`, and skill
  identity once; update at line 549 reuses that plan for hashing and installation and propagates
  per-skill failure through the aggregate result.
- Add and remove own one filesystem transaction through lock persistence
  (`operations.ts:218-304`, `:444-501`). Removal resolves exact raw lock identities before sanitized
  aliases (`emit.ts:326`); global local sources persist absolute paths.
- `packages/core/src/skills-ecosystem/fetch.ts:533` rejects unsupported transports and places `--`
  before every untrusted repository positional argument. `apps/cli/src/commands/skill.ts:359`
  returns exit 1 with the aggregate update error.
- `packages/core/tests/skills-ecosystem/emit.test.ts:171` isolates the canonical-install failure
  fixture under an injected temporary home, so repository-local canonical state cannot change the
  asserted error or trigger out-of-scope filesystem mutations.
- ADR-029/030/031 and the architecture/design surfaces document the parser, transaction, and
  length-framed hash contracts. The accepted residual is cross-filesystem atomicity: same-parent
  rename backups keep the supported publication path reversible.
### Testing
_Evidence captured 2026-07-26T19:49:51Z._

| Req | Status | Evidence |
| --- | --- | --- |
| R1 | MET | `installer.ts:149-195`; symlink/special-file regressions and mode preservation in `installer.test.ts:146-196`. |
| R2 | MET | `locks.ts:123-145`; structural collision and byte-order regressions in `locks.test.ts:66-102`. |
| R3 | MET | `operations.ts:32-63`, `:106-137`, `:549-638`; filter/ref/subpath and persisted-plan regressions in `operations.test.ts:269-307`, `:512-579`. |
| R4 | MET | `emit.ts:326-346`; transactional removal in `operations.ts:444-501`; exact-key and rollback regressions in `emit.test.ts:251-260`, `operations.test.ts:378-438`. |
| R5 | MET | `operations.ts:218-304`, `:444-501`; lock preflight/write rollback in `operations.test.ts:440-480`; raw version guards in `locks.test.ts:276-335`. |
| R6 | MET | Global local source normalization in `operations.ts:33-43`; cross-cwd regression in `operations.test.ts:482-509`. |
| R7 | MET | Direct/symlink/translate matrix in `emit.test.ts:11-60`; vendor lock round trips in `locks.test.ts:338-405`; npx interop in `npx-interop.test.ts:19-171`; full suite and gates pass. |

| AC | Status | Evidence Type | Evidence |
| --- | --- | --- | --- |
| AC1 | MET | Test | `installer.test.ts:146-170` proves absolute/relative links are rejected and linked bytes do not land. |
| AC2 | MET | Test | `locks.test.ts:66-102` proves ambiguous trees differ, hashes are deterministic, and ordering is byte-stable. |
| AC3 | MET | Test | `operations.test.ts:269-307`, `:512-555` proves filter, ref, and subpath reach blob/clone/update paths. |
| AC4 | MET | Test | `emit.test.ts:251-260` and `operations.test.ts:378-438` prove exact lock deletion and rollback with `success: false`. |
| AC5 | MET | Test | `operations.test.ts:440-480` and `locks.test.ts:296-335` prove incompatible/write-failed locks leave prior state intact. |
| AC6 | MET | Test | `operations.test.ts:482-509` proves absolute persistence and update from another cwd. |
| AC7 | MET | Command | `bun run spur-check`, `bun run build`, strict task check, and feature B check all pass. |

- `bun run spur-check`: PASS — Biome checked 214 files; core and CLI typechecks passed; 31/31
  enabled pre-check rules passed; 1,917 tests passed with 0 failures and 5,186 assertions across
  100 files; aggregate coverage is 98.92% lines / 99.65% functions; all 3 post-check rules passed.
- `bun run build`: PASS — portable validator generated and CLI bundled/compiled.
- `spur task check 0106 --strict-core --json`: PASS; `spur feature check B --json`: PASS.
- `emit.test.ts:171-193` now isolates the canonical-install failure fixture under an injected
  temporary home, preventing repository-local state from changing the asserted failure path.
- Design conformance: C1 and C2 are implemented; ADR-029/030/031 boundaries remain intact; no
  cross-filesystem atomicity claim was introduced.
- Scope creep: PASS — every change closes R1-R7 or a residual at the same trust/transaction boundary.
- SECUA: PASS — no unresolved blocker/major finding. Git option injection, symlink reads,
  incompatible lock writes, rollback failures, and identity collisions have residual-proof tests.
- Verification artifact disclosed by this fix pass: `.spur/run/0106-verdict.json:1`.
### Review
**Verdict: PASS**

**P1–P4 priority findings** (reviewer's priority ordering; original findings from the 2026-07-25 `sp-dev-review packages --focus all` run, status after this fix pass):

| # | Severity | Title | Location | Status |
|---|----------|-------|----------|--------|
| 1 | P1 | `copyDir` follows source symlinks, copying arbitrary readable host files | `packages/core/src/skills-ecosystem/installer.ts` | FIXED — symlink roots/entries and special files rejected; regular files opened with `O_NOFOLLOW` (installer.ts:149-195) |
| 2 | P2 | Folder hashing concatenates path/content without framing; distinct trees collide | `packages/core/src/skills-ecosystem/locks.ts` | FIXED — byte-length framing per path/content field, UTF-8 byte-sorted (locks.ts:123-145) |
| 3 | P2 | Add/update bypass `parseSource`, dropping `@skill`, `#ref`, subpath semantics | `packages/core/src/skills-ecosystem/operations.ts` | FIXED — parsed source plan is the sole add/update resolution seam (operations.ts:32-63) |
| 4 | P2 | Removal sanitizes away exact lock identities, discards failures, always reports success | `packages/core/src/skills-ecosystem/operations.ts` | FIXED — lock-key-first resolution, staged transactional removal, residual failure propagated (operations.ts:444-501, emit.ts:326-346) |
| 5 | P2 | Filesystem emission before lock-version compatibility known; partial state after rejection | `packages/core/src/skills-ecosystem/operations.ts` | FIXED — lock preflight + one transaction through lock persistence with rollback (operations.ts:218-304) |
| 6 | P2 | Global relative local sources persisted relative to install cwd; updates break cross-cwd | `packages/core/src/skills-ecosystem/operations.ts` | FIXED — global local sources persist resolved absolute paths (operations.ts:33-43) |

No open P1–P4 findings remain in the changed skills-ecosystem paths.

All six reported defects and C1/C2 are resolved with residual-proof coverage. Re-review found no
remaining P1/P2 defect in the changed skills-ecosystem paths: source reads reject symlinks/special
files; hashes are structurally unambiguous; add/update share `ParsedSource`; removal preserves raw
identity and propagates failure; canonical/target changes roll back through lock persistence; and
global local sources are cwd-independent.

The earlier blocker is cleared: the bundled `prefer-accessible-role-for-button-queries` pre-check
no longer fails — fresh `bun run spur-check` on 2026-07-26 passes 31/31 pre-check rules (including
that rule) and 3/3 post-check rules, with lint, the full 1,917-test suite, and build green. Strict
task check and feature B check both pass. No open findings.
### References
- Parent feature task: 0097.
- Original review: `sp-dev-review packages --auto --focus all --fix all`, 2026-07-25.
- Binding architecture: `docs/00_ADR.md` ADR-028.
- Surface contract: `docs/04_DESIGN.md` § Skills-ecosystem module surface.
### History
- 2026-07-26T00:29:23.850Z todo → wip (system)
- 2026-07-26T00:45:07.752Z wip → testing (system)
- 2026-07-26T19:30:55.471Z testing → wip (system)
- 2026-07-26T19:35:02.397Z wip → testing (system)
- 2026-07-26T19:45:42.791Z testing → wip (system)
- 2026-07-26T19:46:26.621Z wip → testing (system)
- 2026-07-26T19:51:29.640Z testing → done (system)
