---
schema_version: 1
name: Stamp staged plugin scripts with version and per-file hashes
status: todo
template: standard
created_at: 2026-09-26T17:13:28.242Z
updated_at: "2026-09-27T04:57:47.155Z"

priority: P2
estimate_hours: 8
---

## 0149. Stamp staged plugin scripts with version and per-file hashes

### Background

`superskill install <plugin>` stages plugin scripts in `.agents/scripts/<plugin>/` for rulesync/Hermes-class targets, at the user home or project root. `executeInstall` calls `stagePluginScripts` once after mapping (`apps/cli/src/commands/install.ts:1249-1265, 1906-1933`). That function replaces the plugin subdirectory, copies mapped scripts, and writes no stamp. Native-only Claude/OMP/Grok installs do not stage this shared root. The mapper supplies the reported script count before staging (`packages/core/src/mapper.ts:289-295`).

`script path` searches project then global for **each requested file** and currently emits `{plugin, rel, path, source}` in JSON (`apps/cli/src/commands/script-path.ts`). Its `source` names the root that actually supplied that file. Per-target `InstallManifestV1` receipts already record source metadata and file hashes (`packages/core/src/operations/install-manifest.ts`), but they live under `.superskill/manifests/<target>/` and do not give a consumer of the shared script root one local version identity.

Spur task 0960 in `/Users/robin/xprojects/spur-new` proposes a run-scoped script-root digest and reports drift in a consumer's vendored scripts. It is a downstream consumer proposal, not implemented behavior or a dependency of this task. This task supplies optional on-disk version metadata; Spur can adopt it independently while retaining its own digest.

**Refine corrections (2026-09-27)**

- “Spur now resolves ... and records `script-root.json`” → task 0960 is still `backlog` and describes proposed behavior → describe it as a consumer proposal, with no implementation dependency.
- “Install provenance does not cover the shared scripts root” → non-native target receipts include staged script files through `listRegularFilesUnder` (`install.ts:1254-1265, 2467-2469`) → distinguish a target-scoped receipt from an adjacent root stamp; keep the new stamp in those receipts.
- “`script path` resolves a staged root” → it chooses a candidate separately for each `rel`, and a project root can lack that file while global has it → read metadata beside the returned file, never from an independently chosen root.
- “Write the stamp after `copyDirectory`” alone → the stamp must be excluded from its own hash map and the mapper's source-file count, and install needs one timestamp for both stamp and target receipts → freeze these rules in Design and Plan.
- “Update the script-staging design doc” → the authoritative CLI shape belongs in `docs/04_DESIGN.md` (project doc map); no dedicated staging design doc exists → update `04_DESIGN.md` with the command and stamp shape during implementation.

### Requirements

- [ ] R1. For an install that actually stages at least one plugin script, write `<scopeRoot>/.agents/scripts/<plugin>/.superskill-stamp.json` after copying, with `{schemaVersion:1, plugin, upstreamVersion, marketplaceLocator?, resolvedRef?, superskillVersion, installedAt, files:{<slash-relative-path>:<lowercase-sha256>}}`. Use the same resolved source metadata and single `installedAt` instant as target receipts. `files` covers every staged regular script file and excludes the stamp. No stamp or target writes on `--dry-run`; no shared-root stamp on native-only or no-scripts installs.
- [ ] R2. Successful `superskill script path <plugin> <rel> --json` adds `stamp: {upstreamVersion, resolvedRef?, installedAt} | null` from the root containing the returned file. Missing, unreadable, malformed, unsupported-schema, or wrong-plugin stamps yield `null` without changing the existing path, source, plain-output, or exit behavior.
- [ ] R3. Add `superskill script verify <plugin> [--project|--global] [--json]`. Without a scope flag, use the existing project scripts directory if present, else global; never merge the two roots. Compare the stamp's file map with current regular files under that selected root (excluding the stamp), reporting sorted `added`, `removed`, and `changed` relative paths. Exit 0 only on an exact match. Missing root/stamp or an invalid stamp is a nonzero diagnostic, including in JSON. Reject conflicting scope flags and unsafe plugin names as usage errors.
- [ ] R4. Reserve the root-level `.superskill-stamp.json` filename: do not count it as a script or hash it into `files`; `script path` cannot resolve it, including normalized `./` spellings. Reject a source script that would occupy this reserved path before replacing the installed plugin directory. Existing ordinary script paths remain resolvable.

