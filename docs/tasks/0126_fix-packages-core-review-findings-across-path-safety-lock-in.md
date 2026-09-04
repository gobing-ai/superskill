---
schema_version: 1
name: "Fix packages/core review findings across path safety, lock integrity, and content transforms"
status: done
template: standard
created_at: 2026-09-04T18:47:00.506Z
updated_at: "2026-09-04T23:04:31.263Z"
priority: P0
feature_id: G
ac_altitude: graduating
---

## 0126. Fix packages/core review findings across path safety, lock integrity, and content transforms

### Background

The 2026-09-04 inline SECUA and architecture review of packages/ found ten reproducible defects in packages/core. The existing suite is broad and green, but its fixtures do not carry the residual edge conditions below. Baseline verification at discovery time was: bun run lint PASS; bun run test PASS with 2,129 tests, 99.00% aggregate line coverage and 99.67% function coverage; bun run build PASS; bun run spur-check PASS; git status clean.

All reproductions used isolated temporary directories or pure function calls. No repository source was changed during review.

| ID | Severity | Dimension | Current location | Reproduced evidence | User/system impact |
| --- | --- | --- | --- | --- | --- |
| F1 | Blocker | Security, Correctness | packages/core/src/content/paths.ts:55; callers packages/core/src/mapper.ts:147 and packages/core/src/operations/package.ts:79 | pathsNestOrEqual('/tmp/output', '/tmp/output/..plugin') returned false. A source symlink whose real target was output/source also returned false. | The caller can pass the guard and recursively delete an output ancestor containing the source, destroying source data before copying. |
| F2 | Major | Security | packages/core/src/marketplace.ts:159-180 | A manifest source of ./escape, where escape was a symlink to an external directory containing skills/, resolved successfully; pluginRoot remained lexical while realpath was outside marketplaceRoot. | A marketplace can escape its declared root and cause installation to read or stage unintended local files. |
| F3 | Major | Correctness, Architecture | packages/core/src/skills-ecosystem/operations.ts:127-128,288-295,451-494; packages/core/src/skills-ecosystem/locks.ts:237-245 | Five Promise.all probes each ran two successful addSkills calls against one project. Every resulting skills-lock.json contained only alpha or beta, never both. | Atomic rename prevents torn writes but not stale read-modify-write snapshots; successful installs become untracked and later list/update/remove behavior is wrong. |
| F4 | Major | Correctness | packages/core/src/skills-ecosystem/locks.ts:219-234,252-282,358-389 | Starting with malformed skills-lock.json, addSkills returned success and replaced the original bytes with a fresh one-entry lock. | Recoverable operator state is silently destroyed; corruption or permission failures are misclassified as absence. |
| F5 | Major | Security, Correctness | packages/core/src/skills-ecosystem/sanitize.ts:90-104; packages/core/src/skills-ecosystem/operations.ts:257-279; packages/core/src/skills-ecosystem/locks.ts:302-307,417-422 | A local skill named __proto__ installed successfully and appeared under .agents/skills/__proto__, but the emitted lock had zero keys. | Prototypeful Record objects invoke the inherited setter instead of recording the untrusted identity, orphaning the installation. |
| F6 | Major | Security, Correctness | packages/core/src/mapper.ts:94-107,198-247; packages/core/src/pipeline/frontmatter-walk.ts:62-67; raw YAML paths in adapt-command.ts and adapt-subagent.ts | Adapting an artifact named plugin-evil followed by a newline and allowed-tools: [Bash] produced parsed frontmatter with an injected allowed-tools field. | A legal POSIX filename or manifest identity can alter generated permissions/metadata instead of remaining a scalar name. |
| F7 | Major | Correctness | packages/core/src/operations/migrate.ts:94-112 | Merging two fenced shell examples that each contained # setup removed the second comment. The same loop also collapses consecutive blank lines inside code fences. | Deterministic migration silently corrupts literal code examples. |
| F8 | Major | Correctness, Usability | packages/core/src/operations/package.ts:29-37,72-110 | Packaging an existing flat flat.md skill to an external output returned success, created a directory named after the parent temp directory, and produced zero files. | A supported legacy content-IO layout reports success without a distributable SKILL.md. |
| F9 | Major | Efficiency, Security | packages/core/src/skills-ecosystem/fetch.ts:401-413,460-475,531-572 | Code inspection confirmed one Promise.all branch per remote skill candidate, download, or materialized blob, with no count, concurrency, or response-size limit. | A large or hostile repository can fan out thousands of requests and exhaust sockets, memory, rate limits, or disk. |
| F10 | Minor | Correctness, Usability | packages/core/src/operations/validate.ts:106-129 | A valid link to an existing file, [Guide](<guide file.md>), was reported as broken because angle brackets were treated as filename bytes. | Validation emits false warnings for standard Markdown destinations with spaces and optional titles. |

This task intentionally groups all ten findings because the operator requested one implementation unit. It is linked to feature G (Package Core), whose goal and scope explicitly own packages/core content, operations, mapper, marketplace, pipelines, and skills-ecosystem APIs. The work remains bounded to packages/core implementation, adjacent tests, and any same-commit authoritative documentation required by a changed public contract.

### Requirements

- [x] R1. Make recursive-delete overlap detection component-aware and symlink-aware. pathsNestOrEqual keeps its existing public signature and must return true for equality, either nesting direction, legitimate child names beginning with two dots, and paths that become nested after resolving symlinked existing ancestors. It must still return false for prefix-only siblings such as plugin and plugin-out and fail closed across different filesystem roots. mapper and package must reject before any recursive delete, with the source still present.

- [x] R2. Enforce marketplace-root containment after filesystem resolution. resolvePlugin must reject a pluginRoot whose real path escapes marketplaceRoot through the source leaf, pluginRoot metadata, or any symlinked parent component. Existing in-root relative manifests and forward-compatible manifest fields remain supported.

