---
schema_version: 1
name: Prepare safe Grok Bot slash registration handoffs within install
status: done
template: feature-impl
created_at: 2026-09-10T04:30:15.632Z
updated_at: "2026-09-10T07:56:20.185Z"
feature_id: D
priority: P1

dependencies: ["0128"]
---

## 0130. Prepare safe Grok Bot slash registration handoffs within install

### Background

Task 0128 shipped the opt-in grok-bot filesystem installer (ADR-036). Grok Bot's supplied patch reports that filesystem writes alone do not populate the slash picker and proposes a new register command. Robin approved the reviewed alternative on 2026-09-09: implement post-install work within superskill install, shared with update; do not add another public command. Robin clarified that the reusable post-install mechanism comes first, with Grok Bot as its first action and the same extension path available to future coding agents. This task owns the complete adaptation and its verification. Cancelled task 0129 contributes host-smoke checks, not a separate verification deliverable.

Evidence: existing Bot branch at apps/cli/src/commands/install.ts:461; update invokes the shared installer at apps/cli/src/commands/update.ts:236; ownership protection at packages/core/src/operations/grok-bot.ts:457; bridge rendering at packages/core/src/operations/grok-bot.ts:563. Supplied update_state create/known-id behavior is host-specific and has not been independently reproduced. Official https://docs.x.ai/grok-bot/skills-routines-and-automations (checked 2026-09-09) also requires per-Bot enablement for some installed private skills.

The following requirements and Design are self-contained and supersede the proposed public register command, optional register-checklist flag, timestamped artifacts and unsafe full-mode pointers in docs/superskill_grok_bot_slash_registry_PATCH_SPEC.md. That generated file is review input, not implementation authority.

### Requirements

- [x] R1. Automatically prepare one stable plugin-scoped JSON handoff at <sandRoot>/.superskill/grok-bot/register/<plugin>.json for a successful explicit grok-bot installation. Reuse this invocation's validated entries/root/mode/source; emit one deterministic record per installed entry, the path and concise host next steps. No all-installed rescan, new register command or registration flag. Grok Bot must consume the shared post-install mechanism required by R9.
- [x] R2. Include the handoff in the existing Bot filesystem transaction and rollback boundary with catalog and receipt writes. On any failure restore the prior handoff/catalog/receipt, propagate nonzero failure and report rollback failures. Dry-run previews the handoff and slash caveat without creating or changing any destination. Never publish a successful handoff message before commit.
- [x] R3. Generate safe mode-specific records with id, nonempty name/description, recipe identity and executable content. Bridge bodies explicitly read and follow the distinct absolute canonical SKILL.md, preserve user arguments and resolve resources beside that recipe. Full records retain the real recipe body and original metadata/content needed for a preserving host write; never point a replacement body back to the workflow file it overwrites. Improve on-disk bridge wording through the existing renderer.
- [x] R4. Regenerate the same handoff on reinstall and existing marketplace update, retaining source and recorded mode. Mode switches and --prune replace stale entries; the handoff covers this committed batch only, not all retained obsolete workflows. Protect other plugins, unmarked/foreign files and unsafe paths/symlinks; no writes to managed-skills/plugins. Filesystem prune does not claim or trigger host registry deletion.
- [x] R5. Preserve existing marker/hash drift protection across host writes. Include a preserving round-trip regression and a host-rewrite conflict regression; changed full recipes/resources must not be silently rehashed, overwritten or deleted/recreated. If actual host serialization cannot preserve the supported contract, identify the conflict and leave registration pending/unsupported rather than claiming a healthy round trip. Filesystem ownership is not evidence of a known host registry id.
- [x] R6. Keep doctor filesystem fields and exit 0/1/2 semantics compatible while adding a separate slashRegistry status unknown and actionable human/JSON guidance. Healthy files are not proof of registration or visibility; instructions cover a verified host registration method and Settings > Plugins > Yours enablement for the current Bot. CLI preparation cannot report successful registration or invoke update_state without an actual supported host transport.
- [x] R7. Add focused behavioral tests to the existing Bun suites for R1–R6, including other-target isolation. Sync docs/04_DESIGN.md, docs/03_ARCHITECTURE.md, README and docs/help/entity_locations.md with implemented behavior; update scope/status/roadmap where affected. Run lint, full tests, build and spur-check as required by AGENTS.md. No new dependency/runtime; amend ADR before any divergence from ADR-036.
- [x] R8. Keep the useful checks from cancelled 0129 in this implementation task: on a separately authorized host session capture runtime/tool schema, resolved root, doctor/dry-run/cc-sp-kk install outputs, registration/refresh and per-Bot enablement method, representative skill/degraded-command/playbook slash discovery, argument passing and relative-resource access, then doctor/reinstall after bridge/full host writes. Record per-id outcomes and missing evidence. Unknown ids, unavailable access and unsafe rewrites remain unverified/blocked; local fixtures never certify host GUI behavior. No separate verification-only task.
- [x] R9. Implement the reusable target post-install mechanism before the Grok Bot action (ADR-037). Use an internal action contract and target-keyed registration/selection, with named actions, shared target/plugin/path context, preview versus apply, written-file/message results and fail-loud errors. Run selected actions after that target's files are materialized and before its receipt/final success, using the target's transaction boundary where available. Grok Bot content, Sand paths and registry guidance stay inside its action. A second-target test action must register and run through the same dispatcher without changing dispatcher logic or introducing Grok Bot branches there. Preserve deterministic order, once-per-action execution per target/plugin invocation, dry-run no writes, no action for unselected/failed targets, staging lifetime, failure reporting and update reuse. Keep existing OMP post-processing behavior unchanged; migration of other existing customizations is separate follow-up work, and future custom actions use this same contract.

