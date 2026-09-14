---
schema_version: 1
name: Fix omp provenance receipts — omp 18.1.19 writes no installed_plugins.json for a project-scope install
status: done
template: issue
created_at: 2026-09-14T14:18:54.818Z
updated_at: "2026-09-14T17:40:02.720Z"
feature_id: F

---

## 0141. Fix omp provenance receipts — omp 18.1.19 writes no installed_plugins.json for a project-scope install

### Background

Surfaced during task 0140's AC1 E2E (a project-scope install of a native target whose plugin content lives under `$HOME`).

Repro: isolated symlink-free `HOME` + scratch project + `superskill install understand-anything --marketplace Egonex-AI/Understand-Anything --no-global` → `claude` and `grok` each wrote a project manifest with `installedRoot: "home"` (370 files), `codex` and `pi` wrote scope-rooted manifests, then the run aborted:

```
Error: Install provenance inventory did not resolve any installed files for plugin 'understand-anything' target 'omp'
```

Diagnosis (omp 18.1.19, `/Users/robin/.bun/bin/omp`):

- The omp CLI reported the plugin installed and cached it at `<home>/.omp/plugins/cache/plugins/understand-anything___understand-anything___2.9.7` (logged by omp itself: `Plugin installed … cachePath`), but wrote **no** `installed_plugins.json` in either location `resolveOmpInstallPath` reads — `<cwd>/.omp/plugins/installed_plugins.json` (project scope) or `<home>/.omp/plugins/installed_plugins.json` (global scope).
- omp does not honour `$HOME` for its registry location: under an isolated `HOME`, the registry entry that appeared during the run landed in the **real** user home (`~/.omp/plugins/installed_plugins.json`, key `understand-anything@understand-anything`, `installPath` pointing at the isolated-home cache), while `<isolatedHome>/.omp/` contained only `logs/`, `natives/`, `plugins/cache/` and `marketplaces.json`.
- Net effect for a project-scope omp install: zero receipts, so task 0140's home-rooted snapshot has nothing to re-root and R4's both-empty clause correctly throws the frozen error. A global-scope omp install is also affected unless the registry exists, since receipts are the only snapshot input.

`resolveOmpInstallPath` (`apps/cli/src/commands/install.ts:1297-1315`) therefore treats a registry file as the sole receipt source, with no omp-version verification newer than 16.4.2 anywhere in the file (the only version note, the `--force` comment at `apps/cli/src/commands/install.ts:1288`, dates to 16.4.2).

### Requirements

- [x] R1. A project-scope (`--no-global`) omp install of a native plugin writes a project manifest with a non-empty `installed` snapshot for the omp version present in this environment (18.1.19), instead of throwing `Install provenance inventory did not resolve any installed files …`. Where no receipt can be derived at all, the failure names the actual condition (host wrote no registry / nothing on disk under the resolved root) rather than only reporting an empty inventory.
- [x] R2. omp receipt discovery no longer depends solely on `installed_plugins.json`: when that registry is absent, or present without the `plugin@marketplace` key, the receipts are derived from the plugin tree the host actually wrote under the resolved root (`<root>/.omp/plugins/cache/plugins/<plugin>___<marketplace>___<version>`). The registry stays the primary source when it has the key, so today's behaviour is preserved wherever it already works.
- [x] R3. Home resolution for omp reflects where the host CLI actually wrote. If omp resolves its own home independently of `$HOME` (observed: an isolated-`HOME` run wrote the registry into the real home), that divergence is surfaced in the failure message or in `--verbose` output rather than silently yielding zero receipts.
- [x] R4. No regression: provenance behaviour for `claude`, `grok`, `codex`, `pi` and the global-scope omp path is unchanged; a target whose plugin tree genuinely does not exist still throws the frozen error and writes no manifest.

**Out of scope / non-goals**