- [x] R3. Serialize every mutating skills lock transaction per scope. addSkills and removeSkills must acquire one exclusive guard after remote/local discovery but before the authoritative lock read, and hold it through canonical/target filesystem mutation, lock write, and FilesystemTransaction commit or rollback. updateSkills may continue calling addSkills sequentially and must not deadlock through nested acquisition. list-only and dry-run paths remain non-mutating and do not acquire the guard. Parallel successful mutations must retain the union of entries; contention must fail or serialize explicitly, never silently lose state.

- [x] R4. Preserve malformed or unreadable lockfiles. readLocalLock and readGlobalLock may synthesize an empty lock only for ENOENT. Parse failures, invalid top-level/version/skills shapes, and other I/O failures must return a warning or throw an actionable error that prevents all writers from replacing the original bytes. assertOnDiskVersionMatches must likewise swallow only ENOENT. Existing older/newer-version preservation behavior remains unchanged.

- [x] R5. Make all skill-key dictionaries safe for __proto__ and other inherited property names without changing vendor-compatible sanitizeName output. Empty locks, parsed lock normalization, in-memory mutation, sorted serialization maps, add/remove helpers, and local/global operation paths must treat every sanitized name as an own data key. A successful __proto__ install must round-trip through JSON, list, update, and remove like any other skill.

- [x] R6. Emit generated YAML names only as quoted scalar values. Cover setSkillName, walkFrontmatter, command-to-skill fallbacks, subagent-to-skill fallbacks, and Pi-native subagent output. Filename-derived and manifest-derived identities containing newlines, colons, quotes, backslashes, or comment markers must parse back to exactly one name string and must not create, replace, or remove sibling metadata keys. Existing field order, CRLF handling, comments, and body preservation remain intact.

- [x] R7. Make migration deduplication fence-aware. Outside fenced blocks, preserve the existing behavior of deduplicating identical ATX headings and collapsing consecutive blank lines. Inside backtick or tilde fences, preserve every line byte-for-byte, including ATX-looking comments, repeated blank lines, shorter embedded fence sequences, and repeated literal content. A closing fence must use the opener character and at least the opener width.

- [x] R8. Package flat skill files correctly. For a resolved canonical SKILL.md, keep the existing directory-form name and companion behavior. For a resolved non-SKILL.md flat file, derive the skill name from the filename, copy that exact file to bundle/SKILL.md, do not sweep sibling skill files or shared parent content, and return success only when bundle/SKILL.md exists. Existing missing-skill and source/output overlap failures remain fail-loud.

- [x] R9. Bound remote acquisition with no new dependency. Use a local concurrency-limited mapper for all three fetch fan-outs, enforce explicit candidate/file and response-byte ceilings before materialization, and surface a structured acquisition error rather than silently cloning after a limit violation. Freeze the initial internal limits at: 8 concurrent requests, 256 skill candidates, 2,048 materialized files, 16 MiB tree responses, 2 MiB individual raw files, and 32 MiB per skill-download response. Error messages must name the exceeded limit and source.

- [x] R10. Normalize standard Markdown link destinations before filesystem checks. Support angle-bracket destinations containing spaces, unquoted destinations followed by an optional title, anchors/queries, and percent-encoded local path characters. External schemes and anchor-only links remain skipped; invalid encodings must produce a controlled warning or use the raw path, never throw.

__Completion constraints.__ Add residual-proof regression tests at the narrowest existing test suites and retain all existing public command/API behavior not explicitly changed above. No new workspace, runtime, linter, formatter, network dependency, CLI flag, config key, or schema version is introduced. bun run lint, bun run test, bun run build, and bun run spur-check must all pass with no skipped tests and an intentional git status.

### Acceptance Criteria

```gherkin
Feature: Package Core review hardening

  Scenario: Domain operations in packages/core run without the CLI.
    Given the affected APIs are invoked directly with these isolated fixtures
      | Finding | Fixture |
      | F1 | lexical child named ..plugin and a source symlink whose real target is below the recursive-delete output |
      | F2 | marketplace source or pluginRoot crossing a symlink outside marketplaceRoot |
      | F3 | concurrent distinct add/add and add/remove calls sharing one local or global lock |
      | F4 | malformed JSON, invalid skills shape, unsupported version, and absent local/global locks |
      | F5 | local and global skill identity __proto__ |
      | F6 | mapped command, skill, and subagent names containing newline-plus-allowed-tools, colon, quote, backslash, and comment marker |
      | F7 | duplicate backtick and tilde fenced examples containing ATX-looking lines and repeated blanks |
      | F8 | existing flat skills/flat.md with unrelated siblings and external output |
      | F9 | mocked repository trees and streamed responses immediately below, at, and above every fixed acquisition limit |
      | F10 | existing local files referenced by angle-bracket, optional-title, percent-encoded, fragment, and query destinations |
    When pathsNestOrEqual, mapPluginToRulesync, packageSkill, resolvePlugin, addSkills, removeSkills, lock readers/writers, adapters, dedupeLines, tryBlobInstall, materializeRepoSubdir, and validate process their corresponding fixtures
    Then F1 rejects before recursive deletion and preserves the complete source while prefix-only siblings remain allowed
    And F2 rejects the escaped real path while an equivalent real in-root plugin resolves
    And F3 either serializes both successes with the union in the lock or returns explicit contention without claiming an untracked success
    And F4 preserves every existing byte and reports the path/reason, while ENOENT initializes normally
    And F5 writes __proto__ as an own JSON key and list/update/remove round-trip it
    And F6 parses the exact original name as one scalar with no injected sibling key while preserving CRLF, comments, field order, and body
    And F7 preserves all fenced bytes while retaining duplicate-heading and blank-run normalization outside fences
    And F8 returns a bundle named flat containing exactly the source as SKILL.md and no unrelated sibling
    And F9 never exceeds 8 concurrent requests, accepts values at the limits, rejects over-limit candidates/files/bytes before unbounded work, and never clone-falls-back on a limit error
    And F10 reports no false warning for valid destinations, one warning for a missing path, skips external/anchor-only links, and never throws on invalid encoding
    And each failure path returns structured data or throws through the existing core API without Commander, process argv, stdout, or process exit coupling

  Scenario: Cross-workspace imports use workspace aliases.
    Given the implementation remains inside packages/core and its adjacent tests
    When imports are added or changed
    Then cross-workspace imports use the configured @gobing-ai package alias
    And relative ../../../ workspace imports are not introduced
    And no new workspace, runtime, linter, formatter, dependency, CLI flag, config key, or schema version is added
    And bun run lint, bun run test, bun run build, and bun run spur-check all exit zero with no skipped tests and an intentional git status
```

