---
schema_version: 1
name: Stamp staged plugin scripts with version and per-file hashes
status: done
template: standard
created_at: 2026-09-26T17:13:28.242Z
updated_at: "2026-09-27T06:51:03.251Z"

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

- [x] R1. For an install that actually stages at least one plugin script, write `<scopeRoot>/.agents/scripts/<plugin>/.superskill-stamp.json` after copying, with `{schemaVersion:1, plugin, upstreamVersion, marketplaceLocator?, resolvedRef?, superskillVersion, installedAt, files:{<slash-relative-path>:<lowercase-sha256>}}`. Use the same resolved source metadata and single `installedAt` instant as target receipts. `files` covers every staged regular script file and excludes the stamp. No stamp or target writes on `--dry-run`; no shared-root stamp on native-only or no-scripts installs.
- [x] R2. Successful `superskill script path <plugin> <rel> --json` adds `stamp: {upstreamVersion, resolvedRef?, installedAt} | null` from the root containing the returned file. Missing, unreadable, malformed, unsupported-schema, or wrong-plugin stamps yield `null` without changing the existing path, source, plain-output, or exit behavior.
- [x] R3. Add `superskill script verify <plugin> [--project|--global] [--json]`. Without a scope flag, use the existing project scripts directory if present, else global; never merge the two roots. Compare the stamp's file map with current regular files under that selected root (excluding the stamp), reporting sorted `added`, `removed`, and `changed` relative paths. Exit 0 only on an exact match. Missing root/stamp or an invalid stamp is a nonzero diagnostic, including in JSON. Reject conflicting scope flags and unsafe plugin names as usage errors.
- [x] R4. Reserve the root-level `.superskill-stamp.json` filename: do not count it as a script or hash it into `files`; `script path` cannot resolve it, including normalized `./` spellings. Reject a source script that would occupy this reserved path before replacing the installed plugin directory. Existing ordinary script paths remain resolvable.

Out of scope: stamping native host plugin trees, changing `script run` or script execution policy, replacing the per-target install manifest, and changing Spur task 0960.

### Acceptance Criteria

- [x] AC1 — A project-scope marketplace install and a global-scope install with scripts each leave one valid stamp whose metadata equals that install's target receipt and whose hashes equal the staged file bytes; dry-run, native-only, and no-scripts installs leave no new stamp (req: R1).
- [x] AC2 — When the project and global roots contain different versions of a script, `script path --json` reports metadata from the root supplying that file; a pre-stamp or malformed stamp reports `stamp: null`, while plain path output and exit codes remain unchanged (req: R2).
- [x] AC3 — A fresh install verifies clean; editing, adding, and deleting one staged file produces the corresponding sorted `changed`, `added`, and `removed` entries with nonzero exit. Missing or invalid stamps and conflicting scope flags also exit nonzero; explicit scope never falls back (req: R3).
- [x] AC4 — `script path sp .superskill-stamp.json` and `script path sp ./.superskill-stamp.json` fail to resolve; install's reported script count excludes the stamp, and a source collision fails before deleting the installed directory (req: R4).

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

**WHAT / WHERE.** Add CLI-owned `apps/cli/src/script-stamp.ts` for the schema-v1 DTO, stamp reader/writer, and regular-file snapshot comparison shared by install, path, and verify. Use `snapshotFiles` and `listRegularFilesUnder` from `@gobing-ai/superskill-core` (`packages/core/src/operations/install-manifest.ts`) rather than a second SHA-256 or walker. Keep the stamp schema distinct from `InstallManifestV1`: it is one shared script-root receipt, with no target or upstream snapshot. No new package or dependency.

**Install.** In `apps/cli/src/commands/install.ts`, compute `installedAt` once for the install and pass it to staging and `writeInstallProvenance`. Pass `PluginResolution` and `resolvedRef` to `stagePluginScripts`. If the mapped script count is zero, leave the shared root unstamped. Before its destructive replacement, reject a mapped root-level `.superskill-stamp.json` collision. After `copyDirectory` succeeds, snapshot the returned copied-file paths relative to the new plugin script root, then write the stamp. Keep the existing mapper-reported count for logging/return so the new file does not inflate it. The existing `listRegularFilesUnder` calls for per-target receipts will include the finished stamp; this is intentional. Dry-run and native-only gates stay in the existing caller.

**Path.** In `apps/cli/src/commands/script-path.ts`, reject a `rel` whose normalized path is exactly `.superskill-stamp.json` before candidate probing (including `./` forms), while preserving `assertScriptLocator` for normal paths and `script convert`. After `resolveScriptPath` returns a file, derive the root with the supplied `rel`, read only that root's stamp, and add the small metadata projection to JSON. The shared stamp reader validates schema version, plugin identity, required metadata, optional string fields, and a map of slash-relative script paths to 64-character lowercase SHA-256 strings. Reading errors return `null` for path; never treat an invalid stamp as an alternate root search signal.

