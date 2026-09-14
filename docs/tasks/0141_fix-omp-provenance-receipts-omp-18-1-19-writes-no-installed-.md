---
schema_version: 1
name: Fix omp provenance receipts — omp 18.1.19 writes no installed_plugins.json for a project-scope install
status: todo
template: issue
created_at: 2026-09-14T14:18:54.818Z
updated_at: "2026-09-14T14:19:49.232Z"
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

`resolveOmpInstallPath` (`apps/cli/src/commands/install.ts:1297-1315`) therefore treats a registry file as the sole receipt source, an assumption its own docstring dates to "verified against omp 16.4.2" (`apps/cli/src/commands/install.ts:1288`).

### Requirements

- [ ] R1. A project-scope (`--no-global`) omp install of a native plugin writes a project manifest with a non-empty `installed` snapshot for the omp version present in this environment (18.1.19), instead of throwing `Install provenance inventory did not resolve any installed files …`. Where no receipt can be derived at all, the failure names the actual condition (host wrote no registry / nothing on disk under the resolved root) rather than only reporting an empty inventory.
- [ ] R2. omp receipt discovery no longer depends solely on `installed_plugins.json`: when that registry is absent, or present without the `plugin@marketplace` key, the receipts are derived from the plugin tree the host actually wrote under the resolved root (`<root>/.omp/plugins/cache/plugins/<plugin>___<marketplace>___<version>`). The registry stays the primary source when it has the key, so today's behaviour is preserved wherever it already works.
- [ ] R3. Home resolution for omp reflects where the host CLI actually wrote. If omp resolves its own home independently of `$HOME` (observed: an isolated-`HOME` run wrote the registry into the real home), that divergence is surfaced in the failure message or in `--verbose` output rather than silently yielding zero receipts.
- [ ] R4. No regression: provenance behaviour for `claude`, `grok`, `codex`, `pi` and the global-scope omp path is unchanged; a target whose plugin tree genuinely does not exist still throws the frozen error and writes no manifest.

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

<!-- Fix approach and tradeoffs. Keep this short unless the issue changes architecture. -->

### Plan

1. (R1, R2) Extend `resolveOmpInstallPath` (or its caller) so the plugin tree under the resolved root is a receipt source when the registry is absent or lacks the `plugin@marketplace` key: enumerate `<root>/.omp/plugins/cache/plugins/<plugin>___<marketplace>___<version>` and treat its files as owned dests. Keep the registry as the primary source when the key resolves.
2. (R1, R3) Make an empty resolution explain itself: name the roots consulted and whether the registry or the on-disk tree was found, so an omp-version drift is diagnosable from the install output.
3. (R4) Pin the unchanged paths first (registry-present resolution, genuinely-absent tree → frozen error + no manifest), then add the fallback cases.
4. (AC1-AC4) Add the automated cases and run the full gate: `bun run lint`, `bun test` on the touched files, `bun run spur-check`, `bun run build`.
5. (AC5) Re-run the 0140 AC1 E2E (isolated symlink-free HOME, scratch project, `--no-global`) with omp included; revert any registry entry omp writes into the real `~/.omp`.

Verification intent: AC1-AC3 are the automated gate; AC5 is the environment-dependent manual evidence recorded in `## Testing`.

### Root Cause

`resolveOmpInstallPath` (`apps/cli/src/commands/install.ts:1297-1315`) treats `installed_plugins.json` as the only receipt source for the omp target. That assumption matches omp 16.4.2-era behaviour (the docstring at `:1288` records that verification) but not the installed 18.1.19, which materializes the plugin payload under `<root>/.omp/plugins/cache/plugins/` without writing that registry — and which resolves its own home independently of the `HOME` environment variable, so an isolated-home run can write the registry into the real user home instead.

The provenance pipeline then receives zero receipts for omp. Since receipts are the only input to `snapshotFiles`, both inventories are empty, and 0140 R4's both-empty clause throws the frozen error. The failure is therefore not a scope-resolution defect (0140 fixed that seam): it is a receipt-collection assumption about a host CLI whose on-disk layout changed.

### Solution

<!-- Filled during implementation: file:line change map and concise rationale. -->

### Testing

<!-- Filled during verification: regression command(s), outcomes, coverage claim or N/A. -->

### Review

<!-- Filled during review: P1-P4 findings, residual risk, and final disposition. -->

### References

<!-- Links to failing logs, related issues, tasks, docs, or external references. -->

### History