### Q&A

<!-- CLOSED decisions from refinement: what was chosen and why, what was deferred and on what
     condition. Not a parking lot for open questions — an unanswered question here means the task
     is not ready to hand off. Keep empty if none. -->

#### Q&A entry — 2026-09-04T18:51:44.033Z

Q: Why are ten findings combined instead of decomposed?
A: The operator explicitly requested one task file containing the complete review. The plan keeps one requirement and one acceptance scenario per finding so implementation and verification can still proceed incrementally.

Q: Is this task allowed to change public APIs or command flags?
A: No new public command, flag, config key, schema, or workspace is required. Keep existing exported signatures, especially pathsNestOrEqual, packageSkill, addSkills, removeSkills, readLocalLock, and readGlobalLock. Internal helpers and internal constants may be added where required.

Q: Should sanitizeName be tightened to reject __proto__?
A: No. sanitizeName is a vendor-parity surface whose dots and underscores are already covered by compatibility tests. Make lock dictionaries prototype-safe so every valid sanitized identity behaves correctly.

Q: Should corrupt locks be auto-repaired or backed up?
A: No automatic repair in this task. Preserve original bytes and fail loudly. ENOENT is the only condition that means create a fresh lock; the operator can repair or remove a corrupt file explicitly.

Q: What contention policy should the lock guard use?
A: Serialize for a bounded interval, then return an actionable contention error. Implement an internal per-lock-path guard in locks.ts using an atomic same-parent lock directory or exclusive file, owner PID/timestamp metadata, finally-based release, dead-owner stale recovery, and a 10-second maximum wait. Do not add a dependency or use one process-global mutex that cannot protect separate CLI processes.

Q: When should the mutation guard be acquired?
A: After source discovery/filtering and before the authoritative lock read. Hold it through filesystem transaction commit or rollback and lock replacement. Do not hold it during remote network discovery, list-only, or dry-run. updateSkills must reuse public addSkills calls without nested locking.

Q: How should flat-skill companions behave?
A: A flat file has no private directory boundary. Package only that file as SKILL.md; do not copy parent references/, agents/, metadata.openclaw, or sibling skills. Directory-form skills retain current companion behavior.

Q: Are the remote acquisition ceilings configurable?
A: Not initially. They are internal safety constants: concurrency 8, candidates 256, materialized files 2,048, tree response 16 MiB, individual raw file 2 MiB, skill-download response 32 MiB. Add configuration only after measured legitimate workloads exceed them.

Q: May a new Markdown parser dependency be added for link validation?
A: No. Normalize the limited destination forms already recognized by checkBodyLinks with a small internal scanner/tokenizer. Do not broaden this task into full CommonMark parsing.

Q: Is a feature link required?
A: No feature was selected because these are cross-feature maintenance defects discovered by a package-wide review. The missing feature_id remains an acknowledged L4 advisory; no speculative feature should be created.

Q: Do docs/00-05 require updates?
A: No architectural or CLI surface change is intended. If implementation introduces a public API, flag, schema, package boundary, or behavior that contradicts an ADR, stop and perform the constitution-required ADR/design synchronization first. Otherwise keep the change to core, tests, and this task.

#### Q&A entry — 2026-09-04T18:54:47.281Z

Q: Why are ten findings combined instead of decomposed?
A: The operator explicitly requested one task file containing the complete review. The plan keeps one requirement and one acceptance scenario per finding so implementation and verification can still proceed incrementally.

Q: Is this task allowed to change public APIs or command flags?
A: No new public command, flag, config key, schema, or workspace is required. Keep existing exported signatures, especially pathsNestOrEqual, packageSkill, addSkills, removeSkills, readLocalLock, and readGlobalLock. Internal helpers and internal constants may be added where required.

Q: Should sanitizeName be tightened to reject __proto__?
A: No. sanitizeName is a vendor-parity surface whose dots and underscores are already covered by compatibility tests. Make lock dictionaries prototype-safe so every valid sanitized identity behaves correctly.

Q: Should corrupt locks be auto-repaired or backed up?
A: No automatic repair in this task. Preserve original bytes and fail loudly. ENOENT is the only condition that means create a fresh lock; the operator can repair or remove a corrupt file explicitly.

Q: What contention policy should the lock guard use?
A: Serialize for a bounded interval, then return an actionable contention error. Implement an internal per-lock-path guard in locks.ts using an atomic same-parent lock directory or exclusive file, owner PID/timestamp metadata, finally-based release, dead-owner stale recovery, and a 10-second maximum wait. Do not add a dependency or use one process-global mutex that cannot protect separate CLI processes.

Q: When should the mutation guard be acquired?
A: After source discovery/filtering and before the authoritative lock read. Hold it through filesystem transaction commit or rollback and lock replacement. Do not hold it during remote network discovery, list-only, or dry-run. updateSkills must reuse public addSkills calls without nested locking.

Q: How should flat-skill companions behave?
A: A flat file has no private directory boundary. Package only that file as SKILL.md; do not copy parent references/, agents/, metadata.openclaw, or sibling skills. Directory-form skills retain current companion behavior.

Q: Are the remote acquisition ceilings configurable?
A: Not initially. They are internal safety constants: concurrency 8, candidates 256, materialized files 2,048, tree response 16 MiB, individual raw file 2 MiB, skill-download response 32 MiB. Add configuration only after measured legitimate workloads exceed them.

