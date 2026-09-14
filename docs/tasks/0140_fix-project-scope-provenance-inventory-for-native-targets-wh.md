---
schema_version: 1
name: Fix project-scope provenance inventory for native targets whose plugin content lives under $HOME
status: todo
template: issue
created_at: 2026-09-14T01:48:19.623Z
updated_at: "2026-09-14T04:37:27.259Z"

feature_id: G1
---

## 0140. Fix project-scope provenance inventory for native targets whose plugin content lives under $HOME

### Background

Surfaced while verifying task 0139 (remote marketplace materialization) with an isolated HOME.

Repro (symlink-free HOME, project scope):

```bash
cd <scratch-project>
HOME=<scratch-home> bun run apps/cli/src/index.ts install understand-anything \
  --marketplace Egonex-AI/Understand-Anything --no-global
# ... claude plugin install reports success ...
# Error: Install provenance inventory did not resolve any installed files for plugin 'understand-anything' target 'claude'
```

Global scope (no `--no-global`) is unaffected in the symlink-free repro.

**Prior art.** Task 0123 introduced the manifest (R3: slash-normalized paths relative to `scopeRoot`; R5: an empty inventory fails the install). Its bug-057 fix made `writeInstallProvenance` drop out-of-scope receipt paths, so a project install with *some* in-scope native dests stopped crashing with `escapes scope root`. That left the case where *every* receipt is out of scope.

**Premise checks at refine (2026-09-13), against the current tree:**

- Claude receipt paths are **constructed** by superskill (`join(resolveHomeDir(), '.claude', 'plugins', 'cache', <marketplace>, <plugin>)`), not reported by the host, so they are never realpath-distinct from `resolveHomeDir()`. Only **host-reported** paths can come back realpath'd: OMP `installPath` from `installed_plugins.json` (`resolveOmpInstallPath`) and Grok `path` from `grok plugin list --json` (`resolveGrokInstallPath`). The masking variant applies to those, or to a symlinked `outputRoot` / `HOME_DIR`; it does not apply to claude on its own.
- Nothing in `apps/cli/src` or `packages/core/src` reads `manifest.installed.files` back; `update` compares version plus the `upstream` snapshot. Changing how the installed snapshot is rooted touches the writer and the validator, not `update`.
- `validateSnapshot` (`packages/core/src/operations/install-manifest.ts`) rejects absolute keys and `..` segments on read. Writing absolute host paths into `installed.files` would make those manifests unreadable.
- `apps/cli/tests/commands/install-manifest.test.ts` › `drops out-of-scope HOME claude cache files and still writes an in-scope manifest` locks the mixed case: when in-scope dests exist, HOME cache paths are excluded. The fix must keep it green, unedited.

### Requirements

- [ ] R1. A non-dry-run project-scope install (`--no-global`, or an `outputRoot` other than home) of a native target (`claude`, `omp`, `grok`) whose host install tree lives under the user home writes a readable manifest at the existing project path `<scopeRoot>/.superskill/manifests/<target>/<plugin>/.superskill-manifest.json` with a non-empty `installed` snapshot, instead of throwing `Install provenance inventory did not resolve any installed files …`.
- [ ] R2. That snapshot's keys are slash-normalized paths relative to the user home, and the manifest says so with the optional schema-v1 field `installedRoot: 'home'`. A manifest without the field keeps meaning "relative to scopeRoot". The reader accepts the field only with the value `'home'`.
- [ ] R3. Scope membership is decided on realpath-normalized paths. Receipt paths, `scopeRoot`, and home are each `realpathSync`'d before the `relative()` test and before snapshotting, so a symlinked `outputRoot` / `HOME_DIR` versus a host-reported realpath (for example `/var/…` vs `/private/var/…`) cannot empty the inventory at either scope.
- [ ] R4. Precedence is deterministic. A non-empty scope-root inventory keeps today's behaviour exactly: scopeRoot-relative keys, no `installedRoot`, home paths dropped. The home-rooted snapshot applies only when the scope-root inventory is empty **and** the target is `claude`, `omp`, or `grok`. When both are empty, the existing error is thrown and no manifest is written (task 0123 R5 unchanged).
- [ ] R5. Global-scope manifests are unchanged (scopeRoot is home, so `installedRoot` is never emitted), and every existing provenance test passes without edits.

**Out of scope / non-goals**

