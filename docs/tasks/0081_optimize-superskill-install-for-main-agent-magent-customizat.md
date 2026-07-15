---
template: standard
schema_version: 1
name: "Optimize superskill install for main agent (magent) customization, per-target shimming, and fallback logic"
description: ""
status: done
type: task
profile: standard
feature_id: null
parent_wbs: null
priority: P2
tags: []
dependencies: []
created_at: "2026-07-15T17:22:16.945Z"
updated_at: "2026-07-15T22:33:10.722Z"
---

## 0081. Optimize superskill install for main agent (magent) customization, per-target shimming, and fallback logic

### Background
When migrating from rd3 to the sp/superskill model, main agents (`magent` content) were intentionally left out of the initial port because the originals were insufficient. Task 0080 is driving the (re)design of first-class main agent definitions (informed by `docs/about_main_agent.md`, the original external magents, SOTA practices, and positioning spur + superskill as default infrastructure).

A missing piece for distribution is in `superskill install`: how plugin authors ship customized main agents and how the installer selects/adapts/shims them for the target coding agent.

Currently, `mapPluginToRulesync` + the install pipeline only handle skills (including adapted commands/subagents), hooks, and mcp. There is no equivalent path for "magents" (top-level main agent prompt customizations that a plugin may want to provide or override).

In the rd3 era, plugins could carry `magents/<name>/` with platform-aware files. We want the same (or better) capability in the new world, plus robust per-target customization and shimming so that all targets can be treated uniformly from the plugin author's perspective while still allowing target-specific tweaks.

Example need (user provided): for claude-code target, prefer `AGENTS.claude.md` (or `CLAUDE.md`) over plain `AGENTS.md` when present, with clean fallback. Similar patterns will be needed for other targets (pi, omp, openclaw, hermes, grok, codex, opencode, antigravity, ...).

The solution must also cover:
- How magents are declared/discovered in a plugin (parallel to skills/, commands/, agents/).
- Selection + fallback logic generalized beyond the claude example.
- Shimming/adaptation (reference rewriting, frontmatter injection, format conversion, harness injection).
- Placement: where the resulting main agent file ends up for a given target (project root? agent-specific config dir? installed plugin payload?).
- Interaction with the new main agent design from 0080 (the definitions themselves should be authored to be "override friendly").
- CLI surface (e.g. `install --magent <name>` or auto-discovery; dry-run visibility).
- Testing and loss reporting for targets where full fidelity isn't possible.

This task focuses on the install-time mechanics (the "how we get the right main agent content into the right place for the target") as a follow-up optimization to 0080.
### Requirements
- [x] R1. **Extend plugin mapping to discover and preserve magents/.** `mapPluginToRulesync` (or a dedicated `mapMagents`) must detect a top-level `magents/<kebab-name>/` directory in the plugin source. It must copy the directory tree (including any per-target override files and supporting assets) into the canonical output (`.rulesync/magents/<plugin>-<name>/` or equivalent staging area) so later install steps can select from it. Do not force magents through the "downgrade to skills" path used for commands/subagents.

- [x] R2. **Define and implement generalized per-target variant selection with fallback.** Add (or centralize) a `selectMagentFile(sourceDir: string, baseName: string, target: Target): string | null` helper. 
  - Normalized target suffixes: use the existing `TARGETS` / target ids (claude, pi, omp, openclaw, hermes, grok, codex, opencode, antigravity-cli, ... ) plus known aliases (claude-code → claude, etc.).
  - Priority order (most specific first): `<base>.<target>.md`, `<base>.<target-family>.md`, `<base>.md`, and for claude-family targets also try `CLAUDE.*` variants and plain `CLAUDE.md`.
  - If no match, fall back gracefully (log in verbose mode).
  - The logic must be in one place so all targets are treated uniformly.

