---
schema_version: 1
name: "superskill update verb - check and re-install stale plugins"
status: done
template: feature-impl
created_at: 2026-08-31T17:35:25.073Z
updated_at: "2026-09-02T17:50:38.288Z"
feature_id: B
priority: P2
tags: ["update-notification", "cli", "update"]
dependencies: ["0123"]
---

## 0124. superskill update verb - check and re-install stale plugins

### Background
Feature B and ADR-035 define the user-facing pull check and reconciliation command. Current-tree verification on 2026-08-31 found no top-level `update` command or plugin-update operation: `apps/cli/src/cli.ts` registers `install` and artifact-family commands, `apps/cli/src/commands/install.ts` owns source resolution/re-install, and `packages/core/src/operations/` contains reusable domain operations only.

This task consumes task 0123's frozen manifest DTO, registry path, reader, and upstream snapshot. It covers feature scenarios R2–R8. It must not duplicate manifest writing or install dispatch. Release feeds, background checks, in-agent banners, automatic package-manager execution, and per-release history remain out of scope.
### Requirements
- [x] R2. `superskill update --check` scans the selected target/scope manifest registry, resolves each marketplace locator (or the `--marketplace` override), compares `upstreamVersion` first and the upstream canonical hash when versions match, and reports each stale plugin once with version delta and changed upstream capability paths. A stale-only check exits 1.
- [x] R3. Matching marketplace version/hash or bundled npm version reports `up to date`, modifies no install or manifest file, and exits 0 when every candidate is current or legacy-only.
- [x] R4. Bare `superskill update [plugin]` reuses `executeInstall` for stale marketplace candidates with their recorded targets/scope/source; task 0123 refreshes each manifest. A stale bundled candidate prints `npm i -g @gobing-ai/superskill@latest` once and does not copy-patch bundled files.
- [x] R5. A known candidate with no manifest reports `installed before manifest support - reinstall to adopt` and exits successfully. Known candidates are the explicit plugin, plugin-keyed manifest paths, configured plugins, and plugins in the bundled marketplace; unknown third-party pre-manifest installs are not guessed from hyphenated capability filenames.
- [x] R6. An unresolved local/GitHub locator or failed bundled registry lookup reports `upstream unavailable (<locator>)`, continues every other candidate, and makes the aggregate exit 2; exit 2 takes precedence over stale exit 1.
- [x] R7. Invalid JSON, unsupported schema, unsafe identity/path data, or a deleted manifest for a known candidate follows the same legacy guidance as R5 without throwing. The plugin identity comes from the safe plugin-keyed registry path, never from untrusted corrupt JSON.
- [x] R8. Comparison is current-state only: several upstream releases yield one row per plugin using the current upstream version and current changed-path set; no release loop or history store is introduced.
- [x] R9. Register `superskill update [plugin] [--check] [--targets <list>] [--marketplace <locator>] [--no-global]`. Omitted plugin means all known candidates in selected scopes; `--targets`, configured defaults, scope, and marketplace locator semantics match `install`.
- [x] R10. Core comparison returns structured results and never writes stdout or exits. CLI formatting uses the existing stdout seam, applies aggregate exit codes, and calls install only in mutating mode. Tests cover R2–R9 for local marketplace, bundled, stale/current/legacy/corrupt/unavailable/mixed batches, target/plugin filters, no-write check mode, re-install delegation, output, and exit precedence.
- [x] R11. Same-commit documentation updates add the command, flags, manifest schema/path, result/exit contract to `docs/04_DESIGN.md` and add `superskill update --check` to release-checklist item 5.
### Acceptance Criteria
- [x] R2 — Update check reports stale capabilities against an upstream local marketplace
  - Given an installed marketplace plugin whose recorded upstream snapshot differs from the current locator
  - When the operator runs `superskill update --check`
  - Then the plugin is reported stale once with the current version and changed capability paths
  - And the command exits 1 when no upstream is unavailable
- [x] R3 — Update check reports up-to-date installs without false positives
  - Given an installed plugin whose recorded and current version/hash match
  - When the operator runs `superskill update --check`
  - Then the plugin is reported up to date, no file is modified, and the command exits 0
- [x] R4 — Update re-installs a stale plugin
  - Given a stale marketplace plugin
  - When the operator runs `superskill update <plugin>`
  - Then the existing install path is invoked with its recorded target/scope/source and the refreshed manifest matches the new install
- [x] R5 — Pre-manifest installs degrade gracefully
  - Given a configured, bundled, or explicitly selected installed plugin with no manifest
  - When the operator runs `superskill update --check` or names that plugin
  - Then the output says `installed before manifest support - reinstall to adopt` and the command exits successfully