- Writing a manifest under `$HOME/.superskill/manifests` for a project-scope install.
- Changes to `update` / reconcile logic, `snapshotFiles`, `validateSnapshot`, or the `toSlashRel` escape guard.
- Recording receipt paths outside both scopeRoot and home.
- Changing receipt collection in the dispatch blocks (`addReceiptFiles` call sites), or the `grok-bot` Sand-root manifest (ADR-036).
- Bumping `schemaVersion`.

### Acceptance Criteria

- **AC1 (manual E2E — R1)** — Given an isolated symlink-free HOME, a scratch project dir, task 0139 landed, and working claude/grok/omp CLIs, when `superskill install understand-anything --marketplace Egonex-AI/Understand-Anything --no-global` runs, then it exits 0 and each native target's project manifest has `"installedRoot": "home"` and a non-empty `installed.files`.
- **AC2 (automated — R1, R2, R4)** — Given `HOME_DIR` = a temp home, `outputRoot` = a separate temp workspace, target `claude`, and a stubbed `runClaudeInstall` that writes only `<home>/.claude/plugins/cache/superskill/demo/plugin.json`, when `executeInstall` runs with `global: false`, then the workspace manifest has `installedRoot === 'home'` and `installed.files['.claude/plugins/cache/superskill/demo/plugin.json']` equals that file's SHA-256.
- **AC3 (automated — R3)** — Given `HOME_DIR` is a symlink to a real temp home, target `grok`, a stubbed `runGrokInstall` that creates files under `<realHome>/.grok/installed-plugins/demo/`, and an injected `processExecutor` whose `grok plugin list --json` returns `[{"name":"demo","path":"<realpath of that dir>","status":"installed"}]`, when `executeInstall` runs at project scope, then the manifest records those files as `.grok/installed-plugins/demo/…` keys with `installedRoot === 'home'`.
- **AC4 (automated — R4)** — `fails the install when a requested target has no installed files` (target `codex`) still throws and writes no manifest; and a new `claude` case with no receipt file under either scopeRoot or home throws the same `did not resolve any installed files` error and writes no manifest.
- **AC5 (automated — R2)** — In `packages/core/tests/operations/install-manifest.test.ts`, a manifest with `installedRoot: 'home'` round-trips through `writeInstallManifest` / `readInstallManifest`; any other `installedRoot` value (e.g. `'/etc'`) is rejected; a manifest without the field still validates.
- **AC6 (no regression — R5)** — `drops out-of-scope HOME claude cache files and still writes an in-scope manifest` and every other existing case in `apps/cli/tests/commands/install-manifest.test.ts` pass unedited; `bun run lint`, `bun run test`, and `bun run build` are green with no skipped tests.

### Q&A

- **Where project-scope native files are recorded (closed; was Plan step 1):** in the same project manifest, with keys relative to home and the manifest flagged `installedRoot: 'home'`. Rejected alternatives, with evidence:
  - Absolute keys in `installed.files`: rejected on read by `validateSnapshot`, and a break of task 0123 R3's relative-path invariant.
  - A user-scope manifest under `$HOME/.superskill/manifests`: a project install would overwrite a real global install's manifest for the same plugin/target, and `update --no-global` (which reads project manifests only) would never see it.
  - The chosen additive optional schema-v1 field follows ADR-035's `grokBot` exception (task 0128) and keeps legacy manifests readable. A symbolic `'home'` token, rather than an absolute path, keeps machine-specific roots out of the manifest and gives a tampered manifest nothing arbitrary to point at.
- **Mixed case (closed):** scopeRoot wins whenever it yields at least one file. That preserves bug-057 behaviour and its test. One snapshot never mixes two roots.
- **Target gating (closed):** the home fallback applies only to `claude` / `omp` / `grok`, the only dispatchers whose host installers write outside `outputRoot` at project scope. Use the inline predicate style already in `install.ts` (`target === 'claude' || target === 'omp' || target === 'grok'`); no new exported constant.
- **Docs (closed):** ADR-035 gets a dated exception paragraph in the task-0128 style, and the `docs/04_DESIGN.md` manifest-schema sentence lists the optional field. Both land in the same commit as the code.
- **Future `installed.files` consumers (deferred):** owner is whichever task first reads `installed.files` back. That consumer must resolve `installedRoot: 'home'` via `resolveHomeDir()` and validate the path against the expected native plugin root before any read-for-delete or prune (see the `.spur/context/pitfalls.md` provenance-ownership entry).

### Design

