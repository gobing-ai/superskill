---
template: feature-impl
schema_version: 1
name: "Rewrite flattened dest markdown links and add plugin-scoped install prune"
description: ""
status: done
type: task
profile: standard
feature_id: F7
parent_wbs: null
priority: P1
tags: []
dependencies: []
ac_numbering: task-local
created_at: "2026-08-13T01:35:42.751Z"
updated_at: "2026-08-13T02:26:38.679Z"
---

## 0114. Rewrite flattened dest markdown links and add plugin-scoped install prune

### Background
Flattened `superskill install` dests turn plugin commands into single-file skills under a shared skills root (`~/.agents/skills/<plugin>-<name>/SKILL.md`). Command bodies still carry repo-relative links such as `../skills/spur-dev/references/flag-glossary.md`. Those resolve in the plugin tree (Claude Code / Grok / OMP native dests) but not after flatten: the dest-correct sibling is `../sp-spur-dev/references/flag-glossary.md`. Agents then miss the file (often looking under the command dest `sp-dev-run/references/`, which is never created).

A second dest-fidelity gap: rulesync is invoked with `delete: false` and `writeAiDirs` merges in place, so renamed or deleted source entities remain (`sp-dev-findissue`, stale files inside `sp-spur-dev/references/`). Enabling rulesync `delete: true` is unsafe because the dest root is shared across plugins.

This task closes both gaps in superskill only. Native plugin dests must keep the original repo-relative paths so Claude Code, Grok, and OMP continue to resolve `../skills/<name>/…` against the preserved plugin tree.

Rubric: E2 D1 L1 C1 R2 = 7 → one task (same dest-fidelity contract; rewrite + prune land together).
### Requirements
- [ ] R1. Add a dest-relative markdown-link rewriter for plugin-tree paths (`../skills/<name>/…`, `plugins/<plugin>/skills/<name>/…`) that rewrites to `../<plugin>-<name>/…` on the flattened skills floor only.
- [ ] R2. Never apply that rewriter to native plugin-tree dests (claude, grok, omp). Their dest command/agent files must keep the source repo-relative paths byte-identical for those links.
- [ ] R3. Do not copy or symlink a wrapped skill's `references/` (or other companions) into command-as-skill or subagent-as-skill dest dirs.
- [ ] R4. Add `superskill install --prune` that removes dest skill dirs matching `<plugin>-*` that are not in the mapped name set for this install.
- [ ] R5. `--prune` must replace remaining `<plugin>-*` dest skill dirs (clean-before-write) so intra-dir leftovers disappear; other plugins' dest dirs are untouched.
- [ ] R6. Default install (no `--prune`) keeps `runRulesync({ delete: false })` and must not wipe the shared skills root.
- [ ] R7. Document `--prune`, the flattened rewrite, and the native exemption in `docs/help/cmd_install.md` in the same commit as the surface change.
### Acceptance Criteria
```gherkin
Feature: Install dest fidelity: flattened path rewrite + plugin-scoped prune

  @core
  Scenario: R1 — Flattened dest rewrites plugin-tree markdown links to dest-sibling skill paths
    Given a plugin command whose body links to `../skills/spur-dev/references/flag-glossary.md`
    When the operator installs the plugin for a flattened-skills target (codex, pi, opencode, hermes, or antigravity)
    Then the dest command-as-skill body links to `../<plugin>-spur-dev/references/flag-glossary.md` and that dest file exists

  @core
  Scenario: R2 — Native plugin dests keep repo-relative plugin-tree paths unchanged
    Given the same plugin command with `../skills/spur-dev/references/flag-glossary.md`
    When the operator installs the plugin for a native plugin-tree target (claude, grok, or omp)
    Then the dest command file still contains `../skills/spur-dev/references/flag-glossary.md` and the dest plugin tree still has `skills/spur-dev/references/flag-glossary.md`

  @core
  Scenario: R3 — Command-as-skill dests do not receive a copy of the wrapped skill references
    Given a command that wraps a skill which owns `references/`
    When the operator installs for a flattened-skills target
    Then the dest command-as-skill directory contains `SKILL.md` only and does not grow a `references/` copy of the wrapped skill

  @core
  Scenario: R4 — Prune removes leftover dest skill dirs for the installing plugin only
    Given dest `~/.agents/skills/` contains `sp-dev-findissue` (renamed away in source) plus `cc-cc-skills` from another plugin
    When the operator runs `superskill install sp --prune` for a flattened-skills target
    Then `sp-dev-findissue` is removed and `cc-cc-skills` remains

  @core
  Scenario: R5 — Prune replaces remaining plugin dest dirs so intra-dir leftovers disappear
    Given dest `sp-spur-dev/references/debugging.md` exists but the source skill no longer ships that file
    When the operator runs `superskill install sp --prune` for a flattened-skills target
    Then `sp-spur-dev/references/debugging.md` is gone and current source reference files are present

  @core
  Scenario: R6 — Install without prune still never enables rulesync shared-root delete
    Given dest leftovers from a prior install
    When the operator runs `superskill install sp` without `--prune`
    Then rulesync is still invoked with `delete: false` and leftover dest files remain

  @core
  Scenario: R7 — Docs record the dest rewrite rule, the native exemption, and --prune
    Given the dest-fidelity change lands
    When the operator reads `docs/help/cmd_install.md`
    Then the flag table lists `--prune` and the help states that native plugin dests keep repo-relative paths
```
### Q&A
**Closed 2026-08-13 (operator):**

