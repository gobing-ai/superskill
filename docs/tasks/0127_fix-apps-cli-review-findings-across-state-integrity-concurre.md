---
schema_version: 1
name: "Fix apps CLI review findings across state integrity, concurrency, validation, and idempotency"
status: done
template: issue
created_at: 2026-09-05T00:55:35.403Z
updated_at: "2026-09-05T04:03:06.503Z"
priority: P2
---

## 0127. Fix apps CLI review findings across state integrity, concurrency, validation, and idempotency

### Background

The 2026-09-04 `sp-dev-review apps --agent inline --focus all --fix all` audit found nine unresolved defects in the CLI application boundary. Seven are P2 correctness, reliability, concurrency, or architecture defects; two are P3 parser/type-fitness defects. The work spans `apps/cli/` plus the existing `packages/core/src/mapper.ts` seam consumed by install. It does not add a product feature: it restores already-documented guarantees around accepted evolve history, isolated installation, fail-closed input handling, accurate session accounting, agent-process failures, deterministic reinstall output, strict JSONC parsing, and CLI handler parity.

The pre-task repository gates were green (`bun run lint`; `bun run test`: 2,185 pass, 0 fail, 98.88% lines / 99.57% functions), and the worktree was clean. Those gates did not exercise the adversarial or concurrent paths below.

| ID | Priority | Area | Current evidence and reproduction | User/system impact |
| --- | --- | --- | --- | --- |
| F1 | P2 | Evolve history integrity | `stepVerify` in `apps/cli/src/operations/evolve.ts` calls `evaluate(..., { save: true, requireSave: true, operation: 'evolve' })` before `runGate`; the rejection branch restores the file but leaves the appended evaluation. `stepAnalyze` later reads every row and selects the newest as the baseline. | A rejected candidate becomes the baseline for later trend/proposal analysis even though the file was restored, so persisted history no longer describes installed content. |
| F2 | P2 | Install concurrency | `executeInstall` hard-codes `outputDir = '.rulesync'`; `mapPluginToRulesync` recursively removes and recreates that directory. Two installs in one working directory can cross the first async boundary with one invocation consuming the other invocation's staged plugin. | Concurrent installs can emit the wrong skills/hooks/scripts/magents or fail nondeterministically; dry-run is also mutating shared staging. |
| F3 | P2 | Script source containment | `script convert` joins `CLAUDE_PROJECT_DIR/plugins/<plugin>/scripts/<rel>` without validating either identifier. Confirmed probe: `CLAUDE_PROJECT_DIR=$PWD bun apps/cli/src/index.ts script convert cc ../../../apps/cli/src/index.ts --dry-run` exits 0 and resolves `apps/cli/src/index.ts`. Sibling `script path` already rejects unsafe plugin/relative inputs. | An untrusted or mistaken relative path can select and, without dry-run, create a portable twin beside a source outside the plugin scripts tree. |
| F4 | P2 | Concurrent hook accounting | `spContextPostTool` appends a ledger event, then performs an unlocked read-modify-write of the session JSON counters. `spContextSessionStop` trusts any present counters and scans the ledger only when all counters are absent. | Parallel PostToolUse processes can lose increments or leave unreadable JSON; the final `session_end.totals` can under-report reads, writes, and tokens despite the append-only ledger containing the events. |
| F5 | P2 | Empirical runner reliability | `TsAiRunnerBackend.run` and `TsAiRunnerJudgeBackend.judge` consume `stdout` without checking `exitCode`. `@gobing-ai/ts-ai-runner` deliberately uses `rejectOnError: false`, returning non-zero/null status and partial output instead of throwing. | Failed, timed-out, or signalled agent processes can be scored or parsed as valid empirical evidence and influence proposal acceptance. |
| F6 | P2 | Agent JSON trust boundaries | `ingestScores` and `ingestProposal` cast `JSON.parse` output to TypeScript interfaces. Scores can omit `dimensions`/`note`; proposals use truthiness checks that do not enforce string/boolean/array types. | Malformed agent output can crash later, coerce into persisted rows/proposals, or create records that violate the declared domain types. |
| F7 | P2 | OMP reinstall idempotency | `generateOmpHookModules` resolves colliding derived names with `Math.random()`. The existing collision test explicitly accepts a random suffix, while the byte-idempotency test covers only non-colliding names. | Reinstalling unchanged hooks can change owned filenames, creating nondeterministic manifests/diffs and contradicting the install idempotency invariant. |
| F8 | P3 | JSONC correctness | `parseJsonc` blanks block-comment bytes through EOF and never checks whether `blockComment` remains true. Confirmed probe: `parseJsonc('{"version":1} /*')` returns `{ version: 1 }`. | A truncated configuration is silently accepted as a valid prefix instead of failing with a parse error. |
| F9 | P3 | Exported handler contracts | `handleCommandScaffold` omits `tools`; `handleMagentScaffold` exposes `skills` instead of `tools`; `handleMagentEvaluate` omits `basePath`, although the operation and Commander action shapes contain those options. | Runtime object spreading currently masks the mismatch, but typed callers cannot supply valid CLI options and future refactors can silently stop forwarding them. |

This is one standalone remediation task because the findings came from one bounded review and share one completion gate. It intentionally has no single `feature_id`: F1/F5/F6 belong to authoring/evolve, F2/F7 to install, F3 to script delivery, F4 to indexed context, and F8/F9 to CLI boundaries. A fabricated feature link would be less accurate than task-local traceability.

### Requirements

- [x] R1. F1 — accepted-history integrity. Candidate form evaluation must be computed before the evolve gates but persisted only after every enabled deterministic, persona, anchor, delta, and empirical gate passes. A rejected proposal must restore the target, remain `draft`, report zero applied changes, and add no candidate form or empirical evaluation row. A passing proposal must persist one form verification row and link that exact inserted ID as `verify_id`; persistence/linkage failure must enter the existing proposal transaction rollback path. Future `stepAnalyze` baselines and trends must therefore describe content that actually survived acceptance.

