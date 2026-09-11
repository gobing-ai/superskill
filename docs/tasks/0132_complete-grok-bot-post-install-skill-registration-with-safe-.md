---
schema_version: 1
name: Complete Grok Bot post-install skill registration with safe bootstrap fallback
status: done
template: feature-impl
created_at: 2026-09-11T04:27:45.771Z
updated_at: "2026-09-11T05:02:59.779Z"
feature_id: D
priority: P1
tags:
  - grok-bot
  - post-install
  - skill-registration

dependencies: ["0130"]
ac_numbering: task-local
---

## 0132. Complete Grok Bot post-install skill registration with safe bootstrap fallback

### Background

Robin reports that Grok Bot input hints still omit installed agent skills, including slash commands and subagents degraded into skills, after the prior post-install work. He supplied plugins/cc/skills/cc-grok-bot-register/SKILL.md as an all-in-one recovery procedure and requested exactly one detailed implementation task. Desired behavior is automatic completion where the host supports it, with the recovery skill retained as a second-tier fallback; if safe automation cannot ship, this skill becomes the primary post-install action. This task owns that whole local delivery and its acceptance evidence. It is not a request to execute the registration skill during planning.

Task 0128 established Sand-scoped bridge/full installation; completed task 0130 established the reusable post-install action registry, deterministic per-plugin handoffs and filesystem-only doctor. Reuse these contracts. Cancelled 0129 is historical host-smoke input, not a new dependency or another task to recreate. Depends on 0130 (already done); 0128 is its transitive baseline. Feature D scenarios R20–R31 map one-to-one by title to this task's R1–R12; historic feature scenarios remain unchanged.

**Observed on 2026-09-10:** mapPluginToRulesync(plugins/cc, cc, scratch, skills/commands/subagents) followed by collectBotSkillEntries produced 29 entries: 7 skills, 17 commands, 5 subagents. The supplied source folder emitted cc-cc-grok-bot-register, while its bootstrap and self-first logic expect cc-grok-bot-register. This is a concrete repository bug independent of host API access. Existing CLI code never calls the host skill API; it only prepares handoffs. The source contracts preserve full-mode content and Bot-owned canonical paths; the draft's preference for arbitrary shared skills and its generic pointer rewrite can violate them. The draft resources: [] example also disagrees with BotRegisterSkillRecord.resources: Record<string,string>.

**Evidence limits:** the public xAI skills/routines page, checked 2026-09-10, documents desktop slash references and per-Bot private-skill enablement. It does not establish update_state's schema/transport, upsert-on-existing-folder behavior, destructive delete behavior, hidden-path Read denial or universal mobile hint behavior. Those are user-supplied host assertions to verify. No Grok host state/registry tool is exposed in the planning session. The user references release 0.3.24; checkout apps/cli/package.json and plugins/cc/plugin.json read 0.3.23. Use current source as the implementation baseline; release provenance/version changes are outside this task.

The original skill remains staged and unchanged by planning. Read and preserve it as user-authored input, then apply the explicit corrections below during implementation. All future implementation changes must remain reviewable; do not stage, reset or overwrite concurrent work.

### Requirements

