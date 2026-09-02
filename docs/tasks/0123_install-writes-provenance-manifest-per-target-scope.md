---
schema_version: 1
name: "Install writes provenance manifest per target scope"
status: done
template: feature-impl
created_at: 2026-08-31T17:35:25.040Z
updated_at: "2026-09-02T17:50:08.283Z"
feature_id: B
priority: P2
tags: ["update-notification", "install", "manifest"]
---

## 0123. Install writes provenance manifest per target scope

### Background
Feature B and ADR-035 define the pull-model update primitive. Current-tree verification on 2026-08-31 found that `apps/cli/src/commands/install.ts` owns `executeInstall`, target dispatch, and installed-path discovery; there is no core install operation. `packages/core/src/skills-ecosystem/locks.ts` already exports the ADR-031 primitives `computeStructuredContentHash` and `computeContentHash`, while `packages/core/src/marketplace.ts` and the install command own marketplace resolution.

This task adds one core provenance DTO/read-write module and threads it through the existing CLI install flow. It covers feature scenario R1 only. Update comparison, reporting, and re-install behavior belong to dependent task 0124. Push notifications, background checks, and a new workspace package remain out of scope.
### Requirements
- [x] R1. A successful non-dry-run `superskill install <plugin>` writes one atomic manifest for every requested target at `<scopeRoot>/.superskill/manifests/<target>/<plugin>/.superskill-manifest.json`; `scopeRoot` is the explicit `outputRoot`, otherwise the user home for global installs or the working directory for project installs.
- [x] R2. Manifest schema version 1 records `plugin`, `target`, `channel` (`bundled` or `marketplace`), `upstreamVersion`, optional `marketplaceLocator`, optional resolved Git tree SHA, `installedAt` as ISO-8601 UTC, `superskillVersion`, installed-file SHA-256 map plus canonical hash, and upstream-source SHA-256 map plus canonical hash.
- [x] R3. Installed snapshot paths are slash-normalized relative paths under `scopeRoot`, contain only regular files owned or written by this plugin-target install, exclude the manifest itself, and hash the final bytes on disk. The upstream snapshot hashes the resolved plugin source tree so equal-version local marketplace drift is comparable without mutating an install.
- [x] R4. Both canonical hashes reuse `computeStructuredContentHash`; per-file hashes reuse `computeContentHash`. Ordering is raw UTF-8 byte order through the existing helper, with no new hash framing or dependency.
- [x] R5. Plugin and target path segments pass the existing safe-segment guard. A manifest is written only when its target dispatch completes and its installed-file inventory resolves; an inventory or atomic-write failure fails the install instead of printing a false success. Dry-run writes no manifest.
- [x] R6. Marketplace metadata comes from the same `PluginResolution` used by install: explicit locators remain verbatim, local/configured resolutions retain a re-resolvable absolute locator, marketplace entry version wins with plugin-manifest version as fallback, and remote materialization exposes its resolved tree SHA. Installed-package fallback uses `cliVersion` and channel `bundled`.
- [x] R7. Tests cover two plugins in one target without overwrite, two targets with distinct manifests, exact field/hash content, deterministic ordering, atomic replacement, dry-run/no-partial-write behavior, bundled and marketplace metadata, remote resolved SHA, and manifest-write failure propagation through `executeInstall`.
### Acceptance Criteria
- [x] R1 — Install writes a provenance manifest per target scope
  - Given a plugin with skills and commands and two configured targets
  - When the operator runs `superskill install <plugin>`
  - Then each target has a plugin-keyed provenance manifest in its selected scope
  - And each manifest records the plugin, target, channel, upstream version or resolved revision, install timestamp, writer version, and deterministic upstream and installed-file hashes
  - And every installed-file hash matches the final file bytes written for that target
  - And installing a second plugin preserves the first plugin's manifest
### Q&A

<!-- CLOSED decisions from refinement: what was chosen and why, what was deferred and on what
     condition. Not a parking lot for open questions — an unanswered question here means the task
     is not ready to hand off. Keep empty if none. -->

#### Q&A entry — 2026-08-31T18:05:54.154Z