- [x] R2. F2 — isolated install staging. Every `executeInstall` invocation must own a unique canonical `.rulesync/` staging tree for its complete resolve/map/transform/rulesync/native-dispatch/provenance lifetime. Concurrent installs in the same `cwd`, including different plugins and target sets, must never delete, read, transform, or emit from each other's staging. Staging must be removed after success and after a thrown dependency/dispatch error. Target outputs and receipts remain unchanged; the persistent current-working-directory `.rulesync` directory is not an output contract.

- [x] R3. F3 — script source containment. `script convert <plugin> <rel>` must validate inputs before filesystem probing, dry-run output, bundling, or writing. `<plugin>` must be one safe path segment. `<rel>` must be non-empty and relative, must reject POSIX/Windows absolute forms, empty segments/repeated separators, and any `..` segment, while allowing ordinary names containing two dots such as `file..ts`. `script path` and `script convert` must use one validation rule so the two script-locator commands cannot drift. Invalid input exits 1 with an actionable message and produces no output file. An explicit `--out` remains user-controlled and is not redefined by this task.

- [x] R4. F4 — authoritative session totals. The append-only `token-ledger.jsonl` must be the sole source used to compute `session_end.totals`. PostToolUse must stop mutating running counters in the shared session JSON; SessionStart needs only identity/start metadata. Stop performs one bounded-by-ledger-size scan, includes only parseable `read`/`write` events whose `session` exactly matches, sums their numeric token values, skips malformed/unrelated lines, appends the final event, and removes only its session file. Concurrent same-session events must not be discarded because of stale counters.

- [x] R5. F5 — fail-closed empirical processes. The real replay and pairwise-judge adapters must accept agent output only when `exitCode === 0`. Non-zero, `null`, missing status, timeout/signal, and valid-looking partial stdout paired with a failed status must throw before exact/rule scoring or judge JSON parsing. Errors must name the adapter/agent and status and include a bounded stderr excerpt without dumping unbounded process output. Existing thrown failures must propagate through the empirical gate so `applyProposalTransaction` restores the file and leaves the proposal draft. Scripted/mock backends remain unchanged.

- [x] R6. F6 — runtime validation of agent-authored JSON. Replace unchecked JSON casts at both ingestion boundaries with Zod schemas using the already-installed `zod` dependency. Scores input must be an object with an integer rubric version and a dimensions object; every rubric dimension must exist exactly once with finite `score` in `[0,1]` and a non-empty string `note`, with no unexpected dimension names. Proposal input must be an object containing a non-empty `changes` array; every change requires string `dimension`, `location`, `current`, `proposed`, and `reason` (`proposed` and semantic labels/reason non-empty), optional `failure_mode` from `FAILURE_MODES`, optional safe-segment string `proposal_id`, optional non-empty string `anchor_hash`, and an optional skeptic object with boolean `ok`, string-array `violations`, and string `note`. Validation errors must carry `code: 1` plus a useful field/path, and no database row, proposal file, target mutation, or directory creation may occur before validation succeeds.

- [x] R7. F7 — deterministic OMP collisions. OMP hook module filenames must be a pure function of canonical hook order, level, and derived base name. Preserve the first `<name>.js`; resolve subsequent same-directory collisions with deterministic numeric suffixes (`<name>-2.js`, `<name>-3.js`, ...), skipping any already-selected candidate. Reinstalling byte-identical canonical hooks must return the same ordered file paths and byte-identical contents while pruning stale owned modules and preserving user/foreign modules exactly as today.

- [x] R8. F8 — strict JSONC comment termination. `parseJsonc` must throw a clear syntax/parse error when EOF is reached inside a block comment. Valid line comments, terminated block comments, trailing commas, CRLF/LF, escaped quotes, URLs, and comment markers inside JSON strings must retain current behavior. `loadConfig` returns defaults only when the config file is absent; it must not turn malformed/truncated content into defaults or a valid prefix.

- [x] R9. F9 — handler/operation type parity. The exported option contract of `handleCommandScaffold` must accept every option accepted by `commandScaffold`, including `tools`. `handleMagentScaffold` must expose `tools?: string[] | string` and no `skills` alias. `handleMagentEvaluate` must accept `basePath`. Use TypeScript's existing type derivation capability (for example `Parameters<typeof operation>[0]`) on these seams so their handler types cannot drift again; do not introduce a handler factory or repository-wide options abstraction.

- [x] R10. Scope, compatibility, and completion. Preserve all unrelated CLI output, exit codes, store schema, proposal status values, target layouts, and public flags. Do not add dependencies or a database migration. Update authoritative documentation only where behavior changes: evolve persistence ordering and isolated ephemeral canonical staging in `docs/03_ARCHITECTURE.md`, and any dry-run wording/surface statement in `docs/04_DESIGN.md` or command help that currently promises refreshed persistent staging. Complete with focused regressions plus the repository lint, full test, build, Spur, and worktree gates.

### Acceptance Criteria

- [x] AC1 — Rejected evolve evaluation is not history. Given a content item with one saved baseline and an ingested proposal whose enabled gate rejects, when the proposal transaction runs, then the file is byte-identical to the baseline, the proposal is still `draft` with no acceptance linkage, `changesApplied` is 0, and `EvaluationDao.getEvaluations(type, name)` contains no new candidate form or empirical row.

- [x] AC2 — Accepted evolve evaluation has exact provenance. Given the same baseline and a proposal that passes all enabled gates, when the transaction completes, then exactly one form verification row for the accepted candidate is added, the proposal is `accepted`, and `proposal.verify_id` equals that row's ID rather than an ambient latest/older row. A forced insert/link failure restores the file and leaves the proposal draft.

- [x] AC3 — Concurrent installs have isolated staging. Given two distinct plugin fixtures and two `executeInstall` calls started in the same working directory with injected rulesync calls held at a barrier, when both mappings exist concurrently and both calls resume, then each injected call sees only its own plugin-prefixed skills/hooks/scripts/magents, both target results are correct, the captured staging roots differ, and both temporary roots are absent after completion. A separate forced dependency failure also removes its staging root.