**Verify.** Add `apps/cli/src/commands/script-verify.ts` and register it with the existing `script` command group in `apps/cli/src/cli.ts`. Reuse plugin-segment validation. `--project` and `--global` are mutually exclusive. Default root selection uses project directory existence first, then global; explicit selection has no fallback. For a valid stamp, take a fresh regular-file snapshot excluding only the root stamp and compare sorted relative path sets and SHA-256 values. Every verification JSON result has `{plugin, source, status, added, removed, changed}`; `source` is `project` or `global`, or `null` when neither default root exists. The arrays are empty on missing/invalid baseline. Status is `ok`, `drift`, `missing_root`, `missing_stamp`, or `invalid_stamp`; `ok` exits 0, drift/verification failures exit 2. Usage errors exit 1 with `{error:'invalid_args', message}` in JSON, matching `script path`. Human output names each differing path and gives reinstall guidance for absent/invalid stamps. `script path` JSON errors retain their existing shape.

**Constraints.** Do not infer version from a per-target receipt or a different root. Do not hash the stamp into itself, weaken `script path` fail-closed behavior for missing scripts, or stamp native-only installs. Keep `docs/04_DESIGN.md` in sync with the new command, output shapes, and stamp schema in the implementation commit. Relevant decisions: ADR-023 (shared script staging / path contract) and ADR-035 (install provenance); Spur 0960 is a consumer, not a dependency.

### Plan

- [x] 1. Implement shared stamp schema/read/compare helper with the existing snapshot primitives; include validation of identity, metadata, file map, and reserved path (R1-R4).
- [x] 2. Thread source metadata and one install timestamp into `stagePluginScripts`, preflight the reserved-name collision, write the stamp after copying, and retain the existing count and target receipt behavior (R1, R4).
- [x] 3. Extend `script path` JSON using the resolved file's root, preserving plain output and path failure behavior; block the reserved stamp path (R2, R4).
- [x] 4. Add and register `script verify` with explicit/default root selection, stable drift reports, JSON status, and exit codes (R3).
- [x] 5. Add behavior tests in `apps/cli/tests/commands/install.integration.test.ts`, `install-manifest.test.ts`, `script-path.test.ts`, and new `script-verify.test.ts`: stamp metadata/hash/count and source collision; project/global per-file metadata and legacy/corrupt stamps; clean/drift/missing/invalid verification and scope behavior (AC1-AC4). Assert actual on-disk bytes and CLI output rather than mocking the stamp reader or snapshotter.
- [x] 6. Update `docs/04_DESIGN.md` for command/JSON/schema and the existing script-staging paragraph. Run focused command tests, then `bun run lint`, `bun run test`, `bun run build`, `bun run spur-check`, and inspect intentional git status. The local `node_modules/.bin/biome` is pinned 2.4.16; use `bun run` scripts rather than the PATH `biome` 2.5.3.

### Solution

Shared stamp schema/read/compare helper (new) — `SCRIPT_STAMP_FILENAME`, `ScriptStampV1`/`ScriptStampMetadata`/`ScriptStampRead`, atomic writer, validating reader, `snapshotScriptRootFiles` (single inventory definition shared by install and verify), `diffScriptFiles`.

| File | Change |
| --- | --- |
| `apps/cli/src/script-stamp.ts:20-71` | Reserved filename + DTOs + `scriptStampPath`/`isReservedStampRel` (R4) |
| `apps/cli/src/script-stamp.ts:82-158` | Atomic `writeScriptStamp` (sorted map, refuses an invalid body), validating `readScriptStamp` (missing vs invalid), `stampMetadata`, `snapshotScriptRootFiles` (excludes the stamp) |
| `apps/cli/src/script-stamp.ts:161-251` | `diffScriptFiles`/`isCleanDiff` + schema-1 validator (identity, metadata, slash-relative 64-hex file map, self-reference rejection) |
| `apps/cli/src/commands/install.ts:664,1258-1262,1304` | One `installedAt` per install, passed to staging and `writeInstallProvenance` so stamp metadata equals the target receipt (R1) |
| `apps/cli/src/commands/install.ts:1920-1975` | `stagePluginScripts` takes `PluginResolution`/`resolvedRef`/`installedAt`; reserved-name collision rejected before the destructive replace; stamp written only when a regular file was staged |
| `apps/cli/src/commands/script-path.ts:38-46,108-112,120-127` | `ResolvedScriptPath.root` recorded per candidate (never re-derived from the project root); reserved stamp name rejected as a usage error |
| `apps/cli/src/commands/script-path.ts:196-205` | JSON gains `stamp: {upstreamVersion, resolvedRef?, installedAt} | null` from the supplying root; plain output, path, source, and exit codes unchanged |
| `apps/cli/src/commands/script-verify.ts:24-121` | New `script verify`: scope selection (project-first by existence, explicit scope has no fallback), verification statuses, empty arrays without a valid baseline |
| `apps/cli/src/commands/script-verify.ts:131-209` | Action: usage errors exit 1 (conflicting scope flags, unsafe plugin name), `ok` exits 0, every other status exits 2, JSON result plus stderr diagnostics; the fresh snapshot is wrapped, so an unreadable staged file is the `unreadable` status (plus `error`) at exit 2 instead of an escaping filesystem error; `registerScriptVerify` |
| `apps/cli/src/cli.ts:11,34` | Register `script verify` with the existing `script` group |
| `apps/cli/tests/script-stamp.test.ts:65-197` | Stamp writer/reader/snapshot/diff/reserved-name unit tests |
| `apps/cli/tests/commands/script-verify.test.ts:101-338` | Clean/drift/missing/invalid verification, scope selection and fallback rules, usage errors, registration, and the unreadable-file regression (written to fail before the snapshot wrapper) |
| `apps/cli/tests/commands/script-path.test.ts:367-456` | Per-file root metadata, pre-stamp/malformed/wrong-plugin → `null`, plain output unchanged, reserved-name rejection |
| `apps/cli/tests/commands/install.integration.test.ts:963-1093` | Project/global stamp vs target receipt, staged-byte hashes, no stamp on dry-run/no-scripts/native-only, reserved-path collision before deletion, reported count excludes the stamp |
| `apps/cli/tests/commands/install-manifest.test.ts:166-195` | Receipt↔stamp shared instant/version; receipt inventories the stamp; stamp never hashes itself |
| `docs/help/how_to_organize_scripts_for_plugin_development.md:51,63-64` | Three `script-path.ts` citation ranges re-derived after the 0149 insert (`104-142`, `183-193`, `63-69`) — the 0148 R5/AC9 citation maintenance contract |
| `docs/04_DESIGN.md:242,253-255,308,322-341` | Same-change surface sync: `script` group signature, `script path --json` `stamp`, `script verify` flags/exit codes, stamp schema-1 table and rules |

