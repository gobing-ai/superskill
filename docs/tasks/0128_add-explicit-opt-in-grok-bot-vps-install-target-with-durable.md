---
schema_version: 1
name: Add explicit opt-in Grok Bot VPS install target with durable workflow skills
status: testing
template: feature-impl
created_at: 2026-09-08T19:57:49.979Z
updated_at: "2026-09-09T18:20:12.162Z"

priority: P1
feature_id: D
ac_altitude: task-local
ac_numbering: task-local
---

## 0128. Add explicit opt-in Grok Bot VPS install target with durable workflow skills

### Background

Enable plugin installation into **Grok Bot's own VPS/Sand host**, explicitly selected by the operator. Grok Bot chat and **Grok Build CLI** are different products: existing target `grok` installs native Claude-format plugins; new install-only target `grok-bot` publishes a flat skill catalog under Sand's `workflows/` directory. A normal laptop install must never enable Bot installation, even if Sand directories or environment variables happen to exist.

This is one self-contained implementation task. All decisions, host assumptions, contracts, implementation seams, and verification steps needed for delegation are embedded below. Status `todo` means ready to implement, not implemented. No implementation or VPS deployment has occurred during task authoring.

**Host contract supplied for this integration (reported observations dated 2026-09-08; not independently exercised here):**

| Item | Contract to implement and verify on the host |
| --- | --- |
| Data root | `SAND_DATA`, normally `$HOME/sand-data` (reported example: `/home/box/sand-data`) |
| Alias | `$HOME/agent-data` may symlink to that same tree |
| Chat slash catalog | `<sandRoot>/workflows/<id>/SKILL.md`; YAML `name` and nonempty string `description` required |
| Protected/non-destination trees | `managed-skills/` is host-managed/read-only; `plugins/` is marketplace cache; `plugin-skills/cache.json` is not a write API |
| Runtime | User invokes `/cc-skill-add`, not `/cc:skill-add`; commands and specialist agents become skills/playbooks |
| Deployment | Execute superskill on the Bot VPS. Explicit mounted Sand roots require paths readable by the Bot runtime; setting a laptop path does not perform a remote install |

Confidence is high for the repository seams cited below, but Bot discovery/reload behavior remains unverified. A public primary-source search did not locate documentation for the Sand environment/filesystem contract. Treat that contract as a supplied integration requirement and record actual VPS evidence in Testing before claiming GUI acceptance. Do not substitute Grok Build documentation as evidence for Bot behavior.

**Scope:** plugin `install`, plugin `update`, owned pruning, two materialization modes, a small read-only Bot diagnostic, documentation, and regression tests. No new runtime/dependency, SSH/SCP client, auto-deployment, runner shim, native Bot subagent creation, marketplace UX, hook/MCP installation, or changes to the standalone `skill add/remove/update` ecosystem. No rewrite of existing target behavior.

### Requirements

- [x] R1. **Explicit opt-in and distinct taxonomy.** Accept `grok-bot` in plugin install/update target lists while retaining native `grok`. Omitted targets, an empty configured target list, and bare `--targets all` expand to the existing nine targets only, regardless of Sand detection. Configured `grok-bot` alone is insufficient: without an explicit CLI target list, filter it out and give actionable guidance; if nothing remains, fail before installation. Explicit `--targets grok-bot` or `--targets codex,grok-bot` enables Bot. Direct APIs receiving an explicit Bot target are the equivalent programmatic opt-in. Preserve existing validation of unknown targets and unsupported combined `all,...` syntax. Never register Bot as a ts-ai-runner executor or silently execute another agent on its behalf.

- [x] R2. **Resolve the destination without creating an accidental laptop tree.** Resolution order: (1) nonempty `SAND_DATA`, (2) existing directory `<home>/sand-data`, (3) existing `<home>/agent-data` with a `workflows/` or `managed-skills/` directory. A supplied invalid `SAND_DATA` fails instead of falling back. Require an absolute filesystem path for `SAND_DATA`; reject whitespace-only values, URLs, SSH locators, files, dangling links, and uncreatable paths. A missing explicitly supplied root may be created on a real install if its nearest existing ancestor permits it. Never create either home fallback merely to make detection succeed. Resolve once per invocation, honor the existing injected-home/test seams (including `HOME_DIR`), normalize allowed root symlinks, and share the result with install/update/doctor. Bot is host-global only: `--no-global` with an explicitly selected Bot fails in preflight. Validate Bot preconditions before any target output changes, including mixed-target calls. Failure is nonzero with the offending path and 'run on the Grok Bot host or set SAND_DATA to an explicit host-accessible absolute path'.

- [x] R3. **Reuse the flat skill conversion.** Respect configured `features`; map skills, commands, and subagents through existing `mapPluginToRulesync`, `adaptCommandToSkill`, and `adaptSubagentToSkill`. Preserve current flat IDs `<plugin>-<stem>` and companion references/templates/assets. Normalize Bot frontmatter through the installed structured YAML helpers: `name` equals the directory ID; `description` must be a trimmed nonempty string. For absent/blank descriptions, derive a bounded first meaningful prose line or deterministic 'Use <id> to follow the <kind> recipe.' fallback; malformed YAML or non-string supplied descriptions fail preflight with the source path. Preserve compatible optional fields without claiming they are enforced by Bot. Keep commands' invocation-only intent and agents' playbook intent. Preserve current mapper precedence for same-stem entities (agent over command over skill), list the shadowed source in verbose output, and count unique emitted IDs. This precedence must not become a new error for already supported plugins.

