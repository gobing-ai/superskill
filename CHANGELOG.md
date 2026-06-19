# Changelog

All notable changes to `@gobing-ai/superskill` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Conventional Commits](https://www.conventionalcommits.org/).

## [0.1.4] - 2026-06-19

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

#### CLI

- **Binary on PATH verification**: Build output path fixed to `dist/index.js` (matching the `bin` target). `scripts/builder.ts` postbuild is now idempotent. Phase 3 exit gate passes all 7 blocks.

### Improvements

- **Adapt gap audit closed**: Verified that the 4-stage install conversion pipeline (`rewriteColonRefs`, `translateSlashCommands`, `normalizeFrontmatter`, `convertToPiSubagent`) covers all transforms previously handled by the deleted `adapt.ts`/`adapters/` code. 15-test parity regression test (`adapt-parity.test.ts`) locks this in.

### Bug Fixes

- **fix(skill)**: Use `echo()` over `stdout.write` in skill package handler to satisfy spur violations; renamed test file to `package.test.ts` for clarity.

---

## [0.1.3] - 2026-06-17

_Initial tagged release. See git history for details._