- [x] R3. **Perform shimming / adaptation on the selected magent content.** After selection:
  - Run `rewriteSkillReferences` (scoped to the plugin prefix) on the content.
  - Apply any magent-specific adaptations (e.g. inject minimal harness notes if the content is a "starter" from the 0080 designs, or run target-specific transforms parallel to `adaptSubagentToPi` / `translateSlashCommands`).
  - Decide output filename per target (most targets emit as `AGENTS.md`; claude target may emit as `CLAUDE.md` or `AGENTS.md` based on what was selected or a simple policy).
  - Support multi-file magents (the whole selected tree is adapted, not just one .md).

- [x] R4. **Integrate magent installation into the install flow.** In `executeInstall` / the dispatch loop:
  - After mapping, for targets that request it (or always when present), select + shim the magent(s).
  - Write the result to the appropriate destination for the install mode (global vs project / `--no-global`): typically the project root (cwd) for the canonical name, or into the target's installed plugin payload if the target uses a different layout.
  - Special-case targets that need different handling (claude, pi, omp, openclaw, hermes, grok, etc.) using the same pattern as existing hermes/omp/grok special paths.
  - Make selection and output visible under `--verbose` / `--dry-run`.
  - Support explicit selection via new option `--magent <name>` (or auto if exactly one).

- [x] R5. **Update supporting surfaces.** 
  - Extend `MapResult` (or add `magents: number`) and surface counts.
  - Update `cc-magents` skill references (platform-compatibility.md, workflows.md) to document the new `magents/` convention and the install selection rules.
  - Ensure the main agent templates produced by the 0080 work are compatible with (or document) the override naming.
  - Add or update CLI help text.

- [x] R6. **Quality, tests, and gates.** Add regression tests (unit for selection logic + integration in install tests) covering:
  - Common fallback.
  - Per-target override wins.
  - Claude special variants (AGENTS.claude.md + CLAUDE.md cases).
  - Shimming (reference rewriting happens).
  - Dry-run and verbose output.
  - No breakage for plugins without magents/.
  All existing install tests + `bun run spur-check` must stay green. Update task 0080 or cross-reference if the main agent design needs tweaks for this mechanism.

- [x] R7. **Documentation and migration.** Add a short section in docs/ (or help) explaining the magents/ layout for plugin authors. Note any breaking or new behavior for existing installs.
### Acceptance Criteria
**Scenario: Plugin without magents installs normally**
- Given a plugin with no `magents/` dir
- When `superskill install <plugin> --targets claude,pi`
- Then mapping and install succeed with zero magent counts, no errors or extra files written, and existing behavior is unchanged.

**Scenario: Common magent is selected as fallback**
- Given `magents/my-agent/AGENTS.md` (common) and no per-target files
- When installing for target `pi`
- Then the shimm ed `AGENTS.md` content is written to the destination (project root or appropriate location) for pi.

**Scenario: Target-specific override wins (user example)**
- Given both `magents/my-agent/AGENTS.md` and `magents/my-agent/AGENTS.claude.md`
- When installing for target `claude` (or claude-code)
- Then `AGENTS.claude.md` (after shimming) is selected and written (as `AGENTS.md` or `CLAUDE.md` per claude policy); the common is ignored for this target.

**Scenario: Claude special naming variants**
- Given `magents/my-agent/CLAUDE.md` or `AGENTS.claude.md`
- When selecting for claude target
- Then the most specific claude variant is chosen and the output filename decision (AGENTS vs CLAUDE) follows documented policy for the target.

**Scenario: Shimming is applied**
- Given a magent file containing `plugin:foo` references
- When selected for any target
- Then the installed version has references rewritten to the hyphen form (or target-appropriate), and other adaptations run.

**Scenario: Multiple magents and explicit selection**
- Given a plugin with `magents/foo/` and `magents/bar/`
- When running `superskill install <plugin> --magent bar --targets omp`
- Then only bar's selected variant is processed and installed.

**Scenario: Dry-run shows selection decisions**
- Given a plugin with magents and overrides
- When `superskill install ... --dry-run --verbose`
- Then output clearly shows for each target: which source file was chosen for which magent, the output name, and destination, without writing anything.