- [x] R4. **Durable bridge and full modes.** Add `install --materialize <bridge|full>`, default `bridge` for Bot; reject invalid modes and an explicitly supplied flag without Bot. In bridge mode write the adapted, Bot-dialect canonical tree under `<sandRoot>/.superskill/grok-bot/skills/<id>/` and a thin `workflows/<id>/SKILL.md` that points to that durable canonical `SKILL.md`. The private tree is an installed derivative; the resolved plugin remains source of truth. Never point bridges at invocation temp staging, laptop paths, mutable shared `~/.agents/skills`, or native `~/.grok/installed-plugins`. A bridge must say to read the canonical recipe and its relative resources, follow it with all slash arguments intact, and adapt unavailable tools explicitly rather than pretending a native spawn/Skill tool exists. In full mode publish the full adapted tree plus resources under `workflows/<id>/`; it must work after the source plugin and temporary staging are removed. Do not silently switch existing modes during update. Reinstall may explicitly switch modes with owned-file cleanup as specified in R6.

- [x] R5. **Bot dialect and unsupported surfaces.** The invocable form is `/<plugin>-<name>`; Bot must not inherit Pi's `/skill:` prefix or Grok Build's native colon form. Reuse scoped reference/link transforms where applicable, leaving URLs, `node:fs`, `bun:test`, and unrelated namespaces intact. Calls such as `Skill(skill="cc-...")` remain recipe notation with an explicit on-disk-read adaptation note; they are not promised executable host APIs. Bot-only install must not spawn claude/grok/rulesync, emit Pi/Codex native agents, select/write magents (even with `--magent`), emit rules/hooks/MCP, or stage plugin-level scripts into a shared root. Verbose output names each present skipped class; hook/MCP skips also produce a concise normal-mode warning. Preserve existing behavior for other targets in a mixed install. Skill-local support files are allowed; plugin-level script dependencies are prerequisites to report, not scripts to execute/install automatically.

- [x] R6. **Ownership, safe replacement, and pruning.** Each workflow has `.superskill-origin.json`: schemaVersion `1`, target `grok-bot`, plugin, marketplace/source identity (existing channel + locator), mode `bridge|full`, canonicalPath (absolute), superskillVersion, installedAt, and owned-file hashes relative to that workflow (excluding the marker). Private canonical directories carry equivalent ownership evidence. Parse/validate markers; directory prefix alone never grants ownership. Existing unmarked directories, another plugin/source's marker, malformed markers, or symlinked destinations must fail without overwriting. Reinstall replaces unchanged owned files idempotently; locally edited managed files or new unowned files that replacement/pruning would destroy cause a clear conflict, with no force/adopt flag in v1. No-prune preserves obsolete IDs. `--prune` removes only stale IDs owned by this plugin AND source; it must not enter the existing prefix-only flattened prune path. Mode switches remove only their own obsolete artifacts; keep private sources still needed by retained bridges. Validate path segments and realpath containment; never traverse a workflow/private-child symlink or a root resolving into `managed-skills`, `plugins`, or `plugin-skills`. Validate planned destinations before mutation. Roll back Bot canonical files, workflows, markers, and receipt on emission/receipt failure using existing filesystem transaction primitives; report rollback failures. Do not promise transactionality across independent host installers.

- [x] R7. **Integrate existing provenance and update.** Reuse `InstallManifestV1`, snapshots, source resolution, and update comparison. Add a backward-compatible optional `grokBot: { materialize: bridge|full }` field to schema v1, emitted only for Bot and validated/retained by the manifest reader/writer. This records the current plugin mode even when no-prune leaves older workflows in another mode; existing targets and legacy v1 receipts without this field remain readable. A Bot receipt lacking the field requires explicit reinstall guidance instead of guessing mode. Use existing snapshot semantics; use `sandRoot` as Bot's per-target scope root, so its receipt is `<sandRoot>/.superskill/manifests/grok-bot/<plugin>/.superskill-manifest.json`. Keep existing targets' HOME/project receipt roots unchanged. Bot inventories include actual workflows, canonical files where applicable, and ownership markers; handle custom Sand roots outside HOME without weakening relative-path containment. Update discovery reads only explicitly selected target roots and never reads/writes Bot state on a default or all-target update. Preserve raw target/source action identity when grouping update results; thread the resolved Sand root and saved mode into Bot reinstall. Marketplace updates retain current version/hash and exit-code semantics; bundled updates retain npm-upgrade guidance, followed by an explicit Bot reinstall. `update --check` is read-only. Ordinary update does not prune; removal of obsolete IDs uses `install --prune`. A missing/corrupt provenance receipt retains legacy/reinstall guidance; do not fabricate ownership from it. A requested Bot install with zero selected invocable entities fails clearly before target writes instead of falsely reporting success or generating an empty-inventory error at the end.

- [x] R8. **Dry-run and truthful outcomes.** Preview resolved Sand root, mode, every planned workflow/canonical/marker/receipt path, owned removals, counts, and skipped classes. No destination, shared root, marker, receipt, or prune mutation occurs. Reuse the existing disposable mapper staging and clean it on success/failure. Local fixtures must prove no persistent writes; remote marketplace lookup may use the existing fetch cache, which must be disclosed and must never be presented as a remote VPS install. Summary is `grok-bot: N skills at <sandRoot>/workflows` after successful receipt commit. Errors are nonzero; no 'Installed' summary for Bot after partial failure. Mixed-target validation is fail-fast before target writes; a later runtime error may leave earlier other-target successes and must identify that limitation.