- [x] R1. Establish the registration capability and catalog baseline before changing behavior. Trace mapper → collectBotSkillEntries → executeInstall → createGrokBotRegisterAction → emitGrokBotInstall → receipt, and executeUpdate → executeInstall; inventory each selected plugin's mapped skill, adapted-command and adapted-subagent IDs. Record current host/version/tool-schema evidence when available, distinguishing registry write, per-Bot enablement, desktop picker visibility and invocation. The supplied update_state contract and Read/mobile behavior are hypotheses until verified. Spend at most 90 minutes on capability discovery in the first implementation session; if no supported callable host mechanism is established, record the reason and implement the complete fallback in this task. Do not silently treat handoff preparation as the automatic solution.
- [x] R2. Ship the recovery skill with the exact installed ID cc-grok-bot-register and one usable bootstrap path. Fix the source naming mismatch locally: the new directory plugins/cc/skills/cc-grok-bot-register currently maps to cc-cc-grok-bot-register. Prefer normalizing the source directory to plugins/cc/skills/grok-bot-register and its source frontmatter to grok-bot-register, following existing plugin conventions; preserve the authored procedure while hardening it. Do not change the global mapper prefix algorithm, add alias skills, or rename existing unrelated skills. The release's normal plugin assets, mapped catalog and handoff must include the recovery skill once when skills are selected. No release number bump or publication is included.
- [x] R3. Enhance the existing Grok post-install action and shared install/update messages with an actionable first-run recovery prompt. After commit, report the actual handoff path and, only when available, the resolved workflows/cc-grok-bot-register/SKILL.md path; tell the operator to ask the Bot to read and follow that file to consume handoffs, without requiring an already working slash picker. Account for Bot Read denying hidden canonical files by explicitly describing the authorized Shell read fallback. For sp/kk-only installs, feature selection excluding skills, or a missing recovery skill, provide a self-contained consume-this-handoff prompt and an optional explicit cc install instruction rather than a nonexistent recovery path. Do not implicitly install cc, enable another target, or rescan/register all plugins during a plugin-scoped install. Dry-run prints prospective steps without host calls or destination writes.
- [x] R4. Prefer automatic completion only through a capability actually available to the installing context and verified in R1. Reuse the existing target action/registry lifecycle for preparation; do not invent a CLI-callable update_state tool, registry file format, remote endpoint, shell hook framework, credential, or undocumented DB edit. If an already supported, authorized host mechanism can safely register the committed catalog, integrate it into the existing install/update completion flow and verify its outcomes. External registry calls occur only after filesystem/receipt commit; their failures preserve the valid local install and handoff, report partial/pending registration per ID, and never claim filesystem rollback undid host side effects. An attempted operational host failure must remain machine-detectable and yield nonzero CLI failure; an absent capability is a successful filesystem install with explicit pending registration and fallback guidance. When no safe supported mechanism exists, ship the complete recovery skill as the primary post-install step and label automatic registration unavailable; if automatic registration works, retain the skill as the second-tier repair path.
- [x] R5. Make the fallback a safe consumer of the existing BotRegisterHandoff v1 contract. Resolve Sand root consistently with resolveSandRoot (explicit invalid SAND_DATA must not silently select a different root); read only this root's .superskill/grok-bot/register/*.json, sorted by basename. Validate the supported schemaVersion exactly, target, plugin/source identity, normalized matching dataRoot, materialize, skills array, per-record mode, nonempty string id/name/description/body, safe single-segment identifiers, and contained recipe/resource paths. The actual resources field is Record<string,string>, not the draft's array. Check the corresponding installed workflow, ownership/source evidence and drift before a host write. Report malformed JSON, unsupported versions, unsafe/symlink escapes and stale/mismatched records and continue with independent valid records. A duplicate ID with contradictory plugin/source/content is a conflict with zero writes for that ID; byte-equivalent duplicate records may be coalesced. Do not use silent last-file-wins, overwrite foreign skills, or trust folder existence as registry identity.
- [x] R6. Support the recovery skill's documented arguments without adding superskill CLI flags: no arguments processes all valid handoffs; --plugin <id> restricts to that handoff; --self-only restricts the selected records to the recovery ID; --dry-run permits reads and reports but no host or workflow/registry writes; flags combine by intersection and missing/unknown arguments produce actionable usage guidance. Register the recovery ID first only when it belongs to the selected eligible set, then process remaining IDs in stable order. An empty selection is an explicit no-op. A missing handoff may be synthesized for self only from the current owned, drift-free recovery workflow with preserved mode/content/source identity; otherwise instruct reinstall. A plugin filter must not be bypassed to register self from another plugin. Every eligible mapped skill, adapted command and adapted subagent is considered without type-specific exclusion; subagents remain invocable skill/playbook adaptations, with no promise of native Bot subagent execution.
- [x] R7. Preserve executable recipes and resources through path selection and host serialization. Bridge registration must read the current Bot-owned canonical recipe via a verified Read-accessible path or permitted Shell fallback, preserving arguments unchanged and resolving resources beside that recipe. Never prefer ~/.agents/skills merely because a file exists: it may be stale, foreign-dialect or a different source. Use the existing Bot canonical tree by default; do not add a mirror store or expand allowed roots speculatively. Full mode must retain the complete real recipe, custom frontmatter and resource files; never replace it with a body pointing to the same workflow file, including symlink/relative aliases. Do not synthesize self as a self-referential pointer. If the actual host schema cannot preserve content or the runtime cannot read it, report that ID unsupported/failed with repair guidance, leaving original files intact. No silent description truncation or metadata stripping without a documented host limit and preserving policy.
- [x] R8. Implement the host-side procedure against the live available tool schema. Where verified, use update_state target=skill action=write with the exact existing mapped id plus the required name, description and preserving body/metadata; otherwise adapt only to a documented equivalent or report unsupported. Check collision/ownership and supported upsert behavior before using an on-disk ID that is absent from the registry. Make at most one write attempt per eligible ID per invocation; continue after an independent rejection, retaining already successful entries. Never delete/recreate skills, delete workflow directories, manufacture new IDs, retry indefinitely, or reset ownership hashes to conceal host changes. Re-running refreshes the same IDs without duplicates, preserves custom content, and reports ok/failed/skipped/conflict/pending reasons per ID. Tool success establishes an acknowledged registration write only, not picker visibility or successful execution.
- [x] R9. Preserve task 0130's transaction, drift, provenance and update contracts. Handoff/recipe/message preparation remains deterministic for identical validated inputs, included in the existing filesystem rollback/receipt boundary, and emitted only after commit. Reinstall, explicit mode switch, marketplace update and --prune use current selected entries and recorded materialization/source identity. Host registration may write managed workflow bytes: exercise both preserving and byte-changing round trips, then doctor, reinstall, update and prune; refuse meaningful drift without automatic rehashing, overwrite or loss. A removed filesystem entry is not authorization to remove host registry entries. Preserve other plugins, other targets, foreign files and absent/unselected target behavior. The shared post-install runner remains generic and its second-target contract stays intact.
- [x] R10. Make status and operator guidance truthful across install, update and doctor in human/JSON output. Distinguish workflows/handoff prepared, host write acknowledged, enablement pending/unknown, picker observed/unverified, and invocation observed/unverified. Keep doctor read-only with existing filesystem fields and exit 0/1/2 semantics; retain slashRegistry.status=unknown without a supported registry read, even after a prior successful write. Missing Sand roots produce repair guidance rather than a fabricated path. Do not remove official per-Bot enablement guidance merely because the generated skill calls UI paths fictional; cite current official docs and verify applicability. Describe desktop slash verification and observed mobile differences conditionally, without asserting all mobile clients lack hints or that typed /id works without host evidence. Do not auto-enable all Bots.
- [x] R11. Leave focused regression evidence and synchronize only owning documentation. Extend existing Bun mapper, Grok core/install/update/doctor and post-install suites with a real mixed artifact fixture, recovery naming/bootstrap availability, validation/filter/order/partial failure cases for any implemented deterministic helper, preserving full/bridge content, stale shared-path traps, dry-run/rollback and update integration. Exercise the recovery prose with a concrete host or schema-faithful replay transcript; tests that only search the skill for reassuring phrases do not prove behavior. Use existing dependencies/toolchain; add no test framework. Sync docs/04_DESIGN.md for implemented message/schema/flag changes, docs/03_ARCHITECTURE.md for changed flow, README.md, docs/help/entity_locations.md, and feature/status docs as affected; read constitution first and keep current versus planned claims distinct. Run bun run lint, bun run test, bun run build and bun run spur-check on the final implementation, plus strict scoped task/feature validation and applicable superskill skill gates.
- [x] R12. Record local and live-host acceptance separately within this single task. On a separately authorized Grok host, capture a sanitized version/schema/root record and test cc/sp/kk where available, each of a native skill/adapted command/subagent playbook, empty-picker bootstrap, all/filter/self-only/dry-run recovery, per-ID failures/rerun, arguments/resources, bridge/full preservation, per-Bot enablement and desktop discovery/invocation. Report mobile observations separately. Without host authorization/access, complete the local code/skill/docs fallback improvements and explicit capability-discovery disposition, record host-dependent behavior UNVERIFIED/BLOCKED, and state the remaining operator smoke procedure; do not certify that input hints were fixed. Passing fixtures alone cannot label automatic registration or host usability verified. Do not create a separate verification-only task.