**WHAT** — When a project-scope install leaves a native target with no in-scope files, let `writeInstallProvenance` snapshot that target's home-rooted host install tree and mark the snapshot with an additive schema-v1 field. Realpath-normalize the scope test.

**WHY** — Native host CLIs place plugin content under the user home even at project scope. The bug-057 guard (drop out-of-scope receipts) is right for the mixed case, but it empties the inventory when every receipt is home-rooted, failing an install whose host step already succeeded. See Q&A for the rejected alternatives.

**WHERE**

- `packages/core/src/operations/install-manifest.ts`:
  - `InstallManifestV1.installedRoot?: 'home'`, with TSDoc: "`installed.files` keys are relative to the user home instead of the manifest scope root (task 0140: native host trees at project scope)."
  - `validateInstallManifest` accepts `undefined` or `'home'`, otherwise throws `Install manifest installedRoot must be home: <label>`, and preserves the field in its returned object (same spread pattern as `grokBot`).
  - `snapshotFiles`, `toSlashRel`, `validateSnapshot`, and `writeInstallManifest` are unchanged.
- `apps/cli/src/commands/install.ts`: `writeInstallProvenance` only. Dispatch blocks, `TargetInstallReceipt`, `enumeratePluginOwnedDests`, and `resolveHomeDir` are unchanged.
- Tests: `apps/cli/tests/commands/install-manifest.test.ts` (AC2–AC4) and `packages/core/tests/operations/install-manifest.test.ts` (AC5).
- Docs: `docs/00_ADR.md` (ADR-035 dated exception) and `docs/04_DESIGN.md` (§ Update verb + provenance manifest).
- Not touched: `apps/cli/src/commands/update.ts`, `packages/core/src/operations/update.ts`, the `grok-bot` target.

**Frozen names** — field `installedRoot`, sole value `'home'`. The existing error string `Install provenance inventory did not resolve any installed files for plugin '<p>' target '<t>'` is unchanged. No new exported helper; a local closure for the "is under root" test is fine.

**Algorithm (per target in `writeInstallProvenance`)**

1. Collect receipts as today, including `enumeratePluginOwnedDests`.
2. For each collected path: skip if missing; `lstatSync` the path as given and skip symlinks and non-files (lstat **before** realpath, so a symlinked file stays excluded); then `real = realpathSync(abs)`; dedupe on `real`.
3. `realScope = realpathSync(resolve(args.outputRoot))`. `inScope` = paths whose `relative(realScope, real)` is non-empty, not `..`-prefixed, and not absolute.
4. If `inScope.length > 0`: `installed = snapshotFiles(realScope, inScope)`, with no `installedRoot`.
5. Otherwise, if the target is `claude` / `omp` / `grok` and `resolveHomeDir()` exists: `realHome = realpathSync(resolveHomeDir())`, then `inHome` = the same test against `realHome`. If `inHome` is non-empty, `installed = snapshotFiles(realHome, inHome)` and `installedRoot = 'home'`.
6. Otherwise throw the existing error; no manifest is written.
7. Write via `args.writer(args.outputRoot, target, plugin, manifest)`, so the manifest location is unchanged. Spread `installedRoot` into the manifest only when set (same pattern as `marketplaceLocator`).

**Anti-patterns (do not implement)**

- Absolute or `..` keys in `installed.files`; relaxing `validateSnapshot` or `toSlashRel`.
- Writing or reading a manifest under `$HOME/.superskill/manifests` for a project-scope install.
- Merging scope-root and home files into one snapshot, or changing the mixed case (the bug-057 test stays unedited).
- Relaxing the empty-inventory throw, or downgrading it to a warning.
- Applying the home fallback to non-native targets or to paths outside home.
- Calling `realpathSync` before the symlink `lstat` check, or realpath-normalizing the manifest *write* location (`args.outputRoot` stays as given).
- Touching dispatch receipt collection or `update`, or bumping `schemaVersion`.

**Handoff** — No `dependencies[]`. Assumes 0139 only for the manual AC1 E2E (remote materialization must succeed first); the automated ACs stub host installers and need nothing from 0139. For any future `installed.files` consumer, this task leaves the `installedRoot` contract recorded in Q&A.

### Plan

