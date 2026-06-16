---
doc: 02_ROADMAP
owns: WHEN — phases, current vs deferred, sequencing
authority: derived
version: 3.3.0
derived_from: [00_ADR, 01_PRD]
owner: Robin Min
updated_at: 2026-06-16
read_before: placing work in a phase; edit when phase status changes
edit_rules: 99 §6.3
sync: [T5]
---

# Roadmap

## Phase 1: Distribution — `superskill install`

**Goal:** Install a Claude Code plugin's skills, commands, subagents, hooks, and MCP config to any target coding agent, using `rulesync` as the conversion engine.

**Design:** [design-doc-phase1.md](design/design-doc-phase1.md)

- [x] Foundation: scaffold, gates green, ts-base artifacts removed, docs 00–05 ready
- [ ] Target taxonomy + `superskill.jsonc` config schema
- [ ] Marketplace manifest resolver — `--marketplace`, local relative-path sources (ADR-011)
- [ ] `superskill install <plugin>` — plugin → `.rulesync/` → `rulesync.generate()` → targets
- [ ] Conversion pipeline: slash dialect, colon→hyphen, frontmatter normalization
- [ ] Feature dispatch: skills, commands, subagents, hooks, MCP, Claude Code marketplace
- [ ] Target agents: Claude Code, Codex, Pi, omp, OpenCode, antigravity-cli, antigravity-ide, Hermes
- [ ] Verify: idempotent, dry-run, error handling, ≥90% test coverage

**Exit:** `superskill install rd3 --targets all` produces correct output for every target from a fresh checkout.

---

## Phase 2: Authoring + quality — `superskill agent|skill|command|hook|magent`

**Goal:** Migrate the five meta-agent skills from `cc-agents/plugins/rd3/skills/cc-agents/` into first-class CLI commands, each with scaffold, validate, evaluate, refine, and evolve operations. The key enhancement is **self-evolution** — persistent evaluation data drives improvement proposals.

**Design:** [design-doc-phase2.md](design/design-doc-phase2.md)

- [ ] `superskill agent` — subagent management (origin: `cc-agents`)
- [ ] `superskill skill` — skill management (origin: `cc-skills`)
- [ ] `superskill command` — slash command management (origin: `cc-commands`)
- [ ] `superskill hook` — hook management (origin: `cc-hooks`)
- [ ] `superskill magent` — main-agent config management (origin: `cc-magents`)
- [ ] Shared operations: scaffold (templates), validate (schema), evaluate (quality dimensions), refine (fix), evolve (longitudinal proposals)
- [ ] Data store: SQLite evaluations + proposals tables
- [ ] Templates shipped with npm package, overridable per user

**Exit:** Each command's `evolve` operation produces a data-backed improvement proposal from at least three historical evaluation runs.
