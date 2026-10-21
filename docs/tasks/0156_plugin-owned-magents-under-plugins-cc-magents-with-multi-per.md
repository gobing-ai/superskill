---
schema_version: 1
name: Plugin-owned magents under plugins/cc/magents with multi-persona install
status: done
template: feature-impl
created_at: 2026-10-21T18:20:05.475Z
updated_at: "2026-10-21T20:46:26.814Z"
feature_id: F31
priority: P2
tags:
  - magent
  - install
  - cc
estimate_hours: 6

done_forced: "false"
done_reason: unforced close; PASS artifact at .spur/memory/evidence/0156-verdict.json
---

## 0156. Plugin-owned magents under plugins/cc/magents with multi-persona install

### Background

Feature F31 (under F3 — `superskill install`). Persona packages were moved out of the cc plugin to a marketplace-root `magents/` (ADR-034) for strict Claude Code plugin layout. That blocks hosting more than one persona (coding, content creation, travel planning, …) as plugin-owned content. Plugin-tree staging already exists (`packages/core/src/mapper.ts:271`, `nameMode:'plugin-prefixed'`), so moving the package back makes the root-scan path (`apps/cli/src/commands/install.ts:1276-1284`) dead.

Hard constraint: `superskill install cc --verbose --magent team-stark-children --marketplace ~/.bun/install/global/node_modules/@gobing-ai/superskill` keeps working unchanged.

Design satellite: `docs/design/quiet-guard-and-plugin-magents.md` § Track B. Decision: ADR-041 (Proposed → this task flips it to Accepted).

Implements F31: R1 — Persona package lives under the cc plugin tree; R2 — Existing install command still installs the primary persona; R3 — Root magents discovery and references are removed; R4 — Install without a persona flag lists choices when several personas ship; R5 — Personas coexist by install scope; R6 — Switching personas in one scope loads only the new persona; R7 — Available personas are listable; R8 — Decision record and docs describe plugin-owned personas.

### Requirements

- [x] R1. `git mv magents/team-stark-children plugins/cc/magents/team-stark-children`; the root `magents/` directory no longer exists. Update the package README's authoring sentence ("Author in this repository's `magents/`") to the new path.
- [x] R2. Remove marketplace-root discovery: install Step 5 root scan (`install.ts:1276-1284`), the `nameMode` option of `stageMagentsFromDir` (`mapper.ts:432-454`; always plugin-prefixed), and the "bare marketplace name" wording in `emitMagents` comments/errors (`install.ts:1879-1896`).
- [x] R3. Remove bundling: `"magents/"` from `apps/cli/package.json` `files` (`:29`); `magents` from the `rm -rf` and the trailing `&& cp -r ../../magents magents` in `build:bundle` (`:37`); `/apps/cli/magents/` from `.gitignore:161`.
- [x] R4. `resolveContentPath` magent branch (`packages/core/src/content/identity.ts:96-102`): after `<base>/magents/<name>`, scan `<base>/plugins/*/magents/<name>` (sorted, first hit wins) and resolve with the existing `resolveMagentPackageEntry`.
- [x] R5. `emitMagents` selection without `--magent`: exactly one plugin-owned staged package ⇒ auto-select (unchanged); ≥2 ⇒ write nothing and print **one non-verbose stdout line**: `  Magents: <a>, <b> available — pass --magent <name> to install one` (bare names, `<plugin>-` prefix stripped). Zero ⇒ silent no-op (verbose note as today).
- [x] R6. New flag `--list-magents` on `superskill install <plugin>` (`install.ts:97-122` option block; precedent `skill.ts:458` `--list`): after plugin root resolution, print one line per `<pluginRoot>/magents/<dir>` as `<name>\t<description>` (description = first non-blank, non-heading line of the package `README.md`, trimmed, ≤ 100 chars; empty if no README), then return before any staging/write. Exit 0; prints nothing extra when there are no personas except `No magents in plugin '<plugin>'`.
- [x] R7. Coexistence and switching need **no new code**: global vs project destination already comes from `options.global` (`install.ts:1925`); switching overwrites `CLAUDE.md` which alone decides `@import`s. Lock both with tests (R5/R6 scenarios).
- [x] R8. Same-commit doc sync: ADR-041 Status → Accepted (supersedes the root-`magents/` clause of ADR-034); `04_DESIGN.md:87` install synopsis gains `[--list-magents]`; `docs/help/cmd_install.md`, `bundled_plugin.md`, `release.md:24-47`, `cmd_magent.md`, `plugins/cc/README.md:65-67`, `plugins/cc/rules/README.md:31`, `plugins/cc/skills/cc-magents/references/platform-compatibility.md:151`, `docs/design/quiet-guard-and-plugin-magents.md` § B. Root `README.md` only if it names the old path.