- [x] AC4 — Script conversion cannot escape. Given an existing file outside `plugins/<plugin>/scripts`, when `script convert` receives `../`, nested `a/../../`, POSIX absolute, Windows absolute, repeated-separator, empty-relative, or unsafe plugin input (including the confirmed `cc ../../../apps/cli/src/index.ts` case), then it exits 1 before the existence probe/build/write and leaves the filesystem unchanged. A safe nested relative `.ts` path and `file..ts` still resolve and convert/dry-run normally; `script path` asserts the same boundary cases.

- [x] AC5 — Ledger wins over stale counters. Given one session file containing stale/partial counters and a ledger containing two reads, one write, known tokens, malformed lines, and another session's events, when Stop runs, then its `session_end.totals` exactly reflects the three matching parseable events, ignores counters/malformed/foreign entries, and removes only that session file. PostToolUse does not rewrite the session JSON after SessionStart.

- [x] AC6 — Failed replay processes cannot be scored. Given injected `AiRunner` results with exit 2, `null`, missing status, signal metadata, and valid-looking stdout, when `TsAiRunnerBackend.run` is called, then every failed status throws with bounded diagnostic context before `replayCase` can score it. Exit 0 returns stdout unchanged.

- [x] AC7 — Failed judge processes cannot decide a gate. Given the same failed-status matrix and stdout `{"winner":"A","margin":1}`, when `TsAiRunnerJudgeBackend.judge` is called, then it throws before `parseJudgeResponse`; exit 0 preserves candidate/baseline order mapping. An evolve empirical-gate regression proves the thrown error invokes transaction rollback and does not accept the proposal.

- [x] AC8 — Scores ingestion rejects malformed agent JSON without writes. Given `null`, a non-object, missing `dimensions`, missing/extra rubric dimensions, missing/non-string/empty `note`, non-number/out-of-range score, or mismatched rubric version, when `evaluate --ingest --save` runs, then it fails with code 1 and a field path and inserts no evaluation. A valid exact-dimension document persists unchanged semantics.

- [x] AC9 — Proposal ingestion rejects malformed agent JSON without writes. Given `null`, missing/empty `changes`, a non-object change, missing/non-string required fields (including `current`), invalid `failure_mode`, unsafe/non-string `proposal_id`, invalid `anchor_hash`, or malformed skeptic values, when evolve ingestion runs, then it fails with code 1 and a field path before creating a proposal row/file/directory or mutating content. A valid proposal persists and remains compatible with accept.

- [x] AC10 — Colliding OMP hooks reinstall identically. Given at least three same-level hooks with one derived base-name collision (including a natural suffix collision) plus foreign and user files, when generation runs twice from unchanged canonical input, then the owned paths are deterministically `<name>.js`, `<name>-2.js`, `<name>-3.js` as collision availability permits, both returned path arrays and file bytes are identical, stale owned files are gone, and foreign/user bytes are unchanged.

- [x] AC11 — Unterminated JSONC is rejected. Given valid JSON followed by an unterminated block comment, including a multiline variant, when `parseJsonc` or `loadConfig` runs, then it throws an error naming the unterminated block comment. Existing fixtures for terminated comments, trailing commas, URL/comment-like string contents, escaped quotes, and absent-file defaults remain green.

- [x] AC12 — Exported handler contracts forward all CLI options. Typechecking accepts `handleCommandScaffold({ name, tools })`, `handleMagentScaffold({ name, tools })`, and `handleMagentEvaluate({ nameOrPath, basePath })`, rejects the obsolete `skills` shape, and behavior tests prove each value reaches the existing scaffold/evaluate operation unchanged.

- [x] AC13 — Completion gates. `bun run lint`, `bun run test`, `bun run build`, and `bun run spur-check` pass with no skipped/disabled regression; `spur task check 0127 --strict-core --json` passes; `git status --short` contains only intentional implementation, test, documentation, indexed-context, and task lifecycle changes.

### Q&A

| Question | Decision | Rationale / consequence |
| --- | --- | --- |
| Should this task be linked to one feature? | No; keep it standalone and use task-local AC. | The findings cross authoring/evolve, install, script delivery, indexed context, config, and command adapters. One feature ID would create false ownership. This matches completed cross-cutting review task 0107. |
| Keep rejected candidate evaluations for audit? | No, not in the accepted evaluation history. Compute before gates and persist only after pass. | The evaluations table is append-only and has no attempt/status discriminator. Adding one would require a schema/query migration. Delayed persistence is smaller and preserves the invariant that history rows describe surviving content. |
| Serialize installs or isolate them? | Give every invocation an isolated temporary parent containing its own `.rulesync/`, and clean it in `finally`. | A lock would reject/block legitimate independent installs and retain the global staging bottleneck. Unique OS-temp staging allows both to succeed and keeps the canonical intermediate format without shared destructive state. |
| Is current-working-directory `.rulesync/` a durable artifact? | No. It is an internal canonical intermediate representation, not a target output or documented user-owned cache. | Update stale dry-run/architecture wording so cleanup is explicit. No migration or preservation logic is needed. |
| How should script locator validation be shared? | Export one input validator from the existing script-path module and call it from both `resolveScriptPath` and `script convert`. | Reuses the existing rule without a new utility package/file. `--out` remains deliberately unrestricted because it is an explicit output path, not a derived source path. |
| Lock session counters or scan the ledger? | Remove running counters and scan once at Stop. | The ledger already exists as append-only evidence. One O(n) scan per session is simpler and correct; add a lock only if measured ledger size makes Stop latency material. |
| Which agent process statuses are success? | Exactly numeric exit code 0. | `ts-ai-runner` returns failures instead of rejecting. Null/missing/signal statuses cannot be treated as verified model output. |
| Add a shared process-result helper? | No. Mirror the small status check in the two real adapters. | Two checks are clearer than a cross-module abstraction. Extract only if a third adapter needs identical policy. |
| Which runtime validator? | Zod 3 already declared by `apps/cli`. | It provides path-aware errors and avoids handwritten nested guards or a new dependency. Keep schemas local to their ingestion modules. |
| Can `ProposedChange.current` be empty? | Yes, but it must be present and a string. | Insertions can legitimately have no current text. `dimension`, `location`, `proposed`, and `reason` must be non-empty. |
| Which OMP collision key? | Stable numeric ordinal within the existing canonical iteration order and hook level. | It satisfies unchanged-input byte idempotency with the minimum algorithm. Content hashes are unnecessary until stability across input reordering is a stated requirement. |
| How should handler drift be prevented? | Derive only the three affected handler input types from their operation parameter using `Parameters<...>[0]`. | This is a native TypeScript one-liner, avoids duplicated option lists, and does not introduce a handler factory or broad refactor. |
| Dependencies or handoffs? | None. | All target files are in this repository; `zod`, test seams, DAOs, and rollback machinery already exist. Documentation synchronization is part of this task, not a downstream handoff. |