Rationale: one shared SHA-256 inventory (`snapshotScriptRootFiles`) is used both when install writes the stamp and when `script verify` recomputes it, so "clean" cannot mean two different file sets. The stamp is metadata, not script content: it is excluded from its own map, from the mapper-reported script count, and from `script path` resolution.

### Testing

**Pipeline verify results**

- Verdict: PASS (from verdict artifact)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| R1 | MET | One `installedAt` per install (`apps/cli/src/commands/install.ts:664`) is threaded into staging (`:1258-1262`) and `writeInstallProvenance` (`:1304`), so the stamp and the target receipt share one instant; `stagePluginScripts` (`:1920-1975`) rejects a reserved-path source before the replace, returns on `--dry-run` before the copy (`:1949`), copies, then writes the stamp from `snapshotScriptRootFiles(dest)` only when a regular file was staged (`:1960-1972`), and returns the mapper count unchanged (`:1974`). Schema-1 validation at `apps/cli/src/script-stamp.ts:183-213`; the stamp is filtered out of its own map (`:151-158`). Real CLI (this stage): project install → stamp `upstreamVersion`/`marketplaceLocator`/`installedAt`/`superskillVersion` byte-equal to the codex receipt, `files` = independently recomputed SHA-256 of the staged bytes, stamp absent from its own map, receipt inventories the stamp, verbose count `staging 2 file(s)` vs 3 files on disk; global install → same equality under the global root; `--dry-run` → no stamp, no staged tree. Tests `apps/cli/tests/commands/install.integration.test.ts:967`, `:1014`, `:1036`, `:1058`, `:1187-1188`; `apps/cli/tests/commands/install-manifest.test.ts:166`. Boundary: F2 (deferred, below). |
| R2 | MET | The supplying root is recorded per candidate (`apps/cli/src/commands/script-path.ts:35-44`, `:117-127`) and the JSON metadata is read from that root, not re-derived (`:196-205`); `readScriptStamp` never throws for absent/unreadable/malformed/wrong-schema/wrong-plugin bodies (`apps/cli/src/script-stamp.ts:122-134`). Real CLI: project root 0.1.0 and global root 9.9.9 each reported from the file's own root; pre-stamp, malformed, schema-2, wrong-plugin, and chmod-000 stamps all gave `stamp: null` with path, `source`, and exit 0 unchanged; plain output stayed the bare path; `not_found` stayed exit 2. Tests `apps/cli/tests/commands/script-path.test.ts:367`, `:385`, `:404`, `:427`, `:440`. |
| R3 | MET | Registered with the shared `script` group (`apps/cli/src/cli.ts:11,34`; `apps/cli/src/commands/script-verify.ts:195-209`) and visible in the real `superskill script --help`. `selectScriptVerifyRoot` selects ONE tree — project by existence, else global, explicit scope with no fallback (`:71-85`) — and the diff is a fresh, stamp-excluding snapshot compared with sorted lists (`apps/cli/src/script-stamp.ts:161-177`). Exit mapping ok→0, drift/missing_root/missing_stamp/invalid_stamp/unreadable→2, usage→1 (`:131-189`). Real CLI reproduced every branch (see the AC3 block), including both no-fallback directions and per-path stderr. Tests `apps/cli/tests/commands/script-verify.test.ts:102`, `:123`, `:183`, `:222`, `:236`, `:289`. |
| R4 | MET | Single reserved constant (`apps/cli/src/script-stamp.ts:20`) with `./`, backslash, and nested-name normalization (`:69-73`); `resolveScriptPath` rejects the reserved name before any probing (`apps/cli/src/commands/script-path.ts:104-112`); the stamp is never in its own `files` map (`apps/cli/src/script-stamp.ts:151-158`, `:217`); install rejects a mapped root-level collision before the destructive replace (`apps/cli/src/commands/install.ts:1936` precedes the `rmSync` at `:1953-1955`) and the reported count stays the mapper count (`:1974`). Real CLI: `.superskill-stamp.json`, `./…`, and `././…` all exited 1 with `invalid_args` although the file exists at that path; the ordinary sibling and a nested same-basename file still resolved; a colliding install exited 1 with the previously installed file intact. Tests `apps/cli/tests/commands/script-path.test.ts:440`, `apps/cli/tests/commands/install.integration.test.ts:1073`, `apps/cli/tests/script-stamp.test.ts:190`. Platform boundary: F5 (accepted, below). |