- [x] R6 — Upstream locator unavailable during check
  - Given one unavailable marketplace locator and another resolvable plugin
  - When the operator runs `superskill update --check`
  - Then both plugins are reported, the unavailable row names its locator, and the aggregate exit is 2
- [x] R7 — Corrupt or missing manifest is treated as pre-manifest
  - Given a corrupt plugin-keyed manifest or a missing manifest for a known candidate
  - When the operator runs `superskill update --check`
  - Then legacy guidance is reported without a crash or trust in corrupt identity fields
- [x] R8 — Multiple same-day upstream versions collapse into one stale report
  - Given several upstream releases since install
  - When the operator runs `superskill update --check`
  - Then one row names the current upstream version and no per-release history is read or produced
### Q&A
#### Q&A entry — 2026-08-31T18:08:25.463Z

- **Candidate discovery:** no-argument mode uses plugin-keyed manifests plus configured and bundled marketplace plugin names. An explicit plugin is always a candidate. Arbitrary old third-party installs without a manifest or config edge are unknowable and are not inferred from ambiguous `<plugin>-<capability>` filenames.
- **Exit precedence:** any unavailable upstream yields 2; otherwise any stale result in check mode yields 1; otherwise 0. Legacy/corrupt rows are guidance, not command failure.
- **Mutation boundary:** check mode is strictly read-only. Bare update re-installs stale marketplace rows through `executeInstall`; bundled rows print the existing npm upgrade command because the running CLI cannot safely replace itself.
- **Comparison domain:** marketplace staleness uses 0123's upstream snapshot, not transformed installed bytes. Installed hashes remain provenance evidence and do not create false positives from target-specific transforms.
- **Batch semantics:** resolve current upstream state once per unique locator/plugin source and emit one final row per plugin. Continue independent rows when one source is unavailable; mutation planning remains per target/source so merged reporting cannot suppress an action.
- **Deferred:** automatic npm execution, unknown legacy-install heuristics, release history, push notification, and scheduled checks. No open decisions remain for implementation.
### Design
**WHAT / WHERE**

- Add `packages/core/src/operations/update.ts` with `PluginUpdateStatus`, `PluginUpdateResult`, `UpdateCheckResult`, `compareMarketplaceManifest`, and aggregate exit-code selection. The core accepts resolved current upstream metadata/snapshot; it performs deterministic comparison only.
- Add `apps/cli/src/commands/update.ts` with `registerUpdate` and `executeUpdate`; register it in `apps/cli/src/cli.ts`. The CLI owns config/target parsing, manifest discovery, marketplace/npm I/O, output, exit status, and `executeInstall` delegation.
- Reuse `parseTargets`, `loadConfig`, task 0123's manifest reader/path API, existing local/remote marketplace resolution, `NodeProcessExecutor` for `npm view @gobing-ai/superskill version`, and `process.stdout.write`-observable output. Add no dependency or second locator parser.

**ALGORITHM / PRECEDENCE**

1. Resolve targets from `--targets`, config, or install defaults and choose global/project `scopeRoot` exactly as install does.
2. Build a stable WBS-independent candidate set from plugin-keyed manifest directories, config plugins, bundled marketplace plugins, and the optional positional plugin; apply the positional plugin as a filter.
3. Read each candidate manifest. Missing/corrupt/unsupported manifests become `legacy`; use the safe path/config identity and ignore corrupt identity fields.
4. Bundled rows share one npm latest-version lookup. Marketplace rows resolve the recorded locator or explicit override, read the current plugin version, and snapshot the current plugin source with 0123's helper.
5. Compare marketplace version first, then upstream canonical hash on equal version. Diff upstream per-file maps for changed paths. Compare bundled versions only.
6. In `--check`, render every row and perform no write. In mutating mode, call `executeInstall` only for stale marketplace rows; print the npm upgrade command once for any stale bundled row. Current, legacy, and unavailable rows are never mutated.
7. Return exit 2 for any unavailable row; else check-mode exit 1 for any stale row; else 0.

**ANTI-PATTERNS / INVARIANTS**

- Do not call `process.exit`, write output, perform network I/O, or invoke install from the core module.
- Do not compare installed transformed hashes to upstream source hashes, mutate during `--check`, infer plugin ids by splitting hyphenated filenames, write manifests in 0124, or iterate release history.
- Deduplicate upstream work by channel+locator and plugin, preserve deterministic target/plugin output order, validate every path segment, and continue independent candidates on per-plugin upstream failure.
- Dependency 0123 owns manifest compatibility. Unknown future schema versions become legacy guidance; no in-place migration is added.