### Design

Implementation keeps existing modules and data models. No new dependency, store column/status, lock service, or command flag is introduced.

1. F1 — reorder `stepVerify` into evaluate → gate → persist → link.
   - Call `opts.evaluateFn ?? evaluate` with `save: false`; capture the candidate aggregate/dimensions in memory.
   - Run existing gate logic against that report and the backup. On rejection, restore and return before any `EvaluationDao.insertEvaluation` call.
   - On pass (or when no gate is configured), insert the captured heuristic report once with `content_type`, canonical `content_name`, target, `operation: 'evolve'`, candidate aggregate/dimensions, and current candidate `file_hash`. Use the returned ID directly for `updateProposalStatus(..., 'accepted', { verify_id })`.
   - Keep accepted empirical-row persistence after a successful empirical gate. Any required form-row persistence/link failure throws into `applyProposalTransaction`; do not add deletion to the append-only DAO.
   - Update injected `evaluateFn` expectations and the architecture invariant to state that rejected attempts leave no evaluation history.

2. F2 — make canonical staging invocation-local.
   - In `executeInstall`, create `stageParent = mkdtempSync(join(tmpdir(), 'superskill-install-'))` immediately before mapping and set `outputDir = join(stageParent, '.rulesync')`.
   - Enclose every consumer of `outputDir` (mapping, per-target transforms, rulesync, hook/magent/script emission, receipt/provenance assembly) in `try/finally`; recursively remove only `stageParent` in `finally`.
   - Continue passing `outputDir` explicitly to all existing helpers. Do not change `mapPluginToRulesync` cleanup semantics; it is safe once its root is unique.
   - Change dry-run text from “staging was refreshed” to state that target writes were skipped; isolated staging is internal and cleaned.
   - Add a barrier-based test via existing `InstallDependencies.runRulesync`; capture each source root and inspect it before releasing the two calls. Also force a dependency error and assert cleanup.

3. F3 — apply one script locator boundary.
   - Turn the existing `isUnsafeRel` rule in `script-path.ts` into an exported assertion that first calls `assertSafePathSegment(plugin, 'plugin name')`, then rejects unsafe `rel` with `UsageError`.
   - Make `resolveScriptPath` and `registerScriptConvert` call the assertion before constructing candidates/source paths. The convert action catches validation as a usage error, writes stderr, and exits 1 before `existsSync`, dry-run, or `convertScriptToPortableTwin`.
   - Keep source lookup rooted at `<project>/plugins/<plugin>/scripts`; keep explicit `--out` behavior unchanged.

4. F4 — make ledger aggregation authoritative.
   - Remove PostToolUse's session-file read/modify/write block and stop writing `reads`, `writes`, and `tokens` at SessionStart.
   - In Stop, after validating the session identity, always scan `token-ledger.jsonl` once. Count only matching `read` and `write` records and add numeric `tokens`; ignore malformed JSON, unrelated sessions, and non-event rows.
   - Append `session_end` after the scan, then retain best-effort cleanup/fail-open behavior. The session file remains the routing/identity marker only.

5. F5 — check real process results at the adapters.
   - In both `TsAiRunnerBackend.run` and `TsAiRunnerJudgeBackend.judge`, inspect the `runPromptCommand` result before returning/parsing stdout. Only `exitCode === 0` proceeds.
   - Throw a bounded error that includes agent, exit code or termination state, optional signal, and at most 500 characters of trimmed stderr. Do not include unbounded stdout.
   - Extend the judge's local `PromptRunner` result shape with signal/status fields actually returned by `AiRunner`. Keep scripted/mock backends untouched; let existing gate/transaction error propagation handle rollback.

6. F6 — parse unknown, validate, then mutate.
   - Add local Zod schemas in `evaluate.ts` and `evolve.ts`. Parse JSON to `unknown`, run `safeParse`, and translate the first issue path/message into the current code-1 error convention.
   - For scores, apply the static shape/value schema first, then retain the existing dynamic exact-rubric-dimension comparison. Build `QualityReport` only from parsed data.
   - For proposals, validate the complete envelope and each `ProposedChange`, then apply `assertSafePathSegment` to the parsed optional/generated proposal ID before constructing DAO/file paths. Only after both layers succeed may DAO lookup/insert or `mkdirSync` run.
   - Keep schema definitions private; exported TypeScript interfaces remain the domain contracts.

7. F7 — deterministic OMP name allocation.
   - Replace random suffix generation with an integer search local to each `dir/baseName`: first use base, then try `-2`, `-3`, and so on until the candidate is absent from `usedNames`.
   - Preserve canonical parsed order and existing ownership pruning/content generation. Rewrite the random-suffix test to exact names and add collisions to the existing byte-idempotent reinstall scenario.

8. F8 — detect incomplete lexical state.
   - Record the opening block-comment position while scanning. After the comment-removal loop, if `blockComment` is still true, throw `SyntaxError` identifying an unterminated block comment (include line/column when inexpensive from the recorded index).
   - Do not run trailing-comma normalization or `JSON.parse` after that error. Leave string/escape handling unchanged.