### Acceptance Criteria

```gherkin
Scenario: R1 — Registration capability and mapped catalog have explicit evidence
  Given the current mapper, Grok installer and supplied registration skill
  When the implementer inventories mapped outputs and inspects supported host capabilities within the discovery budget
  Then the record identifies all artifact kinds, verified contracts and unsupported claims
  And unavailable automatic capability selects the specified fallback without claiming registration success

Scenario: R2 — Recovery skill ships under the intended canonical ID
  Given the cc plugin includes the recovery source skill and uses the existing prefix mapper
  When the plugin is mapped and installed for grok-bot with skills selected
  Then exactly one recovery entry has ID cc-grok-bot-register in workflows and the handoff
  And there is no cc-cc-grok-bot-register output and other skill IDs remain unchanged

Scenario: R3 — Install and update provide a working empty-picker bootstrap
  Given an empty desktop slash picker and an install with or without the cc recovery skill
  When install, marketplace update or dry-run produces next-step guidance
  Then the guidance uses a real or explicitly prospective path or a self-contained handoff prompt
  And first use needs no registered slash command, and dry-run has no destination or host writes

Scenario: R4 — Automatic registration follows verified capabilities with a complete fallback
  Given a committed Bot catalog and a verified available, unavailable or failing host registration capability
  When the post-install completion flow chooses a registration path
  Then a supported authorized path registers only the committed selection after filesystem commit
  And unavailable or partial registration leaves a complete usable fallback with accurate per-ID outcomes and detectable attempted failures

Scenario: R5 — Handoff consumption rejects unsafe stale and conflicting records
  Given sorted v1 handoffs including malformed, future-version, cross-root, unsafe-path, stale and conflicting-ID cases
  When the recovery skill validates and selects records
  Then each invalid or conflicting ID has a reason and no host write
  And independent valid IDs remain eligible and foreign workflows are preserved

Scenario: R6 — Recovery selection covers all artifact kinds deterministically
  Given valid records for skills, adapted commands and subagent playbooks across cc, sp and kk
  When recovery runs with no args, plugin, self-only and dry-run selections
  Then the eligible set matches the requested intersection and self is first only when selected
  And every remaining ID is considered once in stable order and empty or invalid input is explicitly reported

Scenario: R7 — Registration preserves readable executable recipes in both modes
  Given bridge and full recipes with arguments, custom metadata, resources and a stale shared skills tree
  When registration prepares preserving payloads and the runtime reads the selected recipe
  Then current Bot content, unchanged arguments and relative resources remain usable
  And no shared-path existence shortcut or self-referential full/self replacement destroys recipe content

Scenario: R8 — Host upserts are bounded preserving and independently reported
  Given a verified host write schema and eligible IDs with successful, rejected and unknown-registry cases
  When recovery attempts registration and is later rerun
  Then each selected eligible ID receives at most one preserving write per run with explicit id
  And failures are isolated, refresh creates no duplicates, and delete/recreate is never used

Scenario: R9 — Registration recovery preserves install update and ownership guarantees
  Given owned bridge/full installations, prior receipts, host serialization changes and foreign files
  When reinstall, update, mode switch, prune or a failing filesystem transaction runs
  Then the previous transaction guarantees and drift protection remain effective
  And host side effects are reported separately and filesystem prune never performs registry deletion

Scenario: R10 — Diagnostics distinguish preparation registration enablement and visibility
  Given healthy, missing and broken filesystem states with no reliable host registry read
  When install, update and doctor render human and JSON guidance
  Then filesystem readiness and host registration, enablement, picker and invocation evidence are distinct
  And doctor retains read-only exit semantics, unknown host status and conditionally accurate desktop/mobile guidance

Scenario: R11 — Focused regressions and owning documentation validate the final change
  Given the implemented recovery and post-install changes with focused behavioral regression checks
  When owning docs and all required repository and scoped harness gates are run
  Then each requirement has traceable evidence and the required local gates pass
  And unsupported host claims, unrelated targets and toolchains have not been silently changed

Scenario: R12 — Host acceptance distinguishes observed success from unavailable evidence
  Given a locally verified implementation and either an authorized Bot session or unavailable host access
  When the task records registration, enablement, picker and invocation results
  Then each live result is supported by observed evidence or explicitly marked unverified or blocked
  And fallback delivery is distinguished from a proven automatic input-hints fix within the same task
```