- **Native dests must not be rewritten.** Claude Code, Grok, and any other native plugin-tree target keep repo-relative links (`../skills/<name>/…`) so the preserved plugin tree continues to resolve them. Do not "fix" those dests by rewriting or by copying companions next to commands.
- **Flattened dests rewrite in place.** Codex / Pi / OpenCode / Hermes / Antigravity (and any other dest that downgrades commands to `~/.agents/skills/<plugin>-<name>/SKILL.md`) rewrite those links to dest-sibling paths (`../<plugin>-<name>/…`).
- **No companion copy.** Do not duplicate `spur-dev/references/` into each `sp-dev-*` command dest.
- **No rulesync `delete: true`.** Shared skills roots hold other plugins. Cleanup is plugin-scoped `--prune` only.
- **One task.** Rewrite + prune are one dest-fidelity contract; do not split unless implementation blocks.

**Deferred:**

- Mapper copy of `examples/`, `agents/openai.yaml`, `metadata.openclaw` (companion allow-list) — not required to fix the Read miss.
- Source-side link style in consumer plugins (spur-new commands) — optional later; dest rewrite is the SSOT.
### Design
**Approach.** Two install-time seams, both split by dest class.

1. **Path rewrite (flattened only).** Add `rewritePluginTreeMarkdownLinks(content, pluginName)` next to `rewrite-references.ts`. Match markdown destinations (and bare repo-relative paths) of the form:
   - `../skills/<name>/…` → `../<plugin>-<name>/…`
   - `plugins/<plugin>/skills/<name>/…` → `../<plugin>-<name>/…`
   Leave `plugin:name` colon rewriting to the existing rewriter. Call the new rewriter from `adaptCommandToSkill` / `adaptSubagentToSkill` (and any per-target markdown transform that already runs on flattened skill bodies). Do **not** call it on the source plugin tree passed to `claude plugin install` / `grok plugin install` / `omp plugin install`.

2. **Dest-class split.** Native class = `{claude, grok, omp}` — dest is the Claude-format plugin tree; skip rewrite. Flattened class = `{codex, pi, opencode, hermes, antigravity-cli, antigravity-ide}` — dest is a skills root; apply rewrite. If a later native target is added, it inherits the skip unless it also flattens.

3. **`--prune`.** After mapping, the install knows the dest name set (`<plugin>-<skill|command|agent>`). For each flattened skills dest this run writes (`TARGET_GLOBAL_SKILLS_RELDIR` / project twin, plus Hermes `~/.hermes/skills/`):
   - delete dest dirs whose name matches `^<plugin>-` and is **not** in the mapped set
   - for dest dirs that **are** in the mapped set, `rmSync` then write (same pattern as `stagePluginScripts` for `~/.agents/scripts/<plugin>/`)
   Never walk dest dirs that do not start with `<plugin>-`. Never pass `delete: true` to rulesync.

**Invariants.**

- Native dest command/agent files keep source repo-relative plugin-tree links.
- Flattened dest command/agent `SKILL.md` links resolve to a sibling dest skill that this same install wrote.
- Shared skills roots remain multi-plugin; prune cannot delete `cc-*` while installing `sp`.
- Default reinstall stays additive (leftovers remain) unless `--prune` is passed.

**Rejected.** Copy/symlink `references/` into every command dest (N-way duplication). Flip rulesync `delete: true` (wipes other plugins). Rewrite inside the source plugin before native install (breaks Claude/Grok/OMP).