- [x] R9. **Read-only diagnostics.** No doctor command currently exists. Add only `superskill doctor --targets grok-bot [--json]`; require this explicit target in v1, rejecting absent/other target values with usage guidance rather than inventing diagnostics for nine other hosts. Reuse R2 resolution with no mkdir/write probes. Report target, available, resolved dataRoot/workflowsDir, root-source (env/sand-data/agent-data), prospective writability, and issues for owned workflows (bad frontmatter, invalid marker, missing canonical/resource files, modified owned files). A missing explicit root with a writable ancestor is 'creatable', not proof a live Bot is present. JSON contract: `{ target, available, dataRoot: string|null, workflowsDir: string|null, source: string|null, creatable, issues: [{ code, path: string|null, message }] }`. Exit 0 for locally valid/creatable layout, 1 for unavailable/broken ownership/layout, 2 for usage error. Clearly label this a filesystem check, not a GUI discovery or connection test. A missing root in read-only mode remains missing.

- [ ] R10. **Documentation and verification.** Before implementing structural changes, add a dated ADR entry for an explicit install-only Bot target, Sand-owned canonical/receipt scope, and the small doctor surface; amend ADR-010/035 where their root assumptions need a target-specific exception. Update scope in 01, mechanism in 03, exact flags/config/default behavior/marker+doctor shapes in 04, status/roadmap in 05/02 when delivered, and README plus `docs/help/entity_locations.md` in the same change. Include host execution examples, Grok Build vs Bot distinction, slash/degradation table, default exclusion, resolution/errors, both modes, source lifetime, ownership/prune behavior, and prerequisite CLI/script caveats. Keep tests isolated from real user homes and Sand trees; implement the AC matrix below and run all repository gates. Record actual evidence and limitations through the task harness.

### Acceptance Criteria

All scenarios are task-local and map to the numbered requirements. Implementation verification must name the actual test/evidence for each; unchecked items remain unverified.

```gherkin
Scenario: R1 — AC1 Explicit opt-in protects default hosts (R1)
  Given Sand directories and SAND_DATA exist, with absent, empty, or Bot-containing configured targets
  When install or update runs without explicit Bot selection or with bare --targets all
  Then Bot is excluded and no Bot workflow, private source, or receipt is touched
  And explicit grok-bot and codex,grok-bot lists succeed while native grok remains distinct

Scenario: R2 — AC2 Resolve only valid host destinations (R2)
  Given isolated homes covering env override, existing sand-data, qualifying agent-data alias, and no Sand root
  When an explicit Bot install or diagnostic resolves its root
  Then the documented priority, canonicalization, and missing/creatable behavior apply
  And invalid explicit roots, relative/SSH paths, files, dangling links, and --no-global fail without fallback
  And a mixed-target preflight failure produces no target writes

Scenario: R3 — AC3 All invocable entity kinds form valid skills (R3)
  Given a fixture with skills, commands, agents, same-stem collisions, and resource directories
  When Bot installation applies the selected feature classes
  Then unique flat IDs use existing collision precedence and valid YAML name/description strings
  And missing descriptions get deterministic fallback, while malformed YAML or non-string descriptions fail
  And zero selected invocable entities fail before output changes

Scenario: R4 — AC4 Bridge survives staging and source removal (R4)
  Given a Bot-only bridge installation with no shared agents root or native Grok installation
  When mapping staging and the original plugin source are removed
  Then every emitted bridge resolves its private canonical recipe and required relative resources
  And bridge instructions preserve slash arguments and state runtime adaptations

Scenario: R4 — AC5 Full mode and mode switches preserve usable content (R4, R6)
  Given full-mode installation with sibling skill links and references/templates/assets
  When original plugin files disappear and an explicit reinstall switches between bridge and full
  Then the current mode's recipes/resources remain usable and only obsolete owned artifacts are removed
  And unrelated files and retained no-prune bridges' sources survive

Scenario: R5 — AC6 Bot dialect and skipped capabilities are isolated (R5)
  Given plugin colon references, Skill recipe notation, legitimate protocol/module colons, and optional host capabilities
  When Bot-only and Bot-plus-existing-target installs run with recording dependencies
  Then Bot shows flat slash IDs and explicit playbook adaptation without corrupting unrelated colons
  And Bot triggers no host CLI/rulesync dispatch or writes to shared agents, native agents, magents, hooks, MCP, or scripts roots
  And supported sibling target outputs and dispatch calls match their pre-change behavior

Scenario: R6 — AC7 Ownership limits reinstall and prune (R6)
  Given unchanged owned workflows, stale owned IDs, unmarked lookalikes, another source's marker, and modified owned files
  When reinstall, mode switch, and prune plans run
  Then unchanged owned content is idempotent and prune removes only stale matching plugin/source IDs
  And conflicts fail before overwriting or deleting local/unowned content
  And traversal segments and symlinked workflow/private descendants cannot escape into protected trees

Scenario: R6 — AC8 Failed Bot writes recover prior output (R6, R8)
  Given an existing Bot install and injected canonical, workflow, marker, or receipt write failures
  When the replacement attempt fails
  Then prior Bot files and receipt are restored, rollback failures are reported, and success is not printed

Scenario: R7 — AC9 Custom-root provenance and update retain identity (R7)
  Given Bot receipts outside HOME plus native target receipts and two marketplace source identities
  When explicit Bot update check and marketplace update run
  Then only selected target roots are consulted and updates preserve Bot root, mode, and source identity
  And same-version source hash changes are detected, check mode writes nothing, and update does not prune
  And bundled updates keep npm guidance and corrupt/missing receipts keep legacy guidance

Scenario: R8 — AC10 Dry-run exposes the complete plan without target mutation (R8)
  Given a local plugin, a creatable absent Sand root, and a separate existing root with owned stale entries
  When dry-run install with materialization and prune is requested
  Then paths, unique counts, mode, removals, and skipped capabilities are printed
  And neither root/target trees nor receipts/markers change, and disposable staging is cleaned

Scenario: R9 — AC11 Doctor reports local readiness honestly (R9)
  Given valid, absent, creatable, malformed, modified, and dangling-canonical Sand fixtures
  When doctor --targets grok-bot runs in text and JSON modes
  Then documented fields and exit codes distinguish filesystem readiness and issues
  And diagnostics never create directories or claim live GUI discovery

Scenario: R10 — AC12 Documentation and host discovery are verified (R10)
  Given synchronized owning docs, green repository gates, and an authorized Bot host session
  When cc, sp, and kk are previewed and installed, and the Bot catalog is refreshed by its observed supported method
  Then representative skill, degraded command, and specialist playbook IDs appear in slash discovery
  And at least one invocation passes arguments and reads a relative resource successfully
  And Testing records host/runtime details, refresh method, observed results, and any unavailable evidence
```