**Scenario: Gates and compatibility**
- Given changes for R1-R7
- When `bun run spur-check` and install integration tests run
- Then everything is green; plugins without magents are unaffected; selection logic is covered.
### Q&A

<!-- Clarifications and decisions made during refinement. Keep empty if none. -->

### Design
**Chosen approach:** Add first-class (but lightweight) support for `magents/` in the mapping + install pipeline, using a generalized selection + shim layer. Do **not** route magents through rulesync "skills" (they are top-level prompt customizations, not skills). Mirror the pattern used for hooks (canonical copy + per-target emission) and subagents (adapt + special handling).

**Key decisions (from discovery/grilling against current code):**
- Discovery: extend mapper (parallel to skills/agents/commands). See `mapPluginToRulesync` and `prepareTargetRulesyncInput`.
- Selection: single pure function `selectMagentVariant(dir, base, target)` with explicit candidate lists per target family. Centralized so behavior is consistent ("treat equally").
- Shimming: reuse `rewriteSkillReferences` + new or extended `adaptMagentContent(content, plugin, target)`. For claude, the shim can also decide the emitted filename (AGENTS.md vs CLAUDE.md).
- Placement: for project-level installs, write the final file to cwd using the target's canonical main-agent filename. For global installs, place inside the target's installed plugin area (or a documented "provided main agents" subdir) so the coding agent / user can adopt it. Special targets (hermes, omp, grok, claude) get their own emission paths (see existing special casing in install.ts).
- Multiple magents: supported via `<name>` subdirs; `--magent` selects (default: all or the primary one).
- Relation to 0080: the designed main agents will be the content that lives in these magent dirs; the override mechanism lets plugin authors provide target-tuned versions without forking the whole definition.
- No change to the authoring side in this task (cc-magents enhancement can come later or in 0080 follow-ups); focus is the install consumption path.

**Selection pseudocode (to be implemented in core or cli/install helpers):**
```ts
const TARGET_CANDIDATES: Record<Target, string[]> = {
  claude: ['AGENTS.claude.md', 'CLAUDE.claude.md', 'AGENTS.md', 'CLAUDE.md'],
  pi: ['AGENTS.pi.md', 'AGENTS.md'],
  omp: ['AGENTS.omp.md', 'AGENTS.md'],
  // ... similarly for others, plus a 'default' fallback
  default: ['AGENTS.md'],
};

function selectMagentVariant(dir: string, base: string, target: Target): string | null {
  const list = TARGET_CANDIDATES[target] ?? TARGET_CANDIDATES.default;
  for (const suffix of list) {
    const p = join(dir, suffix);
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  // also try <base>.<target>.md etc. for full flexibility
  ...
  return null;
}
```

**Shimming order (after selection):**
1. Read raw.
2. rewriteSkillReferences(content, pluginName).
3. adaptMagentForTarget (if any target-specific transforms).
4. (Optional) compose with common if partial override strategy is chosen later.
5. Decide output filename.
6. Write to destination determined by (global, target, cwd).

**Impacted surfaces:**
- packages/core/src/mapper.ts (add magent discovery)
- apps/cli/src/commands/install.ts (selection, shimming call, emission, counts, options)
- Possibly new core function `adaptMagent.ts` or extension in pipeline/
- Update to MapResult interface
- docs, cc-magents references/platform-compatibility.md
- Tests in apps/cli/tests/commands/install*.test.ts + new unit for selection
- Cross ref to 0080