Out of scope: stamping native host plugin trees, changing `script run` or script execution policy, replacing the per-target install manifest, and changing Spur task 0960.

### Acceptance Criteria

- [ ] AC1 — A project-scope marketplace install and a global-scope install with scripts each leave one valid stamp whose metadata equals that install's target receipt and whose hashes equal the staged file bytes; dry-run, native-only, and no-scripts installs leave no new stamp (req: R1).
- [ ] AC2 — When the project and global roots contain different versions of a script, `script path --json` reports metadata from the root supplying that file; a pre-stamp or malformed stamp reports `stamp: null`, while plain path output and exit codes remain unchanged (req: R2).
- [ ] AC3 — A fresh install verifies clean; editing, adding, and deleting one staged file produces the corresponding sorted `changed`, `added`, and `removed` entries with nonzero exit. Missing or invalid stamps and conflicting scope flags also exit nonzero; explicit scope never falls back (req: R3).
- [ ] AC4 — `script path sp .superskill-stamp.json` and `script path sp ./.superskill-stamp.json` fail to resolve; install's reported script count excludes the stamp, and a source collision fails before deleting the installed directory (req: R4).

### Q&A

<!-- CLOSED decisions from refinement: what was chosen and why, what was deferred and on what
     condition. Not a parking lot for open questions — an unanswered question here means the task
     is not ready to hand off. Keep empty if none. -->

#### Q&A entry — 2026-09-27T04:56:25.760Z

- **CLOSED — root choice.** `script path` keeps per-file project-first fallback. `script verify` chooses one complete tree, project first by directory existence unless a scope flag is supplied; a stamp-less project tree is an error rather than a silent global fallback. The JSON `source` identifies that chosen tree.
- **CLOSED — legacy and corrupt stamps.** `script path` remains usable and returns `stamp: null`; `script verify` fails with reinstall guidance because it cannot prove file integrity without a valid baseline.
- **CLOSED — hash inventory.** Hash regular staged files only, using the existing install snapshot SHA-256 implementation; sort paths for stable output. The stamp never hashes itself. Symlink additions are outside the staged regular-file inventory; a symlink replacing a stamped file appears as removed.
- **CLOSED — consumer handoff.** Spur 0960 remains independent. Its script-set digest remains useful even if it later reads `stamp.upstreamVersion`; no cross-repository edit or notification is required to complete 0149.

### Design

**WHAT / WHERE.** Add CLI-owned `apps/cli/src/commands/script-stamp.ts` for the schema-v1 DTO, stamp reader/writer, and regular-file snapshot comparison shared by install, path, and verify. Use `snapshotFiles` and `listRegularFilesUnder` from `@gobing-ai/superskill-core` (`packages/core/src/operations/install-manifest.ts`) rather than a second SHA-256 or walker. Keep the stamp schema distinct from `InstallManifestV1`: it is one shared script-root receipt, with no target or upstream snapshot. No new package or dependency.

**Install.** In `apps/cli/src/commands/install.ts`, compute `installedAt` once for the install and pass it to staging and `writeInstallProvenance`. Pass `PluginResolution` and `resolvedRef` to `stagePluginScripts`. If the mapped script count is zero, leave the shared root unstamped. Before its destructive replacement, reject a mapped root-level `.superskill-stamp.json` collision. After `copyDirectory` succeeds, snapshot the returned copied-file paths relative to the new plugin script root, then write the stamp. Keep the existing mapper-reported count for logging/return so the new file does not inflate it. The existing `listRegularFilesUnder` calls for per-target receipts will include the finished stamp; this is intentional. Dry-run and native-only gates stay in the existing caller.