- Task 0140's scope-path mechanism (realpath-normalized membership, home-rooted snapshot fallback, `installedRoot` field) — this task only widens how omp receipts are *collected*, which 0140 explicitly froze.
- The claude dispatch's `rmSync` of `<home>/.claude/plugins/cache/<marketplace>` (`apps/cli/src/commands/install.ts:753-754`, active only when `!dryRun`) — carried separately.
- Any change to omp CLI invocation (`omp plugin marketplace add` / `omp plugin install`), to `snapshotFiles` / `validateSnapshot` / `toSlashRel`, or to the manifest schema.

### Acceptance Criteria

- **AC1 (automated — R1, R2)** — Given `HOME_DIR` = a temp home, a separate `outputRoot`, target `omp`, and a stub that writes only `<home>/.omp/plugins/cache/plugins/demo___<marketplace>___1.0.0/plugin.json` (no `installed_plugins.json`), when `executeInstall` runs with `global: false`, then the workspace manifest is written with a non-empty `installed.files` and — for an omp tree under the resolved home — `installedRoot === 'home'`.
- **AC2 (automated — R2, R4)** — The registry-present path is unchanged (an `installed_plugins.json` carrying `plugin@marketplace` still resolves through `installPath`); the registry-absent path resolves through the on-disk tree; and a target with neither registry nor tree still throws the frozen `did not resolve any installed files for plugin '<p>' target '<t>'` error and writes no manifest.
- **AC3 (automated — R3)** — A test proves the divergence case is surfaced: with an isolated `HOME_DIR` and a registry written to a different root, the failure (or `--verbose`) output names the root that was consulted, rather than reporting only an empty inventory.
- **AC4 (no regression — R4)** — Every existing case in `apps/cli/tests/commands/install-manifest.test.ts` and `packages/core/tests/operations/install-manifest.test.ts` passes unedited; `bun run lint`, `bun run test`, `bun run build` and `bun run spur-check` are green with no skipped tests.
- **AC5 (manual E2E — R1)** — The task-0140 AC1 repro run again with an isolated symlink-free `HOME` and a scratch project: `superskill install understand-anything --marketplace Egonex-AI/Understand-Anything --no-global` exits 0, or fails with the named actionable error from R1 — never with an unexplained empty inventory. Revert any entry omp writes into the real `~/.omp` afterwards.

### Q&A

<!-- Clarifications and triage decisions. Keep empty if none. -->

### Design

All changes land in `apps/cli/src/commands/install.ts`; tests in `apps/cli/tests/commands/install-omp-helpers.test.ts` (unit) and `apps/cli/tests/commands/install-manifest.test.ts` (e2e via the existing `runOmpInstall` stub seam, pattern at `install.test.ts:473`).

**1. Two-stage omp receipt resolution (R1, R2).** Rework the body of `resolveOmpInstallPath` (`install.ts:1301`) into a probe over an ordered, de-duplicated candidate-root list while keeping its exported signature `(marketplace, plugin, global): string | undefined` (pinned by `install-omp-helpers.test.ts`):

- Resolution roots: project scope → `[process.cwd(), resolveHomeDir()]`; global → `[resolveHomeDir()]`.
- Stage A (primary, unchanged): `installed_plugins.json` keyed `plugin@marketplace`, scope-preferred entry — today's behaviour wherever it already works.
- Stage B (new fallback, only when Stage A misses in every root): enumerate `<root>/.omp/plugins/cache/plugins/` for directories matching `<plugin>___<marketplace>___*`; return the single match, or the lexicographically greatest version tail on multiple matches. Sound because the registry's own `installPath` points into this same cache tree (observed in the 0141 repro: `installPath` → `<home>/.omp/plugins/cache/plugins/...`), so `postInstallOmp` and `addReceiptFiles(target, listRegularFilesUnder(installPath))` at `install.ts:806-813` behave identically on either stage — no dispatch changes needed for the happy path.

