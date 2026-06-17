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

---

## Phase 3: Plugin adaptation & script consolidation — `plugins/cc/`

**Goal:** Enhance and customize the copied `rd3:cc-*` agent skills, subagents, and slash commands inside `plugins/cc` to leverage the new `superskill` CLI infrastructure. Get rid of all embedded scripts (`plugins/cc/skills/*/scripts/`) and migrate their workflows to first-class `superskill` commands.

**Design:** [design-doc-phase3.md](file:///Users/robin/xprojects/superskill/docs/design/design-doc-phase3.md)

- [ ] Rename all `rd3` references to `cc` across `plugins/cc/` (skill dir names kept; refs → `cc:cc-*`).
- [ ] Refactor all five skill instructions (`cc-agents`, `cc-skills`, `cc-commands`, `cc-hooks`, `cc-magents`) to invoke `superskill <type> <op>` (the five real CLI verbs: scaffold, validate, evaluate, refine, evolve) instead of `bun scripts/*.ts`.
- [ ] Slash commands: rewrite the 17 that map to a CLI verb; delete the 8 orphans (`*-adapt`, `hook-emit/list/setup`, `skill-migrate/package`) — no CLI verb (restoration tracked in Phase 5).
- [ ] Update all 5 expert subagent definitions under `plugins/cc/agents/` to delegate to `superskill`.
- [ ] Strip the dangling `plugins/cc/hooks/hooks.json` entries (leftover `indexed-context`/`tasks`/`anti-hallucination` skills are owned elsewhere, not this plugin).
- [ ] Establish the global `superskill` binary path (build + link/publish) so plugin commands resolve on PATH.
- [ ] Delete obsolete embedded code (`scripts/`, `templates/`, `tests/`, `cc-hooks/{emitters,schema}/`) after refactors stop referencing it.
- [ ] Verify: namespace/script/embedded-dir invariants clean; gates pass.

> The non-deterministic eval / Spur orchestration / adversarial evolution is **deferred to Phase 4**; cross-platform hooks and restoring deleted verbs are **deferred to Phase 5**.

**Exit:** `rg "rd3" plugins/cc/` returns zero; no embedded script execution remains; `hooks.json` carries no dangling skill references; the 17 surviving commands delegate to the `superskill` CLI; verification gate passes.

---

## Phase 4: The quality brain — non-deterministic evaluation & evolution

**Goal:** Close the evaluation & evolution gap for all five meta-agent skills by adding a non-deterministic quality layer — real LLM-driven scoring and content generation — while keeping the `superskill` CLI deterministic and the model intelligence in the agent / Spur layer.

**Design:** [design-doc-phase4.md](file:///Users/robin/xprojects/superskill/docs/design/design-doc-phase4.md)

- [ ] Versioned, user-overridable **rubric** config (unified shape) + package defaults for all 5 types.
- [ ] **Scorer seam:** `evaluate --rubric`/`--ingest` envelope I/O; rubric-version stamping; weighted aggregate.
- [ ] **Generation seam:** replace the `generateChanges` placeholder (`evolve.ts:118`); `evolve --propose-only --json` generation briefs; `evolve --ingest` for agent-authored proposals.
- [ ] **Double-loop gate** on ingest (validate-zero-errors + Δ-margin + goal-anchor check), reject-on-regression with restore.
- [ ] **`cc` skill + Spur personas:** Scorer / Author / Skeptic / Judge wired to the seams.
- [ ] Hide `validate` behind evaluate/refine/evolve (no `*-validate` slash command); internal validate gate for all 5 types.
- [ ] Fixture-replay tests for the ingest paths (no live model calls); ≥90% coverage.

**Exit:** `superskill <type> evolve` produces a real rewritten file (no placeholder) for all 5 types; a rubric edit changes scores with no CLI rebuild; the gate rejects a regressive proposal and restores; CLI makes zero model API calls.

---

## Phase 5: Universal hooks & deterministic verb restoration

**Goal:** Deliver one canonical hook definition that installs across every supported agent — by **leveraging `rulesync`'s native hook feature** (not a bespoke abstraction) — and restore the deterministic verbs deleted in Phase 3.

**Design:** [design-doc-phase5.md](file:///Users/robin/xprojects/superskill/docs/design/design-doc-phase5.md)

> **Finding:** rulesync already ships a canonical hook schema, event taxonomy, per-tool support matrix, and `superskill install` already maps `hooks.json` into `.rulesync/`. The deleted `cc-hooks` bash emitters reinvented this. Phase 5 adopts rulesync's format rather than rebuilding one.

- [ ] Web-research **validation** pass: rulesync hook coverage × our 8 targets, event-mapping fidelity, gaps (Pi/omp/hermes); record table + sources.
- [ ] Un-stub the install hook path — `rulesync.ts:51` hardcodes `hooksCount: 0`; wire mapped `hooks.json` through `runRulesync`.
- [ ] Re-author `cc:cc-hooks` (+ expert-hook) against the rulesync-canonical `HookDefinitionSchema`; evaluate/evolve reuse the Phase 4 brain.
- [ ] `superskill hook emit --target <agent>` wrapper; research + enable Pi/omp hook parity via an installable extension/shim (fallback: copy-step); hermes via copy-step.
- [ ] Restore deleted verbs: `adapt` (confirm gap closed inside `install`), `skill package`, `skill migrate` (refinement via Phase 4).

**Exit:** one `hooks.json` installs correct native hook config for every rulesync-supported target (uncovered targets shimmed or documented, no silent drop); `rulesync.ts` reports real hook counts; restored verbs pass the gate.

---

## Phase 6: Distribution hardening & ergonomics (PRD-deferred)

**Goal:** Close the remaining `01_PRD.md` deferred install/CLI items now that the authoring + distribution core is stable.

**Design:** _(deferred — inventory in design-doc-phase5.md §5)_

- [ ] Remote marketplace sources (`github`, `url`, `git-subdir`, `npm`) — fetch + cache layer (Phase 1 was local-relative only).
- [ ] Thin commands: `superskill list`, `doctor`, `init`.

**Exit:** a remote marketplace source installs end-to-end; `list`/`doctor`/`init` ship and pass the gate.

> **Continuously deferred** (no target phase until `superskill` matures): import from non-Claude formats (Codex/Pi → canonical); `rulesync` upstream contribution for Hermes/omp.
> **Permanently out of scope** (PRD §Out of scope): runtime agent orchestration (`@gobing-ai/ts-ai-runner`), GUI/TUI, cloud sync / registry.