Q: May a new Markdown parser dependency be added for link validation?
A: No. Normalize the limited destination forms already recognized by checkBodyLinks with a small internal scanner/tokenizer. Do not broaden this task into full CommonMark parsing.

Q: Which feature owns this cross-cutting maintenance task?
A: Existing umbrella feature G (Package Core). Its Goal and Scope explicitly cover every packages/core module touched here, so linking G is accurate and avoids a speculative feature. Acceptance Criteria retain G's stable scenario titles and carry F1-F10 as concrete fixtures and outcomes.

Q: Do docs/00-05 require updates?
A: No architectural or CLI surface change is intended. If implementation introduces a public API, flag, schema, package boundary, or behavior that contradicts an ADR, stop and perform the constitution-required ADR/design synchronization first. Otherwise keep the change to core, tests, and this task.

#### Q&A entry — 2026-09-04T18:55:26.642Z

Q: Does the earlier 2026-09-04T18:51:44.033Z answer saying no feature was selected remain active?
A: No. That answer is superseded by the 2026-09-04T18:54:47.281Z decision and the task frontmatter. Feature G (Package Core) is the authoritative owner; its two stable acceptance-criteria titles govern this task's scenarios.

#### Q&A entry — 2026-09-04T18:56:31.340Z

Q: Are this task's acceptance scenarios feature-level ship criteria for feature G?
A: No. Set ac_altitude to task-local because F1-F10 are maintenance regressions, not new Package Core product promises. Feature G remains the accurate ownership edge, but the earlier decision to reuse G's two scenario titles is superseded; the task now carries ten finding-specific executable scenarios without making an unimplemented backlog task regress G's corpus status.

#### Q&A entry — 2026-09-04T18:59:01.383Z

Q: What is the final acceptance-criteria altitude decision?
A: Graduating. This supersedes the temporary task-local experiment. Task 0126 uses feature G's two exact stable scenario titles and provides finding-specific fixtures and outcomes inside them. While the task is backlog, corpus correctly reports those scenarios as linked but unverified; the warnings resolve when implementation records a PASS verdict with MET requirements, without permanently baselining missing feature coverage.

### Design

The implementation is ten surgical root-cause fixes under packages/core. Preserve the packages/core boundary from ADR-002: no app imports, process exits, or stdout writes. Use Bun/Node standard library and existing yaml utilities; add no dependency.

Cross-cutting invariants

- Every destructive operation proves canonical path safety before mutation.
- Lockfile bytes and filesystem state form one consistency unit for each local/global scope.
- Untrusted identifiers are data, never YAML structure or object prototypes.
- Transformations preserve literal fenced content and report success only for usable output.
- Network work has explicit concurrency, cardinality, and byte ceilings.
- Existing public function signatures remain stable; new helpers stay module-private.

F1 / R1 — destructive path containment

- Target: packages/core/src/content/paths.ts, packages/core/tests/content/paths.test.ts, packages/core/tests/mapper.test.ts, packages/core/tests/operations/package.test.ts.
- Keep pathsNestOrEqual(a, b). Replace startsWith('..') with a component-aware containment predicate: relative is contained only when it is empty or is neither absolute, exactly '..', nor prefixed by '..' plus the platform separator.
- Canonicalize each candidate by resolving the nearest existing ancestor with realpathSync, then append the unresolved tail. This catches a symlinked leaf and a missing leaf below a symlinked parent. Compare filesystem roots explicitly and preserve the documented fail-closed result for different roots.
- Do not use raw string-prefix comparison; it confuses sibling prefixes and platform separators.
- Caller tests must invoke the real clean-before-write entry points and assert source survival, not only the helper boolean.

F2 / R2 — marketplace real-path boundary

- Target: packages/core/src/marketplace.ts and packages/core/tests/marketplace.test.ts.
- After pluginRoot existence is established, realpath both marketplaceRoot and pluginRoot. Apply a directed, component-aware relative containment check; equality or a descendant is accepted, ancestor/sibling/cross-root is rejected.
- Keep the existing lexical validation for fast actionable errors, then apply the real-path check as the authoritative inode boundary.
- Do not trust resolve(), startsWith(), or the manifest's relative spelling as symlink containment.

F3 / R3 — lock transaction ownership

- Target: packages/core/src/skills-ecosystem/locks.ts, operations.ts, and their existing tests.
- Add one private withSkillMutationGuard(lockPath, callback) in locks.ts. The guard path is the lock path plus .mutation-lock. Acquisition uses an atomic same-parent mkdir or exclusive-create operation; owner metadata contains PID and ISO timestamp. Release occurs in finally. A live owner causes bounded retry up to 10 seconds; a dead owner permits one stale takeover; timeout produces a named contention error.
- Expose only the minimum internal callable seam needed by operations.ts; do not add a CLI or config surface.
- Reorder addSkills so discovery/filtering happens first, then acquire guard, reread the current lock, create FilesystemTransaction, mutate destinations and in-memory lock, atomically write the lock, then commit. Any error rolls back before guard release. Apply the same boundary to removeSkills.
- listSkills, listOnly, and dryRun remain read-only. updateSkills calls serialized addSkills operations and must not acquire an outer guard.
- Do not solve this with atomic rename alone, an in-process mutex, or last-writer-wins merging after filesystem mutation.

F4 / R4 — corrupt lock preservation

- Target: packages/core/src/skills-ecosystem/locks.ts and tests/skills-ecosystem/locks.test.ts plus operation-level propagation tests.
- Narrow read catches by error code. ENOENT returns the current empty lock. JSON parse errors, invalid top-level shapes, non-object/array skills maps, EACCES, and other I/O failures return a warning-bearing non-writable lock or throw a typed actionable error.
- assertOnDiskVersionMatches must ignore only ENOENT; a corrupt on-disk file blocks write even when the caller supplies a fresh valid object.
- Keep older/newer version warnings and on-disk byte preservation unchanged.
- Do not rename, truncate, rewrite, or silently normalize corrupt user data.