**2. Self-explaining empty resolution + home divergence (R1, R3).** The probe is an internal `resolveOmpInstall(marketplace, plugin, global)` returning `{ installPath?, source?: 'registry' | 'cache-tree', consulted: Array<{ root, registry: 'hit' | 'absent', tree: 'hit' | 'absent' }> }`; the exported function becomes a thin wrapper returning `.installPath`. When the omp dispatch (`install.ts:805-816`) gets no path, it emits one unconditional line naming each consulted root and what was found before the pipeline proceeds to the frozen finalize throw (`install.ts:2193-2195`, message unchanged — existing `/did not resolve any installed files …/` regex assertions keep passing). Divergence probe: when resolution is empty and `os.homedir()` ≠ `resolveHomeDir()`, also probe `os.homedir()` for diagnosis only and name it when a registry or tree exists there ("omp resolved its home independently of $HOME"). Tests control `os.homedir()` via `process.env.HOME`.

**Anti-patterns / do-not:**

- Do not import receipts from a divergent `os.homedir()` into the manifest — diagnose only; foreign-root receipts would land outside both the scope root and `resolveHomeDir()` and break 0140's snapshot contract.
- Do not touch the frozen finalize error string, `snapshotFiles` / `validateSnapshot` / `toSlashRel`, the manifest schema, or the omp CLI invocation (all frozen by 0140 / task out-of-scope).
- Stage B must glob only `<plugin>___<marketplace>___*` — never adopt another plugin's cache dir.
- No `any`; no new manifest fields; the diagnostic line is additive output, not a schema or error-contract change.

**Test intent:** AC1 = stub writes only `<home>/.omp/plugins/cache/plugins/demo___<marketplace>___1.0.0/plugin.json` with `HOME_DIR` = temp home and a separate `outputRoot` → manifest written, non-empty `installed.files`, `installedRoot === 'home'`. AC2 = registry-present path unchanged (existing helper cases stay green) + neither-registry-nor-tree still throws the frozen error and writes no manifest. AC3 = `HOME_DIR` = tempA, `HOME` = tempB, registry only under tempB → frozen error plus emitted output naming tempB (assert via `process.stdout.write` spy per repo convention). Regression floor: both `install-manifest.test.ts` files pass unedited.

### Plan

1. (R1, R2) Extend `resolveOmpInstallPath` (or its caller) so the plugin tree under the resolved root is a receipt source when the registry is absent or lacks the `plugin@marketplace` key: enumerate `<root>/.omp/plugins/cache/plugins/<plugin>___<marketplace>___<version>` and treat its files as owned dests. Keep the registry as the primary source when the key resolves.
2. (R1, R3) Make an empty resolution explain itself: name the roots consulted and whether the registry or the on-disk tree was found, so an omp-version drift is diagnosable from the install output.
3. (R4) Pin the unchanged paths first (registry-present resolution, genuinely-absent tree → frozen error + no manifest), then add the fallback cases.
4. (AC1-AC4) Add the automated cases and run the full gate: `bun run lint`, `bun test` on the touched files, `bun run spur-check`, `bun run build`.
5. (AC5) Re-run the 0140 AC1 E2E (isolated symlink-free HOME, scratch project, `--no-global`) with omp included; revert any registry entry omp writes into the real `~/.omp`.

Verification intent: AC1-AC3 are the automated gate; AC5 is the environment-dependent manual evidence recorded in `## Testing`.

### Root Cause

