---
doc: 02_ROADMAP
owns: WHEN — phases, current vs deferred, sequencing
authority: derived
version: 3.8.0
derived_from: [00_ADR, 01_PRD]
owner: Robin Min
updated_at: 2026-08-12
read_before: placing work in a phase; edit when phase status changes
edit_rules: 99 §6.3
sync: [T5]
---

# Roadmap

## Phase 1: Distribution — `superskill install`

**Goal:** Install a Claude Code plugin's skills, commands, subagents, hooks, and MCP config to any target coding agent, using `rulesync` as the conversion engine.

**Design:** [design-doc-phase1.md](design/design-doc-phase1.md)

- [x] Foundation: scaffold, gates green, ts-base artifacts removed, docs 00–05 ready
- [x] Target taxonomy + live `superskill.jsonc` defaults
- [x] Marketplace manifest resolver — `--marketplace` local/GitHub locator (ADR-011, ADR-034)
- [x] `superskill install <plugin>` — plugin → `.rulesync/` → `rulesync.generate()` → targets
- [x] Conversion pipeline: slash dialect, colon→hyphen, frontmatter normalization
- [x] Feature dispatch: skills, commands, subagents, hooks, MCP, Claude Code marketplace
- [x] Target agents: Claude Code, Codex, Pi, omp, OpenCode, antigravity-cli, antigravity-ide, Hermes
- [x] Verify: idempotent, dry-run, error handling, ≥90% test coverage

**Exit:** `superskill install cc --targets all` produces correct output for every target from a fresh checkout.

---

## Phase 2: Authoring + quality — `superskill agent|skill|command|hook|magent`

**Goal:** Migrate the five meta-agent skills into first-class CLI commands with artifact-appropriate authoring and quality lifecycles. The key enhancement is **self-evolution** — persistent evaluation data drives improvement proposals.

**Design:** [design-doc-phase2.md](design/design-doc-phase2.md)

- [x] `superskill agent` — scaffold/validate/evaluate/refine/evolve shipped (F5)
- [x] `superskill skill` — authoring lifecycle shipped (F5; ecosystem and distribution verbs tracked in Phases 5–6)
- [x] `superskill command` — scaffold/validate/evaluate/refine/evolve shipped (F5)
- [x] `superskill hook` — validate/evaluate plus safe refine/evolve variants shipped (F5)
- [x] `superskill magent` — scaffold/validate/evaluate/refine/evolve shipped (F5)
- [x] Shared scaffold/validate/evaluate/refine/evolve operations shipped with artifact-specific constraints (G21–G26)
- [x] SQLite evaluations + proposals store shipped (F4)
- [x] Built-in templates and user override resolution shipped (G21)

**Exit (met):** Data-backed evolution and its persistence/command integration are covered by G26, F5, and E3.

---

## Phase 3: Plugin adaptation & script consolidation — `plugins/cc/`

**Goal:** Adapt the copied plugin to the `cc` namespace, route its authoring workflows through the CLI, and remove obsolete per-skill embedded code.

**Design:** [design-doc-phase3.md](design/design-doc-phase3.md)

- [x] Namespace migrated from `rd3` to `cc` across the bundled plugin (H3)
- [x] Five authoring skills and expert agents delegate to `superskill` (H4)
- [x] Slash-command set reconciled and dangling hook references removed (H5)
- [x] Obsolete per-skill scripts/templates/tests and hook emitter/schema copies removed (H6)
- [x] `superskill` binary packaging and PATH contract verified (I1)
- [x] Phase verification passed with the namespace and ownership invariants enforced (I1)

> Plugin-level runtime scripts introduced later by ADR-023 are intentional distribution artifacts; H6 removed the obsolete per-skill copies, not that shared runtime seam.

**Exit (met):** H3–H6 and I1 completed the namespace, delegation, cleanup, binary, and verification work.

---

## Phase 4: The quality brain — non-deterministic evaluation & evolution

**Goal:** Close the evaluation & evolution gap for all five meta-agent skills by adding a non-deterministic quality layer — real LLM-driven scoring and content generation — while keeping the `superskill` CLI deterministic and the model intelligence in the agent / Spur layer.

**Design:** [design-doc-phase4.md](design/design-doc-phase4.md)

- [x] Versioned, user-overridable rubric config and five package defaults shipped (G31)
- [x] Scorer envelope/ingest seam with rubric-version persistence shipped (G32)
- [x] Generation envelope/ingest seam replaced the placeholder implementation (G33)
- [x] Validate + score-delta + goal-anchor double-loop gate shipped (G34)
- [x] `cc` authoring skills and expert personas route through the quality seams (H7)
- [x] Standalone validation wrappers removed where the internal gate owns validation (H7)
- [x] Deterministic fixture replay and empirical behavior gate shipped with gate coverage (G35)

**Exit (met):** G31–G35 and H7 implement and verify the scorer, generator, adversarial, and behavior-gate seams.

---

## Phase 5: Universal hooks & deterministic verb restoration

**Goal:** Deliver one canonical hook definition that installs across every supported agent — by **leveraging `rulesync`'s native hook feature** (not a bespoke abstraction) — and restore the deterministic verbs deleted in Phase 3.

**Design:** [design-doc-phase5.md](design/design-doc-phase5.md)

> **Finding:** rulesync already ships a canonical hook schema, event taxonomy, per-tool support matrix, and `superskill install` already maps `hooks.json` into `.rulesync/` **and forwards `hooks` to `generate()`** — hooks already emit for the 4 rulesync-hook-supported targets. The deleted `cc-hooks` bash emitters reinvented this. Phase 5 adopts rulesync's format rather than rebuilding one.

- [x] Hook target coverage verified and Pi/omp/Hermes enablement shipped (H8)
- [x] Install result surfaces emitted hook counts (F6)
- [x] `cc:cc-hooks` and its expert agent target the canonical hook definition (H9)
- [x] `superskill hook emit` and target-specific hook dispatch shipped (H8, H9)
- [x] `skill package` and `skill migrate` restored; the adapt gap is covered inside install (G41–G43)

**Exit (met):** F6, H8, H9, and G41–G43 completed hook parity, count reporting, and deterministic verb restoration.

---

## Phase 6: Distribution hardening & ergonomics (PRD-deferred)

**Goal:** Close the remaining `01_PRD.md` deferred install/CLI items now that the authoring + distribution core is stable.

**Design:** _(deferred — inventory in design-doc-phase5.md §5)_

- [x] Remote marketplace locators (`--marketplace <github-url|owner/repo>`) — fetch + cache layer (task 0113, ADR-034). In-manifest object `source` (Layer B) remains deferred.
- [ ] Thin commands: `superskill list`, `doctor`, `init`.

**Exit:** a remote marketplace source installs end-to-end; `list`/`doctor`/`init` ship and pass the gate.

> **Continuously deferred** (no target phase until `superskill` matures): import from non-Claude formats (Codex/Pi → canonical); `rulesync` upstream contribution for Hermes/omp.
> **Permanently out of scope** (PRD §Out of scope): runtime agent orchestration (`@gobing-ai/ts-ai-runner`), GUI/TUI, cloud sync / registry.