### Q&A

<!-- CLOSED decisions from refinement: what was chosen and why, what was deferred and on what
     condition. Not a parking lot for open questions — an unanswered question here means the task
     is not ready to hand off. Keep empty if none. -->

#### Q&A entry — 2026-09-11T04:29:02.685Z

- **Deliverable:** Robin requested exactly one implementation-ready task on 2026-09-10. Investigation, code, recovery-skill hardening, docs and regression/host evidence belong to this task; no execution or separate verification-only task is requested now.
- **Priority and dependency:** P1; depends on completed 0130. Reuse its generic action mechanism and handoff/transaction/doctor contracts. No open prerequisite blocks local implementation.
- **Automatic path:** mandatory bounded capability assessment, then implement supported automatic completion where it is actually callable and preserving. Missing host support/access selects the fully specified primary-fallback path; it is not an unanswered design question or permission to invent a transport. An observed new transport/auth boundary needs an ADR amendment and applicable authorization before use.
- **Canonical name:** installed ID is cc-grok-bot-register. Normalize only this newly supplied source directory to grok-bot-register; preserve global mapper prefix semantics. A source mapping probe already reproduced the current double-prefix failure.
- **Safety corrections to draft:** retain Bot-owned canonical recipes; no existence-only shared path preference, blanket full-mode pointer replacement, source-less self synthesis, schemaVersion>=1 assumption, resources array, silent conflicting last-wins, host deletion or unsupported host success claims.
- **Self and filtering:** --plugin plus --self-only is an intersection. Self-first cannot expand selection; absent self is reported or synthesized only with owned current recipe evidence. Missing cc never triggers an implicit dependency install.
- **Evidence policy:** official docs support desktop slash references and per-Bot private-skill enablement; update_state, serializer and Read/mobile claims remain host-specific hypotheses. No host/tool schema is available in the planning session. The implementation owner follows the decision table, and the operator supplies separate host authorization if live verification is desired.
- **Version:** user-reported 0.3.24 and current source 0.3.23 are recorded without reconciliation by guess; no bump/publish requested.
- **Completion:** distinguish local fallback delivery from verified automatic host discovery. Requirements stay unchecked until implementation evidence exists; Solution/Testing/Review are reserved for their execution owners.

### Design

#### Decision and boundaries

Extend the existing Grok post-install action and harden the supplied recovery skill. Reuse the mapper, handoff schema, Sand resolver, ownership checks and receipt transaction. This is the smallest complete change because the installer already prepares the right catalog; the missing pieces are recovery identity, safe host consumption, capability-dependent completion and actionable diagnostics.

No new public CLI command, flag, environment variable, dependency, runtime, general hook system, durable registry-status cache, mirror skill store or generic post-install framework is part of the baseline design. The recovery skill's four free-text arguments are host skill inputs, not superskill flags. Do not introduce native Bot subagents: commands/subagents remain the mapped executable skills/playbooks. Automatic registration is a conditional implementation branch, not an assumed API or a reason to skip the mandatory fallback.

Rejected: warning-only delivery (leaves the operator assembling payloads), recovery-only without capability assessment (ignores the requested automatic path), global prefix deduplication (changes other targets), direct registry database edits/guessed endpoints (unsupported and unsafe), and cross-target shared-path preference (cannot establish recipe identity). No new cross-cutting decision is made here. ADR-036/037 remain binding. If R1 proves a new host transport or changed ownership/canonical model is required, document and review the concrete ADR amendment before code; otherwise stay on the specified fallback route. Planning approval is not host-operation authorization.

#### Fixed names and file ownership

| Owner / file | Required responsibility |
| --- | --- |
| plugins/cc/skills/cc-grok-bot-register/SKILL.md → plugins/cc/skills/grok-bot-register/SKILL.md | Normalize only the new source name; maintain installed ID cc-grok-bot-register, instructions, example v1 shape, arguments, safe validation, full/bridge preservation, conditional host claims and result report. Update references/distribution metadata only where the actual rename requires it. |
| packages/core/src/mapper.ts:174 and its existing tests | Preserve existing plugin-prefix convention. A regression must exercise the actual cc source mapping and fail on the current cc-cc ID. Change generic mapper logic only if a separately reproduced task-specific bug requires it; do not implement broad naming normalization. |
| packages/core/src/operations/grok-bot.ts:361 | Existing BotRegisterHandoff/SkillRecord, path/body building, shared caveat and doctor guidance; reuse content/path/marker utilities for deterministic preparation and bootstrap availability. |
| apps/cli/src/commands/install-post-actions.ts:45 | Existing grok-bot/register-handoff action owns Bot-specific prepared messages and payload preparation. Keep preview/apply consistent. |
| apps/cli/src/commands/install.ts:461 | Existing selected Bot mapping/emit/finalize/message flow; report committed artifacts, with any verified host side effects outside filesystem rollback. |
| packages/core/src/operations/post-install.ts | Existing generic runner/registry; keep its target-neutral behavior and second-target proof. Do not build another framework. |
| apps/cli/src/commands/update.ts | Reuses executeInstall; verify actual marketplace update and recorded mode/source. Edit only if a demonstrated integration gap needs it. |
| apps/cli/src/commands/doctor.ts | Human/JSON reporting remains a read-only filesystem diagnostic with unknown host state. |
| packages/core/tests/operations/grok-bot.test.ts; apps/cli/tests/commands/install-grok-bot.test.ts; apps/cli/tests/commands/install-grok-helpers.test.ts; apps/cli/tests/commands/doctor.test.ts; existing update/mapper/post-install tests | Behavioral regressions at the owning boundary; use existing fixtures/helpers and extend them only as needed. |
| docs/04_DESIGN.md; docs/03_ARCHITECTURE.md; README.md; docs/help/entity_locations.md | Update implemented surface/flow/operator instructions in their owning docs; scope/status docs link rather than duplicate the contract. |

