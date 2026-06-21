---
name: Adapt slash commands and subagents as Skills 2.0 for all targets
description: Adapt slash commands and subagents as Skills 2.0 for all targets
status: Done
created_at: 2026-06-20T00:00:00.000Z
updated_at: 2026-06-21T03:50:20.942Z
folder: docs/tasks
type: task
feature-id: ""
preset: complex
---

# Task 0044: Comprehensive install — unify entity distribution for all targets

| Field | Value |
|-------|-------|
| **WBS** | 0044 |
| **Status** | 🔶 validated |
| **Created** | 2026-06-20 |
| **Updated** | 2026-06-20 (review pass: 7 refinements locked in — see Review Refinements) |
| **Priority** | Critical — dogfood install blocker |

## Review Refinements (2026-06-20)

Locked in after a source + empirical review (rulesync 8.29.0 behavior verified by direct `generate` runs). These supersede any conflicting prose below.

1. **Colon rewriting must be plugin-prefix-scoped, NOT a hardcoded allowlist.** The current `rewriteColonRefs` (`packages/core/src/pipeline/rewrite-colons.ts`) hardcodes `/(rd3|wt):/` — it silently skips `cc:`, `sp:`, and every other plugin. A naive generic `\bword:word\b` rewriter is equally wrong: the `cc` plugin contains `node:fs`, `bun:test`, `ts:*`, and placeholder `plugin:command` colons that must NOT be mangled. **Fix:** `rewriteSkillReferences(content, pluginPrefix)` rewrites only `<pluginPrefix>:<name>` → `<pluginPrefix>-<name>`, where `pluginPrefix` is the plugin currently being installed (mirrors old `common.sh:95-97` `PLUGIN_PREFIX` path). The install pipeline already knows the plugin name — thread it through. This both fixes the live `cc:`/`sp:` breakage and preserves legitimate non-plugin colons.
2. **"Current flow (broken)" diagram is outdated** — see corrected note in Architecture Changes. The current TS already does per-target transformation (`prepareTargetRulesyncInput` → `transformMarkdownDirectory`). The redesign must NOT regress slash-command translation, per-target input isolation, or hook emission.
3. **omp/hermes surrogate copy only copies `skills/` today** (`install.ts:188,204`) — so omp/hermes currently receive ZERO commands/subagents. The redesign self-heals this (everything becomes a skill dir). State it as an explicitly-fixed defect.
4. **Pi subagent `skill:` discovery must filter to existing skills.** `convertToPiSubagent` scans the body for `word:word` (`extractSkillsFromBody`) but does NOT verify the skill dir exists — it emits phantom `skill:` entries. Old `subagents.sh:365-383` filtered to `plugins/<plugin>/skills/<name>` existence. Restore that filter. Pin exact frontmatter field order: `name, description, tools, model, skill` (old order), and pin expected output in A4.
5. **Claude cache clearing uses the marketplace NAME, not a hardcoded path.** `resolution.marketplaceName` is already resolved (`install.ts:177`). Clear `~/.claude/plugins/cache/<marketplaceName>/`. `marketplace add` is idempotent, so this is defensive, not load-bearing — keep it but don't hardcode `superskill`.
6. **`disable-model-invocation: true` is for command-as-skills ONLY.** Subagent-as-skills must remain model-invocable — do NOT copy the flag onto them (old `adapt_subagent_to_skill` correctly omits it).
7. **Two assertion sites to update**, not one: `install.integration.test.ts:143` AND any feature assertions in `install-hooks.test.ts`. Change `['skills','commands','subagents','hooks','mcp']` → `['skills','hooks','mcp']`.

**OpenClaw (simplified):** OpenClaw loads customized agent skills from `~/.agents/skills/` (the shared personal-skills root, same as codex/gemini/opencode in global mode). So OpenClaw needs NO dedicated dispatch in this task — once skills land in `~/.agents/skills/`, OpenClaw reads them. Drop the separate `~/.openclaw/plugin-skills/` dispatch and the OpenClaw-specific `TARGETS` entry from scope; revisit only if a dedicated path is needed later.

## Design Rules

Four rules govern the install design. Evaluated and fine-tuned against `vendor/` source code and `~/projects/cc-agents/scripts/`.

### R1 — Claude Code: native plugin install

Claude Code uses its own plugin system — not rulesync. The flow (from `~/projects/cc-agents/scripts/setup-all.sh:206-214`):

