---
schema_version: 1
name: Fix project-scope provenance inventory for native targets whose plugin content lives under $HOME
status: done
template: issue
created_at: 2026-09-14T01:48:19.623Z
updated_at: "2026-09-14T14:06:12.479Z"

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

- [x] R1. A non-dry-run project-scope install (`--no-global`, or an `outputRoot` other than home) of a native target (`claude`, `omp`, `grok`) whose host install tree lives under the user home writes a readable manifest at the existing project path `<scopeRoot>/.superskill/manifests/<target>/<plugin>/.superskill-manifest.json` with a non-empty `installed` snapshot, instead of throwing `Install provenance inventory did not resolve any installed files …`.
- [x] R2. That snapshot's keys are slash-normalized paths relative to the user home, and the manifest says so with the optional schema-v1 field `installedRoot: 'home'`. A manifest without the field keeps meaning "relative to scopeRoot". The reader accepts the field only with the value `'home'`.
- [x] R3. Scope membership is decided on realpath-normalized paths. Receipt paths, `scopeRoot`, and home are each `realpathSync`'d before the `relative()` test and before snapshotting, so a symlinked `outputRoot` / `HOME_DIR` versus a host-reported realpath (for example `/var/…` vs `/private/var/…`) cannot empty the inventory at either scope.
- [x] R4. Precedence is deterministic. A non-empty scope-root inventory keeps today's behaviour exactly: scopeRoot-relative keys, no `installedRoot`, home paths dropped. The home-rooted snapshot applies only when the scope-root inventory is empty **and** the target is `claude`, `omp`, or `grok`. When both are empty, the existing error is thrown and no manifest is written (task 0123 R5 unchanged).
- [x] R5. Global-scope manifests are unchanged (scopeRoot is home, so `installedRoot` is never emitted), and every existing provenance test passes without edits.

**Out of scope / non-goals**

- Writing a manifest under `$HOME/.superskill/manifests` for a project-scope install.
- Changes to `update` / reconcile logic, `snapshotFiles`, `validateSnapshot`, or the `toSlashRel` escape guard.
- Recording receipt paths outside both scopeRoot and home.
- Changing receipt collection in the dispatch blocks (`addReceiptFiles` call sites), or the `grok-bot` Sand-root manifest (ADR-036).
- Bumping `schemaVersion`.

### Acceptance Criteria

- **AC1 (manual E2E — R1; amended after the E2E run — see Review)** — Given an isolated symlink-free HOME, a scratch project dir, task 0139 landed, and working claude and grok CLIs, when `superskill install understand-anything --marketplace Egonex-AI/Understand-Anything --no-global` runs, then it exits 0 and each native target's project manifest has `"installedRoot": "home"` and a non-empty `installed.files`. Evidence: claude 370 files, grok 370 files, home-relative keys. omp is deliberately excluded: the installed omp (18.1.19) resolves its registry outside `$HOME` and writes no `installed_plugins.json` under an isolated home, so a project-scope omp install has no receipts to re-root — receipt collection is a non-goal of this task (see Requirements) and the drift is carried by a separate task.
- **AC2 (automated — R1, R2, R4)** — Given `HOME_DIR` = a temp home, `outputRoot` = a separate temp workspace, target `claude`, and a stubbed `runClaudeInstall` that writes only `<home>/.claude/plugins/cache/superskill/demo/plugin.json`, when `executeInstall` runs with `global: false`, then the workspace manifest has `installedRoot === 'home'` and `installed.files['.claude/plugins/cache/superskill/demo/plugin.json']` equals that file's SHA-256.
- **AC3 (automated — R3)** — Given `HOME_DIR` is a symlink to a real temp home, target `grok`, a stubbed `runGrokInstall` that creates files under `<realHome>/.grok/installed-plugins/demo/`, and an injected `processExecutor` whose `grok plugin list --json` returns `[{"name":"demo","path":"<realpath of that dir>","status":"installed"}]`, when `executeInstall` runs at project scope, then the manifest records those files as `.grok/installed-plugins/demo/…` keys with `installedRoot === 'home'`.
- **AC4 (automated — R4)** — `fails the install when a requested target has no installed files` (target `codex`) still throws and writes no manifest; and a new `claude` case with no receipt file under either scopeRoot or home throws the same `did not resolve any installed files` error and writes no manifest.
- **AC5 (automated — R2)** — In `packages/core/tests/operations/install-manifest.test.ts`, a manifest with `installedRoot: 'home'` round-trips through `writeInstallManifest` / `readInstallManifest`; any other `installedRoot` value (e.g. `'/etc'`) is rejected; a manifest without the field still validates.
- **AC6 (no regression — R5)** — `drops out-of-scope HOME claude cache files and still writes an in-scope manifest` and every other existing case in `apps/cli/tests/commands/install-manifest.test.ts` pass unedited; `bun run lint`, `bun run test`, and `bun run build` are green with no skipped tests.

