---
template: standard
schema_version: 1
name: "Optimize superskill install for main agent (magent) customization, per-target shimming, and fallback logic"
description: ""
status: backlog
type: task
profile: standard
feature_id: null
parent_wbs: null
priority: P2
tags: []
dependencies: []
created_at: "2026-07-15T17:22:16.945Z"
updated_at: "2026-07-15T17:24:23.730Z"
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
- [ ] R1. **Extend plugin mapping to discover and preserve magents/.** `mapPluginToRulesync` (or a dedicated `mapMagents`) must detect a top-level `magents/<kebab-name>/` directory in the plugin source. It must copy the directory tree (including any per-target override files and supporting assets) into the canonical output (`.rulesync/magents/<plugin>-<name>/` or equivalent staging area) so later install steps can select from it. Do not force magents through the "downgrade to skills" path used for commands/subagents.

- [ ] R2. **Define and implement generalized per-target variant selection with fallback.** Add (or centralize) a `selectMagentFile(sourceDir: string, baseName: string, target: Target): string | null` helper. 
  - Normalized target suffixes: use the existing `TARGETS` / target ids (claude, pi, omp, openclaw, hermes, grok, codex, opencode, antigravity-cli, ... ) plus known aliases (claude-code → claude, etc.).
  - Priority order (most specific first): `<base>.<target>.md`, `<base>.<target-family>.md`, `<base>.md`, and for claude-family targets also try `CLAUDE.*` variants and plain `CLAUDE.md`.
  - If no match, fall back gracefully (log in verbose mode).
  - The logic must be in one place so all targets are treated uniformly.

- [ ] R3. **Perform shimming / adaptation on the selected magent content.** After selection:
  - Run `rewriteSkillReferences` (scoped to the plugin prefix) on the content.
  - Apply any magent-specific adaptations (e.g. inject minimal harness notes if the content is a "starter" from the 0080 designs, or run target-specific transforms parallel to `adaptSubagentToPi` / `translateSlashCommands`).
  - Decide output filename per target (most targets emit as `AGENTS.md`; claude target may emit as `CLAUDE.md` or `AGENTS.md` based on what was selected or a simple policy).
  - Support multi-file magents (the whole selected tree is adapted, not just one .md).

- [ ] R4. **Integrate magent installation into the install flow.** In `executeInstall` / the dispatch loop:
  - After mapping, for targets that request it (or always when present), select + shim the magent(s).
  - Write the result to the appropriate destination for the install mode (global vs project / `--no-global`): typically the project root (cwd) for the canonical name, or into the target's installed plugin payload if the target uses a different layout.
  - Special-case targets that need different handling (claude, pi, omp, openclaw, hermes, grok, etc.) using the same pattern as existing hermes/omp/grok special paths.
  - Make selection and output visible under `--verbose` / `--dry-run`.
  - Support explicit selection via new option `--magent <name>` (or auto if exactly one).

- [ ] R5. **Update supporting surfaces.** 
  - Extend `MapResult` (or add `magents: number`) and surface counts.
  - Update `cc-magents` skill references (platform-compatibility.md, workflows.md) to document the new `magents/` convention and the install selection rules.
  - Ensure the main agent templates produced by the 0080 work are compatible with (or document) the override naming.
  - Add or update CLI help text.

- [ ] R6. **Quality, tests, and gates.** Add regression tests (unit for selection logic + integration in install tests) covering:
  - Common fallback.
  - Per-target override wins.
  - Claude special variants (AGENTS.claude.md + CLAUDE.md cases).
  - Shimming (reference rewriting happens).
  - Dry-run and verbose output.
  - No breakage for plugins without magents/.
  All existing install tests + `bun run spur-check` must stay green. Update task 0080 or cross-reference if the main agent design needs tweaks for this mechanism.

- [ ] R7. **Documentation and migration.** Add a short section in docs/ (or help) explaining the magents/ layout for plugin authors. Note any breaking or new behavior for existing installs.
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

<!-- Filled during implementation: file:line change map and concise rationale. -->

### Testing

<!-- Filled during verification: commands run, outcomes, coverage claim or N/A. -->

### Review

<!-- Filled during review: P1-P4 findings, residual risk, and final disposition. -->

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