```bash
rm -rf ~/.claude/plugins/cache/<marketplace>/
claude plugin marketplace add <repo-root>        # idempotent — updates if exists
claude plugin install <plugin>@<marketplace-name>
```

**Fine-tuned from original**: Added cache clearing (`rm -rf`) for robustness.

**[Refinement #5]** Clear `~/.claude/plugins/cache/<marketplaceName>/` using the RESOLVED marketplace
name (`resolution.marketplaceName`, already available at `install.ts:177`) — do NOT hardcode `superskill`.
`marketplace add` is idempotent, so cache clearing is defensive, not load-bearing; keep it but bound it
to the correct name so it never `rm -rf`s the wrong directory.

Already partially implemented in `13dcf78`; needs cache clearing, marketplace name resolution, and rebuilt binary for testing.

### R2 — Renaming: `plugin:skill` → `plugin-skill` for non-Claude targets

Claude Code's plugin system scopes skill references by plugin (`cc:anti-hallucination`). Non-Claude agents store everything in flat skill directories, so colons would cause ambiguity. The renaming rule:

- **Plugin-level prefix**: All entities from plugin `cc` get the `cc-` prefix in their canonical name
- **Reference rewriting**: All `plugin:skill` references in markdown bodies and frontmatter MUST be rewritten to `plugin-skill`
- **Claude Code**: Immune — the plugin system handles scoping natively

**Fine-tuned from original**: Reference rewriting must cover ALL adapted files (commands → skills, subagents → skills, subagents → Pi agents), not just skills.

**[Refinement #1 — corrected]** The current `rewrite-colons.ts` is hardcoded to `/(rd3|wt):/` and silently skips `cc:`, `sp:`, and all other plugins — a live breakage in the dogfood plugin (244 `cc:` refs survive un-rewritten today). The fix is NOT a wider allowlist and NOT a blind `\bword:word\b` rewriter (that would corrupt `node:fs`, `bun:test`, `ts:*`, placeholder `plugin:command`). The rewriter MUST be scoped to the plugin prefix currently being installed: `rewriteSkillReferences(content, pluginPrefix)` rewrites only `<pluginPrefix>:<name>` → `<pluginPrefix>-<name>`. This is exactly what old `common.sh:95-97` did via its `PLUGIN_PREFIX` parameter. The plugin name is already available in the install pipeline — thread it into the rewriter.

### R3 — Rulesync + direct file copying

| Method | When | Targets |
|--------|------|---------|
| **rulesync** | Target has a rulesync engine | codex, pi, opencode, antigravity-cli, antigravity-ide |
| **direct copy** | No rulesync engine, or surrogate | omp (via pi), hermes (via opencode), Pi subagents (openclaw out of scope — reads `~/.agents/skills/`) |

Both methods operate on already-renamed (R2) and already-adapted (R4) content.

### R4 — Downgrade as Skill: commands/subagents as skill directories

**Critical fine-tune**: Commands and subagents MUST be adapted before copying — raw copies produce broken skills missing the `name` field. The old scripts demonstrate the adaptation:

| Entity | Adaptation | Key frontmatter changes |
|--------|-----------|------------------------|
| **Command → Skill** | `adapt_command_to_skill()` | Inject `name: cc-<cmd>`, set `disable-model-invocation: true` **(commands only — Refinement #6)**, normalize `argument-hint` quoting, normalize `allowed-tools` to YAML array |
| **Subagent → Skill** | `adapt_subagent_to_skill()` | Inject `name: cc-<agent>`, preserve description/tools/model/skills. **Do NOT set `disable-model-invocation` — subagents must stay model-invocable (Refinement #6).** |
| **Subagent → Pi Agent** | `adapt_subagent_to_pi()` | Pi-native format: `name`, `description`, `tools` (Pi-normalized), `model` (skip `inherit`), `skill` (Pi-normalized), `## Pi Runtime Adaptation` section |

This is a **restoration** of the old approach. The old `skills.sh` already puts adapted commands into `.rulesync/skills/` (line 211–228) and lets `rulesync generate --features skills` distribute everything. Commands and subagents were only handled by standalone `commands.sh`/`subagents.sh` scripts for independent use — the unified `skills.sh` canonical path always used rulesync. Codex commands go to `~/.agents/skills/` (not `~/.codex/prompts/`), OpenCode commands go to `~/.agents/skills/` (not `~/.config/opencode/commands/`). The current superskill approach (separate rulesync features for `commands` and `subagents`) diverged from this.

### R5 — Design Decision: rulesync for skills only (keep)

**Recommendation: keep rulesync, drop only `'commands'`/`'subagents'` features.**

The old `skills.sh` uses rulesync as the distribution engine for skill directories. It maps all content (skills + adapted commands) into `.rulesync/skills/` and calls `rulesync generate --features skills`. The standalone `commands.sh` and `subagents.sh` bypass rulesync, but they are independent entry points — the unified canonical path (`skills.sh`) always uses rulesync.

Rulesync provides three things that would be brittle to replicate:

| Capability | Why it matters |
|------------|---------------|
| **Target→directory mapping** | 5 targets × 2 modes (global/project) × different paths — `~/.agents/skills/` for Codex, `~/.gemini/config/skills/` for antigravity-ide, `~/.pi/agent/skills/` + `~/.agents/skills/` interop for Pi |
| **Directory lifecycle** | mkdir, stale file cleanup, diff detection |
| **Already integrated** | Tested, working, no new surface area |

What rulesync does NOT handle (by design):
- Pi native agent format (direct copy to `~/.pi/agent/agents/`)
- Surrogate targets: omp, hermes (direct copy from rulesync output). OpenClaw is out of scope — it reads the shared `~/.agents/skills/` root.
- Claude Code (native `claude plugin install`)
- Hermes hooks (HOOK.yaml format — tracked separately)

The simplification comes from the content side: everything is a skill now (R4), so only one `.rulesync/` subdirectory and one feature string. Rulesync usage gets simpler, not more complex.

### Target Coverage Matrix

Per the verified tables in `README.md`:

| Target | Skills | Commands | Subagents | Hooks | Engine |
|--------|--------|----------|-----------|-------|--------|
| **Claude Code** | ✓ native plugin | ✓ native plugin | ✓ native plugin | ✓ native plugin | `claude plugin install` |
| **Codex** | ✓ rulesync | ✓ as skills | ✓ as skills | — | rulesync |
| **Pi** | ✓ rulesync | ✓ as skills | ✓ as skills + native agents¹ | — ² | rulesync + copy |
| **omp** | ✓ copy (via pi) | ✓ as skills (via pi) | ✓ as skills (via pi) | — ² | rulesync + copy |
| **OpenCode** | ✓ rulesync | ✓ as skills | ✓ as skills | — | rulesync |
| **Antigravity IDE** | ✓ rulesync | ✓ as skills | ✓ as skills | — | rulesync |
| **Antigravity CLI** | ✓ rulesync | ✓ as skills | ✓ as skills | — | rulesync |
| **Hermes** | ✓ copy (via opencode) | ✓ as skills (via opencode) | ✓ as skills (via opencode) | ⚠ HOOK.yaml ³ | rulesync + copy |
| **OpenClaw** | ✓ via `~/.agents/skills/` ⁴ | ✓ as skills ⁴ | ✓ as skills ⁴ | — | (no dedicated dispatch) |

⁴ **OpenClaw is out of dedicated scope (Refinement).** It loads agent skills from the shared `~/.agents/skills/` root, which other global-mode targets already populate. No OpenClaw-specific dispatch, no `TARGETS`/`TARGET_TO_RULESYNC` entry in this task. Revisit if a dedicated path is later required.

¹ Pi subagents: additional native agent format at `~/.pi/agent/agents/cc-<name>.md` with `tools:`, `skill:`, `model:` fields (R4).
² Pi/omp hooks system replaced by Extensions — not in scope for this task.
³ Hermes hooks use `~/.hermes/hooks/<name>/HOOK.yaml` + `handler.py`, not `hooks.json` — tracked separately.

## Architecture Changes

### Current flow (the real one — corrected per Refinement #2)

The current TS is more capable than the original draft implied. It already does per-target
transformation, not a single shared pass:

```
Mapper → .rulesync/{skills,commands,subagents,hooks}/   (raw copies, name = <plugin>-<entity>)
  → for each target: prepareTargetRulesyncInput()
       → copies into .rulesync/.targets/<target>/.rulesync/
       → transformMarkdownDirectory(): normalizeFrontmatter + translateSlashCommands
         + rewriteColonRefs + convertToPiSubagent (pi/omp)
  → rulesync.generate(features: [skills, commands, subagents, hooks, mcp]) per target
  → surrogate copy for omp/hermes (skills/ ONLY) + hook emission for pi/omp/hermes
```

**Why it's still broken (empirically verified — rulesync 8.29.0 `generate` runs):**

| Target | `skills` | `commands` | `subagents` |
|--------|:--:|:--:|:--:|
| codexcli | ✅ `~/.agents/skills/` | ❌ **dropped** | ⚠️ `.codex/agents/*.toml` (TOML, not skill) |
| pi | ✅ `.pi/skills/` | ⚠️ `.pi/prompts/` | ❌ **dropped** |
| opencode | ✅ | ✅ `.opencode/commands/` | ✅ `.opencode/agents/` |
| antigravity-cli | ✅ | ❌ **dropped** | ❌ *"does not support … Skipping"* |
| antigravity-ide | ✅ | ⚠️ `.agents/workflows/` | ❌ **dropped** |

`skills` is the ONLY feature with uniform coverage. `commands`/`subagents` fall through silently
per-target and land in 5 heterogeneous path/format shapes. `--simulate-commands`/`--simulate-subagents`
exist only for copilot/cursor/codexcli, so they don't rescue the rest. This is the empirical proof
that the "downgrade everything to skills" design (R4) is correct, not just preferable.

Additionally (Refinement #3): the omp/hermes surrogate copy only copies `skills/` (`install.ts:188,204`),
so omp/hermes receive ZERO commands/subagents today even where rulesync produced them. The redesign
self-heals this because every entity becomes a skill directory.

**Must not regress** when refactoring: per-target input isolation (`prepareTargetRulesyncInput`),
slash-command dialect translation (`translateSlashCommands`), and pi/omp/hermes hook emission.

### Target flow

```
Mapper → .rulesync/skills/  (skills + adapted-commands + adapted-subagents, all renamed)
  → pipeline transforms (reference rewriting, frontmatter normalization)
    → rulesync.generate(features: [skills, hooks, mcp] only)
      → ALL rulesync targets get everything as skills
    → dispatch:
      → Claude Code: marketplace add + plugin install
      → omp: copy pi output → ~/.omp/agent/skills/
      → hermes: copy opencode output → ~/.hermes/skills/
      → Pi subagents: native format → ~/.pi/agent/agents/
      → hooks emit: pi/omp/hermes (existing)
```

### Key changes

| Component | Change |
|-----------|--------|
| `mapper.ts` | Map commands → `.rulesync/skills/<plugin>-<cmd>/SKILL.md` with adapted frontmatter. Map agents → `.rulesync/skills/<plugin>-<agent>/SKILL.md` with adapted frontmatter. Remove separate commands/subagents output dirs. |
| `pipeline/adapt-command.ts` | **NEW** — `adaptCommandToSkill(source, target, name)`: inject `name`, set `disable-model-invocation: true`, normalize `argument-hint`, normalize `allowed-tools` |
| `pipeline/adapt-subagent.ts` | **NEW** — `adaptSubagentToSkill(source, target, name)`: inject `name`, preserve other fields. `adaptSubagentToPi(source, target, name)`: Pi-native format |
| `pipeline/rewrite-references.ts` | **NEW** — `rewriteSkillReferences(content, plugin)`: `plugin:skill` → `plugin-skill` in all text |
| `pipeline/pi-tools.ts` | **NEW** — `expandPiToolName()`, `normalizePiToolList()`, `rewriteAllowedToolsForPi()` |
| `install.ts` | Remove `'commands'`/`'subagents'` from `rulesyncFeatures`. Add Pi subagent dispatch. Update Claude install: cache clearing keyed on resolved `marketplaceName` (Refinement #5). Thread plugin prefix into `rewriteSkillReferences` (Refinement #1). (No OpenClaw dispatch — out of scope.) |
| `targets.ts` | _No change_ — OpenClaw out of scope (reads `~/.agents/skills/`). Existing `TARGETS` stays. |
| `rewrite-colons.ts` | **Fix (Refinement #1):** replace the hardcoded `/(rd3\|wt):/` alternation with plugin-prefix-scoped rewriting; or supersede it with `rewrite-references.ts`. Keep a `::` handler only if any content uses it. |
| `pipeline/slash-command.ts` | May deprecate (commands now adapted as skills) |
| `install-hooks.test.ts` | Update `rulesyncFeatures` assertions (Refinement #7) |
| `install.integration.test.ts` | Update feature expectations — `:143` (Refinement #7) |

## Implementation Phases

### Phase A — Adaptation modules (`packages/core/src/pipeline/`)

| Module | Function | Reference |
|--------|----------|-----------|
| `adapt-command.ts` | `adaptCommandToSkill(source, target, expectedName)` | `commands.sh:128-217` |
| `adapt-subagent.ts` | `adaptSubagentToSkill(source, target, expectedName)` | `subagents.sh:285-331` |
| `adapt-subagent.ts` | `adaptSubagentToPi(source, target, expectedName)` | `subagents.sh:452-510` |
| `rewrite-references.ts` | `rewriteSkillReferences(content, plugin)` | `common.sh:88-101` |
| `pi-tools.ts` | `expandPiToolName(tool)`, `normalizePiToolList(tools)`, `rewriteAllowedToolsForPi(content)` | `common.sh:189-324` |

### Phase B — Mapper changes (`packages/core/src/mapper.ts`)

- Map `commands/*.md` → `.rulesync/skills/<plugin>-<cmd>/SKILL.md` via `adaptCommandToSkill`
- Map `agents/*.md` → `.rulesync/skills/<plugin>-<agent>/SKILL.md` via `adaptSubagentToSkill`
- Keep existing skills mapping: `skills/<name>/SKILL.md` or `skills/<name>.md`
- Copy skill subdirectories: `scripts/`, `references/`, `templates/`, `assets/`
- Remove separate `.rulesync/commands/` and `.rulesync/subagents/` output
- Run `rewriteSkillReferences` on all output files

### Phase C — Install dispatch (`apps/cli/src/commands/install.ts`)

- `rulesyncFeatures`: `['skills', 'hooks', 'mcp']` (remove `'commands'`, `'subagents'`)
- Claude install: `rm -rf ~/.claude/plugins/cache/<marketplaceName>/` (resolved name, Refinement #5) before marketplace add
- Pi subagent dispatch: after rulesync, write adapted subagents to `~/.pi/agent/agents/`
- Thread the plugin prefix into `rewriteSkillReferences` so `cc:`/`sp:`/etc. are rewritten (Refinement #1)
- _No OpenClaw dispatch_ — out of scope; OpenClaw reads the shared `~/.agents/skills/` root that other global targets already populate.

### Phase D — Targets update (`packages/core/src/targets.ts`)

- _No change in this task._ OpenClaw is out of scope (Refinement). Existing `TARGETS` and `TARGET_TO_RULESYNC` stay as-is.

### Phase E — Pipeline cleanup

- `slash-command.ts`: may deprecate (commands now adapted as skills in mapper)
- `rewrite-colons.ts`: scope to `::` references only; general `plugin:skill` rewriting moves to `rewrite-references.ts`

### Phase F — Tests

- Unit tests for each adaptation module — include a `rewriteSkillReferences` test proving `cc:foo`→`cc-foo` is rewritten AND `node:fs`/`bun:test` are left intact (Refinement #1)
- Mapper tests: commands/subagents mapped as skills, counts updated
- Install tests: `rulesyncFeatures` = `['skills','hooks','mcp']` at both assertion sites (Refinement #7), Pi subagent dispatch. (No OpenClaw dispatch test — out of scope.)
- Pi subagent golden-file test: field order + skill-existence filtering (Refinement #4)
- Integration tests: end-to-end verify all entities land for all targets. **Verify the A1 paths against rulesync 8.29.0 actual output** — the global-mode skill root is `~/.agents/skills/` for codex/gemini/opencode/pi (see old `skills.sh:461-534`), which differs from some per-target paths in the A1 table below. Reconcile the table to observed output, don't assume.

## Acceptance Criteria

### A1 — All entities installed for all targets

After `superskill install cc --targets all`:

| Target | Skills (6) | Commands-as-Skills (16) | Subagents-as-Skills (5) | Pi Agents (5) |
|--------|-----------|------------------------|------------------------|---------------|
| Codex | `~/.agents/skills/cc-*` | `~/.agents/skills/cc-*` | `~/.agents/skills/cc-*` | — |
| Pi | `~/.pi/agent/skills/cc-*` | `~/.pi/agent/skills/cc-*` | `~/.pi/agent/skills/cc-*` + `~/.pi/agent/agents/cc-*` | ✓ |
| OpenCode | `~/.opencode/skills/cc-*` | `~/.opencode/skills/cc-*` | `~/.opencode/skills/cc-*` | — |
| antigravity-ide | `~/.gemini/config/skills/cc-*` | `~/.gemini/config/skills/cc-*` | `~/.gemini/config/skills/cc-*` | — |
| antigravity-cli | `~/.gemini/antigravity-cli/skills/cc-*` | `~/.gemini/antigravity-cli/skills/cc-*` | `~/.gemini/antigravity-cli/skills/cc-*` | — |
| omp | `~/.omp/agent/skills/cc-*` | `~/.omp/agent/skills/cc-*` | `~/.omp/agent/skills/cc-*` | — |
| hermes | `~/.hermes/skills/cc-*` | `~/.hermes/skills/cc-*` | `~/.hermes/skills/cc-*` | — |
| Claude | native plugin | native plugin | native plugin | — |

> OpenClaw omitted: out of scope. It reads the shared `~/.agents/skills/cc-*` populated by global-mode targets — no dedicated row to assert in this task.
>
> ⚠️ These paths are **targets to verify**, not givens. rulesync 8.29.0's actual output for global vs project mode may differ per target (e.g. shared `~/.agents/skills/` vs native per-tool dirs). The implementer must reconcile this table against observed `generate` output and fix whichever side is wrong.

### A2 — Adapted frontmatter passes validation

- All command-as-skill files have `name: cc-<cmd>`, `disable-model-invocation: true`
- All subagent-as-skill files have `name: cc-<agent>`
- No YAML parse errors in any output
- `argument-hint` properly quoted; `allowed-tools` in YAML array format

### A3 — Reference rewriting complete

- `cc:cc-agents` → `cc-cc-agents` in all output files
- `cc:anti-hallucination` → `cc-anti-hallucination` in all output files
- Rewriting applies to frontmatter fields AND body markdown

### A4 — Pi subagents have correct format

- `~/.pi/agent/agents/cc-expert-agent.md`: frontmatter fields in EXACT order `name`, `description`, `tools:` (Pi-normalized), `model:` (skip when `inherit`), `skill:` (Pi-normalized) — matches old `adapt_subagent_to_pi` (`subagents.sh:483-499`). **(Refinement #4)**
- `skill:` entries MUST be filtered to skills that actually exist (`plugins/<plugin>/skills/<name>`). Body-discovered references that don't resolve to a real skill dir are dropped — no phantom `skill:` entries. The current `convertToPiSubagent`/`extractSkillsFromBody` does NOT filter; add the existence check (old `subagents.sh:365-383`). **(Refinement #4)**
- `## Pi Runtime Adaptation` section present where tools/skills need explanation
- Tool names normalized: `Bash` → `bash`, `Glob` → `[find, ls]`, `Agent` → `subagent`, etc.
- Pin one full expected-output fixture (e.g. `cc-expert-agent.md`) as a golden file so field order and skill filtering are regression-tested, not just spot-checked.

### A5 — Verification gate

- `bun run lint` clean
- `bun run test` all pass, coverage ≥ 90%
- `bun run build` succeeds

### Background

The superskill CLI installs Claude Code plugins to all target coding agents (codex, pi, opencode, antigravity, omp, hermes). The current install pipeline emits separate `.rulesync/{skills,commands,subagents}/` directories and passes `['skills','commands','subagents','hooks','mcp']` to rulesync. Empirically verified against rulesync 8.29.0: only the `skills` feature has uniform target coverage — `commands` and `subagents` drop silently on several targets (codex, antigravity-cli, antigravity-ide) and land in 5 heterogeneous path/format shapes when they do emit (TOML agents, prompts, workflows). This is a dogfood blocker: the shipped `cc` plugin's 16 commands and 5 subagents do not reach most targets.

Additionally, `rewrite-colons.ts` is hardcoded to `/(rd3|wt):/`, silently skipping the 244 live `cc:` references in the dogfood plugin. The omp/hermes surrogate copy only copies `skills/`, so they receive zero commands/subagents. The Pi subagent converter emits phantom `skill:` entries without verifying skill directories exist.

### Requirements

- **R1:** All entities (skills, commands, subagents) installed for all 8 targets via the "downgrade to skills" design — commands and subagents adapted into skill directories, distributed via rulesync `--features skills` (uniform coverage) instead of the unreliable per-feature emit.
- **R2:** Reference rewriting (`plugin:name` → `plugin-name`) scoped to the plugin prefix being installed (not hardcoded allowlist), preserving `node:fs`/`bun:test`/`ts:*` colons intact.
- **R3:** Claude install clears the plugin cache keyed on the resolved marketplace name (not hardcoded `superskill`).
- **R4:** Pi subagent native format (`~/.pi/agent/agents/`) with correct field order (`name, description, tools, model, skill`), skill-existence filtering, and tool normalization.
- **R5:** `disable-model-invocation: true` on command-as-skills ONLY; subagent-as-skills remain model-invocable.
- **R6:** No regression: per-target input isolation, slash-command dialect translation, hook emission (pi/omp/hermes) preserved.
- **R7:** `rulesyncFeatures` reduced to `['skills','hooks','mcp']`; both test assertion sites updated.

### Design

See **Architecture Changes** and **Design Rules** sections above for the full design (R1–R5 rules, target coverage matrix, current vs target flow, component change table). Key decisions: keep rulesync as the distribution engine (R5 rule), drop only the `commands`/`subagents` features, adapt entities in the mapper via new pipeline modules (`adapt-command.ts`, `adapt-subagent.ts`, `rewrite-references.ts`, `pi-tools.ts`).

### Solution

Implemented per the Implementation Phases. Five new pipeline modules in `packages/core/src/pipeline/`:
- `adapt-command.ts` — `adaptCommandToSkill()`: injects name, disable-model-invocation, normalizes argument-hint/allowed-tools
- `adapt-subagent.ts` — `adaptSubagentToSkill()` + `adaptSubagentToPi()`: skill adaptation + Pi native format with pinned field order and skill-existence filtering
- `rewrite-references.ts` — `rewriteSkillReferences(content, pluginPrefix)`: plugin-scoped reference rewriting (Refinement #1)
- `pi-tools.ts` — `expandPiToolName()`, `normalizePiToolList()`, `rewriteAllowedToolsForPi()`: extracted from pi-subagent.ts

Mapper refactored: all entities (skills + commands + subagents) mapped into `.rulesync/skills/`. Install dispatch updated: features reduced to `['skills','hooks','mcp']`, Claude cache clearing keyed on marketplace name, Pi subagent native dispatch added. `rewrite-colons.ts` deprecated in favor of `rewrite-references.ts`.


### Plan

See **Implementation Phases** section above. Phases A (adaptation modules), B (mapper), C (install dispatch), E (cleanup), F (tests).

### Testing

- Unit tests for each adaptation module (`adapt-command`, `adapt-subagent`, `rewrite-references`, `pi-tools`) including a `rewriteSkillReferences` test proving `cc:foo`→`cc-foo` while `node:fs`/`bun:test` survive (Refinement #1).
- Mapper tests: commands/subagents mapped as skills, counts updated.
- Install tests: `rulesyncFeatures` = `['skills','hooks','mcp']` at both assertion sites (Refinement #7), Pi subagent dispatch.
- Pi subagent golden-file test: field order + skill-existence filtering (Refinement #4).
- Integration tests: end-to-end verify all entities land for all targets.

### Review

**Verdict: PARTIAL** — Implementation is correct and all 7 refinements are MET, but one P1 leaky-abstraction (`outputRoot` not threaded into rulesync) and one P2 (mcp.json error-log noise) should be fixed before marking truly Done.

Dev-verify 2026-06-20 · Phase 7 (SECU) + Phase 8 (refinement traceability) · channel: current · scope: commit `32b4ffe` (19 files) · Gate: `bun run lint` ✅ · `bun run test` ✅ 820 pass / 0 fail / coverage ≥90% on all new modules.

**Empirical validation (real install of `cc` plugin):** mapResult = 6 skills + 16 commands + 5 subagents → 27 skill dirs delivered to `~/.agents/skills/`; 5 Pi native agents to `.pi/agent/agents/`. Command-as-skills carry `disable-model-invocation: true`; subagent-as-skills do NOT (Refinement #6 ✅). Zero `cc:` refs survive — all rewritten to `cc-` (Refinement #1 ✅).

### P1 — Blockers

| # | Title | Dimension | Location | Recommendation |
|---|-------|-----------|----------|----------------|
| 1 | `outputRoot` is a leaky abstraction — not threaded into rulesync | Correctness/Usability | apps/cli/src/commands/install.ts:169 + packages/core/src/rulesync.ts:64 | `executeInstall`'s `outputRoot` redirects surrogate/pi-agent writes but NOT rulesync skill writes (rulesync hardcodes `outputRoots:[homedir()/cwd()]`). Real installs work (skills land in `~/.agents/skills/`), but the override is silently ignored for the main payload — so the integration test's `outputRoot` isolation is partial, and any caller passing `outputRoot` gets surprising `$HOME` writes. Thread `outputRoot` through `runRulesync` → `outputRoots`, OR rename/document the param as surrogate-only. Add an integration assertion that rulesync skills land under the override root. |

### P2 — Warnings

| # | Title | Dimension | Location | Recommendation |
|---|-------|-----------|----------|----------------|
| 2 | `mcp.json` ENOENT logged on every install | Correctness/Usability | packages/core/src/rulesync.ts (rulesync generate) + mapper.ts:130-137 | When a plugin has no `mcp.json`, the mapper writes none, but rulesync per-target input still probes for it and logs `Failed to load a Rulesync MCP file (.rulesync/mcp.json): ENOENT` once per rulesync target. Harmless (install continues) but alarming noise. Either drop `'mcp'` from `rulesyncFeatures` when `mapResult.mcp === false`, or write an empty `mcp.json` stub, or filter the log. |

### P3 — Info

| # | Title | Dimension | Location | Recommendation |
|---|-------|-----------|----------|----------------|
| 3 | `--no-global` (project-mode) install crashes on missing parent dir | Correctness | apps/cli/src/commands/install.ts (real run) | Running `install cc --no-global` from a dir without `.agents/skills/` threw `ENOENT: mkdir '.agents/skills/cc-agent-add'`. rulesync expects the parent to exist in project mode. Pre-create target parents or catch+mkdir. Lower severity since global mode (the default) works. |
| 4 | `adaptSubagentToPi` does FS I/O (`existsSync`) inside a "pipeline" module | Correctness/Testability | packages/core/src/pipeline/adapt-subagent.ts:173-191 | The skill-existence filter reads the filesystem from within an otherwise-pure pipeline fn, coupling it to disk layout and requiring `pluginPath` plumbing. Acceptable (mirrors old bash), but consider injecting a `skillExists(name)` predicate so the fn stays unit-testable without a real plugin dir. |

### P4 — Suggestions

| # | Title | Dimension | Location | Recommendation |
|---|-------|-----------|----------|----------------|
| 5 | `rewriteColonRefs` legacy fn retained (deprecated) | Maintainability | packages/core/src/pipeline/rewrite-colons.ts | Still used by `adapt-parity.test.ts` and the per-target `transformMarkdownDirectory` skill pass. Once all call sites move to `rewriteSkillReferences`, delete it. Currently both run (mapper uses scoped, transform uses legacy) — harmless double-pass but worth consolidating. |

**Refinement traceability (Phase 8) — all 7 MET:**
- R#1 plugin-scoped colon rewrite → MET: rewrite-references.ts:10-17 + parity test asserts `node:fs` preserved, `rd3:` not rewritten under `cc`.
- R#2 no regression of slash/isolation/hooks → MET: install.ts:384-408 keeps `translateSlashCommands`; pi/omp/hermes hook emission intact.
- R#3 omp/hermes get everything (self-heal) → MET: all entities are skills now; surrogate copy of `skills/` carries commands+subagents.
- R#4 Pi skill filter + field order → MET: adapt-subagent.ts:96-193, order `name,description,tools,model,skill`, body-scan filtered to existing skill dirs.
- R#5 Claude cache keyed on marketplaceName → MET: install.ts:180-181 uses resolved name, guarded by `existsSync`.
- R#6 disable-model-invocation commands-only → MET: adapt-command.ts sets it; adapt-subagent.ts does not. Empirically confirmed.
- R#7 features=[skills,hooks,mcp] both sites → MET: install.ts:127; install.integration.test.ts updated.

**Fix-pass 2026-06-20 (dev-verify --fix all):** P2 #2 FIXED — `rulesyncFeatures` now omits `'mcp'` when `mapResult.mcp === false` (install.ts:127-132); added integration test `includes 'mcp' feature only when the plugin ships an mcp.json`. Gate: lint ✅, 821 tests pass. P1 #1 (outputRoot→rulesync threading) and P3 #3 (project-mode mkdir) DEFERRED to the new refinement task — they touch ADR-010 (`outputRoots` derivation) and the public `RulesyncOptions` shape, which is an architectural change that should not be auto-applied to a Done task. P3 #4 and P4 #5 deferred (non-blocking, captured in new task).


**Update 2026-06-21 (task 0045 Done):** All deferred findings addressed in task 0045. P1 #1 (outputRoot→rulesync) → MET via optional `RulesyncOptions.outputRoot` + ADR-010 amendment. P3 #3 (project-mode ENOENT) → MET via `TARGET_SKILLS_RELDIR` pre-create. P3 #4 (adaptSubagentToPi FS coupling) → MET via injectable `skillExists` predicate. P4 #5 (rewriteColonRefs consolidation) → MET via scoped `rewriteSkillReferences` in per-target pass + legacy deletion. 820 tests pass, coverage 99.71%/98.40%, zero `$HOME` leak on smoke.