### Q&A

All implementation choices below are resolved for this task; there are no pending product questions.

1. **Does detection enable installation?** No. The operator requires explicit Bot targeting. Even a VPS with SAND_DATA set keeps Bot out of defaults and bare all. A copied config file cannot opt the laptop in.
2. **Does superskill connect to the VPS?** No. Run it there. A mounted directory is merely an explicit filesystem destination; bridge paths must also be meaningful to the Bot process. Use full mode if the mount has different absolute path names on the two hosts.
3. **Why a private canonical copy?** Mapping uses disposable staging and commands/agents do not necessarily have durable SKILL.md files. Shared laptop/other-target output can be stale or use Pi syntax. One Sand-owned adapted copy makes standalone Bot installs and reinstall/update reliable without touching another target's files. This deliberately resolves canonical selection to one stable location instead of a fall-through list of unrelated installs.
4. **Mixed targets with missing Bot root?** Fail preflight before any target output writes. Do not add a general partial-success orchestrator. Runtime failures after other targets commit are reported honestly; only the Bot write group is rolled back.
5. **Magent, scripts, hooks, MCP, native agents?** Skip as specified in R5. An explicit magent still applies to supported siblings in mixed installs. Commands whose recipes need the spur/superskill CLI or other executables require those tools on the VPS; distribution does not install or emulate them.
6. **Is full materialization deferred?** No: bridge and full are both in this single task. Remote transport, auto-discovery enablement, force/adopt, standalone skill ecosystem integration, and native Bot agents remain outside scope.
7. **What about GUI access?** Local fixture tests can implement and verify the filesystem contract immediately. Actual slash discovery, reload behavior, and invocation need an authorized Bot session. Record unavailable host evidence separately and leave that acceptance item unverified; never claim a local file listing proves GUI support. Task delegation itself does not authorize production/VPS mutations.

### Design

#### Boundaries and reusable seams

Prefer the smallest additive taxonomy: export `INSTALL_TARGETS = [...TARGETS, 'grok-bot'] as const` and `InstallTarget` from core, while `TARGETS`/`Target` continue to describe existing execution/authoring/standalone-skill hosts. Use `InstallTarget` only for plugin install/update/config and Bot diagnostics. This avoids fake AgentName casts and unrelated changes to replay/judge backends or `TARGET_TIERS`. The existing nine `TARGETS` are the default expansion; do not copy their strings into a second hard-coded list. Audit callers when widening `parseTargets` so Bot cannot leak into a legacy transform/emitter. No dependency change is needed.

| Existing seam (verified at task authoring) | Implementation use |
| --- | --- |
| `packages/core/src/targets.ts` | Add install-only union/list; preserve execution dialect map and standalone-skill registry |
| `apps/cli/src/config.ts`; `registerInstall`/`parseTargets`; `registerUpdate` | Accept install targets; share explicit-selection policy, preserve config plugin paths/features |
| `packages/core/src/mapper.ts` | Already collapses skills/commands/agents with agent > command > skill precedence; copies resource subdirectories |
| `packages/core/src/pipeline/adapt-command.ts`, `adapt-subagent.ts`, `rewrite-references.ts`, `rewrite-plugin-tree-links.ts`, `content/frontmatter.ts` | Reuse conversion/YAML/link machinery; Bot-specific validation and dialect rendering belong at the Bot boundary |
| `apps/cli/src/commands/install.ts`: `executeInstall`, `prepareTargetRulesyncInput`, `emitMagents`, `pruneFlattenedSkills`, `writeInstallProvenance` | Branch Bot before legacy target transforms; exclude it from every rulesync/native/magent/rule/script path and legacy prune; commit target-specific receipt root |
| `packages/core/src/operations/install-manifest.ts` | Existing string target IDs, relative snapshots, atomic manifest writer; reuse schema v1 |
| `apps/cli/src/commands/update.ts`: `collectCandidates`, `readCandidateManifests`, `executeUpdate`, `isTarget` | Select each target's root; retain per-source actions and mode during Bot reinstall |
| `packages/core/src/content/identity.ts`, `content/paths.ts`, `skills-ecosystem/installer.ts`: `FilesystemTransaction` | Safe segments, canonical containment, replacement/removal rollback; reuse narrowly, no new generic transaction layer |
| `apps/cli/src/index.ts` | Register the new focused doctor command following current registration/output conventions |