| Acceptance Criteria | Status | Evidence Type | Evidence |
|---------------------|--------|---------------|----------|
| AC1 | MET | test | Exact identity: "AC1 — A project-scope marketplace install and a global-scope install with scripts each leave one valid stamp whose metadata equals that install's target receipt and whose hashes equal the staged file bytes; dry-run, native-only, and no-scripts installs leave no new stamp (req: R1)." Executable: `bun test` on the five focused suites → 115 pass / 0 fail / 372 expect() calls, re-run fresh by this stage; and a real CLI project install plus global install, where the stamp's `upstreamVersion`, `marketplaceLocator`, `installedAt`, `superskillVersion` matched the codex receipt exactly and `files` matched an independent `shasum -a 256` of the staged bytes (stamp absent from its own map, receipt inventories the stamp, verbose count `staging 2 file(s)` vs 3 files). Tests: `apps/cli/tests/commands/install.integration.test.ts:967` (project metadata/hashes/count/self-exclusion/receipt-includes-stamp), `:1014` (global), `:1036` (`--dry-run` leaves a pre-existing stamp byte-identical), `:1058` (no-scripts), `:1187` (native-only leaves no stamp; the gate `needsSharedScriptsRoot` at `apps/cli/src/commands/install.ts:1255-1258` is evaluated before any `dryRun` branch, so the clause is dry-run-independent). Shared instant/version: `apps/cli/tests/commands/install-manifest.test.ts:166`. |
| AC2 | MET | command | Exact identity: "AC2 — When the project and global roots contain different versions of a script, script path --json reports metadata from the root supplying that file; a pre-stamp or malformed stamp reports stamp: null, while plain path output and exit codes remain unchanged (req: R2)." Real CLI: with project root at 0.1.0 (helper hash cd76854e…) and global root at 9.9.9 (helper hash 07959886…) via `HOME_DIR`, `script path demo util/helper.js --json` reported `source: project` with `stamp.upstreamVersion 0.1.0`, and `--global` reported `source: global` with 9.9.9; plain output was the bare path at exit 0. Pre-stamp, malformed JSON, schemaVersion 2, wrong-plugin, and a chmod-000 stamp each returned `stamp: null` with path/source/exit 0 unchanged; `not_found` stayed exit 2. Supporting tests `apps/cli/tests/commands/script-path.test.ts:367` (skew), `:385` (global-only supply + `resolvedRef`), `:404` (pre-stamp/malformed/schema-2/wrong-plugin → null), `:427` (plain output unchanged), `:440` (reserved name). |
| AC3 | MET | command | Exact identity: "AC3 — A fresh install verifies clean; editing, adding, and deleting one staged file produces the corresponding sorted changed, added, and removed entries with nonzero exit. Missing or invalid stamps and conflicting scope flags also exit nonzero; explicit scope never falls back (req: R3)." Real CLI: fresh install → `{"status":"ok","added":[],"removed":[],"changed":[]}` exit 0 (human: "Script stamp verified: 'demo' (project)"); after one edit, two additions, one deletion → `{"status":"drift","added":["util/added.js","util/zz.js"],"removed":["top.js"],"changed":["util/helper.js"]}` exit 2 with per-path stderr and reinstall guidance; missing root / missing stamp / invalid stamp → exit 2 with the matching status; `--project --global` and an unsafe plugin name → `{"error":"invalid_args",…}` exit 1; explicit `--global` with an absent global root and explicit `--project` with an absent project root each reported `missing_root` for the requested scope (no cross-scope fallback). Supporting tests `apps/cli/tests/commands/script-verify.test.ts:102`, `:123`, `:151` (F1 regression), `:183`, `:222`, `:236`, `:256`, `:289`. |
| AC4 | MET | command | Exact identity: "AC4 — script path sp .superskill-stamp.json and script path sp ./.superskill-stamp.json fail to resolve; install's reported script count excludes the stamp, and a source collision fails before deleting the installed directory (req: R4)." Real CLI with the stamp physically present: `script path demo .superskill-stamp.json`, `./.superskill-stamp.json`, and `././.superskill-stamp.json` each exited 1 with `{"error":"invalid_args","message":"… reserved for install metadata."}`; the ordinary sibling `util/helper.js` still resolved at exit 0, and a nested `sub/.superskill-stamp.json` resolved (only the root name is reserved). A verbose install printed `staging 2 file(s)` while three files exist in the staged forest, so the reported count excludes the stamp. A marketplace shipping a root `.superskill-stamp.json` script exited 1 with `Plugin 'demo' ships a script at the reserved stamp path …` and the previously installed `.agents/scripts/demo/installed.js` still present and unmodified. Supporting tests `apps/cli/tests/commands/script-path.test.ts:440`, `apps/cli/tests/commands/install.integration.test.ts:1073`, `apps/cli/tests/script-stamp.test.ts:190`. |
- Coverage: N/A (verdict-based; verify pipeline does not measure code coverage)

### Review

#### Review Report — 0149 (second pass, revised digest)