`resolveOmpInstallPath` (`apps/cli/src/commands/install.ts:1297-1315`) treats `installed_plugins.json` as the only receipt source for the omp target. That assumption matches omp 16.4.2-era behaviour (the file's only version-verification note, the `--force` comment at `:1288`, dates to 16.4.2) but not the installed 18.1.19, which materializes the plugin payload under `<root>/.omp/plugins/cache/plugins/` without writing that registry — and which resolves its own home independently of the `HOME` environment variable, so an isolated-home run can write the registry into the real user home instead.

The provenance pipeline then receives zero receipts for omp. Since receipts are the only input to `snapshotFiles`, both inventories are empty, and 0140 R4's both-empty clause throws the frozen error. The failure is therefore not a scope-resolution defect (0140 fixed that seam): it is a receipt-collection assumption about a host CLI whose on-disk layout changed.

### Solution

All production changes land in `apps/cli/src/commands/install.ts`; omp receipt collection no longer assumes `installed_plugins.json` is the only source, and an empty resolution now explains itself.

**Two-stage omp receipt resolution (R1, R2)**

- `apps/cli/src/commands/install.ts:1300-1309` — new internal `OmpResolutionProbe` shape: `{ installPath?, source?: 'registry' | 'cache-tree', consulted: Array<{ root, registry: 'hit' | 'absent', tree: 'hit' | 'absent' }> }`.
- `apps/cli/src/commands/install.ts:1310-1333` — `readOmpRegistryInstallPath` extracts the unchanged Stage A registry read (file existence → JSON parse → version/plugins shape → `plugin@marketplace` key → scope-preferred entry); behaviour byte-for-byte identical to the old resolver, including returning a registry `installPath` without an existence check.
- `apps/cli/src/commands/install.ts:1335-1355` — new `listOmpCacheTreeHits` enumerates `<root>/.omp/plugins/cache/plugins/<plugin>___<marketplace>___*` directories (the Stage B receipt source, omp 18.1.19's on-disk layout), sorted so the lexicographically greatest version tail sorts last; the full `<plugin>___<marketplace>___` prefix anchor means another plugin's or marketplace's cache dir is never adopted, and non-directory entries are skipped.
- `apps/cli/src/commands/install.ts:1357-1395` — `resolveOmpInstall` probes the ordered, de-duplicated root list (project scope → `[process.cwd(), resolveHomeDir()]`; global → `[resolveHomeDir()]`) and returns Stage A's registry hit when any root has one (today's behaviour preserved wherever it already works), else Stage B's cache-tree hit from the first root that has one, else an empty probe carrying the per-root findings.
- `apps/cli/src/commands/install.ts:1423-1434` — exported `resolveOmpInstallPath` becomes a thin wrapper returning `.installPath`; its `(marketplace, plugin, global): string | undefined` signature is unchanged (pinned by `apps/cli/tests/commands/install-omp-helpers.test.ts:106`).

**Self-explaining empty resolution + home divergence (R1, R3)**

- `apps/cli/src/commands/install.ts:1397-1421` — `describeEmptyOmpResolution` builds one diagnostic line naming every consulted root with what the host wrote there (`registry hit|absent`, `plugin cache tree hit|absent`). When `os.homedir()` ≠ `resolveHomeDir()`, it additionally probes the real home and — only when a registry or cache tree exists there — appends the divergence note ("omp resolved its home independently of $HOME"). Diagnosis only: foreign-root receipts are never adopted into the manifest, preserving 0140's snapshot contract.
- `apps/cli/src/commands/install.ts:803-821` — the omp dispatch now calls `resolveOmpInstall` and, on an empty probe, emits that line unconditionally (replacing the old verbose-only `OMP install path not found in registry` echo) before the frozen finalize error at `apps/cli/src/commands/install.ts:2306-2310` fires with its message unchanged.

**Tests**

- `apps/cli/tests/commands/install-omp-helpers.test.ts:172-239` — seven Stage B unit cases: home cache-tree fallback at project and global scope without a registry, ordered-roots preference (workspace tree before home tree at project scope), registry-primary when both sources exist, lexicographically-greatest version tail on multiple matches (deliberately lexicographic, not semver: `2.9.7` > `2.10.0`), never adopting another plugin/marketplace cache dir, and ignoring a non-directory cache entry. All eight pre-existing resolver cases pass unedited.
- `apps/cli/tests/commands/install-manifest.test.ts:718-866` — four e2e cases through `executeInstall` via the `runOmpInstall` stub seam: (AC1) a tree-only host outcome writes a manifest with `installedRoot: 'home'` and non-empty `installed.files`; (AC2 unchanged path) a registry carrying `plugin@marketplace` still resolves through `installPath` and a decoy cache tree is ignored; (AC2/R4) neither registry nor tree throws the frozen `/did not resolve any installed files …/` error, writes no manifest, and names the consulted roots on stdout; (AC3) a registry present only under a divergent real home is named in the diagnosis ("independently of $HOME") while no manifest is written.

**Design deviation (1, mechanical)**

- AC3's divergence control: Bun's `os.homedir()` ignores mid-process `process.env.HOME` mutations (probed directly — startup value is what Bun returns), so the e2e test simulates the divergent real home with `spyOn(os, 'homedir')` rather than `process.env.HOME`. Same seam, Bun-compatible; production logic is untouched by the deviation.

**Untouched per task non-goals**

- 0140's scope-path mechanism (realpath membership, home-rooted snapshot fallback, `installedRoot` semantics), the frozen finalize error string, `snapshotFiles` / `validateSnapshot` / `toSlashRel`, the manifest schema, omp CLI invocation, and the claude dispatch `rmSync` (`apps/cli/src/commands/install.ts:753-754`) — all unchanged.

### Testing

**Pipeline verify results**

- Verdict: PASS (from verdict artifact)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| R1 | MET | Two-stage probe `apps/cli/src/commands/install.ts:1362-1388` with cache-tree receipt source `:1341-1353` and self-explaining empty resolution at the dispatch `:816-821` — all re-read this run. Tests `apps/cli/tests/commands/install-manifest.test.ts:732` (home-rooted manifest from tree only) and `:812` (failure names consulted roots) re-located and re-executed this run (87 pass / 0 fail across the three evidence files). Live E2E: recorded original-run command evidence. |
| R2 | MET | Stage A registry read behaviour-identical `apps/cli/src/commands/install.ts:1315-1332` (re-read); Stage B prefix-anchored enumeration `:1341-1353` with first-root + lexicographic-tail selection `:1382-1386` (re-read). Registry-primary e2e `apps/cli/tests/commands/install-manifest.test.ts:767` re-executed this run; Stage B unit block `apps/cli/tests/commands/install-omp-helpers.test.ts:172-239` (file untouched since `96251ef`; case lines confirmed by grep at `:212` lexicographic tail, `:223` never-adopts, `:233` non-directory) re-executed this run. |
| R3 | MET | `apps/cli/src/commands/install.ts:1397-1422` names every consulted root and probes `os.homedir()` divergence diagnosis-only (re-read); foreign-root receipts never adopted (message append only). Tests `apps/cli/tests/commands/install-manifest.test.ts:845` (names the real home, no manifest) and `apps/cli/tests/commands/install.integration.test.ts:572` (exactly one non-verbose diagnostic line) re-located and re-executed this run. |
| R4 | MET | Frozen error unchanged `apps/cli/src/commands/install.ts:2306-2310` (re-read); claude/grok/codex/pi and global-omp paths untouched by the diff (`96251ef` scope re-read: install.ts + the three test files only). Neither-source case `apps/cli/tests/commands/install-manifest.test.ts:812` throws the frozen error and writes no manifest — passed this run. Core manifest suite 36 pass / 0 fail this session (unedited). |

| Acceptance Criteria | Status | Evidence Type | Evidence |
|---------------------|--------|---------------|----------|
| AC1 (tree-only host outcome → home-rooted manifest) | MET | test | `apps/cli/tests/commands/install-manifest.test.ts:732-766` — stub writes only the omp cache tree, `executeInstall` with `global: false` writes a manifest with non-empty `installed.files` and `installedRoot === 'home'`; passed this run. |
| AC2 (registry path unchanged; absent → tree; neither → frozen error) | MET | test | Registry-primary `:767-811` (decoy tree ignored), neither-source `:812-844` (frozen error, no manifest, consulted roots on stdout); all passed this run. |
| AC3 (divergent-home diagnosis) | MET | test | `apps/cli/tests/commands/install-manifest.test.ts:845-895` — receipts only under the divergent homedir → output names the real home and "independently of $HOME", no manifest written; passed this run. |
| AC4 (no regression) | MET | command | This run: 87 pass / 0 fail across the three evidence files; `bun run lint` clean (this session); `bun run build` exit 0 (this run); no `.skip`/`.todo`/`.only` in the touched files; both pre-existing install-manifest suites pass unedited (CLI additions-only, core untouched). |
| AC5 (manual E2E, environment-dependent) | MET | command | Recorded original-run evidence: isolated symlink-free HOME + scratch project, `dist/superskill install understand-anything --marketplace Egonex-AI/Understand-Anything --no-global` → exit 0 (`Installed 'understand-anything' to 9 target(s)`); omp manifest `installedRoot: 'home'` with 372 files via Stage B cache-tree receipts; real `~/.omp` verified unchanged — not re-executed in this re-audit. |
- Coverage: N/A (verdict-based; verify pipeline does not measure code coverage)

### Review

<!-- spur:record-review -->

**SECU findings** (pipeline verify step — verdict: PASS)

| Priority | Dimension | Location | Finding |
|----------|-----------|----------|----------|
| P4 | spur task check | — | task check passed |
| P4 | task-check | — | `spur task check 0141` → PASS (this run, after record). |
| P4 | scope-creep | — | Commit `96251ef` scope re-read this run: `install.ts` + three test files + task file — every change maps to the Design's two mechanisms + tests; the named anti-patterns (adopting foreign-root receipts, touching the frozen error/`snapshotFiles`/schema/omp CLI invocation, globbing beyond the `<plugin>___<marketplace>___` prefix, `any`, new manifest fields) remain absent. |
| P4 | design-conformance | — | 8/8 design claims DONE at the re-read anchors (probe shape, Stage A extraction, Stage B enumeration + selection, ordered deduped roots, unchanged exported signature, self-explaining empty resolution + divergence diagnosis, unconditional dispatch echo, frozen error). One documented deviation (Solution): AC3 simulates the divergent home with `spyOn(os, 'homedir')` because Bun ignores mid-process `process.env.HOME` mutations — test-side, mechanical, production logic untouched → CHANGED, PASS-acceptable. |
| P4 | Priority | — | Location |
| P4 | P4 | — | `apps/cli/src/commands/install.ts:1315-1332` |
| P4 | P4 | — | `apps/cli/src/commands/install.ts:1382-1386` |
| P4 | P4 | — | `apps/cli/src/commands/install.ts:1364-1369` |
| P4 | P4 | — | `apps/cli/src/commands/install.ts:1397-1422` |
| P4 | P4 | — | `apps/cli/src/commands/install.ts:1300-1434` |
| P4 | P4 | — | — |
| P4 | evidence-rule-pass | — | All behavior-bearing AC rows have executable evidence or are explicitly non-behavioral. |

### References

- Task 0140 (done) — `docs/tasks/0140_fix-project-scope-provenance-inventory-for-native-targets-wh.md`: scope-path mechanism and the frozen both-empty error this task builds on.
- Repro environment: omp 18.1.19 at `/Users/robin/.bun/bin/omp`; cache tree layout `<root>/.omp/plugins/cache/plugins/<plugin>___<marketplace>___<version>`; registry key `plugin@marketplace` in `installed_plugins.json`.
- Code anchors: `apps/cli/src/commands/install.ts:1297-1315` (`resolveOmpInstallPath`), `:805-816` (omp dispatch), `:2193-2195` (frozen finalize error), `:2229-2231` (`resolveHomeDir`), `:753-754` (claude cache `rmSync`, carried separately).
- Test seams: `apps/cli/tests/commands/install-omp-helpers.test.ts:106` (exported-signature pin), `apps/cli/tests/commands/install.test.ts:473` (`runOmpInstall` stub pattern), `apps/cli/tests/commands/install-manifest.test.ts:479` (home-rooted manifest pattern).

### History

- 2026-09-14T15:18:40.458Z todo → wip (system)
- 2026-09-14T15:58:56.152Z wip → testing (system)
- 2026-09-14T16:00:00.376Z testing → done (system)