Place reusable Bot root resolution/rendering/owned emission in a small core module (suggested `packages/core/src/operations/grok-bot.ts`, export through the existing core barrel); CLI retains registration, config, logging, and orchestration. Add `apps/cli/src/commands/doctor.ts` only for the small diagnostic registration. Inject home/env and reuse existing time/manifest dependency seams for deterministic tests. Do not discover or create a Sand root at module-import time.

#### Planned flow

1. Resolve explicit install target selection and Bot global/path preconditions. For mixed installs, preflight Bot before mutating any target.
2. Resolve plugin/source using the existing marketplace/bundled pipeline. Map into invocation-local staging, preserving feature selection. Retain enough source-kind metadata to report shadowed IDs and derive descriptions.
3. Prepare Bot's independent mapped tree: normalize YAML, produce flat slash syntax, preserve resources/links, and add runtime adaptation notes. Do not pass Bot to `translateSlashCommands` through a fabricated executor mapping. Do not mutate shared mapper input that sibling targets still consume.
4. Build and validate the complete destination/ownership/prune plan. For bridge mode, publish private canonical trees before their bridge entries within the same rollback group. Full mode publishes adapted workflow trees. Check rendered local markdown resource links against their intended destination tree, including links between sibling skills; unresolved cross-plugin references are explicit prerequisites, not silently invented files.
5. Commit owned output and the Sand-scoped manifest using the transaction. Run existing siblings through their unchanged target-specific paths. Print actual unique skill count, paths, skip warnings, and success only after commit.

Private canonical layout keeps `<id>` directories as siblings across plugins under `<sandRoot>/.superskill/grok-bot/skills/`, so existing flattened relative skill links can resolve. Full-mode skill directories are siblings under `workflows/`. Paths in emitted bridge instructions must be escaped as literal Markdown paths, including spaces/backticks; treat source metadata as data, never shell text. Source identity must be normalized from the existing resolver's channel/locator and must not depend on an invocation temp path.

The marker's hash map is the ownership/drift basis for files an operation would replace or remove; the existing manifest remains update provenance. Neither a flat name prefix nor a marker's unvalidated canonicalPath authorizes deletion. For no-prune reinstalls, retain evidence for stale owned workflows/private sources in the inventory so a later prune can still assess ownership. Prune computes the selected plugin's desired set, not all workflows. Invalid markers on unrelated plugins are reported by doctor and never adopted or deleted.

Bridge body content, after YAML name/description, must convey: 'For this slash invocation, read <canonical SKILL.md> and required relative resources before acting. Follow that recipe with the caller's complete arguments. Treat unavailable Skill/native-agent tool calls as instructions to read/invoke the corresponding installed playbook using available tools; state any adaptation or missing capability. Do not claim hooks, permissions, model selection, or subagent provisioning are enforced by this bridge.' Full mode carries the same runtime note along with the actual recipe.

No promise of crash-atomic multi-host install or concurrent writes to the same Sand plugin is added. Existing exception rollback must cover Bot output and receipt; document that operators serialize installs to the same Bot/plugin. Tests must demonstrate that installs to different scratch roots do not share state.

#### Operator examples (new surface to implement)

`superskill install cc --targets grok-bot --verbose` — on the Bot host, using an existing fallback Sand root.

`SAND_DATA=/srv/grok/sand-data superskill install cc --targets grok-bot --dry-run --verbose`

`SAND_DATA=/srv/grok/sand-data superskill install sp --marketplace /srv/repos/spur-new --targets grok-bot --materialize full`

`superskill install kk --marketplace /srv/repos/knowledge-kit --targets grok-bot --prune`

`superskill update cc --targets grok-bot --check` and `superskill update sp --targets grok-bot` — preserve existing bundled-vs-marketplace semantics and recorded mode.

`superskill doctor --targets grok-bot --json` — filesystem diagnosis only.

### Plan

- [x] P1. Recheck the cited seams, local instructions, installed dependency APIs, and starting Git changes. Record the additive ADR/scope decisions before changing target/root boundaries; do not modify release workflows.
- [x] P2. Add the install-only target union and shared explicit-selection policy; cover default/all/config/mixed cases first. Add the injected, non-mutating Sand root resolver and global-only preflight.
- [x] P3. Reuse mapped skills and implement Bot YAML/dialect/runtime-note preparation. Verify same-stem precedence, feature filters, description fallback/errors, sibling links, and skipped capability isolation.
- [x] P4. Implement durable bridge/full rendering and owned-plan validation, then transactional writes/receipt and owned pruning. Test source/staging removal, mode switches, local conflicts, path escapes, and write/receipt rollback failures.
- [x] P5. Wire target-specific receipt roots and update discovery/actions while preserving mode/source identity and existing update semantics; add Bot-only read-only doctor registration with its exact JSON/exit contract.
- [x] P6. Extend focused tests, run them against isolated HOME/HOME_DIR/SAND_DATA/output roots, and inspect generated files and CLI output. Run existing native Grok/Pi/Codex regression tests.
- [x] P7. Synchronize ADR/01/03/04/05/02, README, entity locations, and indexed context as applicable. Include the exact VPS runbook and limitations; no deployment during local implementation without separate authorization.
- [ ] P8. Run bun run lint, bun run test, bun run build, and bun run spur-check. Inspect final Git diff/status, record actual review and per-requirement verification through Spur, and perform/record the authorized host smoke. Leave unavailable GUI acceptance unverified rather than marking the feature fully done. (Gates + Spur record DONE in the 2026-09-08 verify pass; authorized host smoke still pending — the only open item.)