- **Manifest location:** use `<scopeRoot>/.superskill/manifests/<target>/<plugin>/.superskill-manifest.json`. Target capability roots are shared and one plugin spans several directories, so a singleton file beside a skills root would overwrite another plugin or omit non-skill artifacts.
- **Two snapshot domains:** keep installed and upstream snapshots separately. Installed hashes prove what landed; upstream hashes make the equal-version local-marketplace comparison in ADR-035 possible without rebuilding every target during `update --check`.
- **Ownership:** the core module owns schema, hashing, validation, path derivation, and atomic I/O. The existing CLI `executeInstall` remains the only install orchestrator and supplies target receipts plus resolved source metadata.
- **Failure policy:** provenance is part of install success. Missing target inventory or a failed manifest replacement is fatal; no best-effort warning can claim a traceable install when no trustworthy manifest exists.
- **Deferred:** comparison/reporting, npm lookup, stale reconciliation, and legacy-install discovery stay in 0124. No open decisions remain for implementation.
### Design
**WHAT / WHERE**

- Add `packages/core/src/operations/install-manifest.ts` with `InstallManifestV1`, `InstallSnapshot`, `InstallSourceMetadata`, `installManifestPath`, `snapshotFiles`, `readInstallManifest`, and `writeInstallManifest`; export it from `packages/core/src/index.ts`.
- Extend `ResolvedPlugin` / `PluginResolution` only with the source metadata install already resolved: channel, version, re-resolvable locator, and optional remote tree SHA. Make remote materialization return its fetched `RepoTree` metadata; existing callers may ignore the return value.
- In `apps/cli/src/commands/install.ts`, accumulate one `TargetInstallReceipt { target, scopeRoot, files }` per requested target from rulesync result paths and the existing native/custom emitter path results. Once all writes for that target succeed, call the injected/default manifest writer with the receipt and resolved source snapshot.

**WHY / DATA FLOW**

`resolve source -> snapshot upstream source -> map/dispatch target -> collect final owned paths -> snapshot installed bytes -> atomic manifest replace -> print install success`. The plugin-keyed registry prevents cross-plugin overwrite; separate snapshot domains keep provenance and staleness comparison truthful.

**INVARIANTS**

- Normalize and deduplicate receipt paths, reject paths outside `scopeRoot`, skip symlinks/special files, and sort by UTF-8 bytes through `computeStructuredContentHash`.
- Inventory only plugin-owned outputs: rulesync `*Paths`, plugin-prefixed native agents/rules/scripts/magents, emitted hook/config files touched by this install, or the recursively enumerated native plugin install directory. Shared files are included only when this install actually wrote them.
- Write a sibling temporary file and rename it over the manifest. Never delete the previous manifest before the replacement is durable.
- `executeInstall` gets a `writeInstallManifest` dependency seam for focused failure tests; production uses the core writer. Do not add a second install operation, hash implementation, package, cache, or manifest writer.
- Update `docs/design/skill-update-notification.md` to show the plugin-keyed path and the two snapshot domains; task 0124 owns the numbered `docs/04_DESIGN.md` command/schema sync.

**HANDOFF**

Task 0124 may depend only on the exported manifest DTO/path/read functions and the upstream snapshot. It must not parse task 0123's JSON ad hoc or write manifests itself.
### Plan
- [x] 1. Implement the core manifest DTO, collision-safe path derivation, snapshot hashing, validation, and atomic read/write functions for R1–R5; export the module.
- [x] 2. Enrich marketplace/install resolution with channel, version, locator, and remote tree SHA metadata for R6 without changing current resolution precedence.
- [x] 3. Collect exact per-target install receipts across rulesync and native/custom emitters, then write the manifest before the existing success line; preserve dry-run behavior and fail loud on incomplete provenance.
- [x] 4. Add focused core tests for path/schema/hash/atomic behavior and install tests for per-target writes, multi-plugin preservation, metadata branches, dry-run, and failure propagation (R1–R7).
- [x] 5. Correct the feature satellite design's manifest path and snapshot-domain description, then run the touched test files, `bun run lint`, `bun run test`, `bun run build`, and `bun run spur-check`.
### Solution
Install writes one plugin-keyed provenance manifest per target after successful non-dry-run dispatch, using separate installed-byte and upstream-source snapshots so update comparison never rebuilds target trees.

