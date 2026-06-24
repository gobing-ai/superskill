---
doc: 00_ADR
owns: WHY — which cross-cutting decision was made, and the one-line reason
authority: authoritative
version: 1.6.0
owner: Robin Min
updated_at: 2026-06-22
read_before: any structural change; add a dated entry before diverging from a decision
edit_rules: 99 §6.1
sync: [T1, T2]
---

# Architecture Decision Record

Append-only. Never renumber, never delete. Corrections = dated `**Amendment (YYYY-MM-DD)**` blocks.
Reversals = new entries naming what they supersede. Burned numbers get a `Skipped` stub.

---

## ADR-001: Bun + TypeScript + Biome stack

**Status:** Accepted · **Date:** 2026-06-16

**Decision.** Use Bun 1.3 as runtime, package manager, and test runner; TypeScript for all source; Biome for lint and format. No ESLint, no Prettier, no Node-only tooling.

**Why.** Single-tool stack reduces configuration surface and dependency churn.

**Detail:** see 03 §Stack.

---

## ADR-002: Turborepo + Bun-workspaces monorepo layout

**Status:** Accepted · **Date:** 2026-06-16

**Decision.** Monorepo with `apps/` (CLI binary) and `packages/` (shared libraries). Workspaces reference each other via `@<scope>/<pkg>` aliases.

**Why.** Enforces module boundaries at the package level while keeping a single build/test/lint pipeline.

**Detail:** see 03 §Module boundaries.

**Realization (2026-06-19, task 0043).** `packages/core` (`@gobing-ai/superskill-core`) extracted as the first concrete shared library: content, quality, pipeline, targets, marketplace, mapper, rulesync, built-in rubrics, evaluator engines, and reusable operation APIs for validate/scaffold/package/migrate. `apps/cli` imports it via the workspace alias; core never imports from the app, calls `process.exit`, or writes to stdout/stderr. `store/` remains app-owned because persisted evaluations/proposals still have no second consumer and depend on the CLI-local data-root/store seam. No behavior change — the CLI bundle inlines core source via `bun build`. Detail: see 03 §Module boundaries.

---

## ADR-003: Commander as CLI framework

**Status:** Accepted · **Date:** 2026-06-16

**Decision.** Use Commander.js for CLI argument parsing and subcommand dispatch.

**Why.** Mature, zero-config, and already the convention in sibling projects.

**Detail:** see 04 §Commands.

---

## ADR-004: vendor/ directory is reference-only

**Status:** Accepted · **Date:** 2026-06-16

**Decision.** Files under `vendors/` are read-only reference copies of upstream source. Never modify them in-tree.

**Why.** Keeps vendor diffs auditable and makes upstream rebase a clean copy operation.

**Detail:** see 03 §Module boundaries.

---

## ADR-005: rulesync as multi-agent format conversion engine

**Status:** Accepted (design) · **Date:** 2026-06-16

**Decision.** Use `rulesync` (npm package) as the format conversion engine for dispatching skills, commands, subagents, hooks, MCP config, and ignore rules to target coding agents.

**Why.** rulesync already maintains 30+ target backends; superskill adds format adaptation and distribution, not backend maintenance.

**Detail:** see 03 §Conversion pipeline; plans for full design.

---

## ADR-006: Claude Code plugin format as initial SSOT

**Status:** Accepted (design) · **Date:** 2026-06-16

**Decision.** Start with Claude Code plugin format (skills, commands, subagents, hooks) as the single source of truth. Design the mapping layer to accept imports from other agent formats later.

**Why.** The existing plugin corpus is in this format; converting it is the immediate deliverable.

**Detail:** see 03 §Source of truth; 04 §Plugin format.

---

## ADR-007: @gobing-ai/ts-* as preferred library source

**Status:** Accepted · **Date:** 2026-06-16

**Decision.** Prefer `@gobing-ai/ts-*` packages from `~/xprojects/ts-libs` for shared utilities, runtime abstractions, AI-runner integration, and infrastructure. Add external npm dependencies only when ts-libs has no equivalent.

**Why.** Single owner, consistent patterns across sibling projects, local modifiability via `bun link` for enhancements during development.

**Detail:** see 03 §Stack. When a ts-libs package needs enhancement during superskill development, use `bun link` to connect the local ts-libs checkout and iterate directly — the workflow is bidirectional: superskill drives ts-libs improvements and consumes them immediately.

---