### Solution

Implementation complete (run `inline-0128-20260908-155657-44026`, ADR-036), repaired during the 2026-09-08 verify pass (`/sp-dev-verify 0128 --fix all`).

- `packages/core/src/targets.ts:26` — `INSTALL_TARGETS = [...TARGETS, 'grok-bot']` + `isInstallTarget()`; config accepts grok-bot but it expands no dialect and is filtered from non-explicit selections (`resolveInstallTargets` → `{targets, botFiltered}`; bare `all` excludes Bot).
- `packages/core/src/operations/grok-bot.ts` (new) — Sand-root resolver (SAND_DATA > `<home>/sand-data` > qualifying `<home>/agent-data`; strict validation, realpath, no fallback creation), flat-catalog mapping reuse, `/skill:` → `/<id>` dialect rewrite, bridge (canonical `<sandRoot>/.superskill/grok-bot/skills/<id>/` + thin `workflows/<id>/SKILL.md` pointer) and full materialization, `.superskill-origin.json` marker-gated ownership (schemaVersion 1), owned pruning, receipt at `<sandRoot>/.superskill/manifests/grok-bot/<plugin>/`, read-only `inspectGrokBotTarget`.
- `apps/cli/src/commands/install.ts:108` — `--materialize <bridge|full>` (default bridge, Bot-only), Bot preflight (host-global only), botFiltered guidance echo.
- `apps/cli/src/commands/update.ts` — Bot manifest scan only on explicit selection; no Sand root → skip with warning.
- `apps/cli/src/commands/doctor.ts` (new, `registerDoctor` at `:27`) + `cli.ts` registration — `doctor --targets grok-bot [--json]`, exit 0/1/2 contract.
- `packages/core/src/operations/install-manifest.ts:54` — optional `grokBot.materialize` on InstallManifestV1, validated on read/write.
- Tests: `packages/core/tests/operations/grok-bot.test.ts`, `apps/cli/tests/commands/install-grok-bot.test.ts` + `doctor.test.ts` + `update.test.ts`. Feature D corpus via `spur feature create/update/refresh`; task relinked `feature_id: D`.
- Docs: ADR-036; 01/02/03/04/05; README (agents table, footnote, doctor row); docs/help/entity_locations.md.

Verify-pass repairs (2026-09-08, this verify run — the 2026-09-08-155657 implementation had three majors the verify caught and `--fix all` repaired):

1. **Rollback implemented.** `emitGrokBotInstall` claimed rollback in its docstring but performed plain writes. All workflow/canonical writes and prunes now run inside `FilesystemTransaction`; the receipt write is part of the rollback scope via a `finalize` callback, so an emission or receipt failure restores prior Bot output and reports rollback errors. Regression tests: 'emission rollback (R6/R8)' (receipt failure restores canonical/workflow; pruned workflows restored).
2. **Drift-conflict gate added.** `planGrokBotInstall` replaced/pruned owned workflows without checking marker hashes — locally edited managed files were silently overwritten. `assertOwnedUndrifted` now fails preflight on drifted owned content or unowned extras (bridge pointer stub is derived and carved out, noted in code). Regression tests: 'replace/prune conflict gate (R6)' (3 tests). Mode-switch cleanup: bridge→full plans removal of the obsolete canonical tree ('mode switch cleanup (R6)').
3. **Update mode threading.** Bot marketplace reinstall previously ignored the receipt's `grokBot.materialize` (silent full→bridge switch on update). `executeUpdate` now threads the recorded mode into reinstall and emits explicit reinstall guidance when a legacy Bot receipt lacks the field. Regression tests in `apps/cli/tests/commands/update.test.ts`.
4. **False pre-existing-red claim corrected + root-caused.** The prior Testing claimed `bun run test` exit 1 was pre-existing on clean HEAD. This verify re-ran clean db63531 in a worktree: 2239 pass / **exit 0** — the claim was false. Root cause: this task's `doctor.ts` shipped at 78.57% line coverage, tripping bun 1.3.14 per-file coverage thresholds. Fixed by covering the human-output paths in `doctor.test.ts`; doctor.ts now 100/100 and `bun run test` exits 0.

Gates (this verify run, 2026-09-08): lint PASS · build PASS · `bun run test` 2278 pass / 0 fail / **exit 0** · corpus-check exit 1 with 168 errors / 711 warnings — pre-existing (clean db63531 worktree: 197 errors / 718 warnings, exit 1; zero findings name 0128 or feature D) · `spur task check 0128 --strict-core` pass.

Remaining for done: authorized Grok Bot host smoke (AC12) — operator-run on the VPS; see Testing section.

### Testing

**Pipeline verify results**

