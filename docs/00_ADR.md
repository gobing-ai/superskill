---
doc: 00_ADR
owns: WHY — which cross-cutting decision was made, and the one-line reason
authority: authoritative
version: 1.0.0
owner: Robin Min
updated_at: 2026-06-16
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

**Why.** rulesync already maintains 41 target backends; superskill adds format adaptation and distribution, not backend maintenance.

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

**Why.** The `AgentShim` contract already handles the 7-agent matrix (Claude, Codex, Gemini, Pi, OpenCode, Antigravity, OpenClaw). Enriching it for new targets (`antigravity-cli`, `antigravity-ide`, `hermes`, `omp`) in ts-libs benefits all consumers; reimplementing agent knowledge in superskill duplicates it.

**Detail:** see `~/xprojects/ts-libs/packages/ai-runner/src/agents/shims.ts`. New coding agents and enhanced shim capabilities (e.g., new aspect types) are added to ts-libs via `bun link` during superskill development and flow back to the published package. superskill imports `AgentName`, `AgentShim`, `getAgentShim`, `translateSlashCommand`, and `AgentDetector` — never reimplements them.