**DOC / TEST SURFACES**

- Core tests: comparison, changed-path diff, aggregation/precedence, deterministic ordering.
- CLI tests: registration/flags, discovery/filtering, injected upstream/process/install seams, stdout rows, exit codes, and strict no-write check mode.
- Update `docs/04_DESIGN.md` and `docs/help/release.md` in the same implementation change.
### Plan
- [x] 1. Implement and export the pure core comparison/result/exit aggregation for R2–R3, R6, and R8 against task 0123's upstream snapshot contract.
- [x] 2. Implement CLI candidate discovery and safe manifest reading for explicit/all-plugin, target, scope, legacy, and corrupt cases (R5, R7, R9).
- [x] 3. Add marketplace and bundled upstream resolution with deduped I/O, deterministic reporting, and exit precedence (R2–R3, R6, R8, R10).
- [x] 4. Add mutating-mode delegation to `executeInstall` for stale marketplace rows and one bundled npm upgrade instruction; prove `--check` writes nothing (R4, R10).
- [x] 5. Register the command and add focused core/CLI tests for every acceptance scenario, mixed-batch continuation, filters, stdout, and exit codes.
- [x] 6. Sync `docs/04_DESIGN.md` and release-checklist item 5, then run touched tests, `bun run lint`, `bun run test`, `bun run build`, and `bun run spur-check`.
### Solution
Adds `superskill update [plugin] [--check]` as the pull-model check/reconcile surface. Core comparison stays pure; the CLI discovers candidates, resolves upstream, prints one row per plugin, and retains raw target/source actions so report merging cannot suppress a marketplace reinstall or bundled npm instruction.

| File | What | Why |
| --- | --- | --- |
| `packages/core/src/operations/update.ts:51` | `compareMarketplaceManifest` | Version-first, hash tie-break, changed upstream paths |
| `packages/core/src/operations/update.ts:118` | `mergePluginUpdateRows` | Deterministic one-row-per-plugin reporting |
| `packages/core/src/operations/update.ts:162` | `aggregateUpdateExit` | Exit 2 beats check-mode stale 1, computed from raw rows |
| `apps/cli/src/commands/update.ts:56` | `registerUpdate` | Install-compatible positional/flag surface |
| `apps/cli/src/commands/update.ts:96` | `executeUpdate` | Candidate discovery, locator/npm I/O, stdout, read-only check, and action execution |
| `apps/cli/src/commands/update.ts:112` | Raw action planning | Groups marketplace actions by plugin+locator+targets and retains bundled stale independently |
| `apps/cli/src/commands/install.ts:1683` | Shared version readers | Install and update cannot drift on marketplace/plugin version precedence |
| `apps/cli/src/cli.ts:22` | `registerUpdate` | Top-level verb registration |
| `packages/core/src/index.ts:28` | `operations/update` export | Public pure comparison surface |

Command/flag/schema/result/exit behavior is synchronized in `docs/04_DESIGN.md`; release smoke includes `superskill update --check` in `docs/help/release.md`.
### Testing
**Pipeline verify results**