| File | What | Why |
| --- | --- | --- |
| `packages/core/src/operations/install-manifest.ts:41` | `InstallManifestV1` + `InstallSnapshot` DTOs | Schema v1 records identity, channel/version, optional locator/tree SHA, writer metadata, and both snapshots |
| `packages/core/src/operations/install-manifest.ts:63` | `installManifestPath` | Collision-safe plugin/target registry with safe-segment validation |
| `packages/core/src/operations/install-manifest.ts:98` | `snapshotFiles` | In-root regular files, slash-normalized paths, final-byte hashes, deterministic canonical hash |
| `packages/core/src/operations/install-manifest.ts:156` | `writeInstallManifest` | Validated sibling-temp rename; previous manifest is never unlinked first |
| `packages/core/src/index.ts:23` | Operations exports | Public core surface for install and update |
| `packages/core/src/skills-ecosystem/fetch.ts:531` | `materializeRepoSubdir` returns `RepoTree` | Cold-cache GitHub installs record `resolvedRef` |
| `apps/cli/src/commands/install.ts:198` | `PluginResolution` metadata | One source resolution carries channel/version/locator into provenance |
| `apps/cli/src/commands/install.ts:848` | `writeInstallProvenance` before success | Exact per-target receipts plus current plugin-owned recovery; dry-run writes none and inventory/writer failure is fatal |

The feature design is synchronized in `docs/design/skill-update-notification.md`; task 0124 owns the numbered command/schema surface.
### Testing
**Pipeline verify results**

- Verdict: PASS (from verdict artifact)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| R1 | MET | `installManifestPath` derives `<scopeRoot>/.superskill/manifests/<target>/<plugin>/.superskill-manifest.json` (`packages/core/src/operations/install-manifest.ts:63`); `executeInstall` resolves one scope root (`apps/cli/src/commands/install.ts:373`) and writes provenance before success (`:848`). Two-target behavior/final-byte hashes and second-plugin preservation are tested at `apps/cli/tests/commands/install-manifest.test.ts:89` and `:134`. |
| R2 | MET | Schema v1 is explicit at `packages/core/src/operations/install-manifest.ts:41`; install assembles channel/version/locator/ref/timestamp/writer and both snapshots at `apps/cli/src/commands/install.ts:1939`; schema round-trip/invalid-shape coverage starts at `packages/core/tests/operations/install-manifest.test.ts:203`. |
| R3 | MET | `snapshotFiles` normalizes in-root regular files, byte-sorts paths, and hashes final bytes (`packages/core/src/operations/install-manifest.ts:98`). Reinstall inventory uses exact current mapped skill names and plugin-scoped native roots (`apps/cli/src/commands/install.ts:1826`), then filters to the selected scope (`:1922`). Residual-proof tests exclude stale/sibling skills (`apps/cli/tests/commands/install-manifest.test.ts:89`) and a sibling Claude cache plugin (`:398`). |
| R4 | MET | Per-file hashes call `computeContentHash` on bytes and canonical hashes call `computeStructuredContentHash` after raw UTF-8 ordering (`packages/core/src/operations/install-manifest.ts:106`); the shared byte-capable primitive is `packages/core/src/skills-ecosystem/locks.ts:203`. Deterministic hash/order tests are at `packages/core/tests/operations/install-manifest.test.ts:56` and `:79`. |
| R5 | MET | Registry identity uses the shared safe-segment guard (`packages/core/src/operations/install-manifest.ts:63`); reads reject unsafe identity and snapshot paths (`:247`, `:284`); writes use sibling-temp rename (`:156`). Dry-run bypasses provenance (`apps/cli/src/commands/install.ts:843`), empty inventory fails before success (`:1933`), and Claude receives explicit project/user scope (`:899`, `:922`). |
| R6 | MET | Install preserves the original locator/resolved tree metadata while resolving one source (`apps/cli/src/commands/install.ts:359`); version precedence shares the marketplace/plugin readers at `:1683` and `:1704`. Marketplace-entry/plugin-manifest/bundled fallback and remote SHA branches are covered by install/provenance tests. |
| R7 | MET | Focused install cluster covers schema/hash/atomic replacement, two targets/plugins, dry-run, writer/empty-inventory failures, local/configured/remote metadata, exact ownership, and native Claude isolation: 137 pass / 0 fail across five task test files. Full gate: 2129 pass / 0 fail. |