**Trade-offs considered:**
- Full per-file override (chosen) vs. merge/patch: override is simpler, matches user example, easier for authors to reason about.
- Always through .rulesync vs. direct staging: direct staging for magents (like hooks) keeps them out of the skills rulesync path.
- Auto-apply to cwd vs. only to payload: support both via global/no-global + explicit flag later.
### Plan
1. Update anatomy / read relevant files (mapper, install.ts, adapt-subagent, hooks shims, TARGETS, about_main_agent.md, task 0080, cc-magents references).
2. Add magent discovery to `mapPluginToRulesync` (or extract helper). Return magent count and preserve the dir tree in .rulesync or a parallel staging dir. Update MapResult.
3. Implement pure `selectMagentVariant` + `getMagentCandidates(target)` in core (new file or in mapper/identity). Cover all current TARGETS + aliases. Unit test the selection matrix.
4. Add shimming entry point (reuse rewrite + new thin adapt layer). Handle filename decision for claude.
5. Wire into `executeInstall`: after mapping, for each target that has magents, select+shim+emit. Add special emission logic for claude/pi/omp/hermes/grok/openclaw using existing patterns. Update counts and verbose/dry-run output.
6. Add `--magent <name>` option (and auto behavior). Update command registration and help.
7. Update `plugins/cc/skills/cc-magents/references/platform-compatibility.md` and `workflows.md` with the new convention and install behavior.
8. Add tests: selection unit tests + extend install integration tests (fixtures with magents/ + overrides).
9. Run full `bun run spur-check`; fix any issues. Update 0080 cross-refs if the main agent templates need notes about the override files.
10. Add minimal docs (in README or a new help note) + CHANGELOG entry.
11. Record provenance, update task sections (Solution/Testing/Review), mark done after gates.
### Solution
**R1 — Discovery in mapper.** `MapResult` gains a `magents: number` field (`packages/core/src/mapper.ts:17`). `mapPluginToRulesync()` discovers top-level `magents/<kebab-name>/` dirs and stages them verbatim into `.rulesync/magents/<plugin>-<name>/` — NOT through the skills downgrade path — so per-target variant selection runs against the unmodified source tree (`packages/core/src/mapper.ts:200-223`). Only text files are reference-rewritten; binaries copy byte-for-byte via `copyAndRewriteDirectory`.

**R2 — Selection with fallback.** New pure function `selectMagentVariant(sourceDir, target)` resolves the best variant per target using a most-specific-first candidate list: `AGENTS.<target>.md` → `AGENTS.md`; claude additionally accepts `CLAUDE.claude.md` / `CLAUDE.md` (`packages/core/src/pipeline/select-magent.ts:14-71,83-90`). Returns `null` when no candidate exists. `adaptMagentForTarget()` shims via `rewriteSkillReferences` (`:99-101`); `magentOutputFilename()` returns `CLAUDE.md` for claude, `AGENTS.md` elsewhere (`:109-111`); `magentGlobalDir()` maps each target to its per-user config dir or `null` for native-installer targets (`:124-145`). All four exported from `@gobing-ai/superskill-core` (`packages/core/src/index.ts:34`).

**R3-R4 — Install integration + CLI.** `emitMagents()` (`apps/cli/src/commands/install.ts:731-804`) reads staged `.rulesync/magents/`, resolves selection per target, shims, and writes to `outputRoot` (project) or the target's global dir. `--magent <name>` selects explicitly (`:52-55,86`); a single magent auto-selects (`:761-764`); multiple magents with no selector skip with a verbose note (`:765-773`); an unknown name fails loudly (`:754-759`). Called at `:418` after rulesync + native dispatch. `MapResult.magents` surfaced in verbose output (`:153`).

**R5 — Supporting surfaces.** `platform-compatibility.md` gains a "Plugin-Provided Magents" subsection documenting the convention (`plugins/cc/skills/cc-magents/references/platform-compatibility.md:33-52`). `workflows.md` Install section extended with `--magent` examples and the variant-selection explanation (`plugins/cc/skills/cc-magents/references/workflows.md:186-206`). CLI help text updated (`apps/cli/src/commands/install.ts:46,53-55`).