- Verdict: PASS (from verdict artifact)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| R2 | MET | Marketplace comparison is version-first with upstream canonical-hash tie-break and UTF-8-sorted changed paths (`packages/core/src/operations/update.ts:51`); CLI resolves selected-scope manifests, deduplicates locator/plugin work, and renders one merged row (`apps/cli/src/commands/update.ts:120`, `:181`). The stale row/version/path/exit contract is tested at `apps/cli/tests/commands/update.test.ts:86`. |
| R3 | MET | Equal version/hash returns `current` (`packages/core/src/operations/update.ts:71`); every mutation is behind `!options.check` (`apps/cli/src/commands/update.ts:184`). The current/no-install case is tested at `apps/cli/tests/commands/update.test.ts:110`. |
| R4 | MET | Raw stale rows build target/source-specific marketplace actions while bundled stale is retained independently (`apps/cli/src/commands/update.ts:112`, `:127`, `:168`); mutating mode executes both at `:184`. Marketplace argument behavior is tested at `apps/cli/tests/commands/update.test.ts:213`, direct plugin-root re-install at `:473`, bundled handling at `:276`, and mixed marketplace+bundled action preservation at `:299`. |
| R5 | MET | Candidate discovery unions explicit/configured, selected-target manifests, and packaged bundled identities without filename heuristics (`apps/cli/src/commands/update.ts:105`, `:222`, `:362`); zero readable manifests become legacy guidance (`:121`). Explicit/configured/target-filter/packaged cases are tested at `apps/cli/tests/commands/update.test.ts:139`, `:528`, `:454`, and `:551`. |
| R6 | MET | Locator/npm failures produce unavailable rows while the batch continues (`apps/cli/src/commands/update.ts:133`, `:155`); unavailable exit 2 beats stale 1 from the unmerged rows (`packages/core/src/operations/update.ts:162`, `:174`). Mixed continuation is tested at `apps/cli/tests/commands/update.test.ts:195`. |
| R7 | MET | The shared reader rejects unsafe embedded identity/snapshot paths (`packages/core/src/operations/install-manifest.ts:247`, `:284`); discovery also requires body identity to match its safe registry path (`apps/cli/src/commands/update.ts:273`). Corrupt and valid-shape mismatched manifests degrade to legacy at `apps/cli/tests/commands/update.test.ts:149` and `:163`. |
| R8 | MET | Comparison reads only recorded/current upstream snapshots (`packages/core/src/operations/update.ts:51`); reporting collapses to one plugin row (`:118`) while action planning stays per target/source (`apps/cli/src/commands/update.ts:168`). Core merge tests and the mixed-channel CLI test cover both contracts; no history store exists. |
| R9 | MET | `registerUpdate` exposes `[plugin]`, `--check`, `--targets`, `--marketplace`, and `--no-global` (`apps/cli/src/commands/update.ts:56`) and is registered at `apps/cli/src/cli.ts:22`. Target/config/scope semantics are shared with install; HOME global behavior is tested at `apps/cli/tests/commands/update.test.ts:574`. |
| R10 | MET | Core update is pure comparison/aggregation (`packages/core/src/operations/update.ts`); CLI owns discovery, upstream I/O, stdout, exit, and install delegation (`apps/cli/src/commands/update.ts:96`). Focused core/CLI/wiring run: 89 pass / 0 fail. Full: 2129 pass / 0 fail; both update modules have 100% function coverage. |
| R11 | MET | Authoritative command/flag/schema/result/exit behavior is in `docs/04_DESIGN.md:25` and `:40`; release smoke includes `superskill update --check` at `docs/help/release.md:59`. |

| Acceptance Criteria | Status | Evidence Type | Evidence |
|---------------------|--------|---------------|----------|
| R2 — Update check reports stale capabilities against an upstream local marketplace | MET | test | `apps/cli/tests/commands/update.test.ts:86` asserts one stale row, `1.0.0 → 2.0.0`, `skills/a.md`, and exit 1. |
| R3 — Update check reports up-to-date installs without false positives | MET | test | `apps/cli/tests/commands/update.test.ts:110` asserts `up to date`, exit 0, and no install call. |
| R4 — Update re-installs a stale plugin | MET | test | `apps/cli/tests/commands/update.test.ts:213` proves check mode is read-only and mutation passes the recorded target/locator; `:473` proves direct plugin roots use `pluginPath`; `:299` proves merged reporting cannot suppress either marketplace or bundled action. |
| R5 — Pre-manifest installs degrade gracefully | MET | test | Explicit (`apps/cli/tests/commands/update.test.ts:139`), configured (`:528`), and packaged bundled (`:551`) candidates print adoption guidance; selected-target filtering avoids false guidance (`:454`). |
| R6 — Upstream locator unavailable during check | MET | test | `apps/cli/tests/commands/update.test.ts:195` asserts all rows continue and unavailable wins with exit 2; core precedence is tested in `packages/core/tests/operations/update.test.ts`. |
| R7 — Corrupt or missing manifest is treated as pre-manifest | MET | test | `apps/cli/tests/commands/update.test.ts:149` covers corrupt JSON and `:163` covers valid-schema unsafe identity; both use registry identity and return legacy guidance. |
| R8 — Multiple same-day upstream versions collapse into one stale report | MET | test | `packages/core/tests/operations/update.test.ts:62` proves one merged plugin row/current paths; `apps/cli/tests/commands/update.test.ts:299` proves one output row without losing target/channel actions. |
- Coverage: N/A (verdict-based; verify pipeline does not measure code coverage)
### Review
**Verdict: PASS**

Scope: task 0124 implementation and tests after all feature-B residual fixes. Dimensions: functional traceability, SECUA, and architecture. Fresh evidence: focused update/core run 30 pass / 0 fail; `bun run lint` exit 0.

| Priority | Dimension | Location | Finding |
| --- | --- | --- | --- |
| P4 | — | — | No P1–P3 findings; functional, SECUA, and architecture review PASS. |

#### Functional traceability