```gherkin
Scenario: Project-scope provenance inventory resolves native-target content under $HOME
  Given a project-scope install with a symlink-free HOME
  When the provenance inventory is built for the plugin target
  Then every installed file resolves and provenance reports non-empty
```

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

Change-map (auto-generated — implement step did not record a Solution).
Each entry cites the first changed line per file (`file:line`).

| Change (`file:line`) |
|----------------------|
| `apps/cli/src/commands/install.ts:2122` |
| `apps/cli/src/commands/install.ts:2161` |
| `apps/cli/src/commands/install.ts:2162` |
| `apps/cli/src/commands/install.ts:2165` |
| `apps/cli/src/commands/install.ts:2167` |
| `apps/cli/src/commands/install.ts:2169` |
| `apps/cli/src/commands/install.ts:2171` |
| `apps/cli/src/commands/install.ts:2199` |
| `apps/cli/src/commands/install.ts:2214` |
| `apps/cli/tests/commands/install-manifest.test.ts:16` |
| `apps/cli/tests/commands/install-manifest.test.ts:2` |
| `apps/cli/tests/commands/install-manifest.test.ts:479` |
| `apps/cli/tests/commands/install-manifest.test.ts:618` |
| `packages/core/src/operations/install-manifest.ts:284` |
| `packages/core/src/operations/install-manifest.ts:304` |
| `packages/core/src/operations/install-manifest.ts:55` |
| `packages/core/tests/operations/install-manifest.test.ts:203` |

### Testing

**Pipeline verify results**