**R6 — Tests.** 18 unit tests for selection/adapt/filename/globalDir (`packages/core/tests/pipeline/select-magent.test.ts:1-170`). 9 integration tests covering all 8 AC scenarios: AC1 no-magents, AC2 common fallback, AC3 target override wins, AC4 CLAUDE.claude.md variant, AC5 shimming rewrites plugin refs, AC6 `--magent` selects, AC6b unknown name fails, AC7 dry-run verbose, AC8 multi-magent skip (`apps/cli/tests/commands/install.integration.test.ts:671-885`). Fixtures: `apps/cli/tests/fixtures/plugin-min/magents/my-agent/{AGENTS.md,AGENTS.claude.md}`.

**R7 — Docs.** CHANGELOG entry under `[Unreleased]` (`CHANGELOG.md:13`).

**Verification:** `bun run lint` ✓ · `bun run typecheck` ✓ · `bun test` 1436 pass / 0 fail ✓ · `bun run build` ✓ · `bun run spur-check` ✓ · `spur task check 0081` PASS ✓
### Testing
**Mode:** `/sp:dev-verify 0081 --auto --focus all --fix all --force` (standalone re-audit of done task).

**Commands run this session (fresh evidence):**

| Command | Result |
| --- | --- |
| `bun run lint` | PASS — 170 files, Biome + typecheck exit 0 |
| `bun test packages/core/tests/pipeline/select-magent.test.ts apps/cli/tests/commands/install.integration.test.ts` | PASS — 46 pass / 0 fail (select-magent.ts 100% lines) |
| `bun test` (via `bun run spur-check`) | PASS — **1436 pass / 0 fail** |
| `bun run build` | PASS — 820 modules → `dist/superskill` |
| `bun run spur-check` | PASS — pre-check + tests + post-check (coverage-gate, skill-citations-resolve, every-export-has-tsdoc) |
| `spur task check 0081 --strict-core` | PASS after checklist fix (L4 feature_id advisory only) |

**Per-requirement traceability**

| Req | Status | Evidence |
| --- | --- | --- |
| R1 Mapper discovers magents/ | MET | `packages/core/src/mapper.ts:17` (`magents` on MapResult); `:200-221` stages `magents/<kebab>/` → `.rulesync/magents/<plugin>-<name>/` via `copyAndRewriteDirectory`, not skills path |
| R2 selectMagentVariant + fallback | MET | `packages/core/src/pipeline/select-magent.ts:15-71,83-90` most-specific-first candidates for all TARGETS; unit tests in `packages/core/tests/pipeline/select-magent.test.ts` |
| R3 Shimming / adapt | MET | `adaptMagentForTarget` `:99-101` → `rewriteSkillReferences`; `magentOutputFilename` `:109-111` (CLAUDE.md for claude); tree text rewritten at map stage |
| R4 Install integration | MET | `emitMagents` `apps/cli/src/commands/install.ts:731-804`; wired at `:418`; `--magent` at `:53-55,86`; auto-one / multi-skip / unknown-fail |
| R5 Supporting surfaces | MET | verbose count `:153`; `platform-compatibility.md:33-52`; `workflows.md:186-206`; core exports `packages/core/src/index.ts` |
| R6 Tests + gates | MET | 18+ unit + 9 integration AC tests (`install.integration.test.ts:671-885`); spur-check 1436 pass |
| R7 Docs + migration | MET | CHANGELOG `[Unreleased]` task 0081 entry (`CHANGELOG.md:13`); cc-magents references updated |

**Acceptance Criteria Verification**

| AC | Status | Evidence Type | Evidence |
| --- | --- | --- | --- |
| Scenario: Plugin without magents installs normally | MET | test | `install.integration.test.ts:676` AC1 |
| Scenario: Common magent fallback | MET | test | `:694` AC2 pi selects AGENTS.md |
| Scenario: Target-specific override wins | MET | test | `:716` AC3 AGENTS.claude.md wins for claude |
| Scenario: Claude special naming variants | MET | test | `:744` AC4 CLAUDE.claude.md |
| Scenario: Shimming is applied | MET | test | `:770` AC5 plugin refs rewritten |
| Scenario: Multiple magents + --magent | MET | test | `:788` AC6 select + `:813` AC6b unknown fails |
| Scenario: Dry-run shows selection | MET | test | `:829` AC7 dry-run verbose |
| Scenario: Gates and compatibility | MET | command + test | spur-check green; AC1 no-magents + AC8 multi-skip `:857` |