### Acceptance Criteria

- [x] AC1 — Persona package lives under the cc plugin tree
- [x] AC2 — Existing install command still installs the primary persona
- [x] AC3 — Root magents discovery and references are removed
- [x] AC4 — Install without a persona flag lists choices when several personas ship
- [x] AC5 — Personas coexist by install scope
- [x] AC6 — Switching personas in one scope loads only the new persona
- [x] AC7 — Available personas are listable
- [x] AC8 — Decision record and docs describe plugin-owned personas

### Q&A

<!-- CLOSED decisions from refinement: what was chosen and why, what was deferred and on what
     condition. Not a parking lot for open questions — an unanswered question here means the task
     is not ready to hand off. Keep empty if none. -->

#### Q&A entry — 2026-10-21T19:07:02.613Z

- **Listing surface: `install --list-magents` or `superskill magent list`?** `install <plugin> --list-magents`. It answers "what can `--magent` take for this plugin", reuses marketplace/plugin resolution, and follows the `skill --list` precedent (`apps/cli/src/commands/skill.ts:458`). `superskill magent` stays the authoring lifecycle (scaffold/validate/evaluate/refine/evolve).
- **Delete the previous persona's stale layer files on switch?** No (dropped from scope). Claude loads only what `CLAUDE.md` `@import`s; other targets get one assembled file. Leftover `SOUL.md` etc. are inert. Revisit if a target ever loads every `*.md` in its config dir.
- **Shared layers across personas (one `USER.md`)?** Deferred until a second persona actually exists (YAGNI).
- **Does Claude Code choke on an unknown `plugins/cc/magents/` dir?** Verify with `claude plugin validate plugins/cc` in AC1; if it errors, stop and surface — do not rename the directory silently.
- **Why plugin-prefixed staging names (`cc-team-stark-children`)?** Existing behavior; `--magent team-stark-children` still matches via `endsWith('-<name>')` (`install.ts:1893`). Prefix avoids cross-plugin collisions.
- **Order vs 0155/0157?** Independent of 0155. 0157 edits the persona's `AGENTS.md` at whatever path is current; if 0156 lands first the path is `plugins/cc/magents/team-stark-children/AGENTS.md`.

### Design

**Flow after the change:** `executeInstall` (`install.ts:561`) → `mapPluginToRulesync(pluginRoot, …)` stages `<pluginRoot>/magents/*` as `.rulesync/magents/<plugin>-<name>` (`mapper.ts:271`) → `emitMagents` (`install.ts:1866`) selects and writes. The root-scan block at `:1276-1284` disappears; nothing else stages magents.

**`--list-magents`** — handled inside `executeInstall` right after `const pluginRoot = resolution.pluginRoot;` (`install.ts:693`), before staging:
```ts
if (options.listMagents) {
    const dir = join(pluginRoot, 'magents');
    const names = existsSync(dir) ? readdirSync(dir).filter((e) => statSync(join(dir, e)).isDirectory()).sort() : [];
    if (names.length === 0) echo(`No magents in plugin '${plugin}'`);
    for (const name of names) echo(`${name}\t${readMagentDescription(join(dir, name))}`);
    return;
}
```
`readMagentDescription(pkgDir)`: read `README.md` if present, return first line that is non-blank and does not start with `#`, trimmed and sliced to 100. Local helper in `install.ts` (single caller). Add `listMagents?: boolean` to `InstallOptions` and pass `options.listMagents === true` from the action (`install.ts:147-161`).