**Surfaces.** `packages/core/src/pipeline/` (new rewriter + adapt-command/adapt-subagent), `packages/core/src/rulesync.ts` (stay `delete: false`), `apps/cli/src/commands/install.ts` (`--prune` + dest prune helper), `docs/help/cmd_install.md`, unit tests beside mapper/adapt/install.
### Plan
1. Add `rewritePluginTreeMarkdownLinks` with unit tests: `../skills/foo/a.md` → `../<plugin>-foo/a.md`; `plugins/<plugin>/skills/foo/a.md` → `../<plugin>-foo/a.md`; `node:fs` / `sp:foo` / already-dest `../sp-foo/…` unchanged.
2. Wire the rewriter into command/subagent adapt used for the flattened skills floor only. Prove adapt tests do not run it on a native-tree fixture.
3. Add `--prune` to `superskill install`. Implement plugin-scoped dest prune (orphan `<plugin>-*` dirs + replace remaining `<plugin>-*` dirs) on every flattened skills dest this run writes. Safety: `assertSafePathSegment(plugin)` before any `rmSync`.
4. Tests: isolated temp dest — leftover `demo-oldcmd/` removed, `cc-other/` kept, stale file inside `demo-skill/references/` removed, `runRulesync` still called with `delete: false` when `--prune` is absent.
5. Update `docs/help/cmd_install.md` flag table + dest-class note (native keep repo paths; flattened rewrite).
6. `spur task check 0114` stays green; no source edits in spur-new.
### Solution
Two install-time seams, split by dest class. The mapper output (`.rulesync/`) only feeds flattened dests (native installs read `pluginRoot` directly), so the rewrite is gated structurally — no per-target flag.

**R1/R2/R3 — flattened dest path rewrite (`packages/core/src/pipeline/rewrite-plugin-tree-links.ts:26`).**
- `rewritePluginTreeMarkdownLinks(content, pluginName)` rewrites `../skills/<name>/…` → `../<plugin>-<name>/…` and `plugins/<plugin>/skills/<name>/…` → `../<plugin>-<name>/…` using lookaheads so adjacent links on one line both rewrite. Leaves `node:fs`/`bun:test` colons, `plugin:name` colon refs (owned by `rewriteSkillReferences`), already-dest paths, and other-plugin repos untouched.
- Wired into `adaptCommandToSkill` + `adaptSubagentToSkill` after `rewriteSkillReferences` (`adapt-command.ts:32`, `adapt-subagent.ts:39`).
- R3 (no companion copy): mapper writes only `SKILL.md` for command/agent dest dirs — unchanged.

**R4/R5/R6 — plugin-scoped `--prune` (`apps/cli/src/commands/install.ts:396`, helper at `:1291`).**
- New `--prune` flag → `InstallOptions.prune`. Runs BEFORE the rulesync write loop (clean-before-write).
- `prunePluginDestSkills`: reads mapped `<plugin>-*` name set; for each flattened skills dest this run writes (codex/pi shared `~/.agents/skills`, opencode, antigravity-cli, antigravity-ide, hermes — path-deduped), (a) deletes orphan `<plugin>-*` dirs not in mapped set, (b) deletes-and-replaces mapped dirs so intra-dir leftovers vanish. `assertSafePathSegment(plugin)` before any `rmSync`. Other plugins' dirs never match `^<plugin>-`, so untouched.
- Native dests (claude/grok/omp) excluded via `FLATTENED_PRUNE_TARGETS`. Default install (no `--prune`) stays additive.
### Testing
- `packages/core/tests/pipeline/rewrite-plugin-tree-links.test.ts` (NEW, 16 cases, 100% line+fn): positive rewrites for both source shapes; adjacency (two links/line); negatives for `node:fs`, `bun:test`, `plugin:name` colon refs, already-dest paths, other-plugin repos, plain prose. Proves residual negatives carry the competing half.
- `packages/core/tests/pipeline/adapt-command.test.ts` (+1 case): proves `rewritePluginTreeMarkdownLinks` runs end-to-end inside `adaptCommandToSkill` — a command body with `../skills/foo/references/x.md` lands as `../<plugin>-foo/references/x.md` in the dest SKILL.md.
- `apps/cli/tests/commands/install-prune.test.ts` (NEW, 5 cases): R4 (orphan removed, other-plugin kept), R5 (intra-dir stale file replaced), R6 (no-prune additive default), dry-run removes nothing, native claude dest untouched. Uses a mock rulesync that writes the mapped skill so the prune→write ordering is exercised.
- Full suite: 2031 pass, 0 fail. New code 100% coverage. coverage-gate post-check rule green.
### Review
SECUA + functional traceability against R1–R7. Self-verified against the full gate.

