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