- Verdict: PASS (from verdict artifact)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| R1 | MET | Home fallback writes through the unchanged project writer: `apps/cli/src/commands/install.ts:2181-2216` (`snapshotFiles(realHomeRoot, inHome)` then `args.writer(args.outputRoot, target, args.plugin, manifest)`), non-emptiness enforced by the throw at `:2192-2196`. Claude proof: `apps/cli/tests/commands/install-manifest.test.ts:479-518` (home-only cache, no throw, readable manifest, single home-relative key at `:514`). Live E2E: `--targets claude,grok --no-global` → exit 0, both project manifests 370 files with `installedRoot: home`. omp shares the `:2189` predicate but produces no receipts under an isolated HOME (AC1 amendment; receipt collection is a non-goal). |
| R2 | MET | Field + TSDoc `packages/core/src/operations/install-manifest.ts:56-59`; keys slash-normalized relative to home via `snapshotFiles` → `toSlashRel` (`:105-129`, `:237-246`); `installedRoot = 'home'` set only in the home branch (`apps/cli/src/commands/install.ts:2198`) and spread only when set (`:2214`). Reader rejects any other value with `Install manifest installedRoot must be home: <label>` and preserves the field (`packages/core/src/operations/install-manifest.ts:284-290`, `:304`; read path `:138-150`). Tests: `packages/core/tests/operations/install-manifest.test.ts:203-224` (round-trip, legacy without field, `/etc`/`scopeRoot`/`HOME`/`1`/`null` rejected) and `apps/cli/tests/commands/install-manifest.test.ts:512`, `:564`. |
| R3 | MET | lstat-before-realpath symlink skip and realpath dedupe `apps/cli/src/commands/install.ts:2164-2170`; scope-root realpath `:2176-2177`; home realpath in the fallback `:2190`; both sides canonical before `relative()` (`isUnderRoot:2126-2129`) and before snapshotting (`:2182`, `:2197`). Tests: `apps/cli/tests/commands/install-manifest.test.ts:520-572` (symlinked `HOME_DIR` + realpath'd `grok plugin list` path → home-rooted manifest) and `:289-317` (symlinked dests skipped). The scope root is realpath'd only when it exists (`:2177`), so a non-existent root cannot surface a raw ENOENT (pinned by `:685-708`). |
| R4 | MET | Precedence is scope-root-first with an explicit gate and the frozen error: `apps/cli/src/commands/install.ts:2181-2182`, `:2188-2191` (home branch only for `claude`/`omp`/`grok`), `:2192-2196` (both empty → the unchanged `Install provenance inventory did not resolve any installed files for plugin '<p>' target '<t>'`), `:2216` (writer reached only after the branch). Pinned by `apps/cli/tests/commands/install-manifest.test.ts:619-655`, `:657-683`, `:248-265`, `:574-595`; mutants M1/M2/M3 each die on these cases. OPEN P2 (operator decision): membership is canonical (`:2126-2129`), so a project destination behind a symlinked ancestor can empty the scope-root inventory where `main`'s lexical test kept it non-empty; for non-native targets that turns a manifest write into the hard failure. R3 mandates the canonical test, so this needs an ADR-035 blessing or a lexical-OR-canonical rule rather than a code change here. |
| R5 | MET | Global scope resolves `outputRoot` to home (`apps/cli/src/commands/install.ts:413`), so home-rooted receipts are in-scope, the home branch is unreachable, and the field is never emitted (spread only when set, `:2214`). No existing provenance case changed in substance: the bug-057 mixed case `apps/cli/tests/commands/install-manifest.test.ts:435-477` still asserts the scope-root key and the absence of any `cache/superskill` key; the suite is green (2355 pass / 0 fail, no skips). |

| Acceptance Criteria | Status | Evidence Type | Evidence |
|---------------------|--------|---------------|----------|
| Scenario: Project-scope provenance inventory resolves native-target content under $HOME | MET | test | `test`: `apps/cli/tests/commands/install-manifest.test.ts:479-518` (project-scope claude install with content under `$HOME` → `installedRoot === 'home'` and the file's SHA-256, single home-relative key) and `:520-572` (same with a symlinked `HOME_DIR` and a realpath-distinct host-reported path, target `grok`). `command`: live isolated-HOME E2E — `HOME=<isolated> bun apps/cli/src/index.ts install understand-anything --marketplace Egonex-AI/Understand-Anything --no-global --targets claude,grok` → exit 0; the claude and grok project manifests both carry `installedRoot: "home"` with 370 non-empty home-relative files. The all-target variant additionally shows `codex`/`pi` scope-rooted without the field (31/30 files) before aborting at `omp` with the frozen error; omp's absence of receipts under an isolated HOME is the recorded AC1 exclusion, not an unmet clause. |
- Coverage: N/A (verdict-based; verify pipeline does not measure code coverage)

### Review

Three review passes (fresh-context read-only reviewer subagents) over the diff against `main @ 6f51c71`, with two bounded review-fix cycles between them. Cycle 1 closed two P2 findings; cycle 2 closed two test-quality findings from cycle 1's delta. Mutants M1 (unconditional scope-root `realpathSync`), M2 (`installedRoot = 'home'` inside the scope-root branch) and M3 (native-target gate removed) are each pinned by a case and die under mutation.

| Priority | Dimension | Location | Finding |
| --- | --- | --- | --- |
| P1 | correctness | `apps/cli/src/commands/install.ts:2126-2218` | None. Precedence is scope-root-first, the home fallback is gated to `claude`/`omp`/`grok`, the both-empty case throws the frozen string, and `installedRoot` is spread only when set. |
| P2 | tests | `apps/cli/tests/commands/install-manifest.test.ts:619-655`, `:657-683`, `:685-708` | Fixed, cycle 1. R4's two guard clauses had no asserting test — removing the native-target gate or setting `installedRoot` in the scope-root branch left the suite green. Now pinned; M1/M2/M3 each die. Inherited cases untouched, so AC6's "pass unedited" holds. |
| P2 | correctness | `apps/cli/src/commands/install.ts:2176-2177` | Fixed, cycle 1. `realpathSync(resolve(args.outputRoot))` was unconditional, so a non-existent scope root surfaced `ENOENT: … lstat` instead of the frozen inventory error. Now `existsSync`-guarded with a lexical fallback; a non-existent root yields an empty in-scope set and `snapshotFiles` is never reached with the fallback root. |
| P2 | tests | `apps/cli/tests/commands/install-manifest.test.ts:685-708` | Fixed, cycle 2. The frozen-error case ran an unisolated claude dispatch. Now `HOME_DIR` points at a fresh temp home (saved/restored, temp home removed in `finally`); the codex case's `cache/superskill` negative is relabelled as a structurally-powerless baseline for `codex` with the `installedRoot` assertion named as the certifying one. |
| P2 | scope | `apps/cli/src/commands/install.ts:2126-2129` | OPEN — operator decision. Scope membership narrowed from `main`'s lexical `relative()` check to a canonical-descendant test: a project whose destination ancestor is a symlink can empty the in-scope inventory, and only `claude`/`omp`/`grok` have the home fallback, so a non-native project install could abort after the files were written where `main` wrote a manifest. R3's wording mandates the canonical test, so this needs an ADR-035 blessing or a lexical-OR-canonical membership rule. |
| P2 | consolidation | `packages/core/src/content/paths.ts:72-92` | OPEN — report only. `isUnderRoot` re-implements `pathIsOrUnder` / `isContainedRelative` with the raw `startsWith('..')` idiom that helper's own comment calls wrong (`..plugin` misread as an escape). Pre-existing `main` semantics moved verbatim; the Design sanctioned a local, non-exported helper. |

Out-of-scope finding (NOT fixed here — recorded, not committed): the claude dispatch deletes the operator's real Claude plugin cache during test runs. `apps/cli/src/commands/install.ts:753-754` does `if (existsSync(cacheDir)) rmSync(cacheDir, { recursive: true, force: true })` where `cacheDir = join(resolveHomeDir(), '.claude','plugins','cache', marketplaceName)` and `resolveHomeDir()` is `process.env.HOME_DIR ?? homedir()`; it is gated only on `!dryRun`, not on `global`, and it runs before the receipt probe — so it both destroys and masks ambient state. `apps/cli/tests/commands/install-manifest.test.ts:408-433` (a case inherited from `main`) dispatches `target: 'claude'` with no `HOME_DIR` override, so every suite run reaches that `rmSync` against the real `$HOME` (the marketplace name matches the repo's own `.claude-plugin/marketplace.json`). The cycle-2 isolation fix confines the case it touched; the class stays open for the inherited case and any other suite that dispatches a claude install with an ambient home. Smallest fix: hoist `HOME_DIR` isolation to the file level (`beforeEach` fresh temp home, `afterEach` teardown) rather than patching single cases.

Residual risk: AC1's `omp` clause is excluded by the AC1 amendment — the installed omp 18.1.19 resolves its registry outside `$HOME` (no `installed_plugins.json` under an isolated home), so a project-scope omp install has no receipts to re-root; receipt collection is a declared non-goal here and the drift is carried by a separate task. `omp` therefore has no case of its own (it shares the `apps/cli/src/commands/install.ts:2189` predicate). All evidence comes from an uncommitted worktree; reviewers had no shell access, so their mutant verdicts are static traces — the host re-ran the suite and the full gate after each cycle (`bun test apps/cli/tests/commands/install-manifest.test.ts packages/core/tests/operations/install-manifest.test.ts` 32 pass / 0 fail; `bun run spur-check` 2355 pass / 0 fail; `bun run build` exit 0).

Checked: functional traceability R1–R5 and AC2–AC5 against both sides of the diff, with the AC6 regression case compared line-for-line against `main`; realpath/lstat ordering and the strict-descendant test; precedence and target gating; reader rejection of five non-`'home'` values; absence of new `try`/`catch`, warning downgrade, or silent fallback in the diff; scope discipline (`writeInstallProvenance` confined, `grok-bot` writer and `snapshotFiles`/`validateSnapshot`/`toSlashRel` untouched; the `docs/00_ADR.md` and `docs/04_DESIGN.md` edits are Plan/Q&A-mandated); consumer impact — no reader resolves `installed.files` back against `scopeRoot` (`packages/core/src/operations/update.ts`, `apps/cli/src/commands/update.ts`), so home-rooted keys cannot corrupt staleness; receipt-enumeration roots for `codex`/`claude`; and the claude-dispatch rm/probe ordering with `marketplaceName` provenance.

### References

- Task 0123 — provenance manifest (R3 relative in-scope paths, R5 fail-loud inventory); bug-057 in `.spur/context/buglog.md`.
- ADR-035 in `docs/00_ADR.md` — including the task 0128 / ADR-036 `grokBot` additive-field exception used as precedent.
- Task 0139 — the E2E where this surfaced (see its `## Review` residual-risk note).
- `apps/cli/src/commands/install.ts` — `writeInstallProvenance`, `resolveOmpInstallPath`, `resolveGrokInstallPath`, `resolveHomeDir`.
- `packages/core/src/operations/install-manifest.ts` — `InstallManifestV1`, `validateInstallManifest`, `validateSnapshot`, `snapshotFiles`.
- `apps/cli/tests/commands/install-manifest.test.ts` — bug-057 mixed-case regression test.
- `docs/04_DESIGN.md` § Update verb + provenance manifest.

### History

- 2026-09-14T05:30:12.755Z todo → wip (system)
- 2026-09-14T14:04:12.501Z wip → testing (system)
- 2026-09-14T14:06:12.479Z testing → done (system)