**Scope:** the uncommitted working-tree diff on `sp/run-0149-198f` at `af67637` — `apps/cli/src/script-stamp.ts` (new), `apps/cli/src/commands/script-verify.ts` (new), `apps/cli/src/cli.ts`, `apps/cli/src/commands/{install,script-path}.ts`, five test files, `docs/04_DESIGN.md`, `docs/help/how_to_organize_scripts_for_plugin_development.md`, and the task file.
**Pass:** re-review of the revision produced by the bounded `test-fix` remediation hop (the F1 snapshot wrapper and its regression test, the F3/F4/F11 documentation corrections, and the 14 checked boxes). The findings table below is the first pass's table with every `Location` and `Finding` cell copied byte-identical — only `Disposition` changed, plus two new P4 rows — so residual-ledger identities are stable (`review-finding:516654c2` still resolves to F2). The quality gate is green on digest `sha256:77d6e606407e03807d4a7281439d25eaaf29635e87bdd835037a395c5533ddda` (taken as given, not re-run); the five focused suites were re-run here (**115 pass / 0 fail / 372 expect() calls**) and every AC was re-reproduced through the real CLI.
**Dimensions:** functional traceability, SECUA (Security, Efficiency, Correctness, Usability, Architecture), architecture depth.
**Verdict:** PASS — no P1 (blocker) and no P2 (major). Four P3 (minor) and nine P4 (advisory); none invalidates a requirement or an acceptance criterion. The F1 fix is real — it closes the defect, and its regression test genuinely fails without it.

##### Findings (ranked)