The future source rename must use available superskill skill lifecycle capabilities where supported (inspect exact leaf help); if no rename operation exists, ordinary repository file editing is the uncovered operation. Do not run a global installation to accomplish a local rename. Keep the supplied file's original content recoverable in Git. Stale cc-cc-grok-bot-register artifacts on a user's host are not owned merely by their name; normal marker-validated prune/reinstall guidance may handle them, with no host-registry deletion.

#### Automatic-versus-fallback decision table

| Evidence at implementation | Required behavior |
| --- | --- |
| No documented host write tool/schema or no callable mechanism from CLI install context | Deliver deterministic handoff, working bootstrap and hardened host skill; print registration pending / automatic mechanism unavailable. Record the exact missing capability and checks performed. |
| Host skill tool available only inside a Bot conversation | Host skill consumes handoffs using that tool. A CLI cannot execute it by naming it. Classify this as agent-assisted recovery, not automatic install registration. |
| Supported callable host mechanism exists, but authorization is absent | Finish local preparation; retain fallback. Record the needed host approval at the operation boundary without making the call. |
| Supported, authorized mechanism preserves recipe content and identity | Register the committed per-plugin selection after filesystem commit. Preserve bounded per-ID outcomes. Keep fallback available for later repair. |
| Supported mechanism rejects some IDs or cannot preserve a recipe | Report partial/failure; keep successful writes and local handoff, do not undo files to pretend the host was rolled back. Failed attempted CLI host operation exits nonzero. Use fallback for unresolved IDs and require a fresh explicit run for retries. |

Capability discovery has a 90-minute checkpoint, not an endless research loop. Capture sources, actual tool schema/version and reasons in task evidence. At that checkpoint, unsupported automation selects the known fallback deliverable; it does not cancel the task or produce a speculative transport prototype. If automatic transport changes prove larger than the accepted local contract, preserve the proposal and finish the fallback without expanding scope.

#### Catalog and handoff contract

Use the mapper's post-feature-selection output as the installed catalog. Skills, adapted commands and subagent playbooks are already flattened under skills/ before Grok collection. Test set equality against actual eligible mapped IDs; do not infer success from a count alone. Include the recovery ID exactly once when selected. Explicit feature filters remain authoritative; unsupported magents/hooks/MCP/scripts are not suddenly added.

Retain schemaVersion=1, target=grok-bot, plugin, dataRoot, source {channel, locator}, materialize and skills. Every skill record keeps id, name, description, mode, recipePath, body, frontmatter and resources (string-key/string-value object). Do not copy the draft's source-omitting example or accept every future version via >=1. Handoffs remain deterministic per-plugin preparation records, not credential-bearing host requests or success receipts.

Installer scope is the committed selection for one plugin. Fallback scope is all handoffs by default, reduced by --plugin and --self-only. Strictly validate input before each write. Check path containment after resolving symlinks, reject unsafe IDs, mismatched normalized roots/modes and foreign ownership, and preserve legitimate in-root aliases. Invalid explicit SAND_DATA is an error according to the existing resolver contract, not permission to choose another host. Report malformed files without hiding valid independent work.

For duplicate IDs, compare origin and preserving payload; equivalent records coalesce, conflicting records get zero writes and a conflict reason. Do not let sorted order assign ownership. Self-first is ordering only, never permission to widen the selection. No handoffs/zero eligible entries yields a concrete no-op/reinstall explanation. For missing self handoff, synthesis is optional and only safe from the owned, current installed self recipe and marker; never create an empty registry row or self-pointer.

#### Content preservation and invocation

Bridge: keep the absolute Bot canonical SKILL.md from the handoff as the source of truth. Registration body must tell the Bot to read and follow it, pass original user arguments unchanged and resolve resources beside it. If the live Read tool denies hidden .superskill paths, use the already permitted Shell capability explicitly; do not imply successful reading just because a filesystem existence check passes. If neither is available, mark the entry unsupported instead of installing an unusable pointer.

Full: payload semantics depend on the actual host serializer, but the invariant is fixed: preserve the complete executable recipe, custom YAML/frontmatter and support files. The current handoff body carries the complete SKILL.md; do not assume the host body field accepts nested frontmatter without verification. A workflow path is not a safe replacement body when the write overwrites that same file. Compare resolved/aliased targets, including the recovery skill itself. Do not follow the draft's blanket pointer rewrite.

An unrelated ~/.agents/skills entry is deliberately ignored even when readable. It may have a different version, dialect or resource tree. No canonical relocation/mirror is required for this task. If an alternate path becomes necessary, prove current Bot source identity, complete resource preservation and ownership before proposing an ADR change; otherwise use the safe failure/fallback branch.

The host action must preserve required frontmatter metadata, invocation restrictions and resource ownership. Do not remove command disable-model-invocation metadata as a guess to make it appear in a picker. Any Bot-only adaptation must follow evidence about the actual host's semantics, leaving other targets unchanged.