9. F9 — derive affected handler option contracts.
   - Change the parameter types of `handleCommandScaffold`, `handleMagentScaffold`, and `handleMagentEvaluate` to `Parameters<typeof correspondingOperation>[0]` (or an equivalently exact local alias).
   - Do not rename runtime Commander options, add `skills` compatibility, or refactor other handlers. Add behavior assertions that the operation spies receive `tools`/`basePath`.

Primary targets: `apps/cli/src/operations/{evolve,evaluate,replay-runner,pairwise-judge}.ts`, `apps/cli/src/commands/{install,script-path,script-convert,hook-run,command,magent}.ts`, `apps/cli/src/{omp-hooks,config}.ts`, their adjacent tests, `docs/03_ARCHITECTURE.md`, and only surface/help documentation proven stale by the dry-run change. `packages/core/src/mapper.ts` is evidence for F2 but should not need a logic change.

Anti-patterns to avoid: evaluation-row deletion or a new rejection status; one global install lock; retained per-session counters; accepting partial stdout on process failure; handwritten nested type casts; content-hash naming for a simple ordered collision; importing a JSONC parser solely for one EOF check; a shared command-handler factory; drive-by changes in `vendors/` or `.github/workflows/`.

### Plan

1. Lock regression intent before production edits (R1, R3–R9).
   - Add rejected/accepted evaluation-history assertions around `applyProposalTransaction` and `stepVerify` test seams.
   - Add unsafe script-convert/path matrices, stale-counter ledger aggregation, failed process-result matrices, malformed score/proposal tables, deterministic OMP collisions, unterminated JSONC, and handler forwarding assertions.
   - Run each focused test file to confirm the new assertion fails for the reported reason, not fixture setup.

2. Repair evolve persistence ordering (R1).
   - Change candidate evaluation to in-memory scoring, move form-row insertion after successful gates, and link the returned ID.
   - Verify rejection adds no row; acceptance links the exact row; forced persistence/link failure uses existing rollback.

3. Isolate the install workspace (R2).
   - Allocate a temporary parent and nested canonical `.rulesync`, thread the existing `outputDir`, and guarantee cleanup with `finally` across all awaits.
   - Add two-install barrier coverage and success/failure cleanup assertions; update dry-run wording.

4. Close CLI input/trust boundaries (R3, R6, R8).
   - Reuse one script locator assertion in path/convert before filesystem access.
   - Add and apply local Zod schemas before evaluation/proposal side effects.
   - Reject unterminated block comments before normalization/JSON parsing.
   - Verify every invalid input returns the intended code/path and leaves stores/files unchanged.

5. Remove concurrency and nondeterminism defects (R4, R7).
   - Make Stop always aggregate the ledger and remove session counter writes.
   - Replace OMP random suffixes with deterministic numeric allocation and extend byte-idempotency coverage.

6. Make empirical execution fail closed (R5).
   - Add explicit exit-status checks to both real adapters with bounded stderr diagnostics.
   - Verify non-zero/null/missing/signal results cannot reach scoring/parsing and that the evolve transaction rolls back a runner failure.

7. Align exported handlers without broad refactoring (R9).
   - Derive the three affected handler option types from their operation signatures.
   - Assert `tools` and `basePath` are accepted and forwarded; assert `skills` is no longer a valid magent handler option at compile time.

8. Synchronize owned documentation and indexed context (R10).
   - Read `docs/99_PROJECT_CONSTITUTION.md` before doc edits.
   - Update `docs/03_ARCHITECTURE.md` for pass-before-persist evolve history and invocation-local ephemeral `.rulesync` staging.
   - Update `docs/04_DESIGN.md`/install help only if current surface wording promises persistent refreshed staging.
   - Append `.spur/context/buglog.md` entries for the repaired bug classes and `pitfalls.md` only for durable do-not-repeat lessons; update `anatomy.md` only if files are created/deleted/renamed.

9. Run completion gates and record evidence (R10, AC13).
   - `bun run lint`
   - `bun run test`
   - `bun run build`
   - `bun run spur-check`
   - `spur task check 0127 --strict-core --json`
   - `git status --short` and diff audit for intentional scope only.

No external dependency, migration, feature decision, or downstream handoff blocks implementation. The task can move from backlog to todo after this refinement; implementation may proceed in the order above because the findings do not depend on one another, while the final gates cover their integration.

### Root Cause

| ID | Verified root cause | Trigger path | Why existing coverage missed it |
| --- | --- | --- | --- |
| F1 | Persistence occurs before acceptance is known, but the append-only evaluation model has no rejected-attempt state/filter. Rollback restores only file/proposal state, not evaluation history. | `apps/cli/src/operations/evolve.ts`: `stepVerify` saves near 1137–1150, rejects near 1179; `stepAnalyze` reads/selects newest near 821–839. | Tests checked file/status rollback and exact accepted linkage, but did not compare evaluation row count/latest baseline after gate rejection. |
| F2 | A process-global relative staging name is passed to a mapper whose valid clean-before-write behavior recursively deletes that root. The install function then awaits while later steps still depend on it. | `apps/cli/src/commands/install.ts` near 386–421 and later async rulesync/dispatch; `packages/core/src/mapper.ts` near 142–162. | Install tests run one invocation at a time. No barrier holds install A after mapping while install B remaps the same cwd. |
| F3 | Source path construction treats CLI strings as trusted path components and uses `join`/existence as authorization. The safe rule exists only inside sibling `script path`. | `apps/cli/src/commands/script-convert.ts` near 149–162 versus `script-path.ts` near 56–87. | Conversion tests exercise build portability and missing files, not traversal/absolute/plugin segment adversaries. |
| F4 | Two sources of truth exist: append-only ledger events and mutable session counters. Counter updates are non-atomic across hook processes, and Stop prefers counters whenever any counter field exists. | `apps/cli/src/commands/hook-run.ts` near 283–344 and 390–431. | The test named for concurrent sessions interleaves different sessions serially; legacy fallback covers absent counters, not stale present counters for the same session. |
| F5 | Adapters assume process failure rejects the promise. The runner contract instead deliberately returns status because `rejectOnError` is false. | `apps/cli/src/operations/replay-runner.ts` near 65–82; `pairwise-judge.ts` near 91–121; `node_modules/@gobing-ai/ts-ai-runner/src/ai-runner.ts` near 156–187. | Injected runner tests return only exit 0 and assert delegation/parsing; no failed-status result carries plausible stdout. |
| F6 | Compile-time interfaces are used as runtime validators through `as` casts. Partial manual checks occur after unsafe property access and validate truthiness rather than exact nested types. | `apps/cli/src/operations/evaluate.ts` near 280–327; `evolve.ts` near 705–739 before DAO/file side effects near 762–773. | Fixtures cover valid JSON and a few semantic errors, not top-level null/non-object or nested wrong-type/missing-note/current/skeptic shapes. |
| F7 | Collision avoidance is treated as uniqueness-only, so randomness was chosen without considering the documented unchanged-install byte/path idempotency invariant. | `apps/cli/src/omp-hooks.ts` near 224–237; random-suffix expectation in `apps/cli/tests/omp-hooks.test.ts` near 401–426. | Idempotency coverage near 607–662 uses distinct derived names; the collision test does not run reinstall twice or assert exact paths. |
| F8 | The JSONC scanner tracks lexical state while consuming input but does not validate terminal state. EOF inside a block comment is converted to whitespace, leaving a parseable prefix. | `apps/cli/src/config.ts` near 31–107. | Existing JSONC tests cover terminated comments, trailing commas, and string preservation only. |
| F9 | Operation, handler, and Commander action option shapes are copied independently. Object spread makes runtime values flow despite stale exported annotations, hiding drift from behavior tests. | `apps/cli/src/commands/command.ts` near 24–40, 134–143, 202–212; `magent.ts` near 24–77, 136–168, 205–255. | Tests call operations or register commands; they do not type-check/call the exported handlers with `tools`/`basePath`. Magent command tests are especially shallow. |