**Selection message (R5)** replaces the verbose-only branch at `install.ts:1912-1919`:
```ts
const names = pluginOwned.map((s) => s.slice(plugin.length + 1));
echo(`  Magents: ${names.join(', ')} available — pass --magent <name> to install one`);
return written;
```
(No `--verbose` gate: the user must learn why no main-agent file was written.) Delete the `staged.length === 0` branch inside the else — `staged.length === 0` already returned at `:1877`.

**Identity resolution (R4)** in `identity.ts` magent branch:
```ts
const pluginsDir = join(base, 'plugins');
if (existsSync(pluginsDir)) {
    for (const p of readdirSync(pluginsDir).sort()) {
        const pkg = join(pluginsDir, p, 'magents', name);
        if (existsSync(pkg) && statSync(pkg).isDirectory()) {
            const entry = resolveMagentPackageEntry(pkg);
            if (entry) return entry;
        }
    }
}
```

**Invariants:** installs without `--magent` for plugins with ≤1 persona behave byte-identically; `install sp` (no magents) is a silent no-op; install receipts/manifests unchanged.

**Rejected:** keeping root `magents/` as a second source (two SSOTs); `superskill magent list` verb (needs its own plugin resolution); deleting stale layers on switch (inert, see Q&A).

### Plan

1. [ ] `git mv magents/team-stark-children plugins/cc/magents/team-stark-children`; fix the README authoring sentence; `rg -n "magents/team-stark-children|repo-root .magents|root .magents" --glob '!vendors/**' --glob '!docs/tasks/**'` and fix each hit (dated ADR history excepted).
2. [ ] Code (R2–R6) per Design: `install.ts` (options block `:97-122`, `InstallOptions`, action `:147-161`, `executeInstall` after `:693`, delete `:1276-1284`, `emitMagents` `:1879-1919`); `mapper.ts:432-454` drop `nameMode` (update the single call at `:271`); `identity.ts:96-102`; `apps/cli/package.json:29,37`; `.gitignore:161`.
3. [ ] Tests — rewrite, don't delete coverage:
   - `apps/cli/tests/commands/install-magents-rules.test.ts:41-47`: source = `plugins/cc/magents`, call `stageMagentsFromDir(sourceRoot, 'cc', outputDir)`; staged name `cc-team-stark-children`.
   - `apps/cli/tests/commands/install.integration.test.ts:702-735` (root bare magents scenario): replace with AC4 (temp plugin with two personas, no `--magent`, stdout spy has exactly one `Magents:` line naming both; no CLAUDE.md written) and AC3 negative (a temp marketplace with a root `magents/x` is **not** staged).
   - New AC7 test: `--list-magents` prints `name\tdescription` lines, writes nothing (temp HOME empty afterwards), exit 0.
   - New AC5 test: install persona A with `global:true` into temp HOME, persona B with `global:false` into temp cwd ⇒ project CLAUDE.md is B's; global CLAUDE.md bytes unchanged.
   - New AC6 test: install A then B in the same scope ⇒ CLAUDE.md equals B's adapted CLAUDE.md; its `@` lines reference only B's layer files.
   - `packages/core/tests/content/identity.test.ts:184-202`: add a `plugins/cc/magents/<name>` fixture case; `packages/core/tests/marketplace.test.ts:186-199`: drop root-magents expectations.
4. [ ] AC2 bundle check: `cd apps/cli && bun run build:bundle && ls plugins/cc/magents/team-stark-children && test ! -e magents`; then `bun apps/cli/src/index.ts install cc --verbose --magent team-stark-children --marketplace apps/cli --dry-run` shows `magent cc-team-stark-children → …/CLAUDE.md`. Clean up `apps/cli/{plugins,.claude-plugin,rubrics}` copies afterwards (gitignored, but leave the tree as found).
5. [ ] AC1: `claude plugin validate plugins/cc` — record output in Testing.
6. [ ] AC3: `bun apps/cli/src/index.ts magent evaluate team-stark-children` from repo root resolves `plugins/cc/magents/team-stark-children/CLAUDE.md`; `rg -n "nameMode|'magents'\)" apps/cli/src packages/core/src` shows no root-scan.
7. [ ] Docs (R8) in the same commit; ADR-041 Status → Accepted with date.
8. [ ] Gates: `bun run lint`, `bun run test`, `bun run build`, `bun run spur-check`. Update `.spur/context/anatomy.md` for the moved package.