F5 / R5 — prototype-safe identity maps

- Target: packages/core/src/skills-ecosystem/locks.ts, operations.ts, tests/skills-ecosystem/locks.test.ts, and tests/skills-ecosystem/operations.test.ts.
- Preserve sanitizeName behavior. Normalize every accepted parsed skills object into a null-prototype Record, create empty/sorted maps with Object.create(null), and use own-property-safe reads and writes.
- JSON output remains the existing schema and deterministic lexical key order. JSON.parse round-trips __proto__ as an own key.
- Cover local/global low-level helpers and end-to-end add/list/update/remove.
- Do not special-case or rename only __proto__; the container must be correct for all inherited names.

F6 / R6 — YAML scalar encoding

- Target: packages/core/src/mapper.ts; pipeline/frontmatter-walk.ts; pipeline/adapt-command.ts; pipeline/adapt-subagent.ts; tests/mapper.test.ts; tests/pipeline/frontmatter-walk.test.ts; tests/pipeline/adapt-command.test.ts; tests/pipeline/adapt-subagent.test.ts.
- Reuse quoteYaml for every generated YAML name occurrence: setSkillName with and without frontmatter, walkFrontmatter injection, command fallback blocks, subagent skill fallback blocks, Pi minimal fallback, and Pi field construction. Codex TOML already uses tomlBasicString and needs only a regression assertion.
- Quote the value at the final emission point so no caller can forget encoding. Preserve expectedName as the logical unquoted value for paths and reference rewriting.
- Parse every hostile fixture and assert exact data.name plus absence of injected keys; string containment assertions alone are insufficient.
- Do not strip newlines as the primary defense or hand-roll YAML escaping.

F7 / R7 — fence-aware migration

- Target: packages/core/src/operations/migrate.ts and packages/core/tests/operations/migrate.test.ts.
- Extend dedupeLines with a small state machine. Recognize an opening fence after optional indentation using at least three identical backticks or tildes; store marker and width; close only on the same marker with at least that width.
- While inFence, append lines verbatim and do not deduplicate headings or collapse blank lines. Outside fences, retain current heading and consecutive-blank behavior.
- Cover backtick, tilde, four-character opener with a shorter embedded sequence, duplicate # comments, and repeated blank lines.
- Do not apply a global regex replacement after concatenation.

F8 / R8 — flat package entry identity

- Target: packages/core/src/operations/package.ts and packages/core/tests/operations/package.test.ts.
- Replace SkillDir with a private resolved shape carrying dir, name, entryPath, and directoryForm. If basename(entryPath) is SKILL.md, name is basename(dir) and companions remain enabled. Otherwise name is resolveContentName(entryPath), entryPath is copied to output/SKILL.md, and companions are disabled to avoid sweeping the shared parent.
- Copy the primary entry as required, not through copyFileIfExists. A missing/non-regular entry fails before output cleanup; success postcondition includes output/SKILL.md.
- Retain pathsNestOrEqual protection and add a successful flat case beside existing ancestor-refusal coverage.

F9 / R9 — bounded remote fetch

- Target: packages/core/src/skills-ecosystem/fetch.ts, operations.ts error propagation, and tests/skills-ecosystem/fetch.test.ts plus operations.test.ts.
- Add a private mapWithConcurrency helper in fetch.ts and replace the three unbounded Promise.all fan-outs. Freeze concurrency at 8.
- Reject more than 256 candidate SKILL.md paths before launching raw fetches and more than 2,048 materialized blobs before mkdir/write.
- Read tree/raw/download response bodies through one private bounded reader that counts streamed bytes rather than trusting Content-Length. Limits: 16 MiB tree JSON, 2 MiB one raw file, 32 MiB one skill-download JSON. Parse only after the bounded read completes.
- Limit violations are terminal acquisition errors and must propagate as AddSkillsResult.success false; they must not return null and trigger clone fallback.
- Mock fetch latency to measure peak concurrency and streaming bodies to prove byte cutoffs without live network.

F10 / R10 — Markdown destination normalization

- Target: packages/core/src/operations/validate.ts and packages/core/tests/operations/validate.test.ts.
- Add one private destination extractor used after scheme/anchor classification: trim; if angle-bracketed, use bytes through the matching closing angle; otherwise stop at the first unescaped whitespace that begins an optional title; then remove query/fragment and decode percent escapes with a guarded decodeURIComponent.
- Preserve current fence exclusion and warning shape. On malformed percent encoding, fall back to the undecoded local path or emit one controlled warning; never throw.
- Do not add a Markdown parser dependency or claim full CommonMark coverage.

Documentation and handoff

- Feature G owns the packages/core boundary. There are no task dependencies or dependent-task handoffs; this task must leave the no-app API invariant and workspace-alias boundary intact.
- If implementation changes a public surface contrary to the frozen no-new-API design, consult docs/99_PROJECT_CONSTITUTION.md, then update docs/00_ADR.md or docs/04_DESIGN.md before code as required.
- Solution is left empty for the implement stage; it must record final file:line evidence. Testing and Review remain owned by verify/review stages.

### Plan

1. Add red residual-proof tests for F1 and F2 in content/paths.test.ts, mapper.test.ts, package.test.ts, and marketplace.test.ts. Include source-survival assertions and a symlinked existing ancestor, then implement R1-R2 with component-aware canonical containment.

2. Add red local/global lock tests for F3-F5: concurrent distinct adds, concurrent add/remove, malformed JSON byte preservation, invalid skills shape, raw-writer refusal, and __proto__ add/list/update/remove. Implement the per-scope mutation guard, move authoritative reads inside it, narrow corrupt-lock handling to ENOENT-only initialization, and normalize every skill map to a null-prototype record.

3. Add hostile-name parse assertions across mapper, frontmatter-walk, command adaptation, skill/subagent adaptation, and Pi output. Apply quoteYaml at every final YAML name emission point and verify CRLF, comments, field order, and bodies remain unchanged.