#### Registration and recovery lifecycle

1. Select/validate current handoffs and eligible workflows. Record attempted, coalesced, rejected and skipped IDs before host mutation.
2. Resolve actual tool capability and schema; use explicit ID for verified upsert. A workflow folder establishes local eligibility only; establish foreign/known registry identity according to the live host mechanism.
3. In dry-run, display the selected IDs, plugin, mode, actual recipe and validation problems; perform zero registry/workflow writes.
4. In apply, self first if selected; then stable ID order, one attempt per ID. Keep independent successes, report failures, and stop only unsafe shared-root/capability conditions while retaining an accurate unattempted count.
5. Record acknowledged writes separately from readback verification, Bot enablement and GUI/invocation observations. A response pill or link is illustrative only; never fabricate host visibility evidence.
6. On subsequent install/update, current on-disk markers and receipt hashes remain authoritative. A host write that changes bytes must surface as drift/conflict unless an explicitly proven preserving contract exists. No silent rehash exemption.
7. Guide current-Bot enablement using current verified docs/runtime. No automatic all-Bot enablement, host deletion, remote deployment or message dispatch.

Use a reconciled report: number of handoff files, raw records, unique selected IDs, coalesced duplicates, ok, failed, skipped_missing_workflow, conflict, invalid/unsupported, pending/unattempted and dry-run. Include each non-success ID or malformed file and its reason. These are host skill report categories, not a mandatory new persistent DTO. Attempted = acknowledged successes + failed calls; every selected unique ID has one final disposition. Do not count malformed files as successful skills.

#### First-run operator experience

After a successful install with self available: show the resolved handoff location and a ready-to-paste request to read and follow the actual recovery SKILL.md, registering the applicable handoffs. A bridge bootstrap must mention permitted Shell reading when Read cannot access the canonical file. Later slash invocation is optional only after actual registration.

When self is absent: show a self-contained prompt to consume the actual handoff using verified preserving writes, and optional explicit cc installation guidance. No implicit cc dependency, no imaginary fallback path, no requirement to register a nonexistent slash command. Doctor with no resolved root gives root repair guidance. Dry-run clearly labels paths as prospective.

#### Regression and host evidence matrix

| Case | Expected evidence / R-items |
| --- | --- |
| Real cc recovery source through mapper + mixed fixture with native skill, command, agent | Exact canonical self ID and mapped/workflow/handoff set equality; R1/R2/R6. |
| cc present/absent; skills excluded; custom Sand root with spaces/alias; first empty picker | Correct read-this-file or handoff prompt, no unavailable path; R3/R10. |
| Malformed JSON, resources array, future schema, missing description/body, unsafe ID/path, cross-root, foreign/malformed marker, conflicting duplicate | No write for rejected ID; valid independent records still considered; R5/R8. |
| no args, plugin filter, self-only, combined filters, unknown/missing args, no handoffs | Correct selection and ordering, self not allowed to bypass plugin scope, explicit empty/error results; R6. |
| Bridge with hidden canonical Read denied; full recipe containing custom metadata/resources; symlink/relative self-reference; stale ~/.agents entry | Canonical/source fidelity, permitted Shell fallback or unsupported report, no destructive pointer; R7. |
| One failed host write among multiple valid IDs; unavailable tool; rerun with same IDs; duplicate/collision | Bounded attempts, partial outcomes, no delete/duplicate, no guessed success; R4/R8. |
| Dry-run, failing handoff/receipt write, preserving/changing host round trip followed by doctor/reinstall/update/prune; mixed targets | Existing rollback/drift/isolation guarantees and separate host effects; R9/R10. |
| Authorized desktop/mobile Bot observation with each artifact kind and arguments/resources | Separate registration/enablement/visibility/invocation evidence; absent access stays unverified; R12. |

Do not implement a duplicate registration engine solely to test prose. Use an existing helper if one exists; extract only deterministic parsing/selection/payload logic actually consumed by production. Otherwise record a concrete schema-faithful recovery replay with inputs, expected decisions and observed tool trace, clearly labeled simulated, plus the local install/mapping tests. A simulated host test never proves the actual tool schema.

#### Delivery and execution limits

One cohesive feature-implementation task, estimated 8–12 focused hours; checkpoint after 90 minutes of capability discovery and after 8 hours of implementation. Save a partial checkpoint and revise the estimate if necessary; do not silently create research/design/test subtasks. No token budget was requested. requireDiff: the future implementation must change the affected recovery source and production/operator flow with appropriate behavioral evidence; a report-only or fixture-only delivery is insufficient. This planning run changes task/feature/docs context only.

Persist implementation evidence under .spur/run/<wbs>-grok-register-* and cite it through Spur-owned Artifacts/Testing as the execution matrix allows. Keep critical conclusions, closed decisions and the host acceptance matrix in the task so delegation does not depend on gitignored scratch. Do not prefill Solution, Review or Testing with invented implementation results.

Local fallback delivery can pass after its actual code/skill/docs gates and capability disposition pass. That is not host acceptance. Completion notes must say which branch shipped (automatic integration or primary fallback), which host outcomes were observed and which remain unavailable. No live host access is needed to start this implementation. Actual host or external registration writes require a separately authorized host session.

### Plan

