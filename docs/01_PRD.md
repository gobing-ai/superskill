---
doc: 01_PRD
owns: WHAT — product vision, users, scope (in / out / deferred)
authority: authoritative-on-scope
version: 3.5.0
derived_from: [00_ADR]
owner: Robin Min
updated_at: 2026-08-12
read_before: adding a command or feature; edit when scope changes
edit_rules: 99 §6.2
sync: [T1, T4, T6]
---

# Product Requirements Document — superskill

## Problem

The `cc-agents/scripts` toolchain synchronizes Claude Code plugin-format skills, slash commands, subagents, hooks, and MCP config to multiple coding agents. It works, but has structural issues:

1. **Plugin-locked.** Hardcoded to `rd3` and `wt` namespaces. Adding a third plugin requires editing bash internals.
2. **Bash sprawl.** ~1,500 lines of bash reimplement platform knowledge that `rulesync` already provides for 30+ targets. Only one subcommand actually calls `rulesync`, and even then as a pass-through.
3. **Format adaptation is hand-rolled.** Slash dialect, colon→hyphen, @-file stripping, Pi subagent conversion — all in bash regex.
4. **Agent coverage is stale.** No Hermes, omp, antigravity-cli, or antigravity-ide. Gemini CLI and old antigravity are deprecated.
5. **No quality loop.** The meta-agent skills that create/validate/evaluate skills, commands, subagents, hooks, and main-agent configs live as Claude Code plugin skills in `cc-agents/plugins/rd3/skills/cc-agents` — usable only inside Claude Code. They have no self-evolution capability.

## Solution

**superskill** — a TypeScript CLI with two layers:

**Layer 1 — Distribution.** `superskill install` replicates what `cc-agents/scripts/setup-all.sh` does: take a Claude Code plugin and install its skills, commands, subagents, magents, hooks, and MCP config to any target coding agent. Uses `rulesync`'s programmatic `generate()` API as the conversion engine; superskill owns the output root (project vs `~`), native host-plugin dispatch, and the Hermes fallback. See ADR-010.

**Layer 2 — Authoring + quality.** Five subcommands (`agent`, `skill`, `command`, `hook`, `magent`) that migrate the meta-agent skills out of the Claude Code plugin and into first-class CLI operations. They provide the lifecycle appropriate to each artifact; skills additionally support ecosystem install/update and package/migrate workflows, while hooks expose deterministic emit/run operations. These commands work locally (no Claude Code required) and improve themselves over time through structured evolution workflows.

## Users

- **Plugin author** — installs a Claude Code plugin to Claude Code, Codex, Pi, OpenCode, Antigravity, Hermes, omp, or Grok.
- **Plugin developer** — creates, validates, and refines agent skills, commands, subagents, hooks, and main-agent configs with structured quality gates.
- **Team lead** — manages main-agent configs across a team using multiple coding agents, with evaluation-driven improvement.

## Principles

1. **Install anywhere.** One plugin source → any target agent. `rulesync` owns platform knowledge; superskill adds distribution + cc-agents-specific transforms.
2. **Author anywhere.** Quality workflows for agent-facing content are first-class CLI operations, not Claude Code plugin skills.
3. **Self-evolving.** Evaluation → refinement → evolution loop built into every authoring command. Content improves over time through structured data, not gut feel.
4. **Boring stack.** Bun + TypeScript + Biome + Commander. No new runtimes, package managers, or linters.

## Scope

### Phase 1 — Distribution: `superskill install`

| Item | Description | ADR |
| ------ | ------------- | ----- |
| `superskill install` | Install a Claude Code plugin's skills, commands, subagents, magents, hooks, MCP config to specified coding agents; `--magent` selects a main-agent config | 005, 006, 034 |
| Plugin → `.rulesync/` mapper | Canonical intermediate representation | 005 |
| rulesync programmatic API | `rulesync.generate()` called from TypeScript | 005 |
| Conversion pipeline | Slash dialect, colon→hyphen, @-file stripping, Pi subagent format | 006 |
| Target agents | Claude Code, Codex, Pi, omp, OpenCode, antigravity-cli, antigravity-ide, Hermes, Grok | 005 |
| Plugin resolution via marketplace | `--marketplace <locator>` resolves `<plugin>` from a local marketplace path, GitHub URL, or `owner/repo` shorthand; defaults to CWD's marketplace, falls back to `plugins/<name>/` scan | 011, 034 |
| `--dry-run` / `--verbose` | Preview and diagnostics | — |