### Solution

Implemented 2026-09-05 (pipeline attempt 2, run 936bc051). Surgical changes within existing seams; no new dependency, store column, status value, or command flag. `packages/core/src/mapper.ts` unchanged — its clean-before-write is correct once each install owns an isolated staging root.

| ID | Implemented change | Primary files / regressions |
| --- | --- | --- |
| F1 | `stepVerify` computes the candidate evaluation in memory (`save: false`), runs gates first, inserts the form row only after pass, and links the returned ID as `verify_id`; rejection/insert-failure paths leave zero new evaluation rows and enter existing transaction rollback. | `apps/cli/src/operations/evolve.ts:1151`; `evolve.test.ts`, `evolve-ingest.test.ts` ("rolls back and keeps the proposal draft when the verification row insert fails") |
| F2 | `executeInstall` creates a `mkdtempSync(tmpdir(), 'superskill-install-')` parent per invocation, sets `outputDir` under it, wraps all consumers in `try/finally` cleanup on success and thrown dependency/dispatch errors; dry-run wording corrected (targets skipped, staging internal and cleaned). | `apps/cli/src/commands/install.ts:393`; `install.test.ts` barrier test: distinct captured roots, isolated plugin sets, both roots absent after completion/failure |
| F3 | `script-path.ts` exports one locator assertion (`assertSafePathSegment` for plugin + relative-path rule); `resolveScriptPath` and `script convert` both validate before existence probe/build/write; invalid input exits 1 with usage message, no output file. | `apps/cli/src/commands/script-path.ts`, `script-convert.ts`; traversal/absolute/`..`/repeated-separator matrices incl. confirmed `cc ../../../apps/cli/src/index.ts` case; `file..ts` and nested safe paths still convert |
| F4 | PostToolUse no longer mutates session counters; SessionStart writes identity/start metadata only; Stop always aggregates `token-ledger.jsonl` in one bounded scan (exact session match, parseable `read`/`write` events, numeric tokens; malformed/foreign rows skipped) and removes only its own session file. | `apps/cli/src/commands/hook-run.ts`; `hook-run.test.ts` ("stale/partial session counters never override the ledger") |
| F5 | `TsAiRunnerBackend.run` and `TsAiRunnerJudgeBackend.judge` proceed only on `exitCode === 0`; failures throw with agent name, status/signal, and ≤500-char trimmed stderr excerpt before scoring/`parseJudgeResponse`; thrown errors propagate through the empirical gate into transaction rollback. | `apps/cli/src/operations/replay-runner.ts`, `pairwise-judge.ts`; failed-status matrices ("fails closed with the agent name and stderr excerpt on a non-zero exit", "…terminating signal on a null exit code") + evolve empirical rollback test |
| F6 | Local Zod schemas at both ingestion boundaries parse `unknown` first; code-1 field-path errors before any DAO insert, proposal file, directory creation, or content mutation. Scores: integer rubric version, exact finite `[0,1]` dimensions, non-empty notes, no extras. Proposals: full envelope + per-change validation (`current` may be empty but present), `failure_mode` enum, safe-segment `proposal_id`, `anchor_hash`, skeptic shape. | `apps/cli/src/operations/evaluate.ts`, `evolve.ts`; `evaluate.test.ts`, `evolve-ingest.test.ts` malformed-input matrices ("rejects a non-integer rubric_version", it.each proposal matrix) |
| F7 | `Math.random()` collision suffix replaced with deterministic integer allocation per `dir/baseName` (base, then `-2`, `-3`, … skipping taken names); canonical order preserved; unchanged reinstall yields identical ordered paths and bytes; stale owned modules pruned; user/foreign files untouched. | `apps/cli/src/omp-hooks.ts`; `omp-hooks.test.ts` exact `<name>.js`/`-2.js`/`-3.js` collision + byte-idempotent reinstall cases |
| F8 | `parseJsonc` records the block-comment opening position and throws `SyntaxError` naming the unterminated block comment (line/column) when EOF is reached with `blockComment` still true, before trailing-comma normalization/`JSON.parse`; all terminated-comment/trailing-comma/URL/escaped-quote behavior unchanged. | `apps/cli/src/config.ts`; `config.test.ts` single/multiline unterminated fixtures |
| F9 | `handleCommandScaffold`, `handleMagentScaffold`, `handleMagentEvaluate` input types derived via `Parameters<typeof operation>[0]`; `tools` accepted/forwarded by both scaffold handlers, obsolete `skills` alias removed, `basePath` accepted/forwarded by magent evaluate. | `apps/cli/src/commands/command.ts`, `magent.ts`; `command.test.ts`, `magent.test.ts` forwarding assertions + turbo typecheck rejection of the skills shape |