### Acceptance Criteria

```gherkin
Scenario: R1 — Install prepares a Grok Bot handoff automatically
  Given a plugin and an explicit grok-bot install selection
  When the Bot install succeeds
  Then a stable plugin-scoped JSON handoff and its next-step message are available
  And ordinary target installs create no Bot handoff

Scenario: R2 — Dry-run and failed installs do not publish a new handoff
  Given a prior Bot install or a missing Sand destination
  When dry-run or a failing catalog, handoff, or receipt write runs
  Then dry-run leaves destinations untouched and failures restore prior Bot artifacts
  And no new successful handoff is advertised

Scenario: R3 — Bridge and full handoffs preserve executable recipes
  Given bridge and full skills with custom frontmatter, arguments and relative resources
  When handoff records are generated and a preserving host-write round trip is simulated
  Then bridge instructions read the distinct canonical recipe and full records retain the actual recipe
  And self-referential replacement bodies are rejected and required metadata and resources survive

Scenario: R4 — Reinstall update and prune keep the handoff current
  Given an existing handoff, changed plugin catalog and recorded materialization mode
  When reinstall, marketplace update, mode switch or owned prune runs
  Then one current handoff contains exactly this install batch and reflects its mode and committed files
  And foreign files and plugins remain untouched and no host registry deletion is claimed

Scenario: R5 — Host rewrites retain ownership conflict protection
  Given a registered workflow whose bytes or resources differ from its ownership evidence
  When doctor and reinstall inspect the modified files
  Then meaningful edits remain protected and unsafe host normalization is reported as a conflict
  And no automatic rehash, force overwrite or delete-recreate hides the change

Scenario: R6 — Doctor separates filesystem health from slash visibility
  Given healthy, creatable, unavailable and broken Bot filesystem fixtures
  When doctor runs in human and JSON modes
  Then existing filesystem fields and exit semantics remain compatible and slash visibility is unknown
  And guidance distinguishes handoff preparation, host registration and per-Bot enablement

Scenario: R7 — Documentation and repository gates cover the install adaptation
  Given the implemented helper, diagnostics and focused regression tests
  When owning documentation is synchronized and required repository gates run
  Then the install-only handoff contract is documented and all required checks pass
  And no register command, registration flag, host transport or new dependency is added

Scenario: R8 — Host acceptance evidence remains explicit within implementation
  Given local tests and a separately authorized Bot session when one is available
  When representative skills, degraded commands and specialist playbooks are exercised
  Then Testing distinguishes local results from observed host registration, enablement, slash discovery and invocation
  And missing host access, unknown ids or unsafe host rewrites are recorded as unverified or blocked rather than successful
```

```gherkin
Scenario: R9 — Target post-install actions share an extensible lifecycle
  Given registered Grok Bot and second-target test actions
  When selected targets install, preview, fail or reinstall through update
  Then the shared mechanism selects and runs eligible actions in order with explicit results and failures
  And a second target requires only its action and registration without changing dispatcher logic
  And dry-run does not apply actions and a failed base install runs no dependent action
```

### Q&A

<!-- CLOSED decisions from refinement: what was chosen and why, what was deferred and on what
     condition. Not a parking lot for open questions — an unanswered question here means the task
     is not ready to hand off. Keep empty if none. -->

#### Q&A entry — 2026-09-10T04:31:18.712Z