1. [ ] R1: Re-read this task, ADR-036/037, current code and callers, dependency 0130 and the staged registration skill; record starting Git changes. Reproduce the self-ID mapping mismatch with actual cc source. Inventory representative cc/sp/kk catalogs where installed sources are available; do not install plugins remotely to obtain evidence.
2. [ ] R1/R4/R12: Inspect official docs and the actual host capability/tool schema if an authorized host session exists. Record the installing context separately from Bot conversation capability. At the 90-minute checkpoint select supported automatic integration or the specified primary-fallback branch; retain reasons and safety constraints.
3. [ ] R2: Normalize only the new recovery source directory/frontmatter, fix its references and normal packaging as needed, and add a failing-then-passing mapping/distribution regression for exactly cc-grok-bot-register.
4. [ ] R5–R8: Harden the recovery skill's v1 example, validation, identity/path/duplicate handling, argument intersection, self-first order, preserving bridge/full payload policy, one-attempt upserts, partial outcomes and missing-host behavior. Keep the existing authored intent. Validate through available superskill skill checks; use a concrete schema-faithful replay for host procedure edges when live access is absent.
5. [ ] R3/R10: Improve the existing post-install action's resolved bootstrap guidance and doctor human/JSON messages. Cover cc absent, filtered install, bridge hidden-path access, invalid root and dry-run. Update must inherit the same logic via executeInstall.
6. [ ] R4/R8: Only on the verified supported branch, integrate the actual existing host mechanism after successful local commit with explicit per-ID result handling. Record any required ADR change before divergent code. On the fallback branch, ensure messages report the actual limitation and provide the working recovery path rather than an unused adapter stub.
7. [ ] R7/R9: Exercise full/bridge metadata/resources, arguments, stale shared-path traps, preserving and mutating host-write replays, ownership conflicts, reinstall/update/mode switch/prune and failure rollback. Confirm other plugins/targets and the generic runner's second-target contract remain intact.
8. [ ] R11: Synchronize authoritative docs and release-facing operator instructions from the implemented behavior; update feature D/status docs without claiming host success. Do not bump/publish a release or change workflows/environment policy.
9. [ ] R11/R12: Run focused tests, then bun run lint, bun run test, bun run build, bun run spur-check and strict scoped task/feature gates. If an authorized host is available, run the host matrix; otherwise record explicit unverified results and the operator procedure. Review the final diff and record evidence through Spur before reporting the chosen branch and limitations.

### Solution

Change-map (auto-generated — implement step did not record a Solution).
Each entry cites the first changed line per file (`file:line`).

| Change (`file:line`) |
|----------------------|
| `apps/cli/src/commands/install-post-actions.ts:20` |
| `apps/cli/src/commands/install-post-actions.ts:55` |
| `apps/cli/src/commands/install-post-actions.ts:62` |
| `apps/cli/src/commands/install-post-actions.ts:73` |
| `apps/cli/src/commands/install-post-actions.ts:80` |
| `apps/cli/tests/commands/install-post-actions.test.ts:111` |
| `packages/core/src/operations/grok-bot.ts:403` |
| `packages/core/src/operations/grok-bot.ts:974` |
| `packages/core/src/operations/grok-bot.ts:976` |
| `packages/core/tests/mapper.test.ts:286` |
| `packages/core/tests/operations/grok-bot.test.ts:18` |
| `packages/core/tests/operations/grok-bot.test.ts:870` |

### Testing

**Pipeline verify results**

- Verdict: PASS (from verdict artifact)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| R1 | MET | .spur/run/0132-grok-register-capability-discovery.md (no CLI-callable host mechanism; decision-table row 1 disposition); mapper trace via grok-bot.ts:408 |
| R2 | MET | plugins/cc/skills/grok-bot-register/SKILL.md:2 (frontmatter grok-bot-register); packages/core/tests/mapper.test.ts:286-301 (cc-cc ID regression asserted false); grok-bot.ts:408 |
| R3 | MET | grok-bot.ts:422-452 botBootstrapMessages; install-post-actions.ts:55,73; install-post-actions.test.ts:112-129 |
| R4 | MET | Fallback branch per disposition doc; no invented transport; handoff transactional (install-post-actions.ts:72) |
| R5 | MET | SKILL.md:97-99 invalid-SAND_DATA explicit error; SKILL.md:135-160 schema/id/path/conflict rules; replay cases 2-5 |
| R6 | MET | SKILL.md:83-95 flags/intersection/self-first/empty-no-op; replay cases 1,6,7 |
| R7 | MET | canonical-path preservation (SKILL.md policy + grok-bot.ts:454-458); review P2s at SKILL.md:7-8/315/301 remediated |
| R8 | MET | SKILL.md register rules (one attempt, no delete/recreate, explicit id, per-ID reporting) + replay case 7; live host upsert out of local scope per R12 disposition |
| R9 | MET | 2308 tests green (.spur/run/0132-repair-gate-evidence.log); update reuses executeInstall |
| R10 | MET | grok-bot.ts:974-978 doctor guidance tiers; SKILL.md evidence tiers |
| R11 | MET | mapper/grok-bot/install-post tests; replay transcript; docs 03/04/05/README/entity_locations synced; repair gate build_rc=0 spurcheck_rc=0 |
| R12 | MET | executable smoke: bun apps/cli/src/index.ts install cc --targets grok-bot --dry-run -> explicit no-Sand-root repair message (.spur/run/0132-r12-smoke-command.log); .spur/run/0132-grok-register-capability-discovery.md marks host behaviors UNVERIFIED/BLOCKED and distinguishes fallback vs automatic fix |

