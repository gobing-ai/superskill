# Changelog

All notable changes to `@gobing-ai/superskill` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Conventional Commits](https://www.conventionalcommits.org/).

## [0.2.0] - 2026-06-22

### New Features

#### Scaffold Template Tiers — Agent, Command, and Skill

- **Agent template tiers**: `--template` flag now accepts `default`, `minimal`, `standard`, or `specialist` — each tier provides progressively richer system-prompt content and frontmatter. Agent scaffold also accepts `--skills <list>` and `--tools <list>` flags for direct frontmatter population. All four templates score PASS on `agent evaluate`. (`apps/cli/src/templates/agent/`)
- **Command template tiers**: `--template` flag now accepts `simple` (one-shot, no sub-steps), `workflow` (multi-step with gates), `plugin` (delegates to a plugin command), or `default`. (`apps/cli/src/templates/command/`)
- **Skill template tiers**: `--template` flag now accepts `technique` (narrow how-to), `pattern` (reusable design pattern), `reference` (canonical lookup), or `default`. (`apps/cli/src/templates/skill/`)
- **Directory-based skill scaffold**: `superskill skill scaffold <name>` now writes to `<name>/SKILL.md` (a skill directory) instead of a bare `<name>.md` file — matching the convention used by the rest of the ecosystem.

#### Evolve System Completion — Heuristic Proposals + Full Lifecycle Flags

- **Seeded heuristic proposals**: `evolve` no longer requires an external agent for basic improvements. The CLI now seeds proposals from evaluation history — suggesting concrete changes for low-scoring dimensions without any model call. The generation seam (`--propose-only --json` / `--ingest`) remains for model-driven refinement.
- **`--analyze` flag**: Compute trends and emit analysis without generating proposals — useful for reviewing quality history before committing to changes.
- **`--history` flag**: Display the evaluation timeline for a given entity — per-dimension scores over time with trend direction.
- **`--rollback` flag**: Revert the most recently accepted proposal, restoring the file from its pre-proposal backup.
- **`--confirm` flag**: Accept a `draft` proposal by ID without re-running the double-loop gate (for pre-vetted proposals).
- **Frontmatter-less magent support**: `magent evolve` now works on plain-markdown main-agent configs (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`) — no YAML frontmatter required. Body-based anchor hashing and governance section detection handle the seed/validate/anchor paths.

#### Hook Command Surface — Settled Design

Three design decisions codified for the `hook` command, resolving the surface divergence from other types:

- **`hook scaffold` removed** (task 0066 decision B): Hooks are hand-authored JSON in `hooks.json` — a markdown scaffold template was the wrong artifact type and misleading.
- **`hook refine` locked to suggest-only** (task 0061 decision C): No `--auto` flag; `--dry-run` is the only mode. Hook `command` strings are security-critical shell code — automated mutation is too dangerous.
- **`hook evolve` locked to analyze-only** (task 0056 decision C): No `--history`/`--rollback`/`--confirm` or apply path. Hook quality trends can be analyzed but content changes remain manual.

`hook validate` and `hook evaluate` continue to work normally — scoring against correctness, event-coverage, safety, and pattern-match-quality dimensions.

### Improvements

#### Refine — Dry-Run and Structural-First Auto-Apply

- **`--dry-run` flag on all refine commands**: Agent, command, magent, and skill `refine` now support `--dry-run`, which classifies findings and projects the score delta in-memory without writing files or creating backups.
- **Structural auto-apply before validation exit**: `refine --auto` now applies structural fixes (missing required frontmatter fields, wrong model aliases) before the validation step — a missing-`description` agent is fixed in one pass instead of being refused with "validation failed." Missing-field defaults are schema-aware (`model`→`inherit`, `tools`→`[]`), never `TODO` placeholders.

#### CC Plugin Command Wrappers — Realigned

All 17 plugin slash commands (`plugins/cc/commands/*.md`) re-aligned to match the CLI's actual capabilities after v0.2.0 changes:
- `agent-add`: updated to reflect template tiers, `--skills`, `--tools` flags
- `agent-evolve` / `command-evolve` / `magent-evolve` / `skill-evolve`: updated to reflect `--analyze`/`--history`/`--rollback`/`--confirm` flags
- `agent-refine` / `command-refine` / `magent-refine` / `skill-refine`: updated to reflect `--dry-run` support
- `skill-add`: updated to reflect template tiers and directory-based output
- Fixed missing header row in `agent-evolve` Arguments table

#### Meta-Agent Skills Refreshed

All six `cc-*` skills (`anti-hallucination`, `cc-agents`, `cc-commands`, `cc-hooks`, `cc-magents`, `cc-skills`) and the `expert-hook` agent refreshed to reflect the settled hook command surface and current CLI capabilities.

### Bug Fixes

- **Six correctness defects across core + CLI (F1-F6)**: Fixed issues including `resolveContentPath` doubling `.md` on bare names, command evaluator scoring wrong schema fields, `dedupeLines` content corruption across heading blocks, backtick token score inflation, slash-command colon swallowed before translation, and parity test normalization. Each fix has a dedicated regression test.
- **`handleCommandRefine` dryRun type contract**: Command refine's handler was missing the `dryRun` field in its type contract, causing a type error on the `--dry-run` path. Fixed and covered.
- **Pi subagent parser hardened**: Replaced hand-rolled `parseFrontmatter` with the canonical parser from `content/frontmatter.ts` (ADR-012), fixing block-style YAML array and nested-value matching in the pipeline.


## [0.1.8] - 2026-06-21

### New Features

#### Hook Evaluation — Safety-First Scoring for hooks.json

- **New `/cc:hook-evaluate` command**: Evaluates `hooks.json` directly against 4 quality dimensions: correctness (command/type/matcher validity), event-coverage (lifecycle event breadth across 9 canonical events), safety (dangerous-command pattern scan), and pattern-match-quality (matcher specificity, timeout presence, path portability). Safety is weighted highest (0.35) — hooks run arbitrary shell commands and deserve the most scrutiny. (`plugins/cc/commands/hook-evaluate.md`)
- **Dangerous command detection**: The safety dimension scans for `rm -rf`, `curl | sh`, `--no-verify` bypasses, `eval`, `sudo`, `chmod 777`, unquoted command substitution, and backtick execution. Each dangerous pattern is named in findings with the hook event and truncated command string.

### Improvements

#### Evaluate — Parity Polish Across All Content Types

- **Skill evaluator findings/recommendations** (task 0047): Low-scoring dimensions now emit specific, actionable `findings` and `recommendations` — not just a one-line note. The shared formatter renders them as `Findings:` and `Recommendations:` blocks in human output. Same enrichment applies to agent, command, magent, and hook evaluators.
- **Agent evaluator readiness** (task 0048): All 5 agent dimensions (completeness, role-clarity, tool-selection, skill-linkage, model-fit) emit findings and recommendations for sub-perfect scores. Command wrapper aligned (D1 flag boundary, `--save` description). Weighted-aggregate test added — agent rubric weights (role-clarity 0.25 dominant) confirmed to produce different aggregates from equal-weight mean.
- **Magent evaluator — plain-markdown configs supported** (task 0050): AGENTS.md / CLAUDE.md / GEMINI.md are plain markdown by design. The magent evaluator now detects governance sections (project, commands, verification, conventions, safety, docs) via flexible regex matching rather than requiring YAML frontmatter. Body-based platform detection fallback for frontmatter-less configs. No more "Frontmatter parse error" on valid main-agent configs.

### Bug Fixes

- **Command evaluator scored wrong schema** (P1, task 0049): The command evaluator required a fictional `name` frontmatter field and an `arguments[]` array that don't exist in Claude Code commands. Every valid command (16 `plugins/cc/commands/*.md`) scored 0.43 FAIL/Grade F. Fixed `REQUIRED_FIELDS.command` to `['description']`, rewrote `scoreArgumentHints` for the real `argument-hint` string convention, and made `scoreToolReferences` read `allowed-tools` from frontmatter. All 16 commands now score 0.88 PASS/Grade B.
- **Magent bare-name resolution doubled `.md` extension** (P1, task 0050): `magent evaluate AGENTS.md` looked for `AGENTS.md.md` and returned "File not found." Fixed `resolveContentPath` to check the name as-is before appending `.md`. Extension-less names (e.g. `my-config`) still fall through to the `.md` append.

### Security

- **Hook safety scanning in evaluate**: The new `hook evaluate` command scans every `command` string in `hooks.json` for dangerous shell patterns before hooks are deployed. This is defense-in-depth: `hook validate` already checks schema, but `hook evaluate` catches what the commands actually do.


## [0.1.7] - 2026-06-21

### Bug Fixes

- **Pi/omp hooks silently dropped on install**: Two issues in the canonical-to-Pi hook converter prevented hooks from being emitted for `pi` and `omp` targets. (1) Claude Code uses PascalCase event names (`Stop`, `PreToolUse`) while the canonical mapping expected camelCase (`stop`, `preToolUse`) — fixed by normalizing the first character to lowercase before lookup. (2) Claude Code wraps hooks in a nested matcher structure (`{matcher: "*", hooks: [{type, command, timeout}]}`) that the converter didn't flatten — fixed by walking `def.hooks[]` when present. Pi and omp now correctly receive hook configuration.

### Improvements

- **`bun run bump-ver` now keeps marketplace and plugin manifests in sync**: The version bump script previously only updated `apps/cli/package.json`, leaving `.claude-plugin/marketplace.json` and `plugins/cc/plugin.json` stale. This caused Claude Code to skip installs because the plugin version appeared unchanged. The script now iterates all marketplace plugin entries, updates their `version` field, then updates each plugin's own `plugin.json` via the `source` path. All files are committed together.

---

## [0.1.4] - 2026-06-20

### New Features

#### Quality System — Rubric-Driven Evaluation & Evolution

- **Rubric config format**: Define quality criteria in YAML with weights, anchors, and versioning. Ships with 5 package-default rubrics (`agent`, `skill`, `command`, `hook`, `magent`). Load-time validation catches weight-sum and naming errors early. (`evaluate --rubric <path>`)
- **Scorer seam**: `evaluate --rubric --json` emits a scoring brief for an external model; `evaluate --ingest <file> --save` ingests the scored result and persists it. Enables model-driven quality scoring without the CLI making any model calls.
- **Generation seam**: `evolve --propose-only --json` emits a generation brief (with verbatim goal anchor, rubric criteria, and constraints); `evolve --ingest <file>` ingests authored proposed changes and applies them through the verify loop.
- **Double-loop gate**: Four-gate quality control for `evolve --ingest` — (1) deterministic `validate` (0 errors), (2) Δ-margin (score must improve by ≥ `--margin`, default 0.05), (3) anchor hash (goal anchor unchanged), (4) skeptic review (regressive merge rejected and restored). Configurable via `--margin`.
- **Version-aware quality trends**: `evolve` trends partition by `rubric_version`, preventing false regression signals when rubrics are updated.

#### Skill Operations

- **`skill package`**: Bundle a skill and its companion files (references, templates) into a distributable archive.
- **`skill migrate`**: Merge one or more source skills into a destination skill. Deterministic merge core (frontmatter union, body concat+dedupe) works standalone; `--refine` routes through the generation seam for model-assisted refinement.

#### Install Pipeline

- **Hook counts in install summary**: The `install` command now reports the number of hooks emitted to each target in its summary output.
- **Hook enablement shim for pi/omp/hermes**: Canonical hook events map to `@vahor/pi-hooks` format for `pi` and `omp`; `hermes` reuses the `opencode` surrogate output. Hook command strings are written as JSON data, never evaluated by the CLI.

#### Plugin Content

- **5 meta-agent skills migrated**: `cc-agents`, `cc-commands`, `cc-hooks`, `cc-magents`, `cc-skills` — each with SKILL.md, references, and platform compatibility docs.
- **5 expert personas**: `expert-agent`, `expert-command`, `expert-hook`, `expert-magent`, `expert-skill` — define Scorer/Author/Skeptic/Judge roles with exact I/O contracts for the two-call seam pattern.
- **Anti-hallucination skill + guard engine**: Migrated from Spur. Prose-only skill in `plugins/cc/skills/anti-hallucination/`, guard engine in `plugins/cc/scripts/anti-hallucination/`, Claude Code Stop-hook wired in `hooks.json`.
- **`validate` hidden**: The standalone `validate` command is now hidden behind the `evaluate`/`refine`/`evolve` gate. CLI surface is 16 commands.

#### CLI & Architecture

- **Binary on PATH verification**: Build output path fixed to `dist/index.js` (matching the `bin` target). `scripts/builder.ts` postbuild is now idempotent. Phase 3 exit gate passes all 7 blocks.
- **Core package extraction**: Reusable domain logic (content, quality, pipeline, rubrics, targets, marketplace, mapper, rulesync) moved from `apps/cli` to a new `@gobing-ai/superskill-core` workspace package at `packages/core`. CLI imports switched to the workspace alias. Package-boundary test enforces core never imports from app, never calls `process.exit`, and never writes to stdout/stderr. Enables independent reuse of the domain logic.
- **ts-libs 0.3.21**: Upgraded `@gobing-ai/ts-*` dependencies from 0.3.19 to 0.3.21. `omp`, `hermes`, and `antigravity-cli` are now canonical `AgentName` values — slash-command dialect translation maps 1:1 instead of proxying through `pi`/`opencode`. Only `antigravity-ide` still bridges through `opencode`.

### Improvements

- **Adapt gap audit closed**: Verified that the 4-stage install conversion pipeline (`rewriteColonRefs`, `translateSlashCommands`, `normalizeFrontmatter`, `convertToPiSubagent`) covers all transforms previously handled by the deleted `adapt.ts`/`adapters/` code. 15-test parity regression test (`adapt-parity.test.ts`) locks this in.
- **Pi-subagent parser hardened**: Replaced hand-rolled `parseFrontmatter` with the canonical parser from `content/frontmatter.ts` (ADR-012), fixing block-style YAML array and nested-value matching bugs.
- **Hook event dedup**: `KNOWN_HOOK_EVENTS` is now exported once from `quality/hook.ts` and imported by `operations/validate.ts` instead of being defined in both.
- **Plugin resolution dedup**: Extracted `resolvePluginRoot()` helper shared by `install` and `hook emit`, replacing duplicate 18-line blocks.
- **`refine --auto` mode fixed**: Was skipping all findings instead of applying auto-apply fixes. Now applies auto-classified findings via `applyAutoFixes()`, with trailing-whitespace handling and strict validation enabled.

### Bug Fixes

- **fix(skill)**: Use `echo()` over `stdout.write` in skill package handler to satisfy spur violations; renamed test file to `package.test.ts` for clarity.


---

## [0.1.6] - 2026-06-21

### New Features

#### Skills 2.0 — Unified Entity Distribution

- **Commands and subagents adapted as skills for non-Claude targets**: `superskill install` now converts Claude Code plugin commands and subagents into Skills 2.0 skill directories via `pipeline/adapt-command.ts` and `pipeline/adapt-subagent.ts`. Commands become non-invocable skill entries (`disable-model-invocation: true`); subagents remain model-invocable with preserved trigger examples, tools, skills, and color. Pi additionally receives native agent format via `pipeline/pi-subagent.ts`. Every target now receives a uniform skill-based layout — omp and hermes no longer receive zero commands/subagents.
- **Plugin-scoped colon reference rewriting**: Replaced the hardcoded `/(rd3|wt):/` allowlist with plugin-prefix-scoped `pluginPrefix:name` → `pluginPrefix-name` rewriting (`pipeline/rewrite-references.ts`). The rewriter threads the plugin name through the install pipeline, correctly handling `cc:`, `sp:`, and any other plugin prefix while preserving non-plugin colons (`node:fs`, `bun:test`, etc.).
- **Pi subagent discovery filtered to existing skills**: `convertToPiSubagent` now verifies the skill directory exists before emitting `skill:` entries, matching the old shell-script behavior. Eliminates phantom skill references.

#### Claude Code Native Plugin Install

- Claude Code targets now use the native `claude plugin marketplace add` + `claude plugin install` flow. Cache clearing is defensive and marketplace-name-scoped. Replaces the broken `--path` flag approach.

#### Meta Agent Skills

- All five meta-agent skills (`cc-agents`, `cc-commands`, `cc-hooks`, `cc-magents`, `cc-skills`) now ship with full `references/` documentation (workflows, platform compatibility, evaluation frameworks, troubleshooting), `metadata.openclaw` platform metadata, and `agents/openai.yaml` Codex platform config. Each skill is a self-contained knowledge module ready for multi-platform distribution.

### Improvements

#### Quality System

- **Shared keyword lists**: Imperative verb and vague-term lists extracted into shared constants — no more 4× duplication across command/skill evaluators.
- **Unified clarity scoring**: Command and skill evaluators now share one `scoreClarityFromDensities` formula, making quality scores comparable across entity types.
- **Tightened tool-reference heuristic**: Backtick token regex no longer matches arbitrary inline-code spans (`json`, `true`). Now matches actual tool names and `tool(s):` frontmatter.
- **Split `dimensions.ts`**: Registry (`types.ts`) separated from heuristics (`heuristics.ts`). Single `evaluate(type, ...)` dispatch replaces duplicated `evaluate<Agent>`, `evaluate<Command>`, etc. functions.
- **Documented `computeAggregate`**: Explicit doc-comment notes the unweighted-mean design for heuristic path (rubric weights apply only on `--ingest`).

#### Pipeline

- **Shared frontmatter walker**: `walkFrontmatter` extracted as a single implementation shared by `adapt-command` and `adapt-subagent`. Replaces two near-identical inline walkers.
- **Removed dead `ConversionPipeline`**: Unused class deleted; `docs/03` aligned.

#### Install Robustness

- **`outputRoot` threaded through rulesync**: Global-mode skills now land in correct directories. Project-mode parent directories pre-created to prevent ENOENT on fresh workspaces.
- **`..` traversal guard tightened**: Replaced substring `.includes('..')` check with path-segment regex matching actual `../` traversal patterns, fixing false rejections for legitimate paths like `./a..b/plugin`.

#### Documentation

- **Entity location tables**: Added verified global and project-level entity paths for all 9 target agents (Claude Code, Codex, Pi, omp, OpenCode, Antigravity IDE/CLI, Hermes, OpenClaw). Each path verified against the agent's source code in `vendors/`.
- **Help docs refreshed**: `cmd_install.md` updated with current pipeline modules and workspace-refactored source paths. Plugin README updated with Skills 2.0 adaptation design notes.

### Bug Fixes

- **`dedupeLines` content corruption** (P2): Merging two skills that shared a heading, list item, or code fence silently deleted later occurrences. Fixed to scope deduplication to heading blocks — content preservation confirmed across 843 tests.
- **Backtick token score inflation** (P3): Any inline-code span with ≥2 backtick tokens saturated the tool-reference score to 1.0. Now matches only known tool names.
- **Slash-command colon swallowed before translation** (P2, bug-081): `rewriteSkillReferences` was stripping the slash-command colon before the per-target slash translator ran, causing codex/pi dialect translation to silently no-op in real installs. Fixed: slash-command lines are now preserved for the translator. Integration assertion tightened to require the `$` prefix.
- **Parity test normalization bug**: Deleted dead `normalizeFrontmatter` function that was silently swallowing block-style YAML arrays. Reworked parity test to use the canonical frontmatter parser (ADR-012).
---

## [0.1.3] - 2026-06-17

_Initial tagged release. See git history for details._