| Req | Status | Evidence |
| --- | --- | --- |
| R2 | MET | Marketplace comparison is version-first with canonical-hash tie-break and changed paths (`packages/core/src/operations/update.ts:51`); the CLI resolves/deduplicates upstream work and renders one merged row (`apps/cli/src/commands/update.ts:120`, `:181`). The stale/version/path/exit contract is tested in `apps/cli/tests/commands/update.test.ts:86`. |
| R3 | MET | Current rows are produced by `compareMarketplaceManifest` (`packages/core/src/operations/update.ts:71`); all mutations are guarded by `!options.check` (`apps/cli/src/commands/update.ts:184`). The current/no-install case is tested at `apps/cli/tests/commands/update.test.ts:110`. |
| R4 | MET | Raw stale rows build target/source-specific marketplace actions while bundled stale is retained independently (`apps/cli/src/commands/update.ts:112`, `:127`, `:168`); mutating mode executes both action families at `:184`. Marketplace arguments are tested at `apps/cli/tests/commands/update.test.ts:213`; the mixed-channel residual-proof case is at `:299`. |
| R5 | MET | Candidates union explicit/configured, selected-target manifests, and the packaged marketplace (`apps/cli/src/commands/update.ts:105`, `:222`, `:362`) without filename guessing. Explicit, configured, packaged, and target-filter cases are covered at `apps/cli/tests/commands/update.test.ts:139`, `:528`, `:551`, and `:454`. |
| R6 | MET | Per-source failures become unavailable rows while the batch continues (`apps/cli/src/commands/update.ts:133`, `:155`); raw-row aggregation preserves exit 2 precedence (`packages/core/src/operations/update.ts:162`). Mixed continuation is tested at `apps/cli/tests/commands/update.test.ts:195`. |
| R7 | MET | Manifest reads require body identity to match the safe registry path (`apps/cli/src/commands/update.ts:273`); shared validation rejects unsafe identity/snapshot paths. Corrupt and valid-shape mismatched manifests degrade to legacy at `apps/cli/tests/commands/update.test.ts:149` and `:163`. |
| R8 | MET | `mergePluginUpdateRows` collapses reporting to one UTF-8-sorted plugin row (`packages/core/src/operations/update.ts:118`) while action planning remains per target/source (`apps/cli/src/commands/update.ts:168`). Core merge/current-state tests and the mixed-channel CLI test cover both contracts. |
| R9 | MET | `registerUpdate` exposes the positional plugin plus `--check`, `--targets`, `--marketplace`, and `--no-global`; scope/target selection enters `executeUpdate` at `apps/cli/src/commands/update.ts:96`. Registration and HOME scope are tested in `apps/cli/tests/commands/update.test.ts:79` and `:574`. |
| R10 | MET | Core comparison/merge/exit code remains pure (`packages/core/src/operations/update.ts`); CLI owns discovery, I/O, stdout, and install delegation (`apps/cli/src/commands/update.ts:96`). Focused update/core run: 30 pass / 0 fail, with both touched update modules at 100% function coverage. |
| R11 | MET | Command/flag/schema/result/exit behavior is documented in `docs/04_DESIGN.md`; release smoke includes `superskill update --check` in `docs/help/release.md`. |

#### SECUA and architecture

- Plugin/target registry identities are safe-segment checked; corrupt body identity is never trusted.
- `--check` performs no install or manifest mutation; subprocess execution remains behind `ProcessExecutor`.
- Update reuses install's version readers (`apps/cli/src/commands/install.ts:1683`, `:1704`) and existing install orchestration. Report merging and mutation planning are deliberately separate so one display row cannot suppress a required action.

Functional Verdict: PASS
### References
- Feature: `docs/features/B_skill-update-notification-install-manifest-and-update-verb.md`
- Decisions: `docs/00_ADR.md` ADR-031, ADR-032, ADR-034, ADR-035
- Feature design: `docs/design/skill-update-notification.md`
- Manifest dependency: task 0123 and `packages/core/src/operations/install-manifest.ts`
- Install/re-install orchestration: `apps/cli/src/commands/install.ts`
- CLI registration: `apps/cli/src/cli.ts`
- Config discovery: `apps/cli/src/config.ts`
- Marketplace resolution: `packages/core/src/marketplace.ts`
- Surface authority: `docs/04_DESIGN.md`
- Release smoke: `docs/help/release.md`
### History
- 2026-09-01T04:54:02.744Z todo → wip (system)
- 2026-09-01T05:08:08.391Z todo → wip (system)
- 2026-09-01T05:25:38.683Z wip → testing (system)
- 2026-09-01T05:26:29.013Z testing → done (system)