- Verdict: PARTIAL (from verdict artifact)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| R1 | MET | `packages/core/src/targets.ts:26` (INSTALL_TARGETS additive, `all` excludes grok-bot); CLI e2e `apps/cli/tests/commands/install-grok-bot.test.ts`; update opt-in filter `apps/cli/src/commands/update.ts:75` |
| R2 | MET | `packages/core/src/operations/grok-bot.ts:163` (resolveSandRoot); tests describe 'resolveSandRoot (R2)' in `packages/core/tests/operations/grok-bot.test.ts` (8 tests: env/alias/dangling/relative/URL/ssh/blank/creatable/protected-tree) |
| R3 | MET | `packages/core/tests/operations/grok-bot.test.ts` describes 'applyGrokBotDialect (R3)' + 'parseBotSkillEntry / collectBotSkillEntries (R4)'; mapper precedence unchanged (mapper.ts untouched, existing suites pass) |
| R4 | MET | bridge/full e2e in `apps/cli/tests/commands/install-grok-bot.test.ts` (bridge pointer + canonical + receipt; full mode); mode-switch cleanup test `packages/core/tests/operations/grok-bot.test.ts` 'mode switch cleanup (R6)' |
| R5 | MET | `packages/core/src/operations/grok-bot.ts:269` dialect rewrite; skip-class echo `apps/cli/src/commands/install.ts:473`; Bot partition before rulesync/native dispatch `apps/cli/src/commands/install.ts:372` |
| R6 | MET | markers + ownership `packages/core/src/operations/grok-bot.ts:379`; drift-conflict gate `packages/core/src/operations/grok-bot.ts:457` (assertOwnedUndrifted, 3 tests); protected-tree root guard `packages/core/src/operations/grok-bot.ts:114` (new this run, commit `9184457`); transactional emission `packages/core/src/operations/grok-bot.ts:615` with rollback tests 'emission rollback (R6/R8)' |
| R7 | MET | receipt `grokBot.materialize` round-trip test 'grok-bot receipt (R7)' in `packages/core/tests/operations/grok-bot.test.ts`; update mode threading `apps/cli/src/commands/update.ts:202` + missing-mode guidance `apps/cli/src/commands/update.ts:220`; update.test.ts threading/guidance tests |
| R8 | MET | dry-run e2e 'dry-run prints the full plan without creating the Sand root, workflows, or receipt' in `apps/cli/tests/commands/install-grok-bot.test.ts`; staging cleanup via invocation-local mkdtemp + finally |
| R9 | MET | doctor tests `apps/cli/tests/commands/doctor.test.ts`; golden path run this turn: `./dist/superskill doctor --targets grok-bot --json` exit 1 with contract JSON `{target, available, dataRoot, workflowsDir, source, creatable, issues}`; `--targets codex` exit 2 |
| R10 | PARTIAL | Docs synced (grep-verified this turn: ADR-036 in `docs/00_ADR.md`, grok-bot present in 01/02/03/04/05, README, `docs/help/entity_locations.md`); gates green this turn (above). UNVERIFIED: authorized Grok Bot host smoke (slash discovery, argument + relative-resource invocation) — not performable in this environment |

| Acceptance Criteria | Status | Evidence Type | Evidence |
|---------------------|--------|---------------|----------|
| Scenario: R1 — AC1 Explicit opt-in protects default hosts (R1) | MET | test | `apps/cli/tests/commands/install-grok-bot.test.ts` + `apps/cli/tests/commands/update.test.ts`; resolveInstallTargets botFiltered path |
| Scenario: R2 — AC2 Resolve only valid host destinations (R2) | MET | test | `packages/core/tests/operations/grok-bot.test.ts` 'resolveSandRoot (R2)' (8 tests, incl. new protected-tree rejections) |
| Scenario: R3 — AC3 All invocable entity kinds form valid skills (R3) | MET | test | `packages/core/tests/operations/grok-bot.test.ts` 'parseBotSkillEntry / collectBotSkillEntries (R4)'; zero-entity prewrite failure test in `apps/cli/tests/commands/install-grok-bot.test.ts` |
| Scenario: R4 — AC4 Bridge survives staging and source removal (R4) | MET | test | bridge e2e test in `apps/cli/tests/commands/install-grok-bot.test.ts` |
| Scenario: R4 — AC5 Full mode and mode switches preserve usable content (R4, R6) | MET | test | full-mode test in `apps/cli/tests/commands/install-grok-bot.test.ts`; `packages/core/tests/operations/grok-bot.test.ts` 'mode switch cleanup (R6)' |
| Scenario: R5 — AC6 Bot dialect and skipped capabilities are isolated (R5) | MET | test | `packages/core/tests/operations/grok-bot.test.ts` 'applyGrokBotDialect (R3)'; Bot-only e2e asserts no shared-root writes |
| Scenario: R6 — AC7 Ownership limits reinstall and prune (R6) | MET | test | `packages/core/tests/operations/grok-bot.test.ts` 'replace/prune conflict gate (R6)' + foreign/unmarked marker tests + new protected-tree test; CLI ownership test in `apps/cli/tests/commands/install-grok-bot.test.ts` |
| Scenario: R6 — AC8 Failed Bot writes recover prior output (R6, R8) | MET | test | `packages/core/tests/operations/grok-bot.test.ts` 'emission rollback (R6/R8)' (2 tests) |
| Scenario: R7 — AC9 Custom-root provenance and update retain identity (R7) | MET | test | `apps/cli/tests/commands/update.test.ts` mode threading + guidance tests; receipt round-trip in `packages/core/tests/operations/grok-bot.test.ts` |
| Scenario: R8 — AC10 Dry-run exposes the complete plan without target mutation (R8) | MET | test | dry-run test in `apps/cli/tests/commands/install-grok-bot.test.ts` (no Sand root creation, no receipt, planned paths printed) |
| Scenario: R9 — AC11 Doctor reports local readiness honestly (R9) | MET | test | `apps/cli/tests/commands/doctor.test.ts`; golden path this turn: doctor `--targets grok-bot --json` exit 1 contract JSON, `--targets codex` exit 2 |
| Scenario: R10 — AC12 Documentation and host discovery are verified (R10) | PARTIAL | static-ref | Docs + gates verified this turn; authorized host smoke unavailable in this environment — not claimed |
- Coverage: N/A (verdict-based; verify pipeline does not measure code coverage)