### Phase 2 — Authoring + quality: migrate and enhance meta-agent skills

Source: bundled `plugins/cc/skills/cc-*` authoring skills.

| Command | Origin skill | Capabilities | ADR |
| --------- | ------------- | -------------- | ----- |
| `superskill agent` | `cc-agents` | Scaffold, validate, evaluate, refine, evolve subagents | — |
| `superskill skill` | `cc-skills` | Add, list, remove, update, scaffold, validate, evaluate, refine, evolve, package, migrate skills | 028–031 |
| `superskill command` | `cc-commands` | Scaffold, validate, evaluate, refine, evolve slash commands | — |
| `superskill hook` | `cc-hooks` | Validate, evaluate, suggest-only refine, analyze-only evolve, emit, run hooks | 020, 021, 024 |
| `superskill magent` | `cc-magents` | Scaffold, validate, evaluate, refine, evolve main-agent configs | — |
| `superskill script` | plugin scripts | Run registered scripts, resolve staged entrypoint paths, build portable `.mjs` twins | 023, 024 |

The `agent`, `command`, `magent`, and `skill` authoring lifecycles support five shared operations:

| Operation | What it does |
| ----------- | ------------- |
| `create` / `scaffold` | Generate a new item from a template |
| `validate` | Structural + schema check (frontmatter, required fields, format compliance) |
| `evaluate` | Quality scoring across multiple dimensions |
| `refine` | Evaluate → fix issues in one step |
| `evolve` | Analyze evolution signals → draft improvement proposals → apply accepted changes |

**Key enhancement over the origin skills:** self-evolution. The `evolve` operation reads historical evaluation data and proposes longitudinal improvements — something the Claude Code plugin skills could not do because they lacked persistent state.

**Self-evolution enhancement (2026-06-23):** The `evolve` operation now supports an opt-in empirical behavior gate (`--eval-gate`). When enabled and an `eval/cases.yaml` file is co-located with the skill, held-out eval cases are replayed against the candidate skill; the proposal is accepted only when the candidate strictly outperforms the baseline. Exact-match and rule references are deterministic; rubric references use a pairwise candidate-vs-baseline judge with noise-floor rejection and budget-cap failure. This closes the loop on BEHAVIOR, not just form. See ADR-018/ADR-019, tasks 0068/0069.

### Supporting

| Item | Description |
|------|-------------|
| Claude Code marketplace | Direct `claude` CLI plugin marketplace update for install |

### Deprecated / removed

| Item | Action | Reason |
|------|--------|--------|
| Gemini CLI | Removed from target list | Google retiring June 2026 |
| Old Antigravity (unified) | Replaced by antigravity-cli + antigravity-ide | Antigravity 2.0 splits into two products |

### Deferred (needs design reconfirmation)

| Item | Condition to reactivate |
| ------ | ------------------------ |
| Remote in-manifest plugin `source` objects (Layer B: `github`, `url`, `git-subdir`, `npm`) | In-manifest object `source` still deferred. **Remote *marketplaces* ship via `--marketplace <locator>`** (local dir, `.claude-plugin/`, GitHub URL, or `owner/repo` shorthand; ADR-034) with content cached at `~/.cache/superskill/marketplaces/<owner>/<repo>/<ref>/`. `--marketplace-source github` is deprecated (ADR-034). |
| Import from non-Claude formats (Codex, Pi) | After Phase 1 install is stable; needs custom import mapper |
| `rulesync` upstream contribution (Hermes, omp) | When Hermes/omp adoption warrants it; local targets sufficient initially |
| Cross-platform adaptation (adapt command) | After Phase 2 authoring commands stabilize; generate Codex/Pi/etc. variants from a single abstract definition |
| `superskill list`, `doctor`, `init` | After Phase 1 install is stable; thin commands that read config + check paths. `doctor` shipped grok-bot-scoped in task 0128 (ADR-036); general diagnostics deferred |
| GUI / TUI | When target-user workflow demands it |

### Out of scope

| Item | Reason |
| ------ | -------- |
| Runtime agent orchestration | Separate concern (`@gobing-ai/ts-ai-runner`) |
| Skill content authoring UX | CLI-first; a GUI is deferred |
| Cloud sync / registry | Local-first; npm publish is the distribution channel |