Do **not** edit: `vendors/`, the guard (`plugins/cc/scripts/anti-hallucination/**`, owned by 0155), `plugins/cc/rules/05-hook-feedback.md` (0157).

### Solution

One discovery root, one selection rule, one listing surface.

| Where | Change |
| --- | --- |
| `magents/team-stark-children/` → `plugins/cc/magents/team-stark-children/` | `git mv`; the root `magents/` directory is gone. |
| `apps/cli/src/commands/install.ts:1280` | The marketplace-root scan (install Step 5) is deleted — the plugin tree is the only discovery root. |
| `apps/cli/src/commands/install.ts:97-122,161,185` | `--list-magents` option, `InstallOptions.listMagents`, and the action passthrough. |
| `apps/cli/src/commands/install.ts:696-708` | The listing branch, before any staging or write: one `<name>\t<description>` line per `<pluginRoot>/magents/<dir>`, `No magents in plugin '<plugin>'` when there are none, then return. |
| `apps/cli/src/commands/install.ts:1864-1879` | `readMagentDescription` — first non-blank, non-heading line of the package `README.md`, trimmed, ≤100 chars. |
| `apps/cli/src/commands/install.ts:1912-1938` | Selection without `--magent`: one staged package auto-selects; several print `  Magents: <a>, <b> available — pass --magent <name> to install one` on **stdout** (no `--verbose` gate) and write nothing. |
| `packages/core/src/mapper.ts:269,433-445` | `stageMagentsFromDir` loses `nameMode`; every package stages as `<plugin>-<name>`. |
| `packages/core/src/content/identity.ts:96-114` | `resolveContentPath('magent', …)` falls back to `<base>/plugins/*/magents/<name>` (sorted, first hit) after the legacy bare `magents/<name>` form, so `superskill magent evaluate team-stark-children` resolves the plugin-owned package. |
| `apps/cli/package.json:23-29,37` | `magents/` dropped from `files` and from `build:bundle` (the persona rides inside `plugins/cc/`). |
| `.gitignore:161` | `/apps/cli/magents/` dropped. |
| Docs | ADR-041 → Accepted; `04_DESIGN.md` install synopsis; `cmd_install.md` (flag row + single-root section); `bundled_plugin.md`; `release.md`; `plugins/cc/README.md`; `plugins/cc/rules/README.md`; `cc-magents` platform-compatibility source map; `05_FEATURES.md`; the design satellite § B status. |

Two consequences worth knowing. The persona README moved into the plugin tree, so its relative links
were rewritten for the new depth and its upstream-loader citations were restated without a
`vendors/…` path — plugin content may not cite the gitignored reference tree, and
`plugins/cc/tests/structure.test.ts:163` requires every relative link inside `plugins/cc` to resolve.
And coexistence/switching needed **no code** (R7): the global-vs-project destination already comes
from `options.global`, and `CLAUDE.md` alone decides which layers load — both are now pinned by
tests instead.

### Testing

**Pipeline verify results**