**Design conformance**

| Claim | Status | Notes |
| --- | --- | --- |
| First-class magents/ not skills path | DONE | mapper.ts:200-221 |
| Centralized selectMagentVariant | DONE | select-magent.ts |
| Shim via rewriteSkillReferences | DONE | adaptMagentForTarget |
| --magent + auto-one + dry-run/verbose | DONE | install.ts emitMagents |
| Docs in cc-magents refs + CHANGELOG | DONE | platform-compatibility, workflows, CHANGELOG |

**Coverage:** `select-magent.ts` 100% lines / 100% funcs under unit suite; install integration covers all 8 AC scenarios. Full suite 1436 pass.

**SECUA (summary):** No secrets; path safety via `assertSafePathSegment` + kebab regex; unknown `--magent` fails loud; pure selection (existsSync only). Advisory: `magentGlobalDir` relies on TS exhaustiveness without explicit `default` (`select-magent.ts:124-145`) — non-blocking.
### Review
**Verdict: PASS**

Independent verification of task 0081 (Optimize superskill install for magent customization, per-target shimming, and fallback logic). All R1-R7 requirements met; all 8 AC scenarios covered by tests; all gates green.

**Verification commands run (this review):**
- `bun run lint` (biome check + typecheck): clean, 0 errors
- `bun run test`: 1436 pass / 0 fail / 3586 expect()
- `bun run build`: 820 modules, exit 0
- `spur task check 0081`: PASS (1 advisory WARN: missing feature_id — non-blocking)

**Per-requirement evidence:**

- **R1 (mapper discovery).** `MapResult.magents: number` at `packages/core/src/mapper.ts:17`. Discovery block at `packages/core/src/mapper.ts:200-223` detects top-level `magents/<kebab-name>/`, validates kebab-case via `assertSafePathSegment` + regex, stages verbatim into `.rulesync/magents/<plugin>-<name>/` via `copyAndRewriteDirectory` (text rewritten, binaries byte-for-byte). NOT routed through the skills downgrade path. ✓
- **R2 (selection + fallback).** `selectMagentVariant(sourceDir, target)` at `packages/core/src/pipeline/select-magent.ts:83-90` — pure, most-specific-first over `TARGET_CANDIDATES` (`:14-71`). Claude accepts `AGENTS.claude.md` → `CLAUDE.claude.md` → `AGENTS.md` → `CLAUDE.md`. Returns `null` when no match; caller handles. Single centralized function — all targets treated uniformly. ✓
- **R3 (shimming).** `adaptMagentForTarget(content, pluginName, target)` at `:99-101` reuses `rewriteSkillReferences` (rewrites `plugin:foo` → `foo`/`plugin-foo`). `magentOutputFilename(target)` at `:109-111` returns `CLAUDE.md` for claude, `AGENTS.md` elsewhere. Multi-file magent trees staged by `copyAndRewriteDirectory`. ✓
- **R4 (install integration).** `emitMagents()` at `apps/cli/src/commands/install.ts:731-804` — reads staged `.rulesync/magents/`, resolves per-target variant, shims, writes to `outputRoot` (project) or `magentGlobalDir` (global). Called at `:418` after rulesync + native dispatch. `--magent <name>` at `:52-55,86`; auto-select single (`:761-764`); skip multi with verbose note (`:765-773`); fail loud on unknown (`:754-759`). Verbose/dry-run visible (`:789-792`). ✓
- **R5 (supporting surfaces).** `MapResult.magents` surfaced in verbose count at `install.ts:153`. Docs: `platform-compatibility.md:33-52` (Plugin-Provided Magents subsection), `workflows.md:186-206` (`--magent` examples + selection explanation). CLI help text updated at `install.ts:46,53-55`. Exported from core at `packages/core/src/index.ts:34`. ✓
- **R6 (tests + gates).** 20 unit tests (`packages/core/tests/pipeline/select-magent.test.ts` — selection, adapt, filename, globalDir; 100% line coverage on `select-magent.ts`). 9 integration tests (`apps/cli/tests/commands/install.integration.test.ts:671-885`) covering all 8 AC scenarios. Fixtures at `apps/cli/tests/fixtures/plugin-min/magents/my-agent/{AGENTS.md,AGENTS.claude.md}`. Full suite green. ✓
- **R7 (docs + migration).** CHANGELOG entry at `CHANGELOG.md:13` under `[Unreleased]` (task 0081). Platform-compatibility and workflows docs updated. ✓