| Acceptance Criteria | Status | Evidence Type | Evidence |
|---------------------|--------|---------------|----------|
| R1 — Install writes a provenance manifest per target scope | MET | test | `apps/cli/tests/commands/install-manifest.test.ts:89` proves distinct target manifests, complete metadata, deterministic final-byte hashes, and exclusion of stale/sibling skills; `:134` proves second-plugin preservation; `:398` proves native Claude isolation. Focused: 137 pass / 0 fail. Full: 2129 pass / 0 fail. |
- Coverage: N/A (verdict-based; verify pipeline does not measure code coverage)
### Review
**Verdict: PASS**

Scope: task 0123 implementation and tests after the feature-B residual fixes. Dimensions: functional traceability, SECUA, and architecture. Fresh evidence: focused install/update/core run 95 pass / 0 fail; `bun run lint` exit 0.

| Priority | Dimension | Location | Finding |
| --- | --- | --- | --- |
| P4 | — | — | No P1–P3 findings; functional, SECUA, and architecture review PASS. |

#### Functional traceability

| Req | Status | Evidence |
| --- | --- | --- |
| R1 | MET | Plugin-keyed target paths are derived by `installManifestPath` (`packages/core/src/operations/install-manifest.ts:63`); install writes every target manifest through `writeInstallProvenance` (`apps/cli/src/commands/install.ts:1888`). Distinct target manifests and second-plugin preservation are tested at `apps/cli/tests/commands/install-manifest.test.ts:89` and `:134`. |
| R2 | MET | Schema v1 is explicit at `packages/core/src/operations/install-manifest.ts:41` and assembled from resolved install metadata at `apps/cli/src/commands/install.ts:1939`; schema round-trip/validation is tested at `packages/core/tests/operations/install-manifest.test.ts:203`. |
| R3 | MET | `snapshotFiles` enforces in-root regular-file snapshots (`packages/core/src/operations/install-manifest.ts:98`); reinstall inventory uses exact mapped skill names and plugin-scoped native roots (`apps/cli/src/commands/install.ts:1826`), then filters to the scope (`:1922`). Residual-proof stale/sibling exclusions are asserted at `apps/cli/tests/commands/install-manifest.test.ts:89` and `:398`. |
| R4 | MET | Per-file and canonical hashes reuse the ADR-031 primitives in `snapshotFiles` (`packages/core/src/operations/install-manifest.ts:114`); deterministic ordering/hash coverage is at `packages/core/tests/operations/install-manifest.test.ts:56` and `:79`. |
| R5 | MET | Safe target/plugin segments are required at `packages/core/src/operations/install-manifest.ts:63`; atomic sibling-temp replacement is at `:156`; empty installed inventory fails before success at `apps/cli/src/commands/install.ts:1933`. Invalid schema/path tests start at `packages/core/tests/operations/install-manifest.test.ts:203`. |
| R6 | MET | One source-resolution path supplies channel/version/locator (`apps/cli/src/commands/install.ts:1664`); the shared marketplace/plugin readers are at `:1683` and `:1704`; remote materialization records the resolved tree SHA in the manifest flow. Metadata branches are covered by install and provenance tests. |
| R7 | MET | The focused provenance suite covers multi-target/plugin, exact hashes, atomic replacement, dry-run/failure propagation, source metadata, remote SHA, and native isolation (`apps/cli/tests/commands/install-manifest.test.ts`; `packages/core/tests/operations/install-manifest.test.ts`). |

#### SECUA and architecture

- Trust boundaries reject unsafe registry identity and snapshot paths; symlinks/special files are excluded.
- Provenance remains one core DTO/read-write module plus the existing install orchestrator; no second install path or hash implementation was added.
- The public exports are grouped under Operations (`packages/core/src/index.ts:23`); the prior cosmetic P4 is closed.

Functional Verdict: PASS
### References
- Feature: `docs/features/B_skill-update-notification-install-manifest-and-update-verb.md`
- Decision: `docs/00_ADR.md` ADR-031, ADR-034, ADR-035
- Feature design: `docs/design/skill-update-notification.md`
- Install orchestration: `apps/cli/src/commands/install.ts`
- Marketplace resolution: `packages/core/src/marketplace.ts`
- Hash primitives: `packages/core/src/skills-ecosystem/locks.ts`
- Target path maps: `packages/core/src/targets.ts`
- Dependent consumer: task 0124
### History
- 2026-09-01T04:12:21.978Z todo → wip (system)
- 2026-09-01T04:47:59.942Z wip → testing (system)
- 2026-09-01T04:48:21.895Z testing → done (system)