| Acceptance Criteria | Status | Evidence Type | Evidence |
|---------------------|--------|---------------|----------|
| Scenario: R1 — Registration capability and mapped catalog have explicit evidence | MET | test | capability doc; mapper.test.ts:286 |
| Scenario: R2 — Recovery skill ships under the intended canonical ID | MET | test | mapper.test.ts:294-301; SKILL.md frontmatter |
| Scenario: R3 — Install and update provide a working empty-picker bootstrap | MET | test | install-post-actions.test.ts:112-129; grok-bot.ts:430-441 |
| Scenario: R4 — Automatic registration follows verified capabilities with a complete fallback | MET | test | install-post-actions.test.ts:112-129 executed; transactional handoff write (grok-bot.ts:800-860); per-ID accuracy bounds in SKILL.md |
| Scenario: R5 — Handoff consumption rejects unsafe stale and conflicting records | MET | test | producer-side validation tests executed in 2308-test suite (grok-bot.test.ts); replay cases 2-5 (manual-review) |
| Scenario: R6 — Recovery selection covers all artifact kinds deterministically | MET | test | SKILL.md inputs + replay cases 1/6/7 |
| Scenario: R7 — Registration preserves readable executable recipes in both modes | MET | test | grok-bot.test.ts bridge-body/resources/self-reference tests executed (791,805,829-857); replay case 7 manual-review |
| Scenario: R8 — Host upserts are bounded preserving and independently reported | MET | test | SKILL.md steps 5-7 rules + replay case 7; live host out of scope (R12 Given: unavailable access) |
| Scenario: R9 — Registration recovery preserves install update and ownership guarantees | MET | test | repair gate log, 2308 pass |
| Scenario: R10 — Diagnostics distinguish preparation registration enablement and visibility | MET | test | doctor suites executed in grok-bot.test.ts; grok-bot.ts:974-980 tiers |
| Scenario: R11 — Focused regressions and owning documentation validate the final change | MET | test | repair gate log; docs synced |
| Scenario: R12 — Host acceptance distinguishes observed success from unavailable evidence | MET | command | executed: bun apps/cli/src/index.ts install cc --targets grok-bot --dry-run -> explicit no-Sand-root repair message (.spur/run/0132-r12-smoke-command.log); capability-discovery doc UNVERIFIED/BLOCKED labels |
- Coverage: N/A (verdict-based; verify pipeline does not measure code coverage)

### Review

<!-- spur:record-review -->

**SECU findings** (pipeline verify step — verdict: PASS)

| Priority | Dimension | Location | Finding |
|----------|-----------|----------|----------|
| P4 | spur task check | — | task check passed |
| P4 | evidence-rule-pass | — | All behavior-bearing AC rows have executable evidence or are explicitly non-behavioral. |
| P4 | proof-input-digest | — | sha256:45c03b290f302b1393b68fe74f39a638e126ed9215fc245c3a6f91e98fb2b744 |

### References

- [Original supplied recovery skill](plugins/cc/skills/cc-grok-bot-register/SKILL.md) — design input; the planned normalized source path is plugins/cc/skills/grok-bot-register/SKILL.md. Update this reference when the implementation renames it.
- [Feature D](docs/features/D_grok-bot-opt-in-install-target-task-0128-adr-036.md) — this task owns appended scenarios R20–R31 by title.
- [Completed post-install baseline 0130](docs/tasks/0130_prepare-safe-grok-bot-slash-registration-handoffs-within-ins.md) — shipped common action/registry, handoff, rollback, diagnostics and local-versus-host evidence boundary.
- [Filesystem baseline 0128](docs/tasks/0128_add-explicit-opt-in-grok-bot-vps-install-target-with-durable.md) and [cancelled host checklist 0129](docs/tasks/0129_run-authorized-grok-bot-vps-host-smoke-for-the-grok-bot-inst.md) — context only beyond dependency 0130.
- [ADR-036/037](docs/00_ADR.md:619), [post-install surface and handoff](docs/04_DESIGN.md:19), [post-install architecture](docs/03_ARCHITECTURE.md:16), [documentation process](docs/99_PROJECT_CONSTITUTION.md:149).
- [Mapper prefix and artifact flattening](packages/core/src/mapper.ts:174), [Grok handoff types and builder](packages/core/src/operations/grok-bot.ts:367), [Grok action](apps/cli/src/commands/install-post-actions.ts:45), [install caller](apps/cli/src/commands/install.ts:461), [doctor unknown-state guidance](packages/core/src/operations/grok-bot.ts:915).
- [Official xAI skills and routines](https://docs.x.ai/grok-bot/skills-routines-and-automations) — checked 2026-09-10; desktop slash references and per-Bot private-skill enablement. Does not verify update_state/schema or mobile blanket claims.
- Planning artifacts: .spur/run/grok-register-idea-20260910-a7c3-idea-eval-report.md; .spur/run/grok-register-idea-20260910-a7c3-idea-task-batch.json; .spur/run/grok-register-idea-20260910-a7c3-idea-ready.json; .spur/run/grok-register-idea-20260910-a7c3-idea-handoff.md. Critical scope and decisions are embedded above; these gitignored artifacts are supplementary.
- Reproduction: import mapPluginToRulesync and collectBotSkillEntries, map plugins/cc as plugin cc to a project-local scratch directory with skills/commands/subagents selected, then inspect IDs. Planning observation: 7 skills + 17 commands + 5 subagents = 29 entries, including cc-cc-grok-bot-register. No Sand destination or host registry was mutated.

### History

- 2026-09-11T04:55:39.338Z todo → wip (system)
- 2026-09-11T05:02:50.577Z wip → testing (system)
- 2026-09-11T05:02:59.779Z testing → done (system)

