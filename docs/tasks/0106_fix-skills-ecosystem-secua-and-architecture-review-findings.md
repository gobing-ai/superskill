---
template: review
schema_version: 1
name: "Fix skills-ecosystem SECUA and architecture review findings"
description: ""
status: testing
type: review
profile: standard
feature_id: B
parent_wbs: null
priority: P2
tags: ["review"]
dependencies: []
created_at: "2026-07-26T00:26:35.312Z"
updated_at: "2026-07-26T00:45:07.752Z"
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
  and special files; regular files use `O_NOFOLLOW`. `FilesystemTransaction` at line 239 stages
  same-parent backups and exposes commit/rollback; canonical installation uses it at line 312.
- `packages/core/src/skills-ecosystem/emit.ts:63` and `:243` retain canonical and target
  emission/removal mutations in the caller's transaction. Direct helper calls commit on success
  and roll back on failure.
- `packages/core/src/skills-ecosystem/locks.ts:123` length-frames every path/content field for
  canonical and blob hashes. Lock writes use same-parent temporary replacement at line 223.
- `packages/core/src/skills-ecosystem/operations.ts:32` makes `ParsedSource` the sole source plan.
  Add at line 84 and remove at line 412 preflight lock versions, mutate one in-memory lock, write
  once, then commit or roll back. Update at line 517 reuses the same parser seam. Global local
  sources persist absolute paths; removal resolves exact raw lock keys.
- ADR-029/030/031 and the architecture/design surfaces document the parser, transaction, and
  length-framed hash contracts.
### Testing
_Evidence captured 2026-07-26T00:44:01Z._

- Focused skills-ecosystem suite: 273 passed, 0 failed.
- `bun run lint`: PASS (Biome + both workspace typechecks).
- `bun run test`: PASS — 1,872 passed, 0 failed, 4,787 assertions; aggregate 98.90% lines /
  99.64% functions; every touched file remains above the per-file gate.
- `bun run build`: PASS.
- `bun run test-post-check`: PASS — coverage gate, citation resolution, and TSDoc exports.
- `bun run spur-check`: BLOCKED before tests by the pre-existing bundled
  `prefer-accessible-role-for-button-queries` rule: `rg` receives no eligible files and exits 2.
  The other 30 enabled pre-check rules passed. This rule is not defined in this repository and is
  outside task 0106's packages/core scope.
### Review
**Verdict: PARTIAL**

All six reported defects and C1/C2 are resolved with residual-proof coverage. Re-review found no
remaining P1/P2 defect in the changed skills-ecosystem paths: source reads reject symlinks/special
files; hashes are structurally unambiguous; add/update share `ParsedSource`; removal preserves raw
identity and propagates failure; canonical/target changes roll back through lock persistence; and
global local sources are cwd-independent.

One verification back-issue prevents a PASS verdict: the bundled
`prefer-accessible-role-for-button-queries` pre-check is misconfigured for this repository and
causes `spur-check` to stop on ripgrep exit 2 when no eligible UI files exist. It pre-dates and is
independent of these fixes; lint, full tests, build, and all post-check rules pass.

| Severity | File | Finding | Recommendation |
| -------- | ---- | ------- | -------------- |
| P2 | Bundled Spur recommended preset | `prefer-accessible-role-for-button-queries` treats the valid no-eligible-files case as an evaluator error. | Fix the owning Spur rule/evaluator to treat ripgrep exit 2 from an empty eligible file set as a skip/pass, then rerun `spur-check`. |
### References
- Parent feature task: 0097.
- Original review: `sp-dev-review packages --auto --focus all --fix all`, 2026-07-25.
- Binding architecture: `docs/00_ADR.md` ADR-028.
- Surface contract: `docs/04_DESIGN.md` § Skills-ecosystem module surface.
### History
- 2026-07-26T00:29:23.850Z todo → wip (system)
- 2026-07-26T00:45:07.752Z wip → testing (system)