| Priority | Dimension | Location | Finding | Disposition |
| --- | --- | --- | --- | --- |
| P3 (minor) | correctness / usability | `apps/cli/src/commands/script-verify.ts:129` | F1 — a filesystem read error inside the fresh snapshot escapes the action: `snapshotScriptRootFiles(root)` (`:99`) sits outside any `try`, so an unreadable staged file (`EACCES`) throws from `packages/core/src/operations/install-manifest.ts:121` via `apps/cli/src/script-stamp.ts:157`, and `runScriptVerifyAction` wraps only argument validation (`:118-127`). Observed: stack trace, **no** `--json` result, exit 1 (the usage-error code) instead of a documented status / exit 2. `script path` is robust on the same input (its stderr/`readScriptStamp` path swallows read errors, `apps/cli/src/script-stamp.ts:122-134`). | RESOLVED — the fresh snapshot is wrapped in `verifyScriptStamp`; a read failure returns `status: unreadable` with the filesystem message and exit 2. Re-verified end-to-end in this pass (real CLI: `{"status":"unreadable","error":"EACCES…"}`, exit 2, JSON on stdout) and the regression test genuinely fails without the wrapper (its `exits` list is empty when the throw escapes). |
| P3 (minor) | correctness | `apps/cli/src/script-stamp.ts:151-158` | F2 — the stamp inventory is the walker's, not the copier's: `listRegularFilesUnder` skips `.git`, `node_modules`, `.rulesync`, `.targets` (`packages/core/src/operations/install-manifest.ts:17`) while staging copies them (`apps/cli/src/commands/install.ts:2414-2436`) and the mapper's count includes them (`packages/core/src/mapper.ts:477-495`). For a plugin shipping `scripts/node_modules/**`, R1's "covers every staged regular script file" is not literally met and drift there is invisible to verify (same walker ⇒ `ok`). The helper's TSDoc (`:145-150`) omits the walker's directory skips. | DEFER — The stamp deliberately shares `snapshotScriptRootFiles`' walker with the existing per-target receipt inventory (both skip `.git`, `node_modules`, `.rulesync`, `.targets`), so widening it would change `InstallManifestV1` behaviour outside 0149's scope; revisit if an in-repo plugin stages a `scripts/` tree containing one of those directory names. |
| P3 (minor) | documentation | `docs/04_DESIGN.md:326` | F3 — the authoritative surface doc names a module that does not exist (`apps/cli/src/commands/script-stamp.ts`); the file is `apps/cli/src/script-stamp.ts`. The task's `Design` (`:62`) still says `commands/` while its `Solution` (`:87-89`) says `src/` — a contradiction left in the doc pair. | RESOLVED — `docs/04_DESIGN.md:326` and the task `### Design` both now name `apps/cli/src/script-stamp.ts`; re-verified in this pass. |
| P3 (minor) | documentation | `docs/help/how_to_organize_scripts_for_plugin_development.md:51` | F4 — 0149 inserted 16 lines above `resolveScriptPath`, so three citations in the scripts guide are stale: `:51` cites `script-path.ts:88-123` (actual `apps/cli/src/commands/script-path.ts:104-142`), `:63` cites `script-path.ts:164-174` (actual `apps/cli/src/commands/script-path.ts:183-193`), `:64` cites `script-path.ts:47-53` (actual `apps/cli/src/commands/script-path.ts:63-69`). Task 0148 R5/AC9 established these citations as a maintenance contract. | RESOLVED — the three citations now read `script-path.ts:104-142`, `:183-193`, and `:63-69`; re-derived and re-verified against `apps/cli/src/commands/script-path.ts` (`resolveScriptPath` opens at 104, closes at 142; the `if (!result)` not-found block spans 183-193; `isUnsafeRel` spans 63-69). |
| P4 (advisory) | security | `apps/cli/src/script-stamp.ts:69-73` | F5 — on a case-insensitive filesystem a case variant defeats the reservation: `script path cc .SUPERSKILL-STAMP.JSON --json` exits 0 and returns the stamp path (reproduced on APFS), while `install`'s collision check does catch the variant (`existsSync`, `apps/cli/src/commands/install.ts:1936`) — the two guards disagree. Not an AC failure (R4 names the literal name and `./` spellings). | accepted residual — re-reproduced in this pass on APFS: `script path cc .SUPERSKILL-STAMP.JSON --json` exits 0 with the stamp path. |
| P4 (advisory) | correctness | `apps/cli/src/script-stamp.ts:215-225` | F6 — `validateFileMap` assigns into a plain object, so a `__proto__` key from a hand-written stamp is silently dropped and the stamp is accepted with that entry missing, while `sortFileMap` (`:235-239`, `Object.fromEntries`) preserves it — a write/read asymmetry. Verified directly (`f['__proto__']='x'` ⇒ `Object.keys(f)===[]`; `Object.fromEntries` keeps it). Unreachable from install. | accepted residual — re-reproduced in this pass (`f['__proto__']='x'` ⇒ `Object.keys(f)===[]`; `Object.fromEntries` keeps it). Unreachable from install. |
| P4 (advisory) | architecture | `apps/cli/src/commands/install.ts:1265` | F7 — two inventories of the same script root coexist: the stamp's map (excludes the stamp) and the receipt's (`listRegularFilesUnder(scriptDest)` → `snapshotFiles`, includes the finished stamp). AC1 depends on them agreeing; only tests enforce it. | accepted — the design declares the receipt-includes-stamp behavior intentional; AC1 depends on the two inventories agreeing and only tests enforce it. |
| P4 (advisory) | verification strength | `apps/cli/tests/commands/install.integration.test.ts:1161` | F8 — AC1's "native-only leaves no stamp" is exercised only under `--dry-run`; the gate (`needsSharedScriptsRoot`) is dry-run-independent so the claim holds, but the real path is not executed. | accepted residual — the gate (`needsSharedScriptsRoot`) is dry-run-independent, so the claim holds; the real non-dry-run native path is still not executed by a test. |
| P4 (advisory) | behavior note | `apps/cli/src/commands/install.ts:1936` | F9 — the reserved-path collision check runs before the `--dry-run` early return (`:1949`), so dry-run now throws where it previously continued. Justified (a preview should surface the same rejection), but it is behavior beyond R4's literal "before replacing the installed plugin directory". | accepted — a preview should surface the same rejection as an apply; behaviour beyond R4's literal wording. |
| P4 (advisory) | architecture | `apps/cli/src/commands/script-verify.ts:6` | F10 — `script verify` imports `resolveHomeDir` from `./install`, coupling a read-only verifier to the install command module graph; matches the existing `script-path.ts:15` import, so conformance wins. | accepted — `script-path.ts:15` already imports `resolveHomeDir` from `./install`; conformance wins. |
| P4 (advisory) | documentation | `apps/cli/src/commands/script-verify.ts:111-187` (Solution row) | F11 — `spur task check 0149 --json` reports `L4.stale-line-anchor`: "`apps/cli/src/commands/script-verify.ts:111-187` — line 111-187 outside file (185 lines)". Action + registration span `:111-184`; warning-level (`pass: true`). | RESOLVED — the Solution row now reads `apps/cli/src/commands/script-verify.ts:131-209` (file is 209 lines); `spur task check 0149 --json` is clean apart from the pre-existing `L4.missing-feature-id` warning. |
| P4 (advisory) | test hygiene | `apps/cli/tests/commands/script-verify.test.ts:263` | F12 — one test calls `setup()` twice ("an explicit scope never falls back to the other root" calls it again for `emptyProject` at `:263`), and `setup()` assigns the module-level `tmpDir`; the first sandbox is orphaned and `afterEach` removes only the second. Reproduced: `bun test apps/cli/tests/commands/script-verify.test.ts` leaks exactly one `superskill-script-verify-*` directory into the cwd on every run (relative `mkdtempSync` prefix — the same pattern `script-path.test.ts` uses — so the leak lands in the repo root, git-hidden only because every child lives under a `.agents/` path). | accepted residual — test-only; no product surface is affected, and the `mkdtempSync` prefix style is the file-local convention. |
| P4 (advisory) | consistency | `apps/cli/src/commands/script-convert.ts:140` | F13 — adding `verify` to the `script` group left one sibling fallback description stale: `script-convert.ts:140` still creates the group as "Plugin script utilities (run, path, convert)". Unreachable in the real CLI (createProgram registers `script run` first, so the group always pre-exists with its own description); it only diverges if `registerScriptConvert` is exercised on a bare program. | accepted residual — cosmetic and unreachable from `createProgram`. |

##### Functional Traceability (R1–R4)