## ADR-008: Vendor source references for design input

**Status:** Accepted · **Date:** 2026-06-16

**Decision.** `vendors/rulesync` and `vendors/skills` are the canonical reference copies consulted during design and planning, in addition to the read-only rule (ADR-004). Design decisions about format conversion or distribution MUST be checked against their source code.

**Why.** These upstream projects are the foundation of the conversion and distribution pipeline. Decisions that contradict their architecture or miss features they already provide create integration debt and rework.

**Detail:** see 03 §Module boundaries. Extends ADR-004 with the active vendor inventory and their design role. Additional vendor copies may be added to this entry as the project evolves.

---

## ADR-009: @gobing-ai/ts-ai-runner AgentShim as agent abstraction layer

**Status:** Accepted · **Date:** 2026-06-16

**Decision.** superskill uses `@gobing-ai/ts-ai-runner`'s `AgentShim` interface (see `shims.ts`) as the single abstraction for per-agent differences: CLI invocation, slash-command dialect translation, output mode handling, and agent detection. No superskill module hardcodes agent-specific behavior outside this layer.

**Why.** The `AgentShim` contract already handles a multi-agent matrix. Enriching it for new targets (`antigravity-cli`, `antigravity-ide`, `hermes`, `omp`) in ts-libs benefits all consumers; reimplementing agent knowledge in superskill duplicates it.

**Detail:** see `~/xprojects/ts-libs/packages/ai-runner/src/agents/shims.ts`. New coding agents and enhanced shim capabilities (e.g., new aspect types) are added to ts-libs via `bun link` during superskill development and flow back to the published package. superskill imports `AgentName`, `AgentShim`, `getAgentShim`, `translateSlashCommand`, and `AgentDetector` — never reimplements them.

**Amendment (2026-06-16, ADR-009).** The original entry stated the shim "already handles the 7-agent matrix (Claude, Codex, Gemini, Pi, OpenCode, Antigravity, OpenClaw)." Verified against `@gobing-ai/ts-ai-runner@0.3.19`: `AgentName = 'claude' | 'codex' | 'gemini' | 'pi' | 'opencode' | 'antigravity' | 'openclaw'`. This matrix **includes** `gemini`/`openclaw` (which superskill does not target) and **excludes** all four Phase 1 additions (`antigravity-cli`, `antigravity-ide`, `hermes`, `omp`). The decision (delegate agent knowledge to the shim) stands; the coverage claim was overstated. Until the shim's `AgentName` is enriched in ts-libs, superskill bridges its own `Target` to the shim via a `TARGET_TO_AGENT_NAME` map (`omp→pi`; `antigravity-cli`/`antigravity-ide`→default dialect; `hermes` handled outside the shim). `translateSlashCommand`'s `default` branch already yields the correct `/plugin-command` form for unmapped agents, so the bridge is sufficient for Phase 1. See 03 §Conversion pipeline, 04 §Target taxonomy.

**Amendment (2026-06-20, ADR-009).** Upgraded `@gobing-ai/ts-ai-runner` from 0.3.19 to 0.3.21. `AgentName` is now `'claude' | 'codex' | 'gemini' | 'pi' | 'opencode' | 'antigravity-cli' | 'openclaw' | 'hermes' | 'omp'` — `'antigravity'` was renamed to `'antigravity-cli'`, and `'omp'`/`'hermes'` were added as canonical ids. `TARGET_TO_AGENT_NAME` updated: `omp→'omp'`, `hermes→'hermes'`, `antigravity-cli→'antigravity-cli'` (all now map 1:1 to canonical `AgentName` values). Only `antigravity-ide` (not in `AgentName`) still bridges to `'opencode'`. Slash-command output is unchanged: `translateSlashCommand` handles `'omp'` with the same `/skill:` dialect as `'pi'`, and `'hermes'`/`'antigravity-cli'` fall to the `default` branch (same as `'opencode'`). The 0.3.19-era bridge workaround described in the previous amendment is now retired for all targets except `antigravity-ide`.

---

## ADR-010: superskill owns the output root; rulesync owns relative paths

**Status:** Accepted (design) · **Date:** 2026-06-16

**Decision.** `superskill install` sets `rulesync.generate({ outputRoots })` explicitly — `[os.homedir()]` for `--global`, `[process.cwd()]` otherwise — and lets rulesync resolve every per-target relative path. superskill does **not** maintain its own per-target install-path table for any target rulesync supports. Only the two targets rulesync lacks (`hermes`, `omp`) get a superskill-owned copy step.