**Post-fix verdict:** PASS (0 P1, 0 P2, 0 P3, all R1–R7 MET).


| Priority | Check | Severity | Evidence |
| -------- | ----- | -------- | -------- |
| P1 | functional-traceability | — | R1–R7 all MET (see requirements below) |
| P1 | secua-security | — | assertSafePathSegment(plugin) before any rmSync; --prune matches only ^<plugin>- dirs; no path traversal, no other-plugin deletion |
| P2 | secua-correctness | — | prune runs BEFORE rulesync write loop (clean-before-write); codex/pi shared root path-deduped |
| P2 | design-conformance | — | matches Design: rewrite seam = mapper feeds flattened dests only; native dests structurally exempt |
| P3 | scope-creep | — | changes limited to R1–R7; pre-existing Stage 2 mapping-table doc drift in cmd_install.md flagged, not actioned |
| P3 | secua-architecture | — | Pi-native / Codex-native adapters intentionally NOT wired (native agent files, not flattened skills) |
| P4 | tests-pass | — | bun run test: 2031 pass, 0 fail, 5615 expect() calls across 104 files |
| P4 | lint-clean | — | bun run lint: Biome checked 220 files; core and CLI typechecks exited 0 |
| P4 | build-pass | — | bun run build: bundle (842 modules) + compile to dist/superskill exited 0 |
| P4 | spur-check | — | 32 pre-check rules + corpus (0 new/0 stale standalone) + 3 post-check rules passed |
| P4 | coverage | — | rewrite-plugin-tree-links.ts 100% line+fn; coverage-gate post-check green |


- **R1** (../skills rewrite) — MET. `packages/core/src/pipeline/rewrite-plugin-tree-links.ts:26`; 16 unit cases + adapt-command flow test.
- **R2** (plugins/\<plugin\>/skills rewrite) — MET. Same rewriter, same lookahead path.
- **R3** (no companion copy) — MET. `packages/core/src/mapper.ts:223-261` emits SKILL.md-only for command/agent dest dirs.
- **R4** (--prune removes orphans, keeps other plugins) — MET. `apps/cli/src/commands/install.ts:1291`; install-prune.test R4.
- **R5** (replaces remaining dirs) — MET. `apps/cli/src/commands/install.ts:1291`; install-prune.test R5.
- **R6** (additive default + native exemption) — MET. `apps/cli/src/commands/install.ts:396`; FLATTENED_PRUNE_TARGETS; install-prune.test R6 + claude-native.
- **R7** (docs) — MET. `docs/help/cmd_install.md:25,147,57`.


- Stage 2 mapping table in `cmd_install.md` shows commands/agents as separate `.rulesync/commands|subagents` entries, but code adapts them into `skills/<plugin>-<name>/SKILL.md`. Pre-existing drift; route to a doc-evolve task.
- `bun run corpus-check` flakes in script context (`unknown command 'task'`) but `spur task check --corpus` standalone passes — pre-existing bun→spur resolution issue.
### References
- Feature F7 — `docs/features/F7_install-dest-fidelity-flattened-path-rewrite-plugin-scoped-prune.md`
- Mapper flatten: `packages/core/src/mapper.ts` (skills copy `scripts|references|templates|assets`; commands/agents write `SKILL.md` only)
- Colon rewriter (do not overload): `packages/core/src/pipeline/rewrite-references.ts`
- Command adapt: `packages/core/src/pipeline/adapt-command.ts`
- rulesync delete hard-off: `packages/core/src/rulesync.ts` (`delete: false`)
- rulesync merge write: `vendors/rulesync/src/types/dir-feature-processor.ts` `writeAiDirs`
- Plugin-scoped clean precedent: `stagePluginScripts` in `apps/cli/src/commands/install.ts`
- Native dests: Claude / Grok / OMP host plugin install (full plugin tree)
- Prior adapt work: task 0044 (command/subagent → skills floor)
### History
- 2026-08-13T02:26:28.061Z todo → wip (system)
- 2026-08-13T02:26:38.425Z wip → testing (system)
- 2026-08-13T02:26:38.679Z testing → done (system)
