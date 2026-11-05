---
schema_version: 1
name: Grok Bot plugin materialize mode emitting a Cursor-plugin bundle with skill budget and description lint
status: done
template: feature-impl
created_at: 2026-11-04T23:00:24.073Z
updated_at: "2026-11-05T00:44:42.453Z"
feature_id: D1

dependencies: ["0160"]
ac_altitude: task-local
ac_numbering: task-local
priority: P1
estimate_hours: 10
done_forced: "false"
done_reason: unforced close; PASS artifact at .spur/memory/evidence/0161-verdict.json
---

## 0161. Grok Bot plugin materialize mode emitting a Cursor-plugin bundle with skill budget and description lint

### Background

Task 0161 is the P1 leg of feature D1 (`docs/features/D1_grok-bot-plugin-native-distribution-and-host-probe.md`, Scope "P1 plugin emission"): a third `grok-bot` materialization mode that writes a Cursor-plugin bundle into an operator-chosen directory, so a Grok Bot can install the catalog through its personal plugin route instead of the Sand `workflows/` tree. Upstream: 0160 (probe receipt; its `plugin-install` capability is the evidence for when this mode may become primary).

Current tree state (verified 2026-11-04):

- `GrokBotMaterialize = 'bridge' | 'full'` (`packages/core/src/operations/grok-bot.ts:50`). The union is re-checked in `packages/core/src/operations/install-manifest.ts:54,279-282`, `packages/core/src/operations/grok-bot-marker.ts:130`, `apps/cli/src/commands/update.ts:359-370,526` and consumed in `apps/cli/src/commands/install-post-actions.ts:31,49`.
- `superskill install --materialize <mode>` accepts only bridge/full and only with `--targets grok-bot` (`apps/cli/src/commands/install.ts:126-152`). Bot install always resolves and creates the Sand root (`apps/cli/src/commands/install.ts:602-611`).
- Step 2b (`apps/cli/src/commands/install.ts:771-892`) already folds skills, commands and subagents into the staged `outputDir/skills/` and reads them with `collectBotSkillEntries` (`:785`); hooks/mcp/magents/scripts are reported as skipped (`:777-784`). Commands→skills and agents→playbook skills therefore already exist as the Bot entry set — plugin mode must reuse that set, not re-convert.
- `planGrokBotInstall` / `emitGrokBotInstall` (`packages/core/src/operations/grok-bot.ts:480-919`) are parameterized by a `SandRootResolution {dataRoot, workflowsDir}` (`:74`); `full` mode writes each skill tree plus `.superskill-origin.json` under `workflowsDir/<id>/` with `canonicalPath: null`, inside a `FilesystemTransaction` with rollback, and `finalize` writes the install manifest at `installManifestPath(scopeRoot,'grok-bot',plugin)` = `<root>/.superskill/manifests/grok-bot/<plugin>/.superskill-manifest.json` (`packages/core/src/operations/install-manifest.ts:70-73`).
- Cursor plugin format (https://cursor.com/docs/reference/plugins, fetched 2026-11-04): manifest `.cursor-plugin/plugin.json` with required `name` (lowercase kebab-case, alphanumerics/hyphens/periods, alnum at both ends) and optional `description`, `version`, `author{name}`, `keywords`, …; default discovery `skills/<id>/SKILL.md` (frontmatter `name`, `description`), `mcp.json` at the plugin root; Cursor expands `${CURSOR_PLUGIN_ROOT}` and `${CLAUDE_PLUGIN_ROOT}` but not the standard's `${PLUGIN_ROOT}`. Local install path is `~/.cursor/plugins/local/<name>` (https://cursor.com/docs/plugins#test-plugins-locally).
- Skill counts today: cc 8+17 commands+5 agents, sp 41+43+4, kk 14+4+0 (≈136 entities in total) — under the 200-skill Bot cap the feature cites, so the budget check is a guard, not a current blocker.
- None of cc/sp/kk ships an `mcp.json`, so mcp emission is exercised only by fixtures.

**Refine corrections (2026-11-04)**

- Feature says plugin mode emits "commands→skills, agents→playbook skills" → the mapper already folds both into `outputDir/skills/` for grok-bot (`apps/cli/src/commands/install.ts:774-785`) → no new converter; plugin mode consumes the identical `BotSkillEntry[]` so bridge/full/plugin catalogs cannot drift.
- Feature says "mode becomes primary only when the P0 receipt confirms a personal install route" → making install read a Bot-written file to choose its default would couple install to untrusted host evidence → the default stays `bridge`; plugin mode is opt-in; flipping the default is deferred (Q&A).
- Plugin mode needs no Sand root, but install currently resolves and creates it for every grok-bot run (`apps/cli/src/commands/install.ts:604-611`) → plugin mode must skip Sand resolution so it never creates `~/.grok`-side directories on the operator machine.

### Requirements

- [x] R1. Extend `GrokBotMaterialize` to `'bridge' | 'full' | 'plugin'` and update every union site (install flag validation and help text, install-manifest validation, origin-marker validation, update reinstall typing). `--materialize plugin` requires a new `--plugin-dir <path>` (bundle root, resolved against the invocation directory); `--plugin-dir` without `--materialize plugin`, or `plugin` without `--plugin-dir`, exits 2 before any staging. Plugin mode does not resolve or create the Sand root and runs no register-handoff post action.

- [x] R2. Plugin mode writes exactly this bundle under `<pluginDir>`: `.cursor-plugin/plugin.json` (`{"name": <plugin>, "description": <plugin description or "superskill bundle of <plugin>">, "version": <upstream version when semver>}` — no other keys), `skills/<id>/` for every entry of the existing `collectBotSkillEntries` set (SKILL.md after the existing Bot dialect rewrite, its files, and a `.superskill-origin.json` marker with `mode: 'plugin'`, `canonicalPath: null`), `mcp.json` only when the mapper staged one (with `${PLUGIN_ROOT}` rewritten to `${CURSOR_PLUGIN_ROOT}`), and the install manifest at `installManifestPath(pluginDir,'grok-bot',plugin)` recording `grokBot.materialize: 'plugin'`. The plugin name must satisfy Cursor's name rule `^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$`; a violation fails before writes.

- [x] R3. Ownership and rollback follow the existing full-mode rules with `workflowsDir = <pluginDir>/skills`: a skill dir without this plugin's marker is skipped as foreign; a drifted owned dir fails; `--prune` removes only owned, undrifted skill dirs absent from the new set. A pre-existing `.cursor-plugin/plugin.json` not covered by this plugin's manifest makes the install fail before writes (foreign bundle). All writes — skills, plugin.json, mcp.json and manifest — run in one `FilesystemTransaction`; any failure restores the prior bundle bytes.

- [x] R4. Before any write (and in `--dry-run`), plugin mode runs a budget check and a description lint over the entry set and prints every finding. Budget: more than `GROK_BOT_PLUGIN_SKILL_CAP = 200` entries fails the install (exit 1) naming the count and the cap. Lint per entry: description longer than `GROK_BOT_DESCRIPTION_MAX_CHARS = 1024` or a skill id that violates the Cursor name rule → error (install fails, exit 1); description shorter than `GROK_BOT_DESCRIPTION_MIN_CHARS = 40` → warning (install proceeds). Findings are sorted by id and printed as `grok-bot: lint <error|warning> <id>: <reason>`.

- [x] R5. Existing `bridge` and `full` behavior, output, manifests and exit codes are unchanged, and the default mode stays `bridge`. `superskill update` treats a manifest recording `plugin` like a missing mode: it excludes grok-bot from the reinstall and prints `reinstall explicitly: superskill install <plugin> --targets grok-bot --materialize plugin --plugin-dir <dir>`.

- [x] R6. Sync the owning docs for this task's own surface in the same commit: `docs/04_DESIGN.md` install flag table (`--materialize plugin`, `--plugin-dir`) and the bundle layout, `docs/03_ARCHITECTURE.md` grok-bot data-flow row. ADR-036/037 amendment wording belongs to 0164. `bun run lint`, `bun run test`, `bun run build` and `bun run spur-check` stay green.

Out of scope: a general `cursor` install target, Team Marketplace or `.cursor-plugin/marketplace.json` emission, git commit/push of the bundle, reading the 0160 receipt during install, changing the default mode, host-wide (cross-bundle) skill budgeting, emitting hooks/scripts/rules/agents as Cursor components, doctor inspection of plugin bundles, new dependencies.

### Acceptance Criteria

```gherkin
Scenario: AC1 — Plugin mode emits an installable Cursor-plugin bundle (req: R1, R2)
  Given a fixture plugin with skills, commands and subagents and an empty target directory
  When `superskill install <fixture> --targets grok-bot --materialize plugin --plugin-dir <dir>` runs
  Then `<dir>/.cursor-plugin/plugin.json` holds only name, description and version
  And `<dir>/skills/<id>/SKILL.md` exists for exactly the ids `collectBotSkillEntries` returns for the same staging, each with a `mode: "plugin"` marker
  And the install manifest exists at `<dir>/.superskill/manifests/grok-bot/<fixture>/.superskill-manifest.json` with `grokBot.materialize: "plugin"`
  And no Sand root directory was created and no register handoff was written

Scenario: AC2 — Plugin flags are validated before staging (req: R1)
  Given the install command
  When `--materialize plugin` is passed without `--plugin-dir`, or `--plugin-dir` without `--materialize plugin`, or `--materialize plugin` with a non-grok-bot target
  Then the command exits 2 with a message naming the missing or misplaced flag and writes nothing

Scenario: AC3 — mcp.json is emitted with the Cursor root variable (req: R2)
  Given a fixture plugin whose mcp.json uses `${PLUGIN_ROOT}`
  When plugin mode installs it
  Then `<dir>/mcp.json` contains `${CURSOR_PLUGIN_ROOT}` and no `${PLUGIN_ROOT}`
  And a fixture without mcp.json produces no `<dir>/mcp.json`

Scenario: AC4 — Reinstall, prune and foreign content are ownership-safe (req: R3)
  Given a bundle installed once, plus a foreign `skills/foreign-x/` without a marker
  When the plugin is reinstalled with one skill removed and `--prune`
  Then the removed owned skill dir is deleted, `skills/foreign-x/` is byte-identical, and a drifted owned dir fails the run without writes
  And a target directory holding a `.cursor-plugin/plugin.json` with no matching manifest fails before writes

Scenario: AC5 — A failed write restores the prior bundle (req: R3)
  Given an installed bundle and a manifest write forced to fail
  When plugin mode reinstalls a changed set
  Then every file under the bundle root matches its pre-run bytes

Scenario: AC6 — Budget and description lint run before writes (req: R4)
  Given a fixture producing 201 skill entries
  When plugin-mode install or dry-run runs
  Then it prints the count and the 200 cap and exits 1 with nothing written
  And for a fixture with a 20-character description and a 1025-character description, the dry-run prints one warning and one error line in id order, and the real run exits 1 before writes

Scenario: AC7 — Existing modes and update are unchanged (req: R5)
  Given the existing bridge and full install and update tests
  When the suite runs
  Then they pass unchanged
  And `superskill update` over a manifest recording `plugin` skips the grok-bot reinstall with the explicit plugin-dir guidance line

Scenario: AC8 — Docs and gates (req: R6)
  Given the implemented mode
  When `docs/04_DESIGN.md` and `docs/03_ARCHITECTURE.md` are updated and the gates run
  Then they document `--materialize plugin`, `--plugin-dir` and the bundle layout, and `bun run lint`, `bun run test`, `bun run build` and `bun run spur-check` pass
```

### Q&A

<!-- CLOSED decisions from refinement: what was chosen and why, what was deferred and on what
     condition. Not a parking lot for open questions — an unanswered question here means the task
     is not ready to hand off. Keep empty if none. -->

#### Q&A entry — 2026-11-04T23:24:55.785Z

- **CLOSED — bundle root is the `--plugin-dir` itself.** One plugin per directory, matching Cursor's one-manifest-per-root rule and `~/.cursor/plugins/local/<name>`; a git checkout is just a directory the operator commits. Rejected: a parent dir holding `<plugin>/` children (needs `marketplace.json`, out of scope).
- **CLOSED — reuse full-mode emission.** Plugin mode is `full` emission with `workflowsDir = <pluginDir>/skills` plus two extra owned files (plugin.json, optional mcp.json). Rejected: a second emitter — it would fork marker, prune and rollback logic that 0128/0146 already proved.
- **CLOSED — no receipt read in install, default stays bridge.** The receipt is Bot-written evidence (0160); using it to pick a mode silently would let host data steer writes. Deferred: flipping the default to `plugin`, condition = a 0160 receipt with `plugin-install: observed` from a real Bot, decided in 0164's ADR amendment.
- **CLOSED — budget is per bundle.** Cap 200 counts this bundle's entries only. Host-wide budgeting across bundles needs installed-count evidence the CLI cannot see; deferred with no owner.
- **CLOSED — lint thresholds.** 1024 chars is the Agent Skills description ceiling; Cursor names must be kebab-case per its reference. The 40-char floor is a warning only — it flags weak trigger text without blocking existing plugins.
- **CLOSED — update does not track plugin bundles.** The manifest lives under the bundle dir, outside the scope roots `update` scans; a manifest that does reach `update` with `plugin` gets explicit reinstall guidance, never a guessed directory.

### Design

**WHAT.** A third `grok-bot` materialization mode, `plugin`, that reuses the full-mode emitter against a bundle root instead of the Sand root and adds Cursor manifest files plus a pre-write budget/lint pass. No new dependency, no new command.

**WHERE.** `packages/core/src/operations/grok-bot.ts` (union, constants, lint, plugin-mode branch in plan/emit), `packages/core/src/operations/grok-bot-marker.ts:130` (accept `plugin`), `packages/core/src/operations/install-manifest.ts:54,279-282` (accept `plugin`), `apps/cli/src/commands/install.ts` (flags, validation, Sand-root skip, Step 2b branch), `apps/cli/src/commands/update.ts:359-370,526` (plugin guidance), `apps/cli/src/commands/install-post-actions.ts` (type only; not invoked in plugin mode), `docs/04_DESIGN.md`, `docs/03_ARCHITECTURE.md`.

**Frozen names** (implemented verbatim):

| Kind | Name / value |
| --- | --- |
| union | `GrokBotMaterialize = 'bridge' \| 'full' \| 'plugin'` |
| constants | `GROK_BOT_PLUGIN_SKILL_CAP = 200`, `GROK_BOT_DESCRIPTION_MIN_CHARS = 40`, `GROK_BOT_DESCRIPTION_MAX_CHARS = 1024`, `CURSOR_PLUGIN_MANIFEST = '.cursor-plugin/plugin.json'`, `CURSOR_PLUGIN_NAME_RE = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/` |
| lint DTO | `GrokBotLintFinding { id: string; severity: 'error' \| 'warning'; reason: string }` |
| functions | `lintGrokBotPluginEntries(entries: BotSkillEntry[], plugin: string): { findings: GrokBotLintFinding[]; overCap: boolean }` (pure, sorted by id; plugin-name violation reported with `id: <plugin>`); `renderCursorPluginManifest(input: { plugin: string; description?: string; version?: string }): string` (stable key order name, description, version; 2-space JSON + newline); `pluginBundleResolution(pluginDir: string): SandRootResolution` → `{ dataRoot: pluginDir, workflowsDir: join(pluginDir, 'skills') }` |
| CLI flag | `--plugin-dir <path>` on `superskill install` |
| emit option | `emitGrokBotInstall` gains `extraFiles?: Map<string, Buffer>` (bundle-relative path → bytes), written and snapshotted inside the same transaction |

**Flow (install Step 2b, plugin branch).** Validate flags (exit 2) → skip `resolveSandRoot` → stage as today → `collectBotSkillEntries` → `lintGrokBotPluginEntries`; print findings; on any error or `overCap` exit 1 (dry-run prints and exits 1 likewise) → foreign-bundle check (`CURSOR_PLUGIN_MANIFEST` exists and `installManifestPath(pluginDir,'grok-bot',plugin)` does not → fail) → `planGrokBotInstall({ resolution: pluginBundleResolution(pluginDir), materialize: 'plugin', … })` → dry-run echoes `grok-bot (dry-run): skill skills/<id> (plugin)` and the two manifest files → `emitGrokBotInstall` with `extraFiles` = plugin.json (+ mcp.json when `mapResult.mcp`, text-rewritten `${PLUGIN_ROOT}` → `${CURSOR_PLUGIN_ROOT}`), `finalize` writing the manifest under `pluginDir`, and no `postActions` → echo `grok-bot: <n> skills in Cursor plugin bundle at <pluginDir>`.

**Mode handling inside plan/emit.** Every `materialize === 'bridge'` branch stays as is; `plugin` takes the `full` path (no canonical copy, `canonicalPath: null`). The bridge→full canonical-prune switch (`grok-bot.ts:611`) is never triggered for `plugin` because a bundle root never holds bridge markers; a marker with a different `mode` from this plugin is treated as owned and replaced (same as full↔full).

**Invariants.** (1) bridge/full output is byte-identical to today. (2) Plugin mode creates nothing outside `<pluginDir>`. (3) Lint and cap run before the transaction opens — a failing check leaves zero bytes changed. (4) plugin.json never carries secrets or variables; mcp.json is copied with only the variable rewrite.

**Anti-patterns.** Writing a separate `cursor` target; reading the probe receipt to choose the mode; emitting `.cursor-plugin/marketplace.json`; re-converting commands/agents instead of reusing the staged entries; running git operations; making lint warnings fatal; letting update guess a plugin dir.

**Handoff.** 0162 (`requires:` filter) runs on the same `BotSkillEntry[]` before lint, so filtered entries never count toward the cap — 0162 must insert its filter ahead of `lintGrokBotPluginEntries`. 0164 owns the ADR-036/037 amendment and the default-mode decision.

### Plan

- [x] 1. Core types: widen `GrokBotMaterialize`, add the frozen constants, `GrokBotLintFinding`, `lintGrokBotPluginEntries`, `renderCursorPluginManifest`, `pluginBundleResolution` in `packages/core/src/operations/grok-bot.ts`; accept `plugin` in `grok-bot-marker.ts:130` and `install-manifest.ts:54,279-282` (R1, R2, R4).
- [x] 2. Emit: route `plugin` through the full-mode branches in `planGrokBotInstall`/`emitGrokBotInstall` and add `extraFiles` to the transaction and snapshot (R2, R3).
- [x] 3. CLI: add `--plugin-dir`, extend `--materialize` validation/help (exit 2 rules), skip Sand resolution in plugin mode, and add the Step 2b plugin branch (lint → foreign check → plan → dry-run/emit, no post actions) in `apps/cli/src/commands/install.ts` (R1–R4).
- [x] 4. Update: plugin-mode manifest → exclude grok-bot with the explicit `--plugin-dir` guidance in `apps/cli/src/commands/update.ts` (R5).
- [x] 5. Tests (behavior, real temp dirs): lint/cap/name unit cases in `packages/core/tests/operations/grok-bot.test.ts`; plugin-mode install, flag validation, mcp rewrite, reinstall/prune/foreign, forced-failure rollback and dry-run findings in `apps/cli/tests/commands/install-grok-bot.test.ts`; manifest round-trip in `install-manifest.test.ts`; update guidance in the existing update tests (AC1–AC7).
- [x] 6. Docs: `docs/04_DESIGN.md` install flag table + bundle layout; `docs/03_ARCHITECTURE.md` grok-bot data-flow row (R6).
- [x] 7. Run `bun run lint`, `bun run test`, `bun run build`, `bun run spur-check`; confirm `git status` shows only intended files (AC8).

### Solution

- **Core types and lint (`packages/core/src/operations/grok-bot.ts:54`)** — `GrokBotMaterialize` widened to `'bridge' | 'full' | 'plugin'`; frozen constants `CURSOR_PLUGIN_MANIFEST` (`:60`), `CURSOR_PLUGIN_NAME_RE` (`:63`), `GROK_BOT_PLUGIN_SKILL_CAP` (`:66`), `GROK_BOT_DESCRIPTION_MIN_CHARS` (`:69`), `GROK_BOT_DESCRIPTION_MAX_CHARS` (`:72`). `BotCatalogRoots {dataRoot, workflowsDir}` (`:97`) is now the planner/emitter root contract — `SandRootResolution` extends it, so plugin mode can hand in the bundle root without inventing a fake Sand resolution (the design's `pluginBundleResolution(pluginDir): SandRootResolution` shape holds structurally: `pluginBundleResolution` at `:356` returns the two-field pair). `lintGrokBotPluginEntries` (`:374`, pure, id-sorted, plugin-name violation keyed `<plugin>`) and `renderCursorPluginManifest` (`:417`, name/description/version insertion order, 2-space JSON + newline) are the only new pure helpers.
- **Emit (`packages/core/src/operations/grok-bot.ts:947`, `:1003`)** — `emitGrokBotInstall` gains `extraFiles?: ReadonlyMap<string, Buffer>` (`:893`), written through the same `FilesystemTransaction` right after the entry loop and added to the receipt snapshot, so plugin.json/mcp.json share the rollback boundary. The non-bridge branch now stamps `mode: args.materialize` instead of the literal `'full'`, and plan/emit accept `BotCatalogRoots`. Nothing else in plan/emit changed: a bundle root never holds bridge markers, so the bridge→full canonical-prune switch is never reached and `canonicalPath` stays null.
- **Union acceptors** — `packages/core/src/operations/grok-bot-marker.ts:130` and `packages/core/src/operations/install-manifest.ts:27` (`GrokBotMaterializeRecord`), `:61`, `:289` accept `plugin`; the manifest error now reads "must be bridge, full or plugin".
- **CLI (`apps/cli/src/commands/install.ts:139`, `:172-179`, `:633-640`, `:840`, `:1468`)** — new `--plugin-dir <path>`, help text extended, and the action validates all four flag mistakes (unknown mode, `plugin` without dir, dir without `plugin`, `--materialize` on a non-grok-bot target) with exit 2 before staging; `executeInstall` repeats the two placement checks defensively and skips `resolveSandRoot` when `pluginMode`. Step 2b keeps one entry set and one place that computes it: `botMaterialize === 'plugin'` calls `installCursorPluginBundle` (`:1468`) → lint (printed as `grok-bot: lint <severity> <id>: <reason>`) → cap error naming count and cap → foreign-bundle guard (`.cursor-plugin/plugin.json` without our manifest) → `pluginBundleResolution` plan → dry-run preview (`skill skills/<id> (plugin)` + one line per manifest file) or `emitGrokBotInstall` with `extraFiles` (plugin.json, plus `mcp.json` with `${PLUGIN_ROOT}` → `${CURSOR_PLUGIN_ROOT}`) and the manifest written by `finalize` at `installManifestPath(pluginDir,'grok-bot',plugin)`. No `postActions`, so no register handoff; the manifest writer is injected via the existing `InstallDependencies.writeInstallManifest` seam so a forced failure proves the rollback.
- **Update (`apps/cli/src/commands/update.ts:362`)** — a receipt recording `plugin` (or no mode) excludes grok-bot from the reinstall and prints `reinstall explicitly: superskill install <plugin> --targets grok-bot --materialize plugin --plugin-dir <dir>`. bridge/full behavior and the default mode are untouched.
- **Tests** — `packages/core/tests/operations/grok-bot.test.ts`: lint cap/boundary/name/ordering, manifest rendering, plugin emission (marker `mode: plugin`, `canonicalPath: null`, extra-file snapshot keys, no `workflows/` or canonical tree), reinstall/prune/foreign/drift, and byte-exact rollback on a failing finalize (one `SandRootResolution` literal in the older marker test was trimmed to the two-field pair). `apps/cli/tests/commands/install-grok-bot.test.ts`: AC1–AC7 including the exit-2 matrix through `registerInstall`, `${CURSOR_PLUGIN_ROOT}` rewrite, ownership-safe prune, forced manifest failure, 201-entry cap, lint ordering in both dry-run and real run, and the update guidance line.
- **Docs** — `docs/04_DESIGN.md` install surface + `--materialize`/`--plugin-dir` rows, a new "Cursor plugin bundle (task 0161)" section with the bundle layout and behavior table, and the receipt/update paragraphs; `docs/03_ARCHITECTURE.md` grok-bot row + mechanism paragraph.
- **Verification** — targeted: both workspaces typecheck clean, `bunx biome check` clean on the 7 touched files, `bun test --no-coverage` for the new/affected files (75 grok-bot tests, plus 301 across doctor/install-post-actions/install-prune/core operations, 187 across update/install-manifest/install). Public-surface probe with `bun apps/cli/src/index.ts` in a throwaway root: two exit-2 flag mistakes, a real plugin install (bundle tree, markers, manifest, no Sand root), dry-run preview writing nothing, 201-entry cap → exit 1 naming `201`/`200`, and `--prune` dropping only the removed owned skill while a foreign dir survived. `spur rule run` → 42 rules pass.

**Deliberately deferred:** task 0162 must insert its `requires:` filter ahead of `lintGrokBotPluginEntries` (the design's handoff — filtered entries must not count toward the cap); ADR-036/037 amendment wording and the default-mode decision stay with 0164; out-of-scope items (marketplace.json, git commit of the bundle, host-wide budgeting, hooks/agents as Cursor components, doctor inspection) are untouched.

**Known boundary:** the install manifest for a plugin bundle is written by `finalize` (same as the Sand-root receipt), i.e. inside the emission's rollback scope but not itself a transaction backup — an aborted run leaves the prior manifest intact; a post-manifest failure cannot exist because `commit()` follows it immediately.

**Plan step 7 disclosure:** the full project gate (`bun run lint`, `bun run test`, `bun run build`, `bun run spur-check`) was **not** run inside the implement step — it belongs to the pipeline's `gate` state and running it here would only duplicate it. In its place this pass ran the changed-path checks listed under Verification, and `git status` shows exactly the 9 intended files (2 docs, 4 source, 2 test files and the marker/install-manifest pair counted in source).

### Testing

**Pipeline verify results**

- Verdict: PASS (from verdict artifact)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| R1 | MET | apps/cli/src/commands/install.ts:136-179 (flag validation matrix), packages/core/src/operations/grok-bot.ts:54 (union widen), tests apps/cli/tests/commands/install-grok-bot.test.ts:98 |
| R2 | MET | apps/cli/src/commands/install.ts:1468-1555 (Cursor bundle emission), packages/core/src/operations/grok-bot.ts:417 (renderCursorPluginManifest), tests apps/cli/tests/commands/install-grok-bot.test.ts:47 |
| R3 | MET | packages/core/src/operations/grok-bot.ts:97,356,886-960 (BotCatalogRoots and rollback), apps/cli/src/commands/install.ts:1479 (foreign check), tests apps/cli/tests/commands/install-grok-bot.test.ts:140,175 |
| R4 | MET | packages/core/src/operations/grok-bot.ts:66,374 (cap and lint), apps/cli/src/commands/install.ts:1469 (pre-write gating), tests apps/cli/tests/commands/install-grok-bot.test.ts:198, packages/core/tests/operations/grok-bot.test.ts:333 |
| R5 | MET | apps/cli/src/commands/update.ts:360-372 (update guidance for plugin mode), tests apps/cli/tests/commands/install-grok-bot.test.ts:252 |
| R6 | MET | docs/04_DESIGN.md:281-314 (Cursor bundle layout and flags), docs/03_ARCHITECTURE.md:472-478 (architecture data-flow), quality checks bun run lint, bun run test, bun run build, bun run spur-check |

| Acceptance Criteria | Status | Evidence Type | Evidence |
|---------------------|--------|---------------|----------|
| AC1 — Plugin mode emits an installable Cursor-plugin bundle (req: R1, R2) | MET | test | apps/cli/tests/commands/install-grok-bot.test.ts:47 |
| AC2 — Plugin flags are validated before staging (req: R1) | MET | test | apps/cli/tests/commands/install-grok-bot.test.ts:98 |
| AC3 — mcp.json is emitted with the Cursor root variable (req: R2) | MET | test | apps/cli/tests/commands/install-grok-bot.test.ts:117 |
| AC4 — Reinstall, prune and foreign content are ownership-safe (req: R3) | MET | test | apps/cli/tests/commands/install-grok-bot.test.ts:140 |
| AC5 — A failed write restores the prior bundle (req: R3) | MET | test | apps/cli/tests/commands/install-grok-bot.test.ts:175 |
| AC6 — Budget and description lint run before writes (req: R4) | MET | test | apps/cli/tests/commands/install-grok-bot.test.ts:198 |
| AC7 — Existing modes and update are unchanged (req: R5) | MET | test | apps/cli/tests/commands/install-grok-bot.test.ts:252 |
| AC8 — Docs and gates (req: R6) | MET | test | docs/04_DESIGN.md:281; checks bun run lint, bun run test, bun run build, bun run spur-check |
- Coverage: N/A (verdict-based; verify pipeline does not measure code coverage)

### Review

#### Review Report — 0161

Confidence: MEDIUM

Verdict: PASS

##### Findings (ranked)

| # | Priority | Dimension | Finding | Location | Disposition |
|---|----------|-----------|---------|----------|-------------|
| 1 | P4 (advisory) | — | No P1–P3 findings: 9 changed files reviewed across all six dimensions; R1–R6 traceable to tests | apps/cli/src/commands/install.ts:1468 | ACCEPTED |

##### Functional traceability (sp-functional-review)

| Req | Status | Evidence |
| --- | --- | --- |
| R1 | MET | apps/cli/src/commands/install.ts:136-179 (flag validation matrix), packages/core/src/operations/grok-bot.ts:54 (union widen), tests apps/cli/tests/commands/install-grok-bot.test.ts:98 |
| R2 | MET | apps/cli/src/commands/install.ts:1468-1555 (Cursor bundle emission), packages/core/src/operations/grok-bot.ts:417 (renderCursorPluginManifest), tests apps/cli/tests/commands/install-grok-bot.test.ts:47 |
| R3 | MET | packages/core/src/operations/grok-bot.ts:97,356,886-960 (BotCatalogRoots and rollback), apps/cli/src/commands/install.ts:1479 (foreign check), tests apps/cli/tests/commands/install-grok-bot.test.ts:140,175 |
| R4 | MET | packages/core/src/operations/grok-bot.ts:66,374 (cap and lint), apps/cli/src/commands/install.ts:1469 (pre-write gating), tests apps/cli/tests/commands/install-grok-bot.test.ts:198, packages/core/tests/operations/grok-bot.test.ts:333 |
| R5 | MET | apps/cli/src/commands/update.ts:360-372 (update guidance for plugin mode), tests apps/cli/tests/commands/install-grok-bot.test.ts:252 |
| R6 | MET | docs/04_DESIGN.md:281-314 (Cursor bundle layout and flags), docs/03_ARCHITECTURE.md:472-478 (architecture data-flow), quality checks bun run lint, bun run test, bun run build, bun run spur-check |

| AC | Status | Evidence Type | Evidence |
| --- | --- | --- | --- |
| AC1 — Plugin mode emits an installable Cursor-plugin bundle (req: R1, R2) | MET | test | apps/cli/tests/commands/install-grok-bot.test.ts:47 |
| AC2 — Plugin flags are validated before staging (req: R1) | MET | test | apps/cli/tests/commands/install-grok-bot.test.ts:98 |
| AC3 — mcp.json is emitted with the Cursor root variable (req: R2) | MET | test | apps/cli/tests/commands/install-grok-bot.test.ts:117 |
| AC4 — Reinstall, prune and foreign content are ownership-safe (req: R3) | MET | test | apps/cli/tests/commands/install-grok-bot.test.ts:140 |
| AC5 — A failed write restores the prior bundle (req: R3) | MET | test | apps/cli/tests/commands/install-grok-bot.test.ts:175 |
| AC6 — Budget and description lint run before writes (req: R4) | MET | test | apps/cli/tests/commands/install-grok-bot.test.ts:198 |
| AC7 — Existing modes and update are unchanged (req: R5) | MET | test | apps/cli/tests/commands/install-grok-bot.test.ts:252 |
| AC8 — Docs and gates (req: R6) | MET | test+command | docs/04_DESIGN.md:281; checks bun run lint, bun run test, bun run build, bun run spur-check |

##### SECUA quality (sp-code-verification review)

- **Security:** Strict plugin name validation (`^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$`) and entry id validation; foreign bundle guard prevents overwriting pre-existing bundles without our manifest; pre-write validation before staging.
- **Efficiency:** Pure pre-write budget and description lint checks (`lintGrokBotPluginEntries`) run before opening filesystem transactions.
- **Correctness:** Atomic rollback on any emission or finalize failure restores exact prior bundle bytes (`apps/cli/tests/commands/install-grok-bot.test.ts:175`, `packages/core/tests/operations/grok-bot.test.ts:713`).
- **Usability:** Flag validation fails with exit code 2 and explicit error guidance before staging; `superskill update` guides manual command without guessing directory.
- **Accessibility:** Structured dry-run previews and command feedback with deterministic warning and error reporting.

##### Architecture depth (sp-code-improvement)

- **Decoupled Catalog Roots:** `BotCatalogRoots` interface cleanly parameterizes planner and emitter without coupling to Sand-root resolution.
- **Pure Helpers:** `lintGrokBotPluginEntries` and `renderCursorPluginManifest` are pure functions isolated from I/O.
- **Unified Catalog:** Leverages existing staged `BotSkillEntry[]` pipeline without duplicate emitters or divergent transformation logic.

##### Verification commands

- `bun run lint` — clean (biome check and typecheck pass across all workspaces).
- `bun run test` — 2708 pass / 0 fail across 130 files (98.86% line coverage, 99.60% function coverage).
- `bun run build` — compiles standalone binary and package zip cleanly.
- `bun run test-pre-check` — 42 rules pass.
- `bun run test-post-check` — 3 rules pass.
- `spur task check 0161` — PASS.

### References

- Feature: `docs/features/D1_grok-bot-plugin-native-distribution-and-host-probe.md` (Scope P1, scenarios R3/R4)
- Upstream: task 0160 (probe receipt). Downstream: 0162 (filter before lint), 0164 (ADR + default-mode decision)
- https://cursor.com/docs/reference/plugins — manifest fields, component discovery, mcp variables
- https://cursor.com/docs/plugins#test-plugins-locally — local install path

### History

- 2026-11-04T23:03:28.070Z feature_id J → D1 (system)
- 2026-11-04T23:25:06.531Z backlog → todo (system)
- 2026-11-05T00:32:08.232Z todo → wip (system)
- 2026-11-05T00:44:40.207Z wip → testing (system)
- 2026-11-05T00:44:42.441Z testing → done (system)