- **R1 — MET.** `stagePluginScripts` takes `{resolution, resolvedRef, installedAt}` (`apps/cli/src/commands/install.ts:1920-1929`); one `installedAt` per install (`:664`) feeds both staging (`:1258-1262`) and `writeInstallProvenance` (`:1304`); the stamp is written after the copy from `snapshotScriptRootFiles(dest)` (`:1959-1972`) with schema-1 fields validated at `apps/cli/src/script-stamp.ts:183-213`; the stamp is excluded from its own map (`apps/cli/src/script-stamp.ts:154-155`, `:219`) and never inflates the returned mapper count (`apps/cli/src/commands/install.ts:1974`); zero-regular-file staging writes nothing (`:1960`); `--dry-run` returns before the copy (`:1949`); native-only targets never call staging (`:1256-1258`). Boundary recorded as F2.
- **R2 — MET.** The supplying root is recorded per candidate (`apps/cli/src/commands/script-path.ts:35-44`, `:117-127`) and the JSON metadata is read from *that* root (`:200-203`); `readScriptStamp` returns `missing`/`invalid` without throwing for absent, unreadable, malformed, wrong-schema, and wrong-plugin bodies (`apps/cli/src/script-stamp.ts:122-134`, `:183-213`) and the action collapses both to `stamp: null` with path, source, plain output, and exit codes unchanged (`apps/cli/src/commands/script-path.ts:195-205`).
- **R3 — MET.** `script verify <plugin> [--project|--global] [--json]` is registered with the shared `script` group (`apps/cli/src/commands/script-verify.ts:195-209`, `apps/cli/src/cli.ts:11,34`). Selection is one complete tree — project first by directory existence, else global, explicit scope with no fallback (`apps/cli/src/commands/script-verify.ts:71-79`); drift is a fresh, stamp-excluding snapshot compared with sorted lists (`apps/cli/src/script-stamp.ts:161-177`); `ok` → 0, `drift`/`missing_root`/`missing_stamp`/`invalid_stamp`/`unreadable` → 2, usage → 1 (`apps/cli/src/commands/script-verify.ts:131-189`). The F1 read-failure wrapper (`:107-119`) keeps a filesystem error inside that contract, so the error-surface caveat the first pass recorded is closed.
- **R4 — MET.** Single reserved filename constant (`apps/cli/src/script-stamp.ts:20`); the stamp is never hashed into `files` (`:154-155`, `:219`); `script path` rejects the reserved name — including `./` spellings — before any probing (`apps/cli/src/commands/script-path.ts:108-112`, `apps/cli/src/script-stamp.ts:69-73`); install rejects a mapped root-level collision before the destructive replace (`apps/cli/src/commands/install.ts:1936` before `:1953-1955`); ordinary paths stay resolvable (`apps/cli/tests/commands/script-path.test.ts:440-455`). Platform boundary recorded as F5.

##### AC Verdicts (AC1–AC4)

- **AC1 — MET.** Project scope: the stamp's `upstreamVersion`/`marketplaceLocator`/`installedAt` equal `readInstallManifest(...)`'s, `files` equals the SHA-256 of the staged bytes, the stamp is absent from its own map, the count stays the mapper count, and the target receipt does include the finished stamp (`apps/cli/tests/commands/install.integration.test.ts:967-1012`); global scope (`:1014-1034`); shared instant/version (`apps/cli/tests/commands/install-manifest.test.ts:166-195`); no new stamp under `--dry-run` (sentinel byte-identical, `:1036-1056`), no-scripts (`:1058-1071`), native-only (`:1187-1188`).
- **AC2 — MET.** Project/global version skew reports the supplying root's metadata only (`apps/cli/tests/commands/script-path.test.ts:367-383`), global-only supply with `resolvedRef` (`:385-402`), pre-stamp/malformed/schema-2/wrong-plugin → `stamp: null` with path+source+exit unchanged (`:404-425`), plain output unchanged (`:427-437`); re-reproduced on the real CLI (`--project` reported `1.2.3`, `--global` reported `9.9.9`).
- **AC3 — MET.** Clean → `ok`, exit 0, empty arrays, human line (`apps/cli/tests/commands/script-verify.test.ts:102-121`); edit+add+delete → sorted `changed`/`added`/`removed` with exit 2 and per-path stderr (`:123-149`); missing root/missing stamp/invalid stamp → exit 2 with the right status (`:183-220`); stamp-less project tree does not fall back to a clean global tree (`:222-234`); explicit scope never falls back (`:236-273`); conflicting flags and unsafe plugin names → exit 1 with `{error:'invalid_args', message}` (`:289-317`); the wrapped-snapshot regression (`:151-181`); re-reproduced on the real CLI (`ok` 0 / `drift` 2 / conflicting flags 1 / `unreadable` 2).
- **AC4 — MET.** `script path cc .superskill-stamp.json` and its `./` / `././` spellings exit 1 with `error:'invalid_args'` although the file physically exists at that path, while ordinary siblings still resolve (`apps/cli/tests/commands/script-path.test.ts:440-455`); re-reproduced on the real CLI. The reported count stays the mapper count (`apps/cli/tests/commands/install.integration.test.ts:1008`, code `apps/cli/src/commands/install.ts:1974`); a source collision fails before deletion with the previously installed file intact (`apps/cli/tests/commands/install.integration.test.ts:1073-1092`, code `apps/cli/src/commands/install.ts:1936` before `:1953`).

##### Architecture Depth

One shared inventory (`snapshotScriptRootFiles`, `apps/cli/src/script-stamp.ts:151-158`) defines the staged file set for both the stamp write and verification, so "clean" cannot mean two file sets; no SHA-256 or walker is re-implemented. Command modules stay thin (`script-verify.ts` splits types → selection → verification → action → registration; the new `unreadable` status is one wrapped branch, not a second code path). No boundary crosses: both consumers are CLI-local, `packages/core` gained nothing, no new dependency or process. Residual duplication noted in F7; coupling noted in F10; the read-only verifier still shares the install module's `resolveHomeDir` (F10).