1. (R2) Core: add `installedRoot?: 'home'` with TSDoc to `InstallManifestV1`; validate and preserve it in `validateInstallManifest`. Add AC5 tests in `packages/core/tests/operations/install-manifest.test.ts`: round-trip, reject non-`'home'`, legacy manifest without the field.
2. (R3) CLI: in `writeInstallProvenance`, realpath-normalize receipt paths (after the lstat symlink check) and scopeRoot; realpath home lazily in the fallback branch.
3. (R1, R4) CLI: apply precedence (scopeRoot inventory → native-only home inventory → existing throw); spread `installedRoot: 'home'` into the manifest when home-rooted.
4. (R1–R4) Tests in `apps/cli/tests/commands/install-manifest.test.ts`: AC2 (claude, home-only cache), AC3 (grok, symlinked `HOME_DIR` plus realpath'd `grok plugin list` path via injected `processExecutor`), AC4 (claude with no receipts anywhere throws, no manifest).
5. (R5) Run `bun test apps/cli/tests/commands/install-manifest.test.ts packages/core/tests/operations/install-manifest.test.ts` first; confirm the bug-057 case and all existing cases pass unedited.
6. Docs, same commit: ADR-035 dated exception paragraph (`installedRoot: 'home'` for project-scope native targets, task 0140); update the `docs/04_DESIGN.md` manifest-schema sentence.
7. Gate: `bun run lint`, `bun run test`, `bun run build`. Once 0139 has landed, run the manual AC1 E2E with an isolated HOME and `--no-global`.

Verification intent: AC2–AC6 are the automated gate. AC1 is manual evidence that depends on live host CLIs, recorded in `## Testing`.

### Root Cause

`writeInstallProvenance` (`apps/cli/src/commands/install.ts:2155-2171`) computes `scopeRoot = resolve(args.outputRoot)`, which is the cwd for a project-scope install, and skips every collected receipt path whose `relative(scopeRoot, abs)` starts with `..`. The bug-057 fix (task 0123) added that filter so out-of-scope HOME cache paths stopped crashing `snapshotFiles` when in-scope dests also existed.

Native targets materialize plugin content under the user home, and the dispatch blocks collect exactly those paths:

- claude: `join(root, '.claude', 'plugins', 'cache', <marketplace>, <plugin>)` for `root` in `resolveHomeDir()` and `outputRoot` (`install.ts:753-759`);
- omp: `installPath` from `resolveOmpInstallPath` (reads `installed_plugins.json`), plus generated hook files (`install.ts:805`);
- grok: `path` from `resolveGrokInstallPath` (`grok plugin list --json`) (`install.ts:828`).

At project scope every one of those is `..`-relative to cwd. When nothing plugin-owned also lands under the project (as the 0139 E2E shows, since the error fires), `unique` is empty and the function throws after the host install has already succeeded. The loss is in the scope filter, not in collection. The in-code comment at `install.ts:2161` ("Host install trees can sit under $HOME while project scopeRoot is cwd") names the case the guard then excludes.

**Masking variant.** The filter compares unnormalized paths. Host-reported paths (OMP `installPath`, Grok `path`) may be realpath'd (`/private/var/…`, `/private/tmp/…`) while `outputRoot` or `HOME_DIR` uses the symlinked spelling, so the same guard can empty the inventory even at global scope. Claude receipts are built from `resolveHomeDir()` and are not affected by this variant on their own.

**Root cause.** The provenance writer has a single snapshot root (scopeRoot), no representation for plugin-owned files a native host places under home, and a scope test that is not realpath-normalized.

### Solution

<!-- Filled during implementation: file:line change map and concise rationale. -->

### Testing

<!-- Filled during verification: regression command(s), outcomes, coverage claim or N/A. -->

### Review

<!-- Filled during review: P1-P4 findings, residual risk, and final disposition. -->

### References

- Task 0123 — provenance manifest (R3 relative in-scope paths, R5 fail-loud inventory); bug-057 in `.spur/context/buglog.md`.
- ADR-035 in `docs/00_ADR.md` — including the task 0128 / ADR-036 `grokBot` additive-field exception used as precedent.
- Task 0139 — the E2E where this surfaced (see its `## Review` residual-risk note).
- `apps/cli/src/commands/install.ts` — `writeInstallProvenance`, `resolveOmpInstallPath`, `resolveGrokInstallPath`, `resolveHomeDir`.
- `packages/core/src/operations/install-manifest.ts` — `InstallManifestV1`, `validateInstallManifest`, `validateSnapshot`, `snapshotFiles`.
- `apps/cli/tests/commands/install-manifest.test.ts` — bug-057 mixed-case regression test.
- `docs/04_DESIGN.md` § Update verb + provenance manifest.

### History