**Why.** rulesync writes to `<outputRoot>/<relativeDirPath>` and never resolves `~` itself; the `global` flag only swaps the *relative* subdir. Duplicating its path table in superskill would violate "rulesync owns format knowledge" (03 invariant 4) and drift the moment upstream paths change.

**Detail:** see 03 §Target taxonomy and §Data flow; 04 §Target taxonomy. Verified against `rulesync@8.28.1`: `Config.getOutputRoots()` defaults to `process.cwd()`; zero `os.homedir()` references in `src/`; `PiSkill`/`AntigravitySharedSkill`/`CodexCliSkill` `getSettablePaths({ global })` return relative subdirs only (e.g. Pi global → `.pi/agent/skills`, antigravity-cli global → `.gemini/antigravity-cli/skills`). Supersedes the hand-authored global-path tables previously in design-doc-phase1 and 04.

**Amendment (2026-06-21, task 0045 R1).** `RulesyncOptions` gains an optional `outputRoot?: string` that overrides the root rulesync writes into. When omitted, the original ADR-010 derivation holds (`global ? homedir() : process.cwd()`). This widens — does not replace — the original decision: production install never sets `outputRoot` (global → `$HOME` is correct), but tests and a future `--output <dir>` flag can isolate writes to a temp root. The override is threaded uniformly into `runRulesync`, surrogate copies (hermes/omp), and Pi native-agent dispatch, closing the gap where the rulesync skill payload silently ignored `outputRoot` and leaked to `$HOME`/`cwd`. Additionally, `executeInstall` pre-creates per-target skills parent dirs (via `TARGET_SKILLS_RELDIR`, project mode) before rulesync writes, preventing an `ENOENT mkdir` crash on `install --no-global` from a clean cwd (task 0045 R2).


**Amendment (2026-06-23).** Pi, codex, and antigravity (cli + ide) now all route to the `codexcli` rulesync target, which writes skills to `~/.agents/skills/` (global) / `.agents/skills/` (project). Research confirms Pi, OMP, and Antigravity 2.0 all natively support `~/.agents/skills/`. This eliminates duplicate skill copies when an agent reads from both its own directory and `~/.agents/skills/`. OMP's superskill-owned copy step is removed — it reads from `~/.agents/skills/` natively. Only hermes retains a superskill copy (from opencode). `TARGET_TO_RULESYNC` updated: `pi` and `antigravity-*` now map to `'codexcli'`. `TARGET_SKILLS_RELDIR` updated to match.
---

## ADR-011: plugin resolution via Claude Code marketplace manifest

**Status:** Accepted (design) · **Date:** 2026-06-16

**Decision.** `superskill install <plugin>` resolves the plugin root through a Claude Code `.claude-plugin/marketplace.json` manifest. Resolution order: (1) `--marketplace <path>` if given; (2) `.claude-plugin/marketplace.json` in CWD; (3) fall back to the `plugins/<name>/` directory scan. The plugin root is `plugins[].source` (matched on `name`), prefixed by `metadata.pluginRoot` when present, resolved relative to the **marketplace root** (the directory containing `.claude-plugin/`, not `.claude-plugin/` itself). Phase 1 supports **local relative-path `source`** only; object sources (`github`, `url`, `git-subdir`, `npm`) are rejected with a "remote sources not yet supported" error (deferred, see 01).

**Why.** The marketplace manifest is Claude Code's own plugin-root locator; resolving through it makes superskill consistent with upstream instead of inventing a parallel `plugins/<name>/` convention.

**Detail:** see 03 §Source of truth and §Plugin resolution; 04 via design-doc-phase1 §0. Schema verified against Claude Code docs (code.claude.com/docs/en/plugin-marketplaces) and `/Users/robin/projects/cc-agents/.claude-plugin/marketplace.json`: top-level `{ name, owner:{name,email?}, metadata?:{pluginRoot?}, plugins:[{name, source, …}] }`; relative `source` must start `./` and resolves from the marketplace root.

---

## ADR-012: `yaml` as the frontmatter parse/edit engine (Phase 2)

**Status:** Accepted (design) · **Date:** 2026-06-16