**Path.** In `apps/cli/src/commands/script-path.ts`, reject a `rel` whose normalized path is exactly `.superskill-stamp.json` before candidate probing (including `./` forms), while preserving `assertScriptLocator` for normal paths and `script convert`. After `resolveScriptPath` returns a file, derive the root with the supplied `rel`, read only that root's stamp, and add the small metadata projection to JSON. The shared stamp reader validates schema version, plugin identity, required metadata, optional string fields, and a map of slash-relative script paths to 64-character lowercase SHA-256 strings. Reading errors return `null` for path; never treat an invalid stamp as an alternate root search signal.

**Verify.** Add `apps/cli/src/commands/script-verify.ts` and register it with the existing `script` command group in `apps/cli/src/cli.ts`. Reuse plugin-segment validation. `--project` and `--global` are mutually exclusive. Default root selection uses project directory existence first, then global; explicit selection has no fallback. For a valid stamp, take a fresh regular-file snapshot excluding only the root stamp and compare sorted relative path sets and SHA-256 values. Every verification JSON result has `{plugin, source, status, added, removed, changed}`; `source` is `project` or `global`, or `null` when neither default root exists. The arrays are empty on missing/invalid baseline. Status is `ok`, `drift`, `missing_root`, `missing_stamp`, or `invalid_stamp`; `ok` exits 0, drift/verification failures exit 2. Usage errors exit 1 with `{error:'invalid_args', message}` in JSON, matching `script path`. Human output names each differing path and gives reinstall guidance for absent/invalid stamps. `script path` JSON errors retain their existing shape.

**Constraints.** Do not infer version from a per-target receipt or a different root. Do not hash the stamp into itself, weaken `script path` fail-closed behavior for missing scripts, or stamp native-only installs. Keep `docs/04_DESIGN.md` in sync with the new command, output shapes, and stamp schema in the implementation commit. Relevant decisions: ADR-023 (shared script staging / path contract) and ADR-035 (install provenance); Spur 0960 is a consumer, not a dependency.

### Plan

- [ ] 1. Implement shared stamp schema/read/compare helper with the existing snapshot primitives; include validation of identity, metadata, file map, and reserved path (R1-R4).
- [ ] 2. Thread source metadata and one install timestamp into `stagePluginScripts`, preflight the reserved-name collision, write the stamp after copying, and retain the existing count and target receipt behavior (R1, R4).
- [ ] 3. Extend `script path` JSON using the resolved file's root, preserving plain output and path failure behavior; block the reserved stamp path (R2, R4).
- [ ] 4. Add and register `script verify` with explicit/default root selection, stable drift reports, JSON status, and exit codes (R3).
- [ ] 5. Add behavior tests in `apps/cli/tests/commands/install.integration.test.ts`, `install-manifest.test.ts`, `script-path.test.ts`, and new `script-verify.test.ts`: stamp metadata/hash/count and source collision; project/global per-file metadata and legacy/corrupt stamps; clean/drift/missing/invalid verification and scope behavior (AC1-AC4). Assert actual on-disk bytes and CLI output rather than mocking the stamp reader or snapshotter.
- [ ] 6. Update `docs/04_DESIGN.md` for command/JSON/schema and the existing script-staging paragraph. Run focused command tests, then `bun run lint`, `bun run test`, `bun run build`, `bun run spur-check`, and inspect intentional git status. The local `node_modules/.bin/biome` is pinned 2.4.16; use `bun run` scripts rather than the PATH `biome` 2.5.3.

### Solution

<!-- Filled during implementation: file:line change map and concise rationale. -->

### Testing

<!-- Filled during verification: commands run, outcomes, coverage claim or N/A. -->

### Review

<!-- Filled during review: P1-P4 findings, residual risk, and final disposition. -->

### References

<!-- Links to features, docs, ADRs, related tasks, or external references. -->

### History

- 2026-09-27T04:32:24.569Z backlog → todo (system)