**Deviation (i) — helper at `apps/cli/src/script-stamp.ts` rather than `apps/cli/src/commands/` — justified.** `.spur/rules/surface/check-cli-surface.yaml:8-13,24-33` requires every `apps/cli/src/commands/*.ts` to export `export function register\w+(`; a helper there fails the pre-check unless a third exclusion entry is added. The chosen placement keeps command files homogeneous and avoids a gate edit. Cleanup owed at first pass (F3) is now done.

**Deviation (ii) — the stamp is written from `snapshotScriptRootFiles(dest)` instead of `copyDirectory`'s copied-path list — justified, and better than the literal design text.** `copyDirectory` does return written paths (`apps/cli/src/commands/install.ts:2414-2436`), but that list and verify's walker are different file-set definitions (the walker skips `.git`/`node_modules`/`.rulesync`/`.targets`, `packages/core/src/operations/install-manifest.ts:17,84-102`, while `copyDirectory` skips only symlinks), so a copied-path baseline would report permanent false `drift` for such trees. Sharing the snapshot makes install and verify agree by construction, matching the design's own rationale. Its cost is F2.

##### Residual Risk

Remediated by the `test-fix` hop and re-verified here: F1 (verify's raw-error surface → the wrapped snapshot, the `unreadable` status plus `error`, and a regression test that fails without it) and F3/F4/F11 (documentation drift: module path, three stale citations, out-of-range Solution anchor — `spur task check 0149 --json` is now clean apart from the pre-existing warning-level `L4.missing-feature-id`). Deferred with a ledger entry: F2 (the walker's `.git`/`node_modules`/`.rulesync`/`.targets` skip list is outside the integrity baseline) — `.spur/run/0149-residual-deferrals.json`, id `review-finding:516654c2`. Still accepted: F5 (case-insensitive-FS bypass), F6 (`__proto__` asymmetry), F7/F8, F9/F10, F12 (test-only temp-dir leak), F13 (unreachable stale fallback description), plus the pre-existing shape that staging precedes provenance (a fresh stamp can outlive a failed provenance write). Nothing here blocks `wip → testing` or the `verify` stage.

##### Verification Evidence (second pass)

```
$ bun test apps/cli/tests/script-stamp.test.ts apps/cli/tests/commands/script-verify.test.ts \
        apps/cli/tests/commands/script-path.test.ts apps/cli/tests/commands/install-manifest.test.ts \
        apps/cli/tests/commands/install.integration.test.ts
  115 pass / 0 fail / 372 expect() calls — Ran 115 tests across 5 files.

# F1 mechanism (non-root shell, uid 501): the walker includes a 0o000 file and the snapshot throws,
$ bun -e "… listRegularFilesUnder(root) ⊇ b.js ; snapshotFiles(...)" →
  THREW: EACCES - permission denied, open '…/util/b.js'
# ⇒ without the wrapper the throw escapes verifyScriptStamp → runScriptVerifyAction → the test's
#   exitFn is never called, `exits` is `[]`, and `expect(json.exits).toEqual([2])` fails.

# F1 fix, real CLI (sandbox project root, HOME_DIR=<sandbox>/home, locked.js chmod 000)
$ script verify cc --json
  {"plugin":"cc","source":"project","status":"unreadable","added":[],"removed":[],"changed":[],
   "error":"EACCES: permission denied, open '…/cc/locked.js'"}                            exit=2
  stderr: "Script verification failed for 'cc': staged script files could not be read (project scope)."
          "  EACCES: permission denied, open '…/cc/locked.js'"
          "Fix the unreadable staged file, or reinstall: superskill install cc"
# human mode: same diagnostics on stderr, exit 2, nothing on stdout.

# AC re-repro (same sandbox)
$ script verify cc --json                       → status ok, exit 0
$ script verify cc --json  (a.js edited, zz.js added)
  {"status":"drift","added":["zz.js"],"removed":[],"changed":["a.js"]} + per-path stderr  exit=2
$ script verify cc --project --global --json    → {"error":"invalid_args", …}            exit=1
$ script path cc a.js --json                    → stamp.upstreamVersion 1.2.3 (project)  exit=0
$ script path cc a.js --global --json           → stamp.upstreamVersion 9.9.9 (global)   exit=0
$ script path cc ./.superskill-stamp.json --json→ {"error":"invalid_args","message":"… reserved
                                                  for install metadata."}                 exit=1
# F5 re-reproduced: script path cc .SUPERSKILL-STAMP.JSON --json → the stamp path, exit 0.
# F6 re-reproduced: plain assign of '__proto__' ⇒ Object.keys [] ; Object.fromEntries keeps it.

$ spur task check 0149 --json                   → pass: true (only L4.missing-feature-id, warning)
$ grep -c '^- \[ \]' docs/tasks/0149_…md        → 0   (grep -c '^- \[x\]' → 14)
```

The project gate (`bun run spur-check`, 2529 pass / 0 fail, digest `sha256:77d6e606…`) was taken as given per the handoff and not re-run; the focused suites and the CLI reproductions above were run independently in this pass and agree.

Functional Verdict: PASS

### References

<!-- Links to features, docs, ADRs, related tasks, or external references. -->

### History

- 2026-09-27T04:32:24.569Z backlog → todo (system)
- 2026-09-27T06:13:54.080Z todo → wip (system)
- 2026-09-27T06:50:45.145Z wip → testing (system)
- 2026-09-27T06:51:03.251Z testing → done (system)