**Decision.** Phase 2 quality operations (`validate`, `evaluate`, `refine`, `evolve`) parse and edit YAML frontmatter through the `yaml` package (`^2.9.0`), declared as a direct dependency of `apps/cli`. A single shared module `apps/cli/src/content/frontmatter.ts` exports `parseFrontmatter(content): { data, body, raw }` and `applyFrontmatterChange(...)`; no Phase 2 module parses `---` blocks by hand. The existing regex injector `pipeline/frontmatter.ts` (`normalizeFrontmatter`) is Phase 1 distribution-only and is **not** reused for structured parsing.

**Why.** Phase 1's `normalizeFrontmatter` only injects a `name` line via regex — it cannot read frontmatter as a typed object, which `validate` (field-type checks) and `refine`/`evolve` (parse → mutate → serialize) require. `yaml` is the only round-tripping parser (`parseDocument` preserves comments and key order on re-serialize), satisfying F012's comment-preservation requirement; `js-yaml` and `gray-matter` discard comments. `yaml@2.9.0` is already present transitively (via `rulesync`), so declaring it directly adds **no new package** to the resolved tree — it only fixes the design-doc §7 "no new external packages" claim, which was wrong for Phase 2.

**Detail:** see design-doc-phase2 §7 and §9 (Shared foundation); 04 Phase 2. Round-trip editing uses `parseDocument` + `Document.set`/`toString`; plain reads use `parse`. Supersedes the design-doc-phase2 §7 claim that Phase 2 needs no external packages.

---

## ADR-013: Phase 2 evaluation store location + identity conventions

**Status:** Accepted (design) · **Date:** 2026-06-16

**Decision.** The Phase 2 SQLite store and evolution proposals live under a single `.superskill/` data root resolved by one rule: **use `<cwd>/.superskill/` when that directory already exists, otherwise `~/.superskill/`** (an explicit `--project`/`projectRoot` overrides to force project-local; `getDataRoot()` owns this). Within it: DB at `<root>/.superskill/evaluations.db`, proposals at `<root>/.superskill/proposals/<type>/<name>/YYYY-MM-DD-<seq>.md`. Content identity is canonical: `resolveContentName(path)` strips directory and the `.md` extension (and treats `SKILL.md` as its parent dir name), and every store row, query, and proposal path uses that exact string. `target_agent` is **never null** — it defaults to `'claude'` when `--target` is omitted. `file_hash` is SHA-256 of the file bytes at evaluation time, computed by one shared `hashContent()`.

**Why.** `evaluate --save` and `evolve` must read/write the same DB and agree on `content_name`, or the longitudinal join silently returns zero rows. Centralizing data-root resolution, name derivation, the default target, and the hash algorithm in named utilities (not per-operation footnotes) removes the four-way drift risk of implementing F009–F013 in parallel.

**Detail:** see design-doc-phase2 §4, §9; 04 Phase 2. The data-root rule mirrors the global-vs-local precedence common to dev CLIs (project config shadows home). Proposal path always carries the `<type>/` segment (reconciles the design-doc-phase2 §2.5 path with the F013 acceptance example, which had dropped it).

---

## ADR-014: `@gobing-ai/ts-db` as the Phase 2 data-access layer

**Status:** Accepted (design) · **Date:** 2026-06-16

**Decision.** The Phase 2 evaluation store accesses SQLite **only** through the `@gobing-ai/ts-db` facade — never `bun:sqlite` directly. `store/db.ts` creates a `DbAdapter` via `createDbAdapter({ driver: 'bun-sqlite', url })` and runs `applyMigrations`. Tables are authored once with `defineTable` (single source of truth for the drizzle table, zod insert/select schemas, and `CREATE TABLE` DDL): `evaluations` (append-only — `appendOnlyColumns`, `created_at` only) and `proposals` (`standardColumns` — `created_at` + `updated_at`, since status transitions mutate it). `store/evaluations.ts` and `store/proposals.ts` are thin `EntityDao` subclasses; ordered reads use `EntityListSpec.orderBy` + the predicate query spec, not hand-written SQL. No superskill file writes raw `CREATE TABLE` DDL or `INSERT`/`SELECT` strings.

**Why.** ADR-007 mandates preferring `@gobing-ai/ts-*` over external/raw approaches when a ts-lib equivalent exists; ts-db is exactly that equivalent (typed DAOs, predicate spec, migrations, drizzle-internal). The original Phase 2 plan (F008) hand-rolled `bun:sqlite` with literal DDL and string SQL — a direct ADR-007 violation that also forfeits boundary validation (drizzle-zod), the migration tracking table, and the D1 portability the facade already provides. `@gobing-ai/ts-db@0.3.19`, `drizzle-orm@0.45.2`, and `zod@3.25.76` are already resolved in the tree (via the `@gobing-ai/ts-*` chain), so adoption adds no new top-level package surface — only direct declarations.