### Review

<!-- spur:record-review -->

**SECU findings** (pipeline verify step — verdict: PARTIAL)

| Priority | Dimension | Location | Finding |
|----------|-----------|----------|----------|
| P4 | spur task check | — | task check passed |
| P4 | design-conformance | — | Additive InstallTarget union (`targets.ts:26`); core module `operations/grok-bot.ts` with CLI orchestration in install/update/doctor; manifest extension `install-manifest.ts:54`; planned flow (preflight → staging → plan → transactional commit) matches `emitGrokBotInstall`; no scope-creep hunks in `21469bb`/`9184457` |
| P4 | Priority | — | Location |
| P4 | P2 | — | `packages/core/src/operations/grok-bot.ts` |
| P4 | P4 | — | `packages/core/src/operations/grok-bot.ts:700` |
| P4 | P4 | — | — |
| P1 | evidence-rule-failed | — | Executable evidence missing for: Scenario: R10 — AC12 Documentation and host discovery are verified (R10) |

### References

Repository evidence inspected 2026-09-08; symbol names are navigation anchors and must be rechecked if code moves.

- `packages/core/src/targets.ts:5` — nine existing targets; `TARGET_TO_AGENT_NAME` is also consumed by replay/judge execution.
- `apps/cli/src/commands/install.ts:1515` — `parseTargets` currently expands omitted/all to TARGETS.
- `apps/cli/src/commands/install.ts:315` — `executeInstall`; staging is removed in finally, Bot needs independent durable output.
- `apps/cli/src/commands/install.ts:1672` — `prepareTargetRulesyncInput` copies and transforms per-target staging.
- `apps/cli/src/commands/install.ts:1910` — `writeInstallProvenance` currently derives inventories relative to one output root; locate by symbol if lines change.
- `packages/core/src/mapper.ts:114` — canonical flat entity mapping and resource-copy contract.
- `packages/core/src/operations/install-manifest.ts:63` — reusable target/plugin manifest path and safe segments.
- `apps/cli/src/commands/update.ts:96` — update comparison/dispatch; read target/source action handling with its callers.
- `packages/core/src/skills-ecosystem/installer.ts:240` — reusable FilesystemTransaction replacement/removal/rollback.
- Existing focused suites: `apps/cli/tests/commands/install.test.ts`, `install.integration.test.ts`, `install-grok-helpers.test.ts`, `install-prune.test.ts`, `install-manifest.test.ts`, `update.test.ts`; `apps/cli/tests/config.test.ts`; `packages/core/tests/mapper.test.ts`, `targets.test.ts`, `operations/install-manifest.test.ts`.
- `docs/00_ADR.md` ADR-009/010/012/034/035; `docs/01_PRD.md`; `docs/03_ARCHITECTURE.md`; `docs/04_DESIGN.md`; `docs/99_PROJECT_CONSTITUTION.md`; `docs/help/entity_locations.md`.
- Related delivered work: task 0078 (native Grok Build), 0123/0124 (install provenance/update), 0127 (invocation-local install staging). These are background context, not unresolved implementation prerequisites.
- No external AgentName or host CLI capability is assumed for Grok Bot. The supplied host contract and its evidence limitations are reproduced in Background.

### History

- 2026-09-08T20:04:12.313Z backlog → todo (system)
- 2026-09-09T00:44:24.699Z todo → wip (system)
- 2026-09-09T06:06:06.146Z wip → testing (system)

### Notes

**Planning readiness: PASS (2026-09-08).** Task authored through `spur task create/update`, linked to existing feature F (CLI Surface), priority P1, status `todo`, with task-local requirement/AC traceability. `spur task check 0128 --strict --json` returned `pass: true`, no findings, and no missing sections. This is a planning result, not an implementation verification verdict; R1–R10 and implementation evidence remain pending.

**Broader baseline:** `bun run corpus-check` exited 1 with 168 errors and 710 warnings in the existing corpus, including old missing Solution/Review evidence and F3 unverified scenarios. Its reported errors did not name task 0128. The command also reported that the fog comparison was skipped because HEAD did not diverge from origin/main. Local log: `.spur/run/0128-corpus-check.log` (ignored convenience evidence, not a dependency of this task). Re-run at implementation time and distinguish inherited findings from regressions; do not weaken gates or repair unrelated tasks merely to hide this baseline.

**Authoring verification scope:** only this new task is a new Git-visible artifact; the two pre-existing untracked draft documents were preserved. No product source changed, so runtime tests/build were not run during task authoring. All source-document content needed for the implementation is embedded here, with no reference or dependency on a removable draft. The implementation must execute its own focused/full checks and obtain authorized host evidence as specified above.