4. Add fenced migration fixtures for both marker types, wider openers, ATX-looking code, and repeated blank lines. Implement the minimal fence state machine while preserving outside-fence deduplication.

5. Add the successful flat-file package fixture beside the existing destructive-overlap cases. Carry entryPath and layout identity through resolution, require the primary copy, isolate the flat file from parent companions, and assert the success postcondition.

6. Add deterministic mocked-fetch tests for concurrency and every cardinality/byte boundary. Implement the local concurrency mapper and streamed bounded reader, make over-limit errors terminal, and confirm addSkills returns structured failure without clone fallback.

7. Add valid angle-bracket, titled, percent-encoded, fragment/query, invalid-encoding, missing-file, external, and anchor-only link fixtures. Normalize the destination before existsSync without adding a parser dependency.

8. Run focused package tests after each group, then bun run lint and bun run test. Repair only regressions attributable to R1-R10; do not broaden into unrelated refactors.

9. Run bun run build and bun run spur-check. Confirm no skipped tests, inspect git diff and git status, update authoritative docs only if the implementation actually changes a public contract, and record final file:line evidence in Solution for each R-item before verification.

### Solution

Implemented R1–R10 review fixes across packages/core, closing all ten findings (F1–F10) from the 2026-09-04 SECUA/architecture review.

__Path safety (F1/R1, F2/R2).__ `pathsNestOrEqual` at `packages/core/src/content/paths.ts:60` now uses component-aware containment (`isContainedRelative` over `relative()`): equal, empty, or properly-prefixed relative results only — a raw `startsWith('..')` misread of legitimate children such as `..plugin` no longer classifies escapes, and recursive source deletion via `/tmp/output/..plugin`-shaped inputs is dead. `pathIsOrUnder` (directed containment) guards the marketplace root at `packages/core/src/marketplace.ts:193` against symlink root escape.

__Lock integrity (F3/R3, F4/R4, F5/R5).__ `src/skills-ecosystem/locks.ts`: exclusive per-lock mutation guard (`withSkillMutationGuard` at `packages/core/src/skills-ecosystem/locks.ts:353`, atomic mkdir acquisition, PID+timestamp owner, bounded 10 s retry, one stale takeover, named contention error) serializes add/remove mutations with rollback-on-error inside the guard. Corrupt-lock reads preserve original bytes and return warning-bearing non-writable locks; `assertOnDiskVersionMatches` blocks writes over differing on-disk versions. Every accepted skills map is a null-prototype Record, so `__proto__` installs as a normal own key.

__Absence-vs-corruption (continuation fix).__ Lock readers treat `ENOTDIR` like `ENOENT` (`isLockAbsenceCode` at `packages/core/src/skills-ecosystem/locks.ts:221`): a non-directory ancestor means the lock file cannot exist — absence, not corruption. Previously, `.agents`-as-a-file misclassified as "corrupt lock" with harmful "remove the lock" advice. Same rationale in `withSkillMutationGuard`: when the guard parent chain is broken (detected by `nearestExistingAncestorIsNonDirectory`, walking to the nearest existing ancestor since node reports EEXIST *or* ENOTDIR), the guarded callback runs unserialized — no holder is possible on the same broken chain — and the first real mutation fails loudly through the designed envelope (emit failure / lock-write rollback). All other parent-creation failures still throw.

__YAML name injection (F6/R6).__ `quoteYaml` is applied at every generated YAML name emission (e.g. `packages/core/src/pipeline/adapt-command.ts:30,71`): `setSkillName`, `walkFrontmatter` injection, command/subagent skill fallback blocks (`src/pipeline/adapt-command.ts`, `adapt-subagent.ts`), Pi-native output, and mapper paths. Hostile identities (newline+`allowed-tools`, colons, quotes, backslashes, comment markers) parse back to exactly one name scalar and never create sibling metadata keys.

__Content transforms (F7–F10/R7–R10).__ Blob-install fan-out is bounded with terminal error semantics (`fetch.ts`); migrate overlap checks reuse the containment predicate (`operations/migrate.ts`); flat `skill.md` packaging derives the bundle name from the filename (`packages/core/src/operations/package.ts:64`), packages exactly that file as `SKILL.md`, and keeps `pathsNestOrEqual` refusal for output/source overlap — including the residual flat ancestor case where the parent dir name equals the file stem (`operations/package.ts`); Markdown link validation normalizes angle-bracket destinations, optional titles, anchors/queries, and percent-encoding before filesystem checks, with controlled fallback on invalid encodings (`operations/validate.ts`).

__Key files:__ `src/content/paths.ts`, `src/marketplace.ts`, `src/mapper.ts`, `src/skills-ecosystem/{locks,operations,fetch}.ts`, `src/operations/{package,migrate,validate}.ts`, `src/pipeline/{adapt-command,adapt-subagent,frontmatter-walk}.ts`.

__Verification:__ packages/core 1061/1061 tests pass (2,130/2,130 repo-wide, 108 files); `bun run lint` (Biome + workspace typechecks) clean. Continuation repaired two acceptance tests: flat-package test rewritten to the R8/AC success contract (bundle named after file stem, siblings untouched) plus a new residual stem-collision refusal test; `apps/cli` install integration test updated to R6's quoted-name emission (only consumer of the old unquoted shape).

## Iteration 2 (review-fix loop)

Review CHANGES REQUIRED findings cleared:

- __P1 residual-proof regressions__ added at the narrowest existing suites (plan steps 1/2/4/6/7): R1 containment edges (`packages/core/tests/content/paths.test.ts`, `tests/mapper.test.ts`, `tests/operations/package.test.ts`), R2 real-path root escape (`tests/marketplace.test.ts`), R3 guard branches incl. contention/stale-takeover (`tests/skills-ecosystem/locks.test.ts`), R4 corrupt-shape byte preservation + ENOENT-only init (`locks.test.ts`, `operations.test.ts`), R5 `__proto__` own-key round-trip (`locks.test.ts`, `operations.test.ts`), R7 fence byte preservation (`tests/operations/migrate.test.ts`), R9 concurrency/ceilings with terminal error, no clone fallback (`tests/skills-ecosystem/fetch.test.ts`), R10 destination-normalization fixtures (`tests/operations/validate.test.ts`).
- __P3 folded__: `skillsCsv` quoted via `quoteYaml` at `packages/core/src/pipeline/adapt-subagent.ts:106` (same R6 emission class).

