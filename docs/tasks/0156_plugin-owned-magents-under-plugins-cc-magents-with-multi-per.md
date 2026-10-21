---
schema_version: 1
name: Plugin-owned magents under plugins/cc/magents with multi-persona install
status: todo
template: feature-impl
created_at: 2026-10-21T18:20:05.475Z
updated_at: "2026-10-21T19:07:03.477Z"
feature_id: F31
priority: P2
tags:
  - magent
  - install
  - cc
estimate_hours: 6

---

## 0156. Plugin-owned magents under plugins/cc/magents with multi-persona install

### Background

Feature F31 (under F3 — `superskill install`). Persona packages were moved out of the cc plugin to a marketplace-root `magents/` (ADR-034) for strict Claude Code plugin layout. That blocks hosting more than one persona (coding, content creation, travel planning, …) as plugin-owned content. Plugin-tree staging already exists (`packages/core/src/mapper.ts:271`, `nameMode:'plugin-prefixed'`), so moving the package back makes the root-scan path (`apps/cli/src/commands/install.ts:1276-1284`) dead.

Hard constraint: `superskill install cc --verbose --magent team-stark-children --marketplace ~/.bun/install/global/node_modules/@gobing-ai/superskill` keeps working unchanged.

Design satellite: `docs/design/quiet-guard-and-plugin-magents.md` § Track B. Decision: ADR-041 (Proposed → this task flips it to Accepted).

Implements F31: R1 — Persona package lives under the cc plugin tree; R2 — Existing install command still installs the primary persona; R3 — Root magents discovery and references are removed; R4 — Install without a persona flag lists choices when several personas ship; R5 — Personas coexist by install scope; R6 — Switching personas in one scope loads only the new persona; R7 — Available personas are listable; R8 — Decision record and docs describe plugin-owned personas.

### Requirements

- [ ] R1. `git mv magents/team-stark-children plugins/cc/magents/team-stark-children`; the root `magents/` directory no longer exists. Update the package README's authoring sentence ("Author in this repository's `magents/`") to the new path.
- [ ] R2. Remove marketplace-root discovery: install Step 5 root scan (`install.ts:1276-1284`), the `nameMode` option of `stageMagentsFromDir` (`mapper.ts:432-454`; always plugin-prefixed), and the "bare marketplace name" wording in `emitMagents` comments/errors (`install.ts:1879-1896`).
- [ ] R3. Remove bundling: `"magents/"` from `apps/cli/package.json` `files` (`:29`); `magents` from the `rm -rf` and the trailing `&& cp -r ../../magents magents` in `build:bundle` (`:37`); `/apps/cli/magents/` from `.gitignore:161`.
- [ ] R4. `resolveContentPath` magent branch (`packages/core/src/content/identity.ts:96-102`): after `<base>/magents/<name>`, scan `<base>/plugins/*/magents/<name>` (sorted, first hit wins) and resolve with the existing `resolveMagentPackageEntry`.
- [ ] R5. `emitMagents` selection without `--magent`: exactly one plugin-owned staged package ⇒ auto-select (unchanged); ≥2 ⇒ write nothing and print **one non-verbose stdout line**: `  Magents: <a>, <b> available — pass --magent <name> to install one` (bare names, `<plugin>-` prefix stripped). Zero ⇒ silent no-op (verbose note as today).
- [ ] R6. New flag `--list-magents` on `superskill install <plugin>` (`install.ts:97-122` option block; precedent `skill.ts:458` `--list`): after plugin root resolution, print one line per `<pluginRoot>/magents/<dir>` as `<name>\t<description>` (description = first non-blank, non-heading line of the package `README.md`, trimmed, ≤ 100 chars; empty if no README), then return before any staging/write. Exit 0; prints nothing extra when there are no personas except `No magents in plugin '<plugin>'`.
- [ ] R7. Coexistence and switching need **no new code**: global vs project destination already comes from `options.global` (`install.ts:1925`); switching overwrites `CLAUDE.md` which alone decides `@import`s. Lock both with tests (R5/R6 scenarios).
- [ ] R8. Same-commit doc sync: ADR-041 Status → Accepted (supersedes the root-`magents/` clause of ADR-034); `04_DESIGN.md:87` install synopsis gains `[--list-magents]`; `docs/help/cmd_install.md`, `bundled_plugin.md`, `release.md:24-47`, `cmd_magent.md`, `plugins/cc/README.md:65-67`, `plugins/cc/rules/README.md:31`, `plugins/cc/skills/cc-magents/references/platform-compatibility.md:151`, `docs/design/quiet-guard-and-plugin-magents.md` § B. Root `README.md` only if it names the old path.

### Acceptance Criteria

- [ ] AC1 — Persona package lives under the cc plugin tree
- [ ] AC2 — Existing install command still installs the primary persona
- [ ] AC3 — Root magents discovery and references are removed
- [ ] AC4 — Install without a persona flag lists choices when several personas ship
- [ ] AC5 — Personas coexist by install scope
- [ ] AC6 — Switching personas in one scope loads only the new persona
- [ ] AC7 — Available personas are listable
- [ ] AC8 — Decision record and docs describe plugin-owned personas

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

<!-- Filled during implementation: file:line change map and concise rationale. -->

### Testing

<!-- Filled during verification: commands run, outcomes, coverage claim or N/A. -->

### Review

<!-- Filled during review: P1-P4 findings, residual risk, and final disposition. -->

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