- Verdict: PASS (from verdict artifact)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| R1 | MET | `plugins/cc/magents/team-stark-children/AGENTS.md:1` — package under the plugin tree; root `magents/` absent (ls this run: No such file or directory) |
| R2 | MET | `packages/core/src/mapper.ts:433` — `stageMagentsFromDir` has no `nameMode`; `rg nameMode apps/cli/src packages/core/src` empty; root scan pinned absent by `apps/cli/tests/commands/install.integration.test.ts:758` |
| R3 | MET | `apps/cli/package.json:23-37` — `magents/` dropped from files and build:bundle; `.gitignore` entry removed in commit 5fee95d |
| R4 | MET | `packages/core/src/content/identity.ts:96-114` — plugin-tree fallback after legacy form; pinned by `packages/core/tests/content/identity.test.ts:199` |
| R5 | MET | `apps/cli/src/commands/install.ts:1937` — one stdout line naming bare choices; pinned by `apps/cli/tests/commands/install.integration.test.ts:725` |
| R6 | MET | `apps/cli/src/commands/install.ts:699-708` — `--list-magents` branch before staging; `apps/cli/src/commands/install.ts:1871-1880` `readMagentDescription`; pinned by `apps/cli/tests/commands/install.integration.test.ts:782` |
| R7 | MET | `apps/cli/tests/commands/install.integration.test.ts:839` (scopes coexist) and `apps/cli/tests/commands/install.integration.test.ts:888` (switch loads only new persona); no new code |
| R8 | MET | `docs/00_ADR.md:789` ADR-041 Accepted; `docs/04_DESIGN.md:87` carries `[--list-magents]`; `docs/help/bundled_plugin.md:23`; `plugins/cc/README.md:65` |

| Acceptance Criteria | Status | Evidence Type | Evidence |
|---------------------|--------|---------------|----------|
| AC-1 | MET | test | `plugins/cc/tests/structure.test.ts:163` resolves every relative link in the moved package; prior `claude plugin validate plugins/cc` passed |
| AC-2 | MET | test | `apps/cli/tests/commands/install.integration.test.ts:1022` — `--magent <name>` selects the named persona; bundle check recorded in prior Testing |
| AC-3 | MET | test | `apps/cli/tests/commands/install.integration.test.ts:758` (root `magents/` not staged) and `packages/core/tests/content/identity.test.ts:199` |
| AC-4 | MET | test | `apps/cli/tests/commands/install.integration.test.ts:725` and `apps/cli/tests/commands/install.integration.test.ts:1091` — one Magents line naming both personas, nothing written |
| AC-5 | MET | test | `apps/cli/tests/commands/install.integration.test.ts:839` — both scopes coexist, untouched scope byte-identical |
| AC-6 | MET | test | `apps/cli/tests/commands/install.integration.test.ts:888` — same scope ends with only the new persona imports |
| AC-7 | MET | test | `apps/cli/tests/commands/install.integration.test.ts:782` (name TAB description, writes nothing) and `apps/cli/tests/commands/install.integration.test.ts:817` (empty case) |
| AC-8 | MET | test | `plugins/cc/tests/structure.test.ts:163` link resolution plus claims at `docs/00_ADR.md:789` and `docs/help/cmd_install.md:165` |
- Coverage: N/A (verdict-based; verify pipeline does not measure code coverage)

**Independent surface checks (not covered by the suite)**

| Check | Command | Observed |
| --- | --- | --- |
| AC1 — the plugin tree is a valid Claude Code plugin with the persona inside it | `claude plugin validate plugins/cc` | `✔ Validation passed` |
| AC2 — the bundle and the primary-persona install are unchanged | `cd apps/cli && bun run build:bundle && ls plugins/cc/magents/team-stark-children && test ! -e magents` | exit 0; the persona is inside the bundled plugin tree and `apps/cli/magents` no longer exists |
| AC2 — install still selects the primary persona | `bun apps/cli/src/index.ts install cc --verbose --magent team-stark-children --marketplace apps/cli --dry-run` | `Skills: 8, …, Magents: 1` then `claude: magent cc-team-stark-children → …/CLAUDE.md (Claude @import package)` |
| AC3 — the persona resolves for the authoring lifecycle | `bun apps/cli/src/index.ts magent evaluate team-stark-children --json` | `aggregate 0.9786`, `verdict PASS`, `grade A` — resolved from `plugins/cc/magents/team-stark-children/CLAUDE.md` |
| AC3 — no root scan or `nameMode` remains | `rg -n "nameMode\|marketplaceRoot, 'magents'" apps/cli/src packages/core/src` | no matches |