**Detail:** see design-doc-phase2 §4 and §6; 04 Phase 2. ts-db peer deps: `drizzle-orm` (required), `drizzle-zod`/`zod` (optional — required here because `defineTable` derives DDL + validation). `apps/cli/package.json` declares `@gobing-ai/ts-db`, `drizzle-orm`, `drizzle-zod`, and `zod` directly. This **supersedes** the design-doc-phase2 §4/§7 and F008 statements that the store uses `bun:sqlite` directly; `bun:sqlite` remains an internal detail of the ts-db `bun-sqlite` adapter only. The `yaml` decision (ADR-012) is unaffected.

---

## ADR-015: anti-hallucination skill migrated from Spur; engine single-sourced in `plugins/cc/scripts/`

**Status:** Accepted · **Date:** 2026-06-19

**Decision.** The `anti-hallucination` skill (zero-trust verification-before-generation protocol) migrated from the Spur repo (`plugins/sp/skills/anti-hallucination/`) to superskill. Skill folders are **prose-only** (`SKILL.md`, `references/*.md`, `agents/openai.yaml`, `metadata.openclaw`); install-time executable logic lives in a **plugin-level `plugins/<plugin>/scripts/`** directory (shared across the plugin's skills, copied on install, deduped — NOT per-skill `scripts/`, which reintroduces the `cc-agents` duplication; NOT `packages/*`, which is not part of the plugin install payload). The guard engine (`ah_guard.ts`, `validate_response.ts`, `logger.ts`) is **single-sourced** in `plugins/cc/scripts/anti-hallucination/` and consumed by both the Claude Code Stop-hook and (pending Phase 4) the Spur workflow validate step.

**Why.** The protocol governs how any agent should respond — it is epistemic discipline, not a software-development workflow. That is superskill's charter (home for agentic assets). Keeping it in Spur (a dev-workflow harness) was a misfiling from when `cc-agents` was the single source repo. Plugin-level `scripts/` dedupes the engine across skills and avoids per-skill copies (the `cc-agents` anti-pattern where `logger.ts` was duplicated).

**Detail.** Phases 1–2 landed (engine + prose relocation, Stop-hook re-homed in `plugins/cc/hooks/hooks.json`). Phase 3 (delete from Spur) and Phase 4 (re-develop cross-agent launchers as `spur workflow` + `spur agent`) are blocked: the Spur-side companion task (0087, Done) delivered `agent.run` answer capture and `response.validate`, but a data-threading gap remains — the engine's template resolver only supports `${vars.*}`/`${env.*}`/`${builtins}`, not the `{{ steps.* }}` Mustache syntax the spike fixture uses, so the captured answer never reaches the validate action. Phase 5 (full single-source seam) depends on Phase 4. See task 0041.

---

## ADR-016: `runCliApplication` available but deferred for CLI entry point

**Status:** Accepted · **Date:** 2026-06-20

**Decision.** A `runCliApplication` convenience bootstrap was added to `@gobing-ai/ts-infra` (subpath `@gobing-ai/ts-infra/application-cli`, ts-libs commit `6a36621`). It wraps `runNodeApplication` with exit-code mapping and `process.exit`. superskill's CLI entry point (`apps/cli/src/index.ts`) does **not** adopt it yet. The CLI continues to use the direct `createProgram().parse()` pattern with per-command `process.exit` via `runOperation`.

**Why.** The current CLI is a 6-line fire-and-forget Commander dispatcher with no diagnostic logging, no startup DB, no telemetry, and no config file. `runCliApplication` provides exit-code normalization and service lifecycle (logger, telemetry, DB cleanup) — none of which the CLI uses today. Commander's action callbacks call `process.exit` directly inside `runOperation`, so the exit-code mapping in `runCliApplication`'s `start` would never be reached without refactoring all 6 command actions to return codes instead of exiting. That refactor is real work touching the command layer for zero functional gain. `runCliApplication` earns its keep when superskill grows a service that needs lifecycle management (diagnostic logging in evaluate/evolve ops, a persistent store opened at startup, or telemetry/audit logging).

**Detail.** ts-libs: `packages/infra/src/application-cli.ts` (100% coverage, 10 tests). When superskill adopts it, the prerequisite is removing `process.exit` from `runOperation` (`apps/cli/src/commands/helpers.ts:72-82`) and the 6 command action callbacks, letting each return an exit code that Commander's action propagates up to `runCliApplication`'s `start`. This decision may be revisited when Phase 2+ adds diagnostic logging or a startup-opened store.

---

## ADR-017: repo-local script utilities are builder subcommands

**Status:** Accepted · **Date:** 2026-06-22

**Decision.** Repo-local build/release/guard utilities live as subcommands of `scripts/builder.ts`; do not add sibling `scripts/*.ts` utility wrappers unless a separate runtime boundary is required.

**Why.** One script with multiple command patterns keeps release/test seams discoverable and avoids tiny helper files that exist only to support one command.

**Detail:** `scripts/builder.ts` owns `bump-ver`, `drop-tags`, `postbuild`, and `check-skill-citations`; tests inject seams through exported builder functions/subcommand dispatch.

---

## ADR-018: Empirical behavior gate for evolve (opt-in, additive, no LLM judge)

**Status:** Accepted · **Date:** 2026-06-23

**Decision.** Add an opt-in empirical behavior gate to the evolve pipeline that replays held-out eval cases against the candidate skill and accepts only when the candidate strictly outperforms the baseline. The gate is additive (layered on top of the existing form gate), uses only deterministic checkable references (exact-match + rule judge), and requires no LLM judge (Phase 1 scope). It is skip-when-absent: no cases.yaml = gate skipped, no flag = gate skipped. YAML eval cases are co-located with the skill (`skills/<name>/eval/cases.yaml`), separate from rubrics. No Python dependency — the strict-improve comparison and rule judge are re-implemented in TypeScript.

**Why.** The current evolve gate closes the loop on FORM (heuristic + rubric scores), not BEHAVIOR. A higher heuristic score does not imply the agent behaves better. SkillOpt (arXiv 2605.23904) demonstrates the mechanism: accept an edit only when replaying held-out tasks scores strictly higher. Phase 1 imports the loop-on-behavior mechanism with checkable references only.

**Detail.** See task 0068. Components: `packages/core/src/quality/eval-cases.ts` (Zod schema + YAML loader), `packages/core/src/quality/replay.ts` (pure exact/rule scorers), `apps/cli/src/operations/replay-runner.ts` (mock + real ts-ai-runner backends), `apps/cli/src/operations/evolve.ts` (empirical gate stage in runGate, persistence). CLI flag: `--eval-gate` on `addEvolveOptions`.

---

## ADR-019: Pairwise rubric judge for behavior gate (Phase 2, LLM-as-judge for open-ended cases)

**Status:** Accepted · **Date:** 2026-06-23

**Decision.** Extend the empirical behavior gate (ADR-018) with a `reference_kind: 'rubric'` for open-ended eval cases that require LLM judgment. The judge scores candidate-vs-baseline PAIRWISE in a single call per measured case (not two independent absolute scores), with seed-controlled output ordering across judge replays. A noise-floor estimation (N-replay signed-margin variance) ensures the gate rejects within-noise wins — the judge's non-determinism must not be laundered as improvement. The judge is implemented as a spur-agent (backed by `@gobing-ai/ts-ai-runner`), with a `ScriptedJudgeBackend` for deterministic CI testing at zero token cost.

**Why.** Phase 1's exact-match + rule judge cannot handle open-ended skills where no exact string or rule defines "the agent behaved well." Pairwise comparison is materially more stable than differencing two absolute scores (SkillOpt's contrastive-reflect insight). The noise floor is the credibility core: without it, a noisy judge accepts random variation as improvement — strictly worse than no gate.

**Detail.** See task 0069. Components: `packages/core/src/quality/eval-cases.ts` (rubric reference_kind + RubricRef), `apps/cli/src/operations/pairwise-judge.ts` (pairwise judge + `TsAiRunnerJudgeBackend` + `ScriptedJudgeBackend`), `apps/cli/src/operations/noise-floor.ts` (signed-margin noise-floor estimation + reject-within-noise), `apps/cli/src/operations/evolve.ts` (rubric integration into empirical gate, budget fail-loud, empirical persistence of noise_floor/rubric_delta). Seed/temperature are passed through the local judge seam for runners that support them; noise-floor rejection remains the required protection when the underlying runner ignores those fields.