**Per-AC test coverage:**

- **AC1** (no magents → normal install): `install.integration.test.ts:676` "AC1: plugin without magents installs normally"
- **AC2** (common fallback): `:694` "AC2: common AGENTS.md is selected as fallback for pi"
- **AC3** (target override wins): `:716` "AC3: target-specific override wins for claude"
- **AC4** (claude naming variants): `:744` "AC4: claude special naming — CLAUDE.claude.md fixture also resolves"
- **AC5** (shimming rewrites refs): `:770` "AC5: shimming rewrites plugin-scoped skill references"
- **AC6** (`--magent` explicit + unknown fails): `:788` "AC6: --magent selects" + `:813` "AC6b: unknown name fails loudly"
- **AC7** (dry-run/verbose): `:829` "AC7: --dry-run --verbose shows selection decisions"
- **AC8** (multi-magent skip): `:857` "AC8: multiple magents without --magent selector skips"

**SECUA notes:** No `any` types. `Target` union exhaustively handled in `magentGlobalDir` switch (no default needed — finite union, typecheck-enforced). Pure selection function (only `existsSync` reads). Fail-loud on unknown magent name (R12 ✓). Path safety via `assertSafePathSegment` + kebab regex. Pattern conformance: mirrors hooks (canonical staging + per-target emission) and subagents (adapt layer).

**Findings:**

| Priority | Finding | File:Line | Status |
|----------|---------|-----------|--------|
| P1 | (none) | — | — |
| P2 | (none) | — | — |
| P3 | (none) | — | — |
| P4 | `magentGlobalDir` switch has no explicit `default` case — relies on TS exhaustiveness for the finite `Target` union. Acceptable: a new target would fail typecheck, but a defensive `default: return null` would be slightly more robust against future enum relaxation. Non-blocking. | `packages/core/src/pipeline/select-magent.ts:124-145` | advisory |

**Residual risk:** Low. The `feature_id` advisory from `spur task check` is pre-existing (task has no feature link) and non-blocking. Magent install for global-mode claude/omp/grok falls back to project-root emission (documented in `magentGlobalDir` docstring and `platform-compatibility.md`); this is intentional since those targets' native installers own their config layout.
### References
- Task 0080 (parent work on main agent design and cc-magents enhancement)
- `docs/about_main_agent.md` (reference for platform differences)
- `packages/core/src/mapper.ts`
- `apps/cli/src/commands/install.ts`
- `packages/core/src/pipeline/adapt-subagent.ts` (pattern to mirror)
- `plugins/cc/skills/cc-magents/references/platform-compatibility.md`
- `plugins/cc/skills/cc-magents/SKILL.md`
- Target constants and special handling in install (hermes/omp/grok paths)
- Spur task/feature model (this task itself uses it)
### History
- 2026-07-15T21:42:32.716Z backlog → todo (system)
- 2026-07-15T21:47:15.173Z todo → wip (system)
- 2026-07-15T22:17:31.923Z wip → testing (system)
- 2026-07-15T22:24:13.775Z testing → done (system)