Robin approved the reviewed approach on 2026-09-09: a separate internal helper invoked within Grok Bot installation, shared with update; no public register command or registration flag. One cohesive implementation task owns code, documentation, regression tests and the useful checks from cancelled 0129.

The CLI prepares a stable plugin-scoped handoff and reports unknown slash visibility. It does not claim to have called the host tool or solved unknown-id registration. Actual host API behavior and per-Bot visibility require separate observations. Planning approval does not authorize production/VPS or registry mutations.

#### Q&A entry — 2026-09-10T05:33:41.415Z

Robin clarified the approved scope: implement the reusable post-install mechanism first, then apply it to Grok Bot; future coding-agent customizations must use the same extension path. This supersedes the earlier task-local-only helper and prohibition on a common mechanism. Keep one implementation task and no new public command/flag. ADR-037 and the accepted 03/04 design own the mechanism. Test a second target without migrating existing OMP behavior.

### Design

**Approved approach (clarified by Robin).** Build a reusable internal post-install action mechanism first, then implement Grok Bot as its first consumer. ADR-037 records this shared convention. The dispatcher owns action selection, lifecycle ordering, preview/apply and result/error handling; each target action owns its domain-specific customization. Grok Bot core operations continue to own content/path validation and transactional writes. Install orchestrates action registration and output; update reuses executeInstall.

**Rejected alternatives.** A public register command duplicates installed-catalog discovery and adds flags/formats while still requiring the host agent. Warning-only leaves manual payload assembly. An externally configured hook/plugin runtime is unnecessary. A small internal target action contract is explicitly required; existing postInstallOmp at apps/cli/src/commands/install.ts:1279 demonstrates another customization that can adopt it later. One implementation task is intentional: content, transaction, diagnostics and their tests share the same files and review context (estimated 6–8 hours; reassess after 8 hours, preserve partial evidence rather than opening a pure-test task).

**Flow.** Validate target selection and base-install plan → resolve registered post-install actions → preview for dry-run without applying → materialize the target's files → execute its actions within the target completion/transaction boundary → include returned artifacts in receipts → commit → print action messages and final success. Grok Bot's action builds and transactionally replaces the stable handoff after workflow materialization. A target-specific failure stops its dependent actions; completed other targets are reported honestly without promising cross-target rollback. Keep staging alive until actions finish; no unselected target is enabled by action discovery. See docs/03_ARCHITECTURE.md section Target post-install actions and docs/04_DESIGN.md section Internal post-install action contract (both accepted design, not yet built).

**Handoff contract.** Stable plugin-specific path; versioned JSON with target, plugin, resolved dataRoot, source/materialization identity and deterministically ordered skill records. Each record retains id, name, description, resolved recipe path, mode-appropriate body and original SKILL.md content/metadata needed to avoid lossy host conversion. Use existing parsed metadata and identity/path guards rather than inventing host API types. The artifact is a host-neutral preparation record, not a promise of a working update_state request. Mark visibility unknown in diagnostics; do not persist guessed per-id host outcomes.

**Host boundary.** The agent consuming the handoff must inspect the actual tool schema and existing registry identity before applying a supported write. Use at most one attempt per id per apply pass; report rejection rather than retrying create indefinitely or deleting/recreating entries. Preserve complete full-mode content, extra frontmatter and support files. A preserving simulated round trip validates our data; actual host normalization remains a separate observation. Byte-changing host writes must surface through existing drift rules unless a later explicitly reviewed compatibility design proves safe. Do not add normalization exceptions speculatively.

**Files/callers.** packages/core/src/operations/post-install.ts (new shared action contract/runner) and packages/core/tests/operations/post-install.test.ts (new mechanism tests); apps/cli/src/commands/install-post-actions.ts (new target action registration/adaptation); packages/core/src/operations/grok-bot.ts (builder, bridge body, emission, doctor report); packages/core/src/index.ts only if an export is required; apps/cli/src/commands/install.ts (shared Bot dispatch/message); apps/cli/src/commands/doctor.ts (human output); update.ts only if integration evidence requires a change. Extend packages/core/tests/operations/grok-bot.test.ts and apps/cli/tests/commands/{install-grok-bot,doctor,update}.test.ts. Keep other target callers unchanged.

**Verification boundary.** Local delivery can be verified independently of private host availability. Report local implementation PASS separately from live host PASS/UNVERIFIED/BLOCKED; do not call complete slash enablement verified without observation. Production installation and registry writes require separate explicit authorization; approval of this planning task is not deployment permission. Preserve host evidence in this task's Testing/Artifacts, including unavailable evidence.