R10 scope: docs updated where behavior changed — `docs/03_ARCHITECTURE.md` (evolve pass-before-persist history; invocation-local ephemeral canonical `.rulesync` staging), stale dry-run/surface wording corrected; `.spur/context/buglog.md`/`pitfalls.md` lessons appended; `anatomy.md` unchanged (no files created/renamed in `apps/cli`). Completion gates: `bun run lint`, `bun run test` (2216 pass, 0 skipped), `bun run build`, `bun run spur-check`, `spur task check 0127 --strict-core --json` all green (`.spur/run/0127-test-gate.log`); `git status` contains only intentional in-scope changes plus documented pre-existing 0125 parked drift.

### Testing

**Pipeline verify results**

- Verdict: PASS (from verdict artifact)

| Requirement | Status | Evidence |
| ------------- | -------- | ---------- |
| R1 | MET | `apps/cli/src/operations/evolve.ts` stepVerify: candidate report computed in memory, form row inserted only after gate pass, returned ID linked as verify_id; rollback on persistence failure ("rolls back and keeps the proposal draft when the verification row insert fails", evolve-ingest.test.ts). |
| R2 | MET | `apps/cli/src/commands/install.ts`: per-invocation mkdtempSync(tmpdir()) staging parent, finally cleanup on success and thrown error; install.test.ts concurrent two-install barrier tests assert isolated roots and post-run absence. |
| R3 | MET | `apps/cli/src/commands/script-path.ts` exports the shared locator assertion; script-convert.ts validates before probe/build/write; traversal/absolute/`..` rejection with `file..ts` allowed ("returns exit code 1 for invalid", script-convert.test.ts matrix). |
| R4 | MET | `apps/cli/src/commands/hook-run.ts`: PostToolUse counter mutation removed; Stop derives totals from one bounded ledger scan filtered by exact session match ("stale/partial session counters never override the ledger", hook-run.test.ts). |
| R5 | MET | replay-runner.ts / pairwise-judge.ts: only exitCode===0 proceeds; bounded stderr excerpt with agent named ("fails closed with the agent name and stderr excerpt on a non-zero exit", "fails closed reporting the terminating signal on a null exit code", replay-runner.test.ts + pairwise-judge.test.ts). |
| R6 | MET | evaluate.ts / evolve.ts local Zod schemas validate before any DAO/file/mkdir side effect; code-1 field-path errors ("rejects a non-integer rubric_version", "rejects a non-numeric score value", "rejects an empty dimension note", evaluate.test.ts; it.each proposal matrix, evolve-ingest.test.ts). |
| R7 | MET | `apps/cli/src/omp-hooks.ts`: Math.random replaced with deterministic ordinal allocation; omp-hooks.test.ts collision cases assert exact `<name>.js`/`-2.js`/`-3.js` paths and byte-identical reinstall. |
| R8 | MET | `apps/cli/src/config.ts`: EOF inside block comment throws SyntaxError with line/column before normalization/JSON.parse; config.test.ts single/multiline unterminated fixtures plus existing terminated-comment/trailing-comma/URL-string cases green. |
| R9 | MET | command.ts / magent.ts: handleCommandScaffold/handleMagentScaffold/handleMagentEvaluate typed `Parameters<typeof operation>[0]`; tools forwarded, skills alias gone, basePath accepted and forwarded ("honors an explicit basePath override pointing elsewhere", magent.test.ts). |
| R10 | MET | Gate run green (0127-test-gate.log): bun run lint, bun run test (2216 pass, 0 skipped), bun run build, bun run spur-check, `spur task check 0127 --strict-core --json` pass; git status intentional; no new dependency, no migration, no vendors/.github changes. |

| Acceptance Criteria | Status | Evidence Type | Evidence |
| --------------------- | -------- | --------------- | ---------- |
| AC1 | MET | test | evolve transaction tests assert gate rejection leaves file byte-identical, proposal draft, changesApplied 0, zero new evaluation rows (evolve.test.ts / evolve-ingest.test.ts). |
| AC2 | MET | test | Acceptance links the exact inserted row ID as verify_id; forced insert failure rolls back to draft ("rolls back and keeps the proposal draft when the verification row insert fails"). |
| AC3 | MET | test | install.test.ts barrier test: two concurrent executeInstall calls see only their own plugin-prefixed staging, distinct captured roots, both absent after completion; forced dependency failure removes its root. |
| AC4 | MET | test | script-convert/path matrices exit 1 before probe/build/write for `../`, nested, POSIX/Windows absolute, repeated separators, unsafe plugin; `file..ts` and nested safe paths still convert. |
| AC5 | MET | test | hook-run.test.ts: stale/partial counters ignored, totals exactly match the three parseable same-session ledger events, malformed/foreign lines skipped, only own session file removed; PostToolUse no longer rewrites session JSON. |
| AC6 | MET | test | replay-runner.test.ts failed-status matrix: exit 2/null/missing/signal throw before scoring; "fails closed reporting the terminating signal on a null exit code"; exit 0 stdout unchanged. |
| AC7 | MET | test | pairwise-judge.test.ts matrix throws before parseJudgeResponse; evolve empirical-gate regression proves thrown runner failure triggers transaction rollback and leaves the proposal draft. |
| AC8 | MET | test | evaluate.test.ts malformed-score matrix fails code 1 with field path, inserts no evaluation; valid exact-dimension document persists with unchanged semantics. |
| AC9 | MET | test | evolve-ingest.test.ts it.each malformed-proposal matrix fails code 1 before proposal row/file/directory creation; valid proposal persists and stays accept-compatible. |
| AC10 | MET | test | omp-hooks.test.ts collision fixture: deterministic `<name>.js`/`-2.js`/`-3.js` allocation, two-run path+byte equality, stale owned prune, foreign/user bytes unchanged. |
| AC11 | MET | test | config.test.ts unterminated single/multiline block comments throw naming the unterminated block comment; terminated/trailing-comma/URL/escaped-quote/absent-file fixtures remain green. |
| AC12 | MET | test | command.test.ts / magent.test.ts: handlers accept and forward tools/basePath to operation spies; typecheck rejects the obsolete skills shape (lint gate includes turbo typecheck). |
| AC13 | MET | command | Gate run green end-to-end: lint + test (2216) + build + spur-check + strict-core task check, evidence in .spur/run/0127-test-gate.log; git status contains only in-scope files plus documented pre-existing 0125 parked drift. |