**Gates on the frozen tree (all green, `.spur/run/0156-check-receipt.json` = PASS):** `bun run lint`
(Biome + both workspace typechecks) · `bun test` 2657 pass / 0 fail · `bun run test-pre-check` 43/43
rules · `bun run test-post-check` 3/3 rules · `bun run build` (standalone binary + Codex plugin ZIP) ·
`bun run scripts/builder.ts check-skill-citations` OK.

**One move-induced defect, caught by a test rather than by review.** Moving the persona README into
`plugins/cc/` put it under `plugins/cc/tests/structure.test.ts:163`, which requires every relative
Markdown link inside the plugin tree to resolve. Its 13 repo-root links needed two more `../`
segments, and its upstream-loader citations pointed into the gitignored `vendors/` tree — absent in
CI and rejected by the publish boundary check in `scripts/builder.ts:201`. The citations are restated
without a `vendors/…` path; `plugins/cc/rules/README.md:32` was repointed at the same time.


**Re-verify 2026-10-21 (`/sp:dev-verifyall --force --fix all`).** Implementation re-read against Design: no drift. Gate re-run on the current tree: `bun run spur-check` exit 0 — lint clean, 43/43 pre-check, 2660 pass / 0 fail across 127 files, 3/3 post-check. Fix pass: stale `file:line` anchors in the prior tables were re-pointed at the lines that now carry each subject (answer file `.spur/run/0156-verify-answer.txt`, verdict `.spur/run/0156-verdict.json`).

### Review

Review coordinator pass over the diff (1 move + 4 source files + 4 test files + 10 docs).

Confidence: HIGH

| Priority | Finding | Location | Disposition |
| --- | --- | --- | --- |
| P4 | Moving the persona README into `plugins/cc/` put it under `plugins/cc/tests/structure.test.ts:163`, which requires every relative Markdown link inside the plugin tree to resolve. Its upstream-loader citations pointed into the gitignored `vendors/` reference tree, which is absent in CI and is rejected outright by the publish boundary check in `scripts/builder.ts:198`. | `plugins/cc/magents/team-stark-children/README.md:70` | FIXED |
| P4 | The same move changed the README's depth, so its 13 `../../` links to repo-root paths (`apps/`, `packages/`, `docs/`) needed two more segments; a wrong guess in `plugins/cc/rules/README.md:31` was caught by the structure test rather than by review. | `plugins/cc/magents/team-stark-children/README.md:25` | FIXED |
| P4 | `docs/help/cmd_magent.md` is listed in R8 but names no magent path — the authoring lifecycle it documents is unchanged, and the new listing surface belongs to `install`, not `magent`. | `docs/help/cmd_install.md:23` | FIXED |

Verdict: PASS

**Residual risk.** The plugin tree is now the only discovery root, so a persona that a user kept in a marketplace-root `magents/` directory is silently ignored rather than staged — intentional (ADR-041), and the AC3-negative test pins it, but it is a behavior change for anyone who relied on the old layout.

**Disposition.** PASS. No open findings.

### References

- Feature: `docs/features/F31_plugin-owned-multi-persona-magents.md` (Gherkin per AC)
- Design: `docs/design/quiet-guard-and-plugin-magents.md` § Track B
- Decisions: `docs/00_ADR.md` ADR-041 (Proposed), ADR-034 (superseded clause), ADR-035 (install receipt)
- Install: `apps/cli/src/commands/install.ts:97` (options), `:561` (`executeInstall`), `:693` (pluginRoot), `:1276` (root scan to delete), `:1866` (`emitMagents`), `:1893` (match rule)
- Staging: `packages/core/src/mapper.ts:271`, `:432-454`
- Identity: `packages/core/src/content/identity.ts:96`
- Listing precedent: `apps/cli/src/commands/skill.ts:458`
- Packaging: `apps/cli/package.json:29,37`, `.gitignore:161`, `docs/help/release.md:24-47`

### History

- 2026-10-21T18:32:53.315Z feature_id J → H21 (system)
- 2026-10-21T20:10:08.391Z todo → wip (system)
- 2026-10-21T20:11:36.223Z wip → testing (system)
- 2026-10-21T20:11:37.870Z testing → done (system)