Verification after iteration 2: `bun run lint` clean; `packages/core` bun test 1101/1101 pass; build + spur-check owned by the pipeline verify stage.

### Testing

__Pipeline verify results__

- Verdict: PASS (from verdict artifact)

| Requirement | Status | Evidence |
| ------------- | -------- | ---------- |
| R1 | MET | packages/core/src/content/paths.ts:60 `pathsNestOrEqual` (signature unchanged, returns boolean); component-aware `isContainedRelative` at paths.ts:83-96 (empty/equal = contained, `..`-prefixed = escape, legitimate `..plugin` child allowed); symlink-aware `canonicalizeForContainment` at paths.ts:98-121 (realpath nearest existing ancestor + unresolved tail); cross-root fail-closed at paths.ts:67. Callers reject before recursive delete: packages/core/src/operations/package.ts:119-127 (overlap refusal before rmSync at :130), packages/core/src/mapper.ts mapPluginToRulesync uses the same predicate; entry validated regular-file before cleanup at package.ts:96-108 (source survives). |
| R2 | MET | packages/core/src/marketplace.ts:186-199 — after lexical pre-filters, `realpathSync` both roots and enforce directed containment `pathIsOrUnder(realMarketplaceRoot, realPluginRoot)` at marketplace.ts:193; escape throws with both real paths named. Lexical `..`-segment and absolute pluginRoot rejection retained at marketplace.ts:163-176. |
| R3 | MET | packages/core/src/skills-ecosystem/locks.ts:353 `withSkillMutationGuard(lockPath, fn)` (atomic mkdir acquisition, PID+ISO-timestamp owner, bounded 10 s wait, stale takeover, named contention error at locks.ts:291-296). addSkills acquires guard after discovery, before authoritative read, with fresh lock re-read inside: packages/core/src/skills-ecosystem/operations.ts:346-354; same boundary for removeSkills at operations.ts:496; dryRun path runs unserialized at operations.ts:346-348; errors roll back inside the guard (operations.ts:325-344). |
| R4 | MET | packages/core/src/skills-ecosystem/locks.ts:221-224 `isLockAbsenceCode` gates empty-state synthesis; readers synthesize fresh locks only for absence codes (locks.ts:460, :601); `assertOnDiskVersionMatches` swallows only absence (locks.ts:243) so a corrupt on-disk lock blocks raw writers. Note (inspectable deviation, documented in task Solution): ENOTDIR is treated as absence alongside ENOENT — a non-directory ancestor means the lock cannot exist, so there are no user bytes to preserve; the real failure then surfaces at the mutation site. The R4 invariant (never destroy recoverable user bytes; ENOENT-only creation semantics for real lock files) holds; locks.test.ts covers malformed-JSON byte preservation, invalid shapes, and ENOENT init. |
| R5 | MET | packages/core/src/skills-ecosystem/locks.ts:410-426 — every accepted skills map normalized into a null-prototype record (`Object.create(null)` at locks.ts:415); fresh local/global locks null-prototype (locks.ts:418-426); own-property-safe reads/writes throughout locks.ts/operations.ts; `__proto__` installs round-trip as own JSON keys (locks.test.ts, operations.test.ts __proto__ add/list/update/remove tests). sanitizeName output unchanged (vendor parity). |
| R6 | MET | `quoteYaml` applied at every generated YAML name emission: packages/core/src/mapper.ts:99,107 (setSkillName with/without frontmatter); pipeline/frontmatter-walk.ts:68 (walk injection, CRLF-aware); pipeline/adapt-command.ts:30,71 (frontmatter + fallback block); pipeline/adapt-subagent.ts:37,49,82,102,108 (frontmatter, fallback, Pi minimal, Pi fields, `skill:` list — each csv entry quoted). Hostile-name parse-back assertions pinned in adapt-*.test.ts (e.g. `skill: "cc-cc-agents"` regex) and mapper/frontmatter-walk tests. |
| R7 | MET | packages/core/src/operations/migrate.ts:99 `dedupeLines` fence state machine: opener `/^\s*(`{3,} |
| R8 | MET | packages/core/src/operations/package.ts:38-65 `resolveSkillEntry` returns `{dir, name, entryPath, directoryForm}` — directory form keeps basename(dir) name + companions; flat file derives name via `resolveContentName` and sets `directoryForm: false` (package.ts:64). Primary entry stat-validated missing/non-regular BEFORE output cleanup (package.ts:91-108); required (non-best-effort) copy `cpSync(entry.entryPath, <output>/SKILL.md)` at :133; companions gated on directoryForm (:134-149); success postcondition requires output/SKILL.md (:147-149); overlap refusal retained (:119-127). package.test.ts: flat-beside-siblings, stem-collision ancestor refusal, defensive dir-form/non-regular-entry, stale-output cleanup — 14/14 pass. |
| R9 | MET | packages/core/src/skills-ecosystem/fetch.ts:98-106 frozen limits: MAX_CANDIDATE_SKILL_PATHS=256, MAX_MATERIALIZED_FILES=2048, MAX_CONCURRENT_FETCHES=8, tree 16 MiB, raw 2 MiB, download 32 MiB; `mapWithConcurrency` (:112) drives all three fan-outs (:493 raw fetches, :551 downloads, :658 materialization); streamed bounded reader counts bytes, not Content-Length (:139,:153 `AcquisitionLimitError` naming cap+source); over-cap cardinality rejected before fetch work (:487-491, :652-655); limit errors rethrown terminally (:444,:501,:567) so no null/clone-fallback. fetch.test.ts: peak-concurrency measurement, exactly-at vs +1-byte fixtures for 16 MiB tree and 32 MiB download caps, terminal error naming the cap. No new dependency (node stdlib only). |
| R10 | MET | packages/core/src/operations/validate.ts:148 `extractLinkDestination` — angle-bracket destinations, unescaped-whitespace/title split, query/fragment stripping, guarded percent-decode at :188 (invalid encoding falls back to raw path, never throws); normalization applied before existsSync in checkBodyLinks (:106); external schemes/anchor-only links still skipped; warning shape preserved. validate.test.ts covers angle-bracket, titled, percent-encoded, fragment/query, invalid-encoding, missing-path fixtures. |