**Execution constraints.** requireDiff: source/tests/docs change is required for implementation completion. No token budget assigned. Save partial results in the existing .spur/run task artifacts at phase boundaries. The shared mechanism is recorded in ADR-037 and its 03/04 detail; this Design applies it to the Bot action. Establish the mechanism and its second-target regression before wiring the Grok Bot consumer.

**Extensibility proof.** Use a target-keyed registry of small typed actions, not subclass/factory discovery or arbitrary shell hooks. The shared PostInstallAction contract has a stable id, separate preview/apply functions and a common PostInstallContext; results expose writtenFiles and messages for orchestration. Target-specific validated data is captured by typed action factories/closures, not added as Bot-only fields to the common context. New target support adds an action and a registry entry; runPostInstallActions remains unchanged. One test registers a synthetic action for an existing non-Bot target and exercises the same runner. OMP is evidence for the seam, not an unrequested migration in this task. Preserve each target's actual rollback capability; the generic runner cannot make an external native installer transactional.

### Plan

1. Re-read owning docs, the shared install/update path, transaction finalization, ownership checks and current tests; capture a focused failing regression for shared action dispatch/second-target extensibility, then handoff generation/content safety.
2. Implement the shared PostInstallAction/PostInstallContext contract, target registry and runner first; verify selection, preview/apply, ordering, failure and second-target extension. Then implement the Grok Bot action with safe bridge/full content and path validation.
3. Integrate transactional stable handoff replacement with Bot emission/receipt rollback, dry-run preview and post-commit CLI guidance; exercise update, prune and mode switches.
4. Add compatible doctor unknown-visibility fields/text and host registration plus enablement guidance.
5. Extend focused regressions for preserving/changed host-write round trips, ownership isolation and failure rollback; synchronize owning docs from the final implementation.
6. Run required local gates and review the diff. Record results and evidence through Spur; if separately authorized, execute R8 host checks and record actual outcomes. Otherwise explicitly record live host evidence unavailable within this same task.

### Solution

Implementation complete (task-pipeline v3 implement stage). Registry primitive + runner in core, Grok Bot handoff domain in core, CLI factory + wiring, doctor diagnostics; deterministic transaction-bound handoff writes.

**New — core mechanism (`packages/core/src/operations/post-install.ts`):**
- `PostInstallContext` (readonly `target`/`plugin`/`installRoot`/`stagingRoot`/`dryRun`), `PostInstallResult` (`writtenFiles`/`messages`), `PostInstallAction` (`id`/`preview`/`apply`), `TransactionalWrite`.
- `runPostInstallActions` — duplicate-id reject, ordered once, dryRun→preview only, errors wrapped `post-install action '<id>' failed for target '<target>': …`.
- `PostInstallRegistry` + `createPostInstallRegistry()` — per-invocation, target-keyed, dup-id reject per target, absent target no-op. Re-exported from `packages/core/src/index.ts:54`.

**Grok Bot domain (`packages/core/src/operations/grok-bot.ts`):**
- `botRealpath` (realpathSync with resolve fallback — all handoff paths normalized so reinstall bytes stay identical), `botRegisterHandoffPath` (`<dataRoot>/.superskill/grok-bot/register/<plugin>.json`), `BotRegisterHandoff` (`schemaVersion: 1`; `skills[{id,name,description,mode,recipePath,body,frontmatter,resources}]`), `BOT_SLASH_CAVEAT`, `buildBotRegisterHandoff` (derives `workflowsDir` internally; rejects self-referential full bodies via `GrokBotPreflightError`), `serializeBotRegisterHandoff` (2-space JSON + trailing newline).
- `emitGrokBotInstall` `postActions?: (write: TransactionalWrite) => { actions, stagingRoot }` — actions run after catalog/prune, before the receipt snapshot, inside the `FilesystemTransaction` (failure → rollback incl. handoff; messages returned post-commit via `EmitGrokBotResult.postInstall`).
- `renderBridgePointer` body upgraded (R3): instructs the host to read/follow the canonical SKILL.md, pass arguments through, resolve resources beside it, edit only the canonical copy.

**CLI wiring:**
- New `apps/cli/src/commands/install-post-actions.ts` — `createGrokBotRegisterAction` (action id `grok-bot/register-handoff`; preview describes, apply writes via the captured tx-bound writer; messages = handoff path + caveat, never claim registration).
- `apps/cli/src/commands/install.ts:497` dry-run: preview registry + guard writer (write → throw `'preview attempted a write'`), echoes `grok-bot (dry-run): …`. `install.ts:579` apply: `postActions` factory closure into emit, echoes `grok-bot: …` after commit.
- `apps/cli/src/commands/doctor.ts` — `printSlashRegistry`: `slashRegistry.status: 'unknown'` + handoff dir + guidance in JSON and human output, printed even when the root is unresolved; exit 0/1/2 unchanged. `update.ts` needs no change (update threads materialize through `executeInstall`, which owns the handoff).