- Coverage: N/A (verdict-based; verify pipeline does not measure code coverage)

### Review

Fresh all-focus review of the final diff (2026-09-05, run 936bc051 review stage). Verdict: **PASS** — all 13 ACs trace to implementation and regression evidence; zero residual P1/P2 findings. Imported findings table (implementation handoff) superseded by the dispositions below; priorities retained.

| ID | Priority | Finding | Disposition |
| --- | --- | --- | --- |
| F1 | P2 | evolve evaluation persisted before all gates / no verify_id linkage | Fixed — stepVerify computes in memory, inserts after gate pass, links exact row ID as verify_id; rollback test preserved. |
| F2 | P2 | install staging collisions + leaked trees | Fixed — mkdtempSync(tmpdir()) per invocation, finally cleanup; concurrent barrier tests. |
| F3 | P2 | script locator validation drift between path/convert | Fixed — shared exported assertion used before probe/build/write; traversal matrices. |
| F4 | P2 | hook-run counters diverge from ledger | Fixed — counters removed; Stop aggregates ledger in one bounded scan; stale/partial regression. |
| F5 | P2 | replay/judge tolerate failed subprocess exits | Fixed — exitCode throw with bounded stderr excerpt; failed-status matrices. |
| F6 | P2 | unvalidated proposal/score inputs before side effects | Fixed — local Zod schemas at both boundaries; malformed-input matrices. |
| F7 | P2 | Math.random suffix non-determinism in omp-hooks | Fixed — deterministic ordinal allocation; byte-idempotent reinstall tests. |
| F8 | P3 | config EOF-in-comment misparse | Fixed — SyntaxError with line/column before normalization. |
| F9 | P3 | loose handler typing + dead skills alias in command/magent | Fixed — Parameters<typeof operation>[0] at all three seams; alias removed. |
| P4 | P4 | none open | No P1/P4 findings; legacy absent-counter hook-run coverage is structural (add explicit fixture only if a pre-scan fast path is introduced). |

SECUA sweep clean: no new dependencies, no skipped tests, no vendors/.github/workflow changes. Full evidence table: `.spur/run/0127-review-record.md`.

### References

- Source review: `sp-dev-review apps --agent inline --focus all --fix all`, 2026-09-04. The deprecated review `--fix` switch was a no-op; no source fix was applied during that review.
- Prior analogous cross-cutting remediation: task 0107, `Fix apps CLI SECUA and architecture review findings` (completed; standalone issue-task precedent).
- F1 evidence: `apps/cli/src/operations/evolve.ts` (`stepAnalyze`, `stepVerify`, `applyProposalTransaction`), `apps/cli/src/store/evaluations.ts`, and `docs/03_ARCHITECTURE.md` install/evolve invariants near lines 672–683.
- F2 evidence: `apps/cli/src/commands/install.ts` (`executeInstall`, target staging helpers, dry-run output) and `packages/core/src/mapper.ts` (`mapPluginToRulesync` clean-before-write).
- F3 evidence: `apps/cli/src/commands/script-convert.ts`, `apps/cli/src/commands/script-path.ts`, ADR-023 in `docs/00_ADR.md`, and script surface in `docs/04_DESIGN.md`.
- F4 evidence: `apps/cli/src/commands/hook-run.ts` context runners and `apps/cli/tests/commands/hook-run.test.ts` session tests.
- F5 evidence: `apps/cli/src/operations/replay-runner.ts`, `apps/cli/src/operations/pairwise-judge.ts`, and installed `@gobing-ai/ts-ai-runner/src/ai-runner.ts` showing `rejectOnError: false`.
- F6 evidence: `apps/cli/src/operations/evaluate.ts` (`ingestScores`), `apps/cli/src/operations/evolve.ts` (`ingestProposal`, `ProposedChange`, `SkepticVerdict`, `FAILURE_MODES`), and declared `zod` dependency in `apps/cli/package.json`.
- F7 evidence: `apps/cli/src/omp-hooks.ts` and collision/idempotency cases in `apps/cli/tests/omp-hooks.test.ts`; architecture invariant for identical reinstall output in `docs/03_ARCHITECTURE.md`.
- F8 evidence: `apps/cli/src/config.ts` (`parseJsonc`, `loadConfig`) and `apps/cli/tests/config.test.ts`.
- F9 evidence: `apps/cli/src/commands/command.ts`, `apps/cli/src/commands/magent.ts`, and their adjacent command tests.
- Confirmed traversal probe: `CLAUDE_PROJECT_DIR=$PWD bun apps/cli/src/index.ts script convert cc ../../../apps/cli/src/index.ts --dry-run` resolved outside `plugins/cc/scripts` and exited 0 before this task.
- Confirmed JSONC probe: `bun -e "import { parseJsonc } from './apps/cli/src/config.ts'; console.log(JSON.stringify(parseJsonc('{\"version\":1} /*')));"` printed `{"version":1}` before this task.
- Binding process/docs: `AGENTS.md`, `docs/99_PROJECT_CONSTITUTION.md`, `docs/00_ADR.md`, `docs/03_ARCHITECTURE.md`, `docs/04_DESIGN.md`.

### History

- 2026-09-05T03:17:59.423Z backlog → wip (system)
- 2026-09-05T03:59:57.249Z wip → testing (system)
- 2026-09-05T04:02:42.399Z testing → done (system)