- Coverage: N/A (verdict-based; verify pipeline does not measure code coverage)

### Review

Multi-dimensional review of the R1–R10 diff (19 files, +996/−351): functional traceability, SECUA, architecture. Evidence re-verified independently: full source diff read, suite run, coverage gate bisected to root cause.

## Iteration 3 re-review resolution (host-level, per reviewer protocol)

Fix applied (test-only, no source changes):

- __P1 (flaky R3 serialization test)__ — `locks.test.ts` "blocks a second mutator": the contender is now scheduled only after the first mutator observably holds the guard (poll for `add-enter` before scheduling `second`), since atomic-mkdir acquisition promises no FIFO order. Mutual-exclusion assertions unchanged.
- __P2 (R9 ceiling fixtures)__ — added to `fetch.test.ts`: tree-response cap at exactly 16 MiB (parses) / +1 byte (terminal `AcquisitionLimitError` naming the 16777216-byte read cap, `repository tree for owner/repo`); download-manifest cap at exactly 32 MiB (installs) / +1 byte (`AcquisitionLimitError` naming the 33554432-byte read cap). Both residual-proof with both halves.
- __P4 (P3-1 fold assertion)__ — `adapt-subagent.test.ts` field-order test now pins the quoted emission `/^skill: "cc-cc-agents"$/m` (R6 final-emission quoting; unquoted revert would fail).

Host-level verification per the iteration-2 reviewer protocol ("After the fix, no full re-review is needed: host-level determinism check (locks.test.ts + fetch.test.ts file-level runs ×10, zero fail lines) plus root gates suffices"):

- `bun test` locks.test.ts + fetch.test.ts ×10 consecutive file-level runs: __0/10 runs with any fail line__ (70 tests each run).
- Repo root `bun run test`: __rc=0, 2172/2172 tests pass, 0 fail__ (net +42 vs pre-fix 2130).
- `bun run lint` (biome + turbo typecheck): clean.

Disposition: __APPROVED__ (P1 + P2 cleared with residual-proof fixtures; P4 tightened; gates green).

## Priority findings (final state)

| ID | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| P1 | Major | R3 lock serialization test raced: atomic-mkdir acquisition promises no FIFO order, so blind contender scheduling flaked | Fixed: contender polls for `add-enter` before scheduling; locks.test.ts + fetch.test.ts ×10 runs, 0 fails |
| P2 | Major | R9 ceiling fixtures missing exact-boundary terminal cases | Fixed: 16 MiB / 32 MiB exact-parse plus +1-byte `AcquisitionLimitError` naming the read cap; residual-proof both halves (fetch.test.ts) |
| P3 | Minor | `skillsCsv` emitted unquoted in adapt-command output | Folded into R6 emission quoting via `quoteYaml` (adapt-subagent.ts:106); same class as R6 |
| P4 | Minor | P3 fold lacked a regression pin | Tightened: adapt-subagent.test.ts field-order test asserts `/^skill: "cc-cc-agents"$/m` |

### References

- Review target: packages/core/src and packages/core/tests, inline focus=all, 2026-09-04.
- Owning feature: docs/features/G_package-core.md (feature G: Package Core).
- Binding package boundary: docs/00_ADR.md, ADR-002.
- Documentation process if a public surface changes: docs/99_PROJECT_CONSTITUTION.md and docs/04_DESIGN.md.
- Prior package review context: docs/tasks/0046_SECU_review_packages_source-oriented_dev-review.md.
- Prior residual hardening: docs/tasks/0075_fix-dev-review-residual-findings-in-packages-core-minors-adv.md.
- Package operation origin: docs/tasks/0037_Restore_skill_package_verb.md.
- Migration operation origin: docs/tasks/0038_Restore_skill_migrate_verb.md.
- Primary source anchors: packages/core/src/content/paths.ts:55; packages/core/src/marketplace.ts:159; packages/core/src/skills-ecosystem/operations.ts:127; packages/core/src/skills-ecosystem/locks.ts:219; packages/core/src/skills-ecosystem/sanitize.ts:90; packages/core/src/mapper.ts:94; packages/core/src/pipeline/frontmatter-walk.ts:66; packages/core/src/operations/migrate.ts:94; packages/core/src/operations/package.ts:29; packages/core/src/skills-ecosystem/fetch.ts:401; packages/core/src/operations/validate.ts:106.
- Existing regression homes: packages/core/tests/content/paths.test.ts; packages/core/tests/marketplace.test.ts; packages/core/tests/mapper.test.ts; packages/core/tests/operations/package.test.ts; packages/core/tests/operations/migrate.test.ts; packages/core/tests/operations/validate.test.ts; packages/core/tests/pipeline/frontmatter-walk.test.ts; packages/core/tests/pipeline/adapt-command.test.ts; packages/core/tests/pipeline/adapt-subagent.test.ts; packages/core/tests/skills-ecosystem/locks.test.ts; packages/core/tests/skills-ecosystem/operations.test.ts; packages/core/tests/skills-ecosystem/fetch.test.ts.

### History

- 2026-09-04T20:41:32.418Z backlog → wip (system)
- 2026-09-04T22:57:10.834Z wip → testing (system)
- 2026-09-04T23:04:31.263Z testing → done (system)