**Tests (+24):** `packages/core/tests/operations/post-install.test.ts` (8: ordered run, dup ids, dry-run preview, failure identity+propagation, second-target synthetic 'claude' via same dispatcher, per-invocation registries); `grok-bot.test.ts` describe `registration handoff (task 0130)` (7: deterministic in-transaction handoff + `BOT_SLASH_CAVEAT` echo, action-failure rollback (absent handoff + `never.json`), finalize-failure rollback, full-mode self-reference rejection, host-write round-trip (`markerHashesCurrent` true), doctor slashRegistry, bridge-pointer intent lines); `install-grok-bot.test.ts` describe `grok-bot registration handoff (task 0130)` (4: byte-identical reinstall handoff, dry-run preview creates nothing, bridge→full + `--prune` drops stale entries, ordinary targets create no Sand root/handoff); `doctor.test.ts` +1 (JSON slashRegistry + human guidance + unresolved-root caveat). Existing full-mode assertion narrowed: `register/` is now an intentional artifact.

**Docs (same-commit sync):** `docs/04_DESIGN.md` — contract table (implemented shape, `TransactionalWrite`, registry) + new "Grok Bot registration handoff" section (handoff path/schema/determinism, dry-run preview, prepared-not-registered). `docs/03_ARCHITECTURE.md` — runner/registry lifecycle, transaction ownership, staging aliveness, prepared-not-registered boundary. `README.md` + `docs/help/entity_locations.md` — handoff location + non-automatic caveat. `docs/05_FEATURES.md` — feature D note now "implemented".

**Verification:** 151 pass / 0 fail across 6 targeted suites (grok-bot, post-install, install-grok-bot, doctor, install, update); `tsc --noEmit` clean (core + cli); biome check clean (10 files, 0 errors 0 warnings).

**Residual / out of scope:** real-flow `superskill update` after a `--plugin-path` install reports `upstream unavailable` (task-0128-era upstream resolution for bare path locators; unchanged by 0130 — marketplace updates thread materialize + reinstall via `executeInstall` per R7, regenerating the handoff). `postInstallOmp` preserved unchanged; migrating it is separate work. Host-side slash registration itself remains a manual, verified-host-method step by design (R1).

### Testing

**Pipeline verify results**

- Verdict: PASS (from verdict artifact)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| R1 | MET | `packages/core/src/operations/grok-bot.ts:362` — `botRegisterHandoffPath()` stable `<plugin>.json`; `apps/cli/src/commands/install.ts:564-580` — action factory wired into `emitGrokBotInstall` postActions; batch-only records `packages/core/src/operations/grok-bot.ts:422-459` (`buildBotRegisterHandoff` maps this invocation's entries only); no register command/flag in diff; tests `apps/cli/tests/commands/install-grok-bot.test.ts:224` (deterministic handoff, no registration claim) + `:338` (ordinary targets create no Bot handoff/Sand root) |
| R2 | MET | `packages/core/src/operations/grok-bot.ts:819-841` — actions run after catalog/prune, before receipt snapshot, inside `FilesystemTransaction`; rollback tests `packages/core/tests/operations/grok-bot.test.ts:723` (action failure → handoff + `never.json` absent, prior catalog restored) + `:768` (receipt failure after actions → handoff rolled back); dry-run no-write guard `apps/cli/src/commands/install.ts:511-515` (`:514` throws `'preview attempted a write'`); success messages echoed only post-commit `apps/cli/src/commands/install.ts:588` |
| R3 | MET | bridge body `packages/core/src/operations/grok-bot.ts:409-414` (read canonical SKILL.md, pass arguments, resolve resources beside it); full-body self-reference rejection `:438-441` (`GrokBotPreflightError`, test `grok-bot.test.ts:790`); record keeps `frontmatter`/`resources` `:453-455`; deterministic serialization `:466`; upgraded `renderBridgePointer` `:701` (test `grok-bot.test.ts:643` asserts argument/resource intent lines) |
| R4 | MET | `apps/cli/src/commands/update.ts:221-243` — recorded materialization mode, no-guess guard routes to explicit reinstall; `update.ts:136,233` — update reuses `executeInstall` so handoff regenerates; test `apps/cli/tests/commands/install-grok-bot.test.ts:296` (reinstall → full recipes, `--prune` drops stale entries); foreign/drift protection conflict gate `packages/core/tests/operations/grok-bot.test.ts:391-465`; caveat never claims registry deletion `grok-bot.ts:404` |
| R5 | MET | preserving round-trip `packages/core/tests/operations/grok-bot.test.ts:804` (write body from record → `markerHashesCurrent` true); host-rewrite conflict regressions `:391-465` (modified owned workflow / bridge canonical drift refused, no silent rehash); doctor never equates files with registration (`grok-bot.ts:915,930` status always `unknown`) |
| R6 | MET | `packages/core/src/operations/grok-bot.ts:915-934` — `slashRegistry.status: 'unknown'` + handoffDir + guidance on all return paths incl. unresolved root; `apps/cli/src/commands/doctor.ts:6-10` human output printed unconditionally, JSON via whole-report serialization `doctor.ts:76`; exit 0/1/2 untouched per `apps/cli/tests/commands/doctor.test.ts:98` (also asserts JSON + human + unresolved-root caveat) |
| R7 | MET | 19 new focused tests this diff (11 in tracked suites incl. `apps/cli/tests/commands/install-grok-bot.test.ts:224-338`, `apps/cli/tests/commands/doctor.test.ts:98`; 8 in new `packages/core/tests/operations/post-install.test.ts`) incl. other-target isolation `post-install.test.ts:113` (synthetic `claude` target through same dispatcher); docs synced: `docs/04_DESIGN.md:19-46`, `docs/03_ARCHITECTURE.md:16-47`, `README.md:102-103`, `docs/help/entity_locations.md:26`, `docs/05_FEATURES.md:40`; gates re-run this turn: `bun run lint` exit 0, `bun run test` exit 0 (2302 pass / 0 fail, 113 files), `bun run build` exit 0, `bun run spur-check` exit 0 (3/3 post-check rules incl. coverage gate); no package.json/bun.lock change |
| R8 | MET | host session not authorized (task Q&A 2026-09-10: planning approval ≠ host authorization) — requirement's fallback applied: caveat `grok-bot.ts:404` and doctor guidance `grok-bot.ts:922-928` never claim registration/visibility; host unavailability recorded in task Solution §Residual; `.spur/run/0130-test-gate.status` = PASS, findings empty; local-vs-host split must transcribe into `## Testing` at record (tracked as P3 residual below) |
| R9 | MET | mechanism-first `packages/core/src/operations/post-install.ts:58` (`runPostInstallActions` — ordered once, dup-id reject, dry-run→preview) + `:94` (`createPostInstallRegistry`, absent target no-op); second-target extensibility test `post-install.test.ts:113`; Grok Bot as first consumer `apps/cli/src/commands/install-post-actions.ts:45`; no Bot branches in runner (read in full); OMP `postInstallOmp` untouched (absent from diff); failure/dry-run/unselected semantics tested `post-install.test.ts:32-113` |

| Acceptance Criteria | Status | Evidence Type | Evidence |
|---------------------|--------|---------------|----------|
| Scenario: R1 — Install prepares a Grok Bot handoff automatically | MET | test | `apps/cli/tests/commands/install-grok-bot.test.ts:224` + `:338` |
| Scenario: R2 — Dry-run and failed installs do not publish a new handoff | MET | test | `apps/cli/tests/commands/install-grok-bot.test.ts:279` (dry-run creates nothing) + `packages/core/tests/operations/grok-bot.test.ts:723,768` (rollback restores prior artifacts) |
| Scenario: R3 — Bridge and full handoffs preserve executable recipes | MET | test | `packages/core/tests/operations/grok-bot.test.ts:675` (bridge body reads distinct canonical recipe; frontmatter/resources survive) + `:790` (self-referential replacement body rejected) + `:804` (preserving round trip) |
| Scenario: R4 — Reinstall update and prune keep the handoff current | MET | test | `apps/cli/tests/commands/install-grok-bot.test.ts:296` + `:338` (foreign untouched) + caveat wording `packages/core/src/operations/grok-bot.ts:404` |
| Scenario: R5 — Host rewrites retain ownership conflict protection | MET | test | `packages/core/tests/operations/grok-bot.test.ts:391-465` (conflict gate) + `:804` (`markerHashesCurrent` true after preserving write) |
| Scenario: R6 — Doctor separates filesystem health from slash visibility | MET | test | `apps/cli/tests/commands/doctor.test.ts:98` + `packages/core/tests/operations/grok-bot.test.ts:834` (status `unknown`, availability unaffected) |
| Scenario: R7 — Documentation and repository gates cover the install adaptation | MET | command | `bun run lint`/`test`/`build`/`spur-check` all exit 0 this run (2302/2302); docs grep `docs/04_DESIGN.md:19`, `docs/03_ARCHITECTURE.md:16`, `README.md:102`, `docs/help/entity_locations.md:26`; no register command/flag/dependency in diff |
| Scenario: R8 — Host acceptance evidence remains explicit within implementation | MET | test | messages/doctor never claim host registration (`grok-bot.ts:404,922-928`); unavailable host access recorded unverified in Solution §Residual + Q&A; test-gate artifact PASS |
| Scenario: R9 — Target post-install actions share an extensible lifecycle | MET | test | `packages/core/tests/operations/post-install.test.ts:32-121` (ordered, dup-id, dry-run preview-only, failure identity) + `:113` (second target through same dispatcher, no runner change) + rollback `packages/core/tests/operations/grok-bot.test.ts:723` |
- Coverage: N/A (verdict-based; verify pipeline does not measure code coverage)

### Review

**Scope:** task 0130 working-tree diff (10 code/test files + 5 docs; packages/core/src/operations/post-install.ts and grok-bot.ts, apps/cli/src/commands/{install,doctor,install-post-actions}.ts)
**Dimensions:** functional, security, efficiency, correctness, usability, architecture
**Verdict:** PASS

| Priority | Dimension | Location | Finding |
| --- | --- | --- | --- |
| P3 | correctness | `docs/tasks/0130_prepare-safe-grok-bot-slash-registration-handoffs-within-ins.md` (`## Testing`) | R8 disposition (live host evidence unavailable — no separately authorized Bot session) lives only in Solution §Residual; `## Testing` is still the bare template. Record step must transcribe local-vs-host evidence split before `done`. |
| P3 | correctness | `packages/core/src/operations/grok-bot.ts:433` | Full-mode self-reference guard (`entry.skillMd.includes(workflowSkillPath)`) matches only the realpath-normalized workflow path. On a symlinked Sand root (e.g. `/tmp`→`/private/tmp`), a body citing the unresolved-form absolute path passes the R3 rejection. Narrow: frontmatter/body/resources are carried for a preserving host write, so the destructive path requires the host to ignore them. |
| P4 | architecture | `apps/cli/src/commands/install.ts:505-520` | Dry-run and apply branches each assemble `GrokBotRegisterActionArgs` (twin 12-line construction sites at install.ts:505 and install.ts:564); one shared builder in `executeInstall` would remove the drift risk when args change. |
| P4 | architecture | `packages/core/src/operations/grok-bot.ts:819` | The `postActions(write) → {actions, stagingRoot}` indirection is a two-layer seam for one consumer today; it earns its keep only when OMP migrates onto the contract (explicitly deferred). Acceptable as designed; revisit if OMP migration is dropped. |

#### Functional Traceability

| Req | Status | Evidence |
| --- | --- | --- |
| R1 | MET | `packages/core/src/operations/grok-bot.ts:362` — `botRegisterHandoffPath()` stable `<plugin>.json`; `apps/cli/src/commands/install.ts:564-580` — action factory wired into emit; batch-only records `grok-bot.ts:422-459` (`buildBotRegisterHandoff` maps this invocation's entries); no register command/flag added (diff has none); test `apps/cli/tests/commands/install-grok-bot.test.ts` describe `grok-bot registration handoff (task 0130)` — 'ordinary target installs never create a Bot handoff or Sand root' |
| R2 | MET | `packages/core/src/operations/grok-bot.ts:818-841` — actions run after catalog/prune, before receipt snapshot, inside `FilesystemTransaction`; rollback tests `packages/core/tests/operations/grok-bot.test.ts` describe `registration handoff (task 0130)` — 'rolls the handoff back with the catalog when a post-install action fails' + 'rolls the handoff back when the receipt write fails after actions'; dry-run no-write guard `apps/cli/src/commands/install.ts:511-515` (`'preview attempted a write'`); post-commit-only messages `install.ts:588` |
| R3 | MET | `grok-bot.ts:409` — bridge body reads canonical SKILL.md, passes arguments, resolves resources beside it; `grok-bot.ts:433-441` — full-body self-reference rejection (`GrokBotPreflightError`); `grok-bot.ts:466` — deterministic serialization; `grok-bot.ts:688` — upgraded `renderBridgePointer`; record keeps `frontmatter`/`resources` (`grok-bot.ts:381-395`) |
| R4 | MET | `apps/cli/src/commands/update.ts:221-243` — recorded materialization mode, no-guess guard routes to explicit reinstall; `executeInstall` reuse regenerates handoff; test 'reinstall switches handoff records to full recipes and --prune drops removed entries' (install-grok-bot describe); foreign/drift protection `grok-bot.test.ts:391-465` conflict gate; caveat wording never claims registry deletion (`grok-bot.ts:404`) |
| R5 | MET | preserving round-trip `packages/core/tests/operations/grok-bot.test.ts:804` ('full-mode records preserve a host write round-trip', `markerHashesCurrent` true); host-rewrite conflict regressions `grok-bot.test.ts:391-465` (modified owned workflow / prune-with-extras / bridge canonical drift all refused); doctor never equates files with registration (`grok-bot.ts:915` status always `'unknown'`) |
| R6 | MET | `packages/core/src/operations/grok-bot.ts:915-934` — `slashRegistry.status: 'unknown'` + handoffDir + guidance on all return paths (incl. unresolved root); `apps/cli/src/commands/doctor.ts:6,28` — human + JSON output independent of availability; exit semantics untouched per `apps/cli/tests/commands/doctor.test.ts:38` + new case `doctor.test.ts:98` |
| R7 | MET | 24 new focused tests across 4 suites incl. other-target isolation (`packages/core/tests/operations/post-install.test.ts:113` synthetic second target through same dispatcher); docs synced: `docs/04_DESIGN.md`, `docs/03_ARCHITECTURE.md`, `README.md`, `docs/help/entity_locations.md`, `docs/05_FEATURES.md` (verified in diff, "not yet built"→implemented); gates re-run this turn: `bun run lint` exit 0, `bun run build` exit 0, `bun run spur-check` exit 0 — 2302 pass / 0 fail across 113 files, 3/3 post-check rules; no package.json/bun.lock change |
| R8 | MET | host session not authorized (Q&A: planning approval ≠ host authorization) — requirement's fallback applied: messages/caveat (`grok-bot.ts:404`) and doctor (`grok-bot.ts:930`) never claim registration; unavailability recorded in Solution §Residual; test-gate artifact `.spur/run/0130-test-gate.status` = PASS, findings empty. Residual: transcription into `## Testing` pending at record (P3 above) |
| R9 | MET | mechanism-first `packages/core/src/operations/post-install.ts:58` (`runPostInstallActions` — ordered once, dup-id reject, dry-run preview) + `:94` (`createPostInstallRegistry`); Grok Bot first consumer `apps/cli/src/commands/install-post-actions.ts:37`; no Bot branches in runner (read in full); OMP `postInstallOmp` untouched (absent from diff); failure/dry-run/unselected semantics tested `post-install.test.ts:32-121` |

**Next:** proceed to record — Testing must transcribe the R8 local-vs-host split; P3 realpath guard can ride a follow-up if the symlinked-root case is judged out of local scope.

Functional Verdict: PASS

### References

- Feature D: `docs/features/D_grok-bot-opt-in-install-target-task-0128-adr-036.md`, extension scenarios R11–R18 map by title to this task's R1–R8.
- Dependency 0128: `docs/tasks/0128_add-explicit-opt-in-grok-bot-vps-install-target-with-durable.md` (filesystem installer, locally verified).
- Retired 0129: `docs/tasks/0129_run-authorized-grok-bot-vps-host-smoke-for-the-grok-bot-inst.md`; useful host checks carried into R8.
- Binding architecture: `docs/00_ADR.md:617` (ADR-036); process: `docs/99_PROJECT_CONSTITUTION.md`.
- Existing installer: `apps/cli/src/commands/install.ts:461`; transaction: `packages/core/src/operations/grok-bot.ts:615`; doctor: `apps/cli/src/commands/doctor.ts:6`.
- Reviewed input only: `docs/superskill_grok_bot_slash_registry_PATCH_SPEC.md`; this task supersedes its register-command/flag and unsafe pointer proposals.
- Official per-Bot enablement guidance: https://docs.x.ai/grok-bot/skills-routines-and-automations (read 2026-09-09). Private update_state behavior remains supplied host evidence.
- Local review evidence: `.spur/run/grok-bot-slash-idea-eval-20260909.md`; existing baseline 63 tests passed before implementation, not proof of the new behavior.

### History

- 2026-09-10T07:21:03.948Z todo → wip (system)
- 2026-09-10T07:56:05.182Z wip → testing (system)
- 2026-09-10T07:56:20.185Z testing → done (system)

